#!/usr/bin/env python3
"""Physiq W-A P7 — E2E de TELA da Política de Privacidade: as rotinas e a dieta liberada no texto EM REVISÃO (spec W-A §6 "P7", Q2 "1").
Sem login e sem gravar nada (a /privacidade é pública). Edge; 1280 × 883 e 390 × 844.
Casos:
  T0  o build: local e staging = a página nova ([data-pagina-legal='politica']) com a faixa "em revisão" ([data-texto-em-revisao]);
      prod = a Política EM VIGOR (sem [data-pagina-legal] — o texto novo nem entra no bundle de produção)
  T1  1280 px: cada frase nova da W-A na tela (local e staging: todas; prod: nenhuma) + os prints das 4 seções
  T2  390 px: as mesmas frases e a página cabe na largura (nada passa dos 390 px) + o print da tabela
Bases: --base local (o vite preview do dist/ de STAGING em http://localhost:5173 — a 8080 é da LINUX 1) · staging
(https://physiqcalc-staging.vercel.app) · prod (https://physiqcalc.com.br, SÓ LEITURA).
Prints: ~/projetos/physiqcalc-scratch/prints/w-a/p7/<base>/t_politica_<base>_<seção>_<largura>.png (local e staging).
--seco: sem rede e sem navegador — cada frase do E2E existe em src/publico/legal/politica.ts (o texto que a tela mostra).
Uso: python3 e2e/wa/telas_politica.py --base staging --canal msedge   |   python3 e2e/wa/telas_politica.py --seco
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parents[2]
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w-a" / "p7"

# As frases novas, como a tela mostra (sem o ";" do fim do item; o negrito e as quebras de linha do Markdown somem na tela).
# A chave é a seção (o print de cada uma mira a 1ª frase dela).
FRASES: dict[str, list[str]] = {
    "tabela": [
        "Rotinas e lembretes",
        "nome, dose, tipo (suplemento, remédio, hábito ou outro), horário, dias da semana, quem criou, o que você marcou como feito e o "
        "histórico de mudanças, inclusive das rotinas apagadas",
        "lembrar você no horário e mostrar as rotinas a você e aos seus profissionais",
        "quando o nutricionista libera a dieta, o que você muda no seu dia: os alimentos que você põe e tira, as refeições extras e os "
        "alimentos e receitas que você cria",
    ],
    "sensiveis": [
        "a alimentação e o diário, inclusive o que você muda na dieta do seu dia",
        "as rotinas, como remédios e suplementos, e o que você marcou como feito",
    ],
    "quem_ve": [
        "Os seus profissionais veem as rotinas que você cria e as que foram criadas na conta deles, inclusive as apagadas, o que você "
        "marcou como feito e o histórico de mudanças. A página das rotinas avisa isso.",
        "O seu nutricionista vê o que você muda na dieta do seu dia. O seu personal também vê esse dia a dia, só para ler.",
    ],
    "exclusao": [
        "as rotinas (inclusive as criadas pelos seus profissionais, com o que você marcou e o histórico), os alimentos e receitas que "
        "você criou, o que você mudou na dieta do seu dia",
        "a cópia do treino guardada no aparelho e os lembretes das rotinas agendados nele",
    ],
    "aparelho": [
        "os lembretes das suas rotinas, agendados no aparelho pelo app Android; saem quando você sai da conta",
        "Os lembretes das rotinas mostram o nome da rotina e a dose; o de remédio mostra só a hora, e o nome do remédio aparece ao abrir "
        "o app.",
    ],
}
TODAS = [f for lista in FRASES.values() for f in lista]


def normal(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()


class Placar:
    def __init__(self) -> None:
        self.ok_n = 0
        self.falhas: list[str] = []

    def ok(self, cond: bool, nome: str) -> bool:
        if cond:
            self.ok_n += 1
            print(f"  ✅ {nome}", flush=True)
        else:
            self.falhas.append(nome)
            print(f"  ❌ {nome}", flush=True)
        return cond

    def fim(self) -> int:
        total = self.ok_n + len(self.falhas)
        print(f"\nPLACAR {self.ok_n}/{total}" + ("" if not self.falhas else " — falhas: " + " · ".join(self.falhas)), flush=True)
        return 0 if not self.falhas else 1


def seco() -> int:
    """Cada frase do E2E está no politica.ts (o Markdown junta as linhas com espaço: a comparação é com os espaços normalizados)."""
    o = Placar()
    fonte = normal((RAIZ / "src" / "publico" / "legal" / "politica.ts").read_text(encoding="utf-8").replace("**", ""))
    for f in TODAS:
        o.ok(normal(f) in fonte, f"--seco: no politica.ts: {f[:70]}…")
    return o.fim()


def abrir(nav, base: str, largura: int, altura: int):
    ctx = nav.new_context(viewport={"width": largura, "height": altura}, locale="pt-BR")
    pg = ctx.new_page()
    pg.goto(f"{BASES[base]}/privacidade", wait_until="domcontentloaded", timeout=60_000)
    return ctx, pg


def texto_da_pagina(pg) -> str:
    return normal(pg.evaluate("() => document.body.innerText"))


def print_da_secao(pg, frase: str, arquivo: Path) -> bool:
    alvo = pg.get_by_text(frase[:60], exact=False).first
    alvo.scroll_into_view_if_needed(timeout=10_000)
    pg.evaluate("() => window.scrollBy(0, -120)")  # a frase um pouco abaixo do topo (o cabeçalho fixo não a cobre)
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(arquivo))
    return arquivo.exists()


def rodar(base: str, canal: str) -> int:
    from playwright.sync_api import sync_playwright

    o = Placar()
    pasta = PRINTS / base
    nova = base != "prod"
    if nova:
        pasta.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            print(f"── T0/T1 {BASES[base]}/privacidade a 1280 px", flush=True)
            ctx, pg = abrir(nav, base, 1280, 883)
            if nova:
                pg.wait_for_selector("[data-pagina-legal='politica']", timeout=60_000)
                o.ok(pg.locator("[data-texto-em-revisao]").count() == 1, "T0 a página NOVA, com a faixa 'Versão em revisão'")
            else:
                pg.wait_for_selector("h1", timeout=60_000)
                pg.wait_for_timeout(1500)
                o.ok(pg.locator("[data-pagina-legal]").count() == 0 and pg.locator("[data-texto-em-revisao]").count() == 0,
                     "T0 a Política EM VIGOR (sem a página nova nem a faixa 'em revisão')")
            tela = texto_da_pagina(pg)
            for secao, lista in FRASES.items():
                for f in lista:
                    if nova:
                        o.ok(normal(f) in tela, f"T1 [{secao}] {f[:70]}…")
                    else:
                        o.ok(normal(f) not in tela, f"T1 [{secao}] fora da produção: {f[:60]}…")
            if nova:
                for secao, lista in FRASES.items():
                    arq = pasta / f"t_politica_{base}_{secao}_1280.png"
                    o.ok(print_da_secao(pg, lista[0], arq), f"T1 print {arq.name}")
            ctx.close()

            print(f"── T2 {BASES[base]}/privacidade a 390 px", flush=True)
            ctx, pg = abrir(nav, base, 390, 844)
            if nova:
                pg.wait_for_selector("[data-pagina-legal='politica']", timeout=60_000)
            else:
                pg.wait_for_selector("h1", timeout=60_000)
                pg.wait_for_timeout(1500)
            tela = texto_da_pagina(pg)
            faltam = [f for f in TODAS if (normal(f) in tela) != nova]
            o.ok(not faltam, "T2 390 px: " + ("todas as frases novas" if nova else "nenhuma frase nova") + (f" (fora: {len(faltam)})" if faltam else ""))
            larg = pg.evaluate("() => document.documentElement.scrollWidth")
            o.ok(larg <= 391, f"T2 a página cabe em 390 px (scrollWidth {larg})")
            if nova:
                arq = pasta / f"t_politica_{base}_tabela_390.png"
                o.ok(print_da_secao(pg, FRASES["tabela"][0], arq), f"T2 print {arq.name}")
            ctx.close()
        finally:
            nav.close()
    return o.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", choices=sorted(BASES), default="local")
    ap.add_argument("--canal", default="msedge")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    return rodar(a.base, a.canal)


if __name__ == "__main__":
    sys.exit(main())
