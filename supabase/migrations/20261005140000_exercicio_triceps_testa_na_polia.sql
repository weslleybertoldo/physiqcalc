-- 1 exercício GLOBAL novo (professor_id vazio) no Banco do Treino: Tríceps Testa na Polia — pedido do Weslley em 05/10/2026
-- ("criasse um novo exercício: Tríceps Testa na Polia"), que já entra com o 3D (lote 3 dos exercícios 3D; imagem_url nula,
-- a foto vem do manifesto 3D). Classificação no padrão do Tríceps Testa com Barra (c7016a9d): grupo Tríceps, subgrupo cabeça
-- longa e lateral, movimento triceps_frances ("Tríceps francês e testa" em src/treino/equivalencia.ts); equipamento polia.
-- id fixo = uuid5(NAMESPACE_URL, 'https://physiqcalc.com.br/exercicios/triceps-testa-na-polia').
-- Mesmo jeito da 20261004000000_exercicios_novos_61.sql. Idempotente: id ou nome global que já existe não entra de novo.
-- Aplicar por schema (staging antes, public no deploy de produção), com backup da tb_exercicios antes.
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
          ('4bacdb24-62da-5754-a4da-2e0047b13f94', 'Tríceps Testa na Polia', 'Tríceps', 'Tríceps (cabeça longa e lateral)', 'musculacao', 'triceps_frances', 'polia', 'deitado (testa), polia baixa')
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
  END LOOP;
END
$mig$;
