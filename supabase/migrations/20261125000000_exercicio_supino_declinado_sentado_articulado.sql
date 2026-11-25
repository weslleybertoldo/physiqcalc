-- 1 exercício GLOBAL novo (professor_id vazio) no Banco do Treino: Supino Declinado Sentado Articulado — pedido do Weslley em
-- 24/11/2026, com o nome e o 3D aprovados por ele. O catálogo só tinha o Supino Declinado na Máquina (fefee8d3), que é a máquina
-- de placas com o eixo no alto (tipo MTS), e o Supino Declinado com Barra (9f47cad3); faltava a máquina articulada anilhada, com
-- os 2 braços independentes, o encosto bem reclinado e o empurrão indo pro meio do peito. Catálogo global: 157 → 158.
-- Classificação escrita por nós no padrão do catálogo; nada copiado (texto, descrição, dica ou mídia) de app ou site de
-- terceiros. Conferência na lista aberta free-exercise-db (domínio público; só músculo e equipamento):
-- Leverage_Decline_Chest_Press (peito; ombro e tríceps; máquina).
--   Supino Declinado Sentado Articulado  sentado na máquina articulada de supino declinado, as costas no encosto reclinado,
--                                        empurrando os 2 pegadores pra frente e pro meio até quase esticar os cotovelos.
--                                        Padrão do Supino Declinado na Máquina (fefee8d3): grupo Peitoral, subgrupo "Peitoral
--                                        inferior (fibras esternais/costais) · tríceps", movimento supino_declinado,
--                                        equipamento maquina; muda só a variação.
-- COM 3D: o movimento e a foto entram no app pelo manifesto (src/lib/exercicios3dManifest.json, chave = o id) no MESMO PR, e a
-- imagem_url fica nula (o app mostra a foto do 3D; ver fotoDoExercicio em src/lib/exercicios3d.ts). A ficha 3D
-- (scripts/exercicios3d/fichas/ca204b6d-66c3-59ea-be79-0ee17d247841.json) tem a mesma classificação e as fontes. Sem dica; o
-- emoji fica o padrão da coluna. Movimento e equipamento só das listas fixas de src/treino/equivalencia.ts.
-- id fixo = uuid5(NAMESPACE_URL, 'https://physiqcalc.com.br/exercicios/supino-declinado-sentado-articulado').
-- Mesmo jeito (ids e INSERT) da 20261021210000_exercicio_paralela_na_maquina.sql. Idempotente: id ou nome global que já existe
-- (sem diferença de maiúsculas) não entra de novo. Só INSERT; nenhuma outra linha muda.
-- Aplicar por schema, staging antes; o public (produção) SÓ DEPOIS do bundle com o 3D no ar (o exercício nunca aparece sem o 3D)
-- e com backup da tb_exercicios antes (o aplicar.py grava o backup em
-- ~/backups/physiq/2026-11-25-exercicio-declinado-articulado/<schema>/ e só então roda ESTE arquivo com a lista trocada pelo
-- schema pedido):
--   python3 e2e/exercicio_declinado_articulado/aplicar.py --schema staging --dry-run  →  aplicar.py --schema staging
--   →  python3 e2e/exercicio_declinado_articulado/sql_exercicio_declinado_articulado.py --schema staging
--   (idem com --schema public, na produção)
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
          ('ca204b6d-66c3-59ea-be79-0ee17d247841', 'Supino Declinado Sentado Articulado', 'Peitoral', 'Peitoral inferior (fibras esternais/costais) · tríceps', 'musculacao', 'supino_declinado', 'maquina', 'sentado, articulado')
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
  END LOOP;
END
$mig$;
