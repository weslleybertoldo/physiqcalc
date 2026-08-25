#!/usr/bin/env bash
# Deploy da edge function admin-relatorio via Management API (multipart).
# PATCH JSON corrompe os primeiros bytes do source (BOOT_ERROR) e sem User-Agent
# a Cloudflare bloqueia com 403/1010 — por isso multipart + UA de CLI.
set -euo pipefail

REF="uxwpwdbbnlticxgtzcsb"
SLUG="admin-relatorio"
PAT="${SUPABASE_PAT:?defina SUPABASE_PAT}"
ARQ="supabase/functions/${SLUG}/index.ts"

test -f "$ARQ" || { echo "arquivo nao encontrado: $ARQ"; exit 1; }

echo "deployando ${SLUG} ($(wc -l < "$ARQ") linhas)..."

curl -sS -X POST \
  "https://api.supabase.com/v1/projects/${REF}/functions/deploy?slug=${SLUG}" \
  -H "Authorization: Bearer ${PAT}" \
  -H "User-Agent: supabase-cli/2.x" \
  -F 'metadata={"entrypoint_path":"index.ts","name":"admin-relatorio","verify_jwt":true};type=application/json' \
  -F "file=@${ARQ};type=application/typescript" \
  -o /tmp/deploy_out.json -w "http=%{http_code}\n"

cat /tmp/deploy_out.json
echo
echo "--- estado atual ---"
curl -sS "https://api.supabase.com/v1/projects/${REF}/functions/${SLUG}" \
  -H "Authorization: Bearer ${PAT}" -H "User-Agent: supabase-cli/2.x" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('slug', d['slug'], '| status', d['status'], '| v', d['version'], '| verify_jwt', d['verify_jwt'])"
