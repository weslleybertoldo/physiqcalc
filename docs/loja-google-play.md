# Versão da Google Play — o AAB

Desde a W4 da loja (06/10/2026) a versão da Google Play sai como **AAB** (Android App Bundle): o build type `playRelease`
(`android/app/build.gradle`) com o site do `npm run build:loja` — sem o atualizador do APK, sem a permissão
`REQUEST_INSTALL_PACKAGES` e sem venda fora do Play Billing (W1, `src/lib/distribuicao.ts`). O APK do site não muda.

## Como sai

- **CI (o que vai para a loja):** job `aab-loja` do `.github/workflows/build-apk.yml`, a cada merge na `main`, em paralelo
  ao APK — mesmo commit e mesma versão; não bloqueia a release nem o bump. Na branch, o mesmo job roda no
  `build-apk-check.yml` (push que mexe em `android/**` ou `scripts/ci/**`).
- **Notebook (teste):** `npm run build:aab` → `android/app/build/outputs/bundle/playRelease/Physiq-v<versão>-loja.aab`.
  Lê a chave de `~/keystores/physiq-play-upload.env` só no Gradle e precisa do JDK 21 e do Android SDK (`~/jdk21` e
  `~/android-sdk` quando `JAVA_HOME`/`ANDROID_HOME` não dizem outros). O site vai com o `.env.local` da pasta — numa
  worktree, o do staging: para a loja, use o AAB do CI.
- Os dois usam o `scripts/ci/aab-loja.sh` (passos `versao`, `firebase`, `web`, `gradle` e `conferir`; `local` = todos).

## Onde baixar

Actions › o run do "Build APK" (ou do "Check APK build") › **Artifacts**: `Physiq-v<versão>-loja` (90 dias) ou
`Physiq-v<versão>-loja-check` (7 dias). Pelo terminal: `gh run download <id-do-run> -n Physiq-v<versão>-loja`.
O AAB **não** vai para a GitHub Release: o site e o atualizador do APK leem a release, que continua só com o APK.

Conferir um AAB baixado: `bash scripts/ci/aab-loja.sh conferir Physiq-v<versão>-loja.aab`.

## O que a conferência garante

O job falha se: (a) o AAB não estiver assinado só com a chave de upload — sem assinatura, com outra chave ou com a do APK do
site; (b) o manifesto tiver `REQUEST_INSTALL_PACKAGES`; (c) o site de dentro do AAB não for o da loja — a marca
`<meta name="physiq-distribuicao" content="play">` que o `vite.config.ts` põe no `index.html` só no `build:loja`; (d) o
versionCode não bater com a fórmula; (e) com o Firebase do push, faltar o `google_app_id`. O manifesto é lido de dentro do
AAB pelo bundletool oficial (versão e SHA-256 fixos no script).

## Chaves

- **Chave de upload (a da loja):** PKCS12, alias `upload`, RSA 4096, válida até 2054. SHA-256
  `54:AE:BB:B0:27:71:0B:EA:01:C0:47:53:46:DB:17:8C:66:4F:73:11:41:DD:8C:94:BA:88:4F:D2:38:A5:26:4D`.
  - No notebook: `~/keystores/physiq-play-upload.p12` + `~/keystores/physiq-play-upload.env` (`PLAY_UPLOAD_KEYSTORE_FILE`,
    `PLAY_UPLOAD_KEYSTORE_PASSWORD`, `PLAY_UPLOAD_KEY_ALIAS`, `PLAY_UPLOAD_KEY_PASSWORD`).
  - No CI, 4 segredos: `PLAY_UPLOAD_KEYSTORE_BASE64` (o `.p12` em base64), `PLAY_UPLOAD_KEYSTORE_PASSWORD`,
    `PLAY_UPLOAD_KEY_ALIAS` e `PLAY_UPLOAD_KEY_PASSWORD` — só o passo do Gradle os recebe.
  - Cofre: item "Physiq — chave de upload da Google Play (keystore PKCS12)", projeto PhysiqCalc.
- **Chave do APK do site** (`KEYSTORE_*`, SHA-256 `CF:F7:EC:90:…:89:38:9F:6C`): só o `release` usa. **Nunca assina o AAB** —
  o `playRelease` zera a assinatura que o `initWith release` copiaria e, sem `PLAY_UPLOAD_KEYSTORE_FILE`, sai sem assinatura.

## Play App Signing (decisão de 20/09/2026)

O app instalado pela loja é assinado pelo Google com a chave de assinatura **dele**, gerada ao criar o app no Play Console
(W5); nós só enviamos o AAB assinado com a chave de upload. Por isso:

- **Quem tem o APK do site desinstala antes de instalar pela loja**: as assinaturas são diferentes e o Android não deixa um
  instalar por cima do outro.
- **assetlinks (W5):** o `public/.well-known/assetlinks.json` tem o SHA-256 do site e o da chave de upload. Depois de criar o
  app, copie o SHA-256 do certificado da chave de assinatura do app (Play Console › Integridade do app › Assinatura de apps)
  para o mesmo `sha256_cert_fingerprints`, sem tirar os outros. Sem ele, os links `https://physiqcalc.com.br/…` não abrem o
  app instalado pela loja.

## versionCode

A mesma fórmula do APK: `MAJOR*100000 + MINOR*100 + PATCH` (v3.56 = 305600). A Play recusa um versionCode que já recebeu:
cada envio à loja pede uma versão nova (o merge na `main` já faz o bump).
