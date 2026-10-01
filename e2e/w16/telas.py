#!/usr/bin/env python3
"""Physiq W16 — E2E das telas: "Editar treino e dieta" (tela 8 inteira), Perfil do aluno › Dieta e o card Dieta do Resumo (tela 7).

Positivo (Camila, nutricionista responsável do Rafael): a tela 8 abre com o treino SÓ PARA LER à esquerda (sem sessão do Treino —
função treino-leitura) e o editor do plano à direita (dias Seg–Dom, kcal do dia, macros e fibras, refeições com foto); a refeição
aberta mostra Alimento · Qtde. · kcal · Prot. · Trocas; a busca TACO põe alimento (e recusa 0 g); remove; os substitutos vão a 3 e
voltam a 2; o plano por dia (NF3): "Lanche da tarde" só de seg a sex e um lanche só de sábado — o app do aluno mostra hoje só as do
dia e, com o relógio num sábado, só as de sábado; "Copiar pra semana toda" volta a um plano só; "Salvar e enviar ao aluno" cria o
aviso no sino (o aluno vê no app) e nenhuma mensagem; "Gerar PDF" baixa o plano. O acompanhamento mostra os ✓ de ontem e de hoje
(F3) e o card Dieta do Resumo a adesão de 7 dias (R14) — os mesmos números do acompanhamento e do app (lição da W10). Os atalhos
Orientação e Manipulados do Fluxo de consulta (W14) abrem as seções novas com o formulário. Lado a lado com o site antigo do Nutri
(conta nutri-legado): o que o editor novo grava abre lá, e o que se muda lá aparece aqui.
Negativo: o Bruno (2º personal, não é do Rafael) não abre a dieta dele; o Lucas (dono + personal, sem papel de nutri) vê a dieta
só para ler e muda o treino; quantidade 0 não grava.

Uso: python3 e2e/w16/telas.py --base http://localhost:5173 --prefixo local [--casos editor,app,secoes,resumo,negativos,nutri_antigo]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). Contexto limpo por caso, painel 1280 × 883 × 2
     (telas 7 e 8) e app 390 × 844 × 3,4. A massa volta ao começo no fim (python3 e2e/w16/massa.py).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
DOWNLOADS = B.SCRATCH / "downloads"
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def q(sql: str) -> list:
    return B.sql_principal(sql)


def m() -> dict:
    return ESTADO["massa"]


def abrir(nav, nome: str, conta: str, rota: str, desktop: bool = True):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    c.entrar(conta, rota)
    c.fechar_avisos()
    return c


def fechar_faixa(c) -> None:
    if c.esperar(lambda: c.tem("[data-faixa-mensagens-fechar]"), 3):
        c.pg.locator("[data-faixa-mensagens-fechar]").first.click()
        c.pg.wait_for_timeout(400)


def esperar_editor_dieta(c, nome: str) -> bool:
    ok = c.esperar(lambda: c.tem("[data-editor-dieta]") and c.pg.locator('[data-editor-dieta="carregando"]').count() == 0 and c.pg.locator("[data-editor-dieta] [data-refeicao]").count() > 0, 90)
    p.check(ok, f"[{nome}] o editor do plano abriu com as refeições")
    return ok


def refeicao(c, nome: str):
    return c.pg.locator(f'[data-editor-dieta] [data-refeicao-nome="{nome}"]').first


def abrir_refeicao(c, nome: str) -> None:
    r = refeicao(c, nome)
    if r.get_attribute("data-aberta") is None:
        r.locator("[data-refeicao-abrir]").click()
    c.esperar(lambda: refeicao(c, nome).locator("[data-refeicao-tabela]").count() > 0, 15)


def itens_db(refeicao_id: str) -> list[dict]:
    return q(f"""select i.id::text, a.nome, i.quantidade_g::float as g, jsonb_array_length(coalesce(i.substitutos, '[]'::jsonb)) as subs
                 from {S}.itens_refeicao i join {S}.alimentos a on a.id = i.alimento_id where i.refeicao_id = '{refeicao_id}' order by i.ordem, i.created_at""")


def refeicoes_db(plano: str) -> list[dict]:
    return q(f"select id::text, nome, dias_semana from {S}.refeicoes where plano_id = '{plano}' order by ordem, horario")


def id_refeicao(nome: str) -> str:
    r = [x for x in refeicoes_db(m()["plano"]) if x["nome"] == nome]
    assert r, f"refeição não achada: {nome}"
    return r[0]["id"]


def buscar_e_escolher(c, escopo, termo: str, nome_alimento: str) -> bool:
    caixa = escopo.locator("[data-busca-alimento]").first
    caixa.click()
    caixa.fill(termo)
    alvo = escopo.locator(f'[data-resultado-alimento]:has([data-resultado-nome]:text-is("{nome_alimento}"))').first
    if not c.esperar(lambda: alvo.count() > 0 and alvo.is_visible(), 30):
        return False
    alvo.click()
    return True


def baixar(c, clicar, nome: str) -> Path | None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    try:
        with c.pg.expect_download(timeout=60000) as d:
            clicar()
        destino = DOWNLOADS / f"{c.prefixo}_{nome}_{d.value.suggested_filename}"
        d.value.save_as(str(destino))
        return destino
    except Exception as e:  # noqa: BLE001
        print("   download falhou:", e)
        return None


# ───────────────────────── a tela 8 com a nutricionista ─────────────────────────

@caso
def caso_editor(nav) -> None:
    mm = m()
    rota = mm["rota"]
    B.saude_ok("a tela 8 (nutricionista)")
    c = abrir(nav, "editor", "w13-nutri", f"/painel/alunos/{rota}/editar")
    try:
        fechar_faixa(c)
        if not esperar_editor_dieta(c, "editor"):
            return
        ok_treino = c.esperar(lambda: c.pg.locator("[data-exercicio-editor]").count() >= 5, 90)
        p.check(ok_treino, "[editor] à esquerda, o treino do Rafael (5 exercícios do treino A) — a nutri lê sem sessão do Treino")
        p.check(c.pg.locator("[data-campo-input]").count() == 0 and c.tem("[data-treino-so-ver]"), "[editor] o treino é só para ler (nenhum campo editável) e diz quem muda")
        p.check(c.pg.locator('[data-campo-valor="reps"]:text-is("10")').count() >= 2, "[editor] a prescrição da tela 8 aparece (4 × 10, 60 s, 60 kg…)")
        kcal = int(c.pg.locator("[data-dieta-kcal]").first.get_attribute("data-dieta-kcal") or 0)
        p.check(abs(kcal - mm["kcal_dia"]) <= 1, f"[editor] {kcal} kcal por dia = a massa ({mm['kcal_dia']})")
        n_ref = c.pg.locator("[data-editor-dieta] [data-refeicao]").count()
        p.check(n_ref == 5, f"[editor] 5 refeições no dia ({n_ref})")
        macros = {k: int(c.pg.locator(f'[data-macro="{k}"]').first.get_attribute("data-macro-g") or 0) for k in ("p", "c", "g", "f")}
        p.check(all(v > 0 for v in macros.values()), f"[editor] barra de macros e fibras ({macros})")
        p.check(c.tem('[data-dia-aba="Seg"]') and c.tem('[data-dia-aba="Dom"]') and c.tem("[data-dieta-copiar-semana]"), "[editor] dias Seg–Dom e 'Copiar pra semana toda'")
        abrir_refeicao(c, "Almoço")
        alm = refeicao(c, "Almoço")
        trocas = alm.locator("[data-item-trocas]").evaluate_all("els => els.map(e => e.getAttribute('data-item-trocas'))")
        p.check(alm.locator("[data-item]").count() == 4 and trocas == ["2", "2", "2", "2"], f"[editor] almoço: 4 alimentos com 2 trocas cada ({trocas})")
        p.check(alm.locator("[data-refeicao-busca] [data-busca-alimento]").count() == 1, "[editor] a busca 'Adicionar alimento da tabela TACO ou dos seus'")
        c.pg.mouse.move(5, 5)
        B.json_arquivo(B.PRINTS / f"{c.prefixo}_tela8.json", {"kcal": kcal, "macros": macros, "refeicoes": n_ref})
        c.print("tela8")

        # busca TACO → quantidade → entra no almoço (e no banco)
        rid_alm = id_refeicao("Almoço")
        ok = buscar_e_escolher(c, alm, "tomate, com", "Tomate, com semente, cru")
        p.check(ok and c.esperar(lambda: c.tem('[data-modal-item="novo"]'), 15), "[editor] escolher na busca abre o alimento direto na quantidade")
        c.pg.locator("[data-campo-quantidade-g]").fill("0")
        c.pg.locator("[data-btn-salvar-item]").click()
        p.check(c.esperar(lambda: c.tem("[data-erro-item]"), 10), "[editor] NEGATIVO: 0 g não grava (pede quantidade maior que zero)")
        c.pg.locator("[data-campo-quantidade-g]").fill("80")
        c.pg.locator("[data-btn-salvar-item]").click()
        p.check(c.esperar(lambda: not c.tem('[data-modal-item="novo"]') and alm.locator("[data-item]").count() == 5, 20), "[editor] o tomate entrou no almoço (5 alimentos)")
        db = itens_db(rid_alm)
        tom = [x for x in db if x["nome"] == "Tomate, com semente, cru"]
        p.check(len(db) == 5 and tom and abs(tom[0]["g"] - 80) < 0.01, f"[editor] no banco: 5 itens, tomate 80 g ({[(x['nome'][:12], x['g']) for x in db]})")
        # remover
        linha = alm.locator('[data-item-nome="Tomate, com semente, cru"]').first
        linha.hover()
        linha.locator("[data-item-remover]").click()
        c.pg.locator("[data-confirmar-acao-dieta]").click()
        p.check(c.esperar(lambda: alm.locator("[data-item]").count() == 4, 20) and len(itens_db(rid_alm)) == 4, "[editor] remover tira do plano (4 de novo, no banco também)")

        # substitutos: 2 → 3 → 2 (até 6 por alimento)
        fr = alm.locator('[data-item-nome="Frango, peito, sem pele, grelhado"]').first
        fr.locator("[data-item-trocas]").click()
        dlg = c.pg.locator("[data-modal-substitutos]")
        p.check(c.esperar(lambda: dlg.locator("[data-substituto]").count() == 2, 15), "[editor] os 2 substitutos do frango")
        ok = buscar_e_escolher(c, dlg, "queijo, minas", "Queijo, minas, frescal")
        gr = c.pg.locator("[data-substituto-novo-gramas]").input_value() if ok else ""
        p.check(ok and gr != "", f"[editor] o substituto novo já vem com os gramas equivalentes ({gr} g)")
        c.pg.locator("[data-btn-add-substituto]").click()
        c.pg.locator("[data-btn-salvar-substitutos]").click()
        p.check(c.esperar(lambda: fr.locator("[data-item-trocas]").get_attribute("data-item-trocas") == "3", 20), "[editor] frango com 3 trocas")
        subs = [x for x in itens_db(rid_alm) if x["nome"].startswith("Frango")]
        p.check(subs and subs[0]["subs"] == 3, f"[editor] no banco: 3 substitutos ({subs[0]['subs'] if subs else '?'})")
        fr.locator("[data-item-trocas]").click()
        c.esperar(lambda: dlg.locator("[data-substituto]").count() == 3, 15)
        dlg.locator('[data-btn-remover-substituto="2"]').click()
        c.pg.locator("[data-btn-salvar-substitutos]").click()
        p.check(c.esperar(lambda: fr.locator("[data-item-trocas]").get_attribute("data-item-trocas") == "2", 20), "[editor] e volta a 2")

        # plano por dia (NF3): lanche da tarde só de seg a sex; um lanche só de sábado
        abrir_refeicao(c, "Lanche da tarde")
        refeicao(c, "Lanche da tarde").locator("[data-refeicao-editar]").click()
        c.esperar(lambda: c.tem('[data-modal-refeicao="editar"]'), 10)
        c.pg.locator('[data-atalho-dias-refeicao="semana"]').click()
        c.pg.locator("[data-btn-salvar-refeicao]").click()
        c.esperar(lambda: not c.tem('[data-modal-refeicao="editar"]'), 15)
        lt = [x for x in refeicoes_db(mm["plano"]) if x["nome"] == "Lanche da tarde"]
        p.check(lt and lt[0]["dias_semana"] == [1, 2, 3, 4, 5], f"[editor] lanche da tarde: só de segunda a sexta ({lt[0]['dias_semana'] if lt else '?'})")
        c.pg.locator('[data-dia-aba="Sáb"]').click()
        p.check(c.esperar(lambda: c.pg.locator("[data-editor-dieta] [data-refeicao]").count() == 4 and refeicao(c, "Lanche da tarde").count() == 0, 10),
                "[editor] no sábado o lanche da tarde some (4 refeições)")
        c.pg.locator("[data-dieta-adicionar-refeicao]").click()
        c.esperar(lambda: c.tem('[data-modal-refeicao="nova"]'), 10)
        on = c.pg.locator('[data-dia-refeicao][aria-pressed="true"]').evaluate_all("els => els.map(e => e.getAttribute('data-dia-refeicao'))")
        p.check(on == ["6"], f"[editor] refeição nova com a aba Sáb aberta nasce só no sábado ({on})")
        c.pg.locator("[data-campo-nome-refeicao]").fill("Lanche de sábado")
        c.pg.locator("[data-campo-horario-refeicao]").fill("16:30")
        c.pg.locator("[data-btn-salvar-refeicao]").click()
        p.check(c.esperar(lambda: refeicao(c, "Lanche de sábado").count() == 1, 20), "[editor] o lanche de sábado aparece no sábado")
        abrir_refeicao(c, "Lanche de sábado")
        ok = buscar_e_escolher(c, refeicao(c, "Lanche de sábado"), "abacate", "Abacate, cru")
        if ok and c.esperar(lambda: c.tem('[data-modal-item="novo"]'), 15):
            c.pg.locator("[data-campo-quantidade-g]").fill("150")
            c.pg.locator("[data-btn-salvar-item]").click()
        p.check(c.esperar(lambda: refeicao(c, "Lanche de sábado").locator("[data-item]").count() == 1, 20), "[editor] com 1 alimento (abacate 150 g)")
        sab = [x for x in refeicoes_db(mm["plano"]) if x["nome"] == "Lanche de sábado"]
        p.check(sab and sab[0]["dias_semana"] == [6], f"[editor] no banco: dias_semana = [6] ({sab[0]['dias_semana'] if sab else '?'})")
        c.print("tela8_sabado")
        ESTADO["varia"] = True
    finally:
        c.fim()


@caso
def caso_app(nav) -> None:
    """O app do aluno (W11, minha_dieta) com o plano que varia por dia: hoje (quarta) e, com o relógio num sábado, o sábado."""
    if not ESTADO.get("varia"):
        print("   (pulado: o caso editor não montou o plano por dia)")
        return
    B.saude_ok("o app do aluno (dieta por dia)")
    c = abrir(nav, "app_hoje", "w13-aluno", "/dieta", desktop=False)
    try:
        ok = c.esperar(lambda: c.tem("[data-aba-dieta]") and c.pg.locator("[data-refeicoes] [data-refeicao]").count() > 0, 90)
        p.check(ok, "[app] a aba Dieta do Rafael abriu com as refeições")
        nomes = c.pg.locator("[data-refeicao-nome]").evaluate_all("els => els.map(e => e.innerText.trim())")
        hoje = dt.date.fromisoformat(m()["hoje"])
        dia_util = hoje.isoweekday() <= 5
        p.check(("Lanche de sábado" not in " ".join(nomes)) and (("Lanche da tarde" in " ".join(nomes)) == dia_util),
                f"[app] hoje ({hoje:%a}) o app mostra só as refeições do dia ({nomes})")
        cont = c.pg.locator("[data-refeicoes-contagem]").first.get_attribute("data-refeicoes-contagem") or ""
        ESTADO["app_contagem_hoje"] = cont
        p.check(cont == f"{2}/{5 if dia_util else 4}", f"[app] 'Refeições de hoje' = 2 de 5 marcadas pelo aluno ({cont})")
        c.print("app_dieta_hoje")
    finally:
        c.fim()
    # o mesmo app num sábado (relógio do aparelho)
    hoje = dt.date.fromisoformat(m()["hoje"])
    sabado = hoje + dt.timedelta(days=(5 - hoje.weekday()) % 7 or 7)
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "app_sabado", desktop=False)
    try:
        c.pg.clock.set_fixed_time(dt.datetime(sabado.year, sabado.month, sabado.day, 12, 0, tzinfo=dt.timezone(dt.timedelta(hours=-3))))
        c.entrar("w13-aluno", "/dieta")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-aba-dieta]") and c.pg.locator("[data-refeicoes] [data-refeicao]").count() > 0, 90)
        nomes = c.pg.locator("[data-refeicao-nome]").evaluate_all("els => els.map(e => e.innerText.trim())")
        p.check(ok and "Lanche de sábado" in " ".join(nomes) and "Lanche da tarde" not in " ".join(nomes),
                f"[app] no sábado ({sabado}) o app mostra o lanche de sábado e não o da tarde ({nomes})")
        c.print("app_dieta_sabado")
    finally:
        c.fim()


@caso
def caso_semana(nav) -> None:
    """'Copiar pra semana toda' (a aba de quarta) + 'Salvar e enviar ao aluno' (sino) + 'Gerar PDF'."""
    mm = m()
    c = abrir(nav, "semana", "w13-nutri", f"/painel/alunos/{mm['rota']}/editar")
    try:
        fechar_faixa(c)
        if not esperar_editor_dieta(c, "semana"):
            return
        c.pg.locator('[data-dia-aba="Qua"]').click()
        c.pg.locator("[data-dieta-copiar-semana]").click()
        if c.esperar(lambda: c.tem("[data-confirmar-acao-dieta]"), 10):
            c.pg.locator("[data-confirmar-acao-dieta]").click()
        refs = c.esperar(lambda: [x["nome"] for x in refeicoes_db(mm["plano"])] == [x["nome"] for x in mm["refeicoes"]]
                         and all(not x["dias_semana"] for x in refeicoes_db(mm["plano"])), 30)
        p.check(refs, f"[semana] copiar pra semana toda: as 5 refeições de quarta valem todos os dias e o lanche só de sábado saiu ({[(x['nome'], x['dias_semana']) for x in refeicoes_db(mm['plano'])]})")
        c.pg.locator('[data-dia-aba="Sáb"]').click()
        p.check(c.esperar(lambda: c.pg.locator("[data-editor-dieta] [data-refeicao]").count() == 5, 15), "[semana] o sábado volta a ter as 5")
        raf = B.rafael(mm["conta"])
        q(f"delete from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado'")
        fila_antes = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
        c.pg.locator("[data-editores-enviar]").click()
        av = c.esperar(lambda: q(f"select 1 from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado' and titulo = 'Sua dieta foi atualizada'"), 30)
        p.check(av, "[semana] 'Salvar e enviar ao aluno' criou o aviso 'Sua dieta foi atualizada' no sino do Rafael")
        p.check(q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"] == fila_antes, "[semana] nenhuma mensagem de WhatsApp entrou na fila")
        c.pg.locator("[data-editores-pdf]").click()
        arq = baixar(c, lambda: c.pg.locator("[data-editores-pdf-dieta]").click(), "plano")
        p.check(bool(arq and arq.exists() and arq.stat().st_size > 3000 and arq.suffix == ".pdf"), f"[semana] 'Gerar PDF' baixou o plano ({arq.name if arq else None})")
    finally:
        c.fim()
    # o aluno vê o aviso no sino do app
    c = abrir(nav, "app_sino", "w13-aluno", "/", desktop=False)
    try:
        ok = c.esperar(lambda: c.tem("[data-sino]"), 60)
        if ok:
            c.pg.locator("[data-sino]").first.click()
        vis = c.esperar(lambda: "Sua dieta foi atualizada" in c.texto(), 30)
        p.check(vis, "[app_sino] o aluno vê 'Sua dieta foi atualizada' no sino")
        c.print("app_sino")
    finally:
        c.fim()


# ───────────────────────── aba Dieta: seções, ✓ por dia (F3) e atalhos ─────────────────────────

@caso
def caso_secoes(nav) -> None:
    mm = m()
    rota = mm["rota"]
    B.saude_ok("a aba Dieta")
    c = abrir(nav, "secoes", "w13-nutri", f"/painel/alunos/{rota}/dieta")
    try:
        fechar_faixa(c)
        if not esperar_editor_dieta(c, "secoes"):
            return
        p.check(c.pg.locator("[data-secao-dieta-botao]").count() == 7, "[secoes] as 7 seções (Plano, Acompanhamento, Cálculo, Suplementos, Manipulados, Orientações, Metas)")
        p.check(c.tem('[data-plano][data-favorito]') and c.tem("[data-btn-novo-plano]") and c.tem("[data-btn-modelo-plano]"), "[secoes] a lista de planos com Nova prescrição e Usar um modelo ★")
        c.print("aba_dieta")
        # acompanhamento: os ✓ de ontem e de hoje (F3)
        c.pg.locator('[data-secao-dieta-botao="acompanhamento"]').click()
        ok = c.esperar(lambda: c.tem('[data-card="concluidas"][data-adesao-total]') and c.pg.locator("[data-concluidas-dia]").count() >= 7, 60)
        p.check(ok, "[secoes] o acompanhamento mostra os ✓ das refeições por dia")
        h = c.pg.locator(f'[data-concluidas-dia="{mm["hoje"]}"]').first
        o = c.pg.locator(f'[data-concluidas-dia="{mm["ontem"]}"]').first
        fh, th = h.get_attribute("data-feitas"), h.get_attribute("data-total")
        fo, to = o.get_attribute("data-feitas"), o.get_attribute("data-total")
        p.check((fh, th) == ("2", "5") and (fo, to) == ("3", "5"), f"[secoes] F3: hoje {fh} de {th} e ontem {fo} de {to} (o que o aluno marcou)")
        nomes_hoje = h.locator('[data-concluida="sim"]').evaluate_all("els => els.map(e => e.getAttribute('data-concluida-refeicao'))")
        p.check(nomes_hoje == ["Café da manhã", "Lanche da manhã"], f"[secoes] os ✓ de hoje são do café e do lanche da manhã ({nomes_hoje})")
        card = c.pg.locator('[data-card="concluidas"]').first
        ESTADO["acompanhamento_pct"] = card.get_attribute("data-adesao-pct")
        p.check(card.get_attribute("data-adesao-pct") == str(mm["adesao"]["pct"]), f"[secoes] adesão dos 7 dias = {card.get_attribute('data-adesao-pct')} % (massa {mm['adesao']['pct']} %)")
        c.pg.mouse.move(5, 5)
        c.print("acompanhamento")
        # cálculo energético: o formulário das 6 fórmulas abre e calcula a prévia
        c.pg.locator('[data-secao-dieta-botao="calculo-energetico"]').click()
        c.esperar(lambda: c.tem("[data-btn-novo-calculo]") or c.tem("[data-btn-primeiro-calculo]"), 30)
        (c.pg.locator("[data-btn-novo-calculo]").first if c.tem("[data-btn-novo-calculo]") else c.pg.locator("[data-btn-primeiro-calculo]").first).click()
        p.check(c.esperar(lambda: c.tem("[data-modal-calculo]") and c.pg.locator("[data-campo-formula] option").count() >= 6, 15), "[secoes] cálculo energético: as fórmulas da TMB")
        c.pg.locator("[data-campo-peso-calculo]").fill("84,2")
        c.pg.locator("[data-campo-altura-calculo]").fill("178")
        c.pg.wait_for_timeout(500)
        c.print("calculo")
        c.pg.locator("[data-btn-cancelar-calculo]").click()
        # suplementos e metas abrem
        c.pg.locator('[data-secao-dieta-botao="suplementos"]').click()
        p.check(c.esperar(lambda: c.tem("[data-secao-suplementos]") or c.tem("[data-btn-criar-lista]") or c.tem("[data-btn-nova-indicacao]"), 30), "[secoes] suplementos abre")
        c.pg.locator('[data-secao-dieta-botao="metas"]').click()
        p.check(c.esperar(lambda: c.tem("[data-btn-nova-meta]"), 30), "[secoes] metas abre")
        c.pg.locator("[data-btn-nova-meta]").first.click()
        c.esperar(lambda: c.tem("[data-modal-meta]"), 10)
        c.pg.locator("[data-campo-titulo-meta]").fill("Beber 2,5 L de água W16")
        c.pg.locator("[data-btn-salvar-meta]").click()
        p.check(c.esperar(lambda: "Beber 2,5 L de água W16".upper() in c.texto().upper(), 20), "[secoes] meta nova aparece na lista")
        p.check(bool(q(f"select 1 from {S}.metas where paciente_id = '{mm['paciente']}' and titulo = 'Beber 2,5 L de água W16' and deleted_at is null")), "[secoes] e está no banco (a mesma tabela do site antigo)")
        c.print("metas")
    finally:
        q(f"delete from {S}.metas where paciente_id = '{mm['paciente']}' and titulo = 'Beber 2,5 L de água W16'")
        c.fim()
    # atalhos do Fluxo de consulta (W14) → as seções novas, com o formulário aberto
    c = abrir(nav, "atalhos", "w13-nutri", f"/painel/alunos/{rota}")
    try:
        fechar_faixa(c)
        ok = c.esperar(lambda: c.tem('[data-atalho="orientacao"]'), 60)
        destinos = {k: c.pg.locator(f'[data-atalho="{k}"]').first.get_attribute("data-atalho-destino") for k in ("planejamento", "orientacao", "manipulados", "consulta")} if ok else {}
        p.check(ok and all(destinos[k].startswith(f"/painel/alunos/{rota}/dieta?") for k in ("planejamento", "orientacao", "manipulados")) and "physiqnutri" in (destinos.get("consulta") or ""),
                f"[atalhos] Planejamento, Orientação e Manipulados abrem a aba nova; Registrar consulta segue no site antigo ({destinos})")
        c.pg.locator('[data-atalho="orientacao"]').first.click()
        ok = c.esperar(lambda: c.tem("[data-modal-orientacao]"), 30)
        p.check(ok and c.caminho().endswith("/dieta?secao=orientacoes"), f"[atalhos] Orientação abre a seção Orientações com o formulário ({c.caminho()})")
        if c.tem('[data-escolher-modelo="branco"]'):
            c.pg.locator('[data-escolher-modelo="branco"]').click()
        c.pg.locator("[data-campo-titulo-orientacao]").fill("Orientação W16 E2E")
        c.pg.locator("[data-campo-conteudo-orientacao]").fill("- Mastigue devagar\n- Beba água entre as refeições")
        c.pg.locator("[data-btn-salvar-orientacao]").click()
        p.check(c.esperar(lambda: "ORIENTAÇÃO W16 E2E" in c.texto().upper(), 20), "[atalhos] a orientação nova aparece")
        c.ir(f"/painel/alunos/{rota}")
        c.esperar(lambda: c.tem('[data-atalho="manipulados"]'), 60)
        c.pg.locator('[data-atalho="manipulados"]').first.click()
        p.check(c.esperar(lambda: c.tem("[data-modal-formula]"), 30) and c.caminho().endswith("/dieta?secao=manipulados"), f"[atalhos] Manipulados abre a seção com o formulário da fórmula ({c.caminho()})")
    finally:
        q(f"delete from {S}.orientacoes where paciente_id = '{mm['paciente']}' and titulo = 'Orientação W16 E2E'")
        c.fim()


@caso
def caso_resumo(nav) -> None:
    """Card Dieta do Resumo (tela 7): kcal/dia, adesão de 7 dias e as barras — os mesmos números do acompanhamento e do app."""
    mm = m()
    c = abrir(nav, "resumo", "w13-nutri", f"/painel/alunos/{mm['rota']}")
    try:
        fechar_faixa(c)
        ok = c.esperar(lambda: c.tem("[data-card-dieta-adesao]") and c.pg.locator("[data-card-dieta-dia]").count() == 7, 90)
        p.check(ok, "[resumo] o card Dieta com a adesão e as 7 barras")
        if not ok:
            return
        pct = c.pg.locator("[data-card-dieta-adesao]").first.get_attribute("data-card-dieta-adesao")
        fe = c.pg.locator("[data-card-dieta-adesao]").first.get_attribute("data-card-dieta-feitas")
        kc = c.pg.locator("[data-card-dieta-kcal]").first.get_attribute("data-card-dieta-kcal")
        p.check(pct == str(mm["adesao"]["pct"]) and fe == f"{mm['adesao']['feitas']}/{mm['adesao']['total']}", f"[resumo] adesão {pct} % ({fe}) = massa e acompanhamento")
        if ESTADO.get("acompanhamento_pct"):
            p.check(pct == ESTADO["acompanhamento_pct"], "[resumo] número = tela: o card e o acompanhamento mostram a mesma adesão")
        p.check(abs(int(kc or 0) - mm["kcal_dia"]) <= 1, f"[resumo] {kc} KCAL/DIA = o editor ({mm['kcal_dia']})")
        hoje = c.pg.locator(f'[data-card-dieta-dia="{mm["hoje"]}"]').first
        p.check((hoje.get_attribute("data-feitas"), hoje.get_attribute("data-total")) == ("2", "5"), "[resumo] a barra de hoje = 2 de 5 (= o 'Refeições de hoje' do app)")
        p.check("Plano de" in (c.pg.locator("[data-card-dieta-plano]").first.inner_text() or "") and "Camila" in c.pg.locator("[data-card-dieta-plano]").first.inner_text(),
                "[resumo] 'Plano de dd/mm · Camila'")
        ok_t = c.esperar(lambda: c.tem("[data-card-treino-treinos]"), 60)
        p.check(ok_t, "[resumo] a nutricionista também vê o card Treino (só ler, pelo principal)")
        c.pg.mouse.move(5, 5)
        c.print("resumo")
        box = c.pg.locator("[data-card-dieta]").first.bounding_box()
        if box:
            c.pg.screenshot(path=str(B.PRINTS / f"{c.prefixo}_card_dieta.png"), clip={"x": box["x"] - 8, "y": box["y"] - 8, "width": box["width"] + 16, "height": box["height"] + 16})
    finally:
        c.fim()


# ───────────────────────── negativos e papéis ─────────────────────────

@caso
def caso_negativos(nav) -> None:
    mm = m()
    rota = mm["rota"]
    B.saude_ok("os negativos (papéis)")
    c = abrir(nav, "bruno", "w13-personal2", f"/painel/alunos/{rota}/dieta")
    try:
        ok = c.esperar(lambda: c.tem('[data-estado="erro"]') or "Não deu para abrir" in c.texto(), 60)
        p.check(ok and not c.tem("[data-editor-dieta]"), "[negativo] o Bruno (personal que não é do Rafael) não abre a dieta dele")
    finally:
        c.fim()
    c = abrir(nav, "dono", "w13-dono", f"/painel/alunos/{rota}/dieta?secao=metas")
    try:
        fechar_faixa(c)
        ok = c.esperar(lambda: c.tem('[data-acesso-dieta="ver"]') and c.tem("[data-dieta-so-ver]"), 60)
        p.check(ok, "[dono] o Lucas (dono + personal, sem papel de nutri) vê a dieta só para ler")
        p.check(c.tem("[data-dieta-leitura]"), "[dono] as seções aparecem travadas (só ler)")
        c.ir(f"/painel/alunos/{rota}/editar")
        ok = c.esperar(lambda: c.tem('[data-editores-dieta="ver"]') and c.pg.locator("[data-campo-input]").count() > 0, 90)
        p.check(ok, "[dono] na tela 8 o Lucas muda o treino (campos) e só vê o plano")
        p.check(not c.tem("[data-dieta-adicionar-refeicao]") and c.pg.locator("[data-editor-dieta] [data-busca-alimento]").count() == 0, "[dono] sem 'Adicionar refeição' nem busca de alimento")
        c.print("tela8_dono")
    finally:
        c.fim()


# ───────────────────────── lado a lado com o site antigo do Nutri ─────────────────────────

@caso
def caso_nutri_antigo(nav) -> None:
    """A nutri-legado edita no Physiq e o site antigo (staging) abre o mesmo plano; muda lá e aparece aqui (mesmas tabelas)."""
    pac = q(f"""select p.id::text, p.treino_user_id::text from {S}.pacientes p join auth.users u on u.id = p.nutricionista_id
                where u.email = 'nutri.teste.claude@physiqnutri.app' and p.nome = 'Paciente Teste Claude' and p.deleted_at is null limit 1""")
    if not pac:
        p.check(False, "[nutri_antigo] 'Paciente Teste Claude' da nutri-legado não achado")
        return
    pid = pac[0]["id"]
    rota = pac[0]["treino_user_id"] or pid
    plano = q(f"select id::text, titulo from {S}.planos_alimentares where paciente_id = '{pid}' and deleted_at is null order by created_at desc limit 1")
    if not plano:
        p.check(False, "[nutri_antigo] o paciente da nutri-legado não tem plano")
        return
    plano_id, titulo_antes = plano[0]["id"], plano[0]["titulo"]
    ref = q(f"select id::text, nome from {S}.refeicoes where plano_id = '{plano_id}' order by ordem limit 1")[0]
    c = abrir(nav, "nutri_novo", "nutri-legado", f"/painel/alunos/{rota}/dieta?plano={plano_id}")
    velho = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
    pv = velho.new_page()
    try:
        fechar_faixa(c)
        if not esperar_editor_dieta(c, "nutri_antigo"):
            return
        abrir_refeicao(c, ref["nome"])
        ok = buscar_e_escolher(c, refeicao(c, ref["nome"]), "tomate, com", "Tomate, com semente, cru")
        if ok and c.esperar(lambda: c.tem('[data-modal-item="novo"]'), 15):
            c.pg.locator("[data-campo-quantidade-g]").fill("77")
            c.pg.locator("[data-btn-salvar-item]").click()
        p.check(c.esperar(lambda: any(x["nome"] == "Tomate, com semente, cru" and abs(x["g"] - 77) < 0.01 for x in itens_db(ref["id"])), 20),
                "[nutri_antigo] Physiq: tomate 77 g gravado na refeição do plano")
        sess = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/token?grant_type=password", {"email": B.CONTAS["nutri-legado"][0], "password": B.CONTAS["nutri-legado"][1]},
                      {"apikey": B.anon(B.PRINCIPAL_REF)})[1]
        nutri = ESTADO["nutri"].rstrip("/")
        pv.goto(f"{nutri}/entrar/nutricionista", wait_until="domcontentloaded")
        pv.evaluate("([k, v]) => localStorage.setItem(k, v)", [f"sb-{B.PRINCIPAL_REF}-auth-token", json.dumps(sess)])
        pv.goto(f"{nutri}/pacientes/{pid}/planejamento?plano={plano_id}", wait_until="domcontentloaded")
        pv.wait_for_selector(f"[data-editor-plano='{plano_id}']", timeout=90000)
        pv.wait_for_timeout(1500)
        no_velho = pv.locator(f"[data-refeicao='{ref['id']}'] [data-item-nome]").evaluate_all("els => els.map(e => e.innerText.trim())")
        p.check("Tomate, com semente, cru" in no_velho, f"[nutri_antigo] o site antigo abre o plano com o tomate que o Physiq gravou ({no_velho})")
        pv.screenshot(path=str(B.PRINTS / f"{ESTADO['prefixo']}_nutri_antigo_editor.png"))
        # vice-versa: o título mudado no site antigo aparece no Physiq
        pv.locator("[data-btn-editar-dados-plano]").click()
        pv.wait_for_selector("[data-campo-titulo-plano]", timeout=20000)
        pv.locator("[data-campo-titulo-plano]").fill(f"{titulo_antes} (site antigo)")
        pv.locator("[data-btn-salvar-plano]").click()
        pv.wait_for_timeout(2500)
        c.ir(f"/painel/alunos/{rota}/dieta?plano={plano_id}")
        esperar_editor_dieta(c, "nutri_antigo (de volta)")
        p.check(c.esperar(lambda: f"{titulo_antes} (site antigo)" in (c.pg.locator("[data-dieta-titulo]").first.inner_text() or ""), 30),
                "[nutri_antigo] o título mudado no site antigo aparece no editor novo")
        c.print("nutri_antigo_physiq")
    finally:
        q(f"""delete from {S}.itens_refeicao where refeicao_id = '{ref['id']}' and alimento_id = (select id from {S}.alimentos where fonte = 'taco' and nome = 'Tomate, com semente, cru' limit 1)""")
        q(f"update {S}.planos_alimentares set titulo = $t${titulo_antes}$t$ where id = '{plano_id}'")
        velho.close()
        c.fim()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--nutri", default="https://physiqnutri-staging.vercel.app")
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo, nutri=a.nutri)
    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], check=True, stdout=subprocess.DEVNULL)
    ESTADO["massa"] = B.ler_json(B.SCRATCH / "massa_staging.json")
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n══ caso {nome}", flush=True)
            try:
                CASOS[nome](nav)  # type: ignore[operator]
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] exceção: {str(e)[:300]}")
        nav.close()
    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], check=True, stdout=subprocess.DEVNULL)
    print(f"\nW16 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    sys.exit(p.fim())
