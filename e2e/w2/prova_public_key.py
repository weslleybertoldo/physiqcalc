#!/usr/bin/env python3
"""Physiq W2 — Task 1: a PROVA da public_key (antes de qualquer código do app). O vendedor de TESTE do Mercado Pago autoriza a aplicação
PhysiqCalc pelo redirect que ela JÁ tem cadastrado (https://www.mercadopago.com — GET /applications/<id>, 11/10). O code é lido do PEDIDO
que o navegador faz ao redirect — o servidor do MP responde 302 para o .com.br e APAGA a query (medido em 11/10; revisão I6) —, nunca da
URL de chegada; a escolha de país é feita pelo script (o seletor "Seleccione el país" → "Brasil" → "Confirmar", medido em 11/10; ou
--auth-br abre direto o auth.mercadopago.com.br). Troca no POST /oauth/token — 1ª autorização com test_token "true" (o que o staging usa),
2ª com "false" (o formato da produção) —, renova a 1ª 1 vez (o refresh gira?) e, depois da 2ª, confere se o access da 1ª ainda vale (a 2ª
autorização derruba a 1ª? — MENOR 29). Imprime e grava SÓ as chaves das respostas e booleanos: nunca token, code, chave, id, usuário ou
senha (tudo o que é sensível passa pelo limpo() antes de qualquer linha).
Medido em 11/10 (~19:40): o login do Mercado Livre recusa o Edge SEM tela pelo user agent "Headless…" ("Hubo un error accediendo a esta
pagina") — sem tela, o script manda o user agent normal do MESMO Edge; --com-tela abre a janela (o notebook tem tela).
O caminho medido em 11/10 (19:47–20:06): a escolha de país → auth.mercadopago.com.br/authorization → www.mercadopago.com.br/login/
identification (o APELIDO do vendedor de teste serve) → login/challenges ("Senha" ou "E-mail" — o script escolhe "Senha"; o item é coberto
por um botão) → password/validation → auth.mercadopago.com.br/authorization, que RECUSOU com "O aplicativo não está pronto para se conectar
a Mercado Pago" — a MESMA tela sem PKCE, sem platform_id, com um redirect não cadastrado e até com um client_id inventado (o erro genérico da
autorização; a aplicação tem use_pkce false). Nenhum código de verificação nem captcha. Essa recusa para o script na hora
("aplicacao_nao_pronta") = o risco (3) do plano → o plano B do I6 no FIM (o integrador de teste + a aplicação de TESTE dele, W2-a passo 8).
Os tokens do vendedor de teste (os pares das 2 autorizações) vão SÓ para ~/.physiq-mp-vendedor-teste-oauth.json (600 desde o 1º byte):
quem lê é o extra --pagamento (1 Pix de R$ 1 com o COMPRADOR de teste como pagador, cancelado na hora — "o token do vendedor de teste cria
pagamento no sandbox?", o que decide como rodar os E2E de pagamento do MP depois de o sandbox recusar a credencial TEST- da conta real).
Precisa: ~/.physiq-mp-oauth.json e ~/.physiq-mp-vendedor-teste.json (600 — scripts/segredos/mp_conta.py oauth local / usuarios-teste criar);
o --pagamento também ~/.physiq-mp-comprador-teste.json.
--client staging (plano B do I6): o client da aplicação de TESTE do integrador, ~/.physiq-mp-oauth-staging.json (mp_conta.py oauth local
--staging, ou o e2e/w2/painel_mp_teste.py direto do navegador). --redirect padrao|staging|public|<https://…>: o redirect da autorização e
da troca (padrão: "padrao" = https://www.mercadopago.com com o client real; "staging" com o client staging). Lido no código público do
painel em 11/10: o campo "URLs de redirecionamento" RECUSA domínio do Mercado Pago/Livre (mercadopago.com está na lista) e trata o
https://www.mercadopago.com como o valor PADRÃO (vazio) — é o que a criação grava quando ninguém configura. Com uma URL de verdade
cadastrada, a prova usa a do staging: o code é lido do PEDIDO e a rota devolve 200 (o navegador não chega ao nosso servidor).
Saída: ~/projetos/physiqcalc-scratch/w2/prova-public-key.json · prints (do MP, campos mascarados) em ~/projetos/physiqcalc-scratch/prints/w2/prova/.
Uso: python3 e2e/w2/prova_public_key.py [--canal msedge] [--sem-pkce] [--com-tela] [--auth-br] [--client real|staging]
     [--redirect padrao|staging|public|URL] [--pagamento | --so-pagamento]
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from playwright.sync_api import sync_playwright

CASA = Path.home()
SAIDA = CASA / "projetos/physiqcalc-scratch/w2/prova-public-key.json"
PRINTS = CASA / "projetos/physiqcalc-scratch/prints/w2/prova"
ARQ_TOKENS = ".physiq-mp-vendedor-teste-oauth.json"           # os tokens do vendedor de TESTE (600) — só o --pagamento lê
ARQ_CLIENTE = {"real": ".physiq-mp-oauth.json", "staging": ".physiq-mp-oauth-staging.json"}  # staging = a aplicação de TESTE (plano B)
REDIRECT = "https://www.mercadopago.com"                    # o ÚNICO redirect cadastrado hoje (fato (a)) — é o PADRÃO do painel (vazio)
REDIRECTS = {"padrao": REDIRECT,                            # os de verdade: os da W2 (mp-conta-regras.ts redirectDoSchema)
             "staging": "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging",
             "public": "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/public"}
AUTH = "https://auth.mercadopago.com/authorization"         # o da doc — o mesmo do app (MP_AUTH)
AUTH_BR = "https://auth.mercadopago.com.br/authorization"   # medido 11/10: vai direto ao login do MLB (NÃO documentado)
API = "https://api.mercadopago.com"
TOKEN = f"{API}/oauth/token"
UA_API = "physiq-unificado/1.0 (e2e-w2-prova)"
SEGURAR = re.compile(r"^https://www\.mercadopago\.com/?(\?.*)?$")   # a rota do redirect padrão (o .com.br NÃO casa) = segurar_rx(REDIRECT)
BRASIL = re.compile(r"^\s*brasil\s*$", re.I)
CONFIRMAR = re.compile(r"^\s*confirmar\s*$", re.I)
ENVIAR = re.compile(r"^\s*(continuar|entrar|iniciar sess[aã]o|confirmar|validar|verificar)\s*$", re.I)
CONSENTIR = re.compile(r"^\s*(permitir|autorizar|aceitar|continuar|confirmar|allow)\s*$", re.I)
BLOQUEIO = re.compile(r"hubo un error accediendo|houve um erro ao acessar|ocorreu um erro ao acessar", re.I)
APP_NAO_PRONTA = re.compile(r"aplicativo n[aã]o est[aá] pronto para se conectar", re.I)  # a recusa da autorização (11/10)
METODO_SENHA = re.compile(r"^\s*voc[eê] vai digitar sua senha\.?\s*$", re.I)
NAO_SOU_ROBO = re.compile(r"n[aã]o sou um rob[oô]|no soy un robot|i'?m not a robot", re.I)
CAMPOS_SENSIVEIS = {"access_token", "refresh_token", "public_key", "user_id", "id", "nickname", "email", "password", "client_id",
                    "client_secret", "codigo_verificacao"}
GUARDAR_DESDE = 6  # o limpo() troca TODA ocorrência; valor curto apagaria pedaços da tela (o código de verificação tem 6)
_SENSIVEIS: set[str] = set()


# ───────────────────────── nada sensível na tela, no JSON ou no print ─────────────────────────


def guardar(valor: object) -> str | None:
    if valor is None or isinstance(valor, bool):
        return None
    v = str(valor)
    if len(v) >= GUARDAR_DESDE:
        _SENSIVEIS.add(v)
    return v


def guardar_campos(obj: object) -> None:
    """Guarda os valores das chaves sensíveis (em qualquer nível): token, refresh, chave pública, ids, apelido, e-mail, senha, client."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (dict, list)):
                guardar_campos(v)
            elif k in CAMPOS_SENSIVEIS:
                guardar(v)
    elif isinstance(obj, list):
        for v in obj:
            guardar_campos(v)


def limpo(texto: object) -> str:
    saida = "" if texto is None else str(texto)
    for s in sorted(_SENSIVEIS, key=len, reverse=True):
        saida = saida.replace(s, "‹oculto›")
    return saida


def dizer(*partes: object) -> None:
    print(limpo(" ".join(str(p) for p in partes)), flush=True)


def ler_600(nome: str) -> dict:
    p = CASA / nome
    assert p.exists() and (p.stat().st_mode & 0o077) == 0, f"{nome}: falta ou não está 600"
    dados = json.loads(p.read_text(encoding="utf-8"))
    guardar_campos(dados)
    return dados


def gravar_600(caminho: Path, texto: str) -> None:
    """600 desde o 1º byte (arquivo novo ao lado + rename) — o molde do gravar_arquivo do scripts/segredos/servidor.py."""
    novo = caminho.with_name(caminho.name + ".novo")
    fd = os.open(novo, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as arq:
        arq.write(texto)
    os.replace(novo, caminho)


def escrever_saida(saida: dict) -> None:
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(limpo(json.dumps(saida, ensure_ascii=False, indent=1)), encoding="utf-8")


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


# ───────────────────────── a API do MP (urllib; só o formato da resposta sai) ─────────────────────────


def pedir(metodo: str, url: str, corpo: dict | None = None, token: str | None = None, extra: dict | None = None) -> tuple[int, dict]:
    cab = {"Accept": "application/json", "User-Agent": UA_API} | ({"Content-Type": "application/json"} if corpo is not None else {})
    if token:
        cab["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, method=metodo, headers=cab | (extra or {}),
                                 data=None if corpo is None else json.dumps(corpo).encode("utf-8"))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            st, txt = r.status, r.read()
    except urllib.error.HTTPError as e:
        try:
            st, txt = e.code, e.read()
        finally:
            e.close()
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": "sem_resposta", "message": type(e).__name__}
    try:
        dados = json.loads(txt or b"{}")
    except ValueError:
        dados = {}
    dados = dados if isinstance(dados, dict) else {"_lista": dados}
    guardar_campos(dados)
    return st, dados


def post_token(corpo: dict) -> tuple[int, dict]:
    return pedir("POST", TOKEN, corpo)


def status_do_eu(access: str) -> int:
    """GET /users/me com um access → só o status (200 = ainda vale)."""
    return pedir("GET", f"{API}/users/me", token=access)[0]


def resumo(st: int, r: dict, vendedor: dict) -> dict:
    """Só o formato: as chaves, os prefixos e booleanos (o erro e a mensagem passam pelo limpo())."""
    pre = lambda v: v.split("-", 1)[0] if isinstance(v, str) and "-" in v else None  # noqa: E731
    return {"status": st, "chaves": sorted(r), "erro": limpo(r["error"])[:60] if isinstance(r.get("error"), str) else None,
            "mensagem": limpo(r["message"])[:160] if isinstance(r.get("message"), str) else None,
            "tem_public_key": isinstance(r.get("public_key"), str) and len(r["public_key"]) > 8, "prefixo_public_key": pre(r.get("public_key")),
            "prefixo_access": pre(r.get("access_token")), "tem_refresh": isinstance(r.get("refresh_token"), str),
            "live_mode": r.get("live_mode") if isinstance(r.get("live_mode"), bool) else None, "expires_in": r.get("expires_in"),
            "offline_access": "offline_access" in str(r.get("scope", "")).split(), "user_id_e_o_vendedor": str(r.get("user_id")) == str(vendedor["id"])}


def par_de_tokens(r: dict) -> dict:
    return {k: r.get(k) for k in ("access_token", "refresh_token", "public_key", "user_id", "live_mode", "expires_in", "scope", "token_type")} | {
        "obtido_em": time.strftime("%Y-%m-%d %H:%M:%S")}


def menciona_pkce(r: dict) -> bool:
    return bool(re.search(r"verifier|pkce|code_challenge", json.dumps(r, ensure_ascii=False), re.I))


# ───────────────────────── o navegador ─────────────────────────


def chegada(url: str, redirect: str = REDIRECT) -> dict | None:
    """O PEDIDO ao redirect com o code (ou o error): https, host EXATO e caminho EXATO do redirect (a barra final não conta) — nunca por
    prefixo de texto (o https://www.mercadopago.com.br/ também começa com https://www.mercadopago.com)."""
    u, r = urllib.parse.urlparse(url), urllib.parse.urlparse(redirect)
    if u.scheme != "https" or u.hostname != r.hostname or (u.path or "/").rstrip("/") != (r.path or "/").rstrip("/"):
        return None
    q = urllib.parse.parse_qs(u.query)
    return q if ("code" in q or "error" in q) else None


def segurar_rx(redirect: str) -> re.Pattern:
    """A rota que segura o redirect (devolve 200 sem deixar o navegador seguir): o endereço exato, com ou sem a barra, com ou sem busca."""
    return re.compile("^" + re.escape(redirect.rstrip("/")) + r"/?(\?.*)?$")


def redirect_de(nome: str | None, cliente: str) -> str:
    """--redirect: um dos nomes (padrao, staging, public) ou um https://…; sem ele, o padrão do client (staging → o do staging)."""
    nome = nome or ("staging" if cliente == "staging" else "padrao")
    if nome in REDIRECTS:
        return REDIRECTS[nome]
    u = urllib.parse.urlparse(nome)
    if u.scheme != "https" or not u.hostname:
        raise SystemExit(f"--redirect: use padrao, staging, public ou um endereço https:// (veio {nome[:60]!r})")
    return nome


def onde(url: str) -> str:
    """Host e caminho, sem a busca; pedaço longo do caminho (id de transação do login) vira ‹…›."""
    u = urllib.parse.urlparse(url)
    caminho = "/".join(s if len(s) <= 20 else "‹…›" for s in u.path.split("/"))
    return limpo(f"{u.scheme}://{u.hostname or ''}{caminho}")


def abrir_navegador(p, canal: str, com_tela: bool):
    """Edge; sem tela, com o user agent normal do mesmo Edge (o login do Mercado Livre recusa o "Headless…" — medido em 11/10)."""
    nav = p.chromium.launch(channel=canal, headless=not com_tela, args=["--disable-blink-features=AutomationControlled"])
    v = nav.version
    ua = None if com_tela else (f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v.split('.')[0]}.0.0.0 "
                                f"Safari/537.36 Edg/{v}")
    return nav, nav.new_context(locale="pt-BR", user_agent=ua, viewport={"width": 1280, "height": 800})


def visivel(loc) -> bool:
    try:
        return loc.count() > 0 and loc.first.is_visible()
    except Exception:  # noqa: BLE001 — a página trocou no meio: não está visível agora
        return False


def foto(pg, nome: str, vendedor: dict) -> None:
    """Print da página com TODO campo mascarado e o apelido/e-mail do vendedor coberto (o MP mostra "Olá, <usuário>")."""
    PRINTS.mkdir(parents=True, exist_ok=True)
    mascaras = [pg.locator("input")] + [pg.get_by_text(str(v), exact=False) for v in (vendedor.get("nickname"), vendedor.get("email")) if v]
    try:
        pg.screenshot(path=str(PRINTS / f"{nome}.png"), mask=mascaras, full_page=True, timeout=20_000)
    except Exception as e:  # noqa: BLE001
        dizer("   (o print falhou:", type(e).__name__, ")")


def estrutura(pg) -> list[str]:
    """O que a tela tem (campos pelos atributos, botões e textos pelo limpo()) — para decidir sem ver valor."""
    linhas: list[str] = []
    try:
        for el in pg.locator("input:visible").all()[:12]:
            at = {k: el.get_attribute(k) for k in ("type", "name", "id", "autocomplete", "inputmode", "maxlength", "aria-label")}
            linhas.append("campo " + json.dumps({k: limpo(v)[:40] for k, v in at.items() if v}, ensure_ascii=False))
        for el in pg.locator("button:visible, [role=button]:visible, a:visible").all()[:25]:
            t = " ".join((el.inner_text() or "").split())
            if t:
                linhas.append("clicável " + repr(limpo(t)[:50]))
        for el in pg.locator("h1:visible, h2:visible, [role=alert]:visible, p:visible, label:visible").all()[:14]:
            t = " ".join((el.inner_text() or "").split())
            if t:
                linhas.append("texto " + repr(limpo(t)[:100]))
        linhas += ["frame " + onde(f.url) for f in pg.frames[1:]][:6]
    except Exception as e:  # noqa: BLE001
        linhas.append(f"(estrutura falhou: {type(e).__name__})")
    return linhas


def desafio_visivel(pg) -> bool:
    """Captcha de verdade (o desafio): o iframe "bframe" do reCAPTCHA / hCaptcha com tamanho, ou o "Não sou um robô" na tela. O selo do
    reCAPTCHA invisível (anchor, canto da tela) não conta."""
    for fr in pg.locator("iframe[src*='recaptcha'][src*='bframe'], iframe[src*='hcaptcha']").all():
        try:
            caixa = fr.bounding_box()
            if fr.is_visible() and caixa and caixa["width"] > 80 and caixa["height"] > 80:
                return True
        except Exception:  # noqa: BLE001
            continue
    return visivel(pg.get_by_text(NAO_SOU_ROBO))


def enviar(pg) -> None:
    b = pg.locator("button[type=submit]:visible")
    if not visivel(b):
        b = pg.get_by_role("button", name=ENVIAR)
    if visivel(b):
        b.first.click(timeout=10_000)
    else:
        pg.keyboard.press("Enter")


def autorizar(pg, cliente: dict, vendedor: dict, pkce: bool, rotulo: str, auth: str = AUTH,
              registro: dict | None = None, redirect: str = REDIRECT) -> tuple[str | None, str | None]:
    """→ (code, verifier) da prova: monta a URL com o redirect (o que a aplicação tem cadastrado) e segue até o code."""
    estado, verificador = guardar(b64u(secrets.token_bytes(32))), guardar(b64u(secrets.token_bytes(48)))
    q = {"client_id": cliente["client_id"], "response_type": "code", "platform_id": "mp", "state": estado, "redirect_uri": redirect}
    if pkce:
        q |= {"code_challenge": guardar(b64u(hashlib.sha256(verificador.encode()).digest())), "code_challenge_method": "S256"}
    code = seguir_ate_o_code(pg, f"{auth}?{urllib.parse.urlencode(q)}", estado, vendedor, rotulo, registro, redirect)
    return code, (verificador if pkce and code else None)


def seguir_ate_o_code(pg, url_de_autorizacao: str, estado: str, vendedor: dict, rotulo: str, registro: dict | None = None,
                      redirect: str = REDIRECT) -> str | None:
    """Abre a URL de autorização (a da prova ou a que o prof_mp_conectar devolveu — o e2e/w2/api.py --casos oauth_real reusa), passa pela
    escolha de país, entra como o vendedor de teste, autoriza e devolve o code LIDO DO PEDIDO ao redirect (o evento request do CONTEXTO + a
    rota que devolve 200). Cada passo vai para registro["passos"] (tela sem a busca + ação) e o motivo de uma parada, para
    registro["motivo"]. Passo desconhecido, bloqueio, captcha, usuário/senha/código pedidos 2× → print, estrutura da tela e None (a prova
    vai para o FIM). O código de verificação: o do cofre (o PAINEL mostra — W2-a, passo 7); sem ele, UMA tentativa com os 6 últimos
    dígitos do id (regra de outra página do MP, não documentada no Brasil)."""
    reg = registro if registro is not None else {}
    passos = reg.setdefault("passos", [])
    ctx = pg.context
    capturado: dict = {}
    rota_rx = segurar_rx(redirect)

    def ao_pedir(req) -> None:
        q = chegada(req.url, redirect)
        if q is not None:
            for v in q.get("code", []) + q.get("state", []):
                guardar(v)
            capturado.setdefault("q", q)

    def segurar(rota) -> None:
        ao_pedir(rota.request)
        rota.fulfill(status=200, content_type="text/plain; charset=utf-8", body="ok — pode fechar")

    feito = {"usuario": 0, "metodo": 0, "senha": 0, "codigo": 0, "consentimento": 0, "pais": 0}
    estado_tela = {"ultima": None, "desde": time.time(), "n": 0, "cookies": False}

    def passo(acao: str) -> None:
        passos.append({"autorizacao": rotulo, "tela": onde(pg.url), "acao": limpo(acao)})
        dizer(f"  [{rotulo}] {onde(pg.url)} → {acao}")
        estado_tela["desde"] = time.time()

    ctx.on("request", ao_pedir)
    ctx.route(rota_rx, segurar)
    motivo = "tempo_esgotado"
    try:
        pg.goto(url_de_autorizacao, wait_until="domcontentloaded", timeout=60_000)
        fim = time.time() + 180
        while time.time() < fim:
            if "q" in capturado:
                q = capturado["q"]
                if q.get("state", [None])[0] != estado:
                    passo("o state voltou diferente — PARAR")
                    reg["motivo"] = "state_diferente"
                    return None
                if "error" in q:
                    passo("o MP devolveu error na volta: " + (q["error"][0] or "")[:40])
                    reg["motivo"] = "error_na_volta"
                    return None
                passo("o code chegou no PEDIDO ao redirect")
                reg["motivo"] = None
                return q["code"][0]
            agora = onde(pg.url)
            if agora != estado_tela["ultima"]:
                estado_tela["n"] += 1
                estado_tela["ultima"] = agora
                passo("tela nova")
                pg.wait_for_timeout(1_500)
                foto(pg, f"{rotulo}-{estado_tela['n']:02d}", vendedor)
                continue
            if visivel(pg.get_by_text(BLOQUEIO)):
                passo("a página do MP recusou o navegador")
                motivo = "bloqueio_da_pagina"
                break
            if visivel(pg.get_by_text(APP_NAO_PRONTA)):
                passo("o MP recusou a autorização: \"O aplicativo não está pronto para se conectar a Mercado Pago\"")
                motivo = "aplicacao_nao_pronta"
                break
            if not estado_tela["cookies"] and visivel(pg.get_by_role("button", name=re.compile(r"aceitar cookies", re.I))):
                pg.get_by_role("button", name=re.compile(r"aceitar cookies", re.I)).first.click()
                estado_tela["cookies"] = True
                continue
            gatilho = pg.locator("#dropdown-crossite-trigger")
            if visivel(gatilho):
                if feito["pais"] >= 2:
                    passo("a escolha de país não passou")
                    motivo = "pais_nao_passou"
                    break
                gatilho.first.click()
                pg.wait_for_timeout(800)
                pg.get_by_role("option", name=BRASIL).first.click()
                pg.wait_for_timeout(500)
                pg.locator("button", has_text=CONFIRMAR).first.click()
                feito["pais"] += 1
                passo("país: Brasil")
                pg.wait_for_timeout(3_000)
                continue
            if desafio_visivel(pg):
                passo("captcha (o desafio apareceu)")
                motivo = "captcha"
                break
            metodo_senha = pg.get_by_text(METODO_SENHA)  # medido em 11/10: login/challenges — "Senha" ou "E-mail" (código por e-mail)
            if visivel(metodo_senha):
                if feito["metodo"] >= 2 or feito["senha"] >= 1:
                    passo("a escolha do método voltou depois da senha")
                    motivo = "metodo_de_novo"
                    break
                sobre = pg.locator("button[aria-labelledby*='password']")  # o item da lista é coberto por este botão (medido)
                if visivel(sobre):
                    sobre.first.click()
                else:
                    metodo_senha.first.click(force=True)
                feito["metodo"] += 1
                passo("método de verificação: Senha")
                pg.wait_for_timeout(3_000)
                continue
            senha = pg.locator("input[type=password]:visible")
            if visivel(senha) and not senha.first.input_value():
                if feito["senha"] >= 1:
                    passo("a senha foi pedida de novo")
                    motivo = "senha_pedida_de_novo"
                    break
                senha.first.click()
                senha.first.press_sequentially(str(vendedor["password"]), delay=45)
                feito["senha"] += 1
                passo("senha digitada")
                enviar(pg)
                pg.wait_for_timeout(4_000)
                continue
            codigo = pg.locator("input[autocomplete=one-time-code]:visible, input[name*=code]:visible, input[id*=code]:visible, "
                                "input[maxlength='1']:visible")
            if "identification" not in agora and visivel(codigo) and not codigo.first.input_value():
                if feito["codigo"] >= 1:
                    passo("o código de verificação foi pedido de novo (recusado)")
                    motivo = "codigo_recusado"
                    break
                valor = guardar(str(vendedor.get("codigo_verificacao") or str(vendedor["id"])[-6:])) or ""
                caixas = codigo.all()
                if len(caixas) >= len(valor) > 1:  # uma caixa por dígito
                    for caixa, digito in zip(caixas, valor):
                        caixa.fill(digito)
                else:
                    codigo.first.press_sequentially(valor, delay=60)
                feito["codigo"] += 1
                passo("código de verificação: " + ("o do cofre (o do painel)" if vendedor.get("codigo_verificacao")
                                                    else "os 6 últimos dígitos do id (1 tentativa)"))
                enviar(pg)
                pg.wait_for_timeout(4_000)
                continue
            if "/login" in agora or "/lgz/" in agora:
                usuario = pg.locator("input[type=text]:visible, input[type=email]:visible, input[type=tel]:visible, input:not([type]):visible")
                if visivel(usuario) and not usuario.first.input_value():
                    if feito["usuario"] >= 1:
                        passo("o usuário foi pedido de novo")
                        motivo = "usuario_pedido_de_novo"
                        break
                    usuario.first.click()
                    usuario.first.press_sequentially(str(vendedor.get("nickname") or vendedor.get("email")), delay=45)
                    feito["usuario"] += 1
                    passo("usuário digitado (o apelido do vendedor de teste)")
                    enviar(pg)
                    pg.wait_for_timeout(4_000)
                    continue
            elif "auth.mercadopago" in agora or "authorization" in agora:
                botao = pg.get_by_role("button", name=CONSENTIR)
                if visivel(botao):
                    if feito["consentimento"] >= 3:
                        passo("o consentimento não saiu da tela")
                        motivo = "consentimento_em_laco"
                        break
                    nome = " ".join((botao.first.inner_text() or "").split())[:20]
                    botao.first.click()
                    feito["consentimento"] += 1
                    passo(f"consentimento: \"{nome}\"")
                    pg.wait_for_timeout(4_000)
                    continue
            if time.time() - estado_tela["desde"] > 25:
                passo("parado há 25 s sem passo conhecido")
                motivo = "tela_desconhecida"
                break
            pg.wait_for_timeout(1_000)
    finally:
        ctx.remove_listener("request", ao_pedir)
        ctx.unroute(rota_rx, segurar)
    if "q" in capturado and "code" in capturado["q"] and capturado["q"].get("state", [None])[0] == estado:
        passo("o code chegou no PEDIDO ao redirect (no último passo)")
        reg["motivo"] = None
        return capturado["q"]["code"][0]
    reg["motivo"] = motivo
    foto(pg, f"{rotulo}-parou", vendedor)
    for linha in estrutura(pg):
        dizer("   ", linha)
    dizer(f"  [{rotulo}] parou ({motivo}) — print guardado; a prova vai para o FIM se não houver o que ajustar")
    return None


# ───────────────────────── o extra: o token do vendedor de teste cria pagamento? ─────────────────────────


def email_do_comprador(eu: dict, comprador: dict) -> tuple[str, str]:
    """O POST /users/test não devolve o e-mail: a regra é tirada do e-mail do VENDEDOR (o /users/me dele) e aplicada ao comprador."""
    email, apelido, ident = str(eu.get("email") or "").lower(), str(eu.get("nickname") or ""), str(eu.get("id") or "")
    digitos = lambda n: re.sub(r"\D", "", n)  # noqa: E731
    regras = {"test_user_<id>@testuser.com": lambda i, n: f"test_user_{i}@testuser.com",
              "test_user_<dígitos do apelido>@testuser.com": lambda i, n: f"test_user_{digitos(n)}@testuser.com",
              "<apelido>@testuser.com": lambda i, n: f"{n.lower()}@testuser.com"}
    for nome, regra in regras.items():
        if email and email == regra(ident, apelido).lower():
            return regra(str(comprador["id"]), str(comprador.get("nickname") or "")), nome
    if comprador.get("email"):
        return str(comprador["email"]), "o do arquivo"
    return f"test_user_{comprador['id']}@testuser.com", "palpite test_user_<id>@testuser.com (sem regra no e-mail do vendedor)"


def provar_pagamento(tokens: dict, comprador: dict, saida: dict) -> None:
    """1 Pix de R$ 1 com o token do VENDEDOR de teste (o do /oauth/token) e o COMPRADOR de teste como pagador; criado → cancelado na hora
    (PUT status cancelled). Tenta o par "producao" (APP_USR — "use test users with production credentials", a resposta do Orders em 11/10)
    e, só se ele NÃO criar, o "teste". No máximo 1 pagamento criado; nada de dinheiro de verdade (os 2 usuários são de teste)."""
    ext: dict = {}
    saida["pagamento_extra"] = ext
    ordem: list[str] = []
    for r in ("producao", "teste"):
        a = (tokens.get(r) or {}).get("access_token")
        if a and all(a != tokens[x]["access_token"] for x in ordem):
            ordem.append(r)
    if not ordem:
        ext["parou"] = "sem_token_do_vendedor"
        return
    st, eu = pedir("GET", f"{API}/users/me", token=tokens[ordem[0]]["access_token"])
    email, regra = email_do_comprador(eu, comprador)
    guardar(email)
    ext["vendedor_me"] = {"status": st, "test_user": "test_user" in (eu.get("tags") or []), "site_id": eu.get("site_id"),
                          "tem_email": bool(eu.get("email")), "email_testuser_com": str(eu.get("email") or "").lower().endswith("@testuser.com")}
    ext["email_do_comprador"] = regra
    ext["tentativas"] = tentativas = []
    for r in ordem:
        tok = tokens[r]["access_token"]
        corpo = {"transaction_amount": 1.0, "description": "Physiq W2 — prova do sandbox (teste; cancelado em seguida)",
                 "payment_method_id": "pix", "payer": {"email": email}, "external_reference": f"physiq:prova-w2:{secrets.token_hex(6)}"}
        st, p = pedir("POST", f"{API}/v1/payments", corpo, token=tok, extra={"X-Idempotency-Key": str(uuid.uuid4())})
        pid = p.get("id")
        guardar(pid)
        dados_pix = (p.get("point_of_interaction") or {}).get("transaction_data") or {}
        t = {"token": r, "prefixo": tok.split("-", 1)[0], "http": st, "criou": pid is not None, "status": p.get("status"),
             "status_detail": p.get("status_detail"), "live_mode": p.get("live_mode"), "tem_qr_pix": bool(dados_pix.get("qr_code")),
             "collector_e_o_vendedor": str(p.get("collector_id")) == str(tokens[r].get("user_id")) if pid is not None else None,
             "erro": limpo(p.get("error"))[:60] if p.get("error") else None,
             "mensagem": limpo(p.get("message"))[:200] if p.get("message") else None,
             "causa": [{"code": c.get("code"), "description": limpo(c.get("description"))[:120]}
                       for c in (p.get("cause") or []) if isinstance(c, dict)][:3]}
        tentativas.append(t)
        if pid is not None:
            if p.get("status") in ("pending", "in_process", "authorized"):
                for _ in range(2):
                    st2, c = pedir("PUT", f"{API}/v1/payments/{pid}", {"status": "cancelled"}, token=tok)
                    t["cancelar_http"], t["status_depois"] = st2, c.get("status")
                    if st2 == 200 and c.get("status") == "cancelled":
                        t.pop("cancelar_erro", None)
                        break
                    t["cancelar_erro"] = limpo(c.get("message"))[:160]
                    time.sleep(3)
            else:
                t["cancelar"] = f"não precisa (status {p.get('status')})"
        dizer("  pagamento", json.dumps(t, ensure_ascii=False))
        if pid is not None:
            break
    ext["cria_pagamento"] = any(t["criou"] for t in tentativas)


# ───────────────────────── a prova ─────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--canal", default="msedge")
    ap.add_argument("--sem-pkce", action="store_true")
    ap.add_argument("--com-tela", action="store_true", help="o MP barra navegador sem tela? abre a janela (o notebook tem tela)")
    ap.add_argument("--auth-br", action="store_true", help="abre direto o auth.mercadopago.com.br (pula a escolha de país; não documentado)")
    ap.add_argument("--client", choices=sorted(ARQ_CLIENTE), default="real",
                    help="real = a aplicação PhysiqCalc; staging = a aplicação de TESTE do integrador (plano B do I6)")
    ap.add_argument("--redirect", help="padrao | staging | public | https://… (sem ele: staging com --client staging, senão padrao)")
    so = ap.add_mutually_exclusive_group()
    so.add_argument("--pagamento", action="store_true", help="depois do OAuth, o extra: 1 Pix de R$ 1 com o token do vendedor, cancelado")
    so.add_argument("--so-pagamento", action="store_true", help=f"só o extra, com os tokens já em ~/{ARQ_TOKENS}")
    a = ap.parse_args()
    if a.so_pagamento:
        tokens, comprador = ler_600(ARQ_TOKENS), ler_600(".physiq-mp-comprador-teste.json")
        saida = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {}
        provar_pagamento(tokens, comprador, saida)
        escrever_saida(saida)
        dizer("pagamento extra:", json.dumps(saida["pagamento_extra"], ensure_ascii=False))
        return 0
    redirect = redirect_de(a.redirect, a.client)
    cliente, vendedor = ler_600(ARQ_CLIENTE[a.client]), ler_600(".physiq-mp-vendedor-teste.json")
    comprador = ler_600(".physiq-mp-comprador-teste.json") if a.pagamento else {}
    assert cliente.get("client_secret"), "sem o Client Secret no cofre: a prova vai para o FIM (W2-a, passo 5)"
    guardar(str(vendedor["id"])[-6:])
    auth = AUTH_BR if a.auth_br else AUTH
    saida: dict = {"quando": time.strftime("%Y-%m-%d %H:%M"), "pkce": not a.sem_pkce, "auth_usado": urllib.parse.urlparse(auth).hostname,
                   "com_tela": a.com_tela, "client": a.client, "redirect": redirect, "passos": []}
    tokens: dict = {"criado_em": time.strftime("%Y-%m-%d %H:%M:%S"), "client": a.client, "redirect_uri": redirect}
    acessos: dict[str, str] = {}
    with sync_playwright() as p:
        nav, ctx = abrir_navegador(p, a.canal, a.com_tela)
        pg = ctx.new_page()
        for rotulo, teste in (("teste", "true"), ("producao", "false")):
            registro: dict = {"passos": saida["passos"]}
            code, verif = autorizar(pg, cliente, vendedor, not a.sem_pkce, rotulo, auth, registro, redirect)
            if not code:
                saida[rotulo] = {"parou": registro.get("motivo")}
                if rotulo == "teste":
                    break  # sem a 1ª, a 2ª seria outra tentativa do mesmo login: não insistir
                continue
            corpo = {"client_id": cliente["client_id"], "client_secret": cliente["client_secret"], "grant_type": "authorization_code",
                     "code": code, "redirect_uri": redirect, "test_token": teste}
            if verif:
                corpo["code_verifier"] = verif
            st, r = post_token(corpo)
            if st != 200 and verif and menciona_pkce(r):
                saida[f"{rotulo}_com_verifier"] = resumo(st, r, vendedor)  # o MP recusou o PKCE: o mesmo code sem o verifier, 1 vez
                corpo.pop("code_verifier")
                st, r = post_token(corpo)
            saida[rotulo] = resumo(st, r, vendedor)
            if st == 200 and isinstance(r.get("access_token"), str):
                acessos[rotulo] = r["access_token"]
                tokens[rotulo] = par_de_tokens(r)
                gravar_600(CASA / ARQ_TOKENS, json.dumps(tokens, ensure_ascii=False))
            if rotulo == "teste" and st == 200 and isinstance(r.get("refresh_token"), str):
                st2, r2 = post_token({"client_id": cliente["client_id"], "client_secret": cliente["client_secret"],
                                      "grant_type": "refresh_token", "refresh_token": r["refresh_token"]})
                saida["renovacao"] = resumo(st2, r2, vendedor) | {"refresh_girou": r2.get("refresh_token") not in (None, r["refresh_token"])}
                if st2 == 200 and isinstance(r2.get("access_token"), str):
                    acessos["teste"] = r2["access_token"]
                    tokens["teste"] = par_de_tokens(r2)
                    gravar_600(CASA / ARQ_TOKENS, json.dumps(tokens, ensure_ascii=False))
            dizer(rotulo, json.dumps(saida[rotulo], ensure_ascii=False))
        nav.close()
    if "teste" in acessos and "producao" in acessos:
        # MENOR 29: a 2ª autorização do MESMO vendedor na MESMA aplicação derruba o acesso da 1ª? (aqui a 1ª é de teste e a 2ª, não —
        # é o sinal mais próximo que dá para medir sem a W2-a; a Task 23 confere com 2 conexões de verdade se precisar)
        saida["primeira_vale_depois_da_segunda"] = status_do_eu(acessos["teste"]) == 200
    if a.pagamento:
        if any(isinstance(tokens.get(r), dict) for r in ("producao", "teste")):
            provar_pagamento(tokens, comprador, saida)
        else:
            saida["pagamento_extra"] = {"parou": "o OAuth não deu token"}
    escrever_saida(saida)
    dizer("renovação:", json.dumps(saida.get("renovacao"), ensure_ascii=False), "| a 1ª vale depois da 2ª:",
          saida.get("primeira_vale_depois_da_segunda"))
    if a.pagamento:
        dizer("pagamento extra:", json.dumps(saida.get("pagamento_extra"), ensure_ascii=False))
    if tokens.keys() & {"teste", "producao"}:
        dizer(f"tokens do vendedor de teste: ~/{ARQ_TOKENS} (600) — pares {sorted(tokens.keys() & {'teste', 'producao'})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
