#!/usr/bin/env python3
"""Physiq play-W6 — SIMULADOR LOCAL da Google Play (só para o e2e/playw6/api.py --local). Escuta só em 127.0.0.1. Nada aqui é o Google de
verdade: a conta de serviço, a chave do OIDC, os tokens de compra e os pedidos são FALSOS e só valem aqui.

  POST /token          o OAuth da conta de serviço (grant jwt-bearer): confere a asserção RS256 com a chave pública da conta de serviço FALSA
                       do simulador, o iss (o client_email), o scope (androidpublisher) e o prazo → {access_token, expires_in, token_type};
                       cenário "oauth_status" (ex.: 400 invalid_grant)
  GET  /androidpublisher/v3/applications/<pacote>/purchases/subscriptionsv2/tokens/<token>
                       o SubscriptionPurchaseV2 (o estado, a linha com o produto, o fim, a renovação, o preço e o último pedido pago; o dono
                       opaco; a ligação; o teste; o reconhecimento; o etag); desconhecido ou de outro pacote → 404 purchaseTokenNotFound;
                       cenário "get_status" (ex.: 503)
  POST …/purchases/subscriptions/<produto>/tokens/<token>:acknowledge     reconhece (204); o produto que não é o da compra → 400
  POST …/subscriptionsv2/tokens/<token>:cancel   {cancellationContext: {cancellationType}} → CANCELED, renova false (guarda o tipo);
                       cenário "cancelar_status" (ex.: 503: o Google fora — a exclusão responde 502 e nada apaga)
  POST …/subscriptionsv2/tokens/<token>:defer    {deferralContext: {etag, deferDuration}} → o fim + a duração (de 1 dia a 1 ano), etag novo;
                       o etag velho → 409; fora de 1 dia..1 ano → 400
  POST …/subscriptionsv2/tokens/<token>:revoke   {revocationContext: {fullRefund|proratedRefund}} → EXPIRED na hora (revogada)
  GET  /jwks           as chaves públicas do OIDC do push (o JWKS do Google no lugar — PLAY_OIDC_JWKS do Deno local)
  Administração (só o e2e — POST, 127.0.0.1):
    /_zerar · /_conta_servico (o JSON da conta de serviço FALSA → o PLAY_SERVICE_ACCOUNT do Deno local; a chave é desta execução)
    /_compra {produto, conta?, estado?, teste?, ligada?, modo?, dias?, preco?} → {token, pedido} (com `ligada` + `modo`, a TROCA: na_hora =
             o produto novo já vale, mesmo fim, pedido novo; na_renovacao = o atual segue até renovar, com a troca marcada)
    /_mudar {token, acao}  renovar · carencia · suspender · pausar · recuperar · expirar · cancelar_usuario · reativar · devolver (devolve o
             último pedido e revoga) → {estado, pedido?}
    /_push {url, tipo: assinatura|devolucao|teste|outro, notificacao?, token?, pedido?, pacote?, oidc: valido|ausente|forjado|aud|email|
            nao_verificado|expirado|kid, audiencia?, conta?, repetir_id?} → {status} (o aviso do Pub/Sub, ASSINADO com a chave do simulador)
    /_cenario {chaves} (as que não vierem voltam ao padrão) · /_pedidos [?desde=n] (método, ação, status e o NÚMERO da compra — nunca o token)
    /_compra_info {token} (o estado interno: produto, estado, fim, reconhecida, cancelamento, adiada — para o e2e conferir)
Testes: PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/playw6/test_simulador_play.py    Uso: python3 e2e/playw6/simulador_play.py --porta 8796
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

HOST = "127.0.0.1"
PACOTE = "com.bertoldo.physiqcalc"
PRODUTOS = ("app_treino", "app_treino_alimentacao")
PRECOS = {"app_treino": ("29", 900_000_000), "app_treino_alimentacao": ("49", 900_000_000)}
ESCOPO = "https://www.googleapis.com/auth/androidpublisher"
CONTA_SERVICO_EMAIL = "play-api@physiq-br-sim.iam.gserviceaccount.com"
EMISSOR = "https://accounts.google.com"
# os padrões da função (supabase-principal/functions/_shared/play-regras.ts): a audiência e a conta do push
AUDIENCIA_PADRAO = "https://api-principal.physiqcalc.com.br/functions/v1/play-rtdn"
CONTA_PUSH_PADRAO = "play-rtdn-push@physiq-br.iam.gserviceaccount.com"
KID = "sim-oidc-1"
DIA_S = 86_400
PADRAO: dict = {"oauth_status": None, "get_status": None, "cancelar_status": None, "ack_status": None, "defer_status": None}
PREFIXO_API = "/androidpublisher/v3/applications/"
RX_GET = re.compile(r"^/androidpublisher/v3/applications/([^/]+)/purchases/subscriptionsv2/tokens/([^/:]+)$")
RX_V2 = re.compile(r"^/androidpublisher/v3/applications/([^/]+)/purchases/subscriptionsv2/tokens/([^/:]+):(cancel|defer|revoke)$")
RX_ACK = re.compile(r"^/androidpublisher/v3/applications/([^/]+)/purchases/subscriptions/([^/]+)/tokens/([^/:]+):acknowledge$")


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def de64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def agora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def nova_chave() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwk_publica(chave: rsa.RSAPrivateKey, kid: str) -> dict:
    n = chave.public_key().public_numbers()
    tam = lambda x: (x.bit_length() + 7) // 8  # noqa: E731
    return {"kty": "RSA", "alg": "RS256", "use": "sig", "kid": kid, "n": b64u(n.n.to_bytes(tam(n.n), "big")), "e": b64u(n.e.to_bytes(tam(n.e), "big"))}


def assinar_jwt(chave: rsa.RSAPrivateKey, cabecalho: dict, claims: dict) -> str:
    entrada = f"{b64u(json.dumps(cabecalho, separators=(',', ':')).encode())}.{b64u(json.dumps(claims, separators=(',', ':')).encode())}"
    assinatura = chave.sign(entrada.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{entrada}.{b64u(assinatura)}"


def conferir_jwt(publica, jwt: str) -> dict | None:
    """A assinatura RS256 confere com a chave pública → as claims; senão None."""
    try:
        cab, corpo, ass = jwt.split(".")
        publica.verify(de64u(ass), f"{cab}.{corpo}".encode(), padding.PKCS1v15(), hashes.SHA256())
        return json.loads(de64u(corpo))
    except (ValueError, InvalidSignature, json.JSONDecodeError):
        return None


class Simulador:
    """O estado do simulador (thread-safe pela trava): as compras, os tokens de acesso, o cenário e os pedidos."""

    def __init__(self) -> None:
        self.trava = threading.RLock()
        self.chave_servico = nova_chave()      # a conta de serviço FALSA (a chave privada vai ao Deno local pelo /_conta_servico)
        self.chave_oidc = nova_chave()         # o OIDC do push (a pública no /jwks)
        self.chave_forjada = nova_chave()      # o "forjado": mesma kid, outra chave
        self.zerar()

    def zerar(self) -> None:
        with self.trava:
            self.compras: dict[str, dict] = {}
            self.ordem: list[str] = []
            self.acessos: dict[str, float] = {}
            self.cenario = dict(PADRAO)
            self.pedidos: list[dict] = []
            self.avisos = 0

    # ───── a conta de serviço FALSA ─────
    def conta_servico(self) -> dict:
        pem = self.chave_servico.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                               serialization.NoEncryption()).decode()
        return {"type": "service_account", "project_id": "physiq-br-sim", "private_key_id": "sim", "private_key": pem,
                "client_email": CONTA_SERVICO_EMAIL, "client_id": "0", "token_uri": "https://oauth2.googleapis.com/token"}

    # ───── as compras ─────
    def numero(self, token: str) -> int | None:
        with self.trava:
            return self.ordem.index(token) + 1 if token in self.ordem else None

    def nova_compra(self, d: dict) -> dict:
        produto = d.get("produto") or "app_treino"
        if produto not in PRODUTOS:
            raise ValueError("produto")
        with self.trava:
            t0 = agora()
            token = f"simtok-{secrets.token_urlsafe(24)}"
            base = f"GPA.{secrets.randbelow(10**4):04d}-{secrets.randbelow(10**4):04d}-{secrets.randbelow(10**4):04d}-{secrets.randbelow(10**5):05d}"
            dias = int(d.get("dias") or 30)
            c = {"token": token, "produto": produto, "conta": d.get("conta"), "estado": d.get("estado") or "SUBSCRIPTION_STATE_ACTIVE",
                 "inicio": t0, "expira": t0 + dt.timedelta(days=dias), "renova": True, "reconhecida": False, "teste": bool(d.get("teste")),
                 "base": base, "pedidos": [base], "pago": base, "ligada": None, "troca_para": None, "etag": secrets.token_hex(8),
                 "preco": d.get("preco"), "cancelamento": None, "revogada": False, "adiada_s": 0, "fora_do_app": d.get("fora_do_app")}
            antiga = self.compras.get(d.get("ligada") or "")
            if antiga:
                c["ligada"] = antiga["token"]
                if d.get("modo") == "na_renovacao":
                    # DEFERRED: o produto atual segue até renovar (mesmo fim), a troca marcada; o pedido pago é o da antiga
                    c["produto"], c["troca_para"] = antiga["produto"], produto
                    c["expira"], c["pago"], c["pedidos"], c["base"] = antiga["expira"], antiga["pago"], list(antiga["pedidos"]), antiga["base"]
                else:
                    # CHARGE_PRORATED_PRICE: o produto novo já vale, no mesmo período (o fim da antiga), com um pedido novo
                    c["expira"] = antiga["expira"]
                antiga["estado"], antiga["renova"], antiga["cancelamento"] = "SUBSCRIPTION_STATE_EXPIRED", False, "replacement"
                antiga["etag"] = secrets.token_hex(8)
            if c["estado"] in ("SUBSCRIPTION_STATE_PENDING",):
                c["pago"] = None
            self.compras[token] = c
            self.ordem.append(token)
            return {"token": token, "pedido": c["pago"], "numero": len(self.ordem)}

    def mudar(self, token: str, acao: str) -> dict:
        with self.trava:
            c = self.compras.get(token)
            if not c:
                raise KeyError("token")
            t = agora()
            saida: dict = {}
            if acao in ("renovar", "recuperar"):
                n = len(c["pedidos"]) - 1
                pedido = f"{c['base']}..{n}"
                c["pedidos"].append(pedido)
                c["pago"] = pedido
                if c["troca_para"]:
                    c["produto"], c["troca_para"] = c["troca_para"], None
                c["expira"] = max(c["expira"], t) + dt.timedelta(days=30)
                c["estado"], c["renova"] = "SUBSCRIPTION_STATE_ACTIVE", True
                saida["pedido"] = pedido
            elif acao == "carencia":
                # o pagamento da renovação não passou: o pedido novo é o RECUSADO (latestOrderId), o pago fica o de antes; o Google estende o fim
                c["pedidos"].append(f"{c['base']}..{len(c['pedidos']) - 1}")
                c["estado"] = "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
                c["expira"] = max(c["expira"], t) + dt.timedelta(days=3)
            elif acao == "suspender":
                c["estado"], c["expira"] = "SUBSCRIPTION_STATE_ON_HOLD", t - dt.timedelta(minutes=1)
            elif acao == "pausar":
                c["estado"], c["expira"] = "SUBSCRIPTION_STATE_PAUSED", t - dt.timedelta(minutes=1)
            elif acao == "expirar":
                c["estado"], c["renova"], c["expira"] = "SUBSCRIPTION_STATE_EXPIRED", False, t - dt.timedelta(minutes=1)
            elif acao == "cancelar_usuario":
                c["estado"], c["renova"], c["cancelamento"] = "SUBSCRIPTION_STATE_CANCELED", False, "user"
            elif acao == "reativar":
                c["estado"], c["renova"], c["cancelamento"] = "SUBSCRIPTION_STATE_ACTIVE", True, None
            elif acao == "devolver":
                saida["pedido"] = c["pago"]
                c["estado"], c["renova"], c["expira"], c["revogada"] = "SUBSCRIPTION_STATE_EXPIRED", False, t, True
            else:
                raise ValueError("acao")
            c["etag"] = secrets.token_hex(8)
            saida["estado"] = c["estado"]
            return saida

    def vista(self, c: dict) -> dict:
        """O SubscriptionPurchaseV2 (o formato da API v3)."""
        unidades, nanos = PRECOS[c["produto"]] if not c.get("preco") else (str(int(c["preco"])), int(round((c["preco"] % 1) * 1e9)))
        linha: dict = {
            "productId": c["produto"],
            "expiryTime": iso(c["expira"]),
            "autoRenewingPlan": {"autoRenewEnabled": c["renova"], "recurringPrice": {"currencyCode": "BRL", "units": unidades, "nanos": nanos}},
            "offerDetails": {"basePlanId": "mensal", "offerTags": []},
        }
        if c["pago"]:
            linha["latestSuccessfulOrderId"] = c["pago"]
        if c["troca_para"]:
            linha["deferredItemReplacement"] = {"productId": c["troca_para"]}
        v: dict = {
            "kind": "androidpublisher#subscriptionPurchaseV2",
            "regionCode": "BR",
            "startTime": iso(c["inicio"]),
            "subscriptionState": c["estado"],
            "latestOrderId": c["pedidos"][-1],
            "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" if c["reconhecida"] else "ACKNOWLEDGEMENT_STATE_PENDING",
            "etag": c["etag"],
            "lineItems": [linha],
        }
        if c["conta"]:
            v["externalAccountIdentifiers"] = {"obfuscatedExternalAccountId": c["conta"]}
        if c["ligada"]:
            v["linkedPurchaseToken"] = c["ligada"]
        if c["teste"]:
            v["testPurchase"] = {}
        if c["cancelamento"]:
            v["canceledStateContext"] = {"userInitiatedCancellation": {}} if c["cancelamento"] == "user" else (
                {"replacementCancellation": {}} if c["cancelamento"] == "replacement" else {"developerInitiatedCancellation": {}})
        if c.get("fora_do_app"):
            v["outOfAppPurchaseContext"] = c["fora_do_app"]
        return v

    # ───── o OAuth ─────
    def token_de_acesso(self, assercao: str) -> tuple[int, dict]:
        st = self.cenario.get("oauth_status")
        if st:
            return int(st), {"error": "invalid_grant", "error_description": "o simulador recusou (cenário)"}
        claims = conferir_jwt(self.chave_servico.public_key(), assercao or "")
        t = time.time()
        if not claims or claims.get("iss") != CONTA_SERVICO_EMAIL or claims.get("scope") != ESCOPO or not (claims.get("exp", 0) > t):
            return 400, {"error": "invalid_grant", "error_description": "Invalid JWT"}
        acesso = f"simacc-{secrets.token_urlsafe(24)}"
        with self.trava:
            self.acessos[acesso] = t + 3600
        return 200, {"access_token": acesso, "expires_in": 3599, "token_type": "Bearer"}

    def acesso_valido(self, autorizacao: str) -> bool:
        if not autorizacao.startswith("Bearer "):
            return False
        with self.trava:
            fim = self.acessos.get(autorizacao[7:])
        return bool(fim and fim > time.time())

    # ───── o push assinado ─────
    def oidc(self, modo: str, audiencia: str, conta: str) -> str | None:
        if modo == "ausente":
            return None
        t = int(time.time())
        claims = {"iss": EMISSOR, "aud": audiencia, "email": conta, "email_verified": True, "iat": t, "exp": t + 3600, "sub": "100000000000000000001",
                  "azp": "100000000000000000001"}
        cab = {"alg": "RS256", "kid": KID, "typ": "JWT"}
        chave = self.chave_oidc
        if modo == "forjado":
            chave = self.chave_forjada
        elif modo == "aud":
            claims["aud"] = "https://outra.audiencia.example/fn"
        elif modo == "email":
            claims["email"] = "outra-conta@physiq-br.iam.gserviceaccount.com"
        elif modo == "nao_verificado":
            claims["email_verified"] = False
        elif modo == "expirado":
            claims["iat"], claims["exp"] = t - 7200, t - 3600
        elif modo == "kid":
            cab["kid"] = "kid-que-nao-existe"
        elif modo != "valido":
            raise ValueError("oidc")
        return assinar_jwt(chave, cab, claims)

    def envelope(self, d: dict) -> dict:
        with self.trava:
            self.avisos += 1
            n = self.avisos
        pacote = d.get("pacote") or PACOTE
        tipo = d.get("tipo") or "assinatura"
        aviso: dict = {"version": "1.0", "packageName": pacote, "eventTimeMillis": str(int(time.time() * 1000))}
        if tipo == "assinatura":
            aviso["subscriptionNotification"] = {"version": "1.0", "notificationType": int(d.get("notificacao") or 2), "purchaseToken": d.get("token")}
        elif tipo == "devolucao":
            aviso["voidedPurchaseNotification"] = {"purchaseToken": d.get("token"), "orderId": d.get("pedido"), "productType": 1, "refundType": 1}
        elif tipo == "teste":
            aviso["testNotification"] = {"version": "1.0"}
        else:
            aviso["oneTimeProductNotification"] = {"version": "1.0", "notificationType": 1, "purchaseToken": "x", "sku": "x"}
        mid = str(d.get("repetir_id") or (9_000_000_000 + n))
        return {"message": {"data": base64.b64encode(json.dumps(aviso).encode()).decode(), "messageId": mid, "message_id": mid,
                            "publishTime": iso(agora())}, "subscription": "projects/physiq-br/subscriptions/play-rtdn-push"}

    def empurrar(self, d: dict) -> dict:
        url = d.get("url") or ""
        if not url.startswith("http://127.0.0.1:"):
            raise ValueError("url")
        jwt = self.oidc(d.get("oidc") or "valido", d.get("audiencia") or AUDIENCIA_PADRAO, d.get("conta") or CONTA_PUSH_PADRAO)
        corpo = json.dumps(self.envelope(d)).encode()
        cab = {"Content-Type": "application/json", "User-Agent": "APIs-Google; (+https://developers.google.com/webmasters/APIs-Google.html)"}
        if jwt:
            cab["Authorization"] = f"Bearer {jwt}"
        req = urllib.request.Request(url, data=corpo, method="POST", headers=cab)
        abrir = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with abrir.open(req, timeout=60) as r:
                return {"status": r.status}
        except urllib.error.HTTPError as e:
            try:
                return {"status": e.code}
            finally:
                e.close()


def criar_servidor(porta: int, sim: Simulador | None = None) -> ThreadingHTTPServer:
    sim = sim or Simulador()

    class Pedido(BaseHTTPRequestHandler):
        server_version = "SimuladorPlay/1.0"

        def log_message(self, *_a) -> None:  # silencioso (o e2e lê o /_pedidos)
            return

        def _json(self, st: int, corpo=None) -> None:
            dados = b"" if corpo is None else json.dumps(corpo).encode()
            self.send_response(st)
            if corpo is not None:
                self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(dados)))
            self.end_headers()
            if dados:
                self.wfile.write(dados)

        def _corpo(self) -> dict:
            n = int(self.headers.get("Content-Length") or 0)
            bruto = self.rfile.read(n) if n else b""
            ctype = (self.headers.get("Content-Type") or "").lower()
            if "x-www-form-urlencoded" in ctype:
                from urllib.parse import parse_qs  # noqa: PLC0415
                return {k: v[0] for k, v in parse_qs(bruto.decode()).items()}
            try:
                v = json.loads(bruto or b"{}")
                return v if isinstance(v, dict) else {}
            except ValueError:
                return {}

        def _anotar(self, acao: str, st: int, token: str | None = None, extra: dict | None = None) -> None:
            with sim.trava:
                sim.pedidos.append({"metodo": self.command, "acao": acao, "status": st, "compra": sim.numero(token) if token else None,
                                    **(extra or {})})

        def _erro_google(self, st: int, status: str, motivo: str) -> dict:
            return {"error": {"code": st, "message": "simulador", "status": status, "errors": [{"reason": motivo, "message": "simulador"}]}}

        def do_GET(self) -> None:  # noqa: N802
            caminho = self.path.split("?")[0]
            if caminho == "/jwks":
                return self._json(200, {"keys": [jwk_publica(sim.chave_oidc, KID)]})
            if caminho == "/_pedidos":
                desde = int((self.path.split("desde=")[1].split("&")[0]) if "desde=" in self.path else 0)
                with sim.trava:
                    return self._json(200, {"n": len(sim.pedidos), "pedidos": sim.pedidos[desde:]})
            m = RX_GET.match(caminho)
            if m:
                pacote, token = m.group(1), m.group(2)
                if not sim.acesso_valido(self.headers.get("Authorization") or ""):
                    self._anotar("get", 401, token)
                    return self._json(401, self._erro_google(401, "UNAUTHENTICATED", "authError"))
                st = sim.cenario.get("get_status")
                if st:
                    self._anotar("get", int(st), token)
                    return self._json(int(st), self._erro_google(int(st), "UNAVAILABLE", "backendError"))
                with sim.trava:
                    c = sim.compras.get(token)
                    vista = sim.vista(c) if c and pacote == PACOTE else None
                if not vista:
                    self._anotar("get", 404, token)
                    return self._json(404, self._erro_google(404, "NOT_FOUND", "purchaseTokenNotFound"))
                self._anotar("get", 200, token)
                return self._json(200, vista)
            return self._json(404, {"error": "rota"})

        def do_POST(self) -> None:  # noqa: N802
            caminho = self.path.split("?")[0]
            d = self._corpo()
            if caminho == "/token":
                st, r = sim.token_de_acesso(d.get("assertion") or "")
                self._anotar("token", st)
                return self._json(st, r)
            if caminho.startswith("/_"):
                return self._admin(caminho, d)
            m = RX_ACK.match(caminho)
            if m:
                return self._ack(m.group(1), m.group(2), m.group(3))
            m = RX_V2.match(caminho)
            if m:
                return self._v2(m.group(1), m.group(2), m.group(3), d)
            return self._json(404, {"error": "rota"})

        def _ack(self, pacote: str, produto: str, token: str) -> None:
            if not sim.acesso_valido(self.headers.get("Authorization") or ""):
                self._anotar("acknowledge", 401, token)
                return self._json(401, self._erro_google(401, "UNAUTHENTICATED", "authError"))
            st = sim.cenario.get("ack_status")
            if st:
                self._anotar("acknowledge", int(st), token)
                return self._json(int(st), self._erro_google(int(st), "UNAVAILABLE", "backendError"))
            with sim.trava:
                c = sim.compras.get(token)
                if not c or pacote != PACOTE:
                    self._anotar("acknowledge", 404, token)
                    return self._json(404, self._erro_google(404, "NOT_FOUND", "purchaseTokenNotFound"))
                if produto not in (c["produto"], c["troca_para"]):
                    self._anotar("acknowledge", 400, token)
                    return self._json(400, self._erro_google(400, "INVALID_ARGUMENT", "invalidProductId"))
                c["reconhecida"] = True
                c["etag"] = secrets.token_hex(8)
            self._anotar("acknowledge", 204, token, {"produto": produto})
            return self._json(204)

        def _v2(self, pacote: str, token: str, acao: str, d: dict) -> None:
            if not sim.acesso_valido(self.headers.get("Authorization") or ""):
                self._anotar(acao, 401, token)
                return self._json(401, self._erro_google(401, "UNAUTHENTICATED", "authError"))
            st = sim.cenario.get("cancelar_status") if acao == "cancel" else sim.cenario.get("defer_status") if acao == "defer" else None
            if st:
                self._anotar(acao, int(st), token)
                return self._json(int(st), self._erro_google(int(st), "UNAVAILABLE", "backendError"))
            with sim.trava:
                c = sim.compras.get(token)
                if not c or pacote != PACOTE:
                    self._anotar(acao, 404, token)
                    return self._json(404, self._erro_google(404, "NOT_FOUND", "purchaseTokenNotFound"))
                if acao == "cancel":
                    tipo = ((d.get("cancellationContext") or {}).get("cancellationType")) or ""
                    if tipo not in ("USER_REQUESTED_STOP_RENEWALS", "DEVELOPER_REQUESTED_STOP_PAYMENTS"):
                        self._anotar("cancel", 400, token)
                        return self._json(400, self._erro_google(400, "INVALID_ARGUMENT", "invalidValue"))
                    if c["estado"] in ("SUBSCRIPTION_STATE_EXPIRED",):
                        self._anotar("cancel", 400, token, {"tipo": tipo})
                        return self._json(400, self._erro_google(400, "FAILED_PRECONDITION", "subscriptionNotActive"))
                    c["estado"], c["renova"], c["cancelamento"] = "SUBSCRIPTION_STATE_CANCELED", False, tipo
                    c["etag"] = secrets.token_hex(8)
                    self._anotar("cancel", 200, token, {"tipo": tipo})
                    return self._json(200, {})
                if acao == "defer":
                    ctx = d.get("deferralContext") or {}
                    dur = str(ctx.get("deferDuration") or "")
                    mm = re.fullmatch(r"(\d+)s", dur)
                    seg = int(mm.group(1)) if mm else -1
                    if ctx.get("etag") != c["etag"]:
                        self._anotar("defer", 409, token)
                        return self._json(409, self._erro_google(409, "ABORTED", "etagMismatch"))
                    if not (DIA_S <= seg <= 365 * DIA_S):
                        self._anotar("defer", 400, token)
                        return self._json(400, self._erro_google(400, "INVALID_ARGUMENT", "invalidValue"))
                    c["expira"] = c["expira"] + dt.timedelta(seconds=seg)
                    c["adiada_s"] += seg
                    c["etag"] = secrets.token_hex(8)
                    self._anotar("defer", 200, token, {"dias": seg // DIA_S})
                    return self._json(200, {"itemExpiryTimeDetails": [{"productId": c["produto"], "expiryTime": iso(c["expira"])}]})
                # revoke
                ctx = d.get("revocationContext") or {}
                tipo = "integral" if "fullRefund" in ctx else "proporcional" if "proratedRefund" in ctx else None
                if not tipo:
                    self._anotar("revoke", 400, token)
                    return self._json(400, self._erro_google(400, "INVALID_ARGUMENT", "invalidValue"))
                c["estado"], c["renova"], c["expira"], c["revogada"] = "SUBSCRIPTION_STATE_EXPIRED", False, agora(), True
                c["etag"] = secrets.token_hex(8)
                self._anotar("revoke", 200, token, {"tipo": tipo})
                return self._json(200, {})

        def _admin(self, caminho: str, d: dict) -> None:
            try:
                if caminho == "/_zerar":
                    sim.zerar()
                    return self._json(200, {"ok": True})
                if caminho == "/_conta_servico":
                    return self._json(200, sim.conta_servico())
                if caminho == "/_cenario":
                    with sim.trava:
                        sim.cenario = {**PADRAO, **{k: v for k, v in d.items() if k in PADRAO}}
                    return self._json(200, sim.cenario)
                if caminho == "/_compra":
                    return self._json(200, sim.nova_compra(d))
                if caminho == "/_mudar":
                    return self._json(200, sim.mudar(str(d.get("token") or ""), str(d.get("acao") or "")))
                if caminho == "/_push":
                    return self._json(200, sim.empurrar(d))
                if caminho == "/_compra_info":
                    with sim.trava:
                        c = sim.compras.get(str(d.get("token") or ""))
                        if not c:
                            return self._json(404, {"erro": "token"})
                        return self._json(200, {"produto": c["produto"], "estado": c["estado"], "expira": iso(c["expira"]), "renova": c["renova"],
                                                "reconhecida": c["reconhecida"], "cancelamento": c["cancelamento"], "adiada_dias": c["adiada_s"] // DIA_S,
                                                "revogada": c["revogada"], "troca_para": c["troca_para"], "pedido": c["pago"]})
            except (KeyError, ValueError) as e:
                return self._json(400, {"erro": str(e)})
            return self._json(404, {"erro": "rota"})

    servidor = ThreadingHTTPServer((HOST, porta), Pedido)
    servidor.daemon_threads = True
    servidor.simulador = sim  # type: ignore[attr-defined]
    return servidor


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8796)
    a = ap.parse_args()
    s = criar_servidor(a.porta)
    print(f"simulador da Google Play em http://{HOST}:{a.porta} (só local; nada é o Google de verdade)", flush=True)
    try:
        s.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        s.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
