#!/usr/bin/env python3
"""Physiq W7b — carga dos TREINOS PRONTOS do aluno sem profissional no BANCO DO TREINO (uxwpwdbbnlticxgtzcsb).

Lê scripts/conteudo/treinos_prontos.json (a 1ª versão é nossa; o Weslley revisa em produção e o ajuste é neste arquivo) e grava
em <schema>.physiq_treinos_prontos / _grupos / _exercicios (migração supabase/migrations/20260929190100_w07b_treinos_prontos.sql).
Os exercícios vão pelo NOME exato da biblioteca (tb_exercicios do master, professor_id vazio); nome que não existe = para.
Idempotente: cada treino é gravado pelo código (upsert) e as divisões/exercícios dele são refeitos; treino que saiu do arquivo
fica inativo (não aparece mais). O que o aluno já escolheu é CÓPIA dele (treinos próprios) e não muda com a carga.

Uso:
  python3 scripts/conteudo/carregar_treinos_prontos.py --schema staging --dry-run
  python3 scripts/conteudo/carregar_treinos_prontos.py --schema staging
  python3 scripts/conteudo/carregar_treinos_prontos.py --schema public [--relatorio <arquivo.json>]
SQL pela Management API (~/.pc-pat; o pooler de sessão do Treino falhou por minutos na W7 com o banco saudável).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
from _base import SCHEMAS, TREINO_REF, http, lit, pat, salvar_json  # noqa: E402

ARQUIVO = Path(__file__).resolve().parent / "treinos_prontos.json"
OBJETIVOS = ("emagrecer", "manter", "ganhar_massa")
NIVEIS = ("iniciante", "intermediario", "avancado")
DIAS = ("DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB")


def sql(query: str) -> list:
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{TREINO_REF}/database/query", {"query": query},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    if st not in (200, 201):
        raise RuntimeError(f"SQL Treino HTTP {st}: {str(r)[:800]}")
    return r or []


def validar(dados: dict, biblioteca: dict[str, str]) -> list[str]:
    erros: list[str] = []
    codigos = set()
    for t in dados["treinos"]:
        c = t["codigo"]
        if c in codigos:
            erros.append(f"{c}: código repetido")
        codigos.add(c)
        if t["objetivo"] not in OBJETIVOS:
            erros.append(f"{c}: objetivo {t['objetivo']}")
        if t["nivel"] not in NIVEIS:
            erros.append(f"{c}: nível {t['nivel']}")
        dias = [d for g in t["grupos"] for d in g["dias"]]
        if len(dias) != t["dias_por_semana"] or len(set(dias)) != len(dias) or any(d not in DIAS for d in dias):
            erros.append(f"{c}: dias {dias} × dias_por_semana {t['dias_por_semana']}")
        letras = [g["letra"] for g in t["grupos"]]
        if len(set(letras)) != len(letras):
            erros.append(f"{c}: letras repetidas {letras}")
        for g in t["grupos"]:
            if not g["exercicios"]:
                erros.append(f"{c}/{g['letra']}: sem exercícios")
            for e in g["exercicios"]:
                if e["exercicio"] not in biblioteca:
                    erros.append(f"{c}/{g['letra']}: exercício fora da biblioteca: {e['exercicio']}")
                if not (1 <= int(e["series"]) <= 10):
                    erros.append(f"{c}/{g['letra']}: séries {e['series']} ({e['exercicio']})")
                if e.get("descanso") is not None and not (0 <= int(e["descanso"]) <= 600):
                    erros.append(f"{c}/{g['letra']}: descanso {e['descanso']} ({e['exercicio']})")
    return erros


def comandos(s: str, dados: dict, biblioteca: dict[str, str]) -> str:
    partes: list[str] = []
    for t in dados["treinos"]:
        linhas = [
            f"insert into {s}.physiq_treinos_prontos (codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, ativo)",
            f"  values ({lit(t['codigo'])}, {lit(t['nome'])}, {lit(t['objetivo'])}, {lit(t['nivel'])}, {int(t['dias_por_semana'])},",
            f"          {lit(t['divisao'])}, {lit(t.get('descricao'))}, {int(t.get('ordem', 0))}, true)",
            "  on conflict (codigo) do update set nome = excluded.nome, objetivo = excluded.objetivo, nivel = excluded.nivel,",
            "    dias_por_semana = excluded.dias_por_semana, divisao = excluded.divisao, descricao = excluded.descricao,",
            "    ordem = excluded.ordem, ativo = true, atualizado_em = now()",
            "  returning id into v_t;",
            f"delete from {s}.physiq_treinos_prontos_grupos where treino_id = v_t;",
        ]
        for og, g in enumerate(t["grupos"], start=1):
            dias = "array[" + ",".join(lit(d) for d in g["dias"]) + "]::text[]"
            linhas.append(f"insert into {s}.physiq_treinos_prontos_grupos (treino_id, letra, nome, dias, ordem) "
                          f"values (v_t, {lit(g['letra'])}, {lit(g['nome'])}, {dias}, {og}) returning id into v_g;")
            valores = []
            for oe, e in enumerate(g["exercicios"], start=1):
                desc = "null" if e.get("descanso") is None else str(int(e["descanso"]))
                valores.append(f"(v_g, {lit(biblioteca[e['exercicio']])}::uuid, {oe}, {int(e['series'])}, {lit(str(e['reps']))}, {desc}, {lit(e.get('observacao'))})")
            linhas.append(f"insert into {s}.physiq_treinos_prontos_exercicios (grupo_id, exercicio_id, ordem, series, reps, descanso_segundos, observacao) values\n  "
                          + ",\n  ".join(valores) + ";")
        partes.append("\n".join(linhas))
    codigos = "array[" + ",".join(lit(t["codigo"]) for t in dados["treinos"]) + "]::text[]"
    corpo = "\n".join(partes)
    return (f"do $carga$\ndeclare v_t uuid; v_g uuid;\nbegin\n{corpo}\n"
            f"update {s}.physiq_treinos_prontos set ativo = false, atualizado_em = now() where ativo and not (codigo = any({codigos}));\n"
            "end $carga$;")


def contagens(s: str) -> dict:
    r = sql(f"""select (select count(*) from {s}.physiq_treinos_prontos) treinos,
                       (select count(*) from {s}.physiq_treinos_prontos where ativo) ativos,
                       (select count(*) from {s}.physiq_treinos_prontos_grupos) grupos,
                       (select count(*) from {s}.physiq_treinos_prontos_exercicios) exercicios""")
    return r[0]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true", help="grava dentro de BEGIN … ROLLBACK e mostra as contagens (nada fica)")
    ap.add_argument("--arquivo", default=str(ARQUIVO))
    ap.add_argument("--relatorio", help="grava o relatório (JSON)")
    a = ap.parse_args()
    s = a.schema
    dados = json.loads(Path(a.arquivo).read_text(encoding="utf-8"))
    biblioteca = {x["nome"]: x["id"] for x in sql(f"select id::text as id, nome from {s}.tb_exercicios where professor_id is null")}
    erros = validar(dados, biblioteca)
    if erros:
        print("PAROU — arquivo com problema:\n  " + "\n  ".join(erros))
        return 1
    esperado = {"treinos": len(dados["treinos"]), "grupos": sum(len(t["grupos"]) for t in dados["treinos"]),
                "exercicios": sum(len(g["exercicios"]) for t in dados["treinos"] for g in t["grupos"])}
    antes = contagens(s)
    bloco = comandos(s, dados, biblioteca)
    if a.dry_run:
        r = sql(f"begin;\n{bloco}\nselect (select count(*) from {s}.physiq_treinos_prontos where ativo) ativos, "
                f"(select count(*) from {s}.physiq_treinos_prontos_grupos) grupos, (select count(*) from {s}.physiq_treinos_prontos_exercicios) exercicios;\nrollback;")
        print(f"Treinos prontos ({s}) — DRY-RUN: antes {antes} · o arquivo tem {esperado} · depois da carga (desfeita) {r[0] if r else '?'}")
        return 0
    sql(bloco)
    depois = contagens(s)
    ok = depois["ativos"] == esperado["treinos"]
    print(f"Treinos prontos ({s}): antes {antes} → depois {depois} · arquivo {esperado} · {'ok' if ok else 'CONFERIR'}")
    if a.relatorio:
        salvar_json(a.relatorio, {"schema": s, "antes": antes, "depois": depois, "arquivo": esperado})
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
