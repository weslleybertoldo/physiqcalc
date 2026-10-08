#!/usr/bin/env bash
# Cifra as cópias MANUAIS do banco do Physiq (hml-07, homologação 08/10/2026 — achado H-21, item 2). Roda de hora em
# hora no notebook (physiq-backups-cifrar.timer, ver instalar.sh).
#
# Cada entrada do 1º nível de ~/backups/physiq que ainda está aberta (pasta ou arquivo que não termina em .age) e cujo
# arquivo mais novo tem IDADE_MIN minutos ou mais (padrão 120: a cópia de uma manutenção em andamento fica aberta até
# 2 h) vira <nome>.tar.age, cifrada para a chave PÚBLICA de destinatario.age (a privada fica só no cofre), e a aberta é
# apagada.
#   - dentro do .tar.age vai um SHA256SUMS com o hash de cada arquivo: depois de decifrar, `sha256sum -c SHA256SUMS`
#     prova que voltou igual;
#   - o .tar.age leva a data do arquivo mais novo da cópia: o timer de limpeza (29+ dias) continua contando da cópia;
#   - nome já usado → <nome>-AAAAMMDDHHMMSS.tar.age.
#
# Uso: cifrar-copias-manuais.sh [--dir <pasta>] [--idade-min <minutos>] [--simular]
# Com AGE_IDENTIDADE=<arquivo da chave privada> (só à mão, nunca no timer: a privada não mora no notebook) cada cópia
# é decifrada e conferida ANTES de a aberta ser apagada. Variáveis de teste: AGE_DESTINATARIO_ARQ, PHYSIQ_BACKUP_LOG.
set -euo pipefail
umask 077

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESTINATARIO="${AGE_DESTINATARIO_ARQ:-$AQUI/destinatario.age}"
LOG="${PHYSIQ_BACKUP_LOG:-$HOME/.local/state/physiq-backup/cifrar.log}"
DIR="$HOME/backups/physiq"
IDADE_MIN=120
SIMULAR=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) shift; DIR="${1:?--dir sem pasta}" ;;
    --idade-min) shift; IDADE_MIN="${1:?--idade-min sem número}" ;;
    --simular) SIMULAR=1 ;;
    *) echo "uso: cifrar-copias-manuais.sh [--dir <pasta>] [--idade-min <minutos>] [--simular]" >&2; exit 2 ;;
  esac
  shift
done
[[ "$IDADE_MIN" =~ ^[0-9]+$ ]] || { echo "--idade-min precisa ser número" >&2; exit 2; }
[ -s "$DESTINATARIO" ] || { echo "sem a chave pública do age: $DESTINATARIO" >&2; exit 2; }
command -v age > /dev/null 2>&1 || { echo "sem o age no PATH" >&2; exit 2; }
mkdir -p "$(dirname "$LOG")"
registrar() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }

if [ ! -d "$DIR" ]; then
  registrar "sem a pasta $DIR: nada a fazer"
  exit 0
fi
DIR="$(cd "$DIR" && pwd -P)"
case "$DIR" in / | "$HOME" | "$HOME"/) registrar "pasta recusada: $DIR"; exit 1 ;; esac

cifrar_uma() {
  local nome="$1"
  local origem="$DIR/$nome"
  local mais_novo idade alvo
  mais_novo="$(find "$origem" -printf '%T@\n' | sort -n | tail -n1)"
  mais_novo="${mais_novo%.*}"
  idade=$((($(date +%s) - mais_novo) / 60))
  if [ "$idade" -lt "$IDADE_MIN" ]; then
    echo "fica aberta (mexida há $idade min): $nome"
    return 0
  fi
  alvo="$DIR/$nome.tar.age"
  [ -e "$alvo" ] && alvo="$DIR/$nome-$(date +%Y%m%d%H%M%S).tar.age"
  if [ "$SIMULAR" = 1 ]; then
    echo "simulação: cifraria $nome → $(basename "$alvo")"
    return 0
  fi
  # TMP_COPIA é global de propósito: roda dentro do subshell de cada cópia e o EXIT (que dispara depois do return, já
  # fora do escopo de um local) apaga a pasta temporária — e a volta decifrada — mesmo quando um passo falha
  TMP_COPIA="$(mktemp -d)"
  trap 'rm -rf "$TMP_COPIA"' EXIT
  local tmp="$TMP_COPIA"
  (cd "$DIR" && find "$nome" -type f -print0 | sort -z | xargs -0 -r sha256sum) > "$tmp/SHA256SUMS"
  local arquivos parcial="$DIR/.$nome.parcial"
  arquivos="$(wc -l < "$tmp/SHA256SUMS")"
  tar --sort=name -cf - -C "$DIR" "$nome" -C "$tmp" SHA256SUMS | age -R "$DESTINATARIO" -o "$parcial"
  [ -s "$parcial" ] || { echo "arquivo cifrado vazio: $nome" >&2; rm -f "$parcial"; return 1; }
  local conferida="sem conferir (sem a chave privada)"
  if [ -n "${AGE_IDENTIDADE:-}" ]; then
    mkdir "$tmp/volta"
    age -d -i "$AGE_IDENTIDADE" "$parcial" | tar -xf - -C "$tmp/volta"
    (cd "$tmp/volta" && sha256sum --quiet --strict -c SHA256SUMS)
    [ "$(cd "$tmp/volta" && find "$nome" -type f | wc -l)" -eq "$arquivos" ] || { echo "faltou arquivo na volta: $nome" >&2; rm -f "$parcial"; return 1; }
    conferida="conferida (decifrada, $arquivos arquivos com o mesmo sha256)"
  fi
  mv "$parcial" "$alvo"
  touch -d "@$mais_novo" "$alvo"
  rm -rf -- "${origem:?}"
  registrar "cifrada: $nome → $(basename "$alvo") ($arquivos arquivos, $(du -h "$alvo" | cut -f1)); $conferida"
}

n=0
falhas=0
while IFS= read -r -d '' caminho; do
  nome="$(basename "$caminho")"
  case "$nome" in .* | *.age | *.parcial) continue ;; esac
  # Cada cópia num subshell FORA de condição (senão o bash ignora o set -e lá dentro): a falha de uma não para as outras.
  set +e
  (
    set -e
    cifrar_uma "$nome"
  )
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    rm -f "$DIR/.$nome.parcial"
    registrar "FALHOU: $nome (saída $rc; a cópia aberta ficou como estava)"
    falhas=$((falhas + 1))
  fi
  n=$((n + 1))
done < <(find "$DIR" -mindepth 1 -maxdepth 1 -print0 | sort -z)
sufixo=""
[ "$SIMULAR" = 1 ] && sufixo=" (simulação)"
registrar "fim: $n entrada(s) aberta(s) olhada(s), $falhas falha(s) em $DIR$sufixo"
[ "$falhas" -eq 0 ]
