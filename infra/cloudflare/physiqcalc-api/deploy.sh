#!/usr/bin/env bash
# Publica o Worker physiqcalc-api na Cloudflare PESSOAL (api.physiqcalc.com.br → Banco do Treino). Idempotente.
#   infra/cloudflare/physiqcalc-api/deploy.sh                 → produção: physiqcalc-api + domínio api.physiqcalc.com.br
#   infra/cloudflare/physiqcalc-api/deploy.sh <outro-nome>    → ensaio: só no endereço *.workers.dev, sem domínio
# Grava o secret TREINO_PUBLISHABLE (a publishable do Treino, de ~/.physiq-treino-publishable, 600) — é com ele que o Worker
# troca a anon LEGADA pela publishable (ver proxy.js). Sem o arquivo, o Worker sobe como proxy puro.
# Voltar: cada publicação vira uma versão na Cloudflare → POST …/workers/scripts/<nome>/deployments com a versão anterior a 100%.
# Token: ~/.cloudflare-pessoal-token (Workers Scripts + Workers Routes/Custom Domains); conta: ~/.cloudflare-pessoal-account.
# Zona physiqcalc.com.br = efa77ce5a75431cf5ae1a4c176a8d7dd.
set -euo pipefail
cd "$(dirname "$0")"
TOKEN="$(cat "$HOME/.cloudflare-pessoal-token")"
CONTA="$(cat "$HOME/.cloudflare-pessoal-account")"
ZONA="efa77ce5a75431cf5ae1a4c176a8d7dd"
NOME="${1:-physiqcalc-api}"
HOST="api.physiqcalc.com.br"
API="https://api.cloudflare.com/client/v4/accounts/$CONTA/workers"
[[ "$NOME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "nome inválido: $NOME" >&2; exit 2; }
sucesso() { python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors") or "")'; }

echo "→ script $NOME (worker.js + proxy.js; mantém os secrets)"
curl -sS -X PUT "$API/scripts/$NOME" -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-09-01","compatibility_flags":["nodejs_compat"],"keep_bindings":["secret_text"]};type=application/json' \
  -F "worker.js=@worker.js;type=application/javascript+module" \
  -F "proxy.js=@proxy.js;type=application/javascript+module" | sucesso

if [ -f "$HOME/.physiq-treino-publishable" ]; then
  echo "→ secret TREINO_PUBLISHABLE"
  python3 -c 'import json,sys; print(json.dumps({"name":"TREINO_PUBLISHABLE","text":open(sys.argv[1]).read().strip(),"type":"secret_text"}))' "$HOME/.physiq-treino-publishable" \
    | curl -sS -X PUT "$API/scripts/$NOME/secrets" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- | sucesso
else
  echo "⚠️ sem ~/.physiq-treino-publishable: o Worker fica como proxy puro (não troca a anon legada)"
fi

echo "→ endereço reserva *.workers.dev"
curl -sS -X POST "$API/scripts/$NOME/subdomain" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"previews_enabled":false}' | sucesso

if [ "$NOME" = "physiqcalc-api" ]; then
  echo "→ domínio $HOST"
  curl -sS -X PUT "$API/domains" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"environment\":\"production\",\"hostname\":\"$HOST\",\"service\":\"$NOME\",\"zone_id\":\"$ZONA\"}" | sucesso
fi
