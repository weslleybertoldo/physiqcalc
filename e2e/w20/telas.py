#!/usr/bin/env python3
"""Physiq W20 — E2E das telas do Painel › Agenda (padrão da tela 6) e do card "Próximos compromissos" (tela 7), e da Perfil › Agenda
do app (tela 5): confirmar, reagendar (a mensagem clara), desistir, o pacote e "Marcar consulta"; o aviso no aparelho.
Contexto limpo por caso; painel 1280 × 883 × 2 (= 2560 × 1766), app 390 × 844 × 3,4 (= 1326 × 2870).

Positivo:
  topo        Lucas (dono): "Consultas hoje" (treino · nutrição), a semana, "a confirmar" e a "Agenda de hoje" = banco; "Consultas por semana".
  semana      Lucas: a grade em slots, a trava do almoço hachurada, as consultas da semana = banco.
  criar       Lucas marca o Rafael: tipo TREINO pelo papel (NF12), 2 slots (1 h), no horário livre; o banco grava, o sino do
              Rafael recebe "Consulta marcada" e o e-mail sai (staging → caixa de teste do Resend).
  regras      Lucas: o diálogo mostra as regras gravadas; mudar → a mensagem de exemplo muda → grava; volta ao padrão.
  trava       Lucas: trava recorrente e avulsa → o slot aparece "travado"/"bloqueado" no novo agendamento; liberar.
  personal    Bruno (personal, não dono): 1º acesso cria o calendário; cria "Studio Bruno" (slot de 45 min), agenda o Carlos,
              CONFIRMA (status) e EXPORTA o .ics (UID, aluno, STATUS:CONFIRMED). Negativo: não vê a agenda do Lucas.
  card        Lucas: Resumo do Rafael › "Próximos compromissos" (consultas do Lucas e da Camila, o pacote) e "Agendar" → a Agenda
              abre o novo agendamento já com o Rafael.
  fluxo       Camila (nutri): o atalho "Agendar" do Fluxo de consulta (W14) abre a Agenda nova com o Rafael e o tipo NUTRIÇÃO.
  aluno       Rafael (app): confirma a da Camila; reagenda a do Lucas (a mensagem do pedido; só horários livres — sem o almoço
              nem domingo); 2ª vez não deixa; desiste (o aviso do pacote) → restam 5 de 6; marca a consulta de um mês livre.
  aviso       Rafael (app): ao abrir, a consulta nova vira o aviso (toast; no APK, a notificação local), 1 vez por consulta.
  rotas       /agenda?paciente=<id> (link do site antigo) → /painel/agenda com o aluno; /app/agenda → /perfil/agenda.
Negativo:
  membro      Camila (não é dona): só a agenda dela (nenhuma consulta do Lucas); o aluno não abre o painel.

Uso: python3 e2e/w20/telas.py --base http://localhost:5173 --prefixo local [--casos topo,semana,...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging). A massa: python3 e2e/w20/massa.py (antes).
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
q = B.q
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return ESTADO["massa"]


def abrir(nav, nome: str, conta: str, rota: str, esperar: str = "[data-pagina-agenda-painel]"):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    c.entrar(conta, rota)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem(esperar), 90)
    p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
    return c


def dia_util(dias: int) -> dt.date:
    """O 1º dia de seg a sáb a partir de hoje + N, dentro do mês (o Lucas atende seg–sáb)."""
    d = B.hoje() + dt.timedelta(days=dias)
    while d.weekday() == 6:
        d += dt.timedelta(days=1)
    return d


def hoje_vivos_conta() -> int:
    r = B.sql_principal(f"""select count(*)::int n from {S}.agendamentos where conta_id = {q(m()['conta'])} and deleted_at is null and not dia_inteiro
                             and status not in ('desmarcado', 'paciente_desmarcou')
                             and timezone('America/Sao_Paulo', inicio)::date = timezone('America/Sao_Paulo', now())::date""")
    return r[0]["n"]


def escolher_aluno(c, paciente_id: str, nome: str) -> None:
    c.pg.locator("[data-campo-paciente]").click()
    c.pg.locator("[data-busca-paciente]").fill(nome.split(" ")[0])
    c.pg.locator(f'[data-opcao-paciente="{paciente_id}"]').click()
    c.pg.wait_for_timeout(300)


# ───────────────────────── painel ─────────────────────────

@caso
def caso_topo(nav):
    c = abrir(nav, "topo", "w13-dono", "/painel/agenda")
    ok = c.esperar(lambda: c.tem("[data-resumo-agenda][data-hoje]"), 60)
    p.check(ok, "[topo] números do topo carregaram")
    esperado = hoje_vivos_conta()
    n = c.pg.locator("[data-resumo-agenda]").get_attribute("data-hoje")
    p.check(n == str(esperado), f"[topo] Consultas hoje = banco ({n} × {esperado})")
    por_tipo = c.pg.locator("[data-hoje-por-tipo]").inner_text()
    p.check("de treino" in por_tipo and "de nutrição" in por_tipo, f"[topo] '3 de treino · 2 de nutrição' ({por_tipo})")
    linhas = c.pg.locator("[data-hoje-evento]").count()
    p.check(linhas == min(esperado, 6), f"[topo] Agenda de hoje = {linhas} linhas")
    txt = c.pg.locator("[data-cartao-agenda-hoje]").inner_text()
    p.check("Marina Alves" in txt and "TREINO" in txt and "NUTRI" in txt, "[topo] Agenda de hoje com aluno e tag TREINO/NUTRI")
    p.check(c.pg.locator("[data-semana-barra]").count() == 8, "[topo] Consultas por semana: 8 semanas")
    sem = c.pg.locator("[data-semana-barra]").evaluate_all("els => els.map(e => +e.dataset.agendadas)")
    p.check(sum(sem) >= 20, f"[topo] o gráfico tem as consultas da massa ({sum(sem)})")
    c.print("tela6_agenda")
    c.fim()


@caso
def caso_semana(nav):
    c = abrir(nav, "semana", "w13-dono", f"/painel/agenda?visao=semana&data={B.hoje().isoformat()}")
    ok = c.esperar(lambda: c.tem('[data-visao="semana"]') and c.pg.locator("[data-evento]").count() > 0, 60)
    p.check(ok, "[semana] visão semana com consultas")
    p.check(c.pg.locator('[data-visao="semana"]').get_attribute("data-slot") == "30", "[semana] a grade em slots de 30 min (o calendário padrão do Lucas)")
    p.check(c.pg.locator("[data-trava]").count() >= 6, "[semana] a trava recorrente do almoço hachurada (seg–sáb e domingo)")
    p.check(c.pg.locator('[data-fora="1"]').count() > 0, "[semana] fora do atendimento apagado")
    ids = set(c.pg.locator("[data-coluna] [data-evento], [data-dia-inteiro] [data-evento]").evaluate_all("els => els.map(e => e.dataset.evento)"))
    seg = B.hoje() - dt.timedelta(days=(B.hoje().weekday() + 1) % 7)  # domingo da semana (a visão começa no domingo)
    db = B.sql_principal(f"""select count(*)::int n from {S}.agendamentos where deleted_at is null and conta_id = {q(m()['conta'])}
                             and inicio < {q(B.sp(seg + dt.timedelta(days=7), '00:00'))} and fim > {q(B.sp(seg, '00:00'))}""")[0]["n"]
    p.check(len(ids) == db, f"[semana] consultas da semana = banco ({len(ids)} × {db})")
    c.pg.locator('[data-segmentado], [role="radiogroup"][aria-label="Visão"] button').filter(has_text="Mês").first.click()
    p.check(c.esperar(lambda: c.tem('[data-visao="mes"]'), 20), "[semana] troca para o mês")
    c.print("mes")
    c.pg.locator('[role="radiogroup"][aria-label="Visão"] button').filter(has_text="Lista").first.click()
    p.check(c.esperar(lambda: c.tem('[data-visao="lista"]'), 20), "[semana] troca para a lista")
    c.print("lista")
    c.ir(f"/painel/agenda?visao=semana&data={B.hoje().isoformat()}")
    c.esperar(lambda: c.tem('[data-visao="semana"]'), 30)
    c.pg.locator('[data-visao="semana"]').scroll_into_view_if_needed()
    c.print("semana")
    c.fim()


@caso
def caso_criar(nav):
    c = abrir(nav, "criar", "w13-dono", "/painel/agenda")
    c.esperar(lambda: c.tem("[data-btn-novo-agendamento]:not([disabled])"), 40)
    rafael = m()["alunos"]["Rafael Moura"]
    dia = dia_util(5)
    # idempotente: a consulta que este caso marca (e o que o app fez com ela numa rodada anterior) sai antes
    B.sql_principal(f"""delete from {S}.agendamentos where paciente_id = {q(rafael)} and nutricionista_id = {q(m()['lucas'])}
                         and (origem = 'aluno' or mes_referencia = {q(dia.replace(day=1).isoformat())}) and titulo = 'Consulta de treino'
                         and created_at > {q(m()['desde'])}""")
    # a regra dos 10 minutos (1 e-mail da agenda por aluno) vale: o caso parte sem e-mail recente para o Rafael (a api.py prova o "repetido")
    B.sql_principal(f"update {S}.agendamentos set aviso_email_em = null where paciente_id = {q(rafael)} and aviso_email_em > now() - interval '15 minutes'")
    t0 = dt.datetime.now(dt.timezone.utc).isoformat()
    c.pg.locator("[data-btn-novo-agendamento]").click()
    p.check(c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]'), 20), "[criar] diálogo do novo agendamento")
    escolher_aluno(c, rafael, "Rafael Moura")
    p.check(c.pg.locator("[data-campo-tipo]").get_attribute("data-campo-tipo") == "treino", "[criar] tipo TREINO pelo papel do Lucas (personal) — NF12")
    c.pg.locator("[data-campo-data]").fill(dia.isoformat())
    p.check(c.esperar(lambda: c.pg.locator("[data-horario]").count() > 0, 30), "[criar] horários do dia (o banco)")
    estados = dict(c.pg.locator("[data-horario]").evaluate_all("els => els.map(e => [e.dataset.horario, e.dataset.horarioEstado])"))
    p.check(estados.get("15:00") == "livre", f"[criar] 15:00 livre ({estados.get('15:00')})")
    p.check(estados.get("12:00") == "travado" and estados.get("12:30") == "travado", f"[criar] almoço travado ({estados.get('12:00')}, {estados.get('12:30')})")
    p.check("07:00" in estados and "18:30" in estados and "19:00" not in estados, "[criar] slots só dentro do atendimento 07:00–19:00")
    c.pg.locator('[data-horario="15:00"]').click()
    c.pg.locator("[data-slots-mais]").click()
    rot = c.pg.locator("[data-duracao-rotulo]").inner_text()
    p.check("2 slots" in rot and "1 h" in rot, f"[criar] 2 slots = 1 h ({rot})")
    p.check(c.tem("[data-campo-avisar] input:checked"), "[criar] 'Avisar o aluno' ligado (ele tem login)")
    c.print("novo_agendamento")
    c.pg.locator("[data-btn-salvar-agendamento]").click()
    r = B.esperar(lambda: B.sql_principal(f"""select id::text, modulo, nutricionista_id::text as prof, conta_id::text as conta, extract(epoch from fim - inicio)::int as dur,
                                                  status, mes_referencia::text as mes from {S}.agendamentos
                                            where paciente_id = {q(rafael)} and inicio = {q(B.sp(dia, '15:00'))} and deleted_at is null"""), 30)
    p.check(bool(r), "[criar] o banco gravou a consulta")
    if r:
        a = r[0]
        ESTADO["criada"] = a["id"]
        p.check(a["modulo"] == "treino" and a["prof"] == m()["lucas"] and a["conta"] == m()["conta"] and a["dur"] == 3600 and a["status"] == "agendado",
                f"[criar] treino · Lucas · conta · 1 h · agendado ({a})")
        p.check(a["mes"] == dia.replace(day=1).isoformat(), f"[criar] mês da consulta = {a['mes']}")
        aviso = B.esperar(lambda: B.sql_principal(f"""select titulo from {S}.avisos where destino_user_id = {q(B.uid('w13-aluno'))} and tipo = 'consulta_marcada'
                                                   and criado_em >= {q(t0)} and titulo like 'Consulta marcada:%'"""), 20)
        p.check(bool(aviso), f"[criar] o sino do Rafael recebeu 'Consulta marcada' ({aviso[0]['titulo'] if aviso else '-'})")
        mail = B.esperar(lambda: B.sql_principal(f"select aviso_email_em from {S}.agendamentos where id = {q(a['id'])} and aviso_email_em is not null"), 30)
        p.check(bool(mail), "[criar] o e-mail saiu (reserva gravada pela agenda-avisar; staging → caixa de teste)")
        p.check(c.esperar(lambda: "avisado no app e por e-mail" in c.texto(), 15), "[criar] a tela diz que o aluno foi avisado no app e por e-mail")
    c.fim()


@caso
def caso_regras(nav):
    c = abrir(nav, "regras", "w13-dono", "/painel/agenda")
    c.esperar(lambda: c.tem("[data-resumo-regras]"), 30)
    resumo = c.pg.locator("[data-resumo-regras]").inner_text()
    p.check("Slots de 30 min · 07:00–19:00 · seg–sáb" in resumo, f"[regras] o resumo do painel = banco ({resumo})")
    c.pg.locator("[data-btn-editar-regras]").click()
    p.check(c.esperar(lambda: c.tem("[data-modal-regras]"), 20), "[regras] diálogo")
    p.check(c.pg.locator("[data-campo-dias]").get_attribute("data-campo-dias") == "1,2,3,4,5,6", "[regras] dias seg–sáb")
    ex1 = c.pg.locator("[data-exemplo-mensagem]").inner_text()
    p.check("Você só pode reagendar 1 vez neste mês" in ex1 and "você não terá outra consulta em" in ex1, f"[regras] a mensagem do pedido ({ex1[:120]})")
    c.pg.locator("[data-campo-reagendamentos]").select_option("2")
    c.pg.locator('[data-janela-btn="mes_seguinte"]').click()
    ex2 = c.pg.locator("[data-exemplo-mensagem]").inner_text()
    p.check("Você pode reagendar 2 vezes para uma data até" in ex2, f"[regras] a mensagem acompanha as regras ({ex2[:120]})")
    c.print("regras")
    c.pg.locator("[data-btn-salvar-regras]").click()
    r = B.esperar(lambda: B.sql_principal(f"select reagendamentos_max, janela_reagendamento from {S}.agenda_config where profissional_id = {q(m()['lucas'])} and reagendamentos_max = 2"), 20)
    p.check(bool(r) and r[0]["janela_reagendamento"] == "mes_seguinte", "[regras] gravou 2 vezes · até o fim do mês seguinte")
    # volta ao padrão do pedido (1 vez, só no mês) pelo próprio diálogo
    c.esperar(lambda: not c.tem("[data-modal-regras]"), 10)
    c.pg.locator("[data-btn-editar-regras]").click()
    c.esperar(lambda: c.tem("[data-modal-regras]"), 20)
    c.pg.locator("[data-campo-reagendamentos]").select_option("1")
    c.pg.locator('[data-janela-btn="mes"]').click()
    c.pg.locator("[data-btn-salvar-regras]").click()
    r = B.esperar(lambda: B.sql_principal(f"select 1 from {S}.agenda_config where profissional_id = {q(m()['lucas'])} and reagendamentos_max = 1 and janela_reagendamento = 'mes'"), 20)
    p.check(bool(r), "[regras] voltou a 1 vez · só no mês")
    c.fim()


@caso
def caso_trava(nav):
    c = abrir(nav, "trava", "w13-dono", "/painel/agenda")
    c.esperar(lambda: c.tem("[data-btn-travar]"), 30)
    dia = dia_util(2)
    c.pg.locator("[data-btn-travar]").click()
    c.esperar(lambda: c.tem("[data-modal-trava]"), 20)
    c.pg.locator('[data-modo-trava="recorrente"]').click()
    c.pg.locator("[data-campo-trava-das]").fill("16:00")
    c.pg.locator("[data-campo-trava-as]").fill("16:30")
    c.pg.locator("[data-campo-trava-motivo]").fill("Pausa W20")
    c.print("trava")
    c.pg.locator("[data-btn-salvar-trava]").click()
    tr = B.esperar(lambda: B.sql_principal(f"select id::text, dias from {S}.agenda_travas where profissional_id = {q(m()['lucas'])} and motivo = 'Pausa W20'"), 20)
    p.check(bool(tr), "[trava] recorrente gravada")
    c.esperar(lambda: not c.tem("[data-modal-trava]"), 10)
    c.pg.locator("[data-btn-travar]").click()
    c.esperar(lambda: c.tem("[data-modal-trava]"), 20)
    c.pg.locator('[data-modo-trava="avulsa"]').click()
    c.pg.locator("[data-campo-trava-data]").fill(dia.isoformat())
    c.pg.locator("[data-campo-trava-das]").fill("17:00")
    c.pg.locator("[data-campo-trava-as]").fill("18:00")
    c.pg.locator("[data-campo-trava-motivo]").fill("Avulsa W20")
    c.pg.locator("[data-btn-salvar-trava]").click()
    bl = B.esperar(lambda: B.sql_principal(f"select id::text from {S}.bloqueios_agenda where nutricionista_id = {q(m()['lucas'])} and motivo = 'Avulsa W20'"), 20)
    p.check(bool(bl), "[trava] avulsa gravada (bloqueios_agenda — o site antigo também mostra)")
    c.esperar(lambda: not c.tem("[data-modal-trava]"), 10)
    c.pg.locator("[data-btn-novo-agendamento]").click()
    c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]'), 20)
    c.pg.locator("[data-campo-data]").fill(dia.isoformat())
    c.esperar(lambda: c.pg.locator("[data-horario]").count() > 0, 30)
    est = dict(c.pg.locator("[data-horario]").evaluate_all("els => els.map(e => [e.dataset.horario, e.dataset.horarioEstado])"))
    p.check(est.get("16:00") == "travado", f"[trava] 16:00 travado no dia ({est.get('16:00')})")
    p.check(est.get("17:00") == "bloqueado" and est.get("17:30") == "bloqueado", f"[trava] 17:00/17:30 bloqueados só nesse dia ({est.get('17:00')})")
    outro = dia + dt.timedelta(days=1 if dia.weekday() != 5 else 2)
    c.pg.locator("[data-campo-data]").fill(outro.isoformat())
    c.pg.wait_for_timeout(1500)
    c.esperar(lambda: c.pg.locator("[data-horario]").count() > 0, 30)
    est2 = dict(c.pg.locator("[data-horario]").evaluate_all("els => els.map(e => [e.dataset.horario, e.dataset.horarioEstado])"))
    p.check(est2.get("17:00") == "livre" and est2.get("16:00") == "travado", f"[trava] no outro dia: avulsa some, recorrente fica ({est2.get('17:00')}, {est2.get('16:00')})")
    c.pg.keyboard.press("Escape")
    c.pg.wait_for_timeout(400)
    if tr:
        c.pg.locator(f'[data-btn-liberar-trava="{tr[0]["id"]}"]').click()
        p.check(bool(B.esperar(lambda: not B.sql_principal(f"select 1 from {S}.agenda_travas where id = {q(tr[0]['id'])}"), 20)), "[trava] Liberar apaga a recorrente")
    if bl:
        c.pg.locator(f'[data-btn-excluir-bloqueio="{bl[0]["id"]}"]').click()
        p.check(bool(B.esperar(lambda: not B.sql_principal(f"select 1 from {S}.bloqueios_agenda where id = {q(bl[0]['id'])}"), 20)), "[trava] remover a avulsa")
    c.fim()


@caso
def caso_personal(nav):
    bruno = m()["bruno"]
    carlos = m()["alunos"]["Carlos Souza"]
    B.sql_principal(f"delete from {S}.agendamentos where nutricionista_id = {q(bruno)}; delete from {S}.calendarios where nutricionista_id = {q(bruno)}")
    c = abrir(nav, "personal", "w13-personal2", "/painel/agenda")
    cal = B.esperar(lambda: B.sql_principal(f"select id::text, nome from {S}.calendarios where nutricionista_id = {q(bruno)} and deleted_at is null"), 30)
    p.check(bool(cal) and cal[0]["nome"] == "Calendário principal", "[personal] o 1º acesso criou o 'Calendário principal' do Bruno")
    lucas_ids = {r["id"] for r in B.sql_principal(f"select id::text from {S}.agendamentos where nutricionista_id = {q(m()['lucas'])} and deleted_at is null")}
    vistos = set(c.pg.locator("[data-evento], [data-hoje-evento]").evaluate_all("els => els.map(e => e.dataset.evento || e.dataset.hojeEvento)"))
    p.check(not (vistos & lucas_ids), "[personal] negativo: o Bruno não vê nenhuma consulta do Lucas")
    c.pg.locator("[data-btn-novo-calendario]").click()
    c.esperar(lambda: c.tem('[data-modal-calendario="novo"]'), 20)
    c.pg.locator("[data-campo-nome-calendario]").fill("Studio Bruno")
    c.pg.locator("[data-campo-slot-calendario]").select_option("45")
    c.pg.locator("[data-btn-salvar-calendario]").click()
    novo = B.esperar(lambda: B.sql_principal(f"select id::text, slot_minutos from {S}.calendarios where nutricionista_id = {q(bruno)} and nome = 'Studio Bruno'"), 20)
    p.check(bool(novo) and novo[0]["slot_minutos"] == 45, "[personal] criou o calendário 'Studio Bruno' com slot de 45 min (por agenda)")
    c.esperar(lambda: not c.tem("[data-modal-calendario]"), 10)
    c.pg.locator("[data-btn-novo-agendamento]").click()
    c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]'), 20)
    escolher_aluno(c, carlos, "Carlos Souza")
    p.check(c.pg.locator("[data-campo-tipo]").get_attribute("data-campo-tipo") == "treino", "[personal] tipo TREINO (personal)")
    if novo:
        c.pg.locator("[data-campo-calendario]").select_option(novo[0]["id"])
    dia = dia_util(1)
    c.pg.locator("[data-campo-data]").fill(dia.isoformat())
    c.esperar(lambda: c.pg.locator("[data-horario]").count() > 0, 30)
    horas = c.pg.locator("[data-horario]").evaluate_all("els => els.map(e => e.dataset.horario)")
    p.check("08:45" in horas and "08:30" not in horas, f"[personal] slots de 45 min do calendário ({horas[:4]})")
    c.pg.locator('[data-horario="09:30"]').click()
    c.pg.locator("[data-btn-salvar-agendamento]").click()
    ag = B.esperar(lambda: B.sql_principal(f"select id::text, modulo, extract(epoch from fim - inicio)::int as dur from {S}.agendamentos where nutricionista_id = {q(bruno)} and paciente_id = {q(carlos)} and deleted_at is null"), 30)
    p.check(bool(ag) and ag[0]["dur"] == 2700 and ag[0]["modulo"] == "treino", "[personal] agendou o Carlos (1 slot de 45 min, treino)")
    if ag:
        c.ir(f"/painel/agenda?visao=lista&data={dia.isoformat()}")
        c.esperar(lambda: c.tem(f'[data-evento="{ag[0]["id"]}"]'), 30)
        c.pg.locator(f'[data-evento="{ag[0]["id"]}"]').first.click()
        c.esperar(lambda: c.tem('[data-modal-agendamento="editar"]'), 20)
        c.pg.locator("[data-campo-status]").select_option("confirmado")
        c.pg.locator("[data-btn-salvar-agendamento]").click()
        conf = B.esperar(lambda: B.sql_principal(f"select 1 from {S}.agendamentos where id = {q(ag[0]['id'])} and status = 'confirmado' and confirmacao = 'confirmado'"), 20)
        p.check(bool(conf), "[personal] CONFIRMOU (status confirmado, borda confirmada)")
        c.esperar(lambda: not c.tem("[data-modal-agendamento]"), 10)
        arq = B.B19.baixar(c.pg, lambda: c.pg.locator("[data-btn-exportar-ics]").click(), "personal")
        ics = arq.read_text(encoding="utf-8") if arq else ""
        p.check(f"UID:{ag[0]['id']}@physiqnutri" in ics and "Carlos Souza" in ics and "STATUS:CONFIRMED" in ics and "PRODID:-//Physiq//Agenda//PT" in ics,
                f"[personal] exportou o .ics ({arq.name if arq else '-'})")
        p.check(not any(f"UID:{i}@" in ics for i in lucas_ids), "[personal] o .ics do Bruno não leva consulta do Lucas")
        c.ir(f"/painel/agenda?visao=semana&data={dia.isoformat()}")
        c.esperar(lambda: c.tem(f'[data-evento="{ag[0]["id"]}"]'), 30)
        c.print("personal_semana")
    c.fim()


@caso
def caso_card(nav):
    rafael = m()["alunos"]["Rafael Moura"]
    c = abrir(nav, "card", "w13-dono", f"/painel/alunos/{rafael}", esperar="[data-card-proximos-compromissos]")
    ok = c.esperar(lambda: c.pg.locator("[data-compromisso]").count() > 0, 60)
    p.check(ok, "[card] Próximos compromissos com linhas")
    db = B.sql_principal(f"""select count(*)::int n from {S}.agendamentos where paciente_id = {q(rafael)} and deleted_at is null and fim >= now()
                              and status not in ('desmarcado','paciente_desmarcou','nao_compareceu')""")[0]["n"]
    n = c.pg.locator("[data-compromisso]").count()
    p.check(n == min(db, 4), f"[card] linhas = banco ({n} × {min(db, 4)})")
    txt = c.pg.locator("[data-card-proximos-compromissos]").inner_text()
    p.check("Consulta de nutrição" in txt and "NUTRI" in txt and "Camila" in txt, "[card] a consulta da Camila aparece para o Lucas (tela 7)")
    p.check("Restam 6 de 6" in txt or "Restam" in txt, f"[card] o pacote ({txt.split('Restam')[-1][:30] if 'Restam' in txt else '-'})")
    c.pg.locator("[data-card-proximos-compromissos]").scroll_into_view_if_needed()
    c.print("tela7_compromissos")
    c.pg.locator("[data-card-compromissos-agendar]").click()
    p.check(c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]'), 40), "[card] 'Agendar' abriu o novo agendamento na Agenda")
    p.check(c.pg.locator("[data-campo-paciente]").get_attribute("data-campo-paciente") == rafael, "[card] já com o Rafael")
    p.check("aluno=" not in c.caminho(), "[card] a URL limpou o atalho")
    c.fim()


@caso
def caso_fluxo(nav):
    rafael = m()["alunos"]["Rafael Moura"]
    c = abrir(nav, "fluxo", "w13-nutri", f"/painel/alunos/{rafael}", esperar="[data-card-fluxo-consulta]")
    href = c.pg.locator('[data-atalho="agendar"]').get_attribute("href")
    p.check(href == f"/painel/agenda?aluno={rafael}&novo=1", f"[fluxo] o atalho 'Agendar' da W14 vai para a Agenda nova ({href})")
    c.pg.locator('[data-atalho="agendar"]').click()
    p.check(c.esperar(lambda: c.tem('[data-modal-agendamento="novo"]'), 40), "[fluxo] abriu o novo agendamento")
    p.check(c.pg.locator("[data-campo-paciente]").get_attribute("data-campo-paciente") == rafael, "[fluxo] com o Rafael")
    p.check(c.pg.locator("[data-campo-tipo]").get_attribute("data-campo-tipo") == "nutricao", "[fluxo] tipo NUTRIÇÃO (a nutri agenda)")
    c.fim()


@caso
def caso_membro(nav):
    c = abrir(nav, "membro", "w13-nutri", "/painel/agenda")
    c.esperar(lambda: c.tem("[data-resumo-agenda][data-hoje]"), 60)
    lucas_ids = {r["id"] for r in B.sql_principal(f"select id::text from {S}.agendamentos where nutricionista_id = {q(m()['lucas'])} and deleted_at is null")}
    vistos = set(c.pg.locator("[data-evento], [data-hoje-evento]").evaluate_all("els => els.map(e => e.dataset.evento || e.dataset.hojeEvento)"))
    p.check(bool(vistos) and not (vistos & lucas_ids), f"[membro] a Camila vê só as dela ({len(vistos)} vistas, nenhuma do Lucas)")
    n = c.pg.locator("[data-resumo-agenda]").get_attribute("data-hoje")
    db = B.sql_principal(f"""select count(*)::int n from {S}.agendamentos where nutricionista_id = {q(m()['camila'])} and deleted_at is null and not dia_inteiro
                              and status not in ('desmarcado','paciente_desmarcou') and timezone('America/Sao_Paulo', inicio)::date = timezone('America/Sao_Paulo', now())::date""")[0]["n"]
    p.check(n == str(db), f"[membro] Consultas hoje = as dela ({n} × {db})")
    c.print("membro_nutri")
    c.fim()
    a = abrir(nav, "membro_aluno", "w13-aluno", "/painel/agenda", esperar="body")
    a.esperar(lambda: not a.caminho().startswith("/painel"), 30)
    p.check(not a.tem("[data-pagina-agenda-painel]"), f"[membro] o aluno não abre a agenda do painel ({a.caminho()})")
    a.fim()


@caso
def caso_rotas(nav):
    rafael = m()["alunos"]["Rafael Moura"]
    c = abrir(nav, "rotas", "w13-dono", f"/agenda?paciente={rafael}", esperar='[data-modal-agendamento="novo"]')
    p.check(c.caminho().startswith("/painel/agenda"), f"[rotas] /agenda?paciente= → /painel/agenda ({c.caminho()})")
    p.check(c.pg.locator("[data-campo-paciente]").get_attribute("data-campo-paciente") == rafael, "[rotas] o link antigo abre o novo agendamento com o aluno")
    c.fim()


# ───────────────────────── app do aluno ─────────────────────────

@caso
def caso_aluno(nav):
    criada = ESTADO.get("criada") or (B.sql_principal(f"""select id::text from {S}.agendamentos where paciente_id = {q(m()['alunos']['Rafael Moura'])} and nutricionista_id = {q(m()['lucas'])}
                                                        and status = 'agendado' and inicio > now() and deleted_at is null order by inicio limit 1""") or [{}])[0].get("id")
    p.check(bool(criada), "[aluno] a consulta que o Lucas marcou (caso criar)")
    nutri = B.sql_principal(f"""select id::text from {S}.agendamentos where paciente_id = {q(m()['alunos']['Rafael Moura'])} and nutricionista_id = {q(m()['camila'])}
                                 and inicio > now() and deleted_at is null order by inicio limit 1""")[0]["id"]
    c = B.abrir_app(nav, ESTADO["base"], ESTADO["prefixo"], "aluno", "w13-aluno", "/perfil/agenda", esperar="[data-pagina-agenda]")
    ok = c.esperar(lambda: c.tem("[data-agenda-confirmar]"), 60)
    p.check(ok, "[aluno] 'Confirme sua consulta' (a consulta marcada pelo profissional pede a resposta)")
    p.check(c.pg.locator("[data-agenda-confirmar]").get_attribute("data-agenda-confirmar") == nutri, "[aluno] a mais perto: a da Camila")
    p.check(c.tem("[data-cartao-pacote]"), "[aluno] o card do pacote")
    p.check("Restam 6 de 6" in c.pg.locator("[data-cartao-pacote]").inner_text(), "[aluno] pacote: restam 6 de 6")
    c.print("app_agenda")
    t0 = dt.datetime.now(dt.timezone.utc).isoformat()
    c.pg.locator("[data-destaque-confirmar]").click()
    conf = B.esperar(lambda: B.sql_principal(f"select 1 from {S}.agendamentos where id = {q(nutri)} and status = 'paciente_confirmou' and aluno_respondeu_em is not null"), 20)
    p.check(bool(conf), "[aluno] CONFIRMOU (paciente_confirmou)")
    av = B.esperar(lambda: B.sql_principal(f"select titulo from {S}.avisos where destino_user_id = {q(m()['camila'])} and criado_em >= {q(t0)} and titulo like '%confirmou%'"), 20)
    p.check(bool(av), f"[aluno] o sino da Camila: {av[0]['titulo'] if av else '-'}")
    if not criada:
        c.fim()
        return
    # a consulta pendente tem os botões no cartão "Confirme sua consulta"; as outras, na linha da lista
    c.esperar(lambda: c.tem(f'[data-agenda-confirmar="{criada}"]') or c.tem(f'[data-btn-reagendar="{criada}"]'), 30)
    if c.tem(f'[data-agenda-confirmar="{criada}"]'):
        p.check(not c.tem(f'[data-btn-reagendar="{criada}"]'), "[aluno] a do destaque não repete os botões na lista")
        c.pg.locator("[data-destaque-reagendar]").click()
    else:
        c.pg.locator(f'[data-btn-reagendar="{criada}"]').click()
    c.esperar(lambda: c.tem("[data-mensagem-reagendar]"), 20)
    msg = c.pg.locator("[data-mensagem-reagendar]").inner_text()
    mes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][B.hoje().month - 1]
    p.check(f"Você só pode reagendar 1 vez neste mês" in msg and f"Se não puder comparecer na nova data, você não terá outra consulta em {mes}" in msg,
            f"[aluno] a mensagem clara do pedido ({msg[:160]})")
    p.check("Seu pacote: restam 6 de 6 consultas" in msg, "[aluno] a mensagem traz o pacote")
    c.esperar(lambda: c.pg.locator("[data-dia-livre]").count() > 0, 40)
    dias = c.pg.locator("[data-dia-livre]").evaluate_all("els => els.map(e => e.dataset.diaLivre)")
    p.check(all(d[:7] == B.hoje().isoformat()[:7] for d in dias), f"[aluno] só dias do mês da consulta ({dias[0]}…{dias[-1]})")
    p.check(all(dt.date.fromisoformat(d).weekday() != 6 for d in dias), "[aluno] nenhum domingo (dia sem atendimento)")
    horas = c.pg.locator("[data-horario-livre]").evaluate_all("els => els.map(e => e.dataset.horarioLivre)")
    p.check("12:00" not in horas and "12:30" not in horas and "11:30" not in horas, f"[aluno] sem o almoço travado nem slot que o invade (consulta de 1 h) ({horas[:8]})")
    p.check(all("07:00" <= h <= "18:00" for h in horas), "[aluno] só dentro do atendimento")
    c.print("app_reagendar")
    alvo_dia = dias[min(1, len(dias) - 1)]
    c.pg.locator(f'[data-dia-livre="{alvo_dia}"]').click()
    c.pg.wait_for_timeout(300)
    hora = c.pg.locator("[data-horario-livre]").first.get_attribute("data-horario-livre")
    c.pg.locator("[data-horario-livre]").first.click()
    c.pg.locator("[data-reagendar-confirmar]").click()
    r = B.esperar(lambda: B.sql_principal(f"""select reagendamentos, status, mes_referencia::text as mes, timezone('America/Sao_Paulo', inicio)::text as ini,
                                                   extract(epoch from fim - inicio)::int as dur from {S}.agendamentos where id = {q(criada)} and reagendamentos = 1"""), 20)
    p.check(bool(r) and r[0]["status"] == "paciente_confirmou" and r[0]["dur"] == 3600 and r[0]["ini"].startswith(f"{alvo_dia} {hora}"),
            f"[aluno] REAGENDOU para {alvo_dia} {hora} (1 h mantida, confirmada) ({r[0] if r else '-'})")
    p.check(bool(r) and r[0]["mes"] == B.hoje().replace(day=1).isoformat(), "[aluno] o mês da consulta não muda (pacote e janela)")
    c.esperar(lambda: not c.tem("[data-sheet-reagendar]"), 15)
    c.esperar(lambda: c.tem(f'[data-btn-reagendar="{criada}"]'), 30)
    c.pg.locator(f'[data-btn-reagendar="{criada}"]').click()
    c.esperar(lambda: c.tem("[data-sheet-reagendar]"), 20)
    p.check(c.pg.locator("[data-sheet-reagendar]").get_attribute("data-pode") == "0" and "Você já usou o seu reagendamento" in c.pg.locator("[data-mensagem-reagendar]").inner_text(),
            "[aluno] 2º reagendamento: não deixa e explica")
    c.pg.keyboard.press("Escape")
    c.pg.wait_for_timeout(500)
    c.pg.locator(f'[data-btn-desistir="{criada}"]').click()
    c.esperar(lambda: c.tem("[data-mensagem-desistir]"), 20)
    md = c.pg.locator("[data-mensagem-desistir]").inner_text()
    p.check(f"A consulta de {mes} conta como usada: ficam 5 de 6 no seu pacote" in md and "Isso não pode ser desfeito" in md, f"[aluno] o aviso do que perde ({md[:150]})")
    c.print("app_desistir")
    c.pg.locator("[data-desistir-confirmar]").click()
    d = B.esperar(lambda: B.sql_principal(f"select 1 from {S}.agendamentos where id = {q(criada)} and status = 'paciente_desmarcou'"), 20)
    p.check(bool(d), "[aluno] DESISTIU (paciente_desmarcou)")
    ok = c.esperar(lambda: "Restam 5 de 6" in c.pg.locator("[data-cartao-pacote]").inner_text(), 30)
    p.check(ok, "[aluno] o pacote passou a 5 de 6 (a do mês não volta — default B)")
    c.pg.locator(f'[data-btn-marcar="{m()["lucas"]}"]').click()
    c.esperar(lambda: c.pg.locator("[data-dia-livre]").count() > 0, 40)
    dias_m = c.pg.locator("[data-dia-livre]").evaluate_all("els => els.map(e => e.dataset.diaLivre)")
    p.check(all(dd[:7] != B.hoje().isoformat()[:7] for dd in dias_m), f"[aluno] Marcar: o mês já usado não aparece ({dias_m[0]}…)")
    c.pg.locator("[data-horario-livre]").first.click()
    c.print("app_marcar")
    c.pg.locator("[data-marcar-confirmar]").click()
    nova = B.esperar(lambda: B.sql_principal(f"""select id::text, origem, status, extract(epoch from fim - inicio)::int as dur, mes_referencia::text as mes from {S}.agendamentos
                                                where paciente_id = {q(m()['alunos']['Rafael Moura'])} and origem = 'aluno' and deleted_at is null"""), 20)
    p.check(bool(nova) and nova[0]["status"] == "paciente_confirmou" and nova[0]["dur"] == 1800, f"[aluno] MARCOU 1 slot de 30 min ({nova[0] if nova else '-'})")
    if nova:
        ESTADO["marcada"] = nova[0]["id"]
    c.fim()


@caso
def caso_aviso(nav):
    # uma consulta que o Lucas marca (esperando o Rafael) — o aviso é só dela
    dia = dia_util(9)
    ini = B.sp(dia, "16:00")
    pend = B.sql_principal(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo, conta_id)
                               values ({q(m()['lucas'])}, {q(m()['cal_lucas'])}, {q(m()['alunos']['Rafael Moura'])}, 'Retorno', {q(ini)}, {q(ini)}::timestamptz + interval '30 minutes',
                                       'agendado', 'a_confirmar', 'treino', {q(m()['conta'])}) returning id::text as id""")[0]["id"]
    c = B.abrir_app(nav, ESTADO["base"], ESTADO["prefixo"], "aviso", "w13-aluno", "/", esperar="[data-aba-inicio]")
    ok = c.esperar(lambda: "para confirmar" in c.texto(), 30)
    p.check(ok, "[aviso] ao abrir o app, o aviso da consulta para confirmar (toast; no APK, a notificação local)")
    avisadas = c.pg.evaluate("localStorage.getItem('physiq_consultas_avisadas')") or ""
    p.check(len(avisadas) > 4, "[aviso] guardou as já avisadas neste aparelho")
    c.print("app_aviso")
    c.ir("/perfil")
    c.pg.wait_for_timeout(1500)
    c.ir("/")
    c.esperar(lambda: c.tem("[data-aba-inicio]"), 30)
    c.pg.wait_for_timeout(4000)
    p.check(c.pg.locator("[data-sonner-toast]").filter(has_text="para confirmar").count() == 0, "[aviso] não repete na volta (1 vez por consulta)")
    p.check(pend in avisadas, "[aviso] a consulta avisada é a nova")
    c.fim()
    B.sql_principal(f"delete from {S}.agendamentos where id = {q(pend)}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    a = ap.parse_args()
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    ESTADO["massa"] = B.massa()
    assert ESTADO["massa"].get("conta"), "rode antes: python3 e2e/w20/massa.py"
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
    print(f"\nW20 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
