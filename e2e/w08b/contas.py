#!/usr/bin/env python3
"""Physiq W8b — contas de TESTE (idempotente; SÓ *.teste.claude@physiqnutri.app — P26).

  (sem opção)   staging: a "Consultoria Ferreira W8b" (Lucas = dono + personal), o aluno Rafael (com login e Treino), a matrícula
                SEM login "Bruno Novo" (o "Criar acesso"), outra profissional (o caso negativo) e as contas da escada e do Google
  --prod        produção: só as 2 descartáveis do smoke (escada e Google), sem conta e sem matrícula
  --apagar-prod apaga as descartáveis de produção (login e perfil — nada mais foi criado para elas)

Uso: python3 e2e/w08b/contas.py [--prod | --apagar-prod]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402


def conta_w8b(S: str) -> str | None:
    u = B.uid("w8b-personal")
    r = B.q(f"select id::text from {S}.contas where dono_id = '{u}' and origem = 'nova' order by criado_em limit 1")
    return r[0]["id"] if r else None


def staging() -> None:
    S = "staging"
    B.ESTADO["schema"] = S
    for k in ("w8b-personal", "w8b-outro", "w8b-aluno", "w8b-bloqueio", "w8b-google"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.garantir_usuario(email, s, B.NOMES[k])}")
    if not conta_w8b(S):
        st, r = B.rpc("w8b-personal", "criar_minha_conta", {"p_nome": B.NOME_CONTA, "p_tipo": "personal", "p_registro": "CREF 000888-G/PE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    uo = B.uid("w8b-outro")
    if not B.q(f"select 1 from {S}.contas where dono_id = '{uo}'"):
        st, r = B.rpc("w8b-outro", "criar_minha_conta", {"p_nome": "Conta Outra W8b", "p_tipo": "nutricionista", "p_registro": "CRN 0888/PE"})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    c = conta_w8b(S)
    up = B.uid("w8b-personal")
    B.q(f"update {S}.profiles set nome = 'Lucas Ferreira', tipo_perfil = 'personal' where id = '{up}'")
    ua = B.uid("w8b-aluno")
    r = B.q(f"select {S}.matricular_na_conta('{ua}', '{c}', '{up}', null, 'novo', true) as r")[0]["r"]
    assert r.get("ok"), r
    B.q(f"update {S}.pacientes set nome = 'Rafael Moura', email = '{B.EMAIL['w8b-aluno']}', ativo = true, objetivo = 'definição' "
        f"where user_id = '{ua}' and conta_id = '{c}' and deleted_at is null")
    # a matrícula SEM login (o profissional cadastrou o aluno e ainda não criou o acesso)
    if not B.q(f"select 1 from {S}.pacientes where conta_id = '{c}' and lower(email) = '{B.EMAIL_NOVO}' and deleted_at is null"):
        B.q(f"""insert into {S}.pacientes (nutricionista_id, nome, email, ativo, conta_id, personal_id, origem)
                values (null, '{B.NOME_NOVO}', '{B.EMAIL_NOVO}', true, '{c}', '{up}', 'novo')""")
    print("conta W8b:", c, "· alunos:", B.q(f"select id::text, nome, email, user_id::text from {S}.pacientes where conta_id = '{c}' and deleted_at is null"))


def prod() -> None:
    B.ESTADO["schema"] = "public"
    for k in ("w8b-prod-bloqueio", "w8b-prod-google"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.garantir_usuario(email, s, B.NOMES[k])}")


def apagar_prod() -> None:
    sp = B.service(B.PRINCIPAL_REF)
    for k in ("w8b-prod-bloqueio", "w8b-prod-google"):
        email = B.CONTAS[k][0]
        assert email.startswith("w8b.prod.") and email.endswith(".teste.claude@physiqnutri.app"), email
        u = B.uid(k)
        if not u:
            print("já apagada:", email)
            continue
        st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
        print("apagada:", email, st)
        B.q(f"delete from public.login_bloqueios where email = '{email}'")
        B.q(f"delete from staging.login_bloqueios where email = '{email}'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prod", action="store_true")
    ap.add_argument("--apagar-prod", action="store_true")
    a = ap.parse_args()
    if a.apagar_prod:
        apagar_prod()
    elif a.prod:
        prod()
    else:
        staging()
    return 0


if __name__ == "__main__":
    sys.exit(main())
