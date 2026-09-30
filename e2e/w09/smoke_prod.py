#!/usr/bin/env python3
"""Physiq W9 — smoke de PRODUÇÃO da troca por equivalente (tela 2) e dos campos da biblioteca (tela 8), SÓ LEITURA.

Nada é gravado: abre o "Trocar", passa pelas 3 abas e fecha sem escolher; abre a academia e olha os equipamentos sem tocar;
no painel abre o formulário da biblioteca e fecha sem salvar. Em produção o PowerSync lê e grava o public — por isso nenhum
toque que grave (qualquer escrita no REST do Treino é falha deste smoke).
  1. /treino já logado (teste@teste.com) → o dia 16/07/2026 (a conta tem treino lá) → um exercício → "Trocar": as abas
     Equivalentes, Mesmo músculo e Todos, a busca; o catálogo de produção chegou classificado (equivalentes > 0)
  2. a academia do card: os 11 equipamentos (sem tocar)
  3. painel (admin.teste.claude) › Treinos › Biblioteca: movimento e equipamento na lista global e o formulário com os 3 campos
Prints prod_* em ~/projetos/physiqcalc-scratch/prints/w09/.
Uso: python3 e2e/w09/smoke_prod.py [--base https://physiqcalc.com.br]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
DIA_JULHO = dt.date(2026, 7, 16)


def vigiar_escritas(c) -> list[str]:
    escritas: list[str] = []
    c.pg.on("request", lambda r: escritas.append(f"{r.method} {r.url.split('?')[0][-70:]}")
            if "/rest/v1/" in r.url and "/rpc/" not in r.url and r.method in ("POST", "PATCH", "DELETE", "PUT") and "api.physiqcalc.com.br" in r.url else None)
    return escritas


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--prefixo", default="prod")
    a = ap.parse_args()
    B.ESTADO["schema"] = "public"
    if not B.saude_treino():
        print("Banco do Treino fora do normal — parando sem testar.")
        return 2
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.Caso(nav, a.base, a.prefixo, "prod_troca", desktop=False)
        escritas = vigiar_escritas(c)
        try:
            c.entrar(B.ALUNO, "/treino", zerar=False)
            c.fechar_avisos()
            ok = c.esperar(lambda: c.tem("[data-aba-treino]") and (c.tem("[data-cartao-treino]") or c.tem("[data-sem-treino-dia]")), 120)
            p.check(ok, "1. /treino abre já logado (produção)")
            c.esperar(lambda: not c.tem('[data-sync="primeira"]'), 90)
            B.ir_para_dia(c, DIA_JULHO)
            p.check(c.esperar(lambda: c.pg.locator("[data-exercicio-id]").count() > 0, 30), "1. 16/07/2026: o treino do dia")
            # o 1º exercício que tem equivalente no catálogo de produção
            achou = False
            for ex in B.exercicios(c):
                B.abrir_trocar(c, ex)
                n = int(B.texto(c, '[data-trocar-contagem="equivalentes"]') or 0)
                if n > 0:
                    achou = True
                    break
                B.fechar_trocar(c)
            p.check(achou, "1. o catálogo de produção chegou classificado: o 'Trocar' mostra equivalentes")
            if achou:
                p.check(B.aba_atual(c) == "equivalentes", "1. abre em Equivalentes")
                p.check(len(B.opcoes(c)) > 0, f"1. equivalentes: {[o['nome'] for o in B.opcoes(c)][:4]}")
                c.print("trocar_equivalentes")
                B.ir_aba(c, "mesmo")
                p.check(c.tem('[data-trocar-lista="mesmo"]'), "1. aba Mesmo músculo")
                c.print("trocar_mesmo_musculo")
                B.ir_aba(c, "todos")
                c.pg.locator("[data-trocar-busca]").fill("rosca martelo")
                c.pg.wait_for_timeout(500)
                nomes = [o["nome"] for o in B.opcoes(c)]
                p.check(nomes == ["Rosca Martelo com Halteres", "Rosca Martelo na Polia"], f"1. Todos com busca: {nomes}")
                c.print("trocar_todos_busca")
                B.fechar_trocar(c)
            # 2. academia (só olhar)
            c.pg.locator("[data-treino-academia]").first.click()
            p.check(c.esperar(lambda: c.tem("[data-sheet-academia]"), 8), "2. a academia abre pelo card")
            p.check(c.pg.locator("[data-equipamento]").count() in (0, 11), "2. os equipamentos da academia (11) quando há academia escolhida")
            c.print("academia_equipamentos")
            c.pg.keyboard.press("Escape")
            c.pg.wait_for_timeout(400)
            p.check(not escritas, f"só leitura: nenhuma escrita no REST do Treino ({escritas[:3]})")
        finally:
            c.fim()

        # 3. biblioteca do painel (formulário aberto e fechado sem salvar)
        c = B.B8.abrir_painel(nav, a.base, a.prefixo, "prod_biblioteca", "/painel/treinos?t=biblioteca")
        escritas = vigiar_escritas(c)
        try:
            ok = c.esperar(lambda: c.pg.get_by_role("button", name="Exercícios (").count() > 0, 60)
            p.check(ok, "3. painel › Treinos › Biblioteca abre")
            if ok:
                c.pg.get_by_role("button", name="Exercícios (").click()
                c.pg.wait_for_timeout(800)
                txt = c.texto()
                p.check("Rosca martelo" in txt and "Polia (cabo)" in txt, "3. a lista global mostra movimento e equipamento")
                c.print("biblioteca_lista")
                c.pg.keyboard.press("Escape")
                c.pg.wait_for_timeout(400)
                if c.pg.locator("[data-btn-escopo='minha']").count():
                    c.pg.locator("[data-btn-escopo='minha']").click()
                    c.pg.wait_for_timeout(400)
                if c.tem("[data-btn-criar-exercicio]"):
                    c.pg.locator("[data-btn-criar-exercicio]").click()
                    p.check(c.esperar(lambda: c.tem("[data-form-equivalencia]"), 8), "3. o formulário tem movimento, equipamento e variação")
                    c.print("biblioteca_profissional_campos")
                    c.pg.keyboard.press("Escape")
            p.check(not escritas, f"3. só leitura: nenhuma escrita ({escritas[:3]})")
        finally:
            c.fim()
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
