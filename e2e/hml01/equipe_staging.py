#!/usr/bin/env python3
"""Physiq hml-01 (07/10/2026) — as 3 policies de equipe do principal (papeis_permitidos_do_dono), SÓ NO STAGING: o dono convida
e edita papéis, o membro não, e a função de base não abre pela API. Contas de TESTE da W5 (w5-dono, w5-personal); o que o teste
cria é apagado no fim. Uso: python3 e2e/hml01/equipe_staging.py"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_URL, PRINCIPAL_REF, anon, http, login_principal, sql_principal  # noqa: E402

S = "staging"  # grava convite e membro de teste: nunca em produção
ak = anon(PRINCIPAL_REF)
def cab(tok):
    return {"apikey": ak, "Authorization": f"Bearer {tok}", "Accept-Profile": S, "Content-Profile": S, "Prefer": "return=representation"}
ok = []
def check(c, msg): ok.append(c); print(("✅ " if c else "❌ ") + msg)

dono = login_principal("w5-dono", "w5.dono.teste.claude@physiqnutri.app")
memb = login_principal("w5-personal", "w5.personal.teste.claude@physiqnutri.app")
uid_d, uid_m = dono["user"]["id"], memb["user"]["id"]
conta = sql_principal(f"select conta_id from {S}.conta_membros where user_id = '{uid_d}' and status = 'ativo' and 'dono' = any(papeis) limit 1")[0]["conta_id"]
mail = "hml01.equipe.teste.claude@physiqnutri.app"
criados_c, criados_m = [], []
try:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/convites", {"conta_id": conta, "tipo": "membro", "email": mail, "papeis": ["personal"], "criado_por": uid_d}, cab(dono["access_token"]))
    check(st == 201, f"dono convida membro (convites: criar) → {st}")
    if st == 201: criados_c.append(r[0]["id"])
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/convites", {"conta_id": conta, "tipo": "membro", "email": mail, "papeis": ["personal"], "criado_por": uid_m}, cab(memb["access_token"]))
    check(st in (401, 403), f"membro (não dono) convida membro → {st} (recusado)")
    if st == 201: criados_c.append(r[0]["id"])
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/conta_membros", {"conta_id": conta, "papeis": ["personal"], "status": "convidado", "email_convite": mail}, cab(dono["access_token"]))
    check(st == 201, f"dono convida (conta_membros: dono convida) → {st}")
    if st == 201: criados_m.append(r[0]["id"])
    if criados_m:
        st, r, _ = http("PATCH", f"{PRINCIPAL_URL}/rest/v1/conta_membros?id=eq.{criados_m[0]}", {"papeis": ["personal", "nutricionista"]}, cab(dono["access_token"]))
        check(st == 200 and len(r) == 1, f"dono edita papéis (conta_membros: dono edita) → {st}")
        st, r, _ = http("PATCH", f"{PRINCIPAL_URL}/rest/v1/conta_membros?id=eq.{criados_m[0]}", {"papeis": ["personal"]}, cab(memb["access_token"]))
        check(st in (401, 403) or (st == 200 and len(r) == 0), f"membro edita papéis → {st} linhas={len(r) if isinstance(r, list) else '-'} (recusado)")
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/papeis_permitidos", {"p_conta": conta, "p_papeis": ["personal"]}, cab(memb["access_token"]))
    check(st in (401, 403, 404), f"papeis_permitidos direto pela API → {st} (fechada)")
finally:
    for i in criados_c: sql_principal(f"delete from {S}.convites where id = '{i}'")
    for i in criados_m: sql_principal(f"delete from {S}.conta_membros where id = '{i}'")
    print("limpeza:", len(criados_c), "convite(s) e", len(criados_m), "membro(s) apagados")
print("RESULTADO", sum(ok), "/", len(ok))
sys.exit(0 if all(ok) else 1)
