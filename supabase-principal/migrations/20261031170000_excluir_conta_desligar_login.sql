-- "Excluir minha conta" tem que funcionar sempre (31/10/2026, agente F) — a trava de e-mail/CPF repetido (W16b) não pode barrar o
-- login que SAI. Idempotente. Decisão do dono (31/10/2026): "Pode seguir com as tarefas sugeridas corrigir excluir …".
--
-- O defeito (achado pelo agente E na limpeza das contas de teste e reproduzido no staging em 31/10, 20:04:39Z): o aluno com 2
-- matrículas VIVAS com o mesmo e-mail — o caso comum: o aluno do app que entrou na lista de um profissional fica com a matrícula do
-- app inativa, mas viva — pede "Excluir minha conta" → o login sai de vez por último (auth.admin.deleteUser) → o "on delete set null"
-- do pacientes.user_id roda o gatilho trg_pacientes_unicos_email_cpf em cada matrícula: a 1ª que fica sem login já não é "a mesma
-- pessoa" da 2ª (que ainda aponta para o login) → paciente_email_repetido (ou paciente_cpf_repetido) → o Auth desfaz tudo (500,
-- "Database error deleting user") e o login FICA. O mesmo gatilho barra o caminho do PROFISSIONAL (excluir_conta_profissional zera o
-- user_id das matrículas de aluno dele antes do soft delete) quando o profissional também é aluno com 2+ matrículas vivas.
--
-- A correção (só o gatilho; o resto da regra não muda): DESLIGAR o login de uma matrícula viva (user_id: um login → vazio) sem mudar
-- o e-mail, o CPF nem a lixeira não traz e-mail/CPF NOVO para a linha — os valores já estavam lá, da mesma pessoa —, então não confere.
-- Continua TUDO conferido como antes: cadastrar, editar o e-mail/CPF, restaurar da lixeira, ligar um login (vazio → login) e trocar
-- o login (um login → outro). No uso normal ninguém desliga login: o app não mexe no user_id (pacientes_guard_vinculos devolve o
-- de antes para quem não é master); só a exclusão da conta desliga (o "set null" do hard delete e a excluir_conta_profissional).
-- Corpo = pg_get_functiondef do banco vivo em 31/10/2026 (igual nos 2 schemas, fora o nome), com o bloco novo marcado "F (31/10)";
-- mesmos atributos (plpgsql, SECURITY DEFINER, search_path ''). CREATE OR REPLACE mantém o dono, as permissões e o gatilho.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]   (depois --so public; backup antes)
-- Reversa: supabase-principal/reversas/20261031170000_excluir_conta_desligar_login_reversa.sql

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
    -- F (31/10): desligar o login (um login → vazio) sem mudar e-mail, CPF nem a lixeira não traz e-mail/CPF novo para a linha — é o
    -- "set null" do login que sai na exclusão da conta (e a excluir_conta_profissional); ligar e trocar o login continuam conferidos
    if v_vivo_antes and old.user_id is not null and new.user_id is null
       and v_e is not distinct from {schema}.normalizar_email(old.email) and v_c is not distinct from {schema}.normalizar_cpf(old.cpf) then
      return new;
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
