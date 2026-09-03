#!/usr/bin/env python3
"""Smoke E2E — popup "Séries": cliques rápidos em + / − não voltam pra trás (era "8 → 7 → 8") e gravam certo.

Conta: admin.teste.claude (STAGING; "Peito + tríceps" marcado na Terça).
Roteiro:
  1. popup abre com Tríceps Testa = 3; observador grava toda mudança do valor na tela
  2. 4 cliques rápidos em "+" → tela vai a 7 na hora; valor NUNCA regride (sequência monotônica); banco = 7;
     2,5 s depois a tela continua 7 (nenhuma recarga atrasada sobrescreveu); menos requisições que cliques (coalescência)
  3. 2 cliques rápidos em "−" → 5, sem subir de volta; banco = 5
  4. "+" (→6) e logo "Aplicar a todos" 4 sem esperar → banco = só geral 4 (próprio apagado); tela do Testa = 4
  5. limpeza

Env: SMOKE_BASE (default http://localhost:5173), SMOKE_SCHEMA (default staging), SUPABASE_PAT ou ~/.pc-pat,
SMOKE_INJECT_SESSION=1 + SUPABASE_ANON_KEY + SMOKE_PASSWORD (build sem auto-login, ex. staging Vercel).
"""
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173").rstrip("/")
SCHEMA = os.environ.get("SMOKE_SCHEMA", "staging")
SHOTS = os.environ.get("SMOKE_SHOTS", "/tmp")
INJECT = os.environ.get("SMOKE_INJECT_SESSION") == "1"
REF = "uxwpwdbbnlticxgtzcsb"
SUPABASE_URL = f"https://{REF}.supabase.co"
USER_ID = "e4c5fb14-fe3b-4a51-a49f-ceed61485054"  # admin.teste.claude
GRUPO_ID = "1427b068-58ab-417c-a13f-65e3489b76f2"  # Peito + tríceps
TESTA_ID = "c7016a9d-1af3-4238-929f-adae75005ce6"  # Tríceps Testa
TESTA = "Tríceps Testa"
KEY = f"catalogo:{GRUPO_ID}"
SEL_VALOR = f"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]"
PAT = os.environ.get("SUPABASE_PAT") or open(os.path.expanduser("~/.pc-pat")).read().strip()

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
    rows = sql(f"SELECT exercicio_id, num_series FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}' AND grupo_id='{GRUPO_ID}'")
    return {r["exercicio_id"]: r["num_series"] for r in rows}


def sessao_admin():
    anon = os.environ["SUPABASE_ANON_KEY"]
    body = json.dumps({"email": "admin.teste.claude@physiqcalc.app", "password": os.environ["SMOKE_PASSWORD"]}).encode()
    req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=body,
                                 headers={"apikey": anon, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def abrir_admin(pg):
    pg.goto(f"{BASE}/admin?v=config&u={USER_ID}&ct=treino&wt=semana", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Marque os treinos que aparecem em cada dia", timeout=120000)
    pg.locator("button", has_text="Terça").first.click()
    pg.locator(f"[data-admin-series-treino='{KEY}']").first.wait_for(timeout=30000)


def abrir_popup(pg):
    pg.locator(f"[data-admin-series-treino='{KEY}']").first.click()
    dlg = pg.locator("[role=dialog]")
    dlg.locator("[data-admin-series-exercicio]").first.wait_for(timeout=30000)
    return dlg


def esperar_banco(pg, pred, tentativas=150):
    """espera o banco (fonte da verdade) refletir o esperado — a gravação enfileirada terminou. Sem depender de UI."""
    ultimo = None
    for _ in range(tentativas):
        ultimo = linhas_banco()
        if pred(ultimo):
            return ultimo
        pg.wait_for_timeout(400)
    return ultimo


def valor_tela(pg):
    return int(pg.locator(SEL_VALOR).inner_text().strip())


def instalar_observador(pg):
    """grava em window.__vals toda mudança do valor do Testa na tela (via MutationObserver no dialog)"""
    pg.evaluate(
        """sel => {
             const ler = () => document.querySelector(sel)?.textContent.trim();
             window.__vals = [ler()];
             const obs = new MutationObserver(() => {
               const v = ler();
               if (v && window.__vals[window.__vals.length - 1] !== v) window.__vals.push(v);
             });
             obs.observe(document.querySelector('[role=dialog]'), { subtree: true, childList: true, characterData: true });
           }""",
        SEL_VALOR,
    )


def valores_vistos(pg):
    return [int(v) for v in pg.evaluate("() => window.__vals")]


def monotonico(vals, crescente=True):
    return all((b >= a) if crescente else (b <= a) for a, b in zip(vals, vals[1:]))


# estado limpo antes de começar
sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-dev-shm-usage"])
    ctx = nav.new_context(viewport={"width": 430, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    ctx.add_init_script("try { localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR')); } catch (e) {}")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    gravacoes = []  # requisições de gravação (setSeriesPadrao / aplicarSeriesTreino)

    def on_request(req):
        if "admin-semana-treinos" in req.url and req.method == "POST":
            corpo = req.post_data or ""
            if "setSeriesPadrao" in corpo or "aplicarSeriesTreino" in corpo:
                gravacoes.append(corpo)

    pg.on("request", on_request)

    if INJECT:
        sess = sessao_admin()
        pg.goto(BASE + "/", wait_until="domcontentloaded")
        pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{REF}-auth-token", json.dumps(sess)])

    try:
        # --- 1. popup
        abrir_admin(pg)
        dlg = abrir_popup(pg)
        check(valor_tela(pg) == 3, "1. popup abre com Tríceps Testa = 3 (padrão)")
        instalar_observador(pg)
        mais = dlg.locator(f"button[aria-label='Mais uma série em {TESTA}']")
        menos = dlg.locator(f"button[aria-label='Menos uma série em {TESTA}']")

        # --- 2. 4 cliques rápidos em +
        n_antes = len(gravacoes)
        t0 = time.time()
        for _ in range(4):
            mais.click(no_wait_after=True)
        check(valor_tela(pg) == 7 and time.time() - t0 < 2, f"2. tela foi a 7 na hora ({time.time() - t0:.2f}s)")
        esperar_banco(pg, lambda b: b.get(TESTA_ID) == 7)
        pg.wait_for_timeout(2500)  # dá tempo de uma recarga atrasada chegar — a tela NÃO pode regredir
        vals = valores_vistos(pg)
        check(monotonico(vals) and vals[-1] == 7, f"2. valor NUNCA regrediu durante a gravação (visto: {vals})")
        check(valor_tela(pg) == 7, "2. 2,5 s depois de salvar a tela continua 7 (nenhuma recarga atrasada sobrescreveu)")
        # asserção só do Testa: a tabela recebe escrita concorrente legítima (feature de espelho do app do aluno)
        check(linhas_banco().get(TESTA_ID) == 7, f"2. banco: Testa = 7 (visto: {linhas_banco()})")
        n_req = len(gravacoes) - n_antes
        check(1 <= n_req < 4, f"2. coalescência: {n_req} gravação(ões) pra 4 cliques")
        pg.screenshot(path=f"{SHOTS}/smoke-cliques-2-mais.png")

        # --- 3. 2 cliques rápidos em −
        pg.evaluate("() => { window.__vals = [window.__vals[window.__vals.length - 1]]; }")
        for _ in range(2):
            menos.click(no_wait_after=True)
        check(valor_tela(pg) == 5, "3. tela foi a 5 na hora")
        esperar_banco(pg, lambda b: b.get(TESTA_ID) == 5)
        pg.wait_for_timeout(2500)
        vals = valores_vistos(pg)
        check(monotonico(vals, crescente=False) and vals[-1] == 5, f"3. valor não subiu de volta (visto: {vals})")
        check(linhas_banco().get(TESTA_ID) == 5, f"3. banco: Testa = 5 (visto: {linhas_banco()})")

        # --- 4. "+" e logo "Aplicar a todos" 4 (ordem cronológica preservada: aplicar depois do +)
        mais.click(no_wait_after=True)
        check(valor_tela(pg) == 6, "4. tela foi a 6")
        dlg.locator("button[aria-label='Mais uma série (todos)']").click()  # rascunho 3 → 4
        pg.wait_for_function("() => document.querySelector('[data-admin-series-geral-valor]')?.textContent.trim() === '4'", timeout=10000)
        dlg.locator("button", has_text="Aplicar a todos").click(no_wait_after=True)
        check(valor_tela(pg) == 4, "4. tela do Testa foi a 4 na hora (aplicar zera o próprio)")
        esperar_banco(pg, lambda b: b.get(None) == 4 and TESTA_ID not in b)
        banco4 = linhas_banco()
        check(banco4.get(None) == 4 and TESTA_ID not in banco4, f"4. banco: geral = 4 e o próprio do Testa apagado (visto: {banco4})")
        check(valor_tela(pg) == 4, "4. tela continua 4 depois de salvar")
        check("PRÓPRIO" not in dlg.locator(f"[data-admin-series-exercicio='ex:{TESTA_ID}']").inner_text().upper(), "4. Testa sem selo 'próprio'")
        pg.screenshot(path=f"{SHOTS}/smoke-cliques-4-aplicar.png")

        check(not erros, f"sem erro de página ({len(erros)})")
    finally:
        sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
        check(linhas_banco() == {}, "5. limpeza: config do usuário de teste apagada")
        nav.close()

print(f"\n{ok}/{ok + fail} PASS")
sys.exit(0 if fail == 0 else 1)
