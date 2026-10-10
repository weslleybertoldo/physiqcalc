-- Reversa da hml-16c (supabase-principal/migrations/20261010010000_hml16c_segredo_fila.sql). Idempotente: roda com ou sem a
-- migração aplicada. A {schema}.espelho_disparar() volta ao corpo de antes (20260929090000_w04_cobranca.sql:125-152, copiado sem
-- mudança): lê só o Vault 'physiq_espelho_segredo'. Grants, assinatura e search_path não mudam.
-- ANTES dela: o nome antigo tem de valer na espelho-enviar (o ESPELHO_SEGREDO das funções do principal = o Vault antigo). Se o
-- Vault antigo já saiu (F6 da hml-16c), a fila só espera (nenhum pedido sai) até ele voltar — a volta do F6 regrava os 2.
-- O Vault novo ('physiq_espelho_fila_segredo') fica onde está (só deixa de ser lido): apagar com
-- python3 scripts/segredos/servidor.py espelho_fila tirar.
-- Aplicar: python3 scripts/apply_migration_principal.py <este arquivo> --so staging [--dry-run]
--          python3 scripts/apply_migration_principal.py <este arquivo> --so public  [--dry-run]

-- dispara a fila do espelho (espelho-enviar → espelho-nucleo do Banco do Treino, spec 8.3) pelo pg_net — assíncrono: o pedido
-- sai depois do commit. Só chama quando há pendência pronta; sem pg_net ou sem o segredo no Vault, não faz nada.
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
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_espelho_segredo' limit 1;
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
