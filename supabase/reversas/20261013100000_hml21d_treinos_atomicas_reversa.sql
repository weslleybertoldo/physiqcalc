-- Reversa da hml-21d no banco do Treino (supabase/migrations/20261013100000_hml21d_treinos_atomicas.sql). Idempotente: roda com ou sem
-- a migração aplicada. Saem as 2 funções novas (treino_pronto_salvar, modelo_ordenar) no schema do physiq.schemas; nada mais muda
-- (tabelas, policies, gatilhos, buckets e dados ficaram como estavam — o que as funções já gravaram são linhas comuns e FICAM). Nenhuma
-- existia antes e nenhuma função de hoje mudou: não há texto antigo para recriar.
--
-- ATENÇÃO — reverter o FRONT e a função treinos ANTES: a treinos da hml-21d chama estas RPCs no salvar do treino pronto (Master) e na
-- ordem do modelo (Painel › Treinos); sem elas, essas 2 ações dão erro na tela (o resto segue). O front de antes (gravação direta) não
-- as chama.
-- Roda 1x por ambiente: set physiq.schemas = 'staging' | 'public'; <este arquivo>
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  execute format('drop function if exists %I.treino_pronto_salvar(uuid, jsonb, jsonb)', v_amb);
  execute format('drop function if exists %I.modelo_ordenar(uuid, uuid[])', v_amb);
end
$$;

-- o PostgREST relê o schema (as RPCs somem da API na hora)
notify pgrst, 'reload schema';
