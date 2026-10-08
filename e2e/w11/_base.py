"""Physiq W11 — base dos testes de ponta a ponta da aba Dieta nova (tela 3).

Login como o app: sessão do banco principal injetada no aparelho (W3); a aba lê o banco principal pela função minha_dieta() e marca
pelas funções paciente_marcar_refeicao (a MESMA do site antigo do Nutri) e aluno_marcar_meta (W11). O Banco do Treino só entra na
troca de token de quem também tem Treino (o Diego) — nada da Dieta é gravado lá.

Contas (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>):
  w10-aluno     "Diego Almeida" — Treino + Nutrição na "Consultoria Ferreira W7" (Camila Rocha, nutricionista): o plano da tela 3
  paciente      "Paciente Teste Claude" — paciente do site antigo (papel 'paciente', "Nutri Teste Claude"): lado a lado com o Nutri
  w10-paciente  "Paula Lima" — só Nutrição, SEM plano (o vazio; as 3 abas Dieta · Evolução · Perfil)
  w7-paciente   "Paula Nutri" — só Nutrição, plano só de outros dias da semana (dia sem refeição, NF3)
  w7b-novo      aluno do app sem profissional, Treino + Alimentação (os pratos prontos na aba Dieta)
Sem segredo no repo: chaves pela Management API (~/.pc-pat).
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w10", Path(__file__).parent.parent / "w10" / "_base.py")
B10 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w10"] = B10
_ESPEC.loader.exec_module(B10)  # type: ignore[union-attr]

B8, B7, B5 = B10.B8, B10.B7, B10.B5
p = B10.p
ESTADO, CONTAS = B10.ESTADO, B10.CONTAS
Caso, sql_treino, sql_principal, saude_treino = B10.Caso, B10.sql_treino, B10.sql_principal, B10.saude_treino
http, service, anon, rpc, uid, sessao = B5.http, B5.service, B5.anon, B5.rpc, B5.uid, B5.sessao
PRINCIPAL_REF, PRINCIPAL_URL = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w11"
for _b in (B5, B7, B8, B10):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w11"
FOTOS = Path("/home/bertoldo/Desktop/Physiq Unificado - estrutura/Telas premium/fonte (gerador)/assets/fotos")

EMAIL = {
    "w10-aluno": "w10.aluno.teste.claude@physiqnutri.app",
    "paciente": "paciente.teste.claude@physiqnutri.app",
    "w10-paciente": "w10.paciente.teste.claude@physiqnutri.app",
    "w7-paciente": "w7.paciente.teste.claude@physiqnutri.app",
    "w7b-novo": "w7b.novo.teste.claude@physiqnutri.app",
    "nutri": "nutri.teste.claude@physiqnutri.app",
}
for _k, _e in EMAIL.items():
    CONTAS.setdefault(_k, (_e, B5.senha_de(_k)))
# a nutricionista de teste do site antigo guarda a senha em ~/.physiq-teste-nutri (a mesma dos smokes do Nutri antigo)
CONTAS["nutri"] = (EMAIL["nutri"], B5.senha("nutri"))


def schema() -> str:
    return ESTADO["schema"]


def bucket_do_ambiente(nome: str) -> str:
    """hml-02b (H-14): no staging os buckets de dado de saúde têm versão própria "-staging"."""
    return f"{nome}-staging" if schema() == "staging" else nome


def abrir(nav, base: str, prefixo: str, nome: str, conta: str, rota: str = "/dieta", esperar: str | None = "[data-aba-dieta]") -> "Caso":
    """Contexto limpo no celular (390 × 844 × 3,4 = 1326 × 2870, como as telas do app), sessão injetada e a rota."""
    c = Caso(nav, base, prefixo, nome, desktop=False)
    c.entrar(conta, rota, zerar=schema() == "staging")
    c.fechar_avisos()
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar) and not c.tem('[data-aba-dieta="carregando"]'), 120)
        p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
        p.check(not c.caminho().startswith("/entrar"), f"[{nome}] não caiu na tela de entrada")
    return c


def json_arquivo(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def pausa(s: float) -> None:
    time.sleep(s)
