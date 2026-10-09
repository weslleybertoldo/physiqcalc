#!/usr/bin/env bash
# hml-16b (H-45) — confere com quem o APK foi assinado (apksigner verify --print-certs, do build-tools do ANDROID_HOME).
#
#   descartavel <apk> <SHA-256 esperado>  o check da branch: assinado com a chave descartável que o job gerou (a impressão dela)
#                                         e NUNCA com a chave do site nem com a de upload da Play
#   site <apk>                            o APK do aparelho (job apk-aparelho): assinado com a chave do site
#
# As impressões são públicas (as mesmas do scripts/ci/aab-loja.sh e do public/.well-known/assetlinks.json). Falhou a leitura → a
# saída do apksigner vai para o log (só certificado e impressões: nada de segredo).
set -euo pipefail

SHA256_SITE="CF:F7:EC:90:E7:3F:CC:AF:1E:64:00:CE:23:F2:1F:2C:96:D0:3C:F7:10:38:86:04:01:5A:85:B5:89:38:9F:6C"   # APK do site
SHA256_UPLOAD="54:AE:BB:B0:27:71:0B:EA:01:C0:47:53:46:DB:17:8C:66:4F:73:11:41:DD:8C:94:BA:88:4F:D2:38:A5:26:4D" # upload (Play)

erro() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::error::%s\n' "$*" >&2; else printf 'ERRO: %s\n' "$*" >&2; fi
}
norm() { tr -d ':[:space:]' | tr 'a-f' 'A-F'; }

# o apksigner da versão estável mais nova do build-tools (pula rc/preview e pasta sem o executável)
apksigner_bin() {
  local d
  while IFS= read -r d; do
    if [ -x "${d}apksigner" ]; then
      printf '%s\n' "${d}apksigner"
      return 0
    fi
  done < <(find "${ANDROID_HOME:?ANDROID_HOME vazio}/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%p/\n' 2>/dev/null |
    { grep -E '/[0-9]+(\.[0-9]+)*/$' || true; } | sort -V -r)
  return 1
}

# a impressão SHA-256 do (primeiro) certificado que assina o APK, normalizada (sem ":" e em maiúsculas)
impressao_do_apk() {
  local apk="$1" as saida dig
  [ -f "$apk" ] || { erro "APK não encontrado: $apk"; return 1; }
  as="$(apksigner_bin)" || { erro "apksigner não encontrado em $ANDROID_HOME/build-tools"; return 1; }
  echo "apksigner: ${as#"$ANDROID_HOME"/} ($("$as" version 2>/dev/null || echo '?'))" >&2
  if ! saida="$("$as" verify --print-certs "$apk" 2>&1)"; then
    erro "apksigner verify recusou o APK (sem assinatura válida):"
    printf '%s\n' "$saida" | head -20 >&2
    return 1
  fi
  dig="$(printf '%s\n' "$saida" | { grep -E 'certificate SHA-256 digest:' || true; } | head -1 | sed -E 's/.*digest:[[:space:]]*//' | norm)"
  if [ -z "$dig" ]; then
    erro "a saída do apksigner não tem a impressão SHA-256 do certificado:"
    printf '%s\n' "$saida" | head -20 >&2
    return 1
  fi
  printf '%s\n' "$dig"
}

modo="${1:-}"
case "$modo" in
  descartavel)
    apk="${2:?uso: $0 descartavel <apk> <SHA-256 esperado>}"
    esperado="$(printf '%s' "${3:?uso: $0 descartavel <apk> <SHA-256 esperado>}" | norm)"
    site="$(printf '%s' "$SHA256_SITE" | norm)"
    upload="$(printf '%s' "$SHA256_UPLOAD" | norm)"
    if [ "$esperado" = "$site" ] || [ "$esperado" = "$upload" ]; then
      erro "a chave 'descartável' é uma chave REAL (site ou upload) — o check da branch não recebe chave real"
      exit 1
    fi
    dig="$(impressao_do_apk "$apk")"
    if [ "$dig" = "$site" ] || [ "$dig" = "$upload" ]; then
      erro "a branch assinou com uma chave REAL ($dig)"
      exit 1
    fi
    if [ "$dig" != "$esperado" ]; then
      erro "APK assinado com outra chave ($dig; esperada $esperado)"
      exit 1
    fi
    echo "OK APK assinado com a chave descartável do check (SHA-256 $dig) — não é a do site nem a de upload"
    ;;
  site)
    apk="${2:?uso: $0 site <apk>}"
    dig="$(impressao_do_apk "$apk")"
    if [ "$dig" != "$(printf '%s' "$SHA256_SITE" | norm)" ]; then
      erro "o APK não saiu com a chave do site ($dig)"
      exit 1
    fi
    echo "OK APK assinado com a chave do site (SHA-256 $dig)"
    ;;
  *)
    echo "uso: $0 descartavel <apk> <SHA-256 esperado> | site <apk>" >&2
    exit 2
    ;;
esac
