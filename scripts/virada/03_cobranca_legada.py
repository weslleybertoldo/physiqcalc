#!/usr/bin/env python3
"""Physiq — script 03 da virada: a cobrança das contas LEGADAS passa para o motor do núcleo (spec §6.3, §8.4; W28; P9).

Para cada conta 'legado_calc' / 'legado_nutri' ainda com cobranca_legada = true no schema escolhido:
  legado_calc (o professor do Calc, pelo vínculo conta_membros.treino_user_id / physiq_identidades → physiq_professores):
    · master → isenta (motivo "master"); suspenso → suspensa; cobrança pausada → isenta ("pausada pelo master");
    · senão: teste_ate = trial_ate; vence_em = o maior FIM DE ACESSO entre ciclo (+7 de tolerância), anual e liberação
      (a regra da physiq_professor_acesso_ok de hoje: só o ciclo tem tolerância) → tolerancia_dias 7 se veio do ciclo, 0 se não;
      periodicidade anual se o anual ainda vale; faixa do plano (Start f10, Studio f30, Pro f100, Ilimitado livre);
    · valor_travado = o valor mensal ATUAL do plano dele (physiq_planos_professor, lido no dia); anual = 10× (a regra do Calc);
    · physiq_assinaturas de professor (a mais recente) → conta_assinaturas (o mesmo preapproval do Mercado Pago);
    · physiq_pagamentos de professor → conta_faturas 'migrado' (histórico; o mesmo mp_payment_id — sem cobrança dobrada).
  legado_nutri (a nutri do Nutri, profiles + assinaturas + pagamentos_assinatura do próprio banco principal):
    · master → isenta; isento_assinatura → isenta ("isenta no PhysiqNutri");
    · senão: teste_ate = teste_ate; vence_em = o maior entre pago_ate e, com o cartão autorizado, o próximo vencimento;
      tolerância 0; regra_pix '30dias' (Pix = +30 dias); faixa livre (sem limite, como hoje);
    · valor_travado = o valor da assinatura dela ou R$ 80; assinaturas → conta_assinaturas; pagamentos_assinatura → faturas.
  Depois: regras_legadas = true, cobranca_legada = false (função w28_migrar_conta_legada, 1 transação por conta) e o espelho
  de acesso vai para o Treino. A situação é a do núcleo (situacao_da_conta_em) com essas datas.

O relatório traz, conta a conta, o ANTES (o que o app antigo diz hoje: tem acesso? até quando?) e o DEPOIS (o núcleo) — o
04_conferencia.py --virada confere um contra o outro depois de aplicar.

Idempotente (conta já migrada é pulada; fatura por mp_payment_id). Nenhuma chamada ao Mercado Pago: as assinaturas e os
pagamentos continuam os mesmos (só passam a ser lidos/aplicados pelo núcleo). O staging só mexe em contas de teste (P26).

Uso:
  python3 scripts/virada/03_cobranca_legada.py --schema staging --dry-run
  python3 scripts/virada/03_cobranca_legada.py --schema staging
  python3 scripts/virada/03_cobranca_legada.py --schema public --dry-run      (depois do backup — CHECKPOINT)
  python3 scripts/virada/03_cobranca_legada.py --schema public [--conta <uuid>]
Relatório: --relatorio <arquivo.json> (padrão ~/backups/physiq/<data>-w28/relatorio-03-<schema>-<dry|real>.json).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _base import SCHEMAS, email_de_teste, hoje_sp, lit, salvar_json, sql_principal, sql_treino  # noqa: E402

FAIXA_DO_PLANO = {"start": "f10", "studio": "f30", "pro": "f100", "ilimitado": "livre"}
VALOR_NUTRI = 80.0
TOLERANCIA_CALC = 7
SP = dt.timezone(dt.timedelta(hours=-3))  # São Paulo (sem horário de verão desde 2019)


def data_sp(valor) -> str | None:
    """timestamptz (texto do Postgres) ou data → 'AAAA-MM-DD' no relógio de São Paulo."""
    if not valor:
        return None
    s = str(valor)
    if len(s) == 10:
        return s
    s = s.replace(" ", "T")
    if s.endswith("+00"):
        s += ":00"
    try:
        d = dt.datetime.fromisoformat(s)
    except ValueError:
        return s[:10]
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(SP).date().isoformat()


def somar(data: str, dias: int) -> str:
    return (dt.date.fromisoformat(data) + dt.timedelta(days=dias)).isoformat()


def maior(*datas: str | None) -> str | None:
    v = [d for d in datas if d]
    return max(v) if v else None


def situacao_nucleo(situacao: str, teste_ate: str | None, vence_em: str | None, tol: int, hoje: str) -> str:
    """O situacao_da_conta_em do SQL (a régua da tarefa das 03:40)."""
    if situacao in ("isenta", "suspensa", "cancelada"):
        return situacao
    if vence_em and somar(vence_em, max(0, tol)) >= hoje:
        return "ativa"
    if teste_ate and teste_ate >= hoje:
        return "teste"
    return "vencida"


def acesso_ate_nucleo(situacao: str, teste_ate: str | None, vence_em: str | None, tol: int) -> str | None:
    """Último dia com acesso no núcleo (fimDoAcesso / acessoAteDaConta): isenta = sem limite; suspensa/cancelada = nenhum."""
    if situacao == "isenta":
        return "sem_limite"
    if situacao in ("suspensa", "cancelada"):
        return None
    return maior(somar(vence_em, max(0, tol)) if vence_em else None, teste_ate)


# ───────────────────────── regra de HOJE dos apps antigos (o "antes" da conferência) ─────────────────────────

def antes_calc(p: dict | None, master: bool, hoje: str) -> dict:
    """physiq_professor_acesso_ok de hoje (Treino): status ativo e (pausada | liberado | teste | anual | ciclo+7) — por data."""
    if master:
        return {"regra": "master", "tem_acesso": True, "acesso_ate": "sem_limite"}
    if not p:
        return {"regra": "sem_professor_no_treino", "tem_acesso": False, "acesso_ate": None}
    if p.get("status") != "ativo":
        return {"regra": "suspenso", "tem_acesso": False, "acesso_ate": None}
    if p.get("cobranca_pausada"):
        return {"regra": "pausada", "tem_acesso": True, "acesso_ate": "sem_limite"}
    fins = [p.get("acesso_liberado_ate"), p.get("trial_ate"), p.get("anual_ate"),
            somar(p["ciclo_vence_em"], TOLERANCIA_CALC) if p.get("ciclo_vence_em") else None]
    fim = maior(*[f[:10] if f else None for f in fins])
    return {"regra": "ciclo", "tem_acesso": bool(fim and fim >= hoje), "acesso_ate": fim}


def antes_nutri(perfil: dict | None, assinatura: dict | None, master: bool) -> dict:
    """situacaoAssinatura() do site antigo: isento > cartão autorizado > Pix pago > teste > vencida (agora = now())."""
    agora = dt.datetime.now(dt.timezone.utc)

    def futuro(ts) -> bool:
        if not ts:
            return False
        s = str(ts).replace(" ", "T")
        s = s + ":00" if s.endswith("+00") else s
        try:
            d = dt.datetime.fromisoformat(s)
        except ValueError:
            return False
        return (d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)) > agora

    if master:
        return {"regra": "master", "tem_acesso": True, "acesso_ate": "sem_limite"}
    if not perfil:
        return {"regra": "sem_perfil", "tem_acesso": False, "acesso_ate": None}
    if perfil.get("isento_assinatura"):
        return {"regra": "isento", "tem_acesso": True, "acesso_ate": "sem_limite"}
    if assinatura and assinatura.get("status") == "authorized":
        return {"regra": "cartao_autorizado", "tem_acesso": True,
                "acesso_ate": maior(data_sp(assinatura.get("proximo_vencimento")), data_sp(perfil.get("pago_ate")))}
    if futuro(perfil.get("pago_ate")):
        return {"regra": "pix_pago", "tem_acesso": True, "acesso_ate": data_sp(perfil.get("pago_ate"))}
    if futuro(perfil.get("teste_ate")):
        return {"regra": "teste", "tem_acesso": True, "acesso_ate": data_sp(perfil.get("teste_ate"))}
    return {"regra": "vencida", "tem_acesso": False, "acesso_ate": maior(data_sp(perfil.get("pago_ate")), data_sp(perfil.get("teste_ate")))}


# ───────────────────────── o "depois" (o que vai para a conta do núcleo) ─────────────────────────

def depois_calc(p: dict | None, master: bool, plano: dict | None, conta: dict, hoje: str) -> dict:
    faixa = FAIXA_DO_PLANO.get(((plano or {}).get("nome") or "").strip().lower(), conta.get("faixa") or "f10")
    valor = (plano or {}).get("valor_mensal")
    if valor is None and p:
        valor = p.get("ciclo_valor")
    base = {"faixa": "livre" if master else faixa, "valor_travado": None if master or valor is None else float(valor),
            "regra_pix": "mes", "periodicidade": "mensal", "teste_ate": None, "vence_em": None, "tolerancia_dias": 0}
    if master:
        return {**base, "situacao": "isenta", "isenta_motivo": "master"}
    if not p:
        return {**base, "situacao": "vencida"}
    if p.get("status") != "ativo":
        return {**base, "situacao": "suspensa"}
    if p.get("cobranca_pausada"):
        return {**base, "situacao": "isenta", "isenta_motivo": "pausada pelo master"}
    # o maior FIM de acesso (data + tolerância) entre ciclo, anual e liberação; empate → o ciclo (mantém a tolerância)
    cand = []
    if p.get("ciclo_vence_em"):
        cand.append((somar(p["ciclo_vence_em"][:10], TOLERANCIA_CALC), 0, p["ciclo_vence_em"][:10], TOLERANCIA_CALC, "ciclo"))
    if p.get("anual_ate"):
        cand.append((p["anual_ate"][:10], 1, p["anual_ate"][:10], 0, "anual"))
    if p.get("acesso_liberado_ate"):
        cand.append((p["acesso_liberado_ate"][:10], 2, p["acesso_liberado_ate"][:10], 0, "liberado"))
    vence, tol, veio = None, 0, None
    if cand:
        cand.sort(key=lambda c: (c[0], -c[1]))
        _, _, vence, tol, veio = cand[-1]
    teste = p["trial_ate"][:10] if p.get("trial_ate") else None
    if p.get("alunos_bloqueados_em"):
        # o master do Calc bloqueou os alunos deste professor: o bloqueio vai para a conta (o espelho passa a mandar nele)
        base["alunos_bloqueados_em"] = p["alunos_bloqueados_em"]
        base["alunos_bloqueados_msg"] = p.get("alunos_bloqueados_msg")
    anual_vale = bool(p.get("anual_ate") and p["anual_ate"][:10] >= hoje)
    d = {**base, "teste_ate": teste, "vence_em": vence, "tolerancia_dias": tol, "periodicidade": "anual" if anual_vale else "mensal",
         "veio_de": veio}
    d["situacao"] = situacao_nucleo("ativa", teste, vence, tol, hoje)
    return d


def depois_nutri(perfil: dict | None, assinatura: dict | None, master: bool, hoje: str) -> dict:
    valor = None
    if assinatura and assinatura.get("valor") is not None and float(assinatura["valor"]) > 0:
        valor = float(assinatura["valor"])
    base = {"faixa": "livre", "valor_travado": valor if valor is not None else VALOR_NUTRI, "regra_pix": "30dias",
            "periodicidade": "mensal", "teste_ate": None, "vence_em": None, "tolerancia_dias": 0}
    if master:
        return {**base, "situacao": "isenta", "isenta_motivo": "master"}
    if not perfil:
        return {**base, "situacao": "vencida"}
    if perfil.get("isento_assinatura"):
        return {**base, "situacao": "isenta", "isenta_motivo": "isenta no PhysiqNutri"}
    teste = data_sp(perfil.get("teste_ate"))
    vence = data_sp(perfil.get("pago_ate"))
    if assinatura and assinatura.get("status") == "authorized":
        vence = maior(vence, data_sp(assinatura.get("proximo_vencimento")))
    d = {**base, "teste_ate": teste, "vence_em": vence}
    d["situacao"] = situacao_nucleo("ativa", teste, vence, 0, hoje)
    return d


# ───────────────────────── leitura ─────────────────────────

def ler(schema: str, so_testes: bool, so_conta: str | None) -> dict:
    s = schema
    contas = sql_principal(f"""
      select c.id::text as id, c.nome, c.origem, c.plano, c.faixa, c.periodicidade, c.situacao, c.teste_ate::text as teste_ate,
             c.vence_em::text as vence_em, c.tolerancia_dias, c.valor_travado, c.regra_pix, c.cobranca_legada, c.isenta_motivo,
             coalesce((to_jsonb(c)->>'regras_legadas')::boolean, false) as regras_legadas, c.dono_id::text as dono_id, lower(u.email) as dono_email,
             coalesce(u.raw_app_meta_data->>'role', '') as role_jwt, coalesce(pr.role, '') as role_perfil,
             (select m.treino_user_id::text from {s}.conta_membros m where m.conta_id = c.id and m.user_id = c.dono_id
               and m.treino_user_id is not null limit 1) as treino_user_id,
             (select count(*)::int from {s}.pacientes x where x.conta_id = c.id and x.deleted_at is null) as alunos,
             to_jsonb(c) as linha
        from {s}.contas c
        left join auth.users u on u.id = c.dono_id
        left join {s}.profiles pr on pr.id = c.dono_id
       where c.origem in ('legado_calc', 'legado_nutri')
       order by c.origem, c.criado_em""")
    if so_testes:
        contas = [c for c in contas if email_de_teste(c["dono_email"])]
    if so_conta:
        contas = [c for c in contas if c["id"] == so_conta]
    # vínculo principal → Treino (quando o membro não guardou o treino_user_id)
    faltam = [c["dono_id"] for c in contas if c["origem"] == "legado_calc" and not c["treino_user_id"] and c["dono_id"]]
    if faltam:
        ident = {r["principal_user_id"]: r["treino_user_id"] for r in sql_treino(
            f"select principal_user_id::text as principal_user_id, treino_user_id::text as treino_user_id from {s}.physiq_identidades "
            f"where principal_user_id in ({','.join(lit(x) for x in faltam)})")}
        for c in contas:
            if c["origem"] == "legado_calc" and not c["treino_user_id"]:
                c["treino_user_id"] = ident.get(c["dono_id"])
    tids = [c["treino_user_id"] for c in contas if c["origem"] == "legado_calc" and c["treino_user_id"]]
    profs, planos, assin_c, pags_c, roles_t = {}, {}, {}, {}, {}
    if tids:
        lista = ",".join(lit(t) for t in tids)
        for p in sql_treino(f"""select p.id::text as id, p.status, p.plano_id::text as plano_id, p.trial_ate::text as trial_ate,
                 p.adesao_paga_em::text as adesao_paga_em, p.ciclo_inicio::text as ciclo_inicio, p.ciclo_vence_em::text as ciclo_vence_em,
                 p.ciclo_valor, p.anual_ate::text as anual_ate, p.cobranca_pausada, p.acesso_liberado_ate::text as acesso_liberado_ate,
                 p.nucleo_acesso_ate::text as nucleo_acesso_ate, {s}.physiq_professor_acesso_ok(p.id) as acesso_ok_treino,
                 p.alunos_bloqueados_em::text as alunos_bloqueados_em, p.alunos_bloqueados_msg
               from {s}.physiq_professores p where p.id in ({lista})"""):
            profs[p["id"]] = p
        for pl in sql_treino(f"select id::text as id, nome, valor_mensal, valor_anual, max_alunos from {s}.physiq_planos_professor"):
            planos[pl["id"]] = pl
        for a in sql_treino(f"""select id::text as id, user_id::text as user_id, mp_preapproval_id, status, valor, created_at::text as criado,
                 updated_at::text as atualizado from {s}.physiq_assinaturas where contexto = 'plano_professor' and user_id in ({lista})
                 order by updated_at desc nulls last, created_at desc"""):
            assin_c.setdefault(a["user_id"], []).append(a)
        for g in sql_treino(f"""select id::text as id, user_id::text as user_id, tipo, valor, mes_ref::text as mes_ref, mp_payment_id, status,
                 metodo, tipo_cobranca, created_at::text as criado, updated_at::text as atualizado, pix_expira_em::text as pix_expira_em,
                 pix_qr_code from {s}.physiq_pagamentos where contexto = 'plano_professor' and user_id in ({lista}) order by created_at"""):
            pags_c.setdefault(g["user_id"], []).append(g)
        for u in sql_treino(f"select id::text as id, coalesce(raw_app_meta_data->>'role', '') as role from auth.users where id in ({lista})"):
            roles_t[u["id"]] = u["role"]
    donos_n = [c["dono_id"] for c in contas if c["origem"] == "legado_nutri" and c["dono_id"]]
    perfis_n, assin_n, pags_n = {}, {}, {}
    if donos_n:
        lista = ",".join(lit(x) for x in donos_n)
        for p in sql_principal(f"""select id::text as id, role, teste_ate::text as teste_ate, pago_ate::text as pago_ate, isento_assinatura
               from {s}.profiles where id in ({lista})"""):
            perfis_n[p["id"]] = p
        for a in sql_principal(f"""select id::text as id, nutricionista_id::text as uid, mp_preapproval_id, status, valor, init_point,
                 proximo_vencimento::text as proximo_vencimento, ultimo_pagamento_em::text as ultimo_pagamento_em,
                 created_at::text as criado, updated_at::text as atualizado
               from {s}.assinaturas where nutricionista_id in ({lista}) order by updated_at desc nulls last"""):
            assin_n.setdefault(a["uid"], []).append(a)
        for g in sql_principal(f"""select id::text as id, nutricionista_id::text as uid, mp_payment_id, valor, status, pix_qr_code,
                 pix_expira_em::text as pix_expira_em, pago_em::text as pago_em, cobre_ate::text as cobre_ate, created_at::text as criado
               from {s}.pagamentos_assinatura where nutricionista_id in ({lista}) order by created_at"""):
            pags_n.setdefault(g["uid"], []).append(g)
    ja_faturas = {r["mp_payment_id"] for r in sql_principal(f"select mp_payment_id from {s}.conta_faturas where mp_payment_id is not null")}
    ja_assin = {r["conta_id"] for r in sql_principal(f"select conta_id::text as conta_id from {s}.conta_assinaturas")}
    return {"contas": contas, "profs": profs, "planos": planos, "assin_c": assin_c, "pags_c": pags_c, "roles_t": roles_t,
            "perfis_n": perfis_n, "assin_n": assin_n, "pags_n": pags_n, "ja_faturas": ja_faturas, "ja_assin": ja_assin}


def status_fatura(st: str | None) -> str:
    st = (st or "pending").lower()
    return st if st in ("pending", "approved", "rejected", "cancelled", "expired", "refunded", "charged_back", "in_process") else "pending"


def planejar(d: dict, schema: str, hoje: str) -> dict:
    plano = {"schema": schema, "hoje": hoje, "contas": [], "ja_migradas": [], "estranhos": []}
    for c in d["contas"]:
        if not c["cobranca_legada"]:
            plano["ja_migradas"].append({"conta_id": c["id"], "origem": c["origem"], "dono": c["dono_email"]})
            continue
        master = c["role_jwt"] == "master" or c["role_perfil"] == "master"
        item = {"conta_id": c["id"], "origem": c["origem"], "dono": c["dono_email"], "nome": c["nome"], "alunos": c["alunos"],
                "conta_antes": c["linha"], "assinatura": None, "faturas": []}
        if c["origem"] == "legado_calc":
            tid = c["treino_user_id"]
            p = d["profs"].get(tid) if tid else None
            master = master or d["roles_t"].get(tid or "", "") in ("admin", "master")
            pl = d["planos"].get((p or {}).get("plano_id") or "")
            item["fonte"] = {"treino_user_id": tid, "professor": p, "plano": pl}
            item["antes"] = antes_calc(p, master, hoje)
            item["depois"] = depois_calc(p, master, pl, c, hoje)
            if not p and not master:
                plano["estranhos"].append({"conta_id": c["id"], "dono": c["dono_email"], "motivo": "conta legado_calc sem professor no Treino"})
            ass = (d["assin_c"].get(tid or "") or [])
            viva = next((a for a in ass if a["status"] in ("authorized", "pending", "paused")), None) or (ass[0] if ass else None)
            if viva and c["id"] not in d["ja_assin"]:
                item["assinatura"] = {"mp_preapproval_id": viva["mp_preapproval_id"], "status": viva["status"] if viva["status"] in
                                      ("pending", "authorized", "paused", "cancelled") else "pending", "valor": viva["valor"],
                                      "proximo_vencimento": None, "ultimo_pagamento_em": None,
                                      "payload": {"origem": "legado_calc", "physiq_assinaturas_id": viva["id"]}}
            for g in d["pags_c"].get(tid or "", []):
                mpid = g["mp_payment_id"] or f"calc-pag-{g['id']}"
                if mpid in d["ja_faturas"]:
                    continue
                st = status_fatura(g["status"])
                meses = 12 if g["tipo_cobranca"] == "anual" else 1
                item["faturas"].append({
                    "valor": float(g["valor"] or 0), "status": st, "forma": "pix" if g["tipo"] == "pix" else ("cartao" if g["tipo"] == "cartao" else "manual"),
                    "mp_payment_id": mpid, "pago_em": (g["atualizado"] or g["criado"]) if st == "approved" else None, "meses": meses,
                    "pix_expira_em": g["pix_expira_em"], "pix_copia_cola": g["pix_qr_code"],
                    "descricao": f"PhysiqCalc — {g['tipo_cobranca'] or 'mensal'} ({g['mes_ref'] or ''}) — migrado na virada",
                    "criado_em": g["criado"]})
        else:
            perfil = d["perfis_n"].get(c["dono_id"] or "")
            ass = (d["assin_n"].get(c["dono_id"] or "") or [])
            atual = ass[0] if ass else None
            item["fonte"] = {"perfil": perfil, "assinatura": atual}
            item["antes"] = antes_nutri(perfil, atual, master)
            item["depois"] = depois_nutri(perfil, atual, master, hoje)
            if atual and c["id"] not in d["ja_assin"]:
                item["assinatura"] = {"mp_preapproval_id": atual["mp_preapproval_id"], "status": atual["status"] if atual["status"] in
                                      ("pending", "authorized", "paused", "cancelled") else "pending", "valor": atual["valor"],
                                      "proximo_vencimento": atual["proximo_vencimento"], "ultimo_pagamento_em": atual["ultimo_pagamento_em"],
                                      "payload": {"origem": "legado_nutri", "assinaturas_id": atual["id"], "init_point": atual["init_point"],
                                                  "external_reference": f"physiqnutri:{schema}:{c['dono_id']}"}}
            for g in d["pags_n"].get(c["dono_id"] or "", []):
                mpid = g["mp_payment_id"] or f"nutri-pag-{g['id']}"
                if mpid in d["ja_faturas"]:
                    continue
                st = status_fatura(g["status"])
                item["faturas"].append({
                    "valor": float(g["valor"] or 0), "status": st, "forma": "pix", "mp_payment_id": mpid,
                    "pago_em": g["pago_em"] if st == "approved" else None, "cobre_ate": data_sp(g["cobre_ate"]), "meses": 1,
                    "pix_expira_em": g["pix_expira_em"], "pix_copia_cola": g["pix_qr_code"],
                    "descricao": "PhysiqNutri — Pix de 30 dias — migrado na virada", "criado_em": g["criado"]})
        dep = item["depois"]
        dep["acesso_ate"] = acesso_ate_nucleo(dep["situacao"], dep.get("teste_ate"), dep.get("vence_em"), dep.get("tolerancia_dias", 0))
        dep["tem_acesso"] = dep["situacao"] in ("ativa", "teste", "isenta")
        a = item["antes"]
        item["bate"] = (a["tem_acesso"] == dep["tem_acesso"]) and (a["acesso_ate"] == dep["acesso_ate"] or (not a["tem_acesso"] and not dep["tem_acesso"]))
        if not item["bate"]:
            plano["estranhos"].append({"conta_id": c["id"], "dono": c["dono_email"], "motivo": "antes ≠ depois", "antes": a,
                                       "depois": {k: dep.get(k) for k in ("situacao", "acesso_ate", "tem_acesso")}})
        plano["contas"].append(item)
    return plano


def executar(plano: dict, schema: str) -> dict:
    feito = {"migradas": 0, "ja_migradas": 0, "faturas": 0, "assinaturas": 0, "erros": []}
    for item in plano["contas"]:
        dep = item["depois"]
        dados = {"conta": {k: dep.get(k) for k in ("situacao", "teste_ate", "vence_em", "tolerancia_dias", "valor_travado", "regra_pix",
                                                    "periodicidade", "faixa")},
                 "assinatura": item["assinatura"], "faturas": item["faturas"]}
        if "isenta_motivo" in dep:
            dados["conta"]["isenta_motivo"] = dep["isenta_motivo"]
        if dep.get("alunos_bloqueados_em"):
            dados["conta"]["alunos_bloqueados_em"] = dep["alunos_bloqueados_em"]
            dados["conta"]["alunos_bloqueados_msg"] = dep.get("alunos_bloqueados_msg")
        try:
            r = sql_principal(f"select {schema}.w28_migrar_conta_legada({lit(item['conta_id'])}::uuid, {lit(json.dumps(dados, default=str))}::jsonb) as r")[0]["r"]
        except Exception as e:  # noqa: BLE001 — registra e segue com as outras (cada conta é uma transação)
            feito["erros"].append({"conta_id": item["conta_id"], "erro": str(e)[:400]})
            continue
        if not r.get("ok"):
            feito["erros"].append({"conta_id": item["conta_id"], "erro": r.get("erro")})
        elif r.get("ja_migrada"):
            feito["ja_migradas"] += 1
        else:
            feito["migradas"] += 1
            feito["faturas"] += int(r.get("faturas") or 0)
            feito["assinaturas"] += 1 if r.get("assinatura") else 0
        item["resultado"] = r
    return feito


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--dry-run", action="store_true", help="só relata o que faria (nada é gravado)")
    ap.add_argument("--conta", help="só esta conta (uuid)")
    ap.add_argument("--relatorio", help="arquivo JSON do relatório")
    a = ap.parse_args()
    hoje = hoje_sp()
    d = ler(a.schema, a.schema == "staging", a.conta)
    plano = planejar(d, a.schema, hoje)
    resumo = {
        "schema": a.schema, "dry_run": a.dry_run, "hoje": hoje, "so_contas_de_teste": a.schema == "staging",
        "a_migrar": len(plano["contas"]), "ja_migradas": len(plano["ja_migradas"]),
        "legado_calc": sum(1 for x in plano["contas"] if x["origem"] == "legado_calc"),
        "legado_nutri": sum(1 for x in plano["contas"] if x["origem"] == "legado_nutri"),
        "faturas_a_migrar": sum(len(x["faturas"]) for x in plano["contas"]),
        "soma_faturas_aprovadas": round(sum(f["valor"] for x in plano["contas"] for f in x["faturas"] if f["status"] == "approved"), 2),
        "assinaturas_a_migrar": sum(1 for x in plano["contas"] if x["assinatura"]),
        "antes_igual_depois": sum(1 for x in plano["contas"] if x["bate"]),
        "estranhos": len(plano["estranhos"]),
    }
    saida = {"resumo": resumo, "plano": plano}
    if not a.dry_run:
        saida["feito"] = executar(plano, a.schema)
    destino = a.relatorio or str(Path.home() / "backups" / "physiq" / f"{hoje}-w28" / f"relatorio-03-{a.schema}-{'dry' if a.dry_run else 'real'}.json")
    salvar_json(destino, saida)
    print(json.dumps({"resumo": resumo, **({"feito": saida["feito"]} if "feito" in saida else {})}, ensure_ascii=False, indent=2))
    print("\nconta a conta (antes → depois):")
    for x in plano["contas"]:
        dep, an = x["depois"], x["antes"]
        print(f"  {'ok ' if x['bate'] else '≠  '} {x['origem']:12s} {x['dono']:40s} {an['regra']:18s} acesso {an['acesso_ate'] or '—':10s} → "
              f"{dep['situacao']:8s} teste {dep.get('teste_ate') or '—':10s} vence {dep.get('vence_em') or '—':10s} tol {dep.get('tolerancia_dias', 0)} "
              f"R$ {dep.get('valor_travado') if dep.get('valor_travado') is not None else '—'} · faturas {len(x['faturas'])} · assin {'sim' if x['assinatura'] else 'não'}")
    for e in plano["estranhos"]:
        print("  ESTRANHO", json.dumps(e, ensure_ascii=False, default=str))
    print(f"\nrelatório: {destino}")
    erros = saida.get("feito", {}).get("erros", [])
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
