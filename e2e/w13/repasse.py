#!/usr/bin/env python3
"""Physiq W13 — o APK antigo (≤ 3.15) continua convidando: professor-convites (Treino, com o token do Treino) repassa para a
função alunos do banco principal (modo servidor) — convite no principal, e-mail pelo Resend (caixa de teste) e o LIMITE DA FAIXA.
Staging, contas da massa (e2e/w13/massa.py). Uso: python3 e2e/w13/repasse.py"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
B.ESTADO["schema"] = "staging"
p = B.p
S = "staging"

def pc(conta, corpo):
    B.B5.zerar_limite_troca(conta)
    st, r = B.B5.trocar_token(conta)
    assert st == 200, (conta, st, r)
    tok = r["access_token"]
    st2, r2, _ = B.http("POST", "https://api.physiqcalc.com.br/functions/v1/professor-convites", corpo,
                        {"Authorization": f"Bearer {tok}", "apikey": B.anon(B.TREINO_REF), "x-schema": S, "Origin": "https://physiqcalc-staging.vercel.app"}, timeout=90)
    return st2, r2

C = B.conta_de("w13-dono", B.NOME_CONTA)
alvo = "w13.repasse.teste.claude@physiqnutri.app"
B.sql_principal(f"delete from {S}.convites where conta_id = '{C}' and lower(email) = '{alvo}'")
st, r = pc("w13-dono", {"action": "link"})
p.check(st == 200 and "prof=" in (r or {}).get("url", ""), f"R1 link (continua do Treino) → {st} {r}")
st, r = pc("w13-dono", {"action": "email", "email": alvo})
p.check(st == 200 and r.get("vinculado") is False and r.get("emailEnviado") is True and (r.get("convite") or {}).get("id"),
        f"R2 APK antigo convida por e-mail → convite no PRINCIPAL + e-mail (caixa de teste) → {st} {r}")
cv = B.sql_principal(f"select status, modulos, responsavel_id::text from {S}.convites where conta_id = '{C}' and lower(email) = '{alvo}'")
p.check(cv and cv[0]["status"] == "pendente" and cv[0]["modulos"] == ["treino"] and cv[0]["responsavel_id"] == B.uid("w13-dono"),
        f"R3 o convite nasceu no banco principal com o personal responsável → {cv}")
st, r = pc("w13-dono", {"action": "list"})
p.check(st == 200 and any(c.get("email") == alvo and c.get("status") == "pendente" for c in (r or {}).get("convites", [])), f"R4 list do APK antigo lê do principal → {st}")
cid = (cv and B.sql_principal(f"select id::text from {S}.convites where conta_id = '{C}' and lower(email) = '{alvo}'")[0]["id"])
st, r = pc("w13-dono", {"action": "revoke", "id": cid})
cv2 = B.sql_principal(f"select status from {S}.convites where id = '{cid}'")
p.check(st == 200 and cv2[0]["status"] == "revogado", f"R5 revoke do APK antigo cancela no principal → {st} {cv2}")
st, r = pc("w13-limite", {"action": "email", "email": "w13.extra.teste.claude@physiqnutri.app"})
p.check(st == 409 and (r or {}).get("error") == "limite_plano", f"R6 APK antigo no limite da faixa → 409 limite_plano (antes ignorava a faixa) → {st} {r}")
B.sql_principal(f"delete from {S}.convites where conta_id = '{C}' and lower(email) = '{alvo}'")
sys.exit(p.fim())
