-- Physiq W1b — C1 da revisão do plano da W2 (CONFIRMADO na produção, só leitura, 11/10/2026): o app não grava mais o Mercado Pago da
-- cobrança. Banco principal, staging + public. Idempotente. SÓ o gatilho cobrancas_guard_mp: nenhuma tabela, coluna, policy ou grant muda.
-- O furo: o authenticated grava qualquer coluna de cobrancas (grant de tabela, sem grant por coluna; as policies "membro cria" e "dono
-- da conta ou quem criou edita" da w02 (:794-800) e "criar/editar as proprias" da configuracoes (:48/:57) não olham coluna; as guardas de
-- hoje só travam a InfinitePay (W1) e o período (W-P)) e a pagamentos-aluno estornava, cancelava e lia no MP o mp_payment_id da linha com
-- o token do Physiq. Um dono de conta criava pelo REST uma avulsa "paga pelo MP" com o id do pagamento do próprio plano e chamava o
-- prof_reembolsar: o dinheiro voltava e o período ficava (~/projetos/physiqcalc-scratch/w2/c1-verificacao.md).
-- Agora, para o authenticated que não é master (o MESMO teste das guardas da W1 e da W-P):
--   · INSERT: forma 'mp' vira nula; mp_payment_id, mp_status, mp_preapproval_id, pix_qr, pix_copia_cola, pix_expira_em e reembolsado_em
--     ficam nulos (a linha nasce comum, sem MP — o resto grava como antes);
--   · UPDATE: forma não entra nem sai de 'mp'; mp_* e pix_* ficam como estavam; na linha do MP (old.forma = 'mp') o status e o
--     reembolsado_em também (a situação dela vem do MP, pela função).
-- Quem grava o MP continua igual: a pagamentos-aluno, a mp-webhook-aluno e as migrações (service_role/postgres: current_user não é
-- authenticated) e o master. O app só LÊ cobrancas (src/painel/financeiro/dados.ts:400; o resto vai pela pagamentos-aluno); o dbPessoa
-- da W1 não toca em cobrancas; as 2 funções SQL que gravam (mensalidade_recalcular, infinitepay_fechar_vencidas) são SECURITY DEFINER;
-- o site antigo do Nutri está fora do ar (308 desde a W28) e nunca gravou coluna do MP.
-- A 2ª camada fica na pagamentos-aluno (W1b): antes de estornar, cancelar, detalhar ou aplicar, o pagamento tem que ser DESTA cobrança
-- (pagamentoEDaCobranca) — cobre as linhas de antes desta guarda e o erro do master.
-- Nome próprio de propósito: a W2 NÃO troca este corpo por um mais estreito; a mp_collector_id entra na guarda dela
-- (cobrancas_guard_mp_conta) ou num corpo novo DESTA que mantenha tudo daqui. Coluna citada no corpo e ausente do schema quebraria TODA
-- gravação de cobrancas (o plpgsql só acusa ao rodar): por isso a conferência das colunas logo abaixo, antes de ligar o gatilho.
-- Os gatilhos BEFORE rodam em ordem alfabética: guard_infinitepay → guard_mp → guard_periodo → updated_at (nenhum desfaz o outro).
-- Aplicar (backup do public ANTES — scripts/backup/backup_principal.py, no notebook; dry-run antes de cada):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011220000_w1b_guarda_cobrancas_mp.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011220000_w1b_guarda_cobrancas_mp.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011220000_w1b_guarda_cobrancas_mp.sql --so public --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011220000_w1b_guarda_cobrancas_mp.sql --so public
-- Testes: python3 e2e/w1b/sql_w1b.py (staging, blocos desfeitos) · python3 e2e/w1b/sql_w1b.py --schema public (só leitura: o catálogo)
-- Desfazer (só se preciso): drop trigger if exists trg_cobrancas_guard_mp on <schema>.cobrancas; drop function if exists
-- <schema>.cobrancas_guard_mp();

-- 1. as colunas que a guarda lê existem (sem uma delas, a migration para aqui e nada entra)
do $w1b$
declare
  v_falta text;
begin
  select string_agg(c.nome, ', ') into v_falta
    from unnest(array['forma', 'status', 'mp_payment_id', 'mp_status', 'mp_preapproval_id', 'pix_qr', 'pix_copia_cola', 'pix_expira_em',
                      'reembolsado_em']) as c(nome)
   where not exists (select 1 from pg_attribute a where a.attrelid = '{schema}.cobrancas'::regclass and a.attname = c.nome
                        and a.attnum > 0 and not a.attisdropped);
  if v_falta is not null then
    raise exception 'w1b: {schema}.cobrancas sem a(s) coluna(s) %', v_falta;
  end if;
end $w1b$;

-- 2. a guarda (security invoker: o current_user é o de quem grava — o authenticated do app ou o service_role/postgres do servidor)
create or replace function {schema}.cobrancas_guard_mp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      if new.forma = 'mp' then new.forma := null; end if;
      new.mp_payment_id := null; new.mp_status := null; new.mp_preapproval_id := null;
      new.pix_qr := null; new.pix_copia_cola := null; new.pix_expira_em := null;
      new.reembolsado_em := null;
    else
      if new.forma is distinct from old.forma and (new.forma = 'mp' or old.forma = 'mp') then
        new.forma := old.forma;
      end if;
      if old.forma = 'mp' then
        new.status := old.status;               -- a situação da linha do MP vem do MP (pela função), não do app
        new.reembolsado_em := old.reembolsado_em;
      end if;
      new.mp_payment_id := old.mp_payment_id; new.mp_status := old.mp_status; new.mp_preapproval_id := old.mp_preapproval_id;
      new.pix_qr := old.pix_qr; new.pix_copia_cola := old.pix_copia_cola; new.pix_expira_em := old.pix_expira_em;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function {schema}.cobrancas_guard_mp() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_mp on {schema}.cobrancas;
create trigger trg_cobrancas_guard_mp before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_mp();
