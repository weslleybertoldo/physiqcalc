#!/usr/bin/env python3
"""Physiq hml-18b (H-54, F5 — 10/10/2026) — os PRINTS da velocidade, com o Edge (celular, 390 × 844), contas de TESTE, só leitura.

  esqueleto/pronta  as 4 telas do LCP da §1.7 (aluna Início e Treino, paciente Início, personal Dashboard): o esqueleto do conteúdo ANTES
                    dos dados e a mesma tela pronta. Os dados da tela são SEGURADOS no navegador (o fetch embrulhado antes do 1º documento
                    devolve a resposta só depois de alguns segundos) — a sessão (pos-login, minha_situacao, auth) passa na hora; no
                    Treino, a troca de token do Treino é a segurada (o lugar da aba com o título enquanto ela não chega). Confere na
                    hora do print: o esqueleto à vista, SEM a tela cheia de carregando; e, pronta, sem esqueleto.
  pdf               o botão "Baixar" do 1º impresso (nutri · Painel › Impressos) GIRANDO enquanto o pedaço do PDF chega (latência de rede
                    pelo CDP só no instante do clique): [data-gerando-pdf] + aria-busy no botão.
  kpi               o KPI com o valor longo ("R$ 123.456,78") no Dashboard do personal, a 390 e a 360 (H-85: sem a linha por baixo).
  chunks            o relatório da guarda de chunks (o f_chunks da spec, texto) do build servido (local: o dist/).
Saída: ~/projetos/physiqcalc-scratch/prints/hml18b/<base>_<caso>_<largura>.png (+ <base>_f_chunks.txt) e o placar em hml/hml18/agente/.
Uso: python3 e2e/hml18/prints_18b.py --base local --canal msedge [--so esqueleto,pdf,kpi,chunks]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

PRINTS = B.SCRATCH / "prints" / "hml18b"
PARTES = ("esqueleto", "pdf", "kpi", "chunks")
SEGURAR_MS = 6000
# o fetch embrulhado: segura a RESPOSTA dos dados da tela por SEGURAR_MS (a sessão passa). `alvo`: "dados" (rest e funções, menos a
# sessão) ou "troca" (só a troca de token do Treino).
JS_SEGURAR = r"""(([alvo, ms]) => { const f = window.fetch; if (!f || f.__hml18b) return;
  const sessao = /\/functions\/v1\/pos-login|\/rest\/v1\/rpc\/minha_situacao|\/auth\/v1\//;
  const dados = /^https:\/\/api(-principal)?\.physiqcalc\.com\.br\/(rest|functions)\//;
  const segura = (u) => alvo === 'troca' ? /\/functions\/v1\/trocar-token/.test(u) : dados.test(u) && !sessao.test(u);
  window.__segurados = 0;
  const g = async function (...a) { const u = String((a[0] && a[0].url) || a[0] || ''); const r = await f.apply(this, a);
    if (segura(u)) { window.__segurados++; await new Promise((ok) => setTimeout(ok, ms)); } return r; };
  g.__hml18b = true; window.fetch = g; })"""
# o que está na tela: tela cheia de carregando, esqueletos à vista (o conteúdo principal) e o h1
JS_ESTADO = r"""() => { const vis = (e) => e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  // o hero do treino do Início depende do PowerSync, que o build de STAGING não tem (H-14): o esqueleto dele não conta (vai à parte)
  const n = (s) => [...document.querySelectorAll(s)].filter((e) => vis(e) && !e.closest('[data-card-treino-hoje]')).length;
  const hero = document.querySelector('[data-card-treino-hoje]');
  const h1 = [...document.querySelectorAll('h1')].find(vis);
  return { telaCheia: n('[data-carregando-tela]'), esqueletos: n('.animate-pulse, [data-estado=carregando], [data-kpi-carregando], [data-espera-sessao-treino], [data-card-consulta=carregando], [data-card-peso=carregando]'),
    h1: h1 ? h1.textContent.trim().slice(0, 30) : '', segurados: window.__segurados || 0, caminho: location.pathname,
    heroTreino: hero ? hero.getAttribute('data-card-treino-hoje') : null }; }"""
TELAS = (("aluna", "/", "dados", "esqueleto_inicio_aluna"), ("aluna", "/treino", "troca", "esqueleto_treino"),
         ("paciente", "/", "dados", "esqueleto_inicio_paciente"), ("personal", "/painel", "dados", "esqueleto_dashboard"))


def print_(cel: B.Celular, prefixo: str, caso: str) -> str:
    PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = PRINTS / f"{prefixo}_{caso}_{cel.largura}.png"
    cel.pg.screenshot(path=str(caminho))
    return str(caminho)


def esqueletos(R: B.Rodada, nav, ctx: dict) -> None:
    for papel, rota, alvo, caso in TELAS:
        cel = B.Celular(nav, ctx["base"], 390)
        cel.ctx.add_init_script(script=f"({JS_SEGURAR})({json.dumps([alvo, SEGURAR_MS])})")
        try:
            cel.entrar(ctx["logins"], ctx["contas"][papel], rota)
            # o esqueleto: a casca já saiu da tela cheia e os dados ainda estão segurados
            viu = cel.esperar(lambda: (lambda e: e["telaCheia"] == 0 and e["esqueletos"] > 0 and e["segurados"] > 0)(cel.pg.evaluate(JS_ESTADO)), 20, passo=0.1)
            cel.pg.wait_for_timeout(250)
            e1 = cel.pg.evaluate(JS_ESTADO)
            p1 = print_(cel, ctx["prefixo"], caso)
            R.linha(f"   print: {p1}")
            R.ok(viu and e1["telaCheia"] == 0 and e1["esqueletos"] > 0,
                 f"[{papel} {rota}] o esqueleto ANTES dos dados: {e1['esqueletos']} esqueleto(s), 0 tela cheia ({e1['telaCheia']}), h1 "
                 f"\"{e1['h1'] or '—'}\" · {e1['segurados']} resposta(s) de dados seguradas")
            # pronta: os dados soltos, a tela quieta e sem esqueleto do conteúdo principal. No Treino do build de staging não há PowerSync
            # (H-14): "pronta" = a aba montada depois da troca (o "Baixando o seu treino…" do 1º sync fica, por desenho do staging)
            treino = rota == "/treino"
            pronta = (lambda: cel.tem("[data-aba-treino]") and not cel.tem("[data-espera-sessao-treino]")) if treino else (lambda: cel.pg.evaluate(JS_ESTADO)["esqueletos"] == 0)
            cel.esperar(pronta, SEGURAR_MS / 1000 + 25, passo=0.25)
            cel.esperar_quieto(minimo=1.5, maximo=25, quieto=1.5)
            e2 = cel.pg.evaluate(JS_ESTADO)
            p2 = print_(cel, ctx["prefixo"], caso.replace("esqueleto", "pronta"))
            R.linha(f"   print: {p2}")
            if treino:
                R.ok(e2["telaCheia"] == 0 and pronta() and e2["h1"] == "Treino",
                     f"[{papel} {rota}] a aba PRONTA depois da troca (o título no mesmo lugar; sem PowerSync no staging, o 1º sync não acaba): "
                     f"h1 \"{e2['h1'] or '—'}\", 0 tela cheia")
            else:
                R.ok(e2["telaCheia"] == 0 and e2["esqueletos"] == 0 and e2["caminho"] == rota,
                     f"[{papel} {rota}] a mesma tela PRONTA: 0 esqueleto ({e2['esqueletos']}), 0 tela cheia, h1 \"{e2['h1'] or '—'}\""
                     + (f" · o hero do treino: {e2['heroTreino']} (sem PowerSync no build de staging, ele não sai do carregando)" if e2.get("heroTreino") else ""))
        except Exception as e:  # noqa: BLE001
            R.ok(False, f"[{papel} {rota}] {type(e).__name__}: {str(e)[:200]}")
        finally:
            cel.fim(ctx["logins"])


def pdf(R: B.Rodada, nav, ctx: dict) -> None:
    """O botão do PDF girando: a latência de rede (CDP) só no instante do clique — o pedaço do PDF (~190 KB br) chega devagar."""
    cel = B.Celular(nav, ctx["base"], 390)
    try:
        cel.entrar(ctx["logins"], ctx["contas"]["nutri"], "/painel/impressos")
        cel.esperar(lambda: cel.tem("[data-btn-baixar]"), 30)
        cel.esperar_quieto(minimo=2, quieto=1.5)
        ja = cel.pg.evaluate(r"""() => performance.getEntriesByType('resource').some((r) => /\/assets\/pdf-[A-Za-z0-9_-]{8}\.js/.test(r.name) && r.decodedBodySize > 100000)""")
        R.ok(not ja, f"Impressos abriu SEM o pedaço pesado do PDF ({'JÁ VEIO' if ja else 'não veio'})")
        cdp = cel.ctx.new_cdp_session(cel.pg)
        cdp.send("Network.enable")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 2500, "downloadThroughput": 200 * 1024, "uploadThroughput": 200 * 1024})
        botao = cel.pg.locator("[data-btn-baixar]").first
        botao.scroll_into_view_if_needed()
        botao.click(timeout=8000)
        cel.pg.wait_for_timeout(400)
        estado = cel.pg.evaluate("""() => { const b = document.querySelector('[data-gerando-pdf]');
          return b ? { busy: b.getAttribute('aria-busy'), gira: !!b.querySelector('.animate-spin, svg[class*=animate-spin]') || /animate-spin/.test(b.className), texto: b.textContent.trim() } : null; }""")
        p = print_(cel, ctx["prefixo"], "pdf_spinner")
        R.linha(f"   print: {p}")
        R.ok(bool(estado) and estado["busy"] == "true" and estado["gira"], f"o botão do PDF gira enquanto o pedaço chega: {estado}")
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 0, "downloadThroughput": -1, "uploadThroughput": -1})
        acabou = cel.esperar(lambda: not cel.tem("[data-gerando-pdf]"), 40)
        R.ok(acabou, "depois o botão volta (o PDF saiu e o spinner some)")
    finally:
        cel.fim(ctx["logins"])


JS_KPI_LONGO = r"""([valor]) => { const vs = [...document.querySelectorAll('[data-kpi] > [data-kpi-valor]')].filter((e) => e.getClientRects().length);
  for (const v of vs) v.textContent = valor; return vs.length; }"""
JS_KPI_LINHA = r"""() => [...document.querySelectorAll('[data-kpi]')].filter((c) => c.getClientRects().length).map((c) => {
  const v = c.querySelector('[data-kpi-valor]'); const l = c.querySelector('[data-kpi-linha]'); const lr = l && l.getClientRects().length ? l.getBoundingClientRect() : null;
  const rg = document.createRange(); rg.selectNodeContents(v); const tr = rg.getBoundingClientRect();
  return { linha: !!lr, sobrepoe: !!lr && tr.right > lr.left + 1 && tr.left < lr.right - 1 && tr.bottom > lr.top + 1 && tr.top < lr.bottom - 1 }; })"""


def kpi(R: B.Rodada, nav, ctx: dict) -> None:
    cel = B.Celular(nav, ctx["base"], 390)
    try:
        cel.entrar(ctx["logins"], ctx["contas"]["personal"], "/painel")
        cel.esperar(lambda: cel.pg.locator("[data-kpi] > [data-kpi-valor]").count() > 0, 30)
        cel.esperar_quieto(minimo=2, quieto=1.5)
        for largura in (390, 360):
            cel.tamanho(largura)
            cel.pg.wait_for_timeout(600)
            n = cel.pg.evaluate(JS_KPI_LONGO, ["R$ 123.456,78"])
            cel.pg.locator("[data-kpis-dashboard]").first.scroll_into_view_if_needed()
            cel.pg.wait_for_timeout(300)
            k = cel.pg.evaluate(JS_KPI_LINHA)
            p = print_(cel, ctx["prefixo"], "kpi_longo")
            R.linha(f"   print: {p}")
            R.ok(n > 0 and not any(x["sobrepoe"] for x in k),
                 f"KPI longo a {largura}: {n} valores \"R$ 123.456,78\", {sum(1 for x in k if x['sobrepoe'])} passando por baixo da linha de tendência "
                 f"({sum(1 for x in k if x['linha'])} com a linha à vista)")
    finally:
        cel.fim(ctx["logins"])


def chunks(R: B.Rodada, ctx: dict) -> None:
    PRINTS.mkdir(parents=True, exist_ok=True)
    saida = PRINTS / f"{ctx['prefixo']}_f_chunks.txt"
    p = subprocess.run(["node", str(B.REPO / "scripts" / "ci" / "checar-chunks.mjs"), str(B.REPO / "dist")], capture_output=True, text=True, timeout=120)
    saida.write_text(p.stdout + p.stderr, encoding="utf-8")
    R.linha(f"   relatório: {saida}")
    R.ok(p.returncode == 0, f"a guarda de chunks no build servido: {(p.stdout.strip().splitlines() or ['—'])[-1][:200]}")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18b — os prints da velocidade (F5)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--so", default="", help=f"partes: {','.join(PARTES)}")
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    if producao:
        raise SystemExit("os prints da 18b são do local e do staging (a produção é da sessão principal, só leitura)")
    partes = [p.strip() for p in a.so.split(",") if p.strip()] or list(PARTES)
    R = B.Rodada(f"prints_18b_{prefixo}")
    R.linha(f"base {base} · partes {', '.join(partes)} · prints em {PRINTS}")
    ctx = {"base": base, "prefixo": prefixo, "contas": B.CONTAS_DA_BASE["staging"], "logins": B.Logins(f"prints_18b.py {prefixo}")}
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            if not B.conferir_build(R, nav, base, producao):
                return R.fim()
            if "esqueleto" in partes:
                esqueletos(R, nav, ctx)
            if "pdf" in partes:
                pdf(R, nav, ctx)
            if "kpi" in partes:
                kpi(R, nav, ctx)
            if "chunks" in partes and prefixo == "local":
                chunks(R, ctx)
        finally:
            ctx["logins"].fechar(R)
            nav.close()
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
