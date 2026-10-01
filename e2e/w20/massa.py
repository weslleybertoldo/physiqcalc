#!/usr/bin/env python3
"""Physiq W20 — massa da Agenda na "Consultoria Ferreira W13" (STAGING; só contas de teste) — os nomes e horários da tela 6:

  Lucas Ferreira (dono + personal): calendário "Consultório" (padrão), regras (slot de 30 min, 07:00–19:00, seg–sáb, 1 reagendamento
    só no mês, desistência liberada) e a trava recorrente do almoço (12:00–13:00, todo dia).
  Camila Rocha (nutricionista): calendário "Nutrição" (padrão), regras padrão.
  Hoje: 07:00 Diego Souza · Avaliação física (TREINO) · 09:30 Marina Alves · Retorno (NUTRI) · 11:00 João Pedro · Troca de treino
    (TREINO) · 14:00 Beatriz Lima · Primeira consulta (NUTRI) · 18:00 Carlos Souza · Avaliação física (TREINO).
  As 7 semanas anteriores: consultas com status variados (o gráfico "Consultas por semana"); a próxima: a "Consulta de nutrição" do
    Rafael com a Camila (esperando ele confirmar) e a "Avaliação física" com o Lucas.
  Pacote: Rafael × Lucas, 6 consultas a partir deste mês.

Tudo o que é criado fica em ~/projetos/physiqcalc-scratch/w20/massa_staging.json; `--limpar` apaga só isso (e os avisos que a massa
gerou). Rodar de novo = limpa e recria.

Uso: python3 e2e/w20/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
q = B.q
ALUNOS = ["Rafael Moura", "Marina Alves", "João Pedro", "Beatriz Lima", "Carlos Souza", "Diego Souza"]


def ids() -> dict:
    conta = B.conta_de("w13-dono", B.NOME_CONTA)
    assert conta, "a conta W13 não existe no staging (rode e2e/w13/massa.py)"
    alunos = {r["nome"]: r["id"] for r in B.sql_principal(
        f"select nome, id::text from {S}.pacientes where conta_id = '{conta}' and deleted_at is null and nome in ({', '.join(q(a) for a in ALUNOS)})")}
    falta = [a for a in ALUNOS if a not in alunos]
    assert not falta, f"alunos da tela 6 faltando na conta W13: {falta}"
    return {"conta": conta, "lucas": B.uid("w13-dono"), "camila": B.uid("w13-nutri"), "bruno": B.uid("w13-personal2"), "rafael_user": B.uid("w13-aluno"), "alunos": alunos}


def limpar() -> None:
    if not B.MASSA.exists():
        return
    m = B.massa()
    ags = m.get("agendamentos", [])
    cals = m.get("calendarios", [])
    if ags:
        B.sql_principal(f"delete from {S}.mensagens_whatsapp where agendamento_id in ({', '.join(q(a) for a in ags)})")
        B.sql_principal(f"delete from {S}.agendamentos where id in ({', '.join(q(a) for a in ags)})")
    if cals:
        B.sql_principal(f"delete from {S}.agendamentos where calendario_id in ({', '.join(q(c) for c in cals)})")
        B.sql_principal(f"delete from {S}.bloqueios_agenda where calendario_id in ({', '.join(q(c) for c in cals)})")
        B.sql_principal(f"delete from {S}.calendarios where id in ({', '.join(q(c) for c in cals)})")
    for t in m.get("travas", []):
        B.sql_principal(f"delete from {S}.agenda_travas where id = {q(t)}")
    for pk in m.get("pacotes", []):
        B.sql_principal(f"delete from {S}.agenda_pacotes where id = {q(pk)}")
    for prof in m.get("configs", []):
        B.sql_principal(f"delete from {S}.agenda_config where profissional_id = {q(prof)}")
    if m.get("desde") and m.get("avisados"):
        B.sql_principal(f"""delete from {S}.avisos where tipo = 'consulta_marcada' and criado_em >= {q(m['desde'])}
                             and destino_user_id in ({', '.join(q(u) for u in m['avisados'])})""")
    B.MASSA.unlink()


def inserir(sql: str) -> str:
    return B.sql_principal(sql + " returning id::text as id")[0]["id"]


def criar() -> dict:
    i = ids()
    conta, lucas, camila = i["conta"], i["lucas"], i["camila"]
    al = i["alunos"]
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    m: dict = {"desde": agora, "conta": conta, "agendamentos": [], "calendarios": [], "travas": [], "pacotes": [], "configs": [lucas, camila],
               "avisados": [i["rafael_user"]], "lucas": lucas, "camila": camila, "bruno": i["bruno"], "alunos": al}
    cal_l = inserir(f"insert into {S}.calendarios (nutricionista_id, nome, cor, padrao, conta_id, faixa_inicio, faixa_fim) values ({q(lucas)}, 'Consultório', '#a78bfa', true, {q(conta)}, '07:00', '20:00')")
    cal_c = inserir(f"insert into {S}.calendarios (nutricionista_id, nome, cor, padrao, conta_id, faixa_inicio, faixa_fim) values ({q(camila)}, 'Nutrição', '#34d399', true, {q(conta)}, '07:00', '20:00')")
    m["calendarios"] = [cal_l, cal_c]
    m["cal_lucas"], m["cal_camila"] = cal_l, cal_c
    B.sql_principal(f"""insert into {S}.agenda_config (profissional_id, slot_minutos, atende_inicio, atende_fim, dias, reagendamentos_max, janela_reagendamento, desistencia)
                        values ({q(lucas)}, 30, '07:00', '19:00', '{{1,2,3,4,5,6}}', 1, 'mes', true)
                        on conflict (profissional_id) do update set slot_minutos = 30, atende_inicio = '07:00', atende_fim = '19:00', dias = '{{1,2,3,4,5,6}}',
                          reagendamentos_max = 1, janela_reagendamento = 'mes', desistencia = true""")
    B.sql_principal(f"delete from {S}.agenda_config where profissional_id = {q(camila)}")
    m["travas"].append(inserir(f"insert into {S}.agenda_travas (profissional_id, conta_id, hora_inicio, hora_fim, motivo) values ({q(lucas)}, {q(conta)}, '12:00', '13:00', 'Almoço')"))

    def ag(prof: str, cal: str, aluno: str | None, titulo: str, dia: dt.date, hora: str, minutos: int, status: str, modulo: str) -> str:
        conf = "confirmado" if status in ("confirmado", "paciente_confirmou") else "desmarcado" if status in ("desmarcado", "paciente_desmarcou") else "a_confirmar"
        ini = B.sp(dia, hora)
        fim = (dt.datetime.fromisoformat(ini) + dt.timedelta(minutes=minutos)).isoformat()
        pid = q(al[aluno]) if aluno else "null"
        return inserir(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo, conta_id)
                            values ({q(prof)}, {q(cal)}, {pid}, {q(titulo)}, {q(ini)}, {q(fim)}, {q(status)}, {q(conf)}, {q(modulo)}, {q(conta)})""")

    h = B.hoje()
    hojes = [
        (lucas, cal_l, "Diego Souza", "Avaliação física", "07:00", 60, "paciente_confirmou", "treino"),
        (camila, cal_c, "Marina Alves", "Retorno", "09:30", 30, "confirmado", "nutricao"),
        (lucas, cal_l, "João Pedro", "Troca de treino", "11:00", 30, "agendado", "treino"),
        (camila, cal_c, "Beatriz Lima", "Primeira consulta", "14:00", 60, "agendado", "nutricao"),
        (lucas, cal_l, "Carlos Souza", "Avaliação física", "18:00", 60, "confirmado", "treino"),
    ]
    for prof, cal, aluno, titulo, hora, mins, status, mod in hojes:
        m["agendamentos"].append(ag(prof, cal, aluno, titulo, h, hora, mins, status, mod))
    # 7 semanas para trás: 2 a 5 por semana (o gráfico), status variados
    seg = h - dt.timedelta(days=h.weekday())
    padrao = [
        [("Rafael Moura", "treino", "paciente_confirmou"), ("Marina Alves", "nutricao", "confirmado"), ("João Pedro", "treino", "nao_compareceu")],
        [("Beatriz Lima", "nutricao", "paciente_confirmou"), ("Carlos Souza", "treino", "confirmado")],
        [("Rafael Moura", "nutricao", "confirmado"), ("Diego Souza", "treino", "agendado"), ("Marina Alves", "nutricao", "paciente_confirmou"), ("João Pedro", "treino", "confirmado")],
        [("Beatriz Lima", "nutricao", "desmarcado"), ("Carlos Souza", "treino", "paciente_confirmou"), ("Rafael Moura", "treino", "confirmado")],
        [("Marina Alves", "nutricao", "confirmado"), ("João Pedro", "treino", "paciente_confirmou"), ("Diego Souza", "treino", "agendado"), ("Beatriz Lima", "nutricao", "confirmado"), ("Carlos Souza", "treino", "confirmado")],
        [("Rafael Moura", "treino", "paciente_confirmou"), ("Marina Alves", "nutricao", "agendado"), ("João Pedro", "treino", "confirmado")],
        [("Beatriz Lima", "nutricao", "paciente_confirmou"), ("Carlos Souza", "treino", "confirmado"), ("Rafael Moura", "nutricao", "paciente_confirmou"), ("Diego Souza", "treino", "nao_compareceu")],
    ]
    for semana, lista in enumerate(padrao, start=1):
        base = seg - dt.timedelta(days=7 * (8 - semana))
        for n, (aluno, mod, status) in enumerate(lista):
            prof, cal = (camila, cal_c) if mod == "nutricao" else (lucas, cal_l)
            titulo = "Retorno" if mod == "nutricao" else "Avaliação física"
            m["agendamentos"].append(ag(prof, cal, aluno, titulo, base + dt.timedelta(days=n % 6), ["08:00", "09:30", "11:00", "14:00", "16:30"][n], 60 if mod == "treino" else 30, status, mod))
    # as próximas do Rafael: a consulta de nutrição (esperando ele) e a avaliação física (tela 7 · "Próximos compromissos")
    dia_nutri = h + dt.timedelta(days=2 if h.weekday() < 5 else 3)
    m["agendamentos"].append(ag(camila, cal_c, "Rafael Moura", "Consulta de nutrição", dia_nutri, "10:00", 60, "agendado", "nutricao"))
    # a avaliação física com o Lucas no mês que vem (1ª quarta): neste mês, o pacote do Rafael fica só com a consulta que o E2E marca
    prox = (h.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
    quarta = prox + dt.timedelta(days=(2 - prox.weekday()) % 7)
    m["agendamentos"].append(ag(lucas, cal_l, "Rafael Moura", "Avaliação física", quarta, "07:00", 60, "confirmado", "treino"))
    # pacote Rafael × Lucas: 6 consultas a partir deste mês
    m["pacotes"].append(inserir(f"""insert into {S}.agenda_pacotes (paciente_id, profissional_id, conta_id, total, mes_inicio, criado_por)
                                    values ({q(al['Rafael Moura'])}, {q(lucas)}, {q(conta)}, 6, date_trunc('month', timezone('America/Sao_Paulo', now()))::date, {q(lucas)})"""))
    return m


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    limpar()
    if a.limpar:
        print("massa W20 apagada")
        return 0
    m = criar()
    B.gravar_massa(m)
    print(f"massa W20: {len(m['agendamentos'])} agendamentos, {len(m['calendarios'])} calendários, {len(m['travas'])} trava, {len(m['pacotes'])} pacote")
    return 0


if __name__ == "__main__":
    sys.exit(main())
