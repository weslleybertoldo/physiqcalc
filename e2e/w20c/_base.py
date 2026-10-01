"""Physiq W20c — base dos testes de ponta a ponta do push no celular (FCM). Reaproveita a base da W20 (a "Consultoria Ferreira
W13": Lucas dono + personal, Camila nutricionista, Rafael Moura aluno com login; a massa da agenda no staging).

Só contas *.teste.claude@… (P26) e tokens FALSOS: nenhum push chega a aparelho nenhum (o FCM recusa o token falso — é isso que
o teste confere) e nenhum e-mail/WhatsApp a pessoa real. Sem segredo no repo: chaves pela Management API (~/.pc-pat), o
PUSH_SEGREDO em ~/.physiq-push-segredo, senhas das contas de TESTE em ~/.physiq-teste-<nome>.
"""
from __future__ import annotations

import importlib.util
import json
import secrets
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w20", Path(__file__).parent.parent / "w20" / "_base.py")
B20 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w20"] = B20
_ESPEC.loader.exec_module(B20)  # type: ignore[union-attr]
B19, B13, B5 = B20.B19, B20.B13, B20.B5

p = B20.p
ESTADO, CONTAS = B20.ESTADO, B20.CONTAS
sql_principal, http, anon, token, sessao, esperar, saude_ok = B20.sql_principal, B20.http, B20.anon, B20.token, B20.sessao, B20.esperar, B20.saude_ok
PRINCIPAL_REF, PRINCIPAL_URL, rpc_como, q, sp, hoje = B20.PRINCIPAL_REF, B20.PRINCIPAL_URL, B20.rpc_como, B20.q, B20.sp, B20.hoje

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w20c"
for _b in (B20, B19, B19.B18, B19.B17, B19.B16, B19.B15, B19.B14, B13, B5, B13.B12, B13.B12.B11, B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "w20c"
PONTE = (Path(__file__).parent / "ponte_android.js").read_text(encoding="utf-8")
FUNCAO = f"{PRINCIPAL_URL}/functions/v1/push-enviar"
MASSA_W20 = Path.home() / "projetos" / "physiqcalc-scratch" / "w20" / "massa_staging.json"


def schema() -> str:
    return ESTADO["schema"]


def token_falso(rotulo: str) -> str:
    """Um token com a cara do FCM e que não existe lá (o FCM responde UNREGISTERED/INVALID_ARGUMENT)."""
    return f"e2e-w20c-{rotulo}-{secrets.token_hex(6)}:APA91bTokenFalsoDoTesteW20c{secrets.token_hex(8)}"


def uid_de(conta: str) -> str:
    return sql_principal(f"select id::text as id from auth.users where lower(email) = {q(CONTAS[conta][0])}")[0]["id"]


def aparelhos_de(user_id: str) -> list[dict]:
    return sql_principal(f"select token, plataforma, versao_app, atualizado_em from {schema()}.push_aparelhos where user_id = {q(user_id)} order by atualizado_em desc")


def aparelho(token_: str) -> dict | None:
    r = sql_principal(f"select user_id::text as user_id, plataforma, versao_app from {schema()}.push_aparelhos where token = {q(token_)}")
    return r[0] if r else None


def envio(aviso_id: str) -> dict | None:
    r = sql_principal(f"select aparelhos, enviados, recusados, falhas, resultado, concluido_em from {schema()}.push_envios where aviso_id = {q(aviso_id)}")
    return r[0] if r else None


def esperar_envio(aviso_id: str, timeout: float = 45) -> dict | None:
    return esperar(lambda: (e := envio(aviso_id)) and e.get("concluido_em") and e, timeout, passo=1.5)


def chamar_funcao(corpo: dict, segredo: str | None = None, sch: str | None = None) -> tuple[int, object]:
    seg = segredo if segredo is not None else Path.home().joinpath(".physiq-push-segredo").read_text(encoding="utf-8").strip()
    cab = {"x-schema": sch or schema()}
    if seg:
        cab["x-push-segredo"] = seg
    st, r, _ = http("POST", FUNCAO, corpo, cab, timeout=90)
    return st, r


def resposta_pg_net(desde_iso: str) -> list[dict]:
    """As respostas da push-enviar ao pg_net desde um instante (a função responde o resumo do envio)."""
    return sql_principal(f"""select status_code, left(content, 300) as corpo, created from net._http_response
                              where created >= {q(desde_iso)} order by created""")


def rest_como(conta: str, metodo: str, tabela: str, filtro: str = "", corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    S = schema()
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}/rest/v1/{tabela}{('?' + filtro) if filtro else ''}", corpo,
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token(conta)}", "Content-Profile": S, "Accept-Profile": S, "Prefer": prefer},
                    timeout=90)
    return st, r


def massa_w20() -> dict:
    return json.loads(MASSA_W20.read_text(encoding="utf-8"))


def agora_iso() -> str:
    return sql_principal("select now()::text as t")[0]["t"]


def pausa(s: float = 1.5) -> None:
    time.sleep(s)
