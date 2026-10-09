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
  worktree, o do staging: para a loja, use o AAB do CI.
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
