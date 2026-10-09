#!/usr/bin/env python3
"""Physiq hml-15b (H-78) — E2E do captcha do cadastro por convite (/c/<código>).

Antes da correção o useCaptcha só montava o widget do Turnstile se a caixa já existisse quando o script ficava pronto; no /c/ a
caixa só aparece depois do pedido do formulário (cadastro_info) e, com o script pronto antes, o widget não montava: o cadastro
saía sem token e o servidor recusava (falha fechada, hml-05a). Agora o widget monta quando a caixa entra na tela:
  C1  script ANTES do formulário: o pedido cadastro_info fica 3 s parado (o fetch da página) e o script fica pronto antes da caixa
  C2  formulário ANTES do script: o script do Cloudflare fica 3 s parado
  C3  pela navegação do app: /entrar/email (o script carrega e o widget monta lá) → /c/ sem recarregar a página
      (window.turnstile já existe quando o /c/ abre)
  "Montou" = a caixa [data-captcha] do /c/ saiu de "carregando" e tem o widget dentro. O Chromium/Edge automatizado não ganha
  token do Turnstile (erro 600010): depois de montar, a caixa pode ir para "erro" — o que se prova aqui é o widget montado.
  C4  (só staging) cadastro de teste com token REAL: a fonte do e2e/w08b/fonte_turnstile.py (Edge de verdade, --acao cadastro)
      gera o token e o teste o põe no pedido cadastro_enviar no lugar do da tela → "Cadastro enviado" + 1 pendente no staging
      (apagado no fim, mesmo se falhar)
  C5  (só staging) token inventado no pedido → "Não deu para confirmar que é você." e nada criado
Produção: só C1–C3 e só leitura (o /c/ da conta de TESTE nutri.teste.claude; nada é enviado).

Uso: python3 e2e/hml15b/convite.py --base local --prefixo local      (local = e2e/hml15/servidor_dist.py --valendo na 8080)
     python3 e2e/w08b/fonte_turnstile.py --porta 5174 --acao cadastro   (noutro terminal, para o C4)
     python3 e2e/hml15b/convite.py --base staging --prefixo staging --fonte http://localhost:5174
     python3 e2e/hml15b/convite.py --base prod --prefixo prod
Saída: ~/projetos/physiqcalc-scratch/hml/hml15b/convite_<prefixo>.txt · prints em ~/projetos/physiqcalc-scratch/prints/hml15b/ ·
a rodada no ~/projetos/physiqcalc-scratch/e2e-rodadas.tsv. Nada no /tmp.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
import urllib.parse
from pathlib import Path

sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[2]


def carregar(nome: str, caminho: Path):
    espec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nome] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


# o e2e/hml12/telas.py: o código do /c/ (staging e produção, só leitura), o ler()/sql_staging(), a Rede e o Caso da W5
T = carregar("_telas_hml12", REPO / "e2e" / "hml12" / "telas.py")
F = carregar("_fonte_turnstile", REPO / "e2e" / "w08b" / "fonte_turnstile.py")
C, B5 = T.C, T.B5
C.SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml15b"
B5.PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml15b"
NOME = "hml15b Cadastro Captcha"
NOME_RECUSADO = "hml15b Cadastro Token Inventado"
SEGURA_S = 3.0
TODOS = ("C1", "C2", "C3", "C4", "C5")
SO_STAGING = {"C4", "C5"}

# no relógio da página: quando o script do Turnstile ficou pronto e quando o formulário do /c/ apareceu
MARCAS = """(() => {
  const m = (window.__hml15b = { turnstile: null, form: null });
  setInterval(() => {
    const t = Math.round(performance.now());
    if (m.turnstile === null && window.turnstile) m.turnstile = t;
    if (m.form === null && document.querySelector('[data-form-cadastro-publico]')) m.form = t;
  }, 20);
})();"""
# C1: o pedido cadastro_info fica SEGURA_S parado DENTRO da página (o fetch embrulhado). Segurar pelo page.route não serve: o
# handler parado prende o despacho do Playwright e, com rota ligada, todo pedido da página espera por ele — o script do
# Cloudflare atrasava junto e a ordem não se formava (1ª rodada local, 09/10)
SEGURAR_INFO = """(() => {
  const real = window.fetch.bind(window);
  window.fetch = async (url, opcoes) => {
    const corpo = opcoes && typeof opcoes.body === 'string' ? opcoes.body : '';
    if (String(url).includes('/functions/v1/alunos') && corpo.includes('"cadastro_info"')) await new Promise((r) => setTimeout(r, %d));
    return real(url, opcoes);
  };
})();""" % int(SEGURA_S * 1000)
WIDGET = """(sel) => { const c = document.querySelector(sel);
  return { estado: c ? c.getAttribute('data-captcha') : null, filhos: c ? c.childElementCount : 0, marcas: window.__hml15b || null }; }"""
CAIXA_DO_CONVITE = "[data-pagina-cadastro] [data-captcha]"


def widget(caso, sel: str = CAIXA_DO_CONVITE, segundos: float = 25) -> dict:
    """Espera o widget montar na caixa (saiu de "carregando" e tem filho) e devolve o último estado lido."""
    ultimo: dict = {}

    def montou() -> bool:
        ultimo.clear()
        ultimo.update(caso.pg.evaluate(WIDGET, sel))
        return ultimo.get("estado") not in (None, "carregando") and int(ultimo.get("filhos") or 0) > 0

    caso.esperar(montou, segundos)
    return dict(ultimo)


def montado(st: dict) -> bool:
    return st.get("estado") not in (None, "carregando") and int(st.get("filhos") or 0) > 0


def resumo(st: dict) -> str:
    m = st.get("marcas") or {}
    return f"caixa {st.get('estado')!r}, {st.get('filhos')} filho(s); script {m.get('turnstile')} ms · formulário {m.get('form')} ms"


def segurar_script(route) -> None:
    """C2, handler do page.route do script do Cloudflare: segura SEGURA_S e deixa seguir (prende o despacho do Playwright — os
    outros pedidos da página esperam junto; a ordem formulário → script é conferida pelas marcas, não suposta)."""
    time.sleep(SEGURA_S)
    route.continue_()


# ───────────────────────── C1–C3: o widget monta em qualquer ordem ─────────────────────────
def c1(o, nav, base: str, prefixo: str, codigo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "C1", desktop=False)
    try:
        caso.pg.add_init_script(MARCAS)
        caso.pg.add_init_script(SEGURAR_INFO)
        caso.ir(f"/c/{urllib.parse.quote(codigo)}")
        o.ok(caso.esperar(lambda: caso.tem("[data-form-cadastro-publico]"), 60), "C1 o /c/ abre (o pedido do formulário parado 3 s)")
        st = widget(caso)
        m = st.get("marcas") or {}
        o.ok(m.get("turnstile") is not None and m.get("form") is not None and m["turnstile"] < m["form"],
             f"C1 o script do Turnstile ficou pronto ANTES do formulário ({resumo(st)})")
        o.ok(montado(st), f"C1 o widget montou na caixa do /c/ ({resumo(st)})")
        o.linha(f"   print: {caso.print('C1_script_antes')}")
    finally:
        caso.fim()


def c2(o, nav, base: str, prefixo: str, codigo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "C2", desktop=False)
    try:
        caso.pg.add_init_script(MARCAS)
        caso.pg.route("**/turnstile/v0/api.js*", segurar_script)
        caso.ir(f"/c/{urllib.parse.quote(codigo)}")
        o.ok(caso.esperar(lambda: caso.tem("[data-form-cadastro-publico]"), 60), "C2 o /c/ abre (o script do Cloudflare parado 3 s)")
        st = widget(caso)
        m = st.get("marcas") or {}
        o.ok(m.get("turnstile") is not None and m.get("form") is not None and m["form"] < m["turnstile"],
             f"C2 o formulário apareceu ANTES do script ({resumo(st)})")
        o.ok(montado(st), f"C2 o widget montou na caixa do /c/ ({resumo(st)})")
        o.linha(f"   print: {caso.print('C2_formulario_antes')}")
    finally:
        caso.fim()


def c3(o, nav, base: str, prefixo: str, codigo: str) -> None:
    caso = B5.Caso(nav, base, prefixo, "C3", desktop=False)
    try:
        caso.pg.add_init_script(MARCAS)
        caso.ir("/entrar/email")
        st0 = widget(caso, "[data-captcha]")
        o.ok(montado(st0), f"C3 /entrar/email: o widget montou lá ({resumo(st0)})")
        caso.pg.evaluate("() => { window.__hml15b_mesma_pagina = 1; }")
        caso.pg.evaluate("(c) => { history.pushState({}, '', '/c/' + encodeURIComponent(c)); dispatchEvent(new PopStateEvent('popstate')); }", codigo)
        o.ok(caso.esperar(lambda: caso.tem("[data-form-cadastro-publico]"), 60), "C3 o /c/ abriu pela navegação do app")
        o.ok(caso.pg.evaluate("() => window.__hml15b_mesma_pagina === 1"), "C3 sem recarregar a página (window.turnstile já existia)")
        st = widget(caso)
        o.ok(montado(st), f"C3 o widget montou na caixa do /c/ ({resumo(st)})")
        o.linha(f"   print: {caso.print('C3_navegacao_do_app')}")
    finally:
        caso.fim()


# ───────────────────────── C4–C5: o envio (só staging) ─────────────────────────
def enviar(o, nav, base: str, prefixo: str, codigo: str, conta: str, nome: str, rotulo: str, token) -> tuple[bool, str]:
    """Abre o /c/, preenche, troca o captcha do pedido cadastro_enviar pelo `token()` e envia (1 nova tentativa se vier o 429 do
    teto por IP da Cloudflare, H-46). Devolve (enviado, frase de erro na tela)."""
    caso = B5.Caso(nav, base, prefixo, rotulo, desktop=False)
    rede = T.Rede(caso, "/functions/v1/alunos")
    trocados: list[int] = []
    atual = {"token": ""}

    def trocar(route) -> None:
        req = route.request
        corpo = req.post_data or ""
        if req.method == "POST" and '"cadastro_enviar"' in corpo:
            d = json.loads(corpo)
            d["captcha"] = atual["token"]
            trocados.append(1)
            route.continue_(post_data=json.dumps(d))
        else:
            route.continue_()

    try:
        caso.pg.route("**/functions/v1/alunos", trocar)
        caso.ir(f"/c/{urllib.parse.quote(codigo)}")
        o.ok(caso.esperar(lambda: caso.tem("[data-form-cadastro-publico]"), 60), f"{rotulo} o /c/ de teste abre")
        st = widget(caso)
        o.ok(montado(st), f"{rotulo} o widget montou ({resumo(st)})")
        caso.pg.locator("[data-cad-nome]").fill(nome)
        caso.pg.locator("[data-cad-nascimento]").fill(B5.data_com_idade(30))
        o.linha(f"   print: {caso.print(f'{rotulo}_preenchido')}")
        for tentativa in (1, 2):
            atual["token"] = token()
            n = len(rede.eventos)
            caso.pg.locator("[data-cad-enviar]").first.click()
            # a tela espera o token do widget (25 s; 120 s se o Cloudflare pedir a caixinha) e só então chama a função
            caso.esperar(lambda: bool(rede.desde(n, "cadastro_enviar")), 150)
            caso.esperar(lambda: caso.tem("[data-cadastro-enviado]") or bool(T.texto_de(caso, "[data-cad-erro]")), 15)
            if tentativa == 2 or not T.Rede.limitado(rede.desde(n)):
                break
            o.linha(f"   ({rotulo}: 429 do teto por IP da Cloudflare, H-46 — de novo em 65 s)")
            caso.pg.wait_for_timeout(65_000)
        o.ok(bool(trocados), f"{rotulo} o pedido cadastro_enviar saiu com o token do teste ({T.Rede.resumo(rede.desde(0, 'cadastro_enviar'))})")
        enviado, frase = caso.tem("[data-cadastro-enviado]"), T.texto_de(caso, "[data-cad-erro]")
        o.linha(f"   print: {caso.print(f'{rotulo}_depois')}")
        return enviado, frase
    finally:
        caso.fim()


def c4(o, nav, base: str, prefixo: str, codigo: str, conta: str, fonte: str) -> None:
    if not o.ok(bool(fonte), "C4 a fonte de tokens reais (--fonte; e2e/w08b/fonte_turnstile.py --acao cadastro)"):
        return
    T.sql_staging(f"delete from staging.cadastros_pendentes where conta_id = {C.txt(conta)} and nome = {C.txt(NOME)}")
    try:
        enviado, frase = enviar(o, nav, base, prefixo, codigo, conta, NOME, "C4", lambda: F.pedir_token(fonte, 90))
        o.ok(enviado, f"C4 token real da ação 'cadastro' → 'Cadastro enviado' (erro na tela: {frase!r})")
        o.ok(T.pendentes_com_nome(conta, NOME) == 1, "C4 1 cadastro pendente no staging (Alunos › Pendentes da w5-dono)")
    finally:
        T.sql_staging(f"delete from staging.cadastros_pendentes where conta_id = {C.txt(conta)} and nome = {C.txt(NOME)}")
        o.ok(T.pendentes_com_nome(conta, NOME) == 0, "C4 o cadastro de teste foi apagado")


def c5(o, nav, base: str, prefixo: str, codigo: str, conta: str) -> None:
    try:
        enviado, frase = enviar(o, nav, base, prefixo, codigo, conta, NOME_RECUSADO, "C5", lambda: "hml15b-token-inventado")
        o.ok(not enviado and "Não deu para confirmar que é você" in frase, f"C5 token inventado → {frase!r}")
        o.ok(T.pendentes_com_nome(conta, NOME_RECUSADO) == 0, "C5 nada foi criado")
    finally:
        T.sql_staging(f"delete from staging.cadastros_pendentes where conta_id = {C.txt(conta)} and nome = {C.txt(NOME_RECUSADO)}")


# ───────────────────────── principal ─────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="hml-15b (H-78) — E2E do captcha do /c/ (casos e uso no topo do arquivo)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod | <url>")
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--canal", default="msedge", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--casos", default=",".join(TODOS))
    ap.add_argument("--fonte", default="", help="a fonte de tokens reais do C4 (http://localhost:5174)")
    a = ap.parse_args()
    base = T.BASES.get(a.base, a.base).rstrip("/")
    producao = (urllib.parse.urlparse(base).hostname or "") in T.HOSTS_DE_PRODUCAO
    casos = {c.strip().upper() for c in a.casos.split(",") if c.strip()}
    if casos - set(TODOS):
        raise SystemExit(f"casos desconhecidos: {sorted(casos - set(TODOS))} (conhecidos: {', '.join(TODOS)})")
    o = C.Saida(f"convite_{a.prefixo}", parar=False)
    if producao and casos & SO_STAGING:
        o.linha(f"produção: só leitura — {', '.join(sorted(casos & SO_STAGING))} ficam de fora (enviam cadastro)")
        casos -= SO_STAGING
    if producao:
        codigo, conta = T.codigo_de_teste_producao(), ""
    else:
        dono = T.conta_do_dono()
        _, conta, codigo = dono if dono else ("", "", "")
    o.linha(f"base {base} · {'produção (só leitura)' if producao else 'staging'} · casos {','.join(c for c in TODOS if c in casos)}")
    if not o.ok(bool(codigo), "o código do /c/ da conta de TESTE (w5-dono no staging; nutri.teste.claude em produção), só leitura"):
        return o.fim()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        for nome, fn, args in (("C1", c1, ()), ("C2", c2, ()), ("C3", c3, ()), ("C4", c4, (conta, a.fonte)), ("C5", c5, (conta,))):
            if nome not in casos:
                continue
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                fn(o, nav, base, a.prefixo, codigo, *args)
            except Exception as e:  # noqa: BLE001
                o.ok(False, f"{nome}: {type(e).__name__}: {str(e)[:300]}")
                caso = B5.ESTADO.get("caso")
                if caso:
                    caso.diagnostico()
            finally:
                try:
                    nav.close()
                except Exception:  # noqa: BLE001
                    pass
    falhas_da_base = sum(1 for ok, _ in B5.p.itens if not ok)
    o.ok(falhas_da_base == 0, f"sem erro de página nos casos ({falhas_da_base} aviso(s) da base: {[t for ok, t in B5.p.itens if not ok][:3]})")
    codigo_saida = o.fim()
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return codigo_saida


if __name__ == "__main__":
    sys.exit(main())
