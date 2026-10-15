#!/usr/bin/env python3
"""Physiq W2 — SIMULADOR LOCAL do Mercado Pago (só para o e2e/w2/api.py --local). Escuta só em 127.0.0.1. Nada aqui é o MP de verdade.
  GET  /authorization          → 302 <redirect_uri>?code=TG-sim-…&state=<state> (o code guarda o client, o redirect, o code_challenge e o
                                  vendedor que "entrou" — o do cenário); cenário "negar" → ?error=access_denied&state=…
  POST /oauth/token            → authorization_code: confere client_id/secret, o code (uso único, 10 min), o redirect IGUAL ao da autorização e
                                  o PKCE S256 (verifier → challenge) → {access_token TEST-sim-…, token_type, expires_in, scope "offline_access
                                  read write", user_id <vendedor>, refresh_token TG-sim-…, public_key (o cenário "sem_public_key" tira),
                                  live_mode}; refresh_token: o refresh vivo → par NOVO e o velho MORRE (gira); senão 400 invalid_grant;
                                  cenários "troca_status"/"renovar_status" (400/500); "renovar_formato" (2xx sem access_token, com refresh — MENOR 13)
  GET  /users/me               → {id, nickname} do token vivo; token morto (ou desconhecido) → 401; cenário "users_me_status" (500…) → esse
                                  status para o token de um VENDEDOR, vivo ou morto (o MP sem resposta que decida no meio do 401 — o caso
                                  post_sem_decisao; o /users/me do token do Physiq não muda)
  POST /v1/payments            → pagamento do vendedor do token (collector_id), Pix (qr) ou cartão (approved/rejected pelo cenário ou pelo nome
                                  do card token: OTHE → rejected, CONT → in_process); live_mode pelo cenário (MENOR 20); "pix_sem_chave" → o 400
                                  "Collector user without key enabled for QR render" (decisão 16); o /_pedidos leva o id criado (recurso_id)
  GET  /v1/payments/<id>       → o pagamento (collector_id, external_reference, live_mode, status); token de OUTRO vendedor → 404, ou 401 com
                                  o cenário "alheio_401" (o MP de verdade pode fazer assim — I2: o /users/me desse token segue 200); o pagamento
                                  criado pelo /_pagamento com "visivel" é lido por qualquer token (o furo que o C1 confere pelo collector)
  PUT  /v1/payments/<id>       → cancelled · POST /v1/payments/<id>/refunds → refunded
  POST /preapproval · GET|PUT /preapproval/<id> · GET /authorized_payments/<id> · GET /authorized_payments/search?preapproval_id= (a lista das
       cobranças da automática — I1; o cenário "cobranca_mensal" cria 1 cobrança APROVADA na automática SEM mandar aviso) · POST
       /checkout/preferences (Task 5). Cenários: "preapproval_cartao_sandbox" (o POST com card_token_id → o 404 "Card token service not found"
       do sandbox — MENOR 28) e "cancelar_preapproval_status" (o PUT {status: cancelled} recusado com esse status; nada muda — I11)
  POST /_cenario · GET /_pedidos (caminho, método, e o Authorization só como "token vivo/morto/outro" + o NOME do token: "physiq_teste",
       "conta_<vendedor>" — para conferir QUAL token foi em cada ação, MENOR 16 —, de quem é o recurso tocado, o status da resposta e o corpo
       SEM token nem segredo)
  POST /_avisar                → manda um aviso ao webhook local (POST <webhook>?schema=staging[&conta=<id>]&data.id=…&type=… com {type, action,
                                  data.id, user_id}; com o segredo, a x-signature "ts=…,v1=…" do manifesto "id:…;request-id:…;ts:…;") — os
                                  casos created/updated (I4) e sem conta (I1)
  cenário "expirar_token" → o access token atual do vendedor passa a dar 401 (o 401 da hora do uso; o refresh segue vivo)
  mp-cartao (15/10/2026): o /_pedidos diz SE veio o cabeçalho X-meli-session-id (`device`: true/false — nunca o valor) e o corpo sai com
  `number`, `first_name` e `last_name` mascarados (o documento e o nome do titular nunca vão ao /_pedidos); cenários "cartao_status_detail"
  (o cartão recusado com esse status_detail — ex.: cc_rejected_high_risk) e "preapproval_recusa" (o POST /preapproval com cartão → 400 com o
  código só na mensagem, sem error, cause nem status_detail — o retrato das automáticas recusadas de 14/10)
  Administração (só o e2e): /_zerar (tudo do começo) · /_token {vendedor} (um par vivo sem o OAuth — a integração gravada pelo e2e) ·
  /_expirar {vendedor, refresh?} · /_pagamento · /_preapproval · /_status {tipo, id, status} · /_cobranca_mensal {preapproval_id} ·
  /_token_info {token} (vivo? de quem?) — POST, sempre em 127.0.0.1.
O /_cenario troca SÓ as chaves do cenário (as que não vierem voltam ao padrão) — os tokens, os pagamentos, as automáticas e a lista de
pedidos FICAM (o --local confere no fim o token de cada ação da rodada inteira). As credenciais daqui são falsas e só valem aqui (o
client, o segredo, os tokens do Physiq e os dos vendedores).
Testes: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w2/test_simulador_mp.py   Uso: python3 e2e/w2/simulador_mp.py --porta 8798
"""
from __future__ import annotations

import argparse
import base64
import copy
import datetime as dt
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
# o client do OAuth do simulador (o MP_CLIENT_ID/MP_CLIENT_SECRET do Deno local) — falsos, só valem aqui
CLIENTE_ID = "7000000000000001"
CLIENTE_SEGREDO = "sim-segredo-do-client-0000000000000000"
# a conta do MP do PHYSIQ no simulador (o MP_ACCESS_TOKEN_TEST/_PROD do Deno local): o /users/me do token de teste devolve ID_PHYSIQ
TOKEN_PHYSIQ_TESTE = "TEST-1000000001-simulador-physiq-teste"
TOKEN_PHYSIQ_PROD = "APP_USR-1000000002-simulador-physiq-prod"
ID_PHYSIQ, ID_PHYSIQ_PROD = 1000000001, 1000000002
# os vendedores de teste do simulador (as contas do MP dos personais): A é o da conta do prof2; B e C, "outra conta do MP"
VENDEDOR_A, VENDEDOR_B, VENDEDOR_C = 9000000001, 9000000002, 9000000003
EXPIRA_S = 15_552_000          # 180 dias (a doc do /oauth/token)
CODE_S = 600                   # o code vale 10 min
OCULTO = "‹oculto›"
SENSIVEIS = {"access_token", "refresh_token", "client_secret", "code", "code_verifier", "token", "card_token", "card_token_id",
             "number", "first_name", "last_name"}   # mp-cartao: o documento e o nome do titular (o pagador do cartão)
CABECALHO_DEVICE = "X-meli-session-id"
PADRAO: dict = {"vendedor": VENDEDOR_A, "negar": False, "troca_status": None, "renovar_status": None, "renovar_formato": False,
                "sem_public_key": False, "sem_refresh": False, "live_mode": False, "alheio_401": False, "cartao_status": None,
                "pix_sem_chave": False, "preapproval_cartao_sandbox": False, "cancelar_preapproval_status": None, "users_me_status": None,
                "cartao_status_detail": None, "preapproval_recusa": None}
ACOES_DO_CENARIO = ("expirar_token", "cobranca_mensal")
CENARIO: dict = dict(PADRAO)
TRAVA = threading.RLock()


def agora() -> float:
    """O relógio do simulador (os testes trocam para provar o code vencido)."""
    return time.time()


def _iso(t: float | None = None) -> str:
    return dt.datetime.fromtimestamp(agora() if t is None else t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000-00:00")


def _estado_vazio() -> dict:
    return {"tokens": {}, "codigos": {}, "vendedores": {}, "pagamentos": {}, "preapprovals": {}, "autorizados": {}, "pedidos": [],
            "seq": {"par": 0, "pagamento": 70_000_000_000, "autorizado": 80_000_000_000, "refund": 60_000_000_000}, "physiq_morto": False}


ESTADO: dict = _estado_vazio()


def zerar() -> None:
    with TRAVA:
        ESTADO.clear()
        ESTADO.update(_estado_vazio())
        CENARIO.clear()
        CENARIO.update(PADRAO)


def chave_publica_de(vendedor: int) -> str:
    return f"TEST-{vendedor}-sim-chave-publica"


def vendedor(vid: int) -> dict:
    """O vendedor de teste (registrado na 1ª vez que aparece)."""
    vid = int(vid)
    with TRAVA:
        return ESTADO["vendedores"].setdefault(vid, {"id": vid, "nickname": f"SIMULADOR{vid}", "email": f"test_user_{vid}@testuser.com"})


def emitir_par(vid: int, teste: bool = True) -> dict:
    """Um par novo (access + refresh), vivos, do vendedor."""
    vendedor(vid)
    with TRAVA:
        ESTADO["seq"]["par"] += 1
        n = ESTADO["seq"]["par"]
        access = f"{'TEST' if teste else 'APP_USR'}-sim-{vid}-{n}-{secrets.token_hex(8)}"
        refresh = f"TG-sim-{vid}-{n}-{secrets.token_hex(8)}"
        ESTADO["tokens"][access] = {"vendedor": vid, "tipo": "access", "vivo": True, "par": n}
        ESTADO["tokens"][refresh] = {"vendedor": vid, "tipo": "refresh", "vivo": True, "par": n}
        return {"access": access, "refresh": refresh, "n": n}


def expirar(vid: int | None = None, refresh: bool = False, physiq: bool = False) -> int:
    """Os access tokens vivos do vendedor morrem (o 401 da hora do uso); com refresh, os refresh também. → quantos morreram."""
    n = 0
    with TRAVA:
        if physiq:
            ESTADO["physiq_morto"] = True
            n += 1
        for t in ESTADO["tokens"].values():
            if vid is not None and t["vendedor"] == int(vid) and t["vivo"] and (t["tipo"] == "access" or refresh):
                t["vivo"] = False
                n += 1
    return n


def quem_e(token: str | None) -> dict:
    """De quem é o token do Authorization: {estado: vivo|morto|outro|ausente, nome, de}."""
    if not token:
        return {"estado": "ausente", "nome": None, "de": None}
    with TRAVA:
        if token == TOKEN_PHYSIQ_TESTE:
            return {"estado": "morto" if ESTADO["physiq_morto"] else "vivo", "nome": "physiq_teste", "de": ID_PHYSIQ}
        if token == TOKEN_PHYSIQ_PROD:
            return {"estado": "vivo", "nome": "physiq_prod", "de": ID_PHYSIQ_PROD}
        t = ESTADO["tokens"].get(token)
        if not t or t["tipo"] != "access":
            return {"estado": "outro", "nome": None, "de": None}
        return {"estado": "vivo" if t["vivo"] else "morto", "nome": f"conta_{t['vendedor']}", "de": t["vendedor"]}


def limpo(obj):
    """O corpo sem token nem segredo (o /_pedidos é lido e impresso pelo e2e)."""
    if isinstance(obj, dict):
        return {k: (OCULTO if k in SENSIVEIS and v not in (None, "") else limpo(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [limpo(x) for x in obj]
    return obj


def desafio(verificador: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verificador.encode()).digest()).decode().rstrip("=")


def manifesto(data_id: str | None, request_id: str | None, ts: str) -> str:
    """O manifesto da x-signature (mp-conta-regras.ts › manifestoDaAssinatura): o id do aviso em minúsculas."""
    return f"{f'id:{data_id.lower()};' if data_id else ''}{f'request-id:{request_id};' if request_id else ''}ts:{ts};"


def assinar(segredo: str, data_id: str | None, request_id: str | None, ts: str) -> str:
    return hmac.new(segredo.encode(), manifesto(data_id, request_id, ts).encode(), hashlib.sha256).hexdigest()


# ───────────────────────── os recursos ─────────────────────────

def _novo_id(chave: str) -> int:
    with TRAVA:
        ESTADO["seq"][chave] += 1
        return ESTADO["seq"][chave]


def criar_pagamento(collector: int, corpo: dict, **extra) -> dict:
    """Um pagamento do collector (o vendedor do token ou o Physiq): Pix pendente com QR, ou cartão pelo cenário/nome do card token."""
    pid = _novo_id("pagamento")
    pix = corpo.get("payment_method_id") == "pix" or ("token" not in corpo and extra.get("status") is None)
    pay = {"id": pid, "collector_id": collector, "external_reference": corpo.get("external_reference"),
           "transaction_amount": corpo.get("transaction_amount"), "currency_id": "BRL", "description": corpo.get("description"),
           "payer": corpo.get("payer"), "notification_url": corpo.get("notification_url"), "date_created": _iso(),
           "installments": corpo.get("installments", 1), "metadata": corpo.get("metadata") or {}}
    if pix:
        pay.update(status="pending", status_detail="pending_waiting_transfer", payment_method_id="pix", payment_type_id="bank_transfer",
                   date_of_expiration=corpo.get("date_of_expiration") or _iso(agora() + 72 * 3600),
                   point_of_interaction={"type": "PIX", "transaction_data": {
                       "qr_code": f"00020126-sim-{pid}", "qr_code_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk",
                       "ticket_url": f"https://www.mercadopago.com.br/payments/{pid}/ticket"}})
    else:
        nome = str(corpo.get("token") or "")
        st = CENARIO["cartao_status"] or ("rejected" if "OTHE" in nome else "in_process" if "CONT" in nome else "approved")
        detalhe = {"approved": "accredited", "rejected": "cc_rejected_other_reason", "in_process": "pending_contingency"}.get(st, st)
        if CENARIO["cartao_status_detail"] and nome != "cobranca-mensal":   # mp-cartao: a recusa com o motivo pedido (ex.: o antifraude)
            st, detalhe = "rejected", str(CENARIO["cartao_status_detail"])
        pay.update(status=st, status_detail=detalhe, payment_method_id=corpo.get("payment_method_id") or "master",
                   payment_type_id="credit_card", card={"last_four_digits": "6351", "cardholder": {"name": "APRO"}})
        if st == "approved":
            pay["date_approved"] = _iso()
    if CENARIO["live_mode"] is not None:
        pay["live_mode"] = bool(CENARIO["live_mode"])
    for k in ("status", "status_detail", "visivel", "live_mode", "point_of_interaction"):
        if k in extra and extra[k] is not None:
            pay[k] = extra[k]
    if pay["status"] == "approved" and "date_approved" not in pay:
        pay["date_approved"] = _iso()
    with TRAVA:
        ESTADO["pagamentos"][str(pid)] = pay
    return pay


def criar_preapproval(collector: int, corpo: dict, status: str) -> dict:
    pre_id = "2c938084" + secrets.token_hex(12)
    ar = dict(corpo.get("auto_recurring") or {})
    proxima = ar.get("start_date") or _iso(agora() + 30 * 86_400)
    pre = {"id": pre_id, "status": status, "collector_id": collector, "reason": corpo.get("reason"),
           "external_reference": corpo.get("external_reference"), "payer_email": corpo.get("payer_email"),
           "auto_recurring": {**ar, "currency_id": ar.get("currency_id") or "BRL"}, "back_url": corpo.get("back_url"),
           "notification_url": corpo.get("notification_url"), "next_payment_date": proxima, "date_created": _iso(),
           "init_point": f"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id={pre_id}"}
    if CENARIO["live_mode"] is not None:
        pre["live_mode"] = bool(CENARIO["live_mode"])
    if corpo.get("visivel"):
        pre["visivel"] = True
    with TRAVA:
        ESTADO["preapprovals"][pre_id] = pre
    return pre


def cobranca_mensal(pre_id: str, status: str = "approved") -> dict:
    """A cobrança do mês da automática (o MP cobrou o cartão) — SEM aviso: só a busca das cobranças (I1) a acha."""
    with TRAVA:
        pre = ESTADO["preapprovals"].get(pre_id)
    if not pre:
        raise KeyError(pre_id)
    valor = (pre.get("auto_recurring") or {}).get("transaction_amount") or 10
    pay = criar_pagamento(pre["collector_id"], {"transaction_amount": valor, "external_reference": pre.get("external_reference"),
                                                "payment_method_id": "master", "token": "cobranca-mensal",
                                                "metadata": {"preapproval_id": pre_id}, "description": pre.get("reason")},
                          status=status, point_of_interaction={"transaction_data": {"subscription_id": pre_id}})
    ap_id = _novo_id("autorizado")
    ap = {"id": ap_id, "preapproval_id": pre_id, "type": "scheduled", "status": "processed", "date_created": _iso(),
          "transaction_amount": valor, "currency_id": "BRL", "collector_id": pre["collector_id"],
          "payment": {"id": pay["id"], "status": pay["status"], "status_detail": pay["status_detail"]}}
    with TRAVA:
        ESTADO["autorizados"][str(ap_id)] = ap
    return {"pagamento": pay, "autorizado": ap}


# ───────────────────────── o servidor ─────────────────────────

class Tratar(BaseHTTPRequestHandler):
    server_version = "SimuladorMP/1.0"

    def log_message(self, *_a) -> None:  # silêncio: nada de corpo nem token no terminal
        pass

    # ── as peças do pedido ──

    def _ler(self) -> tuple[dict | None, bool]:
        n = int(self.headers.get("Content-Length") or 0)
        bruto = self.rfile.read(n) if n else b""
        if not bruto:
            return {}, True
        tipo = (self.headers.get("Content-Type") or "").lower()
        if "application/x-www-form-urlencoded" in tipo:
            return {k: v[0] for k, v in urllib.parse.parse_qs(bruto.decode("utf-8", "replace")).items()}, True
        try:
            corpo = json.loads(bruto)
        except ValueError:
            return None, False
        return (corpo, True) if isinstance(corpo, dict) else (None, False)

    def _token(self) -> str | None:
        a = self.headers.get("Authorization") or ""
        return a[7:].strip() if a.startswith("Bearer ") else None

    def _registrar(self, status: int, recurso_de: int | None = None, extra: dict | None = None, corpo=None, caminho: str | None = None) -> None:
        if self.path.startswith("/_"):
            return
        q = quem_e(self._token())
        with TRAVA:
            ESTADO["pedidos"].append({
                "n": len(ESTADO["pedidos"]), "metodo": self.command, "caminho": caminho or self.path, "token": q["estado"],
                "token_nome": q["nome"], "token_de": q["de"], "recurso_de": recurso_de, "status": status,
                "corpo": limpo(corpo) if corpo is not None else None,
                "device": bool(self.headers.get(CABECALHO_DEVICE)),   # mp-cartao: SE veio o cabeçalho do aparelho (nunca o valor)
                **(extra or {})})

    def _json(self, status: int, corpo, recurso_de: int | None = None, extra: dict | None = None, pedido=None, caminho: str | None = None) -> None:
        self._registrar(status, recurso_de, extra, pedido, caminho)
        dados = json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def _redirecionar(self, destino: str, extra: dict) -> None:
        self._registrar(302, extra=extra, caminho=urllib.parse.urlsplit(self.path).path)
        self.send_response(302)
        self.send_header("Location", destino)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _vivo(self) -> dict | None:
        """O token do Authorization, se vivo; senão já respondeu 401."""
        q = quem_e(self._token())
        if q["estado"] != "vivo":
            self._json(401, {"message": "invalid access token", "error": "unauthorized", "status": 401})
            return None
        return q

    # ── GET ──

    def do_GET(self) -> None:  # noqa: N802
        u = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == "/_pedidos":
            desde = int((q.get("desde") or ["0"])[0] or 0)
            with TRAVA:
                return self._json(200, [p for p in ESTADO["pedidos"] if p["n"] >= desde])
        if u.path == "/_estado":
            with TRAVA:
                return self._json(200, {"pedidos": len(ESTADO["pedidos"]), "pagamentos": len(ESTADO["pagamentos"]),
                                        "preapprovals": len(ESTADO["preapprovals"]), "vendedores": sorted(ESTADO["vendedores"]),
                                        "cenario": dict(CENARIO)})
        if u.path == "/authorization":
            return self._autorizar({k: v[0] for k, v in q.items()})
        if u.path == "/users/me":
            dono = quem_e(self._token())
            if CENARIO["users_me_status"] and str(dono["nome"] or "").startswith("conta_"):
                st = int(CENARIO["users_me_status"])
                return self._json(st, {"message": "simulado: o MP sem resposta", "status": st}, recurso_de=dono["de"])
            quem = self._vivo()
            if not quem:
                return None
            if quem["de"] in (ID_PHYSIQ, ID_PHYSIQ_PROD):
                return self._json(200, {"id": quem["de"], "nickname": "PHYSIQSIMULADOR", "site_id": "MLB"}, recurso_de=quem["de"])
            v = vendedor(quem["de"])
            return self._json(200, {**v, "site_id": "MLB", "country_id": "BR"}, recurso_de=quem["de"])
        m = re.fullmatch(r"/v1/payments/(\d{1,20})", u.path)
        if m:
            return self._ler_recurso("pagamentos", m.group(1), "Payment not found")
        m = re.fullmatch(r"/preapproval/([A-Za-z0-9]{1,64})", u.path)
        if m:
            return self._ler_recurso("preapprovals", m.group(1), "The preapproval does not exist")
        if u.path == "/authorized_payments/search":
            return self._buscar_autorizados(q)
        m = re.fullmatch(r"/authorized_payments/(\d{1,20})", u.path)
        if m:
            return self._ler_recurso("autorizados", m.group(1), "Authorized payment not found")
        return self._json(404, {"message": "not_found"})

    def _ler_recurso(self, tabela: str, rid: str, sem: str) -> None:
        with TRAVA:
            r = copy.deepcopy(ESTADO[tabela].get(rid))
        dono = r.get("collector_id") if r else None
        quem = quem_e(self._token())
        if quem["estado"] != "vivo":
            return self._json(401, {"message": "invalid access token", "status": 401}, recurso_de=dono)
        if not r:
            return self._json(404, {"message": sem, "status": 404})
        if dono == quem["de"] or r.get("visivel"):
            r.pop("visivel", None)
            return self._json(200, r, recurso_de=dono)
        if CENARIO["alheio_401"]:
            return self._json(401, {"message": "unauthorized resource", "status": 401}, recurso_de=dono)
        return self._json(404, {"message": sem, "status": 404}, recurso_de=dono)

    def _buscar_autorizados(self, q: dict) -> None:
        pre_id = (q.get("preapproval_id") or [""])[0]
        limite = int((q.get("limit") or ["6"])[0] or 6)
        with TRAVA:
            pre = ESTADO["preapprovals"].get(pre_id)
            lista = sorted((copy.deepcopy(a) for a in ESTADO["autorizados"].values() if a["preapproval_id"] == pre_id),
                           key=lambda a: a["date_created"], reverse=True)
        dono = pre.get("collector_id") if pre else None
        quem = quem_e(self._token())
        if quem["estado"] != "vivo":
            return self._json(401, {"message": "invalid access token", "status": 401}, recurso_de=dono)
        if not pre or dono != quem["de"]:
            return self._json(404, {"message": "preapproval not found", "status": 404}, recurso_de=dono)
        for a in lista:
            a.pop("collector_id", None)
        return self._json(200, {"paging": {"offset": 0, "limit": limite, "total": len(lista)}, "results": lista[:limite]}, recurso_de=dono)

    def _autorizar(self, q: dict) -> None:
        redirect, estado = q.get("redirect_uri") or "", q.get("state") or ""
        resumo = {"consulta": {"client_ok": q.get("client_id") == CLIENTE_ID, "response_type": q.get("response_type"),
                               "platform_id": q.get("platform_id"), "redirect_uri": redirect,
                               "pkce": q.get("code_challenge_method") if q.get("code_challenge") else "sem", "state_tamanho": len(estado)}}
        if q.get("client_id") != CLIENTE_ID or not redirect or not estado:
            return self._json(400, {"message": "O aplicativo não está pronto para se conectar a Mercado Pago"}, extra=resumo,
                              caminho="/authorization")
        junta = "&" if "?" in redirect else "?"
        if CENARIO["negar"]:
            return self._redirecionar(f"{redirect}{junta}{urllib.parse.urlencode({'error': 'access_denied', 'state': estado})}", resumo)
        code = f"TG-sim-code-{secrets.token_hex(12)}"
        with TRAVA:
            ESTADO["codigos"][code] = {"client_id": q.get("client_id"), "redirect_uri": redirect, "desafio": q.get("code_challenge"),
                                       "metodo": q.get("code_challenge_method"), "vendedor": int(CENARIO["vendedor"]),
                                       "criado": agora(), "usado": False}
        vendedor(CENARIO["vendedor"])
        return self._redirecionar(f"{redirect}{junta}{urllib.parse.urlencode({'code': code, 'state': estado})}", resumo)

    # ── POST ──

    def do_POST(self) -> None:  # noqa: N802
        corpo, ok = self._ler()
        if not ok:
            return self._json(400, {"message": "json"})
        u = urllib.parse.urlsplit(self.path)
        admin = ADMIN.get(u.path)
        if admin:
            try:
                return self._json(*admin(corpo))
            except (KeyError, ValueError, TypeError) as e:
                return self._json(400, {"message": f"pedido inválido: {type(e).__name__}"})
        if u.path == "/oauth/token":
            return self._oauth(corpo)
        if u.path == "/v1/payments":
            return self._pagar(corpo)
        m = re.fullmatch(r"/v1/payments/(\d{1,20})/refunds", u.path)
        if m:
            return self._estornar(m.group(1), corpo)
        if u.path == "/preapproval":
            return self._assinar(corpo)
        if u.path == "/checkout/preferences":
            quem = self._vivo()
            if not quem:
                return None
            pref = f"{quem['de']}-{uuid.uuid4()}"
            return self._json(201, {"id": pref, "init_point": f"https://www.mercadopago.com.br/checkout/v1/redirect?pref_id={pref}",
                                    "sandbox_init_point": f"https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id={pref}",
                                    "external_reference": corpo.get("external_reference"), "notification_url": corpo.get("notification_url")},
                              recurso_de=quem["de"], pedido=corpo)
        return self._json(404, {"message": "not_found"})

    def _oauth(self, c: dict) -> None:
        tipo = c.get("grant_type")
        resumo = {"grant_type": tipo, "client_ok": c.get("client_id") == CLIENTE_ID and c.get("client_secret") == CLIENTE_SEGREDO}
        if not resumo["client_ok"]:
            return self._json(401, {"error": "invalid_client", "message": "invalid client"}, extra=resumo, pedido=c)
        if tipo == "authorization_code":
            with TRAVA:                                # o uso único: conferir e gastar o code numa vez só (2 trocas juntas → 1 passa)
                cod = ESTADO["codigos"].get(str(c.get("code") or ""))
                resumo |= {"redirect_ok": bool(cod) and cod["redirect_uri"] == c.get("redirect_uri"), "test_token": c.get("test_token")}
                if cod and cod["desafio"]:
                    verif = str(c.get("code_verifier") or "")
                    resumo["pkce"] = "ok" if verif and cod["metodo"] == "S256" and desafio(verif) == cod["desafio"] else "ruim"
                else:
                    resumo["pkce"] = "sem"
                recusa = int(CENARIO["troca_status"]) if CENARIO["troca_status"] else None
                valido = (recusa is None and bool(cod) and not cod["usado"] and agora() - cod["criado"] <= CODE_S and resumo["redirect_ok"]
                          and resumo["pkce"] != "ruim")
                if valido:
                    cod["usado"] = True
            if recusa:
                corpo = {"error": "invalid_grant", "message": "simulado"} if recusa < 500 else {"message": "internal_error", "status": recusa}
                return self._json(recusa, corpo, extra=resumo, pedido=c)
            if not valido:
                return self._json(400, {"error": "invalid_grant", "message": "invalid code"}, extra=resumo, pedido=c)
            par = emitir_par(cod["vendedor"], teste=str(c.get("test_token")) == "true")
            return self._json(200, self._resposta_token(cod["vendedor"], par), recurso_de=cod["vendedor"], extra=resumo, pedido=c)
        if tipo == "refresh_token":
            r = str(c.get("refresh_token") or "")
            with TRAVA:                                # o refresh GIRA: conferir e matar o usado numa vez só (o access de antes segue)
                t = ESTADO["tokens"].get(r)
                resumo["refresh"] = "vivo" if t and t["tipo"] == "refresh" and t["vivo"] else "morto"
                dono = t["vendedor"] if t else None
                recusa = int(CENARIO["renovar_status"]) if CENARIO["renovar_status"] else None
                if recusa is None and resumo["refresh"] == "vivo":
                    t["vivo"] = False
            if recusa:
                corpo = {"error": "invalid_grant", "message": "simulado"} if recusa < 500 else {"message": "internal_error", "status": recusa}
                return self._json(recusa, corpo, recurso_de=dono, extra=resumo, pedido=c)
            if resumo["refresh"] != "vivo":
                return self._json(400, {"error": "invalid_grant", "message": "invalid refresh_token"}, recurso_de=dono, extra=resumo, pedido=c)
            par = emitir_par(dono)
            if CENARIO["renovar_formato"]:
                with TRAVA:
                    ESTADO["tokens"][par["access"]]["vivo"] = False   # o access novo nem chegou a quem pediu
                return self._json(200, {"refresh_token": par["refresh"], "token_type": "bearer"}, recurso_de=dono, extra=resumo, pedido=c)
            return self._json(200, self._resposta_token(dono, par), recurso_de=dono, extra=resumo, pedido=c)
        return self._json(400, {"error": "unsupported_grant_type"}, extra=resumo, pedido=c)

    def _resposta_token(self, vid: int, par: dict) -> dict:
        r = {"access_token": par["access"], "token_type": "bearer", "expires_in": EXPIRA_S, "scope": "offline_access read write",
             "user_id": vid}
        if not CENARIO["sem_refresh"]:
            r["refresh_token"] = par["refresh"]
        if not CENARIO["sem_public_key"]:
            r["public_key"] = chave_publica_de(vid)
        if CENARIO["live_mode"] is not None:
            r["live_mode"] = bool(CENARIO["live_mode"])
        return r

    def _pagar(self, c: dict) -> None:
        quem = self._vivo()
        if not quem:
            return None
        if not isinstance(c.get("transaction_amount"), (int, float)) or c["transaction_amount"] <= 0:
            return self._json(400, {"message": "transaction_amount must be positive", "status": 400}, pedido=c)
        if c.get("payment_method_id") == "pix" and CENARIO["pix_sem_chave"] and quem["nome"] and quem["nome"].startswith("conta_"):
            return self._json(400, {"message": "Collector user without key enabled for QR render", "error": "bad_request", "status": 400},
                              recurso_de=quem["de"], pedido=c)
        pay = criar_pagamento(quem["de"], c)
        return self._json(201, pay, recurso_de=quem["de"], pedido=c, extra={"recurso_id": pay["id"]})

    def _estornar(self, pid: str, c: dict) -> None:
        with TRAVA:
            pay = ESTADO["pagamentos"].get(pid)
        dono = pay.get("collector_id") if pay else None
        quem = quem_e(self._token())
        if quem["estado"] != "vivo":
            return self._json(401, {"message": "invalid access token", "status": 401}, recurso_de=dono, pedido=c)
        if not pay or dono != quem["de"]:
            return self._json(404, {"message": "Payment not found", "status": 404}, recurso_de=dono, pedido=c)
        if pay["status"] != "approved":
            return self._json(400, {"message": "Payment not refundable", "status": 400}, recurso_de=dono, pedido=c)
        with TRAVA:
            pay["status"], pay["status_detail"] = "refunded", "refunded"
        rid = _novo_id("refund")
        return self._json(201, {"id": rid, "payment_id": int(pid), "amount": pay["transaction_amount"], "status": "approved"},
                          recurso_de=dono, pedido=c)

    def _assinar(self, c: dict) -> None:
        quem = self._vivo()
        if not quem:
            return None
        cartao = bool(c.get("card_token_id"))
        if cartao and CENARIO["preapproval_cartao_sandbox"]:
            return self._json(404, {"message": "Card token service not found", "status": 404}, recurso_de=quem["de"], pedido=c)
        if cartao and CENARIO["preapproval_recusa"]:   # mp-cartao: o 400 de 14/10 — o código só na mensagem
            return self._json(400, {"message": str(CENARIO["preapproval_recusa"]), "status": 400}, recurso_de=quem["de"], pedido=c)
        if not isinstance((c.get("auto_recurring") or {}).get("transaction_amount"), (int, float)):
            return self._json(400, {"message": "auto_recurring.transaction_amount is required", "status": 400}, pedido=c)
        pre = criar_preapproval(quem["de"], c, "authorized" if cartao else str(c.get("status") or "pending"))
        return self._json(201, pre, recurso_de=quem["de"], pedido=c, extra={"recurso_id": pre["id"]})

    # ── PUT ──

    def do_PUT(self) -> None:  # noqa: N802
        corpo, ok = self._ler()
        if not ok:
            return self._json(400, {"message": "json"})
        u = urllib.parse.urlsplit(self.path)
        m = re.fullmatch(r"/v1/payments/(\d{1,20})", u.path)
        if m:
            return self._mudar("pagamentos", m.group(1), corpo)
        m = re.fullmatch(r"/preapproval/([A-Za-z0-9]{1,64})", u.path)
        if m:
            return self._mudar("preapprovals", m.group(1), corpo)
        return self._json(404, {"message": "not_found"})

    def _mudar(self, tabela: str, rid: str, c: dict) -> None:
        with TRAVA:
            r = ESTADO[tabela].get(rid)
        dono = r.get("collector_id") if r else None
        quem = quem_e(self._token())
        if quem["estado"] != "vivo":
            return self._json(401, {"message": "invalid access token", "status": 401}, recurso_de=dono, pedido=c)
        if not r or dono != quem["de"]:
            if r and CENARIO["alheio_401"]:
                return self._json(401, {"message": "unauthorized resource", "status": 401}, recurso_de=dono, pedido=c)
            return self._json(404, {"message": "not found", "status": 404}, recurso_de=dono, pedido=c)
        if tabela == "pagamentos":
            if c.get("status") != "cancelled":
                return self._json(400, {"message": "only status cancelled", "status": 400}, recurso_de=dono, pedido=c)
            if r["status"] not in ("pending", "in_process", "cancelled"):
                return self._json(400, {"message": "Invalid status update", "status": 400}, recurso_de=dono, pedido=c)
            with TRAVA:
                r["status"], r["status_detail"] = "cancelled", "by_collector"
            return self._json(200, {k: v for k, v in r.items() if k != "visivel"}, recurso_de=dono, pedido=c)
        if c.get("status") == "cancelled":
            if CENARIO["cancelar_preapproval_status"]:
                st = int(CENARIO["cancelar_preapproval_status"])
                return self._json(st, {"message": "simulado: o cancelamento foi recusado", "status": st}, recurso_de=dono, pedido=c)
            with TRAVA:
                r["status"] = "cancelled"
        elif isinstance(c.get("auto_recurring"), dict):
            with TRAVA:
                r["auto_recurring"] = {**r.get("auto_recurring", {}), **c["auto_recurring"]}
        elif c.get("status") in ("paused", "authorized"):
            with TRAVA:
                r["status"] = c["status"]
        else:
            return self._json(400, {"message": "nothing to update", "status": 400}, recurso_de=dono, pedido=c)
        return self._json(200, {k: v for k, v in r.items() if k != "visivel"}, recurso_de=dono, pedido=c)


# ───────────────────────── a administração (só o e2e) ─────────────────────────

def _adm_cenario(c: dict) -> tuple[int, dict]:
    acoes = {k: c.pop(k) for k in ACOES_DO_CENARIO if k in c}
    desconhecidas = sorted(set(c) - set(PADRAO))
    if desconhecidas:
        return 400, {"message": f"cenário desconhecido: {', '.join(desconhecidas)}"}
    with TRAVA:
        CENARIO.clear()
        CENARIO.update({**PADRAO, **c})
    feito = {}
    if acoes.get("expirar_token") not in (None, False):
        v = CENARIO["vendedor"] if acoes["expirar_token"] is True else int(acoes["expirar_token"])
        feito["expirados"] = expirar(v)
    if acoes.get("cobranca_mensal"):
        feito["cobranca_mensal"] = cobranca_mensal(str(acoes["cobranca_mensal"]))
    vendedor(CENARIO["vendedor"])
    return 200, {**CENARIO, **feito}


def _adm_zerar(_c: dict) -> tuple[int, dict]:
    zerar()
    return 200, {"ok": True}


def _adm_token(c: dict) -> tuple[int, dict]:
    vid = int(c["vendedor"])
    par = emitir_par(vid, teste=c.get("teste", True) is not False)
    v = vendedor(vid)
    return 200, {"access_token": par["access"], "refresh_token": par["refresh"], "user_id": vid, "nickname": v["nickname"],
                 "public_key": chave_publica_de(vid)}


def _adm_expirar(c: dict) -> tuple[int, dict]:
    return 200, {"expirados": expirar(c.get("vendedor"), refresh=c.get("refresh") is True, physiq=c.get("physiq") is True)}


def _adm_pagamento(c: dict) -> tuple[int, dict]:
    corpo = {"transaction_amount": c.get("transaction_amount", 10), "external_reference": c.get("external_reference"),
             "payment_method_id": c.get("payment_method_id", "pix"), "description": c.get("description", "simulado"),
             "metadata": c.get("metadata") or ({"preapproval_id": c["preapproval_id"]} if c.get("preapproval_id") else {})}
    if corpo["payment_method_id"] != "pix":
        corpo["token"] = c.get("card_token", "sim-card-APRO")
    extra = {"status": c.get("status"), "visivel": True if c.get("visivel") else None}
    if "live_mode" in c:
        extra["live_mode"] = c["live_mode"]
    if c.get("preapproval_id"):
        extra["point_of_interaction"] = {"transaction_data": {"subscription_id": c["preapproval_id"]}}
    if c.get("status") and c["status"] != "pending" and corpo["payment_method_id"] == "pix":
        extra.setdefault("status_detail", "accredited" if c["status"] == "approved" else c["status"])
    return 201, criar_pagamento(int(c["collector_id"]), corpo, **extra)


def _adm_preapproval(c: dict) -> tuple[int, dict]:
    corpo = {"reason": c.get("reason", "Physiq — simulado"), "external_reference": c.get("external_reference"),
             "auto_recurring": {"frequency": 1, "frequency_type": "months", "transaction_amount": c.get("valor", 10), "currency_id": "BRL"},
             "visivel": c.get("visivel")}
    return 201, criar_preapproval(int(c["collector_id"]), corpo, str(c.get("status", "authorized")))


def _adm_status(c: dict) -> tuple[int, dict]:
    tabela = {"payment": "pagamentos", "preapproval": "preapprovals"}[c["tipo"]]
    with TRAVA:
        r = ESTADO[tabela][str(c["id"])]
        r["status"] = str(c["status"])
        if tabela == "pagamentos":
            r["status_detail"] = {"approved": "accredited", "cancelled": "by_collector", "rejected": "cc_rejected_other_reason"}.get(r["status"], r["status"])
            if r["status"] == "approved":
                r["date_approved"] = _iso()
        return 200, copy.deepcopy(r)


def _adm_cobranca_mensal(c: dict) -> tuple[int, dict]:
    return 201, cobranca_mensal(str(c["preapproval_id"]), str(c.get("status", "approved")))


def _adm_recurso(c: dict) -> tuple[int, dict]:
    """O recurso como o simulador guarda (o e2e confere o collector, a notification_url, o status) — sem passar por token."""
    tabela = {"payment": "pagamentos", "preapproval": "preapprovals", "authorized_payment": "autorizados"}[c["tipo"]]
    with TRAVA:
        r = ESTADO[tabela].get(str(c["id"]))
        return (200, copy.deepcopy(r)) if r else (404, {"message": "não existe"})


def _adm_token_info(c: dict) -> tuple[int, dict]:
    tok = str(c.get("token") or "")
    with TRAVA:
        t = ESTADO["tokens"].get(tok)
        if t:
            return 200, {"conhecido": True, "vivo": t["vivo"], "vendedor": t["vendedor"], "tipo": t["tipo"]}
    q = quem_e(tok)
    return 200, {"conhecido": q["nome"] is not None, "vivo": q["estado"] == "vivo", "vendedor": q["de"], "tipo": "access" if q["nome"] else None}


LOCAL_URL = re.compile(r"^http://127\.0\.0\.1:\d{2,5}(/[^?#]*)?$")


def _adm_avisar(c: dict) -> tuple[int, dict]:
    """Um aviso ao webhook LOCAL (só http://127.0.0.1:<porta>[/caminho]), como o MP manda: a busca com data.id e type, o corpo novo e, com o
    segredo, a x-signature. Fora da TRAVA: o webhook chama o simulador de volta."""
    destino = str(c["webhook"])
    if not LOCAL_URL.fullmatch(destino):
        return 400, {"message": "webhook só em http://127.0.0.1:<porta>"}
    tipo, rid = str(c["tipo"]), str(c["id"])
    busca = {"schema": c.get("schema", "staging")}
    if c.get("conta"):
        busca["conta"] = str(c["conta"])
    if c.get("query_id", True):
        busca |= {"data.id": rid, "type": tipo}
    corpo = {"action": c.get("acao") or ("application.deauthorized" if tipo == "mp-connect" else f"{tipo}.updated"), "api_version": "v1",
             "data": {"id": rid}, "date_created": _iso(), "id": int(time.time() * 1000) % 10**12, "live_mode": False, "type": tipo}
    if c.get("user_id") is not None:
        corpo["user_id"] = int(c["user_id"])
    rid_pedido = str(c.get("request_id") or uuid.uuid4())
    cab = {"Content-Type": "application/json", "x-request-id": rid_pedido}
    if c.get("segredo"):
        ts = str(int(time.time() * 1000))
        cab["x-signature"] = f"ts={ts},v1={assinar(str(c['segredo']), busca.get('data.id'), rid_pedido, ts)}"
    if c.get("ip"):
        cab["X-Forwarded-For"] = str(c["ip"])
    req = urllib.request.Request(f"{destino}?{urllib.parse.urlencode(busca)}", data=json.dumps(corpo).encode(), method="POST", headers=cab)
    abrir = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def ler_json(texto: bytes):
        try:
            return json.loads(texto or b"null")
        except ValueError:
            return texto.decode("utf-8", "replace")[:200]

    try:
        with abrir.open(req, timeout=float(c.get("tempo", 30))) as r:
            return 200, {"status": r.status, "corpo": ler_json(r.read())}
    except urllib.error.HTTPError as e:
        try:
            return 200, {"status": e.code, "corpo": ler_json(e.read())}
        finally:
            e.close()
    except (urllib.error.URLError, OSError) as e:
        return 200, {"status": 599, "corpo": {"erro": type(e).__name__}}


ADMIN = {"/_cenario": _adm_cenario, "/_zerar": _adm_zerar, "/_token": _adm_token, "/_expirar": _adm_expirar, "/_pagamento": _adm_pagamento,
         "/_preapproval": _adm_preapproval, "/_status": _adm_status, "/_cobranca_mensal": _adm_cobranca_mensal,
         "/_token_info": _adm_token_info, "/_recurso": _adm_recurso, "/_avisar": _adm_avisar}


def servidor(porta: int) -> ThreadingHTTPServer:
    """O servidor só em 127.0.0.1 (porta 0 = uma livre — os testes)."""
    s = ThreadingHTTPServer((HOST, porta), Tratar)
    s.daemon_threads = True
    return s


def main() -> None:
    ap = argparse.ArgumentParser(description="Simulador local do Mercado Pago (W2) — só 127.0.0.1")
    ap.add_argument("--porta", type=int, default=8798)
    a = ap.parse_args()
    servidor(a.porta).serve_forever()


if __name__ == "__main__":
    main()
