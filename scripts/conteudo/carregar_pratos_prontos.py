#!/usr/bin/env python3
"""Physiq W7b — carga dos PRATOS PRONTOS pelo objetivo (plano Treino + Alimentação do aluno sem profissional) no BANCO PRINCIPAL.

Lê scripts/conteudo/pratos_prontos.json (1ª versão nossa; o Weslley revisa em produção e o ajuste é neste arquivo) e grava em
<schema>.pratos_prontos / pratos_prontos_itens (migração supabase-principal/migrations/20260929190000_w07b_sem_profissional.sql).
Cada item é um alimento da tabela TACO do schema (alimentos.codigo = "taco:N", fonte taco — os ids mudam de schema para schema,
o código não). kcal e macros NÃO são gravados: o banco calcula na hora (pratos_prontos_do_app). Código TACO que não existe = para.
Idempotente: cada prato é gravado pelo código (upsert) e os itens dele são refeitos; prato que saiu do arquivo fica inativo.

Uso:
  python3 scripts/conteudo/carregar_pratos_prontos.py --schema staging --dry-run
  python3 scripts/conteudo/carregar_pratos_prontos.py --schema staging
  python3 scripts/conteudo/carregar_pratos_prontos.py --schema public [--relatorio <arquivo.json>]
SQL pela Management API (~/.pc-pat — o principal não tem senha do Postgres nesta máquina).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
from _base import SCHEMAS, lit, salvar_json, sql_principal  # noqa: E402

ARQUIVO = Path(__file__).resolve().parent / "pratos_prontos.json"
OBJETIVOS = ("emagrecer", "manter", "ganhar_massa")
REFEICOES = ("cafe_da_manha", "almoco", "lanche", "jantar", "ceia")


def validar(dados: dict, taco: dict[str, str]) -> list[str]:
    erros: list[str] = []
    vistos = set()
    for p in dados["pratos"]:
        c = p["codigo"]
        if c in vistos:
            erros.append(f"{c}: código repetido")
        vistos.add(c)
        if p["refeicao"] not in REFEICOES:
            erros.append(f"{c}: refeição {p['refeicao']}")
        if not p["objetivos"] or any(o not in OBJETIVOS for o in p["objetivos"]):
            erros.append(f"{c}: objetivos {p['objetivos']}")
        if not p["itens"]:
            erros.append(f"{c}: sem itens")
        for i in p["itens"]:
            if i["taco"] not in taco:
                erros.append(f"{c}: alimento fora da TACO deste schema: {i['taco']}")
            if not (0 < float(i["gramas"]) <= 2000):
                erros.append(f"{c}: quantidade {i['gramas']} g ({i['taco']})")
    return erros


def comandos(s: str, dados: dict, taco: dict[str, str]) -> str:
    partes: list[str] = []
    for p in dados["pratos"]:
        objetivos = "array[" + ",".join(lit(o) for o in p["objetivos"]) + "]::text[]"
        linhas = [
            f"insert into {s}.pratos_prontos (codigo, nome, refeicao, objetivos, descricao, modo_preparo, foto_url, ordem, ativo)",
            f"  values ({lit(p['codigo'])}, {lit(p['nome'])}, {lit(p['refeicao'])}, {objetivos}, {lit(p.get('descricao'))},",
            f"          {lit(p.get('modo_preparo'))}, {lit(p.get('foto_url'))}, {int(p.get('ordem', 0))}, true)",
            "  on conflict (codigo) do update set nome = excluded.nome, refeicao = excluded.refeicao, objetivos = excluded.objetivos,",
            "    descricao = excluded.descricao, modo_preparo = excluded.modo_preparo, foto_url = excluded.foto_url, ordem = excluded.ordem,",
            "    ativo = true",
            "  returning id into v_p;",
            f"delete from {s}.pratos_prontos_itens where prato_id = v_p;",
        ]
        valores = [f"(v_p, {lit(taco[i['taco']])}::uuid, {lit(i.get('nome'))}, {float(i['gramas'])}, {lit(i.get('medida'))}, {o})"
                   for o, i in enumerate(p["itens"], start=1)]
        linhas.append(f"insert into {s}.pratos_prontos_itens (prato_id, alimento_id, nome, quantidade_g, medida, ordem) values\n  "
                      + ",\n  ".join(valores) + ";")
        partes.append("\n".join(linhas))
    codigos = "array[" + ",".join(lit(p["codigo"]) for p in dados["pratos"]) + "]::text[]"
    return ("do $carga$\ndeclare v_p uuid;\nbegin\n" + "\n".join(partes)
            + f"\nupdate {s}.pratos_prontos set ativo = false where ativo and not (codigo = any({codigos}));\nend $carga$;")


def contagens(s: str) -> dict:
    r = sql_principal(f"""select (select count(*) from {s}.pratos_prontos) pratos, (select count(*) from {s}.pratos_prontos where ativo) ativos,
                                 (select count(*) from {s}.pratos_prontos_itens) itens""")
    return r[0]


def totais(s: str) -> list[dict]:
    return sql_principal(f"""select pp.codigo, round(sum(coalesce(a.energia_kcal, 0) * i.quantidade_g / 100)) as kcal,
                                    round(sum(coalesce(a.proteina_g, 0) * i.quantidade_g / 100), 1) as proteina_g
                               from {s}.pratos_prontos pp join {s}.pratos_prontos_itens i on i.prato_id = pp.id
                               join {s}.alimentos a on a.id = i.alimento_id
                              where pp.ativo group by pp.codigo order by pp.codigo""")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true", help="grava dentro de BEGIN … ROLLBACK e mostra as contagens (nada fica)")
    ap.add_argument("--arquivo", default=str(ARQUIVO))
    ap.add_argument("--relatorio", help="grava o relatório (JSON)")
    a = ap.parse_args()
    s = a.schema
    dados = json.loads(Path(a.arquivo).read_text(encoding="utf-8"))
    taco = {x["codigo"]: x["id"] for x in sql_principal(
        f"select codigo, id::text as id from {s}.alimentos where fonte = 'taco' and deleted_at is null and codigo is not null")}
    erros = validar(dados, taco)
    if erros:
        print("PAROU — arquivo com problema:\n  " + "\n  ".join(erros))
        return 1
    esperado = {"pratos": len(dados["pratos"]), "itens": sum(len(p["itens"]) for p in dados["pratos"])}
    antes = contagens(s)
    bloco = comandos(s, dados, taco)
    if a.dry_run:
        r = sql_principal(f"begin;\n{bloco}\nselect (select count(*) from {s}.pratos_prontos where ativo) ativos, "
                          f"(select count(*) from {s}.pratos_prontos_itens) itens;\nrollback;")
        print(f"Pratos prontos ({s}) — DRY-RUN: antes {antes} · o arquivo tem {esperado} · depois da carga (desfeita) {r[0] if r else '?'}")
        return 0
    sql_principal(bloco)
    depois = contagens(s)
    ok = depois["ativos"] == esperado["pratos"]
    t = totais(s)
    print(f"Pratos prontos ({s}): antes {antes} → depois {depois} · arquivo {esperado} · {'ok' if ok else 'CONFERIR'}")
    for x in t:
        print(f"  {x['codigo']:48s} {x['kcal']} kcal · P {x['proteina_g']} g")
    if a.relatorio:
        salvar_json(a.relatorio, {"schema": s, "antes": antes, "depois": depois, "arquivo": esperado, "totais": t})
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
