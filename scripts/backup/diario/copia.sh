#!/usr/bin/env bash
# Cópia de segurança diária do Physiq (hml-07, homologação 08/10/2026 — achado H-21). Roda no notebook pelo timer do
# systemd do usuário (physiq-backup-diario.timer, ver instalar.sh) e à mão. Nunca grava nada no banco.
#
# Uso: copia.sh <principal|treino|todos> [--schema public|staging] [--saida <pasta>] [--sem-ensaio]
#
# Para cada projeto, numa pasta temporária (no notebook o /tmp é tmpfs: o arquivo aberto não toca o disco):
#   1. abre uma transação só leitura e exporta a foto dela (pg_export_snapshot): os logins e o pg_dump saem da MESMA foto,
#      então uma conta criada ou apagada durante a cópia não deixa linha apontando para login que não está na cópia;
#   2. logins: auth.users e auth.identities em jsonl pelas funções backup.logins_* (o papel não lê o schema auth);
#   3. pg_dump do schema (formato custom, sem dono, com as permissões, sem publicações) com o papel physiq_backup;
#   4. manifesto.tsv: linhas por tabela contadas NO PRÓPRIO ARQUIVO + os logins;
#   5. ensaio de restauração (restaurar.sh): um Postgres descartável (initdb, só socket local, sem TCP) recebe os logins e
#      o pg_restore inteiro numa transação; as linhas de cada tabela têm que bater com o manifesto (--sem-ensaio pula);
#   6. tar.gz cifrado com age para a chave PÚBLICA de destinatario.age (a privada fica só no cofre) →
#      <saida>/diario-AAAA-MM-DD-<projeto>.tar.age (600; a 2ª cópia do mesmo dia substitui a 1ª).
# Falhou qualquer passo: nada é gravado e a saída é diferente de 0 (o systemd avisa pelo OnFailure).
# Guarda: o timer physiq-backups-limpeza apaga do 1º nível de ~/backups/physiq o que tem 29+ dias (Política: até 30 dias).
#
# Configuração em ~/.config/physiq-backup/ (fora do git; PHYSIQ_BACKUP_CONF muda a pasta):
#   pgpass    senha do papel physiq_backup de cada projeto (formato do .pgpass, 600)
#   ambiente  lido pelo bash: PG_BIN (pasta com pg_dump, psql, pg_restore, initdb e pg_ctl, versão ≥ 17) e, se precisar,
#             LD_LIBRARY_PATH — o instalar.sh escreve
# Para teste: CONEXAO (conninfo da origem no lugar do pooler), AGE_DESTINATARIO_ARQ (outra chave pública),
# PHYSIQ_BACKUP_LOG (outro arquivo de log).
# Restaurar: docs/backup.md.
set -euo pipefail
umask 077

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="${PHYSIQ_BACKUP_CONF:-$HOME/.config/physiq-backup}"
LOG="${PHYSIQ_BACKUP_LOG:-$HOME/.local/state/physiq-backup/copia.log}"
DESTINATARIO="${AGE_DESTINATARIO_ARQ:-$AQUI/destinatario.age}"

declare -A POOLER=([principal]=aws-0-sa-east-1.pooler.supabase.com [treino]=aws-1-us-east-1.pooler.supabase.com)
declare -A REF=([principal]=hkxvtsbwctxkrqzkkdoz [treino]=uxwpwdbbnlticxgtzcsb)

uso() { echo "uso: copia.sh <principal|treino|todos> [--schema public|staging] [--saida <pasta>] [--sem-ensaio]" >&2; exit 2; }

ALVO="${1:-}"
[ -n "$ALVO" ] || uso
shift
SCHEMA=public
SAIDA=""
ENSAIO=1
while [ $# -gt 0 ]; do
  case "$1" in
    --schema) shift; SCHEMA="${1:-}" ;;
    --saida) shift; SAIDA="${1:-}" ;;
    --sem-ensaio) ENSAIO=0 ;;
    *) uso ;;
  esac
  shift
done
case "$SCHEMA" in public | staging) ;; *) echo "schema inválido: $SCHEMA" >&2; exit 2 ;; esac
case "$ALVO" in principal | treino | todos) ;; *) uso ;; esac
if [ -z "$SAIDA" ]; then
  # a cópia de staging (teste) nunca cai na pasta das cópias de verdade
  [ "$SCHEMA" = public ] || { echo "--schema staging precisa de --saida" >&2; exit 2; }
  SAIDA="$HOME/backups/physiq"
fi

# shellcheck source=/dev/null
[ -f "$CONF/ambiente" ] && . "$CONF/ambiente"
if [ -z "${PG_BIN:-}" ] && command -v pg_config >/dev/null 2>&1; then PG_BIN="$(pg_config --bindir)"; fi
for b in pg_dump pg_restore psql; do
  [ -x "${PG_BIN:-}/$b" ] || { echo "sem $b em PG_BIN='${PG_BIN:-}' (defina em $CONF/ambiente)" >&2; exit 2; }
done
export LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}"
[ -f "$CONF/pgpass" ] && export PGPASSFILE="$CONF/pgpass"
[ -s "$DESTINATARIO" ] || { echo "sem a chave pública do age: $DESTINATARIO" >&2; exit 2; }
command -v age >/dev/null 2>&1 || { echo "sem o age no PATH" >&2; exit 2; }
mkdir -p "$SAIDA" "$(dirname "$LOG")"

registrar() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

# ---- limpeza: pasta temporária e a sessão da foto (o Postgres do ensaio é do restaurar.sh, que limpa o dele) ---------
TMP_RAIZ="$(mktemp -d)"
COPROC_PID=""
limpar() {
  if [ -n "$COPROC_PID" ]; then kill "$COPROC_PID" 2> /dev/null || true; fi
  rm -rf "${TMP_RAIZ:?}"
}
trap limpar EXIT

# ---- 1 a 4: tirar a cópia ---------------------------------------------------------------------------------------------
# Lê da sessão da foto (coproc FOTO) até a linha marcadora; o que vier antes é a resposta. Erro do psql = falha.
FOTO_FIM='@@fim@@'
foto_pedir() { printf '%s\n\\echo %s\n' "$1" "$FOTO_FIM" >&"${FOTO[1]}"; }
foto_ler() {
  local linha resposta=""
  while IFS= read -r -t 600 linha <&"${FOTO[0]}"; do
    [ "$linha" = "$FOTO_FIM" ] && { printf '%s' "$resposta"; return 0; }
    case "$linha" in *ERROR:* | *ERRO:* | *FATAL:* | *"could not"* | *"não pôde"*) echo "psql: $linha" >&2; return 1 ;; esac
    resposta+="$linha"$'\n'
  done
  echo "a sessão da foto não respondeu" >&2
  return 1
}

tirar_copia() {
  local projeto="$1" d="$2" conexao
  conexao="${CONEXAO:-host=${POOLER[$projeto]} port=5432 dbname=postgres user=physiq_backup.${REF[$projeto]} sslmode=require connect_timeout=20 application_name=physiq-backup}"

  coproc FOTO { "$PG_BIN/psql" "$conexao" -X -q -A -t -v ON_ERROR_STOP=1 2>&1; }
  COPROC_PID="$FOTO_PID"
  local foto versao
  foto_pedir "begin isolation level repeatable read read only;"
  foto_ler >/dev/null
  foto_pedir "select pg_export_snapshot();"
  foto="$(foto_ler)"
  foto="${foto%%$'\n'*}"
  [[ "$foto" =~ ^[0-9A-F-]+$ ]] || { echo "foto inválida: '$foto'" >&2; return 1; }
  foto_pedir "select current_setting('server_version');"
  versao="$(foto_ler)"
  versao="${versao%%$'\n'*}"

  echo "▶ $projeto/$SCHEMA: logins (foto $foto)"
  foto_pedir "\\copy (select backup.logins_usuarios()) to '$d/logins_usuarios.jsonl'"
  foto_ler >/dev/null
  foto_pedir "\\copy (select backup.logins_identidades()) to '$d/logins_identidades.jsonl'"
  foto_ler >/dev/null

  echo "▶ $projeto/$SCHEMA: pg_dump"
  local extra=() ajuda
  ajuda="$("$PG_BIN/pg_dump" --help)"
  [[ "$ajuda" == *--no-statistics* ]] && extra+=(--no-statistics)
  "$PG_BIN/pg_dump" "$conexao" --snapshot="$foto" --schema="$SCHEMA" --format=custom --no-owner \
    --no-publications --no-subscriptions --lock-wait-timeout=60s "${extra[@]}" --file="$d/banco.dump"

  foto_pedir "commit;"
  foto_ler >/dev/null
  printf '\\q\n' >&"${FOTO[1]}"
  wait "$COPROC_PID" 2>/dev/null || true
  COPROC_PID=""

  # Linhas por tabela contadas no arquivo (COPY … FROM stdin; até a linha "\.").
  "$PG_BIN/pg_restore" --data-only --file=- "$d/banco.dump" |
    awk '/^COPY /{t=$2; n=0; next} /^\\\.$/{if (t != "") print t "\t" n; t=""; next} t != ""{n++}' |
    sort > "$d/manifesto.tsv"
  local tabelas linhas usuarios identidades
  tabelas="$(wc -l < "$d/manifesto.tsv")"
  linhas="$(awk -F'\t' '{s+=$2} END{print s+0}' "$d/manifesto.tsv")"
  usuarios="$(wc -l < "$d/logins_usuarios.jsonl")"
  identidades="$(wc -l < "$d/logins_identidades.jsonl")"
  if [ "$tabelas" -eq 0 ] || [ "$usuarios" -eq 0 ]; then
    echo "cópia vazia: $tabelas tabelas, $usuarios logins" >&2
    return 1
  fi
  printf 'auth.users\t%s\nauth.identities\t%s\n' "$usuarios" "$identidades" >> "$d/manifesto.tsv"
  {
    echo "projeto=$projeto schema=$SCHEMA servidor=$versao"
    echo "pg_dump=$("$PG_BIN/pg_dump" --version)"
    echo "scripts=$(cat "$AQUI/VERSAO" 2>/dev/null || echo 'fora da instalação')"
    echo "tabelas=$tabelas linhas=$linhas logins=$usuarios identidades=$identidades"
  } > "$d/versoes.txt"
  RESUMO="$tabelas tabelas, $linhas linhas, $usuarios logins"
}

# ---- 6: cifrar e gravar -----------------------------------------------------------------------------------------------
um_projeto() {
  local projeto="$1"
  local dia nome base d arquivo
  dia="$(date +%Y-%m-%d)"
  if [ "$SCHEMA" = public ]; then nome="diario-$dia-$projeto"; else nome="$SCHEMA-$(date +%Y-%m-%dT%H%M)-$projeto"; fi
  base="$(mktemp -d "$TMP_RAIZ/$projeto.XXXX")"
  d="$base/$nome"
  mkdir -p "$d"
  RESUMO=""
  tirar_copia "$projeto" "$d"
  local ensaio="não rodou (--sem-ensaio)"
  if [ "$ENSAIO" = 1 ]; then
    echo "▶ $projeto/$SCHEMA: ensaio de restauração"
    "$AQUI/restaurar.sh" "$d"
    ensaio="ok"
  fi
  cp "$AQUI/preparar-restauro.sql" "$d/"
  cat > "$d/LEIA-ME.txt" <<TXT
Cópia de segurança do Physiq — banco $projeto (${REF[$projeto]}), schema $SCHEMA — $(date -u '+%Y-%m-%d %H:%M') UTC
$RESUMO. Ensaio de restauração: $ensaio.
banco.dump = pg_dump -Fc do schema · logins_*.jsonl = auth.users/auth.identities (formato do COPY) · manifesto.tsv =
linhas por tabela · preparar-restauro.sql = o que um Postgres comum precisa antes do pg_restore.
Restaurar: docs/backup.md no repositório weslleybertoldo/physiqcalc.
TXT
  arquivo="$SAIDA/$nome.tar.age"
  tar -C "$base" -czf - "$nome" | age -R "$DESTINATARIO" -o "$SAIDA/.$nome.parcial"
  [ -s "$SAIDA/.$nome.parcial" ] || { echo "arquivo cifrado vazio" >&2; return 1; }
  mv -f "$SAIDA/.$nome.parcial" "$arquivo"
  rm -rf "${base:?}"
  registrar "$projeto/$SCHEMA ok: $RESUMO; ensaio $ensaio; $(basename "$arquivo") $(du -h "$arquivo" | cut -f1)"
}

falhas=()
if [ "$ALVO" = todos ]; then lista=(principal treino); else lista=("$ALVO"); fi
for projeto in "${lista[@]}"; do
  # Cada projeto num subshell: a falha de um não impede o outro e o trap de cada um limpa o que ele abriu. O subshell
  # roda FORA de condição (if/||/&&), senão o bash ignora o set -e lá dentro e um passo que falha não pararia a cópia.
  set +e
  (
    set -e
    trap limpar EXIT
    TMP_RAIZ="$(mktemp -d)"
    um_projeto "$projeto"
  )
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    rm -f "$SAIDA"/.*"-$projeto.parcial" 2> /dev/null || true
    registrar "$projeto/$SCHEMA FALHOU (saída $rc; ver o journal da unidade ou a saída acima)"
    falhas+=("$projeto")
  fi
done
[ "${#falhas[@]}" -eq 0 ] || { echo "falhou: ${falhas[*]}" >&2; exit 1; }
