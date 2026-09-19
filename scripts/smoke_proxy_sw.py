#!/usr/bin/env python3
"""Smoke: build de produção (vite preview) apontando pro proxy da API (domínio próprio).

Uso: VITE_SUPABASE_URL=<proxy> npm run build && npx vite preview --port 4173 --strictPort
     SMOKE_PROXY=<mesmo proxy> python3 scripts/smoke_proxy_sw.py [print.png]

Prova, sem login: (1) o service worker novo controla a página; (2) chamada REST pelo proxy cai na
regra NetworkFirst (`supabase-api-cache`); (3) `/auth` pelo proxy NÃO é cacheado (NetworkOnly);
(4) GIF do Storage entra em `exercicios-cache` tanto pelo proxy quanto pelo host direto;
(5) zero erro de console. Tira print da tela inicial como evidência.
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

import os

BASE = os.environ.get("SMOKE_BASE", "http://127.0.0.1:4173")
PROXY = os.environ.get("SMOKE_PROXY", "https://api.physiqcalc.com.br")
DIRETO = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
GIF = "/storage/v1/object/public/exercicios/17e52ced-abc2-41a1-8776-c6162309e306.gif"
PRINT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pc-proxy-gate1.png"

env = (pathlib.Path(__file__).resolve().parent.parent / ".env").read_text(encoding="utf-8")
ANON = re.search(r'VITE_SUPABASE_ANON_KEY="?([^"\s]+)', env).group(1)

passes, falhas = [], []


def checa(nome, cond, detalhe=""):
    (passes if cond else falhas).append(nome)
    print(("  PASS  " if cond else "  FALHA ") + nome + (f" ({detalhe})" if detalhe else ""))


JS_FETCH = """async ([u, k]) => {
  const r = await fetch(u, { headers: { apikey: k, authorization: 'Bearer ' + k } });
  return r.status;
}"""
JS_CACHES = """async () => {
  const out = {};
  for (const n of await caches.keys()) {
    const c = await caches.open(n);
    out[n] = (await c.keys()).map((r) => r.url);
  }
  return out;
}"""

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 412, "height": 915})
    pg = ctx.new_page()
    erros = []
    pg.on("console", lambda m: erros.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: erros.append(str(e)))
    hosts = set()
    pg.on("request", lambda r: hosts.add(r.url.split("/")[2]))

    # O app mantém rede aberta (sync/polling) → "networkidle" nunca chega; espera o SW de verdade.
    pg.set_default_timeout(120000)
    pg.goto(BASE, wait_until="load")
    pg.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
    pg.reload(wait_until="load")
    pg.wait_for_function("() => !!navigator.serviceWorker.controller")
    pg.wait_for_timeout(2000)
    hosts_abertura = set(hosts)  # só o que o app pediu sozinho (antes dos fetches do teste)

    checa("service worker controla a página", pg.evaluate("() => !!navigator.serviceWorker.controller"))

    st_rest = pg.evaluate(JS_FETCH, [PROXY + "/rest/v1/tb_exercicios?select=id&limit=1", ANON])
    checa("REST pelo proxy responde 200", st_rest == 200, f"status {st_rest}")
    st_auth = pg.evaluate(JS_FETCH, [PROXY + "/auth/v1/health", ANON])
    checa("Auth pelo proxy responde 200", st_auth == 200, f"status {st_auth}")
    st_gif_p = pg.evaluate("async (u) => (await fetch(u)).status", PROXY + GIF)
    st_gif_d = pg.evaluate("async (u) => (await fetch(u)).status", DIRETO + GIF)
    checa("GIF do Storage 200 pelo proxy e pelo host direto", st_gif_p == 200 and st_gif_d == 200,
          f"{st_gif_p}/{st_gif_d}")
    pg.wait_for_timeout(1500)

    caches = pg.evaluate(JS_CACHES)
    api = caches.get("supabase-api-cache", [])
    checa("REST pelo proxy entrou no supabase-api-cache (regra nova casou)",
          any(u.startswith(PROXY + "/rest/v1/") for u in api), f"{len(api)} entradas")
    todas = [u for urls in caches.values() for u in urls]
    checa("/auth pelo proxy NÃO foi cacheado (NetworkOnly)",
          not any(u.startswith(PROXY + "/auth/") for u in todas))
    ex = caches.get("exercicios-cache", [])
    checa("GIF pelo proxy no exercicios-cache", any(u.startswith(PROXY + GIF) for u in ex))
    checa("GIF pelo host direto continua no exercicios-cache", any(u.startswith(DIRETO + GIF) for u in ex))
    checa("bundle não chamou o host direto da Supabase na abertura",
          not any(h.endswith("supabase.co") for h in hosts_abertura), f"hosts: {sorted(hosts_abertura)}")
    checa("zero erro de console", not erros, "; ".join(erros)[:300])

    pg.screenshot(path=PRINT, full_page=False)
    print(f"print: {PRINT}")
    print("caches:", {k: len(v) for k, v in caches.items()})
    browser.close()

print(f"\n{len(passes)}/{len(passes) + len(falhas)} PASS")
sys.exit(1 if falhas else 0)
