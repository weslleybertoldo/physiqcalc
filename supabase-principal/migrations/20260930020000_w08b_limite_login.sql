-- Physiq W8b — limite de tentativas no login, NO SERVIDOR (banco principal hkxvtsbwctxkrqzkkdoz). Idempotente.
-- Regra dele (29/09 ~22:25–22:35): "no máximo 4 tentativas depois bloqueio" · "começa com 1 min, 5, 15, 30, 60 e depois
-- bloqueia de vez. e o professor pode criar uma nova senha, passa para o aluno, e quando ele logar aparece a opção de atualizar
-- (primeira página assim que ele loga depois de um reset de senha) ou se o email dele for igual ao gmail, ele loga e troca a
-- senha em configurações".
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930020000_w08b_limite_login.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20260930020000_w08b_limite_login.sql --so public
--
-- Desenho:
--   · o gancho "Password Verification Attempt" do Auth só existe nos planos Team/Enterprise (a Management API respondeu 402 em
--     30/09/2026: "cannot be configured for this organization") → a porta do e-mail e senha do Physiq passa a ser a função da
--     borda entrar-senha (verify_jwt=false): captcha (Cloudflare Turnstile) → login_iniciar (contador por conta e por IP, com a
--     escada) → GoTrue → login_concluir → devolve a sessão;
--   · login_bloqueios: 1 linha por e-mail (a conta; vale igual para e-mail que não existe — não revela quem tem conta):
--     4 senhas erradas → 1 min; cada erro depois sobe 5 → 15 → 30 → 60 min; o seguinte bloqueia DE VEZ (até a senha certa é
--     recusada). Login certo zera. Durações em app_config 'login_limite' (o master muda sem deploy; W27 ganha a tela);
--   · login_tentativas_ip: tentativas por IP (hash, sem o IP) numa janela — segura quem tenta várias contas do mesmo lugar;
--   · 1 tentativa por vez por conta (em_andamento_ate): duas tentativas ao mesmo tempo não pulam a escada;
--   · login_captcha_usados: o hash de cada token do captcha já usado (10 min) — o siteverify aceitou o mesmo token 2 vezes;
--   · destrava: senha nova criada pelo profissional/master (paciente_criar_acesso / paciente_redefinir_senha — o site antigo do
--     Nutri usa as mesmas RPCs e também destrava) ou entrar com o Google (a pos-login chama login_destravar);
--   · senha PROVISÓRIA: as 2 RPCs marcam auth.users.raw_app_meta_data.senha_provisoria = true (vai no JWT); o app mostra "crie a
--     sua senha" no 1º login com ela e minha_senha_definida() tira a marca quando a pessoa grava a senha dela;
--   · paciente_acesso/criar/redefinir: além da nutricionista dona do registro e do master (a regra de hoje, do site antigo), o dono
--     da conta e o responsável pelo aluno (pode_ver_aluno — P1);
--   · aluno_acesso(p_aluno): os dados do card "Acesso do aluno" do Resumo (acha o aluno pelo id da matrícula ou do Treino, como o
--     Financeiro da W6).
-- NADA muda no Auth do projeto (sem gancho, sem captcha global): o site antigo do Nutri continua entrando direto até a W28.
-- Nenhum dado existente muda (tabelas novas, 1 chave nova em app_config, funções).

-- ============================================================================================================
-- 1. Tabelas (só o servidor: RLS ligada e nenhuma política; a função da borda usa a service_role)
-- ============================================================================================================
create table if not exists {schema}.login_bloqueios (
  email text primary key,
  erros integer not null default 0,
  bloqueado_ate timestamptz,
  bloqueado_de_vez_em timestamptz,
  em_andamento_ate timestamptz,
  ultimo_erro_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table {schema}.login_bloqueios drop constraint if exists login_bloqueios_email_check;
alter table {schema}.login_bloqueios add constraint login_bloqueios_email_check
  check (email = lower(btrim(email)) and char_length(email) between 3 and 320);
alter table {schema}.login_bloqueios drop constraint if exists login_bloqueios_erros_check;
alter table {schema}.login_bloqueios add constraint login_bloqueios_erros_check check (erros >= 0);

create table if not exists {schema}.login_tentativas_ip (
  ip_hash text primary key,
  janela_inicio timestamptz not null default now(),
  tentativas integer not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table {schema}.login_tentativas_ip drop constraint if exists login_tentativas_ip_hash_check;
alter table {schema}.login_tentativas_ip add constraint login_tentativas_ip_hash_check check (char_length(ip_hash) between 16 and 128);

-- tokens do captcha já usados (hash): o siteverify do Turnstile aceitou o MESMO token 2 vezes no teste de 30/09 — aqui cada
-- token vale UMA tentativa de verdade (guardado 10 min; o token vence em 5)
create table if not exists {schema}.login_captcha_usados (
  token_hash text primary key,
  usado_em timestamptz not null default now()
);
alter table {schema}.login_captcha_usados drop constraint if exists login_captcha_usados_hash_check;
alter table {schema}.login_captcha_usados add constraint login_captcha_usados_hash_check check (char_length(token_hash) between 16 and 128);

alter table {schema}.login_bloqueios enable row level security;
alter table {schema}.login_tentativas_ip enable row level security;
alter table {schema}.login_captcha_usados enable row level security;
revoke all on {schema}.login_bloqueios, {schema}.login_tentativas_ip, {schema}.login_captcha_usados from public, anon, authenticated;
grant all on {schema}.login_bloqueios, {schema}.login_tentativas_ip, {schema}.login_captcha_usados to service_role;

-- a escada e os limites (o master muda aqui; não sobrescreve o que já foi mudado)
insert into {schema}.app_config (chave, valor, publica)
values ('login_limite', jsonb_build_object(
  'erros_ate_bloquear', 4,
  'escada_min', jsonb_build_array(1, 5, 15, 30, 60),
  'depois_de_vez', true,
  'ip_max_tentativas', 30,
  'ip_janela_min', 15,
  'captcha', true), false)
on conflict (chave) do nothing;

-- ============================================================================================================
-- 2. Regras (lidas de app_config com os padrões; valor torto no config nunca derruba o login — cai no padrão)
-- ============================================================================================================
create or replace function {schema}.login_regras() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cfg jsonb := coalesce((select a.valor from {schema}.app_config a where a.chave = 'login_limite' and jsonb_typeof(a.valor) = 'object'), '{}'::jsonb);
  v_escada jsonb;
  v_int integer;
  v_saida jsonb := jsonb_build_object('erros_ate_bloquear', 4, 'escada_min', jsonb_build_array(1, 5, 15, 30, 60), 'depois_de_vez', true,
                                      'ip_max_tentativas', 30, 'ip_janela_min', 15, 'captcha', true);
begin
  if jsonb_typeof(v_cfg -> 'erros_ate_bloquear') = 'number' then
    v_int := floor((v_cfg ->> 'erros_ate_bloquear')::numeric)::integer;
    if v_int between 1 and 100 then v_saida := v_saida || jsonb_build_object('erros_ate_bloquear', v_int); end if;
  end if;
  if jsonb_typeof(v_cfg -> 'escada_min') = 'array' then
    select coalesce(jsonb_agg(to_jsonb(e.valor::numeric) order by e.ordem), '[]'::jsonb) into v_escada
      from jsonb_array_elements(v_cfg -> 'escada_min') with ordinality as e(valor, ordem)
     where jsonb_typeof(e.valor) = 'number' and (e.valor #>> '{}')::numeric > 0 and (e.valor #>> '{}')::numeric <= 525600;
    if jsonb_array_length(v_escada) > 0 then v_saida := v_saida || jsonb_build_object('escada_min', v_escada); end if;
  end if;
  if jsonb_typeof(v_cfg -> 'depois_de_vez') = 'boolean' then
    v_saida := v_saida || jsonb_build_object('depois_de_vez', (v_cfg ->> 'depois_de_vez')::boolean);
  end if;
  if jsonb_typeof(v_cfg -> 'ip_max_tentativas') = 'number' then
    v_int := floor((v_cfg ->> 'ip_max_tentativas')::numeric)::integer;
    if v_int between 1 and 100000 then v_saida := v_saida || jsonb_build_object('ip_max_tentativas', v_int); end if;
  end if;
  if jsonb_typeof(v_cfg -> 'ip_janela_min') = 'number' then
    v_int := floor((v_cfg ->> 'ip_janela_min')::numeric)::integer;
    if v_int between 1 and 1440 then v_saida := v_saida || jsonb_build_object('ip_janela_min', v_int); end if;
  end if;
  if jsonb_typeof(v_cfg -> 'captcha') = 'boolean' then
    v_saida := v_saida || jsonb_build_object('captcha', (v_cfg ->> 'captcha')::boolean);
  end if;
  return v_saida;
end;
$$;

-- estado do bloqueio de um e-mail (o card do profissional mostra; a tela de entrar recebe o mesmo formato)
create or replace function {schema}.login_estado(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when b.email is null then null else jsonb_build_object(
      'erros', b.erros,
      'bloqueado_ate', case when b.bloqueado_ate > now() then b.bloqueado_ate end,
      'bloqueado_de_vez', b.bloqueado_de_vez_em is not null,
      'bloqueado_de_vez_em', b.bloqueado_de_vez_em,
      'ultimo_erro_em', b.ultimo_erro_em) end
    from (select 1) um
    left join {schema}.login_bloqueios b on b.email = lower(btrim(coalesce(p_email, '')));
$$;

-- ============================================================================================================
-- 3. A tentativa (só a função da borda entrar-senha chama — service_role)
-- ============================================================================================================
-- Antes de conferir a senha: o IP passou do limite da janela? a conta está bloqueada (tempo ou de vez)? outra tentativa da mesma
-- conta está em andamento? Se pode, segura a conta por 20 s (a função solta no login_concluir) e conta a tentativa do IP.
create or replace function {schema}.login_iniciar(p_email text, p_ip_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_cfg jsonb := {schema}.login_regras();
  v_janela interval := make_interval(mins => (v_cfg ->> 'ip_janela_min')::integer);
  v_max integer := (v_cfg ->> 'ip_max_tentativas')::integer;
  v_ip {schema}.login_tentativas_ip%rowtype;
  v_b {schema}.login_bloqueios%rowtype;
begin
  if char_length(v_email) < 3 or char_length(v_email) > 320 or position('@' in v_email) = 0 then raise exception 'email_invalido'; end if;
  -- limpeza leve (1 em 50 tentativas): janelas de IP velhas não servem mais para nada
  if random() < 0.02 then
    delete from {schema}.login_tentativas_ip where atualizado_em < now() - interval '2 days';
  end if;
  if p_ip_hash is not null and char_length(p_ip_hash) between 16 and 128 then
    insert into {schema}.login_tentativas_ip as t (ip_hash) values (p_ip_hash)
    on conflict (ip_hash) do update set
      janela_inicio = case when t.janela_inicio <= now() - v_janela then now() else t.janela_inicio end,
      tentativas = case when t.janela_inicio <= now() - v_janela then 0 else t.tentativas end,
      atualizado_em = now()
    returning * into v_ip;
    if v_ip.tentativas >= v_max then
      return jsonb_build_object('permitido', false, 'motivo', 'ip', 'bloqueado_ate', v_ip.janela_inicio + v_janela, 'agora', now());
    end if;
  end if;

  insert into {schema}.login_bloqueios (email) values (v_email) on conflict (email) do nothing;
  select * into v_b from {schema}.login_bloqueios where email = v_email for update;
  if v_b.bloqueado_de_vez_em is not null then
    return jsonb_build_object('permitido', false, 'motivo', 'bloqueado_de_vez', 'erros', v_b.erros, 'agora', now());
  end if;
  if v_b.bloqueado_ate is not null and v_b.bloqueado_ate > now() then
    return jsonb_build_object('permitido', false, 'motivo', 'bloqueado', 'bloqueado_ate', v_b.bloqueado_ate, 'erros', v_b.erros, 'agora', now());
  end if;
  if v_b.em_andamento_ate is not null and v_b.em_andamento_ate > now() then
    return jsonb_build_object('permitido', false, 'motivo', 'em_andamento', 'bloqueado_ate', v_b.em_andamento_ate, 'agora', now());
  end if;
  update {schema}.login_bloqueios set em_andamento_ate = now() + interval '20 seconds', atualizado_em = now() where email = v_email;
  if v_ip.ip_hash is not null then
    update {schema}.login_tentativas_ip set tentativas = tentativas + 1, atualizado_em = now() where ip_hash = v_ip.ip_hash;
  end if;
  return jsonb_build_object('permitido', true, 'erros', v_b.erros, 'agora', now());
end;
$$;

-- Depois de conferir a senha: 'ok' zera · 'senha_errada' conta e aplica a escada · 'nao_conta' (rede, servidor, acesso
-- desativado, e-mail sem confirmação) só solta a conta. Devolve o estado novo.
create or replace function {schema}.login_concluir(p_email text, p_resultado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_cfg jsonb := {schema}.login_regras();
  v_limite integer := (v_cfg ->> 'erros_ate_bloquear')::integer;
  v_escada jsonb := v_cfg -> 'escada_min';
  v_b {schema}.login_bloqueios%rowtype;
  v_idx integer;
begin
  if p_resultado not in ('ok', 'senha_errada', 'nao_conta') then raise exception 'resultado_invalido'; end if;
  if p_resultado = 'ok' then
    delete from {schema}.login_bloqueios where email = v_email;
    return jsonb_build_object('erros', 0, 'bloqueado_ate', null, 'bloqueado_de_vez', false, 'agora', now());
  end if;
  if p_resultado = 'senha_errada' then
    insert into {schema}.login_bloqueios (email) values (v_email) on conflict (email) do nothing;
  end if;
  select * into v_b from {schema}.login_bloqueios where email = v_email for update;
  if not found then
    return jsonb_build_object('erros', 0, 'bloqueado_ate', null, 'bloqueado_de_vez', false, 'agora', now());
  end if;
  if p_resultado = 'nao_conta' then
    if v_b.erros = 0 and v_b.bloqueado_ate is null and v_b.bloqueado_de_vez_em is null then
      delete from {schema}.login_bloqueios where email = v_email;
    else
      update {schema}.login_bloqueios set em_andamento_ate = null, atualizado_em = now() where email = v_email;
    end if;
    return jsonb_build_object('erros', v_b.erros, 'bloqueado_ate', case when v_b.bloqueado_ate > now() then v_b.bloqueado_ate end,
                              'bloqueado_de_vez', v_b.bloqueado_de_vez_em is not null, 'agora', now());
  end if;

  -- senha errada: +1 e a escada (4 → 1 min; 5 → 5; 6 → 15; 7 → 30; 8 → 60; 9 → de vez — com os padrões)
  v_b.erros := v_b.erros + 1;
  v_b.bloqueado_ate := null;
  if v_b.erros >= v_limite then
    v_idx := v_b.erros - v_limite;
    if v_idx < jsonb_array_length(v_escada) then
      v_b.bloqueado_ate := now() + make_interval(secs => (v_escada ->> v_idx)::numeric * 60);
    elsif (v_cfg ->> 'depois_de_vez')::boolean then
      v_b.bloqueado_de_vez_em := coalesce(v_b.bloqueado_de_vez_em, now());
    else
      v_b.bloqueado_ate := now() + make_interval(secs => (v_escada ->> (jsonb_array_length(v_escada) - 1))::numeric * 60);
    end if;
  end if;
  update {schema}.login_bloqueios
     set erros = v_b.erros, bloqueado_ate = v_b.bloqueado_ate, bloqueado_de_vez_em = v_b.bloqueado_de_vez_em,
         ultimo_erro_em = now(), em_andamento_ate = null, atualizado_em = now()
   where email = v_email;
  return jsonb_build_object(
    'erros', v_b.erros,
    'bloqueado_ate', v_b.bloqueado_ate,
    'bloqueado_de_vez', v_b.bloqueado_de_vez_em is not null,
    'restam', greatest(0, v_limite - v_b.erros),
    'agora', now());
end;
$$;

-- O token do captcha (hash) é usado agora: true = 1ª vez (vale); false = repetido (a função recusa como captcha_invalido).
create or replace function {schema}.login_captcha_usar(p_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_hash is null or char_length(p_hash) not between 16 and 128 then return false; end if;
  if random() < 0.05 then
    delete from {schema}.login_captcha_usados where usado_em < now() - interval '10 minutes';
  end if;
  insert into {schema}.login_captcha_usados (token_hash) values (p_hash) on conflict (token_hash) do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- Destrava a conta (senha nova do profissional/master, entrar com o Google): apaga o contador. true = havia bloqueio/erros.
create or replace function {schema}.login_destravar(p_email text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  delete from {schema}.login_bloqueios where email = lower(btrim(coalesce(p_email, '')));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

revoke execute on function {schema}.login_regras(), {schema}.login_estado(text), {schema}.login_iniciar(text, text),
  {schema}.login_concluir(text, text), {schema}.login_destravar(text), {schema}.login_captcha_usar(text) from public, anon, authenticated;
grant execute on function {schema}.login_regras(), {schema}.login_estado(text), {schema}.login_iniciar(text, text),
  {schema}.login_concluir(text, text), {schema}.login_destravar(text), {schema}.login_captcha_usar(text) to service_role;

-- ============================================================================================================
-- 4. Acesso do aluno (o card do Resumo e o site antigo do Nutri): quem pode, senha provisória e destravar
-- ============================================================================================================
-- quem mexe no acesso: a nutricionista dona do registro (a regra de hoje, do site antigo), o master e quem vê o aluno pela conta
-- (dono da conta; o personal/nutricionista responsável com o papel valendo — P1)
create or replace function {schema}.pode_mexer_no_acesso(p_paciente uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select {schema}.eh_master() or exists (
    select 1 from {schema}.pacientes p
     where p.id = p_paciente and p.deleted_at is null
       and (p.nutricionista_id = auth.uid() or {schema}.pode_ver_aluno(p.id)));
$$;
revoke execute on function {schema}.pode_mexer_no_acesso(uuid) from public, anon;
grant execute on function {schema}.pode_mexer_no_acesso(uuid) to authenticated, service_role;

-- estado do acesso: null (sem conta) ou {user_id, email, ativo, criado_em, ultimo_acesso} + (W8b) entra_com_google, tem_senha,
-- senha_provisoria e bloqueio (tentativas). As chaves de antes continuam iguais (o site antigo do Nutri lê as mesmas).
create or replace function {schema}.paciente_acesso(p_paciente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not {schema}.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then return null; end if;
  return (
    select jsonb_build_object(
      'user_id', u.id,
      'email', u.email,
      'ativo', (u.banned_until is null or u.banned_until <= now()),
      'criado_em', u.created_at,
      'ultimo_acesso', u.last_sign_in_at,
      'entra_com_google', exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'),
      'tem_senha', coalesce(u.encrypted_password, '') <> '',
      'senha_provisoria', coalesce((u.raw_app_meta_data ->> 'senha_provisoria')::boolean, false),
      'bloqueio', {schema}.login_estado(u.email))
    from auth.users u where u.id = v_pac.user_id
  );
end;
$$;

-- cria a conta do aluno com a senha inicial (PROVISÓRIA — W8b) e liga em pacientes.user_id (só neste schema). Sem convite por
-- e-mail. Destrava o contador de tentativas do e-mail (se alguém tinha tentado antes).
create or replace function {schema}.paciente_criar_acesso(p_paciente_id uuid, p_email text, p_senha text)
returns uuid
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid := gen_random_uuid();
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not {schema}.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is not null then raise exception 'ja_tem_acesso'; end if;
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalido'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'email_em_uso'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', 'paciente', 'senha_provisoria', true),
    jsonb_build_object('full_name', v_pac.nome), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
  update {schema}.pacientes set user_id = v_id where id = p_paciente_id;
  delete from {schema}.login_bloqueios where email = v_email;
  return v_id;
end;
$$;

-- senha nova (crypt/bf), PROVISÓRIA (W8b: o app pede para a pessoa criar a dela no próximo login) e derruba as sessões abertas;
-- destrava o contador de tentativas da conta (o bloqueio "de vez" também).
create or replace function {schema}.paciente_redefinir_senha(p_paciente_id uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = {schema}, public, extensions
as $$
declare
  v_pac {schema}.pacientes%rowtype;
  v_email text;
begin
  select * into v_pac from {schema}.pacientes where id = p_paciente_id and deleted_at is null;
  if not found or not {schema}.pode_mexer_no_acesso(p_paciente_id) then raise exception 'sem_acesso'; end if;
  if v_pac.user_id is null then raise exception 'sem_conta'; end if;
  if coalesce(length(p_senha), 0) < 8 then raise exception 'senha_curta'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('senha_provisoria', true),
         updated_at = now()
   where id = v_pac.user_id
  returning lower(email) into v_email;
  delete from auth.sessions where user_id = v_pac.user_id;
  delete from {schema}.login_bloqueios where email = v_email;
end;
$$;

revoke all on function {schema}.paciente_acesso(uuid) from public;
revoke all on function {schema}.paciente_acesso(uuid) from anon;
grant execute on function {schema}.paciente_acesso(uuid) to authenticated;
revoke all on function {schema}.paciente_criar_acesso(uuid, text, text) from public;
revoke all on function {schema}.paciente_criar_acesso(uuid, text, text) from anon;
grant execute on function {schema}.paciente_criar_acesso(uuid, text, text) to authenticated;
revoke all on function {schema}.paciente_redefinir_senha(uuid, text) from public;
revoke all on function {schema}.paciente_redefinir_senha(uuid, text) from anon;
grant execute on function {schema}.paciente_redefinir_senha(uuid, text) to authenticated;

-- o card "Acesso do aluno" (Resumo do painel): acha a matrícula pelo id dela ou pelo id do Treino (a rota do painel usa os dois,
-- como o Financeiro), entre as que quem chama pode mexer; devolve os dados do cadastro e o estado do acesso.
create or replace function {schema}.aluno_acesso(p_aluno uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pac {schema}.pacientes%rowtype;
  v_existe boolean := false;
  v_achou boolean := false;
begin
  for v_pac in
    select * from {schema}.pacientes p
     where (p.id = p_aluno or p.treino_user_id = p_aluno) and p.deleted_at is null
     order by p.ativo desc, p.created_at
  loop
    v_existe := true;
    if {schema}.pode_mexer_no_acesso(v_pac.id) then
      v_achou := true;
      exit;
    end if;
  end loop;
  if not v_achou then raise exception '%', case when v_existe then 'sem_acesso' else 'aluno_inexistente' end; end if;
  return jsonb_build_object(
    'paciente_id', v_pac.id,
    'nome', v_pac.nome,
    'email', v_pac.email,
    'ativo', v_pac.ativo,
    'conta_id', v_pac.conta_id,
    'acesso', {schema}.paciente_acesso(v_pac.id),
    'agora', now());
end;
$$;
revoke execute on function {schema}.aluno_acesso(uuid) from public, anon;
grant execute on function {schema}.aluno_acesso(uuid) to authenticated, service_role;

-- a pessoa gravou a senha dela (Perfil › Conta, Configurações › Perfil ou a tela "crie a sua senha"): tira a marca de provisória.
-- Só mexe na própria conta e só na marca (o resto do app_metadata fica).
create or replace function {schema}.minha_senha_definida() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'sem_login'; end if;
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'senha_provisoria', updated_at = now()
   where id = v_uid and coalesce(raw_app_meta_data, '{}'::jsonb) ? 'senha_provisoria'
  returning lower(email) into v_email;
  if v_email is null then return false; end if;
  delete from {schema}.login_bloqueios where email = v_email;
  return true;
end;
$$;
revoke execute on function {schema}.minha_senha_definida() from public, anon;
grant execute on function {schema}.minha_senha_definida() to authenticated;
