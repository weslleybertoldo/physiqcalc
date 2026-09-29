#!/usr/bin/env bash
# Publica o Worker physiq-principal-api na Cloudflare PESSOAL e liga o domínio api-principal.physiqcalc.com.br
# (custom domain do Worker: a Cloudflare cria o registro DNS e o certificado). Idempotente.
# Token: ~/.cloudflare-pessoal-token (Workers Scripts + Workers Routes/Custom Domains na conta/zona); conta:
# ~/.cloudflare-pessoal-account. Zona physiqcalc.com.br = efa77ce5a75431cf5ae1a4c176a8d7dd.
set -euo pipefail
cd "$(dirname "$0")"
TOKEN="$(cat "$HOME/.cloudflare-pessoal-token")"
CONTA="$(cat "$HOME/.cloudflare-pessoal-account")"
ZONA="efa77ce5a75431cf5ae1a4c176a8d7dd"
NOME="physiq-principal-api"
HOST="api-principal.physiqcalc.com.br"
API="https://api.cloudflare.com/client/v4/accounts/$CONTA/workers"

echo "→ script"
curl -sS -X PUT "$API/scripts/$NOME" -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-09-01","compatibility_flags":["nodejs_compat"]};type=application/json' \
  -F "worker.js=@worker.js;type=application/javascript+module" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"))'

echo "→ endereço reserva *.workers.dev"
curl -sS -X POST "$API/scripts/$NOME/subdomain" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"))'

echo "→ domínio $HOST"
curl -sS -X PUT "$API/domains" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"environment\":\"production\",\"hostname\":\"$HOST\",\"service\":\"$NOME\",\"zone_id\":\"$ZONA\"}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"), (d.get("result") or {}).get("hostname"))'
