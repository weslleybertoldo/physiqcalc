#!/usr/bin/env python3
"""Smoke E2E — aba Treino nova (W8): a folha "Treino do dia" (a troca do treino do dia, antes o modal "Alterar Grupo") cabe
na tela, rola POR DENTRO, fecha pelo X e pelo Escape (o botão voltar do Android) sem navegar.

Bug de 03/09/2026 (celular): o modal ficava mais alto que a tela, sem rolagem, com o X e o rodapé fora de alcance; e o voltar
do Android navegava em vez de fechar. A folha nova (PainelDeslizante) tem altura máxima de 88 % da tela e rolagem interna.

Casos:
  1. abriu logado na aba Treino (o gatilho "Adicionar treino" visível)
  2. o gatilho abre a folha "Treino do dia" (descanso, treinos do profissional, meus treinos, "Montar o meu")
  3. cabe na tela (≤ 90 % da altura, topo visível) e rola por dentro quando o conteúdo passa da altura
  4. rolando até o fim, "Montar o meu" fica visível
  5. o X está dentro da tela e fecha
  6. reabre → Escape fecha e NÃO navega
  7. negativo: Escape sem folha aberta não navega nem abre nada
Só leitura: nada é gravado (a folha fecha sem escolher).

Uso: python3 scripts/smoke_ui_modal_alterar_grupo.py [--base http://localhost:5173] [--prefixo local]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w08", Path(__file__).resolve().parent.parent / "e2e" / "w08" / "_base.py")
B = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w08"] = B
_ESPEC.loader.exec_module(B)  # type: ignore[union-attr]
from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
ESCAPE_JS = "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true, cancelable: true}))"


def folha(c):
    return c.pg.locator("[data-painel='baixo']:has([data-alterar-treino])")


def rolagem(c):
    return c.pg.locator("[data-painel='baixo']:has([data-alterar-treino]) > div.overflow-y-auto")


def medir(c) -> dict:
    return folha(c).evaluate(
        """el => { const r = el.querySelector(':scope > div.overflow-y-auto'); const b = el.getBoundingClientRect();
                  return { sh: r.scrollHeight, ch: r.clientHeight, h: b.height, top: b.top, ov: getComputedStyle(r).overflowY, ih: window.innerHeight }; }""")


def abrir(c) -> None:
    gatilho = c.pg.locator("[data-sem-treino-adicionar], [data-sem-treino-escolher]").first
    if gatilho.count():
        gatilho.click()
    else:
        c.pg.locator("[data-treino-opcoes]").first.click()
        c.esperar(lambda: c.tem("[data-opcoes-treino]"), 8)
        c.pg.get_by_text("Trocar o treino do dia").click()
    c.esperar(lambda: folha(c).count() == 1, 8)
    c.pg.wait_for_timeout(500)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:5173")
    ap.add_argument("--prefixo", default="local")
    a = ap.parse_args()
    B.ESTADO["schema"] = "staging"
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.abrir_treino(nav, a.base, a.prefixo, "folha_alterar")
        try:
            rota = c.caminho()
            p.check(c.tem("[data-sem-treino-adicionar]") or c.tem("[data-treino-opcoes]"), "1. abriu logado na aba Treino (gatilho visível)")
            c.pg.set_viewport_size({"width": 430, "height": 600})
            abrir(c)
            t = folha(c).inner_text()
            p.check("Treino do dia" in t and "Sem treino neste dia" in t and "Montar o meu" in t, "2. a folha 'Treino do dia' abriu (descanso, treinos, 'Montar o meu')")
            m = medir(c)
            if m["sh"] <= m["ch"] + 20:
                alvo = max(320, int(m["h"] * 0.7))
                print(f"     a folha coube ({m['h']:.0f}px em {m['ih']}px) → viewport {alvo}px para forçar a rolagem", flush=True)
                c.pg.set_viewport_size({"width": 430, "height": alvo})
                c.pg.wait_for_timeout(400)
                m = medir(c)
            print(f"     medidas: {m}", flush=True)
            p.check(m["h"] <= m["ih"] * 0.9 + 2 and m["top"] >= 0, "3a. a folha cabe na tela (≤ 90 %, topo visível)")
            p.check(m["ov"] == "auto", "3b. rolagem própria (overflow-y auto)")
            p.check(m["sh"] > m["ch"] + 20, "3c. o conteúdo passa da altura (o cenário do bug)")
            rolagem(c).evaluate("el => { el.scrollTop = el.scrollHeight; }")
            c.pg.wait_for_timeout(300)
            box = folha(c).get_by_text("Montar o meu").bounding_box()
            p.check(box is not None and box["y"] >= 0 and box["y"] + box["height"] <= m["ih"] + 1, f"4. rolando até o fim, 'Montar o meu' fica visível (y={box['y'] if box else None})")
            c.print("folha_alterar_rolada")
            rolagem(c).evaluate("el => { el.scrollTop = 0; }")
            fechar = folha(c).locator("button[aria-label='Fechar']")
            bx = fechar.bounding_box()
            p.check(bx is not None and 0 <= bx["y"] <= m["ih"], "5a. o X está dentro da tela")
            fechar.click()
            c.pg.wait_for_timeout(500)
            p.check(folha(c).count() == 0, "5b. o X fechou")
            abrir(c)
            c.pg.evaluate(ESCAPE_JS)
            c.pg.wait_for_timeout(500)
            p.check(folha(c).count() == 0, "6a. Escape fechou a folha")
            p.check(c.caminho() == rota, f"6b. não navegou (continua em {rota})")
            c.pg.evaluate(ESCAPE_JS)
            c.pg.wait_for_timeout(300)
            p.check(folha(c).count() == 0 and c.caminho() == rota, "7. negativo: Escape sem folha não navega nem abre nada")
        finally:
            c.fim()
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
