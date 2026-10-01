-- Physiq W20c — push no celular (FCM) no BANCO PRINCIPAL (staging e public). Idempotente; SÓ ACRESCENTA: 2 tabelas novas,
-- 2 funções do app, 1 gatilho em avisos (só depois do insert, assíncrono) e 1 tarefa de limpeza. Nenhuma política de hoje
-- muda e nenhum dado existente é alterado.
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: avisos):
--   staging:  python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001100000_w20c_push.sql --so staging
--   produção: python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261001100000_w20c_push.sql --so public
--   (--dry-run em qualquer um: roda dentro de BEGIN … ROLLBACK)
-- Depois, 1 vez: python3 e2e/w20c/vault_push.py (guarda o PUSH_SEGREDO no Vault, nome 'physiq_push_segredo') e
-- python3 e2e/w20c/segredos_push.py (FCM_SERVICE_ACCOUNT + PUSH_SEGREDO nas funções). Sem o segredo no Vault o gatilho não
-- chama nada — o sino, o e-mail e a notificação local seguem como antes.
--
-- Como funciona (pedido dele 01/10: "o profissional marca personal/nutricionista e chega notificação no celular do usuário"):
--   1. o APK grava o token do aparelho (push_registrar) depois do login e a cada abertura; ao sair, apaga (push_esquecer);
--   2. TODO aviso novo do sino (insert em avisos — consulta da W20 inclusive pelo site antigo, "Salvar e enviar" da W16/W17,
--      pagamento, avaliação…) de quem tem aparelho chama a função push-enviar pelo pg_net (o pedido sai depois do commit;
--      erro aqui nunca impede o aviso — e quem não tem aparelho nem gera pedido);
--   3. a push-enviar reserva o aviso em push_envios (1 push por aviso), manda pelo FCM HTTP v1 e apaga o token recusado.

-- ============================================================================================================
-- 1. Aparelhos (1 token por aparelho; o token é do APARELHO: quem entra nele passa a ser o dono do token)
-- ============================================================================================================
create table if not exists {schema}.push_aparelhos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  plataforma text not null default 'android' check (plataforma in ('android', 'ios')),
  versao_app text check (versao_app is null or char_length(versao_app) <= 32),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- o token: só os caracteres do FCM, de 20 a 4096 (o regex do Postgres não aceita repetição acima de 255 — o tamanho vai à parte)
alter table {schema}.push_aparelhos drop constraint if exists push_aparelhos_token_check;
alter table {schema}.push_aparelhos add constraint push_aparelhos_token_check
  check (char_length(token) between 20 and 4096 and token ~ '^[A-Za-z0-9_:.-]+$');
create index if not exists push_aparelhos_user_idx on {schema}.push_aparelhos (user_id, atualizado_em desc);
grant select, insert, update, delete on {schema}.push_aparelhos to authenticated;
grant all on {schema}.push_aparelhos to service_role;
alter table {schema}.push_aparelhos enable row level security;

-- cada um só vê e mexe nos seus
drop policy if exists "push_aparelhos: ler os proprios" on {schema}.push_aparelhos;
create policy "push_aparelhos: ler os proprios" on {schema}.push_aparelhos for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "push_aparelhos: criar os proprios" on {schema}.push_aparelhos;
create policy "push_aparelhos: criar os proprios" on {schema}.push_aparelhos for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists "push_aparelhos: editar os proprios" on {schema}.push_aparelhos;
create policy "push_aparelhos: editar os proprios" on {schema}.push_aparelhos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "push_aparelhos: apagar os proprios" on {schema}.push_aparelhos;
create policy "push_aparelhos: apagar os proprios" on {schema}.push_aparelhos for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================================================
-- 2. Registro dos envios (1 linha por aviso = a trava de "sem repetir"; só a função lê/grava)
-- ============================================================================================================
create table if not exists {schema}.push_envios (
  aviso_id uuid primary key references {schema}.avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  aparelhos smallint not null default 0,
  enviados smallint not null default 0,
  recusados smallint not null default 0,
  falhas smallint not null default 0,
  resultado jsonb,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists push_envios_criado_idx on {schema}.push_envios (criado_em);
revoke all on {schema}.push_envios from anon, authenticated;
grant all on {schema}.push_envios to service_role;
alter table {schema}.push_envios enable row level security;

-- ============================================================================================================
-- 3. O app: gravar e apagar o token deste aparelho (security definer: o token que já era de outra pessoa passa para quem entrou)
-- ============================================================================================================
create or replace function {schema}.push_registrar(p_token text, p_plataforma text default 'android', p_versao text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sem_login';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 4096 or p_token !~ '^[A-Za-z0-9_:.-]+$' then
    return jsonb_build_object('ok', false, 'erro', 'token_invalido');
  end if;
  insert into {schema}.push_aparelhos (user_id, token, plataforma, versao_app)
  values (v_uid, p_token, case when p_plataforma = 'ios' then 'ios' else 'android' end, left(nullif(btrim(coalesce(p_versao, '')), ''), 32))
  on conflict (token) do update
    set user_id = excluded.user_id, plataforma = excluded.plataforma, versao_app = excluded.versao_app, atualizado_em = now();
  -- no máximo 10 aparelhos por pessoa (os mais antigos saem)
  delete from {schema}.push_aparelhos a
   where a.user_id = v_uid
     and a.id not in (select x.id from {schema}.push_aparelhos x where x.user_id = v_uid order by x.atualizado_em desc limit 10);
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function {schema}.push_registrar(text, text, text) from public, anon;
grant execute on function {schema}.push_registrar(text, text, text) to authenticated, service_role;

create or replace function {schema}.push_esquecer(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    raise exception 'sem_login';
  end if;
  delete from {schema}.push_aparelhos where token = p_token and user_id = v_uid;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'apagados', v_n);
end;
$$;
revoke execute on function {schema}.push_esquecer(text) from public, anon;
grant execute on function {schema}.push_esquecer(text) to authenticated, service_role;

-- ============================================================================================================
-- 4. O gatilho: aviso novo de quem tem aparelho → push-enviar (pg_net, assíncrono, com o segredo do Vault)
-- ============================================================================================================
create or replace function {schema}.avisos_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_segredo text;
begin
  if not exists (select 1 from {schema}.push_aparelhos a where a.user_id = new.destino_user_id) then
    return null;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return null;
  end if;
  select s.decrypted_secret into v_segredo from vault.decrypted_secrets s where s.name = 'physiq_push_segredo' limit 1;
  if v_segredo is null or length(v_segredo) < 32 then
    return null;
  end if;
  perform net.http_post(
    url := 'https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/push-enviar',
    body := jsonb_build_object('aviso', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-segredo', v_segredo, 'x-schema', '{schema}'),
    timeout_milliseconds := 20000
  );
  return null;
exception when others then
  -- o aviso no sino nunca depende do push
  return null;
end;
$$;
revoke all on function {schema}.avisos_push() from public, anon, authenticated;

drop trigger if exists trg_avisos_push on {schema}.avisos;
create trigger trg_avisos_push after insert on {schema}.avisos
  for each row execute function {schema}.avisos_push();

-- ============================================================================================================
-- 5. Limpeza: o registro dos envios guarda 30 dias
-- ============================================================================================================
select cron.schedule('physiq-push-limpeza-{schema}', '50 3 * * *',
  $$delete from {schema}.push_envios where criado_em < now() - interval '30 days'$$);
