#!/usr/bin/env python3
"""Physiq W17 — massa de TESTE no staging do banco principal (idempotente; só a "Consultoria Ferreira W13" das contas w13.*).

  envio        (item 2) 2 alunos da Camila (nutricionista responsável), só Nutrição:
                 "Aluno Envio W17"   COM login (w17.envio.teste.claude@physiqnutri.app), e-mail e telefone de mentira — o
                                     teste tira e põe o e-mail e o telefone dele (os do Rafael, que outras W usam, não mudam)
                 "Aluno Sem Login W17"  sem login (o "Salvar e enviar" não manda nada: ele vê quando entrar)
  --limpar     apaga o que a W17 criou no staging (os 2 alunos, os avisos deles e o login de teste)

Uso: python3 e2e/w17/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
SEM_LOGIN = ("Aluno Sem Login W17", "w17.semlogin.teste.claude@physiqnutri.app")


def q(sql: str) -> list:
    return B.sql_principal(sql)


def lit(v) -> str:
    return "null" if v is None else "$v$" + str(v) + "$v$"


def aluno(conta: str, nome: str) -> dict | None:
    r = q(f"select id::text, user_id::text, email, telefone from {S}.pacientes where conta_id = '{conta}' and nome = {lit(nome)} and deleted_at is null limit 1")
    return r[0] if r else None


def garantir_aluno(conta: str, nutri: str, nome: str, email: str, telefone: str | None, user_id: str | None) -> str:
    a = aluno(conta, nome)
    if a:
        q(f"update {S}.pacientes set nutricionista_id = '{nutri}', personal_id = null, email = {lit(email)}, telefone = {lit(telefone)}, "
          f"user_id = {lit(user_id)}, ativo = true, acesso_bloqueado_em = null where id = '{a['id']}'")
        return a["id"]
    return q(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, email, telefone, user_id, origem, ativo)
                 values ('{nutri}', null, '{conta}', {lit(nome)}, {lit(email)}, {lit(telefone)}, {lit(user_id)}, 'novo', true)
                 returning id::text""")[0]["id"]


TITULO_PLANO = "Plano de definição W17"


def garantir_plano(aluno_id: str, nutri: str) -> str:
    """O mesmo dia da tela 8 da W16 (5 refeições, ~2.450 kcal), para o print do "Salvar e enviar" ficar igual à tela 8."""
    r = q(f"select id::text from {S}.planos_alimentares where paciente_id = '{aluno_id}' and titulo = {lit(TITULO_PLANO)} and deleted_at is null limit 1")
    if r:
        return r[0]["id"]
    plano = q(f"""insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, metodo, kcal_alvo, observacao)
                  values ('{nutri}', '{aluno_id}', {lit(TITULO_PLANO)}, 'alimentos', 2450, $o$Beber 2,5 L de água por dia.$o$) returning id::text""")[0]["id"]
    for ordem, (hora, nome, itens) in enumerate(B.B16.REFEICOES):
        rid = q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem, dias_semana) values ('{plano}', {lit(nome)}, '{hora}', {ordem}, '{{}}') returning id::text")[0]["id"]
        for i, (alim, g) in enumerate(itens):
            a = B.B16.alimento(alim)
            subs = []
            for sub in B.B16.SUBSTITUTOS.get(alim, []):
                b = B.B16.alimento(sub)
                eq = round((a["kcal"] * g / 100) / b["kcal"] * 100, 2) if b["kcal"] else 100
                subs.append({"alimento_id": b["id"], "nome": b["nome"], "quantidade_g": eq})
            q(f"""insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem, substitutos)
                  values ('{rid}', '{a['id']}', {g}, {i}, $j${json.dumps(subs, ensure_ascii=False)}$j$::jsonb)""")
    return plano


def montar() -> dict:
    conta = B.conta_w13()
    camila = B.uid("w13-nutri")
    assert camila, "Camila (w13-nutri) não achada"
    email, senha = B.CONTAS["w17-envio"]
    u = B.B5.garantir_usuario(email, senha, B.NOME_ENVIO)
    envio = garantir_aluno(conta, camila, B.NOME_ENVIO, email, B.TELEFONE_ENVIO, u)
    sem = garantir_aluno(conta, camila, SEM_LOGIN[0], SEM_LOGIN[1], "00900001702", None)
    q(f"delete from {S}.avisos where destino_user_id = '{u}'")
    B.B16.ESTADO["schema"] = S
    plano = garantir_plano(envio, camila)
    m = {"conta": conta, "camila": camila, "envio": envio, "envio_user": u, "sem_login": sem, "plano": plano}
    B.json_arquivo(B.SCRATCH / "massa_staging.json", m)
    return m


def limpar() -> None:
    conta = B.conta_w13()
    u = B.uid("w17-envio")
    if u:
        q(f"delete from {S}.avisos where destino_user_id = '{u}'")
    for nome in (B.NOME_ENVIO, SEM_LOGIN[0]):
        for a in q(f"select id::text from {S}.pacientes where conta_id = '{conta}' and nome = {lit(nome)}"):
            q(f"delete from {S}.planos_alimentares where paciente_id = '{a['id']}'")
        q(f"delete from {S}.pacientes where conta_id = '{conta}' and nome = {lit(nome)}")
    print("limpo: alunos e avisos da W17 (o login de teste fica, sem matrícula)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        print(montar())
