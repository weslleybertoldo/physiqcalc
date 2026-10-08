#!/usr/bin/env bash
# hml-11 (H-28, D4) — os textos legais NOVOS (Política de Privacidade, Termos de Uso e Termos de assinatura, em src/publico/legal/)
# esperam o advogado: até a virada (D12), eles e as peças deles (o resumo antes de pagar, o link "Assinatura" do rodapé e as 2 frases
# de tela) existem SÓ no build de staging. Este script confere que uma pasta de build de PRODUÇÃO sai sem eles: o dist/ do
# `npm run build:apk` (APK do site) e do `npm run build:loja` (AAB da Google Play), os 2 com VITE_DB_SCHEMA=public. A condição do Vite
# (import.meta.env.VITE_DB_SCHEMA === "staging", direto no Rotas.tsx, nas 3 telas que vendem, no PublicoLayout e nas frases) faz o
# Rollup cortar tudo na produção. No build de staging este script FALHA, e é o certo (o controle positivo, no local).
#
#   uso: bash scripts/ci/sem-texto-legal-novo.sh <pasta>
#
# Falha se achar, em qualquer arquivo da pasta, uma das marcas abaixo: strings que só existem no texto novo e nas peças dele (só ASCII,
# para o grep achar mesmo se o minificador escapar os acentos). Controle positivo: todas têm que existir no src/ (fora dos testes). Se
# o código mudar e uma sumir, o teste ficaria oco (passaria sempre); então ele falha pedindo para trocar a marca.
# Na virada (D12, passo 5): o texto novo vai para a produção, e a guarda passa a conferir só a faixa "em revisão" (as marcas da
# hml-12 saem da lista junto com as condições de staging das telas delas).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARCAS=(
  "Termos de assinatura do Physiq" # src/publico/legal/PaginaLegal.tsx: o título da página /assinatura
  "data-pagina-legal"              # src/publico/legal/PaginaLegal.tsx: as páginas novas (/privacidade, /termos e /assinatura)
  "data-texto-em-revisao"          # src/publico/legal/PaginaLegal.tsx: a faixa "Versão em revisão — ainda não publicada"
  "data-resumo-antes-de-pagar"     # src/publico/legal/ResumoAntesDePagar.tsx: o resumo nas 3 telas que vendem
  "data-rodape-assinatura"         # src/publico/PublicoLayout.tsx: o link "Assinatura" do rodapé público
  "data-frase-desistencia"         # src/publico/ExcluirConta.tsx e excluirConta/FluxoExclusao.tsx: a frase nova da desistência
  "data-frase-renovacao"           # src/painel/configuracoes/plano/PlanoContaNova.tsx: a frase nova da renovação
  "salvo a desist"                 # src/painel/configuracoes/excluirConta/regras.ts: o texto da frase nova ("salvo a desistência…")
  # hml-12 (H-30): o aceite, o consentimento de saúde e a idade — também só no staging até a virada (a mesma condição do Vite)
  "data-aceite-no-acesso"          # src/publico/legal/aceite/TelaDoAceite.tsx: a tela do aceite (a porta do App.tsx)
  "data-consentimento-saude"       # src/publico/legal/aceite/ConsentimentoSaude.tsx: Treinar sem profissional, o aceite e a pré-consulta /f/
  "data-tela-menor"                # src/publico/legal/aceite/TelaMenor.tsx: a trava de idade
  "data-secao-responsavel"         # src/publico/legal/responsavel/SecaoResponsavel.tsx: o consentimento do responsável na ficha
  "data-rodape-aceite"             # src/entrada/pecas/Moldura.tsx: o rodapé da entrada só com os links
  "data-aviso-idade-cadastro"      # src/publico/Cadastro.tsx: a linha da idade no link de cadastro /c/
  "data-declaracao-profissional"   # src/entrada/onboarding/CriarConta.tsx: a declaração do "Sou profissional"
  "data-pendente-idade"            # src/painel/alunos/Pendentes.tsx: a dica de idade dos cadastros pendentes
  "data-novo-aviso-idade"          # src/painel/alunos/NovoAluno.tsx: a linha do responsável (16–17) no "Cadastrar aluno"
  "data-frase-aceites"             # src/publico/ExcluirConta.tsx: o "O que fica guardado" da /excluir-conta (os aceites, 5 anos)
  "registro dos seus aceites"      # src/painel/configuracoes/excluirConta/regras.ts e src/publico/ExcluirConta.tsx: o texto da frase (e a Política nova)
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

# controle positivo: cada marca existe no código de verdade (os testes não contam)
for marca in "${MARCAS[@]}"; do
  if ! grep -rqF --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx' -- "$marca" "$RAIZ/src"; then
    erro "sem-texto-legal-novo: a marca \"$marca\" sumiu do src/ — o teste ficou oco. Troque por outra string do texto novo (scripts/ci/sem-texto-legal-novo.sh)."
    exit 2
  fi
done

achou=0
for marca in "${MARCAS[@]}"; do
  rc=0
  arquivos="$(grep -rlF -- "$marca" "$pasta")" || rc=$?
  if [ "$rc" -gt 1 ]; then
    erro "sem-texto-legal-novo: o grep falhou ($rc) lendo $pasta"
    exit 2
  fi
  if [ -n "$arquivos" ]; then
    achou=$((achou + 1))
    erro "sem-texto-legal-novo: \"$marca\" está em $(printf '%s\n' "$arquivos" | head -5 | tr '\n' ' ')"
  fi
done

if [ "$achou" -gt 0 ]; then
  erro "sem-texto-legal-novo: $pasta leva os textos legais novos ($achou de ${#MARCAS[@]} marcas). Eles esperam o advogado e ficam só no staging: o build de produção precisa de VITE_DB_SCHEMA=public e a condição do Vite direto no código (hml-11, D4)."
  exit 1
fi
echo "OK sem-texto-legal-novo: $pasta sai sem os textos legais novos (${#MARCAS[@]} marcas conferidas; as ${#MARCAS[@]} existem no src/)"
