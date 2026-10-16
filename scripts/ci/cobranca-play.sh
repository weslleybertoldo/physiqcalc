#!/usr/bin/env bash
# play-W6 — a cobrança da Google Play (a Play Billing Library 9.1.0 + o PlayBillingPlugin) só na versão da loja. O build type
# playRelease leva a biblioteca (playReleaseImplementation no android/app/build.gradle), o plugin (src/playRelease/java) e a
# permissão com.android.vending.BILLING que o AAR da biblioteca declara; o APK do site (release) não leva nenhum dos três.
#
#   tem <arquivo.aab|arquivo.apk>   a versão da loja (o AAB do aab-loja.sh e o APK "loja + staging"): a permissão BILLING no
#                                   manifesto e, no dex, o plugin e a biblioteca
#   sem <arquivo.apk>               o APK do site (build-apk.yml e o check da branch): nem a permissão, nem o plugin, nem a biblioteca
#
# O manifesto: do APK pelo aapt2 (dump permissions); do AAB pelo bundletool (o jar vem em BUNDLETOOL_JAR — o aab-loja.sh já o
# baixa e confere o SHA-256). As classes: a lista do dexdump ("Class descriptor") de cada .dex de dentro do arquivo. As
# ferramentas do Android vêm do build-tools do ANDROID_HOME (a versão estável mais nova). Fora do job do AAB porque o job do APK
# não cita o aab-loja.sh (a release continua só com o APK — src/lib/distribuicao.test.ts).
set -euo pipefail

PERMISSAO="com.android.vending.BILLING"
CLASSE_PLUGIN="Lcom/bertoldo/physiqcalc/PlayBillingPlugin;"
# a biblioteca: o ProxyBillingActivity mantém o nome (as regras do próprio AAR) — prova de que a PBL entrou no dex
CLASSE_BIBLIOTECA="Lcom/android/billingclient/api/ProxyBillingActivity;"

erro() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::error::%s\n' "$*" >&2; else printf 'ERRO: %s\n' "$*" >&2; fi
}
log() { printf '%s\n' "$*"; }

# a ferramenta da versão estável mais nova do build-tools (pula rc/preview e pasta sem o executável) — o molde do apk-assinatura.sh
build_tools() {
  local nome="$1" d
  while IFS= read -r d; do
    if [ -x "${d}${nome}" ]; then
      printf '%s\n' "${d}${nome}"
      return 0
    fi
  done < <(find "${ANDROID_HOME:?ANDROID_HOME vazio}/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%p/\n' 2>/dev/null |
    { grep -E '/[0-9]+(\.[0-9]+)*/$' || true; } | sort -V -r)
  return 1
}

# as permissões pedidas pelo arquivo, uma por linha
permissoes() {
  local arq="$1" aapt2 java
  case "$arq" in
    *.aab)
      [ -n "${BUNDLETOOL_JAR:-}" ] && [ -f "$BUNDLETOOL_JAR" ] || { erro "AAB sem o BUNDLETOOL_JAR (o aab-loja.sh passa o dele)"; return 1; }
      java="${JAVA_HOME:+$JAVA_HOME/bin/}java"
      "$java" -jar "$BUNDLETOOL_JAR" dump manifest --bundle="$arq" 2>/dev/null |
        { grep -oE 'uses-permission[^>]*android:name="[^"]+"' || true; } | sed -E 's/.*android:name="([^"]+)"/\1/'
      ;;
    *.apk)
      aapt2="$(build_tools aapt2)" || { erro "aapt2 não encontrado em $ANDROID_HOME/build-tools"; return 1; }
      "$aapt2" dump permissions "$arq" | { grep -oE "^uses-permission: name='[^']+'" || true; } | sed -E "s/.*name='([^']+)'/\1/"
      ;;
    *)
      erro "não sei ler as permissões de $arq (só .aab e .apk)"
      return 1
      ;;
  esac
}

# as classes (descritores) de todos os .dex de dentro do arquivo, uma por linha
classes() {
  local arq="$1" dexdump tmp n=0 f
  dexdump="$(build_tools dexdump)" || { erro "dexdump não encontrado em $ANDROID_HOME/build-tools"; return 1; }
  tmp="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/dex-play.XXXXXX")"
  unzip -qo "$arq" '*.dex' -d "$tmp" >/dev/null 2>&1 || true
  while IFS= read -r f; do
    n=$((n + 1))
    # play-W6 (a revisão, ⚪19): o código de saída de CADA dex — no multidex, o dex que falha (onde podia estar o plugin) não passa calado
    if ! "$dexdump" "$f" > "$tmp/saida.txt" 2>/dev/null; then
      erro "o dexdump falhou em ${f#"$tmp"/} (a lista de classes ficaria incompleta)"
      rm -rf "${tmp:?}"
      return 1
    fi
    sed -n "s/^  Class descriptor  : '\(.*\)'$/\1/p" "$tmp/saida.txt"
  done < <(find "$tmp" -type f -name '*.dex' | sort)
  rm -rf "${tmp:?}"
  if [ "$n" -eq 0 ]; then
    erro "o arquivo não tem .dex: $arq"
    return 1
  fi
}

tem() {
  local arq="$1" perms lista falhas=0
  [ -f "$arq" ] || { erro "arquivo não encontrado: $arq"; return 1; }
  perms="$(permissoes "$arq")" || return 1
  lista="$(classes "$arq")" || return 1
  if [ -z "$perms" ]; then
    erro "(g) a leitura das permissões veio vazia"
    falhas=$((falhas + 1))
  elif ! grep -qxF "$PERMISSAO" <<< "$perms"; then
    erro "(g) a versão da loja sem a permissão $PERMISSAO — a Play Billing Library não entrou no playRelease"
    falhas=$((falhas + 1))
  fi
  if ! grep -qxF "$CLASSE_PLUGIN" <<< "$lista"; then
    erro "(g) a versão da loja sem o plugin de cobrança ($CLASSE_PLUGIN)"
    falhas=$((falhas + 1))
  fi
  if ! grep -qxF "$CLASSE_BIBLIOTECA" <<< "$lista"; then
    erro "(g) a versão da loja sem a Play Billing Library ($CLASSE_BIBLIOTECA)"
    falhas=$((falhas + 1))
  fi
  if [ "$falhas" -gt 0 ]; then return 1; fi
  log "OK (g) a cobrança da Play na versão da loja: $PERMISSAO + o PlayBillingPlugin + a Play Billing Library ($(wc -l <<< "$lista") classes no dex)"
}

sem() {
  local arq="$1" perms lista falhas=0
  [ -f "$arq" ] || { erro "APK não encontrado: $arq"; return 1; }
  perms="$(permissoes "$arq")" || return 1
  lista="$(classes "$arq")" || return 1
  if [ -z "$perms" ] || ! grep -qxF "android.permission.INTERNET" <<< "$perms"; then
    erro "a leitura das permissões do APK falhou (veio sem as de sempre)"
    falhas=$((falhas + 1))
  elif grep -qxF "$PERMISSAO" <<< "$perms"; then
    erro "o APK do site pede $PERMISSAO — a cobrança da Play é só da versão da loja (playReleaseImplementation)"
    falhas=$((falhas + 1))
  fi
  if [ "$(wc -l <<< "$lista")" -lt 100 ]; then
    erro "a lista de classes do APK veio curta demais (a leitura do dex falhou?)"
    falhas=$((falhas + 1))
  fi
  if grep -qxF "$CLASSE_PLUGIN" <<< "$lista"; then
    erro "o APK do site tem o plugin de cobrança da Play ($CLASSE_PLUGIN)"
    falhas=$((falhas + 1))
  fi
  if grep -q '^Lcom/android/billingclient/' <<< "$lista"; then
    erro "o APK do site tem classes da Play Billing Library (com.android.billingclient)"
    falhas=$((falhas + 1))
  fi
  if [ "$falhas" -gt 0 ]; then return 1; fi
  log "OK o APK do site sem a cobrança da Play: sem $PERMISSAO, sem o plugin e sem a biblioteca ($(wc -l <<< "$lista") classes no dex)"
}

case "${1:-}" in
  tem) tem "${2:?uso: $0 tem <arquivo.aab|arquivo.apk>}" ;;
  sem) sem "${2:?uso: $0 sem <arquivo.apk>}" ;;
  *)
    echo "uso: $0 <tem <arquivo.aab|arquivo.apk>|sem <arquivo.apk>>" >&2
    exit 2
    ;;
esac
