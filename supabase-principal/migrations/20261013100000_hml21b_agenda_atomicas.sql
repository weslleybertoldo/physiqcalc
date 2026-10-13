-- Physiq hml-21b (H-43 · jeito 2, etapa 3 · 13/10/2026) — as 2 gravações da Agenda que precisam ser TUDO OU NADA viram RPCs (banco
-- principal, staging + public). Idempotente; 2 funções novas — nenhuma tabela, coluna, policy, gatilho, grant de tabela ou dado muda.
--
-- O porquê: a Agenda do painel (Painel › Agenda) gravava do navegador em vários pedidos em série, sem transação:
--   · excluir um calendário = 2 pedidos (src/painel/agenda/dados.ts, excluirCalendario: os agendamentos vivos do calendário à Lixeira e
--     depois o calendário) — falhou o 2º, sobravam os agendamentos na Lixeira com o calendário vivo;
--   · o 1º acesso à Agenda = 2 a 4 pedidos (garantirCalendarios: a lista + as tags base pela agenda_garantir_tags + 1 insert por
--     calendário) — falhou no meio, sobrava metade (as tags sem os calendários, o "Treino" sem o "Nutrição").
-- Agora a tela chama a função conta (hml-21b, módulo conta/agenda.ts: calendario_excluir, agenda_garantir) e a função chama UMA destas
-- RPCs COMO A PESSOA (a sessão de quem chama — nenhuma chave secreta):
--
--   agenda_excluir_calendario(p_calendario uuid) → integer (quantos agendamentos foram à Lixeira)
--     o MESMO efeito dos 2 pedidos de hoje, NA MESMA ORDEM e numa transação: os agendamentos VIVOS do calendário ganham o deleted_at
--     (o gatilho trg_agendamentos_w20_avisar avisa o aluno de cada consulta futura, como hoje) e depois o calendário VIVO ganha o MESMO
--     deleted_at (vão para a Lixeira juntos, como hoje). O calendário que não existe, já está na Lixeira ou que o RLS não deixa mudar →
--     'nao_encontrado' e NADA muda (nem os agendamentos: a transação volta inteira — hoje o 2º pedido "dava certo" com 0 linha).
--   agenda_garantir_inicio(p_conta uuid, p_papeis text[], p_modulos text[]) → jsonb { criados: [calendários novos, linha inteira] }
--     o MESMO efeito do garantirCalendarios + agenda_garantir_tags de hoje, IDEMPOTENTE: quem já tem um calendário VIVO dele não ganha
--     nada (criados = []); senão as 3 tags base (só quando falta alguma — pela agenda_garantir_tags de hoje, que decide quem pode; se ela
--     recusa, os calendários nascem sem tag padrão, como o catch(() => []) da tela) e os calendários iniciais com os MESMOS nomes, cores,
--     "padrão" e tag padrão de hoje (src/agenda/regras.ts → calendariosIniciais/tipoPadrao): personal E nutricionista → "Treino"
--     (#a78bfa, padrão, tag Treino) e "Nutrição" (#34d399, tag Nutrição); senão 1 "Calendário principal" (#a78bfa, padrão) com a tag da
--     área (1 módulo na conta → a área dele; só personal → treino; só nutricionista → nutrição; nenhum → sem tag padrão). O dono é quem
--     chama e a conta é a do corpo (como o insert de hoje: { ...dados, nutricionista_id: uid, conta_id: contaId }); os papéis e módulos
--     só escolhem nome/cor/tag (qualquer pessoa já cria calendário dela). Cada calendário com o created_at do RELÓGIO (clock_timestamp,
--     como os inserts em pedidos separados de hoje): a lista ordenada por created_at mostra o "Treino" antes do "Nutrição", como hoje.
--     2 chamadas ao mesmo tempo da mesma pessoa (2 abas) não duplicam: a 2ª espera a 1ª (trava por pessoa, só nesta transação) e vê os
--     calendários dela.
--
--   As 2: SECURITY INVOKER com search_path '' (o RLS de hoje vale dentro — o dono, o dono da conta, o master); o dono vem SEMPRE de
--   auth.uid(), nunca do corpo; sem login → 'sem_login' (42501); corpo fora da forma → 'dados_invalidos' (22023); o que não existe, está
--   na Lixeira ou o RLS esconde → 'nao_encontrado' (P0002) e NADA muda. Grants: o logado (a função chama como a pessoa) e o servidor —
--   revoke de public e anon (docs/banco-permissoes.md).
--
-- Ordem: staging = ANTES de publicar a conta v2 (as ações novas chamam estas RPCs) e do push do front; produção = ANTES do merge. O front
-- antigo não chama nada daqui (não quebra).
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261013100000_hml21b_agenda_atomicas.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261013100000_hml21b_agenda_atomicas.sql --so public
-- Reversa (só DEPOIS de reverter o front e a conta): supabase-principal/reversas/20261013100000_hml21b_agenda_atomicas_reversa.sql

-- ============================================================================================================
-- 1. Excluir um calendário: os agendamentos vivos dele e o calendário à Lixeira, juntos
-- ============================================================================================================
create or replace function {schema}.agenda_excluir_calendario(p_calendario uuid) returns integer
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_agora timestamptz := now();
  v_n integer := 0;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  if p_calendario is null then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  -- 1º os agendamentos vivos do calendário (o RLS de hoje decide quais a pessoa muda), como o 1º pedido de hoje
  update {schema}.agendamentos a set deleted_at = v_agora where a.calendario_id = p_calendario and a.deleted_at is null;
  get diagnostics v_n = row_count;
  -- 2º o calendário vivo, com o MESMO instante; 0 linha (não existe, Lixeira, outra conta) → nada muda (nem os agendamentos acima)
  update {schema}.calendarios c set deleted_at = v_agora where c.id = p_calendario and c.deleted_at is null returning c.id into v_id;
  if v_id is null then
    raise exception 'nao_encontrado' using errcode = 'P0002';
  end if;
  return v_n;
end;
$$;

-- ============================================================================================================
-- 2. O 1º acesso à Agenda: as tags base e os calendários iniciais, juntos e idempotente
-- ============================================================================================================
create or replace function {schema}.agenda_garantir_inicio(p_conta uuid, p_papeis text[], p_modulos text[]) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_papeis text[] := coalesce(p_papeis, '{}'::text[]);
  v_modulos text[] := coalesce(p_modulos, '{}'::text[]);
  v_personal boolean;
  v_nutri boolean;
  v_area text;
  v_sem_tags boolean := false;
  v_r jsonb;
  v_tag uuid;
  v_cal {schema}.calendarios;
  v_criados jsonb := '[]'::jsonb;
  x record;
begin
  if v_uid is null then
    raise exception 'sem_login' using errcode = '42501';
  end if;
  -- a forma: listas simples (1 dimensão), até 10 papéis e 10 módulos, sem nulo, cada um de 1 a 40 letras (o app manda o que a conta
  -- ativa tem); a dimensão antes (o array_position não aceita lista de 2 dimensões)
  if coalesce(array_ndims(v_papeis), 1) <> 1 or coalesce(array_ndims(v_modulos), 1) <> 1 then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  if cardinality(v_papeis) > 10 or cardinality(v_modulos) > 10
     or array_position(v_papeis, null) is not null or array_position(v_modulos, null) is not null
     or exists (select 1 from unnest(v_papeis || v_modulos) e where char_length(e) not between 1 and 40) then
    raise exception 'dados_invalidos' using errcode = '22023';
  end if;
  -- 2 abas ao mesmo tempo: a 2ª espera a 1ª terminar (a trava é da pessoa e some no fim desta transação) e vê o que ela criou
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('agenda_garantir_inicio:' || v_uid::text, 0));
  -- quem já tem um calendário VIVO dele não ganha nada (a tela de hoje: lista.some(c => c.nutricionista_id === uid) → só lê)
  if exists (select 1 from {schema}.calendarios c where c.nutricionista_id = v_uid and c.deleted_at is null) then
    return jsonb_build_object('criados', '[]'::jsonb);
  end if;

  -- as 3 tags base (o garantirMinhasTags de hoje: só pede ao banco quando falta alguma; a agenda_garantir_tags decide quem pode); a
  -- recusa (ok: false) ou o erro dela = os calendários sem tag padrão, como o catch(() => []) da tela — sem desfazer o resto
  if (select count(*) from {schema}.agenda_tags t where t.profissional_id = v_uid and t.base and t.deleted_at is null) < 3 then
    begin
      v_r := {schema}.agenda_garantir_tags();
      v_sem_tags := coalesce((v_r ->> 'ok')::boolean, false) is not true;
    exception when others then
      v_sem_tags := true;
    end;
  end if;

  -- os calendários iniciais (calendariosIniciais + tipoPadrao de src/agenda/regras.ts, com o aluno nulo)
  v_personal := 'personal' = any(v_papeis);
  v_nutri := 'nutricionista' = any(v_papeis);
  if not (v_personal and v_nutri) then
    v_area := case
      when cardinality(v_modulos) = 1 then case when 'treino' = any(v_modulos) then 'treino' else 'nutricao' end
      when v_personal then 'treino'
      when v_nutri then 'nutricao'
      else 'geral'
    end;
  end if;
  for x in
    select * from (values (1, 'Treino', '#a78bfa', true, 'treino'), (2, 'Nutrição', '#34d399', false, 'nutricao')) i(ordem, nome, cor, padrao, area)
     where v_personal and v_nutri
    union all
    select 1, 'Calendário principal', '#a78bfa', true, nullif(v_area, 'geral') where not (v_personal and v_nutri)
    order by 1
  loop
    v_tag := null;
    if x.area is not null and not v_sem_tags then
      select t.id into v_tag from {schema}.agenda_tags t where t.profissional_id = v_uid and t.base and t.area = x.area and t.deleted_at is null;
    end if;
    insert into {schema}.calendarios (nome, cor, padrao, tag_padrao_id, nutricionista_id, conta_id, created_at)
    values (x.nome, x.cor, x.padrao, v_tag, v_uid, p_conta, pg_catalog.clock_timestamp())
    returning * into v_cal;
    v_criados := v_criados || jsonb_build_array(to_jsonb(v_cal));
  end loop;
  return jsonb_build_object('criados', v_criados);
end;
$$;

-- o app chama pela função conta, COMO A PESSOA: o logado e o servidor; o visitante não (os default privileges dão a todos)
revoke all on function {schema}.agenda_excluir_calendario(uuid) from public, anon;
revoke all on function {schema}.agenda_garantir_inicio(uuid, text[], text[]) from public, anon;
grant execute on function {schema}.agenda_excluir_calendario(uuid) to authenticated, service_role;
grant execute on function {schema}.agenda_garantir_inicio(uuid, text[], text[]) to authenticated, service_role;

-- ============================================================================================================
-- 3. Conferência (desfaz tudo se algo sair diferente) — nada é gravado: as recusas acontecem antes de qualquer linha
-- ============================================================================================================
do $$
declare
  v_f text;
  v_nada text := '{"sub":"00000000-0000-4000-8000-0000000000bb"}';
begin
  foreach v_f in array array['{schema}.agenda_excluir_calendario(uuid)', '{schema}.agenda_garantir_inicio(uuid, text[], text[])'] loop
    -- INVOKER (o RLS vale dentro) e com search_path fixo
    if (select p.prosecdef or p.proconfig is null from pg_catalog.pg_proc p where p.oid = v_f::regprocedure) then
      raise exception 'hml-21b: % tem de ser SECURITY INVOKER e ter search_path', v_f;
    end if;
    -- só o logado e o servidor
    if has_function_privilege('anon', v_f, 'EXECUTE') or not has_function_privilege('authenticated', v_f, 'EXECUTE')
       or not has_function_privilege('service_role', v_f, 'EXECUTE') then
      raise exception 'hml-21b: % fora do esperado (só o logado e o servidor)', v_f;
    end if;
  end loop;

  -- sem login (a migração roda sem JWT; garantido aqui, só nesta transação): recusa com sem_login, antes de tudo
  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);
  begin
    perform {schema}.agenda_excluir_calendario('00000000-0000-4000-8000-0000000000cc'::uuid);
    raise exception 'hml-21b: agenda_excluir_calendario sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  begin
    perform {schema}.agenda_garantir_inicio(null, '{}'::text[], '{}'::text[]);
    raise exception 'hml-21b: agenda_garantir_inicio sem login não recusou';
  exception when others then
    if sqlerrm <> 'sem_login' then raise; end if;
  end;
  -- com um login qualquer (que não existe): o corpo fora da forma recusa ANTES de olhar as tabelas
  perform set_config('request.jwt.claims', v_nada, true);
  begin
    perform {schema}.agenda_excluir_calendario(null);
    raise exception 'hml-21b: agenda_excluir_calendario sem calendário não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.agenda_garantir_inicio(null, array[repeat('x', 41)], '{}'::text[]);
    raise exception 'hml-21b: agenda_garantir_inicio com papel longo demais não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  begin
    perform {schema}.agenda_garantir_inicio(null, '{}'::text[], array[null]::text[]);
    raise exception 'hml-21b: agenda_garantir_inicio com módulo nulo não recusou';
  exception when others then
    if sqlerrm <> 'dados_invalidos' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end
$$;

notify pgrst, 'reload schema';
