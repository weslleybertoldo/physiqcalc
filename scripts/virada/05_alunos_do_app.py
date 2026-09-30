#!/usr/bin/env python3
"""Physiq — script 05 (W7b): quem estava SEM PROFESSOR vira aluno do app (a "conta do app" do banco principal).

Regra dele (29/09): "sem profissional vinculado ele paga a mensalidade do app que será pago para mim". Até a W7b, quem veio do
Calc sem professor e sem matrícula ganhava o módulo Treino de graça (minha_situacao da W3/W5); a W7b tira isso e este script:
  1. dá a essas pessoas a matrícula da conta do app (plano Treino, 7 dias grátis a partir de agora e o aviso no sino — nenhum
     e-mail); o master também ganha a dele, ISENTA (cobrança parada, sem teste — o master não paga, C93);
  2. copia para o principal, como mensalidade da conta do app, os pagamentos e as assinaturas de ALUNO SEM PROFESSOR do Banco do
     Treino (o script 02 da W6 os deixou só lá — os R$ 621 do Weslley): cobrancas (origem 'migrado_calc', o mp_payment_id e o
     comprovante) e aluno_assinaturas. O Treino fica intacto (só leitura).
Idempotente: a matrícula do app é uma por pessoa (matricular_no_app); cada pagamento/assinatura copiado guarda o id de origem
(treino_pagamento_id / treino_assinatura_id, únicos) — a 2ª rodada não cria nada. No staging só contas de TESTE (P26); em
produção só contas de verdade (as de teste do public ficam como estão: não são clientes).

Conferência (sempre no fim, ou só ela com --conferir): pagamentos · soma em R$ · comprovantes dos alunos sem professor no Treino
= os copiados no principal; assinaturas idem. Sai com erro (exit 1) se não bater.

Uso:
  python3 scripts/virada/05_alunos_do_app.py --schema staging --dry-run
  python3 scripts/virada/05_alunos_do_app.py --schema staging [--backup ~/backups/physiq/<data>-w07b] [--relatorio <arquivo.json>]
  python3 scripts/virada/05_alunos_do_app.py --schema public --conferir
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from _base import SCHEMAS, TREINO_REF, email_de_teste, hoje_sp, http, lit, pat, salvar_json, sql_principal  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent.parent
_espec = importlib.util.spec_from_file_location("script02", Path(__file__).parent / "02_pagamentos_alunos.py")
S02 = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(S02)  # type: ignore[union-attr]


def sql_treino(query: str) -> list:
    """SELECT no Banco do Treino pela Management API (o pooler de sessão falhou por minutos na W7 com o banco saudável)."""
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{TREINO_REF}/database/query", {"query": query},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    if st not in (200, 201):
        raise RuntimeError(f"SQL Treino HTTP {st}: {str(r)[:800]}")
    return r or []


# ───────────────────────────── leitura ─────────────────────────────

def ler(s: str) -> dict:
    conta = sql_principal(f"select {s}.conta_do_app()::text as id")[0]["id"]
    if not conta:
        raise SystemExit(f"PAROU: o schema {s} não tem a conta do app (aplique a migração 20260929190000_w07b_sem_profissional.sql antes)")
    dono = sql_principal(f"select dono_id::text as id from {s}.contas where id = {lit(conta)}::uuid")[0]["id"]
    # quem veio do Calc e não tem matrícula nenhuma (o "aluno sem professor" de hoje)
    sem_mat = sql_principal(f"""
        select u.id::text as id, lower(u.email) as email, coalesce(u.raw_app_meta_data ->> 'role', '') as papel,
               coalesce((select pr.role from {s}.profiles pr where pr.id = u.id), '') as papel_perfil,
               exists (select 1 from {s}.conta_membros m where m.user_id = u.id and m.status = 'ativo') as membro
          from auth.users u
         where (coalesce(u.raw_app_meta_data ->> 'calc', '') = 'true' or coalesce(u.raw_app_meta_data ->> 'origem', '') = 'calc')
           and not exists (select 1 from {s}.pacientes p where p.user_id = u.id and p.deleted_at is null)""")
    ja_no_app = {x["user_id"] for x in sql_principal(
        f"select user_id::text as user_id from {s}.pacientes where conta_id = {lit(conta)}::uuid and deleted_at is null and user_id is not null")}
    # pagamentos e assinaturas de ALUNO SEM PROFESSOR no Treino (o que o script 02 deixou de fora)
    pags = sql_treino(f"""
        select g.id::text as id, g.user_id::text as user_id, g.tipo, g.metodo, g.valor::text as valor, g.mes_ref::text as mes_ref,
               g.mp_payment_id, g.status, g.pix_qr_code, g.pix_qr_code_base64, g.pix_expira_em::text as pix_expira_em,
               g.comprovante_path, g.confirmado_por::text as confirmado_por, g.recusado_motivo,
               g.created_at::text as created_at, g.updated_at::text as updated_at, lower(u.email) as email
          from {s}.physiq_pagamentos g
          join {s}.physiq_profiles p on p.id = g.user_id
          left join auth.users u on u.id = g.user_id
         where g.contexto = 'aluno' and p.professor_id is null
         order by g.created_at""")
    ass = sql_treino(f"""
        select a.id::text as id, a.user_id::text as user_id, a.mp_preapproval_id, a.status, a.valor::text as valor,
               a.created_at::text as created_at, lower(u.email) as email
          from {s}.physiq_assinaturas a
          join {s}.physiq_profiles p on p.id = a.user_id
          left join auth.users u on u.id = a.user_id
         where a.contexto = 'aluno' and p.professor_id is null""")
    ident = {x["t"]: x["p"] for x in sql_treino(f"select principal_user_id::text as p, treino_user_id::text as t from {s}.physiq_identidades")}
    copiados = {x["tid"] for x in sql_principal(f"select treino_pagamento_id::text as tid from {s}.cobrancas where treino_pagamento_id is not null")}
    por_mp = {x["mp"]: x for x in sql_principal(
        f"select id::text as id, mp_payment_id as mp, treino_pagamento_id::text as tid from {s}.cobrancas where mp_payment_id is not null")}
    ass_copiadas = {x["tid"] for x in sql_principal(
        f"select treino_assinatura_id::text as tid from {s}.aluno_assinaturas where treino_assinatura_id is not null")}
    ass_mp = {x["mp"] for x in sql_principal(f"select mp_preapproval_id as mp from {s}.aluno_assinaturas where mp_preapproval_id is not null")}
    return {"conta": conta, "dono": dono, "sem_mat": sem_mat, "ja_no_app": ja_no_app, "pags": pags, "ass": ass, "ident": ident,
            "copiados": copiados, "por_mp": por_mp, "ass_copiadas": ass_copiadas, "ass_mp": ass_mp}


def pessoa_ok(s: str, email: str | None) -> bool:
    """staging: só contas de teste (P26); produção: só contas de verdade (as de teste do public não são clientes)."""
    teste = email_de_teste(email)
    return teste if s == "staging" else not teste


# ───────────────────────────── plano ─────────────────────────────

def planejar(s: str, d: dict) -> dict:
    plano = {"matriculas": [], "cobrancas": [], "vinculos": [], "assinaturas": [], "fora": {"sem_login_no_principal": [], "fora_do_ambiente": []}}
    for u in d["sem_mat"]:
        if not pessoa_ok(s, u["email"]):
            continue
        master = u["papel"] == "master" or u["papel_perfil"] == "master"
        plano["matriculas"].append({"user_id": u["id"], "motivo": "master" if master else "migracao_calc", "teste": not master,
                                    "membro": u["membro"]})
    novos = {m["user_id"] for m in plano["matriculas"]}
    for g in d["pags"]:
        if not pessoa_ok(s, g["email"]):
            plano["fora"]["fora_do_ambiente"].append(g["id"])
            continue
        principal = d["ident"].get(g["user_id"])
        if not principal:
            plano["fora"]["sem_login_no_principal"].append(g["id"])
            continue
        if g["id"] in d["copiados"]:
            continue
        existente = d["por_mp"].get(g["mp_payment_id"]) if g["mp_payment_id"] else None
        if existente and not existente["tid"]:
            plano["vinculos"].append({"cobranca_id": existente["id"], "treino_pagamento_id": g["id"]})
            continue
        mes = (g["mes_ref"] or g["created_at"])[:7] + "-01"
        st = S02.status_da_cobranca(g)
        plano["cobrancas"].append({
            "pag": g, "principal": principal, "descricao": S02.descricao("Treino", mes), "mes_ref": mes, "vencimento": g["created_at"][:10],
            "forma": S02.forma_da_cobranca(g["tipo"]),
            "metodo": g["metodo"] or ("pix" if g["tipo"] in ("pix", "pix_manual") else "cartao" if g["tipo"] == "cartao" else None),
            "pago_em": S02.data_da_cobertura(g) if st["status"] == "paga" else None, **st,
            "precisa_matricula": principal not in d["ja_no_app"] and principal not in novos,
        })
    for a in d["ass"]:
        if not pessoa_ok(s, a["email"]):
            continue
        principal = d["ident"].get(a["user_id"])
        if not principal or a["id"] in d["ass_copiadas"] or (a["mp_preapproval_id"] and a["mp_preapproval_id"] in d["ass_mp"]):
            continue
        plano["assinaturas"].append({"a": a, "principal": principal})
    return plano


# ───────────────────────────── gravação ─────────────────────────────

def matricula_do_app(s: str, conta: str, user: str) -> str | None:
    r = sql_principal(f"""select id::text as id from {s}.pacientes where user_id = {lit(user)}::uuid and conta_id = {lit(conta)}::uuid
                          and deleted_at is null order by ativo desc, created_at limit 1""")
    return r[0]["id"] if r else None


def gravar(s: str, d: dict, pl: dict) -> dict:
    feitas = []
    for m in pl["matriculas"]:
        r = sql_principal(f"select {s}.matricular_no_app({lit(m['user_id'])}::uuid, null, 'app_treino', {lit(m['motivo'])}, {lit(m['teste'])}) as r")[0]["r"]
        feitas.append({"user_id": m["user_id"], "motivo": m["motivo"], "resultado": r})
        if not r.get("ok"):
            raise SystemExit(f"PAROU: matricular_no_app recusou {m['user_id']}: {r}")
    # quem tem pagamento sem professor e não tinha como entrar acima (ex.: já tinha matrícula inativa) — garante a do app isenta
    for x in pl["cobrancas"] + pl["assinaturas"]:
        if not matricula_do_app(s, d["conta"], x["principal"]):
            r = sql_principal(f"select {s}.matricular_no_app({lit(x['principal'])}::uuid, null, 'app_treino', 'master', false) as r")[0]["r"]
            feitas.append({"user_id": x["principal"], "motivo": "pagamentos_sem_professor", "resultado": r})
    lote: list[str] = []
    for x in pl["cobrancas"]:
        g = x["pag"]
        pid = matricula_do_app(s, d["conta"], x["principal"])
        if not pid:
            raise SystemExit(f"PAROU: sem matrícula do app para {x['principal']}")
        lote.append(f"""insert into {s}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, tipo, descricao, valor, vencimento, mes_ref, status,
              forma, metodo, pago_em, enviado_em, comprovante_path, confirmado_por, confirmado_em, recusado_motivo, recusado_em, reembolsado_em,
              mp_payment_id, mp_status, pix_qr, pix_copia_cola, pix_expira_em, plano_aluno_id, origem, treino_pagamento_id, created_at, updated_at)
            values ({lit(pid)}::uuid, {lit(d['conta'])}::uuid, {lit(d['dono'])}::uuid, null, 'mensalidade', {lit(x['descricao'])},
              {lit(g['valor'])}::numeric, {lit(x['vencimento'])}::date, {lit(x['mes_ref'])}::date, {lit(x['status'])}, {lit(x['forma'])}, {lit(x['metodo'])},
              {lit(x['pago_em'])}::timestamptz, {lit(g['created_at'] if g['tipo'] == 'pix_manual' else None)}::timestamptz, {lit(g['comprovante_path'])},
              null, {lit(g['updated_at'] if x['status'] == 'paga' and g['tipo'] in ('pix_manual', 'manual') else None)}::timestamptz,
              {lit(x.get('recusado_motivo'))}, {lit(x.get('recusado_em'))}::timestamptz, {lit(x.get('reembolsado_em'))}::timestamptz,
              {lit(g['mp_payment_id'])}, {lit(g['status'] if x['forma'] == 'mp' else None)}, {lit(g['pix_qr_code_base64'])}, {lit(g['pix_qr_code'])},
              {lit(g['pix_expira_em'])}::timestamptz, (select plano_aluno_id from {s}.pacientes where id = {lit(pid)}::uuid), 'migrado_calc',
              {lit(g['id'])}::uuid, {lit(g['created_at'])}::timestamptz, {lit(g['updated_at'])}::timestamptz)
            on conflict do nothing;""")
    for v in pl["vinculos"]:
        lote.append(f"update {s}.cobrancas set treino_pagamento_id = {lit(v['treino_pagamento_id'])}::uuid where id = {lit(v['cobranca_id'])}::uuid and treino_pagamento_id is null;")
    for x in pl["assinaturas"]:
        a = x["a"]
        pid = matricula_do_app(s, d["conta"], x["principal"])
        lote.append(f"""insert into {s}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, treino_assinatura_id, payload, criado_em)
            values ({lit(pid)}::uuid, {lit(d['conta'])}::uuid, {lit(a['mp_preapproval_id'])}, {lit(a['status'])}, {lit(a['valor'])}::numeric,
              {lit(a['id'])}::uuid, jsonb_build_object('origem', 'migrado_calc', 'sem_professor', true), {lit(a['created_at'])}::timestamptz)
            on conflict do nothing;""")
    if lote:
        sql_principal("begin;\n" + "\n".join(lote) + "\ncommit;")
    return {"matriculas": feitas}


# ───────────────────────────── conferência ─────────────────────────────

def conferir(s: str) -> dict:
    d = ler(s)
    alvo = [g for g in d["pags"] if pessoa_ok(s, g["email"]) and d["ident"].get(g["user_id"])]
    duas = Decimal("0.01")
    antes = {"pagamentos": len(alvo), "soma": str(sum((Decimal(g["valor"]) for g in alvo), Decimal(0)).quantize(duas)),
             "comprovantes": sum(1 for g in alvo if g["comprovante_path"])}
    ids = ",".join(lit(g["id"]) + "::uuid" for g in alvo) or "null"
    cobs = sql_principal(f"""select c.treino_pagamento_id::text as tid, c.valor::text as valor, c.comprovante_path, c.conta_id::text as conta
                               from {s}.cobrancas c where c.treino_pagamento_id in ({ids})""") if alvo else []
    depois = {"pagamentos": len(cobs), "soma": str(sum((Decimal(c["valor"]) for c in cobs), Decimal(0)).quantize(duas)),
              "comprovantes": sum(1 for c in cobs if c["comprovante_path"])}
    fora_da_conta = [c["tid"] for c in cobs if c["conta"] != d["conta"]]
    ass_alvo = [a for a in d["ass"] if pessoa_ok(s, a["email"]) and d["ident"].get(a["user_id"])]
    ass_ids = ",".join(lit(a["id"]) + "::uuid" for a in ass_alvo) or "null"
    ass_depois = sql_principal(f"select count(*)::int as n from {s}.aluno_assinaturas where treino_assinatura_id in ({ass_ids})")[0]["n"] if ass_alvo else 0
    mats = sql_principal(f"""select count(*)::int as n, count(*) filter (where cobranca_pausada)::int as isentas,
                                    count(*) filter (where app_teste_ate is not null)::int as com_teste
                               from {s}.pacientes where conta_id = {lit(d['conta'])}::uuid and deleted_at is null""")[0]
    faltam = [u["id"] for u in d["sem_mat"] if pessoa_ok(s, u["email"])]
    ok = antes == depois and not fora_da_conta and ass_depois == len(ass_alvo) and not faltam
    return {"schema": s, "conta_do_app": d["conta"], "pagamentos_sem_professor": {"antes": antes, "depois": depois},
            "assinaturas_sem_professor": {"antes": len(ass_alvo), "depois": ass_depois}, "fora_da_conta_do_app": fora_da_conta,
            "sem_matricula_ainda": faltam, "matriculas_do_app": mats, "ok": ok}


def imprimir(c: dict) -> None:
    a, dd = c["pagamentos_sem_professor"]["antes"], c["pagamentos_sem_professor"]["depois"]
    print(f"\nConferência ({c['schema']}) — alunos sem professor (Treino → conta do app do principal)")
    print(f"  pagamentos: {a['pagamentos']}→{dd['pagamentos']} · R$ {a['soma']}→R$ {dd['soma']} · comprovantes {a['comprovantes']}→{dd['comprovantes']}")
    print(f"  assinaturas: {c['assinaturas_sem_professor']['antes']}→{c['assinaturas_sem_professor']['depois']}")
    print(f"  matrículas da conta do app: {c['matriculas_do_app']} · ainda sem matrícula: {len(c['sem_matricula_ainda'])}")
    for t in c["fora_da_conta_do_app"]:
        print(f"  FALHA pagamento {t} copiado fora da conta do app")
    print("  RESULTADO:", "ok" if c["ok"] else "NÃO BATEU")


def fazer_backup(pasta: str, s: str) -> None:
    base = Path(pasta).expanduser()
    subprocess.run([sys.executable, str(RAIZ / "scripts/backup/backup_principal.py"), "--pasta", str(base / "principal"), "--schemas", s,
                    "--tabelas", "pacientes,cobrancas,aluno_assinaturas,avisos,conta_eventos,contas,planos_aluno,espelho_pendencias",
                    "--rotulo", f"antes-05-{s}"], check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true", help="só relata o que faria")
    ap.add_argument("--conferir", action="store_true", help="só a conferência (nada é gravado)")
    ap.add_argument("--backup", help="pasta do backup antes de gravar (ex.: ~/backups/physiq/2026-09-29-w07b)")
    ap.add_argument("--relatorio", help="grava o relatório (JSON; sem e-mails)")
    a = ap.parse_args()
    s = a.schema
    if a.conferir:
        c = conferir(s)
        imprimir(c)
        if a.relatorio:
            salvar_json(a.relatorio, c)
        return 0 if c["ok"] else 1
    d = ler(s)
    pl = planejar(s, d)
    resumo = {"matriculas_novas": len(pl["matriculas"]), "isentas": sum(1 for m in pl["matriculas"] if m["motivo"] == "master"),
              "com_7_dias": sum(1 for m in pl["matriculas"] if m["teste"]), "profissionais_tambem": sum(1 for m in pl["matriculas"] if m["membro"]),
              "cobrancas": len(pl["cobrancas"]), "vinculos": len(pl["vinculos"]), "assinaturas": len(pl["assinaturas"]),
              "soma_cobrancas": str(sum((Decimal(x["pag"]["valor"]) for x in pl["cobrancas"]), Decimal(0))),
              "fora": {k: len(v) for k, v in pl["fora"].items()}}
    print(f"Script 05 ({s}){' — DRY-RUN' if a.dry_run else ''} · {hoje_sp()}: {json.dumps(resumo, ensure_ascii=False)}")
    for m in pl["matriculas"]:
        print(f"  matrícula do app: {m['user_id']} · {m['motivo']}{' · 7 dias grátis' if m['teste'] else ' · isenta'}{' · também é profissional' if m['membro'] else ''}")
    rel = {"schema": s, "hoje": hoje_sp(), "dry_run": a.dry_run, "resumo": resumo,
           "matriculas": [{k: v for k, v in m.items()} for m in pl["matriculas"]],
           "cobrancas": [{"treino_pagamento_id": x["pag"]["id"], "principal": x["principal"], "valor": x["pag"]["valor"], "status": x["status"]} for x in pl["cobrancas"]],
           "assinaturas": [{"treino_assinatura_id": x["a"]["id"], "status": x["a"]["status"]} for x in pl["assinaturas"]]}
    if a.dry_run:
        if a.relatorio:
            salvar_json(a.relatorio, rel)
        return 0
    if a.backup:
        fazer_backup(a.backup, s)
    rel["gravado"] = gravar(s, d, pl)
    c = conferir(s)
    rel["conferencia"] = c
    imprimir(c)
    if a.relatorio:
        salvar_json(a.relatorio, rel)
    return 0 if c["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
