-- Homologação do Physiq — hml-10 no BANCO DO TREINO (Supabase uxwpwdbbnlticxgtzcsb) (08/10/2026): ping do keep-alive sem
-- tabela aberta ao visitante. Idempotente. Mesmo desenho do principal (supabase-principal/migrations/20261008100000_*).
-- O ping lia public.app_config com a chave pública; a hml-01 (H-10) tirou do visitante a leitura das tabelas e o ping passou a
-- dar 401 (08/10 01:02 UTC). No lugar: uma RPC que só devolve true — vai ao Postgres como qualquer leitura, não lê nem grava
-- dado. Só o visitante (anon) e a service_role executam.
-- Roda 1x por ambiente: set physiq.schemas = 'staging'; <este arquivo>   e depois   set physiq.schemas = 'public'; <este arquivo>
-- Reversa: supabase/reversas/20261008100100_hml10_manter_ativo_treino_reversa.sql
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  execute format(
    'create or replace function %I.manter_ativo() returns boolean language sql stable security invoker '
    'set search_path = '''' as $f$ select true $f$', v_amb);
  execute format('comment on function %I.manter_ativo() is %L', v_amb,
    'Ping do keep-alive (.github/workflows/keep-alive.yml): atividade de banco pela API sem abrir tabela ao visitante. '
    'Não lê nem grava dado.');
  execute format('revoke all on function %I.manter_ativo() from public, anon, authenticated', v_amb);
  execute format('grant execute on function %I.manter_ativo() to anon, service_role', v_amb);
end
$$;
