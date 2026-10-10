-- Physiq hml-16c (H-51, S8, F7 · 10/10/2026) — a fila do espelho só com o segredo PRÓPRIO dela. Banco principal, staging + public.
-- Idempotente; só troca o corpo de 1 função que já existe (nenhuma tabela, coluna, policy, dado ou grant muda).
--
-- {schema}.espelho_disparar() (o pg_cron da fila e as funções SQL que mudam o acesso chamam) manda o x-espelho-segredo para a
-- espelho-enviar pelo pg_net, lido do Vault 'physiq_espelho_fila_segredo' (a espelho-enviar confere pela lista
-- SEGREDO_ESPELHO_FILA_ACEITOS). Sai a reserva do nome antigo do Vault (o segredo único de antes, apagado no F6 da hml-16c):
-- sem o Vault da fila (ou com menos de 32 caracteres) não chama nada — a fila espera, como sem o pg_net.
-- O resto do corpo é o da definição de hoje (20261010010000_hml16c_segredo_fila.sql), sem mudança. Assinatura, SECURITY
-- DEFINER, search_path = '' e grants ficam (o create or replace não mexe nos grants: só a service_role executa).
-- Quem grava o Vault da fila: python3 scripts/segredos/servidor.py espelho_fila trocar.
--
-- Aplicar (backup ANTES em produção — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261010040000_hml16c_fila_sem_legado.sql --so staging [--dry-run]
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261010040000_hml16c_fila_sem_legado.sql --so public  [--dry-run]
-- Reversa: supabase-principal/reversas/20261010040000_hml16c_fila_sem_legado_reversa.sql

-- dispara a fila do espelho (espelho-enviar → espelho-nucleo do Banco do Treino, spec 8.3) pelo pg_net — assíncrono: o pedido
-- sai depois do commit. Só chama quando há pendência pronta; sem pg_net ou sem o segredo da fila no Vault, não faz nada.
create or replace function {schema}.espelho_disparar() returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_segredo text;
  v_id bigint;
begin
  if not exists (select 1 from {schema}.espelho_pendencias e
                  where e.feito_em is null and e.tentativas < 5 and e.proxima_em <= now()) then
    return null;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  -- hml-16c (S8): só o segredo da fila, sem reserva
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_espelho_fila_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then
    return null;
  end if;
  select net.http_post(
    url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/espelho-enviar',
    body := jsonb_build_object('limite', 50),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-espelho-segredo', v_segredo, 'x-schema', '{schema}'),
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;
