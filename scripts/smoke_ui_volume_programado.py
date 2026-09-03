#!/usr/bin/env python3
"""Smoke E2E — Volume Semanal › Programado usa o nº de séries configurado no Treino Diário (badge "Séries").

Conta: admin.teste.claude (admin + aluno em STAGING; "Peito + tríceps" marcado na Terça, "Upper Teste" Ter+Qua).
Roteiro:
  1. Volume › Programado sem configuração: todas as linhas "3 séries*" + nota "sem nº configurado"
  2. Treino Diário › badge "Séries" (Peito + tríceps) › "Aplicar a todos" 4 → Volume: exercícios do treino = 4 (sem *);
     Tríceps Pulley (também no Upper Teste) vira 2 linhas: 4 (1×) e 3* (2×) — config de um treino não vaza pro outro;
     Ombro (só Upper Teste) segue 3*; total de cada bloco = soma dos subtotais
  3. "+" no Tríceps Testa → 5 → Volume: Testa 5 (próprio), demais do treino 4
  4. limpeza (DELETE) → Volume volta a 3* em tudo
  5. Praticado continua renderizando ("Séries CONCLUÍDAS")

Env: SMOKE_BASE (default http://localhost:5173), SMOKE_SCHEMA (default staging), SUPABASE_PAT ou ~/.pc-pat,
SMOKE_INJECT_SESSION=1 + SUPABASE_ANON_KEY + SMOKE_PASSWORD (build sem auto-login, ex. staging Vercel).
"""
import json
import os
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173").rstrip("/")
SCHEMA = os.environ.get("SMOKE_SCHEMA", "staging")
SHOTS = os.environ.get("SMOKE_SHOTS", "/tmp")
INJECT = os.environ.get("SMOKE_INJECT_SESSION") == "1"
REF = "uxwpwdbbnlticxgtzcsb"
SUPABASE_URL = f"https://{REF}.supabase.co"
USER_ID = "e4c5fb14-fe3b-4a51-a49f-ceed61485054"  # admin.teste.claude
GRUPO_ID = "1427b068-58ab-417c-a13f-65e3489b76f2"  # Peito + tríceps (catálogo)
TESTA_ID = "c7016a9d-1af3-4238-929f-adae75005ce6"  # Tríceps Testa
TESTA = "Tríceps Testa"
PULLEY = "Tríceps Pulley"  # está no Peito + tríceps E no Upper Teste (pessoal)
KEY = f"catalogo:{GRUPO_ID}"
URL_VOLUME = f"{BASE}/admin?v=config&u={USER_ID}&ct=treino&wt=volume"
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


# ---------- Volume Semanal ----------
def abrir_volume(pg):
    pg.goto(URL_VOLUME, wait_until="domcontentloaded")
    pg.wait_for_selector("text=Séries semanais programadas", timeout=120000)
    pg.wait_for_function(
        "() => !document.body.innerText.includes('Carregando') && document.querySelectorAll('[data-admin-volume-bloco]').length > 0",
        timeout=90000)


def ler_bloco(pg, key):
    """abre o bloco (só um fica aberto por vez) e devolve {total, linhas:[{nome, series, padrao, subtotal}]}"""
    bloco = pg.locator(f"[data-admin-volume-bloco='{key}']")
    if bloco.locator("[data-admin-volume-detalhe]").count() == 0:
        bloco.locator(":scope > button").click()
    bloco.locator("[data-admin-volume-detalhe]").first.wait_for(timeout=15000)
    return bloco.evaluate(
        """el => ({
             total: Number(el.querySelector('[data-admin-volume-total]').getAttribute('data-admin-volume-total')),
             linhas: [...el.querySelectorAll('[data-admin-volume-detalhe]')].map(d => ({
               nome: d.getAttribute('data-admin-volume-detalhe'),
               series: Number(d.getAttribute('data-admin-volume-series')),
               padrao: d.getAttribute('data-admin-volume-padrao') === '1',
               subtotal: Number(d.getAttribute('data-admin-volume-subtotal')),
               texto: d.textContent.trim(),
             })),
           })""")


def ler_todos(pg):
    keys = pg.locator("[data-admin-volume-bloco]").evaluate_all("els => els.map(e => e.getAttribute('data-admin-volume-bloco'))")
    return {k: ler_bloco(pg, k) for k in keys}


def linhas_de(blocos, nome):
    return [l for b in blocos.values() for l in b["linhas"] if l["nome"] == nome]


def soma_bate(blocos):
    return all(abs(b["total"] - sum(l["subtotal"] for l in b["linhas"])) < 1e-9 for b in blocos.values())


# ---------- Treino Diário (badge "Séries" → popup) ----------
def abrir_admin(pg):
    pg.goto(f"{BASE}/admin?v=config&u={USER_ID}&ct=treino&wt=semana", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Marque os treinos que aparecem em cada dia", timeout=120000)
    pg.locator("button", has_text="Terça").first.click()  # Peito + tríceps está MARCADO na Terça
    pg.locator(f"[data-admin-series-treino='{KEY}']").first.wait_for(timeout=30000)


def abrir_popup(pg):
    pg.locator(f"[data-admin-series-treino='{KEY}']").first.click()
    dlg = pg.locator("[role=dialog]")
    dlg.locator("[data-admin-series-exercicio]").first.wait_for(timeout=30000)
    return dlg


def esperar_banco(pg, pred, tentativas=75):
    """espera o banco (fonte da verdade) refletir o esperado — a gravação enfileirada terminou. Sem depender de UI."""
    ultimo = None
    for _ in range(tentativas):
        ultimo = linhas_banco()
        if pred(ultimo):
            return ultimo
        pg.wait_for_timeout(400)
    return ultimo


def valor_exercicio(dlg, exid):
    return int(dlg.locator(f"[data-admin-series-exercicio='ex:{exid}'] [data-admin-series-exercicio-valor]").inner_text().strip())


def aplicar_todos(pg, dlg, n):
    atual = int(dlg.locator("[data-admin-series-geral-valor]").inner_text().strip())
    rotulo = "Mais uma série (todos)" if n > atual else "Menos uma série (todos)"
    for _ in range(abs(n - atual)):
        dlg.locator(f"button[aria-label='{rotulo}']").click()
    pg.wait_for_function("v => document.querySelector('[data-admin-series-geral-valor]')?.textContent.trim() === String(v)", arg=n, timeout=10000)
    dlg.locator("button", has_text="Aplicar a todos").click()
    pg.wait_for_timeout(300)
    esperar_banco(pg, lambda b: b.get(None) == n)


# estado limpo antes de começar
sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-dev-shm-usage"])
    ctx = nav.new_context(viewport={"width": 430, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    # o usuário de teste tem mensalidade pendente no staging → o aviso (overlay) já foi "visto hoje"
    ctx.add_init_script("try { localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR')); } catch (e) {}")
    pg = ctx.new_page()
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))

    if INJECT:
        sess = sessao_admin()
        pg.goto(BASE + "/", wait_until="domcontentloaded")
        pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{REF}-auth-token", json.dumps(sess)])

    try:
        # --- 1. sem configuração: tudo 3*
        abrir_volume(pg)
        texto = pg.inner_text("body")
        check("nº configurado no Treino Diário" in texto, "1. descrição diz que a fonte é o nº configurado no Treino Diário")
        antes = ler_todos(pg)
        todas = [l for b in antes.values() for l in b["linhas"]]
        check(len(antes) >= 3 and len(todas) >= 8, f"1. {len(antes)} blocos / {len(todas)} linhas carregadas")
        check(all(l["series"] == 3 and l["padrao"] for l in todas), "1. sem configuração, todas as linhas = 3 séries* (padrão)")
        check(pg.locator("[data-admin-volume-nota-padrao]").count() == 1, "1. nota '* sem nº configurado' aparece")
        check(soma_bate(antes), "1. total de cada bloco = soma dos subtotais")
        check(len(linhas_de(antes, PULLEY)) == 1 and linhas_de(antes, PULLEY)[0]["texto"].find("3×/sem") > 0,
              f"1. Tríceps Pulley (2 treinos, mesmo nº) é UMA linha × 3×/sem (visto: {[l['texto'] for l in linhas_de(antes, PULLEY)]})")
        pg.screenshot(path=f"{SHOTS}/smoke-volume-1-padrao.png")

        # --- 2. aplicar a todos = 4 no Peito + tríceps
        abrir_admin(pg)
        dlg = abrir_popup(pg)
        check(valor_exercicio(dlg, TESTA_ID) == 3, "2. popup abre com Testa = 3 (padrão)")
        aplicar_todos(pg, dlg, 4)
        pg.wait_for_function(f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '4'", timeout=15000)
        # chave-específico (a tabela recebe escrita concorrente legítima do app do aluno — feature de espelho)
        b2 = linhas_banco()
        check(b2.get(None) == 4 and TESTA_ID not in b2, f"2. banco: geral = 4, sem próprio no Testa (visto: {b2})")
        dlg.locator("button", has_text="Concluir").click()

        abrir_volume(pg)
        depois = ler_todos(pg)
        tri = depois["triceps"]
        testa = linhas_de(depois, TESTA)
        check(len(testa) == 1 and testa[0]["series"] == 4 and not testa[0]["padrao"], f"2. Volume: Tríceps Testa = 4 séries, sem * (visto: {[l['texto'] for l in testa]})")
        pulley = sorted(linhas_de(depois, PULLEY), key=lambda l: -l["series"])
        check(len(pulley) == 2 and (pulley[0]["series"], pulley[0]["padrao"]) == (4, False) and (pulley[1]["series"], pulley[1]["padrao"]) == (3, True)
              and "1×/sem" in pulley[0]["texto"] and "2×/sem" in pulley[1]["texto"],
              f"2. Tríceps Pulley vira 2 linhas: 4 (Peito+tríceps, 1×) e 3* (Upper Teste, 2×) (visto: {[l['texto'] for l in pulley]})")
        peito = depois["peito"]["linhas"]
        check(len(peito) >= 2 and all(l["series"] == 4 and not l["padrao"] for l in peito), f"2. Peito: {len(peito)} linhas, todas 4 sem *")
        ombro = depois.get("ombro", {"linhas": []})["linhas"]
        check(len(ombro) >= 1 and all(l["series"] == 3 and l["padrao"] for l in ombro), "2. Ombro (só Upper Teste) segue 3* — config não vazou pro outro treino")
        check(tri["total"] == antes["triceps"]["total"] + sum(1 for l in tri["linhas"] if l["series"] == 4 and not l["padrao"]),
              f"2. Tríceps: total subiu exatamente 1 por exercício configurado ({antes['triceps']['total']} → {tri['total']})")
        check(soma_bate(depois), "2. total de cada bloco = soma dos subtotais")
        check(pg.locator("[data-admin-volume-nota-padrao]").count() == 1, "2. nota do padrão continua (Upper Teste sem configuração)")
        pg.screenshot(path=f"{SHOTS}/smoke-volume-2-geral4.png")

        # --- 3. próprio do Tríceps Testa = 5
        abrir_admin(pg)
        dlg = abrir_popup(pg)
        dlg.locator(f"button[aria-label='Mais uma série em {TESTA}']").click()
        pg.wait_for_timeout(300)
        esperar_banco(pg, lambda b: b.get(TESTA_ID) == 5)
        pg.wait_for_function(f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '5'", timeout=15000)
        b3 = linhas_banco()
        check(b3.get(None) == 4 and b3.get(TESTA_ID) == 5, f"3. banco: geral 4 + Testa próprio 5 (visto: {b3})")
        dlg.locator("button", has_text="Concluir").click()

        abrir_volume(pg)
        prop = ler_todos(pg)
        testa = linhas_de(prop, TESTA)
        check(len(testa) == 1 and testa[0]["series"] == 5 and not testa[0]["padrao"], f"3. Volume: Tríceps Testa = 5 (próprio vence o geral) (visto: {[l['texto'] for l in testa]})")
        outros_tri = [l for l in prop["triceps"]["linhas"] if l["nome"] != TESTA and not l["padrao"]]
        check(len(outros_tri) >= 1 and all(l["series"] == 4 for l in outros_tri), f"3. demais exercícios do treino no Tríceps seguem 4 ({len(outros_tri)} linhas)")
        check(prop["triceps"]["total"] == tri["total"] + 1, f"3. total do Tríceps subiu 1 ({tri['total']} → {prop['triceps']['total']})")
        check(soma_bate(prop), "3. total de cada bloco = soma dos subtotais")
        pg.screenshot(path=f"{SHOTS}/smoke-volume-3-proprio5.png")

        # --- 4. limpeza → volta ao padrão
        sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
        abrir_volume(pg)
        fim = ler_todos(pg)
        todas_fim = [l for b in fim.values() for l in b["linhas"]]
        check(all(l["series"] == 3 and l["padrao"] for l in todas_fim), "4. sem configuração de novo, tudo volta a 3*")
        check({k: v["total"] for k, v in fim.items()} == {k: v["total"] for k, v in antes.items()}, "4. totais iguais aos do início")

        # --- 5. Praticado segue funcionando
        pg.locator("button", has_text="Praticado").click()
        pg.wait_for_selector("text=Séries CONCLUÍDAS", timeout=30000)
        pg.wait_for_function("() => !document.body.innerText.includes('Carregando')", timeout=60000)
        check(True, "5. aba Praticado renderiza")
        check(not erros, f"sem erro de página ({len(erros)})")
    finally:
        sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
        check(linhas_banco() == {}, "6. limpeza: config do usuário de teste apagada")
        nav.close()

print(f"\n{ok}/{ok + fail} PASS")
sys.exit(0 if fail == 0 else 1)
