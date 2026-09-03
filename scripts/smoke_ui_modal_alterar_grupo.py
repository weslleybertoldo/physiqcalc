#!/usr/bin/env python3
"""Smoke E2E — modal "Alterar Grupo" (TreinosPage) cabe na tela, rola POR DENTRO, fecha pelo X e pelo Escape.

Bug 03/09/2026 (celular): o modal ficava mais alto que a tela, sem scroll (o Radix trava o scroll da
página), com o X e o rodapé inalcançáveis; e o botão voltar do Android navegava pra rota anterior
(/admin) em vez de fechar o modal.

Pré-requisito: o app no SMOKE_BASE abre JÁ LOGADO como aluno (auto-login DEV no local; no staging/prod
usar SMOKE_INJECT_SESSION=1 com SUPABASE_ANON_KEY + SMOKE_EMAIL/SMOKE_PASSWORD).
Viewport BAIXO (430x600) e, se ainda assim o modal couber (conta com poucos grupos), o smoke encolhe a
altura até o conteúdo exceder — o cenário do bug é reproduzido independente dos dados da conta.

Casos:
  1. abriu logado na tela de treinos (gatilho do modal visível)
  2. gatilho ("🔄 Alterar" / "+ Adicionar treino") abre o modal "Alterar Grupo"
  3. modal cabe na tela: altura <= 90% do viewport e overflow-y = auto
  4. conteúdo excede e ROLA por dentro: scrollHeight > clientHeight; rolando ao fim, "Criar novo grupo" fica visível
  5. X (Close) alcançável depois de rolar ao topo → fecha
  6. reabre → Escape no document (caminho do botão voltar do Android) fecha o modal e NÃO navega
  7. negativo: Escape sem modal aberto não navega nem abre nada
"""
import json
import os
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173").rstrip("/")
SHOTS = os.environ.get("SMOKE_SHOTS", "/tmp")
INJECT = os.environ.get("SMOKE_INJECT_SESSION") == "1"
SUPABASE_URL = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
TRIGGER = re.compile(r"Alterar\s*$|Adicionar (outro )?treino")
ESCAPE_JS = "document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', code: 'Escape', bubbles: true, cancelable: true}))"

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


def sessao_aluno():
    """Login por senha (REST) pra injetar a sessão no build de produção (staging/prod)."""
    anon = os.environ["SUPABASE_ANON_KEY"]
    body = json.dumps({
        "email": os.environ.get("SMOKE_EMAIL", "teste@teste.com"),
        "password": os.environ["SMOKE_PASSWORD"],
    }).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password", data=body,
        headers={"apikey": anon, "Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read().decode())


def medir(dlg):
    return dlg.evaluate(
        "el => ({sh: el.scrollHeight, ch: el.clientHeight, h: el.getBoundingClientRect().height,"
        " top: el.getBoundingClientRect().top, ov: getComputedStyle(el).overflowY, ih: window.innerHeight})"
    )


def dialog_aberto(pg):
    return pg.locator('[role="dialog"][data-state="open"]')


def abrir_modal(pg):
    pg.locator("button", has_text=TRIGGER).first.click()
    dlg = dialog_aberto(pg)
    dlg.wait_for(state="visible", timeout=15000)
    dlg.get_by_text("Alterar Grupo").wait_for(timeout=10000)
    return dlg


with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--disable-dev-shm-usage"])
    ctx = nav.new_context(viewport={"width": 430, "height": 600}, locale="pt-BR", timezone_id="America/Sao_Paulo")
    # overlay de mensalidade pendente (conta de teste) intercepta cliques — marca como já avisado hoje
    ctx.add_init_script(
        "try { localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR')); } catch (e) {}"
    )
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.dismiss())

    if INJECT:
        sess = sessao_aluno()
        ref = SUPABASE_URL.split("//")[1].split(".")[0]
        pg.goto(BASE + "/", wait_until="domcontentloaded")
        pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{ref}-auth-token", json.dumps(sess)])

    pg.goto(BASE + "/", wait_until="domcontentloaded")
    gatilho = pg.locator("button", has_text=TRIGGER).first
    gatilho.wait_for(state="visible", timeout=120000)
    corpo = pg.inner_text("body").upper()
    check("ENTRAR COM" not in corpo, "1. abriu logado na tela de treinos (gatilho do modal visível)")
    rota_inicial = pg.evaluate("location.pathname")

    # 2. abre o modal
    dlg = abrir_modal(pg)
    check(dlg.count() == 1, "2. gatilho abriu o modal 'Alterar Grupo'")
    pg.screenshot(path=f"{SHOTS}/smoke_modal_1_aberto.png")

    # 3. cabe na tela + rola por dentro. Se a conta de teste tem poucos grupos e o modal coube,
    # encolhe o viewport até o conteudo exceder (forca o cenario do bug independente dos dados).
    m = medir(dlg)
    if m["sh"] <= m["ch"] + 20:
        alvo = max(320, int(m["h"] * 0.75))
        print(f"     modal coube ({m['h']:.0f}px em {m['ih']}px) -> encolhendo viewport para {alvo}px pra forcar o transbordo")
        pg.set_viewport_size({"width": 430, "height": alvo})
        pg.wait_for_timeout(400)
        m = medir(dlg)
    print(f"     medidas: viewport={m['ih']}px modal={m['h']:.0f}px top={m['top']:.0f} scrollH={m['sh']} clientH={m['ch']} overflowY={m['ov']}")
    check(m["h"] <= m["ih"] * 0.9 + 2 and m["top"] >= 0, "3a. modal cabe na tela (altura <= 90% do viewport, topo visível)")
    check(m["ov"] == "auto", "3b. overflow-y do modal = auto")
    check(m["sh"] > m["ch"] + 20, "4a. conteúdo excede a altura do modal (cenário do bug reproduzido)")
    dlg.evaluate("el => { el.scrollTop = el.scrollHeight; }")
    pg.wait_for_timeout(300)
    criar = dlg.get_by_text("Criar novo grupo")
    box = criar.bounding_box()
    visivel_no_fim = box is not None and box["y"] >= 0 and box["y"] + box["height"] <= m["ih"] + 1
    check(visivel_no_fim, f"4b. rolando ao fim, 'Criar novo grupo' fica visível na tela (y={box['y'] if box else None})")
    pg.screenshot(path=f"{SHOTS}/smoke_modal_2_rolado.png")

    # 5. X alcançável e fecha
    dlg.evaluate("el => { el.scrollTop = 0; }")
    pg.wait_for_timeout(200)
    fechar = dlg.locator("button:has-text('Close')")
    bx = fechar.bounding_box()
    check(bx is not None and bx["y"] >= 0 and bx["y"] <= m["ih"], "5a. botão X do modal está dentro da tela")
    fechar.click()
    pg.wait_for_timeout(500)
    check(dialog_aberto(pg).count() == 0, "5b. X fechou o modal")

    # 6. reabre e fecha pelo Escape (mesmo caminho do botão voltar do Android)
    dlg = abrir_modal(pg)
    pg.evaluate(ESCAPE_JS)
    pg.wait_for_timeout(500)
    check(dialog_aberto(pg).count() == 0, "6a. Escape no document fechou o modal")
    check(pg.evaluate("location.pathname") == rota_inicial, f"6b. não navegou (continua em {rota_inicial})")

    # 7. negativo: Escape sem modal não faz nada
    pg.evaluate(ESCAPE_JS)
    pg.wait_for_timeout(300)
    check(dialog_aberto(pg).count() == 0 and pg.evaluate("location.pathname") == rota_inicial,
          "7. negativo: Escape sem modal aberto não navega nem abre nada")
    pg.screenshot(path=f"{SHOTS}/smoke_modal_3_fechado.png")

    nav.close()

print(f"\nRESULTADO: {ok}/{ok + fail} PASS")
sys.exit(0 if fail == 0 else 1)
