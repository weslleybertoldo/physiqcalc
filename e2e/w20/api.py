#!/usr/bin/env python3
"""Physiq W20 — E2E de API da agenda (STAGING; contas de teste; o login de verdade de cada pessoa — auth.uid() e políticas reais).

Positivo:
  · slots do banco: só no atendimento e nos dias, sem travas/bloqueios/ocupados; o aluno recebe só os livres;
  · e-mail ao aluno (agenda-avisar): sai 1 vez; a 2ª em 10 minutos volta "repetido" (o sino já avisou);
  · WhatsApp: a confirmação ao agendar do PERSONAL entra na fila quando ligada (WhatsApp conectado + momento ligado + ajuste do
    aluno ligado) e não entra com o ajuste desligado — numa transação DESFEITA (nada fica na fila, nada é enviado).
Negativo:
  · aluno: confirmar/reagendar a consulta de outro (agendamento_inexistente), horário travado/ocupado (horario_ocupado), domingo
    (horario_invalido), fora da janela (fora_da_janela), marcar sem pacote (sem_pacote), desistir com a desistência desligada;
  · profissional: horários do calendário de outro (sem_acesso — personal e nutri não donos); e-mail da consulta de outro (sem_acesso);
    pacote de aluno de quem não é responsável (nao_responsavel/sem_acesso); ler as regras de outro membro (só o dono lê).

Uso: python3 e2e/w20/api.py   (antes: python3 e2e/w20/massa.py)
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.q


def dia_util(dias: int) -> dt.date:
    d = B.hoje() + dt.timedelta(days=dias)
    while d.weekday() == 6:
        d += dt.timedelta(days=1)
    return d


def main() -> int:
    m = B.massa()
    assert m.get("conta"), "rode antes: python3 e2e/w20/massa.py"
    B.saude_ok("api")
    rafael = m["alunos"]["Rafael Moura"]
    lucas, camila = m["lucas"], m["camila"]
    criadas: list[str] = []
    try:
        # uma consulta do Lucas para o Rafael neste mês (o que o painel faz)
        dia = dia_util(4)
        ini = B.sp(dia, "10:00")
        ag = B.sql_principal(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo, conta_id)
                                 values ({q(lucas)}, {q(m['cal_lucas'])}, {q(rafael)}, 'Consulta API W20', {q(ini)}, {q(ini)}::timestamptz + interval '1 hour',
                                         'agendado', 'a_confirmar', 'treino', {q(m['conta'])}) returning id::text as id""")[0]["id"]
        criadas.append(ag)
        # ── slots (painel) ──
        st, r = B.rpc_como("w13-dono", "agenda_horarios", {"p_calendario": m["cal_lucas"], "p_de": dia.isoformat(), "p_ate": dia.isoformat()})
        est = {s["inicio"][11:16]: s["estado"] for s in (r.get("slots") or [])} if isinstance(r, dict) else {}
        hora = lambda hh: (dt.datetime.fromisoformat(B.sp(dia, hh)).astimezone(dt.timezone.utc)).isoformat()[11:16]  # noqa: E731
        p.check(st == 200 and est.get(hora("12:00")) == "travado" and est.get(hora("10:00")) == "ocupado" and est.get(hora("09:00")) == "livre",
                f"[api] agenda_horarios do Lucas: livre/ocupado/travado ({est.get(hora('09:00'))}, {est.get(hora('10:00'))}, {est.get(hora('12:00'))})")
        p.check(hora("06:30") not in est and hora("19:00") not in est, "[api] nenhum slot fora do atendimento (07:00–19:00)")
        st, r = B.rpc_como("w13-personal2", "agenda_horarios", {"p_calendario": m["cal_lucas"], "p_de": dia.isoformat(), "p_ate": dia.isoformat()})
        p.check(isinstance(r, dict) and r.get("erro") == "sem_acesso", f"[api] negativo: o Bruno (personal, não dono) não lê os horários do Lucas ({r})")
        st, r = B.rpc_como("w13-nutri", "agenda_horarios", {"p_calendario": m["cal_lucas"], "p_de": dia.isoformat(), "p_ate": dia.isoformat()})
        p.check(isinstance(r, dict) and r.get("erro") == "sem_acesso", "[api] negativo: a Camila (não dona) também não")
        st, r = B.rpc_como("w13-dono", "agenda_horarios", {"p_calendario": m["cal_camila"], "p_de": dia.isoformat(), "p_ate": dia.isoformat()})
        p.check(isinstance(r, dict) and r.get("ok") is True, "[api] o dono lê os horários da Camila (calendário da conta)")
        # ── regras de outro membro ──
        st, r = B.rest(B.token("w13-personal2"), "GET", "agenda_config", f"select=profissional_id&profissional_id=eq.{lucas}")
        p.check(st == 200 and r == [], "[api] negativo: o Bruno não lê as regras do Lucas")
        st, r = B.rest(B.token("w13-dono"), "GET", "agenda_config", f"select=profissional_id&profissional_id=eq.{lucas}")
        p.check(st == 200 and len(r) == 1, "[api] o Lucas lê as dele")
        # ── aluno ──
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_horarios", {"p_agendamento": ag, "p_de": dia.isoformat(), "p_ate": dia.isoformat()})
        livres = [h["inicio"][11:16] for h in (r.get("horarios") or [])] if isinstance(r, dict) else []
        p.check(st == 200 and hora("10:00") in livres and hora("12:00") not in livres and hora("11:30") not in livres,
                f"[api] o aluno recebe só os livres (a própria consulta não conflita; almoço fora) ({len(livres)} livres)")
        ultimo = (dia.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)
        p.check(isinstance(r, dict) and r.get("janela", {}).get("ate") == ultimo.isoformat(), f"[api] janela = só o mês da consulta ({r.get('janela') if isinstance(r, dict) else '-'})")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_reagendar", {"p_agendamento": ag, "p_inicio": B.sp(dia, "12:00")})
        p.check(isinstance(r, dict) and r.get("erro") == "horario_ocupado", f"[api] negativo: reagendar no almoço travado ({r})")
        domingo = B.hoje() + dt.timedelta(days=(6 - B.hoje().weekday()) % 7 or 7)
        if domingo.month == B.hoje().month:
            st, r = B.rpc_como("w13-aluno", "aluno_agenda_reagendar", {"p_agendamento": ag, "p_inicio": B.sp(domingo, "10:00")})
            p.check(isinstance(r, dict) and r.get("erro") == "horario_invalido", f"[api] negativo: domingo (sem atendimento) ({r})")
        prox_mes = (B.hoje().replace(day=1) + dt.timedelta(days=32)).replace(day=1) + dt.timedelta(days=2)
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_reagendar", {"p_agendamento": ag, "p_inicio": B.sp(prox_mes, "10:00")})
        p.check(isinstance(r, dict) and r.get("erro") == "fora_da_janela", f"[api] negativo: mês seguinte com a janela 'só no mês' ({r})")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_marcar", {"p_profissional": camila, "p_inicio": B.sp(dia, "15:00")})
        p.check(isinstance(r, dict) and r.get("erro") == "sem_pacote", f"[api] negativo: marcar com a Camila sem pacote ({r})")
        outra = B.sql_principal(f"""select id::text from {S}.agendamentos where paciente_id <> {q(rafael)} and nutricionista_id = {q(lucas)} and deleted_at is null and inicio > now() limit 1""")
        if outra:
            st, r = B.rpc_como("w13-aluno", "aluno_agenda_confirmar", {"p_agendamento": outra[0]["id"]})
            p.check(st >= 400 and "agendamento_inexistente" in str(r), f"[api] negativo: confirmar a consulta de outro aluno ({st})")
        B.sql_principal(f"update {S}.agenda_config set desistencia = false where profissional_id = {q(lucas)}")
        st, r = B.rpc_como("w13-aluno", "aluno_agenda_desistir", {"p_agendamento": ag})
        p.check(isinstance(r, dict) and r.get("erro") == "desistencia_desligada", f"[api] negativo: desistir com a desistência desligada ({r})")
        B.sql_principal(f"update {S}.agenda_config set desistencia = true where profissional_id = {q(lucas)}")
        # ── pacote ──
        st, r = B.rpc_como("w13-personal2", "aluno_definir_pacote", {"p_aluno": rafael, "p_profissional": lucas, "p_total": 3})
        p.check(st >= 400 or (isinstance(r, dict) and r.get("ok") is False), f"[api] negativo: o Bruno não mexe no pacote do Rafael ({st})")
        st, r = B.rpc_como("w13-nutri", "aluno_definir_pacote", {"p_aluno": rafael, "p_profissional": lucas, "p_total": 3})
        p.check(isinstance(r, dict) and r.get("erro") == "sem_acesso", f"[api] negativo: a Camila não muda o pacote do Lucas ({r})")
        # ── e-mail (10 minutos) ──
        B.sql_principal(f"update {S}.agendamentos set aviso_email_em = null where paciente_id = {q(rafael)}")
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": ag})
        p.check(st == 200 and isinstance(r, dict) and r.get("email", {}).get("enviado") is True and r["email"].get("teste") is True,
                f"[api] agenda-avisar: o e-mail saiu (staging → caixa de teste) ({r.get('email') if isinstance(r, dict) else r})")
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": ag})
        p.check(st == 200 and isinstance(r, dict) and r.get("email", {}).get("motivo") == "repetido", "[api] 2ª vez em 10 min: 'repetido' (não manda de novo)")
        st, r = B.funcao_como("w13-personal2", "agenda-avisar", {"agendamento": ag})
        p.check(st == 403, f"[api] negativo: o Bruno não manda e-mail da consulta do Lucas ({st})")
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": "x"})
        p.check(st == 404, "[api] id inválido: 404")
        # ── WhatsApp do personal (transação desfeita) ──
        try:
            res = B.sql_principal(f"""
do $t$
declare n_sem int; n_com int; a uuid; amanha date := timezone('America/Sao_Paulo', now())::date + 1;
begin
  insert into {S}.whatsapp_instancias (nutricionista_id, status, numero_e164) values ({q(lucas)}, 'conectado', '+5500900009999');
  update {S}.profiles set config = coalesce(config, '{{}}'::jsonb) || '{{"whatsapp": {{"ativo": true, "momentos": {{"confirmacao_agendamento": true}}}}}}'::jsonb where id = {q(lucas)};
  insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id)
    values ({q(lucas)}, {q(m['cal_lucas'])}, {q(rafael)}, 'WA sem ajuste', (amanha + time '08:00') at time zone 'America/Sao_Paulo', (amanha + time '08:30') at time zone 'America/Sao_Paulo', 'treino', {q(m['conta'])}) returning id into a;
  select count(*) into n_sem from {S}.mensagens_whatsapp where agendamento_id = a;
  update {S}.pacientes set config = coalesce(config, '{{}}'::jsonb) || '{{"mensagens_automaticas": true}}'::jsonb where id = {q(rafael)};
  insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id)
    values ({q(lucas)}, {q(m['cal_lucas'])}, {q(rafael)}, 'WA com ajuste', (amanha + time '09:00') at time zone 'America/Sao_Paulo', (amanha + time '09:30') at time zone 'America/Sao_Paulo', 'treino', {q(m['conta'])}) returning id into a;
  select count(*) into n_com from {S}.mensagens_whatsapp where agendamento_id = a and tipo = 'confirmacao_agendamento' and status = 'pendente';
  raise exception 'RESULTADO %', jsonb_build_object('sem', n_sem, 'com', n_com);
end $t$;""")
        except RuntimeError as e:
            res = str(e)
        txt = str(res)
        p.check("\\\"sem\\\": 0" in txt and "\\\"com\\\": 1" in txt or ('"sem": 0' in txt and '"com": 1' in txt),
                f"[api] WhatsApp do personal: 0 com o ajuste desligado, 1 na fila com ele ligado (transação desfeita) ({txt[-90:]})")
        fila = B.sql_principal(f"select count(*)::int n from {S}.mensagens_whatsapp where created_at > now() - interval '10 minutes'")[0]["n"]
        p.check(fila == 0, "[api] nada ficou na fila do WhatsApp")
    finally:
        if criadas:
            B.sql_principal(f"delete from {S}.agendamentos where id in ({', '.join(q(c) for c in criadas)})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
