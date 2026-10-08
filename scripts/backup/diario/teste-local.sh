#!/usr/bin/env bash
# Teste local das rotinas de cópia do Physiq (hml-07, homologação 08/10/2026): NADA sai da máquina e nenhum banco do
# Supabase é tocado. Sobe um Postgres de ORIGEM descartável que imita os 2 projetos (papéis do Supabase, auth.users com
# logins, RLS em todas as tabelas, FK para auth.users, índice com extensions.gin_trgm_ops, função definer, view, tabela
# vazia, schema staging) e aplica as 2 migrations da hml-07. Confere:
#   1. copia.sh principal e treino: ensaio ok, .tar.age 600, manifesto e logins certos, o arquivo não abre sem a chave;
#   2. restaurar.sh com o .tar.age + a chave de TESTE: restaura num 3º Postgres e as linhas batem; texto com quebra de
#      linha, tab, barra e aspas volta igual (dado e login);
#   3. --schema staging grava o nome de teste e exige --saida;
#   4. negativo: coluna de um tipo que o ensaio não conhece (hstore) → o ensaio falha, saída ≠ 0 e NADA é gravado;
#      negativo: o papel physiq_backup não escreve (sessão só leitura);
#   5. cifrar-copias-manuais.sh: cópia velha vira .tar.age com a data dela e volta igual (sha256), a nova fica aberta,
#      o .age que já existe fica, nome repetido ganha sufixo, --simular não mexe em nada, com AGE_IDENTIDADE a volta é
#      conferida antes de apagar e com a chave ERRADA a aberta fica;
#   6. limpeza.sh --simular enxerga só o que tem 29+ dias.
# Uso: scripts/backup/diario/teste-local.sh   (PG_BIN ≥ 17 com initdb — ou ~/.config/physiq-backup/ambiente — e o age)
set -euo pipefail
umask 077

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
CONF_REAL="${PHYSIQ_BACKUP_CONF:-$HOME/.config/physiq-backup}"
# shellcheck source=/dev/null
[ -f "$CONF_REAL/ambiente" ] && . "$CONF_REAL/ambiente"
if [ -z "${PG_BIN:-}" ] && command -v pg_config > /dev/null 2>&1; then PG_BIN="$(pg_config --bindir)"; fi
[ -x "${PG_BIN:-}/initdb" ] || { echo "sem initdb em PG_BIN='${PG_BIN:-}'" >&2; exit 2; }
export PG_BIN LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"
command -v age > /dev/null || { echo "sem o age" >&2; exit 2; }

T="$(mktemp -d)"
CLUSTERS=()
fim() {
  local c
  for c in "${CLUSTERS[@]}"; do "$PG_BIN/pg_ctl" -D "$c" -m immediate stop > /dev/null 2>&1 || true; done
  rm -rf "${T:?}"
}
trap fim EXIT

OK=0
FALHAS=0
confere() {
  local desc="$1"
  shift
  if "$@"; then echo "✅ $desc"; OK=$((OK + 1)); else echo "❌ $desc"; FALHAS=$((FALHAS + 1)); fi
}

subir() {
  local nome="$1"
  mkdir -p "$T/$nome-s"
  "$PG_BIN/initdb" -D "$T/$nome" -U postgres -A trust -E UTF8 --locale=C.UTF-8 --no-instructions > "$T/$nome-initdb.log" 2>&1
  "$PG_BIN/pg_ctl" -D "$T/$nome" -l "$T/$nome.log" -w -t 60 -o "-c listen_addresses='' -k $T/$nome-s -c fsync=off" start > /dev/null
  CLUSTERS+=("$T/$nome")
}
sql() { "$PG_BIN/psql" "host=$T/origem-s user=postgres dbname=$1" -X -q -v ON_ERROR_STOP=1 "${@:2}"; }

# ---- origem que imita o Supabase --------------------------------------------------------------------------------------
subir origem
sql postgres -c "create database treino" > /dev/null
sql postgres > /dev/null <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin; create role supabase_admin nologin;
SQL
BASE_SQL="$(cat <<'SQL'
create schema extensions;
create extension pgcrypto with schema extensions;
create extension pg_trgm with schema extensions;
create extension hstore with schema extensions;
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table auth.identities (
  provider_id text not null, user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null, provider text not null, created_at timestamptz default now(),
  id uuid primary key default gen_random_uuid());
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
insert into auth.users (id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data)
select gen_random_uuid(), 'teste' || g || '@exemplo.test', '$2a$10$abcdefghijklmnopqrstuv',
       jsonb_build_object('nome', 'Pessoa "Teste" ' || g, 'obs', E'barra \\ aspas '' tab\t fim'), '{"role":"aluno"}'
  from generate_series(1, 5) g;
insert into auth.identities (provider_id, user_id, identity_data, provider)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email' from auth.users;
create table public.perfis (id uuid primary key references auth.users (id) on delete cascade, nome text not null, papel text default 'aluno');
create table public.cobrancas (id bigserial primary key, perfil_id uuid not null references public.perfis (id) on delete cascade,
  valor numeric(10,2) not null, obs text);
create index cobrancas_obs_trgm on public.cobrancas using gin (obs extensions.gin_trgm_ops);
create table public.vazia (id int primary key);
alter table public.perfis enable row level security;
alter table public.cobrancas enable row level security;
alter table public.cobrancas force row level security;
alter table public.vazia enable row level security;
create policy perfis_dono on public.perfis for select to authenticated using (id = auth.uid());
create policy cobrancas_dono on public.cobrancas for all to authenticated using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
grant select on public.perfis to authenticated;
grant select, insert on public.cobrancas to authenticated, service_role;
create function public.total_do_perfil(p uuid) returns numeric language sql stable security definer set search_path = ''
  as $$ select coalesce(sum(valor), 0) from public.cobrancas where perfil_id = p $$;
revoke all on function public.total_do_perfil(uuid) from public;
grant execute on function public.total_do_perfil(uuid) to authenticated;
create view public.resumo with (security_invoker = true) as select perfil_id, count(*) as n from public.cobrancas group by 1;
alter default privileges for role supabase_admin in schema public grant all on tables to anon;
insert into public.perfis select id, raw_user_meta_data->>'nome' from auth.users;
insert into public.cobrancas (perfil_id, valor, obs)
select p.id, g * 10.5, E'linha ' || g || E'\ncom quebra, \\ barra, tab\t e ''aspas'''
  from public.perfis p, generate_series(1, 10) g;
create schema staging;
create table staging.notas (id serial primary key, perfil_id uuid references auth.users (id), txt text);
alter table staging.notas enable row level security;
insert into staging.notas (perfil_id, txt) select id, 'nota de teste' from auth.users limit 3;
SQL
)"
sql postgres > /dev/null <<< "$BASE_SQL"
sql treino > /dev/null <<< "$BASE_SQL"

# as 2 migrations da hml-07, como em produção: principal com {schema} (staging e public), Treino com physiq.schemas
MIG_P="$RAIZ/supabase-principal/migrations/20261008050000_hml07_papel_backup.sql"
MIG_T="$RAIZ/supabase/migrations/20261008050100_hml07_papel_backup_treino.sql"
for s in staging public; do sed "s/{schema}/$s/g" "$MIG_P" | sql postgres > /dev/null; done
for s in staging public; do { echo "set physiq.schemas = '$s';"; cat "$MIG_T"; } | sql treino > /dev/null; done
sql postgres -c "alter role physiq_backup login" > /dev/null

age-keygen -o "$T/teste.key" 2> /dev/null
age-keygen -y "$T/teste.key" > "$T/teste.pub"
age-keygen -o "$T/outra.key" 2> /dev/null
export AGE_DESTINATARIO_ARQ="$T/teste.pub" PHYSIQ_BACKUP_CONF="$T/conf" PHYSIQ_BACKUP_LOG="$T/copia.log"
mkdir -p "$T/conf"
DIA="$(date +%Y-%m-%d)"

# ---- 1. copia.sh ------------------------------------------------------------------------------------------------------
CONEXAO="host=$T/origem-s dbname=postgres user=physiq_backup" "$AQUI/copia.sh" principal --saida "$T/saida" > "$T/c1.out" 2>&1 || { cat "$T/c1.out"; exit 1; }
CONEXAO="host=$T/origem-s dbname=treino user=physiq_backup" "$AQUI/copia.sh" treino --saida "$T/saida" > "$T/c2.out" 2>&1 || { cat "$T/c2.out"; exit 1; }
ARQ="$T/saida/diario-$DIA-principal.tar.age"
confere "copia.sh principal: ensaio ok e .tar.age gravado" grep -q "principal/public ok: 3 tabelas, 55 linhas, 5 logins; ensaio ok" "$T/copia.log"
confere "copia.sh treino: ensaio ok e .tar.age gravado" test -s "$T/saida/diario-$DIA-treino.tar.age"
confere "arquivo cifrado com permissão 600" test "$(stat -c %a "$ARQ")" = 600
confere "o arquivo é age (não abre sem a chave)" bash -c "head -c 40 '$ARQ' | grep -q 'age-encryption.org/v1' && ! tar -tzf '$ARQ' > /dev/null 2>&1"
mkdir "$T/v1"
age -d -i "$T/teste.key" "$ARQ" | tar -xzf - -C "$T/v1"
M="$T/v1/diario-$DIA-principal/manifesto.tsv"
confere "manifesto: perfis 5, cobrancas 50, vazia 0, 5 logins e 5 identidades" \
  bash -c "grep -qx \$'public.perfis\t5' '$M' && grep -qx \$'public.cobrancas\t50' '$M' && grep -qx \$'public.vazia\t0' '$M' && grep -qx \$'auth.users\t5' '$M' && grep -qx \$'auth.identities\t5' '$M'"
confere "o staging não entra na cópia do public" bash -c "! grep -q '^staging\.' '$M'"
confere "nenhuma pasta temporária aberta ficou no /tmp" \
  bash -c "[ -z \"\$(find /tmp -maxdepth 4 -path '$T' -prune -o -name 'diario-$DIA-*' -print 2> /dev/null)\" ]"

# ---- 2. restaurar.sh com o .tar.age + a chave de teste -----------------------------------------------------------------
"$AQUI/restaurar.sh" "$ARQ" --identidade "$T/teste.key" --manter > "$T/r1.out" 2>&1 || { cat "$T/r1.out"; exit 1; }
confere "restaurar.sh: restauração ok com as linhas do manifesto" grep -q "restauração ok: 5 tabelas" "$T/r1.out"
R_SOCK="$(grep -oE 'host=[^ ]+' "$T/r1.out" | head -n1 | cut -d= -f2)"
R_DIR="$(grep -oE 'pg_ctl -D [^ ]+' "$T/r1.out" | head -n1 | cut -d' ' -f3)"
CLUSTERS+=("$R_DIR")
r() { "$PG_BIN/psql" "host=$R_SOCK user=postgres dbname=postgres" -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }
o() { "$PG_BIN/psql" "host=$T/origem-s user=postgres dbname=postgres" -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }
confere "texto com quebra, tab, barra e aspas volta igual (md5 das 50 cobranças)" \
  test "$(r "select md5(string_agg(obs || valor, '|' order by id)) from public.cobrancas")" = "$(o "select md5(string_agg(obs || valor, '|' order by id)) from public.cobrancas")"
confere "login volta inteiro (metadata com aspas e barra, hash da senha)" \
  test "$(r "select md5(string_agg((dados->'raw_user_meta_data')::text || (dados->>'encrypted_password'), '|' order by id)) from auth.users")" = "$(o "select md5(string_agg(raw_user_meta_data::text || encrypted_password, '|' order by id)) from auth.users")"
confere "RLS, políticas e o índice trigram vieram junto" \
  test "$(r "select (select count(*) from pg_policies where schemaname = 'public') || '/' || (select count(*) from pg_class where relname = 'cobrancas_obs_trgm') || '/' || (select relrowsecurity from pg_class where oid = 'public.cobrancas'::regclass)")" = "2/1/true"
"$PG_BIN/pg_ctl" -D "$R_DIR" -m fast stop > /dev/null
rm -rf "$(dirname "$R_DIR")"

# ---- 3. staging --------------------------------------------------------------------------------------------------------
confere "--schema staging sem --saida é recusado" bash -c "! CONEXAO=x '$AQUI/copia.sh' principal --schema staging > /dev/null 2>&1"
CONEXAO="host=$T/origem-s dbname=postgres user=physiq_backup" "$AQUI/copia.sh" principal --schema staging --saida "$T/saida-stg" > "$T/c3.out" 2>&1 || { cat "$T/c3.out"; exit 1; }
confere "--schema staging: arquivo staging-*-principal.tar.age com a tabela do staging" \
  bash -c "f=\$(ls '$T'/saida-stg/staging-*-principal.tar.age) && age -d -i '$T/teste.key' \"\$f\" | tar -xzOf - --wildcards '*/manifesto.tsv' | grep -qx \$'staging.notas\t3'"

# ---- 4. negativos -----------------------------------------------------------------------------------------------------
o "create table public.extra (h extensions.hstore); grant select on public.extra to physiq_backup; insert into public.extra values ('a=>1')" > /dev/null
set +e
CONEXAO="host=$T/origem-s dbname=postgres user=physiq_backup" "$AQUI/copia.sh" principal --saida "$T/saida-neg" > "$T/c4.out" 2>&1
rc=$?
set -e
confere "negativo: tipo desconhecido no ensaio → saída ≠ 0" test "$rc" -ne 0
confere "negativo: nada gravado (nem o .parcial)" bash -c "[ -z \"\$(ls -A '$T/saida-neg' 2> /dev/null)\" ]"
confere "negativo: o log diz FALHOU" grep -q "principal/public FALHOU" "$T/copia.log"
o "drop table public.extra" > /dev/null
confere "negativo: o papel physiq_backup não escreve (sessão só leitura)" \
  bash -c "! '$PG_BIN/psql' 'host=$T/origem-s user=physiq_backup dbname=postgres' -X -q -v ON_ERROR_STOP=1 -c 'delete from public.vazia' > /dev/null 2>&1"
confere "negativo: o papel não lê o schema auth direto" \
  bash -c "! '$PG_BIN/psql' 'host=$T/origem-s user=physiq_backup dbname=postgres' -X -q -v ON_ERROR_STOP=1 -c 'select 1 from auth.users limit 1' > /dev/null 2>&1"
confere "negativo: anon/authenticated não executam backup.logins_usuarios()" \
  test "$(o "select has_function_privilege('anon', 'backup.logins_usuarios()', 'execute')::text || has_function_privilege('authenticated', 'backup.logins_usuarios()', 'execute')::text")" = "falsefalse"

# ---- 5. cifrar-copias-manuais.sh --------------------------------------------------------------------------------------
B="$T/bk"
mkdir -p "$B/velha/sub" "$B/nova"
printf 'dado 1\n' > "$B/velha/a.json"
printf 'dado 2 com espaço\n' > "$B/velha/sub/b c.txt"
printf 'solto\n' > "$B/solto.sql"
printf 'nova\n' > "$B/nova/x.json"
cp "$ARQ" "$B/ja.tar.age"
touch -d '3 hours ago' "$B/velha/a.json" "$B/velha/sub/b c.txt" "$B/velha/sub" "$B/velha" "$B/solto.sql"
ESPERADA="$(date -d "$(stat -c %y "$B/velha/a.json")" +%s)"
export PHYSIQ_BACKUP_LOG="$T/cifrar.log"
"$AQUI/cifrar-copias-manuais.sh" --dir "$B" --simular > /dev/null
confere "--simular não mexe em nada" bash -c "[ -d '$B/velha' ] && [ ! -e '$B/velha.tar.age' ]"
"$AQUI/cifrar-copias-manuais.sh" --dir "$B" --idade-min 120 > "$T/s1.out" 2>&1 || { cat "$T/s1.out"; exit 1; }
confere "velha → velha.tar.age (600) e a aberta saiu" bash -c "[ -s '$B/velha.tar.age' ] && [ ! -e '$B/velha' ] && [ \"\$(stat -c %a '$B/velha.tar.age')\" = 600 ]"
confere "arquivo solto também foi cifrado" bash -c "[ -s '$B/solto.sql.tar.age' ] && [ ! -e '$B/solto.sql' ]"
confere "a nova (mexida agora) ficou aberta" test -f "$B/nova/x.json"
confere "o .age que já existia ficou igual" cmp -s "$ARQ" "$B/ja.tar.age"
confere "o .tar.age leva a data da cópia (limpeza de 30 dias)" test "$(stat -c %Y "$B/velha.tar.age")" = "$ESPERADA"
mkdir "$T/v2"
age -d -i "$T/teste.key" "$B/velha.tar.age" | tar -xf - -C "$T/v2"
confere "volta igual: sha256sum -c do SHA256SUMS de dentro" bash -c "cd '$T/v2' && sha256sum --quiet --strict -c SHA256SUMS && [ \"\$(cat 'velha/sub/b c.txt')\" = 'dado 2 com espaço' ]"
mkdir -p "$B/velha"
printf 'outra rodada\n' > "$B/velha/c.json"
touch -d '3 hours ago' "$B/velha/c.json" "$B/velha"
AGE_IDENTIDADE="$T/teste.key" "$AQUI/cifrar-copias-manuais.sh" --dir "$B" > "$T/s2.out" 2>&1 || { cat "$T/s2.out"; exit 1; }
confere "nome repetido ganha sufixo e a 1ª fica" bash -c "ls '$B'/velha-*.tar.age > /dev/null && [ -s '$B/velha.tar.age' ] && [ ! -e '$B/velha' ]"
confere "com AGE_IDENTIDADE a volta é conferida antes de apagar" grep -q "conferida (decifrada, 1 arquivos com o mesmo sha256)" "$T/cifrar.log"
mkdir -p "$B/errada"
printf 'x\n' > "$B/errada/x"
touch -d '3 hours ago' "$B/errada/x" "$B/errada"
set +e
AGE_IDENTIDADE="$T/outra.key" "$AQUI/cifrar-copias-manuais.sh" --dir "$B" > "$T/s3.out" 2>&1
rc=$?
set -e
confere "chave errada na conferência: saída ≠ 0 e a aberta FICA" bash -c "[ $rc -ne 0 ] && [ -f '$B/errada/x' ] && [ ! -e '$B/errada.tar.age' ] && [ ! -e '$B/.errada.parcial' ]"

# ---- 6. limpeza.sh -----------------------------------------------------------------------------------------------------
mkdir -p "$T/lp"
touch -d '30 days ago' "$T/lp/velha.tar.age"
touch -d '10 days ago' "$T/lp/recente.tar.age"
PHYSIQ_BACKUP_LOG="$T/limpeza.log" "$AQUI/limpeza.sh" --simular --dir "$T/lp" > "$T/l.out" 2>&1
confere "limpeza --simular: só a de 30 dias" bash -c "grep -q 'apagaria velha.tar.age' '$T/l.out' && ! grep -q recente '$T/l.out' && [ -e '$T/lp/velha.tar.age' ]"

echo
echo "resultado: $OK ok, $FALHAS falha(s)"
[ "$FALHAS" -eq 0 ]
