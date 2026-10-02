"""Physiq W25 — base dos testes de ponta a ponta do Painel › Dashboard (tela 6). Reaproveita a base da W24 (que reaproveita a W18…W13
e a W5: a "Consultoria Ferreira W13" — Lucas Ferreira dono + personal, Camila Rocha nutricionista, Bruno Lima 2º personal, Rafael
Moura aluno com login nos 2 módulos, Marina, João Pedro, Beatriz, Carlos e Diego —, com a agenda de hoje da W20, o financeiro da W19
e o diário da W24).

Contas de TESTE desta W (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por e2e/w25/massa.py):
  w25-carlos   o login do Treino do "Carlos Souza" (aluno do Lucas sem login no principal): o treino dele no Banco do Treino (sem
               treinar há 10 dias — o item TREINO de "Precisam de atenção")
  w25-dieta    "Larissa Prado" — aluna da Camila COM login (só Nutrição): plano de 10 dias, último ✓ há 4 dias (o item DIETA)

Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w24", Path(__file__).parent.parent / "w24" / "_base.py")
B24 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w24"] = B24
_ESPEC.loader.exec_module(B24)  # type: ignore[union-attr]
B18, B17, B16, B15, B14, B13, B5 = B24.B18, B24.B17, B24.B16, B24.B15, B24.B14, B24.B13, B24.B5

p = B24.p
ESTADO, CONTAS, EMAIL, NOMES = B24.ESTADO, B24.CONTAS, B24.EMAIL, B24.NOMES
Caso, sql_principal, sql_treino, saude_treino = B24.Caso, B24.sql_principal, B24.sql_treino, B24.saude_treino
http, service, anon, rpc, uid, sessao, token = B24.http, B24.service, B24.anon, B24.rpc, B24.uid, B24.sessao, B24.token
PRINCIPAL_REF, PRINCIPAL_URL, API_P, API_T, TREINO_REF = B24.PRINCIPAL_REF, B24.PRINCIPAL_URL, B24.API_P, B24.API_T, B24.TREINO_REF
conta_de, NOME_CONTA, conta_w13 = B24.conta_de, B24.NOME_CONTA, B24.conta_w13
saude_ok, esperar, json_arquivo, q, carimbo = B24.saude_ok, B24.esperar, B24.json_arquivo, B24.q, B24.carimbo
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w25"
for _b in (B24, B18, B17, B16, B15, B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w25"
MARCA = "W25"

for _k, _e, _n in (
    ("w25-carlos", "w25.carlos.teste.claude@physiqnutri.app", "Carlos Souza"),
    ("w25-dieta", "w25.dieta.teste.claude@physiqnutri.app", "Larissa Prado"),
):
    EMAIL[_k] = _e
    NOMES[_k] = _n
    CONTAS[_k] = (_e, B5.senha_de(_k))


def schema() -> str:
    return ESTADO["schema"]


def hoje() -> str:
    return B5.hoje().isoformat()


def dias_atras(n: int) -> str:
    return (B5.hoje() - __import__("datetime").timedelta(days=n)).isoformat()


def treino_token(conta: str) -> str:
    """A sessão do Treino da pessoa (a mesma troca de token do app)."""
    st, r = B5.trocar_token(conta)
    assert st == 200 and r.get("access_token"), (conta, st, r)
    return r["access_token"]


def resumo_treino(tok: str | None, conta_id: str, origem: str = "https://physiqcalc-staging.vercel.app") -> tuple[int, object, float]:
    """A função painel-resumo-treino como o painel chama (sessão do Treino + x-schema). Devolve (status, corpo, segundos)."""
    cab = {"apikey": anon(TREINO_REF), "x-schema": schema(), "Origin": origem}
    if tok:
        cab["Authorization"] = f"Bearer {tok}"
    t0 = time.time()
    st, r, _ = http("POST", f"{API_T}/functions/v1/painel-resumo-treino", {"conta": conta_id}, cab, timeout=60)
    return st, r, time.time() - t0


def resumo_principal(conta_ou_token: str, conta_id: str) -> tuple[int, object]:
    return rpc(conta_ou_token, "painel_resumo", {"p_conta": conta_id})


def novos_por_mes(conta_ou_token: str, conta_id: str, meses: int = 6) -> tuple[int, object]:
    return rpc(conta_ou_token, "alunos_novos_por_mes", {"p_conta": conta_id, "p_meses": meses})


def lista_alunos(conta: str, conta_id: str, filtros: dict | None = None, limite: int = 0) -> dict:
    st, r = rpc(conta, "alunos_da_conta", {"p_conta": conta_id, "p_filtros": filtros or {}, "p_offset": 0, "p_limite": limite})
    assert st == 200, (st, r)
    return r  # type: ignore[return-value]
