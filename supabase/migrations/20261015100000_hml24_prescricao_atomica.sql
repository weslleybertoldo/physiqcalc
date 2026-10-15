-- Physiq hml-24 (H-127 · 15/10/2026) no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) — a prescrição do editor do Treino (Painel ›
-- Alunos › Treino) grava a linha do aluno DE UMA VEZ, na chave dela (INSERT … ON CONFLICT), em vez de "lê e depois insere".
-- Idempotente; 2 funções NOVAS — nenhuma tabela, coluna, índice, policy, gatilho, grant de tabela ou dado muda.
--
-- O porquê: as ações setPrescricao e setObservacao da função admin-semana-treinos LIAM a linha de tb_series_padrao_usuario e depois
-- atualizavam ou INSERIAM. Duas gravações da mesma linha que ainda não existe, ao mesmo tempo (quem tabula rápido pelos campos do
-- exercício, o E2E, a observação gravada 2 vezes seguidas), liam as 2 "não tem" e inseriam as 2: a 2ª batia no índice único da chave
-- (tb_series_padrao_<schema>_alvo_uidx) → 23505 → a função respondia 500, sem log, e a gravação se perdia (o H-127: 13 vezes no
-- staging de 10/10 a 13/10). O .upsert do PostgREST não serve: o índice é de EXPRESSÃO (o coalesce de cada id), não é constraint
-- (42P10). Agora a função chama UMA destas RPCs, com a chave de serviço de sempre (quem pode é a função: a porta requireAdmin + a
-- regra pode_ver_aluno_treino_por; o editor manda o aluno e o treino, a função valida tudo antes):
--
--   prescricao_salvar(p_aluno, p_grupo, p_grupo_usuario, p_exercicio, p_exercicio_usuario, p_num_series, p_reps, p_descanso, p_carga)
--     → jsonb   a linha de UM exercício do treino do aluno (séries, repetições, descanso, carga): não existe → insere; existe → troca os
--               4 campos e o updated_at (o id e a observação ficam) — o MESMO efeito do "lê e depois atualiza ou insere" de hoje, sem
--               a corrida. Devolve as chaves do "prescricao" que a função já respondia (grupo_id, grupo_usuario_id, exercicio_id,
--               exercicio_usuario_id, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg, updated_at).
--   observacao_salvar(p_aluno, p_grupo, p_grupo_usuario, p_observacao) → jsonb | null
--               a observação do treino (a linha GERAL: os 2 exercícios nulos). Com texto: não existe → insere com o nº de séries
--               padrão do aluno (physiq_profiles.series_padrao_qtd de 1 a 10; fora disso ou sem perfil, 3 — o de hoje); existe → troca
--               só o texto e o updated_at. Sem texto (null): só limpa a linha que existe (sem linha = nada e devolve null, como hoje).
--
--   As 2: SECURITY INVOKER com search_path '' (a service_role da função passa por cima do RLS, como hoje; se um dia a função chamar
--   COMO A PESSOA, o RLS de hoje decide sozinho — o personal não grava a linha do aluno — e nada aqui muda); VOLATILE (grava);
--   a CHAVE na forma certa (o aluno; exatamente 1 treino; na prescrição, exatamente 1 exercício) ou 'dados_invalidos' (22023) antes
--   de tocar na tabela — o resto (séries 1–10, as FKs) a tabela confere (23514, 23503) e a função já validou. Só o SERVIDOR executa:
--   revoke de public, anon e authenticated (os default privileges do Supabase dão a todos) e grant à service_role
--   (docs/banco-permissoes.md, o 1º jeito).
--
-- Ordem (a função admin-semana-treinos é UMA para os 2 schemas: publicar = valer no site, no APK, no staging e na produção NA HORA):
--   1. staging (dry-run → de verdade) e public (com backup antes: scripts/backup/pg_dump_tabelas.sh), as 2 ANTES de publicar a função
--      (as ações setPrescricao e setObservacao chamam estas RPCs); a função de hoje não chama nada daqui (não quebra);
--   2. depois a função; depois o front (a fila por linha do editor).
-- Roda 1x por ambiente, na MESMA chamada (Management API database/query; dry-run com begin … rollback; o molde da hml-21d):
--   set physiq.schemas = 'staging'; <este arquivo>      ← primeiro
--   set physiq.schemas = 'public';  <este arquivo>
-- Reversa (só DEPOIS de voltar a função admin-semana-treinos à versão de antes): supabase/reversas/20261015100000_hml24_prescricao_atomica_reversa.sql
do $mig$
declare
  v_amb text := current_setting('physiq.schemas', true);
  -- a chave do índice tb_series_padrao_<schema>_alvo_uidx (UNIQUE, por EXPRESSÃO, não parcial): as 5 expressões dele, na ordem. O MESMO
  -- texto vai no ON CONFLICT das 2 RPCs e no EXPLAIN da conferência (o árbitro tem de ser esse índice)
  v_alvo constant text := '(user_id, (coalesce(grupo_id::text, '''')), (coalesce(grupo_usuario_id::text, '''')), '
                          '(coalesce(exercicio_id::text, '''')), (coalesce(exercicio_usuario_id::text, '''')))';
  v_f text;
  v_linha text;
  v_arbitros text[] := '{}';
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;

  -- ===== 1. A prescrição de um exercício do treino do aluno (séries, repetições, descanso, carga): de uma vez, na chave
  execute format($sql$
create or replace function %1$I.prescricao_salvar(p_aluno uuid, p_grupo uuid, p_grupo_usuario uuid, p_exercicio uuid,
  p_exercicio_usuario uuid, p_num_series integer, p_reps text, p_descanso integer, p_carga numeric) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $b$
declare
  v jsonb;
begin
  -- a forma da CHAVE (o aluno; exatamente 1 treino; exatamente 1 exercício) — o resto a função valida e a tabela confere (CHECK, FK)
  if p_aluno is null or num_nonnulls(p_grupo, p_grupo_usuario) <> 1 or num_nonnulls(p_exercicio, p_exercicio_usuario) <> 1 then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  insert into %1$I.tb_series_padrao_usuario as t (user_id, grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id,
         num_series, reps_alvo, descanso_segundos, carga_sugerida_kg, updated_at)
  values (p_aluno, p_grupo, p_grupo_usuario, p_exercicio, p_exercicio_usuario, p_num_series, p_reps, p_descanso, p_carga, now())
  on conflict %2$s
  do update set num_series = excluded.num_series, reps_alvo = excluded.reps_alvo, descanso_segundos = excluded.descanso_segundos,
                carga_sugerida_kg = excluded.carga_sugerida_kg, updated_at = excluded.updated_at   -- o id e a observacao ficam
  returning jsonb_build_object('grupo_id', t.grupo_id, 'grupo_usuario_id', t.grupo_usuario_id, 'exercicio_id', t.exercicio_id,
              'exercicio_usuario_id', t.exercicio_usuario_id, 'num_series', t.num_series, 'reps_alvo', t.reps_alvo,
              'descanso_segundos', t.descanso_segundos, 'carga_sugerida_kg', t.carga_sugerida_kg, 'updated_at', t.updated_at)
    into v;
  return v;
end;
$b$
$sql$, v_amb, v_alvo);
  execute format('comment on function %I.prescricao_salvar(uuid, uuid, uuid, uuid, uuid, integer, text, integer, numeric) is %L', v_amb,
    'hml-24 (H-127): a prescrição de UM exercício do treino do aluno (séries, repetições, descanso, carga) numa gravação só, na chave '
    '(INSERT … ON CONFLICT no índice tb_series_padrao_*_alvo_uidx) — o MESMO efeito do "lê e depois atualiza ou insere" de antes, sem '
    'a chave duplicada. SECURITY INVOKER; só o servidor executa (a função admin-semana-treinos).');

  -- ===== 2. A observação do treino (a linha geral do treino do aluno): de uma vez, na chave
  execute format($sql$
create or replace function %1$I.observacao_salvar(p_aluno uuid, p_grupo uuid, p_grupo_usuario uuid, p_observacao text) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $b$
declare
  v jsonb;
  v_n integer;
begin
  -- a forma da CHAVE (o aluno; exatamente 1 treino) — o texto a função valida (até 1000, sem espaço nas pontas; vazio = null)
  if p_aluno is null or num_nonnulls(p_grupo, p_grupo_usuario) <> 1 then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  if p_observacao is null then
    -- sem texto: só limpa a linha geral que já existe (sem linha = nada, como hoje)
    update %1$I.tb_series_padrao_usuario as t
       set observacao = null, updated_at = now()
     where t.user_id = p_aluno and coalesce(t.grupo_id::text, '') = coalesce(p_grupo::text, '')
       and coalesce(t.grupo_usuario_id::text, '') = coalesce(p_grupo_usuario::text, '')
       and t.exercicio_id is null and t.exercicio_usuario_id is null
    returning jsonb_build_object('grupo_id', t.grupo_id, 'grupo_usuario_id', t.grupo_usuario_id, 'num_series', t.num_series,
                'observacao', t.observacao, 'updated_at', t.updated_at)
      into v;
    return v;
  end if;
  -- a linha geral nova nasce com o nº de séries padrão do aluno (o que já valia para quem não tem nº próprio): 1 a 10; fora, ou
  -- sem perfil, 3 — a conta de hoje (Number.isInteger(qtd) && qtd >= 1 ? Math.min(10, qtd) : 3)
  select case when p.series_padrao_qtd >= 1 then least(10, p.series_padrao_qtd) else 3 end
    into v_n
    from %1$I.physiq_profiles p
   where p.id = p_aluno;
  insert into %1$I.tb_series_padrao_usuario as t (user_id, grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id,
         num_series, observacao, updated_at)
  values (p_aluno, p_grupo, p_grupo_usuario, null, null, coalesce(v_n, 3), p_observacao, now())
  on conflict %2$s
  do update set observacao = excluded.observacao, updated_at = excluded.updated_at   -- o id e o nº de séries ficam
  returning jsonb_build_object('grupo_id', t.grupo_id, 'grupo_usuario_id', t.grupo_usuario_id, 'num_series', t.num_series,
              'observacao', t.observacao, 'updated_at', t.updated_at)
    into v;
  return v;
end;
$b$
$sql$, v_amb, v_alvo);
  execute format('comment on function %I.observacao_salvar(uuid, uuid, uuid, text) is %L', v_amb,
    'hml-24 (H-127): a observação do treino do aluno (a linha geral) numa gravação só, na chave (INSERT … ON CONFLICT no índice '
    'tb_series_padrao_*_alvo_uidx; a linha nova com o nº de séries padrão do aluno) — o MESMO efeito de antes, sem a chave duplicada. '
    'SECURITY INVOKER; só o servidor executa (a função admin-semana-treinos).');

  -- só o SERVIDOR (a função chama com a chave de serviço): os default privileges do Supabase dão EXECUTE a public, anon e authenticated
  execute format('revoke all on function %I.prescricao_salvar(uuid, uuid, uuid, uuid, uuid, integer, text, integer, numeric) '
                 'from public, anon, authenticated', v_amb);
  execute format('revoke all on function %I.observacao_salvar(uuid, uuid, uuid, text) from public, anon, authenticated', v_amb);
  execute format('grant execute on function %I.prescricao_salvar(uuid, uuid, uuid, uuid, uuid, integer, text, integer, numeric) '
                 'to service_role', v_amb);
  execute format('grant execute on function %I.observacao_salvar(uuid, uuid, uuid, text) to service_role', v_amb);

  -- ===== 3. Conferência (desfaz tudo se algo sair diferente) — nada é gravado: as recusas acontecem antes de qualquer linha
  foreach v_f in array array[format('%I.prescricao_salvar(uuid, uuid, uuid, uuid, uuid, integer, text, integer, numeric)', v_amb),
                             format('%I.observacao_salvar(uuid, uuid, uuid, text)', v_amb)] loop
    -- INVOKER (a service_role passa pelo RLS como hoje; outro papel, o RLS decide), VOLATILE (grava) e com o search_path fixo
    if (select p.prosecdef or p.provolatile <> 'v' or p.proconfig is distinct from array['search_path=""']
          from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-24: % tem de ser SECURITY INVOKER, VOLATILE e com search_path vazio', v_f;
    end if;
    -- só o servidor
    if has_function_privilege('public', v_f, 'EXECUTE') or has_function_privilege('anon', v_f, 'EXECUTE')
       or has_function_privilege('authenticated', v_f, 'EXECUTE') or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-24: % fora do esperado (só a service_role executa)', v_f;
    end if;
  end loop;

  -- sem o aluno → dados_invalidos, antes de tocar na tabela
  begin
    execute format('select %I.prescricao_salvar(null, %L::uuid, null, %L::uuid, null, 3, null, null, null)', v_amb,
                   '00000000-0000-4000-8000-0000000000bb', '00000000-0000-4000-8000-0000000000cc');
    raise exception 'hml-24: prescricao_salvar sem o aluno não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    execute format('select %I.observacao_salvar(null, %L::uuid, null, %L)', v_amb, '00000000-0000-4000-8000-0000000000bb', 'x');
    raise exception 'hml-24: observacao_salvar sem o aluno não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;

  -- o árbitro do ON CONFLICT: o EXPLAIN (sem ANALYZE — nada executa) de um insert com o MESMO alvo das 2 RPCs tem de usar SÓ o índice
  -- da chave. O índice trocado (outro nome), mudado (outra expressão) ou sumido para a migração aqui — e com ele o 42P10 das RPCs
  begin
    for v_linha in execute format(
      'explain (costs off) insert into %1$I.tb_series_padrao_usuario as t (user_id, grupo_id, grupo_usuario_id, exercicio_id, '
      'exercicio_usuario_id, num_series, updated_at) values (%3$L::uuid, %3$L::uuid, null, %3$L::uuid, null, 3, now()) '
      'on conflict %2$s do update set updated_at = excluded.updated_at', v_amb, v_alvo, '00000000-0000-4000-8000-0000000000aa') loop
      if v_linha ~ '^\s*Conflict Arbiter Indexes:' then
        v_arbitros := v_arbitros || regexp_split_to_array(btrim(regexp_replace(v_linha, '^\s*Conflict Arbiter Indexes:\s*', '')), '\s*,\s*');
      end if;
    end loop;
  exception when invalid_column_reference then
    raise exception 'hml-24: nenhum índice único serve ao ON CONFLICT da chave em %.tb_series_padrao_usuario (o índice '
                    'tb_series_padrao_%_alvo_uidx sumiu ou mudou de expressão)', v_amb, v_amb;
  end;
  if v_arbitros is distinct from array[format('tb_series_padrao_%s_alvo_uidx', v_amb)] then
    raise exception 'hml-24: o árbitro do ON CONFLICT em %.tb_series_padrao_usuario não é o tb_series_padrao_%_alvo_uidx (achei %)',
                    v_amb, v_amb, v_arbitros;
  end if;
end
$mig$;

-- o PostgREST relê o schema (as 2 RPCs novas aparecem na hora)
notify pgrst, 'reload schema';
