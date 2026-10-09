-- Reversa da hml-14d no banco do Treino (supabase/migrations/20261009050000_hml14d_treino_listas.sql): tira as 3 funções novas
-- (modelos_da_lista, exercicios_da_lista e texto_busca — nenhuma existia antes; nenhuma função de hoje mudou, então não há texto
-- antigo para recriar). Depois dela o front da 14d (Meus treinos, Biblioteca, folhas do editor, Biblioteca do master) recebe
-- PGRST202 — reverter o front junto (o de antes lê as tabelas direto).
-- Roda 1x por ambiente: set physiq.schemas = 'staging' | 'public'; <este arquivo>
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  execute format('drop function if exists %I.modelos_da_lista(jsonb, integer, integer)', v_amb);
  execute format('drop function if exists %I.exercicios_da_lista(jsonb, integer, integer)', v_amb);
  -- as 2 de cima usam a texto_busca: ela sai por último
  execute format('drop function if exists %I.texto_busca(text)', v_amb);
end
$$;

-- o PostgREST relê o schema (as RPCs somem da API na hora)
notify pgrst, 'reload schema';
