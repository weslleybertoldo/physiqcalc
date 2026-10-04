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
