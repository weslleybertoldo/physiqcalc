"""Physiq W16 — base dos testes de ponta a ponta do Perfil do aluno › Dieta, da página "Editar treino e dieta" (tela 8 inteira) e
do card Dieta do Resumo (tela 7). Reaproveita a base da W15/W14/W13 (a "Consultoria Ferreira W13": Lucas dono + personal, Camila
nutricionista, Bruno 2º personal, Rafael Moura aluno com login, Treino + Nutrição — o aluno das telas 7 e 8; o treino da tela 8
já está no staging pela massa da W15).

Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w15", Path(__file__).parent.parent / "w15" / "_base.py")
B15 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w15"] = B15
_ESPEC.loader.exec_module(B15)  # type: ignore[union-attr]
B14, B13, B5 = B15.B14, B15.B13, B15.B5

p = B15.p
ESTADO, CONTAS, EMAIL, NOMES = B15.ESTADO, B15.CONTAS, B15.EMAIL, B15.NOMES
Caso, sql_principal, sql_treino, saude_treino = B15.Caso, B15.sql_principal, B15.sql_treino, B15.saude_treino
http, service, anon, rpc, uid, sessao, token = B15.http, B15.service, B15.anon, B15.rpc, B15.uid, B15.sessao, B15.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, API_T, TREINO_REF = B15.PRINCIPAL_REF, B15.PRINCIPAL_URL, B15.API_P, B15.API_T, B15.TREINO_REF
conta_de, NOME_CONTA = B15.conta_de, B15.NOME_CONTA
saude_ok, esperar, treino_id = B15.saude_ok, B15.esperar, B15.treino_id
token_treino, funcao_treino, semana = B15.token_treino, B15.funcao_treino, B15.semana
json_arquivo, ler_json = B15.json_arquivo, B15.ler_json
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w16"
for _b in (B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w16"
TITULO_PLANO = "Plano de definição W16"

# o dia da tela 8 (5 refeições, ~2.450 kcal): (horário, nome, [(alimento TACO, gramas)])
REFEICOES = [
    ("07:00", "Café da manhã", [("Pão, trigo, francês", 70), ("Ovo, de galinha, inteiro, cozido/10minutos", 100), ("Banana, prata, crua", 100)]),
    ("10:00", "Lanche da manhã", [("Iogurte, natural", 200), ("Aveia, flocos, crua", 40)]),
    ("13:00", "Almoço", [("Frango, peito, sem pele, grelhado", 180), ("Arroz, integral, cozido", 200), ("Feijão, carioca, cozido", 100),
                         ("Salada, de legumes, cozida no vapor", 120)]),
    ("16:00", "Lanche da tarde", [("Banana, prata, crua", 120), ("Amendoim, grão, cru", 50)]),
    ("19:00", "Jantar", [("Carne, bovina, patinho, sem gordura, grelhado", 150), ("Batata, doce, cozida", 250), ("Azeite, de oliva, extra virgem", 20)]),
]
# 2 trocas por alimento do almoço (o "⇄ 2" da tela 8): (alimento, [substitutos])
SUBSTITUTOS = {
    "Frango, peito, sem pele, grelhado": ["Carne, bovina, patinho, sem gordura, grelhado", "Ovo, de galinha, inteiro, cozido/10minutos"],
    "Arroz, integral, cozido": ["Arroz, tipo 1, cozido", "Batata, doce, cozida"],
    "Feijão, carioca, cozido": ["Batata, doce, cozida", "Arroz, tipo 1, cozido"],
    "Salada, de legumes, cozida no vapor": ["Brócolis, cozido", "Cenoura, cozida"],
}


def schema() -> str:
    return ESTADO["schema"]


def alimento(nome: str) -> dict:
    r = sql_principal(f"select id::text, nome, energia_kcal::float as kcal, proteina_g::float as prot from {schema()}.alimentos "
                      f"where fonte = 'taco' and nome = $n${nome}$n$ and deleted_at is null limit 1")
    assert r, f"alimento TACO não achado: {nome}"
    return r[0]


def rafael(conta_id: str) -> dict:
    r = sql_principal(f"select id::text, user_id::text, treino_user_id::text, nutricionista_id::text, personal_id::text, objetivo "
                      f"from {schema()}.pacientes where conta_id = '{conta_id}' and nome = 'Rafael Moura' and deleted_at is null limit 1")
    assert r, "Rafael Moura não achado (rode e2e/w13/massa.py)"
    return r[0]


def conta_w13() -> str:
    c = conta_de("w13-dono", NOME_CONTA)
    assert c, "Consultoria Ferreira W13 não achada (rode e2e/w13/massa.py)"
    return c
