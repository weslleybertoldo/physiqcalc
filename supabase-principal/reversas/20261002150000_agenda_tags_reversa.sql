-- Physiq W2 — REVERSA de supabase-principal/migrations/20261002150000_agenda_tags.sql (só se a W2 quebrar produção).
-- Tira as tags da agenda e volta o banco ao desenho da W20/H5: o modulo de cada consulta já é a área (nunca deixou de ser), então
-- nenhuma consulta muda de área, horário, status, aluno ou calendário. Perde-se só o que é da W2: as tags criadas, a tag de cada
-- consulta e a tag padrão dos calendários. O ajuste dos calendários do Weslley (renomear + calendário Nutrição) NÃO volta aqui:
-- é o --desfazer do scripts/agenda_tags/ajuste_weslley.py (pelo backup).
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: agenda_tags, calendarios, agendamentos):
--   python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261002150000_agenda_tags_reversa.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/reversas/20261002150000_agenda_tags_reversa.sql --so public
-- Depois: reverter o PR da W2 (o painel novo lê agenda_tags; sem a tabela ele mostra a área pelo modulo, mas o certo é voltar junto).

drop trigger if exists trg_agendamentos_w2_tag on {schema}.agendamentos;
drop trigger if exists trg_calendarios_w2_tag on {schema}.calendarios;
drop function if exists {schema}.agendamentos_w2_tag();
drop function if exists {schema}.calendarios_w2_tag();
drop function if exists {schema}.agenda_garantir_tags();
drop index if exists {schema}.agendamentos_tag_idx;
alter table {schema}.agendamentos drop column if exists tag_id;
alter table {schema}.calendarios drop column if exists tag_padrao_id;
drop table if exists {schema}.agenda_tags;
drop function if exists {schema}.agenda_tags_w2_antes();
drop function if exists {schema}.agenda_tags_w2_depois();
drop function if exists {schema}.agenda_tag_base(uuid, text);
drop function if exists {schema}.agenda_garantir_bases(uuid);
drop function if exists {schema}.agenda_sou_profissional();

notify pgrst, 'reload schema';
