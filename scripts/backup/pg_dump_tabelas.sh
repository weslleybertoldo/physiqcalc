#!/usr/bin/env bash
# Backup (pg_dump -Fc) de tabelas do BANCO DO TREINO do Physiq (Supabase uxwpwdbbnlticxgtzcsb) + contagem de linhas.
#
# Uso:  scripts/backup/pg_dump_tabelas.sh <pasta> <schemas separados por vírgula> <tabela> [tabela...]
#   ex.: scripts/backup/pg_dump_tabelas.sh ~/backups/physiq/2026-09-29-w02/treino staging physiq_profiles tb_academias
#   Contagem depois da migração (sem dump):  SO_CONTAR=1 ROTULO=depois scripts/backup/pg_dump_tabelas.sh <pasta> ...
#
# Conexão: pooler de SESSÃO (IPv4) com a senha em ~/.pgpass (nada de senha na linha de comando).
# Restaurar uma tabela:  pg_restore -d "<conexão>" --data-only -t <tabela> -n <schema> <arquivo>.dump
set -euo pipefail

PASTA="${1:?pasta de destino}"
SCHEMAS="${2:?schemas (ex.: staging,public)}"
shift 2
[ "$#" -ge 1 ] || { echo "informe ao menos uma tabela" >&2; exit 2; }

CONN="${TREINO_CONN:-host=aws-1-us-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.uxwpwdbbnlticxgtzcsb sslmode=require}"
ROTULO="${ROTULO:-antes}"
mkdir -p "$PASTA"
chmod 700 "$PASTA"
CONTAGEM="$PASTA/contagens-$ROTULO.txt"

IFS=',' read -r -a LISTA_SCHEMAS <<< "$SCHEMAS"
for s in "${LISTA_SCHEMAS[@]}"; do
  [[ "$s" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "schema inválido: $s" >&2; exit 2; }
  for t in "$@"; do
    [[ "$t" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "tabela inválida: $t" >&2; exit 2; }
    n="$(psql "$CONN" -Atc "select count(*) from ${s}.${t}")"
    printf '%-48s %s\n' "${s}.${t}" "$n" | tee -a "$CONTAGEM"
    if [ -z "${SO_CONTAR:-}" ]; then
      arq="$PASTA/${s}.${t}.dump"
      pg_dump "$CONN" -Fc --no-owner --no-privileges -t "${s}.${t}" -f "$arq"
      chmod 600 "$arq"
    fi
  done
done
echo "contagens → $CONTAGEM"
