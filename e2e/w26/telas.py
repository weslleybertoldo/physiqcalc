#!/usr/bin/env python3
"""Physiq W26 — E2E das telas das Ferramentas (padrão das telas 6 e 8) e das páginas públicas, na massa do e2e/w26/massa.py.

Positivo:
  lixeira       Helena (dona + nutri): as 5 abas; restaura a Paula (aluna) e a anamnese (somem da lixeira e voltam no banco); apaga de vez
                o "Plano W26 apagar" depois da confirmação COM o nome do item;
  modelos       Sofia: os ★ (Anamnese esportiva, Beber 2 L, Plano favorito) em abas; tirar a estrela; Lucas: a aba Treinos (pastas);
  impressos     Sofia: os 7 PDFs, nome do perfil no cabeçalho; baixa a ficha antropométrica (PDF com PHYSIQ · IMPRESSO);
  calculadora   Lucas: composição (TMB 1780, 3 dobras, classificação, gasto por atividade) + PDF; comparativo + relatório + PDF;
  dieta_pdf     Sofia: o PDF de orientação da aba Dieta da Ana Clara sai com PHYSIQ · ORIENTAÇÕES (item 2.1, N-60);
  publicas      sem login: /calculator (site), /privacidade e /termos (celular);
Negativo:
  recusas       Helena: restaurar o Vitor (e-mail repetido — W16b) e o Otto (outro profissional — P7) mostra a frase vermelha e nada muda;
                Lucas: a Ana Nova W13 (limite da faixa);
  personal      Diego: só as abas Pré-consulta e Alunos (nada clínico) e só o aluno dele;
  sem_nutricao  Renata (conta só de Treino): sem Impressos no menu e a rota recusa.
Uso: python3 e2e/w26/telas.py --base http://localhost:5173 --prefixo local [--casos lixeira,modelos,...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). Contexto limpo por caso; painel 1280 × 883 × 2, celular
     390 × 844 × 3,4. O que o teste restaura volta para a lixeira no fim (a massa volta: python3 e2e/w26/massa.py).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.sql_principal
DOWNLOADS = B.SCRATCH / "downloads"
CASOS: dict[str, object] = {}
ESTADO: dict = {}
M: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def abrir(nav, nome: str, conta: str, rota: str, desktop: bool = True):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def anonimo(nav, nome: str, rota: str, desktop: bool = False):
    c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    c.ir(rota)
    return c


def baixar(c, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


def texto_pdf(arq: Path | None) -> str:
    if not arq or not arq.exists():
        return ""
    return subprocess.run(["pdftotext", "-layout", str(arq), "-"], capture_output=True, text=True, timeout=60).stdout


def esperar_lixeira(c, aba: str | None = None, timeout: float = 60) -> bool:
    def pronto():
        if not c.tem("[data-pagina-lixeira]") or c.pg.locator('[data-pagina-lixeira][data-carregando="1"]').count():
            return False
        return aba is None or c.pg.locator(f'[data-pagina-lixeira][data-aba-lixeira="{aba}"]').count() > 0
    return c.esperar(pronto, timeout)


def linha_lixeira(c, tipo: str, id_: str):
    return c.pg.locator(f'[data-item-lixeira="{tipo}:{id_}"]')


def deleted(tabela: str, id_: str):
    r = q(f"select deleted_at from {S}.{tabela} where id = '{id_}'")
    return r[0]["deleted_at"] if r else "APAGADO"


# ───────────────────────── Lixeira ─────────────────────────

@caso
def caso_lixeira(nav) -> None:
    c = abrir(nav, "lixeira", "w24-dono", "/painel/lixeira?tipo=paciente")
    p.check(esperar_lixeira(c, "paciente"), "[lixeira] Ferramentas › Lixeira abriu na aba Alunos (Helena)")
    abas = c.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
    p.check(abas == ["resposta", "anamnese", "antropometria", "plano", "paciente"], f"[lixeira] as 5 abas para a dona + nutri ({abas})")
    p.check(linha_lixeira(c, "paciente", M["paula"]).count() == 1 and linha_lixeira(c, "paciente", M["gustavo"]).count() == 1, "[lixeira] a Paula e o Gustavo estão na aba Alunos")
    p.check("fica até você restaurar" in c.texto(), "[lixeira] o aluno fica até restaurar (sem 'apagar de vez')")
    c.print("tela6_lixeira_alunos")

    # restaurar a Paula
    linha_lixeira(c, "paciente", M["paula"]).locator("[data-btn-restaurar]").click()
    p.check(c.esperar(lambda: linha_lixeira(c, "paciente", M["paula"]).count() == 0, 30), "[lixeira] a Paula saiu da lista depois de Restaurar")
    p.check(deleted("pacientes", M["paula"]) is None, "[lixeira] no banco a Paula voltou (deleted_at = null, mesma matrícula)")
    B.rpc("w24-nutri", "aluno_remover", {"p_paciente": M["paula"]})

    # aba Anamneses: restaurar
    c.pg.locator('[data-aba-lixeira-botao="anamnese"]').click()
    p.check(esperar_lixeira(c, "anamnese") and c.esperar(lambda: linha_lixeira(c, "anamnese", M["anamnese"]).count() == 1, 20), "[lixeira] aba Anamneses com a Anamnese W26")
    c.print("tela6_lixeira_anamneses")
    linha_lixeira(c, "anamnese", M["anamnese"]).locator("[data-btn-restaurar]").click()
    p.check(c.esperar(lambda: linha_lixeira(c, "anamnese", M["anamnese"]).count() == 0, 30), "[lixeira] a anamnese saiu da lista")
    p.check(deleted("anamneses", M["anamnese"]) is None, "[lixeira] no banco a anamnese voltou")
    q(f"update {S}.anamneses set deleted_at = now() - interval '3 days' where id = '{M['anamnese']}'")

    # aba Planos: apagar de vez com confirmação pelo nome
    c.pg.locator('[data-aba-lixeira-botao="plano"]').click()
    p.check(esperar_lixeira(c, "plano") and c.esperar(lambda: linha_lixeira(c, "plano", M["plano_apagar"]).count() == 1, 20), "[lixeira] aba Planos alimentares")
    linha_lixeira(c, "plano", M["plano_apagar"]).locator("[data-btn-apagar-de-vez]").click()
    dialogo = c.pg.locator("[data-confirmar-apagar-de-vez]")
    p.check(c.esperar(lambda: dialogo.count() > 0 and dialogo.first.is_visible(), 10), "[lixeira] Apagar de vez abre a confirmação")
    p.check('"Plano W26 apagar" será apagado de vez' in dialogo.first.inner_text(), "[lixeira] a confirmação traz o nome do item")
    c.print("tela8_lixeira_apagar_de_vez")
    p.check(deleted("planos_alimentares", M["plano_apagar"]) not in (None, "APAGADO"), "[lixeira] antes de confirmar nada foi apagado")
    dialogo.locator("[data-confirmar-ok]").click()
    p.check(c.esperar(lambda: deleted("planos_alimentares", M["plano_apagar"]) == "APAGADO", 30), "[lixeira] confirmou → o plano foi apagado de vez no banco")
    p.check(c.esperar(lambda: linha_lixeira(c, "plano", M["plano_apagar"]).count() == 0, 20), "[lixeira] e saiu da lista")
    c.fim()


@caso
def caso_recusas(nav) -> None:
    c = abrir(nav, "recusas", "w24-dono", "/painel/lixeira?tipo=paciente")
    p.check(esperar_lixeira(c, "paciente"), "[recusas] Lixeira › Alunos (Helena)")
    linha_lixeira(c, "paciente", M["vitor"]).locator("[data-btn-restaurar]").click()
    alerta = linha_lixeira(c, "paciente", M["vitor"]).locator("[data-recusa-lixeira]")
    p.check(c.esperar(lambda: alerta.count() > 0, 30) and "Já existe um aluno com este e-mail." in alerta.inner_text(), "[recusas] Vitor: frase vermelha do e-mail repetido (W16b)")
    p.check(deleted("pacientes", M["vitor"]) is not None, "[recusas] o Vitor continua na lixeira (nada mudou)")
    linha_lixeira(c, "paciente", M["otto"]).locator("[data-btn-restaurar]").click()
    alerta2 = linha_lixeira(c, "paciente", M["otto"]).locator("[data-recusa-lixeira]")
    p.check(c.esperar(lambda: alerta2.count() > 0, 30) and "Este aluno já está com outro profissional." in alerta2.inner_text(), "[recusas] Otto: frase vermelha do P7")
    p.check(deleted("pacientes", M["otto"]) is not None, "[recusas] o Otto continua na lixeira")
    c.print("tela6_lixeira_recusas")
    c.fim()
    c2 = abrir(nav, "recusa_limite", "w13-dono", "/painel/lixeira?tipo=paciente")
    p.check(esperar_lixeira(c2, "paciente"), "[recusas] Lixeira do Lucas (Consultoria W13)")
    abas = c2.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
    p.check(abas == ["resposta", "paciente"], f"[recusas] Lucas (dono sem papel de nutri): só Pré-consulta e Alunos ({abas})")
    linha_lixeira(c2, "paciente", M["ana_nova_w13"]).locator("[data-btn-restaurar]").click()
    alerta3 = linha_lixeira(c2, "paciente", M["ana_nova_w13"]).locator("[data-recusa-lixeira]")
    p.check(c2.esperar(lambda: alerta3.count() > 0, 30) and "10 alunos ativos" in alerta3.inner_text(), "[recusas] Ana Nova W13: frase do limite da faixa")
    p.check(deleted("pacientes", M["ana_nova_w13"]) is not None, "[recusas] a Ana Nova continua na lixeira")
    c2.print("tela6_lixeira_limite")
    c2.fim()


@caso
def caso_personal(nav) -> None:
    c = abrir(nav, "personal", "w24-personal", "/painel/lixeira")
    p.check(esperar_lixeira(c), "[personal] Lixeira do Diego abriu")
    abas = c.pg.locator("[data-aba-lixeira-botao]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-lixeira-botao'))")
    p.check(abas == ["resposta", "paciente"], f"[personal] Diego: só Pré-consulta e Alunos — nada clínico ({abas})")
    c.pg.locator('[data-aba-lixeira-botao="paciente"]').click()
    esperar_lixeira(c, "paciente")
    p.check(linha_lixeira(c, "paciente", M["gustavo"]).count() == 1 and linha_lixeira(c, "paciente", M["paula"]).count() == 0, "[personal] vê só o aluno dele (P1)")
    c.print("tela6_lixeira_personal")
    c.fim()


@caso
def caso_sem_nutricao(nav) -> None:
    c = abrir(nav, "sem_nutricao", "w26-outro", "/painel/impressos")
    p.check(c.esperar(lambda: c.tem("[data-menu-lateral]"), 60), "[sem_nutricao] painel da Renata (conta só de Treino) abriu")
    navs = c.pg.locator("[data-menu-lateral] [data-nav]").evaluate_all("els => els.map(e => e.getAttribute('data-nav'))")
    p.check("/painel/impressos" not in navs and "/painel/lixeira" in navs and "/painel/calculadora" in navs and "/painel/modelos" in navs,
            f"[sem_nutricao] sem Impressos no menu; Modelos, Calculadora e Lixeira estão ({[n for n in navs if 'painel/' in n][-4:]})")
    p.check(not c.tem("[data-pagina-impressos]"), "[sem_nutricao] a rota /painel/impressos recusa (não abre a página)")
    c.print("tela6_impressos_sem_nutricao")
    c.fim()


# ───────────────────────── Modelos ─────────────────────────

@caso
def caso_modelos(nav) -> None:
    c = abrir(nav, "modelos", "w24-nutri", "/painel/modelos")
    p.check(c.esperar(lambda: c.tem("[data-pagina-modelos]") and c.pg.locator('[data-pagina-modelos][data-carregando="0"]').count() > 0, 90), "[modelos] Ferramentas › Modelos abriu (Sofia)")
    t = c.texto()
    p.check(all(x in t for x in ("Anamnese esportiva W26", "Beber 2 L de água W26", "Plano W26 favorito")), "[modelos] os ★ da Sofia: anamnese, meta e plano")
    abas = c.pg.locator("[data-aba-modelo]").evaluate_all("els => els.map(e => e.getAttribute('data-aba-modelo'))")
    p.check(abas[0] == "todos" and {"anamnese", "meta", "plano"} <= set(abas), f"[modelos] abas: Todos + os tipos com ★ ({abas})")
    c.print("tela6_modelos")
    meta = c.pg.locator('[data-modelo-tipo="meta"]').filter(has_text="Beber 2 L de água W26")
    meta.locator("[data-btn-desfavoritar]").click()
    p.check(c.esperar(lambda: c.pg.locator('[data-modelo-tipo="meta"]').filter(has_text="Beber 2 L de água W26").count() == 0, 30), "[modelos] tirar a ★: some da lista")
    p.check(q(f"select favorito from {S}.modelos_meta where titulo = 'Beber 2 L de água W26'")[0]["favorito"] is False, "[modelos] no banco a meta ficou sem ★ (a tela dona)")
    q(f"update {S}.modelos_meta set favorito = true where titulo = 'Beber 2 L de água W26'")
    c.fim()
    c2 = abrir(nav, "modelos_treinos", "w13-dono", "/painel/modelos")
    p.check(c2.esperar(lambda: c2.tem("[data-pagina-modelos]") and c2.pg.locator('[data-pagina-modelos][data-carregando="0"]').count() > 0, 120), "[modelos] Modelos do Lucas abriu")
    tem_treino = c2.pg.locator('[data-modelo-tipo="treino"]').count()
    p.check(tem_treino > 0, f"[modelos] aba Treinos: os treinos das pastas do Lucas ({tem_treino})")
    if c2.tem('[data-aba-modelo="treino"]'):
        c2.pg.locator('[data-aba-modelo="treino"]').click()
        c2.pg.wait_for_timeout(600)
    c2.print("tela6_modelos_treinos")
    c2.fim()


# ───────────────────────── Impressos ─────────────────────────

@caso
def caso_impressos(nav) -> None:
    c = abrir(nav, "impressos", "w24-nutri", "/painel/impressos")
    p.check(c.esperar(lambda: c.tem("[data-pagina-impressos]") and c.pg.locator("[data-impresso]").count() == 7, 60), "[impressos] os 7 impressos")
    p.check(c.esperar(lambda: c.pg.locator("[data-campo-nutricionista]").input_value() == "Sofia Martins", 20), "[impressos] o nome do perfil no cabeçalho")
    c.print("tela6_impressos")
    arquivos = {}
    for i in ("ficha-antropometrica", "rastreamento-metabolico", "sinais-e-sintomas", "codigo-de-etica", "checklist-higienizacao", "controle-temperatura", "ficha-tecnica"):
        arquivos[i] = baixar(c, lambda i=i: c.pg.locator(f'[data-impresso="{i}"] [data-btn-baixar]').click(), f"impresso_{i}")
        c.pg.wait_for_timeout(400)
    ok = [k for k, v in arquivos.items() if v and "PHYSIQ · IMPRESSO" in texto_pdf(v) and "Sofia Martins" in texto_pdf(v) and "PhysiqNutri" not in texto_pdf(v)]
    p.check(len(ok) == 7, f"[impressos] os 7 PDFs baixados com PHYSIQ · IMPRESSO e o nome (sem PhysiqNutri) — {len(ok)}/7")
    nomes = [v.name for v in arquivos.values() if v]
    p.check(all("_physiq-" in n for n in nomes), f"[impressos] arquivo physiq-<id>-<data>.pdf ({nomes[:1]})")
    c.fim()


# ───────────────────────── Calculadora ─────────────────────────

def topo(c) -> None:
    """Volta ao alto da página (o print mostra o topo, como as telas aprovadas) e tira o foco do campo."""
    c.pg.evaluate("() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); document.querySelectorAll('main, [data-casca] *').forEach(e => { if (e.scrollTop) e.scrollTop = 0; }); }")
    c.pg.wait_for_timeout(300)


def sem_toast(c) -> None:
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, 8)


def preencher(c, sel: str, valor: str) -> None:
    c.pg.locator(sel).first.fill(valor)


@caso
def caso_calculadora(nav) -> None:
    c = abrir(nav, "calculadora", "w13-dono", "/painel/calculadora")
    p.check(c.esperar(lambda: c.tem("[data-pagina-calculadora] [data-calculadora]"), 60), "[calculadora] Ferramentas › Calculadora abriu (Lucas)")
    c.pg.evaluate("() => { Object.keys(localStorage).filter(k => k.startsWith('physiqcalc')).forEach(k => localStorage.removeItem(k)); }")
    c.pg.reload(wait_until="domcontentloaded")
    c.esperar(lambda: c.tem("[data-calculadora]"), 60)
    preencher(c, "[data-campo-nome]", "Rafael Moura")
    preencher(c, "[data-campo-idade]", "30")
    preencher(c, "[data-campo-altura]", "180")
    preencher(c, "[data-campo-peso]", "80")
    for i, v in enumerate(("15", "20", "10")):
        preencher(c, f'[data-campo-dobra="3-{i}"]', v)
    preencher(c, '[data-campo-medida="comp-cintura"]', "84")
    p.check(c.esperar(lambda: c.pg.locator('[data-calculadora][data-tmb="1780"]').count() > 0, 10), "[calculadora] TMB de Mifflin = 1780 kcal/dia")
    bf = c.pg.locator("[data-calculadora]").get_attribute("data-bf")
    p.check(bf == "13.6", f"[calculadora] % gordura por 3 dobras = 13,6 (Jackson & Pollock) — {bf}")
    p.check("Boa Forma" in c.pg.locator("[data-classificacao]").inner_text(), "[calculadora] classificação de Gallagher")
    topo(c)
    c.print("tela8_calculadora_composicao")
    pdf = baixar(c, lambda: c.pg.locator("[data-btn-pdf-composicao]").click(), "composicao")
    t = texto_pdf(pdf)
    p.check("PHYSIQ" in t and "COMPOSICAO CORPORAL" in t and "Rafael Moura" in t and "1780 kcal/dia" in t and "PEITORAL" in t, "[calculadora] PDF da composição: PHYSIQ, dados, TMB e as dobras")
    p.check(pdf is not None and pdf.name.endswith("Relatorio Physiq do Rafael Moura.pdf"), f"[calculadora] arquivo de hoje ({pdf.name if pdf else None})")

    c.pg.locator('[role="radio"]', has_text="Comparativo").first.click()
    p.check(c.esperar(lambda: c.tem("[data-comparativo]"), 10), "[calculadora] aba Comparativo")
    preencher(c, "[data-campo-ref-nome]", "Rafael Moura")
    preencher(c, '[data-campo-peso-lado="ref"]', "82")
    preencher(c, '[data-campo-gordura-lado="ref"]', "18")
    preencher(c, '[data-campo-peso-lado="novo"]', "80")
    preencher(c, '[data-campo-gordura-lado="novo"]', "15")
    preencher(c, '[data-campo-medida="ref-cintura"]', "88")
    preencher(c, '[data-campo-medida="novo-cintura"]', "84")
    preencher(c, "[data-campo-comum-idade]", "30")
    preencher(c, "[data-campo-comum-altura]", "180")
    c.pg.locator("[data-btn-gerar-comparativo]").click()
    p.check(c.esperar(lambda: c.tem("[data-relatorio-comparativo]"), 10), "[calculadora] relatório comparativo")
    p.check("-2,0" in c.pg.locator('[data-linha-comparativo="Peso"]').inner_text(), "[calculadora] variação do peso −2,0")
    sem_toast(c)
    c.pg.locator("[data-relatorio-comparativo]").scroll_into_view_if_needed()
    c.print("tela8_calculadora_comparativo")
    pdf2 = baixar(c, lambda: c.pg.locator("[data-btn-pdf-relatorio]").click(), "comparativo")
    t2 = texto_pdf(pdf2)
    p.check("PHYSIQ" in t2 and "COMPARATIVO" in t2 and "82.0 kg -> 80.0 kg" in t2 and "88.0 -> 84.0" in t2, "[calculadora] PDF do comparativo: PHYSIQ e as linhas")
    p.check(pdf2 is not None and pdf2.name.endswith("Comparativo Rafael Moura.pdf"), "[calculadora] arquivo de hoje (Comparativo <nome>.pdf)")
    c.fim()


# ───────────────────────── item 2.1: PDF da aba Dieta ─────────────────────────

@caso
def caso_dieta_pdf(nav) -> None:
    ana = B.paciente("Ana Clara W24", M["conta_w24"])["id"]
    c = abrir(nav, "dieta_pdf", "w24-nutri", f"/painel/alunos/{ana}/dieta?secao=orientacoes")
    p.check(c.esperar(lambda: c.pg.locator("[data-btn-pdf-orientacao]").count() > 0, 90), "[dieta_pdf] Dieta › Orientações da Ana Clara (Sofia)")
    pdf = baixar(c, lambda: c.pg.locator("[data-btn-pdf-orientacao]").first.click(), "orientacao")
    t = texto_pdf(pdf)
    p.check("PHYSIQ · ORIENTAÇÕES NUTRICIONAIS" in t and "PHYSIQNUTRI" not in t and "Ana Clara W24" in t, "[dieta_pdf] PDF da orientação com a marca PHYSIQ (N-60)")
    c.fim()


# ───────────────────────── públicas ─────────────────────────

@caso
def caso_publicas(nav) -> None:
    c = anonimo(nav, "publica_calculadora", "/calculator", desktop=True)
    p.check(c.esperar(lambda: c.tem("[data-pagina-calculadora-publica] [data-calculadora]"), 60), "[publicas] /calculator abre sem login")
    p.check(c.caminho() == "/calculator" and c.tem('[data-casca="publico"]'), "[publicas] fica no /calculator, na casca pública")
    preencher(c, "[data-campo-idade]", "25")
    preencher(c, "[data-campo-altura]", "165")
    preencher(c, "[data-campo-peso]", "60")
    p.check(c.esperar(lambda: c.pg.locator('[data-calculadora][data-tmb="1511"]').count() > 0, 10), "[publicas] TMB da calculadora pública (1511)")
    c.print("publica_calculator")
    c.fim()
    c2 = anonimo(nav, "publica_privacidade", "/privacidade")
    p.check(c2.esperar(lambda: c2.tem('[data-pagina-privacidade][data-rota="privacidade"]'), 60), "[publicas] /privacidade abre sem login")
    p.check(c2.pg.locator("[data-secao-privacidade]").count() == 7 and "Physiq" in c2.texto() and "PhysiqNutri" not in c2.texto(), "[publicas] 7 seções, marca Physiq")
    c2.print("app_privacidade")
    c2.fim()
    c3 = anonimo(nav, "publica_termos", "/termos")
    p.check(c3.esperar(lambda: c3.tem('[data-pagina-privacidade][data-rota="termos"]'), 60), "[publicas] /termos abre a mesma página")
    c3.pg.wait_for_timeout(600)
    p.check(c3.pg.evaluate("() => { const r = document.getElementById('termos')?.getBoundingClientRect(); return !!r && r.top < window.innerHeight; }"),
            "[publicas] /termos já mostra a parte dos termos")
    c3.print("app_termos")
    c3.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    M.update(json.loads((B.SCRATCH / "massa_staging.json").read_text()))
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x for x in a.casos.split(",") if x]:
            fn = CASOS[nome]
            B.saude_ok(f"o caso {nome}")
            print(f"\n── {nome}", flush=True)
            for tentativa in (1, 2):
                try:
                    fn(nav)  # type: ignore[operator]
                    break
                except Exception as e:  # noqa: BLE001
                    if "Target crashed" in str(e) or "Target page, context or browser has been closed" in str(e):
                        print("   o navegador caiu — 2ª tentativa", flush=True)
                        nav = pw.chromium.launch(args=["--no-sandbox"])
                        continue
                    p.check(False, f"[{nome}] exceção: {str(e)[:300]}")
                    break
            time.sleep(2)
        nav.close()
    print(f"\nW26 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
