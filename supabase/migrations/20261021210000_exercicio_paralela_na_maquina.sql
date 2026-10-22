-- 1 exercício GLOBAL novo (professor_id vazio) no Banco do Treino: Paralela na Máquina (Mergulho) — pedido do Weslley em
-- 21/10/2026, com o nome escolhido por ele. O catálogo não tinha mergulho na máquina: só o Mergulho nas Paralelas (4e5b8db8) e o
-- Mergulho no Banco (e3f6467b), os dois com o peso do corpo. Catálogo global: 156 → 157.
-- Classificação escrita por nós no padrão do catálogo; nada copiado (texto, descrição, dica ou mídia) de app ou site de
-- terceiros. Conferência na lista aberta free-exercise-db (domínio público; só músculo e equipamento): Dip_Machine (tríceps;
-- peito e ombro; máquina).
--   Paralela na Máquina (Mergulho)  sentado na máquina de mergulho, um pegador de cada lado do corpo, empurrando pra baixo até
--                                   esticar os cotovelos. Padrão do Mergulho no Banco (e3f6467b): grupo Tríceps, subgrupo
--                                   "Tríceps · deltoide anterior · peitoral inferior", movimento mergulho.
-- COM 3D: o movimento e a foto entram no app pelo manifesto (src/lib/exercicios3dManifest.json, chave = o id) no MESMO PR, e a
-- imagem_url fica nula (o app mostra a foto do 3D; ver fotoDoExercicio em src/lib/exercicios3d.ts). Sem dica; o emoji fica o
-- padrão da coluna. Movimento e equipamento só das listas fixas de src/treino/equivalencia.ts.
-- id fixo = uuid5(NAMESPACE_URL, 'https://physiqcalc.com.br/exercicios/paralela-na-maquina-mergulho').
-- Mesmo jeito (ids e INSERT) da 20261012110000_exercicios_novos_personal_fit.sql. Idempotente: id ou nome global que já existe
-- (sem diferença de maiúsculas) não entra de novo. Só INSERT; nenhuma outra linha muda.
-- Aplicar por schema, staging antes; o public (produção) SÓ DEPOIS do bundle com o 3D no ar (o exercício nunca aparece sem o 3D)
-- e com backup da tb_exercicios antes (o aplicar.py grava o backup em ~/backups/physiq/2026-10-21-exercicio-paralela/<schema>/ e
-- só então roda ESTE arquivo com a lista trocada pelo schema pedido):
--   python3 e2e/exercicio_paralela/aplicar.py --schema staging --dry-run  →  aplicar.py --schema staging
--   →  python3 e2e/exercicio_paralela/sql_exercicio_paralela.py --schema staging   (idem com --schema public, na produção)
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
          ('0e8c848c-96b3-5ad1-b266-7fe01ff398df', 'Paralela na Máquina (Mergulho)', 'Tríceps', 'Tríceps · deltoide anterior · peitoral inferior', 'musculacao', 'mergulho', 'maquina', 'sentado, pegadores dos lados do corpo')
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
  END LOOP;
END
$mig$;
