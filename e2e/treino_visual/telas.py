#!/usr/bin/env python3
"""Physiq — aba Treino: tocar no nome do treino minimiza os exercícios e o exercício com todas as séries feitas fica cinza e
riscado (pedido do Weslley, 22/10/2026, aprovado pelas fotos do protótipo).

Conta de TESTE teste@teste.com ("aluno-calc"), o treino próprio "Teste 3D" de domingo:
1. com internet (nada é gravado): tocar no nome esconde a lista (altura 0, `inert`, a setinha deitada) e tocar de novo mostra; a
   página sem rolagem lateral e o nome numa linha; ir ao Início e voltar lembra o minimizado; "Começar treino" mostra a lista;
2. SEM internet até o fim (o P20 da W8: a tela é o SQLite do aparelho; a fila morre com o contexto, nada sobe pro staging): OK em
   todas as séries de 2 exercícios → os 2 cinza e riscados (nome e linha de baixo, miniatura sem cor); o atual não.

Uso: PYTHONDONTWRITEBYTECODE=1 python3 e2e/treino_visual/telas.py --base http://localhost:8080 [--canal msedge]
Prints (390 × 844 × 3,4): ~/projetos/physiqcalc-scratch/prints/treino_visual/local_*.png
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
RAIZ = Path(__file__).resolve().parent.parent


def _carregar(nome: str, caminho: Path):
    esp = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(esp)
    sys.modules[nome] = mod
    esp.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


B8 = _carregar("_base_w08_treino_visual", RAIZ / "w08" / "_base.py")
from playwright.sync_api import sync_playwright  # noqa: E402

p = B8.p
GRUPO = "Teste 3D"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "treino_visual"
B8.B5.PRINTS = PRINTS
B8.B7.PRINTS = PRINTS
B8.PRINTS = PRINTS
SLOT = f'[data-slot-grupo="{GRUPO}"]'


def domingo() -> dt.date:
    h = B8.hoje()
    return h + dt.timedelta(days=6 - h.weekday())


def medidas(c) -> dict:
    """A lista (minimizada? inert? altura; o miolo recorta?), a setinha e a página (rolagem lateral, nome em quantas linhas)."""
    return c.pg.evaluate(
        """(slot) => {
          const s = document.querySelector(slot);
          const lista = s.querySelector('[data-exercicios-minimizados]');
          const miolo = lista.firstElementChild;
          const botao = s.querySelector('[data-treino-minimizar]');
          const nome = s.querySelector('[data-treino-nome]');
          const lh = parseFloat(getComputedStyle(nome).lineHeight);
          return {
            minimizado: lista.getAttribute('data-exercicios-minimizados'), inert: lista.inert,
            altura: Math.round(lista.getBoundingClientRect().height), recorta: getComputedStyle(miolo).overflow,
            expandido: botao.getAttribute('aria-expanded'), linhasNome: Math.round(nome.getBoundingClientRect().height / lh),
            largura: document.documentElement.scrollWidth, janela: window.innerWidth,
          };
        }""",
        SLOT,
    )


def tocar_no_nome(c) -> dict:
    c.pg.locator(f"{SLOT} [data-treino-minimizar]").click()
    c.pg.wait_for_timeout(700)  # a animação da altura (300 ms) + o recorte solto 320 ms depois de abrir
    return medidas(c)


def topo_do_cartao(c) -> None:
    c.pg.locator(f'[data-cartao-treino="{GRUPO}"]').evaluate("el => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -78); }")
    c.pg.wait_for_timeout(500)


def riscado(c, ex: str) -> dict:
    return B8.linha(c, ex).evaluate(
        """(el) => {
          const nome = el.querySelector('[data-exercicio-nome]'), sub = el.querySelector('[data-exercicio-linha]');
          const mini = el.querySelector('[data-exercicio-ficha]');
          return {
            estado: el.getAttribute('data-exercicio-estado'), nome: getComputedStyle(nome).textDecorationLine,
            sub: getComputedStyle(sub).textDecorationLine, cor: getComputedStyle(nome).color, filtro: getComputedStyle(mini).filter,
          };
        }"""
    )


def abrir(c, ex: str) -> bool:
    """Abre as séries do exercício. Sem internet o app demora (o OK leva segundos): espera até 20 s, nunca pula por demora."""
    l = B8.linha(c, ex)
    if l.get_attribute("data-aberto") != "1":
        l.locator("[data-exercicio-abrir]").click()
    return c.esperar(lambda: B8.linha(c, ex).get_attribute("data-aberto") == "1", 20)


def ok_em_todas(c, ex: str, peso: str) -> int:
    """Peso + OK em cada série ainda aberta, pelo número da série (a "1ª aberta" muda quando o OK entra), esperando o OK aparecer
    na tela antes da próxima. A demora vai no log: sem internet, no `vite dev` deste computador, ela já era de 2 a 16 s antes da
    transação do gravar (medido em 22/10/2026: main 16,3/4,6/3,0/6,2/2,0/2,3 s × conserto 3,6/3,1/2,1/5,9/1,6/2,0 s)."""
    abrir(c, ex)
    feitas = 0
    total = B8.linha(c, ex).locator("[data-serie]").count()
    for n in range(1, total + 1):
        s = B8.linha(c, ex).locator(f'[data-serie="{n}"]')
        if s.get_attribute("data-serie-feita") is not None:
            continue
        campo = s.locator("input[aria-label^='Peso']")
        campo.fill(peso)
        campo.blur()
        c.pg.wait_for_timeout(300)
        t0 = time.time()
        s.locator("[data-serie-ok]").click(delay=100)
        ok = c.esperar(lambda: B8.linha(c, ex).locator(f'[data-serie="{n}"][data-serie-feita]').count() > 0, 20, passo=0.1)
        p.check(ok, f"{ex[:8]} S{n}: o OK aparece na tela ({time.time() - t0:.2f} s)")
        feitas += ok
        c.esperar(lambda: c.tem("[data-descanso-pular]"), 3, passo=0.2)
        B8.pular_descanso(c)
    if B8.linha(c, ex).get_attribute("data-aberto") == "1":
        B8.linha(c, ex).locator("[data-exercicio-abrir]").click()
        c.pg.wait_for_timeout(400)
    return feitas


def caso_local(nav, base: str) -> None:
    desde = B8.agora_iso()
    dia = domingo()
    c = B8.abrir_treino(nav, base, "local", "aluno")
    try:
        B8.ir_para_dia(c, dia)
        ok = c.esperar(lambda: c.pg.locator(f"{SLOT} [data-exercicio-id]").count() > 2, 40)
        p.check(ok, f"o treino \"{GRUPO}\" de domingo ({dia:%d/%m}) com 3+ exercícios")
        if not ok:
            return
        # as séries (a memória do último treino) chegam depois dos exercícios: o card sai com "0 séries" até lá
        c.esperar(lambda: not B8.texto(c, f"{SLOT} [data-treino-series]").startswith("0 "), 40)

        # 1. minimizar e mostrar pelo nome (com internet: nada é gravado)
        m = medidas(c)
        p.check(m["minimizado"] == "0" and not m["inert"] and m["expandido"] == "true" and m["altura"] > 100,
                f"abre com a lista à mostra ({m})")
        p.check(m["recorta"] == "visible", f"aberta, a lista não recorta (o brilho do exercício atual fica inteiro): {m['recorta']}")
        m = tocar_no_nome(c)
        p.check(m["minimizado"] == "1" and m["inert"] and m["expandido"] == "false", f"tocar no nome minimiza a lista ({m})")
        p.check(m["altura"] == 0, f"minimizada, a lista some (altura {m['altura']})")
        p.check(m["largura"] <= m["janela"] and m["linhasNome"] == 1,
                f"sem rolagem lateral e o nome numa linha ({m['largura']}/{m['janela']}, {m['linhasNome']} linha)")
        topo_do_cartao(c)
        print("   print:", c.print("1_minimizado"))
        c.pg.locator('[data-tabbar] [data-aba="inicio"]').click()
        c.esperar(lambda: c.tem("[data-aba-inicio]"), 20)
        c.pg.locator('[data-tabbar] [data-aba="treino"]').click()
        c.esperar(lambda: c.tem("[data-aba-treino]"), 20)
        B8.ir_para_dia(c, dia)
        c.esperar(lambda: c.pg.locator(f"{SLOT} [data-treino-minimizar]").count() > 0, 20)
        m = medidas(c)
        p.check(m["minimizado"] == "1" and m["altura"] == 0, f"ir ao Início e voltar: o treino continua minimizado ({m['minimizado']}, {m['altura']})")
        m = tocar_no_nome(c)
        p.check(m["minimizado"] == "0" and not m["inert"] and m["expandido"] == "true" and m["altura"] > 100,
                f"tocar de novo mostra a lista ({m})")
        p.check(m["recorta"] == "visible", f"reaberta, a lista para de recortar ({m['recorta']})")
        tocar_no_nome(c)
        c.pg.locator(f"{SLOT} [data-comecar-treino]").click()
        c.pg.wait_for_timeout(700)
        m = medidas(c)
        p.check(m["minimizado"] == "0" and m["altura"] > 100, f"\"Começar treino\" mostra a lista minimizada ({m['minimizado']}, {m['altura']})")

        # 2. SEM internet até o fim: OK em todas as séries de 2 exercícios com peso → cinza e riscados
        B8.sem_internet(c)
        ids = c.pg.locator(f"{SLOT} [data-exercicio-id]").evaluate_all("els => els.map(e => e.getAttribute('data-exercicio-id'))")
        feitos: list[str] = []
        for ex in ids:
            if len(feitos) >= 2:
                break
            p.check(abrir(c, ex), f"{ex[:8]}: as séries abrem")
            if B8.linha(c, ex).locator("input[aria-label^='Peso']").count() == 0:  # corrida/prancha: fica pro próximo
                B8.linha(c, ex).locator("[data-exercicio-abrir]").click()
                c.pg.wait_for_timeout(300)
                continue
            n = ok_em_todas(c, ex, "20")
            r = riscado(c, ex)
            print(f"   {ex[:8]}: {n} OKs → {r}", flush=True)
            if r["estado"] == "feito":
                feitos.append(ex)
        p.check(len(feitos) == 2, f"OK em todas as séries de 2 exercícios ({len(feitos)})")
        for ex in feitos:
            r = riscado(c, ex)
            p.check("line-through" in r["nome"] and "line-through" in r["sub"], f"{ex[:8]} feito: nome e linha de baixo riscados ({r})")
            p.check("grayscale" in r["filtro"], f"{ex[:8]} feito: a miniatura sem cor ({r['filtro']})")
        atual = c.pg.locator(f'{SLOT} [data-exercicio-estado="atual"]')
        if atual.count():
            r = riscado(c, atual.first.get_attribute("data-exercicio-id") or "")
            p.check("line-through" not in r["nome"], f"o exercício atual não é riscado ({r['nome']})")
        nomes = [B8.linha(c, ex).locator("[data-exercicio-nome]").inner_text() for ex in feitos]
        print(f"   feitos: {nomes}", flush=True)
        # os feitos no meio da foto (com o vizinho de cima e o de baixo)
        B8.linha(c, feitos[0]).evaluate("el => el.scrollIntoView({ block: 'center' })")
        c.pg.wait_for_timeout(500)
        print("   print:", c.print("2_feitos_cinza_riscados"))
        m = tocar_no_nome(c)
        p.check(m["minimizado"] == "1" and m["altura"] == 0, f"com exercícios feitos, minimizar continua funcionando ({m['minimizado']})")
        topo_do_cartao(c)
        print("   print:", c.print("3_minimizado_com_feitos"))
        m = tocar_no_nome(c)
        p.check(m["largura"] <= m["janela"], f"reaberta, a página continua sem rolagem lateral ({m['largura']}/{m['janela']})")
        erros = [e for e in c.console if e.startswith("error") and not any(x in e for x in ("ERR_INTERNET", "Failed to fetch", "Upload", "net::"))]
        p.check(not erros, f"sem erro no console ({erros[:3]})")
    finally:
        c.fim()  # SEM voltar a internet: a fila do aparelho morre com o contexto
        B8.limpar_staging(desde, "treino_visual")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--canal", default="msedge", choices=("chromium", "msedge", "chrome"))
    a = ap.parse_args()
    B8.ESTADO["schema"] = "staging"
    PRINTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox"])
        try:
            caso_local(nav, a.base.rstrip("/"))
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
