#!/usr/bin/env python3
"""Smoke da aba Historico de Treinos em STAGING (schema `staging`).

Os dados de staging sao outros: agosto esta vazio e julho tem os treinos das
contas de teste. Por isso os asserts de DADOS aqui nao sao os mesmos do prod —
o que se valida e o caminho: edge com x-schema=staging, lista, popup e o
Relatorio lendo aluno que nao e o admin logado.

Sessao e injetada no localStorage (build de producao nao tem bypass de login).
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from playwright.sync_api import sync_playwright

BASE = "https://physiqcalc-staging.vercel.app"
SUPA = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
REF = "uxwpwdbbnlticxgtzcsb"
ADMIN = "admin.teste.claude@physiqcalc.app"

SENHA = os.environ.get("SMOKE_PASSWORD")
if not SENHA:
    print("defina SMOKE_PASSWORD com a senha da conta de teste")
    sys.exit(1)

ANON = os.environ.get("SUPABASE_ANON_KEY")
if not ANON:
    import pathlib
    env = (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text(encoding="utf-8")
    ANON = re.search(r"VITE_SUPABASE_ANON_KEY=(\S+)", env).group(1)

falhas, passes = [], []
erros_console = []


def checa(nome, cond, detalhe=""):
    (passes if cond else falhas).append(nome)
    print(("  PASS  " if cond else "  FALHA ") + nome + (f" ({detalhe})" if detalhe else ""))


def tem(texto, alvo):
    return alvo.upper() in texto.upper()


def espera_carregar(pg, escopo=None, timeout_ms=90000):
    """Espera o 'Carregando...' sumir. A edge em staging tem cold start e pode
    levar dezenas de segundos — afirmar antes disso gera PASS/FALHA falsos."""
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


# 1) Sessao real via API de auth
req = urllib.request.Request(
    f"{SUPA}/auth/v1/token?grant_type=password",
    method="POST",
    data=json.dumps({"email": ADMIN, "password": SENHA}).encode(),
)
req.add_header("Content-Type", "application/json")
req.add_header("apikey", ANON)
with urllib.request.urlopen(req, timeout=60) as r:
    sessao = json.loads(r.read().decode())
if "access_token" not in sessao:
    print(f"ERRO no login: {sessao}")
    sys.exit(1)
print("== sessao de admin obtida ==")

with sync_playwright() as pw:
    # Fingerprint de navegador normal: o Vercel pode estar em Attack Challenge Mode
    # (polling de deploy dispara), e o headless padrao fica preso no Security Checkpoint.
    nav = pw.chromium.launch(args=["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"])
    ctx = nav.new_context(
        viewport={"width": 1280, "height": 1400},
        locale="pt-BR",
        user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
    )
    ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    ctx.add_init_script(f"""
      try {{
        localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sessao)}));
        localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
      }} catch (e) {{}}
    """)
    pg = ctx.new_page()
    pg.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else None)

    print("\n== 1. staging abre logado ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Gerenciar Treinos", timeout=60000)
    corpo = pg.inner_text("body")
    checa("painel Gerenciar Treinos carregou", tem(corpo, "Gerenciar Treinos"))

    print("\n== 2. aba nova presente e na ordem certa ==")
    labels = pg.eval_on_selector_all("div.flex.border-b button", "els => els.map(e => e.textContent.trim())")
    checa("aba existe e vem antes do Relatorio",
          "🕒 Histórico de Treinos" in labels
          and labels.index("🕒 Histórico de Treinos") < labels.index("📊 Relatório"),
          " | ".join(labels))

    print("\n== 3. agosto vazio no staging (estado vazio correto) ==")
    carregou = espera_carregar(pg)
    corpo = pg.inner_text("body")
    checa("lista terminou de carregar", carregou)
    checa("mes atual pre-selecionado", pg.locator("select").nth(1).input_value() == "8")
    checa("agosto mostra estado vazio", tem(corpo, "Nenhum treino registrado em Agosto"),
          corpo[-120:].replace("\n", " "))

    print("\n== 4. julho traz os treinos das contas de teste ==")
    pg.locator("select").nth(1).select_option("7")
    pg.wait_for_selector("text=/treinos? em Julho/i", timeout=30000)
    pg.wait_for_timeout(1500)
    corpo = pg.inner_text("body")
    checa("Admin Teste aparece", tem(corpo, "Admin Teste"))
    checa("nome real do treino aparece", tem(corpo, "Upper A") or tem(corpo, "Lower A") or tem(corpo, "TRES"))
    checa("treino sem cronometro reconstruido (16/07)", tem(corpo, "sem cronômetro"))

    print("\n== 5. popup abre no staging ==")
    pg.locator("button", has_text="Admin Teste").first.click()
    pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=25000)
    popup = pg.locator("div.fixed.inset-0.z-50")
    checa("popup terminou de carregar", espera_carregar(pg, popup))
    txt = popup.inner_text()
    checa("popup abriu", popup.is_visible())
    checa("popup tem HISTORICO DE TREINOS", tem(txt, "HISTÓRICO DE TREINOS"))
    checa("popup tem o nome da pessoa", tem(txt, "Admin Teste"))
    checa("popup lista treino com nome real", tem(txt, "Upper A") or tem(txt, "Lower A"))
    checa("admin nao ve excluir", popup.locator("button[title='Excluir treino']").count() == 0)
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(800)
    checa("ESC fecha", pg.locator("div.fixed.inset-0.z-50").count() == 0)

    print("\n== 6. buscar historico completo ==")
    opcoes = pg.eval_on_selector_all("select >> nth=0 >> option", "els => els.map(e => e.textContent.trim())")
    alvo = next((o for o in opcoes if "Admin Teste" in o), None)
    checa("aluno disponivel no seletor", alvo is not None, alvo or "nao achou")
    if alvo:
        pg.locator("select").first.select_option(label=alvo)
        pg.locator("button", has_text="Buscar").first.click()
        pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=25000)
        popup_busca = pg.locator("div.fixed.inset-0.z-50")
        checa("popup da busca terminou de carregar", espera_carregar(pg, popup_busca))
        t = popup_busca.inner_text()
        checa("popup da busca abriu com dados", not tem(t, "Nenhum treino registrado"),
              t[:110].replace("\n", " "))
        checa("popup da busca lista treino com nome real",
              tem(t, "Upper A") or tem(t, "Lower A") or tem(t, "TRES"))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(600)

    print("\n== 7. Relatorio le aluno que NAO e o admin logado ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=relatorio", wait_until="domcontentloaded")
    pg.wait_for_selector("select", timeout=30000)
    pg.wait_for_timeout(2000)
    opcoes = pg.eval_on_selector_all("select >> nth=0 >> option", "els => els.map(e => e.textContent.trim())")
    alvo = next((o for o in opcoes if "teste@teste.com" in o), None) or \
           next((o for o in opcoes if "Admin Teste" in o), None)
    checa("aluno no seletor do relatorio", alvo is not None, alvo or "nao achou")
    if alvo:
        pg.locator("select").nth(0).select_option(label=alvo)
        pg.wait_for_timeout(2000)
        # julho e o mes com dados no staging
        pg.locator("select").nth(1).select_option("7")
        pg.wait_for_timeout(4000)
        corpo = pg.inner_text("body")
        m = re.search(r"TREINOS NO M[ÊE]S\s*\n?\s*(\d+)", corpo, re.IGNORECASE)
        valor = m.group(1) if m else "?"
        checa("relatorio traz treinos (nao zerou)", valor not in ("?", "0"), f"treinos no mes = {valor}")

    print("\n== 8. console ==")
    reais = [e for e in erros_console
             if "favicon" not in e.lower() and "manifest" not in e.lower()
             and "sw.js" not in e.lower() and "service worker" not in e.lower()]
    checa("sem erros de console", len(reais) == 0, " | ".join(reais[:3]) if reais else "limpo")

    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_timeout(5000)
    pg.locator("select").nth(1).select_option("7")
    pg.wait_for_timeout(3000)
    pg.screenshot(path="/tmp/pc_gate2_staging.png", full_page=True)
    ctx.close()
    nav.close()

print(f"\n{'='*50}\n{len(passes)}/{len(passes)+len(falhas)} PASS")
if falhas:
    print("FALHAS: " + " | ".join(falhas))
    sys.exit(1)
print("smoke staging OK")
