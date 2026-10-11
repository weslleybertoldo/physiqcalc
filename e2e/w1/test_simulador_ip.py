#!/usr/bin/env python3
"""Testes do SIMULADOR local da InfinitePay (e2e/w1/simulador_ip.py), sem rede de fora: o servidor sobe numa porta livre de 127.0.0.1
nesta mesma execução. Junto, as peças puras do e2e/w1/api.py que o plano não trazia (o limite de links da instância, o DESLIGADO de 11/10)
— importar o api.py não abre rede nem lê senha (a base dos E2E só carrega no main).
Rodar:  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w1/test_simulador_ip.py"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import api as API  # noqa: E402
import simulador_ip as SIM  # noqa: E402


class SimuladorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.srv = SIM.servidor(0)
        cls.porta = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.srv.shutdown()
        cls.srv.server_close()

    def pedir(self, metodo: str, caminho: str, corpo=None, bruto: bytes | None = None) -> tuple[int, object]:
        dados = bruto if bruto is not None else (None if corpo is None else json.dumps(corpo).encode())
        req = urllib.request.Request(f"http://127.0.0.1:{self.porta}{caminho}", data=dados, method=metodo,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            try:
                return e.code, json.loads(e.read() or b"null")
            finally:
                e.close()

    def cenario(self, **c) -> dict:
        st, r = self.pedir("POST", "/_cenario", c)
        self.assertEqual(st, 200)
        return r

    def check(self, **corpo) -> tuple[int, object]:
        return self.pedir("POST", "/payment_check", {"handle": "physiq.simulador", "order_nsu": "c-1", **corpo})

    def setUp(self) -> None:
        self.cenario()

    # ── onde escuta e o cenário ──

    def test_escuta_so_no_127(self) -> None:
        self.assertEqual(SIM.HOST, "127.0.0.1")
        self.assertEqual(self.srv.server_address[0], "127.0.0.1")

    def test_cenario_inteiro_volta_ao_padrao_e_zera_os_pedidos(self) -> None:
        r = self.cenario(pago=False, amarra_nsu=True, nsus=["A"])
        self.assertIs(r["pago"], False)
        self.pedir("POST", "/links", {"handle": "h1", "order_nsu": "c-1"})
        self.assertEqual(len(self.pedir("GET", "/_pedidos")[1]), 1)
        self.assertEqual(self.cenario(), SIM.PADRAO)
        self.assertEqual(self.pedir("GET", "/_pedidos"), (200, []))
        st, r = self.check(transaction_nsu="B")
        self.assertEqual((st, r["paid"]), (200, True))   # o amarra_nsu e o "não pago" de antes não ficaram

    def test_pedidos_guardam_caminho_e_corpo_na_ordem(self) -> None:
        link = {"handle": "h1", "items": [{"quantity": 1, "price": 1000, "description": "x"}], "order_nsu": "c-1"}
        conf = {"handle": "h1", "order_nsu": "c-1", "transaction_nsu": "N1", "slug": "s1"}
        self.pedir("POST", "/links", link)
        self.pedir("POST", "/payment_check", conf)
        self.assertEqual(self.pedir("GET", "/_pedidos"),
                         (200, [{"caminho": "/links", "corpo": link}, {"caminho": "/payment_check", "corpo": conf}]))

    # ── /links ──

    def test_links_no_formato_sondado(self) -> None:
        st, r = self.pedir("POST", "/links", {"handle": "physiq.simulador", "order_nsu": "abc-1"})
        self.assertEqual(st, 200)
        self.assertEqual(r, {"url": "https://checkout.infinitepay.io/physiq.simulador?lenc=sim-abc-1"})
        self.assertRegex(r["url"], API.HOST_IP)   # o mesmo HOST_IP das regras (urlDaInfinitePay): a função aceita a url

    def test_links_checkout_desligado_como_em_11_10(self) -> None:
        self.cenario(links_status=404, links_corpo=API.DESLIGADO)
        self.assertEqual(self.pedir("POST", "/links", {"handle": "h", "order_nsu": "c-1"}), (404, API.DESLIGADO))

    def test_links_fora_do_ar(self) -> None:
        self.cenario(links_status=503)
        self.assertEqual(self.pedir("POST", "/links", {"handle": "h", "order_nsu": "c-1"}), (503, {"message": "simulado"}))

    # ── /payment_check ──

    def test_pago_com_o_que_o_cenario_manda(self) -> None:
        self.cenario(amount=1000, paid_amount=1045, installments=3, capture_method="credit_card")
        st, r = self.check(transaction_nsu="N1", slug="s1")
        self.assertEqual(st, 200)
        self.assertEqual(r, {"success": True, "paid": True, "amount": 1000, "paid_amount": 1045, "installments": 3,
                             "capture_method": "credit_card"})   # sem transaction_nsu: a doc não mostra

    def test_nao_pago_e_o_valor_pago_igual_ao_preco(self) -> None:
        self.cenario(pago=False, amount=1000)
        self.assertEqual(self.check(transaction_nsu="N1")[1],
                         {"success": True, "paid": False, "amount": 1000, "paid_amount": 1000, "installments": 1, "capture_method": "pix"})

    def test_nsu_na_resposta_quando_o_cenario_traz(self) -> None:
        self.cenario(amount=100, nsu="REAL-1")
        self.assertEqual(self.check()[1]["transaction_nsu"], "REAL-1")

    def test_amarra_nsu_recusa_o_inventado_e_aceita_o_certo_e_so_o_pedido(self) -> None:
        self.cenario(amount=1000, nsus=["A"], amarra_nsu=True)
        self.assertEqual(self.check(transaction_nsu="B"), (200, {"success": False}))   # como o pedido que não existe (11/10)
        self.assertIs(self.check(transaction_nsu="A")[1]["paid"], True)
        self.assertIs(self.check()[1]["paid"], True)   # W1-B2: só pelo pedido

    def test_sem_amarrar_qualquer_nsu_passa_o_pior_caso_do_c1(self) -> None:
        self.cenario(amount=1000)
        self.assertIs(self.check(transaction_nsu="QUALQUER")[1]["paid"], True)

    def test_check_fora_do_ar_e_desligado(self) -> None:
        self.cenario(check_status=503)
        self.assertEqual(self.check(transaction_nsu="N"), (503, {"message": "simulado"}))
        self.cenario(check_status=404, check_corpo=API.DESLIGADO)
        self.assertEqual(self.check(transaction_nsu="N"), (404, API.DESLIGADO))

    # ── o que não é pedido ──

    def test_json_ruim_ou_que_nao_e_objeto_400_e_nao_conta(self) -> None:
        self.assertEqual(self.pedir("POST", "/links", bruto=b"{nao json"), (400, {"message": "json"}))
        self.assertEqual(self.pedir("POST", "/links", bruto=b"[1, 2]"), (400, {"message": "json"}))
        self.assertEqual(self.pedir("GET", "/_pedidos"), (200, []))

    def test_caminho_desconhecido_404(self) -> None:
        self.assertEqual(self.pedir("GET", "/x"), (404, {}))
        self.assertEqual(self.pedir("POST", "/x", {"a": 1}), (404, {}))


class ApiPecasPurasTest(unittest.TestCase):
    def test_limite_de_links_da_instancia(self) -> None:
        agora = 10_000.0
        self.assertFalse(API.links_no_limite([agora - i for i in range(9)], agora))
        self.assertTrue(API.links_no_limite([agora - i for i in range(10)], agora))
        # o que tem mais de 10 min não conta (a janela do permitido da pagamentos-aluno)
        self.assertFalse(API.links_no_limite([agora - 601] + [agora - i for i in range(9)], agora))
        self.assertEqual((API.LINKS_POR_JANELA, API.JANELA_LINKS_S), (10, 600))

    def test_desligado_e_o_de_11_10(self) -> None:
        self.assertEqual(API.DESLIGADO["error"], "external_checkout_not_enabled")
        self.assertEqual(API.DESLIGADO["redirect_url"], API.ATIVAR)
        self.assertRegex(API.ATIVAR, API.HOST_IP)

    def test_cada_caso_tem_funcao(self) -> None:
        self.assertEqual(set(API.FUNCOES), set(API.CASOS_STAGING) | set(API.CASOS_LOCAL))
        self.assertTrue(API.PRECISAM_DA_TAG <= set(API.CASOS_STAGING))

    def test_conta_do_estado_pelo_id_que_a_foto_nao_cobre(self) -> None:
        # a 1ª rodada de 11/10 quebrou no desfazer: {"conta": <id>, **foto} — a foto tem "conta" (forma e bloqueio) e cobria o id
        est = {"paciente": "p1", "conta_id": "c1", "conta": {"modo": "pix_manual", "bloquear": False}}
        with mock.patch.object(API, "um", side_effect=AssertionError("não devia ir ao banco")):
            self.assertEqual(API.conta_do_estado(est), "c1")

    def test_lit(self) -> None:
        self.assertEqual(API.lit(None), "null")
        self.assertEqual(API.lit("a'b"), "'a''b'")

    def test_tag_de_teste(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            arq = Path(d) / "tag"
            with mock.patch.object(API, "ARQ_TAG", arq):
                self.assertIsNone(API.tag_de_teste())
                arq.write_text("  $Physiq.Teste_1 \n", encoding="utf-8")
                self.assertEqual(API.tag_de_teste(), "physiq.teste_1")
                arq.write_text("x", encoding="utf-8")
                self.assertIsNone(API.tag_de_teste())


if __name__ == "__main__":
    unittest.main()
