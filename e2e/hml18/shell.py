#!/usr/bin/env python3
"""Physiq hml-18 (H-40, E e C — 10/10/2026) — E2E da CASCA e do TOQUE no celular, com o Edge (is_mobile + has_touch, 390 × 844).

  --so toque  (hml-18a, F3 — C) em cada abertura (as 60 da spec + as 11 do master no staging/local; --rapido: as 10 do fluxo da spec —
              Dashboard, Alunos, Treinos, Agenda e Financeiro do personal e as 5 abas da aluna):
                · 100 % dos tocáveis visíveis com uma regra :active do CSS (a medida da spec, com a lista de seletores partida só nas
                  vírgulas de fora; fora da conta só o que não é tocável agora: :disabled, aria-disabled e as alças de arrastar);
                · transitionDuration ≠ 0s em todo Botao (.pq-botao), BotaoIcone (.pq-ibtn), item da barra ([data-tabbar]) e aba
                  ([role=tab]) — com o "reduzir movimento" do sistema também (reducedMotion 'reduce'): nada pode zerar;
                · a base: touch-action manipulation no tocável e overscroll-behavior-y contain no html e no body (era auto/auto);
              e o print c_toque (a aluna no Início com um item da barra pressionado: opacidade e escala do :active, medidas na hora).
  --so nav    (hml-18a, F5 — E) a troca de página, normal e com o "reduzir movimento": painel (personal) Dashboard → Alunos →
              Treinos → Agenda (pelo "Mais") → Financeiro; app (aluna) as 5 abas × 2 voltas. Em cada troca: a barra é o MESMO nó
              (isConnected), 0 [data-carregando-tela], a 1ª mudança ≤ 100 ms depois do toque (o relógio começa no click, na página),
              (a 1ª PINTURA também é anotada: Event Timing do click — no notebook sem GPU ela soma a rasterização), a página nova entra animada ([data-pagina] novo com animationName "enter", também com reduzir), o pedaço da página
              já baixado ANTES do toque (a pré-carga, depois do 1º render: performance.getEntriesByType('resource')) e 0 JS novo
              na troca; e as medidas da spec: Painel→Alunos até estável ≤ 700 ms, Alunos→Treinos o 1º pedido ≤ 150 ms depois do
              toque. Print e_troca: o personal em Alunos → Treinos aos 150 ms (barra + esqueleto + topo, sem tela cheia).
Bases: --base local (o vite preview do build de STAGING em http://localhost:8080) · staging · prod (SÓ LEITURA: a Guarda no navegador,
as contas de teste de lá, sem o master; só lê estilos — nenhum toque que grave).
Saída: hml/hml18/agente/shell_<base>[_toque][_<papéis>].txt. O placar vai para o e2e-rodadas.tsv (Placar.fim()).
Uso: python3 e2e/hml18/shell.py --base local --canal msedge --so toque [--contas personal,nutri,aluna,paciente,master] [--rapido]
"""
from __future__ import annotations

import argparse
import re
import statistics
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

RAPIDO = {
    "personal": ("/painel", "/painel/alunos", "/painel/treinos", "/painel/agenda", "/painel/financeiro"),
    "aluna": ("/", "/treino", "/dieta", "/evolucao", "/perfil"),
}
GRUPOS = (("botao", "Botao"), ("botao_icone", "BotaoIcone"), ("barra", "itens da barra"), ("abas", "abas"))
MODOS = (("no-preference", "normal"), ("reduce", "reduzir"))
# a troca de página no painel (o "Mais" abre a folha e o link da Agenda fica nela) e no app (as 5 abas, 2 voltas)
NAV_PAINEL = (("/painel/alunos", "Alunos", False), ("/painel/treinos", "Treinos", False), ("/painel/agenda", "Agenda", True),
              ("/painel/financeiro", "Financeiro", False))
# o buffer do Resource Timing (250 por padrão) enche com a pré-carga: sem isto, os pedidos da troca não entram em getEntries
JS_BUFFER_GRANDE = "try { performance.setResourceTimingBufferSize(20000); } catch (e) {}"
# quando o app CHAMA o fetch (antes da rede: a pré-verificação CORS e o envio entram no startTime do Resource Timing, não aqui) —
# embrulhado antes do 1º documento, para o cliente do Supabase pegar este fetch
JS_FETCH_MARCA = r"""(() => { const f = window.fetch; if (!f || f.__hml18) return;
  const g = function (...a) { const r = window.__r; if (r && r.t0 && r.fetch1 < 0) { const u = String((a[0] && a[0].url) || a[0] || '');
    if (/api(-principal)?\.physiqcalc\.com\.br/.test(u)) r.fetch1 = Math.round(performance.now() - r.t0); } return f.apply(this, a); };
  g.__hml18 = true; window.fetch = g; })();"""
NAV_APP = (("/treino", "Treino"), ("/dieta", "Dieta"), ("/evolucao", "Evolucao"), ("/perfil", "Perfil"), ("/", "Inicio"))

# antes do toque: as barras (a de baixo e o menu lateral) e a página de agora; o relógio começa no click (fase de captura, na página)
JS_NAV_ARMAR = r"""() => {
  const g = (window.__g || 0) + 1; window.__g = g; if (window.__obs) window.__obs.disconnect();
  const vis = (e) => e && e.getClientRects().length;
  window.__barras = [...document.querySelectorAll('[data-tabbar], aside[data-menu-lateral]')].filter(vis);  // (a Agenda tem um <aside> dela)
  const pag0 = document.querySelector('[data-pagina]');
  const js0 = new Set(performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\.js(\?|$)/.test(n)));
  window.__r = { t0: 0, mudou: -1, ultima: 0, barraSumiu: 0, telaCheia: 0, esqueleto: 0, pagina: '', anima: '-', dur: 0, paginaNova: 0, jsNovos: [], pedido1: -1, fetch1: -1 };
  window.__js0 = js0;
  window.__r.longas = 0; window.__r.nLongas = 0; window.__r.pinta = -1;
  // a 1ª pintura depois do toque (Event Timing do click — o startTime dele é a hora do toque, até uns ms antes do t0; a entrada só
  // vem com ≥ 16 ms: sem ela, pintou antes disso)
  if (window.__obsEv) window.__obsEv.disconnect();
  try { window.__obsEv = new PerformanceObserver((l) => { const r = window.__r; if (!r.t0) return;
      for (const e of l.getEntries()) if (e.name === 'click' && e.startTime >= r.t0 - 50 && r.pinta < 0) r.pinta = Math.round(e.startTime + e.duration - r.t0); });
    window.__obsEv.observe({ type: 'event', durationThreshold: 16, buffered: false }); } catch (e) {}
  if (window.__obsLongas) window.__obsLongas.disconnect();
  try { window.__obsLongas = new PerformanceObserver((l) => { const r = window.__r; if (!r.t0) return;
      for (const e of l.getEntries()) if (e.startTime + e.duration >= r.t0 && e.startTime - r.t0 < 2000) { r.longas += Math.round(e.duration); r.nLongas++; } });
    window.__obsLongas.observe({ type: 'longtask', buffered: false }); } catch (e) {}
  const aoClicar = () => { if (!window.__r.t0) window.__r.t0 = performance.now(); };
  document.addEventListener('click', aoClicar, { capture: true, once: true });
  window.__obs = new MutationObserver(() => { const r = window.__r; if (!r.t0) return; const a = performance.now() - r.t0;
    if (r.mudou < 0) r.mudou = a; r.ultima = a; if (window.__barras.some((n) => !n.isConnected)) r.barraSumiu = 1; });
  window.__obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const olhar = () => { if (window.__g !== g) return; const r = window.__r;
    if (r.t0) { const a = performance.now() - r.t0;
      if ([...document.querySelectorAll('[data-carregando-tela]')].some(vis)) r.telaCheia = 1;
      if ([...document.querySelectorAll('main [data-estado=carregando], [data-aba-conteudo] [data-estado=carregando], main .animate-pulse')].some(vis)) r.esqueleto = 1;
      const p = document.querySelector('[data-pagina]');
      if (p && p !== pag0 && !r.paginaNova) { r.paginaNova = 1; const cs = getComputedStyle(p); r.anima = cs.animationName; r.dur = parseFloat(cs.animationDuration) || 0; r.pagina = p.getAttribute('data-pagina') || ''; }
      if (a > 15000) return; }
    requestAnimationFrame(olhar); };
  requestAnimationFrame(olhar);
  return true;
}"""
# depois de estável: o que baixou de JS na troca e quando saiu o 1º pedido de dados (fetch/xhr) depois do toque
JS_NAV_LER = r"""() => { const r = window.__r; const t0 = r.t0 || performance.now();
  const rs = performance.getEntriesByType('resource');
  r.jsNovos = rs.filter((x) => /\.js(\?|$)/.test(x.name) && !window.__js0.has(x.name)).map((x) => x.name.split('/').pop());
  const ped = rs.filter((x) => (x.initiatorType === 'fetch' || x.initiatorType === 'xmlhttprequest') && x.startTime >= t0).sort((a, b) => a.startTime - b.startTime);
  r.pedido1 = ped.length ? Math.round(ped[0].startTime - t0) : -1;
  // os 3 primeiros pedidos de dados: só o alvo (a função, a RPC ou a tabela) e quando saiu — nada da consulta
  r.primeiros = ped.slice(0, 3).map((x) => { const u = new URL(x.name); const m = u.pathname.match(/\/(functions\/v1|rest\/v1\/rpc|rest\/v1|auth\/v1)\/([\w-]+)/);
    return (m ? m[1].split('/').pop() + ':' + m[2] : u.pathname.split('/').pop()) + '@' + Math.round(x.startTime - t0); });
  return { ...r, agora: performance.now() - t0 }; }"""


def medir_toque(R: B.Rodada, cel: B.Celular, papel: str, rota_rot: str) -> None:
    rot = f"[{papel} {rota_rot}]"
    cel.pg.emulate_media(reduced_motion="no-preference")
    n = cel.pg.evaluate(B.JS_TOCAVEIS)
    cel.pg.emulate_media(reduced_motion="reduce")
    r = cel.pg.evaluate(B.JS_TOCAVEIS)
    cel.pg.emulate_media(reduced_motion="no-preference")
    sem = ", ".join(f"{k}×{v}" for k, v in list(n["semAtivo"].items())[:4])
    R.ok(n["total"] > 0 and n["ativo"] == n["total"],
         f"{rot} :active em {n['ativo']}/{n['total']} tocáveis ({n['fora']} fora: desabilitados/alças)" + (f" — sem: {sem}" if sem else ""))
    partes, ok = [], True
    for chave, nome in GRUPOS:
        a, b = n["transicao"][chave], r["transicao"][chave]
        if a["total"]:
            partes.append(f"{nome} {a['com']}/{a['total']} (reduzir {b['com']}/{b['total']})")
            ok = ok and a["com"] == a["total"] and b["com"] == b["total"]
    R.ok(ok, f"{rot} transição ≠ 0s, também com 'reduzir movimento': {'; '.join(partes) or 'nenhum Botao/BotaoIcone/barra/aba na tela'}")
    R.ok(n["touch"] == "manipulation" and n["overscroll"] == "contain/contain",
         f"{rot} base: touch-action {n['touch']} · overscroll {n['overscroll']} (body/html)")


def print_toque(R: B.Rodada, cel: B.Celular, ctx: dict) -> None:
    """c_toque: a aluna no Início com o item "Treino" da barra PRESSIONADO (mouse down sem soltar em cima — nada navega)."""
    alvo = cel.pg.locator('[data-tabbar] [data-aba="treino"], [data-tabbar] a[href="/treino"]').first
    if not alvo.count():
        R.ok(False, "[c_toque] o item Treino da barra no Início")
        return
    caixa = alvo.bounding_box()
    x, y = caixa["x"] + caixa["width"] / 2, caixa["y"] + caixa["height"] / 2
    cel.pg.mouse.move(x, y)
    cel.pg.mouse.down()
    cel.pg.wait_for_timeout(260)  # a transição da escala (150 ms) termina
    estilo = alvo.evaluate("e => { const cs = getComputedStyle(e); return { opacity: cs.opacity, scale: cs.scale, ativo: e.matches(':active') }; }")
    caminho = cel.print(ctx["prefixo"], "c_toque")
    cel.pg.mouse.move(x, y - 400)  # sai de cima antes de soltar: sem clique
    cel.pg.mouse.up()
    R.linha(f"   print: {caminho}")
    R.ok(estilo["ativo"] and float(estilo["opacity"]) < 0.8 and estilo["scale"] not in ("none", "1"),
         f"[c_toque] o item pressionado responde: :active {estilo['ativo']} · opacidade {estilo['opacity']} · escala {estilo['scale']} "
         "(antes: 0 de 16 tocáveis do Início respondiam)")


def chunk_baixado(cel: B.Celular, nome: str) -> bool:
    """O pedaço da página (assets/<Nome>-<hash>.js) já está nos recursos que a página baixou."""
    return cel.pg.evaluate(r"""(n) => performance.getEntriesByType('resource').some((r) => new RegExp('/assets/' + n + '-[A-Za-z0-9_-]{8}\\.js(\\?|$)').test(r.name))""", nome)


def pintura(r: dict) -> str:
    """A 1ª pintura depois do toque (Event Timing; a entrada só existe a partir de 16 ms)."""
    return f"{r['pinta']} ms" if r.get("pinta", -1) >= 0 else "< 16 ms"


def esperar_estavel(cel: B.Celular, maximo: float = 12.0) -> dict:
    """Até estável: 500 ms sem mudança no DOM e sem pedido em andamento (com teto)."""
    r: dict = {}
    t0 = B.time.time()
    while B.time.time() - t0 < maximo:
        cel.pg.wait_for_timeout(200)
        r = cel.pg.evaluate(JS_NAV_LER)
        if r["t0"] and r["agora"] - r["ultima"] > 500 and cel.em_voo == 0:
            break
    return r


def trocar(R: B.Rodada, cel: B.Celular, rot: str, para: str, nome: str, pelo_mais: bool, ctx: dict, *, pre_carregado: bool, print_caso: str | None = None,
           checar: bool = True) -> dict | None:
    """Uma troca de página pelo toque no link da barra (ou no da folha "Mais"); as checagens da E (checar=False: só a medida)."""
    if not pelo_mais and not cel.pg.locator(f'[data-tabbar] a[href="{para}"]').count():
        pelo_mais = True  # a barra mostra as 4 primeiras (e a aberta): o resto fica no "Mais"
    if pelo_mais:
        cel.pg.locator('[data-tabbar] [data-aba="mais"]').first.click()
        if not cel.esperar(lambda: cel.tem(f'[data-painel] a[href="{para}"]'), 8):
            R.ok(False, f"{rot} o link de {para} na folha \"Mais\"")
            return None
        cel.pg.wait_for_timeout(450)
        link = cel.pg.locator(f'[data-painel] a[href="{para}"]').first
    else:
        link = cel.pg.locator(f'[data-tabbar] a[href="{para}"]').first
        if not link.count():
            R.ok(False, f"{rot} o link de {para} na barra de baixo")
            return None
    baixado = chunk_baixado(cel, nome)
    cel.pg.evaluate(JS_NAV_ARMAR)
    link.click(timeout=8000)
    if print_caso:
        cel.pg.wait_for_timeout(150)
        agora = cel.pg.evaluate("""() => ({ barra: [...document.querySelectorAll('[data-tabbar]')].some((e) => e.getClientRects().length),
          topo: !!document.querySelector('[data-topo]'), cheia: [...document.querySelectorAll('[data-carregando-tela]')].some((e) => e.getClientRects().length),
          esqueleto: [...document.querySelectorAll('main [data-estado=carregando], main .animate-pulse')].some((e) => e.getClientRects().length) })""")
        B.PRINTS.mkdir(parents=True, exist_ok=True)
        caminho = str(B.PRINTS / f"{ctx['prefixo']}_{print_caso}_{cel.largura}.png")
        cel.pg.screenshot(path=caminho)
        R.linha(f"   print: {caminho}")
        R.ok(agora["barra"] and agora["topo"] and not agora["cheia"],
             f"{rot} print aos 150 ms: barra {'sim' if agora['barra'] else 'NÃO'} · topo {'sim' if agora['topo'] else 'NÃO'} · esqueleto "
             f"{'sim' if agora['esqueleto'] else 'não'} · tela cheia {'SIM' if agora['cheia'] else 'não'}")
    try:
        cel.pg.wait_for_url(lambda u: B.urlparse(u).path == para, timeout=10000)
    except Exception:  # noqa: BLE001
        R.ok(False, f"{rot} a URL virou {para}")
        return None
    r = esperar_estavel(cel)
    if not checar:
        return r
    R.ok(not r["barraSumiu"] and not r["telaCheia"],
         f"{rot} a barra é o MESMO nó durante a troca ({'sim' if not r['barraSumiu'] else 'NÃO'}) e 0 tela cheia ({'0' if not r['telaCheia'] else 'APARECEU'})")
    R.ok(0 <= r["mudou"] <= 100, f"{rot} a 1ª mudança na tela {round(r['mudou'])} ms depois do toque (≤ 100)")
    R.ok(r["paginaNova"] and r["anima"] == "enter" and r["dur"] >= 0.15,
         f"{rot} a página nova entra animada (animação {r['anima']} {r['dur']}s; a chave da página {'mudou' if r['paginaNova'] else 'NÃO mudou'})")
    da_pagina = [j for j in r["jsNovos"] if re.match(rf"{nome}-[A-Za-z0-9_-]{{8}}\.js", j)]
    if pre_carregado:
        R.ok(baixado and not da_pagina, f"{rot} o pedaço {nome} já estava baixado antes do toque ({'sim' if baixado else 'NÃO'}) e a troca não o "
                                        f"baixou de novo ({len(da_pagina)})")
    R.linha(f"   {rot} 1ª pintura {pintura(r)} · até estável {round(r['ultima'])} ms · o app chama o 1º fetch {r['fetch1']} ms · 1º pedido na rede {r['pedido1']} ms "
            f"({', '.join(r.get('primeiros') or []) or '—'}) · tarefas longas {r.get('longas', 0)} ms em {r.get('nLongas', 0)} · "
            f"esqueleto {'sim' if r['esqueleto'] else 'não'}"
            + (f" · outros JS na troca: {', '.join(r['jsNovos'][:4])}" if r["jsNovos"] else " · 0 JS na troca"))
    return r


def esperar_pre_carga(R: B.Rodada, cel: B.Celular, nomes: list[str], rot: str, maximo: float = 40.0) -> None:
    """A pré-carga (no ocioso, uma por vez) termina: os pedaços das páginas da troca estão baixados."""
    ok = cel.esperar(lambda: all(chunk_baixado(cel, n) for n in nomes), maximo, passo=0.5)
    faltam = [n for n in nomes if not chunk_baixado(cel, n)]
    R.ok(ok, f"{rot} a pré-carga baixou, no ocioso e sem toque, os pedaços das páginas ({len(nomes) - len(faltam)}/{len(nomes)}"
             + (f"; faltam {', '.join(faltam)}" if faltam else "") + ")")


def metas_da_spec(R: B.Rodada, cel: B.Celular, ctx: dict, rotulo: str) -> None:
    """As 2 medidas da spec (§2.5 item 6), 3 vezes e a mediana — o jeito da medição da spec (`medir_hml18.py nav`): Painel → Alunos
    até estável ≤ 700 ms (era 664) e Alunos → Treinos: o 1º pedido de dados sai ≤ 150 ms depois do toque (era 430–450)."""
    pa: list[dict] = []
    at: list[dict] = []
    for _ in range(3):
        cel.ir("/painel")
        cel.esperar_quieto(minimo=2.5, quieto=1.5)
        r1 = trocar(R, cel, "", "/painel/alunos", "Alunos", False, ctx, pre_carregado=True, checar=False)
        r2 = trocar(R, cel, "", "/painel/treinos", "Treinos", False, ctx, pre_carregado=True, checar=False)
        if r1:
            pa.append(r1)
        if r2:
            at.append(r2)
    med = lambda xs, k: statistics.median([x[k] for x in xs]) if xs else -1  # noqa: E731
    R.ok(len(pa) == 3 and med(pa, "ultima") <= 700,
         f"[personal · {rotulo}] Painel → Alunos até estável: mediana {round(med(pa, 'ultima'))} ms de 3 ({', '.join(str(round(x['ultima'])) for x in pa)}) "
         "(meta ≤ 700; era 664)")
    R.ok(len(at) == 3 and 0 <= med(at, "pedido1") <= 150,
         f"[personal · {rotulo}] Alunos → Treinos: o 1º pedido de dados sai na mediana {round(med(at, 'pedido1'))} ms depois do toque "
         f"({', '.join(str(x['pedido1']) for x in at)}; o app chama o fetch em {', '.join(str(x['fetch1']) for x in at)} ms; tarefas longas "
         f"{', '.join(str(x.get('longas', 0)) for x in at)} ms) (meta ≤ 150; era 430–450)")


def nav_painel(R: B.Rodada, nav, ctx: dict) -> None:
    """personal (390): Dashboard → Alunos → Treinos → Agenda (pelo "Mais") → Financeiro, normal e com reduzir."""
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    cel.ctx.add_init_script(JS_BUFFER_GRANDE)
    cel.ctx.add_init_script(JS_FETCH_MARCA)
    try:
        cel.entrar(ctx["logins"], ctx["contas"]["personal"], "/painel")
        cel.esperar_quieto()
        esperar_pre_carga(R, cel, ["Alunos", "Treinos", "Agenda", "Financeiro", "Dashboard"], "[personal]")
        for midia, rotulo in MODOS:
            cel.pg.emulate_media(reduced_motion=midia)
            if midia != "no-preference":
                cel.ir("/painel")
                cel.esperar_quieto()
            medidas = {}
            for para, nome, pelo_mais in NAV_PAINEL:
                rot = f"[personal · {rotulo}] → {para}"
                pr = "e_troca" if (midia == "no-preference" and para == "/painel/treinos") else None
                r = trocar(R, cel, rot, para, nome, pelo_mais, ctx, pre_carregado=True, print_caso=pr)
                if r:
                    medidas[para] = r
            metas_da_spec(R, cel, ctx, rotulo)
        cel.pg.emulate_media(reduced_motion="no-preference")
        R.ok(not cel.dialogos, f"[personal · nav] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def nav_app(R: B.Rodada, nav, ctx: dict) -> None:
    """aluna (390): as 5 abas × 2 voltas, normal e com reduzir (a 1ª volta pode esperar a pré-carga; a 2ª, nunca)."""
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    cel.ctx.add_init_script(JS_BUFFER_GRANDE)
    cel.ctx.add_init_script(JS_FETCH_MARCA)
    try:
        cel.entrar(ctx["logins"], ctx["contas"]["aluna"], "/")
        cel.esperar_quieto()
        esperar_pre_carga(R, cel, ["Treino", "Dieta", "Evolucao", "Perfil", "Inicio"], "[aluna]")
        for midia, rotulo in MODOS:
            cel.pg.emulate_media(reduced_motion=midia)
            for volta in (1, 2):
                for para, nome in NAV_APP:
                    if not cel.pg.locator(f'[data-tabbar] a[href="{para}"]').count():
                        R.linha(f"   [aluna · {rotulo} · volta {volta}] {para}: a aba não está na barra desta conta")
                        continue
                    trocar(R, cel, f"[aluna · {rotulo} · volta {volta}] → {para}", para, nome, False, ctx, pre_carregado=True)
        cel.pg.emulate_media(reduced_motion="no-preference")
        R.ok(not cel.dialogos, f"[aluna · nav] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def rodar_papel(R: B.Rodada, nav, papel: str, a: argparse.Namespace, ctx: dict) -> None:
    aberturas = [x for x in B.ABERTURAS if x["papel"] == papel and (not a.rapido or x["rota"] in RAPIDO.get(papel, ()))]
    if not aberturas:
        return
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    try:
        for i, ab in enumerate(aberturas):
            rota = ab["rota"].replace(":aluno", ctx["aluna"])
            try:
                if i == 0:
                    cel.entrar(ctx["logins"], ctx["contas"][papel], rota)
                else:
                    cel.ir(rota)
                cel.esperar_quieto()
                if cel.caminho() in ("/entrar", "/boas-vindas") and ab["final"] not in ("/entrar", "/boas-vindas"):
                    R.ok(False, f"[{papel} {ab['rota']}] caiu em {cel.caminho()} (sem sessão)")
                    continue
                medir_toque(R, cel, papel, ab["rota"])
                if papel == "aluna" and ab["rota"] == "/" and not ctx["c_toque"]:
                    print_toque(R, cel, ctx)
                    ctx["c_toque"] = True
            except Exception as e:  # noqa: BLE001
                if any(x in str(e) for x in ("Target crashed", "has been closed")):
                    raise
                R.ok(False, f"[{papel} {ab['rota']}] erro: {type(e).__name__}: {str(e)[:200]}")
        R.ok(not cel.dialogos, f"[{papel}] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18 — E2E da casca e do toque no celular (E e C)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod (SÓ LEITURA) | <url>")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--so", choices=("toque", "nav"), default=None, help="só uma parte (padrão: as duas)")
    ap.add_argument("--contas", default=",".join(B.PAPEIS), help=f"papéis: {','.join(B.PAPEIS)}")
    ap.add_argument("--rapido", action="store_true", help="só as 10 telas do fluxo da spec (personal e aluna)")
    ap.add_argument("--sair-master", action="store_true", help="no fim, o logout da sessão guardada da master")
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    papeis = [p.strip() for p in a.contas.split(",") if p.strip()]
    if set(papeis) - set(B.PAPEIS):
        raise SystemExit(f"papéis: {', '.join(B.PAPEIS)}")
    if producao and "master" in papeis:
        papeis.remove("master")
    partes = [a.so] if a.so else ["toque", "nav"]
    nome = f"shell_{prefixo}" + (f"_{a.so}" if a.so else "") + ("_rapido" if a.rapido else "") + ("" if set(papeis) == set(B.PAPEIS) else "_" + "_".join(papeis))
    R = B.Rodada(nome)
    R.linha(f"base {base} · {'PRODUÇÃO, só leitura (a Guarda)' if producao else 'schema staging'} · canal {a.canal} · partes {', '.join(partes)} · "
            f"papéis {', '.join(papeis)}{' · rápido' if a.rapido else ''}")
    contas = B.CONTAS_DA_BASE["prod" if producao else "staging"]
    L = B.Logins(f"shell.py {nome}")
    ctx = {"base": base, "prefixo": prefixo, "producao": producao, "contas": contas, "logins": L, "aluna": "", "c_toque": False,
           "guarda": B.B17.Guarda() if producao else None}
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        try:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                ok_build = B.conferir_build(R, nav, base, producao)
            finally:
                nav.close()
            if ok_build and "nav" in partes:
                for papel, fn in (("personal", nav_painel), ("aluna", nav_app)):
                    if papel not in papeis:
                        continue
                    nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                    try:
                        fn(R, nav, ctx)
                    except Exception as e:  # noqa: BLE001
                        R.ok(False, f"[{papel} · nav] {type(e).__name__}: {str(e)[:240]}")
                    finally:
                        try:
                            nav.close()
                        except Exception:  # noqa: BLE001
                            pass
            if ok_build and "toque" in partes:
                ctx["aluna"] = B.matricula(contas["aluna"])
                for papel in papeis:
                    for tentativa in (1, 2):
                        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                        try:
                            rodar_papel(R, nav, papel, a, ctx)
                            break
                        except Exception as e:  # noqa: BLE001
                            if tentativa == 2:
                                R.ok(False, f"[{papel}] o navegador caiu 2 vezes: {type(e).__name__}: {str(e)[:200]}")
                            else:
                                R.linha(f"   ({papel}: o navegador caiu no meio — de novo, num navegador novo)")
                        finally:
                            try:
                                nav.close()
                            except Exception:  # noqa: BLE001
                                pass
        finally:
            L.fechar(R)
            if a.sair_master:
                B.sair_master(R)
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
