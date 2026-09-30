#!/usr/bin/env python3
"""Physiq W8 — smoke de PRODUÇÃO da aba Treino nova (tela 2), SÓ LEITURA, com a conta de teste do Calc (teste@teste.com).

Nada é gravado: não dá OK em série, não troca treino, não mexe em academia nem em anotação (só abre, navega e olha). Em
produção o PowerSync lê e grava o public — por isso nenhum toque que grave.
  1. /treino abre já logado: título, faixa Seg–Dom (hoje em destaque), o dia de hoje (vazio → "Adicionar treino")
  2. volta até a semana de 13/07/2026 (a conta tem treinos lá) → o dia 16/07: card do treino, exercícios com ✓ e a miniatura
     do NOSSO GIF, a linha "3 × 10 · … · N kg"
  3. abre um exercício (séries e as 5 ações) → ficha com o GIF → histórico do exercício
  4. o calendário (Histórico): julho com os dias treinados, a lista e o detalhe de um treino
  5. o Perfil segue com o Lembrete e o Som do descanso (as chaves que a aba Treino usa)
Prints prod_* (390 × 844 × 3,4) em ~/projetos/physiqcalc-scratch/prints/w08/.
Uso: python3 e2e/w08/smoke_prod.py [--base https://physiqcalc.com.br]
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
        c = B.Caso(nav, a.base, a.prefixo, "prod_treino", desktop=False)
        # só leitura: qualquer escrita do app (PUT/PATCH/DELETE no REST do Treino) seria uma falha deste smoke
        escritas: list[str] = []
        c.pg.on("request", lambda r: escritas.append(f"{r.method} {r.url.split('?')[0][-70:]}")
                if "/rest/v1/" in r.url and "/rpc/" not in r.url and r.method in ("POST", "PATCH", "DELETE", "PUT") and "api.physiqcalc.com.br" in r.url else None)
        try:
            c.entrar(B.ALUNO, "/treino", zerar=False)
            c.fechar_avisos()
            ok = c.esperar(lambda: c.tem("[data-aba-treino]") and (c.tem("[data-cartao-treino]") or c.tem("[data-sem-treino-dia]")), 120)
            p.check(ok, "1. /treino abre já logado na aba nova (produção)")
            c.esperar(lambda: not c.tem('[data-sync="primeira"]'), 90)
            hoje = B.hoje().isoformat()
            p.check(c.pg.locator(f'[data-dia="{hoje}"][aria-current="date"]').count() == 1, "1. faixa Seg–Dom com hoje em destaque")
            p.check(c.pg.locator("[data-dia-estado]").count() == 7, "1. os 7 dias da semana")
            c.print("treino_hoje")

            B.ir_para_dia(c, DIA_JULHO)
            ok = c.esperar(lambda: c.pg.locator("[data-exercicio-id]").count() > 0, 30)
            p.check(ok, "2. 16/07/2026: o treino do dia (a conta tem treinos lá)")
            c.esperar(lambda: c.pg.locator('[data-miniatura="quadro"]').count() > 0, 20)
            p.check(c.pg.locator('[data-miniatura="quadro"]').count() > 0, "2. miniatura com o 1º quadro do NOSSO GIF e o play")
            p.check(c.tem("[data-cartao-treino]") and c.tem("[data-treino-chip]"), f"2. card do treino ({B.texto(c, '[data-treino-nome]')} · {B.texto(c, '[data-treino-chip]')})")
            p.check(c.pg.locator('[data-exercicio-estado="feito"]').count() > 0, "2. exercícios feitos com ✓")
            p.check("×" in B.texto(c, "[data-exercicio-linha]"), f"2. a linha do exercício ('{B.texto(c, '[data-exercicio-linha]')}')")
            c.pg.evaluate("window.scrollTo(0, 0)")
            c.print("treino_dia")

            ex = B.exercicios(c)[0]
            B.abrir_exercicio(c, ex)
            p.check(B.linha(c, ex).locator("[data-acao-exercicio]").count() == 5, "3. exercício aberto: Ficha, Histórico, Anotações, Trocar, Remover")
            p.check(B.linha(c, ex).locator("[data-serie]").count() > 0, "3. as séries do dia")
            c.print("exercicio_aberto")
            B.linha(c, ex).locator('[data-acao-exercicio="ficha"]').click()
            p.check(c.esperar(lambda: c.tem("[data-ficha-exercicio]"), 10), "3. a ficha do exercício")
            c.pg.wait_for_timeout(1500)
            c.print("ficha")
            c.pg.keyboard.press("Escape")
            c.pg.wait_for_timeout(400)
            B.linha(c, ex).locator('[data-acao-exercicio="historico"]').click()
            p.check(c.esperar(lambda: c.tem("[data-historico-dia]"), 10), "3. o histórico do exercício (séries por dia)")
            c.pg.keyboard.press("Escape")
            c.pg.wait_for_timeout(400)

            c.pg.locator("[data-treino-historico]").click()
            p.check(c.esperar(lambda: c.tem("[data-historico-treinos]"), 10), "4. o calendário (Histórico)")
            for _ in range(6):
                if c.pg.locator('[data-mes-rotulo]').inner_text().startswith("Julho"):
                    break
                c.pg.locator("[data-mes-anterior]").click()
                c.pg.wait_for_timeout(300)
            p.check(c.esperar(lambda: c.pg.locator('[data-cal-treinou="1"]').count() > 0, 10), "4. julho: dias treinados marcados")
            p.check(c.pg.locator("[data-historico-item]").count() > 0, "4. a lista dos treinos do mês")
            c.print("historico")
            c.pg.locator("[data-historico-item]").first.click()
            p.check(c.esperar(lambda: c.tem("[data-historico-detalhe]"), 10), "4. o detalhe do treino")
            c.print("historico_detalhe")
            c.pg.keyboard.press("Escape")
            c.pg.wait_for_timeout(400)

            c.ir("/perfil")
            ok = c.esperar(lambda: c.tem("[data-perfil-lembrete-valor]") and c.tem("[data-perfil-som-valor]"), 30)
            p.check(ok, "5. Perfil: Lembrete de treino e Som do descanso (as chaves que a aba Treino usa)")
            p.check(not escritas, f"só leitura: nenhuma escrita no REST do Treino ({escritas[:3]})")
        finally:
            c.fim()
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
