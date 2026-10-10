#!/usr/bin/env python3
"""Physiq W4 → hml-16c (H-51, S8): o Vault da fila do espelho agora é do scripts/segredos/servidor.py — este não grava mais.

A {public,staging}.espelho_disparar() (migração 20261010010000_hml16c_segredo_fila.sql) manda à espelho-enviar o segredo
PRÓPRIO da fila, do Vault 'physiq_espelho_fila_segredo'; sem ele, o 'physiq_espelho_segredo' de antes (reserva até o F7).
  python3 scripts/segredos/servidor.py espelho_fila gerar|aceitar|trocar|tirar|tirar-lista|conferir [--dry-run]
  python3 e2e/w04/vault_espelho.py --conferir     (= servidor.py espelho_fila conferir: o Vault novo igual ao cofre + a lista)
Volta do F6 da hml-16c (regravar o Vault antigo a partir do ~/.physiq-espelho-segredo): a versão de antes deste arquivo,
git show 72304d7:e2e/w04/vault_espelho.py (salva dentro de e2e/w04/, ela importa o espelho_segredo do _comum).
"""
import subprocess
import sys
from pathlib import Path

SERVIDOR = Path(__file__).resolve().parents[2] / "scripts" / "segredos" / "servidor.py"


def main() -> int:
    if sys.argv[1:] == ["--conferir"]:
        return subprocess.run([sys.executable, str(SERVIDOR), "espelho_fila", "conferir"], check=False).returncode
    print(__doc__.strip(), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
