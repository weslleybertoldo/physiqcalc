-- Physiq W15 — Banco do Treino (public + staging). Idempotente. Aplicar UMA vez pela Management API (database/query).
-- Perfil do aluno › Treino (editor da tela 8): o professor muda a LISTA de exercícios de um treino (adicionar, tirar,
-- ordenar) só para aquele aluno. Quando o treino é compartilhado (global do master, de outro professor, recebido por mais
-- de um aluno ou guardado numa pasta — é "modelo"), a mudança não pode vazar para os outros: antes, o treino vira uma CÓPIA
-- só do aluno, numa transação só (grupo novo com os mesmos exercícios e a mesma ordem, o aluno passa a receber a cópia e
-- deixa de receber o original, e tudo o que era dele no original vai junto: semana, extras atrelados, séries e prescrição,
-- trocas e ordem que ele mesmo fez, e as trocas do dia de hoje em diante). O histórico (séries feitas, treinos concluídos)
-- não aponta para o grupo e fica como está. Só a service_role chama (funções admin-* do Treino).
DO $mig$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    EXECUTE format($f$
      create or replace function %1$I.physiq_treino_personalizar(p_aluno uuid, p_grupo uuid, p_dono uuid) returns uuid
      language plpgsql volatile security definer set search_path = '' as $b$
      declare
        v_nome text;
        v_novo uuid;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
      begin
        if p_aluno is null or p_grupo is null then
          raise exception 'parametros_invalidos';
        end if;
        if not exists (select 1 from %1$I.tb_grupos_treino_perfis where grupo_id = p_grupo and user_id = p_aluno) then
          raise exception 'treino_nao_e_do_aluno';
        end if;
        select nome into v_nome from %1$I.tb_grupos_treino where id = p_grupo;
        if v_nome is null then
          raise exception 'treino_inexistente';
        end if;

        insert into %1$I.tb_grupos_treino (nome, professor_id) values (v_nome, p_dono) returning id into v_novo;
        insert into %1$I.tb_grupos_exercicios (grupo_id, exercicio_id, ordem)
          select v_novo, ge.exercicio_id, ge.ordem from %1$I.tb_grupos_exercicios ge where ge.grupo_id = p_grupo;
        insert into %1$I.tb_grupos_treino_perfis (grupo_id, user_id) values (v_novo, p_aluno);
        delete from %1$I.tb_grupos_treino_perfis where grupo_id = p_grupo and user_id = p_aluno;

        update %1$I.tb_semana_treinos set grupo_id = v_novo, updated_at = now() where user_id = p_aluno and grupo_id = p_grupo;
        update %1$I.tb_semana_treinos set extra_atrelado_grupo_id = v_novo, updated_at = now()
         where user_id = p_aluno and extra_atrelado_grupo_id = p_grupo;
        update %1$I.tb_series_padrao_usuario set grupo_id = v_novo, updated_at = now() where user_id = p_aluno and grupo_id = p_grupo;
        update %1$I.exercicio_substituicao_usuario set grupo_id = v_novo::text, updated_at = now()
         where user_id = p_aluno and grupo_id = p_grupo::text;
        update %1$I.exercicio_ordem_usuario set grupo_id = v_novo::text, updated_at = now()
         where user_id = p_aluno and grupo_id = p_grupo::text;
        update %1$I.tb_treino_dia_override set grupo_id = v_novo
         where user_id = p_aluno and grupo_id = p_grupo and data_treino >= v_hoje;
        return v_novo;
      end;
      $b$;
      revoke execute on function %1$I.physiq_treino_personalizar(uuid, uuid, uuid) from public, anon, authenticated;
      grant execute on function %1$I.physiq_treino_personalizar(uuid, uuid, uuid) to service_role;
    $f$, sch);
  END LOOP;
END
$mig$;
