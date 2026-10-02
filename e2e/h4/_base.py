"""Physiq H4 — base dos testes de ponta a ponta dos ajustes da revisão final (painel do profissional e master). Reaproveita a base da
W27 (que reaproveita a W26…W5): sessão por e-mail e senha no principal pelo cab_login (captcha global — W28), o navegador do Caso
(1280 × 883 × 2 = as telas 6–8), SQL pela Management API, o /health do Treino antes de cada bloco.

Contas de TESTE do H4 (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por e2e/h4/massa.py):
  h4-dono    "Helena Costa H4"  dona da "Clínica H4" (Outra área: dono + personal + nutricionista; isenta; bloqueia o app de quem
             não paga): "Laura Vencida H4" (mensalidade vencida → selo; 15 lançamentos; 2 fotos do diário sem reação), "Igor Em Dia
             H4" (em dia → sem selo) e 2 recibos neste mês + 1 no mês anterior
  h4-csv     "Otávio Lima H4"   dono da "Conta CSV H4": 520 alunos SEM login (o espelho para o Treino só dispara em UPDATE de quem
             tem login → nada pesa o Treino) com gênero, apelido, nascimento, CPF (3) e datas de cadastro/modificação variados
  h4-susp    "Sara Dias H4"     dona da "Conta Suspensa H4"
  h4-membro  "Mauro Reis H4"    personal da "Conta Suspensa H4" (o membro que entra e vê a tela da suspensão)
  w27-master (da W27)           MASTER só durante os testes (dar_master / tirar_master — o Auth é um só para staging e produção)
Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w27", Path(__file__).parent.parent / "w27" / "_base.py")
B27 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w27"] = B27
_ESPEC.loader.exec_module(B27)  # type: ignore[union-attr]
B26, B25, B5 = B27.B26, B27.B25, B27.B5

p = B27.p
ESTADO, CONTAS, EMAIL, NOMES = B27.ESTADO, B27.CONTAS, B27.EMAIL, B27.NOMES
Caso, sql_principal, sql_treino = B27.Caso, B27.sql_principal, B27.sql_treino
http, service, anon, uid, q = B27.http, B27.service, B27.anon, B27.uid, B27.q
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B27.PRINCIPAL_REF, B27.PRINCIPAL_URL, B27.API_P
saude_ok, esperar = B27.saude_ok, B27.esperar
funcao, rpc_master = B27.funcao, B27.rpc
FOTOS = B25.B24.FOTOS
enviar_pelo_link = B25.B24.enviar_pelo_link

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "h4"
for _b in (B27, B26, B25, B25.B24, B25.B24.B18, B25.B24.B17, B25.B24.B16, B25.B24.B15, B25.B24.B14, B25.B24.B13, B5,
           B25.B24.B13.B12, B25.B24.B13.B12.B11, B25.B24.B13.B12.B10, B25.B24.B13.B12.B8, B25.B24.B13.B12.B7):
    _b.PRINTS = PRINTS  # todas as bases da corrente gravam os prints na pasta do H4
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "h4"

NOVAS = {
    "h4-dono": ("h4.dono.teste.claude@physiqnutri.app", "Helena Costa H4"),
    "h4-csv": ("h4.csv.teste.claude@physiqnutri.app", "Otávio Lima H4"),
    "h4-susp": ("h4.susp.teste.claude@physiqnutri.app", "Sara Dias H4"),
    "h4-membro": ("h4.membro.teste.claude@physiqnutri.app", "Mauro Reis H4"),
}
for _k, (_e, _n) in NOVAS.items():
    EMAIL[_k] = _e
    NOMES[_k] = _n
    CONTAS[_k] = (_e, B5.senha_de(_k))

CONTA_CLINICA, CONTA_CSV, CONTA_SUSP = "Clínica H4", "Conta CSV H4", "Conta Suspensa H4"
ALUNA_VENCIDA, ALUNO_EM_DIA = "Laura Vencida H4", "Igor Em Dia H4"
N_CSV = 520
MARCA = "H4"

_TOKENS: dict[str, tuple[float, str]] = {}


def schema() -> str:
    return ESTADO["schema"]


def token(conta: str, novo: bool = False) -> str:
    agora = time.time()
    t = _TOKENS.get(conta)
    if t and not novo and agora - t[0] < 1500:
        return t[1]
    tok = B5.sessao(conta)["access_token"]
    _TOKENS[conta] = (agora, tok)
    return tok


def rpc(conta: str, fn: str, args: dict | None = None) -> tuple[int, object]:
    """Uma função do principal COMO a pessoa (auth.uid() de verdade, no schema do teste)."""
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{fn}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Content-Profile": schema(), "Accept-Profile": schema()},
                    timeout=90)
    return st, r


def conta_id(nome: str) -> str | None:
    r = sql_principal(f"select id::text from {schema()}.contas where nome = {q(nome)} order by criado_em limit 1")
    return r[0]["id"] if r else None


def aluno_id(conta: str, nome: str) -> str | None:
    r = sql_principal(f"select id::text from {schema()}.pacientes where conta_id = '{conta}' and nome = {q(nome)} and deleted_at is null limit 1")
    return r[0]["id"] if r else None


def dar_master(conta: str = "w27-master") -> str:
    """O master de teste (W27) — e o token guardado aqui sai do cache (o próximo já leva o papel de master)."""
    u = B27.dar_master(conta)
    _TOKENS.pop(conta, None)
    return u


def tirar_master(conta: str = "w27-master") -> None:
    B27.tirar_master(conta)
    _TOKENS.pop(conta, None)
