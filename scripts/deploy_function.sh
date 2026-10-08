#!/usr/bin/env bash
# Publica UMA edge function do Physiq (Banco do Treino ou banco principal) com o verify_jwt certo, pelo Supabase CLI
# (empacota os imports relativos, inclusive ../_shared/, e não precisa de Docker: --use-api).
#
# Uso:  scripts/deploy_function.sh <ref> <pasta das funções> <slug> <verify_jwt: true|false>
#   Treino:     scripts/deploy_function.sh uxwpwdbbnlticxgtzcsb supabase/functions trocar-token false
#   Principal:  scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-assinar true
#
# Trava de segurança: se a função já existe com OUTRO verify_jwt, para (mp-webhook, whatsapp-agente, trocar-token e as
# espelho-* precisam de false; o antigo workflow deploy-function.yml, que saiu na hml-13, ligava o verify_jwt e derrubava essas). Pra trocar de propósito:
# FORCAR_VERIFY_JWT=1. PAT em ~/.pc-pat (a Management API exige User-Agent).
set -euo pipefail

REF="${1:?ref do projeto}"
PASTA="${2:?pasta das funções (supabase/functions ou supabase-principal/functions)}"
SLUG="${3:?slug da função}"
VERIFY="${4:?verify_jwt: true|false}"
case "$REF" in uxwpwdbbnlticxgtzcsb|hkxvtsbwctxkrqzkkdoz) ;; *) echo "ref desconhecido: $REF" >&2; exit 2 ;; esac
case "$VERIFY" in true|false) ;; *) echo "verify_jwt precisa ser true ou false" >&2; exit 2 ;; esac
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "slug inválido: $SLUG" >&2; exit 2; }
[ -f "$PASTA/$SLUG/index.ts" ] || { echo "não achei $PASTA/$SLUG/index.ts" >&2; exit 2; }

PAT="$(cat "$HOME/.pc-pat")"
UA="physiq-unificado/1.0 (deploy_function)"
API="https://api.supabase.com/v1/projects/$REF/functions/$SLUG"

atual="$(curl -sS -w '\n%{http_code}' "$API" -H "Authorization: Bearer $PAT" -H "User-Agent: $UA")"
codigo="${atual##*$'\n'}"
corpo="${atual%$'\n'*}"
if [ "$codigo" = "200" ]; then
  vj_atual="$(printf '%s' "$corpo" | python3 -c 'import json,sys; print(str(json.load(sys.stdin)["verify_jwt"]).lower())')"
  echo "atual: $SLUG verify_jwt=$vj_atual"
  if [ "$vj_atual" != "$VERIFY" ] && [ -z "${FORCAR_VERIFY_JWT:-}" ]; then
    echo "PAROU: $SLUG está com verify_jwt=$vj_atual e o pedido é $VERIFY (use FORCAR_VERIFY_JWT=1 se for de propósito)" >&2
    exit 3
  fi
elif [ "$codigo" = "404" ]; then
  echo "função nova: $SLUG"
else
  echo "erro ao consultar a função ($codigo): $corpo" >&2
  exit 4
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/supabase/functions"
cp -r "$PASTA/$SLUG" "$TMP/supabase/functions/$SLUG"
[ -d "$PASTA/_shared" ] && cp -r "$PASTA/_shared" "$TMP/supabase/functions/_shared"
printf 'project_id = "%s"\n\n[functions.%s]\nverify_jwt = %s\n' "$REF" "$SLUG" "$VERIFY" > "$TMP/supabase/config.toml"

FLAG=()
[ "$VERIFY" = "false" ] && FLAG=(--no-verify-jwt)
SUPABASE_ACCESS_TOKEN="$PAT" npx -y supabase@2.118.0 functions deploy "$SLUG" --project-ref "$REF" --use-api --workdir "$TMP" "${FLAG[@]}" < /dev/null

depois="$(curl -sS "$API" -H "Authorization: Bearer $PAT" -H "User-Agent: $UA")"
vj="$(printf '%s' "$depois" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(str(d["verify_jwt"]).lower(), d["version"], d["status"])')"
echo "publicada: $SLUG → verify_jwt/versão/status = $vj"
[ "${vj%% *}" = "$VERIFY" ] || { echo "ATENÇÃO: verify_jwt ficou diferente do pedido!" >&2; exit 5; }
