#!/usr/bin/env python3
"""Physiq — script 01 da virada: identidades, contas e matrículas de todos (spec §8.4; W3, e de novo na W28).

Para cada usuário do Calc (Banco do Treino) no schema escolhido:
  1. garante o usuário no banco principal com o MESMO e-mail (API admin: email_confirm, sem senha, sem convite e sem e-mail
     nenhum; app_metadata.origem = 'calc' e calc = true; quem já existe só ganha calc = true);
  2. grava o vínculo physiq_identidades (principal → Treino) — só quando é seguro: usuário criado agora, sem senha, ou com a
     identidade Google (e-mail verificado). Conta do principal COM senha e SEM Google com o mesmo e-mail = conflito para o
     master (ninguém pega a conta de outro criando um login com o e-mail dele — risco 1 da spec);
  3. cada professor do Calc → conta 'legado_calc' Só Treino (faixa do plano dele, cobrança legada até a W28) + membro
     dono/personal com o MESMO código de convite;
  4. cada aluno do Calc com professor → matrícula (pacientes) na conta do professor, com personal_id, treino_user_id,
     cadastro, tags do Calc por nome e o bloqueio do Calc em acesso_bloqueado_em;
  5. cada nutricionista do Nutri (e o master com pacientes) → conta 'legado_nutri' Só Nutrição + membro
     dono/nutricionista; os pacientes dela ganham conta_id;
  6. relatório: criados/existentes, conflitos, alunos em 2 contas (P7), profissionais nos 2 apps (P8), "sem conta".

Idempotente: rodar 2× não duplica nada (usuário por e-mail, vínculo por id, conta por dono+origem, matrícula por
login+conta). O staging só mexe em contas de teste (P26: o Auth dos 2 bancos é compartilhado com a produção).
Pré-requisitos: as migrações da W3 (supabase-principal/.../*_w03_regras.sql e supabase/.../*_w03_admin.sql) aplicadas.

Uso:
  python3 scripts/virada/01_identidades_contas.py --schema staging --dry-run
  python3 scripts/virada/01_identidades_contas.py --schema staging
  python3 scripts/virada/01_identidades_contas.py --schema public --dry-run      (depois do backup)
Relatório: --relatorio <arquivo.json> (padrão ~/backups/physiq/<data>-w03/relatorio-01-<schema>-<dry|real>.json).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _base import (  # noqa: E402
    SCHEMAS, admin_principal, email_de_teste, exec_treino, hoje_sp, lit, salvar_json, sql_principal, sql_treino,
)

GENERO = {"male": "masculino", "female": "feminino", "masculino": "masculino", "feminino": "feminino"}
FAIXA = {"start": "f10", "studio": "f30", "pro": "f100", "ilimitado": "livre"}


def somar_dias(data: str, dias: int) -> str:
    import datetime as dt
    return (dt.date.fromisoformat(data[:10]) + dt.timedelta(days=dias)).isoformat()


def so_do_espelho(p: dict) -> bool:
    """Linha de physiq_professores sem nada da cobrança do Calc (criada pelo espelho — linhaSoDoEspelho da W5)."""
    return not any(p.get(k) for k in ("plano_nome", "trial_ate", "adesao_paga_em", "ciclo_vence_em", "anual_ate", "cobranca_pausada"))


def conta_legado_calc(p: dict, master: bool, hoje: str) -> dict:
    """Espelho de contaLegadoCalc() (supabase-principal/functions/_shared/login-regras.ts) — o teste confere que batem."""
    faixa = FAIXA.get((p.get("plano_nome") or "").strip().lower(), "livre" if master else "f10")
    base = {"faixa": faixa, "teste_ate": None, "vence_em": None, "tolerancia_dias": 0, "isenta_motivo": None}
    if master:
        return {**base, "situacao": "isenta", "isenta_motivo": "master"}
    if p.get("status") == "suspenso":
        return {**base, "situacao": "suspensa"}
    if p.get("cobranca_pausada"):
        return {**base, "situacao": "isenta", "isenta_motivo": "pausada pelo master"}
    cand = []
    if p.get("adesao_paga_em") and p.get("ciclo_vence_em"):
        cand.append((p["ciclo_vence_em"][:10], "ciclo"))
    if p.get("anual_ate"):
        cand.append((p["anual_ate"][:10], "anual"))
    if not p.get("adesao_paga_em") and p.get("trial_ate"):
        cand.append((p["trial_ate"][:10], "teste"))
    if p.get("acesso_liberado_ate"):
        cand.append((p["acesso_liberado_ate"][:10], "liberado"))
    if not cand:
        return {**base, "situacao": "vencida"}
    data, tipo = cand[0]
    for d, t in cand[1:]:
        if d > data:
            data, tipo = d, t
    if tipo == "teste":
        return {**base, "situacao": "teste" if data >= hoje else "vencida", "teste_ate": data, "vence_em": data}
    tol = 7 if tipo == "ciclo" else 0
    return {**base, "situacao": "ativa" if somar_dias(data, tol) >= hoje else "vencida", "vence_em": data, "tolerancia_dias": tol}


def ler(schema: str, so_testes: bool) -> dict:
    s = schema
    usuarios = sql_treino(f"""
      select u.id::text as id, lower(u.email) as email, u.raw_app_meta_data->>'role' as role,
             coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as nome_meta,
             coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') as foto
        from auth.users u
       where u.email is not null
         and (exists (select 1 from {s}.physiq_profiles p where p.id = u.id)
              or exists (select 1 from {s}.physiq_professores p where p.id = u.id))""")
    if so_testes:
        usuarios = [u for u in usuarios if email_de_teste(u["email"])]
    ids = {u["id"] for u in usuarios}
    professores = [p for p in sql_treino(f"""
      select p.id::text as id, p.nome, lower(p.email) as email, p.codigo_convite, p.status, p.trial_ate::text as trial_ate,
             p.adesao_paga_em::text as adesao_paga_em, p.ciclo_vence_em::text as ciclo_vence_em, p.anual_ate::text as anual_ate,
             p.cobranca_pausada, p.acesso_liberado_ate::text as acesso_liberado_ate, pl.nome as plano_nome
        from {s}.physiq_professores p left join {s}.physiq_planos_professor pl on pl.id = p.plano_id""") if p["id"] in ids]
    perfis = [p for p in sql_treino(f"""
      select id::text as id, nome, lower(email) as email, sexo, data_nascimento::text as data_nascimento,
             professor_id::text as professor_id, status
        from {s}.physiq_profiles""") if p["id"] in ids]
    tags: dict[str, list[str]] = {}
    for t in sql_treino(f"""select ut.user_id::text as user_id, t.nome from {s}.physiq_user_tags ut
                             join {s}.physiq_tags t on t.id = ut.tag_id order by t.nome"""):
        tags.setdefault(t["user_id"], []).append(t["nome"])
    identidades = sql_treino(f"select principal_user_id::text as principal_user_id, treino_user_id::text as treino_user_id, lower(email) as email, origem from {s}.physiq_identidades")
    principal = sql_principal("""
      select u.id::text as id, lower(u.email) as email, coalesce(u.raw_app_meta_data, '{}'::jsonb) as app,
             (u.encrypted_password is not null and u.encrypted_password <> '') as tem_senha,
             exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') as tem_google
        from auth.users u where u.email is not null""")
    perfis_p = sql_principal(f"select id::text as id, role, nome, lower(email) as email from {s}.profiles")
    pacientes = sql_principal(f"""select id::text as id, user_id::text as user_id, conta_id::text as conta_id,
             nutricionista_id::text as nutricionista_id, personal_id::text as personal_id, origem, deleted_at
        from {s}.pacientes""")
    contas = sql_principal(f"select id::text as id, dono_id::text as dono_id, origem, plano, situacao, nome from {s}.contas")
    membros = sql_principal(f"""select id::text as id, conta_id::text as conta_id, user_id::text as user_id, papeis, status,
             codigo_convite from {s}.conta_membros""")
    return {"usuarios": usuarios, "professores": professores, "perfis": perfis, "tags": tags, "identidades": identidades,
            "principal": principal, "perfis_p": perfis_p, "pacientes": pacientes, "contas": contas, "membros": membros}


def planejar(d: dict, schema: str, so_testes: bool) -> dict:
    hoje = hoje_sp()
    p_por_email = {u["email"]: u for u in d["principal"]}
    ident_por_treino = {i["treino_user_id"]: i for i in d["identidades"]}
    ident_por_principal = {i["principal_user_id"]: i for i in d["identidades"]}
    prof_ids = {p["id"] for p in d["professores"]}
    usuario_por_id = {u["id"]: u for u in d["usuarios"]}
    perfil_por_id = {p["id"]: p for p in d["perfis"]}
    plano = {"schema": schema, "hoje": hoje, "usuarios_criar": [], "usuarios_marcar_calc": [], "identidades_criar": [],
             "identidades_existentes": 0, "conflitos": [], "profissionais": [], "matriculas": [], "sem_conta": [],
             "nutris": [], "p7_alunos_em_2_contas": [], "p8_profissionais_nos_2_apps": [], "so_do_espelho": [], "alunos_de_conta_nova": 0}

    # 1-2. usuários do principal e vínculos
    for u in d["usuarios"]:
        p = p_por_email.get(u["email"])
        existente = ident_por_treino.get(u["id"])
        if existente:
            plano["identidades_existentes"] += 1
            if p and existente["principal_user_id"] != p["id"]:
                plano["conflitos"].append({"tipo": "vinculo_divergente", "email": u["email"], "treino_user_id": u["id"],
                                           "principal_vinculado": existente["principal_user_id"], "principal_do_email": p["id"]})
            if p and not (p["app"] or {}).get("calc"):
                plano["usuarios_marcar_calc"].append({"principal_user_id": p["id"], "email": u["email"]})
            continue
        if not p:
            plano["usuarios_criar"].append({"email": u["email"], "treino_user_id": u["id"], "nome": perfil_por_id.get(u["id"], {}).get("nome") or u["nome_meta"],
                                            "foto": u["foto"]})
            plano["identidades_criar"].append({"email": u["email"], "treino_user_id": u["id"], "principal_user_id": None})
            continue
        if p["id"] in ident_por_principal:
            plano["conflitos"].append({"tipo": "principal_ja_vinculado_a_outro", "email": u["email"], "treino_user_id": u["id"],
                                       "principal_user_id": p["id"], "vinculado_a": ident_por_principal[p["id"]]["treino_user_id"]})
            continue
        # conta de teste com senha (as dos E2E) é nossa: liga — menos a de conflito proposital (e2e/w02/contas_teste.py)
        if p["tem_senha"] and not p["tem_google"] and not (email_de_teste(u["email"]) and not u["email"].startswith("conflito")):
            plano["conflitos"].append({"tipo": "email_com_senha_sem_google", "email": u["email"], "treino_user_id": u["id"],
                                       "principal_user_id": p["id"],
                                       "resolve": "a pessoa entra 1 vez com o Google (a troca liga pelo e-mail verificado) ou o master decide"})
            continue
        plano["identidades_criar"].append({"email": u["email"], "treino_user_id": u["id"], "principal_user_id": p["id"]})
        if not (p["app"] or {}).get("calc"):
            plano["usuarios_marcar_calc"].append({"principal_user_id": p["id"], "email": u["email"]})

    conflito_ids = {c["treino_user_id"] for c in plano["conflitos"] if c["tipo"] != "vinculo_divergente"}

    # 3. professores → conta legado_calc
    for pr in d["professores"]:
        if pr["id"] in conflito_ids:
            continue
        u = usuario_por_id.get(pr["id"], {})
        master = u.get("role") in ("admin", "master")
        # W28: a linha que o ESPELHO criou para o personal de uma conta nova (sem plano, teste, adesão, ciclo, anual ou pausa do
        # Calc) não é professor do Calc — a mesma conferência do pos-login (professorDoCalcDeVerdade). Sem isto, quem saiu de uma
        # equipe ganhava uma conta legado_calc na 2ª rodada.
        if not master and so_do_espelho(pr):
            plano["so_do_espelho"].append({"treino_user_id": pr["id"], "email": pr["email"] or u.get("email")})
            continue
        plano["profissionais"].append({"treino_user_id": pr["id"], "email": pr["email"] or u.get("email"), "nome": pr["nome"],
                                       "codigo": pr["codigo_convite"], "master": master, **conta_legado_calc(pr, master, hoje)})

    # 4. alunos com professor → matrícula na conta do professor; sem professor → "sem conta"
    so_espelho = {x["treino_user_id"] for x in plano["so_do_espelho"]}
    for pf in d["perfis"]:
        if pf["id"] in prof_ids or pf["id"] in conflito_ids:
            continue
        if pf["professor_id"] in so_espelho:
            plano["alunos_de_conta_nova"] += 1  # o aluno do personal de uma conta nova: a matrícula é do núcleo (espelho)
            continue
        if not pf["professor_id"]:
            plano["sem_conta"].append({"treino_user_id": pf["id"], "email": pf["email"] or usuario_por_id.get(pf["id"], {}).get("email")})
            continue
        if pf["professor_id"] not in prof_ids:
            plano["conflitos"].append({"tipo": "professor_fora_da_migracao", "treino_user_id": pf["id"], "professor_id": pf["professor_id"]})
            continue
        plano["matriculas"].append({
            "treino_user_id": pf["id"], "email": usuario_por_id.get(pf["id"], {}).get("email") or pf["email"],
            "professor_treino_id": pf["professor_id"], "nome": pf["nome"], "genero": GENERO.get((pf["sexo"] or "").lower()),
            "nascimento": pf["data_nascimento"], "tags": d["tags"].get(pf["id"], []), "bloqueado": pf["status"] == "bloqueado"})

    # 5. nutris do Nutri (e o master com pacientes) → conta legado_nutri
    com_pacientes = {x["nutricionista_id"] for x in d["pacientes"] if x["nutricionista_id"] and not x["deleted_at"]}
    for pp in d["perfis_p"]:
        if so_testes and not email_de_teste(pp["email"]):
            continue
        if pp["role"] == "nutricionista" or (pp["role"] == "master" and pp["id"] in com_pacientes):
            plano["nutris"].append({"principal_user_id": pp["id"], "email": pp["email"], "role": pp["role"],
                                    "pacientes_sem_conta": sum(1 for x in d["pacientes"] if x["nutricionista_id"] == pp["id"] and not x["conta_id"])})

    # relatório P7 / P8 (por e-mail)
    matricula_emails = {m["email"] for m in plano["matriculas"]}
    nutri_pac_login = {x["user_id"] for x in d["pacientes"] if x["user_id"] and x["nutricionista_id"] and not x["deleted_at"]}
    for u in d["principal"]:
        if u["email"] in matricula_emails and u["id"] in nutri_pac_login:
            plano["p7_alunos_em_2_contas"].append(u["email"])
    nutri_emails = {n["email"] for n in plano["nutris"]}
    for pr in plano["profissionais"]:
        if pr["email"] in nutri_emails:
            plano["p8_profissionais_nos_2_apps"].append(pr["email"])
    return plano


def executar(plano: dict, d: dict, schema: str) -> dict:
    s = schema
    feito = {"usuarios_criados": 0, "usuarios_marcados_calc": 0, "identidades_criadas": 0, "contas_legado_calc": {"criadas": 0, "existentes": 0},
             "codigos_em_conflito": [], "matriculas": {"criadas": 0, "existentes": 0, "recusadas": []}, "contas_legado_nutri": {"criadas": 0, "existentes": 0},
             "pacientes_nutri_ligados": 0, "erros": []}
    principal_por_email = {u["email"]: u["id"] for u in d["principal"]}

    # 1. usuários novos no principal (sem senha, e-mail já confirmado: nenhum e-mail sai)
    for u in plano["usuarios_criar"]:
        st, r = admin_principal("POST", "users", {
            "email": u["email"], "email_confirm": True,
            "app_metadata": {"origem": "calc", "calc": True},
            "user_metadata": {k: v for k, v in {"full_name": u["nome"], "avatar_url": u["foto"], "origem": "calc"}.items() if v},
        })
        if st == 200 and isinstance(r, dict) and r.get("id"):
            principal_por_email[u["email"]] = r["id"]
            feito["usuarios_criados"] += 1
        else:
            achado = sql_principal(f"select id::text as id from auth.users where lower(email) = {lit(u['email'])}")
            if achado:
                principal_por_email[u["email"]] = achado[0]["id"]
            else:
                feito["erros"].append({"etapa": "criar_usuario", "email": u["email"], "http": st, "resposta": str(r)[:300]})
    # 2. quem já existia ganha calc = true (o GoTrue junta o app_metadata)
    for u in plano["usuarios_marcar_calc"]:
        st, r = admin_principal("PUT", f"users/{u['principal_user_id']}", {"app_metadata": {"calc": True}})
        if st == 200:
            feito["usuarios_marcados_calc"] += 1
        else:
            feito["erros"].append({"etapa": "marcar_calc", "email": u["email"], "http": st, "resposta": str(r)[:300]})

    # 3. vínculos principal → Treino
    linhas = []
    for i in plano["identidades_criar"]:
        pid = i["principal_user_id"] or principal_por_email.get(i["email"])
        if not pid:
            continue
        linhas.append(f"({lit(pid)}::uuid, {lit(i['treino_user_id'])}::uuid, {lit(i['email'])}, 'migracao')")
    for bloco in range(0, len(linhas), 200):
        n = exec_treino(f"with ins as (insert into {s}.physiq_identidades (principal_user_id, treino_user_id, email, origem) values "
                        f"{','.join(linhas[bloco:bloco + 200])} on conflict do nothing returning 1) select count(*) from ins")
        feito["identidades_criadas"] += int(n or 0)
    vinculos = {x["treino_user_id"]: x["principal_user_id"] for x in sql_treino(
        f"select treino_user_id::text as treino_user_id, principal_user_id::text as principal_user_id from {s}.physiq_identidades")}

    # 4. professores → conta legado_calc + membro dono/personal
    conta_do_prof: dict[str, str] = {}
    for pr in plano["profissionais"]:
        pid = vinculos.get(pr["treino_user_id"])
        if not pid:
            feito["erros"].append({"etapa": "profissional_sem_vinculo", "email": pr["email"]})
            continue
        r = sql_principal(f"""select {s}.registrar_profissional_treino({lit(pid)}::uuid, {lit(pr['nome'])}, {lit(pr['codigo'])},
               'legado_calc', {lit(pr['faixa'])}, {lit(pr['situacao'])}, {lit(pr['teste_ate'])}::date, {lit(pr['vence_em'])}::date,
               {int(pr['tolerancia_dias'])}, {lit(pr['isenta_motivo'])}, {lit(pr['treino_user_id'])}::uuid) as r""")[0]["r"]
        conta_do_prof[pr["treino_user_id"]] = r["conta_id"]
        feito["contas_legado_calc"]["criadas" if r.get("criada") else "existentes"] += 1
        if not r.get("codigo_ok"):
            feito["codigos_em_conflito"].append({"email": pr["email"], "codigo": pr["codigo"]})

    # 5. alunos → matrícula na conta do professor (sem as regras de convite: é o vínculo que já existe hoje)
    for m in plano["matriculas"]:
        aluno = vinculos.get(m["treino_user_id"])
        prof = vinculos.get(m["professor_treino_id"])
        conta = conta_do_prof.get(m["professor_treino_id"])
        if not (aluno and prof and conta):
            feito["matriculas"]["recusadas"].append({"email": m["email"], "motivo": "sem_vinculo_ou_conta"})
            continue
        r = sql_principal(f"select {s}.matricular_na_conta({lit(aluno)}::uuid, {lit(conta)}::uuid, {lit(prof)}::uuid, null, 'calc', true) as r")[0]["r"]
        if not r.get("ok"):
            feito["matriculas"]["recusadas"].append({"email": m["email"], "motivo": r.get("erro")})
            continue
        feito["matriculas"]["existentes" if r.get("ja_era") else "criadas"] += 1
        sql_principal(f"""update {s}.pacientes set
              treino_user_id = coalesce(treino_user_id, {lit(m['treino_user_id'])}::uuid),
              nome = case when coalesce(btrim(nome), '') in ('', 'Aluno') and {lit(m['nome'])} is not null then {lit(m['nome'])} else nome end,
              genero = coalesce(genero, {lit(m['genero'])}),
              nascimento = coalesce(nascimento, {lit(m['nascimento'])}::date),
              tags = case when coalesce(array_length(tags, 1), 0) = 0 then {lit(m['tags'])} else tags end,
              acesso_bloqueado_em = case when {lit(m['bloqueado'])} and acesso_bloqueado_em is null then now() else acesso_bloqueado_em end,
              origem = coalesce(origem, 'calc')
            where id = {lit(r['paciente_id'])}::uuid""")

    # 6. nutris → conta legado_nutri (+ pacientes dela ligados à conta)
    for n in plano["nutris"]:
        r = sql_principal(f"select {s}.registrar_nutri_legado({lit(n['principal_user_id'])}::uuid) as r")[0]["r"]
        if not r.get("ok"):
            feito["erros"].append({"etapa": "nutri", "email": n["email"], "erro": r.get("erro")})
            continue
        feito["contas_legado_nutri"]["criadas" if r.get("criada") else "existentes"] += 1
        feito["pacientes_nutri_ligados"] += int(r.get("pacientes_ligados") or 0)
    return feito


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true", help="só relata o que faria (nada é gravado)")
    ap.add_argument("--relatorio", help="arquivo JSON do relatório")
    a = ap.parse_args()
    so_testes = a.schema == "staging"
    d = ler(a.schema, so_testes)
    plano = planejar(d, a.schema, so_testes)
    resumo = {
        "schema": a.schema, "dry_run": a.dry_run, "so_contas_de_teste": so_testes,
        "usuarios_do_calc": len(d["usuarios"]), "professores": len(d["professores"]),
        "usuarios_a_criar_no_principal": len(plano["usuarios_criar"]), "usuarios_a_marcar_calc": len(plano["usuarios_marcar_calc"]),
        "identidades_a_criar": len(plano["identidades_criar"]), "identidades_existentes": plano["identidades_existentes"],
        "contas_legado_calc": len(plano["profissionais"]), "matriculas_calc": len(plano["matriculas"]),
        "sem_conta": len(plano["sem_conta"]), "contas_legado_nutri": len(plano["nutris"]),
        "conflitos": len(plano["conflitos"]), "p7_alunos_em_2_contas": len(plano["p7_alunos_em_2_contas"]),
        "p8_profissionais_nos_2_apps": len(plano["p8_profissionais_nos_2_apps"]),
        "professores_so_do_espelho": len(plano["so_do_espelho"]),
        "alunos_de_conta_nova": plano["alunos_de_conta_nova"],
    }
    saida = {"resumo": resumo, "plano": plano}
    if not a.dry_run:
        saida["feito"] = executar(plano, d, a.schema)
    destino = a.relatorio or str(Path.home() / "backups" / "physiq" / f"{hoje_sp()}-w03" /
                                 f"relatorio-01-{a.schema}-{'dry' if a.dry_run else 'real'}.json")
    salvar_json(destino, saida)
    print(json.dumps({"resumo": resumo, **({"feito": saida["feito"]} if "feito" in saida else {})}, ensure_ascii=False, indent=2))
    if plano["conflitos"]:
        print("\nCONFLITOS (o master resolve; ninguém foi ligado no chute):")
        for c in plano["conflitos"]:
            print("  -", json.dumps(c, ensure_ascii=False))
    print(f"\nrelatório: {destino}")
    erros = saida.get("feito", {}).get("erros", [])
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
