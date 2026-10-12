-- Categoria "Alongamento e mobilidade" no Banco do Treino: 9 exercícios GLOBAIS novos (professor_id vazio) em tb_exercicios e 2
-- linhas GLOBAIS novas em grupos_musculares ("Alongamento" e "Mobilidade") — pedido do Weslley em 12/10/2026: ele escolheu criar a
-- categoria "Alongamento e mobilidade" e adicionar os 9 exercícios de alongamento e mobilidade. O catálogo não tinha nenhum dos 9
-- (nem nome parecido; de "punho", só a Rosca Punho com Halter, outro exercício) nem os 2 grupos. Catálogo global: 147 → 156;
-- o botão "Grupos musculares": 23 → 25. No app, os 2 grupos caem no bloco novo `alongamento` (src/lib/gruposMusculares.ts), como
-- o Cardio: a barra "Alongamento" no volume, sem faixa; troca por equivalente só dentro do bloco (nada cai em Costas ou Pernas).
-- Nome, grupo, subgrupo e variação escritos por nós; nada copiado (nome, texto, descrição, dica ou mídia) de app de terceiros.
-- SEM GIF: imagem_url nula (o app mostra o ícone, como nos 61 de 20261004000000 e nos 3 de 20261012110000); a mídia entra depois.
-- Sem dica; o emoji fica o padrão da coluna. Prescrição igual à da Prancha: tipo 'musculacao' (séries × "reps" em segundos, ex.:
-- 3 × 30) — o CHECK tb_exercicios_tipo_check ('musculacao','corrida') fica como está (sem DDL). Equipamento 'peso_corporal' nos 9
-- (o bastão da mobilidade de ombro vai na variação). Movimento: os 6 novos do bloco `alongamento` de src/treino/equivalencia.ts.
--   #  exercício                            grupo        movimento         subgrupo
--   1  Alongamento Abraçando os Joelhos     Alongamento  along_coluna      eretores da espinha (lombar) · glúteo máximo
--   2  Alongamento de Extensão da Coluna    Alongamento  along_coluna      lombar (extensão) · reto abdominal · flexores do quadril
--   3  Alongamento de Posterior em Pé       Alongamento  along_posterior   isquiotibiais · gastrocnêmio
--   4  Alongamento de Punho (flexores)      Alongamento  along_punho       flexores do antebraço
--   5  Alongamento de Punho (extensores)    Alongamento  along_punho       extensores do antebraço
--   6  Mobilidade Cervical                  Mobilidade   along_pescoco     trapézio superior · elevador da escápula · esternocleidomastóideo
--   7  Mobilidade de Coluna Deitado         Mobilidade   along_coluna      lombar · eretores da espinha · oblíquos
--   8  Mobilidade de Ombro com Bastão       Mobilidade   along_ombro       deltoide · rotadores do ombro
--   9  Alongamento Borboleta                Alongamento  along_quadril     adutores (longo · curto · magno)
-- ids fixos: exercício = uuid5(NAMESPACE_URL, 'https://physiqcalc.com.br/exercicios/<slug>') (o mesmo jeito da 20261005190000 e
-- da 20261012110000), com os slugs alongamento-abracando-os-joelhos, alongamento-de-extensao-da-coluna,
-- alongamento-de-posterior-em-pe, alongamento-de-punho-flexores, alongamento-de-punho-extensores, mobilidade-cervical,
-- mobilidade-de-coluna-deitado, mobilidade-de-ombro-com-bastao e alongamento-borboleta; grupo = uuid5(NAMESPACE_URL,
-- 'https://physiqcalc.com.br/grupos-musculares/<slug>'), com os slugs alongamento e mobilidade.
-- Os 2 grupos no padrão das 23 linhas globais de hoje: só id e nome; professor_id e criado_por nulos; created_at = o padrão now().
-- Idempotente: em tb_exercicios, id ou nome GLOBAL igual (sem caixa) não entra de novo; em grupos_musculares, id ou o mesmo nome
-- (sem caixa) em QUALQUER linha — lá o nome é único na tabela inteira (UNIQUE (nome), linhas de profissional inclusive), e um
-- "Alongamento" de profissional faria o INSERT falhar. Só INSERT; nenhuma outra linha muda; sem DDL.
-- Aplicar por schema, staging antes; o public (produção) com backup antes (o aplicar.py grava o backup da tb_exercicios e da
-- grupos_musculares em ~/backups/physiq/2026-10-12-exercicios-alongamento/<schema>/ e só então roda ESTE arquivo com a lista
-- trocada pelo schema pedido):
--   python3 e2e/exercicios_alongamento/aplicar.py --schema staging --dry-run  →  aplicar.py --schema staging
--   →  python3 e2e/exercicios_alongamento/sql_exercicios_alongamento.py --schema staging   (idem com --schema public, na produção)
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    -- (a) os 9 exercícios globais
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
          ('8eb04184-87e2-5639-8446-03f8b7860f80', 'Alongamento Abraçando os Joelhos', 'Alongamento', 'Eretores da espinha (lombar) · glúteo máximo', 'musculacao', 'along_coluna', 'peso_corporal', 'deitado, joelhos ao peito'),
          ('c8266767-ad75-510a-b92e-23c82e026536', 'Alongamento de Extensão da Coluna', 'Alongamento', 'Lombar (extensão) · reto abdominal · flexores do quadril', 'musculacao', 'along_coluna', 'peso_corporal', 'deitado de bruços, apoio nas mãos'),
          ('6122eb99-fb03-5254-8823-05bef03bd1c6', 'Alongamento de Posterior em Pé', 'Alongamento', 'Isquiotibiais · gastrocnêmio', 'musculacao', 'along_posterior', 'peso_corporal', 'em pé, tronco à frente'),
          ('a489f80b-9a94-5646-81ae-9de100beef28', 'Alongamento de Punho (flexores)', 'Alongamento', 'Flexores do antebraço', 'musculacao', 'along_punho', 'peso_corporal', 'braço estendido, dedos para trás'),
          ('ef3cdd4d-88c2-586c-bd0b-f3a3a30f5522', 'Alongamento de Punho (extensores)', 'Alongamento', 'Extensores do antebraço', 'musculacao', 'along_punho', 'peso_corporal', 'braço estendido, mão para baixo'),
          ('cdbfa476-b311-5883-8a77-e1527bb4ff1a', 'Mobilidade Cervical', 'Mobilidade', 'Trapézio superior · elevador da escápula · esternocleidomastóideo', 'musculacao', 'along_pescoco', 'peso_corporal', 'sentado ou em pé'),
          ('839b864e-936e-5b1d-90ce-e86c59bf06bb', 'Mobilidade de Coluna Deitado', 'Mobilidade', 'Lombar · eretores da espinha · oblíquos', 'musculacao', 'along_coluna', 'peso_corporal', 'deitado, joelhos para os lados'),
          ('1e857840-e81a-579f-acb6-9df841c2c5b9', 'Mobilidade de Ombro com Bastão', 'Mobilidade', 'Deltoide · rotadores do ombro', 'musculacao', 'along_ombro', 'peso_corporal', 'em pé, bastão nas mãos'),
          ('1be8df4d-eba8-52bd-9a87-8d70a4baedbc', 'Alongamento Borboleta', 'Alongamento', 'Adutores (longo · curto · magno)', 'musculacao', 'along_quadril', 'peso_corporal', 'sentado, solas dos pés juntas')
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
    -- (b) os 2 grupos musculares globais
    EXECUTE format($q$
      INSERT INTO %1$I.grupos_musculares (id, nome)
      SELECT v.id::uuid, v.nome
        FROM (VALUES
          ('d5f36dfc-b6e1-551a-9ed1-1373852f8923', 'Alongamento'),
          ('32dc55a5-bc23-51b6-b1ab-3f8ccfb10591', 'Mobilidade')
        ) AS v(id, nome)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.grupos_musculares g
                          WHERE g.id = v.id::uuid OR lower(g.nome) = lower(v.nome))
    $q$, s);
  END LOOP;
END
$mig$;
