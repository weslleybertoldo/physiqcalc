-- Reversa da 20261007200000_hml01a_paciente_acesso_guarda.sql: volta ao estado da CONTENÇÃO de 07/10/2026 ~19:07
-- (corpo de 20260920070000 e SEM EXECUTE para authenticated — a guarda antiga não pode voltar aberta).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging|public

create or replace function {schema}.paciente_definir_acesso(p_paciente_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  update auth.users
     set banned_until = case when p_ativo then null else now() + interval '100 years' end, updated_at = now()
   where id = v_pac.user_id;
  update public.profiles set ativo = p_ativo where id = v_pac.user_id;
  update staging.profiles set ativo = p_ativo where id = v_pac.user_id;
  if not p_ativo then delete from auth.sessions where user_id = v_pac.user_id; end if;
end;
$$;

create or replace function {schema}.paciente_remover_acesso(p_paciente_id uuid)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not (v_pac.nutricionista_id = auth.uid() or {schema}.eh_master()) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  delete from auth.users where id = v_pac.user_id;
end;
$$;

revoke all on function {schema}.paciente_definir_acesso(uuid, boolean) from public, anon, authenticated;
revoke all on function {schema}.paciente_remover_acesso(uuid) from public, anon, authenticated;
grant execute on function {schema}.paciente_definir_acesso(uuid, boolean) to service_role;
grant execute on function {schema}.paciente_remover_acesso(uuid) to service_role;
