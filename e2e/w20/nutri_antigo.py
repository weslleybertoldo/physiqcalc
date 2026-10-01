#!/usr/bin/env python3
"""Physiq W20 — o site antigo do PhysiqNutri continua igual com as colunas e os gatilhos novos da agenda (as MESMAS tabelas):
  1. a nutri de teste (nutri.teste.claude, legado_nutri) grava uma consulta pelo REST com SÓ as colunas de lá (o que o
     AgendamentoDialog do site antigo manda) → 201; edita horário e status → 200; o mês da consulta acompanha a data; "Bloquear
     datas" → 201;
  2. a Agenda do site antigo (/agenda, visão semana) mostra a consulta e o bloqueio;
  3. o paciente de teste (criado pela nutri com acesso, como o smoke da W2) entra em /app/entrar e vê a consulta em /app/agenda; e o
     Physiq avisou no sino dele ("Consulta marcada") — o gatilho vale também para o que a nutri faz lá;
  4. a nutri apaga (soft delete, Lixeira) → some da agenda do paciente.
Tudo é apagado no fim (consulta, bloqueio, paciente, acesso, avisos). Paciente SEM telefone (nenhum WhatsApp).
Uso: python3 e2e/w20/nutri_antigo.py --url https://physiqnutri-staging.vercel.app --schema staging --prints <pasta>
     (produção: --url https://nutri.physiqcalc.com.br --schema public)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, http, login_principal, sql_principal  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

CHAVE_LS = f"sb-{PRINCIPAL_REF}-auth-token"
p = Placar()


def rest(metodo, caminho, token, schema, corpo=None):
    cab = {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": schema, "Content-Profile": schema, "Prefer": "return=representation"}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}{caminho}", corpo, cab)
    return st, r


def sp(d: dt.date, hhmm: str) -> str:
    h, m = (int(x) for x in hhmm.split(":"))
    return dt.datetime(d.year, d.month, d.day, h, m, tzinfo=dt.timezone(dt.timedelta(hours=-3))).astimezone(dt.timezone.utc).isoformat()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--schema", required=True, choices=["public", "staging"])
    ap.add_argument("--prints", required=True)
    a = ap.parse_args()
    url, S = a.url.rstrip("/"), a.schema
    prints = Path(a.prints).expanduser()
    prints.mkdir(parents=True, exist_ok=True)
    rot = "staging" if S == "staging" else "prod"
    sessao = login_principal("nutri", "nutri.teste.claude@physiqnutri.app")
    tn, nutri = sessao["access_token"], sessao["user"]["id"]
    hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()
    dia = hoje + dt.timedelta(days=3)
    pid = ag = bl = user_p = None
    erros: list[str] = []
    try:
        # paciente de teste com acesso (o fluxo do site antigo; e-mail único — trava da W16b; sem telefone)
        email_p = f"w20-antigo-{int(time.time())}.teste.claude@physiqnutri.app"
        senha_p = secrets.token_urlsafe(14)
        st, pac = rest("POST", "/rest/v1/pacientes", tn, S, {"nome": "Paciente Agenda W20", "nutricionista_id": nutri, "email": email_p})
        p.check(st == 201, f"1. nutri cria o paciente de teste ({S}) → {st}")
        pid = pac[0]["id"]
        st, _ = rest("POST", "/rest/v1/rpc/paciente_criar_acesso", tn, S, {"p_paciente_id": pid, "p_email": email_p, "p_senha": senha_p})
        p.check(st == 200, f"1. paciente_criar_acesso → {st}")
        user_p = sql_principal(f"select id::text from auth.users where email = '{email_p}'")[0]["id"]
        st, cals = rest("GET", f"/rest/v1/calendarios?select=id&nutricionista_id=eq.{nutri}&deleted_at=is.null&order=created_at.asc", tn, S)
        cal = cals[0]["id"]
        t0 = dt.datetime.now(dt.timezone.utc).isoformat()
        corpo = {"nutricionista_id": nutri, "calendario_id": cal, "paciente_id": pid, "titulo": "Consulta W20 (site antigo)", "inicio": sp(dia, "15:00"),
                 "fim": sp(dia, "16:00"), "dia_inteiro": False, "status": "agendado", "confirmacao": "a_confirmar", "observacao": None}
        st, r = rest("POST", "/rest/v1/agendamentos", tn, S, corpo)
        p.check(st == 201, f"1. a nutri grava a consulta com SÓ as colunas do site antigo → {st}")
        ag = r[0]["id"]
        p.check(r[0].get("reagendamentos") == 0 and r[0].get("origem") == "profissional" and r[0].get("mes_referencia") == dia.replace(day=1).isoformat(),
                f"1. as colunas novas nascem com o padrão (reagendamentos 0, origem profissional, mês {r[0].get('mes_referencia')})")
        novo = dia + dt.timedelta(days=1)
        st, r = rest("PATCH", f"/rest/v1/agendamentos?id=eq.{ag}", tn, S, {**corpo, "inicio": sp(novo, "16:00"), "fim": sp(novo, "17:00"), "status": "confirmado", "confirmacao": "confirmado"})
        p.check(st == 200 and r[0]["status"] == "confirmado" and r[0]["mes_referencia"] == novo.replace(day=1).isoformat(), f"1. edita horário e status → {st}")
        st, r = rest("POST", "/rest/v1/bloqueios_agenda", tn, S, {"nutricionista_id": nutri, "calendario_id": None, "inicio": sp(dia, "00:00"), "fim": sp(dia + dt.timedelta(days=1), "00:00"), "motivo": "Feriado W20"})
        p.check(st == 201, f"1. 'Bloquear datas' → {st}")
        bl = r[0]["id"] if st == 201 else None
        aviso = sql_principal(f"select titulo from {S}.avisos where destino_user_id = '{user_p}' and criado_em >= '{t0}' order by criado_em")
        p.check(any(x["titulo"].startswith("Consulta marcada") for x in aviso), f"3. o sino do paciente no Physiq: {[x['titulo'] for x in aviso]}")
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=["--no-sandbox"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860}, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: erros.append(f"pageerror: {str(e)[:160]}"))
            pg.goto(f"{url}/entrar/nutricionista", wait_until="domcontentloaded")
            pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS, json.dumps(sessao)])
            pg.goto(f"{url}/agenda?visao=semana&data={novo.isoformat()}", wait_until="domcontentloaded")
            try:
                pg.wait_for_selector(f'[data-evento="{ag}"]', timeout=45000)
                ok = True
            except Exception:  # noqa: BLE001
                ok = False
            p.check(ok, "2. a Agenda do site antigo mostra a consulta")
            pg.goto(f"{url}/agenda?visao=semana&data={dia.isoformat()}", wait_until="domcontentloaded")
            try:
                pg.wait_for_selector(f'[data-bloqueio="{bl}"]', timeout=45000)
                ok = True
            except Exception:  # noqa: BLE001
                ok = False
            p.check(ok, "2. e o bloqueio")
            pg.wait_for_timeout(800)
            pg.screenshot(path=str(prints / f"{rot}_nutri_antigo_agenda.png"))
            ctx2 = b.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pp = ctx2.new_page()
            pp.on("pageerror", lambda e: erros.append(f"pageerror(paciente): {str(e)[:160]}"))
            pp.goto(f"{url}/app/entrar", wait_until="domcontentloaded")
            pp.wait_for_selector("[data-pagina-entrar-paciente]", timeout=45000)
            pp.fill("[data-campo-entrar-email]", email_p)
            pp.fill("[data-campo-entrar-senha]", senha_p)
            pp.click("[data-btn-entrar-paciente]")
            pp.wait_for_selector("[data-app-inicio]", timeout=45000)
            pp.goto(f"{url}/app/agenda", wait_until="domcontentloaded")
            try:
                pp.wait_for_selector(f'[data-app-agendamento="{ag}"]', timeout=45000)
                ok = True
            except Exception:  # noqa: BLE001
                ok = False
            p.check(ok, "3. o paciente vê a consulta na Agenda dele (/app/agenda)")
            pp.screenshot(path=str(prints / f"{rot}_nutri_antigo_paciente_agenda.png"))
            st, _ = rest("PATCH", f"/rest/v1/agendamentos?id=eq.{ag}", tn, S, {"deleted_at": dt.datetime.now(dt.timezone.utc).isoformat()})
            p.check(st == 200, f"4. a nutri apaga a consulta (Lixeira) → {st}")
            pp.reload(wait_until="domcontentloaded")
            pp.wait_for_selector("[data-app-agenda]", timeout=45000)
            pp.wait_for_timeout(2500)
            p.check(pp.locator(f'[data-app-agendamento="{ag}"]').count() == 0, "4. some da agenda do paciente")
            ctx2.close()
            ctx.close()
            b.close()
    finally:
        if ag:
            sql_principal(f"delete from {S}.agendamentos where id = '{ag}'")
        if bl:
            rest("DELETE", f"/rest/v1/bloqueios_agenda?id=eq.{bl}", tn, S)
        if user_p:
            sql_principal(f"delete from {S}.avisos where destino_user_id = '{user_p}'")
        if pid:
            rest("POST", "/rest/v1/rpc/paciente_remover_acesso", tn, S, {"p_paciente_id": pid})
            st, _ = rest("DELETE", f"/rest/v1/pacientes?id=eq.{pid}", tn, S)
            p.check(st in (200, 204), f"limpeza: paciente de teste apagado → {st}")
    p.check(not erros, f"sem erro de página ({erros[:3]})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
