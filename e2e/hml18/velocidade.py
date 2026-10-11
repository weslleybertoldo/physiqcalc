#!/usr/bin/env python3
"""Physiq hml-18b (H-54, F — 10/10/2026) — E2E da VELOCIDADE no celular, com o Edge (is_mobile + has_touch, 390 × 844).

As medidas da spec (§1.1 e §1.7) e as metas da §2.6 item 6:
  js       o JS de cada abertura (as 60 da spec: personal, nutri, aluna e paciente): a soma do encodedBodySize (o que trafega: br na
           Vercel, gzip no vite preview) e do decodedBodySize dos .js da abertura — a medida do rascunho 3 — SEM a pré-carga da hml-18a
           (o "economia de dados" ligado no navegador: a pré-carga não roda e a abertura conta só o que a TELA pede); e os pedaços
           pesados que a abertura baixou (pdf, xlsx, motor, heic2any, charts, powersync).
  entrada  o index.html (o <script> da entrada e os <link rel=modulepreload>) e o /entrar sem login: sem o powersync (nem o worker).
  lcp      LCP frio × 3 (contexto novo, sem cache; mediana) nas 4 telas da §1.7, com o elemento do LCP, o DCL, quando saiu o 1º pedido
           de dados e quando chegou o último dado antes do LCP (a "cascata de dados" que a §2.6 manda medir, não forçar).
  lh       Lighthouse 13.5.0 × 3 nas 4 públicas (celular padrão, Edge): nota, LCP, TBT, CLS, peso, acessibilidade, o JS sem uso
           no /entrar e se o powersync veio. Só --base staging/prod (local só com --lh-local: o preview não é a Vercel).
  nav      Painel → Alunos até estável (o critério do shell.py: 500 ms sem mudança no DOM e sem pedido), 3 vezes, mediana; e Alunos →
           Treinos com as chamadas admin-semana-treinos (H-82: em cascata ou em paralelo — quando cada uma sai e chega).
--metas: confere as metas da §2.6 item 6 (sem ela, só mede e anota: a linha de base da F0).
Bases: local (o vite preview do build de STAGING em http://localhost:8080) · staging · prod (SÓ LEITURA e SÓ o Lighthouse nas 4 públicas,
sem login — o contrato da 18b).
Saída: hml/hml18/agente/velocidade_<base>[_<partes>].txt + o bruto em velocidade_<base>[_<partes>].jsonl (Lighthouse: agente/lh_18b/).
Sem segredo nem dado pessoal: só KB, ms, nome de pedaço e de atributo.
Uso: python3 e2e/hml18/velocidade.py --base local --canal msedge [--so js,entrada,lcp,nav,lh] [--contas personal,aluna] [--metas]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import shell as S  # noqa: E402  — a troca de página e o "até estável" do shell.py (o mesmo critério)

PARTES = ("entrada", "js", "lcp", "nav", "lh")
PUBLICAS = ("/entrar", "/privacidade", "/entrar/email", "/excluir-conta")
# as 4 telas do LCP da §1.7 (papel, rota) e as metas da §2.6 item 6 (ms)
LCP_TELAS = (("aluna", "/", 3000), ("aluna", "/treino", 4500), ("paciente", "/", 3000), ("personal", "/painel", 5000))
LCP_SPEC = {("aluna", "/"): 4228, ("aluna", "/treino"): 6452, ("paciente", "/"): 3904, ("personal", "/painel"): 7596}
PESADOS = ("pdf", "xlsx", "motor", "heic2any", "charts", "powersync")
SO_NO_CLIQUE = ("pdf", "xlsx", "motor", "heic2any")  # meta: em 0 aberturas
LH_CLI = Path.home() / ".npm" / "_npx" / "1fc4933a57a44b8f" / "node_modules" / "lighthouse" / "cli" / "index.js"
EDGE = "/opt/microsoft/msedge/msedge"
LH_PASTA = B.SAIDA / "lh_18b"

# a pré-carga da hml-18a desligada SÓ na medida do JS da abertura: o usePreCarga respeita o "economia de dados" do aparelho
JS_SEM_PRE_CARGA = r"""(() => { try { Object.defineProperty(Navigator.prototype, 'connection', { configurable: true,
  get() { return { saveData: true, effectiveType: '4g', addEventListener() {}, removeEventListener() {} }; } }); } catch (e) {} })();"""
JS_BUFFER_GRANDE = "try { performance.setResourceTimingBufferSize(20000); } catch (e) {}"
INIT_LCP = r"""(() => { window.__lcp = 0; window.__lcpEl = '-';
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__lcp = e.startTime;
      const el = e.element; window.__lcpEl = el ? (el.tagName.toLowerCase() + '[' + [...el.attributes].map(a => a.name).filter(n => n.startsWith('data-')).slice(0,2).join(',') + ']' + (e.url ? '(img)' : '')) : '-'; } })
    .observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
  window.__cls = 0;
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
    .observe({ type: 'layout-shift', buffered: true }); } catch (e) {} })();"""
# o JS da abertura (só da origem do app), pedaço por pedaço: nome sem o hash, KB que trafega e KB descomprimido
JS_ABERTURA = r"""() => {
  const js = performance.getEntriesByType('resource').filter((e) => /\.m?js(\?|$)/.test(e.name) && e.name.startsWith(location.origin));
  const nome = (u) => u.split('/').pop().split('?')[0];
  const pedacos = js.map((e) => [nome(e.name), +(e.encodedBodySize / 1024).toFixed(1), +(e.decodedBodySize / 1024).toFixed(1)]);
  const nav = performance.getEntriesByType('navigation')[0];
  return { n: js.length, enc: Math.round(js.reduce((s, e) => s + (e.encodedBodySize || 0), 0) / 1024),
    dec: Math.round(js.reduce((s, e) => s + (e.decodedBodySize || 0), 0) / 1024), pedacos,
    dcl: Math.round(nav ? nav.domContentLoadedEventEnd : 0) };
}"""
# o LCP e a cascata de dados (os pedidos aos 2 domínios da API: rest, rpc e funções; o /auth fica de fora — é a sessão)
JS_LCP = r"""() => {
  const api = performance.getEntriesByType('resource').filter((e) => /^https:\/\/api(-principal)?\.physiqcalc\.com\.br\/(rest|functions)\//.test(e.name));
  const lcp = window.__lcp || 0;
  const antes = api.filter((e) => e.responseEnd <= lcp + 1);
  const nav = performance.getEntriesByType('navigation')[0];
  const js = performance.getEntriesByType('resource').filter((e) => /\.m?js(\?|$)/.test(e.name) && e.name.startsWith(location.origin));
  return { lcp: Math.round(lcp), el: window.__lcpEl || '-', cls: +(window.__cls || 0).toFixed(3), dcl: Math.round(nav ? nav.domContentLoadedEventEnd : 0),
    js_fim: Math.round(js.reduce((m, e) => Math.max(m, e.responseEnd), 0)),
    dado1: api.length ? Math.round(Math.min(...api.map((e) => e.startTime))) : -1,
    ultimo_dado: antes.length ? Math.round(Math.max(...antes.map((e) => e.responseEnd))) : -1, pedidos_antes: antes.length, pedidos: api.length };
}"""
# depois da troca Alunos → Treinos: as chamadas admin-semana-treinos que saíram depois do toque (quando saiu e quando chegou cada uma)
JS_SEMANA = r"""() => { const t0 = (window.__r && window.__r.t0) || 0;
  return performance.getEntriesByType('resource').filter((e) => /\/functions\/v1\/admin-semana-treinos/.test(e.name) && e.startTime >= t0)
    .sort((a, b) => a.startTime - b.startTime).map((e) => [Math.round(e.startTime - t0), Math.round(e.responseEnd - t0)]); }"""


def nome_do_pedaco(arquivo: str) -> str:
    """'pdf-Dagy0HsK.js' → 'pdf'; 'index.es-XXXXXXXX.js' → 'index.es'."""
    return re.sub(r"-[A-Za-z0-9_-]{8}\.m?js$", "", arquivo)


def pesados_da_abertura(pedacos: list) -> list[str]:
    """Os pedaços pesados que a abertura baixou (pelo nome do chunk manual e > 100 KB descomprimido: há módulos pequenos com o mesmo
    nome, ex.: o pdf.ts de 3 KB)."""
    return sorted({nome_do_pedaco(p[0]) for p in pedacos if nome_do_pedaco(p[0]) in PESADOS and p[2] > 100})


class Brutos:
    """O bruto (jsonl) da rodada."""

    def __init__(self, caminho: Path) -> None:
        self.caminho = caminho
        caminho.parent.mkdir(parents=True, exist_ok=True)
        self.f = caminho.open("w", encoding="utf-8")

    def gravar(self, d: dict) -> None:
        self.f.write(json.dumps(d, ensure_ascii=False) + "\n")
        self.f.flush()


# ───────────────────────── entrada ─────────────────────────
def ler_html(base: str) -> str:
    req = urllib.request.Request(base + "/entrar", headers={"User-Agent": "physiq-unificado/1.0 (e2e-hml18b)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def medir_entrada(R: B.Rodada, nav, ctx: dict, brutos: Brutos) -> None:
    """O index.html (a entrada e os modulepreload) e o /entrar sem login (o que a página pública baixa de JS)."""
    html = ler_html(ctx["base"])
    entrada = re.findall(r'<script[^>]+type="module"[^>]+src="/assets/([^"]+)"', html)
    pre = re.findall(r'<link[^>]+rel="modulepreload"[^>]+href="/assets/([^"]+)"', html)
    nomes = [nome_do_pedaco(x) for x in entrada + pre]
    R.linha(f"   index.html: entrada {', '.join(nome_do_pedaco(x) for x in entrada)} · modulepreload {', '.join(nome_do_pedaco(x) for x in pre) or '—'}")
    cel = B.Celular(nav, ctx["base"], 390)
    cel.ctx.add_init_script(JS_BUFFER_GRANDE)
    cel.ctx.add_init_script(JS_SEM_PRE_CARGA)
    try:
        cel.ir("/entrar")
        cel.esperar_quieto(minimo=4, quieto=2)
        j = cel.pg.evaluate(JS_ABERTURA)
    finally:
        cel.fim()
    baixou = [p[0] for p in j["pedacos"]]
    sync = [x for x in baixou if re.search(r"powersync|WASQLiteDB|SharedSync|wa-sqlite", x)]
    R.linha(f"   /entrar (sem login): {j['n']} .js · {j['enc']} KB que trafega · {j['dec']} KB descomprimido · do sync: {', '.join(sync) or 'nenhum'}")
    grandes = sorted((p for p in j["pedacos"] if p[2] >= 20), key=lambda p: -p[2])
    R.linha("   /entrar, pedaços ≥ 20 KB (KB trafega/descomprimido): " + " · ".join(f"{nome_do_pedaco(p[0])} {p[1]:.0f}/{p[2]:.0f}" for p in grandes))
    brutos.gravar({"parte": "entrada", "entrada": entrada, "modulepreload": pre, "entrar": j})
    ctx["resumo"]["entrada"] = {"modulepreload": [nome_do_pedaco(x) for x in pre], "enc": j["enc"], "dec": j["dec"], "sync": sync}
    tem_sync = "powersync" in nomes or bool(sync)
    if ctx["metas"]:
        R.ok(not tem_sync, f"a entrada sem o powersync: modulepreload {'COM' if 'powersync' in nomes else 'sem'} powersync · o /entrar baixou "
                           f"{len(sync)} pedaço(s) do sync{' (' + ', '.join(sync) + ')' if sync else ''} (meta: 0)")
    else:
        R.linha(f"   (linha de base) entrada {'COM' if tem_sync else 'sem'} o powersync")


# ───────────────────────── JS por abertura ─────────────────────────
def medir_js(R: B.Rodada, nav, ctx: dict, papeis: list[str], brutos: Brutos) -> None:
    """As aberturas da spec, por conta (1 contexto por conta, sem a pré-carga): o JS que cada uma baixou."""
    linhas: list[dict] = ctx["resumo"].setdefault("js", [])
    for papel in papeis:
        aberturas = [x for x in B.ABERTURAS if x["papel"] == papel]
        if not aberturas:
            continue
        cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
        cel.ctx.add_init_script(JS_BUFFER_GRANDE)
        cel.ctx.add_init_script(JS_SEM_PRE_CARGA)
        try:
            for i, ab in enumerate(aberturas):
                rota = ab["rota"].replace(":aluno", ctx["aluna"])
                try:
                    if i == 0:
                        cel.entrar(ctx["logins"], ctx["contas"][papel], rota)
                    else:
                        cel.ir(rota)
                    cel.esperar_quieto(minimo=4, maximo=30, quieto=2)
                    final = cel.caminho()
                    if final in ("/entrar", "/boas-vindas") and ab["final"] not in ("/entrar", "/boas-vindas"):
                        R.ok(False, f"[{papel} {ab['rota']}] caiu em {final} (sem sessão)")
                        continue
                    j = cel.pg.evaluate(JS_ABERTURA)
                    pes = pesados_da_abertura(j["pedacos"])
                    x = {"papel": papel, "rota": ab["rota"], "enc": j["enc"], "dec": j["dec"], "n": j["n"], "pesados": pes,
                         "painel": ab["rota"].startswith("/painel")}
                    linhas.append(x)
                    brutos.gravar({"parte": "js", **x, "pedacos": j["pedacos"]})
                    R.linha(f"   JS\t{papel}\t{ab['rota']}\t{j['enc']} KB\t{j['dec']} KB dec\t{j['n']} .js\tpesados: {', '.join(pes) or '—'}")
                except Exception as e:  # noqa: BLE001
                    if any(t in str(e) for t in ("Target crashed", "has been closed")):
                        raise
                    R.ok(False, f"[{papel} {ab['rota']}] erro: {type(e).__name__}: {str(e)[:200]}")
            R.ok(not cel.dialogos, f"[{papel} · js] nenhum diálogo nativo do navegador ({cel.dialogos})")
        finally:
            cel.fim(ctx["logins"])


def resumo_js(R: B.Rodada, ctx: dict) -> None:
    """O placar do JS por abertura (a medida da spec) e as metas da §2.6 item 6."""
    linhas = ctx["resumo"].get("js") or []
    if not linhas:
        return
    painel = [x for x in linhas if x["painel"]]
    pers = [x for x in painel if x["papel"] == "personal"]
    app = [x for x in linhas if not x["painel"]]

    def fx(xs: list[dict]) -> str:
        if not xs:
            return "—"
        encs = sorted(x["enc"] for x in xs)
        return (f"{len(xs)} aberturas · > 600 KB: {sum(1 for v in encs if v > 600)} · ≤ 500 KB: {sum(1 for v in encs if v <= 500)} "
                f"({round(100 * sum(1 for v in encs if v <= 500) / len(xs))} %) · mín {encs[0]} · mediana {round(statistics.median(encs))} · máx {encs[-1]} KB")

    R.linha(f"   painel (todas): {fx(painel)}")
    R.linha(f"   painel (personal, as 32 da spec): {fx(pers)}")
    R.linha(f"   app do aluno/paciente: {fx(app)}")
    com_pesado = {p: [f"{x['papel']} {x['rota']}" for x in linhas if p in x["pesados"]] for p in PESADOS}
    for p in PESADOS:
        R.linha(f"   '{p}' na abertura: {len(com_pesado[p])}" + (f" ({'; '.join(com_pesado[p][:6])}{' …' if len(com_pesado[p]) > 6 else ''})" if com_pesado[p] else ""))
    ctx["resumo"]["js_placar"] = {"painel": fx(painel), "personal": fx(pers), "app": fx(app), "pesados": {p: len(v) for p, v in com_pesado.items()}}
    if not ctx["metas"]:
        return
    if painel:
        acima = [f"{x['papel']} {x['rota']} {x['enc']}" for x in painel if x["enc"] > 600]
        R.ok(not acima, f"toda abertura do painel ≤ 600 KB (acima: {len(acima)}{': ' + '; '.join(acima[:5]) if acima else ''})")
        ate500 = sum(1 for x in painel if x["enc"] <= 500)
        R.ok(ate500 >= 0.8 * len(painel), f"≥ 80 % das aberturas do painel ≤ 500 KB ({ate500} de {len(painel)} = {round(100 * ate500 / len(painel))} %)")
    for p in SO_NO_CLIQUE:
        R.ok(not com_pesado[p], f"'{p}' em 0 aberturas ({len(com_pesado[p])})")
    pain_sync = [x for x in painel if "powersync" in x["pesados"]]
    R.ok(not pain_sync, f"o painel sem o powersync ({len(pain_sync)} aberturas com ele)")


# ───────────────────────── LCP ─────────────────────────
def medir_lcp(R: B.Rodada, nav, ctx: dict, papeis: list[str], brutos: Brutos) -> None:
    """LCP frio × 3 (contexto novo a cada vez: sem cache), com a pré-carga como ela é."""
    for papel, rota, meta in LCP_TELAS:
        if papel not in papeis:
            continue
        vals: list[dict] = []
        for k in range(3):
            cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
            cel.ctx.add_init_script(JS_BUFFER_GRANDE)
            cel.ctx.add_init_script(INIT_LCP)
            try:
                cel.entrar(ctx["logins"], ctx["contas"][papel], rota)
                cel.esperar_quieto(minimo=8, maximo=35, quieto=3)
                j = cel.pg.evaluate(JS_LCP)
                j["final"] = cel.caminho()
                vals.append(j)
                R.linha(f"   LCP\t{papel}\t{rota}\t{k + 1}\tlcp={j['lcp']}\tel={j['el']}\tdcl={j['dcl']}\tjs até {j['js_fim']}\t1º dado sai {j['dado1']}"
                        f"\túltimo dado antes do LCP {j['ultimo_dado']} ({j['pedidos_antes']} de {j['pedidos']} pedidos)\tCLS {j['cls']}\tfinal {j['final']}")
            finally:
                cel.fim(ctx["logins"])
        med = round(statistics.median([v["lcp"] for v in vals])) if vals else -1
        brutos.gravar({"parte": "lcp", "papel": papel, "rota": rota, "rodadas": vals, "mediana": med})
        ctx["resumo"].setdefault("lcp", []).append({"papel": papel, "rota": rota, "mediana": med, "valores": [v["lcp"] for v in vals],
                                                    "el": vals[-1]["el"] if vals else "-", "meta": meta,
                                                    "dado": [v["ultimo_dado"] for v in vals], "dcl": [v["dcl"] for v in vals]})
        texto = (f"LCP frio [{papel} {rota}]: mediana {med} ms de {[v['lcp'] for v in vals]} (meta ≤ {meta}; spec {LCP_SPEC[(papel, rota)]}) · "
                 f"elemento {vals[-1]['el'] if vals else '-'} · o último dado antes do LCP chegou em {[v['ultimo_dado'] for v in vals]} ms · DCL {[v['dcl'] for v in vals]}")
        if ctx["metas"]:
            R.ok(len(vals) == 3 and med <= meta, texto)
        else:
            R.linha("   " + texto)


# ───────────────────────── Lighthouse ─────────────────────────
def rodar_lighthouse(url: str, saida: Path) -> dict:
    cmd = ["node", str(LH_CLI), url, "--output=json", f"--output-path={saida}", "--only-categories=performance,accessibility",
           f"--chrome-path={EDGE}", "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage", "--quiet",
           "--max-wait-for-load=60000"]
    # o Lighthouse 13 acha o navegador pela variável CHROME_PATH (o --chrome-path sozinho não basta): o Edge, como na medição da spec
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=300, env={**os.environ, "CHROME_PATH": EDGE})
    if p.returncode != 0 or not saida.exists():
        linhas = [x for x in (p.stderr or p.stdout or "").splitlines() if x.strip() and not x.lstrip().startswith("at ")]
        return {"erro": " | ".join(linhas[:2])[:300]}
    d = json.loads(saida.read_text(encoding="utf-8"))
    a = d["audits"]
    sem_uso = (a.get("unused-javascript", {}).get("details") or {})
    rede = (a.get("network-requests", {}).get("details") or {}).get("items") or []
    js = [i["url"].split("/")[-1] for i in rede if i.get("resourceType") == "Script"]
    return {"nota": round((d["categories"]["performance"]["score"] or 0) * 100), "a11y": round((d["categories"]["accessibility"]["score"] or 0) * 100),
            "lcp": round(a["largest-contentful-paint"]["numericValue"]), "tbt": round(a["total-blocking-time"]["numericValue"]),
            "cls": round(a["cumulative-layout-shift"]["numericValue"], 3), "peso": round(a["total-byte-weight"]["numericValue"] / 1024),
            "sem_uso_kib": round((sem_uso.get("overallSavingsBytes") or 0) / 1024),
            "sem_uso": [(nome_do_pedaco(i["url"].split("/")[-1]), round(i["wastedBytes"] / 1024)) for i in (sem_uso.get("items") or [])[:6]],
            "sync": [x for x in js if re.search(r"powersync|WASQLiteDB|SharedSync|wa-sqlite", x)], "final": d.get("finalDisplayedUrl", "")}


def medir_lh(R: B.Rodada, ctx: dict, prefixo: str, brutos: Brutos, rodadas: int = 3) -> None:
    LH_PASTA.mkdir(parents=True, exist_ok=True)
    if not LH_CLI.exists():
        R.ok(False, f"Lighthouse não achado em {LH_CLI}")
        return
    for pagina in PUBLICAS:
        rs = []
        for k in range(rodadas):
            saida = LH_PASTA / f"{prefixo}_{pagina.strip('/').replace('/', '_')}_{k + 1}.json"
            r = rodar_lighthouse(ctx["base"] + pagina, saida)
            if "erro" in r:
                R.linha(f"   LH\t{pagina}\t{k + 1}\terro: {r['erro']}")
                continue
            rs.append(r)
            R.linha(f"   LH\t{pagina}\t{k + 1}\tnota {r['nota']}\tLCP {r['lcp']} ms\tTBT {r['tbt']} ms\tCLS {r['cls']}\tpeso {r['peso']} KB\ta11y {r['a11y']}"
                    f"\tJS sem uso {r['sem_uso_kib']} KiB\tsync {len(r['sync'])}")
        if not rs:
            R.ok(False, f"Lighthouse {pagina}: nenhuma rodada")
            continue
        med = {k: statistics.median([r[k] for r in rs]) for k in ("nota", "lcp", "tbt", "cls", "peso", "a11y", "sem_uso_kib")}
        brutos.gravar({"parte": "lh", "pagina": pagina, "rodadas": rs, "mediana": med})
        ctx["resumo"].setdefault("lh", []).append({"pagina": pagina, **med, "notas": [r["nota"] for r in rs], "sync": max(len(r["sync"]) for r in rs),
                                                   "sem_uso": rs[0]["sem_uso"]})
        texto = (f"Lighthouse {pagina}: nota {med['nota']:.0f} ({'/'.join(str(r['nota']) for r in rs)}) · LCP {med['lcp'] / 1000:.1f} s · TBT {med['tbt']:.0f} ms · "
                 f"CLS {med['cls']} · peso {med['peso']:.0f} KB · a11y {med['a11y']:.0f} · JS sem uso {med['sem_uso_kib']:.0f} KiB "
                 f"({', '.join(f'{n} {v}' for n, v in rs[0]['sem_uso'])}) · sync {max(len(r['sync']) for r in rs)}")
        if ctx["metas"] and ctx["lh_metas"]:
            R.ok(med["nota"] >= 82 and med["tbt"] <= 300 and (pagina != "/entrar" or med["sem_uso_kib"] <= 150),
                 texto + " (metas: nota ≥ 82, TBT ≤ 300 ms; /entrar: JS sem uso ≤ 150 KiB)")
        else:
            R.linha("   " + texto)


# ───────────────────────── Painel → Alunos e Alunos → Treinos ─────────────────────────
def medir_nav(R: B.Rodada, nav, ctx: dict, brutos: Brutos) -> None:
    """personal (390): 3 × (Painel → Alunos → Treinos), com a pré-carga já feita (o jeito do shell.py)."""
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    cel.ctx.add_init_script(S.JS_BUFFER_GRANDE)
    cel.ctx.add_init_script(S.JS_FETCH_MARCA)
    pa: list[dict] = []
    at: list[dict] = []
    try:
        cel.entrar(ctx["logins"], ctx["contas"]["personal"], "/painel")
        cel.esperar_quieto()
        S.esperar_pre_carga(R, cel, ["Alunos", "Treinos"], "[personal]")
        for vez in range(3):
            cel.ir("/painel")
            cel.esperar_quieto(minimo=2.5, quieto=1.5)
            r1 = S.trocar(R, cel, "", "/painel/alunos", "Alunos", False, ctx, pre_carregado=True, checar=False)
            if r1:
                pa.append(r1)
            r2 = S.trocar(R, cel, "", "/painel/treinos", "Treinos", False, ctx, pre_carregado=True, checar=False)
            if r2:
                r2["semana"] = cel.pg.evaluate(JS_SEMANA)
                at.append(r2)
            R.linha(f"   NAV {vez + 1}: Painel → Alunos até estável {round(r1['ultima']) if r1 else '—'} ms (1º pedido {r1['pedido1'] if r1 else '—'} ms) · "
                    f"Alunos → Treinos até estável {round(r2['ultima']) if r2 else '—'} ms (1º pedido {r2['pedido1'] if r2 else '—'} ms; "
                    f"admin-semana-treinos [saiu, chegou] {r2['semana'] if r2 else '—'})")
    finally:
        cel.fim(ctx["logins"])
    med = lambda xs, k: round(statistics.median([x[k] for x in xs])) if xs else -1  # noqa: E731
    brutos.gravar({"parte": "nav", "painel_alunos": [{k: x[k] for k in ("ultima", "pedido1", "fetch1", "mudou")} for x in pa],
                   "alunos_treinos": [{k: x.get(k) for k in ("ultima", "pedido1", "fetch1", "mudou", "semana")} for x in at]})
    ctx["resumo"]["nav"] = {"painel_alunos": [round(x["ultima"]) for x in pa], "alunos_treinos": [round(x["ultima"]) for x in at],
                            "semana": [x.get("semana") for x in at]}
    texto = f"Painel → Alunos até estável: mediana {med(pa, 'ultima')} ms de {[round(x['ultima']) for x in pa]} (spec: 664 no staging; meta ≤ 700)"
    if ctx["metas"]:
        R.ok(len(pa) == 3 and med(pa, "ultima") <= 700, texto)
    else:
        R.linha("   " + texto)
    cascata = [s for s in (x.get("semana") or [] for x in at) if len(s) >= 2]
    em_cascata = sum(1 for s in cascata if s[1][0] >= s[0][1] - 5)
    R.linha(f"   Alunos → Treinos até estável: mediana {med(at, 'ultima')} ms de {[round(x['ultima']) for x in at]} · admin-semana-treinos: "
            f"{len(cascata)} trocas com 2+ chamadas, {em_cascata} em cascata (a 2ª sai depois de a 1ª chegar)")
    ctx["resumo"]["nav"]["semana_cascata"] = f"{em_cascata}/{len(cascata)}"


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18b — E2E da velocidade (H-54, F)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod (SÓ o Lighthouse nas públicas) | <url>")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--so", default="", help=f"partes, com vírgula: {','.join(PARTES)} (padrão: todas as da base)")
    ap.add_argument("--contas", default="personal,nutri,aluna,paciente", help="papéis do js/lcp: personal,nutri,aluna,paciente")
    ap.add_argument("--metas", action="store_true", help="confere as metas da §2.6 item 6 (sem ela: só mede — linha de base)")
    ap.add_argument("--lh-local", action="store_true", help="o Lighthouse também no local (só indicativo: o preview serve gzip, não br)")
    ap.add_argument("--lh-rodadas", type=int, default=3)
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    partes = [p.strip() for p in a.so.split(",") if p.strip()] or list(PARTES)
    if set(partes) - set(PARTES):
        raise SystemExit(f"partes: {', '.join(PARTES)}")
    if producao and prefixo == "prod":
        partes = [p for p in partes if p == "lh"]  # produção: SÓ o Lighthouse nas 4 públicas, sem login (o contrato da 18b)
    if prefixo == "local" and not a.lh_local:
        partes = [p for p in partes if p != "lh"]
    papeis = [p.strip() for p in a.contas.split(",") if p.strip()]
    nome = f"velocidade_{prefixo}" + ("" if a.so == "" else "_" + "_".join(partes))
    R = B.Rodada(nome)
    brutos = Brutos(B.SAIDA / f"{nome}.jsonl")
    R.linha(f"base {base} · {'PRODUÇÃO, só leitura' if producao else 'schema staging'} · canal {a.canal} · partes {', '.join(partes) or '—'} · "
            f"papéis {', '.join(papeis)} · {'COM as metas' if a.metas else 'só medida (linha de base)'}")
    contas = B.CONTAS_DA_BASE["prod" if producao else "staging"]
    L = B.Logins(f"velocidade.py {nome}")
    ctx = {"base": base, "prefixo": prefixo, "producao": producao, "contas": contas, "logins": L, "aluna": "", "metas": a.metas,
           "lh_metas": prefixo != "local", "guarda": B.B17.Guarda() if producao else None, "resumo": {}}
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    args = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    with sync_playwright() as pw:
        try:
            com_navegador = [p for p in partes if p != "lh"]
            ok_build = True
            if com_navegador:
                nav = pw.chromium.launch(channel=a.canal, args=args)
                try:
                    ok_build = B.conferir_build(R, nav, base, producao)
                finally:
                    nav.close()
            if ok_build and "entrada" in partes:
                R.linha("\n## entrada (o que toda página baixa)")
                nav = pw.chromium.launch(channel=a.canal, args=args)
                try:
                    medir_entrada(R, nav, ctx, brutos)
                finally:
                    nav.close()
            if ok_build and "js" in partes:
                R.linha("\n## JS por abertura (sem a pré-carga)")
                ctx["aluna"] = B.matricula(contas["aluna"])
                for papel in papeis:
                    nav = pw.chromium.launch(channel=a.canal, args=args)
                    try:
                        medir_js(R, nav, ctx, [papel], brutos)
                    except Exception as e:  # noqa: BLE001
                        R.ok(False, f"[{papel} · js] o navegador caiu: {type(e).__name__}: {str(e)[:200]}")
                    finally:
                        try:
                            nav.close()
                        except Exception:  # noqa: BLE001
                            pass
                resumo_js(R, ctx)
            if ok_build and "lcp" in partes:
                R.linha("\n## LCP frio × 3 (mediana)")
                nav = pw.chromium.launch(channel=a.canal, args=args)
                try:
                    medir_lcp(R, nav, ctx, papeis, brutos)
                finally:
                    nav.close()
            if ok_build and "nav" in partes and "personal" in papeis:
                R.linha("\n## Painel → Alunos → Treinos (personal, 390, 3 vezes)")
                nav = pw.chromium.launch(channel=a.canal, args=args)
                try:
                    medir_nav(R, nav, ctx, brutos)
                finally:
                    nav.close()
            if "lh" in partes:
                R.linha(f"\n## Lighthouse × {a.lh_rodadas} nas 4 públicas (sem login)")
                medir_lh(R, ctx, prefixo, brutos, a.lh_rodadas)
        finally:
            L.fechar(R)
    (B.SAIDA / f"{nome}_resumo.json").write_text(json.dumps(ctx["resumo"], ensure_ascii=False, indent=1), encoding="utf-8")
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
