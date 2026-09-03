-- Índices das chaves estrangeiras que o advisor da Supabase apontou nas tabelas que crescem
-- (tb_treino_series ~1,3k linhas hoje; higiene pra quando crescer). Idempotente.
-- Aplicar em public E staging (no staging trocar o prefixo do schema).
create index if not exists idx_tb_treino_series_exercicio_id on public.tb_treino_series (exercicio_id);
create index if not exists idx_tb_treino_series_exercicio_usuario_id on public.tb_treino_series (exercicio_usuario_id);
create index if not exists idx_tb_semana_treinos_grupo_id on public.tb_semana_treinos (grupo_id);
create index if not exists idx_tb_treino_dia_override_grupo_id on public.tb_treino_dia_override (grupo_id);
