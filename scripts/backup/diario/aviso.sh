#!/usr/bin/env bash
# Aviso de falha das rotinas de cópia do Physiq (hml-07, homologação 08/10/2026). O systemd chama pelo OnFailure= das
# unidades (physiq-backup-aviso@<unidade>.service). Manda 🔴 no grupo Validação, tópico Physiq, pela ponte do Telegram
# do notebook (~/remoto-telegram-mcp); sem a ponte, fica só no log. O texto não leva dado pessoal: a rotina, a hora e
# onde olhar.
set -uo pipefail
unidade="${1:-desconhecida}"
LOG="${PHYSIQ_BACKUP_LOG:-$HOME/.local/state/physiq-backup/aviso.log}"
PONTE="${PHYSIQ_BACKUP_PONTE:-$HOME/remoto-telegram-mcp}"
mkdir -p "$(dirname "$LOG")"
case "$unidade" in
  *teste*) rotina="TESTE do aviso (pode ignorar: hml-07 conferindo o caminho do aviso)" ;;
  physiq-backup-diario*) rotina="a cópia diária cifrada dos bancos" ;;
  physiq-backups-cifrar*) rotina="a cifra das cópias manuais" ;;
  physiq-backups-limpeza*) rotina="a limpeza das cópias com 29+ dias" ;;
  *) rotina="a rotina $unidade" ;;
esac
texto="🔴 Physiq: $rotina falhou no notebook ($(date '+%d/%m %H:%M')).
▶️ Ver: journalctl --user -u $unidade -n 80"
resultado="sem a ponte do Telegram ($PONTE)"
if [ -x "$PONTE/.venv/bin/python" ]; then
  resultado="$("$PONTE/.venv/bin/python" - "$PONTE" "$texto" 2>&1 <<'PY'
import sys
sys.path.insert(0, sys.argv[1])
import remoto_lib as rl
print(rl.mandar_validacao("Physiq", sys.argv[2]))
PY
)"
fi
printf '%s %s: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$unidade" "$resultado" >> "$LOG"
echo "$resultado"
