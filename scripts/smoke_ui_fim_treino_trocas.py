#!/usr/bin/env python3
"""Smoke de UI (regressão): fim de treino após trocar/remover exercícios + troca definitiva.

Bugs cobertos (26/08/2026):
  1. Trocar/remover exercício NO MEIO do treino deixava séries padrão órfãs no estado
     (nunca concluídas) → o cronômetro nunca perguntava "Treino foi concluído?".
  2. Troca DEFINITIVA feita por cima de uma troca DO DIA gravava no banco, mas a do dia
     (que tem prioridade) escondia a definitiva — o app seguia mostrando a troca de hoje.

Roteiro (conta teste@teste.com, grupo do treinador "Peito + tríceps" semeado por override):
  1. link abre já logado; treino do dia com os 7 exercícios do grupo
  2. troca SÓ HOJE: Tríceps Testa → Remada Aberta (selo "trocado")
  3. troca DEFINITIVA por cima: Remada Aberta → Remada Fechada REFLETE NA HORA (bug 2),
     vale também amanhã; servidor fica com 1 linha (definitiva) pro exercício de origem
  4. remove Corrida (definitivo) e Crucifixo (só hoje)
  5. OK em TODAS as séries dos 5 exercícios restantes → diálogo "Treino foi concluído?" (bug 1)
  6. "Não, continuar" fecha e o cronômetro segue; Refazer + OK pergunta de novo;
     "Sim, finalizar" → "Treino finalizado!" + slot marcado; histórico só com os 5 exercícios
Ao final limpa séries/substituições/histórico/overrides da conta de teste no servidor.

Env: SMOKE_BASE (default http://localhost:5173), SUPABASE_PAT (ou ~/.pc-pat), SMOKE_SCHEMA
(public|staging), SMOKE_INJECT_SESSION=1 + SUPABASE_ANON_KEY + SMOKE_PASSWORD (build sem auto-login).
"""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from playwright.sync_api import sync_playwright

BASE = os.environ.get("SMOKE_BASE", "http://localhost:5173")
REF = "uxwpwdbbnlticxgtzcsb"
SUPA = f"https://{REF}.supabase.co"
SCHEMA = os.environ.get("SMOKE_SCHEMA", "public")
INJETAR_SESSAO = os.environ.get("SMOKE_INJECT_SESSION") == "1"
ANON = os.environ.get("SUPABASE_ANON_KEY")
SENHA = os.environ.get("SMOKE_PASSWORD")
USER_TESTE = "c62c7533-14ff-4e01-9ffa-06b3cdff1cc5"
EMAIL_TESTE = "teste@teste.com"
GRUPO_ID = "1427b068-58ab-417c-a13f-65e3489b76f2"
GRUPO_ALVO = "Peito + tríceps"
# Exercícios do catálogo usados no roteiro
EX_ORIGEM = "c7016a9d-1af3-4238-929f-adae75005ce6"   # Tríceps Testa (programado no grupo)
EX_DIA = "37da252b-86db-4cf8-ad90-735a0c23c75e"      # Remada Aberta na Máquina (troca só hoje)
EX_DEF = "b7a120f0-5efb-474a-bdaf-d13acfaceef8"      # Remada Fechada na Máquina (troca definitiva)
EX_CORRIDA = "4a151e92-a1f1-473d-a6df-51235d68d77c"  # removida definitivo
EX_CRUCIFIXO = "aa61d549-d952-4ee9-94ac-2f76ed29b063"  # removida só hoje

PAT = os.environ.get("SUPABASE_PAT")
if not PAT and os.path.exists(os.path.expanduser("~/.pc-pat")):
    PAT = open(os.path.expanduser("~/.pc-pat")).read().strip()

HOJE = datetime.now(ZoneInfo("America/Sao_Paulo")).date()
AMANHA = HOJE + timedelta(days=1)
falhas, passes, erros_console, avisos_powersync = [], [], [], []
overrides_semeados = []


def sql(query):
    if not PAT:
        return None
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json", "User-Agent": "supabase-cli/2.0"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode())


def sessao_via_api():
    req = urllib.request.Request(
        f"{SUPA}/auth/v1/token?grant_type=password", method="POST",
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


def toasts(pg):
    return " | ".join(t.inner_text() for t in pg.locator("[data-sonner-toast]").all())


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


def garantir_expandido(pg):
    aberto = pg.locator(f"h2:has-text('TREINO DO DIA'):has-text('{GRUPO_ALVO}')")
    if aberto.count() == 0:
        cab = pg.locator(f"button:has-text('TREINO DO DIA'):has-text('{GRUPO_ALVO}')").first
        if cab.count():
            cab.click()
            pg.wait_for_timeout(800)
        else:
            print(f"  AVISO  slot '{GRUPO_ALVO}' não encontrado neste dia")
            return
    try:
        pg.wait_for_selector("div[data-exercicio-id]", timeout=90000)
    except Exception:
        pg.screenshot(path="/tmp/smoke-fim-treino-falha.png", full_page=True)
        print("  AVISO  exercícios não apareceram (screenshot /tmp/smoke-fim-treino-falha.png)")


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
                pg.wait_for_timeout(250)
                return True
            except Exception:
                pass
    for sel in ["button:has-text('Fechar')", "button[aria-label*='echar']", "button:has-text('Pular')", "button:has-text('Encerrar')"]:
        loc = pg.locator(sel)
        if loc.count():
            try:
                loc.first.click(timeout=1500)
                pg.wait_for_timeout(250)
                return True
            except Exception:
                pass
    return False


def barra_descanso(pg):
    return pg.locator("div.fixed.bottom-0:has-text('Descanso')")


def checa_descanso_por_timestamp(pg):
    """Fix 3: o restante deriva do startedAt salvo (relógio real). Antes, cada tick fazia
    segundos-1 E re-ancorava o startedAt → em background a tela ficava pra trás."""
    barra = barra_descanso(pg)
    barra.wait_for(timeout=5000)
    st1 = json.loads(pg.evaluate("localStorage.getItem('physiq_rest_timer')"))
    pg.wait_for_timeout(2500)
    st2 = json.loads(pg.evaluate("localStorage.getItem('physiq_rest_timer')"))
    checa("descanso: startedAt salvo NÃO é re-ancorado a cada tick", st1["startedAt"] == st2["startedAt"], f"{st1['startedAt']} → {st2['startedAt']}")
    # Simula 40s "em background" (nenhum tick de JS): recua o início 40s → o próximo tick
    # tem que refletir o relógio real na tela, não o contador.
    pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('physiq_rest_timer')); s.startedAt -= 40000; localStorage.setItem('physiq_rest_timer', JSON.stringify(s)); }")
    pg.wait_for_timeout(1600)
    esperado = pg.evaluate("() => { const s = JSON.parse(localStorage.getItem('physiq_rest_timer')); return Math.max(0, s.duracao - Math.floor((Date.now() - s.startedAt) / 1000)); }")
    m, s = barra.locator("p.tabular-nums").inner_text().strip().split(":")
    mostrado = int(m) * 60 + int(s)
    checa("descanso: tela segue o relógio real ao 'voltar do background' (pulou ~40s)",
          abs(mostrado - esperado) <= 2 and mostrado <= st2["duracao"] - 40 + 2, f"tela {mostrado}s · esperado {esperado}s · duração {st2['duracao']}s")


def card(pg, ex_id):
    return pg.locator(f"div[data-exercicio-id='{ex_id}']")


def trocar(pg, ex_id_na_tela, escopo, busca, novo_id):
    """Abre o modal de troca do card, escolhe o escopo, busca e seleciona o novo, salva."""
    card(pg, ex_id_na_tela).locator("button:has-text('Trocar')").click()
    dlg = pg.locator("[role='dialog']:has-text('Trocar exercício')")
    dlg.wait_for(timeout=10000)
    dlg.locator("button:has-text('Só neste dia')" if escopo == "dia" else "button:has-text('Definitiva')").click()
    dlg.locator("input[type='text']").first.fill(busca)
    opcao = dlg.locator(f"label[data-trocar-opcao='{novo_id}']")
    opcao.wait_for(timeout=10000)
    opcao.locator("input").click()
    dlg.locator("button:has-text('Salvar troca por')").click()
    pg.wait_for_selector("[role='dialog']:has-text('Trocar exercício')", state="detached", timeout=10000)


def remover(pg, ex_id, escopo):
    pg.locator(f"[data-remover-exercicio='{ex_id}']").click()
    modal = pg.locator("[data-modal-remover-exercicio]")
    modal.wait_for(timeout=10000)
    modal.locator(f"[data-remover-opcao='{escopo}']").click()
    modal.locator("[data-remover-confirmar]").click()
    pg.wait_for_selector("[data-modal-remover-exercicio]", state="detached", timeout=10000)
    pg.wait_for_selector(f"div[data-exercicio-id='{ex_id}']", state="detached", timeout=15000)


def dialogo_fim(pg):
    return pg.locator("[role='alertdialog']:has-text('Treino foi concluído?')")


def limpar_servidor(motivo):
    if not PAT:
        print(f"  SKIP limpeza ({motivo}) — sem SUPABASE_PAT")
        return
    print(f"== limpeza no servidor ({motivo}) ==")
    print("  séries:", len(sql(f"delete from {SCHEMA}.tb_treino_series where user_id='{USER_TESTE}' and data_treino >= '{HOJE - timedelta(days=1)}' returning id")))
    print("  substituições:", len(sql(f"delete from {SCHEMA}.exercicio_substituicao_usuario where user_id='{USER_TESTE}' returning id")))
    print("  concluídos:", len(sql(f"delete from {SCHEMA}.tb_treino_concluido where user_id='{USER_TESTE}' and data_treino >= '{HOJE - timedelta(days=1)}' returning id")))
    print("  histórico:", len(sql(f"delete from {SCHEMA}.treino_historico where user_id='{USER_TESTE}' and created_at >= now() - interval '3 hours' returning id")))
    print("  pesos academia (3h):", len(sql(f"delete from {SCHEMA}.tb_academia_pesos where user_id='{USER_TESTE}' and updated_at >= now() - interval '3 hours' returning id")))
    if overrides_semeados:
        ids = ",".join(f"'{i}'" for i in overrides_semeados)
        print("  overrides semeados:", len(sql(f"delete from {SCHEMA}.tb_treino_dia_override where id in ({ids}) returning id")))


# ── seed: treino "Peito + tríceps" hoje e amanhã (slot 0) pra conta de teste ──
if not PAT:
    print("SUPABASE_PAT (ou ~/.pc-pat) é obrigatório: o roteiro semeia o treino do dia da conta de teste")
    sys.exit(1)
limpar_servidor("estado anterior")
for d in (HOJE, AMANHA):
    rows = sql(
        f"insert into {SCHEMA}.tb_treino_dia_override (user_id, data_treino, grupo_id, slot_idx) "
        f"select '{USER_TESTE}', '{d}', '{GRUPO_ID}', 0 "
        f"where not exists (select 1 from {SCHEMA}.tb_treino_dia_override where user_id='{USER_TESTE}' and data_treino='{d}' and slot_idx=0) "
        f"returning id"
    )
    overrides_semeados.extend(r["id"] for r in rows)
print(f"== seed: overrides {HOJE} e {AMANHA} ({len(overrides_semeados)} inseridos) ==")
time.sleep(3)

try:
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"])
        ctx = nav.new_context(
            viewport={"width": 1280, "height": 1800}, timezone_id="America/Sao_Paulo", locale="pt-BR",
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
        # warnings do PowerSync também importam: o connector DESCARTA op com unique violation via console.warn
        pg.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else (
            avisos_powersync.append(f"{time.strftime('%H:%M:%S')} {m.text[:200]}") if m.type == "warning" and "PowerSync" in m.text else None))
        pg.on("dialog", lambda d: d.accept())

        print("== 1. link abre já logado (contexto limpo) ==")
        pg.goto(f"{BASE}/treinos", wait_until="domcontentloaded")
        pg.wait_for_selector("text=TREINO DO DIA", timeout=90000)
        espera_carregar(pg)
        corpo = pg.inner_text("body")
        checa("não caiu na tela de login", not tem(corpo, "Entrar com") and not tem(corpo, "Esqueci minha senha"))
        checa("aba Treinos carregou", tem(corpo, "TREINO DO DIA"))
        garantir_expandido(pg)
        pg.wait_for_selector(f"div[data-exercicio-id='{EX_ORIGEM}']", timeout=60000)
        n = pg.locator("div[data-exercicio-id]").count()
        checa("treino do dia com os 7 exercícios do grupo", n == 7, f"{n}")
        ddmm_hoje, ddmm_amanha = HOJE.strftime("%d/%m"), AMANHA.strftime("%d/%m")

        print("== 2. troca SÓ HOJE: Tríceps Testa → Remada Aberta ==")
        trocar(pg, EX_ORIGEM, "dia", "Remada Aberta", EX_DIA)
        pg.wait_for_selector(f"div[data-exercicio-id='{EX_DIA}']", timeout=15000)
        checa("Remada Aberta entrou no lugar", card(pg, EX_DIA).count() == 1 and card(pg, EX_ORIGEM).count() == 0)
        checa("selo 'trocado' no card", tem(card(pg, EX_DIA).inner_text(), "trocado"))
        checa("toast 'Trocado só hoje'", tem(toasts(pg), "Trocado só hoje"))

        print("== 3. troca DEFINITIVA por cima: Remada Aberta → Remada Fechada (bug 2) ==")
        trocar(pg, EX_DIA, "definitiva", "Remada Fechada", EX_DEF)
        apareceu = True
        try:
            pg.wait_for_selector(f"div[data-exercicio-id='{EX_DEF}']", timeout=15000)
        except Exception:
            apareceu = False
        checa("Remada Fechada aparece HOJE na hora (a do dia não esconde mais a definitiva)", apareceu and card(pg, EX_DIA).count() == 0)
        checa("selo 'trocado' no card definitivo", apareceu and tem(card(pg, EX_DEF).inner_text(), "trocado"))
        checa("toast 'Trocado definitivamente'", tem(toasts(pg), "Trocado definitivamente"))
        # Upload do PowerSync pode levar >30s no staging (build de produção via Vercel) → poll de 90s
        ok_srv, rows, t_ini = False, None, time.time()
        for _ in range(45):
            rows = sql(f"select data_treino, exercicio_novo_id from {SCHEMA}.exercicio_substituicao_usuario where user_id='{USER_TESTE}' and exercicio_origem_id='{EX_ORIGEM}'")
            if rows and len(rows) == 1 and rows[0]["data_treino"] is None and rows[0]["exercicio_novo_id"] == EX_DEF:
                ok_srv = True
                break
            time.sleep(2)
        checa("servidor: 1 linha só (definitiva → Remada Fechada); a do dia foi apagada", ok_srv, f"{json.dumps(rows)[:160]} · {int(time.time() - t_ini)}s")
        ir_para_dia(pg, ddmm_amanha)
        checa(f"amanhã ({ddmm_amanha}) também mostra Remada Fechada (definitiva)", card(pg, EX_DEF).count() == 1 and card(pg, EX_ORIGEM).count() == 0)
        ir_para_dia(pg, ddmm_hoje)
        pg.wait_for_selector(f"div[data-exercicio-id='{EX_DEF}']", timeout=15000)

        print("== 4. remover Corrida (definitivo) e Crucifixo (só hoje) ==")
        remover(pg, EX_CORRIDA, "definitiva")
        remover(pg, EX_CRUCIFIXO, "dia")
        n = pg.locator("div[data-exercicio-id]").count()
        checa("restaram 5 exercícios no treino", n == 5, f"{n}")
        rem = pg.locator("[data-removidos]")
        checa("linha de removidos com Restaurar dos 2", rem.count() == 1 and rem.locator(f"[data-restaurar='{EX_CORRIDA}']").count() == 1 and rem.locator(f"[data-restaurar='{EX_CRUCIFIXO}']").count() == 1)

        print("== 5. OK em todas as séries dos 5 exercícios → pergunta 'Treino foi concluído?' (bug 1) ==")
        checa("antes: INICIAR TREINO visível", tem(pg.inner_text("body"), "INICIAR TREINO"))
        total_ok = 0
        for ex_id in [c.get_attribute("data-exercicio-id") for c in pg.locator("div[data-exercicio-id]").all()]:
            while True:
                oks = card(pg, ex_id).locator("button:has-text('OK')")
                if oks.count() == 0:
                    break
                oks.first.click()
                total_ok += 1
                pg.wait_for_timeout(350)
                if total_ok == 1:
                    pg.wait_for_selector("text=/treino em andamento/i", timeout=10000)
                    checa("1ª série: descanso abre", barra_descanso(pg).count() == 1)
                    checa_descanso_por_timestamp(pg)
                if total_ok == 15 or dialogo_fim(pg).count():
                    break  # última: NÃO fechar o descanso aqui — o teste abaixo checa que ele nem abriu
                fechar_timer_descanso(pg)
            if total_ok == 15 or dialogo_fim(pg).count():
                break
        print(f"     {total_ok} séries concluídas")
        checa("todas as séries dos 5 exercícios foram concluídas (15)", total_ok == 15, f"{total_ok}")
        apareceu = True
        try:
            dialogo_fim(pg).wait_for(timeout=10000)
        except Exception:
            apareceu = False
            pg.screenshot(path="/tmp/smoke-fim-treino-sem-dialogo.png", full_page=True)
        checa("diálogo 'Treino foi concluído?' apareceu mesmo com 1 troca + 2 remoções", apareceu)
        if apareceu:
            checa("texto cita 'Todas as séries de Peito + tríceps'", tem(dialogo_fim(pg).inner_text(), f"Todas as séries de {GRUPO_ALVO}"))
        pg.wait_for_timeout(800)
        checa("última série do treino NÃO abre o descanso", barra_descanso(pg).count() == 0)

        print("== 6. Não, continuar → Refazer + OK pergunta de novo → Sim, finalizar ==")
        if apareceu:
            dialogo_fim(pg).locator("button:has-text('Não, continuar')").click()
            pg.wait_for_selector("[role='alertdialog']", state="detached", timeout=5000)
            checa("'Não' fecha o diálogo e o cronômetro segue", dialogo_fim(pg).count() == 0 and tem(pg.inner_text("body"), "Treino em andamento"))
            pg.locator("button:has-text('Refazer')").first.click()
            pg.wait_for_timeout(500)
            checa("Refazer reabre a série (OK de volta)", pg.locator("button:has-text('OK')").count() == 1)
            pg.locator("button:has-text('OK')").first.click()
            pg.wait_for_timeout(800)
            checa("refazer a última e concluir de novo também NÃO abre o descanso", barra_descanso(pg).count() == 0)
            reapareceu = True
            try:
                dialogo_fim(pg).wait_for(timeout=10000)
            except Exception:
                reapareceu = False
            checa("concluir de novo pergunta de novo (1x por transição)", reapareceu)
            if reapareceu:
                dialogo_fim(pg).locator("button:has-text('Sim, finalizar')").click()
                pg.wait_for_selector("text=Treino finalizado", timeout=15000)
                corpo = pg.inner_text("body")
                checa("'Sim, finalizar' → 'Treino finalizado!'", tem(corpo, "Treino finalizado"))
                checa("slot marcado 'Treino concluído ✓'", tem(corpo, "Treino concluído"))
                checa("toast 'Treino concluído em'", tem(toasts(pg), "Treino concluído em"))
                ok_hist, hist = False, None
                for _ in range(45):
                    hist = sql(f"select nome_treino, exercicios_concluidos from {SCHEMA}.treino_historico where user_id='{USER_TESTE}' and created_at >= now() - interval '30 minutes' order by created_at desc limit 1")
                    if hist:
                        break
                    time.sleep(2)
                if hist:
                    exs = hist[0]["exercicios_concluidos"]
                    if isinstance(exs, str):
                        exs = json.loads(exs)
                    if isinstance(exs, str):
                        exs = json.loads(exs)
                    ids = {e["exercicio_id"] for e in exs}
                    ok_hist = len(exs) == 5 and EX_DEF in ids and not ({EX_ORIGEM, EX_DIA, EX_CORRIDA, EX_CRUCIFIXO} & ids)
                    checa("histórico: 5 exercícios, com Remada Fechada e SEM os removidos/trocados", ok_hist, f"{len(exs)} ex: {sorted(i[:8] for i in ids)}")
                else:
                    checa("histórico gravado no servidor", False, "sem linha em treino_historico")
                conc = sql(f"select 1 from {SCHEMA}.tb_treino_concluido where user_id='{USER_TESTE}' and data_treino='{HOJE}' and slot_idx=0")
                checa("tb_treino_concluido marcado hoje", bool(conc))

        print("== console ==")
        ruido = [e for e in erros_console if "401" not in e and "Failed to load resource" not in e]
        checa("sem erro de console (ignorando 401 pré-existente)", len(ruido) == 0, "; ".join(ruido)[:300])
        checa("sem op descartada pelo connector do PowerSync (warn)", not any("descartando" in a or "Upload exception" in a for a in avisos_powersync), "; ".join(avisos_powersync)[:400])

        nav.close()
finally:
    time.sleep(5)
    limpar_servidor("fim do smoke")

print(f"\n== RESULTADO: {len(passes)}/{len(passes) + len(falhas)} PASS ==")
for f in falhas:
    print("  FALHA:", f)
sys.exit(1 if falhas else 0)
