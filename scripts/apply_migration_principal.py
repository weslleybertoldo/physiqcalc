#!/usr/bin/env python3
"""Aplica uma migração do BANCO PRINCIPAL do Physiq (Supabase hkxvtsbwctxkrqzkkdoz) pela Management API.

Uso:
  python3 scripts/apply_migration_principal.py <arquivo.sql> [--so staging|public] [--compartilhado] [--dry-run]

Formato do arquivo (o mesmo do physiqnutri):
  - bloco principal: roda 1x por schema, trocando o marcador {schema};
  - bloco depois da linha "-- @@ compartilhado" (sozinha na linha): roda 1x (objetos únicos: gatilho em auth.users, Storage).

Sem opções roda staging → public → compartilhado (nessa ordem; cada bloco é uma transação: se um comando falha, o bloco
inteiro volta). --so roda só o bloco de UM schema; --compartilhado roda só o bloco compartilhado; --dry-run executa dentro
de BEGIN … ROLLBACK (valida a SQL e não grava nada). Qualquer outra opção (ou com '=', ex. --so=staging) para antes de
tocar no banco: nada é aplicado.

Credenciais: PAT pessoal em ~/.pc-pat (o mesmo dos 2 projetos). Ref: variável PRINCIPAL_REF ou o padrão abaixo.
A Management API exige User-Agent (sem ele a Cloudflare devolve 1010).
Backup ANTES de aplicar em produção: scripts/backup/backup_principal.py.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

REF_PADRAO = "hkxvtsbwctxkrqzkkdoz"
SCHEMAS = ["staging", "public"]
MARCADOR = "-- @@ compartilhado"
USER_AGENT = "physiq-unificado/1.0 (apply_migration_principal)"


def credenciais() -> tuple[str, str]:
    pat = Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()
    ref = os.environ.get("PRINCIPAL_REF") or REF_PADRAO
    return pat, ref


def query(pat: str, ref: str, sql: str) -> list | dict:
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            corpo = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:2000]}")
    return json.loads(corpo) if corpo.strip() else []


def separar(texto: str) -> tuple[str, str]:
    """(bloco por schema, bloco compartilhado). O marcador tem que estar sozinho na linha."""
    linhas = texto.split("\n")
    for i, linha in enumerate(linhas):
        if linha.strip() == MARCADOR:
            return "\n".join(linhas[:i]), "\n".join(linhas[i + 1:])
    return texto, ""


def embrulhar(sql: str, dry_run: bool) -> str:
    return f"begin;\n{sql}\n;\nrollback;" if dry_run else sql


def ler_opcoes(args: list[str]) -> tuple[Path, str | None, bool, bool]:
    """(arquivo, --so, --compartilhado, --dry-run). Recusa qualquer outra coisa ANTES de tocar no banco: uma opção digitada
    errado (--so=staging, --dryrun) era ignorada calada e o script rodava staging → public sem dry-run (bcode-0021, conf-0051)."""
    if not args or args[0].startswith("-"):
        raise SystemExit(__doc__)
    so, so_compartilhado, dry_run = None, False, False
    resto = args[1:]
    i = 0
    while i < len(resto):
        a = resto[i]
        if a == "--so" and so is None and i + 1 < len(resto) and resto[i + 1] in SCHEMAS:
            so = resto[i + 1]
            i += 2
            continue
        if a == "--compartilhado" and not so_compartilhado:
            so_compartilhado = True
        elif a == "--dry-run" and not dry_run:
            dry_run = True
        else:
            raise SystemExit(f"opção não aceita: {a!r} (aceito só: --so staging|public, --compartilhado, --dry-run, cada uma 1 vez e "
                             f"sem '='); nada foi aplicado")
        i += 1
    if so and so_compartilhado:
        raise SystemExit("--so e --compartilhado juntos: escolha um (o --so seria ignorado calado); nada foi aplicado")
    return Path(args[0]), so, so_compartilhado, dry_run


def main() -> None:
    arquivo, so, so_compartilhado, dry_run = ler_opcoes(sys.argv[1:])
    principal, compartilhado = separar(arquivo.read_text(encoding="utf-8"))
    pat, ref = credenciais()
    rotulo = " (dry-run: BEGIN … ROLLBACK)" if dry_run else ""

    if not so_compartilhado:
        for schema in SCHEMAS:
            if so and schema != so:
                continue
            query(pat, ref, embrulhar(principal.replace("{schema}", schema), dry_run))
            print(f"ok  {arquivo.name} → {schema}{rotulo}")
    if compartilhado.strip() and (so_compartilhado or not so):
        query(pat, ref, embrulhar(compartilhado, dry_run))
        print(f"ok  {arquivo.name} → compartilhado{rotulo}")


if __name__ == "__main__":
    main()
