# API pelo domínio próprio — `api.physiqcalc.com.br`

Desde 19/09/2026 o app (web e APK) fala com a Supabase por **`https://api.physiqcalc.com.br`**,
e não mais pela URL `https://uxwpwdbbnlticxgtzcsb.supabase.co` gravada na build.

## Por quê

A URL da API entra **compilada no APK** (`VITE_SUPABASE_URL` no `build-apk.yml`). Com a URL da
Supabase no aparelho, qualquer troca de host do backend (outro projeto, self-hosted num VPS…)
obrigaria uma release nova e todo aluno a atualizar. Com um domínio nosso na frente, a troca
vira DNS/proxy: o APK antigo continua funcionando.

## Como funciona

```
app (web/APK) ──HTTPS──▶ api.physiqcalc.com.br (Cloudflare Worker `physiqcalc-api`)
                                   │  repassa método, headers (apikey, authorization…), body
                                   ▼
                     https://uxwpwdbbnlticxgtzcsb.supabase.co  (auth / rest / storage / functions)
```

- **Zona DNS** `physiqcalc.com.br` na Cloudflare (conta pessoal); `api` é custom domain do Worker.
  Site (`@`/`www`) segue na Vercel, registros DNS-only. Registros do Resend (e-mail de convite)
  copiados como estavam.
- **Worker** `physiqcalc-api`: proxy transparente, sem cache (`cache: "no-store"`) e sem seguir
  redirects (`redirect: "manual"` — o 302 do `/auth/v1/authorize` tem que voltar pro navegador).
  Endereço reserva sem domínio: `https://physiqcalc-api.weslleybertoldo.workers.dev`.
- **Client** não muda: só `VITE_SUPABASE_URL` (Vercel prod/staging + secret do GitHub pro APK).
- **Service worker** (`vite.config.ts`): as regras de cache de `/rest/v1`, `/auth` e do Storage
  de exercícios são geradas a partir de `VITE_SUPABASE_URL` (`padraoApi`), aceitando também o
  host direto da Supabase — os GIFs gravados no banco (`imagem_url`) continuam apontando pra lá.

### Troca da anon legada pela publishable (troca da chave vazada, 04/10/2026)

O código do Worker `physiqcalc-api` agora fica no repo, em `infra/cloudflare/physiqcalc-api/` (`proxy.js` = a lógica,
`worker.js` = a entrada, `proxy.test.mjs` = teste com `node --test`, `deploy.sh` = publica; `deploy.sh <outro-nome>` sobe um
ensaio só no `*.workers.dev`). O APK instalado não atualiza sozinho e leva a anon **legada** (JWT) do Treino; as chaves legadas
vão ser desligadas. Quando o `apikey` (cabeçalho ou `?apikey=`) ou o `Authorization: Bearer` é **exatamente** a anon legada
(conferida pelo SHA-256 — a chave não fica no código), o Worker põe no lugar a **publishable** do Treino (secret
`TREINO_PUBLISHABLE` do Worker, gravado pelo `deploy.sh` a partir de `~/.physiq-treino-publishable`). Qualquer outra chave
passa sem mexer — a service_role vazada nunca vira chave de servidor. Sem o secret, o Worker volta a ser só o proxy.
Voltar: cada publicação é uma versão na Cloudflare (`POST …/workers/scripts/physiqcalc-api/deployments` com a anterior a 100%).

## O que NÃO passa pelo proxy

- `imagem_url` dos exercícios no banco (URLs públicas do Storage, host `supabase.co`).
- PowerSync (fala direto com o Postgres por replicação lógica).
- Redirect do OAuth Google (`…supabase.co/auth/v1/callback`, configurado no Google Cloud).

Numa migração de host, esses três precisam de tratamento à parte.

## Rollback

Voltar `VITE_SUPABASE_URL` pra `https://uxwpwdbbnlticxgtzcsb.supabase.co` (Vercel + secret do
GitHub) e redeployar/gerar release. O host da Supabase continua válido o tempo todo.

## Banco principal: `api-principal.physiqcalc.com.br` (Physiq W2, 29/09/2026)

O banco principal do Physiq (Supabase `hkxvtsbwctxkrqzkkdoz`, o do PhysiqNutri) segue a mesma receita: Worker
`physiq-principal-api` (proxy sem cache e sem seguir redirects) no custom domain `api-principal.physiqcalc.com.br`,
reserva `physiq-principal-api.weslleybertoldo.workers.dev`. O código fica versionado em
`infra/cloudflare/physiq-principal-api/` (`deploy.sh` publica e liga o domínio). O app usa pelo
`src/integrations/principal/client.ts` (`VITE_PRINCIPAL_URL`). O callback do Google continua em
`https://hkxvtsbwctxkrqzkkdoz.supabase.co/auth/v1/callback` e as funções do servidor falam com o host direto.

### IP de quem chama nas funções do principal (W8b, 30/09/2026)

Quando um Worker repassa o pedido, a Cloudflare troca o `cf-connecting-ip` pelo IP do Worker (`2a06:98c0:3600::103`) — as
funções veriam todo mundo como um IP só. Nas chamadas `/functions/v1/…` o Worker `physiq-principal-api` manda o IP de verdade
em `x-physiq-ip` junto com o segredo do proxy em `x-physiq-proxy` (secret `PROXY_SEGREDO` do Worker = o mesmo secret das funções
do principal; cofre › PhysiqCalc › "Physiq — segredo do proxy api-principal (W8b)"). A função só acredita no `x-physiq-ip` com
o segredo certo; o que o aparelho mandar nesses 2 cabeçalhos é descartado pelo Worker. Direto no `supabase.co` vale o
`cf-connecting-ip` (a Cloudflare recusa esse cabeçalho vindo do cliente). Quem usa: `entrar-senha` (limite de tentativas por IP).
O `deploy.sh` publica o código mantendo os secrets (`keep_bindings`) e grava o `PROXY_SEGREDO` de `~/.physiq-proxy-segredo`.

### Troca da anon legada pela publishable no principal (hml-16, H-35, 09/10/2026)

A mesma troca do `physiqcalc-api` (acima), agora no `physiq-principal-api`. Os APKs instalados desde a v3.2 (não atualizam
sozinhos), o AAB da loja e o site antigo levam a anon **legada** (JWT) do principal, e as legadas do principal vão ser
desligadas. Quando o `apikey` (cabeçalho ou `?apikey=`) ou o `Authorization: Bearer` é **exatamente** a anon legada (conferida
pelo SHA-256 e pelo tamanho, constantes no `worker.js` — a chave não fica no código), o Worker põe no lugar a **publishable** do
principal (secret `PRINCIPAL_PUBLISHABLE` do Worker). Qualquer outra chave passa sem mexer — a `service_role` nunca vira chave
de servidor. Sem o secret, o Worker volta a ser só o proxy. O IP de quem chama (W8b e hml-05c) não muda.

- `deploy.sh` publica a produção (`physiq-principal-api` + domínio) e grava o `PRINCIPAL_PUBLISHABLE` de
  `~/.physiq-principal-publishable` (600). Sem o arquivo, ou com algo que não seja uma `sb_publishable_…`, ele **para antes de
  publicar**. `deploy.sh <outro-nome>` sobe um ensaio só no `*.workers.dev` (sem o arquivo, como proxy puro; sem o
  `PROXY_SEGREDO`).
- Teste: `node --test infra/cloudflare/physiq-principal-api/worker.test.mjs` (com uma anon legada FALSA).
- Fica sem prazo para sair, como a do Treino: o atualizador do app não obriga ninguém a atualizar.
- Voltar: a versão anterior a 100% (`POST …/workers/scripts/physiq-principal-api/deployments`) ou apagar o secret (proxy puro).
  Com as legadas já desligadas, sem a troca os APKs antigos deixam de falar com o principal.

## Domínio (hml-15, 09/10/2026: H-33, H-34 e H-52)

O site (Vercel) recebe os cabeçalhos de segurança pelo `vercel.json` (CSP, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy` e `X-Robots-Tag` só no staging; guarda no CI: `scripts/ci/cabecalhos.test.mjs`; prova:
`e2e/hml15/csp.py`). As 2 APIs (`api.` e `api-principal.`, os únicos hosts com proxy da Cloudflare) e o DNS mudam pela API v4
da Cloudflare, com o token de conta de sempre (`~/.cloudflare-pessoal-token`). Cada mudança tem conferência e volta:

```bash
T="$(cat ~/.cloudflare-pessoal-token)"; Z=efa77ce5a75431cf5ae1a4c176a8d7dd
cf() { curl -sS -X "$1" "https://api.cloudflare.com/client/v4/zones/$Z$2" -H "Authorization: Bearer $T" -H "Content-Type: application/json" ${3:+--data "$3"}; }
# antes de cada item: cf GET <caminho> > ~/projetos/physiqcalc-scratch/hml/hml15/cf_<item>_antes.json; os ids criados vão para cf_ids.json
```

| # | Mudança | Chamada | Conferência | Volta |
|---|---|---|---|---|
| 1 | Always Use HTTPS | `cf PATCH /settings/always_use_https '{"value":"on"}'` | `http://` das 2 APIs → `301` + `location: https://…` | `'{"value":"off"}'` |
| 2 | TLS mínimo 1.2 | `cf PATCH /settings/min_tls_version '{"value":"1.2"}'` | `openssl s_client … -tls1_1 -cipher 'DEFAULT@SECLEVEL=0'` → recusado; `-tls1_2` e `-tls1_3` → OK (os 2 hosts) | `'{"value":"1.0"}'` |
| 3 | HSTS + nosniff nas APIs | `cf PATCH /settings/security_header '{"value":{"strict_transport_security":{"enabled":true,"max_age":31536000,"include_subdomains":false,"preload":false,"nosniff":true}}}'` | `curl -sI https://api.physiqcalc.com.br/healthz` (e o `api-principal`) com `max-age=31536000` e `nosniff`. Sem o cabeçalho: os 2 Workers mandam (código + teste) | `max_age:0` (o navegador esquece na visita seguinte), depois `enabled:false` |
| 4 | SSL Full (strict) | `cf PATCH /settings/ssl '{"value":"strict"}'` | `https://api-principal.physiqcalc.com.br/healthz` = 200 + a regressão das APIs | `'{"value":"full"}'` |
| 5 | DMARC `p=none` com relatório | `cf POST /dns_records '{"type":"TXT","name":"_dmarc.physiqcalc.com.br","content":"\"v=DMARC1; p=none\"","ttl":3600,"comment":"hml-15 H-34"}'` e depois `cf PATCH /email/auth/dmarc-reports '{"enabled":true}'` | `dig +short TXT _dmarc.physiqcalc.com.br @1.1.1.1` → `v=DMARC1; p=none; rua=mailto:…`; `cf GET /email/auth/dmarc-reports` → `enabled:true`, sem `status` | `cf PATCH /email/auth/dmarc-reports '{"enabled":false}'` + `cf DELETE /dns_records/<id>`. O `p=quarantine` (de 23/10 a 06/11/2026) = `cf PATCH /dns_records/<id>` com o conteúdo lido + `p=quarantine` |
| 6 | SPF do apex | `cf POST /dns_records '{"type":"TXT","name":"physiqcalc.com.br","content":"\"v=spf1 -all\"","ttl":3600,"comment":"hml-15 H-34: o apex nao envia e-mail"}'` | `dig +short TXT physiqcalc.com.br` → `"v=spf1 -all"`; o `send.` igual a antes; e-mail de teste do staging pelo Resend entregue | `cf DELETE /dns_records/<id>` |
| 7 | CAA (4 registros) | `cf POST /dns_records '{"type":"CAA","name":"physiqcalc.com.br","data":{"flags":0,"tag":"issue","value":"letsencrypt.org"},"ttl":3600}'`, idem `pki.goog`, `sectigo.com` e `ssl.com` | `dig +short CAA physiqcalc.com.br`; `cf GET /ssl/certificate_packs` → os 4 pacotes `active` (repetir na semana da renovação) | `cf DELETE /dns_records/<id>` de cada um |
| 8 | DNSSEC | `cf PATCH /dnssec '{"status":"active"}'` → guardar `ds`, `key_tag`, `algorithm` (13), `digest_type` (2) e `digest` em `hml15/dnssec_ds.txt` | `cf GET /dnssec` → `pending`; com o DS no Registro.br, `active`, `dig +short DS physiqcalc.com.br @a.dns.br` e `delv @1.1.1.1 physiqcalc.com.br` → "fully validated" | sem DS: `cf PATCH /dnssec '{"status":"disabled"}'`. Com DS: 1º o dono tira o DS no Registro.br, 2º espera o TTL do DS no `.br`, 3º desliga |

- **Ordem:** primeiro o que não tem risco (5, 6 e 7), depois 1 a 4 e por último o 8. Depois de cada item, a conferência e
  `python3 e2e/hml15/dominio.py` (só leitura: grava `dominio_depois.txt`), mais a regressão das APIs (`e2e/w02/proxy_principal.py`,
  `e2e/hml05a/entrada.py`, `e2e/hml05c/limite_ip.py`).
- **HSTS:** o das APIs vale 1 ano, sem `includeSubDomains` e sem `preload`. O do site continua o da Vercel (2 anos), sem mudança.
- **Nunca** pôr `X-Frame-Options`/`frame-ancestors` nas respostas dos Workers: o anexo em PDF (resposta do `api-principal`) abre
  num `<iframe>` do painel.
- **DS no Registro.br (passo do dono, sem credencial):** registro.br → Painel → Domínios → `physiqcalc.com.br` → DNS / DNSSEC →
  "Adicionar DS" com o Key Tag, o Algoritmo 13 (ECDSA P-256 SHA-256), o Tipo de digest 2 (SHA-256) e o Digest do item 8. A
  Cloudflare passa para `active` sozinha. Até lá o DNSSEC fica "pendente" sem dano: o perigo é só desligar com o DS no Registro.br.
