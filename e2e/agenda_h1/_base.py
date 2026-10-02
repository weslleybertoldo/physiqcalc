"""Physiq H1 (ajustes da agenda achados na W2, 02/10/2026) — base dos testes de ponta a ponta: o ícone pela ÁREA no app do aluno, a
pílula da TAG na "Agenda de hoje" do Dashboard e a consulta que o aluno marca pelo pacote com a tag padrão do calendário. Reaproveita
a base da W2 (e2e/agenda_tags/_base.py: sessão, REST/RPC como a pessoa, saúde do Banco do Treino, o navegador do Caso).

Contas de TESTE (staging; só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por massa.py):
  h1a-ambos  h1a.ambos.teste.claude@physiqnutri.app  "Hugo Ambos H1" — dono + personal + nutricionista da "Studio Hugo H1" (o caso do
             Weslley: o mesmo profissional nos 2 papéis), calendários "Treino" e "Nutrição"
  h1a-aluno  h1a.aluno.teste.claude@physiqnutri.app  "Iara Aluna H1" — aluna com login na Studio Hugo (personal e nutri = Hugo)
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_agenda_tags", Path(__file__).parent.parent / "agenda_tags" / "_base.py")
BT = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_agenda_tags"] = BT
_ESPEC.loader.exec_module(BT)  # type: ignore[union-attr]
B5, BC = BT.B5, BT.BC

p = B5.p
ESTADO, CONTAS = B5.ESTADO, B5.CONTAS
http, service, anon, sql_principal = B5.http, B5.service, B5.anon, B5.sql_principal
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF
saude_ok, como, rpc_token, sessao_magica, q, rest = BT.saude_ok, BT.como, BT.rpc_token, BT.sessao_magica, BT.q, BT.rest

AMBOS, ALUNO = "h1a-ambos", "h1a-aluno"
EMAIL = {AMBOS: "h1a.ambos.teste.claude@physiqnutri.app", ALUNO: "h1a.aluno.teste.claude@physiqnutri.app"}
NOMES = {AMBOS: "Hugo Ambos H1", ALUNO: "Iara Aluna H1"}
for _k in (AMBOS, ALUNO):
    CONTAS[_k] = (EMAIL[_k], B5.senha_de(_k))
CONTA_AMBOS = "Studio Hugo H1"
TAG_REUNIAO = ("Reunião", "#f472b6", "geral")
TAG_AVALIACAO = ("Avaliação H1", "#fb923c", "treino")

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "conta-unica-agenda" / "h1"
B5.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "conta-unica-agenda" / "h1"
IDS = SCRATCH / "massa_ids.json"
RGB = {"#a78bfa": "167, 139, 250", "#34d399": "52, 211, 153", "#94a3b8": "148, 163, 184", "#f472b6": "244, 114, 182", "#fb923c": "251, 146, 60"}


def schema() -> str:
    return ESTADO["schema"]


def uid(conta: str) -> str | None:
    r = sql_principal(f"select id::text as id from auth.users where lower(email) = {q(EMAIL.get(conta, CONTAS[conta][0]))}")
    return r[0]["id"] if r else None


def ids() -> dict:
    return json.loads(IDS.read_text(encoding="utf-8"))


def token(conta: str) -> str:
    return B5.sessao(conta)["access_token"]


def print_inteiro(c, nome: str) -> str:
    """O print da página inteira (o app do aluno com a lista toda): a janela cresce até a altura da página — a barra de abas (fixa)
    fica embaixo, sem cobrir nenhuma linha — e volta ao tamanho do celular depois."""
    PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = PRINTS / f"{c.prefixo}_{nome}.png"
    c.pg.wait_for_timeout(800)
    antes = c.pg.viewport_size or {"width": 390, "height": 844}
    altura = int(c.pg.evaluate("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)"))
    c.pg.set_viewport_size({"width": antes["width"], "height": max(antes["height"], altura + 90)})
    c.pg.wait_for_timeout(600)
    c.pg.screenshot(path=str(caminho))
    c.pg.set_viewport_size(antes)
    return str(caminho)
