#!/usr/bin/env python3
"""Physiq W2 (tags da agenda) — E2E das telas e do banco, em série, contexto limpo por caso (painel 1280 × 883 × 2; app 390 × 844 × 3,4).

Positivos (spec §5):
  inicial      Ana (personal + nutri, sem calendário): o 1º acesso cria "Treino" (violeta, padrão, tag padrão Treino) e "Nutrição"
               (verde, tag padrão Nutrição); o bloco Tags mostra as 3 prontas (sem excluir).
  criar_tag    Ana cria a tag "Reunião" (Geral, rosa) pelo bloco Tags (TagDialog).
  nutricao     novo agendamento no calendário Nutrição: a tag padrão (Nutrição) vem marcada; a consulta da Bia grava tag e modulo.
  reuniao      compromisso sem aluno com a tag "Reunião" → modulo geral; o chip mostra a pílula (semana: o nome; mês: a inicial; lista).
  nova_tag     "Nova tag" dentro do agendamento ("Acompanhamento W2", Nutrição) já fica escolhida; a consulta da Bia grava com ela.
  calendario   o calendário mostra o campo "Tag padrão" com a tag dele.
  cor          editar a cor da "Reunião" → o chip muda de cor.
  excluir      excluir a "Reunião" (a confirmação diz "Geral") → a consulta volta para "Geral" (o banco, na mesma transação).
  ics          o .ics do profissional leva CATEGORIES com a tag.
  so_personal  Paulo (só personal, sem calendário): nasce 1 "Calendário principal" com a tag padrão Treino.
  equipe       Lucas (dono da W13) vê as tags da Camila (nutri da equipe) só para ler, e as consultas dela com a tag dela.
Negativos:
  negativos    a aluna lê 0 linhas de agenda_tags pela REST e não cria tag; outro profissional não lê as tags da Ana nem edita; a base não
               exclui nem muda de área; DELETE não tem permissão; minha_agenda / aluno_compromissos / e-mail / sino sem o nome da tag.
  app_aluno    a Agenda do app da Bia igual (as consultas, sem tag nenhuma).
Uso: python3 e2e/agenda_tags/telas.py --base http://localhost:5173 --prefixo local [--casos a,b]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). A massa: python3 e2e/agenda_tags/massa.py (antes).
Prints: ~/projetos/physiqcalc-scratch/prints/conta-unica-agenda/w2/<prefixo>_*.png
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.q
CASOS: dict[str, object] = {}
E: dict = {}
B.CONTAS["w13-dono"] = (B.W13["lucas"], B.B5.senha_de("w13-dono"))
B.CONTAS["w13-nutri"] = (B.W13["camila"], B.B5.senha_de("w13-nutri"))


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return E["massa"]


def esperar_db(sql: str, timeout: float = 30) -> list:
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = B.sql_principal(sql)
        if r:
            return r
        time.sleep(1)
    return []


def abrir(nav, nome: str, conta: str, rota: str, esperar: str = "[data-pagina-agenda-painel]", desktop: bool = True):
    c = B.B5.Caso(nav, E["base"], E["prefixo"], nome, desktop=desktop)
    c.entrar(conta, rota)
    c.fechar_avisos()
    if c.esperar(lambda: "Crie a sua senha" in c.texto(), 6):
        c.pg.get_by_role("button", name="Agora não").click()
        c.esperar(lambda: "Crie a sua senha" not in c.texto(), 15)
    ok = c.esperar(lambda: c.tem(esperar), 120)
    p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
    return c


def dia_alvo() -> dt.date:
    return B.B5.hoje() + dt.timedelta(days=2)


def sp(d: dt.date, hhmm: str) -> str:
    h, mi = (int(x) for x in hhmm.split(":"))
    return dt.datetime(d.year, d.month, d.day, h, mi, tzinfo=dt.timezone(dt.timedelta(hours=-3))).astimezone(dt.timezone.utc).isoformat()


def esperar_tags(c, n_min: int = 3) -> bool:
    return c.esperar(lambda: c.pg.locator("[data-tags-minhas] [data-tag-item]").count() >= n_min, 60)


def escolher_aluno(c, paciente_id: str, nome: str) -> None:
    # hml-14b (B19): o campo Aluno é o SeletorDeAluno (a busca vai ao banco; o data-campo-paciente segue com o id escolhido)
    c.pg.locator('[data-seletor-aluno="agendamento"] [data-seletor-aluno-busca]').fill(nome.split(" ")[0])
    c.pg.locator(f'[data-seletor-aluno="agendamento"] [data-opcao-aluno="{paciente_id}"]').click()
    c.pg.wait_for_timeout(300)


def novo_agendamento(c) -> bool:
    c.esperar(lambda: c.tem("[data-btn-novo-agendamento]:not([disabled])"), 60)
    c.pg.locator("[data-btn-novo-agendamento]").click()
    return c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]'), 20)


def marcar_horario(c, dia: dt.date, hora: str) -> None:
    c.pg.locator("[data-campo-data]").fill(dia.isoformat())
    c.esperar(lambda: c.pg.locator("[data-horario]").count() > 0, 30)
    if c.pg.locator(f'[data-horario="{hora}"]').count():
        c.pg.locator(f'[data-horario="{hora}"]').click()
    else:
        c.pg.locator("[data-campo-hora]").fill(hora)


def sem_avisar(c) -> None:
    cb = c.pg.locator("[data-campo-avisar] input")
    if cb.count() and cb.is_checked():
        cb.uncheck()


def chip(c, ag_id: str):
    return c.pg.locator(f'[data-evento="{ag_id}"]').first


# ───────────────────────── Ana: personal + nutri ─────────────────────────

@caso
def caso_inicial(nav):
    ana = m()["ana"]
    c = abrir(nav, "inicial", B.AMBOS, "/painel/agenda")
    cals = esperar_db(f"""select id::text, nome, cor, padrao, tag_padrao_id::text as tag from {S}.calendarios
                          where nutricionista_id = {q(ana)} and deleted_at is null order by created_at""", 40)
    nomes = [x["nome"] for x in cals]
    p.check(nomes == ["Treino", "Nutrição"], f"[inicial] personal + nutri sem calendário nasce com 2: {nomes}")
    bt, bn, bg = B.base_de(ana, "treino"), B.base_de(ana, "nutricao"), B.base_de(ana, "geral")
    E.update(bt=bt, bn=bn, bg=bg)
    if len(cals) == 2:
        t, n = cals
        E.update(cal_treino=t["id"], cal_nutri=n["id"])
        p.check(t["cor"] == "#a78bfa" and t["padrao"] and t["tag"] == bt, f"[inicial] 'Treino': violeta, padrão, tag padrão Treino ({t})")
        p.check(n["cor"] == "#34d399" and not n["padrao"] and n["tag"] == bn, f"[inicial] 'Nutrição': verde, tag padrão Nutrição ({n})")
    tags = B.tags_de(ana)
    p.check([(x["nome"], x["cor"], x["area"], x["base"]) for x in tags] ==
            [("Treino", "#a78bfa", "treino", True), ("Nutrição", "#34d399", "nutricao", True), ("Geral", "#94a3b8", "geral", True)],
            f"[inicial] as 3 prontas (Treino violeta, Nutrição verde, Geral cinza): {[(x['nome'], x['cor']) for x in tags]}")
    ok = esperar_tags(c, 3)
    itens = c.pg.locator("[data-tags-minhas] [data-tag-item]").evaluate_all("els => els.map(e => e.dataset.tagItem)") if ok else []
    p.check(itens == [bt, bn, bg], f"[inicial] bloco Tags com as 3 prontas na ordem ({len(itens)})")
    p.check(c.pg.locator("[data-tags-minhas] [data-btn-excluir-tag]").count() == 0, "[inicial] as prontas sem o botão de excluir")
    p.check(c.pg.locator("[data-calendario]").count() == 2, "[inicial] 'Meus calendários' com os 2")
    c.pg.locator("[data-aside-agenda]").scroll_into_view_if_needed()
    c.print("inicial_tags_calendarios")
    c.fim()


@caso
def caso_criar_tag(nav):
    ana = m()["ana"]
    c = abrir(nav, "criar_tag", B.AMBOS, "/painel/agenda")
    esperar_tags(c, 3)
    c.pg.locator("[data-btn-nova-tag]").click()
    p.check(c.esperar(lambda: c.tem('[data-modal-tag="nova"]'), 20), "[criar_tag] TagDialog (nova)")
    c.pg.locator("[data-campo-nome-tag]").fill("Reunião")
    c.pg.locator('[data-cor-tag="#f472b6"]').click()
    c.pg.locator('[data-area-tag-btn="geral"]').click()
    c.print("tag_dialog_nova")
    c.pg.locator("[data-btn-salvar-tag]").click()
    r = esperar_db(f"select id::text, nome, cor, area, base from {S}.agenda_tags where profissional_id = {q(ana)} and nome = 'Reunião' and deleted_at is null", 20)
    p.check(bool(r) and r[0]["cor"] == "#f472b6" and r[0]["area"] == "geral" and not r[0]["base"], f"[criar_tag] o banco gravou a tag ({r})")
    if r:
        E["reuniao"] = r[0]["id"]
        ok = c.esperar(lambda: c.tem(f'[data-tags-minhas] [data-tag-item="{r[0]["id"]}"]'), 20)
        p.check(ok and c.tem(f'[data-btn-excluir-tag="{r[0]["id"]}"]'), "[criar_tag] a Reunião aparece no bloco, com editar e excluir")
    # nome repetido (sem diferenciar maiúscula): a tela recusa
    c.pg.locator("[data-btn-nova-tag]").click()
    c.esperar(lambda: c.tem('[data-modal-tag="nova"]'), 20)
    c.pg.locator("[data-campo-nome-tag]").fill("REUNIÃO")
    c.pg.locator("[data-btn-salvar-tag]").click()
    p.check(c.esperar(lambda: "Você já tem uma tag com esse nome" in c.texto(), 10), "[criar_tag] negativo: nome repetido recusado na tela")
    c.pg.keyboard.press("Escape")
    n = B.sql_principal(f"select count(*)::int as n from {S}.agenda_tags where profissional_id = {q(ana)} and lower(nome) = 'reunião'")[0]["n"]
    p.check(n == 1, f"[criar_tag] continua 1 'Reunião' no banco ({n})")
    c.fim()


@caso
def caso_nutricao(nav):
    ana, bia_mat = m()["ana"], m()["matricula_bia"]
    dia = dia_alvo()
    c = abrir(nav, "nutricao", B.AMBOS, "/painel/agenda")
    p.check(novo_agendamento(c), "[nutricao] diálogo do novo agendamento")
    c.esperar(lambda: c.tem("[data-campo-tag]"), 30)
    p.check(c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag") == E.get("bt"), "[nutricao] no calendário padrão (Treino) vem a tag Treino")
    c.pg.locator("[data-campo-calendario]").select_option(E["cal_nutri"])
    c.pg.wait_for_timeout(400)
    marcada = c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag")
    p.check(marcada == E.get("bn"), f"[nutricao] no calendário Nutrição a tag padrão (Nutrição) vem marcada ({marcada})")
    nomes = c.pg.locator("[data-tag-btn]").evaluate_all("els => els.map(e => e.dataset.tagBtnNome)")
    p.check(nomes[:3] == ["Treino", "Nutrição", "Geral"] and "Reunião" in nomes and c.tem("[data-btn-nova-tag-agendamento]"),
            f"[nutricao] chips: as tags da Ana + 'Nova tag' ({nomes})")
    escolher_aluno(c, bia_mat, B.NOMES[B.ALUNO])
    p.check(c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag") == E.get("bn"), "[nutricao] escolher a aluna não troca a tag do calendário")
    marcar_horario(c, dia, "10:00")
    sem_avisar(c)
    titulo = c.pg.locator("[data-campo-titulo]").input_value()
    p.check(titulo == "Consulta de nutrição", f"[nutricao] o título segue a área ({titulo})")
    c.pg.evaluate("() => { const d = document.querySelector('[data-modal-agendamento]'); if (d) d.scrollTop = 0; }")
    c.print("agendamento_nutricao")
    c.pg.locator("[data-btn-salvar-agendamento]").click()
    r = esperar_db(f"""select id::text, tag_id::text as tag, modulo, calendario_id::text as cal from {S}.agendamentos
                       where nutricionista_id = {q(ana)} and paciente_id = {q(bia_mat)} and inicio = {q(sp(dia, '10:00'))} and deleted_at is null""", 30)
    p.check(bool(r) and r[0]["tag"] == E.get("bn") and r[0]["modulo"] == "nutricao" and r[0]["cal"] == E["cal_nutri"],
            f"[nutricao] gravou no calendário Nutrição com a tag Nutrição e modulo nutricao ({r})")
    if r:
        E["ag_nutri"] = r[0]["id"]
    c.fim()


@caso
def caso_reuniao(nav):
    ana = m()["ana"]
    dia = dia_alvo()
    c = abrir(nav, "reuniao", B.AMBOS, "/painel/agenda")
    novo_agendamento(c)
    c.esperar(lambda: c.tem(f'[data-tag-btn="{E["reuniao"]}"]'), 30)
    c.pg.locator("[data-campo-titulo]").fill("Reunião de equipe")
    c.pg.locator(f'[data-tag-btn="{E["reuniao"]}"]').click()
    p.check(c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag") == E["reuniao"] and c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tipo") == "geral",
            "[reuniao] escolhida a tag Reunião (área geral)")
    marcar_horario(c, dia, "11:00")
    c.pg.locator("[data-btn-salvar-agendamento]").click()
    r = esperar_db(f"""select id::text, tag_id::text as tag, modulo from {S}.agendamentos
                       where nutricionista_id = {q(ana)} and titulo = 'Reunião de equipe' and inicio = {q(sp(dia, '11:00'))} and deleted_at is null""", 30)
    p.check(bool(r) and r[0]["tag"] == E["reuniao"] and r[0]["modulo"] == "geral", f"[reuniao] gravou com a tag Reunião e modulo geral ({r})")
    if r:
        E["ag_reuniao"] = r[0]["id"]
    c.esperar(lambda: not c.tem("[data-modal-agendamento]"), 10)
    # semana: a pílula com o nome; mês: a inicial; lista: a pílula
    c.ir(f"/painel/agenda?visao=semana&data={dia.isoformat()}")
    ok = c.esperar(lambda: c.tem(f'[data-evento="{E.get("ag_reuniao")}"]') and c.tem(f'[data-evento="{E.get("ag_nutri")}"]'), 40)
    if ok:
        p1 = chip(c, E["ag_reuniao"]).locator("[data-tag-pilula]")
        t1, v1 = p1.get_attribute("data-tag-nome"), p1.inner_text()
        t2 = chip(c, E["ag_nutri"]).locator("[data-tag-pilula]").get_attribute("data-tag-nome")
        st = p1.evaluate("e => e.style.background")
        p.check(t1 == "Reunião" and v1 in ("R", "Reunião") and "244, 114, 182" in st, f"[reuniao] semana: chip com a pílula da 'Reunião' rosa ({t1}: '{v1}', {st})")
        p.check(t2 == "Nutrição", f"[reuniao] semana: a consulta da Bia com a pílula 'Nutrição' ({t2})")
        nome_aluno = chip(c, E["ag_nutri"]).inner_text()
        p.check("Bia" in nome_aluno, f"[reuniao] semana (1280 px): o nome da aluna continua no chip de 30 min ({nome_aluno!r})")
    else:
        p.check(False, "[reuniao] as 2 consultas na visão semana")
    c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
    c.pg.mouse.move(5, 5)
    c.print("semana_tags")
    # tela larga (1920): o chip tem largura → o nome inteiro da tag
    c.pg.set_viewport_size({"width": 1920, "height": 1080})
    c.pg.wait_for_timeout(800)
    if ok:
        v_larga = chip(c, E["ag_reuniao"]).locator("[data-tag-pilula]").inner_text()
        p.check(v_larga == "Reunião", f"[reuniao] semana (1920 px): a pílula com o nome inteiro ('{v_larga}')")
    c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
    c.print("semana_tags_1920")
    c.pg.set_viewport_size({"width": 1280, "height": 883})
    c.ir(f"/painel/agenda?visao=mes&data={dia.isoformat()}")
    ok = c.esperar(lambda: c.tem(f'[data-visao="mes"] [data-evento="{E.get("ag_reuniao")}"]'), 30)
    ini = chip(c, E["ag_reuniao"]).locator("[data-tag-pilula]").inner_text() if ok else ""
    p.check(ok and ini == "R", f"[reuniao] mês: só a inicial da tag ({ini})")
    c.pg.locator('[data-visao="mes"]').scroll_into_view_if_needed()
    c.print("mes_tags")
    c.ir(f"/painel/agenda?visao=lista&data={dia.isoformat()}")
    ok = c.esperar(lambda: c.tem(f'[data-visao="lista"] [data-evento="{E.get("ag_reuniao")}"]'), 30)
    lt = c.pg.locator(f'[data-visao="lista"] [data-evento="{E.get("ag_reuniao")}"] [data-tag-pilula]').inner_text() if ok else ""
    p.check(ok and lt.upper() == "REUNIÃO", f"[reuniao] lista: a pílula da tag ({lt})")
    c.pg.locator('[data-visao="lista"]').scroll_into_view_if_needed()
    c.print("lista_tags")
    c.fim()


@caso
def caso_nova_tag(nav):
    ana, bia_mat = m()["ana"], m()["matricula_bia"]
    dia = dia_alvo()
    c = abrir(nav, "nova_tag", B.AMBOS, "/painel/agenda")
    novo_agendamento(c)
    c.esperar(lambda: c.tem("[data-campo-tag]"), 30)
    c.pg.locator("[data-campo-calendario]").select_option(E["cal_nutri"])
    escolher_aluno(c, bia_mat, B.NOMES[B.ALUNO])
    c.pg.locator("[data-btn-nova-tag-agendamento]").click()
    p.check(c.esperar(lambda: c.tem('[data-modal-tag="nova"]'), 20), "[nova_tag] 'Nova tag' abre o TagDialog dentro do agendamento")
    area = c.pg.locator("[data-campo-area-tag]").get_attribute("data-campo-area-tag")
    p.check(area == "nutricao", f"[nova_tag] a área sugerida = a da consulta ({area})")
    c.pg.locator("[data-campo-nome-tag]").fill("Acompanhamento W2")
    c.pg.locator('[data-cor-tag="#38bdf8"]').click()
    c.pg.locator("[data-btn-salvar-tag]").click()
    r = esperar_db(f"select id::text, area from {S}.agenda_tags where profissional_id = {q(ana)} and nome = 'Acompanhamento W2' and deleted_at is null", 20)
    p.check(bool(r) and r[0]["area"] == "nutricao", f"[nova_tag] a tag nasceu (Nutrição) ({r})")
    if r:
        E["acomp"] = r[0]["id"]
        ok = c.esperar(lambda: c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag") == r[0]["id"], 15)
        p.check(ok, "[nova_tag] e já fica escolhida no agendamento")
    marcar_horario(c, dia, "14:00")
    sem_avisar(c)
    c.pg.evaluate("() => { const d = document.querySelector('[data-modal-agendamento]'); if (d) d.scrollTop = 0; }")
    c.print("agendamento_nova_tag")
    c.pg.locator("[data-btn-salvar-agendamento]").click()
    ag = esperar_db(f"""select id::text, tag_id::text as tag, modulo from {S}.agendamentos
                        where nutricionista_id = {q(ana)} and paciente_id = {q(bia_mat)} and inicio = {q(sp(dia, '14:00'))} and deleted_at is null""", 30)
    p.check(bool(ag) and ag[0]["tag"] == E.get("acomp") and ag[0]["modulo"] == "nutricao", f"[nova_tag] a consulta gravou com a tag nova ({ag})")
    if ag:
        E["ag_acomp"] = ag[0]["id"]
    c.fim()


@caso
def caso_editar(nav):
    dia = dia_alvo()
    c = abrir(nav, "editar", B.AMBOS, f"/painel/agenda?visao=semana&data={dia.isoformat()}")
    ok = c.esperar(lambda: c.tem(f'[data-evento="{E.get("ag_acomp")}"]'), 40)
    p.check(ok, "[editar] a consulta com a tag nova na semana")
    if ok:
        chip(c, E["ag_acomp"]).click()
        p.check(c.esperar(lambda: c.tem('[data-modal-agendamento="editar"]'), 20), "[editar] o diálogo de editar abre")
        ok = c.esperar(lambda: c.pg.locator("[data-campo-tag]").get_attribute("data-campo-tag") == E.get("acomp"), 30)
        p.check(ok, "[editar] o editar mostra a tag da consulta (Acompanhamento W2), sem salvar")
        c.pg.keyboard.press("Escape")
        a2 = B.sql_principal(f"select tag_id::text as tag from {S}.agendamentos where id = {q(E['ag_acomp'])}")[0]["tag"]
        p.check(a2 == E.get("acomp"), "[editar] fechar sem salvar não muda nada")
    c.fim()


@caso
def caso_calendario(nav):
    c = abrir(nav, "calendario", B.AMBOS, "/painel/agenda")
    c.esperar(lambda: c.tem(f'[data-btn-editar-calendario="{E["cal_nutri"]}"]'), 40)
    esperar_tags(c, 3)
    c.pg.locator(f'[data-btn-editar-calendario="{E["cal_nutri"]}"]').click()
    p.check(c.esperar(lambda: c.tem('[data-modal-calendario="editar"]'), 20), "[calendario] editar o calendário Nutrição")
    v = c.pg.locator("[data-campo-tag-padrao]").input_value()
    p.check(v == E.get("bn"), f"[calendario] campo 'Tag padrão' = Nutrição ({v})")
    c.print("calendario_tag_padrao")
    c.pg.keyboard.press("Escape")
    c.fim()


@caso
def caso_cor(nav):
    dia = dia_alvo()
    c = abrir(nav, "cor", B.AMBOS, f"/painel/agenda?visao=semana&data={dia.isoformat()}")
    esperar_tags(c, 4)
    c.pg.locator(f'[data-btn-editar-tag="{E["reuniao"]}"]').click()
    p.check(c.esperar(lambda: c.tem('[data-modal-tag="editar"]'), 20), "[cor] editar a Reunião")
    c.pg.locator('[data-cor-tag="#fb923c"]').click()
    c.pg.locator("[data-btn-salvar-tag]").click()
    r = esperar_db(f"select cor from {S}.agenda_tags where id = {q(E['reuniao'])} and cor = '#fb923c'", 20)
    p.check(bool(r), "[cor] o banco gravou a cor nova (laranja)")
    ok = c.esperar(lambda: "251, 146, 60" in chip(c, E["ag_reuniao"]).locator("[data-tag-pilula]").evaluate("e => e.style.background"), 30)
    p.check(ok, "[cor] o chip da consulta mudou para a cor nova")
    mod = B.sql_principal(f"select modulo from {S}.agendamentos where id = {q(E['ag_reuniao'])}")[0]["modulo"]
    p.check(mod == "geral", f"[cor] a área não mudou ({mod})")
    c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
    c.pg.mouse.move(5, 5)
    c.print("cor_editada")
    c.fim()


@caso
def caso_excluir(nav):
    ana = m()["ana"]
    dia = dia_alvo()
    c = abrir(nav, "excluir", B.AMBOS, f"/painel/agenda?visao=semana&data={dia.isoformat()}")
    esperar_tags(c, 4)
    c.pg.locator(f'[data-btn-excluir-tag="{E["reuniao"]}"]').click()
    p.check(c.esperar(lambda: c.tem("[data-modal-excluir-tag]"), 20), "[excluir] confirmação")
    destino = c.pg.locator("[data-destino-excluir-tag]").get_attribute("data-destino-excluir-tag")
    txt = c.pg.locator("[data-destino-excluir-tag]").inner_text()
    p.check(destino == "Geral" and '"Geral"' in txt, f"[excluir] a confirmação diz para qual tag as consultas vão ({destino})")
    c.print("excluir_tag_confirmacao")
    c.pg.locator("[data-btn-confirmar-excluir-tag]").click()
    r = esperar_db(f"select deleted_at from {S}.agenda_tags where id = {q(E['reuniao'])} and deleted_at is not null", 20)
    p.check(bool(r), "[excluir] a tag saiu (soft delete)")
    a = B.sql_principal(f"select tag_id::text as tag, modulo, deleted_at from {S}.agendamentos where id = {q(E['ag_reuniao'])}")[0]
    p.check(a["tag"] == E.get("bg") and a["modulo"] == "geral" and a["deleted_at"] is None, f"[excluir] a consulta voltou para 'Geral' e continua na agenda ({a})")
    ok = c.esperar(lambda: chip(c, E["ag_reuniao"]).locator("[data-tag-pilula]").get_attribute("data-tag-nome") == "Geral", 30)
    p.check(ok, "[excluir] o chip mostra 'Geral'")
    p.check(c.esperar(lambda: c.pg.locator(f'[data-tag-item="{E["reuniao"]}"]').count() == 0, 15), "[excluir] a Reunião saiu do bloco Tags")
    # o nome ficou livre
    c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
    c.pg.mouse.move(5, 5)
    c.print("excluir_tag_depois")
    tags = [x["nome"] for x in B.tags_de(ana)]
    p.check(tags == ["Treino", "Nutrição", "Geral", "Acompanhamento W2"], f"[excluir] as tags vivas da Ana: {tags}")
    c.fim()


@caso
def caso_ics(nav):
    c = abrir(nav, "ics", B.AMBOS, "/painel/agenda")
    c.esperar(lambda: c.tem("[data-btn-exportar-ics]:not([disabled])"), 40)
    esperar_tags(c, 3)
    arq = B.baixar(c.pg, lambda: c.pg.locator("[data-btn-exportar-ics]").click(), "ana")
    ics = arq.read_text(encoding="utf-8") if arq else ""
    blocos = {b.split("UID:")[1].split("@")[0]: b for b in ics.split("BEGIN:VEVENT")[1:] if "UID:" in b}
    p.check("CATEGORIES:Acompanhamento W2" in blocos.get(E.get("ag_acomp", "-"), ""), "[ics] a consulta da Bia com CATEGORIES:Acompanhamento W2")
    p.check("CATEGORIES:Geral" in blocos.get(E.get("ag_reuniao", "-"), ""), "[ics] a ex-Reunião com CATEGORIES:Geral")
    p.check("CATEGORIES:Nutrição" in blocos.get(E.get("ag_nutri", "-"), ""), "[ics] a consulta de nutrição com CATEGORIES:Nutrição")
    c.fim()


# ───────────────────────── Paulo: só personal ─────────────────────────

@caso
def caso_so_personal(nav):
    paulo = m()["paulo"]
    c = abrir(nav, "so_personal", B.PERSONAL, "/painel/agenda")
    cals = esperar_db(f"""select id::text, nome, cor, padrao, tag_padrao_id::text as tag from {S}.calendarios
                          where nutricionista_id = {q(paulo)} and deleted_at is null order by created_at""", 40)
    bt = B.base_de(paulo, "treino")
    p.check(len(cals) == 1 and cals[0]["nome"] == "Calendário principal" and cals[0]["padrao"] and cals[0]["tag"] == bt,
            f"[so_personal] só personal nasce com 1 'Calendário principal' com a tag padrão Treino ({cals})")
    ok = esperar_tags(c, 3)
    p.check(ok and c.pg.locator("[data-tags-minhas] [data-tag-item]").count() == 3, "[so_personal] as 3 prontas no bloco Tags")
    c.pg.locator("[data-aside-agenda]").scroll_into_view_if_needed()
    c.print("so_personal")
    c.fim()


# ───────────────────────── Lucas: o dono vendo a equipe ─────────────────────────

@caso
def caso_equipe(nav):
    camila = m()["camila"]
    cn = B.base_de(camila, "nutricao")
    ag = B.sql_principal(f"""select id::text, timezone('America/Sao_Paulo', inicio)::date::text as dia, tag_id::text as tag from {S}.agendamentos
                             where nutricionista_id = {q(camila)} and deleted_at is null and modulo = 'nutricao' order by inicio desc limit 1""")
    rota = f"/painel/agenda?visao=semana&data={ag[0]['dia']}" if ag else "/painel/agenda"
    c = abrir(nav, "equipe", "w13-dono", rota)
    ok = c.esperar(lambda: c.tem(f'[data-tags-membro="{camila}"]'), 60)
    pilulas = c.pg.locator(f'[data-tags-membro="{camila}"] [data-tag-pilula]').evaluate_all("els => els.map(e => e.dataset.tagPilula)") if ok else []
    p.check(ok and cn in pilulas, f"[equipe] o dono vê as tags da Camila (só leitura: {len(pilulas)})")
    p.check(c.pg.locator(f'[data-tags-membro="{camila}"] [data-btn-excluir-tag], [data-tags-membro="{camila}"] [data-btn-editar-tag]').count() == 0,
            "[equipe] sem editar/excluir as tags da equipe")
    if ag:
        ok = c.esperar(lambda: c.tem(f'[data-evento="{ag[0]["id"]}"]'), 40)
        t = chip(c, ag[0]["id"]).get_attribute("data-tag-evento") if ok else None
        p.check(ok and t == ag[0]["tag"] == cn, f"[equipe] a consulta da Camila com a tag DELA ({t})")
    c.pg.locator("[data-aside-agenda]").scroll_into_view_if_needed()
    c.print("equipe_tags")
    c.fim()


# ───────────────────────── negativos (REST e funções) ─────────────────────────

@caso
def caso_negativos(nav):  # noqa: ARG001 — sem navegador
    ana, paulo, bia, mat = m()["ana"], m()["paulo"], m()["bia"], m()["matricula_bia"]
    tb = B.token(B.ALUNO)
    st, r = B.rest(tb, "agenda_tags?select=*")
    p.check(st == 200 and r == [], f"[neg] a aluna lê 0 linhas de agenda_tags pela REST ({st}, {r})")
    st, r = B.rest(tb, f"agenda_tags?select=*&profissional_id=eq.{ana}")
    p.check(st == 200 and r == [], f"[neg] nem filtrando pela profissional dela ({st}, {r})")
    st, r = B.rest(tb, "agenda_tags", "POST", {"profissional_id": bia, "nome": "Tag da aluna", "cor": "#f87171", "area": "geral"})
    p.check(st in (401, 403), f"[neg] a aluna não cria tag ({st})")
    st, r = B.rpc_token(tb, "agenda_garantir_tags")
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") is False and r.get("erro") == "sem_acesso", f"[neg] a aluna não ganha tags pela RPC ({r})")
    st, r = B.rest(tb, f"agendamentos?select=*,agenda_tags(*)&paciente_id=eq.{mat}")
    nomes_tag = ("Acompanhamento W2", "Reunião", "Nutrição", "Treino", "Geral")
    txt = json.dumps(r, ensure_ascii=False)
    p.check(st == 200 and isinstance(r, list) and len(r) >= 2 and all(x.get("agenda_tags") is None for x in r) and "Acompanhamento W2" not in txt,
            f"[neg] as consultas da aluna pela REST não trazem o nome da tag (embed nulo; {len(r) if isinstance(r, list) else r})")
    st, r = B.rpc_token(tb, "minha_agenda", {"p_desde": None})
    txt = json.dumps(r, ensure_ascii=False)
    p.check(st == 200 and isinstance(r, list) and len(r) >= 2 and "tag" not in txt.lower() and not any(n in txt for n in ("Acompanhamento W2", "Reunião")),
            f"[neg] minha_agenda (app) sem tag ({len(r) if isinstance(r, list) else r})")
    st, r = B.rpc_token(tb, "minhas_regras_agenda")
    p.check(st == 200 and "tag" not in json.dumps(r).lower(), "[neg] minhas_regras_agenda sem tag")
    ta = B.token(B.AMBOS)
    st, r = B.rpc_token(ta, "aluno_compromissos", {"p_aluno": mat})
    txt = json.dumps(r, ensure_ascii=False)
    p.check(st == 200 and isinstance(r, dict) and len(r.get("consultas") or []) >= 2 and "tag" not in txt.lower() and "Acompanhamento W2" not in txt,
            f"[neg] aluno_compromissos sem a tag ({len((r or {}).get('consultas') or [])} consultas)")
    em = B.como(ana, S, "{s}.agenda_reservar_email(" + q(E.get("ag_acomp")) + "::uuid)")
    p.check(isinstance(em, dict) and "tag" not in json.dumps(em).lower() and "Acompanhamento W2" not in json.dumps(em, ensure_ascii=False),
            f"[neg] o e-mail ao aluno (agenda_reservar_email, numa transação desfeita) sem a tag ({str(em)[:120]})")
    av = B.sql_principal(f"select titulo from {S}.avisos where destino_user_id = {q(bia)}")
    p.check(av and not any(n in x["titulo"] for x in av for n in ("Acompanhamento W2", "Reunião")), f"[neg] o sino da aluna sem a tag ({[x['titulo'] for x in av][:3]})")
    tp = B.token(B.PERSONAL)
    st, r = B.rest(tp, f"agenda_tags?select=*&profissional_id=eq.{ana}")
    p.check(st == 200 and r == [], f"[neg] outro profissional (Paulo) não lê as tags da Ana ({st}, {r})")
    st, r = B.rest(tp, f"agenda_tags?id=eq.{E.get('acomp')}", "PATCH", {"nome": "Invadida"})
    nome = B.sql_principal(f"select nome from {S}.agenda_tags where id = {q(E.get('acomp'))}")[0]["nome"]
    p.check(r == [] and nome == "Acompanhamento W2", f"[neg] o Paulo não edita a tag da Ana ({st}, {nome})")
    st, r = B.rest(ta, f"agenda_tags?id=eq.{E.get('bt')}", "PATCH", {"deleted_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    p.check(st >= 400 and "tag_base_nao_exclui" in json.dumps(r), f"[neg] a base não exclui ({st}, {str(r)[:100]})")
    st, r = B.rest(ta, f"agenda_tags?id=eq.{E.get('bt')}", "PATCH", {"area": "geral"})
    p.check(st >= 400 and "tag_base_area_fixa" in json.dumps(r), f"[neg] a base não muda de área ({st})")
    st, r = B.rest(ta, f"agenda_tags?id=eq.{E.get('acomp')}", "DELETE")
    p.check(st in (401, 403), f"[neg] DELETE de verdade não tem permissão (excluir = deleted_at) ({st})")
    st, r = B.rest(ta, "agenda_tags", "POST", {"profissional_id": ana, "nome": "Base falsa", "cor": "#f87171", "area": "geral", "base": True})
    p.check(st in (401, 403), f"[neg] ninguém cria 'base' pela REST ({st})")
    vivos = B.sql_principal(f"select count(*)::int as n from {S}.agenda_tags where profissional_id = {q(ana)} and base")[0]["n"]
    p.check(vivos == 3, f"[neg] a Ana continua com as 3 prontas ({vivos})")
    _ = paulo


# ───────────────────────── o app da aluna ─────────────────────────

@caso
def caso_app_aluno(nav):
    c = abrir(nav, "app_aluno", B.ALUNO, "/perfil/agenda", esperar="[data-pagina-agenda]", desktop=False)
    ok = c.esperar(lambda: c.pg.locator("[data-agendamento]").count() >= 2 or int(c.pg.locator("[data-pagina-agenda]").get_attribute("data-proximos") or 0) >= 2, 60)
    c.pg.wait_for_timeout(1500)
    txt = c.texto()
    ids_vistos = set(c.pg.locator("[data-agendamento], [data-agenda-confirmar]").evaluate_all("els => els.map(e => e.dataset.agendamento || e.dataset.agendaConfirmar)"))
    p.check(ok and {E.get("ag_nutri"), E.get("ag_acomp")} <= ids_vistos and "Acompanhamento W2" not in txt and "Reunião" not in txt,
            f"[app_aluno] a Agenda do app com as 2 consultas da Bia e sem tag ({len(ids_vistos)} consultas)")
    p.check(c.pg.locator("[data-tag-pilula]").count() == 0, "[app_aluno] nenhuma pílula de tag no app")
    c.print("app_aluno_agenda")
    c.fim()


ORDEM = ["inicial", "criar_tag", "nutricao", "reuniao", "nova_tag", "editar", "calendario", "cor", "excluir", "ics", "so_personal", "equipe", "negativos", "app_aluno"]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(ORDEM))
    a = ap.parse_args()
    E.update(base=a.base.rstrip("/"), prefixo=a.prefixo, massa=B.ids())
    estado = B.SCRATCH / f"estado_{a.prefixo}.json"
    if estado.exists() and a.casos != ",".join(ORDEM):
        E.update({k: v for k, v in json.loads(estado.read_text()).items() if k not in ("base", "prefixo", "massa")})
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            for nome in a.casos.split(","):
                B.saude_ok(f"o caso {nome}")
                print(f"\n── {nome}", flush=True)
                try:
                    CASOS[nome](nav)
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] exceção: {e!r}"[:400])
                    caso_atual = B.ESTADO.get("caso")
                    if caso_atual:
                        caso_atual.diagnostico()
                        try:
                            caso_atual.ctx.close()
                        except Exception:  # noqa: BLE001
                            pass
                estado.write_text(json.dumps({k: v for k, v in E.items() if k not in ("massa",)}, indent=1, default=str))
                time.sleep(1.5)
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
