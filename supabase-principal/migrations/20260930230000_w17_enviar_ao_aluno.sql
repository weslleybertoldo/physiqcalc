-- Physiq W17 (item 2) — "Salvar e enviar ao aluno" da tela 8 com E-MAIL (banco principal, staging e public). Idempotente;
-- NENHUM dado muda: 1 coluna nova, vazia (avisos.email_em), e 1 função. Pedido dele 30/09/2026 ~22:45: "vamos integrar o
-- botão do whatsapp e disparo por email. Pelo whatsapp vai ter um botão com atalho que envia" (o WhatsApp é um atalho
-- wa.me na tela, sem banco).
--
-- Aplicar (backup ANTES — scripts/backup/):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930230000_w17_enviar_ao_aluno.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930230000_w17_enviar_ao_aluno.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930230000_w17_enviar_ao_aluno.sql --so public
--
-- O que muda:
--   1. avisos.email_em: o aviso "plano atualizado" também saiu por e-mail (e quando). Só a função abaixo grava; o aluno lê a
--      linha dele como sempre (a coluna é só informação; o UPDATE do app continua só no lido_em).
--   2. aluno_enviar_plano(aluno, modulos): o aviso no sino — a MESMA aluno_avisar_plano da W16 (o APK 3.19 continua chamando
--      ela direto e só ganha o sino) — + a decisão do e-mail: só para aluno com login e com e-mail no cadastro, e nunca 2
--      vezes em 10 minutos para o mesmo aviso (como o sino). Reserva o envio (email_em = agora) e devolve o que o e-mail
--      precisa; a função aluno-enviar manda pelo Resend e, se o Resend falhar, desfaz a reserva (outro clique tenta de novo).
--      Retorno: o da aluno_avisar_plano ({ok, avisado, repetido, sem_login} ou {ok:false, erro}) + email: {enviar, motivo?}
--      (motivos: sem_login, sem_email, repetido) ou {enviar:true, aviso_id, para, aluno, quem, modulos, link}.

alter table {schema}.avisos add column if not exists email_em timestamptz;

create or replace function {schema}.aluno_enviar_plano(p_aluno uuid, p_modulos text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := {schema}.w14_matricula_da_rota(p_aluno);
  v_r jsonb;
  v_user uuid;
  v_nome text;
  v_email text;
  v_treino boolean;
  v_dieta boolean;
  v_titulo text;
  v_link text;
  v_aviso uuid;
begin
  -- 1 envio por vez para o mesmo aluno: 2 cliques (ou a nutri e o personal juntos) não mandam 2 e-mails
  perform 1 from {schema}.pacientes where id = v_id for update;

  v_r := {schema}.aluno_avisar_plano(p_aluno, p_modulos);
  if coalesce((v_r ->> 'ok')::boolean, false) is not true then
    return v_r;
  end if;
  if coalesce((v_r ->> 'sem_login')::boolean, false) then
    return v_r || jsonb_build_object('email', jsonb_build_object('enviar', false, 'motivo', 'sem_login'));
  end if;

  -- os mesmos módulos, título e link do aviso da aluno_avisar_plano (W16)
  v_treino := 'treino' = any(coalesce(p_modulos, array[]::text[])) and {schema}.pode_editar_aluno(v_id, 'treino');
  v_dieta := 'dieta' = any(coalesce(p_modulos, array[]::text[])) and {schema}.pode_editar_aluno(v_id, 'nutricao');
  v_titulo := case when v_treino and v_dieta then 'Seu treino e sua dieta foram atualizados'
                   when v_treino then 'Seu treino foi atualizado'
                   else 'Sua dieta foi atualizada' end;
  v_link := case when v_treino and v_dieta then '/' when v_treino then '/treino' else '/dieta' end;

  select p.user_id, p.nome, lower(btrim(coalesce(p.email, ''))) into v_user, v_nome, v_email
    from {schema}.pacientes p where p.id = v_id;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return v_r || jsonb_build_object('email', jsonb_build_object('enviar', false, 'motivo', 'sem_email'));
  end if;
  if exists (select 1 from {schema}.avisos a
              where a.destino_user_id = v_user and a.tipo = 'plano_atualizado' and a.titulo = v_titulo
                and a.email_em > now() - interval '10 minutes') then
    return v_r || jsonb_build_object('email', jsonb_build_object('enviar', false, 'motivo', 'repetido'));
  end if;
  -- o aviso que acabou de nascer (ou o repetido, ainda não lido, dos últimos 10 min)
  select a.id into v_aviso from {schema}.avisos a
   where a.destino_user_id = v_user and a.tipo = 'plano_atualizado' and a.titulo = v_titulo
   order by a.criado_em desc limit 1;
  if v_aviso is null then
    return v_r || jsonb_build_object('email', jsonb_build_object('enviar', false, 'motivo', 'sem_aviso'));
  end if;
  update {schema}.avisos set email_em = now() where id = v_aviso;
  return v_r || jsonb_build_object('email', jsonb_build_object(
    'enviar', true,
    'aviso_id', v_aviso,
    'para', v_email,
    'aluno', v_nome,
    'quem', {schema}.nome_da_pessoa(auth.uid()),
    'modulos', to_jsonb(array_remove(array[case when v_treino then 'treino' end, case when v_dieta then 'dieta' end], null)),
    'link', v_link));
end;
$$;
revoke execute on function {schema}.aluno_enviar_plano(uuid, text[]) from public, anon;
grant execute on function {schema}.aluno_enviar_plano(uuid, text[]) to authenticated, service_role;

-- desfaz a reserva do e-mail quando o Resend falhou (só a função aluno-enviar, pela service_role; só a reserva recente)
create or replace function {schema}.aluno_enviar_plano_falhou(p_aviso uuid) returns void
language sql security definer set search_path = '' as $$
  update {schema}.avisos set email_em = null where id = p_aviso and email_em > now() - interval '5 minutes';
$$;
revoke execute on function {schema}.aluno_enviar_plano_falhou(uuid) from public, anon, authenticated;
grant execute on function {schema}.aluno_enviar_plano_falhou(uuid) to service_role;
