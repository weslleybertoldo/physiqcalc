-- PhysiqNutri — W4 Histórico de consultas. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260919030000_consultas.sql`
-- (roda em public E staging, trocando {schema}). Depende da base (eh_master, set_updated_at) e de pacientes (W1).

-- Registro de consulta (referência: "novo registro de consulta" = data/hora + observação; lista "Consulta registrada
-- em <data> · Ver observação | Excluir"). `origem` diz de onde veio o registro: 'manual' (esta seção), 'agenda'
-- (quando a agenda passar a registrar sozinha) ou 'importacao'. Exclusão é SOFT (deleted_at → Lixeira, W32).
create table if not exists {schema}.consultas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  data timestamptz not null default now(),
  observacao text,
  origem text not null default 'manual' check (origem in ('manual', 'agenda', 'importacao')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                        -- lixeira (W32)
);
create index if not exists consultas_nutri_paciente_data_idx on {schema}.consultas (nutricionista_id, paciente_id, data desc);
create index if not exists consultas_paciente_idx on {schema}.consultas (paciente_id);
grant all on {schema}.consultas to anon, authenticated, service_role;
alter table {schema}.consultas enable row level security;

drop policy if exists "consultas: ler as proprias ou master" on {schema}.consultas;
create policy "consultas: ler as proprias ou master" on {schema}.consultas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "consultas: criar as proprias ou master" on {schema}.consultas;
create policy "consultas: criar as proprias ou master" on {schema}.consultas
  for insert to authenticated with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "consultas: editar as proprias ou master" on {schema}.consultas;
create policy "consultas: editar as proprias ou master" on {schema}.consultas
  for update to authenticated
  using (nutricionista_id = auth.uid() or {schema}.eh_master())
  with check (nutricionista_id = auth.uid() or {schema}.eh_master());
drop policy if exists "consultas: apagar as proprias ou master" on {schema}.consultas;
create policy "consultas: apagar as proprias ou master" on {schema}.consultas
  for delete to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());

drop trigger if exists trg_consultas_updated_at on {schema}.consultas;
create trigger trg_consultas_updated_at before update on {schema}.consultas
  for each row execute function {schema}.set_updated_at();

-- Registrar/alterar/excluir uma consulta "mexe" no paciente: a lista de pacientes ordena por modificação e o Perfil
-- mostra "modificado em" — igual à referência, onde o registro de consulta atualiza o paciente.
create or replace function {schema}.tocar_paciente_da_consulta() returns trigger
language plpgsql as $$
begin
  update {schema}.pacientes set updated_at = now() where id = new.paciente_id;
  return new;
end;
$$;
drop trigger if exists trg_consultas_toca_paciente on {schema}.consultas;
create trigger trg_consultas_toca_paciente after insert or update on {schema}.consultas
  for each row execute function {schema}.tocar_paciente_da_consulta();
