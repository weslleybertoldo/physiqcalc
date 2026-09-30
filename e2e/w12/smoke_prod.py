#!/usr/bin/env python3
"""Physiq W12 — smoke de PRODUÇÃO da aba Início (tela 1), SÓ LEITURA, com a conta de teste do Calc (teste@teste.com).

Nada é gravado: um vigia falha se a tela gravar qualquer coisa no REST dos 2 bancos (só as funções de leitura passam); não toca
em ⇄, em ✓ nem em "Começar treino" (o cronômetro é só do aparelho, mas não precisa). Em produção o PowerSync lê e grava o public.
  1. "/" abre já logado NO INÍCIO (a abertura do app): saudação, busca, sino, barra Início · Treino · … · Perfil
  2. os cards da conta (só Treino: sem dieta nem metas) e cada número × a aba que ele abre (o "N de M" × a faixa da aba Treino;
     o peso × o card Peso da Evolução)
  3. a busca acha os exercícios dos treinos dele (sem gravar nada)
  4. os links de antes (/treinos, /avaliacao, /app) e o rodapé do Perfil com a versão da release
Prints prod_* (390 × 844 × 3,4) em ~/projetos/physiqcalc-scratch/prints/w12/.
Uso: python3 e2e/w12/smoke_prod.py [--base https://physiqcalc.com.br] [--versao 3.14]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
import telas as T  # noqa: E402

p = B.p
ESCRITAS: list[str] = []
LEITURAS_OK = ("/rpc/minha_dieta", "/rpc/minha_situacao", "/rpc/minha_evolucao", "/rpc/meu_perfil_aluno", "/rpc/minha_agenda", "/rpc/financeiro_do_aluno",
               "/rpc/marcar_aviso_mudanca")


def vigiar(c) -> None:
    def ver(r) -> None:
        url = r.url
        if r.method in ("POST", "PATCH", "PUT", "DELETE") and "/rest/v1/" in url:
            if "/rest/v1/rpc/" in url and any(x in url for x in LEITURAS_OK):
                return
            ESCRITAS.append(f"{r.method} {url.split('?')[0][-80:]}")
    c.pg.on("request", ver)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--prefixo", default="prod")
    ap.add_argument("--versao", default=None, help="a versão da release (o rodapé do Perfil tem que mostrar)")
    a = ap.parse_args()
    B.ESTADO["schema"] = "public"
    if not B.saude_treino():
        print("Banco do Treino fora do normal — parando sem testar.")
        return 2
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        c = B.Caso(nav, a.base, a.prefixo, "prod_inicio", desktop=False)
        vigiar(c)
        try:
            c.entrar("aluno-calc", "/", zerar=False)
            c.fechar_avisos()
            ok = c.esperar(lambda: c.tem("[data-aba-inicio]"), 90)
            p.check(ok and c.caminho() == "/", f"1. '/' abre já logado no Início ({c.caminho()})")
            barra = T.rotulos_da_barra(c)
            p.check(barra[:1] == ["Início"] and "Perfil" in barra, f"1. barra de abas ({barra})")
            p.check(c.tem("[data-inicio-busca]") and c.tem("[data-sino]") and bool(B.txt(c, "[data-inicio-nome]")), f"1. saudação, busca e sino ({B.txt(c, '[data-inicio-nome]')})")
            tem_dieta = "Dieta" in barra
            ok = T.esperar_inicio(c, dieta=tem_dieta, timeout=120)
            p.check(ok, "2. os cards saíram do 'carregando'")
            estado_treino = B.attr(c, "[data-card-treino-hoje]", "data-card-treino-hoje")
            p.check(estado_treino in ("treino", "sem-treino", "descanso", "concluido", "rodando", "escolher"), f"2. o card do treino de hoje ({estado_treino})")
            if not tem_dieta:
                p.check(not c.tem("[data-card-dieta-hoje]") and not c.tem("[data-card-metas-hoje]"), "2. só Treino: sem os cards da dieta e das metas")
            semana = B.attr(c, "[data-treino-semana]", "data-treino-semana")
            peso = (B.attr(c, '[data-card-peso="dados"]', "data-peso-valor"), B.attr(c, '[data-card-peso="dados"]', "data-peso-variacao"))
            print(f"   treino={estado_treino} semana={semana} peso={peso} consulta={B.attr(c, '[data-card-consulta]', 'data-card-consulta')}", flush=True)
            B.foto(c, "inicio")
            # o "N de M" × a faixa da aba Treino (quando a semana tem treino)
            T.aba(c, "Treino")
            c.esperar(lambda: c.tem("[data-faixa-semana]"), 60)
            c.esperar(lambda: not c.tem('[data-sync="primeira"]'), 90)
            c.pg.wait_for_timeout(1000)
            feitos = B.attr(c, "[data-semana-feitos]", "data-semana-feitos") or "0"
            dias = c.pg.evaluate("() => [...document.querySelectorAll('[data-dia]')].filter(d => !d.getAttribute('aria-label').includes('sem treino') || d.getAttribute('data-dia-estado') === 'feito').length")
            if semana:
                p.check(semana == f"{feitos}/{dias}", f"2. 'N de M na semana' ({semana}) = a faixa da aba Treino ({feitos}/{dias})")
            else:
                p.check(dias == 0 and feitos == "0", f"2. sem treino na semana: o card não mostra 'N de M' e a faixa também não tem ({feitos}/{dias})")
            # o peso × a Evolução
            T.aba(c, "Evolução")
            c.esperar(lambda: c.tem("[data-aba-evolucao]") and not c.tem('[data-aba-evolucao="carregando"]'), 60)
            c.pg.wait_for_timeout(800)
            if peso[0]:
                ev = (B.attr(c, '[data-kpi-evolucao="peso"]', "data-kpi-valor"), B.attr(c, '[data-kpi-evolucao="peso"] [data-kpi-variacao]', "data-kpi-variacao"))
                p.check(ev == peso, f"2. o peso do Início {peso} = o card Peso da Evolução {ev}")
            else:
                p.check(not c.tem('[data-kpi-evolucao="peso"]') or not B.attr(c, '[data-kpi-evolucao="peso"]', "data-kpi-valor"), "2. sem peso no Início e sem peso na Evolução")
            # a busca (exercícios dos treinos dele)
            T.aba(c, "Início")
            c.esperar(lambda: c.tem("[data-aba-inicio]"), 30)
            c.pg.locator("[data-inicio-busca]").click()
            p.check(c.esperar(lambda: c.tem("[data-paleta-busca]"), 20), "3. a busca abre")
            c.pg.locator("[data-paleta-busca] input").fill("supino")
            achou = c.esperar(lambda: c.pg.locator("[cmdk-item]").count() > 0 or c.tem("[data-busca-vazia]"), 20)
            itens = c.pg.locator("[cmdk-item]").evaluate_all("els => els.map(e => e.textContent)")
            p.check(achou, f"3. 'supino' na busca: {itens[:4] or 'nada no plano dele'}")
            B.foto(c, "inicio_busca")
            c.pg.keyboard.press("Escape")
            c.pg.wait_for_timeout(500)
            # os links de antes e a versão
            for antiga, nova in [("/treinos", "/treino"), ("/avaliacao", "/evolucao"), ("/app", "/")]:
                c.ir(antiga)
                p.check(c.esperar(lambda: c.caminho() == nova, 30), f"4. {antiga} → {nova} ({c.caminho()})")
            c.ir("/perfil")
            c.esperar(lambda: c.tem("[data-perfil-rodape]"), 40)
            rod = B.txt(c, "[data-perfil-rodape]")
            if a.versao:
                p.check(f"Physiq {a.versao}" in rod, f"4. o rodapé do Perfil mostra a versão da release {a.versao} ({rod!r})")
            c.ir("/")
            c.esperar(lambda: c.tem("[data-aba-inicio]"), 30)
            T.esperar_inicio(c, dieta=tem_dieta, timeout=60)
            B.foto(c, "inicio_final")
        finally:
            c.fim()
        nav.close()
    p.check(not ESCRITAS, f"só leitura: nenhuma escrita no REST dos 2 bancos ({ESCRITAS[:5]})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
