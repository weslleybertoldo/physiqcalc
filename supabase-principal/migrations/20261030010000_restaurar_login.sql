-- Physiq restaurar-login (30/10/2026) — "entrar já logado no celular novo": a chave de volta do Android (API Restore Credentials; a regra
-- "Zero-Tap Sign-In" da Google Play de abr/2027) no BANCO PRINCIPAL, staging + public. Idempotente e ADITIVA: 2 tabelas novas, 8 funções
-- novas, 1 gatilho novo em auth.users (por schema), 1 linha nova no app_config (a trava) e 1 tarefa de limpeza no pg_cron. Nenhuma tabela,
-- policy, função ou linha de hoje muda. Desenho: physiqcalc-scratch/restaurar-login/desenho.md (§4.6, §4.8; D1 = opção A, D3, D7).
-- Endurecida pela revisão de segurança de 30/10 (physiqcalc-scratch/restaurar-login/revisao_seguranca.md, achados 1 a 9) ANTES de ir ao
-- public: a chave vive no máximo o que vive a sessão que a criou e morre na troca de senha e na exclusão da conta; o master não tem chave;
-- conta com 2 etapas só registra em aal2; o crescimento por pessoa tem teto; o desafio de entrar não grava nada (é assinado pela função) e
-- só é gasto depois da assinatura conferida; no máximo 3 entradas por chave por hora; a trava, o so_teste e o staging só teste conferidos
-- de novo no banco na entrada.
--
-- O que entra (por schema):
--   chaves_restauracao        a parte PÚBLICA de cada chave de volta (COSE), 1 por aparelho, até 10 ativas por pessoa, AMARRADA à sessão
--                             que a registrou (sessao_id = o session_id do JWT). Só o servidor lê: RLS ligado SEM policy e sem acesso do app
--                             e do visitante (o app grava e apaga pelas RPCs abaixo). Por pessoa: no máximo 20 apagadas guardadas e 20
--                             registros em 24 h.
--   restauracao_desafios      'registrar': o desafio de uma pessoa (com login; 32 bytes, 5 min, uso único, no máximo 5 vivos) · 'entrar':
--                             o desafio JÁ GASTO de uma entrada que deu certo (o desafio de entrar nasce assinado na função — sem estado; a
--                             chave primária impede repetir), com a chave usada — 1 h, para o limite de 3 entradas por chave por hora.
--   restaurar_login_recusa(uuid)  a trava + o staging só com conta de TESTE + o master, num lugar só (só as RPCs daqui chamam): null = pode;
--                             senão 'desligado' (trava desligada, ou so_teste e a conta não é de teste) | 'conta_real_no_staging' |
--                             'conta_master' | 'sem_login' (a pessoa não existe ou foi excluída).
--   RPCs da pessoa (a função chave-restauracao, jeito 2: "como a pessoa"; conferem auth.uid(); grant ao authenticated):
--     chave_restauracao_desafio()   o desafio 'registrar' — respeita a trava, recusa o master e a conta com 2 etapas fora do aal2;
--     chave_restauracao_gravar(…)   gasta o desafio DA PRÓPRIA pessoa e grava a chave com a sessão dela (a conferência WebAuthn é da função),
--                                   marca a `substitui` (a chave antiga deste aparelho), aplica o limite de 10 ativas, o teto de 20 em 24 h
--                                   e o de 20 apagadas guardadas — respeita a trava, o master e o aal2;
--     chave_restauracao_apagar(p_credencial, p_todas)   o Sair (D3): todas (saiu_todos) ou a deste aparelho (saiu). NÃO olha a trava.
--   RPCs SÓ do servidor (a função restaurar-login, com a chave de servidor; nem o app nem o visitante executam):
--     restauracao_chave(p_credencial)  a chave ATIVA (dona, chave em hex, contador) só se a sessão que a registrou ainda vale (auth.sessions,
--                                   not_after) e a dona existe e não foi excluída (deleted_at) — respeita a trava; devolve junto a recusa da
--                                   dona (so_teste, staging só teste, master), que a função aplica DEPOIS de conferir a assinatura;
--     restauracao_gastar(p_desafio, p_credencial, p_contador, p_expira)  depois da assinatura conferida: no máximo 3 entradas por chave por
--                                   hora (muitas_tentativas), gasta o desafio (a chave primária: uso único) e grava o contador (só sobe), o
--                                   usada_em e o usos — tudo com a chave travada (for update) e ainda ativa;
--     restauracao_limpar()          a limpeza (desafio de registrar vencido e o de entrar com mais de 1 h saem; chave apagada há mais de 90
--                                   dias sai; ativa criada há mais de 13 meses vira 'vencida' — o app renova a sua a cada 6 meses).
--   restauracao_auth_mudou()  + o gatilho physiq_restauracao_auth_{schema} em auth.users: a senha trocada (troca no app, "esqueci a senha",
--                             o P25, o reset pelo master) apaga as chaves da pessoa ('senha_trocada'); a conta excluída por soft delete
--                             (deleted_at) também ('conta_excluida'). O hard delete apaga pelo on delete cascade.
--   app_config.restaurar_login  a trava (D7): {"ligado": true no staging / false no public, "so_teste": true}; publica = false (só o banco
--                             e a função leem). Ligar no public = SQL, com o OK do dono, depois da prova no aparelho.
--   physiq-restauracao-limpeza-{schema}  o job do pg_cron (de hora em hora, no minuto 33).
--
-- A conferência do fim (desfaz tudo se algo sair diferente): RLS sem policy e sem acesso do app/visitante nas 2 tabelas; as 8 funções
-- SECURITY DEFINER com o search_path vazio; o EXECUTE das 3 da pessoa com o authenticated e das outras 4 (fora o gatilho) só com o servidor;
-- o gatilho em auth.users; a trava com os 2 campos booleanos; o job.
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
  credencial_id text not null unique,                 -- base64url do rawId (o Android manda 32 bytes = 43 caracteres — fase 0)
  chave_publica bytea not null,                       -- COSE (ES256: 77 bytes; RS256 2048: ~272)
  contador bigint not null default 0,
  algoritmo smallint not null,
  aaguid uuid,
  nuvem boolean,                                      -- o app criou com isCloudBackupEnabled = true?
  backup_elegivel boolean,                            -- a flag BE do registro
  backup_estado boolean,                              -- a flag BS do registro
  origem text not null,                               -- android:apk-key-hash:… (a do registro)
  sessao_id uuid not null,                            -- a sessão do Auth que registrou (a chave só vale enquanto ela existir)
  aparelho text,                                      -- "marca modelo · Android N", opcional
  versao_app text,
  criada_em timestamptz not null default now(),
  usada_em timestamptz,
  usos integer not null default 0,
  apagada_em timestamptz,
  motivo_apagada text,
  constraint chaves_restauracao_credencial_check check (credencial_id ~ '^[A-Za-z0-9_-]{16,128}$'),
  constraint chaves_restauracao_chave_check check (octet_length(chave_publica) between 16 and 600),
  constraint chaves_restauracao_contador_check check (contador >= 0 and usos >= 0),
  constraint chaves_restauracao_algoritmo_check check (algoritmo in (-7, -257)),
  constraint chaves_restauracao_origem_check check (origem ~ '^android:apk-key-hash:[A-Za-z0-9_-]{43}$'),
  constraint chaves_restauracao_aparelho_check check (aparelho is null or char_length(aparelho) <= 80),
  constraint chaves_restauracao_versao_check check (versao_app is null or char_length(versao_app) <= 32),
  constraint chaves_restauracao_motivo_check
    check (motivo_apagada in ('saiu', 'saiu_todos', 'substituida', 'limite', 'vencida', 'sessao_derrubada', 'senha_trocada', 'conta_excluida')),
  constraint chaves_restauracao_apagada_check check ((apagada_em is null) = (motivo_apagada is null))
);
create index if not exists chaves_restauracao_user_idx on {schema}.chaves_restauracao (user_id);
revoke all on {schema}.chaves_restauracao from public, anon, authenticated;
grant all on {schema}.chaves_restauracao to service_role;
alter table {schema}.chaves_restauracao enable row level security;

create table if not exists {schema}.restauracao_desafios (
  desafio text primary key,                           -- base64url de 32 bytes (43 caracteres)
  tipo text not null,
  user_id uuid references auth.users(id) on delete cascade,   -- só no 'registrar'
  credencial_id text,                                 -- só no 'entrar' (o desafio gasto: qual chave entrou)
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  constraint restauracao_desafios_desafio_check check (desafio ~ '^[A-Za-z0-9_-]{43}$'),
  constraint restauracao_desafios_tipo_check check (tipo in ('registrar', 'entrar')),
  constraint restauracao_desafios_dono_check check ((tipo = 'registrar') = (user_id is not null)),
  constraint restauracao_desafios_chave_check
    check ((tipo = 'entrar') = (credencial_id is not null) and (credencial_id is null or credencial_id ~ '^[A-Za-z0-9_-]{16,128}$'))
);
create index if not exists restauracao_desafios_tipo_expira_idx on {schema}.restauracao_desafios (tipo, expira_em);
create index if not exists restauracao_desafios_user_idx on {schema}.restauracao_desafios (user_id) where user_id is not null;
create index if not exists restauracao_desafios_chave_idx on {schema}.restauracao_desafios (credencial_id, criado_em) where credencial_id is not null;
revoke all on {schema}.restauracao_desafios from public, anon, authenticated;
grant all on {schema}.restauracao_desafios to service_role;
alter table {schema}.restauracao_desafios enable row level security;

-- ============================================================================================================
-- 2. A trava (app_config.restaurar_login) + o staging só com conta de TESTE + o master, num lugar só
-- ============================================================================================================
-- null = pode; senão o código da recusa. Sem pessoa (p_user null) só a trava conta. A trava só liga com "ligado": true (qualquer outra
-- coisa, ou a linha faltando, é desligado); o so_teste só deixa de valer com false explícito. O master (o papel no Auth ou o perfil deste
-- schema — a regra do sou_master) não tem chave de volta: o app não cria (MasterSoNoSite) e o banco recusa (revisão, achado 2).
create or replace function {schema}.restaurar_login_recusa(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cfg jsonb;
  v_u record;
begin
  select a.valor into v_cfg from {schema}.app_config a where a.chave = 'restaurar_login' and not a.publica;
  if v_cfg is null or jsonb_typeof(v_cfg) <> 'object' or (v_cfg -> 'ligado') is distinct from 'true'::jsonb then
    return 'desligado';
  end if;
  if p_user is null then
    return null;
  end if;
  select u.email, u.deleted_at, u.raw_app_meta_data into v_u from auth.users u where u.id = p_user;
  if not found or v_u.deleted_at is not null then
    return 'sem_login';
  end if;
  if '{schema}' = 'staging' and not {schema}.email_de_teste(v_u.email) then
    return 'conta_real_no_staging';
  end if;
  if (v_cfg -> 'so_teste') is distinct from 'false'::jsonb and not {schema}.email_de_teste(v_u.email) then
    return 'desligado';
  end if;
  if coalesce(v_u.raw_app_meta_data ->> 'role', '') = 'master'
     or exists (select 1 from {schema}.profiles pr where pr.id = p_user and pr.role = 'master') then
    return 'conta_master';
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
  -- conta com o código de 2 etapas (fator verificado) só registra depois do código (aal2): a senha sozinha não vira chave (achado 2)
  if exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified')
     and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return jsonb_build_object('ok', false, 'erro', 'precisa_2fa');
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
  v_sessao uuid;
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
  if exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified')
     and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    return jsonb_build_object('ok', false, 'erro', 'precisa_2fa');
  end if;
  -- a sessão de quem grava (o session_id do JWT, que tem de existir no Auth): a chave morre com ela (achado 1)
  begin
    v_sessao := (auth.jwt() ->> 'session_id')::uuid;
  exception when invalid_text_representation then
    v_sessao := null;
  end;
  if v_sessao is null or not exists (select 1 from auth.sessions s where s.id = v_sessao and s.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'erro', 'sem_login');
  end if;
  -- o desafio DESTA pessoa, do tipo 'registrar': gasto aqui (uso único — o que veio sai, vencido ou não); o de outra pessoa fica
  delete from {schema}.restauracao_desafios d
   where d.desafio = p_desafio and d.tipo = 'registrar' and d.user_id = v_uid
  returning d.expira_em into v_expira;
  if v_expira is null or v_expira <= now() then
    return jsonb_build_object('ok', false, 'erro', 'desafio_invalido');
  end if;
  -- os tamanhos medidos na fase 0 (o id: 43 caracteres; a chave ES256: 77 bytes), com folga (achado 3)
  if p_credencial is null or p_credencial !~ '^[A-Za-z0-9_-]{16,128}$'
     or p_chave is null or octet_length(p_chave) not between 16 and 600
     or p_alg is null or p_alg not in (-7, -257)
     or p_contador is null or p_contador < 0
     or p_origem is null or p_origem !~ '^android:apk-key-hash:[A-Za-z0-9_-]{43}$'
     or (p_substitui is not null and p_substitui !~ '^[A-Za-z0-9_-]{16,128}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  -- o teto por pessoa: 20 registros em 24 h (a RPC direta, sem a função, não faz a tabela crescer sem fim — achado 3)
  if (select count(*) from {schema}.chaves_restauracao c where c.user_id = v_uid and c.criada_em > now() - interval '24 hours') >= 20 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  insert into {schema}.chaves_restauracao (user_id, credencial_id, chave_publica, contador, algoritmo, aaguid, nuvem, backup_elegivel,
    backup_estado, origem, sessao_id, aparelho, versao_app)
  values (v_uid, p_credencial, p_chave, p_contador, p_alg, p_aaguid, p_nuvem, p_be, p_bs, p_origem, v_sessao,
    left(nullif(btrim(coalesce(p_aparelho, '')), ''), 80), left(nullif(btrim(coalesce(p_versao, '')), ''), 32))
  on conflict (credencial_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'erro', 'chave_repetida');
  end if;
  -- a chave antiga DESTE aparelho (a renovação de 6 meses, a sessão nova, ou a volta depois de restaurar)
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
  -- no máximo 20 apagadas guardadas por pessoa (as mais antigas saem de vez)
  delete from {schema}.chaves_restauracao c
   where c.user_id = v_uid and c.apagada_em is not null
     and c.id not in (select x.id from {schema}.chaves_restauracao x
                       where x.user_id = v_uid and x.apagada_em is not null
                       order by x.apagada_em desc, x.id desc limit 20);
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
  elsif p_credencial is not null and p_credencial ~ '^[A-Za-z0-9_-]{16,128}$' then
    update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'saiu'
     where c.user_id = v_uid and c.credencial_id = p_credencial and c.apagada_em is null;
    get diagnostics v_n = row_count;
  else
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;
  -- no máximo 20 apagadas guardadas por pessoa
  delete from {schema}.chaves_restauracao c
   where c.user_id = v_uid and c.apagada_em is not null
     and c.id not in (select x.id from {schema}.chaves_restauracao x
                       where x.user_id = v_uid and x.apagada_em is not null
                       order by x.apagada_em desc, x.id desc limit 20);
  return jsonb_build_object('ok', true, 'apagadas', v_n);
end;
$$;
revoke all on function {schema}.chave_restauracao_apagar(text, boolean) from public, anon;
grant execute on function {schema}.chave_restauracao_apagar(text, boolean) to authenticated, service_role;

-- ============================================================================================================
-- 4. As RPCs SÓ do servidor (a função restaurar-login — o celular novo ainda não tem login)
-- ============================================================================================================
-- O desafio de entrar NÃO passa pelo banco: a função o cria assinado (validade + aleatório + HMAC com o segredo dela) e confere sozinha —
-- ninguém sem conta faz o banco crescer nem derruba a restauração de todos enchendo uma tabela (achado 4).

-- a chave ativa, a dona e a recusa da dona (aplicada pela função DEPOIS da assinatura: os 403 não viram oráculo)
create or replace function {schema}.restauracao_chave(p_credencial text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_recusa text;
  v_c record;
begin
  v_recusa := {schema}.restaurar_login_recusa(null);
  if v_recusa is not null then
    return jsonb_build_object('ok', false, 'erro', v_recusa);
  end if;
  select c.user_id, c.chave_publica, c.contador, c.algoritmo, c.sessao_id into v_c
    from {schema}.chaves_restauracao c
   where c.credencial_id = p_credencial and c.apagada_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  -- a sessão que registrou a chave ainda existe no Auth e não venceu (o Sair global feito em outro lugar, a revogação, a troca de senha e
  -- o prazo da sessão matam a chave junto — achado 1)
  if not exists (select 1 from auth.sessions s
                  where s.id = v_c.sessao_id and s.user_id = v_c.user_id and (s.not_after is null or s.not_after > now())) then
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  -- a dona existe e não foi excluída (soft delete — achado 9)
  if not exists (select 1 from auth.users u where u.id = v_c.user_id and u.deleted_at is null) then
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v_c.user_id, 'chave', encode(v_c.chave_publica, 'hex'),
    'contador', v_c.contador, 'algoritmo', v_c.algoritmo, 'recusa', {schema}.restaurar_login_recusa(v_c.user_id));
end;
$$;
revoke all on function {schema}.restauracao_chave(text) from public, anon, authenticated;
grant execute on function {schema}.restauracao_chave(text) to service_role;

-- depois da assinatura conferida: o limite por chave, o desafio gasto (uso único) e o contador — com a chave travada e ainda ativa
create or replace function {schema}.restauracao_gastar(p_desafio text, p_credencial text, p_contador bigint, p_expira timestamptz)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_recusa text;
  v_c record;
  v_n integer;
begin
  v_recusa := {schema}.restaurar_login_recusa(null);
  if v_recusa is not null then
    return jsonb_build_object('ok', false, 'erro', v_recusa);
  end if;
  if p_desafio is null or p_desafio !~ '^[A-Za-z0-9_-]{43}$' or p_expira is null or p_expira <= now() then
    return jsonb_build_object('ok', false, 'erro', 'desafio_invalido');
  end if;
  select c.id, c.user_id into v_c
    from {schema}.chaves_restauracao c
   where c.credencial_id = p_credencial and c.apagada_em is null
     for update;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'chave_invalida');
  end if;
  -- no máximo 3 entradas por chave por hora (uma troca de celular usa 1): sessões sem fim e o /verify do Auth não ficam à mercê de quem
  -- tem uma chave (achado 5). Resposta 429, nunca 401 (o 401 faz o app apagar a chave do aparelho).
  select count(*) into v_n from {schema}.restauracao_desafios d
   where d.tipo = 'entrar' and d.credencial_id = p_credencial and d.criado_em > now() - interval '1 hour';
  if v_n >= 3 then
    return jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  end if;
  insert into {schema}.restauracao_desafios (desafio, tipo, credencial_id, expira_em)
  values (p_desafio, 'entrar', p_credencial, p_expira)
  on conflict (desafio) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'desafio_invalido');
  end if;
  update {schema}.chaves_restauracao c
     set contador = greatest(c.contador, coalesce(p_contador, 0)), usada_em = now(), usos = c.usos + 1
   where c.id = v_c.id;
  return jsonb_build_object('ok', true, 'user_id', v_c.user_id);
end;
$$;
revoke all on function {schema}.restauracao_gastar(text, text, bigint, timestamptz) from public, anon, authenticated;
grant execute on function {schema}.restauracao_gastar(text, text, bigint, timestamptz) to service_role;

create or replace function {schema}.restauracao_limpar() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_desafios integer;
  v_removidas integer;
  v_vencidas integer;
begin
  delete from {schema}.restauracao_desafios d
   where (d.tipo = 'registrar' and d.expira_em <= now()) or (d.tipo = 'entrar' and d.criado_em < now() - interval '1 hour');
  get diagnostics v_desafios = row_count;
  delete from {schema}.chaves_restauracao c where c.apagada_em is not null and c.apagada_em < now() - interval '90 days';
  get diagnostics v_removidas = row_count;
  -- 13 meses depois de CRIADA, usada ou não (achado 1): quem usa o app renova a sua a cada 6 meses
  update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'vencida'
   where c.apagada_em is null and c.criada_em < now() - interval '13 months';
  get diagnostics v_vencidas = row_count;
  return jsonb_build_object('desafios', v_desafios, 'removidas', v_removidas, 'vencidas', v_vencidas);
end;
$$;
revoke all on function {schema}.restauracao_limpar() from public, anon, authenticated;
grant execute on function {schema}.restauracao_limpar() to service_role;

-- ============================================================================================================
-- 5. O gatilho em auth.users: a senha trocada e a conta excluída apagam as chaves (achados 1 e 9)
-- ============================================================================================================
-- 1 gatilho por schema (a migração de cada um cria o seu): a troca de senha (no app, "esqueci a senha", o P25, o reset pelo master) e o soft
-- delete (a exclusão do profissional: deleteUser(uid, true)). Nunca lança: só marca as chaves ATIVAS daquela pessoa neste schema.
create or replace function {schema}.restauracao_auth_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'conta_excluida'
     where c.user_id = new.id and c.apagada_em is null;
  elsif new.encrypted_password is distinct from old.encrypted_password then
    update {schema}.chaves_restauracao c set apagada_em = now(), motivo_apagada = 'senha_trocada'
     where c.user_id = new.id and c.apagada_em is null;
  end if;
  return null;
end;
$$;
revoke all on function {schema}.restauracao_auth_mudou() from public, anon, authenticated;

drop trigger if exists physiq_restauracao_auth_{schema} on auth.users;
create trigger physiq_restauracao_auth_{schema} after update of encrypted_password, deleted_at on auth.users
  for each row
  when (new.encrypted_password is distinct from old.encrypted_password or (new.deleted_at is not null and old.deleted_at is null))
  execute function {schema}.restauracao_auth_mudou();

-- ============================================================================================================
-- 6. A trava (D7) e a limpeza de hora em hora
-- ============================================================================================================
-- aplicar de novo não pisa no que o dono ligou ou desligou
insert into {schema}.app_config (chave, valor, publica)
values ('restaurar_login', jsonb_build_object('ligado', '{schema}' = 'staging', 'so_teste', true), false)
on conflict (chave) do nothing;

-- o mesmo nome ATUALIZA o job
select cron.schedule('physiq-restauracao-limpeza-{schema}', '33 * * * *', $$select {schema}.restauracao_limpar()$$);

-- ============================================================================================================
-- 7. A conferência do fim (qualquer diferença desfaz a migração inteira)
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
    '{schema}.restauracao_chave(text)',
    '{schema}.restauracao_gastar(text, text, bigint, timestamptz)',
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
  foreach v_f in array v_da_pessoa || v_do_servidor || array['{schema}.restauracao_auth_mudou()'] loop
    if not (select pr.prosecdef and coalesce(pr.proconfig, '{}') @> array['search_path=""'] from pg_proc pr where pr.oid = v_f::regprocedure) then
      raise exception 'restaurar-login: % sem SECURITY DEFINER ou sem o search_path vazio', v_f;
    end if;
    if has_function_privilege('anon', v_f, 'execute') then
      raise exception 'restaurar-login: o visitante executa %', v_f;
    end if;
  end loop;
  foreach v_f in array v_da_pessoa || v_do_servidor loop
    if not has_function_privilege('service_role', v_f, 'execute') then
      raise exception 'restaurar-login: o servidor não executa %', v_f;
    end if;
  end loop;
  foreach v_f in array v_da_pessoa loop
    if not has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'restaurar-login: o app não executa %', v_f;
    end if;
  end loop;
  foreach v_f in array v_do_servidor || array['{schema}.restauracao_auth_mudou()'] loop
    if has_function_privilege('authenticated', v_f, 'execute') then
      raise exception 'restaurar-login: o app executa % (é só do servidor)', v_f;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger tg
                  where tg.tgrelid = 'auth.users'::regclass and tg.tgname = 'physiq_restauracao_auth_{schema}' and not tg.tgisinternal
                    and tg.tgfoid = '{schema}.restauracao_auth_mudou()'::regprocedure) then
    raise exception 'restaurar-login: o gatilho physiq_restauracao_auth_{schema} não está em auth.users';
  end if;
  select a.valor into v_cfg from {schema}.app_config a where a.chave = 'restaurar_login' and not a.publica;
  if v_cfg is null or jsonb_typeof(v_cfg -> 'ligado') is distinct from 'boolean' or jsonb_typeof(v_cfg -> 'so_teste') is distinct from 'boolean' then
    raise exception 'restaurar-login: a trava restaurar_login de {schema} não está lá (ou é pública, ou sem os 2 campos)';
  end if;
  if not exists (select 1 from cron.job j where j.jobname = 'physiq-restauracao-limpeza-{schema}' and j.schedule = '33 * * * *') then
    raise exception 'restaurar-login: o job physiq-restauracao-limpeza-{schema} não está no pg_cron';
  end if;
end $c$;

notify pgrst, 'reload schema';
