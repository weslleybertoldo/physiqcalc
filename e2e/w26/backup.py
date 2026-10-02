#!/usr/bin/env python3
"""Physiq W26 — backup ANTES da migração da Lixeira (banco principal): as definições que a migração cria/troca (nenhuma deve existir), os
jobs do pg_cron da lixeira e as contagens das 5 fontes (vivas e na lixeira) + conta_eventos. Uso: backup.py <public|staging> <arquivo.json>
Só leitura (Management API, ~/.pc-pat)."""
import json
import sys
import urllib.request
from pathlib import Path

REF = "hkxvtsbwctxkrqzkkdoz"
FUNCOES = ["lixeira_da_conta", "lixeira_restaurar", "lixeira_apagar", "w26_restaurar_aluno", "w26_lixeira_clinico_ve", "w26_lixeira_clinico_mexe",
           "w26_lixeira_resposta_mexe", "lixeira_purgar"]


def q(sql: str):
    pat = Path.home().joinpath(".pc-pat").read_text().strip()
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/database/query", data=json.dumps({"query": sql}).encode(), method="POST",
                                 headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json", "User-Agent": "physiq-unificado/1.0 (w26 backup)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode() or "null")


def main() -> None:
    s, destino = sys.argv[1], sys.argv[2]
    assert s in ("public", "staging")
    lista = ",".join(f"'{f}'" for f in FUNCOES)
    saida = {
        "schema": s,
        "funcoes": q(f"select p.proname, pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='{s}' and p.proname in ({lista}) order by 1"),
        "cron": q("select jobname, schedule, command, active from cron.job where jobname like 'lixeira%' order by 1"),
        "contagens": q(f"""select
            (select count(*) from {s}.respostas_preconsulta) respostas, (select count(*) from {s}.respostas_preconsulta where deleted_at is not null) respostas_lixeira,
            (select count(*) from {s}.anamneses) anamneses, (select count(*) from {s}.anamneses where deleted_at is not null) anamneses_lixeira,
            (select count(*) from {s}.antropometrias) antropometrias, (select count(*) from {s}.antropometrias where deleted_at is not null) antropometrias_lixeira,
            (select count(*) from {s}.planos_alimentares) planos, (select count(*) from {s}.planos_alimentares where deleted_at is not null) planos_lixeira,
            (select count(*) from {s}.refeicoes) refeicoes, (select count(*) from {s}.itens_refeicao) itens_refeicao,
            (select count(*) from {s}.pacientes) pacientes, (select count(*) from {s}.pacientes where deleted_at is not null) pacientes_lixeira,
            (select count(*) from {s}.conta_eventos) conta_eventos"""),
    }
    Path(destino).write_text(json.dumps(saida, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(s, json.dumps(saida["contagens"], ensure_ascii=False), "· funções que já existiam:", [f["proname"] for f in saida["funcoes"]], "· cron:", [c["jobname"] for c in saida["cron"]])


if __name__ == "__main__":
    main()
