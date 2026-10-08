-- Reversa da hml-10 no banco do Treino (supabase/migrations/20261008100100_hml10_manter_ativo_treino.sql): tira a RPC do
-- keep-alive. Depois dela o ping REST do keep-alive.yml volta a dar 404 — reverter o workflow junto.
-- Roda 1x por ambiente: set physiq.schemas = 'staging' | 'public'; <este arquivo>
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  execute format('drop function if exists %I.manter_ativo()', v_amb);
end
$$;
