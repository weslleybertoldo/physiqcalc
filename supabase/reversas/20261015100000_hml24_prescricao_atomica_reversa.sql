-- Reversa da hml-24 no banco do Treino (supabase/migrations/20261015100000_hml24_prescricao_atomica.sql). Idempotente: roda com ou sem
-- a migração aplicada. Saem as 2 funções novas (prescricao_salvar, observacao_salvar) no schema do physiq.schemas; nada mais muda
-- (tabelas, índices, policies, gatilhos e dados ficaram como estavam — o que as RPCs já gravaram são linhas comuns de
-- tb_series_padrao_usuario e FICAM). Nenhuma existia antes e nenhuma função de hoje mudou: não há texto antigo para recriar.
--
-- ATENÇÃO — voltar a função admin-semana-treinos ANTES (a versão de antes da hml-24: o "lê e depois insere"): a da hml-24 chama
-- estas RPCs no setPrescricao e no setObservacao; sem elas, os campos do editor do Treino e a observação dão erro (500) na tela
-- (o resto segue). O front da hml-24 (a fila por linha) funciona com a função de antes — a mesma API.
-- Roda 1x por ambiente: set physiq.schemas = 'staging' | 'public'; <este arquivo>
do $$
declare
  v_amb text := current_setting('physiq.schemas', true);
begin
  if v_amb is null or v_amb not in ('staging', 'public') then
    raise exception 'defina physiq.schemas = staging ou public (recebi %)', v_amb;
  end if;
  execute format('drop function if exists %I.prescricao_salvar(uuid, uuid, uuid, uuid, uuid, integer, text, integer, numeric)', v_amb);
  execute format('drop function if exists %I.observacao_salvar(uuid, uuid, uuid, text)', v_amb);
end
$$;

-- o PostgREST relê o schema (as RPCs somem da API na hora)
notify pgrst, 'reload schema';
