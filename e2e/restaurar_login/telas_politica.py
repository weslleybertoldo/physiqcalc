#!/usr/bin/env python3
"""Physiq D8 (restauração de login) — E2E de TELA da Política de Privacidade da versão de 22/12/2026: o que o "entrar já logado no
celular novo" guarda e onde. Sem login e sem gravar nada (a /privacidade é pública). Edge; 1280 × 883 e 390 × 844.
Molde: e2e/wa/telas_politica.py (W-A P7).
Casos:
  T0  a versão da página: local e staging = a versão NOVA ([data-pagina-legal='politica'][data-versao='2026-12-22']);
      prod = a versão no ar (2026-10-29) até a virada de 22/12/2026 — depois dela, prod também é a nova (use --base prod --nova)
  T1  1280 px: cada frase nova na tela (versão nova: todas; versão de antes: nenhuma) + o print de cada seção
  T2  390 px: as mesmas frases e a página cabe na largura (nada passa dos 390 px) + o print da tabela da seção 3
Bases: --base local (o vite do D8 em http://localhost:5173) · staging (https://physiqcalc-staging.vercel.app) ·
prod (https://physiqcalc.com.br, SÓ LEITURA).
Prints: ~/projetos/physiqcalc-scratch/prints/restaurar-login/d8/<base>/t_politica_<base>_<seção>_<largura>.png
--seco: sem rede e sem navegador — cada frase do E2E existe em src/publico/legal/politica.ts ou em src/publico/privacidade/textos.ts.
Uso: python3 e2e/restaurar_login/telas_politica.py --base local --canal msedge   |   python3 e2e/restaurar_login/telas_politica.py --seco
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True

RAIZ = Path(__file__).resolve().parents[2]
BASES = {"local": "http://localhost:5173", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "restaurar-login" / "d8"
VERSAO_NOVA = "2026-12-22"
VERSAO_ANTERIOR = "2026-10-29"

# As frases novas, como a tela mostra (sem o ";" do fim do item; o negrito e as quebras de linha do Markdown somem na tela).
# A chave é a seção (o print de cada uma mira a 1ª frase dela).
FRASES: dict[str, list[str]] = {
    "tabela": [
        "só no app Android: a parte pública da chave de entrada (seção 12), ligada à sua conta (sozinha, ela não serve para entrar)",
        "A parte privada da chave não vem para o Physiq",
        "entrar sozinho na sua conta no celular novo, com segurança",
        "e saber de que aparelho e versão do app é cada chave, para corrigir erros",
        "Os técnicos e os da entrada no celular novo, o Physiq registra sozinho.",
        "para limitar tentativas, e os avisos de erro (seção 13)",
    ],
    "base_legal": ["legítimo interesse, num serviço que beneficia você: voltar à sua conta no celular novo sem entrar de novo"],
    "servicos": [
        "fica guardada pelo Android (Google Play services) no celular",
        "cifrada de ponta a ponta, segundo o Google",
        "no app Android (do site ou da Google Play), a cópia da chave de entrada no celular novo",
    ],
    "prazos": [
        "vale no máximo 13 meses depois de criada",
        "o registro dela é apagado cerca de 90 dias depois (na exclusão da conta de quem é só aluno, na hora)",
        "e, na conta, as senhas erradas seguidas e o bloqueio, até o próximo login certo ou até ela ser destravada",
        "entrar com o Google ou com a chave de entrada no celular novo continua funcionando",
    ],
    "exclusao": [
        "no app Android, a chave de entrada no celular novo deixa de entrar na hora",
        "a chave de entrada no celular novo deixa de entrar na hora, e o registro dela sai do servidor cerca de 90 dias depois",
    ],
    "aparelho": [
        "ele pede ao Android que apague a chave do celular e do backup, e cria outra quando você entra de novo",
        "o código da chave e o da sessão, o identificador da conta, datas e se já tentou entrar",
        "As chaves secretas do Physiq nunca vão para o app nem para o site",
        "levam códigos técnicos, como o identificador da conta ou o começo do código da chave de entrada, e o texto técnico do erro",
        "Os avisos de erro levam esse texto limpo de e-mail, telefone, CPF e IP, e nunca o identificador da conta",
        "O serviço de login (Supabase) tem registros próprios de cada entrada",
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
    """Cada frase do E2E está no texto da Política (o politica.ts e o textos.ts, de onde vêm os serviços e as frases repetidas)."""
    o = Placar()
    fonte = normal(" ".join((RAIZ / p).read_text(encoding="utf-8") for p in ("src/publico/legal/politica.ts",
                                                                           "src/publico/privacidade/textos.ts")).replace("**", ""))
    o.ok(bool(TODAS), "--seco: há frases para conferir")
    for f in TODAS:
        o.ok(normal(f) in fonte, f"--seco: no texto da Política: {f[:70]}…")
    return o.fim()


def abrir(nav, base: str, largura: int, altura: int):
    ctx = nav.new_context(viewport={"width": largura, "height": altura}, locale="pt-BR")
    pg = ctx.new_page()
    pg.goto(f"{BASES[base]}/privacidade", wait_until="domcontentloaded", timeout=60_000)
    pg.wait_for_selector("[data-pagina-legal='politica']", timeout=60_000)
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


def rodar(base: str, canal: str, nova: bool) -> int:
    from playwright.sync_api import sync_playwright

    o = Placar()
    pasta = PRINTS / base
    if nova:
        pasta.mkdir(parents=True, exist_ok=True)
    versao = VERSAO_NOVA if nova else VERSAO_ANTERIOR
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            print(f"── T0/T1 {BASES[base]}/privacidade a 1280 px (esperada a versão {versao})", flush=True)
            ctx, pg = abrir(nav, base, 1280, 883)
            achada = pg.get_attribute("[data-pagina-legal='politica']", "data-versao")
            o.ok(achada == versao, f"T0 a página está na versão {versao} (achada: {achada})")
            tela = texto_da_pagina(pg)
            for secao, lista in FRASES.items():
                for f in lista:
                    if nova:
                        o.ok(normal(f) in tela, f"T1 [{secao}] {f[:70]}…")
                    else:
                        o.ok(normal(f) not in tela, f"T1 [{secao}] fora da versão de antes: {f[:60]}…")
            if nova:
                for secao, lista in FRASES.items():
                    arq = pasta / f"t_politica_{base}_{secao}_1280.png"
                    o.ok(print_da_secao(pg, lista[0], arq), f"T1 print {arq.name}")
            ctx.close()

            print(f"── T2 {BASES[base]}/privacidade a 390 px", flush=True)
            ctx, pg = abrir(nav, base, 390, 844)
            tela = texto_da_pagina(pg)
            faltam = [f for f in TODAS if (normal(f) in tela) != nova]
            o.ok(not faltam, "T2 390 px: " + ("todas as frases novas" if nova else "nenhuma frase nova") + (f" (fora: {len(faltam)})" if faltam else ""))
            larg = pg.evaluate("() => document.documentElement.scrollWidth")
            o.ok(larg <= 391, f"T2 a página cabe em 390 px (scrollWidth {larg})")
            if nova and "tabela" in FRASES:
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
    ap.add_argument("--nova", action="store_true", help="em prod, depois da virada de 22/12/2026: espera a versão nova")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    return rodar(a.base, a.canal, nova=(a.base != "prod") or a.nova)


if __name__ == "__main__":
    sys.exit(main())
