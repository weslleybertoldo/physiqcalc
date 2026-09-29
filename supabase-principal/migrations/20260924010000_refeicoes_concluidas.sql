-- PhysiqNutri — W58 ✅ das refeições do paciente. Idempotente.
-- Aplicar com `python3 scripts/apply_migration.py supabase/migrations/20260924010000_refeicoes_concluidas.sql`
-- (roda em public E staging, trocando {schema}; `--so staging` / `--so public` pra uma fase só). Sem bloco compartilhado.
-- Depende da base (eh_master), de pacientes (W1), do planejamento (W9: planos_alimentares, refeicoes, itens_refeicao) e da
-- área do paciente (W34: meu_paciente_id()).

-- Pedido do Weslley 24/09/2026: "quero um botão ao lado com um check ✅. Quando clicar ele marca como concluído. E acima uma barra
-- ... conforme for concluindo preenche ... só aparece um botão com ✅ as refeições que tiverem alimentos" + decisões dele: salvo no
-- banco; a barra enche por kcal; zera todo dia; tocar de novo desmarca; só no plano atual; a nutri ver fica pra depois.
-- 1 linha = a refeição X foi concluída pelo paciente no dia D (dia de São Paulo, o app manda). Desmarcar = apagar a linha.
-- O paciente NÃO grava direto na tabela: só pela RPC `paciente_marcar_refeicao` (security definer), que confere que a refeição
-- é de um plano vivo DELE e tem alimentos, e copia a nutricionista do paciente.
create table if not exists {schema}.refeicoes_concluidas (
  id uuid primary key default gen_random_uuid(),
  nutricionista_id uuid not null references auth.users(id) on delete cascade,   -- copiada do paciente pela RPC
  paciente_id uuid not null references {schema}.pacientes(id) on delete cascade,
  refeicao_id uuid not null references {schema}.refeicoes(id) on delete cascade,
  data date not null,                                                            -- o dia (São Paulo) da conclusão
  created_at timestamptz not null default now(),
  constraint refeicoes_concluidas_refeicao_dia_uq unique (refeicao_id, data)
);
create index if not exists refeicoes_concluidas_paciente_data_idx on {schema}.refeicoes_concluidas (paciente_id, data desc);
create index if not exists refeicoes_concluidas_nutri_idx on {schema}.refeicoes_concluidas (nutricionista_id);
grant all on {schema}.refeicoes_concluidas to anon, authenticated, service_role;
alter table {schema}.refeicoes_concluidas enable row level security;

drop policy if exists "paciente: ler as proprias refeicoes concluidas" on {schema}.refeicoes_concluidas;
create policy "paciente: ler as proprias refeicoes concluidas" on {schema}.refeicoes_concluidas
  for select to authenticated using (paciente_id = {schema}.meu_paciente_id());
-- a nutricionista lê as dos pacientes dela (a tela dela fica pra depois — decisão dele 24/09/2026)
drop policy if exists "refeicoes_concluidas: ler as proprias ou master" on {schema}.refeicoes_concluidas;
create policy "refeicoes_concluidas: ler as proprias ou master" on {schema}.refeicoes_concluidas
  for select to authenticated using (nutricionista_id = auth.uid() or {schema}.eh_master());
-- SEM policy de INSERT/UPDATE/DELETE: só a RPC grava.

-- RPC do paciente logado: marca (p_concluida = true) ou desmarca a refeição no dia. Devolve o estado final.
-- Erros (a tela traduz): sem_acesso (não é paciente, ou a refeição não é de um plano vivo dele), data_invalida (fora de hoje ±1
-- em São Paulo — folga do fuso/relógio do aparelho), sem_alimentos (refeição vazia não ganha ✅).
create or replace function {schema}.paciente_marcar_refeicao(p_refeicao_id uuid, p_data date, p_concluida boolean)
returns boolean
language plpgsql
security definer
set search_path = {schema}, public
as $$
declare
  v_paciente uuid := {schema}.meu_paciente_id();
  v_nutri uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_paciente is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if p_data is null or p_data < v_hoje - 1 or p_data > v_hoje + 1 then
    raise exception 'data_invalida' using errcode = '22023';
  end if;
  select pl.nutricionista_id into v_nutri
    from refeicoes r
    join planos_alimentares pl on pl.id = r.plano_id
   where r.id = p_refeicao_id and pl.paciente_id = v_paciente and pl.deleted_at is null;
  if v_nutri is null then
    raise exception 'sem_acesso' using errcode = '42501';
  end if;
  if coalesce(p_concluida, false) then
    if not exists (select 1 from itens_refeicao i where i.refeicao_id = p_refeicao_id) then
      raise exception 'sem_alimentos' using errcode = '22023';
    end if;
    insert into refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data)
    values (v_nutri, v_paciente, p_refeicao_id, p_data)
    on conflict (refeicao_id, data) do nothing;
    return true;
  end if;
  delete from refeicoes_concluidas where refeicao_id = p_refeicao_id and data = p_data and paciente_id = v_paciente;
  return false;
end;
$$;
revoke all on function {schema}.paciente_marcar_refeicao(uuid, date, boolean) from public;
revoke all on function {schema}.paciente_marcar_refeicao(uuid, date, boolean) from anon;
grant execute on function {schema}.paciente_marcar_refeicao(uuid, date, boolean) to authenticated;
