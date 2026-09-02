#!/usr/bin/env python3
"""Smoke E2E — admin › Grupos › lápis abre o popup de exercícios por grupo muscular.

Cria um treino descartável (sem perfil = invisível pros alunos), exercita o popup e apaga o treino.
Pré-requisito: o app no SMOKE_BASE abre JÁ LOGADO como admin (auto-login DEV no local;
no staging/prod usar SMOKE_INJECT_SESSION=1 com SUPABASE_ANON_KEY + SMOKE_ADMIN_EMAIL/SMOKE_PASSWORD).

Casos:
  1. card do treino novo mostra "Nenhum exercício"
  2. lápis abre o popup com a lista de GRUPOS MUSCULARES (não a lista plana)
  3. abrir "Peito" lista só exercícios de peito, com contagem "0 de N no treino"
  4. marcar um exercício → chip "No treino (1)" no popup e chip no card (persistiu após reload)
  5. negativo: 2 cliques no mesmo tick no checkbox → exercício entra 1x (sem duplicar) e sem toast de erro
  6. desmarcar → sai do popup e do card
  7. limpeza: excluir o treino descartável
"""
import json
import os
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173").rstrip("/")
NOME = f"SMOKE grupo-musculo {int(time.time())}"
SHOTS = os.environ.get("SMOKE_SHOTS", "/tmp")
INJECT = os.environ.get("SMOKE_INJECT_SESSION") == "1"
SUPABASE_URL = "https://uxwpwdbbnlticxgtzcsb.supabase.co"

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


def sessao_admin():
    """Login por senha (REST) pra injetar a sessão no build de produção (staging/prod)."""
    anon = os.environ["SUPABASE_ANON_KEY"]
    body = json.dumps({
        "email": os.environ.get("SMOKE_ADMIN_EMAIL", "admin.teste.claude@physiqcalc.app"),
        "password": os.environ["SMOKE_PASSWORD"],
    }).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=body,
        headers={"apikey": anon, "Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-dev-shm-usage"])
    ctx = nav.new_context(viewport={"width": 430, "height": 900}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.accept())

    if INJECT:
        sess = sessao_admin()
        ref = SUPABASE_URL.split("//")[1].split(".")[0]
        pg.goto(BASE + "/", wait_until="domcontentloaded")
        pg.evaluate(
            "([k, v]) => localStorage.setItem(k, v)",
            [f"sb-{ref}-auth-token", json.dumps(sess)],
        )

    pg.goto(f"{BASE}/admin?v=treinos&t=grupos", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Gerenciar Treinos", timeout=90000)
    corpo = pg.inner_text("body").upper()
    check("ENTRAR COM" not in corpo, "abriu logado na tela Gerenciar Treinos")
    pg.wait_for_selector("text=Criar grupo", timeout=60000)

    try:
        # --- cria treino descartável
        pg.click("text=Criar grupo")
        pg.fill("input[placeholder='Nome do novo grupo...']", NOME)
        pg.click("button:has-text('Criar'):not(:has-text('grupo')):not(:has-text('pasta'))")
        card = pg.locator("[data-admin-treino]", has_text=NOME)
        card.wait_for(timeout=30000)
        grupo_id = card.get_attribute("data-admin-treino")
        chips = pg.locator(f"[data-admin-chips='{grupo_id}']")
        check("Nenhum exercício" in chips.inner_text(), "1. card novo mostra 'Nenhum exercício'")

        # --- lápis abre popup com grupos musculares
        pg.click(f"[data-admin-editar-treino='{grupo_id}']")
        dlg = pg.locator("[role=dialog]")
        dlg.wait_for(timeout=15000)
        dlg.locator("text=Grupos musculares").wait_for(timeout=15000)
        # inner_text vem com o text-transform do CSS (títulos em MAIÚSCULAS) → comparar em upper()
        texto = dlg.inner_text().upper()
        check("EXERCÍCIOS DO TREINO" in texto and NOME.upper() in texto, "2. popup abriu com título e nome do treino")
        check("GRUPOS MUSCULARES" in texto and "PEITO" in texto and "COSTAS" in texto, "2. popup lista os grupos musculares")
        check(dlg.locator("input[type=checkbox]").count() == 0, "2. sem lista plana de checkboxes na abertura")
        pg.screenshot(path=f"{SHOTS}/smoke-admin-grupo-1-grid.png", full_page=False)

        # --- abre Peito
        dlg.locator("button", has_text="Peito").first.click()
        dlg.locator("input[type=checkbox]").first.wait_for(timeout=15000)
        n_peito = dlg.locator("label[data-admin-ex-opcao]").count()
        texto = dlg.inner_text().upper()
        check(n_peito > 0 and f"0 DE {n_peito} NO TREINO" in texto, f"3. Peito aberto com {n_peito} exercícios e '0 de {n_peito} no treino'")
        check("LEG PRESS" not in texto and "ROSCA" not in texto, "3. Peito não lista exercícios de outros grupos")
        pg.screenshot(path=f"{SHOTS}/smoke-admin-grupo-2-peito.png", full_page=False)

        # --- marca 1 exercício
        supino = dlg.locator("label[data-admin-ex-opcao]", has_text="Supino Reto com Barra")
        supino.locator("input").check()
        pg.wait_for_selector("text=Adicionado ao treino.", timeout=15000)
        dlg.locator("text=No treino (1)").wait_for(timeout=15000)
        check(supino.locator("input").is_checked(), "4. checkbox marcado")
        check("1 DE" in dlg.inner_text().upper(), "4. contador do grupo virou '1 de N no treino'")
        pg.screenshot(path=f"{SHOTS}/smoke-admin-grupo-3-marcado.png", full_page=False)

        # --- negativo: 2 cliques no mesmo tick → entra 1x, sem toast de erro
        cruc = dlg.locator("label[data-admin-ex-opcao]", has_text="Crucifixo na Máquina")
        cruc.locator("input").evaluate("el => { el.click(); el.click(); }")
        pg.wait_for_timeout(2500)
        texto = dlg.inner_text().upper()
        check("NO TREINO (2)" in texto, "5. clique duplo no mesmo tick adicionou 1x (No treino (2))")
        check(texto.count("CRUCIFIXO NA MÁQUINA") == 2, "5. 'Crucifixo na Máquina' aparece 1 chip + 1 opção (sem duplicar)")
        check("ERRO AO ATUALIZAR" not in pg.inner_text("body").upper(), "5. sem toast de erro no clique duplo")

        # --- persistiu: fecha, recarrega, chips no card
        dlg.locator("button", has_text="Concluir").click()
        pg.reload(wait_until="domcontentloaded")
        pg.wait_for_selector(f"[data-admin-chips='{grupo_id}']", timeout=60000)
        chips = pg.locator(f"[data-admin-chips='{grupo_id}']")
        pg.wait_for_function(
            "id => (document.querySelector(`[data-admin-chips='${id}']`)?.textContent || '').includes('Supino Reto com Barra')",
            arg=grupo_id, timeout=30000,
        )
        t = chips.inner_text()
        check("Supino Reto com Barra" in t and "Crucifixo na Máquina" in t, "4/5. após reload, card mostra os 2 exercícios")
        check(t.count("Crucifixo na Máquina") == 1, "5. banco tem o Crucifixo 1x (UNIQUE + toggle idempotente)")

        # --- desmarca
        pg.click(f"[data-admin-editar-treino='{grupo_id}']")
        dlg = pg.locator("[role=dialog]")
        dlg.locator("text=No treino (2)").wait_for(timeout=15000)
        dlg.locator("button", has_text="Peito").first.click()
        supino = dlg.locator("label[data-admin-ex-opcao]", has_text="Supino Reto com Barra")
        supino.locator("input").uncheck()
        pg.wait_for_selector("text=Removido do treino.", timeout=15000)
        dlg.locator("text=No treino (1)").wait_for(timeout=15000)
        check(not supino.locator("input").is_checked(), "6. desmarcou o Supino")
        dlg.locator("button", has_text="Concluir").click()
        pg.wait_for_function(
            "id => !(document.querySelector(`[data-admin-chips='${id}']`)?.textContent || '').includes('Supino Reto com Barra')",
            arg=grupo_id, timeout=30000,
        )
        check("Supino Reto com Barra" not in chips.inner_text(), "6. chip saiu do card")
    finally:
        # --- limpeza: excluir o treino descartável (lixeira do card)
        try:
            card = pg.locator("[data-admin-treino]", has_text=NOME)
            if card.count():
                card.locator("[data-admin-excluir-treino]").first.click()
                pg.wait_for_selector("text=Grupo excluído.", timeout=15000)
                pg.wait_for_function(
                    "nome => ![...document.querySelectorAll('[data-admin-treino]')].some(e => e.textContent.includes(nome))",
                    arg=NOME, timeout=30000,
                )
            check(pg.locator("[data-admin-treino]", has_text=NOME).count() == 0, "7. treino descartável excluído")
        except Exception as e:  # noqa: BLE001
            print("  WARN limpeza via UI falhou:", e, "→ apagar via SQL: DELETE FROM tb_grupos_treino WHERE nome LIKE 'SMOKE grupo-musculo%'")
            fail += 1
        nav.close()

print(f"\n{ok}/{ok + fail} PASS")
sys.exit(0 if fail == 0 else 1)
