-- 61 exercícios GLOBAIS novos (professor_id vazio) no Banco do Treino, SEM GIF (imagem_url nula) até os GIFs 3D.
-- Fonte: lista aberta free-exercise-db (domínio público; só nome/músculo/equipamento), nomes no padrão das academias.
-- Gerada por scripts/conteudo/novos_61.py a partir de scripts/conteudo/novos_61.json (não editar à mão).
-- Idempotente: id ou nome global que já existe não entra de novo.
-- Aplicar por schema com backup e contagens: python3 scripts/conteudo/novos_61.py aplicar --schema <staging|public>.
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      INSERT INTO %1$I.tb_exercicios (id, nome, grupo_muscular, subgrupo, tipo, padrao_movimento, equipamento, variacao)
      SELECT v.id::uuid, v.nome, v.grupo, v.subgrupo, v.tipo, v.padrao, v.equipamento, v.variacao
        FROM (VALUES
          ('c076b265-7431-5247-8032-74b603d7f112', 'Supino Inclinado com Halteres', 'Peitoral', 'Peitoral superior (porção clavicular) · deltoide anterior · tríceps', 'musculacao', 'supino_inclinado', 'halteres', 'banco inclinado'),
          ('9f47cad3-438d-58c5-89fd-a55c33c66d6e', 'Supino Declinado com Barra', 'Peitoral', 'Peitoral inferior (fibras esternais/costais) · tríceps', 'musculacao', 'supino_declinado', 'barra', 'banco declinado'),
          ('5058acbe-edab-53f9-ae81-d19e31a9130f', 'Supino Reto no Smith', 'Peitoral', 'Peitoral médio (esternal) · tríceps · deltoide anterior', 'musculacao', 'supino_reto', 'smith', null),
          ('e56195a5-8a1c-55a1-b034-87e9980129fa', 'Supino Inclinado no Smith', 'Peitoral', 'Peitoral superior (porção clavicular) · deltoide anterior · tríceps', 'musculacao', 'supino_inclinado', 'smith', 'banco inclinado'),
          ('df9a0732-03b5-5d64-b2fd-047ec172c4f2', 'Crucifixo Inclinado com Halteres', 'Peitoral', 'Peitoral superior (porção clavicular) — adução horizontal', 'musculacao', 'crucifixo', 'halteres', 'banco inclinado'),
          ('7acf1334-6259-51b4-b27f-ec435611e5c3', 'Cross-over na Polia Baixa', 'Peitoral', 'Peitoral superior (porção clavicular) · deltoide anterior', 'musculacao', 'crucifixo', 'polia', 'polia baixa, de baixo para cima'),
          ('35f3fb86-28f0-5a8f-a15a-9d24e1e2f22f', 'Supino Fechado com Barra', 'Peitoral', 'Peitoral médio · tríceps (ênfase) · deltoide anterior', 'musculacao', 'supino_reto', 'barra', 'pegada fechada'),
          ('5bc43163-854c-5450-a4c3-5cc06abda164', 'Barra Fixa Supinada', 'Dorsal / Bíceps', 'Latíssimo do dorso · bíceps braquial · redondo maior', 'musculacao', 'puxada_vertical', 'peso_corporal', 'pegada supinada'),
          ('844e40e6-2cb1-51fd-8423-54c54a25a308', 'Puxada com Triângulo', 'Dorsal / Bíceps', 'Latíssimo do dorso · bíceps · romboides', 'musculacao', 'puxada_vertical', 'polia', 'pegada neutra fechada (triângulo)'),
          ('ef103d6d-b2cf-58d1-b6c7-02bd9b38874b', 'Puxada Atrás da Nuca', 'Dorsal / Bíceps', 'Latíssimo do dorso · redondo maior · trapézio inferior', 'musculacao', 'puxada_vertical', 'polia', 'pegada aberta, atrás da nuca'),
          ('6e2c885a-7cf9-5493-844d-2a94fd615ec3', 'Pulldown com Corda na Polia', 'Dorsal / Rombóide', 'Latíssimo do dorso (isolado) · redondo maior', 'musculacao', 'pulldown', 'polia', 'braços estendidos, com corda'),
          ('5d427eec-e233-5360-90af-fb75b933c9eb', 'Remada Curvada com Halteres', 'Dorsal / Rombóide', 'Latíssimo do dorso · romboides · trapézio médio · bíceps', 'musculacao', 'remada', 'halteres', null),
          ('341e921c-1750-5787-8af7-2749ab922851', 'Remada Curvada Supinada com Barra', 'Dorsal / Rombóide', 'Latíssimo do dorso · romboides · bíceps · trapézio médio', 'musculacao', 'remada', 'barra', 'pegada supinada'),
          ('5e6e0041-7114-566d-81e1-ed8b9982c81a', 'Remada Cavalinho com Barra', 'Dorsal / Trapézio', 'Latíssimo · trapézio médio/inferior · romboides', 'musculacao', 'remada', 'barra', 'barra no canto (landmine)'),
          ('c641aa70-d871-5b01-9eec-dba2bf17addd', 'Remada Baixa Unilateral na Polia', 'Dorsal / Rombóide', 'Latíssimo do dorso · romboides · trapézio médio (unilateral)', 'musculacao', 'remada', 'polia', 'unilateral, sentado'),
          ('6bd27737-c782-5e16-8fdc-002e16c8d452', 'Remada Invertida', 'Dorsal / Rombóide', 'Latíssimo do dorso · romboides · trapézio médio · bíceps', 'musculacao', 'remada', 'peso_corporal', null),
          ('76ed4388-4038-5d93-916f-325ba6c2efcb', 'Desenvolvimento com Barra', 'Deltóide', 'Deltoide anterior/lateral · tríceps', 'musculacao', 'desenvolvimento', 'barra', null),
          ('4d4204b3-a0af-5261-b029-7c6a7709c898', 'Desenvolvimento no Smith', 'Deltóide', 'Deltoide anterior/lateral · tríceps', 'musculacao', 'desenvolvimento', 'smith', null),
          ('36428654-7208-557d-b2f6-de02c076bcaf', 'Remada Alta com Barra', 'Deltóide', 'Deltoide lateral · trapézio superior · bíceps', 'musculacao', 'remada_alta', 'barra', null),
          ('526bd9e5-b7c9-5ed9-aa4e-0c412a957501', 'Remada Alta na Polia', 'Deltóide', 'Deltoide lateral · trapézio superior · bíceps', 'musculacao', 'remada_alta', 'polia', null),
          ('0854f629-be62-5e62-a5d8-53f8c8156dba', 'Crucifixo Invertido na Polia', 'Deltóide Posterior', 'Deltoide posterior · trapézio médio · romboides', 'musculacao', 'crucifixo_invertido', 'polia', null),
          ('45a1889b-d526-5fa9-8ad7-2f59eb452dbf', 'Elevação Frontal com Anilha', 'Deltóide', 'Deltoide anterior', 'musculacao', 'elevacao_frontal', 'anilha', null),
          ('a29a88a7-58c9-5d41-b20b-f4325ef9fee5', 'Encolhimento com Barra', 'Trapézio', 'Trapézio superior · elevador da escápula', 'musculacao', 'encolhimento', 'barra', null),
          ('30282c7f-ddc2-51ff-b80e-b7b5d5a24906', 'Rosca Direta com Barra W', 'Bíceps', 'Bíceps braquial (cabeças curta e longa) · braquial', 'musculacao', 'rosca_direta', 'barra', null),
          ('40d820b6-af1c-53e7-a911-df2ab9ecd859', 'Rosca Direta com Halteres', 'Bíceps', 'Bíceps braquial (cabeças curta e longa)', 'musculacao', 'rosca_direta', 'halteres', null),
          ('9a5ca8f3-9318-5e7f-8802-629953d466e6', 'Rosca Alternada com Halteres', 'Bíceps', 'Bíceps braquial · braquial', 'musculacao', 'rosca_direta', 'halteres', 'alternada'),
          ('1ab3d474-1bba-58fa-8dba-c57d5c966e70', 'Rosca Scott com Barra', 'Bíceps', 'Bíceps braquial (cabeça curta) · braquial', 'musculacao', 'rosca_scott', 'barra', null),
          ('219faa59-9426-5ef1-bdd8-29eeb169307a', 'Rosca Direta na Polia', 'Bíceps', 'Bíceps braquial (tensão contínua) · braquial', 'musculacao', 'rosca_direta', 'polia', null),
          ('7053aa53-3d1c-523f-a954-2429e7ab92b2', 'Rosca Inversa com Barra', 'Bíceps / Braquial', 'Braquiorradial · braquial · extensores do antebraço', 'musculacao', 'rosca_direta', 'barra', 'pegada pronada'),
          ('48cc22e1-3771-5f5d-a014-7dd67ef0e214', 'Tríceps Testa com Halteres', 'Tríceps', 'Tríceps (cabeça longa e lateral)', 'musculacao', 'triceps_frances', 'halteres', null),
          ('8aee9a06-cd39-53ba-8005-9ce80810f26a', 'Tríceps Francês com Corda na Polia', 'Tríceps', 'Tríceps (cabeça longa)', 'musculacao', 'triceps_frances', 'polia', 'corda, acima da cabeça'),
          ('92d0f15f-e044-5e60-9cd2-ef7b5dfe7f25', 'Tríceps Pulley Pegada Supinada', 'Tríceps', 'Tríceps (cabeças medial e lateral)', 'musculacao', 'triceps_extensao', 'polia', 'pegada supinada'),
          ('2561eb1b-4e80-5ce6-804d-262aeeadcbc8', 'Tríceps Pulley Unilateral', 'Tríceps', 'Tríceps (cabeças lateral e medial)', 'musculacao', 'triceps_extensao', 'polia', 'unilateral'),
          ('e3f6467b-0c68-5db9-bbc1-f7ae9a73e407', 'Mergulho no Banco', 'Tríceps', 'Tríceps · deltoide anterior · peitoral inferior', 'musculacao', 'mergulho', 'peso_corporal', 'no banco'),
          ('5e5b515e-02d3-5102-865d-b14c026292e6', 'Agachamento Frontal com Barra', 'Quadríceps', 'Quadríceps · glúteo máximo · core (estabilização)', 'musculacao', 'agachamento', 'barra', 'frontal'),
          ('fa737f5d-42dc-59e9-96d6-fdd2c7417f50', 'Agachamento Goblet com Kettlebell', 'Quadríceps', 'Quadríceps · glúteo máximo · adutores', 'musculacao', 'agachamento', 'kettlebell', 'goblet'),
          ('2ba6fa20-612a-5271-9513-e04bcd7fcbca', 'Agachamento Sumô com Barra', 'Quadríceps / Glúteo', 'Adutores · glúteo máximo · quadríceps', 'musculacao', 'agachamento', 'barra', 'sumô, base aberta'),
          ('abff69f1-c111-5240-8169-e9a1aa84ac9a', 'Afundo com Barra', 'Quadríceps', 'Quadríceps · glúteo máximo · isquiotibiais', 'musculacao', 'afundo', 'barra', null),
          ('f9015660-324a-5a71-b905-8157ee6323ea', 'Afundo Reverso com Halteres', 'Quadríceps', 'Quadríceps · glúteo máximo · isquiotibiais', 'musculacao', 'afundo', 'halteres', 'passo para trás'),
          ('c7ea9f1a-a975-5bdd-948b-7600225337ce', 'Subida no Banco com Halteres', 'Quadríceps / Glúteo', 'Quadríceps · glúteo máximo (unilateral)', 'musculacao', 'afundo', 'halteres', 'subida no banco'),
          ('67b18e8f-4430-59f4-8f5f-ad0ea421291b', 'Stiff com Halteres', 'Posterior de Coxa', 'Isquiotibiais · glúteo máximo · eretores', 'musculacao', 'terra_stiff', 'halteres', 'pernas estendidas'),
          ('2cf80827-b005-5cab-ae11-b5c101db965d', 'Levantamento Terra Sumô com Barra', 'Posterior de Coxa', 'Glúteo máximo · adutores · quadríceps · isquiotibiais', 'musculacao', 'terra_stiff', 'barra', 'sumô'),
          ('c50963bf-1d9d-5b0c-a888-929c7c942a23', 'Bom Dia com Barra', 'Posterior de Coxa', 'Isquiotibiais · eretores da espinha · glúteo máximo', 'musculacao', 'terra_stiff', 'barra', 'bom dia'),
          ('2a25c2f4-8f3c-541c-b050-e27c2ff5867f', 'Ponte de Glúteo', 'Glúteo', 'Glúteo máximo · isquiotibiais', 'musculacao', 'elevacao_pelvica', 'peso_corporal', null),
          ('266a02f8-732b-5d84-b48d-00ecc70f5f4c', 'Coice em Quatro Apoios', 'Glúteo', 'Glúteo máximo (extensão de quadril)', 'musculacao', 'coice_gluteo', 'peso_corporal', 'quatro apoios'),
          ('692a0652-3794-52ff-91a1-63fc09a7f812', 'Adução de Quadril na Polia', 'Adutores da Coxa', 'Adutores (longo · curto · magno)', 'musculacao', 'aducao_quadril', 'polia', 'em pé'),
          ('74449d5c-499a-57d2-b549-cbb036eb0d18', 'Panturrilha em Pé no Smith', 'Panturrilha', 'Gastrocnêmio · sóleo', 'musculacao', 'panturrilha', 'smith', 'em pé'),
          ('07812448-69dc-5c20-8ea0-cc903a1250e1', 'Panturrilha no Leg Press', 'Panturrilha', 'Gastrocnêmio · sóleo', 'musculacao', 'panturrilha', 'maquina', 'no leg press'),
          ('217d3ff2-62d0-5df4-90f8-600677209cf2', 'Prancha', 'Abdômen', 'Reto abdominal · transverso do abdômen · oblíquos (isometria)', 'musculacao', 'prancha', 'peso_corporal', null),
          ('88f946d5-46f3-5c84-8fdc-f114d9ed805a', 'Prancha Lateral', 'Abdômen', 'Oblíquos externo e interno · quadrado lombar · glúteo médio', 'musculacao', 'prancha', 'peso_corporal', 'lateral'),
          ('70598123-7ecf-58c6-ab09-12c0af22d049', 'Abdominal Infra', 'Abdômen', 'Reto abdominal (porção inferior) · flexores do quadril', 'musculacao', 'abdominal_infra', 'peso_corporal', null),
          ('04b721d3-3167-5508-97d8-975b8265217a', 'Elevação de Pernas Suspenso na Barra', 'Abdômen', 'Reto abdominal (porção inferior) · flexores do quadril · oblíquos', 'musculacao', 'abdominal_infra', 'peso_corporal', 'suspenso na barra'),
          ('f2c69ceb-6a00-5d3e-bc34-bf7375302b34', 'Abdominal na Polia', 'Abdômen', 'Reto abdominal · oblíquos', 'musculacao', 'abdominal_supra', 'polia', 'ajoelhado'),
          ('39a97320-2937-5686-9883-7ea42dbc0a89', 'Abdominal Russo', 'Abdômen', 'Oblíquos externo e interno · reto abdominal', 'musculacao', 'abdominal_obliquo', 'peso_corporal', null),
          ('adf24ec2-6761-583f-a13c-d974ba1b90a2', 'Abdominal Completo', 'Abdômen', 'Reto abdominal · flexores do quadril', 'musculacao', 'abdominal_supra', 'peso_corporal', null),
          ('32b7d001-7a57-5443-b6da-87ec6ac7c1ee', 'Escalador', 'Abdômen', 'Reto abdominal · flexores do quadril · ombros (estabilização)', 'musculacao', 'prancha', 'peso_corporal', 'escalador'),
          ('035b869a-e840-5177-b77a-d0f65e6f86de', 'Bicicleta Ergométrica', 'Cardio', 'Cardiorrespiratório · quadríceps · glúteo', 'corrida', 'cardio', 'cardio', null),
          ('db5c1cba-c1da-5b92-bf68-d75cf809ff03', 'Elíptico', 'Cardio', 'Cardiorrespiratório · membros inferiores e superiores', 'corrida', 'cardio', 'cardio', null),
          ('370976ee-861c-5af5-bf6b-82aa77afdaeb', 'Remo Ergômetro', 'Cardio', 'Cardiorrespiratório · costas · membros inferiores', 'corrida', 'cardio', 'cardio', null),
          ('a0657315-116b-5392-9192-910d18031b3f', 'Caminhada na Esteira', 'Cardio', 'Cardiorrespiratório · membros inferiores', 'corrida', 'cardio', 'cardio', 'na esteira'),
          ('44838472-dc0c-5658-8169-55ac4bb2c5b1', 'Simulador de Escada', 'Cardio', 'Cardiorrespiratório · glúteo · quadríceps', 'corrida', 'cardio', 'cardio', 'stepper (pedais)')
        ) AS v(id, nome, grupo, subgrupo, tipo, padrao, equipamento, variacao)
       WHERE NOT EXISTS (SELECT 1 FROM %1$I.tb_exercicios e
                          WHERE e.id = v.id::uuid OR (e.professor_id IS NULL AND lower(e.nome) = lower(v.nome)))
    $q$, s);
  END LOOP;
END
$mig$;
