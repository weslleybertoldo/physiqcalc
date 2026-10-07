"""Physiq W27 — base dos testes de ponta a ponta do PAINEL MASTER (spec §4.7). Reaproveita a base da W26 (que reaproveita a W25…W5):
sessão por e-mail e senha no principal, Caso (navegador 1280 × 883 × 2 = as telas 6–8), SQL pela Management API.

Contas de TESTE desta W (só *.teste.claude@physiqnutri.app — P26; senhas em ~/.physiq-teste-<nome>, criadas por e2e/w27/massa.py):
  w27-master   "Master Teste W27"  MASTER só durante os testes e SÓ no staging (perfil master em staging.profiles — hml-02/H-04:
               nunca o claim global, que valeria na produção); o massa.py --limpar tira o master dos 2 bancos
  w27-dono-a   "Dona Ana W27"      conta "Estúdio Ana W27" criada PELO MASTER na tela/função (e-mail + senha; outra área)
  w27-dono-b   "Bruno Dono W27"    conta "Treino Bruno W27" criada pelo master (personal, Só Treino)
  w27-aluno    "Aluno Login W27"   pessoa com login e sem conta: o master põe numa conta e depois move de conta
  w27-app      "Aluna App W27"     aluna do app (sem profissional): a senha nova pelo master (herdado W8b)
Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w26", Path(__file__).parent.parent / "w26" / "_base.py")
B26 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w26"] = B26
_ESPEC.loader.exec_module(B26)  # type: ignore[union-attr]
B25, B5 = B26.B25, B26.B5

p = B26.p
ESTADO, CONTAS, EMAIL, NOMES = B26.ESTADO, B26.CONTAS, B26.EMAIL, B26.NOMES
Caso, sql_principal, sql_treino, saude_treino = B26.Caso, B26.sql_principal, B26.sql_treino, B26.saude_treino
http, service, anon, uid = B26.http, B26.service, B26.anon, B26.uid
PRINCIPAL_REF, PRINCIPAL_URL, API_P = B26.PRINCIPAL_REF, B26.PRINCIPAL_URL, B26.API_P
saude_ok, esperar, json_arquivo, q, carimbo = B26.saude_ok, B26.esperar, B26.json_arquivo, B26.q, B26.carimbo
TREINO_REF = B5.TREINO_REF
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w27"
for _b in (B26, B25, B25.B24, B25.B24.B18, B25.B24.B17, B25.B24.B16, B25.B24.B15, B25.B24.B14, B25.B24.B13, B5,
           B25.B24.B13.B12, B25.B24.B13.B12.B11, B25.B24.B13.B12.B10, B25.B24.B13.B12.B8, B25.B24.B13.B12.B7):
    _b.PRINTS = PRINTS  # todas as bases da corrente gravam os prints na pasta da W27
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w27"

NOVAS = {
    "w27-master": ("w27.master.teste.claude@physiqnutri.app", "Master Teste W27"),
    "w27-dono-a": ("w27.dono.a.teste.claude@physiqnutri.app", "Dona Ana W27"),
    "w27-dono-b": ("w27.dono.b.teste.claude@physiqnutri.app", "Bruno Dono W27"),
    "w27-aluno": ("w27.aluno.teste.claude@physiqnutri.app", "Aluno Login W27"),
    "w27-app": ("w27.app.teste.claude@physiqnutri.app", "Aluna App W27"),
}
for _k, (_e, _n) in NOVAS.items():
    EMAIL[_k] = _e
    NOMES[_k] = _n
    CONTAS[_k] = (_e, B5.senha_de(_k))
CONTA_A, CONTA_B, CONTA_C = "Estúdio Ana W27", "Treino Bruno W27", "Conta Vazia W27"

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


def funcao(nome: str, corpo: dict, conta: str | None = "w27-master", tok: str | None = None, timeout: int = 90) -> tuple[int, dict]:
    """Chama uma função do principal (master-contas/-financeiro/-planos) COMO a pessoa; conta=None → sem login."""
    cab = {"apikey": anon(PRINCIPAL_REF), "x-schema": schema(), "Origin": "https://physiqcalc-staging.vercel.app"}
    t = tok or (token(conta) if conta else None)
    if t:
        cab["Authorization"] = f"Bearer {t}"
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/{nome}", corpo, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def rpc(conta: str, fn: str, args: dict | None = None) -> tuple[int, object]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{fn}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Content-Profile": schema(), "Accept-Profile": schema()}, timeout=90)
    return st, r


def conta_id(nome: str) -> str | None:
    r = sql_principal(f"select id::text from {schema()}.contas where nome = {q(nome)} order by criado_em limit 1")
    return r[0]["id"] if r else None


def treino_de(conta: str) -> str | None:
    u = uid(conta)
    if not u:
        return None
    r = sql_treino(f"select treino_user_id::text as t from {schema()}.physiq_identidades where principal_user_id = '{u}'")
    return r[0]["t"] if r else None


def admin_auth(ref: str, metodo: str, caminho: str, corpo=None):
    sk = service(ref)
    base = PRINCIPAL_URL if ref == PRINCIPAL_REF else f"https://{ref}.supabase.co"
    st, r, _ = http(metodo, f"{base}/auth/v1/admin/{caminho}", corpo, {"apikey": sk, "Authorization": f"Bearer {sk}"})
    return st, r


def dar_master(conta: str = "w27-master") -> str:
    """O master de teste: SÓ o perfil master em staging.profiles (hml-02/H-04 — o Auth é um só para staging e produção: o claim
    app_metadata.role valeria na produção). Na produção não existe master de teste."""
    assert schema() == "staging", "hml-02 (H-04): master de teste só no staging"
    u = uid(conta)
    assert u, conta
    sql_principal(f"update staging.profiles set role = 'master', nome = {q(NOMES[conta])} where id = '{u}'")
    _TOKENS.pop(conta, None)
    return u


def tirar_master(conta: str = "w27-master") -> None:
    """Desfaz o master de teste nos 2 bancos (principal: claim + perfil nos 2 schemas; Treino: o papel do JWT)."""
    u = uid(conta)
    if not u:
        return
    st, r = admin_auth(PRINCIPAL_REF, "GET", f"users/{u}")
    meta = dict((r or {}).get("app_metadata") or {})
    meta.pop("role", None)
    meta["role"] = None
    admin_auth(PRINCIPAL_REF, "PUT", f"users/{u}", {"app_metadata": meta})
    for s in ("public", "staging"):
        sql_principal(f"update {s}.profiles set role = 'pessoa' where id = '{u}' and role = 'master'")
    for s in ("public", "staging"):
        r = sql_treino(f"select treino_user_id::text as t from {s}.physiq_identidades where principal_user_id = '{u}'")
        for x in r:
            admin_auth(TREINO_REF, "PUT", f"users/{x['t']}", {"app_metadata": {"role": None}})
    _TOKENS.pop(conta, None)
