#!/usr/bin/env bash
# Instala (ou atualiza) NO NOTEBOOK as rotinas de cópia do banco do Physiq (hml-07, homologação 08/10/2026):
#   physiq-backup-diario.timer   03:23  cópia cifrada dos 2 bancos com ensaio de restauração (copia.sh todos)
#   physiq-backups-cifrar.timer  :47    cifra as cópias manuais paradas há 2 h (cifrar-copias-manuais.sh)
#   physiq-backups-limpeza.timer 04:10  apaga o que tem 29+ dias (limpeza.sh; a Política diz "em até 30 dias")
#   falha em qualquer uma → physiq-backup-aviso@.service (aviso.sh: 🔴 no grupo Validação, tópico Physiq)
# Copia os scripts para ~/.local/lib/physiq-backup/ (as unidades rodam essa cópia, não o checkout) e as unidades para
# ~/.config/systemd/user/. Rodar de um checkout com o merge na main. A senha do papel e o PG_BIN ficam em
# ~/.config/physiq-backup/ (docs/backup.md). Uso: scripts/backup/diario/instalar.sh [--desinstalar]
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$HOME/.local/lib/physiq-backup"
UNI="$HOME/.config/systemd/user"
CONF="$HOME/.config/physiq-backup"
TIMERS=(physiq-backup-diario.timer physiq-backups-cifrar.timer physiq-backups-limpeza.timer)

if [ "${1:-}" = --desinstalar ]; then
  systemctl --user disable --now "${TIMERS[@]}" 2> /dev/null || true
  for u in "$AQUI"/systemd/*; do rm -f "$UNI/$(basename "$u")"; done
  rm -rf "${LIB:?}"
  systemctl --user daemon-reload
  echo "desinstalado (ficam $CONF e as cópias em ~/backups/physiq)"
  exit 0
fi

[ -s "$AQUI/destinatario.age" ] || { echo "sem destinatario.age (chave pública)" >&2; exit 1; }
command -v age > /dev/null 2>&1 || { echo "sem o age no PATH (~/.local/bin)" >&2; exit 1; }
mkdir -p "$LIB" "$UNI" "$CONF"
chmod 700 "$CONF"
install -m 0755 "$AQUI"/copia.sh "$AQUI"/cifrar-copias-manuais.sh "$AQUI"/aviso.sh "$AQUI"/limpeza.sh "$LIB/"
install -m 0644 "$AQUI"/preparar-restauro.sql "$AQUI"/destinatario.age "$LIB/"
git -C "$AQUI" log -1 --format='%h %cs' > "$LIB/VERSAO" 2> /dev/null || echo "sem git" > "$LIB/VERSAO"
install -m 0644 "$AQUI"/systemd/* "$UNI/"

if [ ! -f "$CONF/ambiente" ]; then
  pg_bin=""
  for c in "$HOME/.local/pg/root/usr/lib/postgresql/18/bin" /usr/lib/postgresql/18/bin /usr/lib/postgresql/17/bin; do
    if [ -x "$c/initdb" ] && [ -x "$c/pg_dump" ]; then pg_bin="$c"; break; fi
  done
  [ -n "$pg_bin" ] || { echo "sem Postgres ≥ 17 com initdb: defina PG_BIN em $CONF/ambiente" >&2; exit 1; }
  {
    echo "# lido pelo copia.sh (instalar.sh, $(date '+%Y-%m-%d'))"
    echo "PG_BIN=\"$pg_bin\""
    case "$pg_bin" in
      "$HOME"/.local/pg/root/*) echo "export LD_LIBRARY_PATH=\"$HOME/.local/pg/root/usr/lib/x86_64-linux-gnu\"" ;;
    esac
  } > "$CONF/ambiente"
fi
if [ ! -f "$CONF/pgpass" ]; then
  echo "⚠️  falta $CONF/pgpass (senha do papel physiq_backup dos 2 projetos; docs/backup.md) — a cópia diária vai falhar" >&2
else
  chmod 600 "$CONF/pgpass"
fi

systemctl --user daemon-reload
systemctl --user enable --now "${TIMERS[@]}"
echo "instalado: $(cat "$LIB/VERSAO")"
systemctl --user list-timers --all "${TIMERS[@]}" --no-pager
