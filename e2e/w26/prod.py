#!/usr/bin/env python3
"""Physiq W26 — prova de PRODUÇÃO das Ferramentas e das públicas (physiqcalc.com.br, schema public), SÓ com contas de teste
(*.teste.claude@…) e com dados DESCARTÁVEIS de teste criados e apagados aqui (contagens iguais antes/depois, nada de pessoa real, nenhuma
mensagem). Contas: a nutri do legado (nutri.teste.claude — conta "Nutri Teste Claude", só Nutrição) e o admin de teste
(admin.teste.claude — conta "Admin Teste", só Treino; o aluno dela não aparece em nenhum print nem é mexido).

  públicas      /calculator (calcula a TMB sem login), /privacidade e /termos;
  nutri         Lixeira: uma anamnese e um aluno DESCARTÁVEIS na lixeira → aparecem nas abas e são restaurados pela tela; Impressos: os
                7 + o PDF com PHYSIQ · IMPRESSO; Modelos abre; Calculadora: TMB + o PDF da composição;
  treino        conta só de Treino: Modelos, Calculadora e Lixeira no menu, SEM Impressos; a Lixeira sem as abas clínicas.
Uso: python3 e2e/w26/prod.py [--base https://physiqcalc.com.br]
"""
from __future__ import annotations

import argparse
import datetime as dt
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
q = B.sql_principal
DOWNLOADS = B.SCRATCH / "downloads"


def contar() -> dict:
    return q(f"""select (select count(*) from {S}.pacientes)::int pacientes, (select count(*) from {S}.anamneses)::int anamneses,
                        (select count(*) from {S}.antropometrias)::int antropometrias, (select count(*) from {S}.planos_alimentares)::int planos,
                        (select count(*) from {S}.respostas_preconsulta)::int respostas, (select count(*) from {S}.modelos_meta)::int modelos_meta,
                        (select count(*) from {S}.avisos)::int avisos, (select count(*) from {S}.conta_eventos)::int conta_eventos,
                        (select count(*) from {S}.pacientes where deleted_at is not null)::int lixeira_alunos""")[0]


def rest(metodo: str, tabela: str, filtro: str, corpo=None) -> tuple[int, object]:
    tok = B.token("nutri-legado")
    cab = {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Accept-Profile": S, "Content-Profile": S, "Prefer": "return=representation"}
    st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}/rest/v1/{tabela}?{filtro}", corpo, cab, timeout=90)
    return st, r


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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    B.saude_ok("a prova de produção da W26")
    antes = contar()
    nutri = B.uid("nutri-legado")
    conta = q(f"select id::text from {S}.contas where dono_id = '{nutri}' and origem = 'legado_nutri' limit 1")[0]["id"]
    carimbo = B.carimbo()
    criados: dict[str, str | None] = {"pac": None, "anamnese": None, "aluno": None}
    t0 = time.time()
    try:
        # dados DESCARTÁVEIS de teste da nutri do legado (as colunas do site antigo; e-mails únicos de teste — W16b)
        st, r = rest("POST", "pacientes", "select=id", {"nome": f"W26 Prova {carimbo}", "nutricionista_id": nutri, "email": f"w26.prod.{carimbo}.teste.claude@physiqnutri.app"})
        criados["pac"] = r[0]["id"] if st == 201 else None  # type: ignore[index]
        st, r = rest("POST", "anamneses", "select=id", {"nutricionista_id": nutri, "paciente_id": criados["pac"], "titulo": f"Anamnese prova W26 {carimbo}"})
        criados["anamnese"] = r[0]["id"] if st == 201 else None  # type: ignore[index]
        rest("PATCH", "anamneses", f"id=eq.{criados['anamnese']}", {"deleted_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        st, r = rest("POST", "pacientes", "select=id", {"nome": f"W26 Aluno lixeira {carimbo}", "nutricionista_id": nutri, "email": f"w26.prodaluno.{carimbo}.teste.claude@physiqnutri.app"})
        criados["aluno"] = r[0]["id"] if st == 201 else None  # type: ignore[index]
        st2, r2 = B.rpc("nutri-legado", "aluno_remover", {"p_paciente": criados["aluno"]})
        p.check(all(criados.values()) and st2 == 200 and isinstance(r2, dict) and r2.get("removido"), "dados descartáveis de teste: 1 anamnese e 1 aluno na lixeira")

        with sync_playwright() as pw:
            nav = pw.chromium.launch(args=["--no-sandbox"])
            # públicas
            c = B.Caso(nav, base, "prod", "publica_calculadora", desktop=True)
            c.ir("/calculator")
            p.check(c.esperar(lambda: c.tem("[data-pagina-calculadora-publica] [data-calculadora]"), 60), "/calculator abre sem login (produção)")
            for sel, v in (("[data-campo-idade]", "25"), ("[data-campo-altura]", "165"), ("[data-campo-peso]", "60")):
                c.pg.locator(sel).first.fill(v)
            p.check(c.esperar(lambda: c.pg.locator('[data-calculadora][data-tmb="1511"]').count() > 0, 10), "/calculator calcula a TMB (1511)")
            c.print("publica_calculator")
            c.fim()
            c = B.Caso(nav, base, "prod", "publica_privacidade", desktop=False)
            c.ir("/privacidade")
            p.check(c.esperar(lambda: c.tem('[data-pagina-privacidade][data-rota="privacidade"]'), 60) and c.pg.locator("[data-secao-privacidade]").count() == 7,
                    "/privacidade: a página do Physiq com as 7 seções")
            c.print("app_privacidade")
            c.ir("/termos")
            p.check(c.esperar(lambda: c.tem('[data-pagina-privacidade][data-rota="termos"]'), 60), "/termos abre a mesma página")
            c.fim()

            # nutri: Lixeira
            c = B.Caso(nav, base, "prod", "nutri_lixeira")
            c.entrar("nutri-legado", "/painel/lixeira?tipo=anamnese")
            c.fechar_avisos()
            linha = c.pg.locator(f'[data-item-lixeira="anamnese:{criados["anamnese"]}"]')
            p.check(c.esperar(lambda: linha.count() == 1, 90), "Lixeira › Anamneses: a anamnese descartável está lá")
            abas = c.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
            p.check(abas == ["resposta", "anamnese", "antropometria", "plano", "paciente"], f"as 5 abas para a nutricionista ({abas})")
            c.print("tela6_lixeira")
            if linha.count():
                linha.locator("[data-btn-restaurar]").click()
                p.check(c.esperar(lambda: linha.count() == 0, 30), "restaurar a anamnese pela tela")
            p.check(q(f"select deleted_at from {S}.anamneses where id = '{criados['anamnese']}'")[0]["deleted_at"] is None, "no banco a anamnese voltou")
            c.pg.locator('[data-aba-lixeira-botao="paciente"]').click()
            linha2 = c.pg.locator(f'[data-item-lixeira="paciente:{criados["aluno"]}"]')
            p.check(c.esperar(lambda: linha2.count() == 1, 30), "Lixeira › Alunos: o aluno descartável está lá (fica até restaurar)")
            if linha2.count():
                linha2.locator("[data-btn-restaurar]").click()
                p.check(c.esperar(lambda: linha2.count() == 0, 30), "restaurar o aluno pela tela")
            p.check(q(f"select deleted_at, ativo from {S}.pacientes where id = '{criados['aluno']}'")[0]["deleted_at"] is None, "no banco o aluno voltou (a mesma matrícula)")
            c.fim()

            # nutri: Impressos, Modelos e Calculadora
            c = B.Caso(nav, base, "prod", "nutri_impressos")
            c.entrar("nutri-legado", "/painel/impressos")
            c.fechar_avisos()
            p.check(c.esperar(lambda: c.pg.locator("[data-impresso]").count() == 7, 90), "Impressos: os 7")
            c.print("tela6_impressos")
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
            c = B.Caso(nav, base, "prod", "treino_menu")
            c.entrar("master", "/painel/lixeira")
            c.fechar_avisos()
            p.check(c.esperar(lambda: c.tem("[data-pagina-lixeira]") and c.pg.locator('[data-pagina-lixeira][data-carregando="0"]').count() > 0, 90), "conta só de Treino: a Lixeira abre")
            navs = c.pg.locator("[data-menu-lateral] [data-nav]").evaluate_all("els => els.map(e => e.getAttribute('data-nav'))")
            p.check({"/painel/modelos", "/painel/calculadora", "/painel/lixeira"} <= set(navs) and "/painel/impressos" not in navs, "menu: Modelos, Calculadora e Lixeira; sem Impressos")
            abas = c.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
            p.check(abas == ["resposta", "paciente"], f"sem as abas clínicas numa conta sem Nutrição ({abas})")
            c.fim()
            nav.close()
    finally:
        for chave, tabela in (("anamnese", "anamneses"),):
            if criados[chave]:
                q(f"delete from {S}.{tabela} where id = '{criados[chave]}'")
        for chave in ("pac", "aluno"):
            if criados[chave]:
                q(f"delete from {S}.conta_eventos where depois ->> 'paciente_id' = '{criados[chave]}'")
                q(f"delete from {S}.pacientes where id = '{criados[chave]}'")
    depois = contar()
    p.check(antes == depois, f"contagens iguais antes/depois ({antes} → {depois})")
    print(f"\nW26 · prod · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
