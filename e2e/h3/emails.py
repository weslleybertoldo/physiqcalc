#!/usr/bin/env python3
"""Physiq H3 — E2E dos e-mails no molde C: envio REAL pelas 4 funções publicadas, SEMPRE para a caixa de teste do Resend
(delivered@resend.dev — só contas *.teste.claude@physiqnutri.app, P26; nenhuma pessoa real recebe nada).

STAGING (padrão) — Consultoria Ferreira W13 (massa da W20: Lucas dono+personal, Camila nutri, Bruno 2º personal, Rafael aluno
com login e sem aparelho de push):
  agenda-avisar  1 consulta esperando o aluno → "Confirmar presença" + "Reagendar" + "Ver minha agenda"; a 2ª em 10 min =
                 "repetido"; o Bruno (não é dono da agenda) = 403 · 3 consultas num e-mail = 3 blocos · 1 já confirmada e já
                 reagendada → só "Ver minha agenda"
  aluno-enviar   Camila → dieta ("Ver minha dieta") · Lucas → treino ("Ver meu treino")
  convites       Lucas convida h3.equipe.<n>.teste.claude como nutricionista (e cancela)
  alunos         Lucas convida h3.aluno.<n>.teste.claude para o treino (e cancela)
PRODUÇÃO (--prod) — a nutri do site antigo (nutri.teste.claude, conta legado_nutri) + um ALUNO DESCARTÁVEL de teste criado por
ela (com acesso, sem telefone): a consulta (agenda-avisar) e o plano alimentar (aluno-enviar).

Cada e-mail: o Resend aceitou (id), remetente "Physiq <convites@physiqcalc.com.br>", para delivered@resend.dev, assunto com
"[teste → …]", HTML no molde (ícones do bucket "email", sem SVG, links do site do ambiente) e o status "delivered". O HTML
fica em ~/projetos/physiqcalc-scratch/h3/emails/<staging|prod>/ com o indice.json (entrada do render_h3.py).
No fim tudo volta: consultas, avisos, convites e o aluno descartável são apagados; o aviso_email_em das consultas do Rafael
volta ao que era; contagens iguais antes e depois. /health do Treino antes de cada bloco (E2E em série).

Uso: RESEND_API_KEY=<chave da conta B Code> python3 e2e/h3/emails.py [--prod]
"""
from __future__ import annotations

import datetime as dt
import json
import os
import secrets
import sys
import time
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent.parent / "w20"))
import _base as B  # noqa: E402

PROD = "--prod" in sys.argv[1:]
S = "public" if PROD else "staging"
B.ESTADO["schema"] = S
p = B.p
q = B.q
SITE = "https://physiqcalc.com.br" if PROD else "https://physiqcalc-staging.vercel.app"
REMETENTE = "Physiq <convites@physiqcalc.com.br>"
CAIXA = "delivered@resend.dev"
IMAGENS = "https://api-principal.physiqcalc.com.br/storage/v1/object/public/email/v1/"
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "h3" / "emails" / ("prod" if PROD else "staging")
TABELAS = ["agendamentos", "avisos", "convites", "conta_eventos", "pacientes", "mensagens_whatsapp", "push_envios"]
CHAVE = os.environ.get("RESEND_API_KEY", "")
INDICE: dict[str, dict] = {}


def sql(s: str) -> list:
    return B.sql_principal(s)


def contagens() -> dict:
    return sql("select " + ", ".join(f"(select count(*) from {S}.{t})::int as {t}" for t in TABELAS))[0]


def resend(id_: str) -> dict:
    req = urllib.request.Request(f"https://api.resend.com/emails/{id_}", headers={"Authorization": f"Bearer {CHAVE}", "User-Agent": "physiq-unificado/1.0 (e2e h3)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def conferir_email(nome: str, id_: str | None, assunto: str, tem: list[str], nao_tem: list[str] = ()) -> dict | None:
    """O e-mail no Resend: remetente, destino, assunto, HTML no molde e entregue. Grava o HTML para o render."""
    if not p.check(isinstance(id_, str) and len(id_) > 10, f"[{nome}] o Resend aceitou o e-mail (id {id_})"):
        return None
    e: dict = {}
    for _ in range(30):
        e = resend(id_)
        if e.get("last_event") in ("delivered", "bounced", "complained"):
            break
        time.sleep(4)
    p.check(e.get("from") == REMETENTE, f"[{nome}] remetente = {e.get('from')}")
    p.check(e.get("to") == [CAIXA], f"[{nome}] destino = caixa de teste do Resend ({e.get('to')})")
    p.check(e.get("subject") == assunto, f"[{nome}] assunto = {e.get('subject')!r}")
    html = e.get("html") or ""
    p.check(html.startswith("<!doctype html>") and IMAGENS + "logo-physiq.png" in html and "<svg" not in html.lower(),
            f"[{nome}] HTML no molde C (logo do bucket, sem SVG, {len(html)} bytes)")
    faltam = [t for t in tem if t not in html]
    sobram = [t for t in nao_tem if t in html]
    p.check(not faltam and not sobram, f"[{nome}] conteúdo do e-mail ({'ok' if not faltam and not sobram else f'faltam {faltam} · sobram {sobram}'})")
    p.check(e.get("last_event") == "delivered", f"[{nome}] status no Resend = {e.get('last_event')}")
    SAIDA.mkdir(parents=True, exist_ok=True)
    arq = SAIDA / f"{nome}.html"
    arq.write_text(html, encoding="utf-8")
    INDICE[nome] = {"assunto": e.get("subject", ""), "arquivo": str(arq), "remetente": (e.get("from") or "").split(" <")[0], "id": id_,
                    "status": e.get("last_event")}
    return e


def botoes(*textos: str) -> list[str]:
    return [f">{t}</a>" for t in textos]


def proximo_dia(dias: int) -> dt.date:
    d = B.hoje() + dt.timedelta(days=dias)
    while d.weekday() == 6:  # domingo fora
        d += dt.timedelta(days=1)
    return d


DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def no_assunto(d: dt.date, hhmm: str) -> str:
    return f"{DIAS[d.weekday()]}, {d.day}/{d.month}, {hhmm}"


# ───────────────────────── staging ─────────────────────────
def staging() -> None:
    m = B.massa()
    assert m.get("conta"), "falta a massa da W20 no staging (python3 e2e/w20/massa.py)"
    lucas, conta = m["lucas"], m["conta"]
    rafael = m["alunos"]["Rafael Moura"]
    user_rafael = sql(f"select user_id::text as u, email from {S}.pacientes where id = {q(rafael)}")[0]
    email_rafael = user_rafael["email"]
    user_rafael = user_rafael["u"]
    p.check(sql(f"select count(*)::int n from {S}.push_aparelhos where user_id = {q(user_rafael)}")[0]["n"] == 0, "[pre] o Rafael não tem aparelho de push (nenhum push sai)")
    antes_email = sql(f"select id::text, aviso_email_em from {S}.agendamentos where paciente_id = {q(rafael)}")
    t0 = sql("select now()::text as t")[0]["t"]
    criadas: list[str] = []
    convites: list[str] = []
    marca = int(time.time())

    def silenciar():
        # as consultas do Rafael ficam "já avisadas" há 11 min: a próxima reserva pega só a(s) nova(s) e não cai no "repetido"
        sql(f"update {S}.agendamentos set aviso_email_em = now() - interval '11 minutes' where paciente_id = {q(rafael)}")

    def consulta(d: dt.date, ini: str, fim: str, titulo: str, status: str = "agendado", reag: int = 0) -> str:
        a = sql(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo, conta_id, reagendamentos)
                    values ({q(lucas)}, {q(m['cal_lucas'])}, {q(rafael)}, {q(titulo)}, {q(B.sp(d, ini))}, {q(B.sp(d, fim))}, {q(status)},
                            {q('confirmado' if status == 'confirmado' else 'a_confirmar')}, 'treino', {q(conta)}, {reag}) returning id::text as id""")[0]["id"]
        criadas.append(a)
        return a

    try:
        B.saude_ok("agenda (staging)")
        print("\n— agenda-avisar: 1 consulta esperando o aluno", flush=True)
        silenciar()
        d1 = proximo_dia(4)
        a1 = consulta(d1, "15:30", "16:00", "Consulta de treino")
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": a1})
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True and e.get("teste") is True and e.get("consultas") == 1, f"[agenda-1] a função mandou ({st} {e})")
        conferir_email("agenda-1", e.get("id"), f"[teste → {email_rafael}] Confirme sua consulta de {no_assunto(d1, '15:30')}",
                       botoes("Confirmar presença", "Reagendar", "Ver minha agenda") + [
                           f'href="{SITE}/perfil/agenda"', ">Convite de consulta</td>", "Lucas Ferreira</strong> marcou esta consulta para você.",
                           ">30 minutos</p>", ">Consulta de treino</p>", f"{IMAGENS}halter-violeta.png", ">até 16:00 · 30 min</p>",
                           "Você recebeu este e-mail porque é aluno de Lucas Ferreira no Physiq."])
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": a1})
        p.check(st == 200 and isinstance(r, dict) and r.get("email", {}).get("motivo") == "repetido", f"[agenda] 2ª vez em 10 min: repetido ({r})")
        st, r = B.funcao_como("w13-personal2", "agenda-avisar", {"agendamento": a1})
        p.check(st == 403, f"[agenda] negativo: o Bruno (não é dono da agenda) → 403 ({st})")

        print("\n— agenda-avisar: 3 consultas num e-mail", flush=True)
        silenciar()
        ds = [proximo_dia(5), proximo_dia(6), proximo_dia(7)]
        while len(set(ds)) < 3:
            ds = sorted(set(ds) | {proximo_dia(len(ds) + 6)})[:3]
        a3 = [consulta(ds[0], "08:00", "09:00", "Avaliação física"), consulta(ds[1], "08:00", "09:00", "Consulta de treino", "confirmado"),
              consulta(ds[2], "08:00", "09:00", "Consulta de treino", "encaixe")]
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": a3[0]})
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True and e.get("consultas") == 3, f"[agenda-3] a função juntou as 3 ({st} {e})")
        ev = conferir_email("agenda-3", e.get("id"), f"[teste → {email_rafael}] Confirme suas 3 consultas com Lucas Ferreira",
                            botoes("Confirmar presença", "Reagendar", "Ver minha agenda") + [">Convite de consultas</td>", ">Avaliação física</p>",
                                                                                           "marcou estas 3 consultas para você."])
        if ev:
            p.check((ev.get("html") or "").count("border-radius:14px 14px 0 0") == 3, "[agenda-3] um bloco (calendário) por consulta: 3")

        print("\n— agenda-avisar: 1 consulta já confirmada e já reagendada", flush=True)
        silenciar()
        d4 = proximo_dia(9)
        a4 = consulta(d4, "17:00", "17:45", "Retorno", "confirmado", 1)
        st, r = B.funcao_como("w13-dono", "agenda-avisar", {"agendamento": a4})
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True and e.get("consultas") == 1, f"[agenda-confirmada] a função mandou ({st} {e})")
        conferir_email("agenda-confirmada", e.get("id"), f"[teste → {email_rafael}] Consulta marcada: {no_assunto(d4, '17:00')}",
                       botoes("Ver minha agenda") + [">Consulta marcada</td>", "marcou e confirmou esta consulta para você.", ">45 minutos</p>",
                                                     "O botão abre o app. Se não abrir, use o link:"],
                       botoes("Confirmar presença", "Reagendar"))

        B.saude_ok("plano (staging)")
        print("\n— aluno-enviar: Camila → dieta · Lucas → treino", flush=True)
        st, r = B.funcao_como("w13-nutri", "aluno-enviar", {"aluno": rafael, "modulos": ["dieta"]})
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True and e.get("teste") is True, f"[plano-dieta] a função mandou ({st} {str(r)[:160]})")
        conferir_email("plano-dieta", e.get("id"), f"[teste → {email_rafael}] Seu plano alimentar foi atualizado por Camila Rocha",
                       botoes("Ver minha dieta") + [f'href="{SITE}/dieta"', ">Plano atualizado</td>", ">Plano alimentar</p>", ">atualizado por Camila Rocha</p>",
                                                    f"{IMAGENS}salada-verde-26.png", "Camila Rocha</strong> atualizou seu plano alimentar no Physiq."],
                       botoes("Ver meu treino", "Abrir o Physiq"))
        st, r = B.funcao_como("w13-dono", "aluno-enviar", {"aluno": rafael, "modulos": ["treino"]})
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True, f"[plano-treino] a função mandou ({st} {str(r)[:160]})")
        conferir_email("plano-treino", e.get("id"), f"[teste → {email_rafael}] Seu treino foi atualizado por Lucas Ferreira",
                       botoes("Ver meu treino") + [f'href="{SITE}/treino"', f"{IMAGENS}halter-violeta-26.png", "Atualizado · aba Treino do app"],
                       botoes("Ver minha dieta"))

        B.saude_ok("convites (staging)")
        print("\n— convites: Lucas convida uma nutricionista de teste para a equipe", flush=True)
        email_eq = f"h3.equipe.{marca}.teste.claude@physiqnutri.app"
        st, r = B.funcao_como("w13-dono", "convites", {"acao": "convidar", "conta_id": conta, "email": email_eq, "papeis": ["nutricionista"]})
        p.check(st == 200 and isinstance(r, dict) and r.get("email_enviado") is True and r.get("email_teste") is True, f"[convite-equipe] a função mandou ({st} {str(r)[:160]})")
        if isinstance(r, dict) and r.get("convite_id"):
            convites.append(r["convite_id"])
        conferir_email("convite-equipe", (r or {}).get("email_id") if isinstance(r, dict) else None,
                       f"[teste → {email_eq}] Lucas Ferreira convidou você para a equipe Consultoria Ferreira W13 no Physiq",
                       botoes("Entrar e aceitar") + [f'href="{SITE}/entrar?convite=1"', ">Convite de equipe</td>", ">Consultoria Ferreira W13</p>",
                                                     ">como nutricionista</p>", ">Nutricionista</p>", f"mailto:{email_eq}", "O botão abre o Physiq.",
                                                     "Se você não esperava este convite, ignore este e-mail."])
        if convites:
            st, r = B.funcao_como("w13-dono", "convites", {"acao": "cancelar", "convite_id": convites[-1]})
            p.check(st == 200 and isinstance(r, dict) and r.get("ok") is True, f"[convite-equipe] cancelado ({st})")

        print("\n— alunos: Lucas convida um aluno de teste para o treino", flush=True)
        email_al = f"h3.aluno.{marca}.teste.claude@physiqnutri.app"
        st, r = B.B13.alunos("w13-dono", "convidar", {"conta_id": conta, "email": email_al, "modulos": ["treino"]})
        p.check(st == 200 and r.get("email_enviado") is True and r.get("email_teste") is True, f"[convite-aluno] a função mandou ({st} {str(r)[:160]})")
        if r.get("convite_id"):
            convites.append(r["convite_id"])
        conferir_email("convite-aluno", r.get("email_id"), f"[teste → {email_al}] Lucas Ferreira convidou você para o Physiq",
                       botoes("Entrar e aceitar") + [f'href="{SITE}/entrar?convite=1"', ">Convite</td>", ">Convidou você</p>", ">Lucas Ferreira</p>",
                                                     ">Consultoria Ferreira W13</p>", ">Treino</p>", f"mailto:{email_al}"])
        if r.get("convite_id"):
            st, r2 = B.B13.alunos("w13-dono", "cancelar_convite", {"convite_id": r["convite_id"]})
            p.check(st == 200 and r2.get("ok") is True, f"[convite-aluno] cancelado ({st})")
    finally:
        if criadas:
            sql(f"delete from {S}.mensagens_whatsapp where agendamento_id in ({', '.join(q(x) for x in criadas)})")
            sql(f"delete from {S}.agendamentos where id in ({', '.join(q(x) for x in criadas)})")
        for a in antes_email:
            sql(f"update {S}.agendamentos set aviso_email_em = {q(a['aviso_email_em'])} where id = {q(a['id'])}")
        sql(f"delete from {S}.push_envios where user_id = {q(user_rafael)} and criado_em >= {q(t0)}")
        sql(f"delete from {S}.avisos where destino_user_id = {q(user_rafael)} and criado_em >= {q(t0)}")
        if convites:
            sql(f"delete from {S}.conta_eventos where conta_id = {q(conta)} and em >= {q(t0)} and (depois::text like '%h3.equipe.{marca}%' or depois::text like '%h3.aluno.{marca}%')")
            sql(f"delete from {S}.convites where id in ({', '.join(q(x) for x in convites)})")
        voltou = sql(f"select id::text, aviso_email_em from {S}.agendamentos where paciente_id = {q(rafael)}")
        assina = lambda xs: sorted(json.dumps(x, sort_keys=True, default=str) for x in xs)  # noqa: E731
        p.check(assina(voltou) == assina(antes_email), "[limpeza] as consultas do Rafael voltaram ao que eram (aviso_email_em)")


# ───────────────────────── produção ─────────────────────────
def producao() -> None:
    tn = B.token("nutri-legado")
    nutri = B.uid("nutri-legado")
    nome_nutri = sql(f"select {S}.nome_da_pessoa({q(nutri)}) as n")[0]["n"]
    email_a = f"h3.prod.{int(time.time())}.teste.claude@physiqnutri.app"
    senha_a = secrets.token_urlsafe(14)
    pid = user_a = None
    criadas: list[str] = []

    def rest(metodo: str, caminho: str, corpo=None):
        cab = {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {tn}", "Accept-Profile": S, "Content-Profile": S, "Prefer": "return=representation"}
        st, r, _ = B.http(metodo, f"{B.PRINCIPAL_URL}{caminho}", corpo, cab)
        return st, r

    try:
        B.saude_ok("prova de produção")
        st, pac = rest("POST", "/rest/v1/pacientes", {"nome": "Rafael Teste H3", "nutricionista_id": nutri, "email": email_a})
        p.check(st == 201, f"[prod] a nutri de teste cria o aluno descartável → {st}")
        pid = pac[0]["id"]
        st, _ = rest("POST", "/rest/v1/rpc/paciente_criar_acesso", {"p_paciente_id": pid, "p_email": email_a, "p_senha": senha_a})
        p.check(st == 200, f"[prod] acesso do aluno descartável → {st}")
        user_a = sql(f"select id::text from auth.users where email = {q(email_a)}")[0]["id"]
        cal = sql(f"select id::text from {S}.calendarios where nutricionista_id = {q(nutri)} and deleted_at is null order by created_at limit 1")
        d = proximo_dia(1)
        st, ag = rest("POST", "/rest/v1/agendamentos", {
            "nutricionista_id": nutri, "calendario_id": cal[0]["id"] if cal else None, "paciente_id": pid, "titulo": "Consulta de nutrição",
            "inicio": B.sp(d, "13:30"), "fim": B.sp(d, "14:00"), "status": "agendado", "confirmacao": "a_confirmar", "modulo": "nutricao"})
        p.check(st == 201, f"[prod] a nutri marca a consulta (REST, como o painel) → {st} {str(ag)[:120] if st != 201 else ''}")
        criadas.append(ag[0]["id"])
        st, r = B.funcao_como("nutri-legado", "agenda-avisar", {"agendamento": ag[0]["id"]}, origem=SITE)
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True and e.get("teste") is True, f"[prod agenda] a função mandou ({st} {e})")
        conferir_email("agenda", e.get("id"), f"[teste → {email_a}] Confirme sua consulta de {no_assunto(d, '13:30')}",
                       botoes("Confirmar presença", "Reagendar", "Ver minha agenda") + [
                           f'href="{SITE}/perfil/agenda"', ">physiqcalc.com.br/perfil/agenda</a>", ">Consulta de nutrição</p>",
                           f"{nome_nutri}</strong> marcou esta consulta para você.", ">até 14:00 · 30 min</p>", f"{IMAGENS}salada-violeta.png"])
        st, r = B.funcao_como("nutri-legado", "aluno-enviar", {"aluno": pid, "modulos": ["dieta"]}, origem=SITE)
        e = (r or {}).get("email", {}) if isinstance(r, dict) else {}
        p.check(st == 200 and e.get("enviado") is True and e.get("teste") is True, f"[prod plano] a função mandou ({st} {str(r)[:160]})")
        conferir_email("plano", e.get("id"), f"[teste → {email_a}] Seu plano alimentar foi atualizado por {nome_nutri}",
                       botoes("Ver minha dieta") + [f'href="{SITE}/dieta"', ">physiqcalc.com.br/dieta</a>", ">Plano alimentar</p>"])
    finally:
        if criadas:
            sql(f"delete from {S}.mensagens_whatsapp where agendamento_id in ({', '.join(q(x) for x in criadas)})")
            sql(f"delete from {S}.agendamentos where id in ({', '.join(q(x) for x in criadas)})")
        if user_a:
            sql(f"delete from {S}.push_envios where user_id = {q(user_a)}")
            sql(f"delete from {S}.avisos where destino_user_id = {q(user_a)}")
        if pid:
            rest("POST", "/rest/v1/rpc/paciente_remover_acesso", {"p_paciente_id": pid})
            st, _ = rest("DELETE", f"/rest/v1/pacientes?id=eq.{pid}")
            p.check(st in (200, 204), f"[prod] limpeza: aluno descartável apagado → {st}")


def main() -> int:
    if not CHAVE:
        raise SystemExit("falta RESEND_API_KEY (a chave da conta B Code, no cofre)")
    antes = contagens()
    print(f"schema {S} · contagens antes: {antes}", flush=True)
    try:
        producao() if PROD else staging()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        p.check(False, f"{type(e).__name__}: {str(e)[:300]}")
    depois = contagens()
    print(f"contagens depois: {depois}", flush=True)
    p.check(depois == antes, f"[limpeza] contagens iguais antes e depois ({'=' if depois == antes else depois})")
    SAIDA.mkdir(parents=True, exist_ok=True)
    (SAIDA / "indice.json").write_text(json.dumps(INDICE, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"e-mails: {SAIDA / 'indice.json'}")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
