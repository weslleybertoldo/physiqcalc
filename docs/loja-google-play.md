# Versão da Google Play — o AAB

Desde a W4 da loja (06/10/2026) a versão da Google Play sai como **AAB** (Android App Bundle): o build type `playRelease`
(`android/app/build.gradle`) com o site do `npm run build:loja` — sem o atualizador do APK, sem a permissão
`REQUEST_INSTALL_PACKAGES` e sem venda fora do Play Billing (W1, `src/lib/distribuicao.ts`). O APK do site não muda.

## Como sai

- **CI (o que vai para a loja):** job `aab-loja` do `.github/workflows/build-apk.yml`, a cada merge na `main`, em paralelo
  ao APK — mesmo commit e mesma versão; não bloqueia a release nem o bump. Na branch, o mesmo job roda no
  `build-apk-check.yml` (push que mexe em `android/**` ou `scripts/ci/**`), assinado com uma chave de upload **descartável**
  gerada no próprio job (hml-16b): prova o build e as conferências, mas esse AAB não vai para a loja.
- **Notebook (teste):** `npm run build:aab` → `android/app/build/outputs/bundle/playRelease/Physiq-v<versão>-loja.aab`.
  Lê a chave de `~/keystores/physiq-play-upload.env` só no Gradle e precisa do JDK 21 e do Android SDK (`~/jdk21` e
  `~/android-sdk` quando `JAVA_HOME`/`ANDROID_HOME` não dizem outros). O site vai com o `.env.local` da pasta — numa
  worktree, o do staging: aí o AAB sai **`Physiq-v<versão>-loja-staging.aab`** (o `conferir` lê o `health.json` de dentro dele;
  nunca o nome do de produção — play-W6, a revisão 🟡7). **À Google Play sobe SÓ o AAB do CI** (o build de produção): o do
  notebook fala com o banco de STAGING e gastaria o versionCode.
- Os dois usam o `scripts/ci/aab-loja.sh` (passos `versao`, `firebase`, `web`, `gradle` e `conferir`; `local` = todos).

## Onde baixar

Actions › o run do "Build APK" (ou do "Check APK build") › **Artifacts**: `Physiq-v<versão>-loja` (90 dias) ou
`Physiq-v<versão>-loja-check` (7 dias; chave descartável, não serve para a loja). Pelo terminal: `gh run download <id-do-run> -n Physiq-v<versão>-loja`.
O AAB **não** vai para a GitHub Release: o site e o atualizador do APK leem a release, que continua só com o APK.

Conferir um AAB baixado: `bash scripts/ci/aab-loja.sh conferir Physiq-v<versão>-loja.aab`.

## O que a conferência garante

O job falha se: (a) o AAB não estiver assinado só com a chave de upload — sem assinatura, com outra chave ou com a do APK do
site; (b) o manifesto tiver `REQUEST_INSTALL_PACKAGES`; (c) o site de dentro do AAB não for o da loja — a marca
`<meta name="physiq-distribuicao" content="play">` que o `vite.config.ts` põe no `index.html` só no `build:loja`; (d) o
versionCode não bater com a fórmula; (e) com o Firebase do push, faltar o `google_app_id`; (f) o JS do site de dentro do AAB
levar o painel master. O manifesto é lido de dentro do AAB pelo bundletool oficial (versão e SHA-256 fixos no script).
No check da branch a (a) roda com `CHECK_DESCARTAVEL=1` + `SHA256_UPLOAD_ESPERADO` (a impressão da chave descartável do job):
aí a chave de upload real e a do site viram erro — a branch nunca recebe chave real (hml-16b).

**Master só no site (hml-08):** o `build:loja` e o `build:apk` (o do APK do site) saem com `VITE_APP_NATIVO=1`, sem o painel
master. Quem confere é o `scripts/ci/sem-master.sh`: no `dist/` (passo `web` e `build-apk.yml`) e, na (f), nos `.js` de
dentro do AAB. Para conferir só a (f), sem o Android: `bash scripts/ci/aab-loja.sh sem-master <arquivo.aab>`. O site
(Vercel) segue no `npm run build`, com o master.

## Chaves

- **Chave de upload (a da loja):** PKCS12, alias `upload`, RSA 4096, válida até 2054. SHA-256
  `54:AE:BB:B0:27:71:0B:EA:01:C0:47:53:46:DB:17:8C:66:4F:73:11:41:DD:8C:94:BA:88:4F:D2:38:A5:26:4D`.
  - No notebook: `~/keystores/physiq-play-upload.p12` + `~/keystores/physiq-play-upload.env` (`PLAY_UPLOAD_KEYSTORE_FILE`,
    `PLAY_UPLOAD_KEYSTORE_PASSWORD`, `PLAY_UPLOAD_KEY_ALIAS`, `PLAY_UPLOAD_KEY_PASSWORD`).
  - No CI, 4 segredos no environment **`assinatura`** (só a `main`; hml-16b): `PLAY_UPLOAD_KEYSTORE_BASE64` (o `.p12` em
    base64), `PLAY_UPLOAD_KEYSTORE_PASSWORD`, `PLAY_UPLOAD_KEY_ALIAS` e `PLAY_UPLOAD_KEY_PASSWORD` — só o passo do Gradle do
    job `aab-loja` do `build-apk.yml` os recebe. Nenhuma branch os vê: o check usa uma chave descartável.
  - Cofre: item "Physiq — chave de upload da Google Play (keystore PKCS12)", projeto PhysiqCalc.
- **Chave do APK do site** (`KEYSTORE_*`, SHA-256 `CF:F7:EC:90:…:89:38:9F:6C`): só o `release` usa. **Nunca assina o AAB** —
  o `playRelease` zera a assinatura que o `initWith release` copiaria e, sem `PLAY_UPLOAD_KEYSTORE_FILE`, sai sem assinatura.
  - No CI (hml-16b): environment **`assinatura`** (só a `main`: o APK da release) e **`assinatura-aparelho`** (o job
    `apk-aparelho` do `build-apk-check.yml`, para instalar por cima do app a partir de uma branch: Actions › "Check APK build" ›
    Run workflow › a branch + `chave_real`; espera a aprovação do dono no GitHub; artefato de 1 dia). A chave só existe no
    disco durante o passo do Gradle.
  - Cofre: item "Physiq — chave do APK do site (keystore + senhas; cópia do GitHub, hml-16b)", projeto PhysiqCalc (até a
    hml-16b ela só existia como segredo do GitHub, sem cópia). Perder = nenhum APK novo instala por cima do app.

## Play App Signing (decisão de 20/09/2026)

O app instalado pela loja é assinado pelo Google com a chave de assinatura **dele**, gerada ao criar o app no Play Console
(W5); nós só enviamos o AAB assinado com a chave de upload. Por isso:

- **Quem tem o APK do site desinstala antes de instalar pela loja**: as assinaturas são diferentes e o Android não deixa um
  instalar por cima do outro.
- **assetlinks (W5):** o `public/.well-known/assetlinks.json` tem o SHA-256 do site, o da chave de upload e o da chave de
  assinatura do app no Google, `9D:E1:9B:D4:45:6C:33:A6:43:D9:10:F4:0D:99:13:6D:34:6C:9E:92:95:9F:F3:9A:6E:4C:07:F5:04:D9:2C:76`
  (Play Console › Protegido com o Google Play › Assinatura de apps; app criado em 07/10/2026). Sem ele, os links
  `https://physiqcalc.com.br/…` não abrem o app instalado pela loja. Trocou a chave de assinatura no Console → somar a nova
  aqui, sem tirar as outras.

## versionCode

A mesma fórmula do APK: `MAJOR*100000 + MINOR*100 + PATCH` (v3.56 = 305600). A Play recusa um versionCode que já recebeu:
cada envio à loja pede uma versão nova (o merge na `main` já faz o bump).

## A cobrança da Play (play-W6)

O aluno **sem profissional** assina o plano do app **dentro do app**, pelo Play Billing (decisão de 06/10/2026). Só na versão
da loja; o site e o APK do site não mudam (para quem não tem assinatura da Play). O profissional continua pagando pelo site e
o aluno → profissional (Pix com comprovante e o Mercado Pago da conta do personal) fica fora do Play Billing.

- **Produtos (Play Console):** 2 assinaturas mensais com os MESMOS códigos dos planos do banco — `app_treino` (R$ 29,90) e
  `app_treino_alimentacao` (R$ 49,90) —, plano básico `mensal`, renovação automática, Brasil; carência e suspensão no padrão
  do Google. A loja mostra SÓ o preço que a Play devolve (o do banco fica no site). Os 7 dias grátis são do app (não há oferta
  de teste na Play).
- **O plugin (`PlayBillingPlugin`, Play Billing Library 9.1.0):** só no build type `playRelease` — a biblioteca pelo
  `playReleaseImplementation` do `android/app/build.gradle`, o código em `android/app/src/playRelease/java/…/` e o registro
  pela `PlataformaLoja` de cada build type (a do `release` e a do `debug` ficam vazias). Faz: `disponivel`, `produtos`,
  `comprar` (com a matrícula opaca no `obfuscatedAccountId`; na troca, o token antigo + `na_hora` = `CHARGE_PRORATED_PRICE`
  ou `na_renovacao` = `DEFERRED`), `compras` e `gerenciar` (a Central de assinaturas). **Nunca reconhece** a compra: o
  servidor reconhece depois de conferir no Google (sem isso, o Google devolve sozinho em 3 dias). A ponte do JS é o
  `src/lib/playBilling.ts` (fora da loja nativa = indisponível, nunca uma compra falsa).
- **A conferência das 2 saídas:** o AAB passa pela (g) — a permissão `com.android.vending.BILLING` no manifesto e, no dex, o
  `PlayBillingPlugin` e a biblioteca (`scripts/ci/cobranca-play.sh tem`, chamado pelo `aab-loja.sh conferir`); o APK do site
  passa pela conferência ao contrário nos 2 workflows (`cobranca-play.sh sem`: o `aapt2 dump permissions` sem a permissão e a
  lista de classes do `dexdump` sem o plugin e sem `com.android.billingclient`).
- **A trava `play_billing`** (`app_config`, só o servidor lê; o molde do `mercadopago_conta`): `{"liberada": false}` no
  `public` e `true` no `staging`. Desligada, a oferta só aparece para conta de TESTE; ligada, para todos. A compra feita
  nunca olha a trava (o `registrar` e a conferência de hora em hora seguem). Ligar = SQL, com o OK dele, depois da compra de teste.

### O APK "loja + staging" (a compra real no staging)

O testador de licença compra num build **instalado por fora** — a Play aceita "even debug builds", com o pacote igual. O
comando (no notebook, com o `.env.local` do staging na pasta — as `VITE_*` do staging):

```bash
JAVA_HOME=~/jdk21 ANDROID_HOME=~/android-sdk bash scripts/ci/aab-loja.sh apk-staging
```

Ele gera o site do `build:loja` com `VITE_DB_SCHEMA=staging` (o `health.json` diz `"schema":"staging"`), roda o
`assemblePlayRelease` com `PLAY_APK_CHAVE_DEBUG=1` (a chave de **debug** desta máquina; nenhuma chave real no ambiente do
Gradle) e confere: assinado, mas nem com a chave do site nem com a de upload (`apk-assinatura.sh teste`); o pacote
`com.bertoldo.physiqcalc` sem `REQUEST_INSTALL_PACKAGES`; o site da loja no staging; a cobrança da Play (g). Sai em
`android/app/build/outputs/apk/playRelease/Physiq-v<versão>-loja-staging.apk` e devolve o `build.gradle` como estava.

- **Só no aparelho do testador de licença** (o Gmail dele em Play Console › Configuração › Teste de licença). Quem tem o APK
  do site (ou o app da loja) desinstala antes: a assinatura é outra e o Android não instala por cima.
- Entra com uma conta de TESTE do staging (`*teste*@physiqcalc.app`); a compra usa o "Test card, always approves" (o mensal
  renova a cada 5 min, até 6 vezes).
- Nunca vai para a loja: é APK (não AAB) e não leva a chave de upload.

### O servidor: as funções e os segredos

- **`play-compras`** (verify_jwt **true**; a pessoa logada): `estado` → `{disponivel, matricula, assinatura}` (só ela lê a
  trava `play_billing`) e `registrar {token, produto}` → confere no Google (pacote, produto, dono = a matrícula de quem
  chama, estado), grava (`play_aplicar`), reconhece e, na 1ª compra com a matrícula ainda coberta (o teste ou um mês pago
  pelo MP), adia (`defer`) pelo que falta.
- **`play-conferir`** (verify_jwt **false**; desde 22/10/2026, no lugar da `play-rtdn`): a **conferência de hora em hora**,
  chamada pelo banco — o job `play-conferir-<schema>` do `pg_cron` (minuto 25) → `{schema}.play_conferir_disparar()` → o
  `pg_net`, com o segredo S11 no `x-espelho-segredo` (sem ele ou errado: o mesmo 401). O disparo só chama quando o schema tem
  assinatura da Play. Por schema, a rodada:
  1. lê as devolvidas da **Voided Purchases API** (`type=1`) desde o marcador `app_config.play_conferir` (menos 10 min de folga;
     sem ele, as últimas 24 h): a cobrança do pedido vira devolvida (`cancelada` + `reembolsado_em`) e a assinatura que perdeu o
     acesso vira `revogada`. O marcador só anda com a janela inteira lida;
  2. confere **TODAS** as assinaturas vivas (não só as perto de vencer), as há mais tempo sem conferir primeiro, até 100 por hora:
     o GET + a mesma `play_aplicar` do `registrar` (reconhece se faltar; a matrícula encerrada pelo vínculo que renovou é
     cancelada). O que sobra vai na frente da hora seguinte (log `play_conferir_sobrou`).

  Renovação, cancelamento, carência, suspensão, pausa, expiração, devolução e estorno chegam ao banco em **até 1 hora** — e na
  hora quando o aluno abre o app (o `estado` relê a vencida; o `registrar` grava a compra nova). O que o aviso do Google fazia e
  a conferência **não** faz: ver uma compra que o `registrar` nunca gravou (o app fechou no meio, sem rede). Ela volta quando o
  app abre de novo (a recuperação manda ao servidor as compras do aparelho); sem isso em 3 dias, o Google devolve sozinho.
- **Segredos do principal (Supabase › Edge Functions › Secrets):**
  - `PLAY_SERVICE_ACCOUNT` — a chave JSON da conta de serviço `play-api@physiq-br.iam.gserviceaccount.com` (escopo
    `androidpublisher`; no Play Console › Usuários e permissões, com "Ver dados financeiros…" e "Gerenciar pedidos e
    assinaturas"). Cópia no cofre (PhysiqCalc). **Sem ele, nada quebra:** a oferta não aparece (`disponivel: false`), o
    `registrar` responde 503, a `play-conferir` pula, e o log diz `play_sem_credencial`.
  - `SEGREDO_PLAY_CONFERIR_ACEITOS` — o sha256 do segredo S11. O valor mora no Vault `physiq_play_conferir_segredo` (o banco
    manda) e no cofre ("Physiq — conferência da Google Play (play-W6)"). Gerar e trocar:
    `python3 scripts/segredos/servidor.py play_conferir <gerar|aceitar|trocar|conferir>`. Sem o Vault, o disparo não chama
    nada (a rotina fica inerte).
- **Só no teste local (o simulador `e2e/playw6/simulador_play.py`):** `PLAY_API_BASE` e `PLAY_OAUTH_URL` trocam o Google pelo
  simulador — e só valem com `http://127.0.0.1:<porta>` (a produção não tem nenhuma delas; qualquer outro valor é ignorado).
- **Histórico (22/10/2026):** até esta data a W6 tinha a `play-rtdn` — o aviso do Google (RTDN) pelo Pub/Sub, num push com
  OIDC. Saiu porque o `physiq-br` ficou sem faturamento no Google Cloud (o Google pede um pré-pagamento de R$ 150 para
  ativar; o dono decidiu não pagar) e o Pub/Sub exige faturamento. Vale a alternativa do §7.14 do contrato: o `registrar` ao
  abrir o app + a conferência de hora em hora.

- **A cobrança da troca na hora é uma estimativa:** a linha `google_play` do pedido da troca para o completo (CHARGE_PRORATED_PRICE)
  grava o preço cheio do produto novo (o `recurringPrice` do GET); o Google cobra só o rateio do período que falta — o valor exato
  só pela Orders API (a revisão, ⚪9). O Financeiro do master superestima o mês da troca.

### A volta com assinante vivo (a revisão, 🟡8)

A trava desligada (`play_billing` = `{"liberada": false}`) tira a oferta na hora, sem AAB novo — e é a volta inteira enquanto houver
assinatura viva: **com assinatura viva, a volta é SÓ a trava.** As funções novas e o banco ficam: elas seguem gravando as
renovações e as devolvidas (a conferência de hora em hora), o cancelamento no vínculo e na exclusão. Por quê: sem a `play_aplicar` (a reversa) e com as
funções da `7c266196`, nenhuma renovação entra no banco — a cobertura vence e o assinante trava com o Google cobrando; e a
`pagamentos-aluno` velha volta a aceitar o Mercado Pago de quem tem a Play (cobrar 2 vezes).

A reversa e as funções velhas só com **0 assinatura viva**: (1) contar (SQL só leitura) as linhas da `play_assinaturas` em
`pendente`, `ativa`, `carencia`, `suspensa`, `pausada` ou `cancelada` ainda no prazo; (2) com alguma,
cancelar (ou devolver) as vivas pela API — o `cancel` com `DEVELOPER_REQUESTED_STOP_PAYMENTS` (vale até o fim) ou o `revoke`
(devolve e corta) — e esperar o fim do período pago; (3) com 0, a reversa (`--so staging` e depois `--so public`) e as funções da
`7c266196`. O §5 do contrato da play-W6 segue este roteiro.

### O Google Cloud e o Console (etapas 2 e 3 — da sessão principal, com o OK dele)

1. `physiq-br`: ligar a `androidpublisher`; criar a conta `play-api@physiq-br` + a chave JSON → o cofre + o segredo
   `PLAY_SERVICE_ACCOUNT`. **Sem Pub/Sub** (o `physiq-br` sem faturamento — o histórico acima): nada de tópico, de assinatura
   push nem da conta do push.
2. O segredo S11 da rotina de hora em hora: `servidor.py play_conferir gerar` → `aceitar` (a lista na função) → publicar a
   `play-conferir` → `trocar` (o Vault que o `play_conferir_disparar()` lê) → `conferir`. A migration põe o job; sem o Vault,
   ele não chama nada.
3. Play Console: o perfil de pagamentos (do dono da conta do Console, antes de tudo); convidar a `play-api` com as 2 permissões;
   criar os 2 produtos; **o tópico das notificações em tempo real (Monetização › Configuração da monetização) fica VAZIO** — sem
   Pub/Sub, a conferência de hora em hora está no lugar; o testador de licença; a IARC ("Compras digitais: Sim") e a nota da
   Segurança dos dados.
