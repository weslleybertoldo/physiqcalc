#!/usr/bin/env python3
"""Backup (e contagem) de tabelas do BANCO PRINCIPAL do Physiq pela Management API — lá não há senha do Postgres
nesta máquina, então o backup é o conteúdo de cada tabela em JSON (json_agg), um arquivo por tabela.

Uso:
  python3 scripts/backup/backup_principal.py --pasta ~/backups/physiq/<data>-<wNN>/principal \
      --schemas staging,public --tabelas pacientes,cobrancas,...          # backup + contagem ("antes")
  python3 scripts/backup/backup_principal.py --pasta <mesma> --schemas staging --tabelas ... --so-contar --rotulo depois

Grava <pasta>/<schema>.<tabela>.json e <pasta>/contagens-<rotulo>.json ({"schema.tabela": linhas}). Na restauração,
cada arquivo volta com: insert into <schema>.<tabela> select * from json_populate_recordset(null::<schema>.<tabela>, '<json>').
Credenciais: ~/.pc-pat. Ref: PRINCIPAL_REF ou o padrão. A Management API exige User-Agent.
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

REF_PADRAO = "hkxvtsbwctxkrqzkkdoz"
USER_AGENT = "physiq-unificado/1.0 (backup_principal)"
NOME_OK = re.compile(r"^[a-z_][a-z0-9_]*$")


def query(sql: str) -> list:
    pat = Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()
    ref = os.environ.get("PRINCIPAL_REF") or REF_PADRAO
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"), method="POST",
        headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode("utf-8") or "[]")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:1500]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pasta", required=True)
    ap.add_argument("--schemas", required=True, help="ex.: staging,public")
    ap.add_argument("--tabelas", required=True, help="lista separada por vírgula")
    ap.add_argument("--so-contar", action="store_true", help="só grava a contagem (não copia as linhas)")
    ap.add_argument("--rotulo", default="antes")
    a = ap.parse_args()

    pasta = Path(os.path.expanduser(a.pasta))
    pasta.mkdir(parents=True, exist_ok=True)
    schemas = [s.strip() for s in a.schemas.split(",") if s.strip()]
    tabelas = [t.strip() for t in a.tabelas.split(",") if t.strip()]
    for nome in schemas + tabelas:
        if not NOME_OK.match(nome):
            raise SystemExit(f"nome inválido: {nome}")

    contagens: dict[str, int] = {}
    for s in schemas:
        for t in tabelas:
            chave = f"{s}.{t}"
            if a.so_contar:
                linhas = query(f"select count(*)::int as n from {s}.{t}")[0]["n"]
            else:
                r = query(f"select count(*)::int as n, coalesce(json_agg(x), '[]'::json) as dados from {s}.{t} x")[0]
                linhas = r["n"]
                dados = r["dados"]
                if len(dados) != linhas:
                    raise SystemExit(f"{chave}: json_agg trouxe {len(dados)} linhas e o count {linhas} — backup incompleto")
                destino = pasta / f"{chave}.json"
                destino.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
                os.chmod(destino, 0o600)
            contagens[chave] = linhas
            print(f"{chave:48s} {linhas:6d}")
    saida = pasta / f"contagens-{a.rotulo}.json"
    anterior = json.loads(saida.read_text(encoding="utf-8")) if saida.exists() else {}
    anterior.update(contagens)
    saida.write_text(json.dumps(anterior, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"contagens → {saida}")


if __name__ == "__main__":
    sys.exit(main())
