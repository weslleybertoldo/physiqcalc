"""Physiq hml-14d — casos T1–T8 do e2e/hml14/telas.py: Painel › Treinos e as folhas do editor em páginas de 20 do banco do Treino.

Conta: o professor de teste da massa "treino" (w13-dono, Lucas Ferreira; o aluno dele é o w13-aluno, Rafael Moura). Fontes da página
(o que o pedido confere): RPC modelos_da_lista (Meus treinos), exercicios_da_lista (Biblioteca e a folha Biblioteca, com o professor do
aluno), as funções admin-semana-treinos (quemRecebeLista; modelos da folha), admin-relatorio (historicoMes; historicoUsuario) e
admin-list-users (o seletor de aluno: q, limit 20, ordem "nome").
  T1  Meus treinos: L1–L8 da 14b (a marca → "1–20 de 41"…); a busca pelo nome de um EXERCÍCIO acha o modelo que o usa (#33 com o
      exercício #07); a pasta da massa volta à página 1 e mostra os 5; ?treino=<o #41, fora da página 1> abre estando na 1
  T2  Biblioteca › Minha: L1–L8 (a marca → 41); "Minha (N)" e "Global (N)" = o banco; Global = os globais do banco; os chips de grupo
      filtram no banco (pernas 16, braços 8); a busca sem acento ("exercicio #07")
  T3  Quem recebe: a busca à vista com poucos alunos, o chip "N DE M" = o do servidor, acha o aluno por parte do nome e sem caixa, o
      pedido quemRecebeLista com a página
  T4  Histórico do mês: L1–L5 (os 41 feitos da massa aparecem); o seletor novo filtra pelo aluno (o pedido leva o userId) e volta a
      "Todos os alunos"; na página 2, trocar o aluno volta à 1
  T5  Histórico completo do aluno (folha): "1–20 de N", Próxima até a última (os 41 aparecem), fecha e abre → página 1
  T6  Seletor do Relatório: parte do nome, sem caixa, resposta velha descartada, o pedido do admin-list-users (q, limit 20, ordem)
  T7  folha Modelos do editor (perfil do aluno › Editar treino): a marca → 41, Próxima até a última, fecha e abre → 1 (nada é usado)
  T8  folha Biblioteca do editor: a marca → 41, o chip "pernas" → 16, o pedido com o professor do aluno (nada é adicionado)
"""
from __future__ import annotations

import re

import telas as T
from telas import POR_PAGINA, Caso14d, Lista

PROF = "w13-dono"
FUNCAO_SEMANA, FUNCAO_RELATORIO, FUNCAO_USUARIOS = "admin-semana-treinos", "admin-relatorio", "admin-list-users"


def tr(R) -> dict:
    return R.parte("treino")


# ───────────────────────── as listas ─────────────────────────
MODELOS = Lista("modelos", "/painel/treinos", (("rpc", "modelos_da_lista"),), "treino", ("[data-busca-modelos]",),
                ("[data-modelo]", "url:treino=", "voltar"), fundo="modelos_fundo", parte="treino", conta=PROF)
BIBLIOTECA = Lista("biblioteca", "/painel/treinos?aba=biblioteca&b=minha", (("rpc", "exercicios_da_lista"),), "exercício",
                   ("[data-biblioteca-busca-painel]",), ("[data-exercicio-abrir]", "dialogo", "esc"), fundo="exercicios_fundo", parte="treino",
                   conta=PROF)
HISTORICO = Lista("historico-mes", "/painel/treinos?aba=historico", (("funcao", FUNCAO_RELATORIO),), "feito", (),
                  ("[data-historico-linha]", "dialogo", "esc"), fundo="feitos_mes_fundo", parte="treino", conta=PROF, acoes=("historicoMes",),
                  filtro="seletor-treino")
HISTORICO_ALUNO = Lista("historico-aluno", "/painel/treinos?aba=historico", (("funcao", FUNCAO_RELATORIO),), "feito", (), None,
                        fundo="feitos_aluno_fundo", parte="treino", conta=PROF, acoes=("historicoUsuario",), chave=None)
QUEM_RECEBE = Lista("quem-recebe", "/painel/treinos", (("funcao", FUNCAO_SEMANA),), None, ("[data-quem-recebe-busca]",), None, parte="treino",
                    conta=PROF, acoes=("quemRecebeLista",), chave="pagina_recebe")
FOLHA_MODELOS = Lista("folha-modelos", "", (("funcao", FUNCAO_SEMANA),), "treino", ("[data-folha-modelos-busca]",), None, parte="treino",
                      conta=PROF, acoes=("modelos",), chave=None)
FOLHA_BIBLIOTECA = Lista("folha-biblioteca", "", (("rpc", "exercicios_da_lista"),), "exercício", ("[data-biblioteca-busca]",), None,
                         parte="treino", conta=PROF, chave=None)


def corpo_filtros(e: dict | None) -> dict:
    corpo = (e or {}).get("corpo") or {}
    f = corpo.get("p_filtros")
    return f if isinstance(f, dict) else {}


def entrar(R, nav, nome: str, rota: str, desktop: bool, fontes) -> tuple:
    caso, rede = R.novo_caso(nav, nome + ("" if desktop else "_390px"), desktop=desktop, fontes=fontes)
    R.entrar(caso, rota, PROF)
    return caso, rede


def largura_ok(o, caso, t: str) -> None:
    larg = caso.pg.evaluate("document.documentElement.scrollWidth")
    o.ok(0 < larg <= T.LARGURA_CELULAR, f"{t} celular 390 px sem rolar para o lado (scrollWidth {larg})")


# ───────────────────────── o seletor de aluno do Treino (Histórico e Relatório) ─────────────────────────
JS_OPCOES = r"""(raiz) => {
  const vis = (e) => !!e && e.getClientRects().length > 0;
  const r = document.querySelector(`[data-seletor-aluno-treino="${raiz}"]`);
  const todas = [...document.querySelectorAll('[data-opcao-aluno-treino]')].filter(vis);
  return { ids: todas.map((e) => e.getAttribute('data-opcao-aluno-treino')).filter((v) => v),
           todos: [...document.querySelectorAll('[data-opcao-aluno-treino-todos]')].some(vis),
           mais: (() => { const m = [...document.querySelectorAll('[data-seletor-aluno-treino-mais]')].find(vis); return m ? m.getAttribute('data-total') : null; })(),
           erro: [...document.querySelectorAll('[data-seletor-aluno-treino-erro]')].some(vis),
           raiz: !!r && vis(r) };
}"""


def opcoes(caso, raiz: str) -> dict:
    try:
        return caso.pg.evaluate(JS_OPCOES, raiz)
    except Exception:  # noqa: BLE001 — navegando
        return {"ids": [], "todos": False, "mais": None, "erro": False, "raiz": False}


def campo_seletor(caso, raiz: str):
    """O campo de busca do SeletorAlunoTreino (na raiz ou num portal); se ele abre por clique, clica na raiz antes."""
    r = caso.pg.locator(f'[data-seletor-aluno-treino="{raiz}"]').first
    if not caso.esperar(lambda: r.count() > 0 and r.is_visible(), 60):
        return None
    busca = r.locator("[data-seletor-aluno-treino-busca]").first
    if not busca.count():
        busca = caso.pg.locator("[data-seletor-aluno-treino-busca]").first
    if not caso.esperar(lambda: busca.count() > 0 and busca.is_visible(), 5):
        gatilho = r.locator("[role='combobox'], button").first
        (gatilho if gatilho.count() else r).click()
        if not caso.esperar(lambda: busca.count() > 0 and busca.is_visible(), 10):
            return None
    return busca


def buscar_aluno(caso, raiz: str, termo: str, cond, timeout: float = 25) -> list[str]:
    busca = campo_seletor(caso, raiz)
    if busca is None:
        return []
    busca.fill(termo)
    caso.esperar(lambda: cond(opcoes(caso, raiz)["ids"]), timeout)
    caso.pg.wait_for_timeout(400)
    return opcoes(caso, raiz)["ids"]


def escolher_aluno(caso, raiz: str, termo: str, aluno: str) -> bool:
    """Digita parte do nome e clica na opção do aluno (data-opcao-aluno-treino = o id do Treino)."""
    ids = buscar_aluno(caso, raiz, termo, lambda ids: aluno in ids)
    if aluno not in ids:
        return False
    caso.pg.locator(f'[data-opcao-aluno-treino="{aluno}"]').first.click()
    caso.pg.wait_for_timeout(600)
    return True


def escolher_todos(caso, raiz: str) -> bool:
    """A opção "Todos os alunos" (Histórico): à vista na lista do seletor (abre o seletor se preciso)."""
    alvo = caso.pg.locator("[data-opcao-aluno-treino-todos]").first
    if not (alvo.count() and alvo.is_visible()):
        busca = campo_seletor(caso, raiz)
        if busca is not None:  # a lista do seletor abre no clique (e o termo vazio mostra "Todos os alunos" no topo)
            busca.click()
            if busca.input_value():
                busca.fill("")
        caso.esperar(lambda: alvo.count() > 0 and alvo.is_visible(), 10)
    if not (alvo.count() and alvo.is_visible()):
        return False
    alvo.click()
    caso.pg.wait_for_timeout(600)
    return True


def pedidos_usuarios(rede, desde: int = 0) -> list[dict]:
    return [e for e in rede.eventos[desde:] if e["nome"] == FUNCAO_USUARIOS and e["status"] < 300]


def filtrar_pelo_seletor(o, caso, rede, R, L: Lista, nome: str, N: int, alvo: str) -> None:
    """FILTROS["seletor-treino"] (T4, L6/L7): estando na página 1, escolhe o aluno da massa no seletor novo → o item da última página
    aparece, a página continua a 1 e o pedido historicoMes leva o userId; "Todos os alunos" volta à lista inteira; na página 2, trocar
    o aluno volta à 1."""
    t = f"[{L.nome}]"
    aluno = tr(R).get("aluno")
    desde = len(rede.eventos)
    ok = escolher_aluno(caso, "historico", "Rafa" if "Rafael" in (tr(R).get("aluno_nome") or "") else (tr(R).get("aluno_nome") or "")[:4], aluno)
    o.ok(ok, f"{t} L6 o seletor novo (data-seletor-aluno-treino='historico') acha o aluno da massa por parte do nome")
    okl, sb = T.esperar_lista(caso, L, lambda e: alvo in T.tokens(e, L.tipo) and e["pagina"] == 1, 30)
    com_user = [e for e in rede.eventos[desde:] if e["nome"] == FUNCAO_RELATORIO and e.get("acao") == "historicoMes"
                and ((e.get("corpo") or {}).get("userId") == aluno)]
    o.ok(okl and T.na_pagina(sb["url"], 1, L.chave), f"{t} L6 filtrado pelo aluno: o feito #{alvo} (da última página) aparece na página 1 "
                                                     f"('{sb.get('rotulo')}', {sb.get('url')})")
    o.ok(bool(com_user), f"{t} L6 o pedido historicoMes leva o userId do aluno ({T.descr(com_user[-1]) if com_user else 'nenhum com userId'})")
    o.linha(f"   print: {caso.print('historico_mes_seletor_aluno')}")
    ok_todos = escolher_todos(caso, "historico")
    ok1, s1 = T.esperar_lista(caso, L, lambda e: e["total"] == N and e["pagina"] == 1, 30)
    o.ok(ok_todos and ok1, f"{t} L7 'Todos os alunos' (data-opcao-aluno-treino-todos) volta à lista inteira ('{s1.get('rotulo')}')")
    if not ok1 or N <= POR_PAGINA:
        return
    ok2, s2 = T.mudar_pagina(caso, L, nome, "proxima", 2, s1)
    escolher_aluno(caso, "historico", "Rafa", aluno)
    ok3, s3 = T.esperar_lista(caso, L, lambda e: alvo in T.tokens(e, L.tipo) and e["pagina"] == 1, 30)
    o.ok(ok2 and ok3 and T.na_pagina(s3["url"], 1, L.chave), f"{t} L7 na página 2, trocar o aluno volta à 1 (antes {s2.get('url')}; depois {s3.get('url')})")


T.FILTROS["seletor-treino"] = filtrar_pelo_seletor


# ───────────────────────── T1 Meus treinos ─────────────────────────
def t1(o, nav, R, desktop: bool) -> None:
    if not desktop:
        T.provar_lista_celular(o, nav, R, MODELOS)
        return
    T.provar_lista(o, nav, R, MODELOS)
    t = "[T1 modelos]"
    e = tr(R)
    ids = e.get("modelos") or {}
    caso, rede = entrar(R, nav, "t1_extras", MODELOS.rota, True, MODELOS.fontes)
    try:
        ok, st = T.esperar_lista(caso, MODELOS, lambda x: x["temPaginacao"] and x["textos"], 90)
        if not o.ok(ok, f"{t} a lista abre (de novo)"):
            caso.diagnostico()
            return
        N = int(st["total"] or 0)
        # a busca pelo nome de um EXERCÍCIO (sem acento) acha o modelo que o usa
        busca = T.campo_busca(caso, MODELOS)
        termo = f"exercicio #{e.get('exercicio_da_linha', '07')}"
        desde = len(rede.eventos)
        busca.fill(termo)
        alvo = e.get("modelo_com_linha", "33")
        ok, sb = T.esperar_lista(caso, MODELOS, lambda x: x["total"] == 1 and T.tokens(x, "treino") == [alvo], 30)
        ev = T.esperar_pedido(caso, rede, MODELOS, desde, 1)
        o.ok(ok, f"{t} a busca pelo nome de um exercício ('{termo}', sem acento) acha só o modelo que o usa: treino #{alvo} ('{sb.get('rotulo')}')")
        o.ok(bool(ev) and termo.split()[0] in (corpo_filtros(ev).get("q") or "").lower(),
             f"{t} a busca vai ao banco (p_filtros.q na modelos_da_lista: {T.descr(ev) or 'sem pedido'})")
        busca.fill("")
        ok, s1 = T.esperar_lista(caso, MODELOS, lambda x: x["total"] == N and x["pagina"] == 1, 30)
        # a pasta: na página 2, abrir a pasta da massa volta à 1 e mostra os 5
        pasta = (e.get("pasta") or {}).get("id")
        ok2, s2 = T.mudar_pagina(caso, MODELOS, s1["nome"] or "modelos", "proxima", 2, s1) if ok and N > POR_PAGINA else (False, s1)
        botao = caso.pg.locator(f'[data-pasta="{pasta}"]').first
        if o.ok(ok2 and pasta and caso.esperar(lambda: botao.count() > 0 and botao.is_visible(), 20),
                f"{t} na página 2 ({s2.get('url')}), a pasta da massa à vista (data-pasta)"):
            botao.click()
            na = sorted(e.get("na_pasta") or [])
            okp, sp = T.esperar_lista(caso, MODELOS, lambda x: sorted(t_ for t_ in T.tokens(x, "treino") if t_) == na, 30)
            o.ok(okp and "pasta=" in (sp.get("url") or "") and T.na_pagina(sp["url"], 1) and sp.get("total") == len(na),
                 f"{t} ?pasta= volta à página 1 com os {len(na)} modelos da pasta ('{sp.get('rotulo')}', {sp.get('url')})")
        # ?treino=<o #41> abre estando na página 1 (o #41 nunca está na 1: 40 da massa vêm antes dele)
        id41 = ids.get(f"{T.MASSA:02d}")
        if o.ok(bool(id41), f"{t} o id do modelo #{T.MASSA} no estado da massa"):
            caso.ir(f"/painel/treinos?treino={id41}")
            okd = caso.esperar(lambda: caso.tem(f'[data-modelo-detalhe="{id41}"]'), 60)
            okl, sl = T.esperar_lista(caso, MODELOS, lambda x: x["temPaginacao"] and x["textos"], 30)
            fora = id41 not in (sl.get("ids") or []) and f"{T.MASSA:02d}" not in T.tokens(sl, "treino")
            o.ok(okd and okl and sl.get("pagina") == 1 and fora,
                 f"{t} ?treino=<o #{T.MASSA}> abre o modelo pelo id (data-modelo-detalhe) com a lista na página 1, sem ele nela "
                 f"('{sl.get('rotulo')}', fora da página: {'sim' if fora else 'NÃO'})")
            o.linha(f"   print: {caso.print('modelos_treino_fora_da_pagina')}")
    finally:
        caso.fim()


# ───────────────────────── T2 Biblioteca ─────────────────────────
JS_SEGMENTOS = r"""() => [...document.querySelectorAll('[role="radio"]')].map((e) => (e.innerText || e.textContent || '').trim())"""


def numero_do_segmento(textos: list[str], rotulo: str) -> int | None:
    for x in textos:
        m = re.match(rf"^{rotulo}\s*\((\d+)\)", x.strip())
        if m:
            return int(m.group(1))
    return None


def t2(o, nav, R, desktop: bool) -> None:
    if not desktop:
        T.provar_lista_celular(o, nav, R, BIBLIOTECA)
        return
    T.provar_lista(o, nav, R, BIBLIOTECA)
    t = "[T2 biblioteca]"
    e = tr(R)
    cont = e.get("contagens") or {}
    globais, minha = cont.get("exercicios_globais"), T.MASSA + int(cont.get("exercicios_fundo") or 0)
    caso, rede = entrar(R, nav, "t2_extras", BIBLIOTECA.rota, True, BIBLIOTECA.fontes)
    try:
        ok, st = T.esperar_lista(caso, BIBLIOTECA, lambda x: x["temPaginacao"] and x["textos"], 90)
        if not o.ok(ok, f"{t} a Minha abre (de novo)"):
            caso.diagnostico()
            return
        seg = caso.pg.evaluate(JS_SEGMENTOS)
        n_global, n_minha = numero_do_segmento(seg, "Global"), numero_do_segmento(seg, "Minha")
        o.ok(n_global == globais and n_minha == minha and st["total"] == minha,
             f"{t} as contagens do banco: 'Global ({n_global})' = {globais} globais, 'Minha ({n_minha})' = {minha} (41 da massa + os dele) e a lista Minha {st['total']}")
        # os chips de grupo no banco (com a marca na busca: só a massa)
        busca = T.campo_busca(caso, BIBLIOTECA)
        busca.fill(e.get("marca", ""))
        ok, sm = T.esperar_lista(caso, BIBLIOTECA, lambda x: x["total"] == T.MASSA, 30)
        for chip, n in sorted((e.get("por_chip") or {}).items()):
            if chip not in ("pernas", "bracos"):
                continue
            desde = len(rede.eventos)
            botao = caso.pg.locator(f'[data-filtro-grupo="{chip}"]').first
            if not o.ok(botao.count() > 0, f"{t} o chip '{chip}' (data-filtro-grupo)"):
                continue
            botao.click()
            okc, sc = T.esperar_lista(caso, BIBLIOTECA, lambda x, n_=n: x["total"] == n_ and x["pagina"] == 1, 30)
            ev = next((x for x in reversed(rede.eventos[desde:]) if x["nome"] == "exercicios_da_lista" and x["status"] < 300), None)
            musculos = corpo_filtros(ev).get("musculos")
            o.ok(okc and T.tokens(sc, "exercício") and all(T.tokens(sc, "exercício")),
                 f"{t} o chip '{chip}' filtra no banco: '{sc.get('rotulo')}' (esperado {n} da massa)")
            o.ok(isinstance(musculos, list) and len(musculos) > 0, f"{t} o pedido do chip '{chip}' leva os músculos do grupo (p_filtros.musculos: {musculos})")
        todos = caso.pg.locator('[data-filtro-grupo="todos"]').first
        if todos.count():
            todos.click()
        # a busca sem acento
        busca.fill("exercicio #07")
        oks, ss = T.esperar_lista(caso, BIBLIOTECA, lambda x: x["total"] == 1 and T.tokens(x, "exercício") == ["07"], 30)
        o.ok(oks, f"{t} a busca sem acento ('exercicio #07') acha o 'exercício #07' ('{ss.get('rotulo')}')")
        # Global: os globais do banco, o pedido com o escopo
        busca.fill("")
        desde = len(rede.eventos)
        caso.ir("/painel/treinos?aba=biblioteca&b=global")
        okg, sg = T.esperar_lista(caso, BIBLIOTECA, lambda x: x["temPaginacao"] and x["textos"] and x["total"] == globais, 60)
        ev = next((x for x in reversed(rede.eventos[desde:]) if x["nome"] == "exercicios_da_lista" and x["status"] < 300), None)
        o.ok(okg and sg["rotulo"] == T.rotulo(1, globais or 0), f"{t} Global: '{sg.get('rotulo')}' (esperado '{T.rotulo(1, globais or 0)}' = os globais do banco)")
        o.ok(corpo_filtros(ev).get("escopo") == "global" and T.pedido_ok(ev, globais or -1, min(POR_PAGINA, globais or 0)),
             f"{t} o pedido da Global: escopo 'global', só 20 ({T.descr(ev) or 'sem pedido'})")
        o.linha(f"   print: {caso.print('biblioteca_global')}")
    finally:
        caso.fim()


# ───────────────────────── T3 Quem recebe ─────────────────────────
def t3(o, nav, R, desktop: bool) -> None:
    t = f"[T3 quem-recebe{'' if desktop else ' 390px'}]"
    e = tr(R)
    modelo = (e.get("modelos") or {}).get("01")
    aluno = e.get("aluno")
    if not o.ok(bool(modelo and aluno), f"{t} o modelo #01 e o aluno da massa no estado"):
        return
    caso, rede = entrar(R, nav, "t3_quem_recebe", f"/painel/treinos?treino={modelo}", desktop, QUEM_RECEBE.fontes)
    try:
        ok, st = T.esperar_lista(caso, QUEM_RECEBE, lambda x: x["temPaginacao"] and x["textos"], 90)
        if not o.ok(ok, f"{t} a lista do Quem recebe (data-lista / data-paginacao 'quem-recebe', no [data-quem-recebe-lista])"):
            caso.diagnostico()
            return
        T.rolar_ate(caso, "[data-quem-recebe-lista]")
        busca = T.campo_busca(caso, QUEM_RECEBE)
        o.ok(busca is not None, f"{t} a busca [data-quem-recebe-busca] fica à vista com {st['total']} aluno(s) (B19: sem a trava de mais de 6)")
        ev = T.esperar_pedido(caso, rede, QUEM_RECEBE, 0, 1)
        N = int(st["total"] or 0)
        o.ok(T.pedido_ok(ev, N, min(POR_PAGINA, N)) and (ev or {}).get("corpo", {}).get("grupo") == modelo,
             f"{t} o pedido quemRecebeLista (grupo = o modelo, pagina 1): {T.descr(ev) or T.nao_veio(rede, QUEM_RECEBE, 0)}")
        o.ok(st["rotulo"] == T.rotulo(1, N), f"{t} '{st['rotulo']}' (esperado '{T.rotulo(1, N)}')")
        if desktop:
            dados = None
            try:  # o chip "N DE M" = o total_recebem / total_alunos da resposta
                chip = T.texto_de(caso, "[data-quem-recebe-chip]")
                r = [x for x in rede.eventos if x["nome"] == FUNCAO_SEMANA and x.get("acao") == "quemRecebeLista" and x["status"] < 300]
                dados = r[-1] if r else None
            except Exception:  # noqa: BLE001
                chip = ""
            m = re.search(r"(\d+)\s+DE\s+(\d+)", chip.upper())
            o.ok(bool(m) and dados is not None, f"{t} o chip 'N DE M' do servidor ('{chip}')")
            if busca is not None:
                for termo in ("rafael", "MOURA"):
                    desde = len(rede.eventos)
                    busca.fill(termo)
                    okb = caso.esperar(lambda: caso.tem(f'[data-quem-recebe-aluno="{aluno}"]'), 20)
                    pedido = [x for x in rede.eventos[desde:] if x["nome"] == FUNCAO_SEMANA and x.get("acao") == "quemRecebeLista"]
                    o.ok(okb and bool(pedido), f"{t} a busca '{termo}' (parte do nome, sem caixa) acha o aluno e vai ao servidor "
                                               f"({T.descr(pedido[-1]) if pedido else 'sem pedido'})")
                    if termo == "rafael":
                        o.linha(f"   print: {caso.print('quem_recebe_busca')}")
                busca.fill("zzz-ninguem-hml14d")
                vazio = caso.esperar(lambda: not caso.tem(f'[data-quem-recebe-aluno="{aluno}"]'), 20)
                o.ok(vazio, f"{t} uma busca sem ninguém tira o aluno da lista")
                busca.fill("")
            o.linha(f"   print: {caso.print('quem_recebe')}")
        else:
            busca and busca.fill("rafael")
            caso.pg.wait_for_timeout(1500)
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print('quem_recebe_390px')}")
        o.linha(f"   {t} página 2+ com 41 alunos: só no deno test (D42 — o professor de teste tem {N} aluno(s))")
    finally:
        caso.fim()


# ───────────────────────── T4 Histórico do mês · T5 Histórico completo ─────────────────────────
def t4(o, nav, R, desktop: bool) -> None:
    if desktop:
        T.provar_lista(o, nav, R, HISTORICO)
    else:
        T.provar_lista_celular(o, nav, R, HISTORICO)


def t5(o, nav, R, desktop: bool) -> None:
    t = f"[T5 historico-aluno{'' if desktop else ' 390px'}]"
    e = tr(R)
    aluno = e.get("aluno")
    caso, rede = entrar(R, nav, "t5_historico_aluno", HISTORICO.rota, desktop, HISTORICO.fontes)
    try:
        def abrir() -> bool:
            if not caso.tem("[data-historico-completo-abrir]"):
                escolher_aluno(caso, "historico", "Rafa", aluno)
            b = caso.pg.locator("[data-historico-completo-abrir]").first
            if not caso.esperar(lambda: b.count() > 0 and b.is_visible(), 30):
                return False
            b.click()
            return caso.esperar(lambda: caso.tem("[data-historico-completo]"), 30)

        if desktop:
            T.provar_folha(o, caso, rede, R, HISTORICO_ALUNO, abrir, t, busca_massa=False)
        else:
            ok = abrir() and T.esperar_lista(caso, HISTORICO_ALUNO, lambda x: x["temPaginacao"] and x["textos"], 60)[0]
            o.ok(ok, f"{t} a folha abre com a lista")
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print('historico_aluno_390px')}")
    finally:
        caso.fim()


# ───────────────────────── T6 seletor do Relatório ─────────────────────────
def t6(o, nav, R, desktop: bool) -> None:
    t = f"[T6 seletor relatorio{'' if desktop else ' 390px'}]"
    e = tr(R)
    aluno, prof = e.get("aluno"), e.get("professor")
    caso, rede = entrar(R, nav, "t6_seletor", "/painel/treinos?aba=relatorio", desktop, (("funcao", FUNCAO_USUARIOS), ("funcao", FUNCAO_RELATORIO)))
    try:
        busca = campo_seletor(caso, "relatorio")
        if not o.ok(busca is not None, f"{t} o seletor novo (data-seletor-aluno-treino='relatorio' + data-seletor-aluno-treino-busca)"):
            caso.diagnostico()
            return
        o.ok(not caso.tem('[data-relatorio-painel] select[data-seletor-aluno]'), f"{t} o <select> antigo (data-seletor-aluno) saiu do Relatório")
        termos = (("parte do nome", "afael"), ("sem caixa", "RAFAEL MOURA")) if desktop else (("parte do nome", "afael"),)
        for rot, termo in termos:
            desde = len(rede.eventos)
            ids = buscar_aluno(caso, "relatorio", termo, lambda ids: aluno in ids)
            o.ok(aluno in ids, f"{t} acha o aluno por {rot} ({termo!r} → {len(ids)} opção(ões))")
            ped = [x for x in pedidos_usuarios(rede, desde) if (x.get("q") or "").strip().lower() == termo.strip().lower()]
            corpo = (ped[-1].get("corpo") or {}) if ped else {}
            if desktop:
                o.ok(bool(ped) and corpo.get("limit") == POR_PAGINA and corpo.get("ordem") == "nome",
                     f"{t} o pedido do admin-list-users por {rot}: q, limit 20, ordem 'nome' ({T.descr(ped[-1]) if ped else 'nenhum com esse termo'})")
        o.linha(f"   {t} acento de verdade ('jose' acha 'José') e '20 de N — refine a busca': só no deno test/Vitest (os alunos de teste do "
                f"professor não têm acento e são {len(opcoes(caso, 'relatorio')['ids'])})")
        if desktop:
            # resposta velha: a busca anterior ("Lucas", o próprio professor) retida até a nova ("Rafael") chegar
            retidos: list = []

            def reter(route) -> None:
                q = str((T.corpo_json(route.request.post_data) or {}).get("q") or "")
                if route.request.method == "POST" and q.strip().lower() == "lucas":
                    retidos.append(route)
                    return
                route.continue_()

            padrao = f"**/functions/v1/{FUNCAO_USUARIOS}*"
            caso.pg.route(padrao, reter)
            final: list[str] = []
            try:
                busca = campo_seletor(caso, "relatorio")
                busca.fill("Lucas")
                segurou = caso.esperar(lambda: bool(retidos), 10)
                nova = buscar_aluno(caso, "relatorio", "Rafael", lambda ids: ids == [aluno]) == [aluno]
            finally:
                for r in retidos:
                    try:
                        r.continue_()
                    except Exception:  # noqa: BLE001 — a tela já cancelou o pedido (também vale)
                        pass
                caso.pg.wait_for_timeout(3000)
                final = opcoes(caso, "relatorio")["ids"]
                try:
                    caso.pg.unroute(padrao, reter)
                except Exception:  # noqa: BLE001
                    pass
            o.ok(segurou and nova and final == [aluno], f"{t} digitar rápido: a resposta velha ('Lucas', retida) não aparece por cima da nova — no fim só "
                                                       f"o aluno ({len(final)} opção(ões); retida: {'sim' if segurou else 'não'}; o professor {prof[:8] if prof else '?'}… não aparece)")
            caso.pg.locator(f'[data-opcao-aluno-treino="{aluno}"]').first.click()
            desde = len(rede.eventos)
            okr = caso.esperar(lambda: caso.tem("[data-relatorio-resumo]") or caso.tem("[data-relatorio-vazio]"), 60)
            ped = [x for x in rede.eventos[desde:] if x["nome"] == FUNCAO_RELATORIO and x.get("acao") == "relatorio"
                   and (x.get("corpo") or {}).get("userId") == aluno]
            o.ok(okr and bool(ped), f"{t} escolher o aluno abre o relatório dele (o pedido 'relatorio' com o userId)")
            o.linha(f"   print: {caso.print('relatorio_seletor')}")
        else:
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print('relatorio_seletor_390px')}")
    finally:
        caso.fim()


# ───────────────────────── T7 / T8 folhas do editor ─────────────────────────
def rota_editor(R) -> str:
    return f"/painel/alunos/{tr(R).get('aluno')}/editar"  # a rota do aluno com login é o id do Treino (rota_id = treino_user_id)


def t7(o, nav, R, desktop: bool) -> None:
    t = f"[T7 folha-modelos{'' if desktop else ' 390px'}]"
    caso, rede = entrar(R, nav, "t7_folha_modelos", rota_editor(R), desktop, FOLHA_MODELOS.fontes)
    try:
        def abrir() -> bool:
            b = caso.pg.locator("[data-treino-modelos]").first
            if not caso.esperar(lambda: b.count() > 0 and b.is_visible(), 90):
                return False
            b.click()
            return caso.esperar(lambda: caso.tem("[data-folha-modelos]"), 30)

        if desktop:
            T.provar_folha(o, caso, rede, R, FOLHA_MODELOS, abrir, t)  # só busca e página: nenhum modelo é usado
        else:
            ok = abrir() and T.esperar_lista(caso, FOLHA_MODELOS, lambda x: x["temPaginacao"] and x["textos"], 60)[0]
            o.ok(ok, f"{t} a folha abre com a lista")
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print('folha_modelos_390px')}")
    finally:
        caso.fim()


def t8(o, nav, R, desktop: bool) -> None:
    t = f"[T8 folha-biblioteca{'' if desktop else ' 390px'}]"
    e = tr(R)
    caso, rede = entrar(R, nav, "t8_folha_biblioteca", rota_editor(R), desktop, FOLHA_BIBLIOTECA.fontes)
    try:
        def abrir() -> bool:
            b = caso.pg.locator("[data-treino-adicionar]").first
            if not caso.esperar(lambda: b.count() > 0 and b.is_visible(), 90):
                return False
            b.click()
            return caso.esperar(lambda: caso.tem("[data-folha-biblioteca]"), 30)

        if not desktop:
            ok = abrir() and T.esperar_lista(caso, FOLHA_BIBLIOTECA, lambda x: x["temPaginacao"] and x["textos"], 60)[0]
            o.ok(ok, f"{t} a folha abre com a lista ('Adicionar exercício' do treino aberto do aluno)")
            largura_ok(o, caso, t)
            o.linha(f"   print: {caso.print('folha_biblioteca_390px')}")
            return
        # só busca, grupo e página: nenhum exercício é tocado (tocar ADICIONA ao treino do aluno)
        T.provar_folha(o, caso, rede, R, FOLHA_BIBLIOTECA, abrir, t)
        ev = next((x for x in rede.eventos if x["nome"] == "exercicios_da_lista" and x["status"] < 300), None)
        o.ok(corpo_filtros(ev).get("professor") == e.get("professor"),
             f"{t} o pedido leva o professor do aluno (p_filtros.professor: {'o dele' if corpo_filtros(ev).get('professor') == e.get('professor') else corpo_filtros(ev).get('professor')})")
        if abrir():
            busca = T.campo_busca(caso, FOLHA_BIBLIOTECA)
            busca.fill(e.get("marca", ""))
            T.esperar_lista(caso, FOLHA_BIBLIOTECA, lambda x: x["total"] == T.MASSA, 30)
            chip = caso.pg.locator('[data-biblioteca-grupo="pernas"]').first
            n = (e.get("por_chip") or {}).get("pernas")
            if o.ok(chip.count() > 0, f"{t} o chip 'pernas' (data-biblioteca-grupo)"):
                chip.click()
                okc, sc = T.esperar_lista(caso, FOLHA_BIBLIOTECA, lambda x: x["total"] == n and x["pagina"] == 1, 30)
                o.ok(okc, f"{t} o chip 'pernas' filtra no banco: '{sc.get('rotulo')}' (esperado {n} da massa)")
            T.fechar_dialogo(caso)
    finally:
        caso.fim()


CASOS = {
    "T1": Caso14d("T1", "Meus treinos", "treino", t1),
    "T2": Caso14d("T2", "Biblioteca", "treino", t2),
    "T3": Caso14d("T3", "Quem recebe", "treino", t3),
    "T4": Caso14d("T4", "Histórico do mês", "treino", t4),
    "T5": Caso14d("T5", "Histórico completo do aluno", "treino", t5),
    "T6": Caso14d("T6", "Seletor do Relatório", "treino", t6),
    "T7": Caso14d("T7", "Folha Modelos do editor", "treino", t7),
    "T8": Caso14d("T8", "Folha Biblioteca do editor", "treino", t8),
}


# ───────────────────────── X1 (produção, só leitura): o Treino da conta só de Treino ─────────────────────────
def listas_x1(o, R, chave: str, navs: set[str]) -> list[Lista]:
    """As listas do Treino na produção: Meus treinos, Biblioteca (global) e Histórico do mês, da conta que tem Treino no menu."""
    if "/painel/treinos" not in navs:
        o.linha(f"   [prod {chave} · X1 Treino] fica de fora: a conta não tem Treinos no menu")
        return []
    return [
        Lista("modelos", "/painel/treinos", (("rpc", "modelos_da_lista"),), None, ("[data-busca-modelos]",)),
        Lista("biblioteca", "/painel/treinos?aba=biblioteca&b=global", (("rpc", "exercicios_da_lista"),), None, ("[data-biblioteca-busca-painel]",)),
        Lista("historico-mes", "/painel/treinos?aba=historico", (("funcao", FUNCAO_RELATORIO),), None, (), acoes=("historicoMes",)),
    ]
