-- Reversa da trava de e-mail/CPF que deixa o login sair (supabase-principal/migrations/20261031170000_excluir_conta_desligar_login.sql).
-- Idempotente: roda com ou sem a migração aplicada. Devolve ao banco o gatilho de ANTES (pg_get_functiondef de 31/10/2026, igual
-- nos 2 schemas): desligar o login volta a ser conferido — e o "Excluir minha conta" do aluno com 2 matrículas vivas com o mesmo
-- e-mail volta a dar 500 (paciente_email_repetido). Usar só se a migração quebrar algo, junto do revert do código.
-- Aplicar: python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261031170000_excluir_conta_desligar_login_reversa.sql --so staging
--          (e --so public, se a migração tiver ido ao public)

select set_config('lock_timeout', '5s', true);

CREATE OR REPLACE FUNCTION {schema}.pacientes_unicos_email_cpf()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_e text;
  v_c text;
  v_vivo_antes boolean := false;
  v_user_antes uuid;
  v_email_antes text;
  v_cpf_antes text;
  v_rep text[];
begin
  if new.deleted_at is not null then
    return new;  -- na lixeira não conta
  end if;
  v_e := {schema}.normalizar_email(new.email);
  v_c := {schema}.normalizar_cpf(new.cpf);
  if v_e is null and v_c is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_vivo_antes := old.deleted_at is null;
    v_user_antes := old.user_id;
    v_email_antes := old.email;
    v_cpf_antes := old.cpf;
    if v_vivo_antes and v_e is not distinct from {schema}.normalizar_email(old.email)
       and v_c is not distinct from {schema}.normalizar_cpf(old.cpf) and new.user_id is not distinct from old.user_id then
      return new;  -- nada do que a trava olha mudou (editar outro campo de quem já era repetido passa)
    end if;
  end if;
  -- 2 gravações ao mesmo tempo com o mesmo e-mail/CPF esperam uma pela outra
  if v_e is not null then perform pg_advisory_xact_lock(hashtextextended('pacientes:email:' || v_e, 0)); end if;
  if v_c is not null then perform pg_advisory_xact_lock(hashtextextended('pacientes:cpf:' || v_c, 0)); end if;
  select coalesce(array_agg(x), '{}') into v_rep
    from {schema}.paciente_conflitos_novos(new.id, v_vivo_antes, v_user_antes, v_email_antes, v_cpf_antes, new.user_id, new.email, new.cpf) x;
  if 'email' = any(v_rep) then
    raise exception using errcode = 'P0001', message = 'paciente_email_repetido', hint = 'Já existe um aluno com este e-mail.';
  end if;
  if 'cpf' = any(v_rep) then
    raise exception using errcode = 'P0001', message = 'paciente_cpf_repetido', hint = 'Já existe um aluno com este CPF.';
  end if;
  return new;
end;
$function$;
