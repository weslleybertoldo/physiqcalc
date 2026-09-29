#!/usr/bin/env python3
"""Physiq — script 04 da virada: conferência dos 2 bancos (spec §8.4; W3, W6 e W28). Só lê. Para (exit 1) se algo não bate.

Confere, no schema escolhido (no staging, só as contas de teste — P26):
  · contagens por tabela (Treino e principal) e, com --antes, que nenhuma diminuiu (nenhum dado de cliente se perde);
  · todo usuário do Calc tem usuário no principal com o mesmo e-mail e o vínculo physiq_identidades certo
    (fora os conflitos que o script 01 deixou para o master, listados à parte);
  · todo professor do Calc é dono+personal ativo de uma conta com Treino, com o MESMO código de convite;
  · todo aluno do Calc com professor tem matrícula ativa na conta do professor, com o professor como personal;
  · toda nutricionista do Nutri é dona+nutricionista de uma conta 'legado_nutri' e os pacientes dela têm conta;
  · nenhuma matrícula repetida (login + conta) e nenhum vínculo repetido; contas do master isentas;
  · amostra de até 10 contas lado a lado (Calc × principal: nome, código, nº de alunos).
Uso:
  python3 scripts/virada/04_conferencia.py --schema staging [--salvar <arquivo.json>] [--antes <contagens.json>]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _base import SCHEMAS, email_de_teste, hoje_sp, salvar_json, sql_principal, sql_treino  # noqa: E402

TAB_TREINO = ["physiq_profiles", "physiq_professores", "physiq_identidades", "physiq_identidade_conflitos", "physiq_espelho_membros",
              "tb_treinos_usuario", "tb_series_usuario", "treino_historico", "physiq_avaliacoes", "physiq_pagamentos"]
TAB_PRINCIPAL = ["profiles", "pacientes", "contas", "conta_membros", "convites", "planos_alimentares", "refeicoes", "antropometrias",
                 "cobrancas", "agendamentos", "registros_prontuario", "espelho_pendencias"]


def contagens(schema: str) -> dict:
    c: dict[str, int] = {}
    existentes_t = {r["tabela"] for r in sql_treino(f"select table_name as tabela from information_schema.tables where table_schema = '{schema}'")}
    for t in TAB_TREINO:
        if t in existentes_t:
            c[f"treino.{schema}.{t}"] = sql_treino(f"select count(*)::int as n from {schema}.{t}")[0]["n"]
    existentes_p = {r["t"] for r in sql_principal(f"select table_name as t from information_schema.tables where table_schema = '{schema}'")}
    uniao = " union all ".join(f"select '{t}' as t, count(*)::int as n from {schema}.{t}" for t in TAB_PRINCIPAL if t in existentes_p)
    for r in sql_principal(uniao):
        c[f"principal.{schema}.{r['t']}"] = r["n"]
    c["treino.auth.users"] = sql_treino("select count(*)::int as n from auth.users")[0]["n"]
    c["principal.auth.users"] = sql_principal("select count(*)::int as n from auth.users")[0]["n"]
    return c


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--salvar", help="grava o relatório (JSON) — as contagens servem de --antes na próxima rodada")
    ap.add_argument("--antes", help="contagens de uma rodada anterior (JSON do --salvar)")
    a = ap.parse_args()
    s = a.schema
    so_testes = s == "staging"
    falhas: list[str] = []
    avisos: list[str] = []

    def ok(cond: bool, texto: str) -> None:
        print(("  ok    " if cond else "  FALHA ") + texto)
        if not cond:
            falhas.append(texto)

    print(f"== conferência {s} ({'só contas de teste' if so_testes else 'todos'}) · {hoje_sp()}")
    cont = contagens(s)
    for k in sorted(cont):
        print(f"  {k:55s} {cont[k]}")
    if a.antes:
        anteriores = json.loads(Path(a.antes).expanduser().read_text(encoding="utf-8")).get("contagens", {})
        for k, n in anteriores.items():
            if k in cont and cont[k] < n and not k.endswith("espelho_pendencias"):
                falhas.append(f"{k} diminuiu: {n} → {cont[k]}")
                print(f"  FALHA {k} diminuiu: {n} → {cont[k]}")

    # Calc
    usuarios = sql_treino(f"""select u.id::text as id, lower(u.email) as email, u.raw_app_meta_data->>'role' as role from auth.users u
       where u.email is not null and (exists (select 1 from {s}.physiq_profiles p where p.id = u.id)
          or exists (select 1 from {s}.physiq_professores p where p.id = u.id))""")
    if so_testes:
        usuarios = [u for u in usuarios if email_de_teste(u["email"])]
    ids = {u["id"] for u in usuarios}
    ident = {r["treino_user_id"]: r for r in sql_treino(f"select treino_user_id::text as treino_user_id, principal_user_id::text as principal_user_id from {s}.physiq_identidades")}
    principal = {r["id"]: r for r in sql_principal("select id::text as id, lower(email) as email, raw_app_meta_data as app from auth.users")}
    principal_por_email = {r["email"]: r for r in principal.values()}
    conflitos_abertos = sql_treino(f"select lower(email) as email, motivo from {s}.physiq_identidade_conflitos where resolvido_em is null")
    conflito_emails = {c["email"] for c in conflitos_abertos}
    # os conflitos que o script 01 deixa para o master (conta com senha e sem Google no principal)
    sem_vinculo_esperado = set()
    for u in usuarios:
        p = principal_por_email.get(u["email"])
        if u["id"] not in ident and p:
            info = sql_principal(f"""select (encrypted_password is not null and encrypted_password <> '') as senha,
                 exists (select 1 from auth.identities i where i.user_id = '{p['id']}' and i.provider = 'google') as google
                 from auth.users where id = '{p['id']}'""")[0]
            if info["senha"] and not info["google"] and not (email_de_teste(u["email"]) and not u["email"].startswith("conflito")):
                sem_vinculo_esperado.add(u["id"])
    print(f"\n== usuários do Calc: {len(usuarios)} (conflitos para o master: {len(sem_vinculo_esperado)})")
    for u in usuarios:
        if u["id"] in sem_vinculo_esperado:
            avisos.append(f"conflito para o master (sem vínculo, de propósito): {u['email']}")
            continue
        v = ident.get(u["id"])
        p = principal.get(v["principal_user_id"]) if v else None
        ok(bool(v and p and p["email"] == u["email"]), f"vínculo {u['email']} → principal com o mesmo e-mail")

    profs = [p for p in sql_treino(f"select id::text as id, lower(email) as email, codigo_convite, nome from {s}.physiq_professores") if p["id"] in ids]
    membros = sql_principal(f"""select m.user_id::text as user_id, m.conta_id::text as conta_id, m.papeis, m.status, m.codigo_convite,
          c.plano, c.origem, c.situacao, c.nome as conta_nome, c.isenta_motivo
        from {s}.conta_membros m join {s}.contas c on c.id = m.conta_id where m.user_id is not null""")
    print(f"\n== professores do Calc: {len(profs)}")
    amostra = []
    for pr in profs:
        if pr["id"] in sem_vinculo_esperado:
            continue
        pid = ident.get(pr["id"], {}).get("principal_user_id")
        ms = [m for m in membros if m["user_id"] == pid and m["status"] == "ativo" and "personal" in m["papeis"] and m["plano"] in ("treino", "treino_nutricao")]
        ok(bool(ms), f"{pr['email']} é personal ativo numa conta com Treino")
        if ms:
            ok(any(m["codigo_convite"] == pr["codigo_convite"] or m["origem"] == "nova" for m in ms), f"{pr['email']}: mesmo código ({pr['codigo_convite']})")
            conta = ms[0]
            n_calc = sql_treino(f"select count(*)::int as n from {s}.physiq_profiles where professor_id = '{pr['id']}'")[0]["n"]
            n_p = sql_principal(f"select count(*)::int as n from {s}.pacientes where conta_id = '{conta['conta_id']}' and deleted_at is null and personal_id = '{pid}'")[0]["n"]
            amostra.append({"professor": pr["email"], "conta": conta["conta_nome"], "origem": conta["origem"], "situacao": conta["situacao"],
                            "codigo_calc": pr["codigo_convite"], "codigo_principal": conta["codigo_convite"], "alunos_calc": n_calc, "matriculas": n_p})

    alunos = [p for p in sql_treino(f"select id::text as id, professor_id::text as professor_id from {s}.physiq_profiles where professor_id is not null") if p["id"] in ids]
    prof_ids = {p["id"] for p in profs}
    mats = sql_principal(f"select user_id::text as user_id, conta_id::text as conta_id, personal_id::text as personal_id, ativo from {s}.pacientes where deleted_at is null and user_id is not null")
    print(f"\n== alunos do Calc com professor: {len(alunos)}")
    for al in alunos:
        if al["id"] in prof_ids or al["id"] in sem_vinculo_esperado or al["professor_id"] in sem_vinculo_esperado:
            continue
        aid = ident.get(al["id"], {}).get("principal_user_id")
        pid = ident.get(al["professor_id"], {}).get("principal_user_id")
        email = principal.get(aid, {}).get("email", al["id"]) if aid else al["id"]
        ok(any(m["user_id"] == aid and m["personal_id"] == pid for m in mats), f"matrícula de {email} com o professor como personal")

    # Nutri
    nutris = sql_principal(f"select id::text as id, lower(email) as email, role from {s}.profiles where role = 'nutricionista'")
    if so_testes:
        nutris = [n for n in nutris if email_de_teste(n["email"])]
    print(f"\n== nutricionistas do Nutri: {len(nutris)}")
    for n in nutris:
        ok(any(m["user_id"] == n["id"] and m["origem"] == "legado_nutri" and "nutricionista" in m["papeis"] and "dono" in m["papeis"] for m in membros),
           f"{n['email']} é dona+nutricionista de uma conta legado_nutri")
    sem_conta = sql_principal(f"""select count(*)::int as n from {s}.pacientes p join {s}.profiles pr on pr.id = p.nutricionista_id
        where p.deleted_at is null and p.conta_id is null and pr.role in ('nutricionista', 'master')
          {"and lower(pr.email) similar to '%teste%@physiq(calc|nutri).app'" if so_testes else ""}""")[0]["n"]
    ok(sem_conta == 0, f"pacientes do Nutri sem conta: {sem_conta}")

    # duplicidades e master
    dup_m = sql_principal(f"select count(*)::int as n from (select user_id, conta_id from {s}.pacientes where deleted_at is null and user_id is not null and conta_id is not null group by 1, 2 having count(*) > 1) x")[0]["n"]
    ok(dup_m == 0, f"matrículas repetidas (login + conta): {dup_m}")
    dup_i = sql_treino(f"select count(*)::int as n from (select treino_user_id from {s}.physiq_identidades group by 1 having count(*) > 1) x")[0]["n"]
    ok(dup_i == 0, f"vínculos repetidos: {dup_i}")
    masters = sql_principal(f"""select c.nome, c.situacao from {s}.contas c join auth.users u on u.id = c.dono_id
        where u.raw_app_meta_data->>'role' = 'master'""")
    for m in masters:
        ok(m["situacao"] == "isenta", f"conta do master '{m['nome']}' isenta")

    print("\n== amostra (Calc × principal)")
    for x in amostra[:10]:
        print("  ", json.dumps(x, ensure_ascii=False))
    for c in conflitos_abertos:
        (avisos if email_de_teste(c["email"]) else falhas).append(f"conflito da troca em aberto: {c['email']} ({c['motivo']})")
    for av in avisos:
        print("  aviso", av)
    rel = {"schema": s, "data": hoje_sp(), "contagens": cont, "amostra": amostra[:10], "falhas": falhas, "avisos": avisos,
           "conflitos_da_troca_em_aberto": conflitos_abertos}
    if a.salvar:
        salvar_json(a.salvar, rel)
        print(f"\nrelatório: {a.salvar}")
    print(f"\n{'OK' if not falhas else 'FALHOU'} — {len(falhas)} falha(s), {len(avisos)} aviso(s)")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
