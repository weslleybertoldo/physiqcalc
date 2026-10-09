"""Physiq hml-14d — casos M1–M7 do e2e/hml14/telas.py: o painel MASTER em páginas de 20 do banco (D28).

Conta: o master de teste da W27 (w27-master), master SÓ no staging.profiles pela massa "master" (o tirar_master no --limpar). Os
totais esperados vêm do banco com a regra de cada RPC (massa_principal.contar_master, só leitura). Fontes da página: as funções
master-contas (listar, integracoes, alunos — offset/limite —, sem_conta), master-financeiro (listar) e master-planos (alunos_app), e a
RPC exercicios_da_lista do Treino (a Biblioteca do master).
  M1  Contas: L1–L3 (?conta= abre a folha e fecha mantendo ?pagina=2) e L5–L7 sem massa; a busca vai ao banco (filtros.busca)
  M2  Financeiro: L1–L3 (?conta= abre e fecha mantendo ?pagina=2) e L5; o chip das "Faturas recentes" = o total de faturas do banco
      (data-faturas-total) e o cartão com as 10
  M3  Integrações: L1–L3 e L5
  M4  App do aluno: L1–L8 com os 41 alunos da massa na conta do app (16 + 41 = 57 no staging de hoje); a busca nova (data-busca-app)
  M5  Alunos: 20 por página, ?pagina=, a marca da 14b (41 + o gêmeo) até a última página, o Zé Último por CPF, por telefone e "ze ultimo"
      (sem acento), "Marcar todos" = a página (só a seleção na tela: nenhuma ação em lote)
  M6  Sem conta: "1–N de N" com N = o banco (17 no staging: uma página, sem setas)
  M7  Biblioteca do master: os globais do Treino ("1–20 de 144"), páginas, a busca e ?pagina= (os "dos professores" não têm prova de tela:
      o master de teste não é master no Treino — P9)
"""
from __future__ import annotations

import re

import telas as T
from telas import POR_PAGINA, Caso14d, Lista

MASTER = "w27-master"


def ms(R) -> dict:
    return R.parte("master")


CONTAS = Lista("master-contas", "/master/contas", (("funcao", "master-contas"),), None, ("[data-busca-contas]",),
               ("[data-linha-conta]", "url:conta=", "esc"), fundo="contas", parte="master", conta=MASTER, acoes=("listar",), saida="/master",
               nome_item="@data-linha-conta")
FINANCEIRO = Lista("master-financeiro", "/master/financeiro", (("funcao", "master-financeiro"),), None, (),
                   ("[data-linha-financeiro]", "url:conta=", "esc"), fundo="financeiro",
                   parte="master", conta=MASTER, acoes=("listar",), saida="/master", nome_item="@data-linha-financeiro")
INTEGRACOES = Lista("master-integracoes", "/master/integracoes", (("funcao", "master-contas"),), None, (), None, fundo="contas", parte="master",
                    conta=MASTER, acoes=("integracoes",), saida="/master", nome_item="@data-linha-integracao")
APP = Lista("master-app", "/master/app-do-aluno", (("funcao", "master-planos"),), "app", ("[data-busca-app]",), None, fundo="app_fundo",
            parte="master", conta=MASTER, acoes=("alunos_app",), saida="/master")
ALUNOS = Lista("master-alunos", "/master/alunos", (("funcao", "master-contas"),), "aluno", ("[data-busca-alunos]",), None, fundo="alunos_ativos",
               parte="master", conta=MASTER, acoes=("alunos",), saida="/master")
SEM_CONTA = Lista("master-sem-conta", "/master/alunos?modo=sem_conta", (("funcao", "master-contas"),), None, ("[data-busca-alunos]",), None,
                  fundo="sem_conta", parte="master", conta=MASTER, acoes=("sem_conta",), saida="/master")
BIBLIOTECA = Lista("master-biblioteca", "/master/biblioteca", (("rpc", "exercicios_da_lista"),), None, ("[data-input-busca-exercicio]",), None,
                   fundo="exercicios_globais", parte="treino", conta=MASTER, saida="/master")


def entrar(R, nav, nome: str, L: Lista, desktop: bool = True, rota: str | None = None) -> tuple:
    caso, rede = R.novo_caso(nav, nome + ("" if desktop else "_390px"), desktop=desktop, fontes=L.fontes)
    R.entrar(caso, rota or L.rota, MASTER)
    return caso, rede


def generico(L: Lista):
    """L1–L8 da 14b (provar_lista / provar_lista_celular) com a lista do master."""
    def caso(o, nav, R, desktop: bool) -> None:
        if desktop:
            T.provar_lista(o, nav, R, L)
        else:
            T.provar_lista_celular(o, nav, R, L)
    return caso


def m1(o, nav, R, desktop: bool) -> None:
    generico(CONTAS)(o, nav, R, desktop)
    if not desktop:
        return
    t = "[M1 master-contas]"
    caso, rede = entrar(R, nav, "m1_busca", CONTAS)
    try:
        ok, st = T.esperar_lista(caso, CONTAS, lambda e: e["temPaginacao"] and e["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre (de novo)"):
            return
        nome = T.nome_do_item(st, 0, CONTAS)
        termo = nome.split(" ")[0] if nome else ""
        desde = len(rede.eventos)
        busca = T.campo_busca(caso, CONTAS)
        if not o.ok(busca is not None and termo, f"{t} o campo de busca e um nome de conta ({termo!r})"):
            return
        busca.fill(termo)
        caso.esperar(lambda: any(((e.get("corpo") or {}).get("filtros") or {}).get("busca") for e in rede.eventos[desde:]
                                 if e["nome"] == "master-contas" and e.get("acao") == "listar"), 20)
        ped = [e for e in rede.eventos[desde:] if e["nome"] == "master-contas" and e.get("acao") == "listar"
               and ((e.get("corpo") or {}).get("filtros") or {}).get("busca")]
        o.ok(bool(ped) and ped[-1]["pagina"] == 1, f"{t} a busca vai ao banco: o pedido listar leva filtros.busca e pagina 1 "
                                                   f"({T.descr(ped[-1]) if ped else 'nenhum pedido com a busca'})")
        busca.fill("")
    finally:
        caso.fim()


def m2(o, nav, R, desktop: bool) -> None:
    generico(FINANCEIRO)(o, nav, R, desktop)
    if not desktop:
        return
    t = "[M2 master-financeiro]"
    faturas = (ms(R).get("contagens") or {}).get("faturas")
    caso, rede = entrar(R, nav, "m2_faturas", FINANCEIRO)
    try:
        chip = caso.pg.locator("[data-faturas-total]").first
        if not o.ok(caso.esperar(lambda: chip.count() > 0 and chip.is_visible(), 90), f"{t} o chip das 'Faturas recentes' (data-faturas-total)"):
            caso.diagnostico()
            return
        valor = chip.get_attribute("data-faturas-total") or ""
        if not valor.strip().isdigit():
            m = re.search(r"\d+", chip.inner_text())
            valor = m.group(0) if m else ""
        linhas = caso.pg.locator("[data-cartao-faturas-master] [data-fatura-master]").count()
        o.ok(valor.isdigit() and int(valor) == faturas and linhas <= 10,
             f"{t} o chip = o total de faturas do banco ({valor} = {faturas}; P6) e o cartão continua com as 10 mais recentes ({linhas} linha(s))")
        o.linha(f"   print: {caso.print('master_financeiro')}")
    finally:
        caso.fim()


def m4(o, nav, R, desktop: bool) -> None:
    generico(APP)(o, nav, R, desktop)


def m5(o, nav, R, desktop: bool) -> None:
    """Master › Alunos: a 14b dá o Zé Último (CPF e telefone de teste) e os 41 com a marca; o gêmeo (mesmo nome e telefone, outra conta
    de teste) também aparece para o master — ele vê todas as contas."""
    if not desktop:
        T.provar_lista_celular(o, nav, R, ALUNOS)
        return
    t = "[M5 master-alunos]"
    massa = R.massa or {}
    ze, gemeo, marca = massa.get("ze") or {}, massa.get("gemeo"), massa.get("marca", "")
    if not o.ok(bool(ze and marca), f"{t} o Zé Último e a marca da massa da 14b no estado (M5 usa a massa da 14b)"):
        return
    caso, rede = entrar(R, nav, "m5_alunos", ALUNOS)
    try:
        ok, st = T.esperar_lista(caso, ALUNOS, lambda e: e["temPaginacao"] and e["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre com data-lista / data-paginacao 'master-alunos' e as linhas data-item"):
            caso.diagnostico()
            return
        N = int(st["total"] or 0)
        no_banco = (ms(R).get("contagens") or {}).get("alunos_ativos")
        o.ok(st["rotulo"] == T.rotulo(1, N) and len(st["textos"]) == min(POR_PAGINA, N), f"{t} 20 por página: '{st['rotulo']}' ({len(st['textos'])} linhas)")
        if isinstance(no_banco, int) and N != no_banco:
            R.aviso(f"{t} o total da tela ({N}) difere do banco ({no_banco} vivos, ativos, sem bloqueio, fora da conta do app)")
        ev = T.esperar_pedido(caso, rede, ALUNOS, 0, 1)
        o.ok(T.pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} o pedido traz só 20 (limite 20, offset 0): {T.descr(ev) or T.nao_veio(rede, ALUNOS, 0)}")
        desde = len(rede.eventos)
        ok2, st2 = T.mudar_pagina(caso, ALUNOS, st["nome"], "proxima", 2, st)
        ev2 = T.esperar_pedido(caso, rede, ALUNOS, desde, 2)
        o.ok(ok2 and T.na_pagina(st2["url"], 2) and T.pedido_ok(ev2, N, min(POR_PAGINA, N - POR_PAGINA)),
             f"{t} Próxima → '{st2.get('rotulo')}', ?pagina=2 ({st2.get('url')}) e o pedido de offset 20 ({T.descr(ev2) or 'sem pedido'})")
        # a marca: os 41 (e o gêmeo) até a última página; a busca nova volta à 1
        busca = T.campo_busca(caso, ALUNOS)
        if not o.ok(busca is not None, f"{t} a busca [data-busca-alunos]"):
            return
        Nm = T.MASSA + (1 if gemeo else 0)
        busca.fill(marca)
        okm, sm = T.esperar_lista(caso, ALUNOS, lambda e: e["total"] == Nm and e["pagina"] == 1, 30)
        o.ok(okm and T.na_pagina(sm["url"], 1), f"{t} a busca pela marca → '{sm.get('rotulo')}' (esperado '{T.rotulo(1, Nm)}': 41 + o gêmeo) e volta à página 1")
        if okm:
            paginas, _ = T.ate_a_ultima(o, caso, rede, R, ALUNOS, sm["nome"], Nm, sm, t)
            T.conferir_massa_nas_paginas(o, paginas, ALUNOS, t)
        # o Zé por CPF, por telefone e sem acento (a coluna busca: nome, apelido, e-mail, tags e os dígitos ≥ 3)
        for rot, termo in (("CPF", ze.get("cpf")), ("telefone", ze.get("telefone")), ("sem acento", "ze ultimo")):
            if not termo:
                o.ok(False, f"{t} o {rot} do Zé no estado da massa")
                continue
            busca.fill(str(termo))
            okz, sz = T.esperar_lista(caso, ALUNOS, lambda e: any("Último" in x or "Ultimo" in x for x in e["textos"]) and e["pagina"] == 1, 30)
            mostra = {"CPF": "o CPF de teste", "telefone": "o telefone de teste (só dígitos)"}.get(rot, repr(termo))
            o.ok(okz, f"{t} acha o Zé Último por {rot} ({mostra} → '{sz.get('rotulo')}')")
            if rot == "CPF":
                o.ok(okz and sz.get("total") == 1, f"{t} o CPF acha só o Zé (o gêmeo tem outro CPF): {sz.get('total')}")
                o.linha(f"   print: {caso.print('master_alunos_cpf')}")
        # "Marcar todos" = a página (20), só a seleção na tela
        busca.fill(marca)
        T.esperar_lista(caso, ALUNOS, lambda e: e["total"] == Nm and len(e["textos"]) == POR_PAGINA, 30)
        todos = caso.pg.locator("[data-marcar-todos]").first
        if o.ok(todos.count() > 0, f"{t} o 'Marcar todos' (data-marcar-todos)"):
            todos.click()
            caso.pg.wait_for_timeout(600)
            marcados = caso.pg.evaluate(r"""() => [...document.querySelectorAll('[data-marcar-aluno]')].filter((e) => e.getClientRects().length > 0)
                .filter((e) => e.checked === true || e.getAttribute('aria-checked') === 'true' || e.getAttribute('data-state') === 'checked'
                               || (e.querySelector('input') || {}).checked === true).length""")
            o.ok(marcados == POR_PAGINA, f"{t} 'Marcar todos' marca a página: {marcados} de {POR_PAGINA} (nenhuma ação em lote é feita)")
            todos.click()
            caso.pg.wait_for_timeout(400)
        busca.fill("")
    finally:
        caso.fim()


def m6(o, nav, R, desktop: bool) -> None:
    t = f"[M6 master-sem-conta{'' if desktop else ' 390px'}]"
    no_banco = (ms(R).get("contagens") or {}).get("sem_conta")
    caso, rede = entrar(R, nav, "m6_sem_conta", SEM_CONTA, desktop)
    try:
        ok, st = T.esperar_lista(caso, SEM_CONTA, lambda e: e["temPaginacao"] and e["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre com data-lista / data-paginacao 'master-sem-conta'"):
            caso.diagnostico()
            return
        N = int(st["total"] or 0)
        o.ok(N == no_banco, f"{t} o total {N} = o banco ({no_banco}, a regra da master_sem_conta)")
        if N <= POR_PAGINA:
            o.ok(st["rotulo"] == T.rotulo(1, N) and st["anterior"] == "ausente" and st["proxima"] == "ausente" and len(st["textos"]) == N,
                 f"{t} '{st['rotulo']}' sem setas (uma página só), {len(st['textos'])} linhas")
        else:
            o.ok(st["rotulo"] == T.rotulo(1, N) and len(st["textos"]) == POR_PAGINA and st["proxima"] == "ligado", f"{t} '{st['rotulo']}' e o Próxima")
        if desktop:
            ev = T.esperar_pedido(caso, rede, SEM_CONTA, 0, 1)
            o.ok(T.pedido_ok(ev, N, min(POR_PAGINA, N)), f"{t} o pedido sem_conta com a página: {T.descr(ev) or T.nao_veio(rede, SEM_CONTA, 0)}")
            o.linha(f"   print: {caso.print('master_sem_conta')}")
        else:
            larg = caso.pg.evaluate("document.documentElement.scrollWidth")
            o.ok(0 < larg <= T.LARGURA_CELULAR, f"{t} celular 390 px sem rolar para o lado (scrollWidth {larg})")
            o.linha(f"   print: {caso.print('master_sem_conta_390px')}")
        o.linha(f"   {t} página 2+: a prova viva dele em produção (76 'sem conta' = 4 páginas) e o PGlite (P9)")
    finally:
        caso.fim()


CASOS = {
    "M1": Caso14d("M1", "Master › Contas", "master", m1),
    "M2": Caso14d("M2", "Master › Financeiro", "master", m2),
    "M3": Caso14d("M3", "Master › Integrações", "master", generico(INTEGRACOES)),
    "M4": Caso14d("M4", "Master › App do aluno", "master", m4),
    "M5": Caso14d("M5", "Master › Alunos", "master", m5),
    "M6": Caso14d("M6", "Master › Sem conta", "master", m6),
    "M7": Caso14d("M7", "Master › Biblioteca", "master", generico(BIBLIOTECA)),
}
