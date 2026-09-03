#!/usr/bin/env python3
"""Smoke adaptativo pra PRODUÇÃO (schema public) — não depende de treino específico na semana do usuário de teste.

Roteiro (conta admin.teste, sessão injetada):
  1. Volume Semanal › Programado renderiza (blocos > 0) com a descrição nova e sem erro de página
  2. Treino Diário: abre o 1º dia que tem treino marcado → 1º badge "Séries" → popup → 1º exercício: "+" → banco
     (public.tb_series_padrao_usuario) recebe a linha própria = valor da tela; tela nunca regride; "−" → banco volta
  3. limpeza: apaga as linhas de config do usuário de teste (estado igual ao inicial)

Env: SMOKE_BASE (default https://physiqcalc.vercel.app), SMOKE_SCHEMA (default public), SUPABASE_PAT ou ~/.pc-pat,
SMOKE_INJECT_SESSION=1 + SUPABASE_ANON_KEY + SMOKE_PASSWORD.
"""
import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "https://physiqcalc.vercel.app").rstrip("/")
SCHEMA = os.environ.get("SMOKE_SCHEMA", "public")
SHOTS = os.environ.get("SMOKE_SHOTS", "/tmp")
INJECT = os.environ.get("SMOKE_INJECT_SESSION") == "1"
REF = "uxwpwdbbnlticxgtzcsb"
SUPABASE_URL = f"https://{REF}.supabase.co"
USER_ID = "e4c5fb14-fe3b-4a51-a49f-ceed61485054"
PAT = os.environ.get("SUPABASE_PAT") or open(os.path.expanduser("~/.pc-pat")).read().strip()
DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

ok = 0
fail = 0


def check(cond, msg):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS {msg}")
    else:
        fail += 1
        print(f"  FAIL {msg}")


def sql(query):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.0"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())


def linhas_banco():
    """[(exercicio_id|exercicio_usuario_id|None, num_series)] do usuário de teste (todos os treinos)"""
    rows = sql(f"SELECT exercicio_id, exercicio_usuario_id, num_series FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
    return sorted((r["exercicio_id"] or r["exercicio_usuario_id"], r["num_series"]) for r in rows)


def esperar_banco(pg, pred, tentativas=75):
    ultimo = None
    for _ in range(tentativas):
        ultimo = linhas_banco()
        if pred(ultimo):
            return ultimo
        pg.wait_for_timeout(400)
    return ultimo


def sessao_admin():
    anon = os.environ["SUPABASE_ANON_KEY"]
    body = json.dumps({"email": "admin.teste.claude@physiqcalc.app", "password": os.environ["SMOKE_PASSWORD"]}).encode()
    req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=body,
                                 headers={"apikey": anon, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
antes = linhas_banco()

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-dev-shm-usage"])
    ctx = nav.new_context(viewport={"width": 430, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    ctx.add_init_script("try { localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR')); } catch (e) {}")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    if INJECT:
        sess = sessao_admin()
        pg.goto(BASE + "/", wait_until="domcontentloaded")
        pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{REF}-auth-token", json.dumps(sess)])
    try:
        # --- 1. Volume renderiza
        pg.goto(f"{BASE}/admin?v=config&u={USER_ID}&ct=treino&wt=volume", wait_until="domcontentloaded")
        pg.wait_for_selector("text=Séries semanais programadas", timeout=120000)
        pg.wait_for_function("() => !document.body.innerText.includes('Carregando') && document.querySelectorAll('[data-admin-volume-bloco]').length > 0", timeout=90000)
        corpo = pg.inner_text("body")
        n_blocos = pg.locator("[data-admin-volume-bloco]").count()
        check(n_blocos > 0, f"1. Volume › Programado renderiza {n_blocos} blocos")
        check("nº configurado no Treino Diário" in corpo, "1. descrição nova (fonte = nº configurado no Treino Diário)")
        check("último treino registrado" not in corpo, "1. texto antigo ('último treino registrado') sumiu")
        pg.screenshot(path=f"{SHOTS}/prod-1-volume.png", full_page=True)

        # --- 2. popup Séries no 1º dia com treino marcado
        pg.goto(f"{BASE}/admin?v=config&u={USER_ID}&ct=treino&wt=semana", wait_until="domcontentloaded")
        pg.wait_for_selector("text=Marque os treinos que aparecem em cada dia", timeout=120000)
        badge = None
        for dia in DIAS:
            pg.locator("button", has_text=dia).first.click()
            pg.wait_for_timeout(400)
            if pg.locator("[data-admin-series-treino]").count() > 0:
                badge = pg.locator("[data-admin-series-treino]").first
                print(f"  (dia com treino marcado: {dia}, treino {badge.get_attribute('data-admin-series-treino')})")
                break
            pg.locator("button", has_text=dia).first.click()  # fecha o dia
        check(badge is not None, "2. achou um dia com treino marcado e badge Séries")
        badge.click()
        dlg = pg.locator("[role=dialog]")
        dlg.locator("[data-admin-series-exercicio]").first.wait_for(timeout=30000)
        primeiro = dlg.locator("[data-admin-series-exercicio]").first
        chave = primeiro.get_attribute("data-admin-series-exercicio")  # ex:<id> | exu:<id>
        exid = chave.split(":", 1)[1]
        valor = lambda: int(primeiro.locator("[data-admin-series-exercicio-valor]").inner_text().strip())
        v0 = valor()
        check("salvando" not in dlg.inner_text().lower(), "2. popup sem texto 'salvando…'")
        # observador: registra toda mudança do valor na tela
        pg.evaluate("""sel => { const ler=()=>document.querySelector(sel)?.textContent.trim(); window.__vals=[ler()];
            new MutationObserver(()=>{const v=ler(); if(v && window.__vals[window.__vals.length-1]!==v) window.__vals.push(v);})
            .observe(document.querySelector('[role=dialog]'),{subtree:true,childList:true,characterData:true}); }""",
            f"[data-admin-series-exercicio='{chave}'] [data-admin-series-exercicio-valor]")
        primeiro.locator("button[aria-label^='Mais uma série']").click(no_wait_after=True)
        check(valor() == v0 + 1, f"2. '+' na hora: {v0} → {v0 + 1}")
        b = esperar_banco(pg, lambda rows: (exid, v0 + 1) in rows)
        check((exid, v0 + 1) in b, f"2. banco ({SCHEMA}): linha própria = {v0 + 1} (visto: {b})")
        pg.wait_for_timeout(2500)
        vals = [int(x) for x in pg.evaluate("() => window.__vals")]
        check(vals == sorted(vals) and vals[-1] == v0 + 1, f"2. tela nunca regrediu (visto: {vals})")
        primeiro.locator("button[aria-label^='Menos uma série']").click(no_wait_after=True)
        check(valor() == v0, f"2. '−' na hora: volta a {v0}")
        b = esperar_banco(pg, lambda rows: (exid, v0) in rows)
        check((exid, v0) in b, f"2. banco: linha própria voltou a {v0} (visto: {b})")
        check("salvando" not in dlg.inner_text().lower(), "2. continua sem 'salvando…'")
        pg.screenshot(path=f"{SHOTS}/prod-2-popup.png")
        dlg.locator("button", has_text="Concluir").click()
        check(not erros, f"sem erro de página ({len(erros)})")
    finally:
        sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
        check(linhas_banco() == antes == [], "3. limpeza: config do usuário de teste igual ao inicial (vazia)")
        nav.close()

print(f"\n{ok}/{ok + fail} PASS")
sys.exit(0 if fail == 0 else 1)
