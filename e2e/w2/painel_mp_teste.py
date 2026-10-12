#!/usr/bin/env python3
"""Physiq W2 — plano B do I6: o INTEGRADOR de TESTE do Mercado Pago entra no painel de desenvolvedores e cria a aplicação de TESTE
("Physiq Teste OAuth (W2)") com que o VENDEDOR de teste autoriza o OAuth — a aplicação real (PhysiqCalc, da conta do Weslley) recusa o
vendedor de teste com "O aplicativo não está pronto para se conectar a Mercado Pago" (Task 1, 11/10). Só usuários de TESTE (dinheiro de
mentira); a aplicação real e a conta dele não são tocadas (nem pelo painel, nem pela API).
Comandos (Edge sem tela com o user agent normal, como a prova; --com-tela abre a janela; a sessão do integrador fica em
~/.physiq-mp-integrador-sessao.json, 600):
  entrar     login do integrador (apelido + método "Senha"; código de verificação → 1 tentativa e para; captcha → para) e a tela inicial
  explorar   abre --url (ou a lista de aplicações), clica em --clicar <texto> (1 ou mais, em ordem) e mostra a estrutura da tela
  criar      cria a aplicação de teste (se ainda não existe pelo nome), com as respostas da rede da criação (método, caminho, status e só
             as chaves de erro do corpo, pelo mascarar())
Medido em 11/10 (20:42–20:59): o login do integrador criado pela API (POST /users/test, "profile" vazio) PASSA (apelido + "Senha", sem
código, sem captcha) e o painel abre ("Gestão de integrações" › "Crie sua primeira aplicação"); a criação chega ao fim do formulário, mas
o POST /developers/panel/api/applications responde 424 {"message": "Service unavailable", "errorContext": …} e a tela mostra "Tuvimos un
problema · Por favor, vuelve en otro momento" (códigos DXP07-…) — 2 tentativas (sem tela + API de Payments; com tela + API de Orders),
nenhuma aplicação criada. O payload da criação (código público do painel) leva o captchaToken do reCAPTCHA Enterprise invisível.
Os próximos comandos (configurar: "Editar dados" › "Configuração avançada" › "URLs de redirecionamento" + o PKCE; credenciais: Client ID
e Client Secret da tela → scripts/segredos/mp_conta.py gravar_aplicacao_teste) entram quando houver uma aplicação de teste para medir as
telas (o T1B-FEITA traz os seletores tirados do código do painel).
Na tela, no print e no JSON: nunca um valor (token, secret, id, apelido, senha) — o limpo() da prova + as máscaras de número longo e de
token; os prints (Read antes de usar) em ~/projetos/physiqcalc-scratch/prints/w2/plano-b/ com os campos sensíveis cobertos.
Uso: python3 e2e/w2/painel_mp_teste.py <comando> [--com-tela] [--url URL] [--clicar TEXTO ...] [--rotulo NOME] [--api orders|payments]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.dont_write_bytecode = True  # o e2e/w2 não ignora __pycache__ no git
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent.parent / "scripts/segredos"))
import prova_public_key as PP  # noqa: E402  (visivel, desafio_visivel, enviar, guardar, limpo, onde, ler_600, gravar_600, constantes)
import servidor as S  # noqa: E402  (guardar: o limpo() do mp_conta — o credenciais vai gravar pelo mp_conta.gravar_aplicacao_teste)

from playwright.sync_api import sync_playwright  # noqa: E402

CASA = Path.home()
PRINTS = CASA / "projetos/physiqcalc-scratch/prints/w2/plano-b"
SESSAO = CASA / ".physiq-mp-integrador-sessao.json"
ARQ_INTEGRADOR = ".physiq-mp-integrador-teste.json"
PAINEL = "https://www.mercadopago.com.br/developers/panel/app"
NOME_APP = "Physiq Teste OAuth (W2)"
# o que o "configurar" vai cadastrar: só a do staging — o campo "URLs de redirecionamento" recusa domínio do MP (mercadopago.com está na
# lista do código do painel) e trata o https://www.mercadopago.com como o valor padrão (vazio)
REDIRECTS = ("https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/staging",)
NUMERO_LONGO = re.compile(r"(?<![\w-])\d{7,}(?![\w-])")
TOKEN = re.compile(r"\b(APP_USR|TEST)-[0-9A-Za-z-]{8,}")
TEXTO_LONGO = re.compile(r"\b[A-Za-z0-9]{28,}\b")
ENTRAR = re.compile(r"^\s*(entrar|ingresar|iniciar sess[aã]o|fazer login)\s*$", re.I)


# ───────────────────────── nada sensível na tela ─────────────────────────


def mascarar(texto: object) -> str:
    """O limpo() da prova (os valores guardados) + número longo (ids, número da aplicação), token e texto longo (secret)."""
    t = PP.limpo(texto)
    t = TOKEN.sub("‹token›", t)
    t = TEXTO_LONGO.sub("‹texto longo›", t)
    return NUMERO_LONGO.sub(lambda m: f"‹{len(m.group(0))} dígitos›", t)


def dizer(*partes: object) -> None:
    print(mascarar(" ".join(str(p) for p in partes)), flush=True)


JS_MASCARAR = r"""(sensiveis) => {
  const rx = [/(^|[^\w-])\d{7,}(?![\w-])/, /\b(APP_USR|TEST)-[0-9A-Za-z-]{8,}/, /\b[A-Za-z0-9]{28,}\b/];
  const bate = (t) => !!t && (rx.some((r) => r.test(t)) || sensiveis.some((s) => s && t.includes(s)));
  const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const trocar = [];
  for (let n = andar.nextNode(); n; n = andar.nextNode()) if (bate(n.nodeValue)) trocar.push(n);
  for (const n of trocar) n.nodeValue = "‹oculto›";
  let k = 0;
  for (const el of document.querySelectorAll("input, textarea")) {
    if (bate(el.value) || el.type === "password") { el.setAttribute("data-physiq-mascara", "1"); k++; }
  }
  return trocar.length + k;
}"""


def foto(pg, nome: str, sensiveis: list[str]) -> Path | None:
    """Print com o texto sensível trocado por ‹oculto› (na página, só para o print) e os campos com valor sensível cobertos."""
    PRINTS.mkdir(parents=True, exist_ok=True)
    destino = PRINTS / f"{nome}.png"
    try:
        pg.evaluate(JS_MASCARAR, [s for s in sensiveis if s])
        pg.screenshot(path=str(destino), mask=[pg.locator("[data-physiq-mascara]")], full_page=True, timeout=20_000)
        return destino
    except Exception as e:  # noqa: BLE001
        dizer("   (o print falhou:", type(e).__name__, ")")
        return None


def estrutura(pg, limite_textos: int = 40) -> list[str]:
    """Campos (atributos), clicáveis e textos da tela — tudo pelo mascarar()."""
    linhas: list[str] = []
    try:
        for el in pg.locator("input:visible, textarea:visible, select:visible, [role=switch]:visible, [role=checkbox]:visible, "
                             "[role=radio]:visible, [role=combobox]:visible").all()[:30]:
            at = {k: el.get_attribute(k) for k in ("type", "name", "id", "placeholder", "aria-label", "role", "aria-checked", "value")}
            if at.get("type") == "password" or (at.get("value") and len(at["value"] or "") > 60):
                at["value"] = "‹campo›"
            linhas.append("campo " + json.dumps({k: mascarar(v)[:60] for k, v in at.items() if v}, ensure_ascii=False))
        vistos: set[str] = set()
        for el in pg.locator("button:visible, [role=button]:visible, a:visible, [role=tab]:visible, [role=menuitem]:visible").all()[:60]:
            t = " ".join((el.inner_text() or "").split())
            if t and t not in vistos:
                vistos.add(t)
                href = el.get_attribute("href") or ""
                linhas.append("clicável " + repr(mascarar(t)[:60]) + (f" → {mascarar(href)[:90]}" if href.startswith(("/", "http")) else ""))
        n = 0
        for el in pg.locator("h1:visible, h2:visible, h3:visible, h4:visible, label:visible, [role=alert]:visible, p:visible, "
                             "span:visible").all()[:400]:
            t = " ".join((el.inner_text() or "").split())
            if t and t not in vistos and len(t) < 300:
                vistos.add(t)
                linhas.append("texto " + repr(mascarar(t)[:140]))
                n += 1
                if n >= limite_textos:
                    break
        linhas += ["frame " + mascarar(PP.onde(f.url)) for f in pg.frames[1:]][:6]
    except Exception as e:  # noqa: BLE001
        linhas.append(f"(estrutura falhou: {type(e).__name__})")
    return linhas


def mostrar(pg, rotulo: str, sensiveis: list[str], limite_textos: int = 40) -> None:
    dizer(f"== {rotulo} · {PP.onde(pg.url)}")
    for linha in estrutura(pg, limite_textos):
        dizer("   ", linha)
    f = foto(pg, rotulo, sensiveis)
    if f:
        dizer(f"   print: {f}")


# ───────────────────────── o login do integrador ─────────────────────────


def ler_integrador() -> dict:
    d = PP.ler_600(ARQ_INTEGRADOR)  # guarda id, apelido e senha no limpo() da prova
    for k in ("id", "nickname", "password", "email"):
        if d.get(k):
            S.guardar(str(d[k]))
    PP.guardar(str(d["id"])[-6:])
    return d


def sensiveis_de(integ: dict) -> list[str]:
    return [str(integ[k]) for k in ("nickname", "email", "id") if integ.get(k)]


def no_painel(url: str) -> bool:
    u = urllib.parse.urlparse(url)
    return u.hostname == "www.mercadopago.com.br" and u.path.startswith("/developers/panel")


def entrar(pg, integ: dict, rotulo: str, passos: list) -> str:
    """Do PAINEL até o painel logado como o integrador de teste. '' = ok; senão o motivo (captcha, codigo_recusado, bloqueio_da_pagina…).
    O caminho da prova (11/10): login/identification (o APELIDO) → login/challenges ("Senha") → password/validation."""
    feito = {"usuario": 0, "metodo": 0, "senha": 0, "codigo": 0, "entrar": 0}
    tela = {"ultima": None, "desde": time.time(), "n": 0, "cookies": False}

    def passo(acao: str) -> None:
        passos.append({"tela": PP.onde(pg.url), "acao": mascarar(acao)})
        dizer(f"  [{rotulo}] {PP.onde(pg.url)} → {acao}")
        tela["desde"] = time.time()

    pg.goto(PAINEL, wait_until="domcontentloaded", timeout=60_000)
    fim = time.time() + 180
    while time.time() < fim:
        agora = PP.onde(pg.url)
        if agora != tela["ultima"]:
            tela["n"] += 1
            tela["ultima"] = agora
            passo("tela nova")
            pg.wait_for_timeout(2_000)
            foto(pg, f"{rotulo}-{tela['n']:02d}", sensiveis_de(integ))
            continue
        if no_painel(pg.url) and not PP.visivel(pg.locator("input[type=password]:visible")):
            pg.wait_for_timeout(3_000)
            if no_painel(pg.url):
                passo("no painel de desenvolvedores (logado)")
                return ""
        if PP.visivel(pg.get_by_text(PP.BLOQUEIO)):
            passo("a página do MP recusou o navegador")
            return "bloqueio_da_pagina"
        if not tela["cookies"] and PP.visivel(pg.get_by_role("button", name=re.compile(r"aceitar cookies", re.I))):
            pg.get_by_role("button", name=re.compile(r"aceitar cookies", re.I)).first.click()
            tela["cookies"] = True
            continue
        if PP.desafio_visivel(pg):
            passo("captcha (o desafio apareceu)")
            return "captcha"
        metodo = pg.get_by_text(PP.METODO_SENHA)
        if PP.visivel(metodo):
            if feito["metodo"] >= 2 or feito["senha"] >= 1:
                passo("a escolha do método voltou depois da senha")
                return "metodo_de_novo"
            sobre = pg.locator("button[aria-labelledby*='password']")
            (sobre.first.click() if PP.visivel(sobre) else metodo.first.click(force=True))
            feito["metodo"] += 1
            passo("método de verificação: Senha")
            pg.wait_for_timeout(3_000)
            continue
        senha = pg.locator("input[type=password]:visible")
        if PP.visivel(senha) and not senha.first.input_value():
            if feito["senha"] >= 1:
                passo("a senha foi pedida de novo")
                return "senha_pedida_de_novo"
            senha.first.click()
            senha.first.press_sequentially(str(integ["password"]), delay=45)
            feito["senha"] += 1
            passo("senha digitada")
            PP.enviar(pg)
            pg.wait_for_timeout(4_000)
            continue
        codigo = pg.locator("input[autocomplete=one-time-code]:visible, input[name*=code]:visible, input[id*=code]:visible, "
                            "input[maxlength='1']:visible")
        if "identification" not in agora and PP.visivel(codigo) and not codigo.first.input_value():
            if feito["codigo"] >= 1:
                passo("o código de verificação foi pedido de novo (recusado)")
                return "codigo_recusado"
            valor = PP.guardar(str(integ.get("codigo_verificacao") or str(integ["id"])[-6:])) or ""
            caixas = codigo.all()
            if len(caixas) >= len(valor) > 1:
                for caixa, digito in zip(caixas, valor):
                    caixa.fill(digito)
            else:
                codigo.first.press_sequentially(valor, delay=60)
            feito["codigo"] += 1
            passo("código de verificação: os 6 últimos dígitos do id (1 tentativa)")
            PP.enviar(pg)
            pg.wait_for_timeout(4_000)
            continue
        if "/login" in agora or "/lgz/" in agora:
            usuario = pg.locator("input[type=text]:visible, input[type=email]:visible, input[type=tel]:visible, input:not([type]):visible")
            if PP.visivel(usuario) and not usuario.first.input_value():
                if feito["usuario"] >= 1:
                    passo("o usuário foi pedido de novo")
                    return "usuario_pedido_de_novo"
                usuario.first.click()
                usuario.first.press_sequentially(str(integ["nickname"]), delay=45)
                feito["usuario"] += 1
                passo("usuário digitado (o apelido do integrador de teste)")
                PP.enviar(pg)
                pg.wait_for_timeout(4_000)
                continue
        else:
            botao = pg.get_by_role("link", name=ENTRAR).or_(pg.get_by_role("button", name=ENTRAR))
            if PP.visivel(botao) and feito["entrar"] < 2:
                botao.first.click()
                feito["entrar"] += 1
                passo("clicou em Entrar")
                pg.wait_for_timeout(3_000)
                continue
        if time.time() - tela["desde"] > 30:
            passo("parado há 30 s sem passo conhecido")
            return "tela_desconhecida"
        pg.wait_for_timeout(1_000)
    return "tempo_esgotado"


def abrir(p, com_tela: bool):
    """O Edge da prova (sem tela com o user agent normal — o login do Mercado Livre recusa o "Headless…") + a sessão salva, se houver."""
    nav = p.chromium.launch(channel="msedge", headless=not com_tela, args=["--disable-blink-features=AutomationControlled"])
    v = nav.version
    ua = None if com_tela else (f"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/{v.split('.')[0]}.0.0.0 "
                                f"Safari/537.36 Edg/{v}")
    extra = {"storage_state": str(SESSAO)} if SESSAO.exists() else {}
    return nav, nav.new_context(locale="pt-BR", user_agent=ua, viewport={"width": 1280, "height": 800}, **extra)


def guardar_sessao(ctx) -> None:
    estado = ctx.storage_state()
    PP.gravar_600(SESSAO, json.dumps(estado))
    dizer(f"sessão do integrador de teste: ~/{SESSAO.name} (600, {len(estado.get('cookies', []))} cookies)")


def garantir_login(pg, integ: dict, rotulo: str, passos: list) -> str:
    motivo = entrar(pg, integ, rotulo, passos)
    if motivo:
        mostrar(pg, f"{rotulo}-parou", sensiveis_de(integ))
    return motivo


# ───────────────────────── comandos ─────────────────────────


def cmd_entrar(pg, ctx, integ: dict, a: argparse.Namespace, saida: dict) -> int:
    motivo = garantir_login(pg, integ, a.rotulo or "entrar", saida.setdefault("passos", []))
    saida["entrar"] = motivo or "ok"
    if motivo:
        return 1
    guardar_sessao(ctx)
    pg.wait_for_timeout(3_000)
    mostrar(pg, (a.rotulo or "entrar") + "-painel", sensiveis_de(integ))
    return 0


def clicar_texto(pg, texto: str) -> bool:
    rx = re.compile(rf"^\s*{re.escape(texto)}\s*$", re.I)
    for loc in (pg.get_by_role("button", name=rx), pg.get_by_role("link", name=rx), pg.get_by_role("tab", name=rx),
                pg.get_by_role("menuitem", name=rx), pg.get_by_role("radio", name=rx), pg.get_by_role("checkbox", name=rx),
                pg.get_by_text(rx)):
        if PP.visivel(loc):
            try:
                loc.first.click(timeout=8_000)
            except Exception:  # noqa: BLE001 — o item da lista Andes é coberto por um <a> (medido): o clique no ponto cai nele
                loc.first.click(timeout=8_000, force=True)
            return True
    return False


def cmd_explorar(pg, ctx, integ: dict, a: argparse.Namespace, saida: dict) -> int:
    pg.goto(a.url or PAINEL, wait_until="domcontentloaded", timeout=60_000)
    pg.wait_for_timeout(5_000)
    if not no_painel(pg.url) and "developers" not in pg.url:
        motivo = garantir_login(pg, integ, "relogin", saida.setdefault("passos", []))
        if motivo:
            return 1
        guardar_sessao(ctx)
        pg.goto(a.url or PAINEL, wait_until="domcontentloaded", timeout=60_000)
        pg.wait_for_timeout(5_000)
    rotulo = a.rotulo or "explorar"
    mostrar(pg, f"{rotulo}-0", sensiveis_de(integ), a.textos)
    for i, texto in enumerate(a.clicar or [], 1):
        ok = clicar_texto(pg, texto)
        dizer(f"-- clicar {texto!r}: {'✅' if ok else '❌ não achei'}")
        if not ok:
            return 1
        pg.wait_for_timeout(4_000)
        mostrar(pg, f"{rotulo}-{i}", sensiveis_de(integ), a.textos)
    guardar_sessao(ctx)
    return 0


def abrir_logado(pg, ctx, integ: dict, url: str, saida: dict) -> bool:
    pg.goto(url, wait_until="domcontentloaded", timeout=60_000)
    pg.wait_for_timeout(5_000)
    if no_painel(pg.url):
        return True
    if garantir_login(pg, integ, "relogin", saida.setdefault("passos", [])):
        return False
    guardar_sessao(ctx)
    pg.goto(url, wait_until="domcontentloaded", timeout=60_000)
    pg.wait_for_timeout(5_000)
    return no_painel(pg.url)


def app_existente(pg) -> str | None:
    """A página da aplicação de teste na lista ("Suas integrações"), pelo nome; None = ainda não existe."""
    cartao = pg.get_by_text(re.compile(rf"^\s*{re.escape(NOME_APP)}\s*$"))
    if not PP.visivel(cartao):
        return None
    for el in pg.locator("a[href*='/developers/panel/app/']").all():
        try:
            if NOME_APP in (el.inner_text() or "") and re.search(r"/developers/panel/app/\d+", el.get_attribute("href") or ""):
                return urllib.parse.urljoin(PAINEL, el.get_attribute("href"))
        except Exception:  # noqa: BLE001
            continue
    return "existe (sem o link)"


def cmd_criar(pg, ctx, integ: dict, a: argparse.Namespace, saida: dict) -> int:
    """O caminho medido em 11/10: Suas integrações › Criar aplicação › "Criar no painel de integração" (/create-app) › "Escolha uma
    solução para integrar" = Checkout Transparente › "Outros dados": Tipo de API = API de Payments (o /v1/payments da W2), Nome da
    aplicação, a caixa da Declaração de Privacidade e dos Termos e Condições › Criar aplicação. 1 aplicação só: já existe → não cria."""
    sens = sensiveis_de(integ)
    if not abrir_logado(pg, ctx, integ, PAINEL, saida):
        return 1
    ja = app_existente(pg)
    if ja:
        saida["criar"] = "já existe (não criei outra)"
        dizer("a aplicação de teste já existe:", ja)
        return 0
    pg.goto(f"{PAINEL}/create-app", wait_until="domcontentloaded", timeout=60_000)
    pg.wait_for_timeout(4_000)
    passos = saida.setdefault("passos", [])

    def passo(acao: str, foto_nome: str | None = None) -> None:
        passos.append({"tela": PP.onde(pg.url), "acao": acao})
        dizer(f"  [criar] {PP.onde(pg.url)} → {acao}")
        if foto_nome:
            foto(pg, foto_nome, sens)

    respostas: list[dict] = saida.setdefault("respostas_da_criacao", [])

    def ao_responder(resp) -> None:
        """As chamadas do painel (xhr/fetch) que não são GET, ou que falharam: método, caminho, status e só as chaves de erro do corpo."""
        try:
            req = resp.request
            if req.resource_type not in ("xhr", "fetch") or (req.method == "GET" and resp.status < 400):
                return
            u = urllib.parse.urlparse(resp.url)
            if not (u.hostname or "").endswith(("mercadopago.com.br", "mercadopago.com", "mercadolibre.com", "mercadolivre.com")):
                return
            item: dict = {"metodo": req.method, "host": u.hostname, "caminho": mascarar(u.path)[:100], "status": resp.status}
            try:
                corpo = resp.json()
            except Exception:  # noqa: BLE001
                corpo = None
            if isinstance(corpo, dict):
                item["chaves"] = sorted(map(str, corpo))[:15]
                for k in ("error", "message", "code", "status", "cause", "error_code", "errors", "detail", "errorContext"):
                    if k in corpo:
                        item[k] = mascarar(json.dumps(corpo[k], ensure_ascii=False))[:200]
            respostas.append(item)
        except Exception:  # noqa: BLE001
            pass

    pg.on("response", ao_responder)
    if not clicar_texto(pg, "Checkout Transparente"):
        passo("não achei a solução Checkout Transparente")
        return 1
    pg.wait_for_timeout(2_000)
    passo("solução: Checkout Transparente")
    if a.api == "payments" and clicar_texto(pg, "API de Orders"):
        pg.wait_for_timeout(1_000)
        if not clicar_texto(pg, "API de Payments"):
            passo("não achei a opção API de Payments")
            return 1
        pg.wait_for_timeout(1_000)
        passo("Tipo de API: API de Payments")
    else:
        passo("Tipo de API: API de Orders (o padrão; a de Payments aparece como \"Esta API será descontinuada em breve\")")
    nome = pg.locator("input[placeholder='App Checkout Transparente']").or_(pg.get_by_label(re.compile("Nome da aplicação", re.I)))
    if not PP.visivel(nome):
        passo("não achei o campo Nome da aplicação")
        return 1
    nome.first.click()
    nome.first.fill("")
    nome.first.press_sequentially(NOME_APP, delay=30)
    pg.wait_for_timeout(800)
    passo(f"Nome da aplicação: {NOME_APP}")
    caixa = pg.locator("#outros-dados-form-privacy")
    if PP.visivel(caixa) or caixa.count():
        try:
            caixa.first.check(timeout=5_000)
        except Exception:  # noqa: BLE001 — a caixa Andes é coberta pelo desenho dela
            caixa.first.check(timeout=5_000, force=True)
    passo("caixa da Declaração de Privacidade e dos Termos e Condições marcada", "criar-formulario")
    mostrar(pg, "criar-antes-de-enviar", sens, 60)
    botao = pg.get_by_role("button", name=re.compile(r"^\s*Criar aplicação\s*$", re.I))
    botao.first.click(timeout=10_000)
    passo("clicou em Criar aplicação")
    fim = time.time() + 60
    while time.time() < fim:
        pg.wait_for_timeout(2_000)
        if re.search(r"/developers/panel/app/\d+", pg.url):
            break
        if PP.desafio_visivel(pg):
            passo("captcha (o desafio apareceu) — PARAR", "criar-captcha")
            saida["criar"] = "captcha"
            return 1
    pg.wait_for_timeout(4_000)
    criou = bool(re.search(r"/developers/panel/app/\d+", pg.url))
    saida["criar"] = "criada" if criou else "não confirmada (ver o print)"
    passo("aplicação criada" if criou else "a tela não foi para a aplicação")
    for item in respostas:
        dizer("   resposta", json.dumps(item, ensure_ascii=False))
    mostrar(pg, "criar-depois", sens, 80)
    guardar_sessao(ctx)
    return 0 if criou else 1


COMANDOS = {"entrar": cmd_entrar, "explorar": cmd_explorar, "criar": cmd_criar}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("comando", choices=sorted(COMANDOS))
    ap.add_argument("--com-tela", action="store_true")
    ap.add_argument("--url")
    ap.add_argument("--clicar", action="append")
    ap.add_argument("--rotulo")
    ap.add_argument("--textos", type=int, default=40, help="quantos textos da tela mostrar")
    ap.add_argument("--api", choices=("orders", "payments"), default="orders",
                    help="criar: o Tipo de API do Checkout Transparente (11/10: a de Payments aparece como \"será descontinuada\")")
    a = ap.parse_args()
    integ = ler_integrador()
    saida: dict = {"quando": time.strftime("%Y-%m-%d %H:%M"), "comando": a.comando}
    with sync_playwright() as p:
        nav, ctx = abrir(p, a.com_tela)
        pg = ctx.new_page()
        try:
            rc = COMANDOS[a.comando](pg, ctx, integ, a, saida)
        finally:
            nav.close()
    dizer("resultado:", json.dumps({k: v for k, v in saida.items() if k != "passos"}, ensure_ascii=False))
    return rc


if __name__ == "__main__":
    sys.exit(main())
