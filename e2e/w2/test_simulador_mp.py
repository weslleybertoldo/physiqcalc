#!/usr/bin/env python3
"""Testes do SIMULADOR local do Mercado Pago (e2e/w2/simulador_mp.py), sem rede de fora: o servidor sobe numa porta livre de 127.0.0.1
nesta mesma execução. Junto, as peças puras do e2e/w2/api.py (a cifra, os limites, as janelas do MENOR 16, a ordem do desfazer, a lista de
casos) — importar o api.py não abre rede nem lê senha (a base dos E2E só carrega no main) — e, com o ~/.deno/bin/deno, a cifra e a
x-signature conferidas contra o código das funções (_shared/cifra-mp.ts e mp-conta-regras.ts).
Rodar:  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w2/test_simulador_mp.py"""
from __future__ import annotations

import base64
import hashlib
import json
import subprocess
import sys
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import api as API  # noqa: E402
import simulador_mp as SIM  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
_ABRIR = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class _SemSeguir(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_a, **_k):
        return None


_ABRIR_SEM = urllib.request.build_opener(urllib.request.ProxyHandler({}), _SemSeguir)


def verificador_e_desafio() -> tuple[str, str]:
    v = base64.urlsafe_b64encode(b"v" * 48).decode().rstrip("=")
    return v, base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).decode().rstrip("=")


class SimuladorBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.srv = SIM.servidor(0)
        cls.porta = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.srv.shutdown()
        cls.srv.server_close()

    def setUp(self) -> None:
        SIM.zerar()

    def pedir(self, metodo: str, caminho: str, corpo=None, token: str | None = None, form: bool = False,
              bruto: bytes | None = None) -> tuple[int, object, dict]:
        cab = {}
        if token:
            cab["Authorization"] = f"Bearer {token}"
        if bruto is not None:
            dados = bruto
            cab["Content-Type"] = "application/json"
        elif corpo is None:
            dados = None
        elif form:
            dados = urllib.parse.urlencode(corpo).encode()
            cab["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            dados = json.dumps(corpo).encode()
            cab["Content-Type"] = "application/json"
        req = urllib.request.Request(f"http://127.0.0.1:{self.porta}{caminho}", data=dados, method=metodo, headers=cab)
        try:
            with _ABRIR_SEM.open(req, timeout=10) as r:
                return r.status, json.loads(r.read() or b"null"), {k.lower(): v for k, v in r.headers.items()}
        except urllib.error.HTTPError as e:
            try:
                txt = e.read()
                return e.code, (json.loads(txt) if txt else None), {k.lower(): v for k, v in e.headers.items()}
            finally:
                e.close()

    def adm(self, caminho: str, corpo: dict) -> dict:
        st, r, _ = self.pedir("POST", caminho, corpo)
        self.assertLess(st, 300, (caminho, r))
        return r

    def autorizar(self, redirect: str = API.REDIRECT_PROPRIO, desafio: str | None = None, estado: str = "e" * 43) -> tuple[int, str, dict]:
        q = {"client_id": SIM.CLIENTE_ID, "response_type": "code", "platform_id": "mp", "state": estado, "redirect_uri": redirect}
        if desafio:
            q |= {"code_challenge": desafio, "code_challenge_method": "S256"}
        st, _, cab = self.pedir("GET", f"/authorization?{urllib.parse.urlencode(q)}")
        return st, cab.get("location", ""), urllib.parse.parse_qs(urllib.parse.urlsplit(cab.get("location", "")).query)

    def trocar(self, code: str, redirect: str = API.REDIRECT_PROPRIO, verificador: str | None = None, **extra) -> tuple[int, dict]:
        corpo = {"client_id": SIM.CLIENTE_ID, "client_secret": SIM.CLIENTE_SEGREDO, "grant_type": "authorization_code", "code": code,
                 "redirect_uri": redirect, "test_token": "true", **extra}
        if verificador:
            corpo["code_verifier"] = verificador
        st, r, _ = self.pedir("POST", "/oauth/token", corpo)
        return st, r

    def renovar(self, refresh: str) -> tuple[int, dict]:
        st, r, _ = self.pedir("POST", "/oauth/token", {"client_id": SIM.CLIENTE_ID, "client_secret": SIM.CLIENTE_SEGREDO,
                                                       "grant_type": "refresh_token", "refresh_token": refresh})
        return st, r

    def par(self, vendedor: int = SIM.VENDEDOR_A) -> dict:
        return self.adm("/_token", {"vendedor": vendedor})

    def pedidos(self, desde: int = 0) -> list:
        return self.pedir("GET", f"/_pedidos?desde={desde}")[1]


class OAuthTest(SimuladorBase):
    def test_escuta_so_no_127(self) -> None:
        self.assertEqual(SIM.HOST, "127.0.0.1")
        self.assertEqual(self.srv.server_address[0], "127.0.0.1")

    def test_autorizacao_devolve_o_code_e_o_state_no_redirect(self) -> None:
        st, loc, q = self.autorizar()
        self.assertEqual(st, 302)
        self.assertTrue(loc.startswith(API.REDIRECT_PROPRIO + "?"))
        self.assertEqual(q["state"], ["e" * 43])
        self.assertRegex(q["code"][0], r"^[A-Za-z0-9_-]{8,300}$")   # o formato que a mp-conectar-retorno aceita
        # o redirect de teste (sem caminho) também: o code vai na busca
        st, loc, q = self.autorizar(API.REDIRECT_TESTE)
        self.assertTrue(loc.startswith("https://www.mercadopago.com?code="))

    def test_negar_e_client_errado(self) -> None:
        self.adm("/_cenario", {"negar": True})
        st, loc, q = self.autorizar()
        self.assertEqual((st, q.get("error"), q.get("state")), (302, ["access_denied"], ["e" * 43]))
        self.assertNotIn("code", q)
        self.adm("/_cenario", {})
        st, r, _ = self.pedir("GET", "/authorization?client_id=123&redirect_uri=x&state=y")
        self.assertEqual(st, 400)
        self.assertIn("não está pronto", r["message"])

    def test_troca_com_pkce_e_o_formato_que_a_funcao_le(self) -> None:
        v, d = verificador_e_desafio()
        _, _, q = self.autorizar(desafio=d)
        st, r = self.trocar(q["code"][0], verificador=v)
        self.assertEqual(st, 200)
        self.assertRegex(r["access_token"], r"^(APP_USR|TEST)-[A-Za-z0-9_-]{10,300}$")   # o TOKEN do mp-conta-regras.ts › lerTokenDoMp
        self.assertRegex(r["refresh_token"], r"^[A-Za-z0-9_-]{8,300}$")
        self.assertRegex(r["public_key"], r"^(APP_USR|TEST)-[A-Za-z0-9-]{8,72}$")
        self.assertTrue(r["access_token"].startswith("TEST-"))   # test_token "true" (o staging)
        self.assertEqual((r["user_id"], r["expires_in"], r["live_mode"]), (SIM.VENDEDOR_A, SIM.EXPIRA_S, False))
        self.assertIn("offline_access", r["scope"].split())
        troca = [x for x in self.pedidos() if x["caminho"] == "/oauth/token"][-1]
        self.assertEqual((troca["pkce"], troca["redirect_ok"], troca["test_token"], troca["grant_type"]), ("ok", True, "true", "authorization_code"))
        self.assertEqual(troca["corpo"]["code"], SIM.OCULTO)
        self.assertEqual(troca["corpo"]["client_secret"], SIM.OCULTO)
        self.assertEqual(troca["corpo"]["code_verifier"], SIM.OCULTO)

    def test_troca_recusa_pkce_errado_redirect_diferente_code_usado_e_vencido(self) -> None:
        v, d = verificador_e_desafio()
        _, _, q = self.autorizar(desafio=d)
        self.assertEqual(self.trocar(q["code"][0], verificador="outro" * 10)[1]["error"], "invalid_grant")
        self.assertEqual(self.trocar(q["code"][0])[0], 400)                               # sem o verifier
        self.assertEqual(self.trocar(q["code"][0], redirect=API.REDIRECT_TESTE, verificador=v)[0], 400)
        self.assertEqual(self.trocar(q["code"][0], verificador=v)[0], 200)                # ainda não tinha sido gasto
        self.assertEqual(self.trocar(q["code"][0], verificador=v)[0], 400)                # uso único
        _, _, q = self.autorizar()
        with mock.patch.object(SIM, "agora", return_value=SIM.time.time() + SIM.CODE_S + 1):
            self.assertEqual(self.trocar(q["code"][0])[0], 400)                           # 10 min
        st, r, _ = self.pedir("POST", "/oauth/token", {"client_id": SIM.CLIENTE_ID, "client_secret": "errado", "grant_type": "authorization_code"})
        self.assertEqual((st, r["error"]), (401, "invalid_client"))

    def test_troca_aceita_formulario(self) -> None:
        _, _, q = self.autorizar()
        st, r, _ = self.pedir("POST", "/oauth/token", {"client_id": SIM.CLIENTE_ID, "client_secret": SIM.CLIENTE_SEGREDO,
                                                       "grant_type": "authorization_code", "code": q["code"][0],
                                                       "redirect_uri": API.REDIRECT_PROPRIO}, form=True)
        self.assertEqual(st, 200)
        self.assertTrue(r["access_token"].startswith("APP_USR-"))   # sem test_token

    def test_cenarios_da_troca(self) -> None:
        for chave, valor, esperado in (("sem_public_key", True, lambda r: "public_key" not in r),
                                       ("sem_refresh", True, lambda r: "refresh_token" not in r),
                                       ("live_mode", True, lambda r: r["live_mode"] is True),
                                       ("live_mode", None, lambda r: "live_mode" not in r)):
            self.adm("/_cenario", {chave: valor})
            _, _, q = self.autorizar()
            st, r = self.trocar(q["code"][0])
            self.assertEqual(st, 200, chave)
            self.assertTrue(esperado(r), (chave, valor, r))
        for st_mp in (400, 500):
            self.adm("/_cenario", {"troca_status": st_mp})
            _, _, q = self.autorizar()
            st, r = self.trocar(q["code"][0])
            self.assertEqual(st, st_mp)
            self.assertEqual(r.get("error") == "invalid_grant", st_mp == 400)

    def test_o_vendedor_do_cenario_autoriza(self) -> None:
        self.adm("/_cenario", {"vendedor": SIM.VENDEDOR_B})
        _, _, q = self.autorizar()
        self.assertEqual(self.trocar(q["code"][0])[1]["user_id"], SIM.VENDEDOR_B)

    def test_renovacao_gira_o_refresh(self) -> None:
        par = self.par()
        st, r = self.renovar(par["refresh_token"])
        self.assertEqual(st, 200)
        self.assertNotEqual(r["refresh_token"], par["refresh_token"])
        self.assertEqual(self.adm("/_token_info", {"token": par["refresh_token"]})["vivo"], False)   # o usado MORRE
        self.assertEqual(self.adm("/_token_info", {"token": r["refresh_token"]})["vivo"], True)
        self.assertEqual(self.adm("/_token_info", {"token": par["access_token"]})["vivo"], True)     # o access de antes segue
        self.assertEqual(self.renovar(par["refresh_token"])[1]["error"], "invalid_grant")             # o velho não serve mais
        troca = [x for x in self.pedidos() if x["caminho"] == "/oauth/token"]
        self.assertEqual([x["refresh"] for x in troca], ["vivo", "morto"])
        self.assertEqual(troca[0]["corpo"]["refresh_token"], SIM.OCULTO)

    def test_renovacoes_juntas_so_uma_ganha(self) -> None:
        par = self.par()
        saidas: list = []
        ts = [threading.Thread(target=lambda: saidas.append(self.renovar(par["refresh_token"])[0])) for _ in range(6)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
        self.assertEqual(sorted(saidas), [200, 400, 400, 400, 400, 400])

    def test_cenarios_da_renovacao(self) -> None:
        par = self.par()
        self.adm("/_cenario", {"renovar_status": 400})
        self.assertEqual(self.renovar(par["refresh_token"]), (400, {"error": "invalid_grant", "message": "simulado"}))
        self.assertTrue(self.adm("/_token_info", {"token": par["refresh_token"]})["vivo"])   # a recusa não gasta o refresh
        self.adm("/_cenario", {"renovar_status": 500})
        self.assertEqual(self.renovar(par["refresh_token"])[0], 500)
        self.adm("/_cenario", {"renovar_formato": True})
        st, r = self.renovar(par["refresh_token"])
        self.assertEqual(st, 200)
        self.assertEqual(sorted(r), ["refresh_token", "token_type"])                     # MENOR 13: 2xx sem access_token
        self.assertFalse(self.adm("/_token_info", {"token": par["refresh_token"]})["vivo"])
        self.assertTrue(self.adm("/_token_info", {"token": r["refresh_token"]})["vivo"])


class UsuarioETokensTest(SimuladorBase):
    def test_users_me_vivo_morto_e_physiq(self) -> None:
        par = self.par()
        st, r, _ = self.pedir("GET", "/users/me", token=par["access_token"])
        self.assertEqual((st, r["id"], r["nickname"]), (200, SIM.VENDEDOR_A, f"SIMULADOR{SIM.VENDEDOR_A}"))
        self.assertEqual(self.pedir("GET", "/users/me", token=SIM.TOKEN_PHYSIQ_TESTE)[1]["id"], SIM.ID_PHYSIQ)
        self.assertEqual(self.pedir("GET", "/users/me", token="TEST-inventado-0000000000")[0], 401)
        self.assertEqual(self.pedir("GET", "/users/me")[0], 401)
        self.adm("/_expirar", {"vendedor": SIM.VENDEDOR_A})
        self.assertEqual(self.pedir("GET", "/users/me", token=par["access_token"])[0], 401)
        self.assertTrue(self.adm("/_token_info", {"token": par["refresh_token"]})["vivo"])   # o refresh segue (o 401 da hora do uso)
        self.assertEqual(self.renovar(par["refresh_token"])[0], 200)

    def test_users_me_status_so_no_token_de_vendedor(self) -> None:
        par = self.par()
        self.adm("/_cenario", {"users_me_status": 500})
        self.assertEqual(self.pedir("GET", "/users/me", token=par["access_token"])[0], 500)
        self.adm("/_expirar", {"vendedor": SIM.VENDEDOR_A})
        self.assertEqual(self.pedir("GET", "/users/me", token=par["access_token"])[0], 500)    # morto também: o MP não decide nada
        self.assertEqual(self.pedir("GET", "/users/me", token=SIM.TOKEN_PHYSIQ_TESTE)[0], 200)   # o do Physiq não muda
        self.assertEqual(self.pedir("GET", "/users/me", token="TEST-inventado-0000000000")[0], 401)
        self.adm("/_cenario", {})
        self.assertEqual(self.pedir("GET", "/users/me", token=par["access_token"])[0], 401)     # sem o cenário, o morto volta a 401
        ps = [x for x in self.pedidos() if x["caminho"] == "/users/me"]
        self.assertEqual([(x["status"], x["token"], x["token_nome"]) for x in ps[:2]],
                         [(500, "vivo", f"conta_{SIM.VENDEDOR_A}"), (500, "morto", f"conta_{SIM.VENDEDOR_A}")])

    def test_expirar_pelo_cenario_e_com_o_refresh(self) -> None:
        par = self.par()
        r = self.adm("/_cenario", {"expirar_token": SIM.VENDEDOR_A})
        self.assertEqual(r["expirados"], 1)
        self.assertEqual(self.pedir("GET", "/users/me", token=par["access_token"])[0], 401)
        par = self.par()
        self.adm("/_expirar", {"vendedor": SIM.VENDEDOR_A, "refresh": True})
        self.assertEqual(self.renovar(par["refresh_token"])[0], 400)

    def test_pedidos_dizem_o_nome_e_o_estado_do_token(self) -> None:
        par_a, par_b = self.par(SIM.VENDEDOR_A), self.par(SIM.VENDEDOR_B)
        self.pedir("GET", "/users/me", token=par_a["access_token"])
        self.pedir("GET", "/users/me", token=SIM.TOKEN_PHYSIQ_TESTE)
        self.pedir("GET", "/users/me", token="TEST-inventado-0000000000")
        self.adm("/_expirar", {"vendedor": SIM.VENDEDOR_B})
        self.pedir("GET", "/users/me", token=par_b["access_token"])
        ps = self.pedidos()
        self.assertEqual([(x["token"], x["token_nome"], x["token_de"]) for x in ps],
                         [("vivo", f"conta_{SIM.VENDEDOR_A}", SIM.VENDEDOR_A), ("vivo", "physiq_teste", SIM.ID_PHYSIQ), ("outro", None, None),
                          ("morto", f"conta_{SIM.VENDEDOR_B}", SIM.VENDEDOR_B)])
        self.assertEqual([x["n"] for x in ps], [0, 1, 2, 3])
        self.assertEqual([x["n"] for x in self.pedidos(2)], [2, 3])
        self.assertEqual(self.pedir("GET", "/_estado")[1]["pedidos"], 4)
        texto = json.dumps(ps)
        for t in (par_a["access_token"], par_b["access_token"], SIM.TOKEN_PHYSIQ_TESTE):
            self.assertNotIn(t, texto)   # nenhum token no /_pedidos


class PagamentosTest(SimuladorBase):
    def pix(self, token: str, **extra) -> tuple[int, dict]:
        st, r, _ = self.pedir("POST", "/v1/payments", {"transaction_amount": 10, "payment_method_id": "pix", "description": "x",
                                                        "payer": {"email": "c@example.com"}, "external_reference": "ref-1",
                                                        "notification_url": "https://exemplo/aviso", **extra}, token=token)
        return st, r

    def test_pix_do_vendedor_com_qr_e_o_que_a_funcao_le(self) -> None:
        par = self.par()
        st, r = self.pix(par["access_token"])
        self.assertEqual(st, 201)
        self.assertRegex(str(r["id"]), r"^\d{1,20}$")   # o id que o idDoAvisoValido aceita
        self.assertEqual((r["status"], r["collector_id"], r["live_mode"], r["notification_url"]), ("pending", SIM.VENDEDOR_A, False, "https://exemplo/aviso"))
        self.assertTrue(r["point_of_interaction"]["transaction_data"]["qr_code"])
        self.assertTrue(r["date_of_expiration"])
        criar = [x for x in self.pedidos() if x["metodo"] == "POST" and x["caminho"] == "/v1/payments"][0]
        self.assertEqual(criar["recurso_id"], r["id"])   # o /_pedidos diz QUAL pagamento a ação criou (o caso cartao_outro_ambiente lê)
        self.assertEqual(self.pix(SIM.TOKEN_PHYSIQ_TESTE)[1]["collector_id"], SIM.ID_PHYSIQ)
        self.assertEqual(self.pix("TEST-morto-000000000000")[0], 401)
        self.assertEqual(self.pedir("POST", "/v1/payments", {"transaction_amount": 0}, token=par["access_token"])[0], 400)

    def test_pix_sem_chave_so_na_conta(self) -> None:
        self.adm("/_cenario", {"pix_sem_chave": True})
        st, r = self.pix(self.par()["access_token"])
        self.assertEqual(st, 400)
        self.assertIn("without key enabled for qr", r["message"].lower())   # o erroPixSemChave
        self.assertEqual(self.pix(SIM.TOKEN_PHYSIQ_TESTE)[0], 201)          # o MP do Physiq não muda

    def test_cartao_pelo_nome_e_pelo_cenario(self) -> None:
        tok = self.par()["access_token"]
        for nome, esperado in (("sim-card-APRO", "approved"), ("sim-card-OTHE", "rejected"), ("sim-card-CONT", "in_process")):
            st, r, _ = self.pedir("POST", "/v1/payments", {"transaction_amount": 10, "token": nome, "installments": 1}, token=tok)
            self.assertEqual((st, r["status"]), (201, esperado))
        self.adm("/_cenario", {"cartao_status": "rejected"})
        self.assertEqual(self.pedir("POST", "/v1/payments", {"transaction_amount": 10, "token": "sim-card-APRO"}, token=tok)[1]["status"], "rejected")
        cartao = [x for x in self.pedidos() if x["metodo"] == "POST"][-1]
        self.assertEqual(cartao["corpo"]["token"], SIM.OCULTO)   # o card token não vai ao /_pedidos

    def test_get_do_dono_de_outro_404_alheio_401_e_visivel(self) -> None:
        a, b = self.par(SIM.VENDEDOR_A), self.par(SIM.VENDEDOR_B)
        pid = self.pix(a["access_token"])[1]["id"]
        self.assertEqual(self.pedir("GET", f"/v1/payments/{pid}", token=a["access_token"])[0], 200)
        self.assertEqual(self.pedir("GET", f"/v1/payments/{pid}", token=b["access_token"])[0], 404)
        self.assertEqual(self.pedir("GET", f"/v1/payments/{pid}", token=SIM.TOKEN_PHYSIQ_TESTE)[0], 404)
        self.adm("/_cenario", {"alheio_401": True})
        self.assertEqual(self.pedir("GET", f"/v1/payments/{pid}", token=b["access_token"])[0], 401)
        self.assertEqual(self.pedir("GET", "/users/me", token=b["access_token"])[0], 200)   # I2: o /users/me do mesmo token segue 200
        self.adm("/_cenario", {})
        vis = self.adm("/_pagamento", {"collector_id": SIM.VENDEDOR_B, "status": "approved", "visivel": True, "external_reference": "x"})
        st, r, _ = self.pedir("GET", f"/v1/payments/{vis['id']}", token=a["access_token"])
        self.assertEqual((st, r["collector_id"], r["status"]), (200, SIM.VENDEDOR_B, "approved"))
        self.assertNotIn("visivel", r)
        g = [x for x in self.pedidos() if x["caminho"] == f"/v1/payments/{vis['id']}"][-1]
        self.assertEqual((g["token_de"], g["recurso_de"]), (SIM.VENDEDOR_A, SIM.VENDEDOR_B))   # o "trocado" que o C1 confere pelo collector

    def test_cancelar_e_estornar_so_o_dono(self) -> None:
        a, b = self.par(SIM.VENDEDOR_A), self.par(SIM.VENDEDOR_B)
        pid = self.pix(a["access_token"])[1]["id"]
        self.assertEqual(self.pedir("PUT", f"/v1/payments/{pid}", {"status": "cancelled"}, token=b["access_token"])[0], 404)
        st, r, _ = self.pedir("PUT", f"/v1/payments/{pid}", {"status": "cancelled"}, token=a["access_token"])
        self.assertEqual((st, r["status"]), (200, "cancelled"))
        cid = self.pedir("POST", "/v1/payments", {"transaction_amount": 10, "token": "sim-card-APRO"}, token=a["access_token"])[1]["id"]
        self.assertEqual(self.pedir("PUT", f"/v1/payments/{cid}", {"status": "cancelled"}, token=a["access_token"])[0], 400)   # aprovado não cancela
        self.assertEqual(self.pedir("POST", f"/v1/payments/{cid}/refunds", {}, token=b["access_token"])[0], 404)
        st, r, _ = self.pedir("POST", f"/v1/payments/{cid}/refunds", {}, token=a["access_token"])
        self.assertEqual((st, r["payment_id"]), (201, cid))
        self.assertEqual(self.adm("/_recurso", {"tipo": "payment", "id": cid})["status"], "refunded")
        self.assertEqual(self.pedir("POST", f"/v1/payments/{cid}/refunds", {}, token=a["access_token"])[0], 400)   # já estornado
        trocadas = API.mutacoes_trocadas(self.pedidos())
        self.assertEqual([(x["metodo"], x["status"]) for x in trocadas], [("PUT", 404), ("POST", 404)])   # as tentativas com o token de outro

    def test_status_pelo_e2e_e_recurso(self) -> None:
        pid = self.pix(self.par()["access_token"])[1]["id"]
        r = self.adm("/_status", {"tipo": "payment", "id": pid, "status": "approved"})
        self.assertEqual((r["status"], r["status_detail"]), ("approved", "accredited"))
        self.assertTrue(r["date_approved"])
        self.assertEqual(self.pedir("POST", "/_recurso", {"tipo": "payment", "id": "1"})[0], 404)


class AutomaticasTest(SimuladorBase):
    def assinar(self, token: str, cartao: bool = True) -> tuple[int, dict]:
        corpo = {"reason": "Physiq — mensalidade", "external_reference": "physiq:staging:aluno:x:recorrente", "payer_email": "c@example.com",
                 "auto_recurring": {"frequency": 1, "frequency_type": "months", "transaction_amount": 10, "currency_id": "BRL"},
                 "back_url": "https://exemplo", "notification_url": "https://exemplo/aviso", "status": "authorized" if cartao else "pending"}
        if cartao:
            corpo["card_token_id"] = "sim-card-APRO"
        st, r, _ = self.pedir("POST", "/preapproval", corpo, token=token)
        return st, r

    def test_assinar_com_cartao_e_pendente_e_o_id_que_a_funcao_aceita(self) -> None:
        tok = self.par()["access_token"]
        st, r = self.assinar(tok)
        self.assertEqual((st, r["status"], r["collector_id"]), (201, "authorized", SIM.VENDEDOR_A))
        self.assertRegex(r["id"], r"^[A-Za-z0-9]{1,64}$")   # idDoAvisoValido do preapproval
        self.assertFalse(r["id"].startswith("sim-"))          # não é a "simulada" da pagamentos-aluno
        st, r = self.assinar(tok, cartao=False)
        self.assertEqual((st, r["status"]), (201, "pending"))
        self.assertIn("preapproval_id=", r["init_point"])
        criar = [x for x in self.pedidos() if x["caminho"] == "/preapproval"][0]
        self.assertEqual(criar["corpo"]["card_token_id"], SIM.OCULTO)
        self.assertTrue(str(criar["recurso_id"]).startswith("2c938084"))

    def test_sandbox_recusa_o_cartao(self) -> None:
        self.adm("/_cenario", {"preapproval_cartao_sandbox": True})
        st, r = self.assinar(self.par()["access_token"])
        self.assertEqual(st, 404)
        self.assertIn("card token service not found", r["message"].lower())   # o recusaDoSandbox (MENOR 28)

    def test_put_cancela_troca_valor_e_a_recusa_do_cenario(self) -> None:
        a, b = self.par(SIM.VENDEDOR_A), self.par(SIM.VENDEDOR_B)
        pre = self.assinar(a["access_token"])[1]["id"]
        self.assertEqual(self.pedir("GET", f"/preapproval/{pre}", token=b["access_token"])[0], 404)
        st, r, _ = self.pedir("PUT", f"/preapproval/{pre}", {"auto_recurring": {"transaction_amount": 12, "currency_id": "BRL"}}, token=a["access_token"])
        self.assertEqual((st, r["auto_recurring"]["transaction_amount"]), (200, 12))
        self.adm("/_cenario", {"cancelar_preapproval_status": 400})
        self.assertEqual(self.pedir("PUT", f"/preapproval/{pre}", {"status": "cancelled"}, token=a["access_token"])[0], 400)
        self.assertEqual(self.pedir("GET", f"/preapproval/{pre}", token=a["access_token"])[1]["status"], "authorized")   # nada mudou (I11)
        self.adm("/_cenario", {})
        self.assertEqual(self.pedir("PUT", f"/preapproval/{pre}", {"status": "cancelled"}, token=b["access_token"])[0], 404)
        st, r, _ = self.pedir("PUT", f"/preapproval/{pre}", {"status": "cancelled"}, token=a["access_token"])
        self.assertEqual((st, r["status"]), (200, "cancelled"))

    def test_cobranca_mensal_sem_aviso_e_a_busca(self) -> None:
        a, b = self.par(SIM.VENDEDOR_A), self.par(SIM.VENDEDOR_B)
        pre = self.assinar(a["access_token"])[1]["id"]
        m1 = self.adm("/_cobranca_mensal", {"preapproval_id": pre})
        r = self.adm("/_cenario", {"cobranca_mensal": pre})                  # o jeito do plano: o cenário cria uma
        m2 = r["cobranca_mensal"]
        st, busca, _ = self.pedir("GET", f"/authorized_payments/search?preapproval_id={pre}&sort=date_created&criteria=desc&limit=6",
                                  token=a["access_token"])
        self.assertEqual(st, 200)
        ids = [x["payment"]["id"] for x in busca["results"]]
        self.assertEqual(set(ids), {m1["pagamento"]["id"], m2["pagamento"]["id"]})
        pay = self.pedir("GET", f"/v1/payments/{ids[0]}", token=a["access_token"])[1]
        self.assertEqual((pay["status"], pay["collector_id"], pay["metadata"]["preapproval_id"]), ("approved", SIM.VENDEDOR_A, pre))
        self.assertEqual(pay["point_of_interaction"]["transaction_data"]["subscription_id"], pre)
        self.assertEqual(pay["external_reference"], "physiq:staging:aluno:x:recorrente")   # a da automática
        self.assertEqual(self.pedir("GET", f"/authorized_payments/search?preapproval_id={pre}", token=b["access_token"])[0], 404)
        ap = m1["autorizado"]["id"]
        st, r, _ = self.pedir("GET", f"/authorized_payments/{ap}", token=a["access_token"])
        self.assertEqual((st, r["payment"]["id"]), (200, m1["pagamento"]["id"]))
        self.assertEqual(self.pedir("GET", f"/authorized_payments/{ap}", token=b["access_token"])[0], 404)

    def test_preapproval_e_checkout_pelo_e2e(self) -> None:
        pre = self.adm("/_preapproval", {"collector_id": SIM.VENDEDOR_A, "status": "pending", "valor": 10})
        self.assertEqual((pre["status"], pre["collector_id"]), ("pending", SIM.VENDEDOR_A))
        st, r, _ = self.pedir("POST", "/checkout/preferences", {"items": [], "external_reference": "x"}, token=self.par()["access_token"])
        self.assertEqual(st, 201)
        self.assertIn("pref_id=", r["init_point"])


class AvisarTest(SimuladorBase):
    """O /_avisar manda o aviso a um webhook local — aqui, um servidor de mentira que guarda o que chegou."""

    def setUp(self) -> None:
        super().setUp()
        recebidos: list = []
        self.recebidos = recebidos

        class Pegar(BaseHTTPRequestHandler):
            def log_message(self, *_a) -> None:
                pass

            def do_POST(self) -> None:  # noqa: N802
                corpo = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                recebidos.append({"caminho": self.path, "cab": {k.lower(): v for k, v in self.headers.items()}, "corpo": json.loads(corpo)})
                dados = json.dumps({"ok": True, "resultado": "pego"}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

        self.pega = ThreadingHTTPServer(("127.0.0.1", 0), Pegar)
        threading.Thread(target=self.pega.serve_forever, daemon=True).start()

    def tearDown(self) -> None:
        self.pega.shutdown()
        self.pega.server_close()

    def test_aviso_com_conta_user_id_e_a_assinatura_do_manifesto(self) -> None:
        segredo, conta = "segredo-de-teste-0000000000", str(uuid.uuid4())
        r = self.adm("/_avisar", {"webhook": f"http://127.0.0.1:{self.pega.server_address[1]}/mp-webhook-aluno", "schema": "staging", "conta": conta,
                                  "tipo": "payment", "id": "70000000001", "user_id": SIM.VENDEDOR_A, "acao": "payment.created",
                                  "segredo": segredo, "ip": "10.1.2.3"})
        self.assertEqual(r, {"status": 200, "corpo": {"ok": True, "resultado": "pego"}})
        av = self.recebidos[0]
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(av["caminho"]).query)
        self.assertEqual({k: v[0] for k, v in q.items()}, {"schema": "staging", "conta": conta, "data.id": "70000000001", "type": "payment"})
        self.assertEqual((av["corpo"]["type"], av["corpo"]["action"], av["corpo"]["data"], av["corpo"]["user_id"]),
                         ("payment", "payment.created", {"id": "70000000001"}, SIM.VENDEDOR_A))
        self.assertEqual(av["cab"]["x-forwarded-for"], "10.1.2.3")
        partes = dict(x.split("=", 1) for x in av["cab"]["x-signature"].split(","))
        manifesto = f"id:70000000001;request-id:{av['cab']['x-request-id']};ts:{partes['ts']};"
        import hmac  # noqa: PLC0415

        self.assertEqual(partes["v1"], hmac.new(segredo.encode(), manifesto.encode(), hashlib.sha256).hexdigest())

    def test_sem_conta_sem_user_id_mp_connect_e_so_127(self) -> None:
        url = f"http://127.0.0.1:{self.pega.server_address[1]}/x"
        self.adm("/_avisar", {"webhook": url, "tipo": "mp-connect", "id": "1"})
        av = self.recebidos[0]
        self.assertNotIn("conta=", av["caminho"])
        self.assertNotIn("user_id", av["corpo"])
        self.assertNotIn("x-signature", av["cab"])
        self.assertEqual(av["corpo"]["action"], "application.deauthorized")
        st, r, _ = self.pedir("POST", "/_avisar", {"webhook": "https://api.mercadopago.com/x", "tipo": "payment", "id": "1"})
        self.assertEqual((st, r["message"]), (400, "webhook só em http://127.0.0.1:<porta>"))
        st, r, _ = self.pedir("POST", "/_avisar", {"webhook": "http://127.0.0.1:19/x", "tipo": "payment", "id": "1"})
        self.assertEqual((st, r["status"]), (200, 599))   # nada escutando: sem cair


class GeralTest(SimuladorBase):
    def test_cenario_troca_so_as_chaves_e_guarda_os_recursos(self) -> None:
        par = self.par()
        self.pedir("GET", "/users/me", token=par["access_token"])
        r = self.adm("/_cenario", {"negar": True, "live_mode": True})
        self.assertTrue(r["negar"])
        r = self.adm("/_cenario", {})
        self.assertEqual({k: r[k] for k in SIM.PADRAO}, SIM.PADRAO)
        self.assertEqual(len(self.pedidos()), 1)                                   # os pedidos ficam
        self.assertTrue(self.adm("/_token_info", {"token": par["access_token"]})["vivo"])   # os tokens ficam
        st, r, _ = self.pedir("POST", "/_cenario", {"inventado": 1})
        self.assertEqual(st, 400)

    def test_zerar_volta_tudo(self) -> None:
        self.par()
        self.adm("/_cenario", {"negar": True})
        self.adm("/_zerar", {})
        e = self.pedir("GET", "/_estado")[1]
        self.assertEqual((e["pedidos"], e["pagamentos"], e["vendedores"], e["cenario"]), (0, 0, [], SIM.PADRAO))

    def test_json_ruim_e_caminho_desconhecido(self) -> None:
        self.assertEqual(self.pedir("POST", "/v1/payments", bruto=b"{nao json")[0], 400)
        self.assertEqual(self.pedir("POST", "/v1/payments", bruto=b"[1]")[0], 400)
        self.assertEqual(self.pedir("GET", "/x")[0], 404)
        self.assertEqual(self.pedir("PUT", "/x", {"a": 1})[0], 404)
        self.assertEqual(self.pedir("POST", "/_token", {})[0], 400)   # sem o vendedor


class ApiPecasPurasTest(unittest.TestCase):
    def test_cada_caso_tem_funcao_e_sao_35_ou_mais(self) -> None:
        self.assertEqual(set(API.FUNCOES_STAGING), set(API.CASOS_STAGING))
        self.assertEqual(set(API.FUNCOES_LOCAL), set(API.CASOS_LOCAL))
        self.assertGreaterEqual(len(API.CASOS_STAGING) + len(API.CASOS_LOCAL), 35)
        self.assertTrue(API.SO_PEDINDO <= set(API.CASOS_STAGING))

    def test_cifra_no_formato_e_o_ad(self) -> None:
        chave = API.nova_chave()
        self.assertEqual(len(chave), 43)
        ad = API.dado_associado("c1", "access")
        self.assertEqual(ad, "physiq:w2:staging:c1:access")
        c = API.cifrar("TEST-x-0000000000", ad, chave)
        self.assertRegex(c, API.CIFRA_RX)
        self.assertEqual(API.decifrar(c, ad, chave), "TEST-x-0000000000")
        for errado in (API.dado_associado("c2", "access"), API.dado_associado("c1", "refresh"), API.dado_associado("c1", "access", "public")):
            with self.assertRaises(Exception):
                API.decifrar(c, errado, chave)
        with self.assertRaises(Exception):
            API.decifrar(c, ad, API.nova_chave())

    def test_limites_e_ip(self) -> None:
        agora = 1000.0
        self.assertFalse(API.no_limite([agora - i for i in range(54)], agora, *API.LIMITE_GERAL))
        self.assertTrue(API.no_limite([agora - i * 0.5 for i in range(55)], agora, *API.LIMITE_GERAL))
        self.assertEqual(API.LIMITES_DA_ACAO["prof_mp_conectar"], (10, 3600))
        with mock.patch.dict(API.CTX, {"ip": 0}):
            ips = [API.ip_novo() for _ in range(70_000)]
        self.assertEqual(len(set(ips)), 62_500)   # 250 × 250 únicos antes de dar a volta (sobra para a rodada inteira)
        self.assertTrue(all(ip.startswith("10.13.") for ip in ips))

    def test_janelas_e_mutacoes(self) -> None:
        ps = [{"n": 0, "metodo": "GET", "caminho": "/v1/payments/1", "token_nome": "conta_1", "token_de": 1, "recurso_de": 1, "status": 200},
              {"n": 1, "metodo": "POST", "caminho": "/oauth/token", "token_nome": None, "token_de": None, "recurso_de": 1, "status": 200},
              {"n": 2, "metodo": "PUT", "caminho": "/v1/payments/1", "token_nome": "conta_1", "token_de": 1, "recurso_de": 1, "status": 200},
              {"n": 3, "metodo": "POST", "caminho": "/v1/payments/9/refunds", "token_nome": "physiq_teste", "token_de": 5, "recurso_de": 1, "status": 404},
              # o recurso que o simulador não conhece (404 sem dono): fora da conta — nem trocado, nem mutação de outro dono
              {"n": 4, "metodo": "PUT", "caminho": "/preapproval/x", "token_nome": "physiq_teste", "token_de": 5, "recurso_de": None, "status": 404}]
        j = API.janelas_conferidas(ps, [{"rotulo": "a", "esperado": "conta_1", "de": 0, "ate": 3},
                                        {"rotulo": "b", "esperado": "conta_1", "de": 3, "ate": 5},
                                        {"rotulo": "c", "esperado": "conta_1", "de": 5, "ate": 5}])
        self.assertEqual([(x["pedidos"], x["trocados"]) for x in j], [(2, []), (1, ["physiq_teste"]), (0, [])])
        self.assertEqual([x["n"] for x in API.mutacoes_trocadas(ps)], [3])

    def test_desfazer_na_ordem_e_so_no_staging(self) -> None:
        est = {"paciente": "p1", "conta_id": "c1", "t0": "t", "aluno_uid": "a1", "dono_uid": "d1", "assinaturas": [],
               "conta": {"modo": "pix_manual", "bloquear": True}, "vivas": ["v1"], "flags": {"mercadopago_conta": '{"liberada": false}'},
               "jobs": {"mp-renovar-staging": True, "automaticas-fila-staging": None},
               "pacientes": {"plano_aluno_id": None, "plano_modalidade": None, "plano_valor_negociado": None, "mensalidade_valor": "10",
                             "mensalidade_desde": "2026-01-01", "cobranca_pausada": False}}
        cmds = API.comandos_do_desfazer(est)
        ordem = [next(i for i, c in enumerate(cmds) if marca in c) for marca in
                 ("aluno_assinaturas", "recebimento_modo", "recebimento_integracoes", "mp_conexoes", "cobrancas where", "mensalidade_recalcular",
                  "cron.alter_job")]
        self.assertEqual(ordem, sorted(ordem))
        self.assertIn("or true", cmds[0])                              # sem automática de antes: todas as do aluno são da rodada
        self.assertEqual(sum("cron.alter_job" in c for c in cmds), 1)  # o job que não existia não é mexido
        self.assertTrue(all("staging." in c or "cron." in c for c in cmds))
        est["assinaturas"] = ["x1", "x2"]
        self.assertIn("not (id = any(array['x1', 'x2']::uuid[]))", API.comandos_do_desfazer(est)[0])

    def test_importar_nao_abre_rede(self) -> None:
        self.assertIsNone(API.B)   # a base só carrega no main
        self.assertEqual(API.PORTAS["sim"], 8798)
        self.assertNotIn(API.PORTAS["pag"], (8790, 8791, 8799))   # não colide com o --local da W1


@unittest.skipUnless(API.DENO.exists(), "sem o ~/.deno/bin/deno")
class CompativelComAsFuncoesTest(unittest.TestCase):
    """A cifra do e2e e a x-signature do simulador contra o código DAS FUNÇÕES (o Deno roda o _shared de verdade)."""

    def rodar(self, codigo: str, env: dict) -> dict:
        r = subprocess.run([str(API.DENO), "eval", "--ext=ts", codigo], capture_output=True, text=True, timeout=120, cwd=RAIZ,
                           env={**__import__("os").environ, "DENO_NO_PACKAGE_JSON": "1", **env})
        self.assertEqual(r.returncode, 0, r.stderr[-500:])
        return json.loads(r.stdout.strip().splitlines()[-1])

    def test_cifra_vai_e_volta(self) -> None:
        chave, conta = API.nova_chave(), str(uuid.uuid4())
        cifra = API.cifrar("TEST-sim-1-1-abcdef0123456789", API.dado_associado(conta, "access"), chave)
        saida = self.rodar(f"""
import {{ importarChave, decifrar, cifrar, dadoAssociado }} from "{(RAIZ / 'supabase-principal/functions/_shared/cifra-mp.ts').as_uri()}";
const e = Deno.env.toObject();
const k = await importarChave(e.W2_CHAVE);
let outra = "abriu";
try {{ await decifrar(e.W2_CIFRA, dadoAssociado("public", e.W2_CONTA, "access"), k); }} catch {{ outra = "recusou"; }}
console.log(JSON.stringify({{ aberto: await decifrar(e.W2_CIFRA, dadoAssociado("staging", e.W2_CONTA, "access"), k), outra,
  nova: await cifrar("APP_USR-volta-0000000000", dadoAssociado("staging", e.W2_CONTA, "refresh"), k) }}));
""", {"W2_CHAVE": chave, "W2_CIFRA": cifra, "W2_CONTA": conta})
        self.assertEqual(saida["aberto"], "TEST-sim-1-1-abcdef0123456789")
        self.assertEqual(saida["outra"], "recusou")
        self.assertEqual(API.decifrar(saida["nova"], API.dado_associado(conta, "refresh"), chave), "APP_USR-volta-0000000000")

    def test_assinatura_valida_e_invalida(self) -> None:
        segredo, rid, ts = "segredo-0000000000000000", str(uuid.uuid4()), "1700000000000"
        v1 = SIM.assinar(segredo, "70000000001", rid, ts)
        saida = self.rodar(f"""
import {{ assinaturaMp }} from "{(RAIZ / 'supabase-principal/functions/_shared/mp-conta-regras.ts').as_uri()}";
const e = Deno.env.toObject();
const cab = `ts=${{e.W2_TS}},v1=${{e.W2_V1}}`;
console.log(JSON.stringify({{
  boa: await assinaturaMp({{ cabecalho: cab, requestId: e.W2_RID, dataId: "70000000001", segredo: e.W2_SEGREDO }}),
  outro_id: await assinaturaMp({{ cabecalho: cab, requestId: e.W2_RID, dataId: "70000000002", segredo: e.W2_SEGREDO }}),
  sem: await assinaturaMp({{ cabecalho: null, requestId: e.W2_RID, dataId: "70000000001", segredo: e.W2_SEGREDO }}),
}}));
""", {"W2_TS": ts, "W2_V1": v1, "W2_RID": rid, "W2_SEGREDO": segredo})
        self.assertEqual(saida, {"boa": "valida", "outro_id": "invalida", "sem": "ausente"})

    def test_o_token_do_simulador_passa_no_lerTokenDoMp(self) -> None:
        r = SIM.Tratar._resposta_token(None, SIM.VENDEDOR_A, SIM.emitir_par(SIM.VENDEDOR_A))   # o corpo do /oauth/token
        SIM.zerar()
        saida = self.rodar(f"""
import {{ lerTokenDoMp }} from "{(RAIZ / 'supabase-principal/functions/_shared/mp-conta-regras.ts').as_uri()}";
const t = lerTokenDoMp(JSON.parse(Deno.env.get("W2_CORPO")!));
console.log(JSON.stringify(t ? {{ ok: true, userId: t.userId, renovavel: t.renovavel, chave: !!t.publicKey, live: t.live }} : {{ ok: false }}));
""", {"W2_CORPO": json.dumps(r)})
        self.assertEqual(saida, {"ok": True, "userId": SIM.VENDEDOR_A, "renovavel": True, "chave": True, "live": False})


if __name__ == "__main__":
    unittest.main()
