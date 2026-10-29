#!/usr/bin/env bash
# hml-11 (H-28, D4) → a VIRADA (D12 da hml-11 + hml-12 §10; 29/10/2026, decisão do dono: os textos publicados como estavam, sem
# advogado). Até a virada, os textos legais novos (a Política de Privacidade, os Termos de Uso e os Termos de assinatura, em
# src/publico/legal/) e as peças deles (o resumo antes de pagar, a porta do aceite, o consentimento de saúde, a idade…) existiam só no
# build de staging, e este script conferia que o build de produção saía SEM eles. Desde a virada eles valem em todo build, e a faixa
# "Versão em revisão — ainda não publicada" saiu do código (também do staging). O script passa a conferir, numa pasta de build (no CI:
# o dist/ do `npm run build:apk` — o APK do site — e do `npm run build:loja` — o AAB da Google Play —, os 2 com VITE_DB_SCHEMA=public):
#   1. PROIBIDAS: a faixa "em revisão" não está no build (nem no src/, fora dos testes: ela não volta sem querer);
#   2. OBRIGATORIAS (o controle positivo): o texto legal ESTÁ no build — a página, a porta do aceite e o resumo antes de pagar. Prova
#      que a pasta é um build de verdade e que a virada não voltou atrás (ex.: a condição de staging de novo, e o Rollup cortando).
#
#   uso: bash scripts/ci/sem-texto-legal-novo.sh <pasta>
#
# As marcas são só ASCII (o grep acha mesmo se o minificador escapar os acentos). Cada OBRIGATORIA tem que existir no src/ (fora dos
# testes): se o código mudar e uma sumir, a conferência ficaria oca — o script falha pedindo para trocar a marca.
# Saída: 0 = ok; 1 = a faixa no build/src ou o texto legal faltando no build; 2 = erro de uso (pasta sem .js, marca sumida do src/).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROIBIDAS=(
  "data-texto-em-revisao"          # a faixa "Versão em revisão — ainda não publicada" da src/publico/legal/PaginaLegal.tsx (saiu na virada)
)
OBRIGATORIAS=(
  "Termos de assinatura do Physiq" # src/publico/legal/PaginaLegal.tsx: o título da página /assinatura
  "data-pagina-legal"              # src/publico/legal/PaginaLegal.tsx: as páginas /privacidade, /termos e /assinatura
  "data-aceite-no-acesso"          # src/publico/legal/aceite/TelaDoAceite.tsx: a tela do aceite (a porta do App.tsx)
  "data-resumo-antes-de-pagar"     # src/publico/legal/ResumoAntesDePagar.tsx: o resumo nas telas que vendem e na folha da Google Play
)

erro() {
  if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::error::%s\n' "$*" >&2; else printf 'ERRO: %s\n' "$*" >&2; fi
}

pasta="${1:-}"
if [ -z "$pasta" ]; then
  echo "uso: $0 <pasta>   (ex.: dist)" >&2
  exit 2
fi
if [ ! -d "$pasta" ]; then
  erro "sem-texto-legal-novo: a pasta $pasta não existe (o build rodou?)"
  exit 2
fi
if [ -z "$(find "$pasta" -type f -name '*.js' -print -quit)" ]; then
  erro "sem-texto-legal-novo: a pasta $pasta não tem nenhum .js — nada para conferir (o build rodou?)"
  exit 2
fi

# controle positivo: cada marca obrigatória existe no código de verdade (os testes não contam)
for marca in "${OBRIGATORIAS[@]}"; do
  if ! grep -rqF --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' -- "$marca" "$RAIZ/src"; then
    erro "sem-texto-legal-novo: a marca \"$marca\" sumiu do src/ — a conferência ficou oca. Troque por outra string do texto legal (scripts/ci/sem-texto-legal-novo.sh)."
    exit 2
  fi
done

falhas=0
# 1. a faixa "em revisão": nem no src/ (fora dos testes) nem no build
for marca in "${PROIBIDAS[@]}"; do
  rc=0
  noSrc="$(grep -rlF --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' -- "$marca" "$RAIZ/src")" || rc=$?
  if [ "$rc" -gt 1 ]; then
    erro "sem-texto-legal-novo: o grep falhou ($rc) lendo o src/"
    exit 2
  fi
  if [ -n "$noSrc" ]; then
    falhas=$((falhas + 1))
    erro "sem-texto-legal-novo: a faixa \"em revisão\" (\"$marca\") voltou ao src/: $(printf '%s\n' "$noSrc" | head -5 | tr '\n' ' ')"
  fi
  rc=0
  arquivos="$(grep -rlF -- "$marca" "$pasta")" || rc=$?
  if [ "$rc" -gt 1 ]; then
    erro "sem-texto-legal-novo: o grep falhou ($rc) lendo $pasta"
    exit 2
  fi
  if [ -n "$arquivos" ]; then
    falhas=$((falhas + 1))
    erro "sem-texto-legal-novo: \"$marca\" está em $(printf '%s\n' "$arquivos" | head -5 | tr '\n' ' ')"
  fi
done

# 2. o texto legal tem que estar no build (desde a virada, em todo build)
for marca in "${OBRIGATORIAS[@]}"; do
  if ! grep -rqF -- "$marca" "$pasta"; then
    falhas=$((falhas + 1))
    erro "sem-texto-legal-novo: \"$marca\" não está em $pasta — o build saiu sem o texto legal (a virada voltou atrás? a condição de staging de novo?)"
  fi
done

if [ "$falhas" -gt 0 ]; then
  erro "sem-texto-legal-novo: $pasta não passou ($falhas problema(s)). Desde a virada (29/10/2026) o texto legal vai em todo build, sem a faixa \"em revisão\" (docs/textos-legais.md)."
  exit 1
fi
echo "OK sem-texto-legal-novo: $pasta sem a faixa \"em revisão\" (${#PROIBIDAS[@]} marca) e com o texto legal (as ${#OBRIGATORIAS[@]} marcas obrigatórias no build e no src/)"
