-- REVERSA da 20261012200000_wa1_acessos.sql (W-A P1). Idempotente. Rodar DEPOIS das reversas da wa3 e da wa2.
-- Saem os 2 gatilhos do histórico, as 3 RPCs, as internas e as 2 policies; tabela vazia é apagada, com linha vira
-- <nome>_reversa_wa1 (o histórico de mudanças de acesso guardado; sem policy e sem privilégio da API). Os avisos que a W-A pôs no
-- sino ficam (são do aluno). pacientes.config não muda (as 3 chaves sempre moraram lá).
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261012200000_wa1_acessos_reversa.sql --so staging|public
do $wa$
begin
  if to_regprocedure('{schema}.rotina_prof_salvar(uuid, uuid, jsonb)') is not null then
    raise exception 'reversa wa1: rode a reversa da wa2 ANTES (as rotinas usam wa_rota e wa_aviso_aluno)';
  end if;
end
$wa$;

drop trigger if exists trg_pacientes_wa_log_acessos on {schema}.pacientes;
do $wa$
begin
  if to_regclass('{schema}.aluno_acessos') is not null then
    execute 'drop trigger if exists trg_aluno_acessos_log on {schema}.aluno_acessos';
    execute 'drop policy if exists "aluno_acessos: ler quem ve o aluno e o proprio" on {schema}.aluno_acessos';
  end if;
  if to_regclass('{schema}.aluno_acessos_log') is not null then
    execute 'drop policy if exists "aluno_acessos_log: ler quem ve o aluno" on {schema}.aluno_acessos_log';
  end if;
end
$wa$;
drop function if exists {schema}.acessos_ler(uuid);
drop function if exists {schema}.acessos_salvar(uuid, text, text);
drop function if exists {schema}.acessos_registrar_series(uuid, text, text);
drop function if exists {schema}.wa_acessos_json(uuid);
drop function if exists {schema}.wa_aviso_aluno(uuid, text, text);
drop function if exists {schema}.wa_rota(uuid);
drop function if exists {schema}.aluno_dieta_liberada(uuid);
drop function if exists {schema}.wa_nutricao_de_verdade(uuid);
drop function if exists {schema}.wa_minha_matricula(uuid);
drop function if exists {schema}.wa_log_acessos_pacientes();
drop function if exists {schema}.wa_log_aluno_acessos();

do $wa$
declare
  v_t text;
  v_oid regclass;
  v_n bigint;
  v_i text;
begin
  foreach v_t in array array['aluno_acessos_log', 'aluno_acessos'] loop
    v_oid := to_regclass('{schema}.' || v_t);
    continue when v_oid is null;
    execute format('select count(*) from {schema}.%I', v_t) into v_n;
    if v_n = 0 then
      execute format('drop table {schema}.%I cascade', v_t);
    else
      for v_i in select c.relname from pg_catalog.pg_index x join pg_catalog.pg_class c on c.oid = x.indexrelid where x.indrelid = v_oid loop
        execute format('alter index {schema}.%I rename to %I', v_i, left(v_i, 50) || '_rev_wa1');
      end loop;
      execute format('alter table {schema}.%I rename to %I', v_t, v_t || '_reversa_wa1');
      execute format('revoke all on table {schema}.%I from public, anon, authenticated', v_t || '_reversa_wa1');
      raise notice 'reversa wa1: {schema}.% guardada como %_reversa_wa1 (% linhas)', v_t, v_t, v_n;
    end if;
  end loop;
end
$wa$;

do $wa$
begin
  if exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
              where n.nspname = '{schema}' and p.proname in ('acessos_ler', 'acessos_salvar', 'acessos_registrar_series',
                'wa_acessos_json', 'wa_aviso_aluno', 'wa_rota', 'aluno_dieta_liberada', 'wa_nutricao_de_verdade', 'wa_minha_matricula',
                'wa_log_acessos_pacientes', 'wa_log_aluno_acessos'))
     or exists (select 1 from pg_catalog.pg_trigger t where not t.tgisinternal and t.tgname = 'trg_pacientes_wa_log_acessos'
                  and t.tgrelid = '{schema}.pacientes'::regclass)
     or to_regclass('{schema}.aluno_acessos') is not null or to_regclass('{schema}.aluno_acessos_log') is not null then
    raise exception 'reversa wa1: sobrou objeto da wa1 com o nome de uso em {schema}';
  end if;
end
$wa$;
