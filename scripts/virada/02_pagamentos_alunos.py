#!/usr/bin/env python3
"""Physiq — script 02 da virada (spec §8.4; W6): a cobrança aluno → profissional do Calc vai para o BANCO PRINCIPAL.

Copia do Banco do Treino (só lê — as tabelas de lá ficam intactas) para o principal, no schema escolhido:
  · physiq_planos (os usados pelos alunos de cada professor + os do próprio professor) → planos_aluno da conta dele;
  · plano, valor e "cobrança parada" do aluno (physiq_profiles.plano_nome/mensalidade_valor/cobranca_pausada) → a matrícula;
  · physiq_pagamentos de ALUNO → cobrancas (tipo mensalidade, origem 'migrado_calc', o mp_payment_id e o comprovante);
  · physiq_assinaturas de ALUNO → aluno_assinaturas;
  · physiq_recebimentos (chaves Pix) → recebimento_chaves da conta; physiq_integracoes → contas.recebimento_modo;
  · os arquivos do bucket de comprovantes do Treino → o bucket do principal, nos MESMOS caminhos (nada é apagado lá).
Idempotente: cada linha copiada guarda o id de origem (treino_pagamento_id, treino_assinatura_id, treino_recebimento_id,
treino_plano_id); a 2ª rodada não cria nada e não reescreve o que o profissional já mudou no principal (a matrícula leva a
marca financeiro_migrado_em; a conta, o evento w06_recebimento).
No staging só entram contas de TESTE (P26). Pagamento de aluno SEM professor (ex.: o próprio master pagando como aluno) não
tem conta para onde ir: fica só no Treino e aparece no relatório à parte.

Conferência (sempre ao fim, ou só ela com --conferir): por professor, número de pagamentos, soma em R$ e número de
comprovantes no Treino = no principal; arquivos por pasta de professor; sai com erro (exit 1) se algo não bater.

Uso:
  python3 scripts/virada/02_pagamentos_alunos.py --schema staging --dry-run
  python3 scripts/virada/02_pagamentos_alunos.py --schema staging [--backup ~/backups/physiq/<data>-w06]
  python3 scripts/virada/02_pagamentos_alunos.py --schema staging --conferir
  (--relatorio <arquivo.json> grava o relatório; --sem-arquivos pula a cópia do Storage)
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _base import (  # noqa: E402
    PRINCIPAL_REF,
    PRINCIPAL_URL,
    SCHEMAS,
    TREINO_REF,
    _service_principal,
    email_de_teste,
    hoje_sp,
    http,
    lit,
    pat,
    salvar_json,
    sql_principal,
    sql_treino,
)

TREINO_URL = f"https://{TREINO_REF}.supabase.co"
RAIZ = Path(__file__).resolve().parent.parent.parent
MODO_INTEGRACAO = {"mercadopago": "mercadopago", "pix_manual": "pix_manual", "none": "nenhum"}
MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]


@lru_cache(maxsize=None)
def service_treino() -> str:
    st, lista = http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/api-keys?reveal=true", cab={"Authorization": f"Bearer {pat()}"})
    if st != 200:
        raise RuntimeError(f"api-keys do Treino: HTTP {st}")
    return {k["name"]: k["api_key"] for k in lista}["service_role"]


def bucket(schema: str) -> str:
    return "comprovantes-staging" if schema == "staging" else "comprovantes"


def mes_por_extenso(mes_ref: str | None) -> str:
    if not mes_ref:
        return ""
    a, m = mes_ref[:7].split("-")
    return f"{MESES[int(m) - 1]}/{a}"


def descricao(plano: str | None, mes_ref: str) -> str:
    return " · ".join(x for x in ["Mensalidade", (plano or "").strip(), mes_por_extenso(mes_ref)] if x)


def status_da_cobranca(pag: dict) -> dict:
    """physiq_pagamentos → cobrancas (o mesmo mapa da pagamentos-aluno/mp-webhook-aluno — _shared/financeiro-regras.ts)."""
    st = pag["status"]
    tipo = pag["tipo"]
    if st == "approved":
        return {"status": "paga"}
    if st == "aguardando_confirmacao":
        return {"status": "aguardando_confirmacao"}
    if st in ("pending", "in_process"):
        return {"status": "aguardando_confirmacao"}
    if st in ("refunded", "charged_back"):
        return {"status": "cancelada", "reembolsado_em": pag["updated_at"]}
    if st == "rejected" and tipo == "pix_manual":
        return {"status": "cancelada", "recusado_em": pag["updated_at"], "recusado_motivo": pag.get("recusado_motivo") or "Comprovante não confere"}
    return {"status": "cancelada"}  # rejected (MP), cancelled, expired


def forma_da_cobranca(tipo: str) -> str:
    return {"pix_manual": "pix_manual", "manual": "manual"}.get(tipo, "mp")


def data_da_cobertura(pag: dict) -> str:
    """A data que conta pra cobertura no Calc (mp-payments: dataCobertura): pix_manual = quando o aluno avisou; o resto = aprovação."""
    return pag["created_at"] if pag["tipo"] == "pix_manual" else (pag["updated_at"] or pag["created_at"])


# ───────────────────────────── leitura ─────────────────────────────

def ler_treino(s: str) -> dict:
    perfis = sql_treino(f"""select p.id::text as id, p.professor_id::text as professor_id, p.mensalidade_valor::text as mensalidade_valor,
                                   p.plano_nome, p.cobranca_pausada, u.email
                              from {s}.physiq_profiles p left join auth.users u on u.id = p.id""")
    pagamentos = sql_treino(f"""select id::text as id, user_id::text as user_id, tipo, metodo, valor::text as valor, mes_ref::text as mes_ref,
                                       mp_payment_id, status, pix_qr_code, pix_qr_code_base64, pix_expira_em::text as pix_expira_em,
                                       comprovante_path, confirmado_por::text as confirmado_por, recusado_motivo,
                                       created_at::text as created_at, updated_at::text as updated_at
                                  from {s}.physiq_pagamentos where contexto = 'aluno' order by created_at""")
    assinaturas = sql_treino(f"""select id::text as id, user_id::text as user_id, mp_preapproval_id, status, valor::text as valor,
                                        created_at::text as created_at from {s}.physiq_assinaturas where contexto = 'aluno'""")
    planos = sql_treino(f"select id::text as id, nome, professor_id::text as professor_id from {s}.physiq_planos")
    receb = sql_treino(f"""select id::text as id, professor_id::text as professor_id, tipo, pix_tipo, pix_chave, pix_favorecido, pix_banco,
                                  ativo, criado_em::text as criado_em from {s}.physiq_recebimentos order by criado_em""")
    integ = sql_treino(f"select professor_id::text as professor_id, tipo from {s}.physiq_integracoes")
    ident = sql_treino(f"select principal_user_id::text as p, treino_user_id::text as t from {s}.physiq_identidades")
    return {"perfis": {x["id"]: x for x in perfis}, "pagamentos": pagamentos, "assinaturas": assinaturas, "planos": planos,
            "recebimentos": receb, "integracoes": {x["professor_id"]: x["tipo"] for x in integ},
            "t2p": {x["t"]: x["p"] for x in ident}, "p2t": {x["p"]: x["t"] for x in ident}}


def ler_principal(s: str) -> dict:
    mats = sql_principal(f"""select p.id::text as id, p.treino_user_id::text as treino_user_id, p.conta_id::text as conta_id, p.ativo,
                                    p.deleted_at is not null as apagada, p.financeiro_migrado_em::text as migrado, c.dono_id::text as dono_id
                               from {s}.pacientes p join {s}.contas c on c.id = p.conta_id
                              where p.treino_user_id is not null""")
    contas = sql_principal(f"select id::text as id, dono_id::text as dono_id, origem, recebimento_modo from {s}.contas")
    membros = sql_principal(f"select id::text as id, conta_id::text as conta_id, user_id::text as user_id, papeis from {s}.conta_membros where status = 'ativo'")
    cobs = sql_principal(f"""select id::text as id, treino_pagamento_id::text as treino_pagamento_id, mp_payment_id, paciente_id::text as paciente_id,
                                    valor::text as valor, comprovante_path, deleted_at is not null as apagada
                               from {s}.cobrancas""")
    planos = sql_principal(f"select id::text as id, conta_id::text as conta_id, nome, treino_plano_id::text as treino_plano_id from {s}.planos_aluno")
    ass = sql_principal(f"select id::text as id, treino_assinatura_id::text as treino_assinatura_id, mp_preapproval_id from {s}.aluno_assinaturas")
    chaves = sql_principal(f"select id::text as id, conta_id::text as conta_id, treino_recebimento_id::text as treino_recebimento_id, ativa from {s}.recebimento_chaves")
    eventos = sql_principal(f"select conta_id::text as conta_id from {s}.conta_eventos where tipo = 'outro' and depois ->> 'w06' = 'recebimento_migrado'")
    return {"mats": mats, "contas": {c["id"]: c for c in contas}, "membros": membros, "cobrancas": cobs, "planos": planos,
            "assinaturas": ass, "chaves": chaves, "contas_migradas": {e["conta_id"] for e in eventos}}


def matricula_do_aluno(p: dict, aluno_treino: str, prof_treino: str | None, t2p: dict) -> dict | None:
    """A matrícula do aluno do Calc: a da conta do professor dele (P7: se houver 2, a dessa conta)."""
    cands = [m for m in p["mats"] if m["treino_user_id"] == aluno_treino and not m["apagada"]]
    if not cands:
        return None
    dono = t2p.get(prof_treino) if prof_treino else None
    for m in cands:
        if dono and m["dono_id"] == dono:
            return m
    return sorted(cands, key=lambda m: (not m["ativo"]))[0]


# ───────────────────────────── plano ─────────────────────────────

def planejar(s: str, t: dict, p: dict) -> dict:
    so_testes = s == "staging"
    perfis = t["perfis"]
    t2p = t["t2p"]
    plano = {"planos": [], "matriculas": [], "cobrancas": [], "vinculos": [], "assinaturas": [], "chaves": [], "contas": [],
             "fora": {"sem_professor": [], "sem_matricula": [], "nao_teste": []}}

    def aluno_ok(uid: str) -> bool:
        return not so_testes or email_de_teste((perfis.get(uid) or {}).get("email"))

    conta_do_prof: dict[str, str] = {}
    for m in p["mats"]:
        if m["dono_id"] and m["dono_id"] in t["p2t"]:
            conta_do_prof.setdefault(t["p2t"][m["dono_id"]], m["conta_id"])
    for c in p["contas"].values():
        if c["origem"] == "legado_calc" and c["dono_id"] in t["p2t"]:
            conta_do_prof.setdefault(t["p2t"][c["dono_id"]], c["id"])

    # alunos com professor e matrícula
    alunos: dict[str, dict] = {}
    for uid, pf in perfis.items():
        prof = pf["professor_id"]
        if not prof:
            continue
        m = matricula_do_aluno(p, uid, prof, t2p)
        if m:
            alunos[uid] = {"perfil": pf, "mat": m, "prof": prof}

    # 1. planos da conta (os usados pelos alunos + os do professor)
    existentes = {(x["conta_id"], x["nome"].strip().lower()) for x in p["planos"]}
    por_nome = {pl["nome"].strip().lower(): pl for pl in t["planos"]}
    desejados: dict[tuple[str, str], dict] = {}
    for uid, a in alunos.items():
        if not aluno_ok(uid):
            continue
        nome = (a["perfil"]["plano_nome"] or "").strip()
        if nome:
            pl = por_nome.get(nome.lower())
            desejados[(a["mat"]["conta_id"], nome.lower())] = {"conta_id": a["mat"]["conta_id"], "nome": nome, "treino_plano_id": pl["id"] if pl else None}
    for pl in t["planos"]:
        if pl["professor_id"] and pl["professor_id"] in conta_do_prof and (not so_testes or email_de_teste((perfis.get(pl["professor_id"]) or {}).get("email"))):
            cid = conta_do_prof[pl["professor_id"]]
            desejados.setdefault((cid, pl["nome"].strip().lower()), {"conta_id": cid, "nome": pl["nome"].strip(), "treino_plano_id": pl["id"]})
    plano["planos"] = [v for k, v in desejados.items() if k not in existentes]

    # 2. matrícula: plano, valor, cobrança parada (só na 1ª vez)
    for uid, a in alunos.items():
        if not aluno_ok(uid) or a["mat"]["migrado"]:
            continue
        pf = a["perfil"]
        valor = Decimal(pf["mensalidade_valor"]) if pf["mensalidade_valor"] not in (None, "") else None
        plano["matriculas"].append({"paciente_id": a["mat"]["id"], "conta_id": a["mat"]["conta_id"], "plano_nome": (pf["plano_nome"] or "").strip() or None,
                                    "valor": str(valor) if valor and valor > 0 else None, "pausada": bool(pf["cobranca_pausada"]), "aluno": uid})

    # 3. pagamentos de aluno → cobranças
    ja_copiados = {c["treino_pagamento_id"] for c in p["cobrancas"] if c["treino_pagamento_id"]}
    por_mp = {c["mp_payment_id"]: c for c in p["cobrancas"] if c["mp_payment_id"]}
    for pag in t["pagamentos"]:
        uid = pag["user_id"]
        pf = perfis.get(uid)
        if so_testes and not aluno_ok(uid):
            plano["fora"]["nao_teste"].append(pag["id"])
            continue
        if not pf or not pf["professor_id"]:
            plano["fora"]["sem_professor"].append({"id": pag["id"], "aluno": uid, "valor": pag["valor"], "status": pag["status"],
                                                   "comprovante": bool(pag["comprovante_path"])})
            continue
        a = alunos.get(uid)
        if not a:
            plano["fora"]["sem_matricula"].append({"id": pag["id"], "aluno": uid, "professor": pf["professor_id"], "valor": pag["valor"]})
            continue
        if pag["id"] in ja_copiados:
            continue
        existente = por_mp.get(pag["mp_payment_id"]) if pag["mp_payment_id"] else None
        if existente and not existente["treino_pagamento_id"]:
            # o repasse do webhook já criou a linha deste pagamento: só liga a origem
            plano["vinculos"].append({"cobranca_id": existente["id"], "treino_pagamento_id": pag["id"]})
            continue
        mes = (pag["mes_ref"] or pag["created_at"])[:7] + "-01"
        st = status_da_cobranca(pag)
        plano["cobrancas"].append({
            "pag": pag, "paciente_id": a["mat"]["id"], "conta_id": a["mat"]["conta_id"], "nutricionista_id": a["mat"]["dono_id"],
            "descricao": descricao(a["perfil"]["plano_nome"], mes), "mes_ref": mes, "vencimento": pag["created_at"][:10],
            "forma": forma_da_cobranca(pag["tipo"]), "metodo": pag["metodo"] or ("pix" if pag["tipo"] in ("pix", "pix_manual") else "cartao" if pag["tipo"] == "cartao" else None),
            "pago_em": data_da_cobertura(pag) if st["status"] == "paga" else None,
            "confirmado_por": t2p.get(pag["confirmado_por"]) if pag["confirmado_por"] else None, **st,
            "professor": a["prof"], "plano_nome": (a["perfil"]["plano_nome"] or "").strip() or None,
        })

    # 4. assinaturas de aluno
    ja_ass = {x["treino_assinatura_id"] for x in p["assinaturas"] if x["treino_assinatura_id"]}
    ja_pre = {x["mp_preapproval_id"] for x in p["assinaturas"] if x["mp_preapproval_id"]}
    for a_ in t["assinaturas"]:
        uid = a_["user_id"]
        if so_testes and not aluno_ok(uid):
            continue
        al = alunos.get(uid)
        if not al:
            plano["fora"]["sem_professor" if not (perfis.get(uid) or {}).get("professor_id") else "sem_matricula"].append({"assinatura": a_["id"], "aluno": uid, "status": a_["status"]})
            continue
        if a_["id"] in ja_ass or (a_["mp_preapproval_id"] and a_["mp_preapproval_id"] in ja_pre):
            continue
        plano["assinaturas"].append({"a": a_, "paciente_id": al["mat"]["id"], "conta_id": al["mat"]["conta_id"]})

    # 5. chaves Pix e modo de recebimento da conta do professor
    ja_chave = {x["treino_recebimento_id"] for x in p["chaves"] if x["treino_recebimento_id"]}
    ativa_na_conta = {x["conta_id"] for x in p["chaves"] if x["ativa"]}
    for r in t["recebimentos"]:
        if r["tipo"] != "pix" or not r["pix_chave"] or not r["pix_tipo"]:
            continue
        prof = r["professor_id"]
        if so_testes and not email_de_teste((perfis.get(prof) or {}).get("email")):
            continue
        cid = conta_do_prof.get(prof)
        if not cid or r["id"] in ja_chave:
            continue
        membro = next((m for m in p["membros"] if m["conta_id"] == cid and m["user_id"] == t2p.get(prof)), None)
        ativa = bool(r["ativo"]) and cid not in ativa_na_conta
        if ativa:
            ativa_na_conta.add(cid)
        plano["chaves"].append({"r": r, "conta_id": cid, "membro_id": membro["id"] if membro else None, "ativa": ativa})
    for prof, tipo in t["integracoes"].items():
        if so_testes and not email_de_teste((perfis.get(prof) or {}).get("email")):
            continue
        cid = conta_do_prof.get(prof)
        if not cid or cid in p["contas_migradas"]:
            continue
        modo = MODO_INTEGRACAO.get(tipo, "pix_manual")
        plano["contas"].append({"conta_id": cid, "modo": modo, "antes": p["contas"][cid]["recebimento_modo"], "professor": prof})
    return plano


# ───────────────────────────── gravação ─────────────────────────────

def gravar(s: str, pl: dict) -> None:
    cmds: list[str] = []
    for x in pl["planos"]:
        cmds.append(f"""insert into {s}.planos_aluno (conta_id, nome, treino_plano_id) values ({lit(x['conta_id'])}, {lit(x['nome'])}, {lit(x['treino_plano_id'])}::uuid)
                        on conflict (conta_id, lower(btrim(nome))) do nothing;""")
    if cmds:
        sql_principal("begin;\n" + "\n".join(cmds) + "\ncommit;")
    cmds = []
    for x in pl["matriculas"]:
        plano_id = (f"(select id from {s}.planos_aluno where conta_id = {lit(x['conta_id'])}::uuid and lower(btrim(nome)) = lower(btrim({lit(x['plano_nome'])})) limit 1)"
                    if x["plano_nome"] else "null")
        cmds.append(f"""update {s}.pacientes set plano_aluno_id = coalesce(plano_aluno_id, {plano_id}),
                          mensalidade_valor = coalesce(mensalidade_valor, {lit(x['valor'])}::numeric),
                          cobranca_pausada = cobranca_pausada or {lit(x['pausada'])}, financeiro_migrado_em = now()
                        where id = {lit(x['paciente_id'])}::uuid and financeiro_migrado_em is null;""")
    if cmds:
        sql_principal("begin;\n" + "\n".join(cmds) + "\ncommit;")
    # cobranças em lotes de 40 (cada inserção dispara o recálculo da mensalidade daquele aluno)
    lote: list[str] = []

    def despejar() -> None:
        if lote:
            sql_principal("begin;\n" + "\n".join(lote) + "\ncommit;")
            lote.clear()

    for x in pl["cobrancas"]:
        g = x["pag"]
        plano_id = (f"(select id from {s}.planos_aluno where conta_id = {lit(x['conta_id'])}::uuid and lower(btrim(nome)) = lower(btrim({lit(x['plano_nome'])})) limit 1)"
                    if x["plano_nome"] else "null")
        lote.append(f"""insert into {s}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, tipo, descricao, valor, vencimento, mes_ref, status,
              forma, metodo, pago_em, enviado_em, comprovante_path, confirmado_por, confirmado_em, recusado_motivo, recusado_em, reembolsado_em,
              mp_payment_id, mp_status, pix_qr, pix_copia_cola, pix_expira_em, plano_aluno_id, origem, treino_pagamento_id, created_at, updated_at)
            values ({lit(x['paciente_id'])}::uuid, {lit(x['conta_id'])}::uuid, {lit(x['nutricionista_id'])}::uuid, null, 'mensalidade', {lit(x['descricao'])},
              {lit(g['valor'])}::numeric, {lit(x['vencimento'])}::date, {lit(x['mes_ref'])}::date, {lit(x['status'])}, {lit(x['forma'])}, {lit(x['metodo'])},
              {lit(x['pago_em'])}::timestamptz, {lit(g['created_at'] if g['tipo'] == 'pix_manual' else None)}::timestamptz, {lit(g['comprovante_path'])},
              {lit(x['confirmado_por'])}::uuid, {lit(g['updated_at'] if x['status'] == 'paga' and g['tipo'] in ('pix_manual', 'manual') else None)}::timestamptz,
              {lit(x.get('recusado_motivo'))}, {lit(x.get('recusado_em'))}::timestamptz, {lit(x.get('reembolsado_em'))}::timestamptz,
              {lit(g['mp_payment_id'])}, {lit(g['status'] if x['forma'] == 'mp' else None)}, {lit(g['pix_qr_code_base64'])}, {lit(g['pix_qr_code'])},
              {lit(g['pix_expira_em'])}::timestamptz, {plano_id}, 'migrado_calc', {lit(g['id'])}::uuid, {lit(g['created_at'])}::timestamptz, {lit(g['updated_at'])}::timestamptz)
            on conflict do nothing;""")
        if len(lote) >= 40:
            despejar()
    despejar()
    for v in pl["vinculos"]:
        lote.append(f"update {s}.cobrancas set treino_pagamento_id = {lit(v['treino_pagamento_id'])}::uuid where id = {lit(v['cobranca_id'])}::uuid and treino_pagamento_id is null;")
    despejar()
    for x in pl["assinaturas"]:
        a = x["a"]
        lote.append(f"""insert into {s}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, treino_assinatura_id, payload, criado_em)
            values ({lit(x['paciente_id'])}::uuid, {lit(x['conta_id'])}::uuid, {lit(a['mp_preapproval_id'])}, {lit(a['status'])}, {lit(a['valor'])}::numeric,
              {lit(a['id'])}::uuid, jsonb_build_object('origem', 'migrado_calc'), {lit(a['created_at'])}::timestamptz)
            on conflict do nothing;""")
    despejar()
    for x in pl["chaves"]:
        r = x["r"]
        lote.append(f"""insert into {s}.recebimento_chaves (conta_id, membro_id, tipo, chave, favorecido, banco, ativa, treino_recebimento_id, criado_em)
            values ({lit(x['conta_id'])}::uuid, {lit(x['membro_id'])}::uuid, {lit(r['pix_tipo'])}, {lit(r['pix_chave'])}, {lit(r['pix_favorecido'])}, {lit(r['pix_banco'])},
              {lit(x['ativa'])}, {lit(r['id'])}::uuid, {lit(r['criado_em'])}::timestamptz)
            on conflict do nothing;""")
    despejar()
    for x in pl["contas"]:
        lote.append(f"""update {s}.contas set recebimento_modo = {lit(x['modo'])} where id = {lit(x['conta_id'])}::uuid;
            insert into {s}.conta_eventos (conta_id, tipo, antes, depois) values ({lit(x['conta_id'])}::uuid, 'outro',
              jsonb_build_object('recebimento_modo', {lit(x['antes'])}), jsonb_build_object('w06', 'recebimento_migrado', 'recebimento_modo', {lit(x['modo'])}));""")
    despejar()


# ───────────────────────────── arquivos (Storage) ─────────────────────────────

def listar_objetos(url: str, chave: str, b: str, prefixo: str = "") -> list[dict]:
    saida: list[dict] = []
    offset = 0
    while True:
        st, r = http("POST", f"{url}/storage/v1/object/list/{b}", {"prefix": prefixo, "limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"}},
                     {"apikey": chave, "Authorization": f"Bearer {chave}"})
        if st != 200:
            raise RuntimeError(f"list {b}/{prefixo}: HTTP {st} {str(r)[:200]}")
        for o in r or []:
            caminho = f"{prefixo}{o['name']}"
            if o.get("id") is None:  # pasta
                saida.extend(listar_objetos(url, chave, b, caminho + "/"))
            else:
                saida.append({"caminho": caminho, "tamanho": (o.get("metadata") or {}).get("size"), "tipo": (o.get("metadata") or {}).get("mimetype")})
        if not r or len(r) < 1000:
            break
        offset += 1000
    return saida


def copiar_arquivos(s: str, dry: bool, so_testes: bool, perfis: dict) -> dict:
    b = bucket(s)
    kt, kp = service_treino(), _service_principal()
    origem = listar_objetos(TREINO_URL, kt, b)
    if so_testes:
        # prof/<professor>/<aluno>/…: só as pastas de contas de TESTE (P26)
        origem = [o for o in origem if all(email_de_teste((perfis.get(x) or {}).get("email")) for x in o["caminho"].split("/")[1:3])]
    destino = {o["caminho"]: o for o in listar_objetos(PRINCIPAL_URL, kp, b)}
    faltam = [o for o in origem if o["caminho"] not in destino]
    copiados = 0
    for o in faltam:
        if dry:
            continue
        caminho = urllib.parse.quote(o["caminho"])
        req = urllib.request.Request(f"{TREINO_URL}/storage/v1/object/{b}/{caminho}", headers={"apikey": kt, "Authorization": f"Bearer {kt}", "User-Agent": "physiq-unificado/1.0"})
        with urllib.request.urlopen(req, timeout=120) as r:
            conteudo = r.read()
        up = urllib.request.Request(f"{PRINCIPAL_URL}/storage/v1/object/{b}/{caminho}", data=conteudo, method="POST",
                                    headers={"apikey": kp, "Authorization": f"Bearer {kp}", "Content-Type": o["tipo"] or "application/octet-stream",
                                             "x-upsert": "false", "User-Agent": "physiq-unificado/1.0"})
        try:
            with urllib.request.urlopen(up, timeout=120) as r:
                if r.status not in (200, 201):
                    raise RuntimeError(f"upload {o['caminho']}: HTTP {r.status}")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"upload {o['caminho']}: HTTP {e.code} {e.read()[:200]!r}")
        copiados += 1
    return {"no_treino": len(origem), "ja_no_principal": len(origem) - len(faltam), "a_copiar": len(faltam), "copiados": copiados}


# ───────────────────────────── conferência ─────────────────────────────

def conferir(s: str) -> dict:
    t = ler_treino(s)
    so_testes = s == "staging"
    perfis = t["perfis"]
    antes: dict[str, dict] = defaultdict(lambda: {"pagamentos": 0, "soma": Decimal(0), "comprovantes": 0})
    fora = {"sem_professor": {"pagamentos": 0, "soma": Decimal(0), "comprovantes": 0}}
    for g in t["pagamentos"]:
        pf = perfis.get(g["user_id"])
        if so_testes and not email_de_teste((pf or {}).get("email")):
            continue
        alvo = antes[pf["professor_id"]] if pf and pf["professor_id"] else fora["sem_professor"]
        alvo["pagamentos"] += 1
        alvo["soma"] += Decimal(g["valor"])
        alvo["comprovantes"] += 1 if g["comprovante_path"] else 0
    cobs = sql_principal(f"""select c.treino_pagamento_id::text as tid, c.valor::text as valor, c.comprovante_path, p.treino_user_id::text as aluno
                               from {s}.cobrancas c join {s}.pacientes p on p.id = c.paciente_id where c.treino_pagamento_id is not null""")
    origem_do = {g["id"]: g for g in t["pagamentos"]}
    depois: dict[str, dict] = defaultdict(lambda: {"pagamentos": 0, "soma": Decimal(0), "comprovantes": 0})
    divergencias: list[str] = []
    for c in cobs:
        g = origem_do.get(c["tid"])
        if not g:
            divergencias.append(f"cobrança com origem {c['tid']} que não existe no Treino")
            continue
        prof = (perfis.get(g["user_id"]) or {}).get("professor_id")
        d = depois[prof or "?"]
        d["pagamentos"] += 1
        d["soma"] += Decimal(c["valor"])
        d["comprovantes"] += 1 if c["comprovante_path"] else 0
        if Decimal(c["valor"]) != Decimal(g["valor"]) or (c["comprovante_path"] or None) != (g["comprovante_path"] or None):
            divergencias.append(f"pagamento {g['id']}: valor/comprovante diferente")
    por_prof = []
    for prof in sorted(set(antes) | set(depois)):
        a, d = antes.get(prof, {"pagamentos": 0, "soma": Decimal(0), "comprovantes": 0}), depois.get(prof, {"pagamentos": 0, "soma": Decimal(0), "comprovantes": 0})
        ok = a["pagamentos"] == d["pagamentos"] and a["soma"] == d["soma"] and a["comprovantes"] == d["comprovantes"]
        por_prof.append({"professor": prof, "nome": (perfis.get(prof) or {}).get("email", "?"), "antes": {k: str(v) for k, v in a.items()},
                         "depois": {k: str(v) for k, v in d.items()}, "ok": ok})
    # arquivos por pasta de professor (os referenciados e todos os do bucket)
    b = bucket(s)
    no_treino = listar_objetos(TREINO_URL, service_treino(), b)
    if so_testes:
        no_treino = [o for o in no_treino if all(email_de_teste((perfis.get(x) or {}).get("email")) for x in o["caminho"].split("/")[1:3])]
    no_principal = {o["caminho"] for o in listar_objetos(PRINCIPAL_URL, _service_principal(), b)}
    arquivos_faltando = [o["caminho"] for o in no_treino if o["caminho"] not in no_principal]
    return {"schema": s, "por_professor": por_prof, "sem_professor": {k: str(v) for k, v in fora["sem_professor"].items()},
            "divergencias": divergencias, "arquivos": {"treino": len(no_treino), "faltando_no_principal": arquivos_faltando},
            "ok": all(x["ok"] for x in por_prof) and not divergencias and not arquivos_faltando}


def imprimir_conferencia(c: dict) -> None:
    print(f"\nConferência ({c['schema']}) — por professor: pagamentos · soma · comprovantes (Treino → principal)")
    for x in c["por_professor"]:
        a, d = x["antes"], x["depois"]
        print(f"  {'ok   ' if x['ok'] else 'FALHA'} {x['nome'] or x['professor']}: {a['pagamentos']}→{d['pagamentos']} · R$ {a['soma']}→R$ {d['soma']} · {a['comprovantes']}→{d['comprovantes']}")
    sp = c["sem_professor"]
    print(f"  (fora, sem professor — ficam só no Treino: {sp['pagamentos']} pagamentos · R$ {sp['soma']} · {sp['comprovantes']} comprovantes)")
    print(f"  arquivos: {c['arquivos']['treino']} no Treino, faltando no principal: {len(c['arquivos']['faltando_no_principal'])}")
    for dv in c["divergencias"]:
        print(f"  FALHA {dv}")
    print("  RESULTADO:", "ok" if c["ok"] else "NÃO BATEU")


def fazer_backup(pasta: str, s: str) -> None:
    base = Path(pasta).expanduser()
    subprocess.run([sys.executable, str(RAIZ / "scripts/backup/backup_principal.py"), "--pasta", str(base / "principal"), "--schemas", s,
                    "--tabelas", "pacientes,cobrancas,planos_aluno,recebimento_chaves,aluno_assinaturas,contas,conta_eventos,avisos",
                    "--rotulo", f"antes-02-{s}"], check=True)
    subprocess.run(["bash", str(RAIZ / "scripts/backup/pg_dump_tabelas.sh"), str(base / "treino"), s, "physiq_pagamentos", "physiq_assinaturas",
                    "physiq_planos", "physiq_recebimentos", "physiq_integracoes", "physiq_profiles"], check=True,
                   env={**__import__("os").environ, "ROTULO": f"antes-02-{s}", "PATH": f"{Path.home()}/.local/bin:{__import__('os').environ.get('PATH', '')}"})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true", help="só relata o que faria")
    ap.add_argument("--conferir", action="store_true", help="só a conferência (nada é gravado)")
    ap.add_argument("--backup", help="pasta do backup dos 2 bancos antes de gravar (ex.: ~/backups/physiq/2026-09-29-w06)")
    ap.add_argument("--sem-arquivos", action="store_true", help="não copia os arquivos do Storage")
    ap.add_argument("--relatorio", help="grava o relatório (JSON)")
    a = ap.parse_args()
    s = a.schema
    rel: dict = {"schema": s, "hoje": hoje_sp(), "dry_run": a.dry_run}
    if a.conferir:
        c = conferir(s)
        imprimir_conferencia(c)
        if a.relatorio:
            salvar_json(a.relatorio, c)
        return 0 if c["ok"] else 1
    t = ler_treino(s)
    p = ler_principal(s)
    pl = planejar(s, t, p)
    resumo = {k: len(v) for k, v in pl.items() if isinstance(v, list)}
    resumo["fora"] = {k: len(v) for k, v in pl["fora"].items()}
    print(f"Script 02 ({s}){' — DRY-RUN' if a.dry_run else ''}: {json.dumps(resumo, ensure_ascii=False)}")
    por_prof: dict[str, list] = defaultdict(list)
    for x in pl["cobrancas"]:
        por_prof[x["professor"]].append(x)
    for prof, xs in por_prof.items():
        soma = sum(Decimal(x["pag"]["valor"]) for x in xs)
        comp = sum(1 for x in xs if x["pag"]["comprovante_path"])
        print(f"  professor {(t['perfis'].get(prof) or {}).get('email', prof)}: {len(xs)} pagamentos a copiar · R$ {soma} · {comp} comprovantes")
    for sp in pl["fora"]["sem_professor"]:
        print(f"  fora (sem professor): {sp}")
    for sm in pl["fora"]["sem_matricula"]:
        print(f"  ATENÇÃO (professor sem matrícula do aluno): {sm}")
    rel["plano"] = {"resumo": resumo, "fora": pl["fora"], "contas": pl["contas"], "matriculas": pl["matriculas"],
                    "planos": pl["planos"], "cobrancas": [{k: v for k, v in x.items() if k != "pag"} | {"treino_pagamento_id": x["pag"]["id"]} for x in pl["cobrancas"]],
                    "chaves": [{"conta_id": x["conta_id"], "ativa": x["ativa"], "treino_recebimento_id": x["r"]["id"]} for x in pl["chaves"]]}
    if not a.dry_run:
        if a.backup:
            fazer_backup(a.backup, s)
        gravar(s, pl)
    if not a.sem_arquivos:
        rel["arquivos"] = copiar_arquivos(s, a.dry_run, s == "staging", t["perfis"])
        print(f"  arquivos: {json.dumps(rel['arquivos'])}")
    if a.dry_run:
        if a.relatorio:
            salvar_json(a.relatorio, rel)
        return 0
    c = conferir(s)
    rel["conferencia"] = c
    imprimir_conferencia(c)
    if pl["fora"]["sem_matricula"]:
        print("  FALHA: há pagamentos de aluno COM professor e sem matrícula no principal (rode o script 01 antes)")
    if a.relatorio:
        salvar_json(a.relatorio, rel)
    return 0 if c["ok"] and not pl["fora"]["sem_matricula"] else 1


if __name__ == "__main__":
    sys.exit(main())
