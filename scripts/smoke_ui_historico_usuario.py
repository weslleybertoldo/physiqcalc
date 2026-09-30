#!/usr/bin/env python3
"""Smoke de UI: Configurar Usuário › aba "Histórico" (lista de treinos do aluno, presa nele, filtro mês/ano).

Oráculo = a MESMA edge da aba "Histórico de Treinos" do painel (admin-relatorio/historicoMes),
filtrada pelo aluno. Tudo que a tela mostra é conferido contra ela — o smoke não depende de
dados fixos (escolhe um aluno/mês com treinos, ou testa o estado vazio se não houver nenhum).

Local (dev server com auto-login DEV): contexto LIMPO — prova que o link do gate abre já logado.
Staging/prod (build de produção): SMOKE_INJECT_SESSION=1 injeta a sessão real no localStorage.

W8: o login é o de hoje (W3 — sessão do banco principal injetada + troca de token pelo próprio app; ver e2e/w08/_base.py) e o
oráculo usa a sessão do Treino da mesma troca de token; a tela é a antiga ("Configurar aluno › Histórico") dentro do perfil do
aluno do painel novo (/admin?v=config… redireciona para /painel/alunos/:id/treino?ct=historico). Só leitura.

Env: SMOKE_BASE (default http://localhost:5173) · SMOKE_SCHEMA (default staging) · SMOKE_USER_ID (opcional: força o aluno)
     · SMOKE_PNG (screenshot final)
"""
import importlib.util
import json
import os
import re
import sys
import time
import urllib.error
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
PNG = os.environ.get("SMOKE_PNG", "/tmp/pc_smoke_historico_usuario.png")
SUPA = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
REF = "uxwpwdbbnlticxgtzcsb"
ADMIN = "admin.teste.claude@physiqcalc.app"
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

B8.ESTADO["schema"] = SCHEMA
ANON = B8.B5.anon(REF)

falhas, passes, erros_console = [], [], []


def checa(nome, cond, detalhe=""):
    (passes if cond else falhas).append(nome)
    print(("  PASS  " if cond else "  FALHA ") + nome + (f" ({detalhe})" if detalhe else ""))


def tem(texto, alvo):
    return alvo.upper() in texto.upper()


def espera_carregar(pg, escopo=None, timeout_ms=90000):
    """Espera o 'Carregando...' sumir (edge tem cold start). Afirmar antes disso dá PASS falso."""
    limite = time.time() + timeout_ms / 1000
    while time.time() < limite:
        try:
            texto = (escopo or pg.locator("body")).inner_text()
        except Exception:
            texto = "Carregando"
        if "Carregando" not in texto:
            return True
        pg.wait_for_timeout(400)
    return False


def dia_mes(data):
    _, m, d = data.split("-")
    return f"{d}/{m}"


def format_duracao(s):
    h, m = s // 3600, (s % 3600) // 60
    return f"{h}h{m:02d}m" if h > 0 else f"{m}m"


def post_json(url, body, headers):
    req = urllib.request.Request(url, method="POST", data=json.dumps(body).encode())
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "physiq-unificado/1.0 (smoke)")  # a Cloudflare do api. recusa o urllib sem User-Agent (1010)
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


# 1) sessão do Treino do profissional de teste (a mesma troca de token do app)
_st, sessao = B8.B5.trocar_token("master")
if _st != 200 or "access_token" not in sessao:
    print(f"ERRO na troca de token: {_st} {sessao}")
    sys.exit(1)
JWT = sessao["access_token"]
sessao["user"] = {"id": sessao.get("treino_user_id")}
print(f"== sessão do Treino do profissional de teste (schema {SCHEMA}) ==")


def edge(body):
    return post_json(f"https://api.physiqcalc.com.br/functions/v1/admin-relatorio", body,
                     {"apikey": ANON, "Authorization": f"Bearer {JWT}", "x-schema": SCHEMA, "Origin": "http://localhost:5173"})


def meses_para_tras(n):
    """(ano, mes) do mês atual pra trás, só dentro dos 3 anos que o seletor oferece."""
    hoje = time.localtime()
    ano, mes = hoje.tm_year, hoje.tm_mon
    for _ in range(n):
        if ano < hoje.tm_year - 2:
            return
        yield ano, mes
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12


# 2) oráculo: aluno + mês com treinos (prefere quem o Weslley conhece: Jaise)
forcado = os.environ.get("SMOKE_USER_ID")
alvo = None  # (userId, pessoa, ano, mes, itens_do_aluno, itens_do_mes)
for ano, mes in meses_para_tras(18):
    itens = edge({"action": "historicoMes", "ano": ano, "mes": mes}).get("itens", [])
    if forcado:
        meus = [i for i in itens if i["userId"] == forcado]
        if meus:
            alvo = (forcado, meus[0]["pessoa"], ano, mes, meus, itens)
            break
        continue
    if not itens:
        continue
    contagem = {}
    for i in itens:
        contagem.setdefault(i["userId"], []).append(i)
    escolhido = next((u for u, its in contagem.items() if "jaise" in its[0]["pessoa"].lower()), None) \
        or max(contagem, key=lambda u: len(contagem[u]))
    alvo = (escolhido, contagem[escolhido][0]["pessoa"], ano, mes, contagem[escolhido], itens)
    break

hoje = time.localtime()
if alvo is None:
    # sem treino nenhum no período: testa o estado vazio com a própria conta admin
    user_id = forcado or sessao["user"]["id"]
    alvo = (user_id, "(sem treinos)", hoje.tm_year, hoje.tm_mon, [], [])
user_id, pessoa, ano_alvo, mes_alvo, esperados, itens_mes = alvo
print(f"== alvo: {pessoa} ({user_id}) · {MESES[mes_alvo - 1]}/{ano_alvo} · {len(esperados)} treino(s) "
      f"de {len(itens_mes)} no mês ==")

# mês vazio pro aluno (pra provar a mensagem de vazio), dentro do seletor
vazio = None
for ano, mes in meses_para_tras(24):
    if (ano, mes) == (ano_alvo, mes_alvo):
        continue
    its = edge({"action": "historicoMes", "ano": ano, "mes": mes}).get("itens", [])
    if not any(i["userId"] == user_id for i in its):
        vazio = (ano, mes)
        break

with sync_playwright() as pw:
    nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
    caso = B8.abrir_painel(nav, BASE, os.environ.get("SMOKE_PREFIXO", "local"), "historico_usuario", "/painel")
    ctx, pg = caso.ctx, caso.pg
    pg.on("console", lambda m: erros_console.append(m.text) if m.type == "error" else None)

    url = f"{BASE}/admin?v=config&u={user_id}&ct=historico"
    print(f"\n== 1. {url} abre já logado no perfil do aluno › Treino › Histórico ==")
    pg.goto(url, wait_until="domcontentloaded")
    pg.wait_for_selector("[data-historico-filtros]", timeout=120000)
    corpo = pg.inner_text("body")
    checa("não caiu na tela de login", not tem(corpo, "Entrar com") and not tem(corpo, "Esqueci minha senha"))
    checa("o perfil do aluno abriu na aba Treino › Histórico", "/painel/alunos/" in pg.url and "ct=historico" in pg.url, pg.url)
    if pessoa != "(sem treinos)":
        checa("cabeçalho mostra o nome do aluno", tem(corpo, pessoa), pessoa)

    print("\n== 2. aba Histórico ao lado de Treino, já ativa pela URL ==")
    abas = pg.eval_on_selector_all("div.flex.flex-wrap.gap-2.pt-2 > button", "els => els.map(e => e.textContent.trim())")
    checa("aba 'Histórico' existe", "Histórico" in abas, " | ".join(abas))
    checa("vem logo depois de 'Treino'",
          "Treino" in abas and "Histórico" in abas and abas.index("Histórico") == abas.index("Treino") + 1)
    aba = pg.locator("div.flex.flex-wrap.gap-2.pt-2 > button", has_text="Histórico").first
    checa("aba Histórico está ativa (?ct=historico)", "border-primary" in (aba.get_attribute("class") or ""))
    checa("sem botão Salvar nesta aba", pg.get_by_role("button", name="Salvar", exact=True).count() == 0)

    print("\n== 3. filtros: só mês e ano (nada de escolher aluno) ==")
    checa("lista terminou de carregar", espera_carregar(pg))
    filtros = pg.locator("[data-historico-filtros]")
    checa("bloco de filtros presente", filtros.count() == 1)
    checa("exatamente 2 selects (mês e ano)", filtros.locator("select").count() == 2,
          f"{filtros.locator('select').count()} selects")
    checa("não há 'Todos os alunos'", pg.locator("option", has_text="Todos os alunos").count() == 0)
    checa("não há bloco 'Histórico completo de um aluno'", not tem(pg.inner_text("body"), "Histórico completo de um aluno"))
    checa("mês atual pré-selecionado", pg.locator("[data-historico-mes]").input_value() == str(hoje.tm_mon),
          f"mes={pg.locator('[data-historico-mes]').input_value()}")
    checa("ano atual pré-selecionado", pg.locator("[data-historico-ano]").input_value() == str(hoje.tm_year))

    print(f"\n== 4. {MESES[mes_alvo - 1]}/{ano_alvo}: lista == edge historicoMes filtrada pelo aluno ==")
    pg.locator("[data-historico-ano]").select_option(str(ano_alvo))
    pg.locator("[data-historico-mes]").select_option(str(mes_alvo))
    pg.wait_for_timeout(500)
    checa("recarregou", espera_carregar(pg))
    linhas = pg.locator("[data-historico-linha]")
    n = linhas.count()
    checa("mesmo número de treinos que a edge (só deste aluno)", n == len(esperados), f"tela {n} × edge {len(esperados)}")
    if esperados:
        rotulo = pg.locator("[data-historico-contagem]").inner_text()
        esperado_rotulo = f"{len(esperados)} {'treino' if len(esperados) == 1 else 'treinos'} em {MESES[mes_alvo - 1]}"
        checa("rótulo de contagem certo", tem(rotulo, esperado_rotulo), rotulo)
        ok_linhas = True
        detalhes = []
        for i, it in enumerate(esperados[:n]):
            txt = linhas.nth(i).inner_text()
            partes = [dia_mes(it["data"]), it["diaSemana"], it["pessoa"], it["nomeTreino"]]
            partes.append(format_duracao(it["duracaoSegundos"]) if it["comCronometro"] and it["duracaoSegundos"] is not None else "sem cronômetro")
            if it["totalExercicios"] > 0:
                partes.append(f"{it['totalExercicios']} exercícios")
            if it["academia"]:
                partes.append(it["academia"])
            faltando = [p for p in partes if not tem(txt, p)]
            if faltando:
                ok_linhas = False
                detalhes.append(f"linha {i}: faltou {faltando}")
        checa("cada linha bate com a edge (data, dia, pessoa, treino, duração, exercícios, academia)", ok_linhas, "; ".join(detalhes))
        outros = sorted({i["pessoa"] for i in itens_mes if i["userId"] != user_id})
        if outros:
            corpo = "\n".join(linhas.nth(i).inner_text() for i in range(n))
            checa("treinos de OUTROS alunos do mês não aparecem", not any(tem(corpo, o) for o in outros), ", ".join(outros))
        else:
            print("  (info) só este aluno treinou no mês — filtro por aluno não é observável aqui")

        print("\n== 5. clique na linha abre SÓ aquele treino ==")
        linhas.first.click()
        pg.wait_for_selector("div.fixed.inset-0.z-50", timeout=30000)
        popup = pg.locator("div.fixed.inset-0.z-50")
        checa("popup terminou de carregar", espera_carregar(pg, popup))
        txt = popup.inner_text()
        checa("popup tem o nome do aluno", tem(txt, pessoa))
        checa("popup tem o nome do treino", tem(txt, esperados[0]["nomeTreino"]))
        checa("popup carregou o detalhe (não deu erro)", not tem(txt, "Não consegui carregar"))
        checa("tem as 4 caixas (Duração/Academia/Volume total/Média peso/rep)",
              tem(txt, "Duração") and tem(txt, "Academia") and tem(txt, "Volume total") and tem(txt, "Média peso/rep"))
        checa("NÃO é o histórico completo", not tem(txt, "Todos os meses") and not tem(txt, "Tempo total"))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(600)
        checa("ESC fecha o popup", pg.locator("div.fixed.inset-0.z-50").count() == 0)
    else:
        checa("estado vazio do aluno", tem(pg.inner_text("body"), f"Este aluno não tem treinos em {MESES[mes_alvo - 1]} de {ano_alvo}"))

    if vazio:
        print(f"\n== 6. mês sem treinos ({MESES[vazio[1] - 1]}/{vazio[0]}) mostra a mensagem do aluno ==")
        pg.locator("[data-historico-ano]").select_option(str(vazio[0]))
        pg.locator("[data-historico-mes]").select_option(str(vazio[1]))
        pg.wait_for_timeout(500)
        checa("recarregou", espera_carregar(pg))
        checa("mensagem 'Este aluno não tem treinos em ...'",
              tem(pg.inner_text("body"), f"Este aluno não tem treinos em {MESES[vazio[1] - 1]} de {vazio[0]}"))
        checa("nenhuma linha", pg.locator("[data-historico-linha]").count() == 0)

    print("\n== 7. F5 mantém a aba Histórico ==")
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_selector("[data-historico-filtros]", timeout=120000)
    aba = pg.locator("div.flex.flex-wrap.gap-2.pt-2 > button", has_text="Histórico").first
    checa("URL segue com ct=historico", "ct=historico" in pg.url)
    checa("aba Histórico continua ativa", "border-primary" in (aba.get_attribute("class") or ""))
    checa("filtros da aba renderizados", pg.locator("[data-historico-filtros]").count() == 1)
    pg.locator("[data-historico-ano]").select_option(str(ano_alvo))
    pg.locator("[data-historico-mes]").select_option(str(mes_alvo))
    espera_carregar(pg)
    pg.screenshot(path=PNG, full_page=True)

    print("\n== 8. regressão: painel › Treinos › Histórico de Treinos segue com o filtro de aluno ==")
    pg.goto(f"{BASE}/admin?v=treinos&t=historico", wait_until="domcontentloaded")
    pg.wait_for_selector("text=Histórico completo de um aluno", timeout=120000)
    checa("painel carregou a lista", espera_carregar(pg))
    checa("bloco 'Histórico completo de um aluno' presente", tem(pg.inner_text("body"), "Histórico completo de um aluno"))
    checa("filtro 'Todos os alunos' presente", pg.locator("option", has_text="Todos os alunos").count() == 1)
    checa("4 selects no painel (busca, mês, ano, aluno)", pg.locator("select").count() == 4, f"{pg.locator('select').count()}")

    print("\n== 9. console ==")
    # o Realtime do Banco do Treino está suspenso desde 03/09 (403 no websocket) — não é desta tela
    reais = [e for e in erros_console if "favicon" not in e.lower() and "manifest" not in e.lower() and "realtime" not in e.lower()
             and "Failed to load resource" not in e]
    checa("sem erros de console", len(reais) == 0, " | ".join(reais[:3]) if reais else "limpo")

    ctx.close()
    nav.close()

print(f"\n{'=' * 50}\n{len(passes)}/{len(passes) + len(falhas)} PASS · screenshot {PNG}")
if falhas:
    print("FALHAS: " + " | ".join(falhas))
    sys.exit(1)
print("smoke UI OK")
