#!/usr/bin/env python3
"""Physiq W10 — foto da tela ANTIGA da Evolução (UserDashboard) ANTES do deploy da W10, SÓ LEITURA.

Roda contra um site que ainda tem a tela antiga (staging antes do push da W10; produção antes do merge) com a conta de
teste do Calc (teste@teste.com) e guarda o texto das 3 abas (Composição Corporal, Evolução, Registros) em
~/projetos/physiqcalc-scratch/w10/antes_<prefixo>.json + prints antes_<prefixo>_*.png — o `comparar_antigo.py` confere
depois, número a número, que a aba nova mostra tudo o que a antiga mostrava.
Uso: python3 e2e/w10/antes_userdashboard.py --base https://physiqcalc-staging.vercel.app --prefixo staging --schema staging
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--schema", default="staging")
    a = ap.parse_args()
    B.ESTADO["schema"] = a.schema
    if not B.saude_treino():
        print("Banco do Treino fora do normal — parando sem testar.")
        return 2
    saida: dict = {"base": a.base, "schema": a.schema}
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.abrir(nav, a.base, f"antes_{a.prefixo}", "antes", B.ALUNO_CALC, "/evolucao", esperar=None)
        try:
            ok = c.esperar(lambda: "Composição Corporal" in c.texto() or "COMPOSIÇÃO CORPORAL" in c.texto(), 120)
            p.check(ok, "a tela antiga (UserDashboard) abriu em /evolucao")
            c.pg.wait_for_timeout(2500)
            for aba, rotulo in (("composicao", "Composição Corporal"), ("evolucao", "Evolução"), ("registros", "Registros")):
                c.pg.locator("button", has_text=rotulo).first.click()
                c.pg.wait_for_timeout(2500)
                saida[aba] = c.pg.evaluate("() => [...document.querySelectorAll('section')].map(s => s.innerText).join('\\n')")
                c.pg.screenshot(path=str(B.PRINTS / f"antes_{a.prefixo}_{aba}.png"), full_page=True)
        finally:
            c.fim()
        nav.close()
    B.json_arquivo(B.SCRATCH / f"antes_{a.prefixo}.json", saida)
    print(f"guardado: {B.SCRATCH / f'antes_{a.prefixo}.json'}")
    for k in ("composicao", "evolucao", "registros"):
        print(f"--- {k} ---\n{saida.get(k, '')[:1500]}")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
