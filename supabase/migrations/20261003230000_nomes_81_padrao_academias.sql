-- Nomes dos exercícios GLOBAIS (professor_id vazio) do Banco do Treino no padrão das academias: 32 dos 81 mudam.
-- Gerada por scripts/conteudo/nomes_81.py a partir de docs/exercicios-equivalencia.csv (não editar à mão).
-- Muda SÓ o nome; id, grupo, subgrupo, imagem, dica, tipo e a classificação da W9 ficam. Os GIFs seguem com o título antigo.
-- Idempotente: a linha que já tem o nome novo não é tocada (rodar de novo não reenvia nada pelo PowerSync).
-- Aplicar por schema com backup e contagens: python3 scripts/conteudo/nomes_81.py aplicar --schema <staging|public>.
DO $mig$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public','staging'] LOOP
    EXECUTE format($q$
      UPDATE %I.tb_exercicios AS e
         SET nome = v.nome
        FROM (VALUES
          ('6e06bce6-1909-4f5d-902b-ea3c80695aec', 'Cadeira Abdutora'),
          ('a7f62fd1-842d-4ae0-83ee-c62e902efb7b', 'Cadeira Adutora'),
          ('17e52ced-abc2-41a1-8776-c6162309e306', 'Abdominal na Máquina'),
          ('59c92f5d-312e-422c-b9fb-e6e60ef05997', 'Abdominal Oblíquo com Pés no Banco'),
          ('821c3148-1817-40a2-9598-86388a81f577', 'Abdominal Supra'),
          ('0eed6ebd-c8bf-4e47-b1af-d59d52f8eaf9', 'Rosca Alternada Inclinada com Halteres'),
          ('61bcf40c-6a82-423b-99e5-0adc11190b67', 'Rosca Concentrada com Halter'),
          ('9ff64ebf-6c63-4151-a8f7-0b2380a094cf', 'Rosca Scott na Máquina'),
          ('c2c93530-bb75-4501-b827-b70e387e8912', 'Rosca Punho com Halter'),
          ('4a151e92-a1f1-473d-a6df-51235d68d77c', 'Corrida na Esteira'),
          ('d15af9c4-3439-462f-a95b-4139e6627a82', 'Puxada Frontal'),
          ('a4e3d8c8-48be-4446-b9c8-c78ba0a74fa6', 'Puxada Frontal Aberta'),
          ('1ad63bb7-2a99-40a0-a5e4-78b2749d780e', 'Puxada Frontal Fechada'),
          ('ca81c43e-1360-44a6-a8d4-784ed0dd6fa0', 'Puxada Frontal Supinada'),
          ('e9241c10-9aaf-4ea5-badf-2b42ad3e4ffc', 'Crucifixo Invertido na Máquina'),
          ('6f78e74c-c4db-400e-8e26-47d06638a770', 'Crucifixo Invertido com Halteres'),
          ('232c2ac4-7fd8-4145-8dba-76cf121dcb87', 'Remada Unilateral com Halter (Serrote)'),
          ('59b8f69d-3b31-45e2-ae12-f12369b45dfb', 'Remada Baixa na Polia'),
          ('5be8bb3e-992c-47be-adc2-cee8328cb48f', 'Coice de Glúteo na Polia'),
          ('8fa6d8ea-d37a-492a-82fc-30da35333b15', 'Elevação Pélvica com Barra'),
          ('ebaa51d6-b407-40ad-9909-ee07cfb85448', 'Mesa Flexora'),
          ('3e848d7d-77d6-47b3-a200-9d49d4e271b0', 'Cadeira Flexora'),
          ('919d1ad4-42d6-4407-89b9-2f7007a3e1ba', 'Panturrilha Sentado na Máquina'),
          ('f09b4daa-fcfd-4baa-9696-0d9571457ee9', 'Supino Inclinado com Barra'),
          ('f06e45bc-a6c7-4939-92d1-3d6fafa4a534', 'Agachamento Livre com Barra'),
          ('e55a6426-e367-40e1-a127-3c3dc30090ec', 'Cadeira Extensora'),
          ('cbf903f0-b43d-4ee7-8be1-f2eee6eb71a2', 'Agachamento Búlgaro com Halteres'),
          ('5143c9ed-f192-4a84-a2b0-9ce146ac8d9c', 'Agachamento Sumô com Halteres'),
          ('d06298a4-bcc3-43f3-a681-765b58315ea4', 'Agachamento no Smith'),
          ('3274a384-ff2e-4ebf-8350-aea78367ee71', 'Leg Press 45°'),
          ('4e5b8db8-6778-47a1-a15a-3e94e8a21713', 'Mergulho nas Paralelas'),
          ('c7016a9d-1af3-4238-929f-adae75005ce6', 'Tríceps Testa com Barra')
        ) AS v(id, nome)
       WHERE e.id = v.id::uuid
         AND e.professor_id IS NULL
         AND e.nome IS DISTINCT FROM v.nome
    $q$, s);
  END LOOP;
END
$mig$;
