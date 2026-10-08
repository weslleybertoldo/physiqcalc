#!/usr/bin/env bash
# W4 da loja — o AAB da Google Play: o build type playRelease (android/app/build.gradle) com o site do `npm run build:loja`,
# assinado SÓ com a chave de UPLOAD. Um script só para os 2 workflows (job `aab-loja` do build-apk.yml, no merge na main, e do
# build-apk-check.yml, na branch) e para o build local (`npm run build:aab`). Cada passo é um subcomando para o CI dar a cada
# um só o que ele precisa: os segredos da chave de upload chegam só no passo do Gradle (nem o `npm ci` nem o vite os veem).
# Como gerar, onde baixar e o Play App Signing: docs/loja-google-play.md.
#
#   versao          versionName e versionCode no android/app/build.gradle — a MESMA fórmula do APK do site (build-apk.yml)
#   firebase        o google-services.json do segredo GOOGLE_SERVICES_JSON (igual ao job do APK; sem ele, o AAB sai sem push)
#   web             npm run build:loja + o dist/ sem o painel master (scripts/ci/sem-master.sh) e sem os textos legais novos
#                   (scripts/ci/sem-texto-legal-novo.sh, menos no build de staging) + npx cap sync android (os VITE_* vêm do
#                   ambiente, os mesmos do APK)
#   gradle          ./gradlew bundlePlayRelease com a chave de upload (PLAY_UPLOAD_*; no CI o .p12 vem em base64 no
#                   PLAY_UPLOAD_KEYSTORE_BASE64). Sem a chave o AAB sai SEM assinatura — e a conferência recusa
#   conferir [aab]  as conferências abaixo; passando todas, o AAB vira Physiq-v<versão>-loja.aab (SUFIXO_AAB troca o "-loja")
#   sem-master aab  só a conferência (f), sem o Android (sem keytool, bundletool nem Gradle)
#   local           versao + web + gradle + conferir no notebook, com a chave do ~/keystores/physiq-play-upload.env (lida só
#                   no Gradle; PLAY_UPLOAD_ENV troca o arquivo), e devolve o build.gradle como estava
#
# A conferência falha o job se:
#   (a) o AAB não estiver assinado só com a chave de upload (SHA-256 abaixo) — sem assinatura, com outra chave ou com a do site;
#   (b) o manifesto final tiver REQUEST_INSTALL_PACKAGES (a loja proíbe app que se atualiza por fora dela) ou não for do pacote;
#   (c) o site dentro do AAB não for o do `npm run build:loja`: a marca <meta name="physiq-distribuicao" content="play"> que o
#       vite.config.ts põe no index.html só nele (o site e o APK do site saem com content="site");
#   (d) o versionCode (e o versionName) do AAB não baterem com o package.json pela fórmula;
#   (e) com o google-services.json presente, o Gradle não tiver gerado o google_app_id do playRelease (a checagem do APK);
#   (f) o JS do site dentro do AAB levar o painel master (hml-08: o master é só do site) — o scripts/ci/sem-master.sh nos .js de
#       base/assets/public/assets/.
set -euo pipefail
shopt -s inherit_errexit

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACOTE="com.bertoldo.physiqcalc"
# Impressões digitais (públicas) dos certificados. A da chave de upload também está no public/.well-known/assetlinks.json.
SHA256_UPLOAD="54:AE:BB:B0:27:71:0B:EA:01:C0:47:53:46:DB:17:8C:66:4F:73:11:41:DD:8C:94:BA:88:4F:D2:38:A5:26:4D" # upload (Play)
SHA256_SITE="CF:F7:EC:90:E7:3F:CC:AF:1E:64:00:CE:23:F2:1F:2C:96:D0:3C:F7:10:38:86:04:01:5A:85:B5:89:38:9F:6C"   # APK do site
MARCA_LOJA='<meta name="physiq-distribuicao" content="play">'
GRADLE_APP="$RAIZ/android/app/build.gradle"
SAIDA="$RAIZ/android/app/build/outputs/bundle/playRelease"
AAB_GERADO="$SAIDA/app-playRelease.aab"
# bundletool oficial (github.com/google/bundletool) — lê o manifesto de dentro do AAB; o SHA-256 é o publicado na release
BUNDLETOOL_VERSAO="1.18.3"
BUNDLETOOL_SHA256="a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29"

# No notebook: o JDK 21 e o Android SDK de lá quando o ambiente não diz outros (no CI, o setup-java e o setup-android dizem).
if [ -z "${JAVA_HOME:-}" ] && [ -d "$HOME/jdk21" ]; then export JAVA_HOME="$HOME/jdk21"; fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/android-sdk" ]; then export ANDROID_HOME="$HOME/android-sdk"; fi

GRADLE_ORIGINAL=""
limpar() {
  if [ -n "$GRADLE_ORIGINAL" ] && [ -f "$GRADLE_ORIGINAL" ]; then
    cp "$GRADLE_ORIGINAL" "$GRADLE_APP"
    rm -f "$GRADLE_ORIGINAL"
    echo "build.gradle devolvido como estava (versão só no AAB)"
  fi
}
trap limpar EXIT

log() { printf '%s\n' "$*"; }
erro() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::error::%s\n' "$*" >&2; else printf 'ERRO: %s\n' "$*" >&2; fi
}
aviso() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::warning::%s\n' "$*"; else printf 'AVISO: %s\n' "$*"; fi
}
morre() {
  erro "$*"
  exit 1
}

versao_do_pacote() { (cd "$RAIZ" && node -p "require('./package.json').version"); }

# versionCode = MAJOR*100000 + MINOR*100 + PATCH — a fórmula do build-apk.yml (Physiq 3.0, W0). A loja recusa versionCode repetido:
# cada envio pede uma versão nova (o merge na main já faz o bump).
codigo_da_versao() {
  local ma mi pa
  IFS='.' read -r ma mi pa <<< "$1"
  pa=${pa:-0}
  echo $((ma * 100000 + mi * 100 + pa))
}

# keytool, jarsigner e java do JAVA_HOME (no CI, o JDK 21 do setup-java)
jdk() {
  local ferramenta="$1"
  shift
  "${JAVA_HOME:+$JAVA_HOME/bin/}$ferramenta" "$@"
}

bundletool_jar() {
  local dir="${BUNDLETOOL_DIR:-${RUNNER_TEMP:-${XDG_CACHE_HOME:-$HOME/.cache}/physiq-aab}}"
  local jar="$dir/bundletool-all-$BUNDLETOOL_VERSAO.jar"
  if [ ! -f "$jar" ] || [ "$(sha256sum "$jar" | cut -d' ' -f1)" != "$BUNDLETOOL_SHA256" ]; then
    mkdir -p "$dir"
    curl -fsSL --retry 3 -o "$jar.baixando" \
      "https://github.com/google/bundletool/releases/download/$BUNDLETOOL_VERSAO/bundletool-all-$BUNDLETOOL_VERSAO.jar"
    if [ "$(sha256sum "$jar.baixando" | cut -d' ' -f1)" != "$BUNDLETOOL_SHA256" ]; then
      rm -f "$jar.baixando"
      morre "o bundletool $BUNDLETOOL_VERSAO baixado não tem o SHA-256 esperado"
    fi
    mv "$jar.baixando" "$jar"
  fi
  printf '%s\n' "$jar"
}

passo_versao() {
  local v code
  v="$(versao_do_pacote)"
  code="$(codigo_da_versao "$v")"
  sed -i "s/versionCode [0-9]\+/versionCode $code/" "$GRADLE_APP"
  sed -i "s/versionName \"[^\"]*\"/versionName \"$v\"/" "$GRADLE_APP"
  grep -qE "versionCode $code\$" "$GRADLE_APP" && grep -qF "versionName \"$v\"" "$GRADLE_APP" ||
    morre "a versão não entrou no android/app/build.gradle"
  log "versionCode=$code versionName=$v"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "current=$v" >> "$GITHUB_OUTPUT"
    echo "code=$code" >> "$GITHUB_OUTPUT"
  fi
}

# Physiq W20c: o arquivo vem do segredo e NUNCA entra no git; o build.gradle só aplica o plugin do Google quando ele existe.
passo_firebase() {
  if [ -z "${GOOGLE_SERVICES_JSON:-}" ]; then
    aviso "GOOGLE_SERVICES_JSON vazio: AAB sem push (FCM)"
    return 0
  fi
  printf '%s' "$GOOGLE_SERVICES_JSON" > "$RAIZ/android/app/google-services.json"
  (cd "$RAIZ" && node -e "const j=require('./android/app/google-services.json'); const ok=(j.client||[]).some((c)=>c&&c.client_info&&c.client_info.android_client_info&&c.client_info.android_client_info.package_name==='$PACOTE'); if(!ok){console.error('google-services.json sem o app $PACOTE');process.exit(1)} console.log('google-services.json escrito: projeto Firebase '+j.project_info.project_id)")
}

passo_web() {
  cd "$RAIZ"
  npm run build:loja
  grep -qF "$MARCA_LOJA" dist/index.html || morre "o dist/ não é o site da loja (falta $MARCA_LOJA no index.html)"
  # hml-08 (H-22): o painel master é só do site — o build:loja (VITE_APP_NATIVO=1) sai sem ele
  bash "$RAIZ/scripts/ci/sem-master.sh" dist
  # hml-11 (H-28): os textos legais novos esperam o advogado e ficam só no staging — o build de produção (o do CI, VITE_DB_SCHEMA=public)
  # sai sem eles. O AAB de teste do notebook (npm run build:aab com o .env.local de staging) os leva: lá a conferência não vale. No CI
  # (GITHUB_ACTIONS) ela roda sempre, diga o health.json o que disser.
  if [ -z "${GITHUB_ACTIONS:-}" ] && grep -qF '"schema":"staging"' dist/health.json 2>/dev/null; then
    log "build de staging: os textos legais novos são esperados no dist/ (sem a conferência da produção)"
  else
    bash "$RAIZ/scripts/ci/sem-texto-legal-novo.sh" dist
  fi
  npx cap sync android
}

passo_gradle() {
  local chave_tmp="" rc=0
  if [ -z "${PLAY_UPLOAD_KEYSTORE_FILE:-}" ] && [ -n "${PLAY_UPLOAD_KEYSTORE_BASE64:-}" ]; then
    chave_tmp="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/chave-upload.XXXXXX")"
    # o segredo pode vir quebrado em linhas (base64 de 76 colunas) ou com \r: só o alfabeto do base64 vai para o decode
    (umask 077 && printf '%s' "$PLAY_UPLOAD_KEYSTORE_BASE64" | tr -d '\r\n ' | base64 -d > "$chave_tmp/upload.p12")
    export PLAY_UPLOAD_KEYSTORE_FILE="$chave_tmp/upload.p12"
  fi
  unset PLAY_UPLOAD_KEYSTORE_BASE64
  if [ -z "${PLAY_UPLOAD_KEYSTORE_FILE:-}" ]; then
    aviso "sem a chave de upload (PLAY_UPLOAD_KEYSTORE_FILE ou PLAY_UPLOAD_KEYSTORE_BASE64): o AAB sai SEM assinatura e a conferência recusa"
  fi
  rm -f "$SAIDA"/*.aab
  # --no-daemon: o processo do Gradle termina com o build e não fica com as variáveis da chave na memória
  (cd "$RAIZ/android" && bash ./gradlew --no-daemon bundlePlayRelease) || rc=$?
  if [ -n "$chave_tmp" ]; then rm -rf "$chave_tmp"; fi
  return "$rc"
}

# (f) hml-08 (H-22): os .js do site de dentro do AAB (base/assets/public/assets/) sem o painel master, pelo mesmo
# scripts/ci/sem-master.sh do dist/. Fora do passo_conferir para rodar sem o Android: `aab-loja.sh sem-master <arquivo.aab>`.
conferir_sem_master() {
  local aab="$1" tmp rc=0 rc_sm=0
  [ -f "$aab" ] || morre "AAB não encontrado: $aab"
  tmp="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aab-js.XXXXXX")"
  unzip -qo "$aab" 'base/assets/public/assets/*.js' -d "$tmp" || true
  if [ -z "$(find "$tmp" -type f -name '*.js' -print -quit)" ]; then
    erro "(f) o AAB não tem o JS do site (base/assets/public/assets/*.js)"
    rc=1
  else
    bash "$RAIZ/scripts/ci/sem-master.sh" "$tmp/base/assets/public/assets" || rc_sm=$?
    if [ "$rc_sm" -eq 0 ]; then
      log "OK (f) o JS do site dentro do AAB sai sem o painel master"
    elif [ "$rc_sm" -eq 1 ]; then
      erro "(f) o JS do site dentro do AAB leva o painel master — o master é só do site (o build:loja precisa de VITE_APP_NATIVO=1)"
      rc=1
    else
      erro "(f) a conferência do master não rodou (scripts/ci/sem-master.sh saiu com $rc_sm)"
      rc=1
    fi
  fi
  rm -rf "$tmp"
  return "$rc"
}

passo_conferir() {
  local aab="${1:-$AAB_GERADO}" falhas=0
  [ -f "$aab" ] || morre "AAB não encontrado: $aab (o passo gradle gera)"
  # keytool e jarsigner em inglês (o notebook está em pt-BR): a conferência lê a saída deles
  local en=(-J-Duser.language=en -J-Duser.country=US)

  # (a) a assinatura: um único certificado, o da chave de upload, e a assinatura íntegra
  local cert sha256s verificacao
  cert="$(jdk keytool "${en[@]}" -printcert -jarfile "$aab" 2>&1 || true)"
  sha256s="$(printf '%s\n' "$cert" | sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' | tr -d '\r' | sort -u)"
  verificacao="$(jdk jarsigner "${en[@]}" -verify "$aab" 2>&1 || true)"
  if grep -qF "$SHA256_SITE" <<< "$cert"; then
    erro "(a) o AAB está assinado com a chave do APK do SITE — a loja só recebe a chave de upload"
    falhas=$((falhas + 1))
  elif grep -q '^Not a signed jar file' <<< "$cert"; then
    erro "(a) o AAB está SEM assinatura (faltou a chave de upload: PLAY_UPLOAD_*)"
    falhas=$((falhas + 1))
  elif [ -z "$sha256s" ]; then
    erro "(a) a assinatura do AAB não se lê (keytool): $(head -2 <<< "$cert" | tr '\n' ' ')"
    falhas=$((falhas + 1))
  elif [ "$sha256s" != "$SHA256_UPLOAD" ]; then
    erro "(a) o AAB está assinado com outra chave: $(printf '%s' "$sha256s" | tr '\n' ' ')"
    falhas=$((falhas + 1))
  elif ! grep -q '^jar verified\.' <<< "$verificacao"; then
    erro "(a) a assinatura do AAB não confere (jarsigner -verify): $(printf '%s' "$verificacao" | head -3 | tr '\n' ' ')"
    falhas=$((falhas + 1))
  else
    log "OK (a) assinado só com a chave de upload — SHA-256 $sha256s (jarsigner: jar verified)"
  fi

  # (b) e (d) o manifesto final, lido de dentro do AAB pelo bundletool
  local bt manifesto vcode vname v code
  bt="$(bundletool_jar)"
  manifesto="$(jdk java -jar "$bt" dump manifest --bundle="$aab" 2>&1)" || {
    erro "(b) o bundletool não leu o manifesto do AAB: $(printf '%s' "$manifesto" | head -3 | tr '\n' ' ')"
    manifesto=""
    falhas=$((falhas + 1))
  }
  if [ -n "$manifesto" ]; then
    if ! grep -qF "package=\"$PACOTE\"" <<< "$manifesto"; then
      erro "(b) o manifesto do AAB não é do pacote $PACOTE"
      falhas=$((falhas + 1))
    elif ! grep -qF 'android.permission.INTERNET' <<< "$manifesto"; then
      erro "(b) o manifesto do AAB veio sem as permissões de sempre (a leitura falhou?)"
      falhas=$((falhas + 1))
    elif grep -qF 'REQUEST_INSTALL_PACKAGES' <<< "$manifesto"; then
      erro "(b) o manifesto do AAB tem REQUEST_INSTALL_PACKAGES — a loja proíbe (src/playRelease/AndroidManifest.xml tira)"
      falhas=$((falhas + 1))
    else
      log "OK (b) manifesto do $PACOTE sem REQUEST_INSTALL_PACKAGES"
    fi
  fi
  v="$(versao_do_pacote)"
  code="$(codigo_da_versao "$v")"
  vcode="$(jdk java -jar "$bt" dump manifest --bundle="$aab" --xpath=/manifest/@android:versionCode 2>/dev/null | tr -d '[:space:]' || true)"
  vname="$(jdk java -jar "$bt" dump manifest --bundle="$aab" --xpath=/manifest/@android:versionName 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$vcode" != "$code" ] || [ "$vname" != "$v" ]; then
    erro "(d) versão do AAB = versionCode ${vcode:-?} / versionName ${vname:-?}; pela fórmula, v$v = $code"
    falhas=$((falhas + 1))
  else
    log "OK (d) versionCode $vcode = v$v pela fórmula (MAJOR*100000 + MINOR*100 + PATCH)"
  fi

  # (c) o site dentro do AAB é o do build:loja
  local html
  html="$(unzip -p "$aab" base/assets/public/index.html 2>/dev/null || true)"
  if [ -z "$html" ]; then
    erro "(c) o AAB não tem o site (base/assets/public/index.html)"
    falhas=$((falhas + 1))
  elif ! grep -qF "$MARCA_LOJA" <<< "$html"; then
    erro "(c) o site dentro do AAB NÃO é o do npm run build:loja (falta $MARCA_LOJA)"
    falhas=$((falhas + 1))
  else
    log "OK (c) site da loja dentro do AAB ($MARCA_LOJA)"
  fi

  # (e) o Firebase do push, a mesma checagem do APK (W20c), nos recursos gerados do playRelease
  if [ -f "$RAIZ/android/app/google-services.json" ]; then
    local f
    f="$(grep -rl 'google_app_id' "$RAIZ/android/app/build/generated" --include=values.xml 2>/dev/null | grep -i 'playrelease' | head -1 || true)"
    if [ -z "$f" ]; then
      erro "(e) google-services NÃO foi aplicado no playRelease (sem google_app_id nos recursos gerados)"
      falhas=$((falhas + 1))
    else
      log "OK (e) Firebase no AAB: plugin google-services aplicado (google_app_id em ${f#"$RAIZ"/})"
    fi
  else
    log "-- (e) AAB sem Firebase (sem o segredo GOOGLE_SERVICES_JSON): o push fica desligado"
  fi

  # (f) o JS do site dentro do AAB sai sem o painel master (hml-08)
  conferir_sem_master "$aab" || falhas=$((falhas + 1))

  if [ "$falhas" -gt 0 ]; then
    morre "o AAB NÃO passou: $falhas conferência(s) falharam"
  fi
  local final="$aab"
  if [ "$aab" = "$AAB_GERADO" ]; then
    final="$SAIDA/Physiq-v$v${SUFIXO_AAB:--loja}.aab"
    mv "$aab" "$final"
  fi
  log "AAB conferido: ${final#"$RAIZ"/} ($(du -h "$final" | cut -f1), SHA-256 $(sha256sum "$final" | cut -d' ' -f1))"
}

passo_local() {
  local env_chave="${PLAY_UPLOAD_ENV:-$HOME/keystores/physiq-play-upload.env}"
  [ -f "$env_chave" ] || morre "sem a chave de upload em $env_chave (docs/loja-google-play.md)"
  GRADLE_ORIGINAL="$(mktemp "${TMPDIR:-/tmp}/build.gradle.XXXXXX")"
  cp "$GRADLE_APP" "$GRADLE_ORIGINAL"
  passo_versao
  passo_web
  # a chave só no ambiente do Gradle (subshell)
  (
    set -a
    # shellcheck disable=SC1090
    . "$env_chave"
    set +a
    passo_gradle
  )
  passo_conferir
}

case "${1:-}" in
  versao) passo_versao ;;
  firebase) passo_firebase ;;
  web) passo_web ;;
  gradle) passo_gradle ;;
  conferir) passo_conferir "${2:-}" ;;
  sem-master) conferir_sem_master "${2:?uso: $0 sem-master <arquivo.aab>}" ;;
  local) passo_local ;;
  *)
    echo "uso: $0 <versao|firebase|web|gradle|conferir [arquivo.aab]|sem-master <arquivo.aab>|local>" >&2
    exit 2
    ;;
esac
