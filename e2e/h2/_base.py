"""Physiq H2 — base dos testes de ponta a ponta do "abrir o app pelo link do e-mail" (App Links das páginas do aluno + a faixa
"Abrir no app Physiq" no navegador do Android). Reaproveita a base da W20c (que reaproveita a da W20 → … → W5): as contas de
TESTE da "Consultoria Ferreira W13" (Rafael Moura = aluno com Treino + Nutrição e a agenda da massa da W20 no staging), a sessão
injetada no localStorage, o Caso do Playwright e o /health do Banco do Treino antes de cada bloco.

Só contas *.teste.claude@… (P26). Nenhum e-mail, push ou WhatsApp sai: os testes só abrem telas (o link chega ao app pela ponte
Android de mentira — e2e/h2/ponte_android.js — ou pela própria URL no navegador). Sem segredo no repo.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w20c", Path(__file__).parent.parent / "w20c" / "_base.py")
B20C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w20c"] = B20C
_ESPEC.loader.exec_module(B20C)  # type: ignore[union-attr]
B20, B5, B13 = B20C.B20, B20C.B5, B20C.B13

p, q = B20C.p, B20C.q
ESTADO, CONTAS = B20C.ESTADO, B20C.CONTAS
sql_principal, sessao, esperar, saude_ok, uid_de = B20C.sql_principal, B20C.sessao, B20C.esperar, B20C.saude_ok, B20C.uid_de
CHAVE_PRINCIPAL = B5.CHAVE_PRINCIPAL

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "h2"
for _b in (B20C, B20, B20.B19, B20.B19.B18, B20.B19.B17, B20.B19.B16, B20.B19.B15, B20.B19.B14, B13, B5, B13.B12, B13.B12.B11,
           B13.B12.B10, B13.B12.B8, B13.B12.B7):
    _b.PRINTS = PRINTS
PONTE = (Path(__file__).parent / "ponte_android.js").read_text(encoding="utf-8")

# o celular dos prints (o POCO F4 GT dele, Chrome do Android) e o computador
UA_ANDROID = ("Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile "
              "Safari/537.36")
UA_DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
PACOTE = "com.bertoldo.physiqcalc"
FALLBACK = "https%3A%2F%2Fgithub.com%2Fweslleybertoldo%2Fphysiqcalc%2Freleases%2Flatest"


def intent_esperado(rota: str) -> str:
    return f"intent://physiqcalc.com.br{rota}#Intent;scheme=https;package={PACOTE};S.browser_fallback_url={FALLBACK};end"
