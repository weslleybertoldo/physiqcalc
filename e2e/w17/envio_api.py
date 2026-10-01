#!/usr/bin/env python3
"""Physiq W17 (item 2) — E2E de SERVIDOR do "Salvar e enviar ao aluno" (tela 8) com e-mail, no staging (contas de teste w13.* +
os alunos da e2e/w17/massa.py). Chama a função aluno-enviar do banco principal como cada pessoa (o login de verdade).

Positivo: aviso no sino + e-mail (no staging SEMPRE para a caixa de teste do Resend — o Resend devolve o id do envio); o 2º envio
em menos de 10 minutos não repete o sino nem o e-mail; com o aviso já lido, o sino repete e o e-mail NÃO (10 min do e-mail);
passados os 10 min, o e-mail sai de novo.
Negativo: sem login (token) → 401; aluno sem e-mail no cadastro → só o sino; aluno sem login → nada; o 2º personal (não é do aluno)
e o dono sem papel de nutricionista são recusados; nenhuma mensagem na fila do WhatsApp.

Uso: python3 e2e/w17/envio_api.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
ORIGEM = "https://physiqcalc-staging.vercel.app"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def enviar(token: str | None, aluno: str, modulos: list[str]) -> tuple[int, dict]:
    cab = {"apikey": B.anon(B.PRINCIPAL_REF), "x-schema": S, "Origin": ORIGEM}
    if token is not None:
        cab["Authorization"] = f"Bearer {token}"
    st, r, h = B.http("POST", f"{B.PRINCIPAL_URL}/functions/v1/aluno-enviar", {"aluno": aluno, "modulos": modulos}, cab, timeout=90)
    return st, (r if isinstance(r, dict) else {"bruto": r})


def avisos(user: str) -> list[dict]:
    return q(f"select id::text, titulo, link, lido_em, email_em from {S}.avisos where destino_user_id = '{user}' and tipo = 'plano_atualizado' order by criado_em")


def main() -> int:
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert m.get("envio"), "rode antes: python3 e2e/w17/massa.py"
    aluno, user, sem_login = m["envio"], m["envio_user"], m["sem_login"]
    fila0 = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
    q(f"delete from {S}.avisos where destino_user_id = '{user}'")
    camila = B.token("w13-nutri")

    print("\n— sem login / CORS")
    st, r = enviar(None, aluno, ["dieta"])
    p.check(st == 401, f"sem token → 401 ({st} {str(r)[:80]})")
    st, r, h = B.http("OPTIONS", f"{B.PRINCIPAL_URL}/functions/v1/aluno-enviar", None, {"Origin": ORIGEM, "Access-Control-Request-Method": "POST"})
    p.check(st == 200 and h.get("Access-Control-Allow-Origin") == ORIGEM, f"CORS do staging ({st} {h.get('Access-Control-Allow-Origin')})")

    print("\n— com e-mail: sino + e-mail (caixa de teste do Resend)")
    st, r = enviar(camila, aluno, ["dieta"])
    e = r.get("email") or {}
    p.check(st == 200 and r.get("ok") and r.get("avisado") is True, f"nutri → avisado ({st} {str(r)[:160]})")
    p.check(e.get("enviado") is True and e.get("teste") is True and isinstance(e.get("id"), str) and len(e["id"]) > 10,
            f"e-mail aceito pelo Resend (id {e.get('id')}), na caixa de teste")
    av = avisos(user)
    p.check(len(av) == 1 and av[0]["titulo"] == "Sua dieta foi atualizada" and av[0]["link"] == "/dieta" and av[0]["email_em"],
            f"1 aviso 'Sua dieta foi atualizada' → /dieta, com o e-mail marcado ({av})")

    print("\n— 2º envio em menos de 10 minutos")
    st, r = enviar(camila, aluno, ["dieta"])
    e = r.get("email") or {}
    p.check(st == 200 and r.get("repetido") is True and not r.get("avisado"), f"o sino não repete ({str(r)[:160]})")
    p.check(e.get("enviado") is False and e.get("motivo") == "repetido", f"o e-mail não repete ({e})")
    p.check(len(avisos(user)) == 1, "continua 1 aviso")

    print("\n— aviso já lido, ainda dentro dos 10 minutos do e-mail")
    q(f"update {S}.avisos set lido_em = now() where destino_user_id = '{user}'")
    st, r = enviar(camila, aluno, ["dieta"])
    e = r.get("email") or {}
    av = avisos(user)
    p.check(st == 200 and r.get("avisado") is True and len(av) == 2, f"o sino avisa de novo (o outro foi lido) ({str(r)[:120]} · {len(av)} avisos)")
    p.check(e.get("enviado") is False and e.get("motivo") == "repetido" and not av[-1]["email_em"], f"o e-mail espera os 10 minutos ({e})")

    print("\n— passados os 10 minutos")
    q(f"update {S}.avisos set lido_em = now(), email_em = case when email_em is null then null else now() - interval '11 minutes' end where destino_user_id = '{user}'")
    st, r = enviar(camila, aluno, ["dieta"])
    e = r.get("email") or {}
    p.check(st == 200 and r.get("avisado") is True and e.get("enviado") is True, f"sino e e-mail de novo ({str(r)[:160]})")

    print("\n— aluno sem e-mail no cadastro")
    email0 = q(f"select email from {S}.pacientes where id = '{aluno}'")[0]["email"]
    try:
        q(f"update {S}.pacientes set email = null where id = '{aluno}'")
        q(f"delete from {S}.avisos where destino_user_id = '{user}'")
        st, r = enviar(camila, aluno, ["dieta"])
        e = r.get("email") or {}
        p.check(st == 200 and r.get("avisado") is True and e.get("enviado") is False and e.get("motivo") == "sem_email",
                f"só o sino ({str(r)[:160]})")
        av = avisos(user)
        p.check(len(av) == 1 and not av[0]["email_em"], "1 aviso, sem e-mail marcado")
    finally:
        q(f"update {S}.pacientes set email = $e${email0}$e$ where id = '{aluno}'")

    print("\n— aluno sem login")
    st, r = enviar(camila, sem_login, ["dieta"])
    e = r.get("email") or {}
    p.check(st == 200 and r.get("sem_login") is True and not r.get("avisado") and e.get("enviado") is False and e.get("motivo") == "sem_login",
            f"nada sai: ele vê quando entrar ({str(r)[:160]})")

    print("\n— quem não pode")
    st, r = enviar(B.token("w13-personal2"), aluno, ["treino", "dieta"])
    p.check(st in (400, 403) and r.get("ok") is False, f"2º personal (não é do aluno) → recusado ({st} {r})")
    st, r = enviar(B.token("w13-dono"), aluno, ["dieta"])
    p.check(st == 400 and r.get("erro") == "sem_modulo", f"dono sem papel de nutricionista → 'sem_modulo' ({st} {r})")
    st, r = enviar(camila, "nao-e-uuid", ["dieta"])
    p.check(st == 404, f"aluno inválido → 404 ({st})")
    st, r = enviar(camila, aluno, [])
    p.check(st == 400 and r.get("erro") == "sem_modulo", f"sem módulo → 400 ({st} {r})")

    fila1 = q(f"select count(*)::int n from {S}.mensagens_whatsapp")[0]["n"]
    p.check(fila1 == fila0, f"nenhuma mensagem nova na fila do WhatsApp ({fila0} → {fila1})")
    q(f"delete from {S}.avisos where destino_user_id = '{user}'")
    return p.fim()


if __name__ == "__main__":
    t0 = time.time()
    rc = main()
    print(f"({time.time() - t0:.0f} s)")
    sys.exit(rc)
