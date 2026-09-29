#!/usr/bin/env python3
"""Physiq W4 — smoke de PRODUÇÃO (só leitura: nada é pago, criado ou mudado pela tela) com contas de TESTE, e os prints
prod_* nos tamanhos das telas aprovadas (app 390 × 3,4; painel 1280 × 883 × 2).

  boas-vindas  pessoa.teste.claude (sem conta) → Boas-vindas com o "Sou profissional" (14 dias grátis) — não cria
  vencida      prova.teste.claude (conta da prova do cartão, vencida) → tela de plano vencido → "Pagar agora" → Plano
               (escolha do plano, preço especial) — não paga
  master       admin.teste.claude (master) → Configurações › Plano do legado (tela de hoje), sem trava
Uso: python3 e2e/w04/smoke_prod.py [--base https://physiqcalc.com.br] [--casos boas-vindas,vencida,master]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import telas as T  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

T.SCHEMA = "public"
T.CONTAS.update({
    "pessoa": ("pessoa.teste.claude@physiqnutri.app", T.senha("pessoa")),
    "prova": ("prova.teste.claude@physiqnutri.app", Path.home().joinpath(".physiq-teste-prova").read_text().strip()),
})
p = T.p


def caso_boas_vindas(nav, a) -> None:
    c = T.Caso(nav, a.base, "prod", "boas-vindas", desktop=False)
    c.entrar("pessoa", "/")
    p.check(c.esperar(lambda: "/boas-vindas" in c.caminho(), 120), f"pessoa sem conta → Boas-vindas ({c.caminho()})")
    p.check(c.esperar(lambda: c.tem("[data-onboarding='CriarConta']") and "14 DIAS GRÁTIS" in c.texto().upper(), 60), "'Sou profissional' com 14 dias grátis")
    p.check(not c.tem("[data-entrada-staging]"), "produção: sem o aviso de ambiente de teste")
    c.print("boas_vindas_profissional")
    c.fim()


def caso_vencida(nav, a) -> None:
    c = T.Caso(nav, a.base, "prod", "vencida")
    c.entrar("prova", "/painel/alunos")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-plano-vencido='vencida']"), 120), "conta vencida: tela de plano vencido no lugar do painel")
    p.check("Venceu em" in c.pg.locator("[data-card-plano]").inner_text(), "card do menu 'Venceu em …'")
    c.print("plano_vencido")
    c.pg.locator("[data-plano-vencido-pagar]").click()
    p.check(c.esperar(lambda: c.tem("[data-plano-conta='vencida']") and c.tem("[data-botao-assinar]"), 90), "Plano abre para pagar (Pix, cartão, cobrança automática)")
    p.check("R$ 1,00" in c.texto().replace("\xa0", " "), "preço especial da conta da prova (R$ 1,00)")
    p.check(not c.tem("[data-simular-aprovacao]") and "AMBIENTE DE TESTE" not in c.texto().upper(), "produção: sem simulação")
    c.print("plano_vencido_pagar")
    c.fim()


def caso_master(nav, a) -> None:
    c = T.Caso(nav, a.base, "prod", "master")
    c.entrar("master", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-plano-legado='calc']") or c.tem("[data-plano-isento]"), 120), "master: Plano do legado (tela de hoje), sem cobrança nova")
    p.check(not c.tem("[data-plano-vencido]") and not c.tem("[data-faixa-aviso-plano]"), "master não trava nem recebe faixa")
    c.pg.wait_for_timeout(2500)
    c.print("master_plano")
    c.fim()


CASOS = {"boas-vindas": caso_boas_vindas, "vencida": caso_vencida, "master": caso_master}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome}", flush=True)
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = T.ATUAL.get("caso")
                if caso is not None:
                    caso.diagnostico()
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
