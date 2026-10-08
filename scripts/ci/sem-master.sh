#!/usr/bin/env bash
# hml-08 (H-22) — o painel master fica SÓ no site (decisão do dono, 07/10/2026). Este script confere que uma pasta de build do
# app NÃO leva o código do master: o dist/ do `npm run build:apk` (APK do site) e do `npm run build:loja` (AAB da Google Play), e
# os .js tirados de dentro do AAB (conferência (f) do scripts/ci/aab-loja.sh). Os 2 builds põem VITE_APP_NATIVO=1, e o Rollup
# corta o master (src/lib/plataforma.ts). O site (Vercel, `npm run build`) continua com ele: lá este script FALHA, e é o certo.
#
#   uso: bash scripts/ci/sem-master.sh <pasta>
#
# Falha se achar, em qualquer arquivo da pasta, uma das marcas abaixo: strings de CÓDIGO do master, que nenhuma outra tela usa.
# Controle positivo: as 3 têm que existir no src/ (fora dos testes). Se o código mudar e uma sumir, o teste ficaria oco (passaria
# sempre); então ele falha pedindo para trocar a marca.
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARCAS=(
  "master-contas"           # src/master/api.ts: a função do painel master no banco principal
  "master-professores"      # src/pages/master/BibliotecaPage.tsx: a função da Biblioteca global no Treino
  "Contas, planos e alunos" # src/master/MasterLayout.tsx: o cartão "Painel master" do menu
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
  erro "sem-master: a pasta $pasta não existe (o build rodou?)"
  exit 2
fi
if [ -z "$(find "$pasta" -type f -name '*.js' -print -quit)" ]; then
  erro "sem-master: a pasta $pasta não tem nenhum .js — nada para conferir (o build rodou?)"
  exit 2
fi

# controle positivo: cada marca existe no código de verdade (os testes não contam)
for marca in "${MARCAS[@]}"; do
  if ! grep -rqF --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' -- "$marca" "$RAIZ/src"; then
    erro "sem-master: a marca \"$marca\" sumiu do src/ — o teste ficou oco. Troque por outra string de código do master (scripts/ci/sem-master.sh)."
    exit 2
  fi
done

achou=0
for marca in "${MARCAS[@]}"; do
  rc=0
  arquivos="$(grep -rlF -- "$marca" "$pasta")" || rc=$?
  if [ "$rc" -gt 1 ]; then
    erro "sem-master: o grep falhou ($rc) lendo $pasta"
    exit 2
  fi
  if [ -n "$arquivos" ]; then
    achou=$((achou + 1))
    erro "sem-master: \"$marca\" está em $(printf '%s\n' "$arquivos" | head -5 | tr '\n' ' ')"
  fi
done

if [ "$achou" -gt 0 ]; then
  erro "sem-master: $pasta leva o código do painel master ($achou de ${#MARCAS[@]} marcas). O master é só do site: o build do app precisa de VITE_APP_NATIVO=1 (npm run build:apk ou build:loja)."
  exit 1
fi
echo "OK sem-master: $pasta sai sem o painel master (${#MARCAS[@]} marcas conferidas; as ${#MARCAS[@]} existem no src/)"
