#!/usr/bin/env python3
"""Physiq play-W6 — os testes do simulador da Google Play (e2e/playw6/simulador_play.py): o OAuth da conta de serviço FALSA, a API (get,
acknowledge, cancel, defer, revoke), as mudanças de estado (renovar, carência, suspensão, pausa, devolução com e sem cortar o acesso, a troca
na hora e na renovação) e a Voided Purchases API (22/10/2026: a lista das devolvidas com o type, a janela e as páginas — a conferência de
hora em hora, no lugar do aviso do Google pelo Pub/Sub, que saiu junto com o JWKS e o push assinado). Tudo em 127.0.0.1, sem rede de fora.
Uso: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/playw6/test_simulador_play.py
"""
from __future__ import annotations

import json
import socket
import sys
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import simulador_play as SIM  # noqa: E402

from cryptography.hazmat.primitives import serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402

ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http(metodo: str, url: str, corpo=None, cab: dict | None = None, form: bool = False) -> tuple[int, object]:
    if form:
        dados = urllib.parse.urlencode(corpo).encode()
        h = {"Content-Type": "application/x-www-form-urlencoded"}
    else:
        dados = None if corpo is None else json.dumps(corpo).encode()
        h = {"Content-Type": "application/json"} if corpo is not None else {}
    h.update(cab or {})
    req = urllib.request.Request(url, data=dados, method=metodo, headers=h)
    try:
        with ABRIR.open(req, timeout=20) as r:
            txt = r.read()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        try:
            txt = e.read()
            return e.code, (json.loads(txt) if txt else None)
        finally:
            e.close()


class TesteSimulador(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.porta = porta_livre()
        cls.srv = SIM.criar_servidor(cls.porta)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.porta}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self) -> None:
        http("POST", f"{self.base}/_zerar", {})

    # ───── ajudantes ─────
    def acesso(self) -> str:
        conta = http("POST", f"{self.base}/_conta_servico", {})[1]
        chave = serialization.load_pem_private_key(conta["private_key"].encode(), password=None)
        t = int(time.time())
        assercao = SIM.assinar_jwt(chave, {"alg": "RS256", "typ": "JWT"}, {"iss": conta["client_email"], "scope": SIM.ESCOPO,
                                                                           "aud": conta["token_uri"], "iat": t, "exp": t + 3600})
        st, r = http("POST", f"{self.base}/token", {"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assercao}, form=True)
        self.assertEqual(st, 200)
        return r["access_token"]

    def api(self, metodo: str, caminho: str, corpo=None, acesso: str | None = None) -> tuple[int, object]:
        return http(metodo, f"{self.base}/androidpublisher/v3/applications/{SIM.PACOTE}/purchases{caminho}", corpo,
                    {"Authorization": f"Bearer {acesso or self.acesso()}"})

    def compra(self, **d) -> dict:
        st, r = http("POST", f"{self.base}/_compra", {"produto": "app_treino", "conta": "m1", **d})
        self.assertEqual(st, 200)
        return r

    # ───── o OAuth ─────
    def test_oauth_confere_a_assinatura_o_emissor_e_o_escopo(self) -> None:
        self.assertTrue(self.acesso().startswith("simacc-"))
        outra = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        t = int(time.time())
        forjada = SIM.assinar_jwt(outra, {"alg": "RS256"}, {"iss": SIM.CONTA_SERVICO_EMAIL, "scope": SIM.ESCOPO, "exp": t + 60})
        self.assertEqual(http("POST", f"{self.base}/token", {"assertion": forjada}, form=True)[0], 400)
        http("POST", f"{self.base}/_cenario", {"oauth_status": 400})
        st, r = http("POST", f"{self.base}/token", {"assertion": "x"}, form=True)
        self.assertEqual((st, r["error"]), (400, "invalid_grant"))

    # ───── a API ─────
    def test_get_sem_acesso_desconhecido_e_o_formato_v2(self) -> None:
        c = self.compra()
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso="x")[0], 401)
        st, r = self.api("GET", "/subscriptionsv2/tokens/nao-existe")
        self.assertEqual((st, r["error"]["errors"][0]["reason"]), (404, "purchaseTokenNotFound"))
        st, v = self.api("GET", f"/subscriptionsv2/tokens/{c['token']}")
        self.assertEqual(st, 200)
        self.assertEqual(v["subscriptionState"], "SUBSCRIPTION_STATE_ACTIVE")
        self.assertEqual(v["externalAccountIdentifiers"], {"obfuscatedExternalAccountId": "m1"})
        self.assertEqual(v["acknowledgementState"], "ACKNOWLEDGEMENT_STATE_PENDING")
        linha = v["lineItems"][0]
        self.assertEqual((linha["productId"], linha["offerDetails"]["basePlanId"], linha["latestSuccessfulOrderId"]), ("app_treino", "mensal", c["pedido"]))
        self.assertEqual(linha["autoRenewingPlan"]["recurringPrice"], {"currencyCode": "BRL", "units": "20", "nanos": 0})
        self.assertTrue(v["etag"])
        # o pedido nunca leva o token
        pedidos = http("GET", f"{self.base}/_pedidos")[1]["pedidos"]
        self.assertNotIn(c["token"], json.dumps(pedidos))

    def test_acknowledge_cancel_defer_revoke(self) -> None:
        c = self.compra()
        a = self.acesso()
        self.assertEqual(self.api("POST", f"/subscriptions/app_treino_alimentacao/tokens/{c['token']}:acknowledge", {}, a)[0], 400)
        self.assertEqual(self.api("POST", f"/subscriptions/app_treino/tokens/{c['token']}:acknowledge", {}, a)[0], 204)
        v = self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]
        self.assertEqual(v["acknowledgementState"], "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
        # o defer: etag certo + 1 dia a 1 ano; o etag velho → 409
        fim_antes = v["lineItems"][0]["expiryTime"]
        st, r = self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:defer", {"deferralContext": {"etag": v["etag"], "deferDuration": "518400s"}}, a)
        self.assertEqual(st, 200)
        self.assertGreater(r["itemExpiryTimeDetails"][0]["expiryTime"], fim_antes)
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:defer", {"deferralContext": {"etag": v["etag"], "deferDuration": "86400s"}}, a)[0], 409)
        v2 = self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:defer", {"deferralContext": {"etag": v2["etag"], "deferDuration": "3600s"}}, a)[0], 400)
        # o cancel (o tipo guardado) e o revoke
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:cancel", {"cancellationContext": {"cancellationType": "X"}}, a)[0], 400)
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:cancel",
                                  {"cancellationContext": {"cancellationType": "DEVELOPER_REQUESTED_STOP_PAYMENTS"}}, a)[0], 200)
        info = http("POST", f"{self.base}/_compra_info", {"token": c["token"]})[1]
        self.assertEqual((info["estado"], info["renova"], info["cancelamento"], info["adiada_dias"]),
                         ("SUBSCRIPTION_STATE_CANCELED", False, "DEVELOPER_REQUESTED_STOP_PAYMENTS", 6))
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:revoke", {"revocationContext": {"fullRefund": {}}}, a)[0], 200)
        self.assertTrue(http("POST", f"{self.base}/_compra_info", {"token": c["token"]})[1]["revogada"])

    def test_cenarios_do_google_fora(self) -> None:
        c = self.compra()
        a = self.acesso()
        http("POST", f"{self.base}/_cenario", {"get_status": 503, "cancelar_status": 503})
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[0], 503)
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:cancel",
                                  {"cancellationContext": {"cancellationType": "DEVELOPER_REQUESTED_STOP_PAYMENTS"}}, a)[0], 503)
        http("POST", f"{self.base}/_cenario", {})
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[0], 200)

    # ───── as mudanças de estado ─────
    def test_renovar_carencia_suspensao_e_devolucao(self) -> None:
        c = self.compra()
        a = self.acesso()
        r = http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "renovar"})[1]
        self.assertEqual(r["pedido"], f"{c['pedido']}..0")
        http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "carencia"})
        v = self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]
        self.assertEqual(v["subscriptionState"], "SUBSCRIPTION_STATE_IN_GRACE_PERIOD")
        self.assertEqual(v["lineItems"][0]["latestSuccessfulOrderId"], f"{c['pedido']}..0")   # o pago segue o de antes
        self.assertEqual(v["latestOrderId"], f"{c['pedido']}..1")                              # o recusado
        http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "suspender"})
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]["subscriptionState"], "SUBSCRIPTION_STATE_ON_HOLD")
        http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "pausar"})
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]["subscriptionState"], "SUBSCRIPTION_STATE_PAUSED")
        http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "recuperar"})
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]["subscriptionState"], "SUBSCRIPTION_STATE_ACTIVE")
        r = http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "devolver"})[1]
        self.assertEqual((r["estado"], r["pedido"]), ("SUBSCRIPTION_STATE_EXPIRED", f"{c['pedido']}..2"))

    def test_troca_na_hora_e_na_renovacao(self) -> None:
        a = self.acesso()
        t1 = self.compra()
        na_hora = self.compra(produto="app_treino_alimentacao", ligada=t1["token"], modo="na_hora")
        v = self.api("GET", f"/subscriptionsv2/tokens/{na_hora['token']}", acesso=a)[1]
        self.assertEqual((v["linkedPurchaseToken"], v["lineItems"][0]["productId"]), (t1["token"], "app_treino_alimentacao"))
        self.assertNotEqual(v["lineItems"][0]["latestSuccessfulOrderId"], t1["pedido"])
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{t1['token']}", acesso=a)[1]["subscriptionState"], "SUBSCRIPTION_STATE_EXPIRED")
        depois = self.compra(produto="app_treino", ligada=na_hora["token"], modo="na_renovacao")
        # o DEFERRED da doc: 2 linhas — a do produto atual COM expiryTime + deferredItemReplacement e a do novo SEM expiryTime — nas 2 ordens
        for nova_primeiro in (False, True):
            http("POST", f"{self.base}/_cenario", {"deferred_nova_primeiro": nova_primeiro})
            v = self.api("GET", f"/subscriptionsv2/tokens/{depois['token']}", acesso=a)[1]
            linhas = {li["productId"]: li for li in v["lineItems"]}
            self.assertEqual(len(v["lineItems"]), 2)
            self.assertEqual(v["lineItems"][0]["productId"], "app_treino" if nova_primeiro else "app_treino_alimentacao")
            self.assertEqual(linhas["app_treino_alimentacao"]["deferredItemReplacement"]["productId"], "app_treino")
            self.assertIn("expiryTime", linhas["app_treino_alimentacao"])
            self.assertNotIn("expiryTime", linhas["app_treino"])
        http("POST", f"{self.base}/_cenario", {})
        http("POST", f"{self.base}/_mudar", {"token": depois["token"], "acao": "renovar"})
        v = self.api("GET", f"/subscriptionsv2/tokens/{depois['token']}", acesso=a)[1]
        self.assertEqual([li["productId"] for li in v["lineItems"]], ["app_treino"])
        self.assertIn("expiryTime", v["lineItems"][0])

    def test_o_get_que_falha_logo_depois_do_defer(self) -> None:
        c = self.compra()
        a = self.acesso()
        http("POST", f"{self.base}/_cenario", {"falhas_get_pos_defer": 1})
        v = self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[1]
        self.assertEqual(self.api("POST", f"/subscriptionsv2/tokens/{c['token']}:defer", {"deferralContext": {"etag": v["etag"], "deferDuration": "172800s"}}, a)[0], 200)
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[0], 503)   # o 1º GET depois do defer cai
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{c['token']}", acesso=a)[0], 200)   # o seguinte volta
        info = http("POST", f"{self.base}/_compra_info", {"token": c["token"]})[1]
        self.assertEqual((info["adiada_dias"], info["adiamentos"]), (2, 1))
        http("POST", f"{self.base}/_cenario", {})

    # ───── a Voided Purchases API (a conferência de hora em hora, 22/10/2026) ─────
    def voided(self, acesso: str | None = None, **q) -> tuple[int, object]:
        consulta = "&".join(f"{k}={v}" for k, v in q.items())
        return http("GET", f"{self.base}/androidpublisher/v3/applications/{SIM.PACOTE}/purchases/voidedpurchases?{consulta}", None,
                    {"Authorization": f"Bearer {acesso or self.acesso()}"})

    def test_devolvidas_pela_voided_purchases_api(self) -> None:
        a = self.acesso()
        agora_ms = int(time.time() * 1000)
        c1 = self.compra()
        renovado = http("POST", f"{self.base}/_mudar", {"token": c1["token"], "acao": "renovar"})[1]["pedido"]
        # a devolução de um pedido SEM cortar o acesso: o pedido entra na lista; a assinatura segue ativa
        r = http("POST", f"{self.base}/_mudar", {"token": c1["token"], "acao": "devolver_sem_revogar"})[1]
        self.assertEqual((r["estado"], r["pedido"]), ("SUBSCRIPTION_STATE_ACTIVE", renovado))
        c2 = self.compra()
        http("POST", f"{self.base}/_mudar", {"token": c2["token"], "acao": "devolver"})
        st, v = self.voided(a, startTime=agora_ms - 3_600_000, endTime=agora_ms + 60_000, type=1)
        self.assertEqual(st, 200)
        self.assertEqual([(x["purchaseToken"], x["orderId"]) for x in v["voidedPurchases"]], [(c1["token"], renovado), (c2["token"], c2["pedido"])])
        x = v["voidedPurchases"][0]
        self.assertEqual((x["kind"], x["voidedSource"], x["voidedReason"]), ("androidpublisher#voidedPurchase", 1, 1))
        self.assertTrue(x["voidedTimeMillis"].isdigit() and x["purchaseTimeMillis"].isdigit())
        self.assertNotIn("tokenPagination", v)
        # sem type=1 (o padrão, 0): só os produtos avulsos — nenhum aqui
        self.assertNotIn("voidedPurchases", self.voided(a, startTime=agora_ms - 3_600_000, endTime=agora_ms + 60_000)[1])
        self.assertNotIn("voidedPurchases", self.voided(a, startTime=agora_ms - 3_600_000, endTime=agora_ms + 60_000, type=0)[1])
        # a janela: o que o Google VIU antes do startTime fica de fora
        self.assertNotIn("voidedPurchases", self.voided(a, startTime=int(time.time() * 1000) + 1, endTime=int(time.time() * 1000) + 60_000, type=1)[1])
        # o teto da API: o startTime de mais de 30 dias → 400
        self.assertEqual(self.voided(a, startTime=agora_ms - 31 * 86_400_000, endTime=agora_ms, type=1)[0], 400)
        # as páginas (o nextPageToken)
        http("POST", f"{self.base}/_cenario", {"voided_por_pagina": 1})
        st, p1 = self.voided(a, startTime=agora_ms - 3_600_000, endTime=agora_ms + 60_000, type=1)
        self.assertEqual((st, len(p1["voidedPurchases"])), (200, 1))
        st, p2 = self.voided(a, startTime=agora_ms - 3_600_000, endTime=agora_ms + 60_000, type=1, token=p1["tokenPagination"]["nextPageToken"])
        self.assertEqual([x["purchaseToken"] for x in p2["voidedPurchases"]], [c2["token"]])
        self.assertNotIn("tokenPagination", p2)
        # o Google fora e sem o acesso
        http("POST", f"{self.base}/_cenario", {"voided_status": 503})
        self.assertEqual(self.voided(a, type=1)[0], 503)
        http("POST", f"{self.base}/_cenario", {})
        self.assertEqual(self.voided("x", type=1)[0], 401)
        # o registro do simulador: o type, a janela (segundos) e quantas — nunca o token nem o pedido
        pedidos = [x for x in http("GET", f"{self.base}/_pedidos")[1]["pedidos"] if x["acao"] == "voided"]
        self.assertEqual(pedidos[0]["type"], "1")
        self.assertEqual(pedidos[0]["n"], 2)
        self.assertEqual(pedidos[0]["inicio_s"], (agora_ms - 3_600_000) // 1000)
        self.assertNotIn(c1["token"], json.dumps(pedidos))
        self.assertNotIn(renovado, json.dumps(pedidos))


if __name__ == "__main__":
    unittest.main()
