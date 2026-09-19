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

## O que NÃO passa pelo proxy

- `imagem_url` dos exercícios no banco (URLs públicas do Storage, host `supabase.co`).
- PowerSync (fala direto com o Postgres por replicação lógica).
- Redirect do OAuth Google (`…supabase.co/auth/v1/callback`, configurado no Google Cloud).

Numa migração de host, esses três precisam de tratamento à parte.

## Rollback

Voltar `VITE_SUPABASE_URL` pra `https://uxwpwdbbnlticxgtzcsb.supabase.co` (Vercel + secret do
GitHub) e redeployar/gerar release. O host da Supabase continua válido o tempo todo.
