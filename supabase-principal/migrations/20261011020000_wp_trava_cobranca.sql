-- Physiq W-P — trava NO BANCO das colunas de cobrança (desenho §7 I5). Idempotente. O app (authenticated) tinha UPDATE direto em
-- pacientes.mensalidade_valor/mensalidade_pago_ate/plano_aluno_id/cobranca_pausada (a policy "pacientes: editar pela conta" inclui o
-- personal e a nutri responsáveis) e INSERT/UPDATE em cobrancas — com meses_cobertos, uma linha "paga" inserida pela API valeria N meses.
-- Agora: essas colunas só mudam pelo servidor (pagamentos-aluno, service_role) ou pelo master; a AVULSA que o site antigo do Nutri grava
-- direto continua (só as colunas de período ficam no padrão). planos_aluno vira só leitura para o app (a gravação é da função, só o dono).
--
-- Aplicar (depois da 20261011010000; backup ANTES):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql --so public

create or replace function {schema}.pacientes_guard_cobranca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      new.mensalidade_valor := null;
      new.mensalidade_pago_ate := null;
      new.plano_aluno_id := null;
      new.plano_modalidade := null;
      new.plano_valor_negociado := null;
      new.cobranca_pausada := false;
    else
      new.mensalidade_valor := old.mensalidade_valor;
      new.mensalidade_pago_ate := old.mensalidade_pago_ate;
      new.plano_aluno_id := old.plano_aluno_id;
      new.plano_modalidade := old.plano_modalidade;
      new.plano_valor_negociado := old.plano_valor_negociado;
      new.cobranca_pausada := old.cobranca_pausada;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.pacientes_guard_cobranca() from public, anon, authenticated;
-- o nome vem antes de trg_pacientes_valor_do_plano na ordem dos gatilhos BEFORE (alfabética): a guarda devolve o valor velho e só
-- depois o valor do plano é recalculado
drop trigger if exists trg_pacientes_guard_cobranca on {schema}.pacientes;
create trigger trg_pacientes_guard_cobranca before insert or update on {schema}.pacientes
  for each row execute function {schema}.pacientes_guard_cobranca();

create or replace function {schema}.cobrancas_guard_periodo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      new.meses_cobertos := 1;
      new.parcelas_total := null;
      new.parcela_num := null;
    else
      new.meses_cobertos := old.meses_cobertos;
      new.parcelas_total := old.parcelas_total;
      new.parcela_num := old.parcela_num;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.cobrancas_guard_periodo() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_periodo on {schema}.cobrancas;
create trigger trg_cobrancas_guard_periodo before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_periodo();

-- planos_aluno: os membros leem e o master edita (policies de hoje); a escrita do dono passa a ser só pela pagamentos-aluno
drop policy if exists "planos_aluno: dono edita" on {schema}.planos_aluno;
