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

echo "→ script (mantém os secrets do Worker — PROXY_SEGREDO, W8b)"
# H-46 (homologação, 08/10/2026): binding LIMITE = teto geral por IP (rate limiting da Cloudflare, 1200 pedidos por 60 s,
# namespace 460001 — um por Worker, senão os 2 dividem o contador). Aproximado e por local: só segura enxurrada.
curl -sS -X PUT "$API/scripts/$NOME" -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-09-01","compatibility_flags":["nodejs_compat"],"keep_bindings":["secret_text"],"bindings":[{"type":"ratelimit","name":"LIMITE","namespace_id":"460001","simple":{"limit":1200,"period":60}}]};type=application/json' \
  -F "worker.js=@worker.js;type=application/javascript+module" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"))'

# W8b: o segredo que prova às funções do principal que o x-physiq-ip veio deste Worker (o mesmo do secret PROXY_SEGREDO das
# funções). Fica em ~/.physiq-proxy-segredo (600) e no cofre (PhysiqCalc › "Physiq — segredo do proxy api-principal (W8b)").
if [ -f "$HOME/.physiq-proxy-segredo" ]; then
  echo "→ secret PROXY_SEGREDO"
  python3 -c 'import json,sys; print(json.dumps({"name":"PROXY_SEGREDO","text":open(sys.argv[1]).read().strip(),"type":"secret_text"}))' "$HOME/.physiq-proxy-segredo" \
    | curl -sS -X PUT "$API/scripts/$NOME/secrets" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"))'
fi

echo "→ endereço reserva *.workers.dev"
curl -sS -X POST "$API/scripts/$NOME/subdomain" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"previews_enabled":false}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"))'

echo "→ domínio $HOST"
curl -sS -X PUT "$API/domains" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"environment\":\"production\",\"hostname\":\"$HOST\",\"service\":\"$NOME\",\"zone_id\":\"$ZONA\"}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"), (d.get("result") or {}).get("hostname"))'
