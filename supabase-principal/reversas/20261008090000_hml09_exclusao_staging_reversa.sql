-- Reversa da 20261008090000_hml09_exclusao_staging (hml-09): as 3 funções como estavam antes (pg_get_functiondef do banco
-- vivo, 08/10/2026) e sem a staging.pegada_em_producao. Reverter ANTES a borda excluir-minha-conta (a da hml-09 chama a pegada:
-- sem ela, a exclusão pelo staging falha fechada com 500).
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging · --compartilhado (produção)
--          (sem opções: staging → public (repete o staging) → compartilhado)

-- staging
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
  delete from auth.users where id = v_pac.user_id;
end;
$function$;

drop function if exists staging.pegada_em_producao(uuid);

-- @@ compartilhado
-- public
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
  delete from auth.users where id = v_pac.user_id;
end;
$function$;
