"""Physiq W6 — base dos testes de ponta a ponta da cobrança aluno → profissional (Perfil › Pagamentos, aba Financeiro,
Configurações › Recebimento, pagamentos-aluno, mp-webhook-aluno e o repasse do mp-webhook do Treino). Sem segredo no repo:
chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome> e ~/.physiqcalc-teste-*,
credencial de TESTE do Mercado Pago em ~/.physiq-mp-test / ~/.physiq-mp-public-test.

Contas de TESTE (staging; nenhuma cobrança, e-mail ou WhatsApp para pessoa real):
  prof2       prof2.teste.claude@physiqcalc.app    dono da conta "Rafael Lima" do prof2 (legado_calc) — Pix na chave, confirma/recusa
  aluno2      aluno2.teste.claude@physiqcalc.app   aluno do prof2 (Calc) — paga a mensalidade por Pix com comprovante
  master      admin.teste.claude@physiqcalc.app    master de teste, dono da conta "Admin Teste" (legado_calc) — Mercado Pago
  aluno-calc  teste@teste.com                      aluno do master de teste — paga pelo Mercado Pago (sandbox)
  nutri-legado nutri.teste.claude@physiqnutri.app  dona da "Nutri Teste Claude" (legado_nutri, bloqueio do inadimplente ligado)
  paciente    paciente.teste.claude@physiqnutri.app paciente da nutri — vê as cobranças e paga (R16)
"""
from __future__ import annotations

import base64
import datetime as dt
import sys
import time
import urllib.request
from pathlib import Path

import importlib.util

# a base da W5 tem o mesmo nome de módulo (_base): carrega pelo caminho, com outro nome
_ESPEC = importlib.util.spec_from_file_location("_base_w05", Path(__file__).parent.parent / "w05" / "_base.py")
B5 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w05"] = B5
_ESPEC.loader.exec_module(B5)  # type: ignore[union-attr]
ADMIN, ALUNO_CALC, API_P, CONTAS, ESTADO = B5.ADMIN, B5.ALUNO_CALC, B5.API_P, B5.CONTAS, B5.ESTADO
PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL = B5.PRINCIPAL_REF, B5.PRINCIPAL_URL, B5.TREINO_REF, B5.TREINO_URL
Caso, anon, exec_treino, http, p, senha, service = B5.Caso, B5.anon, B5.exec_treino, B5.http, B5.p, B5.senha, B5.service
sql_principal, sql_treino = B5.sql_principal, B5.sql_treino

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w06"
B5.PRINTS = PRINTS
CONTAS.setdefault("aluno2", ("aluno2.teste.claude@physiqcalc.app", ADMIN["SENHA"]))
CONTAS.setdefault("prof2", ("prof2.teste.claude@physiqcalc.app", ADMIN["SENHA"]))
CONTAS.setdefault("paciente", ("paciente.teste.claude@physiqnutri.app", senha("paciente")))
MP = "https://api.mercadopago.com"

# PNG 1×1 (o "comprovante" dos testes)
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")

_tokens: dict[str, tuple[float, str]] = {}


def token(conta: str) -> str:
    """Sessão do principal da conta de TESTE (reaproveitada por 40 min — poupa o Auth)."""
    agora = time.time()
    t = _tokens.get(conta)
    if t and agora - t[0] < 2400:
        return t[1]
    tok = B5.sessao(conta)["access_token"]
    _tokens[conta] = (agora, tok)
    return tok


def schema() -> str:
    return ESTADO["schema"]


def pag(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    st, r = B5.funcao(token(conta), "pagamentos-aluno", {"acao": acao, **(corpo or {})})
    return st, (r if isinstance(r, dict) else {"_bruto": r})


def rpc(conta: str, funcao: str, args: dict | None = None):
    return B5.rpc(token(conta), funcao, args)


def rest(conta: str, metodo: str, caminho: str, corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{caminho}", corpo,
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Accept-Profile": schema(),
                     "Content-Profile": schema(), "Prefer": prefer})
    return st, r


def uid(conta: str) -> str:
    return sql_principal(f"select id::text as id from auth.users where lower(email) = '{CONTAS[conta][0]}'")[0]["id"]


def matricula(conta: str) -> dict:
    return sql_principal(f"""select p.id::text as id, p.treino_user_id::text as treino_user_id, p.conta_id::text as conta_id
                               from {schema()}.pacientes p join auth.users u on u.id = p.user_id
                              where lower(u.email) = '{CONTAS[conta][0]}' and p.deleted_at is null order by p.created_at limit 1""")[0]


def conta_do_dono(conta: str) -> str:
    return sql_principal(f"""select c.id::text as id from {schema()}.contas c join auth.users u on u.id = c.dono_id
                              where lower(u.email) = '{CONTAS[conta][0]}' order by c.criado_em limit 1""")[0]["id"]


def subir_comprovante(conta: str, paciente_id: str, conteudo: bytes = PNG, tipo: str = "image/png") -> str:
    """O caminho do app: URL assinada da pagamentos-aluno → PUT do arquivo (como o uploadToSignedUrl do supabase-js)."""
    st, r = pag(conta, "aluno_upload", {"paciente_id": paciente_id, "tipo": tipo, "tamanho": len(conteudo)})
    assert st == 200 and r.get("url"), (st, r)
    url = r["url"] if r["url"].startswith("http") else f"{PRINCIPAL_URL}/storage/v1{r['url']}"
    req = urllib.request.Request(url, data=conteudo, method="PUT", headers={"Content-Type": tipo, "x-upsert": "false", "User-Agent": "physiq-e2e-w06"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        assert resp.status in (200, 201), resp.status
    return r["caminho"]


def ler(nome: str) -> str:
    return Path.home().joinpath(nome).read_text(encoding="utf-8").strip()


def mp_teste(metodo: str, caminho: str, corpo=None) -> tuple[int, object]:
    st, r, _ = http(metodo, f"{MP}{caminho}", corpo, {"Authorization": f"Bearer {ler('.physiq-mp-test')}",
                                                     "X-Idempotency-Key": f"w06-{time.time_ns()}"})
    return st, r


def token_cartao(titular: str = "APRO") -> str:
    st, r, _ = http("POST", f"{MP}/v1/card_tokens?public_key={ler('.physiq-mp-public-test')}", {
        "card_number": "5031433215406351", "expiration_month": 11, "expiration_year": 2030, "security_code": "123",
        "cardholder": {"name": titular, "identification": {"type": "CPF", "number": "12345678909"}}})
    assert st in (200, 201) and r.get("id"), (st, r)
    return r["id"]


def hoje() -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()


def dias(n: int) -> str:
    return ((dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date() + dt.timedelta(days=n)).isoformat()


def saude_treino(limite_s: float = 10.0) -> bool:
    """/health do Banco do Treino pela Management API (a VM Nano trava com carga): UNHEALTHY ou lento → parar."""
    t0 = time.time()
    st, r, _ = http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/health?services=db&services=auth&services=rest", None,
                    {"Authorization": f"Bearer {ler('.pc-pat')}"}, timeout=30)
    dt_ = time.time() - t0
    ok = st == 200 and isinstance(r, list) and all(x.get("status") == "ACTIVE_HEALTHY" for x in r) and dt_ < limite_s
    print(f"   /health do Treino: {st} {[(x.get('name'), x.get('status')) for x in (r or [])] if isinstance(r, list) else r} em {dt_:.1f} s", flush=True)
    return ok
