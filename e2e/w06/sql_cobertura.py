#!/usr/bin/env python3
"""Physiq W6 — a cobertura da mensalidade NO BANCO (mensalidade_recalcular / financeiro_proxima_ancora, migração
20260929150000_w06_financeiro_aluno.sql) contra os MESMOS casos do Calc (src/lib/cobertura.test.ts). Roda no schema staging
dentro de um bloco que termina com erro de propósito (nada fica gravado): insere as cobranças numa matrícula de TESTE,
recalcula e devolve o resultado na mensagem do erro.

Uso: python3 e2e/w06/sql_cobertura.py [--schema staging] [--paciente <id da matrícula de teste>]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import Placar, sql_principal  # noqa: E402

p = Placar()

CASOS = [
    ("nunca pagou → null", [], None, None),
    ("pagou 15/07 → coberto até 15/08", ["2026-07-15"], None, "2026-08-15"),
    ("atraso move o vencimento (15/07 e 20/08 → 20/09)", ["2026-07-15", "2026-08-20"], None, "2026-09-20"),
    ("adiantado preserva o dia (15/07 e 10/08 → 15/09)", ["2026-07-15", "2026-08-10"], None, "2026-09-15"),
    ("reembolso fora da lista (só 15/06 → 15/07)", ["2026-06-15"], None, "2026-07-15"),
    ("mês curto (31/01 → 28/02)", ["2026-01-31"], None, "2026-02-28"),
    ("assinatura dia 15: 15/07 e 15/08 → 15/09", ["2026-07-15", "2026-08-15"], 15, "2026-09-15"),
    ("assinatura dia 15: reposição 20/07 → 15/08", ["2026-07-20"], 15, "2026-08-15"),
    ("assinatura dia 15: 15/06, 15/07, 15/08 → 15/09", ["2026-06-15", "2026-07-15", "2026-08-15"], 15, "2026-09-15"),
]


def rodar(schema: str, paciente: str, datas: list[str], ancora: int | None) -> str | None:
    inserts = "\n".join(
        f"insert into {schema}.cobrancas (nutricionista_id, paciente_id, descricao, valor, vencimento, status, pago_em, tipo, forma, origem) "
        f"values (v_nutri, '{paciente}', 'teste cobertura', 10, '{d}', 'paga', '{d}T12:00:00Z', 'mensalidade', 'manual', 'teste_w06');"
        for d in datas)
    assinatura = (f"insert into {schema}.aluno_assinaturas (paciente_id, status, valor, proximo_vencimento, mp_preapproval_id) "
                  f"values ('{paciente}', 'authorized', 10, '2026-12-{ancora:02d}T12:00:00Z', 'teste-w06-' || gen_random_uuid());") if ancora else ""
    q = f"""do $t$
declare v_nutri uuid; v_res timestamptz;
begin
  select coalesce(c.dono_id, p.personal_id, p.nutricionista_id) into v_nutri from {schema}.pacientes p left join {schema}.contas c on c.id = p.conta_id where p.id = '{paciente}';
  delete from {schema}.aluno_assinaturas where paciente_id = '{paciente}';
  update {schema}.cobrancas set deleted_at = now() where paciente_id = '{paciente}' and tipo = 'mensalidade' and deleted_at is null;
  {assinatura}
  {inserts}
  select mensalidade_pago_ate into v_res from {schema}.pacientes where id = '{paciente}';
  raise exception 'RESULTADO[%]', coalesce(to_char(v_res at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS'), 'null');
end $t$;"""
    try:
        sql_principal(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO\[([^\]]*)\]", str(e))
        if m:
            return None if m.group(1) == "null" else m.group(1)
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging", choices=["staging"])
    ap.add_argument("--paciente", help="matrícula de TESTE (padrão: a de teste@teste.com no staging)")
    a = ap.parse_args()
    pac = a.paciente
    if not pac:
        r = sql_principal(f"""select p.id::text as id from {a.schema}.pacientes p join auth.users u on u.id = p.user_id
                               where lower(u.email) = 'teste@teste.com' and p.deleted_at is null order by p.created_at limit 1""")
        pac = r[0]["id"]
    for nome, datas, ancora, esperado in CASOS:
        r = rodar(a.schema, pac, datas, ancora)
        esperado_iso = f"{esperado}T12:00:00" if esperado else None
        p.check(r == esperado_iso, f"{nome}: {r}")
    # âncora pura (nextAnchorAfter)
    anc = sql_principal(f"""select to_char({a.schema}.financeiro_proxima_ancora('2026-07-10T12:00:00Z', 15) at time zone 'UTC', 'YYYY-MM-DD') as a,
                                   to_char({a.schema}.financeiro_proxima_ancora('2026-07-15T12:00:00Z', 15) at time zone 'UTC', 'YYYY-MM-DD') as b,
                                   to_char({a.schema}.financeiro_proxima_ancora('2026-02-10T12:00:00Z', 31) at time zone 'UTC', 'YYYY-MM-DD') as c""")[0]
    p.check(anc == {"a": "2026-07-15", "b": "2026-08-15", "c": "2026-02-28"}, f"próxima âncora igual ao Calc: {anc}")
    # nada ficou gravado
    sobra = sql_principal(f"select count(*)::int as n from {a.schema}.cobrancas where origem = 'teste_w06'")[0]["n"]
    p.check(sobra == 0, f"nenhuma cobrança de teste ficou gravada ({sobra})")
    return p.fim() if hasattr(p, "fim") else 0


if __name__ == "__main__":
    sys.exit(main())
