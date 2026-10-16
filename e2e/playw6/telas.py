#!/usr/bin/env python3
"""Physiq play-W6 — E2E de TELA da assinatura pela Google Play, LOCAL: o build de STAGING servido pelo e2e/hml15/servidor_dist.py (os mesmos
cabeçalhos do vercel.json) na :5173, o banco do staging (a migration da play-W6 já lá) e as funções NOVAS no Deno local (a play-compras, a
play-rtdn, a pagamentos-aluno e a excluir-minha-conta do e2e/playw6/api.py, com o simulador da Play e o Treino falso): o Playwright
encaminha só essas 3 que a tela chama (play-compras, pagamentos-aluno, excluir-minha-conta) para o Deno local; o resto vai às funções
publicadas do staging, como sempre. Conta de TESTE: w7b-treino (a matrícula do app vencida) — a foto e a limpeza CONFERIDA são as do api.py.

  --loja   o `build:loja` (o health.json diz "play") com a ponte Android de mentira da H2 (e2e/h2/ponte_android.js) + o plugin da Play de
           mentira (e2e/playw6/ponte_play.js: o preço da "Play" = R$ 31,90 / R$ 51,90, de propósito diferente do banco; a compra vai ao
           simulador pelo window.__playSim):
             L1 a trava da conta do app → "Assinar pela Google Play · R$ 31,90/mês" (o preço da Play; nada do R$ 29,90 do banco)
             L2 a folha da oferta: o preço por mês, "Renova todo mês até você cancelar.", "Cancele quando quiser na Google Play.", os Termos e
                a Privacidade antes do botão
             L3 Assinar → o plugin compra → o servidor confere no "Google", grava, reconhece → a trava sai (o banco: ativa + 1 cobrança de
                R$ 31,90)
             L4 Meu plano: "Assinatura pela Google Play · até · renova sozinha", o preço da Play, sem Pagar; o Gerenciar chama o plugin
             L5 a troca para o completo pela Play (na hora): a folha com o aviso da troca → o plano vira o completo (a anterior substituída)
             L6 Pagamentos: o cartão da Play, sem Pagar
             L7 Excluir minha conta: o aviso de que a assinatura da Play é cancelada antes (sem excluir: o sheet só abre)
             L8 o código de um profissional: o popup avisa que a assinatura da Play é cancelada no vínculo (Cancelar — nada vinculado)
  --site   o build do SITE com a assinatura da Play viva (registrada pela API local antes):
             S1 Meu plano: o cartão da Play + o link "Gerenciar na Google Play" (a Central de assinaturas do produto), sem Pagar/trocar
             S2 Pagamentos: o cartão da Play, sem Pagar (o Pix do site o servidor recusa: o 409 do api.py)
             S3 a Play suspensa (o aviso ON_HOLD pelo play-rtdn) → a trava "Assinatura suspensa" com "Atualizar na Google Play"
  --seco   sem rede: a ponte da Play (node --check), cada data-* que a rodada usa existe no src/ e o canal dos 2 builds (health.json)
  --limpar só desfaz uma rodada que caiu no meio (o arquivo de estado do api.py)
Builds (antes, pelo um.sh): VITE_DISTRIBUICAO=play VITE_APP_NATIVO=1 npx vite build --outDir <tmp>/dist-loja --emptyOutDir · npx vite build
--outDir <tmp>/dist-site --emptyOutDir (o .env.local do staging).
Prints em ~/projetos/physiqcalc-scratch/prints/playw6/ (390 × 844; conferidos numa cópia reduzida; nunca no git). Logins: 1 por contexto do
navegador (+ 1 da API no --site), todos com logout local no fim. Saída sem dado pessoal nem segredo.
Uso: python3 e2e/playw6/telas.py --seco
     python3 e2e/playw6/telas.py --loja [--canal msedge]
     python3 e2e/playw6/telas.py --site [--canal msedge]
     python3 e2e/playw6/telas.py --limpar
"""
from __future__ import annotations

import argparse
import json
import re
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
sys.path.insert(0, str(AQUI))
import api as API  # noqa: E402

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "playw6"
TMP = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "playw6" / "tmp"
DIST = {"loja": TMP / "dist-loja", "site": TMP / "dist-site"}
PORTA = 5173
BASE = f"http://localhost:{PORTA}"
CONTA = "w7b-treino"
PROF = "PROF-LUCAS-FERREIRA"
PRECOS = {"app_treino": ("R$ 31,90", 31.9), "app_treino_alimentacao": ("R$ 51,90", 51.9)}
PONTE_H2 = (REPO / "e2e" / "h2" / "ponte_android.js").read_text(encoding="utf-8")
PONTE_PLAY = (AQUI / "ponte_play.js").read_text(encoding="utf-8")
UA_WEBVIEW = ("Mozilla/5.0 (Linux; Android 14; 21121210G Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36")
UA_ANDROID = ("Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile "
              "Safari/537.36")
ARGS_NAVEGADOR = ["--no-sandbox", "--disable-dev-shm-usage"]
# o que leva dado pessoal na tela: o resumo dos Termos antes de pagar (o nome e o CPF de quem vende, no build de staging) e as fotos
BORRAR = "[data-resumo-antes-de-pagar] li:first-child, [role=dialog] img, [role=alertdialog] img"
ENCAMINHADAS = {"play-compras": "compras", "pagamentos-aluno": "pag", "excluir-minha-conta": "excluir"}
SELETORES = ("data-trava-app", "data-play-assinar", "data-folha-oferta-play", "data-play-preco", "data-play-linhas", "data-play-termos",
             "data-play-assinar-confirmar", "data-assinatura-play", "data-assinatura-play-titulo", "data-assinatura-play-detalhe",
             "data-play-gerenciar", "data-meu-plano-preco-play", "data-meu-plano-pagar", "data-meu-plano-trocar-play", "data-meu-plano-trocar",
             "data-plano-app", "data-preco-plano", "data-play-troca", "data-pagar-mensalidade", "data-sheet-excluir", "data-excluir-play",
             "data-perfil-codigo-campo", "data-perfil-codigo-enviar", "data-vinculo-cancelar")
ESTADO: dict = {"compras": [], "sessoes": [], "prefixo": "local"}
B = None
p = None


# ───────────────────────── a base ─────────────────────────

def carregar() -> None:
    """A base do api.py (a da W7b) + o contador de logins também no Caso da W5 (o login de cada contexto do navegador)."""
    global B, p
    API.carregar_base()
    B, p = API.B, API.p
    original = B.B5.sessao

    def sessao_contada(conta: str) -> dict:
        API.CTX["logins"].append(conta)
        return original(conta)

    B.B5.sessao = sessao_contada
    B.B5.PRINTS = PRINTS


def porta_aberta(porta: int) -> bool:
    with socket.socket() as s_:
        s_.settimeout(0.5)
        return s_.connect_ex(("127.0.0.1", porta)) == 0


def saude_do_build(modo: str) -> dict:
    try:
        return json.loads((DIST[modo] / "health.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def servir(modo: str) -> subprocess.Popen:
    if porta_aberta(PORTA):
        raise RuntimeError(f"a porta {PORTA} já está em uso — outra sessão?")
    pr = subprocess.Popen([sys.executable, str(REPO / "e2e" / "hml15" / "servidor_dist.py"), "--dist", str(DIST[modo]), "--porta", str(PORTA)],
                          cwd=REPO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ESTADO["servidor"] = pr
    print(f"   o build {modo} servido na :{PORTA} (pid {pr.pid})", flush=True)
    if not API.esperar(lambda: porta_aberta(PORTA), 30, 0.5):
        raise RuntimeError("o servidor do build não subiu")
    return pr


def parar_servidor() -> None:
    pr = ESTADO.pop("servidor", None)
    if pr and pr.poll() is None:
        pr.terminate()
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()
            pr.wait(timeout=10)
    if pr:
        print(f"   o servidor do build (pid {pr.pid}) encerrado: {pr.returncode}", flush=True)


# ───────────────────────── o navegador ─────────────────────────

def encaminhar(route, funcao: str, porta: int) -> None:
    """A função NOVA (ainda não publicada) → o Deno local, com o mesmo pedido (Authorization, x-schema, corpo) e a origem da página (o
    Chromium não põe o Origin nos cabeçalhos que o Playwright vê; a função confere a origem no CORS como na publicada)."""
    req = route.request
    cab = {**req.headers, "origin": BASE}
    try:
        r = route.fetch(url=f"http://127.0.0.1:{porta}/", method=req.method, headers=cab, post_data=req.post_data_buffer)
        ESTADO.setdefault("encaminhadas", {}).setdefault(funcao, []).append(r.status)
        route.fulfill(response=r)
    except Exception as e:  # noqa: BLE001
        print(f"   encaminhar {funcao}: {type(e).__name__}", flush=True)
        ESTADO.setdefault("encaminhadas", {}).setdefault(funcao, []).append(0)
        route.abort()


def manipulador(funcao: str, porta: int):
    """O handler do route com 1 parâmetro (o Playwright passa o request junto quando o handler aceita 2)."""
    def h(route) -> None:
        encaminhar(route, funcao, porta)
    return h


def vista_compra(x: dict) -> dict:
    i = API.info(x["token"])
    produtos = [i["produto"]] + ([i["troca_para"]] if i.get("troca_para") else [])
    return {"token": x["token"], "produtos": produtos, "estado": "comprada", "reconhecida": bool(i["reconhecida"]), "renova": bool(i["renova"]),
            "conta": x["conta"]}


def play_sim(acao: str, dados: dict) -> dict:
    """O window.__playSim do plugin de mentira: a compra no simulador (com o preço da "Play" do teste) e as compras do "aparelho"."""
    try:
        if acao == "comprar":
            produto = str(dados.get("produto") or "")
            if produto not in PRECOS:
                return {"resultado": "erro", "codigo": 4}
            extra: dict = {"preco": PRECOS[produto][1]}
            antigo = dados.get("tokenAntigo")
            if antigo:
                extra |= {"ligada": antigo, "modo": dados.get("modo")}
            c = API.comprar(produto, dados.get("conta"), **extra)
            ESTADO["compras"] = [x for x in ESTADO["compras"] if x["token"] != antigo] + [{"token": c["token"], "conta": dados.get("conta")}]
            ESTADO.setdefault("tokens_ui", []).append(c["token"])
            return {"resultado": "comprado", "compras": [vista_compra(ESTADO["compras"][-1])]}
        if acao == "compras":
            return {"compras": [vista_compra(x) for x in ESTADO["compras"]]}
    except Exception:  # noqa: BLE001 — a "Play" falhou: o app mostra o erro
        return {"resultado": "erro", "codigo": 6}
    return {"resultado": "erro", "codigo": 5}


def abrir(nav, nome: str, app: bool):
    """Um contexto limpo (o Caso da W5, 390 × 844) com o user-agent do WebView e as 2 pontes (app) ou o do Chrome do celular (site); as 3
    funções novas encaminhadas ao Deno local."""
    original = nav.new_context

    def com_ua(**kw):
        kw["user_agent"] = UA_WEBVIEW if app else UA_ANDROID
        return original(**kw)

    nav.new_context = com_ua
    try:
        c = B.B5.Caso(nav, BASE, ESTADO["prefixo"], nome, desktop=False)
    finally:
        nav.new_context = original
    for funcao, chave in ENCAMINHADAS.items():
        c.ctx.route(f"**/functions/v1/{funcao}*", manipulador(funcao, API.PORTAS[chave]))
    if app:
        c.pg.add_init_script("window.__PONTE_CFG = {};\n" + PONTE_H2)
        c.pg.add_init_script(PONTE_PLAY)
        c.ctx.expose_function("__playSim", play_sim)
    return c


def entrar(c, rota: str) -> None:
    sess = c.entrar(CONTA, rota)
    ESTADO["sessoes"].append(sess["access_token"])
    c.fechar_avisos()


def foto(c, nome: str) -> str:
    """O print (390 × 844) com o dado pessoal BORRADO: o resumo dos Termos (o nome e o CPF de quem vende) e a foto do profissional."""
    PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = PRINTS / f"{ESTADO['prefixo']}_{nome}.png"
    try:
        c.pg.add_style_tag(content=f"{BORRAR} {{ filter: blur(8px) !important; }}")
    except Exception:  # noqa: BLE001 — navegando: o print sai assim mesmo (e é conferido)
        pass
    c.pg.wait_for_timeout(900)
    c.pg.screenshot(path=str(caminho))
    print(f"   print: {caminho}", flush=True)
    return str(caminho)


def texto_de(c, seletor: str) -> str:
    loc = c.pg.locator(seletor)
    try:
        return loc.first.inner_text().replace("\xa0", " ") if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def chamadas_play(c) -> list[dict]:
    try:
        return c.pg.evaluate("() => (window.__play && window.__play.chamadas) || []")
    except Exception:  # noqa: BLE001
        return []


def sair_local() -> int:
    n = 0
    for tok in ESTADO["sessoes"]:
        st, _r, _h = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/logout?scope=local", {}, {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
        n += 1 if st in (200, 204) else 0
    ESTADO["sessoes"] = []
    return n + API.sair_local()


# ───────────────────────── os casos ─────────────────────────

def caso_loja(nav, mid: str) -> None:
    c = abrir(nav, "loja", app=True)
    entrar(c, "/")
    trava = '[data-trava-app="plano-app-play"]'
    ok = c.esperar(lambda: c.tem(trava) and c.tem(f'{trava} [data-play-assinar="app_treino"]'), 90)
    botao = texto_de(c, f'{trava} [data-play-assinar="app_treino"]')
    p.check(ok and "Assinar pela Google Play" in botao and "R$ 31,90/mês" in botao,
            f"[loja] L1 a trava da conta do app oferece a Google Play com o preço DELA ({botao!r})")
    p.check("29,90" not in c.texto().replace("\xa0", " "), "[loja] L1 nada do preço do banco (R$ 29,90) na tela da loja")
    medida = c.pg.evaluate("""(sel) => {
        const b = document.querySelector(sel);
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { cabe: b.scrollWidth <= b.clientWidth + 1, dentro: r.left >= 0 && r.right <= window.innerWidth, altura: Math.round(r.height) };
    }""", f'{trava} [data-play-assinar="app_treino"]')
    p.check(bool(medida) and medida["cabe"] and medida["dentro"] and medida["altura"] >= 44,
            f"[loja] L1 o botão cabe a 390 px (o rótulo quebra dentro dele; toque ≥ 44 px) — {medida}")
    foto(c, "L1_trava_assinar_pela_play")
    c.pg.locator(f'{trava} [data-play-assinar="app_treino"]').first.click()
    folha = '[data-folha-oferta-play="app_treino"]'
    ok = c.esperar(lambda: c.tem(folha), 20)
    linhas = texto_de(c, f"{folha} [data-play-linhas]")
    p.check(ok and "R$ 31,90" in texto_de(c, f"{folha} [data-play-preco]") and "R$ 31,90 por mês." in linhas
            and "Renova todo mês até você cancelar." in linhas and "Cancele quando quiser na Google Play." in linhas,
            "[loja] L2 a folha da oferta: o preço da Play por mês, renova até cancelar, cancele na Google Play")
    # a revisão, 🟡4: na folha da Play, nada do site — o Mercado Pago, o Pix, o cartão, o preço do banco, o bloqueio do dia seguinte (o
    # resumo dos Termos de staging entra com o recorte da loja)
    texto_folha = texto_de(c, folha)
    p.check(not re.search(r"Mercado Pago|\bPix\b|cart[ãa]o|29,90|49,90|bloquead", texto_folha, re.I),
            f"[loja] L2 a folha da Play sem o Mercado Pago, o Pix, o cartão, o preço do banco e o bloqueio "
            f"({'com o resumo dos Termos' if 'resumo dos Termos' in texto_folha else 'sem o resumo dos Termos'})")
    termos = c.pg.locator(f"{folha} [data-play-termos] a")
    hrefs = {termos.nth(i).get_attribute("href") for i in range(termos.count())}
    p.check(hrefs == {"/termos", "/privacidade"} and c.tem("[data-play-assinar-confirmar]"),
            f"[loja] L2 os Termos e a Privacidade na folha, antes do botão ({sorted(h or '' for h in hrefs)})")
    foto(c, "L2_folha_da_oferta")
    c.pg.locator("[data-play-assinar-confirmar]").first.click()
    ok = c.esperar(lambda: bool(ESTADO["compras"]) and not c.tem(trava) and not c.tem(folha), 90)
    tok = ESTADO["compras"][-1]["token"] if ESTADO["compras"] else ""
    a = API.assinatura(tok) if tok else {}
    cob = API.cobrancas_play(mid)
    compras = [x for x in chamadas_play(c) if x.get("metodo") == "comprar"]
    p.check(ok and len(compras) == 1 and compras[0].get("produto") == "app_treino" and compras[0].get("troca") is False,
            f"[loja] L3 Assinar → a folha da Play (o plugin) → a trava sai ({c.caminho()})")
    p.check(a.get("estado") == "ativa" and a.get("reconhecida") is True and len(cob) == 1 and float(cob[0]["valor"]) == 31.9,
            f"[loja] L3 o banco: a assinatura ativa e reconhecida + 1 cobrança google_play de R$ 31,90 (o preço da Play) — {a.get('estado')}, {len(cob)}")
    foto(c, "L3_assinou_app_liberado")

    c.ir("/perfil/meu-plano")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem('[data-assinatura-play="ativa"]'), 45)
    titulo, detalhe = texto_de(c, "[data-assinatura-play-titulo]"), texto_de(c, "[data-assinatura-play-detalhe]")
    p.check(ok and "Assinatura pela Google Play" in titulo and "renova sozinha" in detalhe and re.search(r"até \d{2}/\d{2}", detalhe) is not None,
            f"[loja] L4 Meu plano: \"Assinatura pela Google Play · até DD/MM · renova sozinha\" ({detalhe!r})")
    p.check("R$ 31,90/mês pela Google Play" in texto_de(c, "[data-meu-plano-preco-play]") and not c.tem("[data-meu-plano-pagar]")
            and c.tem("[data-meu-plano-trocar-play]") and not c.tem("[data-meu-plano-trocar]"),
            "[loja] L4 o preço da Play, sem Pagar; a troca é a da Play")
    precos = [t.replace("\xa0", " ") for t in c.pg.locator("[data-meu-plano-trocar-play] [data-preco-plano]").all_inner_texts()]
    p.check(sorted(precos) == ["R$ 31,90/mês", "R$ 51,90/mês"], f"[loja] L4 os 2 planos com o preço da Play ({precos})")
    foto(c, "L4_meu_plano_assinatura_play")
    c.pg.locator('[data-assinatura-play] [data-play-gerenciar="app"]').first.click()
    ok = c.esperar(lambda: any(x.get("metodo") == "gerenciar" for x in chamadas_play(c)), 10)
    ger = [x for x in chamadas_play(c) if x.get("metodo") == "gerenciar"]
    p.check(ok and ger[-1].get("produto") == "app_treino", "[loja] L4 \"Gerenciar na Google Play\" abre a Central de assinaturas pelo plugin (o produto)")

    c.pg.locator('[data-meu-plano-trocar-play] [data-plano-app="app_treino_alimentacao"]').first.click()
    folha2 = '[data-folha-oferta-play="app_treino_alimentacao"]'
    ok = c.esperar(lambda: c.tem(folha2), 20)
    p.check(ok and "R$ 51,90" in texto_de(c, f"{folha2} [data-play-preco]") and c.tem(f'{folha2} [data-play-troca="na_hora"]'),
            "[loja] L5 a troca para o completo: a folha com o preço da Play e o aviso da troca NA HORA")
    foto(c, "L5_troca_na_hora")
    c.pg.locator("[data-play-assinar-confirmar]").first.click()

    def trocou() -> bool:
        return len(ESTADO["compras"]) == 1 and ESTADO["compras"][0]["token"] != tok and not c.tem(folha2) and \
            API.matricula(CONTA)["plano"] == "app_treino_alimentacao"

    ok = c.esperar(trocou, 90, 1.5)
    compras = [x for x in chamadas_play(c) if x.get("metodo") == "comprar"]
    p.check(ok and compras[-1].get("produto") == "app_treino_alimentacao" and compras[-1].get("troca") is True and compras[-1].get("modo") == "na_hora",
            "[loja] L5 Trocar → o plugin com a compra anterior e o modo na_hora")
    p.check(API.assinatura(tok).get("estado") == "substituida" and API.matricula(CONTA)["plano"] == "app_treino_alimentacao",
            "[loja] L5 o banco: a anterior substituída e o plano já é o completo")
    foto(c, "L5b_trocou_para_o_completo")

    c.ir("/perfil/pagamentos")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem('[data-assinatura-play="ativa"]'), 45)
    p.check(ok and not c.tem("[data-pagar-mensalidade]"), "[loja] L6 Pagamentos: o cartão da Play, sem Pagar")
    foto(c, "L6_pagamentos_loja")

    c.ir("/perfil?excluir=1")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem("[data-sheet-excluir]") and c.tem("[data-excluir-play]"), 45)
    p.check(ok and "cancelada antes de excluir" in texto_de(c, "[data-excluir-play]"),
            "[loja] L7 Excluir minha conta: o aviso de que a assinatura da Play é cancelada antes (o sheet só abre)")
    foto(c, "L7_excluir_aviso_play")
    c.pg.keyboard.press("Escape")
    c.pg.wait_for_timeout(600)

    c.ir("/perfil")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem("[data-perfil-codigo-campo]"), 30)
    if ok:
        c.pg.locator("[data-perfil-codigo-campo]").first.fill(PROF)
        c.pg.locator("[data-perfil-codigo-enviar]").first.click()
    ok = ok and c.esperar(lambda: c.tem("[data-vinculo-cancelar]") and "assinatura da Google Play é cancelada" in c.texto(), 45)
    p.check(ok, "[loja] L8 o código de um profissional: o popup avisa que a assinatura da Play é cancelada no vínculo")
    foto(c, "L8_vinculo_aviso_play")
    if c.tem("[data-vinculo-cancelar]"):
        c.pg.locator("[data-vinculo-cancelar]").first.click()
    c.pg.wait_for_timeout(800)
    m = API.matricula(CONTA)
    p.check(m["id"] == mid and m["ativo"] is True, "[loja] L8 Cancelar: nada vinculado (a matrícula do app segue ativa)")
    c.fim()


def caso_site(nav, mid: str) -> None:
    c0 = API.comprar("app_treino", mid, preco=PRECOS["app_treino"][1])
    st, r = API.registrar(CONTA, c0["token"], "app_treino")
    p.check(st == 200 and r.get("estado") == "ativa", f"[site] a assinatura da Play viva (registrada pela play-compras local) — {st}")
    c = abrir(nav, "site", app=False)
    entrar(c, "/perfil/meu-plano")
    ok = c.esperar(lambda: c.tem('[data-assinatura-play="ativa"]'), 60)
    link = c.pg.locator('[data-assinatura-play] [data-play-gerenciar="link"]')
    href = link.first.get_attribute("href") if link.count() else ""
    p.check(ok and "Assinatura pela Google Play" in texto_de(c, "[data-assinatura-play-titulo]")
            and (href or "").startswith("https://play.google.com/store/account/subscriptions?sku=app_treino&package=com.bertoldo.physiqcalc"),
            "[site] S1 Meu plano: o cartão da Play + o link \"Gerenciar na Google Play\" (a Central de assinaturas do produto)")
    p.check(not c.tem("[data-meu-plano-pagar]") and not c.tem("[data-meu-plano-trocar]") and not c.tem("[data-meu-plano-trocar-play]")
            and not c.tem("[data-play-assinar]"), "[site] S1 sem Pagar, sem trocar e sem Assinar (o site não vende pela Play)")
    foto(c, "S1_site_meu_plano")
    c.ir("/perfil/pagamentos")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem('[data-assinatura-play="ativa"]'), 45)
    p.check(ok and not c.tem("[data-pagar-mensalidade]"), "[site] S2 Pagamentos: o cartão da Play, sem Pagar")
    foto(c, "S2_site_pagamentos")
    API.mudar(c0["token"], "suspender")
    st = API.empurrar(tipo="assinatura", notificacao=5, token=c0["token"])
    # o resumo do aluno fica guardado no aparelho por 10 min (useResumoFinanceiro, src/financeiro/api.ts): a rodada não espera os 10 min —
    # apaga o guardado, como depois deles (o app lê o banco de novo)
    c.pg.evaluate("() => localStorage.removeItem('physiq_financeiro_resumo')")
    c.ir("/")
    c.fechar_avisos()
    trava = '[data-trava-app="play-travada"]'
    ok = c.esperar(lambda: c.tem(trava), 60)
    p.check(st == 204 and ok and "Assinatura suspensa" in c.texto() and c.tem(f'{trava} [data-play-gerenciar="link"]')
            and "Atualizar na Google Play" in texto_de(c, f'{trava} [data-play-gerenciar="link"]'),
            f"[site] S3 a Play suspensa (o aviso ON_HOLD → {st}) → a trava \"Assinatura suspensa\" com \"Atualizar na Google Play\"")
    foto(c, "S3_site_play_suspensa")
    c.fim()


# ───────────────────────── a rodada ─────────────────────────

def rodar(modo: str, canal: str) -> int:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    carregar()
    ESTADO["prefixo"] = f"local_{modo}"
    s = saude_do_build(modo)
    esperado = "play" if modo == "loja" else "site"
    if s.get("distribuicao") != esperado or s.get("schema") != "staging":
        raise SystemExit(f"o build em {DIST[modo]} não é o {esperado} do staging (health.json: {s.get('distribuicao')}/{s.get('schema')}) — construa antes")
    p.check(True, f"o build servido é o {'da loja' if modo == 'loja' else 'do site'} do staging (health.json: {s.get('distribuicao')}/{s.get('schema')})")
    if API.ESTADO_ARQ.exists():
        raise SystemExit(f"há uma rodada anterior sem desfazer ({API.ESTADO_ARQ}): rode --limpar antes")
    est = API.foto()
    mid = est["matriculas"][CONTA]["id"]
    nav = None
    try:
        API.subir(f"e2e/playw6/telas.py --{modo}")
        API.sim("/_zerar")
        servir(modo)
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, headless=True, args=ARGS_NAVEGADOR) if canal else pw.chromium.launch(headless=True, args=ARGS_NAVEGADOR)
            try:
                if modo == "loja":
                    caso_loja(nav, mid)
                else:
                    caso_site(nav, mid)
            except Exception as e:  # noqa: BLE001 — a rodada cai, mas o desfazer roda; só o tipo do erro sai
                p.check(False, f"a rodada parou: {type(e).__name__}")
                caso = B.B5.ESTADO.get("caso") if hasattr(B.B5, "ESTADO") else None
                if caso is not None:
                    caso.diagnostico()
            finally:
                nav.close()
        enc = ESTADO.get("encaminhadas", {})
        resumo = {f: {str(st): sts.count(st) for st in sorted(set(sts))} for f, sts in enc.items()}
        print(f"   encaminhadas ao Deno local (status: quantas): {resumo or 'nenhuma'}", flush=True)
        p.check(bool(enc.get("pagamentos-aluno")) and (modo == "site" or bool(enc.get("play-compras")))
                and all(st and st < 500 for sts in enc.values() for st in sts),
                "a tela falou com as funções novas no Deno local, sem falha de rede nem 5xx")
    finally:
        parar_servidor()
        API.descer()
        try:
            API.desfazer(est)
        except Exception as e:  # noqa: BLE001
            p.check(False, f"o desfazer falhou ({type(e).__name__}) — rode --limpar")
    texto = API.log_desde(API.CTX.get("log_inicio", 0))
    valores = [*API.CTX["tokens"], *API.CTX["pedidos"], B.EMAIL[CONTA]]
    achados = sum(texto.count(v) for v in valores if v)
    p.check(achados == 0, f"o log do Deno da rodada sem tokens, pedidos e o e-mail de teste: {achados} ocorrência(s)")
    logins = list(API.CTX["logins"])
    saidas = sair_local()
    print(f"\n   logins da rodada: {len(logins)} ({', '.join(sorted(logins)) or 'nenhum'}) · logout local: {saidas}", flush=True)
    return p.fim()


def rodar_seco() -> int:
    API.carregar_placar()
    pp = API.p
    r = subprocess.run(["node", "--check", str(AQUI / "ponte_play.js")], capture_output=True, text=True)
    pp.check(r.returncode == 0 and '"PlayBilling"' in PONTE_PLAY and "__playSim" in PONTE_PLAY, "seco · a ponte da Play (node --check) com o PlayBilling")
    src = "\n".join(f.read_text(encoding="utf-8") for f in (REPO / "src").rglob("*.tsx") if ".test." not in f.name)
    faltam = [s for s in SELETORES if s not in src]
    pp.check(not faltam, f"seco · os {len(SELETORES)} data-* da rodada existem no src/ (faltam: {faltam or 'nenhum'})")
    for modo, esperado in (("loja", "play"), ("site", "site")):
        s = saude_do_build(modo)
        pp.check(s.get("distribuicao") == esperado and s.get("schema") == "staging",
                 f"seco · o build {modo} em {DIST[modo]}: {s.get('distribuicao')}/{s.get('schema')} (esperado {esperado}/staging)")
    return pp.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--loja", action="store_true")
    g.add_argument("--site", action="store_true")
    g.add_argument("--seco", action="store_true")
    g.add_argument("--limpar", action="store_true")
    ap.add_argument("--canal", default="msedge")
    a = ap.parse_args()
    if a.seco:
        return rodar_seco()
    if a.limpar:
        API.carregar_base()
        if not API.ESTADO_ARQ.exists():
            print("nada a desfazer (sem o arquivo de estado da rodada)")
            return 0
        ok = API.desfazer(json.loads(API.ESTADO_ARQ.read_text(encoding="utf-8")))
        API.p.fim()
        return 0 if ok else 1
    return rodar("loja" if a.loja else "site", a.canal)


if __name__ == "__main__":
    raise SystemExit(main())
