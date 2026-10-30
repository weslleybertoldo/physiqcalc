-- Physiq restaurar-login (30/10/2026) — "entrar já logado no celular novo": a chave de volta do Android (API Restore Credentials; a regra
-- "Zero-Tap Sign-In" da Google Play de abr/2027) no BANCO PRINCIPAL, staging + public. Idempotente e ADITIVA: 2 tabelas novas, 8 funções
-- novas, 1 linha nova no app_config (a trava) e 1 tarefa de limpeza no pg_cron. Nenhuma tabela, policy, função ou linha de hoje muda.
-- Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.6 o que o servidor confere, §4.8 o banco; D1 = opção A, D3, D7).
--
-- O que entra (por schema):
--   chaves_restauracao        a parte PÚBLICA de cada chave de volta (COSE), 1 por aparelho, até 10 ativas por pessoa. Só o servidor lê:
--                             RLS ligado SEM policy e sem acesso do app e do visitante (o app grava e apaga pelas RPCs abaixo).
--   restauracao_desafios      os desafios de uso único (32 bytes, 5 min): 'registrar' (de uma pessoa, com login) e 'entrar' (sem dono:
--                             o celular novo ainda não entrou). Gasto = apagado (delete … returning), vencido ou não.
--   restaurar_login_recusa(uuid)  a trava + o staging só com conta de TESTE, num lugar só (só as RPCs daqui chamam): null = pode; senão
--                             'desligado' (trava desligada, ou so_teste e a conta não é de teste) | 'conta_real_no_staging' | 'sem_login'.
--   RPCs da pessoa (a função chave-restauracao, jeito 2: "como a pessoa"; conferem auth.uid(); grant ao authenticated):
--     chave_restauracao_desafio()   o desafio 'registrar' (no máximo 5 vivos por pessoa) — respeita a trava;
--     chave_restauracao_gravar(…)   gasta o desafio DA PRÓPRIA pessoa e grava a chave (a conferência WebAuthn é da função), marca a
--                                   `substitui` (a chave antiga deste aparelho) e aplica o limite de 10 — respeita a trava;
--     chave_restauracao_apagar(p_credencial, p_todas)   o Sair (D3): todas (saiu_todos) ou a deste aparelho (saiu). NÃO olha a trava:
--                                   apagar vale sempre.
--     Chamar essas RPCs sem a função não dá a ninguém mais do que a própria pessoa já pode (criar uma chave para a PRÓPRIA conta; sem
--     atestação não há como provar que a chave nasceu no Android — o risco anotado no §10 do desenho).
--   RPCs SÓ do servidor (a função restaurar-login, com a chave de servidor; nem o app nem o visitante executam):
--     restauracao_desafio_entrar()  o desafio 'entrar' (teto de 1000 vivos no schema → muitas_tentativas) — respeita a trava;
--     restauracao_usar(p_desafio, p_credencial)  gasta o desafio 'entrar' e devolve dono, chave (hex), contador e algoritmo SÓ de chave
--                                   ativa — respeita a trava;
--     restauracao_concluir(p_credencial, p_contador)  grava o contador (só sobe), o usada_em e o usos da chave ainda ativa;
--     restauracao_limpar()          a limpeza (desafio vencido sai; chave apagada há mais de 90 dias sai; ativa sem uso há mais de 13 meses
--                                   vira 'vencida' — o app renova a sua a cada 6 meses).
--   app_config.restaurar_login  a trava (D7): {"ligado": true no staging / false no public, "so_teste": true}; publica = false (só o banco
--                             e a função leem). Ligar no public = SQL, com o OK do dono, depois da prova no aparelho.
--   physiq-restauracao-limpeza-{schema}  o job do pg_cron (de hora em hora, no minuto 33 — livre: os outros usam 0/10/…, 0/15/…, 7, 25 e
--                             41 e os diários das 3h).
--
-- A conferência do fim (desfaz tudo se algo sair diferente): RLS sem policy e sem acesso do app/visitante nas 2 tabelas; as 8 funções
-- SECURITY DEFINER com o search_path vazio; o EXECUTE das 3 da pessoa com o authenticated e das outras 5 só com o servidor; a trava com os 2
-- campos booleanos; o job.
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py: app_config):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261030010000_restaurar_login.sql --so staging --dry-run
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261030010000_restaurar_login.sql --so staging
--   (o public SÓ depois da prova no aparelho e com o OK do dono: o mesmo comando com --so public — a trava nasce DESLIGADA lá)
-- Testes: python3 e2e/restaurar_login/api.py (o staging inteiro: o SQL, as 2 funções e a sessão de verdade).
-- Reversa: supabase-principal/reversas/20261030010000_restaurar_login_reversa.sql (tira tudo; as chaves guardadas se perdem — sem elas o
-- celular novo cai na tela de entrar, como hoje).

select set_config('lock_timeout', '5s', true);

-- ============================================================================================================
-- 1. As tabelas
-- ============================================================================================================
create table if not exists {schema}.chaves_restauracao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credencial_id text not null unique,                 -- base64url do rawId (até 1023 bytes → 1364 caracteres)
  chave_publica bytea not null,                       -- COSE
  contador bigint not null default 0,
  algoritmo smallint not null,
  aaguid uuid,
  nuvem boolean,                                      -- o app criou com isCloudBackupEnabled = true?
  backup_elegivel boolean,                            -- a flag BE do registro
  backup_estado boolean,                              -- a flag BS do registro
  origem text not null,                               -- android:apk-key-hash:… (a do registro)
  aparelho text,                                      -- "marca modelo · Android N", opcional
  versao_app text,
  criada_em timestamptz not null default now(),
  usada_em timestamptz,
  usos integer not null default 0,
  apagada_em timestamptz,
  motivo_apagada text,
  -- o regex do Postgres não aceita repetição acima de 255: o tamanho vai à parte
  constraint chaves_restauracao_credencial_check check (char_length(credencial_id) between 16 and 1400 and credencial_id ~ '^[A-Za-z0-9_-]+$'),
  constraint chaves_restauracao_chave_check check (octet_length(chave_publica) between 16 and 2048),
  constraint chaves_restauracao_contador_check check (contador >= 0 and usos >= 0),
  constraint chaves_restauracao_algoritmo_check check (algoritmo in (-7, -257)),
  constraint chaves_restauracao_origem_check check (origem ~ '^android:apk-key-hash:[A-Za-z0-9_-]{43}$'),
  constraint chaves_restauracao_aparelho_check check (aparelho is null or char_length(aparelho) <= 80),
  constraint chaves_restauracao_versao_check check (versao_app is null or char_length(versao_app) <= 32),
  constraint chaves_restauracao_motivo_check
    check (motivo_apagada in ('saiu', 'saiu_todos', 'substituida', 'limite', 'vencida', 'sessao_derrubada')),
  constraint chaves_restauracao_apagada_check check ((apagada_em is null) = (motivo_apagada is null))
);
create index if not exists chaves_restauracao_user_idx on {schema}.chaves_restauracao (user_id);
revoke all on {schema}.chaves_restauracao from public, anon, authenticated;
grant all on {schema}.chaves_restauracao to service_role;
alter table {schema}.chaves_restauracao enable row level security;

create table if not exists {schema}.restauracao_desafios (
  desafio text primary key,                           -- base64url de 32 bytes aleatórios
  tipo text not null,
  user_id uuid references auth.users(id) on delete cascade,   -- só no 'registrar'
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  constraint restauracao_desafios_desafio_check check (desafio ~ '^[A-Za-z0-9_-]{43}$'),
  constraint restauracao_desafios_tipo_check check (tipo in ('registrar', 'entrar')),
  constraint restauracao_desafios_dono_check check ((tipo = 'registrar') = (user_id is not null))
);
create index if not exists restauracao_desafios_tipo_expira_idx on {schema}.restauracao_desafios (tipo, expira_em);
create index if not exists restauracao_desafios_user_idx on {schema}.restauracao_desafios (user_id) where user_id is not null;
revoke all on {schema}.restauracao_desafios from public, anon, authenticated;
grant all on {schema}.restauracao_desafios to service_role;
alter table {schema}.restauracao_desafios enable row level security;

-- ============================================================================================================
-- 2. A trava (app_config.restaurar_login) + o staging só com conta de TESTE, num lugar só
-- ============================================================================================================
-- null = pode; senão o código da recusa. Sem pessoa (p_user null: o desafio 'entrar', ninguém entrou ainda) só a trava conta. A trava só
-- liga com "ligado": true (qualquer outra coisa, ou a linha faltando, é desligado); o so_teste só deixa de valer com false explícito.
create or replace function {schema}.restaurar_login_recusa(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cfg jsonb;
  v_email text;
begin
  select a.valor into v_cfg from {schema}.app_config a where a.chave = 'restaurar_login' and not a.publica;
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or (v_cfg -> 'ligado') is distinct from 'true'::jsonb then
    return 'desligado';
  end if;
  if p_user is null then
    return null;
  end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if not found then
    return 'sem_login';
  end if;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_email) then
    return 'conta_real_no_staging';
  end if;
  if (v_cfg -> 'so_teste') is distinct from 'false'::jsonb and not {schema}.email_de_teste(v_email) then
    return 'desligado';
  end if;
  return null;
end;
$$;
revoke all on function {schema}.restaurar_login_recusa(uuid) from public, anon, authenticated;
grant execute on function {schema}.restaurar_login_recusa(uuid) to service_role;

-- ============================================================================================================
-- 3. As RPCs da pessoa (a função chave-restauracao, com o login dela — jeito 2)
-- ============================================================================================================
create or replace function {schema}.chave_restauracao_desafio() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_recusa text;
  v_desafio text;
begin
  if v_uid is null then
    raise exception 'sem_login';
  end if;
  v_recusa := {schema}.restaurar_login_recusa(v_uid);
  if v_recusa is not null then
    return jsonb_build_object('ok', false, 'erro', v_recusa);
  end if;
  -- no máximo 5 vivos por pessoa (com o novo): os vencidos e os mais antigos saem
  delete from {schema}.restauracao_desafios d
   where d.tipo = 'registrar' and d.user_id = v_uid
     and (d.expira_em <= now()
          or d.desafio in (select x.desafio from {schema}.restauracao_desafios x
                            where x.tipo = 'registrar' and x.user_id = v_uid
                            order by x.criado_em desc offset 4));
  v_desafio := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into {schema}.restauracao_desafios (desafio, tipo, user_id, expira_em)
  values (v_desafio, 'registrar', v_uid, now() + interval '5 minutes');
  return jsonb_build_object('ok', true, 'desafio', v_desafio);
end;
$$;
revoke all on function {schema}.chave_restauracao_desafio() from public, anon;
grant execute on function {schema}.chave_restauracao_desafio() to authenticated, service_role;

create or replace function {schema}.chave_restauracao_gravar(
  p_desafio text, p_credencial text, p_chave bytea, p_contador bigint, p_alg integer, p_origem text,
  p_aaguid uuid default null, p_nuvem boolean default null, p_be boolean default null, p_bs boolean default null,
  p_aparelho text default null, p_versao text default null, p_substitui text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_recusa text;
  v_expira timestamptz;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'sem_login';
  end if;
  v_recusa := {schema}.restaurar_login_recusa(v_uid);
  if v_recusa is not null then
    return jsonb_build_object('ok', false, 'erro', v_recusa);
  end if;
  -- o desafio DESTA pessoa, do tipo 'registrar': gasto aqui (uso único — o que veio sai, vencido ou não); o de outra pessoa fica
  delete from {schema}.restauracao_desafios d
   where d.desafio = p_desafio and d.tipo = 'registrar' and d.user_id = v_uid
  returning d.expira_em into v_expira;
  if v_expira is null or v_expira <= now() then
    return jsonb_build_object('ok', false, 'erro', 'desafio_invalido');
  end if;
  if p_credencial is null or char_length(p_credencial) not between 16 and 1400 or p_credencial !~ '^[A-Za-z0-9_-]+$'
     or p_chave is null or octet_length(p_chave) not between 16 and 2048
     or p_alg is null or p_alg not in (-7, -257)
     or p_contador is null or p_contador < 0
     or p_origem is null or p_origem !~ '^android:apk-key-hash:[A-Za-z0-9_-]{43}$'
     or (p_substitui is not null and (char_length(p_substitui) not between 16 and 1400 or p_substitui !~ '^[A-Za-z0-9_-]+$')) then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  insert into {schema}.chaves_restauracao (user_id, credencial_id, chave_publica, contador, algoritmo, aaguid, nuvem, backup_elegivel,
    backup_estado, origem, aparelho, versao_app)
  values (v_uid, p_credencial, p_chave, p_contador, p_alg, p_aaguid, p_nuvem, p_be, p_bs, p_origem,
    left(nullif(btrim(coalesce(p_aparelho, '')), ''), 80), left(nullif(btrim(coalesce(p_versao, '')), ''), 32))
  on conflict (credencial_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'erro', 'chave_repetida');
  end if;
  -- a chave antiga DESTE aparelho (a renovação de 6 meses, ou a volta depois de restaurar)
  if p_substitui is not null then
    update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'substituida'
     where c.credencial_id = p_substitui and c.user_id = v_uid and c.apagada_em is null and c.id <> v_id;
  end if;
  -- no máximo 10 ativas por pessoa (as mais antigas saem)
  update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'limite'
   where c.user_id = v_uid and c.apagada_em is null
     and c.id not in (select x.id from {schema}.chaves_restauracao x
                       where x.user_id = v_uid and x.apagada_em is null
                       order by x.criada_em desc, x.id desc limit 10);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function {schema}.chave_restauracao_gravar(text, text, bytea, bigint, integer, text, uuid, boolean, boolean, boolean, text, text, text)
  from public, anon;
grant execute on function {schema}.chave_restauracao_gravar(text, text, bytea, bigint, integer, text, uuid, boolean, boolean, boolean, text, text, text)
  to authenticated, service_role;

create or replace function {schema}.chave_restauracao_apagar(p_credencial text default null, p_todas boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'sem_login';
  end if;
  if coalesce(p_todas, false) then
    update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'saiu_todos'
     where c.user_id = v_uid and c.apagada_em is null;
    get diagnostics v_n = row_count;
    delete from {schema}.restauracao_desafios d where d.tipo = 'registrar' and d.user_id = v_uid;
  elsif p_credencial is not null and char_length(p_credencial) between 16 and 1400 then
    update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'saiu'
     where c.user_id = v_uid and c.credencial_id = p_credencial and c.apagada_em is null;
    get diagnostics v_n = row_count;
  else
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  return jsonb_build_object('ok', true, 'apagadas', v_n);
end;
$$;
revoke all on function {schema}.chave_restauracao_apagar(text, boolean) from public, anon;
grant execute on function {schema}.chave_restauracao_apagar(text, boolean) to authenticated, service_role;

-- ============================================================================================================
-- 4. As RPCs SÓ do servidor (a função restaurar-login — o celular novo ainda não tem login)
-- ============================================================================================================
create or replace function {schema}.restauracao_desafio_entrar() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_recusa text;
  v_desafio text;
begin
  v_recusa := {schema}.restaurar_login_recusa(null);
  if v_recusa is not null then
    return jsonb_build_object('ok', false, 'erro', v_recusa);
  end if;
  -- o pedido é público (sem login) e grava linha: teto de vivos no schema (a restauração só acontece na troca de celular)
  if (select count(*) from (select 1 from {schema}.restauracao_desafios d
                             where d.tipo = 'entrar' and d.expira_em > now() limit 1000) x) >= 1000 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  v_desafio := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  insert into {schema}.restauracao_desafios (desafio, tipo, user_id, expira_em)
  values (v_desafio, 'entrar', null, now() + interval '5 minutes');
  return jsonb_build_object('ok', true, 'desafio', v_desafio);
end;
$$;
revoke all on function {schema}.restauracao_desafio_entrar() from public, anon, authenticated;
grant execute on function {schema}.restauracao_desafio_entrar() to service_role;

create or replace function {schema}.restauracao_usar(p_desafio text, p_credencial text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_recusa text;
  v_expira timestamptz;
  v_c record;
begin
  v_recusa := {schema}.restaurar_login_recusa(null);
  if v_recusa is not null then
    return jsonb_build_object('ok', false, 'erro', v_recusa);
  end if;
  -- o desafio 'entrar' é gasto aqui (uso único), mesmo que a chave não sirva
  delete from {schema}.restauracao_desafios d
   where d.desafio = p_desafio and d.tipo = 'entrar'
  returning d.expira_em into v_expira;
  if v_expira is null or v_expira <= now() then
    return jsonb_build_object('ok', false, 'erro', 'desafio_invalido');
  end if;
  select c.user_id, c.chave_publica, c.contador, c.algoritmo into v_c
    from {schema}.chaves_restauracao c
   where c.credencial_id = p_credencial and c.apagada_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_c.user_id, 'chave', encode(v_c.chave_publica, 'hex'),
    'contador', v_c.contador, 'algoritmo', v_c.algoritmo);
end;
$$;
revoke all on function {schema}.restauracao_usar(text, text) from public, anon, authenticated;
grant execute on function {schema}.restauracao_usar(text, text) to service_role;

create or replace function {schema}.restauracao_concluir(p_credencial text, p_contador bigint) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  update {schema}.chaves_restauracao c
     set contador = greatest(c.contador, coalesce(p_contador, 0)), usada_em = now(), usos = c.usos + 1
   where c.credencial_id = p_credencial and c.apagada_em is null
  returning c.user_id into v_user;
  if v_user is null then
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_user);
end;
$$;
revoke all on function {schema}.restauracao_concluir(text, bigint) from public, anon, authenticated;
grant execute on function {schema}.restauracao_concluir(text, bigint) to service_role;

create or replace function {schema}.restauracao_limpar() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_desafios integer;
  v_removidas integer;
  v_vencidas integer;
begin
  delete from {schema}.restauracao_desafios d where d.expira_em <= now();
  get diagnostics v_desafios = row_count;
  delete from {schema}.chaves_restauracao c where c.apagada_em is not null and c.apagada_em < now() - interval '90 days';
  get diagnostics v_removidas = row_count;
  update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'vencida'
   where c.apagada_em is null and c.criada_em < now() - interval '13 months'
     and (c.usada_em is null or c.usada_em < now() - interval '13 months');
  get diagnostics v_vencidas = row_count;
  return jsonb_build_object('desafios', v_desafios, 'removidas', v_removidas, 'vencidas', v_vencidas);
end;
$$;
revoke all on function {schema}.restauracao_limpar() from public, anon, authenticated;
grant execute on function {schema}.restauracao_limpar() to service_role;

-- ============================================================================================================
-- 5. A trava (D7) e a limpeza de hora em hora
-- ============================================================================================================
-- aplicar de novo não pisa no que o dono ligou ou desligou
insert into {schema}.app_config (chave, valor, publica)
values ('restaurar_login', jsonb_build_object('ligado', '{schema}' = 'staging', 'so_teste', true), false)
on conflict (chave) do nothing;

-- o mesmo nome ATUALIZA o job
select cron.schedule('physiq-restauracao-limpeza-{schema}', '33 * * * *', $$select {schema}.restauracao_limpar()$$);

-- ============================================================================================================
-- 6. A conferência do fim (qualquer diferença desfaz a migração inteira)
-- ============================================================================================================
do $c$
declare
  v_t text;
  v_f text;
  v_cfg jsonb;
  v_da_pessoa text[] := array[
    '{schema}.chave_restauracao_desafio()',
    '{schema}.chave_restauracao_gravar(text, text, bytea, bigint, integer, text, uuid, boolean, boolean, boolean, text, text, text)',
    '{schema}.chave_restauracao_apagar(text, boolean)'];
  v_do_servidor text[] := array[
    '{schema}.restaurar_login_recusa(uuid)',
    '{schema}.restauracao_desafio_entrar()',
    '{schema}.restauracao_usar(text, text)',
    '{schema}.restauracao_concluir(text, bigint)',
    '{schema}.restauracao_limpar()'];
begin
  foreach v_t in array array['{schema}.chaves_restauracao', '{schema}.restauracao_desafios'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = v_t::regclass) then
      raise exception 'restaurar-login: % sem RLS', v_t;
    end if;
    if exists (select 1 from pg_policy pl where pl.polrelid = v_t::regclass) then
      raise exception 'restaurar-login: % com policy (é só do servidor)', v_t;
    end if;
    if has_table_privilege('anon', v_t, 'select, insert, update, delete')
       or has_table_privilege('authenticated', v_t, 'select, insert, update, delete') then
      raise exception 'restaurar-login: o app ou o visitante acessam %', v_t;
    end if;
  end loop;
  foreach v_f in array v_da_pessoa || v_do_servidor loop
    if not (select pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=""'] from pg_proc pr where pr.oid = v_f::regprocedure) then
      raise exception 'restaurar-login: % sem SECURITY DEFINER ou sem o search_path vazio', v_f;
    end if;
    if has_function_privilege('anon', v_f, 'execute') or not has_function_privilege('service_role', v_f, 'execute') then
      raise exception 'restaurar-login: o EXECUTE de % está errado (visitante pode, ou o servidor não)', v_f;
    end if;
  end loop;
  foreach v_f in array v_da_pessoa loop
    if not has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'restaurar-login: o app não executa %', v_f;
    end if;
  end loop;
  foreach v_f in array v_do_servidor loop
    if has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'restaurar-login: o app executa % (é só do servidor)', v_f;
    end if;
  end loop;
  select a.valor into v_cfg from {schema}.app_config a where a.chave = 'restaurar_login' and not a.publica;
  if v_cfg is null or jsonb_typeof(v_cfg -> 'ligado') is distinct from 'boolean' or jsonb_typeof(v_cfg -> 'so_teste') is distinct from 'boolean' then
    raise exception 'restaurar-login: a trava restaurar_login de {schema} não está lá (ou é pública, ou sem os 2 campos)';
  end if;
  if not exists (select 1 from cron.job j where j.jobname = 'physiq-restauracao-limpeza-{schema}' and j.schedule = '33 * * * *') then
    raise exception 'restaurar-login: o job physiq-restauracao-limpeza-{schema} não está no pg_cron';
  end if;
end $c$;

notify pgrst, 'reload schema';
