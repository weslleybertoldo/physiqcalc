-- Reversa da hml-16c F7 (supabase-principal/migrations/20261010040000_hml16c_fila_sem_legado.sql). Idempotente: roda com ou
-- sem a migração aplicada. A {schema}.espelho_disparar() volta ao corpo de antes (20261010010000_hml16c_segredo_fila.sql,
-- copiado sem mudança): lê o Vault 'physiq_espelho_fila_segredo' e, sem ele (ou curto), o nome antigo de reserva. Grants,
-- assinatura e search_path não mudam. Enquanto o Vault antigo não existe (apagado no F6 da hml-16c), os 2 corpos fazem o
-- mesmo; a reserva só volta a valer junto com a volta do F6 (que regrava o segredo de antes).
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
  -- hml-16c (S8): o segredo da fila; sem ele (ou curto), o nome antigo — a reserva sai no F7
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_espelho_fila_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then
    select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_espelho_segredo' limit 1;
  end if;
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
