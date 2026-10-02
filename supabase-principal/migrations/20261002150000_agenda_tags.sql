-- Physiq W2 (conta única + tags da agenda, desenho aprovado em 02/10/2026 §5) — o "Tipo" da consulta (Treino · Nutrição · Geral,
-- fixo) vira TAG editável por PROFISSIONAL (banco principal, staging e public). Idempotente; SÓ ACRESCENTA: 1 tabela nova
-- (agenda_tags), 2 colunas novas (agendamentos.tag_id, calendarios.tag_padrao_id), funções e gatilhos. Nenhuma política de
-- agendamentos/calendários muda. O backfill só preenche agendamentos.tag_id (nenhuma consulta muda de área, horário, status, aluno
-- ou calendário — nem o updated_at).
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: calendarios, agendamentos):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002150000_agenda_tags.sql --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002150000_agenda_tags.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261002150000_agenda_tags.sql --so public
-- Desfazer: supabase-principal/reversas/20261002150000_agenda_tags_reversa.sql (mesmo script, --so <schema>).
--
-- Decisões dele (spec §2): D3 "o Tipo vira Tag" — Treino, Nutrição e Geral prontas + as dele, com nome, cor e área; D4 o aluno NÃO
-- vê a tag (app, e-mail e avisos como hoje). Regras:
--   1. agenda_tags por profissional: nome 1–40 (sem repetir entre as vivas, sem diferenciar maiúscula), cor (#rrggbb, a paleta da
--      tela), área treino|nutricao|geral, base (as 3 prontas), ordem. RLS: o próprio faz tudo (sem DELETE: excluir = deleted_at); o
--      dono de conta onde ele é membro ativo LÊ (igual agenda_config: ler); o master tudo; o aluno NADA.
--   2. As 3 base (Treino violeta, Nutrição verde, Geral cinza): RPC agenda_garantir_tags() (idempotente) + o backfill. Base pode
--      renomear e mudar a cor; excluir, mudar a área ou deixar de ser base o banco recusa.
--   3. agendamentos.tag_id: o modulo CONTINUA e vira a área da tag (gatilho: trocou a tag → modulo := área; sem tag → a base da área
--      do modulo; app antigo que muda só o modulo → a base da área nova). Toda regra que lê modulo (app do aluno, pacote, e-mails,
--      avisos, "Consultas por semana", .ics) não muda. A tag nunca impede salvar a consulta.
--   4. Excluir tag (soft delete): as consultas dela (vivas e da lixeira) e os calendários que a tinham como padrão vão para a base da
--      MESMA área, na mesma transação. Tag que muda de área leva as consultas junto.
--   5. calendarios.tag_padrao_id (a tag sugerida no novo agendamento daquele calendário).
--   6. Backfill: todo profissional com calendário ou agendamento ganha as 3 base e tag_id pela área do modulo.
--   O aluno: aluno_compromissos, minha_agenda, minhas_regras_agenda, agenda_reservar_email (e-mail) e os avisos (sino/push) seguem
--   devolvendo os mesmos campos de hoje (nenhum traz a tag). A leitura direta das próprias consultas (política "paciente: ler os
--   proprios agendamentos") passa a trazer o tag_id — um uuid, sem o nome: agenda_tags não tem nada que o aluno leia.

-- ============================================================================================================
-- 1. agenda_tags
-- ============================================================================================================
create table if not exists {schema}.agenda_tags (
  id uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cor text not null default '#94a3b8',
  area text not null default 'geral',
  base boolean not null default false,
  ordem smallint not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint agenda_tags_nome check (char_length(nome) between 1 and 40 and nome = btrim(nome)),
  constraint agenda_tags_cor check (cor ~ '^#[0-9a-f]{6}$'),
  constraint agenda_tags_area check (area in ('treino', 'nutricao', 'geral')),
  constraint agenda_tags_base_viva check (not base or deleted_at is null)
);
create unique index if not exists agenda_tags_nome_uq on {schema}.agenda_tags (profissional_id, lower(nome)) where deleted_at is null;
create unique index if not exists agenda_tags_base_uq on {schema}.agenda_tags (profissional_id, area) where base;
-- os privilégios padrão do schema dão tudo ao anon/authenticated em tabela nova: aqui só ler, criar e editar (excluir = deleted_at)
revoke all on {schema}.agenda_tags from anon;
revoke delete, truncate, references, trigger on {schema}.agenda_tags from authenticated;
grant select, insert, update on {schema}.agenda_tags to authenticated;
grant all on {schema}.agenda_tags to service_role;
alter table {schema}.agenda_tags enable row level security;

-- quem chama é profissional (membro ativo de uma conta), o master ou já tem calendário — o aluno não cria tag
create or replace function {schema}.agenda_sou_profissional() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and ({schema}.eh_master()
          or exists (select 1 from {schema}.conta_membros m where m.user_id = auth.uid() and m.status = 'ativo')
          or exists (select 1 from {schema}.calendarios c where c.nutricionista_id = auth.uid()));
$$;
revoke all on function {schema}.agenda_sou_profissional() from public, anon;
grant execute on function {schema}.agenda_sou_profissional() to authenticated, service_role;

drop policy if exists "agenda_tags: ler" on {schema}.agenda_tags;
create policy "agenda_tags: ler" on {schema}.agenda_tags for select to authenticated
  using (profissional_id = (select auth.uid()) or {schema}.eh_master()
         or exists (select 1 from {schema}.conta_membros m
                     where m.user_id = agenda_tags.profissional_id and m.status = 'ativo' and {schema}.sou_dono(m.conta_id)));
drop policy if exists "agenda_tags: criar as proprias" on {schema}.agenda_tags;
create policy "agenda_tags: criar as proprias" on {schema}.agenda_tags for insert to authenticated
  with check (not base and ((profissional_id = (select auth.uid()) and {schema}.agenda_sou_profissional()) or {schema}.eh_master()));
drop policy if exists "agenda_tags: editar as proprias" on {schema}.agenda_tags;
create policy "agenda_tags: editar as proprias" on {schema}.agenda_tags for update to authenticated
  using (profissional_id = (select auth.uid()) or {schema}.eh_master())
  with check (profissional_id = (select auth.uid()) or {schema}.eh_master());

-- ============================================================================================================
-- 2. Colunas novas (nulas: o app antigo não manda nenhuma e o gatilho preenche)
-- ============================================================================================================
alter table {schema}.agendamentos add column if not exists tag_id uuid references {schema}.agenda_tags(id) on delete set null;
create index if not exists agendamentos_tag_idx on {schema}.agendamentos (tag_id) where tag_id is not null;
alter table {schema}.calendarios add column if not exists tag_padrao_id uuid references {schema}.agenda_tags(id) on delete set null;

-- ============================================================================================================
-- 3. Peças internas (sem EXECUTE para o app): as 3 base e a base de uma área
-- ============================================================================================================
-- Cria as base que faltam do profissional. Nunca falha por nome repetido (uma tag dele chamada "Treino" criada antes da base faz a
-- base nascer "Treino (base)"). Profissional que não existe (o login sendo apagado) → nada.
create or replace function {schema}.agenda_garantir_bases(p_prof uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_nome text;
begin
  if p_prof is null or not exists (select 1 from auth.users u where u.id = p_prof) then
    return;
  end if;
  for r in select * from (values ('Treino', '#a78bfa', 'treino', 1), ('Nutrição', '#34d399', 'nutricao', 2), ('Geral', '#94a3b8', 'geral', 3))
                         b(nome, cor, area, ordem) loop
    continue when exists (select 1 from {schema}.agenda_tags t where t.profissional_id = p_prof and t.base and t.area = r.area);
    v_nome := r.nome;
    if exists (select 1 from {schema}.agenda_tags t where t.profissional_id = p_prof and t.deleted_at is null and lower(t.nome) = lower(v_nome)) then
      v_nome := r.nome || ' (base)';
    end if;
    insert into {schema}.agenda_tags (profissional_id, nome, cor, area, base, ordem)
    values (p_prof, v_nome, r.cor, r.area, true, r.ordem)
    on conflict do nothing;
  end loop;
end;
$$;

-- A base da área do profissional (cria as 3 se faltar). null = o profissional não existe.
create or replace function {schema}.agenda_tag_base(p_prof uuid, p_area text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_area text := case when p_area in ('treino', 'nutricao', 'geral') then p_area else 'geral' end;
  v_id uuid;
begin
  if p_prof is null then
    return null;
  end if;
  select t.id into v_id from {schema}.agenda_tags t where t.profissional_id = p_prof and t.base and t.area = v_area;
  if v_id is null then
    perform {schema}.agenda_garantir_bases(p_prof);
    select t.id into v_id from {schema}.agenda_tags t where t.profissional_id = p_prof and t.base and t.area = v_area;
  end if;
  return v_id;
end;
$$;

revoke all on function {schema}.agenda_garantir_bases(uuid) from public, anon, authenticated;
revoke all on function {schema}.agenda_tag_base(uuid, text) from public, anon, authenticated;
grant execute on function {schema}.agenda_garantir_bases(uuid) to service_role;
grant execute on function {schema}.agenda_tag_base(uuid, text) to service_role;

-- ============================================================================================================
-- 4. Gatilhos de agenda_tags: nome/cor arrumados, a ordem, as travas da base e o que acontece ao excluir/mudar de área
-- ============================================================================================================
create or replace function {schema}.agenda_tags_w2_antes() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.nome := regexp_replace(btrim(coalesce(new.nome, '')), '\s+', ' ', 'g');
  new.cor := lower(btrim(coalesce(new.cor, '')));
  if tg_op = 'INSERT' then
    if coalesce(new.ordem, 0) = 0 then
      new.ordem := least(coalesce((select max(t.ordem) from {schema}.agenda_tags t where t.profissional_id = new.profissional_id), 3) + 1, 32000);
    end if;
    return new;
  end if;
  if new.profissional_id is distinct from old.profissional_id then
    raise exception 'tag_de_outro_profissional';
  end if;
  if new.base is distinct from old.base then
    raise exception 'tag_base_fixa';
  end if;
  if old.base and new.area is distinct from old.area then
    raise exception 'tag_base_area_fixa';
  end if;
  if old.base and new.deleted_at is not null then
    raise exception 'tag_base_nao_exclui';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_agenda_tags_w2_antes on {schema}.agenda_tags;
create trigger trg_agenda_tags_w2_antes before insert or update on {schema}.agenda_tags
  for each row execute function {schema}.agenda_tags_w2_antes();

-- Excluir (deleted_at): as consultas (vivas e da lixeira) e os calendários dela vão para a base da MESMA área do mesmo profissional.
-- Mudar a área de uma tag do profissional: as consultas dela acompanham (modulo = a área da tag).
create or replace function {schema}.agenda_tags_w2_depois() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_base uuid;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    v_base := {schema}.agenda_tag_base(new.profissional_id, new.area);
    update {schema}.agendamentos set tag_id = v_base where tag_id = new.id;
    update {schema}.calendarios set tag_padrao_id = v_base where tag_padrao_id = new.id;
  elsif new.deleted_at is null and new.area is distinct from old.area then
    update {schema}.agendamentos set modulo = new.area where tag_id = new.id and modulo is distinct from new.area;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_agenda_tags_w2_depois on {schema}.agenda_tags;
create trigger trg_agenda_tags_w2_depois after update of deleted_at, area on {schema}.agenda_tags
  for each row execute function {schema}.agenda_tags_w2_depois();

-- ============================================================================================================
-- 5. Gatilho de agendamentos: modulo = a área da tag (e a tag certa sempre do DONO da consulta)
-- ============================================================================================================
-- Roda como dono (lê a tag de qualquer um e cria as base): quem grava pode ser o profissional, o dono da conta, o master ou as
-- funções do aluno (aluno_agenda_marcar). Tag de outro profissional, apagada ou que não existe → a base da área do modulo do dono
-- da consulta. Qualquer erro aqui deixa a consulta sem tag (o painel mostra a área) — nunca impede salvar.
create or replace function {schema}.agendamentos_w2_tag() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tag {schema}.agenda_tags%rowtype;
  v_propria boolean;
  v_trocou boolean;
begin
  if new.tag_id is not null then
    select * into v_tag from {schema}.agenda_tags t where t.id = new.tag_id;
  end if;
  v_propria := v_tag.id is not null and v_tag.profissional_id = new.nutricionista_id and v_tag.deleted_at is null;
  if tg_op = 'INSERT' then
    v_trocou := new.tag_id is not null;
  else
    v_trocou := new.tag_id is not null and new.tag_id is distinct from old.tag_id;
  end if;
  if v_trocou then
    -- a tag escolhida manda: modulo = a área dela
    if v_propria then
      new.modulo := v_tag.area;
    else
      new.tag_id := {schema}.agenda_tag_base(new.nutricionista_id, new.modulo);
    end if;
    return new;
  end if;
  -- sem tag (app antigo, funções do aluno, a FK que zerou) ou o modulo/o dono mudou sem trocar a tag → a base da área do modulo
  if not v_propria or v_tag.area is distinct from new.modulo then
    new.tag_id := {schema}.agenda_tag_base(new.nutricionista_id, new.modulo);
  end if;
  return new;
exception when others then
  new.tag_id := null;
  return new;
end;
$$;
drop trigger if exists trg_agendamentos_w2_tag on {schema}.agendamentos;
create trigger trg_agendamentos_w2_tag before insert or update of tag_id, modulo, nutricionista_id on {schema}.agendamentos
  for each row execute function {schema}.agendamentos_w2_tag();

-- calendarios.tag_padrao_id: só uma tag viva do DONO do calendário (a de outro profissional → a base da área dela, se for dele;
-- senão nenhuma).
create or replace function {schema}.calendarios_w2_tag() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tag {schema}.agenda_tags%rowtype;
begin
  if new.tag_padrao_id is null then
    return new;
  end if;
  select * into v_tag from {schema}.agenda_tags t where t.id = new.tag_padrao_id;
  if v_tag.id is null or v_tag.profissional_id is distinct from new.nutricionista_id then
    new.tag_padrao_id := null;
  elsif v_tag.deleted_at is not null then
    new.tag_padrao_id := {schema}.agenda_tag_base(new.nutricionista_id, v_tag.area);
  end if;
  return new;
exception when others then
  new.tag_padrao_id := null;
  return new;
end;
$$;
drop trigger if exists trg_calendarios_w2_tag on {schema}.calendarios;
create trigger trg_calendarios_w2_tag before insert or update of tag_padrao_id, nutricionista_id on {schema}.calendarios
  for each row execute function {schema}.calendarios_w2_tag();

-- ============================================================================================================
-- 6. RPC do painel: as 3 base de quem chama (idempotente) e as tags vivas dele
-- ============================================================================================================
create or replace function {schema}.agenda_garantir_tags() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem_login';
  end if;
  -- só quem é profissional (membro ativo de uma conta), o master ou quem já tem calendário: o aluno não ganha tags
  if not {schema}.agenda_sou_profissional() then
    return jsonb_build_object('ok', false, 'erro', 'sem_acesso');
  end if;
  perform {schema}.agenda_garantir_bases(v_uid);
  return jsonb_build_object('ok', true, 'tags', coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'profissional_id', t.profissional_id, 'nome', t.nome, 'cor', t.cor, 'area', t.area,
                                        'base', t.base, 'ordem', t.ordem, 'created_at', t.created_at, 'deleted_at', t.deleted_at)
                     order by t.ordem, t.created_at)
      from {schema}.agenda_tags t where t.profissional_id = v_uid and t.deleted_at is null), '[]'::jsonb));
end;
$$;
revoke execute on function {schema}.agenda_garantir_tags() from public, anon;
grant execute on function {schema}.agenda_garantir_tags() to authenticated, service_role;

-- ============================================================================================================
-- 7. Backfill: as 3 base de quem tem calendário ou consulta (viva ou na lixeira) e o tag_id pela área do modulo
-- ============================================================================================================
insert into {schema}.agenda_tags (profissional_id, nome, cor, area, base, ordem)
select x.prof, b.nome, b.cor, b.area, true, b.ordem
  from (select c.nutricionista_id as prof from {schema}.calendarios c
        union
        select a.nutricionista_id from {schema}.agendamentos a) x
  join auth.users u on u.id = x.prof
  cross join (values ('Treino', '#a78bfa', 'treino', 1), ('Nutrição', '#34d399', 'nutricao', 2), ('Geral', '#94a3b8', 'geral', 3)) b(nome, cor, area, ordem)
 where not exists (select 1 from {schema}.agenda_tags t where t.profissional_id = x.prof and t.base and t.area = b.area)
on conflict do nothing;

-- o updated_at das consultas não muda (só ganham a tag da área que já tinham)
alter table {schema}.agendamentos disable trigger trg_agendamentos_updated_at;
update {schema}.agendamentos a set tag_id = t.id
  from {schema}.agenda_tags t
 where a.tag_id is null and t.profissional_id = a.nutricionista_id and t.base and t.area = a.modulo;
alter table {schema}.agendamentos enable trigger trg_agendamentos_updated_at;

notify pgrst, 'reload schema';
