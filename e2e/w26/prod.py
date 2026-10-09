#!/usr/bin/env python3
"""hml-13 (H-68): a versão antiga criava e apagava 1 aluno e 1 anamnese de teste na PRODUÇÃO — esta só lê.

Physiq W26 — prova de PRODUÇÃO das Ferramentas e das públicas (physiqcalc.com.br, schema public), SÓ LEITURA: nada é criado, mudado
ou apagado. O navegador bloqueia toda escrita das telas (Guarda, o mesmo molde de e2e/agenda_tags/prod.py:102-123) e as contagens
do banco têm que ficar iguais. O "restaurar pela Lixeira" é provado no STAGING: e2e/w26/telas.py --casos lixeira e e2e/w26/api.py.
Contas de TESTE: a nutri do legado (nutri.teste.claude) e o admin de teste (admin.teste.claude, só Treino).

  públicas      /calculator (calcula a TMB sem login), /privacidade e /termos;
  nutri         Lixeira: abre (sem carregar) nas 5 abas; a aba Anamneses mostra o que a lixeira_da_conta devolve (sem restaurar);
                Impressos: os 7 + o PDF com PHYSIQ · IMPRESSO; Modelos abre; Calculadora: TMB + o PDF (tudo no navegador);
  treino        conta só de Treino: Modelos, Calculadora e Lixeira no menu, SEM Impressos; a Lixeira sem as abas clínicas.
Uso: python3 e2e/w26/prod.py [--base https://physiqcalc.com.br] [--canal msedge]  (no notebook: --canal msedge)
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
DOWNLOADS = B.SCRATCH / "downloads"
# escrita = qualquer POST/PATCH/PUT/DELETE em tabela, as RPCs que gravam (as da W26 e o "visto" do aviso) e o Storage
ESCRITA_RPC = re.compile(r"/rest/v1/rpc/(lixeira_restaurar|lixeira_apagar|aluno_remover|marcar_aviso|marcar|salvar|criar|"
                         r"registrar|aceitar|excluir|apagar|atualizar|enviar)")
ESCRITA_TABELA = re.compile(r"/rest/v1/(?!rpc/)")


def ler(sql: str) -> list:
    """SQL SÓ LEITURA pela Management API (o banco recusa qualquer escrita nesta transação)."""
    return B.sql_principal("set transaction read only;\n" + sql)


def contar() -> dict:
    return ler(f"""select (select count(*) from {S}.pacientes)::int pacientes, (select count(*) from {S}.anamneses)::int anamneses,
                          (select count(*) from {S}.antropometrias)::int antropometrias, (select count(*) from {S}.planos_alimentares)::int planos,
                          (select count(*) from {S}.respostas_preconsulta)::int respostas, (select count(*) from {S}.modelos_meta)::int modelos_meta,
                          (select count(*) from {S}.avisos)::int avisos, (select count(*) from {S}.conta_eventos)::int conta_eventos,
                          (select count(*) from {S}.pacientes where deleted_at is not null)::int lixeira_alunos,
                          (select count(*) from {S}.anamneses where deleted_at is not null)::int lixeira_anamneses""")[0]


class Guarda:
    """Bloqueia no navegador toda escrita que as telas tentarem (molde de e2e/agenda_tags/prod.py:102-123)."""

    def __init__(self) -> None:
        self.bloqueadas: list[str] = []

    def instalar(self, ctx) -> None:
        def rota(route, request) -> None:
            u, m = request.url, request.method
            escrita = m in ("POST", "PATCH", "PUT", "DELETE") and (
                ESCRITA_TABELA.search(u) or ESCRITA_RPC.search(u)
                or ("/storage/v1/object/" in u and "/storage/v1/object/sign/" not in u))
            if escrita:
                self.bloqueadas.append(f"{m} {u.split('?')[0]}")
                route.abort()
                return
            route.continue_()
        for host in ("api-principal.physiqcalc.com.br", "api.physiqcalc.com.br", f"{B.PRINCIPAL_REF}.supabase.co", f"{B.B25.TREINO_REF}.supabase.co"):
            ctx.route(f"https://{host}/**", rota)


def baixar(c, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"prod_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


def texto_pdf(arq: Path | None) -> str:
    return subprocess.run(["pdftotext", str(arq), "-"], capture_output=True, text=True, timeout=60).stdout if arq and arq.exists() else ""


def caso(nav, guarda: Guarda, base: str, nome: str, desktop: bool = True):
    c = B.Caso(nav, base, "prod", nome, desktop=desktop)
    guarda.instalar(c.ctx)
    return c


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    ap.add_argument("--canal", default=None, help="msedge no notebook (o Chromium do Playwright cai em páginas longas)")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    B.saude_ok("a prova de produção da W26 (só leitura)")
    antes = contar()
    guarda = Guarda()
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=args.canal, args=["--no-sandbox"]) if args.canal else pw.chromium.launch(args=["--no-sandbox"])
        # públicas (iguais à versão antiga: nada grava)
        c = caso(nav, guarda, base, "publica_calculadora")
        c.ir("/calculator")
        p.check(c.esperar(lambda: c.tem("[data-pagina-calculadora-publica] [data-calculadora]"), 60), "/calculator abre sem login (produção)")
        for sel, v in (("[data-campo-idade]", "25"), ("[data-campo-altura]", "165"), ("[data-campo-peso]", "60")):
            c.pg.locator(sel).first.fill(v)
        p.check(c.esperar(lambda: c.pg.locator('[data-calculadora][data-tmb="1511"]').count() > 0, 10), "/calculator calcula a TMB (1511)")
        c.print("publica_calculator")
        c.fim()
        c = caso(nav, guarda, base, "publica_privacidade", desktop=False)
        c.ir("/privacidade")
        p.check(c.esperar(lambda: c.tem('[data-pagina-privacidade][data-rota="privacidade"]'), 60) and c.pg.locator("[data-secao-privacidade]").count() == 8
                and c.pg.locator("[data-pagina-legal]").count() == 0, "/privacidade: a página do Physiq com as 8 seções (sem o texto em revisão)")
        c.ir("/termos")
        p.check(c.esperar(lambda: c.tem('[data-pagina-privacidade][data-rota="termos"]'), 60), "/termos abre a mesma página")
        c.fim()

        # nutri: Lixeira SÓ LENDO (sem dado descartável, sem Restaurar)
        c = caso(nav, guarda, base, "nutri_lixeira")
        c.entrar("nutri-legado", "/painel/lixeira?tipo=anamnese")
        c.fechar_avisos()  # se o aviso aparecer, o "visto" é RPC de escrita: a guarda bloqueia (nada muda na conta)
        p.check(c.esperar(lambda: c.pg.locator('[data-pagina-lixeira][data-carregando="0"]').count() > 0, 90), "Lixeira abre (nutri)")
        abas = c.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
        p.check(abas == ["resposta", "anamnese", "antropometria", "plano", "paciente"], f"as 5 abas para a nutricionista ({abas})")
        n_tela = c.pg.locator('[data-item-lixeira^="anamnese:"]').count()
        print(f"   Lixeira › Anamneses na tela: {n_tela} (o restaurar é provado no staging: w26/telas.py --casos lixeira)")
        c.print("tela6_lixeira")
        c.fim()

        # nutri: Impressos, Modelos e Calculadora (iguais à versão antiga: o PDF sai no navegador)
        c = caso(nav, guarda, base, "nutri_impressos")
        c.entrar("nutri-legado", "/painel/impressos")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.pg.locator("[data-impresso]").count() == 7, 90), "Impressos: os 7")
        pdf = baixar(c, lambda: c.pg.locator('[data-impresso="ficha-antropometrica"] [data-btn-baixar]').click(), "impresso")
        t = texto_pdf(pdf)
        p.check("PHYSIQ · IMPRESSO" in t and "PhysiqNutri" not in t, "o PDF do impresso sai com a marca PHYSIQ")
        c.ir("/painel/modelos")
        p.check(c.esperar(lambda: c.tem('[data-pagina-modelos][data-carregando="0"]'), 90), "Modelos abre (os ★ da nutri)")
        c.ir("/painel/calculadora")
        p.check(c.esperar(lambda: c.tem("[data-pagina-calculadora] [data-calculadora]"), 60), "Ferramentas › Calculadora abre")
        for sel, v in (("[data-campo-idade]", "30"), ("[data-campo-altura]", "180"), ("[data-campo-peso]", "80")):
            c.pg.locator(sel).first.fill(v)
        p.check(c.esperar(lambda: c.pg.locator('[data-calculadora][data-tmb="1780"]').count() > 0, 10), "a calculadora do painel calcula a TMB (1780)")
        pdf2 = baixar(c, lambda: c.pg.locator("[data-btn-pdf-composicao]").click(), "composicao")
        p.check("PHYSIQ" in texto_pdf(pdf2) and "COMPOSICAO CORPORAL" in texto_pdf(pdf2), "o PDF da composição sai com a marca PHYSIQ")
        c.fim()

        # conta só de Treino
        c = caso(nav, guarda, base, "treino_menu")
        c.entrar("master", "/painel/lixeira")
        c.fechar_avisos()
        p.check(c.esperar(lambda: c.pg.locator('[data-pagina-lixeira][data-carregando="0"]').count() > 0, 90), "conta só de Treino: a Lixeira abre")
        navs = c.pg.locator("[data-menu-lateral] [data-nav]").evaluate_all("els => els.map(e => e.getAttribute('data-nav'))")
        p.check({"/painel/modelos", "/painel/calculadora", "/painel/lixeira"} <= set(navs) and "/painel/impressos" not in navs,
                "menu: Modelos, Calculadora e Lixeira; sem Impressos")
        abas = c.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
        p.check(abas == ["resposta", "paciente"], f"sem as abas clínicas numa conta sem Nutrição ({abas})")
        c.fim()
        nav.close()
    depois = contar()
    print(f"   escritas bloqueadas pelo navegador: {guarda.bloqueadas}")
    p.check(antes == depois, f"SÓ LEITURA: contagens iguais antes/depois ({antes} → {depois})")
    print(f"\nW26 · prod (só leitura) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
