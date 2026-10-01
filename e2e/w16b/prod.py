#!/usr/bin/env python3
"""Physiq W16b — PRODUÇÃO (https://physiqcalc.com.br, schema public): a prova da trava de e-mail/CPF com a conta de TESTE
"Nutri Teste Claude" (nutri.teste.claude@physiqnutri.app, legado_nutri isenta, sem alunos). Nenhum dado de cliente é tocado:
  1. a nutri cadastra 1 paciente de teste pelo REST (como o site antigo do Nutri) com um e-mail de teste;
  2. o 2º paciente com o MESMO e-mail (outra caixa) e o 3º com o mesmo CPF (pontuado) são RECUSADOS pelo gatilho (P0001);
  3. paciente_dado_livre → email_livre false para esse e-mail, true para outro;
  4. no Physiq (painel › Alunos › Novo aluno) o e-mail repetido mostra a mensagem vermelha embaixo do campo (print) e
     "Cadastrar aluno" não grava;
  5. no fim o paciente de teste é apagado e as contagens antes/depois provam que nada mais mudou.
Uso: python3 e2e/w16b/prod.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
N = B.NUTRI_LEGADO
BASE = "https://physiqcalc.com.br"
EMAIL_T = "w16b.prova.teste.claude@physiqnutri.app"
CPF_T = "86288366757"
NOME_T = "W16b Prova Prod"
MSG = "Já existe um aluno com este e-mail."


def q(sql: str) -> list:
    return B.sql_principal(sql)


def contagens() -> dict:
    return {t: q(f"select count(*)::int n from {S}.{t}")[0]["n"] for t in ("pacientes", "cadastros_pendentes", "convites", "espelho_pendencias")}


def limpar() -> int:
    return q(f"with d as (delete from {S}.pacientes where nome like 'W16b Prova Prod%' and nutricionista_id = '{B.uid(N)}' returning id) select count(*)::int n from d")[0]["n"]


def main() -> int:
    print("limpeza prévia:", limpar())
    antes = contagens()
    idn = B.uid(N)
    try:
        st, novo = B.rest_como(N, "POST", "pacientes?select=*", {"nome": NOME_T, "email": EMAIL_T, "cpf": CPF_T, "nutricionista_id": idn})
        p.check(st in (200, 201), f"[prod] a nutri de teste cadastra 1 paciente de teste pelo REST (como o site antigo) — HTTP {st}")
        st, r = B.rest_como(N, "POST", "pacientes?select=*", {"nome": NOME_T + " 2", "email": " " + EMAIL_T.upper(), "nutricionista_id": idn})
        p.check(st == 400 and isinstance(r, dict) and r.get("message") == B.ERRO_EMAIL, f"[prod] 2º com o MESMO e-mail (outra caixa) → recusado: HTTP {st} {r}")
        st, r = B.rest_como(N, "POST", "pacientes?select=*", {"nome": NOME_T + " 3", "cpf": "862.883.667-57", "nutricionista_id": idn})
        p.check(st == 400 and isinstance(r, dict) and r.get("message") == B.ERRO_CPF, f"[prod] 3º com o mesmo CPF (pontuado) → recusado: HTTP {st} {r}")
        st, r = B.rpc(N, "paciente_dado_livre", {"p_email": EMAIL_T})
        st2, r2 = B.rpc(N, "paciente_dado_livre", {"p_email": "w16b.livre.teste.claude@physiqnutri.app"})
        p.check(st == 200 and (r or {}).get("email_livre") is False and (r2 or {}).get("email_livre") is True,
                f"[prod] paciente_dado_livre: repetido → false, livre → true ({r} / {r2})")
        B.saude_ok("a tela de produção")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            c = B.Caso(nav, BASE, "prod", "prod_novo_email", desktop=True)
            try:
                c.entrar(N, "/painel/alunos", zerar=False)
                c.fechar_avisos()
                ok = c.esperar(lambda: c.tem("[data-novo-aluno-abrir]"), 90)
                p.check(ok, "[prod] /painel/alunos abriu com a conta de teste")
                c.pg.click("[data-novo-aluno-abrir]")
                c.esperar(lambda: c.tem('[data-novo-aluno="cadastrar"]'), 15)
                c.pg.fill("[data-novo-nome]", "W16b Prova Prod Tela")
                c.pg.fill("[data-novo-email]", EMAIL_T.upper())
                c.pg.keyboard.press("Tab")
                ok = c.esperar(lambda: MSG in (c.pg.locator("label:has([data-novo-email]) [data-erro-campo]").first.inner_text()
                                               if c.pg.locator("label:has([data-novo-email]) [data-erro-campo]").count() else ""), 25)
                p.check(ok, "[prod] Novo aluno: e-mail repetido → mensagem vermelha embaixo do campo")
                try:
                    c.pg.mouse.move(5, 5)
                except Exception:  # noqa: BLE001
                    pass
                c.print("trava_email")
                c.pg.click("[data-novo-cadastrar]")
                c.pg.wait_for_timeout(2500)
                n = q(f"select count(*)::int n from {S}.pacientes where nome = 'W16b Prova Prod Tela'")[0]["n"]
                p.check(n == 0, f"[prod] 'Cadastrar aluno' não grava com o e-mail repetido ({n})")
            finally:
                c.fim()
                nav.close()
    finally:
        apagados = limpar()
        depois = contagens()
        print("apagados:", apagados, "antes:", antes, "depois:", depois)
        p.check({k: v for k, v in depois.items() if k != "espelho_pendencias"} == {k: v for k, v in antes.items() if k != "espelho_pendencias"},
                f"[prod] contagens antes = depois (pacientes, cadastros_pendentes, convites): {antes} → {depois}")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
