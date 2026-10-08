#!/usr/bin/env bash
# Physiq — apaga as cópias do banco (~/backups/physiq: as manuais e as diárias, cifradas ou não) com 29 dias ou mais.
# Versionado no repo desde a hml-07 (homologação 08/10/2026; antes só em ~/.local/bin/physiq-backups-limpeza); instalar.sh.
# Decisão do Weslley (06/10/2026, "A"): backups manuais apagados em 30 dias — a política de privacidade diz "em até 30 dias".
# Roda 1×/dia pelo timer do systemd do usuário (physiq-backups-limpeza.timer). `-mtime +28` = idade de 29 dias ou mais, então
# com a rodada diária nenhuma cópia passa de 30 dias. Uso: physiq-backups-limpeza [--simular] [--dir <pasta>] (--dir = teste).
set -euo pipefail
dir="$HOME/backups/physiq"
simular=0
while [ $# -gt 0 ]; do
  case "$1" in
    --simular) simular=1 ;;
    --dir) shift; dir="${1:?--dir sem pasta}" ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done
log_dir="$HOME/.local/state/physiq-backups-limpeza"
mkdir -p "$log_dir"
log="${PHYSIQ_BACKUP_LOG:-$log_dir/limpeza.log}"
registrar() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$log"; }
if [ ! -d "$dir" ]; then
  registrar "sem a pasta $dir: nada a fazer"
  exit 0
fi
dir="$(cd "$dir" && pwd -P)"
case "$dir" in
  / | "$HOME" | "$HOME"/) registrar "pasta recusada: $dir"; exit 1 ;;
esac
n=0
while IFS= read -r -d '' alvo; do
  n=$((n + 1))
  if [ "$simular" = 1 ]; then
    registrar "simulação: apagaria ${alvo#"$dir"/}"
  else
    rm -rf -- "${alvo:?}"
    registrar "apagado: ${alvo#"$dir"/}"
  fi
done < <(find "$dir" -mindepth 1 -maxdepth 1 -mtime +28 -print0)
sufixo=""
[ "$simular" = 1 ] && sufixo=" (simulação)"
registrar "fim: $n cópia(s) com 29 dias ou mais em $dir$sufixo"
