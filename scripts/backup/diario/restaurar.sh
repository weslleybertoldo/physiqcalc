#!/usr/bin/env bash
# Restaura uma cópia de segurança do Physiq num Postgres comum e confere as linhas de cada tabela com o manifesto
# (hml-07, homologação 08/10/2026 — achado H-21). Nunca toca o Supabase.
#   - o copia.sh chama todo dia com a pasta ainda aberta (o ENSAIO, antes de cifrar);
#   - à mão, com o .tar.age + a chave PRIVADA do cofre: restauração de teste e de emergência (docs/backup.md).
#
# Uso: restaurar.sh <pasta da cópia | arquivo .tar.age> [--identidade <arquivo da chave privada>] [--manter]
#   Sobe um Postgres descartável (initdb numa pasta temporária, só socket local, sem TCP), cria os papéis que a cópia
#   cita, roda o preparar-restauro.sql, carrega os logins, faz o pg_restore inteiro numa transação e compara as linhas.
#   Sem --manter o Postgres é apagado no fim; com --manter fica de pé para consulta (a saída diz como conectar e parar).
#   A chave privada também pode vir em AGE_IDENTIDADE. Saída 0 = restaurou e as linhas batem.
# PG_BIN/LD_LIBRARY_PATH: ~/.config/physiq-backup/ambiente (PHYSIQ_BACKUP_CONF muda a pasta).
set -euo pipefail
umask 077

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${PHYSIQ_BACKUP_CONF:-$HOME/.config/physiq-backup}"
uso() { echo "uso: restaurar.sh <pasta da cópia | arquivo .tar.age> [--identidade <arquivo>] [--manter]" >&2; exit 2; }

ORIGEM="${1:-}"
[ -n "$ORIGEM" ] || uso
shift
IDENTIDADE="${AGE_IDENTIDADE:-}"
MANTER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --identidade) shift; IDENTIDADE="${1:-}" ;;
    --manter) MANTER=1 ;;
    *) uso ;;
  esac
  shift
done

# shellcheck source=/dev/null
[ -f "$CONF/ambiente" ] && . "$CONF/ambiente"
if [ -z "${PG_BIN:-}" ] && command -v pg_config > /dev/null 2>&1; then PG_BIN="$(pg_config --bindir)"; fi
for b in pg_restore psql initdb pg_ctl; do
  [ -x "${PG_BIN:-}/$b" ] || { echo "sem $b em PG_BIN='${PG_BIN:-}' (defina em $CONF/ambiente)" >&2; exit 2; }
done
export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"

BASE="$(mktemp -d)"
PG=""
fim() {
  if [ "$MANTER" = 1 ] && [ -n "$PG" ]; then return 0; fi
  if [ -n "$PG" ] && [ -f "$PG/postmaster.pid" ]; then "$PG_BIN/pg_ctl" -D "$PG" -m immediate stop > /dev/null 2>&1 || true; fi
  rm -rf "${BASE:?}"
}
trap fim EXIT

# ---- a cópia aberta ---------------------------------------------------------------------------------------------------
if [ -d "$ORIGEM" ]; then
  D="$(cd "$ORIGEM" && pwd)"
else
  case "$ORIGEM" in *.tar.age) ;; *) echo "esperava uma pasta ou um .tar.age: $ORIGEM" >&2; exit 2 ;; esac
  [ -n "$IDENTIDADE" ] || { echo "o .tar.age precisa da chave privada (--identidade ou AGE_IDENTIDADE)" >&2; exit 2; }
  command -v age > /dev/null 2>&1 || { echo "sem o age no PATH" >&2; exit 2; }
  mkdir "$BASE/aberta"
  age -d -i "$IDENTIDADE" "$ORIGEM" | tar -xzf - -C "$BASE/aberta"
  D="$(find "$BASE/aberta" -mindepth 1 -maxdepth 1 -type d | head -n1)"
fi
for f in banco.dump manifesto.tsv logins_usuarios.jsonl logins_identidades.jsonl; do
  [ -f "$D/$f" ] || { echo "a cópia não tem $f" >&2; exit 1; }
done
SQL_PREPARAR="$D/preparar-restauro.sql"
[ -f "$SQL_PREPARAR" ] || SQL_PREPARAR="$AQUI/preparar-restauro.sql"

# ---- Postgres descartável ---------------------------------------------------------------------------------------------
SOCK="$BASE/s"
mkdir -p "$SOCK"
PG="$BASE/pg"
"$PG_BIN/initdb" -D "$PG" -U postgres -A trust -E UTF8 --locale=C.UTF-8 --no-instructions > "$BASE/initdb.log" 2>&1
"$PG_BIN/pg_ctl" -D "$PG" -l "$BASE/postgres.log" -w -t 120 \
  -o "-c listen_addresses='' -k $SOCK -c fsync=off -c full_page_writes=off -c synchronous_commit=off" start > /dev/null
ALVO="host=$SOCK dbname=postgres user=postgres"

# Papéis que a cópia cita (GRANT/REVOKE, ALTER DEFAULT PRIVILEGES, políticas): cria os que faltam, vazios e sem login.
papeis="$("$PG_BIN/pg_restore" --schema-only --file=- "$D/banco.dump" |
  grep -E '^(GRANT|REVOKE|ALTER DEFAULT PRIVILEGES|CREATE POLICY) ' |
  grep -oE '\b(TO|FROM|ROLE) [a-z_][a-z0-9_]*(, ?[a-z_][a-z0-9_]*)*' |
  sed -E 's/^(TO|FROM|ROLE) //' | tr ',' '\n' | tr -d ' ' | grep -E '^[a-z_][a-z0-9_]*$' | sort -u || true)"
for p in $papeis; do
  # o nome já passou pelo filtro ^[a-z_][a-z0-9_]*$
  printf 'do $$ begin if not exists (select 1 from pg_roles where rolname = %s) then create role %s nologin; end if; end $$;\n' \
    "'$p'" "\"$p\""
done | "$PG_BIN/psql" "$ALVO" -X -q -v ON_ERROR_STOP=1 > /dev/null
"$PG_BIN/psql" "$ALVO" -X -q -v ON_ERROR_STOP=1 -f "$SQL_PREPARAR" > /dev/null
"$PG_BIN/psql" "$ALVO" -X -q -v ON_ERROR_STOP=1 > /dev/null <<SQL
create temp table l (j jsonb);
\\copy l from '$D/logins_usuarios.jsonl'
insert into auth.users (id, email, dados) select (j->>'id')::uuid, j->>'email', j from l;
create temp table i (j jsonb);
\\copy i from '$D/logins_identidades.jsonl'
insert into auth.identities (id, user_id, dados) select (j->>'id')::uuid, (j->>'user_id')::uuid, j from i;
SQL
# O pg_dump com --schema=public grava o CREATE SCHEMA public, que todo banco novo já tem: a lista tira só essa linha
# (o comentário e as permissões do schema continuam). A cópia do staging cria o schema dela normalmente.
"$PG_BIN/pg_restore" -l "$D/banco.dump" | grep -vE '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public ' > "$BASE/lista.txt"
"$PG_BIN/pg_restore" --dbname="$ALVO" --no-owner --exit-on-error --single-transaction -L "$BASE/lista.txt" "$D/banco.dump"

# ---- conferência: linhas de cada tabela (e os logins) = manifesto ------------------------------------------------------
consulta="$(awk -F'\t' '{printf "%sselect %s, count(*) from %s", (NR > 1 ? " union all " : ""), "\x27" $1 "\x27", $1}' "$D/manifesto.tsv")"
"$PG_BIN/psql" "$ALVO" -X -A -t -F $'\t' -v ON_ERROR_STOP=1 -c "$consulta" | sort > "$BASE/restaurado.tsv"
if ! diff <(sort "$D/manifesto.tsv") "$BASE/restaurado.tsv" > "$BASE/diferenca.txt"; then
  echo "restauração NÃO bate com o manifesto da cópia:" >&2
  head -n 20 "$BASE/diferenca.txt" >&2
  exit 1
fi
echo "  restauração ok: $(wc -l < "$BASE/restaurado.tsv") tabelas (com os logins) com as mesmas linhas do manifesto"
if [ "$MANTER" = 1 ]; then
  echo "  Postgres de pé para consulta:  $PG_BIN/psql \"$ALVO\""
  echo "  parar e apagar:                $PG_BIN/pg_ctl -D $PG -m fast stop && rm -rf $BASE"
else
  "$PG_BIN/pg_ctl" -D "$PG" -m fast stop > /dev/null
fi
