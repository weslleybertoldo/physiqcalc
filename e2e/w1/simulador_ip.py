#!/usr/bin/env python3
"""Physiq W1 — SIMULADOR LOCAL da API da InfinitePay (só para o e2e/w1/api.py --local). Escuta só em 127.0.0.1.
  POST /links          → {"url": "https://checkout.infinitepay.io/<handle>?lenc=sim-<order_nsu>"} — o formato sondado em 11/10 — ou o
                         status/corpo do cenário (ex.: o 404 external_checkout_not_enabled)
  POST /payment_check  → a resposta do cenário: {success, paid, amount, paid_amount, installments, capture_method[, transaction_nsu]};
                         com "amarra_nsu", o transaction_nsu fora de "nsus" responde 200 {"success": false} (como o pedido que não existe —
                         sondado em 11/10); sem ele, qualquer NSU passa (o PIOR caso do C1: a InfinitePay não amarra o NSU ao pedido)
  POST /_cenario       → troca o cenário INTEIRO (o que não vier volta ao padrão) e zera a lista de pedidos
  GET  /_pedidos       → o que chegou (caminho + corpo)
Nada aqui é a InfinitePay de verdade: o que ela devolve num pagamento é conferido nos R$ 1 da Task 22 do plano da W1.
Testes (sem rede de fora): PYTHONDONTWRITEBYTECODE=1 python3 -m unittest e2e/w1/test_simulador_ip.py
Uso: python3 e2e/w1/simulador_ip.py --porta 8799
"""
from __future__ import annotations

import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PADRAO: dict = {"links_status": 200, "links_corpo": None, "check_status": 200, "check_corpo": None, "pago": True, "amount": None,
                "paid_amount": None, "installments": 1, "capture_method": "pix", "nsu": None, "nsus": [], "amarra_nsu": False}
CENARIO: dict = dict(PADRAO)
PEDIDOS: list[dict] = []
TRAVA = threading.Lock()


class Tratar(BaseHTTPRequestHandler):
    def _json(self, status: int, corpo) -> None:
        dados = json.dumps(corpo).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def log_message(self, *_a) -> None:  # silêncio: nada de corpo no terminal
        pass

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/_pedidos":
            with TRAVA:
                return self._json(200, PEDIDOS)
        return self._json(404, {})

    def do_POST(self) -> None:  # noqa: N802
        n = int(self.headers.get("Content-Length") or 0)
        try:
            corpo = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._json(400, {"message": "json"})
        if not isinstance(corpo, dict):  # as funções mandam sempre um objeto: o resto é erro do pedido, não da InfinitePay
            return self._json(400, {"message": "json"})
        with TRAVA:
            if self.path == "/_cenario":
                CENARIO.clear()
                CENARIO.update({**PADRAO, **corpo})
                PEDIDOS.clear()
                return self._json(200, CENARIO)
            PEDIDOS.append({"caminho": self.path, "corpo": corpo})
            c = dict(CENARIO)
        if self.path == "/links":
            if c["links_corpo"] is not None or c["links_status"] >= 300:
                return self._json(c["links_status"], c["links_corpo"] if c["links_corpo"] is not None else {"message": "simulado"})
            return self._json(200, {"url": f"https://checkout.infinitepay.io/{corpo.get('handle')}?lenc=sim-{corpo.get('order_nsu')}"})
        if self.path == "/payment_check":
            if c["check_corpo"] is not None:
                return self._json(c["check_status"], c["check_corpo"])
            if c["check_status"] >= 300:
                return self._json(c["check_status"], {"message": "simulado"})
            nsu = corpo.get("transaction_nsu")
            if c["amarra_nsu"] and nsu is not None and nsu not in (c["nsus"] or []):
                return self._json(200, {"success": False})
            preco = c["amount"] if c["amount"] is not None else 0
            r = {"success": True, "paid": bool(c["pago"]), "amount": preco, "paid_amount": c["paid_amount"] or preco,
                 "installments": c["installments"], "capture_method": c["capture_method"]}
            if c.get("nsu"):
                r["transaction_nsu"] = c["nsu"]
            return self._json(200, r)
        return self._json(404, {})


def servidor(porta: int) -> ThreadingHTTPServer:
    """O servidor só em 127.0.0.1 (porta 0 = uma livre — os testes)."""
    return ThreadingHTTPServer((HOST, porta), Tratar)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, default=8799)
    a = ap.parse_args()
    servidor(a.porta).serve_forever()


if __name__ == "__main__":
    main()
