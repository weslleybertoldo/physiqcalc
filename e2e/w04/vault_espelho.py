#!/usr/bin/env python3
"""Physiq W4 — guarda o ESPELHO_SEGREDO no Vault do banco principal (nome 'physiq_espelho_segredo'), para as tarefas do
pg_cron chamarem a espelho-enviar pelo pg_net ({schema}.espelho_disparar). Idempotente: cria ou atualiza. O valor sai de
~/.physiq-espelho-segredo (o mesmo das funções — cofre B Code Segredos) e nunca é impresso nem vai para o repositório.

Uso: python3 e2e/w04/vault_espelho.py [--conferir]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import espelho_segredo, sql_principal  # noqa: E402

NOME = "physiq_espelho_segredo"


def main() -> int:
    segredo = espelho_segredo()
    if len(segredo) < 32:
        raise SystemExit("segredo curto demais")
    esc = segredo.replace("'", "''")
    if "--conferir" not in sys.argv:
        existe = sql_principal(f"select id::text from vault.secrets where name = '{NOME}'")
        if existe:
            sql_principal(f"select vault.update_secret('{existe[0]['id']}', '{esc}')")
            print("vault: atualizado")
        else:
            sql_principal(f"select vault.create_secret('{esc}', '{NOME}', 'Physiq W4: ESPELHO_SEGREDO para o pg_net chamar a espelho-enviar')")
            print("vault: criado")
    ok = sql_principal(f"select (decrypted_secret = '{esc}') as igual, length(decrypted_secret) as tam from vault.decrypted_secrets where name = '{NOME}'")
    print("vault confere:", ok[0]["igual"] if ok else None, "tamanho:", ok[0]["tam"] if ok else None)
    return 0 if ok and ok[0]["igual"] else 1


if __name__ == "__main__":
    sys.exit(main())
