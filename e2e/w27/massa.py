#!/usr/bin/env python3
"""Physiq W27 — massa do PAINEL MASTER no STAGING (só contas *.teste.claude@physiqnutri.app — P26).

  python3 e2e/w27/massa.py             cria/garante: w27-master (MASTER de teste), w27-aluno (login sem conta), w27-app (aluna do app)
  python3 e2e/w27/massa.py --limpar    apaga o que a W27 criou no staging (contas W27, matrículas, logins de teste dos donos/alunos
                                       nos 2 bancos) e TIRA o master do w27-master nos 2 bancos (o Auth é o mesmo da produção)
As contas A/B/C e os donos (w27-dono-a/-b) nascem PELO MASTER no teste (e2e/w27/api.py), como na tela.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S


def montar() -> None:
    for k in ("w27-master", "w27-aluno", "w27-app"):
        print(f"principal  {B.EMAIL[k]:46s} {B.B5.garantir_usuario(B.EMAIL[k], B.CONTAS[k][1], B.NOMES[k])}")
        B.sql_principal(f"update {S}.profiles set nome = {B.q(B.NOMES[k])} where id = '{B.uid(k)}'")
    B.dar_master("w27-master")
    # a aluna do app (sem profissional): entra pelo "Treinar sem profissional" (W7b)
    tem = B.sql_principal(f"""select 1 from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                              where p.user_id = '{B.uid('w27-app')}' and c.origem = 'app' and p.deleted_at is null""")
    if not tem:
        # hml-12 (H-30): a de 5 argumentos (data de adulto + consentimento de saúde); a de 2 devolve atualize_o_app no staging
        st, r = B.rpc("w27-app", "entrar_sem_profissional", B.B5.args_sem_profissional("manter", "app_treino"))
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    print("massa pronta: master de teste =", B.EMAIL["w27-master"])


def limpar() -> None:
    contas = [B.conta_id(n) for n in (B.CONTA_A, B.CONTA_B, B.CONTA_C)]
    contas = [c for c in contas if c]
    for c in contas:
        B.sql_principal(f"delete from {S}.pacientes where conta_id = '{c}'")
        B.sql_principal(f"delete from {S}.contas where id = '{c}'")
    # logins de teste criados pela W27 (donos e alunos): principal e Treino (vínculo + usuário)
    for k in ("w27-dono-a", "w27-dono-b", "w27-aluno", "w27-app"):
        u = B.uid(k)
        if not u:
            continue
        B.sql_principal(f"delete from {S}.pacientes where user_id = '{u}'")
        B.sql_principal(f"delete from {S}.conta_membros where user_id = '{u}'")
        for s in ("public", "staging"):
            for x in B.sql_treino(f"select treino_user_id::text as t from {s}.physiq_identidades where principal_user_id = '{u}'"):
                B.sql_treino(f"delete from {s}.physiq_identidades where principal_user_id = '{u}'")
                B.admin_auth(B.TREINO_REF, "DELETE", f"users/{x['t']}")
        st, _ = B.admin_auth(B.PRINCIPAL_REF, "DELETE", f"users/{u}")
        print(f"apagado {B.EMAIL[k]} ({st})")
    B.tirar_master("w27-master")
    print("limpo: contas", len(contas), "· master de teste sem o papel")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    limpar() if a.limpar else montar()
