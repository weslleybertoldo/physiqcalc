#!/usr/bin/env python3
"""Physiq play-W6 — os testes do simulador da Google Play (e2e/playw6/simulador_play.py): o OAuth da conta de serviço FALSA, a API (get,
acknowledge, cancel, defer, revoke), as mudanças de estado (renovar, carência, suspensão, devolução, a troca na hora e na renovação), o
JWKS e o push ASSINADO (a assinatura confere com o JWKS; os forjados não). Tudo em 127.0.0.1, sem rede de fora.
Uso: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/playw6/test_simulador_play.py
"""
from __future__ import annotations

import base64
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


def publica_do_jwk(jwk: dict):
    n = int.from_bytes(SIM.de64u(jwk["n"]), "big")
    e = int.from_bytes(SIM.de64u(jwk["e"]), "big")
    return rsa.RSAPublicNumbers(e, n).public_key()


class Recebedor:
    """Um servidor local que guarda os avisos que chegam (o lugar da play-rtdn) e responde com o status pedido."""

    def __init__(self) -> None:
        self.recebidos: list[dict] = []
        self.status = 204
        dono = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *_a) -> None:
                return

            def do_POST(self) -> None:  # noqa: N802
                n = int(self.headers.get("Content-Length") or 0)
                dono.recebidos.append({"auth": self.headers.get("Authorization"), "corpo": json.loads(self.rfile.read(n) or b"{}")})
                self.send_response(dono.status)
                self.send_header("Content-Length", "0")
                self.end_headers()

        self.porta = porta_livre()
        self.srv = ThreadingHTTPServer(("127.0.0.1", self.porta), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def fechar(self) -> None:
        self.srv.shutdown()
        self.srv.server_close()


class TesteSimulador(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.porta = porta_livre()
        cls.srv = SIM.criar_servidor(cls.porta)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.porta}"
        cls.rec = Recebedor()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.rec.fechar()

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
        self.assertEqual(linha["autoRenewingPlan"]["recurringPrice"], {"currencyCode": "BRL", "units": "29", "nanos": 900000000})
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
        r = http("POST", f"{self.base}/_mudar", {"token": c["token"], "acao": "devolver"})[1]
        self.assertEqual((r["estado"], r["pedido"]), ("SUBSCRIPTION_STATE_EXPIRED", f"{c['pedido']}..0"))

    def test_troca_na_hora_e_na_renovacao(self) -> None:
        a = self.acesso()
        t1 = self.compra()
        na_hora = self.compra(produto="app_treino_alimentacao", ligada=t1["token"], modo="na_hora")
        v = self.api("GET", f"/subscriptionsv2/tokens/{na_hora['token']}", acesso=a)[1]
        self.assertEqual((v["linkedPurchaseToken"], v["lineItems"][0]["productId"]), (t1["token"], "app_treino_alimentacao"))
        self.assertNotEqual(v["lineItems"][0]["latestSuccessfulOrderId"], t1["pedido"])
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{t1['token']}", acesso=a)[1]["subscriptionState"], "SUBSCRIPTION_STATE_EXPIRED")
        depois = self.compra(produto="app_treino", ligada=na_hora["token"], modo="na_renovacao")
        v = self.api("GET", f"/subscriptionsv2/tokens/{depois['token']}", acesso=a)[1]
        linha = v["lineItems"][0]
        self.assertEqual((linha["productId"], linha["deferredItemReplacement"]["productId"]), ("app_treino_alimentacao", "app_treino"))
        http("POST", f"{self.base}/_mudar", {"token": depois["token"], "acao": "renovar"})
        self.assertEqual(self.api("GET", f"/subscriptionsv2/tokens/{depois['token']}", acesso=a)[1]["lineItems"][0]["productId"], "app_treino")

    # ───── o JWKS e o push assinado ─────
    def test_push_valido_assinado_e_os_forjados(self) -> None:
        jwks = http("GET", f"{self.base}/jwks")[1]
        publica = publica_do_jwk(jwks["keys"][0])
        url = f"http://127.0.0.1:{self.rec.porta}/play-rtdn"
        c = self.compra()
        self.rec.recebidos.clear()
        st, r = http("POST", f"{self.base}/_push", {"url": url, "tipo": "assinatura", "notificacao": 2, "token": c["token"]})
        self.assertEqual((st, r["status"]), (200, 204))
        rec = self.rec.recebidos[-1]
        claims = SIM.conferir_jwt(publica, rec["auth"][7:])
        self.assertEqual((claims["iss"], claims["aud"], claims["email"], claims["email_verified"]),
                         (SIM.EMISSOR, SIM.AUDIENCIA_PADRAO, SIM.CONTA_PUSH_PADRAO, True))
        aviso = json.loads(base64.b64decode(rec["corpo"]["message"]["data"]))
        self.assertEqual(aviso["packageName"], SIM.PACOTE)
        self.assertEqual(aviso["subscriptionNotification"], {"version": "1.0", "notificationType": 2, "purchaseToken": c["token"]})
        # o forjado não confere com o JWKS; o ausente não tem o cabeçalho; aud/email/expirado vêm assinados certo, com a claim errada
        http("POST", f"{self.base}/_push", {"url": url, "oidc": "forjado", "token": c["token"]})
        self.assertIsNone(SIM.conferir_jwt(publica, self.rec.recebidos[-1]["auth"][7:]))
        http("POST", f"{self.base}/_push", {"url": url, "oidc": "ausente", "token": c["token"]})
        self.assertIsNone(self.rec.recebidos[-1]["auth"])
        for modo, chave, valor in (("aud", "aud", "https://outra.audiencia.example/fn"), ("email", "email", "outra-conta@physiq-br.iam.gserviceaccount.com"),
                                   ("nao_verificado", "email_verified", False)):
            http("POST", f"{self.base}/_push", {"url": url, "oidc": modo, "token": c["token"]})
            self.assertEqual(SIM.conferir_jwt(publica, self.rec.recebidos[-1]["auth"][7:])[chave], valor)
        http("POST", f"{self.base}/_push", {"url": url, "oidc": "expirado", "token": c["token"]})
        self.assertLess(SIM.conferir_jwt(publica, self.rec.recebidos[-1]["auth"][7:])["exp"], time.time())
        # a devolução, o de teste e o id repetido
        http("POST", f"{self.base}/_push", {"url": url, "tipo": "devolucao", "token": c["token"], "pedido": c["pedido"], "repetir_id": "777"})
        corpo = self.rec.recebidos[-1]["corpo"]
        self.assertEqual(corpo["message"]["messageId"], "777")
        self.assertEqual(json.loads(base64.b64decode(corpo["message"]["data"]))["voidedPurchaseNotification"]["orderId"], c["pedido"])
        http("POST", f"{self.base}/_push", {"url": url, "tipo": "teste"})
        self.assertIn("testNotification", json.loads(base64.b64decode(self.rec.recebidos[-1]["corpo"]["message"]["data"])))
        # só para 127.0.0.1
        self.assertEqual(http("POST", f"{self.base}/_push", {"url": "https://example.com/x"})[0], 400)


if __name__ == "__main__":
    unittest.main()
