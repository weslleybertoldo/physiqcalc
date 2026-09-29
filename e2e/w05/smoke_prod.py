#!/usr/bin/env python3
"""Physiq W5 — smoke de PRODUÇÃO (só leitura: nada é salvo, convidado ou removido) com a conta de TESTE do master
(admin.teste.claude, conta legado_calc isenta), no mínimo de trocas de token (o Banco do Treino é uma VM Nano), e os prints
prod_* no tamanho das telas aprovadas (painel 1280 × 883 × 2 = 2560 × 1766).

  configuracoes  Perfil, Conta, Equipe (legado: o aviso, sem convidar), Convite (o código de hoje) e Aplicativo (a versão)
                 abrem; a página antiga do Treino (Alunos) abre com a sessão do Treino — 1 troca de token
  sem-treino     a trocar-token simulada em 429 NO NAVEGADOR (o pedido nem sai): Configurações abre e a página do Treino
                 mostra "Sem conexão com o Treino" — 0 troca de verdade
Uso: python3 e2e/w05/smoke_prod.py [--base https://physiqcalc.com.br] [--casos configuracoes,sem-treino] [--versao v3.4]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from sem_treino import interceptar  # noqa: E402

p = B.p


def caso_configuracoes(nav, a) -> None:
    c = B.Caso(nav, a.base, "prod", "configuracoes")
    c.entrar("master", "/painel/configuracoes/perfil", zerar=False)
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-form-perfil]"), 120), "Perfil do profissional (tela 8) com os dados de hoje")
    p.check(c.pg.locator("[data-perfil-nome]").input_value().strip() != "", "nome preenchido")
    c.print("perfil")
    c.pg.locator("[data-aba-config='conta']").click()
    p.check(c.esperar(lambda: c.tem("[data-form-conta]"), 60), "Conta (nome e resumo)")
    c.print("conta")
    c.pg.locator("[data-aba-config='equipe']").click()
    p.check(c.esperar(lambda: c.tem("[data-equipe-bloqueio='conta_legada']"), 60), "Equipe da conta legada: lista com o dono e o aviso (sem convidar)")
    p.check(not c.tem("[data-equipe-convidar]"), "legado: sem o botão de convidar")
    c.print("equipe_legado")
    c.pg.locator("[data-aba-config='convite']").click()
    p.check(c.esperar(lambda: c.tem("[data-convite-codigo]"), 60), "Convite com o código")
    cod = c.pg.locator("[data-convite-codigo]").inner_text().strip()
    link = c.pg.locator("[data-convite-link]").input_value()
    p.check(cod.startswith("PROF-") and link == f"https://physiqcalc.com.br/?prof={cod}", f"código e link de hoje ({cod} · {link})")
    c.print("convite")
    c.pg.locator("[data-aba-config='aplicativo']").click()
    p.check(c.esperar(lambda: c.tem("[data-secao='app-android']"), 60), "Aplicativo: card Android")
    p.check(c.esperar(lambda: a.versao in c.pg.locator("[data-secao='app-android']").inner_text(), 30), f"a release mais nova é a {a.versao}")
    c.print("aplicativo")
    c.ir("/painel/alunos")
    p.check(c.esperar(lambda: c.tem("[data-pagina-alunos]") and (c.tem("[data-aluno-linha]") or c.tem("[data-alunos-vazio]")), 120),
            "página antiga do Treino (Alunos) abre com a sessão do Treino e a lista carregada")
    p.check(len(c.trocas) <= 1, f"uma troca de token só ({len(c.trocas)})")
    c.print("painel_alunos")
    c.fim()


def caso_sem_treino(nav, a) -> None:
    c = B.Caso(nav, a.base, "prod", "sem-treino")
    interceptar(c, "limite")
    c.entrar("master", "/painel/configuracoes/perfil", zerar=False)
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-form-perfil]"), 120), "troca em 429 (simulada): Configurações › Perfil abre")
    p.check(not c.tem("[data-carregando-tela]"), "o painel não trava inteiro")
    c.ir("/painel/alunos")
    p.check(c.esperar(lambda: c.tem("[data-sem-treino='limite']"), 90), "página do Treino: 'Sem conexão com o Treino' com 'Tentar de novo'")
    p.check(c.tem("[data-card-plano]"), "o menu continua")
    c.print("sem_treino")
    c.fim()


CASOS = {"configuracoes": caso_configuracoes, "sem-treino": caso_sem_treino}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--versao", default="v3.4", help="a release mais nova que a aba Aplicativo tem de mostrar")
    a = ap.parse_args()
    B.ESTADO["schema"] = "public"
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome}", flush=True)
            t0 = time.time()
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = B.ESTADO.get("caso")
                if caso is not None:
                    caso.diagnostico()
            print(f"   ({time.time() - t0:.0f} s)", flush=True)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
