-- Homologação do Physiq — hml-01 / H-01 (07/10/2026). Idempotente.
-- paciente_definir_acesso e paciente_remover_acesso passam a usar a mesma guarda das irmãs (pode_mexer_no_acesso, W8b:
-- master, a nutricionista do aluno ou quem pode ver o aluno pela conta). A guarda antiga comparava nutricionista_id = auth.uid()
-- direto: com nutricionista_id vazio a comparação dava NULL e o "if not (...)" não disparava.
-- O site antigo da Nutri (physiqnutri, src/lib/pacienteAcesso.ts) chama as 2 como a nutricionista: o EXECUTE de authenticated
-- volta (a contenção de 07/10 ~19:07 tinha tirado). O corpo, fora a guarda, é o de 20260920070000_paciente_acesso.sql.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging (depois --so public, com backup).

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
  if not found or not coalesce({schema}.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
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
  if not found or not coalesce({schema}.pode_mexer_no_acesso(p_paciente_id), false) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  delete from auth.users where id = v_pac.user_id;
end;
$$;

revoke all on function {schema}.paciente_definir_acesso(uuid, boolean) from public, anon;
revoke all on function {schema}.paciente_remover_acesso(uuid) from public, anon;
grant execute on function {schema}.paciente_definir_acesso(uuid, boolean) to authenticated, service_role;
grant execute on function {schema}.paciente_remover_acesso(uuid) to authenticated, service_role;
