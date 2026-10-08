-- Homologação do Physiq — hml-09 / H-23 (08/10/2026): exclusão pelo staging não apaga login de produção. Idempotente.
--
-- O Auth do banco principal é um só para os 2 schemas: apagar um login pelo staging (exclusão de conta, master, acesso do aluno)
-- apaga também o da produção, e a cascata das 68 FKs de public para auth.users (58 on delete cascade, 10 set null) leva ou
-- desliga o que a pessoa tem lá. Hoje o staging só confere que a conta é de TESTE; 7 contas de teste têm dado em produção.
--   D1  staging.pegada_em_producao(uid): as colunas de public (FKs para auth.users) com linha deste login, menos public.profiles.id
--       (o gatilho handle_new_user cria para todo login). Só a service_role executa: quem chama é a borda excluir-minha-conta com
--       x-schema: staging, antes de qualquer passo (403 conta_real_no_staging, motivo dados_em_producao).
--   D4  staging.master_excluir_profissional e staging.paciente_remover_acesso (as 2 do staging que fazem delete from auth.users)
--       recusam com conta_em_producao quando a pegada é verdadeira (logo depois do exigir_conta_de_teste).
--   D5  public.paciente_remover_acesso (e o espelho no staging) não apaga mais de vez um login que também é profissional no
--       schema (w2l_assina_no_schema) ou aluno de outra matrícula (outra linha de pacientes com o mesmo user_id, inclusive na
--       lixeira — o set null tiraria o login dela): recusa com login_compartilhado. O resto das 3 funções fica igual.
-- Corpos gerados de pg_get_functiondef no banco vivo (08/10/2026; iguais aos do repo, hml02a e hml01a) com trocas exatas
-- (gerar_migration.py do rascunho da hml-09): só linhas acrescentadas, antes do delete do login. CREATE OR REPLACE mantém dono,
-- ACL e volatilidade (VOLATILE, SECURITY DEFINER, o search_path de antes); o bloco de conferência no fim de cada parte confere.
-- O bloco "por schema" usa nomes explícitos staging.* (sem o marcador de schema): é o ambiente de teste. O bloco compartilhado é a
-- produção: só o D5 em public.paciente_remover_acesso.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --compartilhado [--dry-run]   (produção; backup antes)
--          (--so public só repete o bloco do staging, sem mudar nada. SEM OPÇÕES roda staging → public (a repetição) →
--          compartilhado: leva o D5 à produção junto — usar as opções.)
-- A borda excluir-minha-conta da hml-09 chama a pegada: sem o bloco do staging aplicado, a exclusão pelo staging falha fechada
-- (500 erro_interno); a produção não sente.
-- Reversa: supabase-principal/reversas/20261008090000_hml09_exclusao_staging_reversa.sql

-- 1. (D1/D4) A pegada em produção de um login: as colunas de public que apontam para auth.users (FK, lidas do catálogo a cada
--    chamada — tabela nova entra sozinha) e que têm linha com este id. Fica de fora só public.profiles.id: o gatilho
--    handle_new_user cria esse perfil para TODO login (conferido ao vivo: os 80 logins de teste têm; nenhum outro gatilho em
--    auth.users nem em public.profiles cria linha em public). FK de várias colunas: hoje não há nenhuma (as 68 são de 1 coluna),
--    e a leitura já pega cada coluna que aponta para auth.users(id). Formato: {"em_producao": bool, "colunas": ["tabela.coluna"]}
--    (a borda excluir-minha-conta lê com pegadaBloqueia: só em_producao = false com a lista vazia deixa seguir).
create or replace function staging.pegada_em_producao(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v boolean;
  v_cols text[] := array[]::text[];
begin
  if p_uid is null then
    raise exception 'pegada_em_producao: id vazio';
  end if;
  for r in
    select distinct cl.relname::text as tabela, a.attname::text as coluna
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class cl on cl.oid = c.conrelid
      cross join lateral unnest(c.conkey, c.confkey) as k(col, ref)
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.col
      join pg_catalog.pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = k.ref
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
       and c.conparentid = 0 and fa.attname = 'id'
       and not (cl.relname = 'profiles' and a.attname = 'id')
     order by 1, 2
  loop
    execute format('select exists (select 1 from public.%I where %I = $1)', r.tabela, r.coluna) into v using p_uid;
    if v then
      v_cols := v_cols || (r.tabela || '.' || r.coluna);
    end if;
  end loop;
  return jsonb_build_object('em_producao', cardinality(v_cols) > 0, 'colunas', to_jsonb(v_cols));
end;
$$;
revoke all on function staging.pegada_em_producao(uuid) from public, anon, authenticated;
grant execute on function staging.pegada_em_producao(uuid) to service_role;

-- 2. (D4 + D5) as 2 funções do staging que apagam login: corpo vivo + a trava (antes do delete from auth.users)
CREATE OR REPLACE FUNCTION staging.master_excluir_profissional(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
begin
  if not staging.eh_master() then raise exception 'sem_acesso'; end if;
  if p_id = auth.uid() then raise exception 'nao_pode_a_si_mesmo'; end if;
  if not exists (select 1 from auth.users where id = p_id) then raise exception 'nao_encontrado'; end if;
  perform staging.exigir_conta_de_teste(p_id);
  -- hml-09 (D4): o Auth é um só — conta de teste com dado em produção não sai pelo staging
  if coalesce((staging.pegada_em_producao(p_id) ->> 'em_producao')::boolean, true) then
    raise exception 'conta_em_producao';
  end if;
  if exists (select 1 from public.pacientes where nutricionista_id = p_id)
     or exists (select 1 from staging.pacientes where nutricionista_id = p_id) then
    raise exception 'tem_pacientes';
  end if;
  delete from auth.users where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION staging.paciente_remover_acesso(p_paciente_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'staging', 'public', 'extensions'
AS $function$
declare
  v_pac staging.pacientes%rowtype;
begin
  select * into v_pac from staging.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not coalesce(staging.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  perform staging.exigir_conta_de_teste(v_pac.user_id);
  -- hml-09 (D4): o Auth é um só — conta de teste com dado em produção não sai pelo staging
  if coalesce((staging.pegada_em_producao(v_pac.user_id) ->> 'em_producao')::boolean, true) then
    raise exception 'conta_em_producao';
  end if;
  -- hml-09 (D5): login que também é profissional neste schema (assina algo) ou aluno de outra matrícula não sai de vez
  if coalesce(staging.w2l_assina_no_schema(v_pac.user_id, 'staging'), true)
     or exists (select 1 from staging.pacientes o where o.user_id = v_pac.user_id and o.id <> v_pac.id) then
    raise exception 'login_compartilhado';
  end if;
  delete from auth.users where id = v_pac.user_id;
end;
$function$;

-- conferência (staging): dono postgres, SECURITY DEFINER, volatilidade e EXECUTE como devem ficar — senão o bloco inteiro volta
do $$
declare
  r record;
begin
  for r in
    select e.f, e.vol, e.logado, p.oid
      from (values
      ('staging.pegada_em_producao(uuid)', 's', false),
      ('staging.master_excluir_profissional(uuid)', 'v', true),
      ('staging.paciente_remover_acesso(uuid)', 'v', true)) as e(f, vol, logado)
      left join pg_catalog.pg_proc p on p.oid = to_regprocedure(e.f)
  loop
    if r.oid is null then
      raise exception 'hml-09: % não existe', r.f;
    end if;
    if not exists (select 1 from pg_catalog.pg_proc p
                    where p.oid = r.oid and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' and p.prosecdef
                      and p.provolatile::text = r.vol)
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') <> r.logado
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'hml-09: % com dono, SECURITY DEFINER, volatilidade ou EXECUTE fora do esperado', r.f;
    end if;
  end loop;
end
$$;

-- @@ compartilhado
-- (roda 1x; produção) 3. (D5) public.paciente_remover_acesso: corpo vivo + a recusa do login compartilhado
CREATE OR REPLACE FUNCTION public.paciente_remover_acesso(p_paciente_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'extensions'
AS $function$
declare
  v_pac public.pacientes%rowtype;
begin
  select * into v_pac from public.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not coalesce(public.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  -- hml-09 (D5): login que também é profissional neste schema (assina algo) ou aluno de outra matrícula não sai de vez
  if coalesce(public.w2l_assina_no_schema(v_pac.user_id, 'public'), true)
     or exists (select 1 from public.pacientes o where o.user_id = v_pac.user_id and o.id <> v_pac.id) then
    raise exception 'login_compartilhado';
  end if;
  delete from auth.users where id = v_pac.user_id;
end;
$function$;

-- conferência (public): dono postgres, SECURITY DEFINER, volatilidade e EXECUTE como devem ficar — senão o bloco inteiro volta
do $$
declare
  r record;
begin
  for r in
    select e.f, e.vol, e.logado, p.oid
      from (values
      ('public.paciente_remover_acesso(uuid)', 'v', true)) as e(f, vol, logado)
      left join pg_catalog.pg_proc p on p.oid = to_regprocedure(e.f)
  loop
    if r.oid is null then
      raise exception 'hml-09: % não existe', r.f;
    end if;
    if not exists (select 1 from pg_catalog.pg_proc p
                    where p.oid = r.oid and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres' and p.prosecdef
                      and p.provolatile::text = r.vol)
       or pg_catalog.has_function_privilege('anon', r.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', r.oid, 'EXECUTE') <> r.logado
       or not pg_catalog.has_function_privilege('service_role', r.oid, 'EXECUTE') then
      raise exception 'hml-09: % com dono, SECURITY DEFINER, volatilidade ou EXECUTE fora do esperado', r.f;
    end if;
  end loop;
end
$$;
