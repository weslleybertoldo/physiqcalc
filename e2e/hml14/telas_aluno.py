"""Physiq hml-14d — casos P1–P8 do e2e/hml14/telas.py: por aluno no painel e no app (P2b), Anotações e as pendências da 14b/14c.

Contas: no painel, a NUTRICIONISTA do aluno da massa "aluno" (padrão: w13-nutri, Camila Rocha — ela vê o clínico: Anotações e Exames;
tudo da massa é dela); no app, o aluno (w13-aluno, Rafael Moura); P7 e P8 com a nutri-legado e a massa da 14b. Fontes da página: a
função pagamentos-aluno (prof_aluno_cobrancas; aluno_historico), as tabelas transacoes, recibos e pedidos_exame (limit 20), as RPCs
aluno_anotacoes (p_offset), exames_do_aluno (20 DATAS) e minha_agenda_lista (p_tipo 'proximas').
  P1  Financeiro do aluno: os 3 "Ver todos" (cobranças, lançamentos, recibos) abrem a lista em páginas de 20 com a página no endereço
      (?pagina_cobrancas= · ?pagina_lancamentos= · ?pagina_recibos=), os 41 de cada aparecem, recarregar mantém a página; os totais
      "Recebido/Gasto" (data-totais-aluno) = a soma do banco
  P2  Anotações: "1–20 de N", ?pagina_anotacoes=, os 41 aparecem (L1–L5, L8)
  P3  Exames: as datas em páginas de 20 (?pagina_exames=; a data nunca é partida: o grupo da data tem os resultados dela), "Ver evolução
      de" pede só aquele exame (p_exame) → 21 datas; os pedidos de exame em páginas (?pagina_pedidos=)
  P4  Acompanhamento: todo pedido a registros_diarios leva o período (data=gte & data=lte) — nenhum sem período (o HEAD de 1 dia,
      data=eq., é o aviso "dia já registrado" do diálogo para um dia fora do período)
  P5  app › Pagamentos: "Ver todos (N)" de pagamentos e de recibos → folha em páginas de 20 (aluno_historico), os 41 aparecem, fecha = 1
  P6  app › Agenda: "Próximas" com as 20 primeiras + "Ver todas (N)" → folha em páginas (minha_agenda_lista), os 41 aparecem
  P7  Pré-consulta (nutri-legado, massa da 14b): os números do topo = os da preconsulta_numeros = o banco; nenhum pedido de 1000 respostas
  P8  Dashboard (nutri-legado): o número das fotos sem reação pelo HEAD (contarDiario) e nenhum pedido do diário de 7 dias com limit 1000
      (o diario7 saiu — D36; o "Diário de hoje" da W24, só o dia de hoje, fica)
"""
from __future__ import annotations

import dataclasses
import re
from datetime import datetime, timezone

import telas as T
from telas import POR_PAGINA, Caso14d, Lista

PAGAMENTOS = "pagamentos-aluno"


def al(R) -> dict:
    return R.parte("aluno")


def chave_prof(R) -> str:
    return T.chave_do_email(R, al(R).get("profissional_email")) or "w13-nutri"


def chave_aluno(R) -> str:
    return T.chave_do_email(R, al(R).get("aluno_email")) or "w13-aluno"


def rota(R, aba: str) -> str:
    return f"/painel/alunos/{al(R).get('rota_id')}/{aba}"


def com_conta(L: Lista, R, conta: str | None = None) -> Lista:
    return dataclasses.replace(L, conta=conta or chave_prof(R))


# ───────────────────────── as listas ─────────────────────────
COBRANCAS = Lista("aluno-cobrancas", "", (("funcao", PAGAMENTOS),), "cobrança", (), None, fundo="cobrancas_fundo_painel", parte="aluno",
                  acoes=("prof_aluno_cobrancas",), chave="pagina_cobrancas")
LANCAMENTOS = Lista("aluno-lancamentos", "", (("tabela", "transacoes"),), "lançamento", (), None, fundo="lancamentos_fundo", parte="aluno",
                    chave="pagina_lancamentos")
RECIBOS = Lista("aluno-recibos", "", (("tabela", "recibos"),), "recibo", (), None, fundo="recibos_fundo_painel", parte="aluno",
                chave="pagina_recibos")
ANOTACOES = Lista("anotacoes", "", (("rpc", "aluno_anotacoes"),), "anotação", (), None, fundo="anotacoes_fundo", parte="aluno",
                  chave="pagina_anotacoes", filtro="nenhum")
EXAMES = Lista("exames", "", (("rpc", "exames_do_aluno"),), "resultado", (), None, parte="aluno", chave="pagina_exames")
PEDIDOS = Lista("pedidos-exame", "", (("tabela", "pedidos_exame"),), "pedido", (), None, fundo="pedidos_fundo", parte="aluno", chave="pagina_pedidos")
APP_PAGAMENTOS = Lista("app-pagamentos", "/perfil/pagamentos", (("funcao", PAGAMENTOS),), "cobrança", (), None, fundo="cobrancas_fundo_app",
                       parte="aluno", acoes=("aluno_historico",), chave=None)
APP_RECIBOS = Lista("app-recibos", "/perfil/pagamentos", (("funcao", PAGAMENTOS),), "recibo", (), None, fundo="recibos_fundo_app", parte="aluno",
                    acoes=("aluno_historico",), chave=None)
APP_AGENDA = Lista("app-agenda", "/perfil/agenda", (("rpc", "minha_agenda_lista"),), "consulta", (), None, fundo="agenda_fundo", parte="aluno",
                   chave=None)


def provar_paginas(o, caso, rede, R, L: Lista, t: str, esperados, recarregar: bool = True) -> None:
    """A lista já aberta: L1 ("1–20 de N", o pedido só com 20), Próxima até a última (a página no endereço), os 41 aparecem, recarregar
    mantém a página e Anterior volta à 1."""
    ok, st = T.esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 60)
    if not o.ok(ok, f"{t} a lista com data-lista / data-paginacao '{L.nome}' e as linhas data-item"):
        caso.diagnostico()
        return
    nome, N = st["nome"], int(st["total"] or 0)
    fundo = R.fundo(L)
    o.ok(N >= T.MASSA, f"{t} L1 o total: {N}" + (f" (no banco: 41 da massa + {fundo} de fundo)" if isinstance(fundo, int) else ""))
    if isinstance(fundo, int) and N != T.MASSA + fundo:
        R.aviso(f"{t} o total da tela ({N}) difere da conta do massa.py (41 + {fundo})")
    o.ok(st["rotulo"] == T.rotulo(1, N) and len(st["textos"]) == min(POR_PAGINA, N) and (L.chave is None or T.na_pagina(st["url"], 1, L.chave)),
         f"{t} L1 '{st['rotulo']}' (esperado '{T.rotulo(1, N)}'), {len(st['textos'])} linhas, {st['url']}")
    ev = T.esperar_pedido(caso, rede, L, 0, 1)
    o.ok(T.pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} L1 o pedido traz só 20: {T.descr(ev) or T.nao_veio(rede, L, 0)}")
    T.avisar_grandes(R, t, rede, L, 0)
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina1')}")
    paginas, atual = T.ate_a_ultima(o, caso, rede, R, L, nome, N, st, t)
    T.conferir_massa(o, paginas, L, esperados, t)
    ultima = max(paginas)
    o.linha(f"   print: {caso.print(f'{L.nome}_pagina{ultima}')}")
    if recarregar and L.chave and ultima > 1:
        linhas = T.chaves(atual, L)
        caso.pg.reload(wait_until="domcontentloaded")
        okr, sr = T.esperar_lista(caso, L, lambda e: e["pagina"] == ultima and T.chaves(e, L) == linhas, 60)
        o.ok(okr and T.na_pagina(sr["url"], ultima, L.chave), f"{t} recarregar na página {ultima} → continua nela, com as mesmas linhas ({sr.get('url')})")
        atual = sr if okr else atual
    for P in range(ultima - 1, 0, -1):
        okp, atual = T.mudar_pagina(caso, L, nome, "anterior", P, atual)
        if not okp:
            break
    o.ok(atual.get("pagina") == 1 and (L.chave is None or T.na_pagina(atual.get("url") or "", 1, L.chave)),
         f"{t} Anterior até a página 1 (o endereço sem ?{L.chave})" if L.chave else f"{t} Anterior até a página 1")


def numero_do_botao(caso, sel: str) -> int | None:
    m = re.search(r"\((\d+)\)", T.texto_de(caso, sel))
    return int(m.group(1)) if m else None


def clicar(caso, sel: str, timeout: float = 60) -> bool:
    b = caso.pg.locator(sel).first
    if not caso.esperar(lambda: b.count() > 0 and b.is_visible(), timeout):
        return False
    b.scroll_into_view_if_needed()
    try:
        b.click(timeout=15000)
    except Exception:  # noqa: BLE001
        # no celular, com a página mais larga que 390 px (a aba Financeiro do aluno: 427, igual no front antigo) o navegador afasta o
        # zoom e o clique do Playwright erra o alvo ("<outro elemento> intercepts pointer events"); a largura é provada à parte
        # (largura_ok) — aqui o clique vai pelo próprio botão. No computador, o erro vale.
        if (caso.pg.viewport_size or {}).get("width", 9999) > 400:
            raise
        b.evaluate("(e) => e.click()")
    return True


def largura_ok(o, caso, t: str) -> None:
    larg = caso.pg.evaluate("document.documentElement.scrollWidth")
    o.ok(0 < larg <= T.LARGURA_CELULAR, f"{t} celular 390 px sem rolar para o lado (scrollWidth {larg})")


# ───────────────────────── P1 Financeiro do aluno ─────────────────────────
def p1(o, nav, R, desktop: bool) -> None:
    a = al(R)
    for L0, botao, esperados in ((COBRANCAS, '[data-ver-todos="cobrancas"]', a.get("cobrancas") or {}),
                                 (LANCAMENTOS, '[data-ver-todos="lancamentos"]', a.get("lancamentos") or {}),
                                 (RECIBOS, '[data-ver-todos="recibos-aluno"]', a.get("recibos") or {})):
        L = com_conta(dataclasses.replace(L0, rota=rota(R, "financeiro")), R)
        t = f"[P1 {L.nome}{'' if desktop else ' 390px'}]"
        caso, rede = R.novo_caso(nav, f"p1_{L.nome}" + ("" if desktop else "_390px"), desktop=desktop, fontes=L.fontes)
        try:
            R.entrar(caso, L.rota, L.conta)
            n_botao = numero_do_botao(caso, botao) if caso.esperar(lambda: caso.tem(botao), 90) else None
            if not o.ok(clicar(caso, botao, 30), f"{t} o botão 'Ver todos (N)' ({botao})"):
                caso.diagnostico()
                continue
            if desktop:
                provar_paginas(o, caso, rede, R, L, t, esperados)
                total = T.ler(caso, L).get("total")
                o.ok(n_botao is not None and (total is None or n_botao == total), f"{t} o botão dizia ({n_botao}) = o total da lista ({total})")
            else:
                ok, _ = T.esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 60)
                o.ok(ok, f"{t} a lista abre no celular")
                T.rolar_ate(caso, f'[data-paginacao="{L.nome}"]')
                largura_ok(o, caso, t)
                o.linha(f"   print: {caso.print(f'{L.nome}_390px')}")
        finally:
            caso.fim()
    if not desktop:
        return
    # os totais "Recebido/Gasto" do banco (financeiro_totais_do_aluno)
    t = "[P1 totais]"
    cont = a.get("contagens") or {}
    caso, rede = R.novo_caso(nav, "p1_totais", fontes=(("rpc", "financeiro_totais_do_aluno"),))
    try:
        R.entrar(caso, rota(R, "financeiro"), chave_prof(R))
        el = caso.pg.locator("[data-totais-aluno]").first
        ok = caso.esperar(lambda: el.count() > 0 and (el.get_attribute("data-recebido") or "") != "" and (el.get_attribute("data-gasto") or "") != "", 90)
        if not o.ok(ok, f"{t} os totais na tela (data-totais-aluno com data-recebido e data-gasto)"):
            caso.diagnostico()
            return
        rec, gas = float(el.get_attribute("data-recebido")), float(el.get_attribute("data-gasto"))
        seus = abs(rec - float(cont.get("recebido") or 0)) < 0.01 and abs(gas - float(cont.get("gasto") or 0)) < 0.01
        todos = abs(rec - float(cont.get("recebido_todos") or 0)) < 0.01 and abs(gas - float(cont.get("gasto_todos") or 0)) < 0.01
        o.ok(seus or todos, f"{t} Recebido {rec:.2f} e Gasto {gas:.2f} = o banco ({'os lançamentos dela' if seus else 'todos os do aluno' if todos else 'NÃO bate'}: "
                            f"dela {cont.get('recebido')}/{cont.get('gasto')}; todos {cont.get('recebido_todos')}/{cont.get('gasto_todos')}; sem os estornados)")
        rpc = [e for e in rede.eventos if e["nome"] == "financeiro_totais_do_aluno" and e["status"] < 300]
        o.ok(bool(rpc), f"{t} os totais vêm da RPC financeiro_totais_do_aluno ({len(rpc)} pedido(s); nenhum lançamento é somado no navegador)")
        o.linha(f"   print: {caso.print('financeiro_aluno_totais')}")
    finally:
        caso.fim()


# ───────────────────────── P2 Anotações ─────────────────────────
def p2(o, nav, R, desktop: bool) -> None:
    L = com_conta(dataclasses.replace(ANOTACOES, rota=rota(R, "prontuario")), R)
    if desktop:
        T.provar_lista(o, nav, R, L)
    else:
        T.provar_lista_celular(o, nav, R, L)


# ───────────────────────── P3 Exames ─────────────────────────
def p3(o, nav, R, desktop: bool) -> None:
    a = al(R)
    base = rota(R, "prontuario") + "?secao=exames"
    L = com_conta(dataclasses.replace(EXAMES, rota=base), R)
    t = f"[P3 exames{'' if desktop else ' 390px'}]"
    caso, rede = R.novo_caso(nav, "p3_exames" + ("" if desktop else "_390px"), desktop=desktop, fontes=L.fontes)
    try:
        R.entrar(caso, L.rota, L.conta)
        if not desktop:
            ok, _ = T.esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 90)
            o.ok(ok, f"{t} as datas abrem no celular")
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print('exames_390px')}")
            return
        provar_paginas(o, caso, rede, R, L, t, a.get("exames_datas") or [])
        # a data nunca é partida: cada grupo de data tem os resultados dela (1 por data na massa)
        grupos = caso.pg.evaluate("""() => [...document.querySelectorAll('[data-lista="exames"] [data-grupo-data]')]
            .map((g) => [g.getAttribute('data-grupo-data'), g.getAttribute('data-grupo-total'), g.querySelectorAll('[data-resultado]').length])""")
        partidos = [g for g in grupos if g[1] is not None and str(g[1]).isdigit() and int(g[1]) != g[2]]
        o.ok(grupos and not partidos, f"{t} cada data com todos os resultados dela ({len(grupos)} grupo(s); partidos: {len(partidos)})")
        # "Ver evolução de" um exame: o pedido com p_exame e as datas só dele
        exame = a.get("exame_a")
        n_a = (a.get("contagens") or {}).get("exame_a_datas")
        sel = caso.pg.locator("[data-filtro-exame]").first
        if o.ok(sel.count() > 0 and exame, f"{t} o filtro 'Ver evolução de' (data-filtro-exame)"):
            desde = len(rede.eventos)
            try:
                sel.select_option(label=exame)
            except Exception:  # noqa: BLE001 — o valor da opção pode ser o nome
                sel.select_option(exame)
            ok, sf = T.esperar_lista(caso, L, lambda e: e["total"] == n_a and e["pagina"] == 1, 30)
            ped = [e for e in rede.eventos[desde:] if e["nome"] == "exames_do_aluno" and (e.get("corpo") or {}).get("p_exame") == exame]
            o.ok(ok and sf["rotulo"] == T.rotulo(1, n_a or 0), f"{t} 'Ver evolução de' o exame A: '{sf.get('rotulo')}' (esperado '{T.rotulo(1, n_a or 0)}')")
            o.ok(bool(ped), f"{t} o pedido leva só aquele exame (p_exame): {T.descr(ped[-1]) if ped else 'nenhum com p_exame'}")
            o.linha(f"   print: {caso.print('exames_evolucao')}")
    finally:
        caso.fim()
    # os pedidos de exame
    Lp = com_conta(dataclasses.replace(PEDIDOS, rota=base), R)
    t = "[P3 pedidos-exame]"
    caso, rede = R.novo_caso(nav, "p3_pedidos", fontes=Lp.fontes)
    try:
        R.entrar(caso, Lp.rota, Lp.conta)
        provar_paginas(o, caso, rede, R, Lp, t, a.get("pedidos") or {})
    finally:
        caso.fim()


# ───────────────────────── P4 Acompanhamento ─────────────────────────
def p4(o, nav, R, desktop: bool) -> None:
    t = f"[P4 acompanhamento{'' if desktop else ' 390px'}]"
    caso, rede = R.novo_caso(nav, "p4_acompanhamento" + ("" if desktop else "_390px"), desktop=desktop, fontes=(("tabela", "registros_diarios"),))
    try:
        R.entrar(caso, rota(R, "dieta") + "?secao=acompanhamento", chave_prof(R))
        ok = caso.esperar(lambda: caso.tem("[data-secao-acompanhamento]"), 90)
        caso.esperar(lambda: any(e["nome"] == "registros_diarios" for e in rede.eventos), 30)
        if desktop and ok:
            preset = caso.pg.locator("[data-btn-preset]")
            if preset.count() > 1:  # outro período: um pedido novo, com o período novo
                preset.nth(1).click()
                caso.pg.wait_for_timeout(2500)
        leituras = [e for e in rede.eventos if e["nome"] == "registros_diarios" and e["metodo"] in ("GET", "HEAD")]
        # o aviso "dia já registrado" do diálogo pergunta 1 dia FORA do período (HEAD só com a contagem, data=eq.) — não é a lista
        do_dia = [e for e in leituras if e["metodo"] == "HEAD" and any(k == "data" and str(v).startswith("eq.") for k, v in e.get("query_pares") or [])]
        sem = [e for e in leituras if e not in do_dia and not (any(k == "data" and str(v).startswith("gte.") for k, v in e.get("query_pares") or [])
                                                               and any(k == "data" and str(v).startswith("lte.") for k, v in e.get("query_pares") or []))]
        o.ok(ok and leituras and not sem, f"{t} todo pedido a registros_diarios leva o período (data=gte e data=lte): {len(leituras)} pedido(s), "
                                          f"{len(sem)} sem o período" + (f" (+ {len(do_dia)} HEAD de 1 dia do diálogo)" if do_dia else ""))
        if not desktop:
            largura_ok(o, caso, t)
        o.linha(f"   print: {caso.print('acompanhamento' + ('' if desktop else '_390px'))}")
    finally:
        caso.fim()


# ───────────────────────── P5 / P6 app ─────────────────────────
def provar_app(o, nav, R, desktop: bool, L0: Lista, botao: str, esperados, t: str) -> None:
    L = com_conta(L0, R, chave_aluno(R))
    caso, rede = R.novo_caso(nav, f"{L.nome}" + ("" if desktop else "_390px"), desktop=desktop, fontes=L.fontes)
    try:
        R.entrar(caso, L.rota, L.conta)

        def abrir() -> bool:
            if not clicar(caso, botao, 90):
                return False
            return caso.esperar(lambda: caso.tem(f'[data-folha-todos] [data-lista="{L.nome}"]') or caso.tem(f'[data-paginacao="{L.nome}"]'), 30)

        n_botao = numero_do_botao(caso, botao) if caso.esperar(lambda: caso.tem(botao), 90) else None
        if desktop:
            T.provar_folha(o, caso, rede, R, L, abrir, t, busca_massa=False, esperados=esperados)
            ok = abrir() and T.esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 30)[0]
            st = T.ler(caso, L) if ok else {}
            o.ok(ok and n_botao is not None and n_botao == st.get("total"), f"{t} o botão 'Ver todos ({n_botao})' = o total da folha ({st.get('total')})")
            T.fechar_dialogo(caso)
        else:
            ok = abrir() and T.esperar_lista(caso, L, lambda e: e["temPaginacao"] and e["textos"], 60)[0]
            o.ok(ok, f"{t} a folha abre no celular")
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print(f'{L.nome}_390px')}")
            T.fechar_dialogo(caso)
    finally:
        caso.fim()


def p5(o, nav, R, desktop: bool) -> None:
    a = al(R)
    provar_app(o, nav, R, desktop, APP_PAGAMENTOS, '[data-ver-todos="pagamentos"]', a.get("cobrancas") or {}, f"[P5 app-pagamentos{'' if desktop else ' 390px'}]")
    provar_app(o, nav, R, desktop, APP_RECIBOS, '[data-ver-todos="recibos"]', a.get("recibos") or {}, f"[P5 app-recibos{'' if desktop else ' 390px'}]")


def p6(o, nav, R, desktop: bool) -> None:
    a = al(R)
    t = f"[P6 app-agenda{'' if desktop else ' 390px'}]"
    if desktop:  # o cartão "Próximas" mostra as 20 primeiras
        caso, _ = R.novo_caso(nav, "p6_proximas", fontes=())
        try:
            R.entrar(caso, APP_AGENDA.rota, chave_aluno(R))
            ok = caso.esperar(lambda: caso.tem('[data-ver-todos="agenda"]'), 90)
            n = caso.pg.locator('[data-agenda-lista="proximas"] > *').count()
            o.ok(ok and 0 < n <= POR_PAGINA, f"{t} 'Próximas' mostra as {POR_PAGINA} primeiras ({n}) e o 'Ver todas (N)'")
        finally:
            caso.fim()
    provar_app(o, nav, R, desktop, APP_AGENDA, '[data-ver-todos="agenda"]', a.get("consultas") or {}, t)


# ───────────────────────── P7 Pré-consulta · P8 Dashboard (nutri-legado, massa da 14b) ─────────────────────────
def p7(o, nav, R, desktop: bool) -> None:
    t = f"[P7 pré-consulta{'' if desktop else ' 390px'}]"
    cont = (R.massa or {}).get("contagens") or {}
    caso, rede = R.novo_caso(nav, "p7_preconsulta" + ("" if desktop else "_390px"), desktop=desktop,
                             fontes=(("rpc", "preconsulta_numeros"), ("tabela", "respostas_preconsulta")))
    try:
        R.entrar(caso, "/painel/pre-consulta", R.chave)
        el = caso.pg.locator("[data-resumo-preconsulta][data-novas]").first
        ok = caso.esperar(lambda: el.count() > 0, 90)
        caso.esperar(lambda: any(e["nome"] == "preconsulta_numeros" and e.get("numeros") for e in rede.eventos), 30)
        caso.pg.wait_for_timeout(1500)
        num = next((e["numeros"] for e in reversed(rede.eventos) if e["nome"] == "preconsulta_numeros" and e.get("numeros")), None)
        if not o.ok(ok and num, f"{t} os números do topo (data-resumo-preconsulta) e a resposta da preconsulta_numeros"):
            caso.diagnostico()
            return
        tela = {k: el.get_attribute(f"data-{k}") for k in ("novas", "mes", "ligadas")}
        iguais = all(str(tela[k]) == str(num.get(k)) for k in tela)
        o.ok(iguais, f"{t} a tela = a RPC: novas {tela['novas']}/{num.get('novas')} · no mês {tela['mes']}/{num.get('mes')} · ligadas {tela['ligadas']}/{num.get('ligadas')}")
        no_banco = T.MASSA + int(cont.get("respostas_fundo") or 0)
        o.ok(num.get("total") == no_banco, f"{t} o total da RPC = o banco ({num.get('total')} = 41 da massa + {cont.get('respostas_fundo')} de fundo)")
        grandes = [e for e in rede.eventos if e["nome"] == "respostas_preconsulta" and (e["limite"] or 0) >= 1000]
        o.ok(not grandes, f"{t} nenhum pedido de respostas_preconsulta com limit 1000 ({len(grandes)}; a listarRespostas saiu)")
        if desktop:
            desde = len(rede.eventos)
            caso.ir("/painel/pre-consulta?aba=formularios")
            titulo = f"{(R.massa or {}).get('marca', '')} · formulário"
            f = caso.pg.locator(f'[data-formulario-titulo="{titulo}"]').first
            if o.ok(caso.esperar(lambda: f.count() > 0, 60), f"{t} o formulário da massa na aba Formulários"):
                # a lista dos formulários chega antes dos números (enquanto carregam, a tela mostra "…" e os atributos ficam 0 · 0): espera
                # a preconsulta_numeros desta abertura responder e os 2 atributos assentarem, e lê os 2 de uma vez
                caso.esperar(lambda: any(e["nome"] == "preconsulta_numeros" and e.get("numeros") for e in rede.eventos[desde:]), 30)
                lidos: dict = {}

                def assentou() -> bool:
                    r, n = f.evaluate("(e) => [e.getAttribute('data-formulario-respostas'), e.getAttribute('data-formulario-novas')]")
                    lidos.update(respostas=r, novas=n)
                    return r == str(T.MASSA) and n == str(T.MASSA)

                caso.esperar(assentou, 20)
                o.ok(lidos.get("respostas") == str(T.MASSA) and lidos.get("novas") == str(T.MASSA),
                     f"{t} o formulário com '{lidos.get('respostas')} respostas · {lidos.get('novas')} novas' (o por_formulario da RPC; esperado 41 · 41)")
            grandes = [e for e in rede.eventos if e["nome"] == "respostas_preconsulta" and (e["limite"] or 0) >= 1000]
            o.ok(not grandes, f"{t} nas 2 abas: nenhum pedido de 1000 respostas ({len(grandes)})")
        else:
            largura_ok(o, caso, t)
        o.linha(f"   print: {caso.print('preconsulta' + ('' if desktop else '_390px'))}")
    finally:
        caso.fim()


def horas_desde(e: dict) -> float | None:
    """O começo da janela de um pedido ao diário (data_hora=gte.<instante>) em horas antes de agora."""
    for k, v in e.get("query_pares") or []:
        if k == "data_hora" and str(v).startswith("gte."):
            try:
                inicio = datetime.fromisoformat(str(v)[4:].replace("Z", "+00:00"))
            except ValueError:
                return None
            if inicio.tzinfo is None:
                inicio = inicio.replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - inicio).total_seconds() / 3600
    return None


def p8(o, nav, R, desktop: bool) -> None:
    t = "[P8 dashboard]"
    caso, rede = R.novo_caso(nav, "p8_dashboard", desktop=desktop, fontes=(("tabela", "diario_alimentar"),))
    try:
        R.entrar(caso, "/painel", R.chave)
        caso.esperar(lambda: caso.tem("[data-menu-lateral]"), 60)
        caso.esperar(lambda: any(e["nome"] == "diario_alimentar" and e["metodo"] == "HEAD" for e in rede.eventos), 45)
        caso.pg.wait_for_timeout(3000)
        heads = [e for e in rede.eventos if e["nome"] == "diario_alimentar" and e["metodo"] == "HEAD"
                 and any(k == "reacao_nutri" and str(v).startswith("is.null") for k, v in e.get("query_pares") or [])]
        grandes = [e for e in rede.eventos if e["nome"] == "diario_alimentar" and e["metodo"] == "GET" and (e["limite"] or 0) >= 1000]
        # D36 tirou só o diario7 (a lista de 7 dias, até 1000, que contava as fotos sem reação); o "Diário de hoje" da W24
        # (useDiarioDaConta(conta, você, 1): as miniaturas e a atividade do dia — useDashboard.ts:142) fica: a janela é o dia de hoje
        hoje = [e for e in grandes if (h := horas_desde(e)) is not None and h <= 26]
        o.ok(bool(heads), f"{t} o número das fotos sem reação vem do HEAD (contarDiario, reacao_nutri=is.null): {len(heads)} pedido(s) "
                          f"(content-range {heads[-1]['content_range'] if heads else '—'})")
        o.ok(len(grandes) == len(hoje), f"{t} nenhum pedido do diário de 7 dias com limit 1000 (o diario7 saiu): {len(grandes) - len(hoje)} "
                                        f"(o 'Diário de hoje' da W24, só o dia de hoje: {len(hoje)} pedido(s) — fica, D36)")
        o.linha(f"   print: {caso.print('dashboard')}")
    finally:
        caso.fim()


CASOS = {
    "P1": Caso14d("P1", "Financeiro do aluno", "aluno", p1),
    "P2": Caso14d("P2", "Anotações", "aluno", p2),
    "P3": Caso14d("P3", "Exames e pedidos", "aluno", p3),
    "P4": Caso14d("P4", "Acompanhamento", "aluno", p4),
    "P5": Caso14d("P5", "app › Pagamentos", "aluno", p5),
    "P6": Caso14d("P6", "app › Agenda", "aluno", p6),
    "P7": Caso14d("P7", "Pré-consulta", "14b", p7),
    "P8": Caso14d("P8", "Dashboard", "14b", p8, modos=(True,)),
}


# ───────────────────────── X1 (produção, só leitura): por aluno da nutri-legado ─────────────────────────
def aluno_de_teste_producao(R, chave: str) -> dict | None:
    """Um aluno da conta de TESTE na produção (só leitura): o com mais anotações e exames — a lista não fica vazia."""
    conta = R.conta_ativa.get(chave)
    if not conta:
        return None
    try:
        r = R.C.ler(R.C.PRINCIPAL_REF, f"""
          select coalesce(p.treino_user_id, p.id)::text as rota,
                 (select count(*) from public.registros_prontuario x where x.paciente_id = p.id and x.deleted_at is null) +
                 (select count(*) from public.resultados_exame x where x.paciente_id = p.id and x.deleted_at is null) as n
            from public.pacientes p
           where p.conta_id = {R.C.txt(conta)}::uuid and p.deleted_at is null
           order by 2 desc, p.created_at limit 1""")
    except Exception:  # noqa: BLE001
        return None
    return r[0] if r else None


def listas_x1(o, R, chave: str, navs: set[str]) -> list[Lista]:
    """Anotações, exames, pedidos e o Financeiro do aluno (os 3 "Ver todos") de um aluno de teste da conta com Nutrição."""
    if "/painel/dietas" not in navs:
        o.linha(f"   [prod {chave} · X1 por aluno] fica de fora: a conta não tem Nutrição")
        return []
    aluno = aluno_de_teste_producao(R, chave)
    if not aluno:
        o.linha(f"   [prod {chave} · X1 por aluno] fica de fora: nenhum aluno na conta de teste")
        return []
    base = f"/painel/alunos/{aluno['rota']}"
    return [
        Lista("anotacoes", f"{base}/prontuario", (("rpc", "aluno_anotacoes"),), None, (), chave="pagina_anotacoes"),
        Lista("exames", f"{base}/prontuario?secao=exames", (("rpc", "exames_do_aluno"),), None, (), chave="pagina_exames"),
        Lista("pedidos-exame", f"{base}/prontuario?secao=exames", (("tabela", "pedidos_exame"),), None, (), chave="pagina_pedidos"),
        Lista("aluno-cobrancas", f"{base}/financeiro", (("funcao", PAGAMENTOS),), None, (), acoes=("prof_aluno_cobrancas",), chave="pagina_cobrancas",
              antes='[data-ver-todos="cobrancas"]'),
        Lista("aluno-lancamentos", f"{base}/financeiro", (("tabela", "transacoes"),), None, (), chave="pagina_lancamentos", antes='[data-ver-todos="lancamentos"]'),
        Lista("aluno-recibos", f"{base}/financeiro", (("tabela", "recibos"),), None, (), chave="pagina_recibos", antes='[data-ver-todos="recibos-aluno"]'),
    ]
