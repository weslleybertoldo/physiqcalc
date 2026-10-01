-- Physiq W19 — Painel › Financeiro (banco principal, staging e public; spec §11.3 W19, §4.1 "Quem vê e edita o quê" linha Financeiro,
-- §8.1 "Comuns", P6). Idempotente; NENHUM dado muda: só uma política de LEITURA a mais.
--
-- Aplicar (backup ANTES — as políticas e as contagens de categorias_financeiras e transacoes):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001040000_w19_financeiro.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001040000_w19_financeiro.sql --so public
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
--
-- O que muda: o DONO da conta vê e edita os lançamentos da equipe inteira (a "transacoes: dono da conta" da W2), mas as categorias
-- são de cada profissional ("ler as proprias" do Nutri) — no Financeiro do dono, o lançamento do personal aparecia "sem categoria".
-- Agora o dono LÊ (só lê) a categoria que um lançamento de uma conta dele usa. Ninguém mais ganha nada; criar, renomear e excluir
-- categoria continuam só de quem é dono dela (e do master). O site antigo do Nutri não muda (a nutri lê as dela como sempre).

drop policy if exists "categorias_financeiras: dono le as da conta" on {schema}.categorias_financeiras;
create policy "categorias_financeiras: dono le as da conta" on {schema}.categorias_financeiras
  for select to authenticated
  using (exists (
    select 1 from {schema}.transacoes t
     where t.categoria_id = categorias_financeiras.id
       and t.conta_id is not null
       and {schema}.sou_dono(t.conta_id)
  ));
