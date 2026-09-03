#!/usr/bin/env python3
"""Smoke E2E — nº de séries por treino/exercício (admin configura → app mostra).

Conta: admin.teste.claude (admin + aluno com "Peito + tríceps" hoje via override em STAGING).
Roteiro:
  1. admin › usuário › Treino › Treino Diário: badge "Séries" ao lado do treino abre o popup com os exercícios
  2. "Aplicar a todos" 4 → banco: 1 linha geral = 4, nenhuma por exercício; popup mostra 4 em todos
  3. "+" no Tríceps Testa → 5 (linha própria); marca "próprio"
  4. app /treinos: Tríceps Testa abre com S1..S5, os demais com S1..S4 (sync PowerSync)
  5. "Aplicar a todos" 3 → apaga o próprio; app volta a S1..S3 em todos
  6. limites: geral desce até 1 → "−" desabilitado
  7. limpeza: apaga as linhas de tb_series_padrao_usuario do usuário de teste

Env: SMOKE_BASE (default http://localhost:5173), SMOKE_SCHEMA (default staging), SUPABASE_PAT ou ~/.pc-pat,
SMOKE_INJECT_SESSION=1 + SUPABASE_ANON_KEY + SMOKE_PASSWORD (build sem auto-login).
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
GRUPO_ID = "1427b068-58ab-417c-a13f-65e3489b76f2"  # Peito + tríceps
TESTA_ID = "c7016a9d-1af3-4238-929f-adae75005ce6"  # Tríceps Testa
KEY = f"catalogo:{GRUPO_ID}"
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
    """{exercicio_id|None: num_series} do treino de teste"""
    rows = sql(f"SELECT exercicio_id, num_series FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}' AND grupo_id='{GRUPO_ID}'")
    return {r["exercicio_id"]: r["num_series"] for r in rows}


def sessao_admin():
    anon = os.environ["SUPABASE_ANON_KEY"]
    body = json.dumps({"email": "admin.teste.claude@physiqcalc.app", "password": os.environ["SMOKE_PASSWORD"]}).encode()
    req = urllib.request.Request(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=body,
                                 headers={"apikey": anon, "Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def series_por_card(pg):
    """{exercicio_id: [S1, S2, ...]} no treino do dia"""
    return pg.evaluate(
        """() => Object.fromEntries([...document.querySelectorAll('div[data-exercicio-id]')].map(card => [
             card.getAttribute('data-exercicio-id'),
             [...card.querySelectorAll('span')].map(s => s.textContent.trim()).filter(t => /^(✅ )?S\\d+$/.test(t)),
           ]))"""
    )


def esperar_series(pg, alvo_por_ex):
    """espera até cada card ter exatamente N séries (alvo_por_ex: {id: N} ou {'*': N})"""
    pg.wait_for_function(
        """alvo => { const cards=[...document.querySelectorAll('div[data-exercicio-id]')]; if (!cards.length) return false;
             return cards.every(c => { const n=[...c.querySelectorAll('span')].filter(s=>/^(✅ )?S\\d+$/.test(s.textContent.trim())).length;
               const id=c.getAttribute('data-exercicio-id'); return n === (alvo[id] ?? alvo['*']); }); }""",
        arg=alvo_por_ex, timeout=90000)


def abrir_admin(pg):
    pg.goto(f"{BASE}/admin?v=config&u={USER_ID}&ct=treino&wt=semana", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Marque os treinos que aparecem em cada dia", timeout=120000)
    # Terça: "Peito + tríceps" está MARCADO nesse dia — o badge "Séries" só aparece em treino marcado
    pg.locator("button", has_text="Terça").first.click()
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
        # --- 1. badge "Séries" + popup lista os exercícios
        abrir_admin(pg)
        badge = pg.locator(f"[data-admin-series-treino='{KEY}']").first
        check(badge.inner_text().strip().upper() == "SÉRIES", f"1. badge do treino é 'Séries' (visto: {badge.inner_text().strip()!r})")
        # na lista aberta, treino DESMARCADO não tem badge (Costa + bíceps não está na Terça)
        linha_costa = pg.locator("label", has_text="Costa + bíceps").first.locator("xpath=..")
        check(linha_costa.locator("[data-admin-series-treino]").count() == 0, "1. treino desmarcado no dia não mostra o badge")
        n_marcados = pg.locator("input[type=checkbox]:checked").count()
        check(n_marcados >= 1, f"1. dia aberto tem {n_marcados} treino(s) marcado(s) com badge")
        dlg = abrir_popup(pg)
        n_ex = dlg.locator("[data-admin-series-exercicio]").count()
        texto = dlg.inner_text().upper()
        check(n_ex >= 5 and "PEITO + TRÍCEPS" in texto, f"1. popup lista {n_ex} exercícios do treino")
        check("TRÍCEPS TESTA" in texto and "TODOS OS EXERCÍCIOS" in texto, "1. popup tem o Tríceps Testa e o bloco 'Todos os exercícios'")
        check(valor_exercicio(dlg, TESTA_ID) == 3 and int(dlg.locator("[data-admin-series-geral-valor]").inner_text()) == 3, "1. tudo em 3 (padrão) sem configuração")
        pg.screenshot(path=f"{SHOTS}/smoke-series-1-popup.png")

        # --- 2. aplicar a todos = 4
        aplicar_todos(pg, dlg, 4)
        pg.wait_for_function(f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '4'", timeout=15000)
        check(linhas_banco() == {None: 4}, f"2. banco: só a linha geral = 4 (visto: {linhas_banco()})")
        valores = dlg.locator("[data-admin-series-exercicio-valor]").all_inner_texts()
        check(all(v.strip() == "4" for v in valores), "2. popup mostra 4 em todos os exercícios")
        pg.screenshot(path=f"{SHOTS}/smoke-series-2-todos4.png")

        # --- 3. próprio do Tríceps Testa = 5
        dlg.locator("button[aria-label='Mais uma série em Tríceps Testa']").click()
        pg.wait_for_timeout(300)
        esperar_banco(pg, lambda b: b.get(TESTA_ID) == 5)
        pg.wait_for_function(f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '5'", timeout=15000)
        check(linhas_banco() == {None: 4, TESTA_ID: 5}, f"3. banco: geral 4 + Tríceps Testa 5 (visto: {linhas_banco()})")
        check("PRÓPRIO" in dlg.locator(f"[data-admin-series-exercicio='ex:{TESTA_ID}']").inner_text().upper(), "3. Tríceps Testa marcado como 'próprio'")
        pg.screenshot(path=f"{SHOTS}/smoke-series-3-proprio.png")
        dlg.locator("button", has_text="Concluir").click()

        # --- 4. app: Testa S1..S5, demais S1..S4
        pg.goto(f"{BASE}/treinos", wait_until="domcontentloaded")
        pg.wait_for_selector("div[data-exercicio-id]", timeout=120000)
        esperar_series(pg, {"*": 4, TESTA_ID: 5})
        cards = series_por_card(pg)
        check(cards.get(TESTA_ID) == ["S1", "S2", "S3", "S4", "S5"], f"4. app: Tríceps Testa com S1..S5 (visto: {cards.get(TESTA_ID)})")
        outros = {k: v for k, v in cards.items() if k != TESTA_ID}
        check(len(outros) >= 4 and all(v == ["S1", "S2", "S3", "S4"] for v in outros.values()), f"4. app: os outros {len(outros)} exercícios com S1..S4")
        pg.screenshot(path=f"{SHOTS}/smoke-series-4-app.png")

        # --- 4b. ESPELHO aluno → admin, ao vivo: admin fica com o popup aberto em outra aba; o aluno
        #         clica "Adicionar série" no Tríceps Testa → S6 no app → banco Testa = 6 → popup do admin
        #         mostra 6 sem recarregar (Realtime)
        adm = ctx.new_page()
        abrir_admin(adm)
        dlg_adm = abrir_popup(adm)
        check(valor_exercicio(dlg_adm, TESTA_ID) == 5, "4b. admin (aba 2) vê Testa = 5 antes do aluno mexer")
        pg.bring_to_front()
        card = pg.locator(f"div[data-exercicio-id='{TESTA_ID}']")
        card.locator("button", has_text="Adicionar série").click()
        esperar_series(pg, {"*": 4, TESTA_ID: 6})
        check(True, "4b. app: Tríceps Testa ganhou S6 ao adicionar")
        adm.wait_for_function(
            f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '6'",
            timeout=20000)
        check(True, "4b. admin: popup atualizou pra 6 AO VIVO (sem recarregar)")
        check(linhas_banco().get(TESTA_ID) == 6, f"4b. banco: Testa = 6 gravado pelo aluno (visto: {linhas_banco()})")

        # --- 4c. ESPELHO admin → aluno, ao vivo, num dia COM série salva: admin sobe Testa pra 8 →
        #         app (ainda aberto) mostra S7 e S8 vazias sem recarregar; a S6 salva continua
        for _ in range(2):
            dlg_adm.locator(f"button[aria-label='Mais uma série em Tríceps Testa']").click()
            adm.wait_for_timeout(300)
            alvo_adm = valor_exercicio(dlg_adm, TESTA_ID)  # valor otimista na tela do admin
            esperar_banco(adm, lambda b, a=alvo_adm: b.get(TESTA_ID) == a)
        check(valor_exercicio(dlg_adm, TESTA_ID) == 8, "4c. admin: Testa = 8")
        esperar_series(pg, {"*": 4, TESTA_ID: 8})
        check(True, "4c. app: Testa mostra S1..S8 ao vivo (dia com séries salvas completou até o alvo)")
        # aluno remove a S8 (vazia) → total 7 → admin vê 7
        card.locator("button[aria-label='Remover série']").last.click()
        adm.wait_for_function(
            f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '7'",
            timeout=20000)
        check(linhas_banco().get(TESTA_ID) == 7, "4c. aluno removeu 1 → admin vê 7 ao vivo e banco = 7")
        dlg_adm.locator("button", has_text="Concluir").click()
        adm.close()

        # --- 5. aplicar a todos = 3 → apaga o próprio
        abrir_admin(pg)
        dlg = abrir_popup(pg)
        check(valor_exercicio(dlg, TESTA_ID) == 7, "5. popup reabre com Testa = 7 (persistido)")
        aplicar_todos(pg, dlg, 3)
        pg.wait_for_function(f"() => document.querySelector(\"[data-admin-series-exercicio='ex:{TESTA_ID}'] [data-admin-series-exercicio-valor]\")?.textContent.trim() === '3'", timeout=15000)
        check(linhas_banco() == {None: 3}, f"5. banco: aplicar zerou o próprio, geral = 3 (visto: {linhas_banco()})")

        # --- 6. limite do geral
        for _ in range(2):
            dlg.locator("button[aria-label='Menos uma série (todos)']").click()
        pg.wait_for_function("() => document.querySelector('[data-admin-series-geral-valor]')?.textContent.trim() === '1'", timeout=10000)
        check(dlg.locator("button[aria-label='Menos uma série (todos)']").is_disabled(), "6. geral em 1 → '−' desabilitado (sem gravar: é rascunho)")
        check(linhas_banco() == {None: 3}, "6. rascunho do geral não grava sozinho")
        dlg.locator("button", has_text="Concluir").click()

        # o aluno SALVOU só a S6 no Testa (4b; a S8 removida em 4c era vazia) → "aplicar 3" corta as vazias até 3,
        # mas a S6 salva NÃO some: Testa = S1, S2 (vazias) + S6 (salva); os demais voltam a S1..S3
        pg.goto(f"{BASE}/treinos", wait_until="domcontentloaded")
        pg.wait_for_selector("div[data-exercicio-id]", timeout=120000)
        esperar_series(pg, {"*": 3})
        cards = series_por_card(pg)
        check(all(v == ["S1", "S2", "S3"] for k, v in cards.items() if k != TESTA_ID), "5. app voltou a S1..S3 nos exercícios sem série salva")
        check(len(cards.get(TESTA_ID, [])) == 3 and "S6" in cards.get(TESTA_ID, []),
              f"5. Testa com 3 séries e a S6 SALVA preservada (redução do admin não apaga série salva) (visto: {cards.get(TESTA_ID)})")
        check(not erros, f"sem erro de página ({len(erros)})")
    finally:
        sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
        # a série adicionada pelo "aluno" em 4b ficou salva em tb_treino_series (hoje) → apaga
        sql(f"DELETE FROM {SCHEMA}.tb_treino_series WHERE user_id='{USER_ID}' AND data_treino=current_date")
        check(linhas_banco() == {}, "7. limpeza: config e séries de hoje do usuário de teste apagadas")
        nav.close()

print(f"\n{ok}/{ok + fail} PASS")
sys.exit(0 if fail == 0 else 1)
