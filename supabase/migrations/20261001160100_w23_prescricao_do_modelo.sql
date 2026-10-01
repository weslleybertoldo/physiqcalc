-- Physiq W23 — Banco do Treino (public + staging). Idempotente. Aplicar UMA vez pela Management API (database/query).
-- Painel › Treinos › Meus treinos (padrão da tela 8): a PRESCRIÇÃO DO MODELO — séries, repetições, descanso e carga de cada
-- exercício do treino-modelo (os mesmos campos e os mesmos limites do NF1 da W15, que é a prescrição DE CADA ALUNO em
-- tb_series_padrao_usuario). Colunas novas, todas opcionais, em tb_grupos_exercicios: vazias = como hoje.
--
-- O app do aluno NÃO lê estas colunas (o PowerSync sincroniza tb_grupos_exercicios.* e o schema local ignora coluna que não
-- conhece): o aluno continua lendo só a prescrição dele. A função admin-semana-treinos copia o que o modelo tem para a prescrição
-- do aluno quando ele passa a receber o modelo (usarTreino) e quando o profissional manda "Aplicar a quem recebe"
-- (aplicarModelo) — e só onde o aluno ainda não tem nada (o que foi ajustado no perfil do aluno nunca é sobrescrito).
-- Nenhuma linha muda: as 4 colunas nascem vazias em todos os modelos.
DO $mig$
DECLARE
  sch text;
BEGIN
  FOREACH sch IN ARRAY ARRAY['public', 'staging'] LOOP
    EXECUTE format('alter table %I.tb_grupos_exercicios add column if not exists num_series integer', sch);
    EXECUTE format('alter table %I.tb_grupos_exercicios add column if not exists reps_alvo text', sch);
    EXECUTE format('alter table %I.tb_grupos_exercicios add column if not exists descanso_segundos integer', sch);
    EXECUTE format('alter table %I.tb_grupos_exercicios add column if not exists carga_sugerida_kg numeric', sch);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'tb_grupos_exercicios_prescricao_ck' AND conrelid = format('%I.tb_grupos_exercicios', sch)::regclass
    ) THEN
      -- os limites do setPrescricao (W15): séries 1–10, repetições "10" ou "8-12", descanso 5 s–15 min, carga 0,25–999,75 kg
      EXECUTE format($c$
        alter table %I.tb_grupos_exercicios add constraint tb_grupos_exercicios_prescricao_ck check (
          (num_series is null or num_series between 1 and 10)
          and (reps_alvo is null or reps_alvo ~ '^[0-9]{1,3}(-[0-9]{1,3})?$')
          and (descanso_segundos is null or descanso_segundos between 5 and 900)
          and (carga_sugerida_kg is null or (carga_sugerida_kg >= 0.25 and carga_sugerida_kg <= 999.75))
        )
      $c$, sch);
    END IF;
    EXECUTE format($c$comment on column %I.tb_grupos_exercicios.num_series is 'W23: séries sugeridas pelo modelo (copiadas ao aluno sem prescrição própria)'$c$, sch);
    EXECUTE format($c$comment on column %I.tb_grupos_exercicios.reps_alvo is 'W23: repetições sugeridas pelo modelo ("10" ou "8-12")'$c$, sch);
    EXECUTE format($c$comment on column %I.tb_grupos_exercicios.descanso_segundos is 'W23: descanso sugerido pelo modelo (segundos)'$c$, sch);
    EXECUTE format($c$comment on column %I.tb_grupos_exercicios.carga_sugerida_kg is 'W23: carga sugerida pelo modelo (kg)'$c$, sch);
  END LOOP;
END $mig$;

-- o PostgREST passa a enxergar as colunas novas na hora (sem esperar o recarregamento do cache)
NOTIFY pgrst, 'reload schema';
