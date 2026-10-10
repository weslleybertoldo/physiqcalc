#!/usr/bin/env python3
"""Physiq W19 — E2E das telas do Painel › Financeiro (tela 6: cartões e "Receita"; tela 7: as listas) e do recibo novo da aba
Financeiro do aluno. Contexto limpo por caso, painel 1280 × 883 × 2 (= 2560 × 1766, como as telas 6 e 7).

Positivo:
  resumo        Lucas (dono): os 4 cartões batem com o banco (recebido = entradas + cobranças pagas sem lançamento), "Receita"
                30D · 6M · Ano, "Cobranças do mês" e "Precisam de atenção" (Pix do João, Diego e Carlos vencidos).
  mensalidades  Lucas: os números, os alunos com mensalidade (selos), o comprovante do João e o painel "Cobrança" do aluno.
  pix_calc      prof2 (professor do Calc, conta legado_calc): o aluno2 manda o comprovante pelo app (pagamentos-aluno) e o professor
                CONFIRMA aqui — a cobrança fica paga, a entrada é lançada e o comprovante sai da lista.
  lancamentos   Lucas: totais do período = banco; o lançamento da Camila com a categoria dela (política da W19); nova movimentação,
                estornar/desfazer, editar e "Emitir recibo" da entrada → PDF com a marca Physiq (rótulos do personal).
  recibos       Lucas: lista da conta; PDF do recibo da Camila (autor ao lado da data, assinatura dela); modelos ★; recibo avulso.
  categorias    Lucas: criar, renomear, nome repetido recusado, excluir.
  aluno_recibo  Lucas: card Financeiro do Resumo do Rafael › "Emitir recibo" abre o recibo novo (?recibo=novo) com o aluno fixo.
  rotas         /admin/cobranca → /painel/financeiro (a página nova); link antigo do Nutri /financeiro?de=&ate= → Lançamentos.
Negativo:
  membro        Camila (nutricionista, não é dona): só os lançamentos e recibos dela; a mensalidade é do dono; nenhum comprovante.
  pix_calc      Bruno (2º personal) não vê o comprovante do João (é do dono); o aluno Rafael não abre o painel.

Uso: python3 e2e/w19/telas.py --base http://localhost:5173 --prefixo local [--casos resumo,mensalidades,...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). A massa: python3 e2e/w19/massa.py (antes).
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
CASOS: dict[str, object] = {}
ESTADO: dict = {}
DESCRICAO_E2E = "Consulta W19 E2E"
MODELO_E2E = "Recibo W19 E2E"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return ESTADO["massa"]


def hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def abrir(nav, nome: str, conta: str, rota: str):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def esperar_aba(c, aba: str, timeout: float = 90) -> bool:
    return c.esperar(lambda: c.tem(f'[data-aba-financeiro-conteudo="{aba}"]') and not c.tem('[data-estado="carregando"]'), timeout)


def recorte(conta: str, uid: str, alias: str = "t") -> str:
    return f"({alias}.conta_id = '{conta}' or ({alias}.conta_id is null and {alias}.nutricionista_id = '{uid}'))"


def recebido_mes_sql(conta: str, uid: str, so_do: str | None = None) -> float:
    filtro = f" and t.nutricionista_id = '{so_do}'" if so_do else ""
    filtro_c = f" and (c.nutricionista_id = '{so_do}' or c.criado_por = '{so_do}')" if so_do else ""
    r = B.sql_principal(f"""with h as (select (now() at time zone 'America/Sao_Paulo')::date as hoje)
      select coalesce((select sum(t.valor) from {S}.transacoes t, h where {recorte(conta, uid)}{filtro} and t.deleted_at is null and t.tipo = 'entrada'
                         and not t.estornada and date_trunc('month', t.data) = date_trunc('month', h.hoje) and t.data <= h.hoje), 0)
           + coalesce((select sum(c.valor) from {S}.cobrancas c, h where {recorte(conta, uid, 'c')}{filtro_c} and c.deleted_at is null and c.status = 'paga'
                         and c.reembolsado_em is null and c.transacao_id is null
                         and date_trunc('month', (c.pago_em at time zone 'America/Sao_Paulo')::date) = date_trunc('month', h.hoje)), 0) as total""")
    return float(r[0]["total"])


def totais_30d_sql(conta: str, uid: str, so_do: str | None = None) -> dict:
    filtro = f" and t.nutricionista_id = '{so_do}'" if so_do else ""
    r = B.sql_principal(f"""with h as (select (now() at time zone 'America/Sao_Paulo')::date as hoje)
      select coalesce(sum(t.valor) filter (where t.tipo = 'entrada' and not t.estornada), 0) as entradas,
             coalesce(sum(t.valor) filter (where t.tipo = 'saida' and not t.estornada), 0) as saidas, count(*) as n
        from {S}.transacoes t, h where {recorte(conta, uid)}{filtro} and t.deleted_at is null and t.data between h.hoje - 29 and h.hoje""")[0]
    return {"entradas": float(r["entradas"]), "saidas": float(r["saidas"]), "n": int(r["n"])}


def attr(c, seletor: str, nome: str) -> str | None:
    loc = c.pg.locator(seletor)
    return loc.first.get_attribute(nome) if loc.count() else None


# ───────────────────────────────────────── casos ─────────────────────────────────────────

@caso
def caso_resumo(nav) -> None:
    c = abrir(nav, "resumo", "w13-dono", "/painel/financeiro")
    ok = esperar_aba(c, "resumo")
    p.check(ok and c.caminho().startswith("/painel/financeiro"), f"[resumo] a página nova abre no Resumo ({c.caminho()})")
    c.esperar(lambda: c.tem("[data-recebido-mes]"), 60)
    esperado = recebido_mes_sql(m()["conta"], m()["lucas"])
    na_tela = float(attr(c, "[data-recebido-mes]", "data-recebido-mes") or -1)
    p.check(abs(na_tela - esperado) < 0.01, f"[resumo] 'Recebido em <mês>' = banco (lançamentos + cobranças pagas sem lançamento): {na_tela} × {esperado}")
    p.check(c.pg.locator("[data-kpis-financeiro] [data-kpi]").count() == 4, "[resumo] os 4 cartões da tela 6 (recebido, previsto, em aberto, vencido)")
    prev, aberto, venc = (float(attr(c, "[data-recebido-mes]", k) or -1) for k in ("data-previsto-mes", "data-em-aberto", "data-vencido"))
    p.check(prev >= na_tela and aberto > 0 and venc > 0, f"[resumo] previsto ≥ recebido; em aberto e vencido com valor ({prev}, {aberto}, {venc})")
    atencao = [e.get_attribute("data-atencao") for e in c.pg.locator("[data-cartao-atencao] [data-atencao]").all()]
    texto_atencao = c.pg.inner_text("[data-cartao-atencao]")
    p.check(atencao[:1] == ["PIX"] and atencao.count("VENCIDA") >= 2 and "João Pedro" in texto_atencao and "Diego Souza" in texto_atencao,
            f"[resumo] Precisam de atenção: Pix do João primeiro, depois as vencidas ({atencao})")
    p.check(attr(c, '[data-fatia="aguardando"]', "data-fatia-qtd") == "1", "[resumo] Cobranças do mês: 1 aguardando a confirmação (o Pix do João)")
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("tela6_resumo")
    for rotulo, chave in (("Ano", "ano"), ("30D", "30d"), ("6M", "6m")):
        c.pg.locator('[data-cartao-receita] [role="radio"]', has_text=rotulo).click()
        ok = c.esperar(lambda: attr(c, "[data-cartao-receita]", "data-periodo-grafico") == chave, 10)
        p.check(ok and c.tem("[data-cartao-receita] svg"), f"[resumo] Receita no período {rotulo}")
    c.pg.locator("[data-cartao-atencao]").scroll_into_view_if_needed()
    c.pg.mouse.wheel(0, 900)
    c.pg.wait_for_timeout(600)
    c.print("resumo_embaixo")
    c.pg.locator("[data-ver-mensalidades]").click()
    p.check(esperar_aba(c, "mensalidades", 30), "[resumo] 'Ver mensalidades' leva à aba Mensalidades")
    c.fim()


@caso
def caso_mensalidades(nav) -> None:
    c = abrir(nav, "mensalidades", "w13-dono", "/painel/financeiro?aba=mensalidades")
    ok = esperar_aba(c, "mensalidades") and c.esperar(lambda: c.pg.locator("[data-cobranca-aluno]").count() >= 4, 60)
    p.check(ok, "[mensalidades] a aba abre com os alunos com mensalidade")
    kpi = c.pg.locator("[data-kpi-comprovantes]").first.get_attribute("data-kpi-comprovantes") if c.tem("[data-kpi-comprovantes]") else None
    p.check(kpi == "1", f"[mensalidades] 1 comprovante aguardando (o do João) ({kpi})")
    joao = m()["alunos"]["João Pedro"]
    p.check(c.tem(f'[data-badge-comprovante="{joao}"]') and c.pg.locator("[data-comprovante-pendente]").count() == 1,
            "[mensalidades] o João tem o selo 'comprovante para conferir' e o cartão do Pix na lista de comprovantes")
    texto = c.texto()
    p.check("PAGO ATÉ 19/10" in texto.upper() and "PENDENTE DESDE 20/09" in texto.upper(), "[mensalidades] os selos pago até / pendente desde (Rafael e Diego)")
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("tela7_mensalidades")
    rafael = m()["alunos"]["Rafael Moura"]
    c.pg.locator(f'[data-btn-cobranca="{rafael}"]').click()
    ok = c.esperar(lambda: c.tem("[data-dialog-cobranca] [data-financeiro-aluno]"), 60)
    p.check(ok, "[mensalidades] 'Cobrança' abre o Financeiro do aluno no painel lateral")
    if ok:
        c.print("painel_cobranca_aluno")
    c.pg.keyboard.press("Escape")
    c.fim()


def garantir_pix_prof2() -> dict:
    """Conta do prof2 com a chave Pix ativa, o aluno2 com mensalidade e um comprovante NOVO aguardando (pelo app)."""
    mat = B.matricula("aluno2")
    conta = mat["conta_id"]
    if not B.sql_principal(f"select 1 from {S}.recebimento_chaves where conta_id = '{conta}' and ativa"):
        membro = B.sql_principal(f"""select m.id::text as id from {S}.conta_membros m join auth.users u on u.id = m.user_id
                                       where m.conta_id = '{conta}' and lower(u.email) = '{B.CONTAS['prof2'][0]}'""")
        st, r = B.rest(B.token("prof2"), "POST", "recebimento_chaves", corpo={"conta_id": conta, "membro_id": membro[0]["id"] if membro else None, "tipo": "email",
                       "chave": "prof2.teste.claude@physiqcalc.app", "favorecido": "Teste Claude W19", "banco": "Banco Teste", "ativa": True})
        assert st in (200, 201), ("chave", st, r)
    B.sql_principal(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{conta}' and recebimento_modo <> 'pix_manual'")
    B.sql_principal(f"update {S}.pacientes set cobranca_pausada = false where id = '{mat['id']}'")
    st, r = B.pag("prof2", "prof_definir", {"aluno": mat["treino_user_id"] or mat["id"], "valor": "99,90"})
    assert st == 200, ("prof_definir", st, r)
    caminho = B.subir_comprovante("aluno2", mat["id"])
    st, r = B.pag("aluno2", "aluno_avisar_pix", {"paciente_id": mat["id"], "comprovante_path": caminho})
    assert st == 200 and (r.get("cobranca") or {}).get("status") == "aguardando_confirmacao", ("avisar", st, r)
    return {"mat": mat, "conta": conta, "cobranca": r["cobranca"]["id"]}


@caso
def caso_pix_calc(nav) -> None:
    px = garantir_pix_prof2()
    cid = px["cobranca"]
    c = abrir(nav, "pix_calc", "prof2", "/painel/financeiro?aba=mensalidades")
    ok = esperar_aba(c, "mensalidades") and c.esperar(lambda: c.tem(f'[data-comprovante-pendente="{cid}"]'), 90)
    p.check(ok, "[pix_calc] o professor do Calc vê o comprovante do aluno2 em Financeiro › Mensalidades")
    if ok:
        c.pg.locator(f'[data-comprovante-pendente="{cid}"]').scroll_into_view_if_needed()
        c.pg.wait_for_timeout(500)
        c.print("pix_calc_aguardando")
        c.pg.locator(f'[data-comprovante-pendente="{cid}"] [data-btn-confirmar-pix]').click()
        p.check(c.confirmar_no_app(), "[pix_calc] a confirmação do app (hml-18a) → Confirmar recebimento")
        sumiu = c.esperar(lambda: not c.tem(f'[data-comprovante-pendente="{cid}"]'), 60)
        db = B.sql_principal(f"select status, transacao_id is not null as lancou, confirmado_por::text as quem from {S}.cobrancas where id = '{cid}'")[0]
        p.check(sumiu and db["status"] == "paga" and db["lancou"] and db["quem"] == B.uid("prof2"),
                f"[pix_calc] Confirmar → paga, entrada lançada, confirmada pelo professor; o cartão sai da lista ({db})")
        c.print("pix_calc_confirmado")
    c.fim()
    # negativo: o 2º personal da W13 não vê o comprovante do João (é do dono), e o aluno não abre o painel
    c = abrir(nav, "pix_bruno", "w13-personal2", "/painel/financeiro?aba=mensalidades")
    ok = esperar_aba(c, "mensalidades") and c.esperar(lambda: c.tem("[data-secao-comprovantes]"), 60)
    c.esperar(lambda: c.tem("[data-comprovantes-vazio]") or c.tem("[data-comprovante-pendente]"), 30)
    p.check(ok and c.pg.locator("[data-comprovante-pendente]").count() == 0 and "a mensalidade é do dono" in c.texto().lower(),
            "[pix_calc] negativo: o 2º personal não vê o Pix do João e vê que a mensalidade é do dono")
    c.fim()
    c = abrir(nav, "aluno_sem_painel", "w13-aluno", "/painel/financeiro")
    c.esperar(lambda: not c.caminho().startswith("/painel"), 30)
    p.check(not c.caminho().startswith("/painel") and not c.tem("[data-pagina-financeiro-painel]"),
            f"[pix_calc] negativo: o aluno não abre o Financeiro do painel ({c.caminho()})")
    c.fim()


@caso
def caso_lancamentos(nav) -> None:
    c = abrir(nav, "lancamentos", "w13-dono", "/painel/financeiro?aba=lancamentos")
    ok = esperar_aba(c, "lancamentos") and c.esperar(lambda: c.pg.locator("[data-transacao]").count() > 0, 60)
    p.check(ok, "[lancamentos] a aba abre com as movimentações do período")
    esp = totais_30d_sql(m()["conta"], m()["lucas"])
    tela = {k: float(attr(c, f"[data-total-{k}]", f"data-total-{k}") or -1) for k in ("entradas", "saidas")}
    n = int(attr(c, "[data-contagem]", "data-contagem-periodo") or -1)
    p.check(abs(tela["entradas"] - esp["entradas"]) < 0.01 and abs(tela["saidas"] - esp["saidas"]) < 0.01 and n == esp["n"],
            f"[lancamentos] totais dos últimos 30 dias = banco (entradas {tela['entradas']} × {esp['entradas']}, saídas {tela['saidas']} × {esp['saidas']}, {n} × {esp['n']})")
    camila = c.pg.locator("[data-transacao]", has_text="Retorno nutricional").first
    p.check(camila.count() > 0 and "Retorno" in camila.locator("[data-transacao-categoria]").inner_text() and "Camila Rocha" in camila.locator("[data-transacao-autor]").inner_text(),
            "[lancamentos] o lançamento da Camila aparece para o dono com a categoria DELA e 'por Camila Rocha' (política da W19)")
    c.pg.locator("[data-filtro-forma]").select_option("dinheiro")
    c.esperar(lambda: "forma=dinheiro" in c.caminho(), 10)
    metodos = [x.strip() for x in c.pg.locator("[data-transacao-metodo]").all_inner_texts()]
    p.check(bool(metodos) and all(x == "Dinheiro" for x in metodos), f"[lancamentos] filtro pela forma (Dinheiro): {metodos}")
    c.pg.locator("[data-btn-limpar-filtros]").first.click()
    c.esperar(lambda: "forma=" not in c.caminho(), 10)
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("tela7_lancamentos")
    # nova movimentação pelo botão do topo
    c.pg.locator("[data-nova-movimentacao]").click()
    c.esperar(lambda: c.tem('[data-modal-movimentacao="novo"]'), 15)
    c.pg.locator('[data-tipo-btn="entrada"]').click()
    c.pg.fill("[data-campo-descricao]", DESCRICAO_E2E)
    c.pg.fill("[data-campo-valor]", "210")
    c.pg.locator("[data-campo-categoria]").select_option(label="Consulta")
    c.pg.locator("[data-campo-metodo]").select_option("pix")
    # hml-14b (B19): o campo Aluno é o SeletorDeAluno (a busca vai ao banco)
    c.pg.locator('[data-seletor-aluno="movimentacao"] [data-seletor-aluno-busca]').fill("Rafael")
    c.pg.locator(f'[data-seletor-aluno="movimentacao"] [data-opcao-aluno="{m()["alunos"]["Rafael Moura"]}"]').click()
    c.pg.fill("[data-campo-observacao-transacao]", "Pago na recepção")
    c.print("dialogo_movimentacao")
    c.pg.locator("[data-btn-salvar-movimentacao]").click()
    linha = c.pg.locator("[data-transacao]", has_text=DESCRICAO_E2E)
    ok = c.esperar(lambda: linha.count() == 1, 30)
    p.check(ok and linha.first.get_attribute("data-valor") == "210.00", "[lancamentos] nova movimentação (entrada de R$ 210 do Rafael, categoria Consulta) aparece na lista")
    antes = float(attr(c, "[data-total-entradas]", "data-total-entradas") or 0)
    linha.first.locator("[data-btn-estornar-transacao]").click()
    c.pg.locator("[data-btn-confirmar-estorno]").click()
    ok = c.esperar(lambda: linha.first.get_attribute("data-estornada") == "1", 20)
    depois = float(attr(c, "[data-total-entradas]", "data-total-entradas") or 0)
    p.check(ok and abs((antes - depois) - 210) < 0.01, f"[lancamentos] estornar tira dos totais sem apagar ({antes} → {depois})")
    linha.first.locator("[data-btn-estornar-transacao]").click()
    c.pg.locator("[data-btn-confirmar-estorno]").click()
    p.check(c.esperar(lambda: linha.first.get_attribute("data-estornada") == "0", 20), "[lancamentos] desfazer o estorno volta aos totais")
    linha.first.locator("[data-btn-editar-transacao]").click()
    c.esperar(lambda: c.tem('[data-modal-movimentacao="editar"]'), 15)
    c.pg.fill("[data-campo-valor]", "230,00")
    c.pg.locator("[data-btn-salvar-movimentacao]").click()
    p.check(c.esperar(lambda: linha.first.get_attribute("data-valor") == "230.00", 20), "[lancamentos] editar o valor (230,00)")
    # emitir recibo da entrada → o PDF de hoje com a marca Physiq (Lucas é dono + personal: rótulos do Physiq)
    c.esperar(lambda: linha.first.locator("[data-btn-emitir-recibo]").count() == 1, 10)
    linha.first.locator("[data-btn-emitir-recibo]").click()
    c.esperar(lambda: c.tem('[data-modal-recibo="movimentacao"]') and c.pg.locator("[data-campo-modelo-recibo] option").count() > 0, 30)
    previa = c.pg.inner_text("[data-previa-recibo]")
    p.check("Rafael Moura" in previa and "R$ 230,00" in previa, f"[lancamentos] a prévia do recibo traz o aluno e o valor da entrada ({previa[:90]!r})")
    c.print("dialogo_recibo")
    arq = B.baixar(c.pg, lambda: c.pg.locator("[data-btn-salvar-recibo]").click(), f"{ESTADO['prefixo']}_recibo_lucas")
    t = B.textos_pdf(arq) if arq else []
    junto = " ".join(t)
    p.check(bool(t) and t[0] == "PHYSIQ · RECIBO" and "PHYSIQNUTRI" not in junto and "Aluno: Rafael Moura" in junto and "Lucas Ferreira" in t and "Personal trainer" in t,
            f"[lancamentos] o PDF do recibo: PHYSIQ · RECIBO, Aluno, assinatura do Lucas com 'Personal trainer' ({t[:3]})")
    p.check(c.esperar(lambda: linha.first.locator("[data-badge-recibo]").count() == 1, 20), "[lancamentos] a entrada passa a mostrar RECIBO (sem 'Emitir recibo')")
    c.fim()


@caso
def caso_recibos(nav) -> None:
    t0 = B.sql_principal("select now()::text as agora")[0]["agora"]
    c = abrir(nav, "recibos", "w13-dono", "/painel/financeiro?aba=recibos")
    ok = esperar_aba(c, "recibos") and c.esperar(lambda: c.pg.locator("[data-recibo-id]").count() >= 3, 60)
    p.check(ok, f"[recibos] a lista da conta (Lucas + Camila): {c.pg.locator('[data-recibo-id]').count()} recibos")
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("tela7_recibos")
    dela = c.pg.locator("[data-recibo-id]", has_text="por Camila Rocha").first
    arq = B.baixar(c.pg, lambda: dela.locator("[data-btn-pdf-recibo]").click(), f"{ESTADO['prefixo']}_recibo_camila")
    t = B.textos_pdf(arq) if arq else []
    junto = " ".join(t)
    p.check(bool(t) and "· Camila Rocha (nutricionista)" in junto and "Camila Rocha" in t and "Nutricionista" in t and "Paciente:" in junto,
            f"[recibos] PDF do recibo da Camila baixado pelo dono: autor ao lado da data, assinatura e título dela ({[x for x in t if 'Data:' in x][:1]})")
    dela.locator("[data-btn-ver-recibo]").click()
    ok = c.esperar(lambda: c.tem("[data-texto-recibo]"), 15)
    p.check(ok and "Recebi de" in c.pg.inner_text("[data-texto-recibo]"), "[recibos] 'Ver' mostra o texto gravado do recibo")
    c.pg.keyboard.press("Escape")
    # modelos ★
    c.pg.locator("[data-btn-modelos-recibo]").click()
    c.esperar(lambda: c.tem('[data-modal-modelos-recibo="lista"]'), 15)
    c.pg.locator("[data-btn-novo-modelo-recibo]").click()
    c.pg.fill("[data-campo-titulo-modelo-recibo]", MODELO_E2E)
    c.pg.fill("[data-campo-conteudo-modelo-recibo]", "Recebi de ")
    c.pg.locator('[data-btn-tag="*|NOME_PACIENTE|*"]').click()
    c.pg.locator("[data-campo-conteudo-modelo-recibo]").press("End")
    c.pg.keyboard.type(" a quantia de ")
    c.pg.locator('[data-btn-tag="*|VALOR_CONSULTA|*"]').click()
    c.pg.locator("[data-campo-favorito-modelo-recibo]").check()
    c.print("dialogo_modelo_recibo")
    c.pg.locator("[data-btn-salvar-modelo-recibo]").click()
    item = c.pg.locator("[data-modelo-recibo]", has_text=MODELO_E2E)
    ok = c.esperar(lambda: item.count() == 1 and item.first.get_attribute("data-favorito") == "1", 20)
    conteudo = B.sql_principal(f"select conteudo from {S}.modelos_recibo where titulo = '{MODELO_E2E}' and deleted_at is null and nutricionista_id = '{m()['lucas']}'")
    p.check(ok and conteudo and conteudo[0]["conteudo"] == "Recebi de *|NOME_PACIENTE|* a quantia de *|VALOR_CONSULTA|*",
            f"[recibos] modelo novo ★ com as tags inseridas no cursor ({conteudo[:1]})")
    c.print("dialogo_modelos")
    c.pg.locator("[data-btn-fechar-modelos-recibo]").click()
    # recibo avulso, escolhendo o aluno, com o modelo novo (★ abre primeiro)
    c.pg.locator("[data-btn-novo-recibo]").click()
    c.esperar(lambda: c.tem('[data-modal-recibo="avulso"]'), 15)
    # hml-14b (B19): o <select> com a lista inteira virou o SeletorDeAluno (a busca vai ao banco)
    c.pg.locator('[data-seletor-aluno="recibo"] [data-seletor-aluno-busca]').fill("Beatriz")
    c.pg.locator(f'[data-seletor-aluno="recibo"] [data-opcao-aluno="{m()["alunos"]["Beatriz Lima"]}"]').click()
    opcoes = c.pg.locator("[data-campo-modelo-recibo] option").all_inner_texts()
    favoritos = [o for o in opcoes if o.startswith("★")]
    # os ★ primeiro (em ordem alfabética, a regra do Nutri) e o modelo novo entre eles
    p.check(opcoes[:len(favoritos)] == favoritos and f"★ {MODELO_E2E}" in favoritos, f"[recibos] os modelos ★ abrem primeiro ({opcoes})")
    c.pg.locator("[data-campo-modelo-recibo]").select_option(label=f"★ {MODELO_E2E}")
    escolhido = c.pg.locator("[data-campo-modelo-recibo]").evaluate("e => e.options[e.selectedIndex].text")
    c.pg.fill("[data-campo-valor-recibo]", "95")
    c.esperar(lambda: "Beatriz Lima" in c.pg.inner_text("[data-previa-recibo]"), 10)
    arq = B.baixar(c.pg, lambda: c.pg.locator("[data-btn-salvar-recibo]").click(), f"{ESTADO['prefixo']}_recibo_avulso")
    t = B.textos_pdf(arq) if arq else []
    p.check("★" in escolhido and MODELO_E2E in escolhido and any("Recebi de Beatriz Lima a quantia de R$ 95,00" in x for x in t),
            f"[recibos] recibo avulso com o modelo ★ ({escolhido!r}) e o PDF com o texto do modelo")
    c.fim()
    # limpeza do que o caso criou (o recibo avulso e o modelo)
    B.sql_principal(f"""delete from {S}.recibos where conta_id = '{m()['conta']}' and transacao_id is null and created_at >= '{t0}';
                         update {S}.modelos_recibo set deleted_at = now() where titulo = '{MODELO_E2E}' and deleted_at is null;""")


@caso
def caso_categorias(nav) -> None:
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "categorias", desktop=True)
    c.entrar("w13-dono", "/painel/financeiro?aba=categorias")
    # do 1º quadro até a lista chegar: o "Nenhuma categoria ainda" não pode piscar (a lista só não chegou ainda)
    viu_vazio = viu_esqueleto = False
    t0 = time.time()
    while time.time() - t0 < 60 and c.pg.locator("[data-categoria]").count() < 6:
        viu_vazio = viu_vazio or c.tem("[data-categorias-vazio]")
        viu_esqueleto = viu_esqueleto or c.tem("[data-carregando-categorias]")
        c.pg.wait_for_timeout(50)
    c.fechar_avisos()
    ok = esperar_aba(c, "categorias") and c.esperar(lambda: c.pg.locator("[data-categoria]").count() >= 6, 60)
    p.check(ok, "[categorias] as categorias do profissional")
    p.check(not viu_vazio, f"[categorias] enquanto a lista carrega, nada de 'Nenhuma categoria ainda' (esqueleto visto: {viu_esqueleto})")
    c.pg.fill("[data-campo-nova-categoria]", "consulta")
    c.pg.locator("[data-btn-add-categoria]").click()
    p.check(c.esperar(lambda: c.tem("[data-erro-categoria]"), 10) and "Já existe" in c.pg.inner_text("[data-erro-categoria]"),
            "[categorias] negativo: nome repetido (sem caixa/acento) é recusado")
    c.pg.fill("[data-campo-nova-categoria]", "Cursos W19")
    c.pg.locator("[data-btn-add-categoria]").click()
    item = c.pg.locator('[data-categoria-nome="Cursos W19"]')
    p.check(c.esperar(lambda: item.count() == 1, 20), "[categorias] criar 'Cursos W19'")
    item.locator("[data-btn-renomear-categoria]").click()
    c.pg.fill("[data-campo-renomear-categoria]", "Cursos e eventos W19")
    c.pg.locator("[data-btn-salvar-renomear]").click()
    novo = c.pg.locator('[data-categoria-nome="Cursos e eventos W19"]')
    p.check(c.esperar(lambda: novo.count() == 1, 20), "[categorias] renomear")
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("categorias")
    novo.locator("[data-btn-excluir-categoria]").click()
    c.pg.locator("[data-btn-confirmar-excluir-categoria]").click()
    p.check(c.esperar(lambda: novo.count() == 0, 20), "[categorias] excluir (vai para a lixeira)")
    c.fim()


@caso
def caso_aluno_recibo(nav) -> None:
    rafael = m()["alunos"]["Rafael Moura"]
    c = abrir(nav, "aluno_recibo", "w13-dono", f"/painel/alunos/{rafael}")
    ok = c.esperar(lambda: c.tem("[data-card-financeiro-recibo]"), 90)
    p.check(ok, "[aluno_recibo] o card Financeiro do Resumo tem 'Emitir recibo'")
    if ok:
        c.pg.locator("[data-card-financeiro-recibo]").click()
        ok = c.esperar(lambda: c.tem('[data-modal-recibo="avulso"]') and c.pg.locator("[data-campo-modelo-recibo] option").count() > 0, 60)
        p.check(ok and not c.tem('[data-seletor-aluno="recibo"]') and "recibo=novo" not in c.caminho() and "/financeiro" in c.caminho(),
                f"[aluno_recibo] 'Emitir recibo' abre o recibo novo da aba Financeiro, com o aluno fixo ({c.caminho()})")
        c.pg.fill("[data-campo-valor-recibo]", "120")
        c.esperar(lambda: "Rafael Moura" in c.pg.inner_text("[data-previa-recibo]"), 10)
        c.print("aluno_recibo_novo")
        c.pg.locator("[data-btn-cancelar-recibo]").click()
    c.ir(f"/painel/alunos/{rafael}/financeiro?recibo=novo")
    ok = c.esperar(lambda: c.tem('[data-modal-recibo="avulso"]'), 60)
    p.check(ok, "[aluno_recibo] o link direto ?recibo=novo também abre o recibo novo")
    c.fim()


@caso
def caso_rotas(nav) -> None:
    c = abrir(nav, "rotas", "w13-dono", "/admin/cobranca")
    ok = c.esperar(lambda: c.caminho().startswith("/painel/financeiro") and c.tem("[data-pagina-financeiro-painel]"), 60)
    p.check(ok, f"[rotas] /admin/cobranca → /painel/financeiro, a página nova ({c.caminho()})")
    de, ate = (hoje() - dt.timedelta(days=45)).isoformat(), hoje().isoformat()
    c.ir(f"/financeiro?de={de}&ate={ate}")
    ok = c.esperar(lambda: c.tem('[data-aba-financeiro-conteudo="lancamentos"]') and attr(c, "[data-periodo]", "data-periodo") == f"{de}|{ate}", 60)
    p.check(ok, f"[rotas] link antigo do Financeiro do Nutri (/financeiro?de=&ate=) abre Lançamentos no mesmo período ({c.caminho()})")
    c.fim()


@caso
def caso_membro(nav) -> None:
    c = abrir(nav, "membro", "w13-nutri", "/painel/financeiro?aba=lancamentos")
    ok = esperar_aba(c, "lancamentos") and c.esperar(lambda: c.pg.locator("[data-transacao]").count() > 0, 60)
    esp = totais_30d_sql(m()["conta"], m()["camila"], so_do=m()["camila"])
    n = c.pg.locator("[data-transacao]").count()
    p.check(ok and n == esp["n"] and c.pg.locator("[data-transacao-autor]").count() == 0 and "Consultoria mensal" not in c.texto(),
            f"[membro] a nutricionista (não é dona) vê só os lançamentos DELA ({n} × {esp['n']}), sem os do Lucas")
    p.check("o que é seu" in c.texto(), "[membro] o subtítulo diz que ela vê o que é dela")
    c.pg.evaluate("window.scrollTo(0, 0)")
    c.print("membro_lancamentos")
    c.ir("/painel/financeiro?aba=recibos")
    ok = esperar_aba(c, "recibos") and c.esperar(lambda: c.pg.locator("[data-recibo-id]").count() > 0, 60)
    proprios = int(B.sql_principal(f"select count(*) as n from {S}.recibos where nutricionista_id = '{m()['camila']}' and deleted_at is null")[0]["n"])
    p.check(ok and c.pg.locator("[data-recibo-id]").count() == proprios and "por " not in c.pg.inner_text("[data-lista-recibos-conta]"),
            f"[membro] recibos: só os dela ({c.pg.locator('[data-recibo-id]').count()} × {proprios})")
    c.ir("/painel/financeiro?aba=mensalidades")
    ok = esperar_aba(c, "mensalidades") and c.esperar(lambda: c.tem("[data-comprovantes-vazio]") or c.tem("[data-comprovante-pendente]"), 60)
    p.check(ok and c.pg.locator("[data-comprovante-pendente]").count() == 0 and "a mensalidade é do dono" in c.texto().lower(),
            "[membro] mensalidades: a mensalidade é do dono e nenhum comprovante dos alunos do dono")
    c.ir("/painel/financeiro")
    ok = esperar_aba(c, "resumo") and c.esperar(lambda: c.tem("[data-recebido-mes]"), 60)
    esperado = recebido_mes_sql(m()["conta"], m()["camila"], so_do=m()["camila"])
    na_tela = float(attr(c, "[data-recebido-mes]", "data-recebido-mes") or -1)
    p.check(ok and abs(na_tela - esperado) < 0.01, f"[membro] o Resumo dela soma só o que é dela ({na_tela} × {esperado})")
    c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    ESTADO["massa"] = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert ESTADO["massa"].get("conta"), "rode antes: python3 e2e/w19/massa.py"
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in a.casos.split(","):
            print(f"\n— caso {nome}", flush=True)
            B.saude_ok(nome)
            try:
                CASOS[nome](nav)  # type: ignore[operator]
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] {type(e).__name__}: {str(e)[:300]}")
                caso_atual = B.B5.ESTADO.get("caso")
                if caso_atual:
                    caso_atual.diagnostico()
            time.sleep(3)
        nav.close()
    print(f"\nW19 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
