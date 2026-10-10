#!/usr/bin/env python3
"""Physiq hml-18a (H-40, A — 10/10/2026) — E2E de LARGURA no celular, com o Edge: as 60 aberturas da spec (personal, nutri, aluna,
paciente) + as 11 do master (só staging/local), cada uma a 390 × 844 e a 360 × 780, no mesmo contexto de celular (is_mobile + has_touch).

Por abertura:
  · a tela certa (a rota final esperada; nunca a /entrar nem a /boas-vindas por falta de sessão) e sem a tela cheia de carregando;
  · passa_px = scrollWidth − clientWidth do <html> = 0 a 390 e a 360 (antes: 17 passavam a 360 e 11 a 390 — Agenda +236/+206,
    Dashboard +162/+132, Biblioteca +109/+79 …; com a causa na saída: o elemento mais de fora que passa);
  · a barra de baixo ([data-tabbar]) dentro da tela (a base ≤ a altura visível, a direita ≤ a largura) — antes ficava fora em 7;
  · --nomes-longos: depois da medida normal, +40 caracteres com espaço em todo .truncate e [data-*-nome] (_base.JS_NOMES_LONGOS) e
    a mesma conta a 360 e a 390 (passa_px 0 e a barra dentro).
  · --kpi-longo (hml-18a, o achado do agente A): nas telas com número (Kpi, [data-kpi-valor]), o valor vira "R$ 123.456,78" e, a 360 e
    a 390, ele CABE no cartão (sem corte: scrollWidth ≤ largura da caixa) e passa_px 0; a 1280 o valor volta aos 30 px (o mesmo de
    antes a partir do sm). Print a_kpi_longo (o Financeiro do personal, 360).
Prints (§5 da spec): prints/hml18/<base>_<caso>_<largura>.png — a_agenda (360 e 390), a_dashboard (360 e 390), a_editor, a_biblioteca,
a_topo_mensagens, a_topo_calculadora, a_fin_aluno e, com --nomes-longos, a_nomes_longos_alunos e a_nomes_longos_biblioteca (360); e
a_depois_* (360) das outras telas que passavam (Avaliação, Histórico, Equipe, Financeiro, master e Treinos prontos do master).
Bases: --base local (o vite preview do build de STAGING em http://localhost:8080) · staging · prod (SÓ LEITURA: a Guarda no navegador,
as contas de teste de lá, sem o master; os nomes das listas borrados nos prints).
Saída: hml/hml18/agente/largura_<base>[_nomes_longos][_<papéis>].txt (só px, contagens e classes). O placar vai para o e2e-rodadas.tsv.
Uso: python3 e2e/hml18/largura.py --base local --canal msedge [--contas personal,nutri,aluna,paciente,master] [--nomes-longos]
     [--sair-master] (logout da sessão guardada da master no fim — a última rodada do contrato)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

# (papel, rota) → (caso do print, larguras[, o que rolar até a vista antes do print]) — §5 da spec
PRINTS = {
    ("personal", "/painel/agenda"): ("a_agenda", (360, 390)),
    ("personal", "/painel"): ("a_dashboard", (360, 390)),
    ("personal", "/painel/alunos/:aluno/editar"): ("a_editor", (360,)),
    ("personal", "/painel/treinos?aba=biblioteca"): ("a_biblioteca", (360,)),
    ("personal", "/painel/mensagens"): ("a_topo_mensagens", (360,)),
    ("personal", "/painel/calculadora"): ("a_topo_calculadora", (360,)),
    ("personal", "/painel/alunos/:aluno/financeiro"): ("a_fin_aluno", (360,)),
    ("nutri", "/painel/alunos/:aluno/avaliacao"): ("a_depois_avaliacao", (360,), "[data-avaliacao-item]"),
    ("personal", "/painel/treinos?aba=historico"): ("a_depois_historico", (360,)),
    ("personal", "/painel/configuracoes/equipe"): ("a_depois_equipe", (360,)),
    ("personal", "/painel/financeiro"): ("a_depois_financeiro", (360,)),
    ("master", "/master"): ("a_depois_master", (360,)),
    ("master", "/master/app-do-aluno?aba=treinos"): ("a_depois_master_treinos_prontos", (360,)),
}
VALOR_LONGO = "R$\u00a0123.456,78"
JS_KPI_LONGO = r"""([valor]) => { const vs = [...document.querySelectorAll('[data-kpi] > [data-kpi-valor]')].filter((e) => e.getClientRects().length);
  for (const v of vs) v.textContent = valor; return vs.length; }"""
JS_KPI_CABE = r"""() => [...document.querySelectorAll('[data-kpi] > [data-kpi-valor]')].filter((e) => e.getClientRects().length).map((v) => {
  const c = v.closest('[data-kpi]') || v.parentElement; const cr = c.getBoundingClientRect(); const cs = getComputedStyle(c);
  const dentro = cr.right - parseFloat(cs.paddingRight || '0');
  return { cabe: v.scrollWidth <= v.clientWidth + 1 && v.getBoundingClientRect().left + v.scrollWidth <= dentro + 1,
    fonte: getComputedStyle(v).fontSize, w: Math.round(v.scrollWidth), caixa: Math.round(v.clientWidth) }; })"""
PRINTS_KPI_LONGO = {("personal", "/painel/financeiro"): "a_kpi_longo"}
PRINTS_NOMES_LONGOS = {("personal", "/painel/alunos"): "a_nomes_longos_alunos", ("personal", "/painel/treinos?aba=biblioteca"): "a_nomes_longos_biblioteca"}
BORRAR = "[data-lista] [data-item], [data-lista] [data-item] *"


def raiz(m: dict) -> str:
    return (m.get("raizes") or ["-"])[0][:170]


def medir_abertura(R: B.Rodada, cel: B.Celular, papel: str, ab: dict, rota: str, primeira: bool, a: argparse.Namespace, ctx: dict) -> None:
    rot = f"[{papel} {ab['rota']}]"
    cel.tamanho(390)
    if primeira:
        cel.entrar(ctx["logins"], ctx["contas"][papel], rota)
    else:
        cel.ir(rota)
    espera = cel.esperar_quieto()
    final = cel.caminho()
    if ctx["producao"]:
        R.ok(final not in ("/entrar", "/boas-vindas"), f"{rot} abriu com a sessão (final {B.nome_da_rota(final)}; {espera}s)")
    else:
        esperado = ab["final"].replace(":aluno", ctx["aluna"])
        R.ok(final == esperado, f"{rot} a tela certa (final {'= esperada' if final == esperado else B.nome_da_rota(final)}; {espera}s)")
    caso = PRINTS.get((papel, ab["rota"]))
    borrar = BORRAR if ctx["producao"] else None
    m = {}
    for largura in (390, 360):
        if largura != 390:
            cel.tamanho(largura)
            cel.pg.wait_for_timeout(900)
        m[largura] = cel.pg.evaluate(B.JS_LARGURA)
        if caso and largura in caso[1]:
            rolar = caso[2] if len(caso) > 2 else None
            if rolar and cel.pg.locator(rolar).count():
                cel.pg.locator(rolar).first.evaluate("e => e.scrollIntoView({ block: 'center' })")
            R.linha(f"   print: {cel.print(ctx['prefixo'], caso[0], borrar)}")
            if rolar:
                cel.pg.evaluate("() => window.scrollTo(0, 0)")
    m390, m360 = m[390], m[360]
    R.ok(not m360["carregando"], f"{rot} sem a tela cheia de carregando na medida")
    texto = f"{rot} passa_px 390={m390['passa']} 360={m360['passa']}" + (" (passava na F0)" if ab["passava"] else "")
    if m390["passa"] or m360["passa"]:
        texto += f" — raiz: {raiz(m360 if m360['passa'] else m390)}"
    R.ok(m390["passa"] == 0 and m360["passa"] == 0, texto)
    barras = [x["barra"] for x in (m390, m360) if x.get("barra")]
    if barras:
        R.ok(all(b["dentro"] for b in barras), f"{rot} a barra de baixo dentro da tela (base {'/'.join(str(b['base']) for b in barras)} · "
                                               f"altura {m390['vh']}/{m360['vh']})")
    if a.nomes_longos:
        n = cel.pg.evaluate(B.JS_NOMES_LONGOS, [B.EXTRA_NOME])
        cel.pg.wait_for_timeout(500)
        nl = {}
        for largura in (360, 390):
            if largura != 360:
                cel.tamanho(largura)
                cel.pg.wait_for_timeout(900)
            nl[largura] = cel.pg.evaluate(B.JS_LARGURA)
            caso_nl = PRINTS_NOMES_LONGOS.get((papel, ab["rota"]))
            if caso_nl and largura == 360:
                R.linha(f"   print: {cel.print(ctx['prefixo'], caso_nl, borrar)}")
        texto = f"{rot} nomes longos (+40 em {n} textos): passa_px 360={nl[360]['passa']} 390={nl[390]['passa']}"
        if nl[360]["passa"] or nl[390]["passa"]:
            texto += f" — raiz: {raiz(nl[360] if nl[360]['passa'] else nl[390])}"
        R.ok(nl[360]["passa"] == 0 and nl[390]["passa"] == 0, texto)
        barras = [x["barra"] for x in (nl[360], nl[390]) if x.get("barra")]
        if barras:
            R.ok(all(b["dentro"] for b in barras), f"{rot} nomes longos: a barra de baixo dentro da tela")
    # só o número do Kpi (src/ui/premium/Kpi.tsx): o CardsMetricas da Evolução usa data-kpi-valor como atributo com valor, no cartão
    if a.kpi_longo and cel.pg.locator("[data-kpi] > [data-kpi-valor]").count():
        n = cel.pg.evaluate(JS_KPI_LONGO, [VALOR_LONGO])
        kl = {}
        for largura in (360, 390):
            cel.tamanho(largura)
            cel.pg.wait_for_timeout(700)
            kl[largura] = {"m": cel.pg.evaluate(B.JS_LARGURA), "v": cel.pg.evaluate(JS_KPI_CABE)}
            caso_kl = PRINTS_KPI_LONGO.get((papel, ab["rota"]))
            if caso_kl and largura == 360:
                R.linha(f"   print: {cel.print(ctx['prefixo'], caso_kl, borrar)}")
        for largura in (360, 390):
            vs = kl[largura]["v"]
            fora = [x for x in vs if not x["cabe"]]
            fontes = sorted({x["fonte"] for x in vs})
            R.ok(kl[largura]["m"]["passa"] == 0 and vs and not fora,
                 f"{rot} KPI com \"R$ 123.456,78\" a {largura}: {len(vs) - len(fora)}/{len(vs)} valores cabem no cartão (fonte {'/'.join(fontes)}; "
                 f"maior {max(x['w'] for x in vs)} px na caixa de {min(x['caixa'] for x in vs)}) · passa_px {kl[largura]['m']['passa']}")
        cel.pg.set_viewport_size({"width": 1280, "height": 800})
        cel.pg.wait_for_timeout(700)
        grandes = cel.pg.evaluate("() => [...new Set([...document.querySelectorAll('[data-kpi] > [data-kpi-valor]')].filter((e) => e.getClientRects().length).map((v) => getComputedStyle(v).fontSize))]")
        R.ok(grandes == ["30px"], f"{rot} KPI no computador (1280): o valor com os mesmos 30 px de antes ({'/'.join(grandes) or '—'}; {n} números)")
        cel.tamanho(390)
    ctx["placar"].append((papel, ab["rota"], m390["passa"], m360["passa"]))


def rodar_papel(R: B.Rodada, nav, papel: str, a: argparse.Namespace, ctx: dict) -> None:
    aberturas = [x for x in B.ABERTURAS if x["papel"] == papel]
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda"])
    try:
        for i, ab in enumerate(aberturas):
            rota = ab["rota"].replace(":aluno", ctx["aluna"])
            try:
                medir_abertura(R, cel, papel, ab, rota, i == 0, a, ctx)
            except Exception as e:  # noqa: BLE001
                if any(x in str(e) for x in ("Target crashed", "has been closed", "Target page, context or browser has been closed")):
                    raise
                R.ok(False, f"[{papel} {ab['rota']}] erro: {type(e).__name__}: {str(e)[:200]}")
        graves = [e for e in cel.erros if "ResizeObserver" not in e]
        R.linha(f"   [{papel}] erros de página: {len(graves)} {graves[:2]} · diálogos nativos: {len(cel.dialogos)}")
    finally:
        cel.fim(ctx["logins"])


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18a — E2E de largura no celular (A)")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod (SÓ LEITURA) | <url>")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--contas", default=",".join(B.PAPEIS), help=f"papéis: {','.join(B.PAPEIS)}")
    ap.add_argument("--nomes-longos", action="store_true", help="também com +40 caracteres em todo .truncate e [data-*-nome]")
    ap.add_argument("--kpi-longo", action="store_true", help="também com o valor \"R$ 123.456,78\" em todo número (Kpi) a 360 e 390")
    ap.add_argument("--sair-master", action="store_true", help="no fim, o logout da sessão guardada da master")
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    papeis = [p.strip() for p in a.contas.split(",") if p.strip()]
    fora = [p for p in papeis if p not in B.PAPEIS]
    if fora:
        raise SystemExit(f"papéis desconhecidos: {fora}")
    contas = B.CONTAS_DA_BASE["prod" if producao else "staging"]
    if producao and "master" in papeis:
        papeis.remove("master")  # na produção nenhuma conta de teste é master (prova viva dele)
    nome = f"largura_{prefixo}" + ("_nomes_longos" if a.nomes_longos else "") + ("_kpi_longo" if a.kpi_longo else "") \
        + ("" if set(papeis) == set(B.PAPEIS) else "_" + "_".join(papeis))
    R = B.Rodada(nome)
    R.linha(f"base {base} · {'PRODUÇÃO, só leitura (a Guarda)' if producao else 'schema staging'} · canal {a.canal} · papéis {', '.join(papeis)}"
            f"{' · nomes longos' if a.nomes_longos else ''}{' · KPI com valor longo' if a.kpi_longo else ''}")
    L = B.Logins(f"largura.py {nome}")
    ctx = {"base": base, "prefixo": prefixo, "producao": producao, "contas": contas, "logins": L, "aluna": "", "placar": [],
           "guarda": B.B17.Guarda() if producao else None}
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        try:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                ok_build = B.conferir_build(R, nav, base, producao)
            finally:
                nav.close()
            if ok_build:
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
    if producao and ctx["guarda"]:
        R.linha(f"   escritas bloqueadas pelo navegador: {len(ctx['guarda'].bloqueadas)}")
    p = ctx["placar"]
    if p:
        R.linha(f"\nresumo: {len(p)} aberturas · passam a 390: {sum(1 for x in p if x[2] > 0)} · a 360: {sum(1 for x in p if x[3] > 0)} "
                f"(F0: 17 a 360 e 11 a 390 nas 60; master 2 e 1)")
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
