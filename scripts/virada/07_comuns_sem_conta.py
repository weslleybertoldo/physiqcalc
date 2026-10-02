#!/usr/bin/env python3
"""Physiq — script 07 da virada (W28; herdados da W20 e da W21): liga à CONTA os calendários e os formulários de pré-consulta que
o site antigo do Nutri criou sem conta (o site antigo grava só o `nutricionista_id`), para o dono de uma conta com equipe passar
a vê-los. Junto vão os agendamentos e os bloqueios desses calendários e as respostas desses formulários.

Destino de cada registro (o profissional dono dele):
  1. a conta 'legado_nutri' de que ele é dono (o site antigo era o consultório da nutri);
  2. senão, a ÚNICA conta com o módulo Nutrição em que ele é nutricionista ativo;
  3. senão (nenhuma ou mais de uma): fica como está e vai para o relatório ("sem destino") — ninguém é ligado no chute.
  Resposta → a conta do formulário dela (W21); agendamento/bloqueio → a conta do PRÓPRIO profissional do registro (senão a do
  calendário).
Só preenche conta_id vazio (nunca troca a conta de um registro). Idempotente; nada é apagado. --dry-run só relata.

Uso:
  python3 scripts/virada/07_comuns_sem_conta.py --schema staging --dry-run
  python3 scripts/virada/07_comuns_sem_conta.py --schema public --dry-run      (depois do backup — CHECKPOINT)
  python3 scripts/virada/07_comuns_sem_conta.py --schema public
Relatório: --relatorio <arquivo.json> (padrão ~/backups/physiq/<data>-w28/relatorio-07-<schema>-<dry|real>.json).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _base import SCHEMAS, hoje_sp, lit, salvar_json, sql_principal  # noqa: E402


def destinos(s: str) -> dict[str, dict]:
    """profissional → {conta, regra} (ou {conta: None, motivo})."""
    donos = sql_principal(f"""select distinct x.nutricionista_id::text as uid from (
          select nutricionista_id from {s}.calendarios where conta_id is null
          union select nutricionista_id from {s}.formularios_preconsulta where conta_id is null
          union select nutricionista_id from {s}.agendamentos where conta_id is null
          union select nutricionista_id from {s}.bloqueios_agenda where conta_id is null
          union select nutricionista_id from {s}.respostas_preconsulta where conta_id is null) x where x.nutricionista_id is not null""")
    if not donos:
        return {}
    lista = ",".join(lit(d["uid"]) for d in donos)
    legado = {r["uid"]: r["conta"] for r in sql_principal(f"""select distinct on (c.dono_id) c.dono_id::text as uid, c.id::text as conta
        from {s}.contas c where c.origem = 'legado_nutri' and c.dono_id in ({lista}) order by c.dono_id, c.criado_em""")}
    nutri: dict[str, list[str]] = {}
    for r in sql_principal(f"""select m.user_id::text as uid, m.conta_id::text as conta from {s}.conta_membros m join {s}.contas c on c.id = m.conta_id
        where m.user_id in ({lista}) and m.status = 'ativo' and 'nutricionista' = any(m.papeis)
          and 'nutricao' = any({s}.modulos_do_plano(c.plano))"""):
        nutri.setdefault(r["uid"], []).append(r["conta"])
    saida = {}
    for d in donos:
        u = d["uid"]
        if u in legado:
            saida[u] = {"conta": legado[u], "regra": "legado_nutri_do_dono"}
        elif len(set(nutri.get(u, []))) == 1:
            saida[u] = {"conta": nutri[u][0], "regra": "unica_conta_como_nutricionista"}
        else:
            saida[u] = {"conta": None, "motivo": "nenhuma conta" if not nutri.get(u) else "mais de uma conta"}
    return saida


def contar(s: str) -> dict:
    tabs = ["calendarios", "formularios_preconsulta", "respostas_preconsulta", "agendamentos", "bloqueios_agenda"]
    uniao = " union all ".join(f"select '{t}' as t, count(*)::int as total, count(*) filter (where conta_id is null)::int as sem_conta from {s}.{t}" for t in tabs)
    return {r["t"]: {"total": r["total"], "sem_conta": r["sem_conta"]} for r in sql_principal(uniao)}


def planejar(s: str) -> dict:
    dest = destinos(s)
    emails = {}
    if dest:
        emails = {r["id"]: r["email"] for r in sql_principal(
            f"select id::text as id, lower(email) as email from auth.users where id in ({','.join(lit(u) for u in dest)})")}
    plano = {"schema": s, "destinos": {emails.get(u, u): v for u, v in dest.items()}, "itens": {}}
    for t in ("calendarios", "formularios_preconsulta"):
        linhas = sql_principal(f"select id::text as id, nutricionista_id::text as uid from {s}.{t} where conta_id is null")
        plano["itens"][t] = [{"id": r["id"], "dono": emails.get(r["uid"], r["uid"]), "conta": (dest.get(r["uid"]) or {}).get("conta")} for r in linhas]
    return plano


def executar(s: str, plano: dict) -> dict:
    """1 transação: calendários e formulários pelo dono; depois agendamentos/bloqueios pelo calendário e respostas pelo formulário."""
    valores = {}
    for u, v in destinos(s).items():
        if v.get("conta"):
            valores[u] = v["conta"]
    if not valores:
        return {"ligados": {}}
    mapa = " union all ".join(f"select {lit(u)}::uuid as uid, {lit(c)}::uuid as conta" for u, c in valores.items())
    r = sql_principal(f"""with destino as ({mapa}),
      cal as (update {s}.calendarios x set conta_id = d.conta from destino d where x.conta_id is null and x.nutricionista_id = d.uid returning 1),
      frm as (update {s}.formularios_preconsulta x set conta_id = d.conta from destino d where x.conta_id is null and x.nutricionista_id = d.uid returning 1)
      select (select count(*) from cal)::int as calendarios, (select count(*) from frm)::int as formularios""")[0]
    # agendamento/bloqueio: a conta do PRÓPRIO profissional do registro; sem ela, a do calendário
    r2 = sql_principal(f"""with destino as ({mapa}),
      ag1 as (update {s}.agendamentos x set conta_id = d.conta from destino d where x.conta_id is null and x.nutricionista_id = d.uid returning 1),
      bl1 as (update {s}.bloqueios_agenda x set conta_id = d.conta from destino d where x.conta_id is null and x.nutricionista_id = d.uid returning 1),
      rs1 as (update {s}.respostas_preconsulta r set conta_id = f.conta_id from {s}.formularios_preconsulta f
               where r.conta_id is null and r.formulario_id = f.id and f.conta_id is not null returning 1)
      select (select count(*) from ag1)::int as agendamentos_pelo_profissional, (select count(*) from bl1)::int as bloqueios_pelo_profissional,
             (select count(*) from rs1)::int as respostas_pelo_formulario""")[0]
    # resposta: a conta do formulário (a regra da W21); sem formulário com conta, a do profissional
    r3 = sql_principal(f"""with destino as ({mapa}),
      ag2 as (update {s}.agendamentos a set conta_id = c.conta_id from {s}.calendarios c
               where a.conta_id is null and a.calendario_id = c.id and c.conta_id is not null returning 1),
      bl2 as (update {s}.bloqueios_agenda b set conta_id = c.conta_id from {s}.calendarios c
               where b.conta_id is null and b.calendario_id = c.id and c.conta_id is not null returning 1),
      rs2 as (update {s}.respostas_preconsulta x set conta_id = d.conta from destino d where x.conta_id is null and x.nutricionista_id = d.uid returning 1)
      select (select count(*) from ag2)::int as agendamentos_pelo_calendario, (select count(*) from bl2)::int as bloqueios_pelo_calendario,
             (select count(*) from rs2)::int as respostas_pelo_profissional""")[0]
    return {"ligados": {**r, **r2, **r3}}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--relatorio")
    a = ap.parse_args()
    antes = contar(a.schema)
    plano = planejar(a.schema)
    saida = {"schema": a.schema, "dry_run": a.dry_run, "contagens_antes": antes, "plano": plano}
    if not a.dry_run:
        saida["feito"] = executar(a.schema, plano)
        saida["contagens_depois"] = contar(a.schema)
        for t, v in antes.items():
            if saida["contagens_depois"][t]["total"] != v["total"]:
                saida.setdefault("erros", []).append(f"{t}: total mudou {v['total']} → {saida['contagens_depois'][t]['total']}")
    destino = a.relatorio or str(Path.home() / "backups" / "physiq" / f"{hoje_sp()}-w28" / f"relatorio-07-{a.schema}-{'dry' if a.dry_run else 'real'}.json")
    salvar_json(destino, saida)
    print(json.dumps({k: saida[k] for k in saida if k != "plano"}, ensure_ascii=False, indent=2))
    print("\ndestino por profissional:")
    for email, v in plano["destinos"].items():
        print(f"  {email:45s} → {v.get('conta') or 'SEM DESTINO (' + v.get('motivo', '') + ')'} {v.get('regra', '')}")
    for t, itens in plano["itens"].items():
        print(f"  {t}: {len(itens)} sem conta · {sum(1 for i in itens if i['conta'])} com destino")
    print(f"\nrelatório: {destino}")
    return 1 if saida.get("erros") else 0


if __name__ == "__main__":
    sys.exit(main())
