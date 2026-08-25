#!/usr/bin/env python3
"""Prova viva em PRODUCAO da aba Historico de Treinos e do fix do Relatorio.

READ-ONLY: so navega e le. Roda na conta de teste admin, nunca na do Weslley
(rodar na mesma conta que ele usa ao vivo ja desfez acao dele no passado).
"""
import json
import os
import pathlib
import re
import sys
import urllib.request
from playwright.sync_api import sync_playwright

BASE = "https://physiqcalc.vercel.app"
SUPA = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
REF = "uxwpwdbbnlticxgtzcsb"
ADMIN = "admin.teste.claude@physiqcalc.app"

SENHA = os.environ.get("SMOKE_PASSWORD")
if not SENHA:
    print("defina SMOKE_PASSWORD com a senha da conta de teste")
    sys.exit(1)

env = (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text(encoding="utf-8")
ANON = re.search(r"VITE_SUPABASE_ANON_KEY=(\S+)", env).group(1)

falhas, passes = [], []
erros_console = []


def checa(nome, cond, detalhe=""):
    (passes if cond else falhas).append(nome)
    print(("  PASS  " if cond else "  FALHA ") + nome + (f" ({detalhe})" if detalhe else ""))


def tem(t, a):
    return a.upper() in t.upper()


def espera_carregar(pg, escopo=None, timeout_ms=90000):
    import time
    limite = time.time() + timeout_ms / 1000
    while time.time() < limite:
        try:
            texto = (escopo or pg.locator("body")).inner_text()
        except Exception:
            texto = "Carregando"
        if "Carregando" not in texto:
            return True
        pg.wait_for_timeout(500)
    return False


req = urllib.request.Request(f"{SUPA}/auth/v1/token?grant_type=password", method="POST",
                             data=json.dumps({"email": ADMIN, "password": SENHA}).encode())
req.add_header("Content-Type", "application/json")
req.add_header("apikey", ANON)
with urllib.request.urlopen(req, timeout=60) as r:
    sessao = json.loads(r.read().decode())
if "access_token" not in sessao:
    print(f"ERRO no login: {sessao}")
    sys.exit(1)
print("== sessao de admin (conta de teste) obtida ==")

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-blink-features=AutomationControlled",
                                   "--disable-dev-shm-usage"])
    ctx = nav.new_context(
        viewport={"width": 1280, "height": 1500}, locale="pt-BR",
        user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"))
    ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    ctx.add_init_script(f"""
      try {{
        localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sessao)}));
        localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
      }} catch (e) {{}}
    """)
    pg = ctx.new_page()
    pg.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else None)

    print("\n== 1. aba nova em producao ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Gerenciar Treinos", timeout=60000)
    labels = pg.eval_on_selector_all("div.flex.border-b button", "els => els.map(e => e.textContent.trim())")
    checa("aba existe e vem antes do Relatorio",
          "🕒 Histórico de Treinos" in labels
          and labels.index("🕒 Histórico de Treinos") < labels.index("📊 Relatório"),
          " | ".join(labels))

    print("\n== 2. lista de agosto com dados reais ==")
    checa("lista carregou", espera_carregar(pg))
    corpo = pg.inner_text("body")
    checa("mes atual pre-selecionado", pg.locator("select").nth(1).input_value() == "8")
    checa("18 treinos em agosto", tem(corpo, "18 treinos em Agosto"),
          [l for l in corpo.split("\n") if "treinos em" in l][:1])
    checa("Jaise na lista", tem(corpo, "Jaise Soares"))
    checa("Livia na lista (so aparece pela reconstrucao)", tem(corpo, "Cavalcante"))
    checa("nome real do treino", tem(corpo, "Treino B · Ombro + Tríceps"))
    checa("marcador sem cronometro", tem(corpo, "sem cronômetro"))

    print("\n== 3. filtro por aluno ==")
    selects = pg.locator("select")
    opcoes = pg.eval_on_selector_all("select >> nth=3 >> option", "els => els.map(e => e.textContent.trim())")
    checa("filtro por aluno presente", "Todos os alunos" in opcoes, " | ".join(opcoes))
    total = pg.locator("div.space-y-0 > button").count()
    alvo = next((o for o in opcoes if "Jaise" in o), None)
    if alvo:
        selects.nth(3).select_option(label=alvo)
        pg.wait_for_timeout(1200)
        linhas = pg.locator("div.space-y-0 > button")
        nomes = [linhas.nth(i).inner_text() for i in range(linhas.count())]
        checa("filtrando pela Jaise sobra so ela",
              len(nomes) > 0 and all(tem(n, "Jaise") for n in nomes), f"{len(nomes)} de {total}")
        selects.nth(3).select_option("")
        pg.wait_for_timeout(1200)

    print("\n== 4. popup de UM treino (20/08 da Jaise) ==")
    pg.locator("button", has_text="Jaise Soares").first.click()
    pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=25000)
    popup = pg.locator("div.fixed.inset-0.z-50")
    checa("popup carregou", espera_carregar(pg, popup))
    txt = popup.inner_text()
    checa("e o treino de 20/08", tem(txt, "20/08"))
    checa("nome do treino", tem(txt, "Treino B"))
    checa("NAO e o historico completo", not tem(txt, "Todos os meses") and not tem(txt, "Tempo total"))
    checa("duracao 1:04:46", tem(txt, "1:04:46"))
    checa("academia BG", tem(txt, "BG"))
    checa("volume total 2.086 kg", tem(txt, "2.086"))
    checa("media 13.4 kg/rep", tem(txt, "13.4"))
    checa("exercicios reais",
          tem(txt, "Elevação Lateral com Halteres") and tem(txt, "Crucifixo Invertido"))
    checa("series com carga", tem(txt, "6kg × 6"))
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(800)

    print("\n== 5. Buscar = historico completo ==")
    opcoes = pg.eval_on_selector_all("select >> nth=0 >> option", "els => els.map(e => e.textContent.trim())")
    alvo = next((o for o in opcoes if "Cavalcante" in o), None)
    if alvo:
        pg.locator("select").first.select_option(label=alvo)
        pg.locator("button", has_text="Buscar").first.click()
        pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=25000)
        popup = pg.locator("div.fixed.inset-0.z-50")
        checa("popup do historico carregou", espera_carregar(pg, popup))
        t = popup.inner_text()
        checa("e da Livia", tem(t, "Cavalcante"))
        checa("tem seletor de mes", tem(t, "Todos os meses"))
        checa("tem Total/Tempo total/Media",
              tem(t, "Total") and tem(t, "Tempo total") and tem(t, "Média"))
        checa("Livia tem treinos (era invisivel antes)", not tem(t, "Nenhum treino registrado"))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(800)

    print("\n== 6. O BUG ORIGINAL corrigido em producao ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=relatorio", wait_until="domcontentloaded")
    pg.wait_for_selector("select", timeout=45000)
    pg.wait_for_timeout(2000)
    opcoes = pg.eval_on_selector_all("select >> nth=0 >> option", "els => els.map(e => e.textContent.trim())")
    alvo = next((o for o in opcoes if "Jaise" in o), None)
    checa("Jaise no seletor", alvo is not None)
    if alvo:
        pg.locator("select").nth(0).select_option(label=alvo)
        pg.wait_for_timeout(5000)
        corpo = pg.inner_text("body")
        m = re.search(r"TREINOS NO M[ÊE]S\s*\n?\s*(\d+)", corpo, re.IGNORECASE)
        valor = m.group(1) if m else "?"
        checa("Relatorio da Jaise mostra 8 treinos (era 0)", valor == "8", f"veio {valor}")
        checa("volume 39.417 kg-rep (era 0)", "39.417" in corpo)

    print("\n== 7. console ==")
    reais = [e for e in erros_console
             if "favicon" not in e.lower() and "manifest" not in e.lower()
             and "sw.js" not in e.lower()]
    checa("sem erros de console", len(reais) == 0, " | ".join(reais[:3]) if reais else "limpo")

    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_timeout(6000)
    pg.screenshot(path="/tmp/prod_historico.png", full_page=True)
    ctx.close()
    nav.close()

print(f"\n{'='*50}\n{len(passes)}/{len(passes)+len(falhas)} PASS")
if falhas:
    print("FALHAS: " + " | ".join(falhas))
    sys.exit(1)
print("PROVA VIVA EM PRODUCAO OK")
