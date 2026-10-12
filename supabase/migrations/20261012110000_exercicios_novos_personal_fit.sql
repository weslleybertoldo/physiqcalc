-- 3 exercícios GLOBAIS novos (professor_id vazio) no Banco do Treino: Supino Inclinado na Máquina, Supino em Pé na Polia e
-- Elevação Pélvica na Máquina — pedido do Weslley em 12/10/2026 para a migração de um personal ("você pode validar e adicionar
-- no Physiq"). O catálogo não tinha nenhum dos 3: de supino inclinado, só com Barra, com Halteres e no Smith; nenhum supino na
-- polia; de elevação pélvica, só a com Barra e a Ponte de Glúteo. Catálogo global: 144 → 147.
-- Nome e classificação escritos por nós no padrão do catálogo; nada copiado (texto, descrição, dica ou mídia) de app de
-- terceiros. Conferência na lista aberta free-exercise-db (domínio público; só músculo e equipamento):
-- Leverage_Incline_Chest_Press e Standing_Cable_Chest_Press (peito; ombro e tríceps); a máquina de elevação pélvica não tem
-- equivalente lá (o mais perto é Barbell_Hip_Thrust: glúteo; posterior de coxa).
--   Supino Inclinado na Máquina  máquina articulada de supino inclinado, sentado. Padrão do Supino Inclinado com Halteres e no
--                                Smith (c076b265, e56195a5): grupo Peitoral, peitoral superior, movimento supino_inclinado.
--   Supino em Pé na Polia        em pé no cross-over, as 2 polias na altura do peito, empurrando à frente. Movimento supino_reto
--                                ("Supino reto e flexão" em src/treino/equivalencia.ts), subgrupo do Supino Reto com Barra
--                                (23d01e92) + o core que estabiliza em pé (como na Flexão de Braço, 0fab29a1).
--   Elevação Pélvica na Máquina  a máquina própria de elevação pélvica. Padrão da Elevação Pélvica com Barra (8fa6d8ea) e da
--                                Ponte de Glúteo (2a25c2f4): grupo Glúteo, movimento elevacao_pelvica.
-- SEM GIF: imagem_url nula (o app mostra o ícone, como nos 61 de 20261004000000); o 3D entra depois num lote dos exercícios 3D.
-- Sem dica; o emoji fica o padrão da coluna. Movimento e equipamento só das listas fixas de src/treino/equivalencia.ts.
-- id fixo = uuid5(NAMESPACE_URL, 'https://physiqcalc.com.br/exercicios/<slug>'), com os slugs supino-inclinado-na-maquina,
-- supino-em-pe-na-polia e elevacao-pelvica-na-maquina.
-- Mesmo jeito (ids e INSERT) da 20261005190000_exercicio_triceps_testa_na_polia_alta_em_pe.sql. Idempotente: id ou nome global
-- que já existe (sem diferença de maiúsculas) não entra de novo. Só INSERT; nenhuma outra linha muda.
-- Aplicar por schema, staging antes; o public (produção) com backup da tb_exercicios antes (o aplicar.py grava o backup em
-- ~/backups/physiq/2026-10-12-exercicios-pf/<schema>/ e só então roda ESTE arquivo com a lista trocada pelo schema pedido):
--   python3 e2e/exercicios_pf/aplicar.py --schema staging --dry-run  →  aplicar.py --schema staging
--   →  python3 e2e/exercicios_pf/sql_exercicios_pf.py --schema staging   (idem com --schema public, na produção)
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
          ('9259bcc4-a00e-54ee-a6a4-5a15221bd9b4', 'Supino Inclinado na Máquina', 'Peitoral', 'Peitoral superior (porção clavicular) · deltoide anterior · tríceps', 'musculacao', 'supino_inclinado', 'maquina', 'articulada, sentado'),
          ('3e957b18-cffb-5cbe-9ed7-5193d7af5993', 'Supino em Pé na Polia', 'Peitoral', 'Peitoral médio (esternal) · tríceps · deltoide anterior · core (estabilização)', 'musculacao', 'supino_reto', 'polia', 'em pé, polias na altura do peito'),
          ('d7e76127-ac81-5442-8e15-6e808064c7e7', 'Elevação Pélvica na Máquina', 'Glúteo', 'Glúteo máximo · isquiotibiais', 'musculacao', 'elevacao_pelvica', 'maquina', 'costas no encosto, apoio no quadril')
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
  END LOOP;
END
$mig$;
