#!/usr/bin/env python3
"""Smoke de UI: remover exercício (X ao lado de Histórico) + OK inicia o treino.

Roda em contexto limpo (sem storage) contra o dev server local (auto-login DEV com
teste@teste.com). Prova:
  1. link abre JÁ LOGADO na aba Treinos
  2. X em cada exercício → popup "Remover neste dia (DIA)" / "Remover definitivo (Vale para os próximos treinos)"
  3. escolher → "Confirma?" (Voltar volta às opções) → confirmar remove
  4. remoção do dia: some hoje, continua nos outros dias; linha "removido hoje" + Restaurar
  5. servidor recebeu a linha SEM exercício novo (CHECK relaxado) — precisa SUPABASE_PAT
  6. remoção definitiva: some em todos os dias; Restaurar volta
  7. OK numa série inicia o treino; OK de novo NÃO reinicia (startedAt igual)
  8. X em exercício com série concluída é bloqueado (toast)
Ao final limpa séries/substituições da conta de teste no servidor.
Comparações case-insensitive (uppercase via CSS). PowerSync mantém stream aberto →
nunca usar networkidle.
"""
import json
import os
import re
import sys
import time
import urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:8080")
PAT = os.environ.get("SUPABASE_PAT")
REF = "uxwpwdbbnlticxgtzcsb"
SUPA = f"https://{REF}.supabase.co"
# Schema onde o alvo grava: local aponta pra public; physiqcalc-staging usa staging.
SCHEMA = os.environ.get("SMOKE_SCHEMA", "public")
# Build de produção (staging/prod) não tem o auto-login DEV: injeta sessão real no localStorage.
INJETAR_SESSAO = os.environ.get("SMOKE_INJECT_SESSION") == "1"
ANON = os.environ.get("SUPABASE_ANON_KEY")
SENHA = os.environ.get("SMOKE_PASSWORD")
USER_TESTE = "c62c7533-14ff-4e01-9ffa-06b3cdff1cc5"
EMAIL_TESTE = "teste@teste.com"
falhas, passes, erros_console = [], [], []


def sessao_via_api():
    req = urllib.request.Request(
        f"{SUPA}/auth/v1/token?grant_type=password",
        method="POST",
        data=json.dumps({"email": EMAIL_TESTE, "password": SENHA}).encode(),
        headers={"Content-Type": "application/json", "apikey": ANON},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        sessao = json.loads(r.read().decode())
    if "access_token" not in sessao:
        print(f"ERRO no login: {sessao}")
        sys.exit(1)
    return sessao


def checa(nome, cond, detalhe=""):
    (passes if cond else falhas).append(nome)
    print(("  PASS  " if cond else "  FALHA ") + nome + (f" ({detalhe})" if detalhe else ""))


def tem(texto, alvo):
    return alvo.upper() in (texto or "").upper()


def sql(query):
    if not PAT:
        return None
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.0"},
    )
    return json.loads(urllib.request.urlopen(req).read().decode())


def espera_carregar(pg, timeout_ms=60000):
    limite = time.time() + timeout_ms / 1000
    while time.time() < limite:
        try:
            texto = pg.locator("body").inner_text()
        except Exception:
            texto = "Carregando"
        if "Carregando" not in texto:
            return True
        pg.wait_for_timeout(400)
    return False


GRUPO_ALVO = os.environ.get("SMOKE_GRUPO", "Peito + tríceps")


def garantir_expandido(pg):
    """Abre o slot do GRUPO_ALVO (grupo do catálogo). O dia pode ter mais de um treino
    (ex.: grupo pessoal no slot 0) e só um slot fica expandido por vez — o smoke precisa
    do grupo do treinador pra provar 'definitivo = vale pros próximos treinos' + restaurar."""
    aberto = pg.locator(f"h2:has-text('TREINO DO DIA'):has-text('{GRUPO_ALVO}')")
    if aberto.count() == 0:
        # slot fechado (o h2 só existe com o slot expandido) → clica no cabeçalho.
        # NÃO clicar quando já está aberto: os exercícios podem só não ter sincronizado ainda
        # (1º sync do PowerSync em contexto limpo) e o clique fecharia o slot.
        cab = pg.locator(f"button:has-text('TREINO DO DIA'):has-text('{GRUPO_ALVO}')").first
        if cab.count():
            cab.click()
            pg.wait_for_timeout(800)
        else:
            print(f"  AVISO  slot '{GRUPO_ALVO}' não encontrado neste dia")
            return
    try:
        pg.wait_for_selector("[data-remover-exercicio]", timeout=90000)
    except Exception:
        pg.screenshot(path="/tmp/smoke-remover-falha.png", full_page=True)
        print("  AVISO  exercícios não apareceram (screenshot /tmp/smoke-remover-falha.png)")


def ir_para_dia(pg, ddmm):
    pg.locator("div.grid-cols-7 button", has_text=ddmm).first.click()
    pg.wait_for_timeout(800)
    espera_carregar(pg)
    garantir_expandido(pg)
    pg.wait_for_timeout(400)


def fechar_timer_descanso(pg):
    """O timer de descanso abre como overlay depois do OK — fecha pra não interceptar cliques."""
    barra = pg.locator("div.fixed.bottom-0")
    if barra.count():
        fech = barra.locator("button").filter(has=pg.locator("svg.lucide-x"))
        if fech.count():
            try:
                fech.first.click(timeout=1500)
                pg.wait_for_timeout(300)
                return True
            except Exception:
                pass
    for sel in ["button:has-text('Fechar')", "button[aria-label*='echar']", "button:has-text('Pular')", "button:has-text('Encerrar')"]:
        loc = pg.locator(sel)
        if loc.count():
            try:
                loc.first.click(timeout=1500)
                pg.wait_for_timeout(300)
                return True
            except Exception:
                pass
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    return False


def toasts(pg):
    return " | ".join(t.inner_text() for t in pg.locator("[data-sonner-toast]").all())


with sync_playwright() as pw:
    # Fingerprint de navegador normal: Vercel em Attack Challenge Mode prende o headless padrão.
    nav = pw.chromium.launch(args=["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"])
    ctx = nav.new_context(
        viewport={"width": 1280, "height": 1600}, timezone_id="America/Sao_Paulo", locale="pt-BR",
        user_agent=("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"),
    )
    ctx.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined});")
    ctx.add_init_script("""
      try {
        const hoje = new Date().toLocaleDateString('pt-BR');
        localStorage.setItem('physiq_pendencia_avisada_em', hoje);
      } catch (e) {}
    """)
    if INJETAR_SESSAO:
        if not (ANON and SENHA):
            print("defina SUPABASE_ANON_KEY e SMOKE_PASSWORD para injetar a sessão")
            sys.exit(1)
        sessao = sessao_via_api()
        ctx.add_init_script(f"try {{ localStorage.setItem('sb-{REF}-auth-token', JSON.stringify({json.dumps(sessao)})); }} catch (e) {{}}")
        print(f"== sessão de {EMAIL_TESTE} injetada (schema {SCHEMA}) ==")
    pg = ctx.new_page()
    pg.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())

    print("== 1. link abre já logado (contexto limpo) ==")
    pg.goto(f"{BASE}/treinos", wait_until="domcontentloaded")
    pg.wait_for_selector("text=TREINO DO DIA", timeout=90000)
    espera_carregar(pg)
    corpo = pg.inner_text("body")
    checa("não caiu na tela de login", not tem(corpo, "Entrar com") and not tem(corpo, "Esqueci minha senha"))
    checa("aba Treinos carregou", tem(corpo, "TREINO DO DIA"))
    garantir_expandido(pg)
    pg.wait_for_selector("[data-remover-exercicio]", timeout=30000)

    cab = pg.locator(f"button:has-text('TREINO DO DIA'):has-text('{GRUPO_ALVO}')").first.inner_text()
    m = re.search(r"TREINO DO DIA\s*—\s*(\w{3})\s+(\d{2}/\d{2})", cab, re.I)
    dia_semana, ddmm = (m.group(1), m.group(2)) if m else ("", "")
    date_label = f"{dia_semana} {ddmm}"
    print(f"     hoje na tela: {date_label}")

    xs = pg.locator("[data-remover-exercicio]")
    n = xs.count()
    checa("X presente em todos os exercícios", n >= 2, f"{n} exercícios")
    ex_id = xs.first.get_attribute("data-remover-exercicio")
    card = pg.locator(f"div[data-exercicio-id='{ex_id}']")
    ex_nome = card.locator("button.font-heading").first.inner_text().split("#")[0].strip()
    ex_nome = re.sub(r"^\S+\s", "", ex_nome) if not ex_nome[0].isalnum() else ex_nome  # tira emoji
    print(f"     alvo: {ex_nome} ({ex_id[:8]})")
    checa("X fica ao lado do Histórico", card.locator("button:has-text('Histórico')").count() == 1)

    # outro dia com treino (pra provar 'só neste dia' vs 'definitivo')
    outros = [b.inner_text() for b in pg.locator("div.grid-cols-7 button", has_text=GRUPO_ALVO.split(" ")[0]).all()]
    outros_ddmm = [re.search(r"\d{2}/\d{2}", t).group(0) for t in outros if re.search(r"\d{2}/\d{2}", t)]
    outros_ddmm = [d for d in outros_ddmm if d != ddmm]
    outro = outros_ddmm[0] if outros_ddmm else None
    print(f"     outro dia com o mesmo treino: {outro}")

    print("== 2. popup do X ==")
    xs.first.click()
    modal = pg.locator("[data-modal-remover-exercicio]")
    modal.wait_for(timeout=10000)
    mt = modal.inner_text()
    checa("popup abre com o nome do exercício", tem(mt, ex_nome))
    checa("opção 'Remover neste dia' com o dia embaixo", tem(mt, "Remover neste dia") and tem(mt, date_label))
    checa("opção 'Remover definitivo' com 'Vale para os próximos treinos'", tem(mt, "Remover definitivo") and tem(mt, "Vale para os próximos treinos"))

    print("== 3. Confirma? + Voltar ==")
    modal.locator("[data-remover-opcao='dia']").click()
    conf = modal.locator("[data-remover-confirma]")
    conf.wait_for(timeout=5000)
    checa("segunda etapa pergunta 'Confirma?'", tem(conf.inner_text(), "Confirma?"))
    conf.locator("button:has-text('Voltar')").click()
    pg.wait_for_timeout(300)
    checa("Voltar retorna às 2 opções", modal.locator("[data-remover-opcao='dia']").count() == 1)

    print("== 4. remover neste dia ==")
    modal.locator("[data-remover-opcao='dia']").click()
    modal.locator("[data-remover-confirmar]").click()
    pg.wait_for_selector("[data-modal-remover-exercicio]", state="detached", timeout=10000)
    pg.wait_for_selector(f"div[data-exercicio-id='{ex_id}']", state="detached", timeout=15000)
    checa("exercício sumiu do treino de hoje", pg.locator(f"div[data-exercicio-id='{ex_id}']").count() == 0)
    rem = pg.locator("[data-removidos]")
    rem.wait_for(timeout=10000)
    checa("linha 'removido hoje' com Restaurar", tem(rem.inner_text(), ex_nome) and tem(rem.inner_text(), "removido hoje") and rem.locator(f"[data-restaurar='{ex_id}']").count() == 1)
    checa("toast 'Removido só em <dia>'", tem(toasts(pg), "Removido só em"))

    if outro:
        ir_para_dia(pg, outro)
        checa(f"em {outro} o exercício continua (remoção foi só do dia)", pg.locator(f"div[data-exercicio-id='{ex_id}']").count() == 1)
        ir_para_dia(pg, ddmm)
        checa("de volta a hoje continua removido", pg.locator(f"div[data-exercicio-id='{ex_id}']").count() == 0)

    print("== 5. servidor recebeu a remoção (linha sem exercício novo) ==")
    if PAT:
        ok_srv = False
        for _ in range(12):
            rows = sql(f"select data_treino, exercicio_novo_id, exercicio_novo_usuario_id from {SCHEMA}.exercicio_substituicao_usuario where user_id='{USER_TESTE}' and exercicio_origem_id='{ex_id}'")
            if rows and any(r["exercicio_novo_id"] is None and r["exercicio_novo_usuario_id"] is None and r["data_treino"] for r in rows):
                ok_srv = True
                break
            time.sleep(2)
        checa("PowerSync subiu a linha com novo_id/novo_usuario_id NULL e data_treino (CHECK relaxado OK)", ok_srv)
    else:
        print("  SKIP  sem SUPABASE_PAT — verificação no servidor pulada")

    print("== 6. restaurar ==")
    pg.locator(f"[data-restaurar='{ex_id}']").click()
    pg.wait_for_selector(f"div[data-exercicio-id='{ex_id}']", timeout=15000)
    checa("Restaurar traz o exercício de volta", pg.locator(f"div[data-exercicio-id='{ex_id}']").count() == 1)
    checa("linha de removidos sumiu", pg.locator("[data-removidos]").count() == 0)

    print("== 7. remover definitivo ==")
    pg.locator(f"[data-remover-exercicio='{ex_id}']").click()
    modal = pg.locator("[data-modal-remover-exercicio]")
    modal.wait_for(timeout=10000)
    modal.locator("[data-remover-opcao='definitiva']").click()
    conf = modal.locator("[data-remover-confirma]")
    conf.wait_for(timeout=5000)
    checa("confirmação do definitivo explica que vale pros próximos treinos", tem(conf.inner_text(), "Confirma?") and tem(conf.inner_text(), "próximos treinos"))
    modal.locator("[data-remover-confirmar]").click()
    pg.wait_for_selector(f"div[data-exercicio-id='{ex_id}']", state="detached", timeout=15000)
    rem = pg.locator("[data-removidos]")
    rem.wait_for(timeout=10000)
    badge = rem.locator("span.font-heading").first.inner_text()
    checa("linha mostra 'removido' (sem 'hoje')", badge.strip().upper() == "REMOVIDO", badge)
    if outro:
        ir_para_dia(pg, outro)
        checa(f"em {outro} também sumiu (definitivo)", pg.locator(f"div[data-exercicio-id='{ex_id}']").count() == 0)
        ir_para_dia(pg, ddmm)
    pg.locator(f"[data-restaurar='{ex_id}']").click()
    pg.wait_for_selector(f"div[data-exercicio-id='{ex_id}']", timeout=15000)
    checa("Restaurar do definitivo traz de volta", pg.locator(f"div[data-exercicio-id='{ex_id}']").count() == 1)

    print("== 8. OK numa série inicia o treino ==")
    corpo = pg.inner_text("body")
    checa("antes: botão INICIAR TREINO visível e nada em andamento", tem(corpo, "INICIAR TREINO") and not tem(corpo, "Treino em andamento"))
    card = pg.locator(f"div[data-exercicio-id='{ex_id}']")
    oks = card.locator("button:has-text('OK')")
    checa("exercício tem séries com OK", oks.count() >= 1, f"{oks.count()} séries")
    oks.first.click()
    pg.wait_for_selector("text=/treino em andamento/i", timeout=10000)
    corpo = pg.inner_text("body")
    checa("depois do OK: 'Treino em andamento' apareceu e INICIAR TREINO sumiu", tem(corpo, "Treino em andamento") and not tem(corpo, "INICIAR TREINO"))
    checa("toast 'Treino iniciado'", tem(toasts(pg), "Treino iniciado"))
    ls1 = pg.evaluate("localStorage.getItem('physiq_workout_timer')")
    started1 = json.loads(ls1)["startedAt"] if ls1 else None
    checa("localStorage physiq_workout_timer ativo", bool(started1))
    fechar_timer_descanso(pg)

    print("== 9. OK de novo com treino em andamento não faz nada ==")
    pg.wait_for_timeout(1500)
    outro_card = pg.locator("div[data-exercicio-id]").nth(1)
    outro_card.locator("button:has-text('OK')").first.click()
    pg.wait_for_timeout(800)
    ls2 = pg.evaluate("localStorage.getItem('physiq_workout_timer')")
    started2 = json.loads(ls2)["startedAt"] if ls2 else None
    checa("startedAt não mudou (não reiniciou)", started1 == started2, f"{started1} vs {started2}")
    fechar_timer_descanso(pg)

    print("== 10. X bloqueado quando já tem série concluída ==")
    pg.locator(f"[data-remover-exercicio='{ex_id}']").click()
    pg.wait_for_timeout(800)
    checa("popup NÃO abre", pg.locator("[data-modal-remover-exercicio]").count() == 0)
    checa("toast explica que já tem série concluída", tem(toasts(pg), "série concluída"))

    print("== console ==")
    ruido = [e for e in erros_console if "401" not in e and "Failed to load resource" not in e]
    checa("sem erro de console (ignorando 401 pré-existente)", len(ruido) == 0, "; ".join(ruido)[:300])

    nav.close()

print("== limpeza no servidor ==")
if PAT:
    time.sleep(6)
    print("  séries apagadas:", sql(f"delete from {SCHEMA}.tb_treino_series where user_id='{USER_TESTE}' and data_treino >= '2026-08-25' returning id"))
    print("  substituições apagadas:", sql(f"delete from {SCHEMA}.exercicio_substituicao_usuario where user_id='{USER_TESTE}' returning id"))
    print("  pesos academia apagados (só desta rodada):", sql(f"delete from {SCHEMA}.tb_academia_pesos where user_id='{USER_TESTE}' and updated_at >= now() - interval '2 hours' returning id"))
else:
    print("  SKIP sem SUPABASE_PAT")

print(f"\n== RESULTADO: {len(passes)}/{len(passes) + len(falhas)} PASS ==")
for f in falhas:
    print("  FALHA:", f)
sys.exit(1 if falhas else 0)
