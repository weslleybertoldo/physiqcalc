#!/usr/bin/env python3
"""Physiq W21 — massa da Pré-consulta no STAGING (só contas de teste), criada pelo caminho do app (REST com o login de cada um; as
respostas pela RPC pública, anônimas):

  Camila (nutri, W13):   "W21 E2E Massa pré-anamnese" (origem anamnese) + 1 resposta (Joana Massa)  → o dono NÃO lê (regra da W18)
  Lucas (dono, W13):     "W21 E2E Massa avaliação"   (em branco)       + 1 resposta (Pedro Massa)
  Bruno (personal2, W13): "W21 E2E Massa treino Bruno" (em branco)     + 1 resposta (Lia Massa)   → o Lucas lê; a Camila não

`--limpar` apaga TUDO o que tem a marca "W21 E2E" no título nas 4 tabelas (formulários, respostas, anamneses e aplicações de
questionário importadas) — só de contas de teste — e os alunos cadastrados pelos testes ("W21 E2E…"). Rodar de novo = limpa e recria.
Uso: python3 e2e/w21/massa.py [--limpar] [--schema staging|public]
"""
from __future__ import annotations

import argparse
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

q = B.q
TESTE = ["w13-nutri", "w13-dono", "w13-personal2", "prof2", "nutri-legado", "w18-nutri2"]
PERGUNTAS = [
    {"id": "p1", "texto": "Qual é o seu objetivo agora?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []},
    {"id": "p2", "texto": "Já treinou com acompanhamento?", "tipo": "sim_nao", "max": 4, "pontos_sim": 1, "opcoes": []},
    {"id": "p3", "texto": "Quantas vezes por semana você consegue treinar?", "tipo": "escala", "max": 7, "pontos_sim": 1, "opcoes": []},
]


def slug() -> str:
    return "".join(secrets.choice("abcdefghijkmnpqrstuvwxyz23456789") for _ in range(8))


def limpar() -> dict:
    S = B.schema()
    uids = [u for u in (B.uid(c) for c in TESTE) if u]
    em = ", ".join(q(u) for u in uids)
    marca = f"{B.MARCA}%"
    contas_teste = f"select id from {S}.contas where dono_id in ({em})"
    feito = {}
    feito["anamneses"] = B.sql_principal(f"with x as (delete from {S}.anamneses where nutricionista_id in ({em}) and titulo like {q(marca)} returning 1) select count(*)::int n from x")[0]["n"]
    feito["aplicacoes"] = B.sql_principal(f"with x as (delete from {S}.respostas_questionario where nutricionista_id in ({em}) and titulo like {q(marca)} returning 1) select count(*)::int n from x")[0]["n"]
    feito["respostas"] = B.sql_principal(f"""with x as (delete from {S}.respostas_preconsulta where nutricionista_id in ({em}) and (titulo like {q(marca)}
                                             or formulario_id in (select id from {S}.formularios_preconsulta where titulo like {q(marca)})) returning 1)
                                             select count(*)::int n from x""")[0]["n"]
    feito["formularios"] = B.sql_principal(f"with x as (delete from {S}.formularios_preconsulta where nutricionista_id in ({em}) and titulo like {q(marca)} returning 1) select count(*)::int n from x")[0]["n"]
    feito["alunos"] = B.sql_principal(f"""with x as (delete from {S}.pacientes where conta_id in ({contas_teste}) and nome like {q(marca)} returning 1)
                                          select count(*)::int n from x""")[0]["n"]
    if B.MASSA.exists() and S == "staging":
        B.MASSA.unlink()
    return feito


def criar(conta: str, conta_id: str, titulo: str, origem: str = "personalizado") -> dict:
    corpo = {"nutricionista_id": B.uid(conta), "conta_id": conta_id, "titulo": f"{B.MARCA} {titulo}", "origem": origem, "slug": slug(),
             "perguntas": PERGUNTAS, "faixas": [], "ativo": True, "descricao": "Responda antes da primeira conversa."}
    st, r = B.rest(conta, "POST", "formularios_preconsulta", "", corpo)
    assert st == 201, (conta, st, r)
    return r[0]  # type: ignore[index]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    a = ap.parse_args()
    B.ESTADO["schema"] = a.schema
    print("limpeza:", limpar())
    if a.limpar:
        return 0
    assert a.schema == "staging", "a massa é só do staging"
    w13 = B.conta_de("w13-dono", B.NOME_CONTA)
    m: dict = {"conta_w13": w13, "conta_prof2": B.conta_prof2(), "conta_legado": B.conta_nutri_legado(), "formularios": {}, "respostas": {}}
    for conta, chave, titulo, origem, pessoa in (
        ("w13-nutri", "camila", "Massa pré-anamnese", "anamnese", "Joana Massa"),
        ("w13-dono", "lucas", "Massa avaliação", "personalizado", "Pedro Massa"),
        ("w13-personal2", "bruno", "Massa treino Bruno", "personalizado", "Lia Massa"),
    ):
        f = criar(conta, w13, titulo, origem)
        r = B.responder(f["slug"], pessoa, f"w21.massa.{chave}.teste.claude@physiqnutri.app", {"p1": "Ganhar condicionamento", "p2": True, "p3": 3})
        m["formularios"][chave] = {"id": f["id"], "slug": f["slug"], "titulo": f["titulo"]}
        m["respostas"][chave] = {"id": r["id"], "nome": pessoa}
    B.gravar_massa(m)
    print("massa:", {k: v["titulo"] for k, v in m["formularios"].items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
