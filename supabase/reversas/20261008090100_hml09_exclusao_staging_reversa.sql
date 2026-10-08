-- Reversa da 20261008090100_hml09_exclusao_staging (hml-09) no BANCO DO TREINO: tira a staging.physiq_pegada_em_producao (a
-- migration não muda nenhuma outra função nem dado). Reverter ANTES a delete-my-account (a da hml-09 chama a pegada: sem ela, a
-- exclusão pelo staging falha fechada com 500).
-- Aplicar na MESMA chamada da Management API: set physiq.schemas = 'staging'; <este arquivo>   (outro valor recusa)
do $$
begin
  if coalesce(nullif(btrim(current_setting('physiq.schemas', true)), ''), '(vazio)') <> 'staging' then
    raise exception 'hml-09: este arquivo só mexe em staging.* — defina physiq.schemas = staging (recebi %)',
      coalesce(nullif(btrim(current_setting('physiq.schemas', true)), ''), '(vazio)');
  end if;
end
$$;

drop function if exists staging.physiq_pegada_em_producao(uuid, uuid);
