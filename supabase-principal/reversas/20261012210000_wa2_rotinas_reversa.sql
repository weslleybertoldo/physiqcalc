-- REVERSA da 20261012210000_wa2_rotinas.sql (W-A P1). Idempotente. Rodar DEPOIS da reversa da wa3 e ANTES da reversa da wa1.
-- Saem as 8 RPCs e as 4 internas; tabela vazia é apagada, com linha vira <nome>_reversa_wa2 (sem policy e sem privilégio da API).
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261012210000_wa2_rotinas_reversa.sql --so staging|public
do $wa$
begin
  if to_regprocedure('{schema}.wa_dados_do_aluno(uuid, boolean)') is not null then
    raise exception 'reversa wa2: rode a reversa da wa3 ANTES (a LGPD da wa3 cita as rotinas)';
  end if;
end
$wa$;

drop function if exists {schema}.minhas_rotinas(date, date);
drop function if exists {schema}.rotina_salvar(uuid, jsonb);
drop function if exists {schema}.rotina_arquivar(uuid);
drop function if exists {schema}.rotina_marcar(uuid, date, boolean);
drop function if exists {schema}.rotinas_ordenar(uuid[]);
drop function if exists {schema}.rotinas_do_aluno(uuid, date, date);
drop function if exists {schema}.rotina_prof_salvar(uuid, uuid, jsonb);
drop function if exists {schema}.rotina_prof_arquivar(uuid, uuid);
drop function if exists {schema}.wa_rotina_gravar(uuid, uuid, jsonb, text, uuid);
drop function if exists {schema}.wa_rotina_arquivar(uuid, text);
do $wa$
begin
  if to_regclass('{schema}.rotinas') is not null then
    execute 'drop function if exists {schema}.wa_rotina_campos(jsonb, {schema}.rotinas)';
    execute 'drop function if exists {schema}.wa_rotina_json({schema}.rotinas)';
  end if;
end
$wa$;

do $wa$
declare
  v_t text;
  v_oid regclass;
  v_n bigint;
  v_i text;
  v_p text;
begin
  foreach v_t in array array['rotinas_historico', 'rotinas_feitas', 'rotinas'] loop
    v_oid := to_regclass('{schema}.' || v_t);
    continue when v_oid is null;
    for v_p in select p.polname from pg_catalog.pg_policy p where p.polrelid = v_oid loop
      execute format('drop policy %I on {schema}.%I', v_p, v_t);
    end loop;
    execute format('select count(*) from {schema}.%I', v_t) into v_n;
    if v_n = 0 then
      execute format('drop table {schema}.%I cascade', v_t);
    else
      for v_i in select c.relname from pg_catalog.pg_index x join pg_catalog.pg_class c on c.oid = x.indexrelid where x.indrelid = v_oid loop
        execute format('alter index {schema}.%I rename to %I', v_i, left(v_i, 50) || '_rev_wa2');
      end loop;
      execute format('alter table {schema}.%I rename to %I', v_t, v_t || '_reversa_wa2');
      execute format('revoke all on table {schema}.%I from public, anon, authenticated', v_t || '_reversa_wa2');
      raise notice 'reversa wa2: {schema}.% guardada como %_reversa_wa2 (% linhas)', v_t, v_t, v_n;
    end if;
  end loop;
end
$wa$;

do $wa$
begin
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where n.nspname = '{schema}' and p.proname in ('minhas_rotinas', 'rotina_salvar', 'rotina_arquivar', 'rotina_marcar',
                'rotinas_ordenar', 'rotinas_do_aluno', 'rotina_prof_salvar', 'rotina_prof_arquivar', 'wa_rotina_gravar',
                'wa_rotina_arquivar', 'wa_rotina_campos', 'wa_rotina_json'))
     or to_regclass('{schema}.rotinas') is not null or to_regclass('{schema}.rotinas_feitas') is not null
     or to_regclass('{schema}.rotinas_historico') is not null then
    raise exception 'reversa wa2: sobrou objeto da wa2 com o nome de uso em {schema}';
  end if;
end
$wa$;
