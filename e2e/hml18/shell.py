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
  --so nav    (hml-18a, F5 — o agente B completa): a troca de página (a barra é o mesmo nó, 0 tela cheia, 1ª mudança ≤ 100 ms, a
              entrada animada da página, o chunk pré-carregado) — ainda não implementada aqui.
Bases: --base local (o vite preview do build de STAGING em http://localhost:8080) · staging · prod (SÓ LEITURA: a Guarda no navegador,
as contas de teste de lá, sem o master; só lê estilos — nenhum toque que grave).
Saída: hml/hml18/agente/shell_<base>[_toque][_<papéis>].txt. O placar vai para o e2e-rodadas.tsv (Placar.fim()).
Uso: python3 e2e/hml18/shell.py --base local --canal msedge --so toque [--contas personal,nutri,aluna,paciente,master] [--rapido]
"""
from __future__ import annotations

import argparse
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
    if "nav" in partes:
        R.linha("   (a parte de navegação — troca de página, pré-carga, transição — é da F5: o agente B completa)")
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
