#!/usr/bin/env python3
"""Smoke de UI: aba Historico de Treinos + correcao do Relatorio.

Roda em contexto limpo (sem storage) para provar que o link do GATE abre JA LOGADO.
Comparacoes sao case-insensitive: varios titulos usam `uppercase` no CSS e o
inner_text do Playwright devolve o texto ja transformado.
"""
import re
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8080"
falhas, passes = [], []
erros_console = []


def checa(nome, cond, detalhe=""):
    (passes if cond else falhas).append(nome)
    print(("  PASS  " if cond else "  FALHA ") + nome + (f" ({detalhe})" if detalhe else ""))


def tem(texto, alvo):
    return alvo.upper() in texto.upper()


def espera_carregar(pg, escopo=None, timeout_ms=60000):
    """Espera o 'Carregando...' sumir. Afirmar antes disso gera PASS/FALHA falsos."""
    import time
    limite = time.time() + timeout_ms / 1000
    while time.time() < limite:
        try:
            texto = (escopo or pg.locator("body")).inner_text()
        except Exception:
            texto = "Carregando"
        if "Carregando" not in texto:
            return True
        pg.wait_for_timeout(400)
    return False


with sync_playwright() as pw:
    nav = pw.chromium.launch()
    ctx = nav.new_context(viewport={"width": 1280, "height": 1400})
    # Suprime o popup "Parcela pendente" (overlay z-50 intercepta cliques).
    ctx.add_init_script("""
      try {
        const hoje = new Date().toLocaleDateString('pt-BR');
        localStorage.setItem('physiq_pendencia_avisada_em', hoje);
      } catch (e) {}
    """)
    pg = ctx.new_page()
    pg.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else None)

    print("== 1. link abre ja logado (contexto limpo) ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Gerenciar Treinos", timeout=45000)
    corpo = pg.inner_text("body")
    checa("nao caiu na tela de login", not tem(corpo, "Entrar com") and not tem(corpo, "Esqueci minha senha"))
    checa("painel Gerenciar Treinos carregou", tem(corpo, "Gerenciar Treinos"))

    print("\n== 2. aba nova existe e esta antes do Relatorio ==")
    aba = pg.locator("button", has_text="Histórico de Treinos").first
    checa("aba 'Historico de Treinos' visivel", aba.is_visible())
    labels = pg.eval_on_selector_all("div.flex.border-b button", "els => els.map(e => e.textContent.trim())")
    checa("ordem das abas correta",
          "🕒 Histórico de Treinos" in labels
          and labels.index("🕒 Histórico de Treinos") < labels.index("📊 Relatório"),
          " | ".join(labels))

    print("\n== 3. lista do mes traz TODOS os alunos ==")
    pg.wait_for_selector("text=/treinos? em Agosto/i", timeout=30000)
    corpo = pg.inner_text("body")
    checa("Jaise aparece na lista", tem(corpo, "Jaise Soares"))
    checa("Livia aparece na lista", tem(corpo, "Cavalcante"))
    checa("nome real do treino aparece", tem(corpo, "Treino B") or tem(corpo, "Upper A"))
    checa("marcador 'sem cronometro' presente", tem(corpo, "sem cronômetro"))
    checa("mes atual pre-selecionado", pg.locator("select").nth(1).input_value() == "8",
          f"mes={pg.locator('select').nth(1).input_value()}")

    print("\n== 3b. filtro por aluno na lista ==")
    selects = pg.locator("select")
    checa("existe o 3o filtro (aluno) ao lado de mes/ano", selects.count() >= 4,
          f"{selects.count()} selects")
    opcoes_aluno = pg.eval_on_selector_all(
        "select >> nth=3 >> option", "els => els.map(e => e.textContent.trim())")
    checa("filtro tem 'Todos os alunos'", "Todos os alunos" in opcoes_aluno)
    checa("filtro lista so quem treinou no mes",
          any("Jaise" in o for o in opcoes_aluno) and any("Cavalcante" in o for o in opcoes_aluno),
          " | ".join(opcoes_aluno))
    linhas = pg.locator("div.space-y-0 > button")
    total_geral = linhas.count()
    checa("lista tem linhas antes de filtrar", total_geral > 0, f"{total_geral} linhas")

    alvo_jaise = next((o for o in opcoes_aluno if "Jaise" in o), None)
    if alvo_jaise:
        selects.nth(3).select_option(label=alvo_jaise)
        pg.wait_for_timeout(1200)
        linhas = pg.locator("div.space-y-0 > button")
        nomes_visiveis = [linhas.nth(i).inner_text() for i in range(linhas.count())]
        checa("filtrando pela Jaise sobra so ela",
              len(nomes_visiveis) > 0 and all(tem(n, "Jaise") for n in nomes_visiveis),
              f"{len(nomes_visiveis)} linhas")
        checa("filtro reduziu a lista", len(nomes_visiveis) < total_geral,
              f"{len(nomes_visiveis)} de {total_geral}")
        import re as _re
        rotulo = pg.locator("text=/treinos? em Agosto/i").first.inner_text()
        n_rotulo = int(_re.search(r"(\d+)", rotulo).group(1))
        checa("contagem do rotulo bate com as linhas", n_rotulo == len(nomes_visiveis),
              f"rotulo diz {n_rotulo}, tem {len(nomes_visiveis)} linhas")

        selects.nth(3).select_option("")
        pg.wait_for_timeout(1200)
        checa("voltar para 'Todos os alunos' restaura a lista",
              pg.locator("div.space-y-0 > button").count() == total_geral,
              f"voltou com {pg.locator('div.space-y-0 > button').count()} de {total_geral}")

    print("\n== 4. clique na linha abre SO aquele treino ==")
    # Primeira linha da Jaise = 20/08 (lista ordenada do mais recente pro mais antigo)
    pg.locator("button", has_text="Jaise Soares").first.click()
    pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=20000)
    popup = pg.locator("div.fixed.inset-0.z-50")
    checa("popup do treino terminou de carregar", espera_carregar(pg, popup))
    txt = popup.inner_text()
    checa("popup abriu", popup.is_visible())
    checa("popup tem o nome da pessoa", tem(txt, "Jaise Soares"))
    checa("popup e do treino de 20/08", tem(txt, "20/08"))
    checa("mostra o nome do treino", tem(txt, "Treino B"))

    # É o detalhe de UM treino, nao o historico completo
    checa("NAO tem seletor de mes do historico", not tem(txt, "Todos os meses"))
    checa("NAO tem os cards de resumo do mes", not tem(txt, "Tempo total"))

    checa("tem as 4 caixas do treino",
          tem(txt, "Duração") and tem(txt, "Academia")
          and tem(txt, "Volume total") and tem(txt, "Média peso/rep"))
    checa("duracao exata 1:04:46", tem(txt, "1:04:46"))
    checa("academia BG", tem(txt, "BG"))
    checa("volume total 2.086 kg", tem(txt, "2.086"))
    checa("media peso/rep 13.4 kg", tem(txt, "13.4"))
    checa("secao Exercicios realizados", tem(txt, "Exercícios realizados"))
    checa("exercicios reais do dia",
          tem(txt, "Elevação Lateral com Halteres") and tem(txt, "Desenvolvimento na Máquina")
          and tem(txt, "Crucifixo Invertido"))
    checa("series com peso e reps", tem(txt, "6kg × 6") and tem(txt, "16kg × 10"))
    checa("kg/rep por exercicio", tem(txt, "kg/rep"))
    checa("admin nao ve botao de excluir", popup.locator("button[title='Excluir treino']").count() == 0)

    pg.keyboard.press("Escape")
    pg.wait_for_timeout(800)
    checa("ESC fecha o popup", pg.locator("div.fixed.inset-0.z-50").count() == 0)

    print("\n== 5. buscar historico completo (topo) ==")
    sel_aluno = pg.locator("select").first
    opcoes = pg.eval_on_selector_all("select >> nth=0 >> option", "els => els.map(e => e.textContent.trim())")
    alvo = next((o for o in opcoes if "Cavalcante" in o), None)
    checa("Livia esta no seletor do topo", alvo is not None, alvo or "nao achou")
    if alvo:
        sel_aluno.select_option(label=alvo)
        pg.locator("button", has_text="Buscar").first.click()
        pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=20000)
        popup = pg.locator("div.fixed.inset-0.z-50")
        checa("popup da busca terminou de carregar", espera_carregar(pg, popup))
        t = popup.inner_text()
        checa("popup da busca abriu", popup.is_visible())
        checa("popup da busca e da Livia", tem(t, "Cavalcante"))
        checa("Livia tem treinos no popup (era invisivel antes)", not tem(t, "Nenhum treino registrado"))
        checa("treinos da Livia marcados sem cronometro", tem(t, "sem cronômetro"))
        # Aqui SIM e o historico completo: seletor de mes e cards de resumo
        checa("Buscar abre o historico completo (tem seletor de mes)", tem(t, "Todos os meses"))
        checa("historico completo tem Total/Tempo total/Media",
              tem(t, "Total") and tem(t, "Tempo total") and tem(t, "Média"))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(600)

    print("\n== 6. o BUG ORIGINAL: Relatorio de outro aluno ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=relatorio", wait_until="domcontentloaded")
    pg.wait_for_selector("select", timeout=30000)
    pg.wait_for_timeout(1500)
    opcoes = pg.eval_on_selector_all("select >> nth=0 >> option", "els => els.map(e => e.textContent.trim())")
    alvo = next((o for o in opcoes if "Jaise" in o), None)
    checa("Jaise no seletor do relatorio", alvo is not None)
    if alvo:
        pg.locator("select").nth(0).select_option(label=alvo)
        pg.wait_for_timeout(4000)
        corpo = pg.inner_text("body")
        m = re.search(r"TREINOS NO M[ÊE]S\s*\n?\s*(\d+)", corpo, re.IGNORECASE)
        valor = m.group(1) if m else "?"
        checa("Relatorio da Jaise mostra 8 treinos (era 0)", valor == "8", f"veio {valor}")
        checa("volume deixou de ser zero", "39.417" in corpo, "esperado 39.417 kg-rep")
        # O nome do grupo so e usado na secao "Visao Semanal" do PDF (exportarPDF),
        # nunca na tela — entao aqui expandimos a semana e conferimos os exercicios.
        semana3 = pg.locator("div.cursor-pointer", has_text="Semana 3").first
        semana3.click()
        pg.wait_for_timeout(2000)
        corpo = pg.inner_text("body")
        checa("semana expande e mostra os exercicios reais",
              tem(corpo, "Elevação Lateral") or tem(corpo, "Crucifixo Invertido")
              or tem(corpo, "Desenvolvimento na Máquina"),
              "exercicios da Jaise em 17-20/08")
        checa("series com carga aparecem", "kg" in corpo)

    print("\n== 7. console ==")
    reais = [e for e in erros_console if "favicon" not in e.lower() and "manifest" not in e.lower()]
    checa("sem erros de console", len(reais) == 0, " | ".join(reais[:3]) if reais else "limpo")

    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_timeout(4000)
    pg.screenshot(path="/tmp/pc_gate1_historico.png", full_page=True)
    ctx.close()
    nav.close()

print(f"\n{'='*50}\n{len(passes)}/{len(passes)+len(falhas)} PASS")
if falhas:
    print("FALHAS: " + " | ".join(falhas))
    sys.exit(1)
print("smoke UI OK")
