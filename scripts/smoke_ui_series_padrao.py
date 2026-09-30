#!/usr/bin/env python3
"""Smoke E2E — nº de séries por treino/exercício: o profissional configura (popup "Séries") e o app do aluno (aba Treino nova,
W8) monta as séries com esse número.

Parte 1 — profissional (admin.teste.claude, tela antiga "Configurar aluno › Treino Diário" dentro do painel novo; STAGING):
  1. badge "Séries" ao lado do treino abre o popup com os exercícios (tudo em 3 sem configuração)
  2. "Aplicar a todos" 4 → banco: 1 linha geral = 4
  3. "+" no Tríceps Testa → 5 (linha própria, selo "próprio")
  5. "Aplicar a todos" 3 → apaga o próprio · 6. geral desce até 1 → "−" desabilitado (rascunho não grava)
Parte 2 — app do aluno (teste@teste.com), a MESMA regra do nº configurado (linha do exercício > geral > padrão 3):
  4. sem internet, "Adicionar série" no Tríceps Testa → S1..S4 hoje; no dia seguinte, com o mesmo treino, o Testa abre com 4
     e os outros com 3 (o app espelhou o total no nº configurado — o que o profissional vê)
  4b. a internet volta → staging.tb_series_padrao_usuario do aluno com Testa = 4 (o espelho subiu pelo PowerSync)
Adaptação da W8: P20 — o PowerSync do local/staging lê o public e o que o profissional grava no staging não chega ao app; e o
Realtime do Banco do Treino está suspenso desde 03/09 (os passos "ao vivo" de antes — popup do profissional mudando sozinho —
não têm como rodar). A regra do app é a mesma e está coberta no Vitest (src/app-aluno/abas/Treino.test.tsx, nº por exercício).

Uso: SMOKE_BASE=http://localhost:5173 python3 scripts/smoke_ui_series_padrao.py   (SMOKE_SCHEMA=staging)
"""
import datetime as dt
import importlib.util
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w08", Path(__file__).resolve().parent.parent / "e2e" / "w08" / "_base.py")
B8 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w08"] = B8
_ESPEC.loader.exec_module(B8)  # type: ignore[union-attr]

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173").rstrip("/")
SCHEMA = os.environ.get("SMOKE_SCHEMA", "staging")
SHOTS = os.environ.get("SMOKE_SHOTS", "/tmp")
REF = "uxwpwdbbnlticxgtzcsb"
SUPABASE_URL = f"https://{REF}.supabase.co"
USER_ID = "e4c5fb14-fe3b-4a51-a49f-ceed61485054"  # admin.teste.claude
GRUPO_ID = "1427b068-58ab-417c-a13f-65e3489b76f2"  # Peito + tríceps
TESTA_ID = "c7016a9d-1af3-4238-929f-adae75005ce6"  # Tríceps Testa
KEY = f"catalogo:{GRUPO_ID}"
PAT = os.environ.get("SUPABASE_PAT") or open(os.path.expanduser("~/.pc-pat")).read().strip()
assert SCHEMA == "staging", "este smoke grava: só no staging"

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


def parte_app(nav) -> None:
    """Parte 2 — a aba Treino nova (aluno teste@teste.com, sem internet depois do 1º sync)."""
    B8.ESTADO["schema"] = SCHEMA
    desde = B8.agora_iso()
    hoje, amanha = B8.hoje(), B8.hoje() + dt.timedelta(days=1)
    c = B8.abrir_treino(nav, BASE, os.environ.get("SMOKE_PREFIXO", "local"), "series_padrao_app")
    try:
        B8.sem_internet(c)
        B8.ir_para_dia(c, amanha)
        B8.escolher_treino_do_dia(c)
        B8.ir_para_dia(c, hoje)
        B8.escolher_treino_do_dia(c)
        B8.abrir_exercicio(c, TESTA_ID)
        n0 = B8.linha(c, TESTA_ID).locator("[data-serie]").count()
        check(n0 == 3, f"4. app: Tríceps Testa abre com 3 séries (padrão, sem configuração) — viu {n0}")
        B8.linha(c, TESTA_ID).locator("[data-adicionar-serie]").click()
        c.pg.wait_for_timeout(700)
        check(B8.linha(c, TESTA_ID).locator("[data-serie]").count() == 4, "4. app: 'Adicionar série' → S1..S4 hoje")
        B8.ir_para_dia(c, amanha)
        c.esperar(lambda: B8.linha(c, TESTA_ID).count() == 1, 10)
        B8.abrir_exercicio(c, TESTA_ID)
        n_testa = B8.linha(c, TESTA_ID).locator("[data-serie]").count()
        outro = next(e for e in B8.exercicios(c) if e != TESTA_ID)
        B8.abrir_exercicio(c, outro)
        n_outro = B8.linha(c, outro).locator("[data-serie]").count()
        check(n_testa == 4 and n_outro == 3, f"4. amanhã o Testa abre com 4 (o nº espelhado) e os outros com 3 (Testa {n_testa} · outro {n_outro})")
        c.print("series_padrao_app")
        B8.sem_internet(c, False)
        check(B8.esperar_fila_vazia(c, 120), "4b. a internet voltou e a fila do PowerSync esvaziou")
        ok_ = B8.esperar_staging(lambda: len(B8.sql_treino(
            f"select 1 from staging.tb_series_padrao_usuario where user_id='{B8.USER_TESTE}' and grupo_id='{GRUPO_ID}' and exercicio_id='{TESTA_ID}' and num_series = 4 and updated_at >= '{desde}'")) == 1, 60)
        check(ok_, "4b. staging: Tríceps Testa = 4 no nº configurado do aluno (o que o profissional vê no popup)")
    finally:
        c.fim()
        time.sleep(2)
        B8.limpar_staging(desde, "séries padrão (app)")


# estado limpo antes de começar
sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")

B8.ESTADO["schema"] = SCHEMA
if not B8.saude_treino():
    print("Banco do Treino fora do normal — parando sem testar.")
    sys.exit(2)

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    c = B8.abrir_painel(nav, BASE, os.environ.get("SMOKE_PREFIXO", "local"), "series_padrao", "/painel")
    ctx, pg = c.ctx, c.pg
    erros = c.erros

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
        pg.wait_for_timeout(500)

        # --- 5. aplicar a todos = 3 → apaga o próprio
        abrir_admin(pg)
        dlg = abrir_popup(pg)
        check(valor_exercicio(dlg, TESTA_ID) == 5, "5. popup reabre com Testa = 5 (persistido)")
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

        check(not erros, f"sem erro de página ({len(erros)})")
    finally:
        sql(f"DELETE FROM {SCHEMA}.tb_series_padrao_usuario WHERE user_id='{USER_ID}'")
        check(linhas_banco() == {}, "7. limpeza: config do profissional de teste apagada")
        ctx.close()
    parte_app(nav)
    nav.close()

# as checagens da base da W8 (entrar, sem erro de página) também contam
extras = [t for ok_, t in B8.p.itens if not ok_]
fail += len(extras)
ok += sum(1 for ok_, _ in B8.p.itens if ok_)
print(f"\n{ok}/{ok + fail} PASS" + (f" — FALHAS da base: {extras}" if extras else ""))
sys.exit(0 if fail == 0 else 1)
