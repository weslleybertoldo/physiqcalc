"""Physiq W26 — base dos testes de ponta a ponta das Ferramentas (Modelos, Impressos, Calculadora, Lixeira) e das públicas (/calculator,
/privacidade, /termos). Reaproveita a base da W25 (que reaproveita a W24…W13 e a W5): a "Clínica Sabor W24" (Helena Prado dona +
nutricionista, Sofia Martins nutricionista, Diego Ramos personal; alunas Ana Clara W24 e Bruna Costa W24) e a "Consultoria Ferreira W13"
(Lucas Ferreira dono + personal SEM papel de nutri, Camila Rocha nutricionista, Bruno Lima personal; está no limite da faixa: 10 de 10).

Contas de TESTE desta W (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por e2e/w26/massa.py):
  w26-lia    "Lia App W26"     aluna COM login da Helena: removida da lista → vira aluna do app (W7b); restaurar encerra a do app
  w26-otto   "Otto Outro W26"  aluno COM login da Helena: removido e depois ativo com OUTRO profissional → restaurar recusa (P7)
  w26-outro  "Renata Outra"    dona da "Outra Conta W26" (o outro profissional do Otto)

Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w25", Path(__file__).parent.parent / "w25" / "_base.py")
B25 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w25"] = B25
_ESPEC.loader.exec_module(B25)  # type: ignore[union-attr]
B24, B5 = B25.B24, B25.B5

p = B25.p
ESTADO, CONTAS, EMAIL, NOMES = B25.ESTADO, B25.CONTAS, B25.EMAIL, B25.NOMES
Caso, sql_principal, sql_treino, saude_treino = B25.Caso, B25.sql_principal, B25.sql_treino, B25.saude_treino
http, service, anon, uid = B25.http, B25.service, B25.anon, B25.uid
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B25.PRINCIPAL_REF, B25.PRINCIPAL_URL, B25.API_P
conta_de, conta_w13 = B25.conta_de, B25.conta_w13
saude_ok, esperar, json_arquivo, q, carimbo = B25.saude_ok, B25.esperar, B25.json_arquivo, B25.q, B25.carimbo
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w26"
for _b in (B25, B24, B24.B18, B24.B17, B24.B16, B24.B15, B24.B14, B24.B13, B5, B24.B13.B12, B24.B13.B12.B11, B24.B13.B12.B10, B24.B13.B12.B8, B24.B13.B12.B7):
    _b.PRINTS = PRINTS  # todas as bases da corrente gravam os prints na pasta da W26
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w26"
MARCA = "W26"
NOME_CONTA_W24 = "Clínica Sabor W24"
NOME_OUTRA = "Outra Conta W26"

for _k, _e, _n in (
    ("w26-lia", "w26.lia.teste.claude@physiqnutri.app", "Lia App W26"),
    ("w26-otto", "w26.otto.teste.claude@physiqnutri.app", "Otto Outro W26"),
    ("w26-outro", "w26.outro.teste.claude@physiqnutri.app", "Renata Outra"),
):
    EMAIL[_k] = _e
    NOMES[_k] = _n
    CONTAS[_k] = (_e, B5.senha_de(_k))

_TOKENS: dict[str, tuple[float, str]] = {}


def schema() -> str:
    return ESTADO["schema"]


def token(conta: str) -> str:
    """Sessão do banco principal da pessoa (guardada por 40 min: menos logins seguidos)."""
    agora = time.time()
    t = _TOKENS.get(conta)
    if t and agora - t[0] < 2400:
        return t[1]
    tok = B5.sessao(conta)["access_token"]
    _TOKENS[conta] = (agora, tok)
    return tok


def rpc(conta: str, funcao: str, args: dict | None = None) -> tuple[int, object]:
    """Chama a função do banco principal COMO a pessoa (auth.uid() de verdade)."""
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{funcao}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Content-Profile": schema(), "Accept-Profile": schema()}, timeout=90)
    return st, r


def conta_w24() -> str:
    c = conta_de("w24-dono", NOME_CONTA_W24)
    assert c, "a Clínica Sabor W24 não existe no staging (rode e2e/w24/massa.py)"
    return c


def lixeira(conta: str, conta_id: str) -> dict:
    st, r = rpc(conta, "lixeira_da_conta", {"p_conta": conta_id})
    assert st == 200 and isinstance(r, dict), (conta, st, r)
    return r


def itens_da_lixeira(conta: str, conta_id: str) -> list[dict]:
    r = lixeira(conta, conta_id)
    return r.get("itens", []) if r.get("ok") else []


def chaves(itens: list[dict]) -> set[str]:
    return {f"{i['tipo']}:{i['id']}" for i in itens}


def paciente(nome: str, conta_id: str) -> dict | None:
    r = sql_principal(f"""select id::text, user_id::text, ativo, deleted_at, personal_id::text, nutricionista_id::text, link_codigo
                            from {schema()}.pacientes where conta_id = '{conta_id}' and nome = {q(nome)} order by created_at limit 1""")
    return r[0] if r else None
