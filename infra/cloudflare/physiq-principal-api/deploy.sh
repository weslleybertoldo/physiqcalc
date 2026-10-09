#!/usr/bin/env bash
# Publica o Worker physiq-principal-api na Cloudflare PESSOAL (api-principal.physiqcalc.com.br → banco principal). Idempotente.
#   infra/cloudflare/physiq-principal-api/deploy.sh               → produção: physiq-principal-api + domínio api-principal.physiqcalc.com.br
#                                                                   (custom domain do Worker: a Cloudflare cria o registro DNS e o certificado)
#   infra/cloudflare/physiq-principal-api/deploy.sh <outro-nome>  → ensaio: só no endereço *.workers.dev, sem domínio
# Grava o secret PRINCIPAL_PUBLISHABLE (a publishable do principal, de ~/.physiq-principal-publishable, 600) — é com ele que o
# Worker troca a anon LEGADA pela publishable (hml-16, ver worker.js). Em produção, sem o arquivo, PARA antes de publicar
# qualquer coisa: sem o secret o Worker vira proxy puro e os APKs com a anon legada caem quando as legadas forem desligadas. No
# ensaio, sem o arquivo, sobe como proxy puro. O arquivo tem que ter uma sb_publishable_ (nunca uma chave de servidor).
# Ensaio da troca com uma chave FALSA: copiar esta pasta para fora do repo, pôr na cópia o ANON_LEGADA_SHA256/_TAMANHO da falsa
# e rodar <cópia>/deploy.sh <outro-nome>; depois apagar o Worker de ensaio (DELETE …/workers/scripts/<outro-nome>).
# Voltar: cada publicação vira uma versão na Cloudflare → POST …/workers/scripts/<nome>/deployments com a versão anterior a 100%.
# Token: ~/.cloudflare-pessoal-token (Workers Scripts + Workers Routes/Custom Domains na conta/zona); conta:
# ~/.cloudflare-pessoal-account. Zona physiqcalc.com.br = efa77ce5a75431cf5ae1a4c176a8d7dd.
set -euo pipefail
cd "$(dirname "$0")"
NOME="${1:-physiq-principal-api}"
[[ "$NOME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "nome inválido: $NOME" >&2; exit 2; }
PUBLISHABLE="$HOME/.physiq-principal-publishable"
if [ -f "$PUBLISHABLE" ]; then
  python3 -c 'import re,sys; sys.exit(0 if re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", open(sys.argv[1]).read().strip()) else 1)' "$PUBLISHABLE" \
    || { echo "❌ $PUBLISHABLE não tem uma chave sb_publishable_: nada foi publicado" >&2; exit 2; }
elif [ "$NOME" = "physiq-principal-api" ]; then
  echo "❌ sem $PUBLISHABLE: a produção não sobe sem o PRINCIPAL_PUBLISHABLE (nada foi publicado)" >&2
  exit 2
fi
TOKEN="$(cat "$HOME/.cloudflare-pessoal-token")"
CONTA="$(cat "$HOME/.cloudflare-pessoal-account")"
ZONA="efa77ce5a75431cf5ae1a4c176a8d7dd"
HOST="api-principal.physiqcalc.com.br"
API="https://api.cloudflare.com/client/v4/accounts/$CONTA/workers"
sucesso() { python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors") or "")'; }

echo "→ script $NOME (worker.js; mantém os secrets do Worker)"
# H-46 (homologação, 08/10/2026): binding LIMITE = teto geral por IP (rate limiting da Cloudflare, 1200 pedidos por 60 s,
# namespace 460001 — um por Worker, senão os 2 dividem o contador). Aproximado e por local: só segura enxurrada.
curl -sS -X PUT "$API/scripts/$NOME" -H "Authorization: Bearer $TOKEN" \
  -F 'metadata={"main_module":"worker.js","compatibility_date":"2026-09-01","compatibility_flags":["nodejs_compat"],"keep_bindings":["secret_text"],"bindings":[{"type":"ratelimit","name":"LIMITE","namespace_id":"460001","simple":{"limit":1200,"period":60}}]};type=application/json' \
  -F "worker.js=@worker.js;type=application/javascript+module" | sucesso

# W8b: o segredo que prova às funções do principal que o x-physiq-ip veio deste Worker (o mesmo do secret PROXY_SEGREDO das
# funções). Fica em ~/.physiq-proxy-segredo (600) e no cofre (PhysiqCalc › "Physiq — segredo do proxy api-principal (W8b)").
# Só na produção: o ensaio não precisa dele (sem o segredo, o Worker só não manda o IP) e o segredo não se espalha.
if [ "$NOME" = "physiq-principal-api" ] && [ -f "$HOME/.physiq-proxy-segredo" ]; then
  echo "→ secret PROXY_SEGREDO"
  python3 -c 'import json,sys; print(json.dumps({"name":"PROXY_SEGREDO","text":open(sys.argv[1]).read().strip(),"type":"secret_text"}))' "$HOME/.physiq-proxy-segredo" \
    | curl -sS -X PUT "$API/scripts/$NOME/secrets" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- | sucesso
fi

if [ -f "$PUBLISHABLE" ]; then
  echo "→ secret PRINCIPAL_PUBLISHABLE"
  python3 -c 'import json,sys; print(json.dumps({"name":"PRINCIPAL_PUBLISHABLE","text":open(sys.argv[1]).read().strip(),"type":"secret_text"}))' "$PUBLISHABLE" \
    | curl -sS -X PUT "$API/scripts/$NOME/secrets" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @- | sucesso
else
  echo "⚠️ sem $PUBLISHABLE: o ensaio fica como proxy puro (não troca a anon legada)"
fi

echo "→ endereço reserva *.workers.dev"
curl -sS -X POST "$API/scripts/$NOME/subdomain" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":true,"previews_enabled":false}' | sucesso

if [ "$NOME" = "physiq-principal-api" ]; then
  echo "→ domínio $HOST"
  curl -sS -X PUT "$API/domains" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"environment\":\"production\",\"hostname\":\"$HOST\",\"service\":\"$NOME\",\"zone_id\":\"$ZONA\"}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  success:", d["success"], d.get("errors"), (d.get("result") or {}).get("hostname"))'
fi
