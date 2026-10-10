#!/usr/bin/env python3
"""Physiq W1 (conta única, 02/10/2026) — junta as 2 contas de UM profissional numa só (banco principal, um schema por vez).

A conta que FICA recebe o módulo da outra (plano = a união dos módulos) e o membro dela soma os papéis; as linhas da conta que
SAI vão para a que fica; o aluno matriculado nas 2 (caso P7) fica com UMA matrícula — a da conta que fica, que recebe tudo o que
apontava para a outra (planos, diário, refeições marcadas, consultas…) e o responsável que faltava. A conta que sai é CANCELADA
(nunca apagada): o membro vira 'removido', o histórico dela (conta_eventos, assinaturas, faturas) fica nela e a matrícula que sai
fica inativa (encerrada, desvinculado_em) como histórico. 1 evento novo em cada conta conta a junção (o da cancelada traz o motivo).

Inventário pelo CATÁLOGO (não pelo nome da coluna): toda FK que referencia <schema>.pacientes(id) ou <schema>.contas(id), mais as
colunas uuid (paciente|conta|matricula|aluno)_id sem FK. Classes:
  conta_id    · fica na conta cancelada (histórico): conta_eventos, conta_assinaturas, conta_faturas
              · tratadas à parte: conta_membros (papéis/removido) e pacientes (os pares P7 e os soltos)
              · PARA se tiver linha (configuração/cobrança da conta — pede decisão): CONTA_PARAR_SE_TIVER
              · o resto vai para a conta que fica (agendamentos, pré-consulta, calendários, financeiro…)
  paciente_id · PARA se tiver linha na matrícula que sai: PACIENTE_PARAR_SE_TIVER
              · o resto vai para a matrícula que fica
  Linha única por matrícula/conta (índice único) em conflito → fica a da matrícula/conta que FICA; a outra fica onde está e entra no
  relatório (nada é apagado). Os pacientes da conta que sai sem par na que fica (ex.: inativos antigos) só mudam de conta.
A matrícula que fica ganha o responsável que faltava e os ajustes (config) da outra que ela não tem (em conflito, vale o dela);
o cadastro (nome, e-mail, CPF, telefone…) NÃO muda — as diferenças vão para o relatório (dado sensível só como "preenchido/vazio").
Travas: o bloco só faz UPDATE de conta_id / paciente_id / nutricionista_id / personal_id / config / ativo / desvinculado_em /
papeis / status / plano / situacao — a trava de e-mail/CPF (gatilho em email, cpf, deleted_at, user_id) e os avisos da agenda
(inicio, status, deleted_at) não disparam. Nenhum e-mail, aviso, WhatsApp ou senha. O gatilho contas_sai_do_legado faz a conta que
fica sair das "regras de hoje" (regras_legadas) ao trocar de plano — numa conta isenta nada muda na cobrança.

Uso (o bloco do banco é UMA query: begin … commit/rollback; tudo ou nada):
  python3 scripts/conta_unica/juntar_contas.py --schema <s> --profissional <uuid> --conta-fica <uuid> --conta-sai <uuid> --inventario
  … --dry-run                     backup + o bloco com ROLLBACK (o que faria, contagens antes/depois) + o SQL do --aplicar salvo
  … --aplicar --sim [--conferir-com <relatorio do dry-run>]   backup + o bloco com COMMIT + espelho_disparar() + fila do espelho
  … --desfazer <pasta do backup> [--sim]   volta as colunas que a junção mudou (só nas linhas que ela mexeu); sem --sim = prévia
  --pasta <dir> (padrão ~/backups/physiq/2026-10-02-w1-conta-unica/<schema>)
Idempotente: depois de aplicado, rodar de novo diz "já juntada" e não muda nada. No staging só contas de TESTE (P26).
Sem segredo no repositório: PAT em ~/.pc-pat, Banco do Treino pelo ~/.pgpass, segredo da fila do espelho em
~/.physiq-segredo-espelho-fila (hml-16c, S8; sem ele, o legado ~/.physiq-espelho-segredo até o F7).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "virada"))
from _base import PRINCIPAL_REF, PRINCIPAL_URL, email_de_teste, http, lit, pat, salvar_json, sql_principal, sql_treino  # noqa: E402

PASTA_PADRAO = Path.home() / "backups" / "physiq" / "2026-10-02-w1-conta-unica"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
NOME_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
SCHEMAS = ("public", "staging")

PAPEIS_ORDEM = ("dono", "personal", "nutricionista")
MODULOS_DO_PLANO = {"treino": ("treino",), "nutricao": ("nutricao",), "treino_nutricao": ("treino", "nutricao")}

CONTA_HISTORICO = frozenset({"conta_eventos", "conta_assinaturas", "conta_faturas"})
CONTA_ESPECIAIS = frozenset({"conta_membros", "pacientes"})
CONTA_PARAR_SE_TIVER = frozenset({"planos_aluno", "recebimento_chaves", "convites", "whatsapp_instancias", "aluno_assinaturas",
                                  "cadastros_pendentes", "agenda_pacotes"})
PACIENTE_PARAR_SE_TIVER = frozenset({"aluno_assinaturas", "agenda_pacotes", "cadastros_pendentes"})
CAMPOS_CADASTRO = ("nome", "apelido", "email", "cpf", "telefone", "nascimento", "genero", "objetivo", "resumo", "tags", "foto_url",
                   "link_codigo")
CAMPOS_SENSIVEIS = frozenset({"email", "cpf", "telefone", "nascimento"})
# o que a junção muda (e o --desfazer volta) em cada tabela tratada à parte
COLS_CONTAS = ("plano", "faixa", "situacao", "isenta_motivo", "regras_legadas", "valor_travado", "regra_pix")
COLS_MEMBROS = ("papeis", "status", "removido_em")
COLS_PACIENTES = ("conta_id", "nutricionista_id", "personal_id", "config", "ativo", "desvinculado_em")


# ───────────────────────── regras puras (testadas em test_juntar_contas.py) ─────────────────────────

def uuid_ok(valor: str | None) -> bool:
    return bool(valor) and bool(UUID_RE.match(str(valor)))


def ident(nome: str) -> str:
    """Identificador SQL (tabela/coluna) só com letras minúsculas, dígitos e _ — vem do catálogo, mas confere."""
    if not NOME_RE.match(nome or ""):
        raise ValueError(f"identificador inválido: {nome!r}")
    return f'"{nome}"'


def unir_papeis(*listas) -> list[str]:
    """Papéis somados, na ordem dono · personal · nutricionista (a que a minha_situacao devolve)."""
    tem = {p for lista in listas for p in (lista or [])}
    estranhos = tem - set(PAPEIS_ORDEM)
    if estranhos:
        raise ValueError(f"papel desconhecido: {sorted(estranhos)}")
    return [p for p in PAPEIS_ORDEM if p in tem]


def plano_da_uniao(plano_a: str, plano_b: str) -> str:
    """O plano com os módulos das 2 contas (treino + nutricao → treino_nutricao)."""
    mods = set(MODULOS_DO_PLANO[plano_a]) | set(MODULOS_DO_PLANO[plano_b])
    for plano, m in MODULOS_DO_PLANO.items():
        if set(m) == mods:
            return plano
    raise ValueError(f"sem plano para {sorted(mods)}")


def unir_config(sai: dict | None, fica: dict | None) -> tuple[dict, list[dict]]:
    """Ajustes da matrícula: os da que sai que a que fica não tem entram; em conflito vale o da que fica (e vai para o relatório)."""
    sai, fica = dict(sai or {}), dict(fica or {})
    conflitos = [{"chave": k, "fica": fica[k], "sai": sai[k]} for k in sorted(sai) if k in fica and fica[k] != sai[k]]
    return {**sai, **fica}, conflitos


def classe_conta(tabela: str) -> str:
    if tabela in CONTA_HISTORICO:
        return "historico"
    if tabela in CONTA_ESPECIAIS:
        return "especial"
    if tabela in CONTA_PARAR_SE_TIVER:
        return "parar"
    return "mover"


def classe_paciente(tabela: str) -> str:
    return "parar" if tabela in PACIENTE_PARAR_SE_TIVER else "mover"


def parear(matriculas_sai: list[dict], matriculas_fica: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    """P7: a mesma pessoa (user_id) com matrícula viva (fora da lixeira) nas 2 contas → par {sai, fica}. As outras matrículas da conta
    que sai (sem login, na lixeira ou sem matrícula na que fica) só mudam de conta. Devolve (pares, soltos, problemas)."""
    vivas_fica: dict[str, list[dict]] = {}
    for m in matriculas_fica:
        if m.get("user_id") and not m.get("deleted_at"):
            vivas_fica.setdefault(m["user_id"], []).append(m)
    pares: list[dict] = []
    soltos: list[str] = []
    problemas: list[str] = []
    vistos: set[str] = set()
    for m in matriculas_sai:
        u = m.get("user_id")
        if not u or m.get("deleted_at") or u not in vivas_fica:
            soltos.append(m["id"])
            continue
        if len(vivas_fica[u]) > 1:
            problemas.append(f"a pessoa {u} tem {len(vivas_fica[u])} matrículas vivas na conta que fica")
            continue
        if u in vistos:
            problemas.append(f"a pessoa {u} tem 2 matrículas vivas na conta que sai")
            continue
        vistos.add(u)
        f = vivas_fica[u][0]
        if m.get("ativo") and not f.get("ativo"):
            problemas.append(f"a matrícula que fica ({f['id']}) está inativa e a que sai ({m['id']}) ativa — decidir à mão")
            continue
        pares.append({"sai": m["id"], "fica": f["id"], "user_id": u})
    return pares, soltos, problemas


def diferencas_cadastro(sai: dict, fica: dict) -> list[dict]:
    """O cadastro não muda: o que difere entre as 2 matrículas vai para o relatório (dado sensível só como preenchido/vazio)."""
    out = []
    for c in CAMPOS_CADASTRO:
        a, b = fica.get(c), sai.get(c)
        if a == b:
            continue
        if c in CAMPOS_SENSIVEIS:
            out.append({"campo": c, "fica": "preenchido" if a else "vazio", "sai": "preenchido" if b else "vazio"})
        else:
            out.append({"campo": c, "fica": a, "sai": b})
    return out


def conferir_contagens(antes: dict, depois: dict, mover: list[str], conflitos: list[dict], historico: tuple[str, ...] = ("conta_eventos",)) -> list[str]:
    """Nada some: o total de cada tabela é o mesmo antes e depois (menos as de histórico, que ganham os eventos novos), e o que saiu do
    lado que sai apareceu no lado que fica (menos os conflitos de linha única, que ficam onde estavam).
    `mover` = ["tabela.coluna", …]; antes/depois = {tc: {total, sai, fica}}."""
    erros = []
    pendentes = {}
    for c in conflitos:
        k = f"{c['tabela']}.{c['coluna']}"
        pendentes[k] = pendentes.get(k, 0) + 1
    for k in sorted(set(antes) | set(depois)):
        a, d = antes.get(k), depois.get(k)
        if a is None or d is None:
            erros.append(f"{k}: sem contagem antes ou depois")
            continue
        if k.split(".")[0] not in historico and int(a["total"]) != int(d["total"]):
            erros.append(f"{k}: o total mudou ({a['total']} → {d['total']})")
        if k in mover:
            saiu = int(a["sai"]) - int(d["sai"])
            entrou = int(d["fica"]) - int(a["fica"])
            if saiu != entrou:
                erros.append(f"{k}: saíram {saiu} do lado que sai e entraram {entrou} no que fica")
            if int(d["sai"]) != pendentes.get(k, 0):
                erros.append(f"{k}: sobraram {d['sai']} no lado que sai (conflitos: {pendentes.get(k, 0)})")
    return erros


def chave_inventario(L: dict) -> tuple:
    """O que o --aplicar confere contra o dry-run aprovado (--conferir-com): as linhas que movem/param/são tratadas à parte, os
    pares P7, os soltos, o plano e os papéis. O histórico (conta_eventos) fica fora: cresce sozinho e não muda o que move."""
    return ({k: [(i["tc"], i["sai"]) for i in v] for k, v in L["classes"].items() if k != "conta_historico"},
            [(p["sai"], p["fica"]) for p in L["pares"]], sorted(L["soltos"]), L["plano_novo"], L["papeis_novos"])


def dollar(texto: str, tag: str = "w1j") -> str:
    """Texto como literal SQL entre $tag$ … $tag$ (o JSON do backup no --desfazer)."""
    marca = f"${tag}$"
    if marca in texto:
        raise ValueError("o texto contém o delimitador")
    return f"{marca}{texto}{marca}"


def sql_array_texto(itens: list[str]) -> str:
    return "array[" + ",".join(lit(x) for x in itens) + "]::text[]" if itens else "array[]::text[]"


def sql_array_uuid(itens: list[str]) -> str:
    for x in itens:
        if not uuid_ok(x):
            raise ValueError(f"uuid inválido: {x!r}")
    return "array[" + ",".join(f"'{x}'" for x in itens) + "]::uuid[]" if itens else "array[]::uuid[]"


# ───────────────────────── levantamento (inventário) ─────────────────────────

def catalogo(S: str) -> list[dict]:
    """Toda FK do schema que referencia S.pacientes(id) ou S.contas(id) + as colunas uuid *_id de paciente/conta sem FK."""
    fks = sql_principal(f"""
      select cl.relname as tabela, a.attname as coluna, rc.relname as alvo, false as sem_fk
        from pg_constraint con
        join pg_class cl on cl.oid = con.conrelid join pg_namespace n on n.oid = cl.relnamespace
        join pg_class rc on rc.oid = con.confrelid join pg_namespace rn on rn.oid = rc.relnamespace
        join lateral unnest(con.conkey) k(attnum) on true
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
       where con.contype = 'f' and n.nspname = {lit(S)} and rn.nspname = {lit(S)} and rc.relname in ('pacientes', 'contas')
         and array_length(con.conkey, 1) = 1
       order by 3, 1, 2""")
    tem = {(x["tabela"], x["coluna"]) for x in fks}
    soltas = sql_principal(f"""
      select c.table_name as tabela, c.column_name as coluna,
             case when c.column_name in ('conta_id') then 'contas' else 'pacientes' end as alvo, true as sem_fk
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = {lit(S)} and c.data_type = 'uuid' and c.column_name ~ '^(paciente|conta|matricula|aluno)_id$'
         and not exists (select 1 from pg_constraint f join pg_class fc on fc.oid = f.conrelid join pg_namespace fn on fn.oid = fc.relnamespace
                          join pg_attribute fa on fa.attrelid = f.conrelid and fa.attnum = any(f.conkey)
                         where f.contype = 'f' and fn.nspname = c.table_schema and fc.relname = c.table_name and fa.attname = c.column_name)
       order by 1, 2""")
    return fks + [x for x in soltas if (x["tabela"], x["coluna"]) not in tem]


def colunas_array_uuid(S: str) -> list[dict]:
    return sql_principal(f"""select c.table_name as tabela, c.column_name as coluna from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = {lit(S)} and c.udt_name = '_uuid' order by 1, 2""")


def contar(S: str, itens: list[dict], sai: list[str], fica: list[str]) -> dict:
    """{tabela.coluna: {total, sai, fica}} — sai/fica = linhas que apontam para algum dos ids de cada lado."""
    out: dict = {}
    for i in range(0, len(itens), 30):
        partes = []
        for x in itens[i:i + 30]:
            t, c = ident(x["tabela"]), ident(x["coluna"])
            partes.append(f"""select {lit(x['tabela'] + '.' + x['coluna'])} as k, count(*)::int as total,
                  count(*) filter (where {c} = any({sql_array_uuid(sai)}))::int as sai,
                  count(*) filter (where {c} = any({sql_array_uuid(fica)}))::int as fica from {S}.{t}""")
        for r in sql_principal(" union all ".join(partes)):
            out[r["k"]] = {"total": r["total"], "sai": r["sai"], "fica": r["fica"]}
    return out


def levantar(S: str, prof: str, fica: str, sai: str) -> dict:
    if S not in SCHEMAS:
        raise SystemExit(f"schema inválido: {S}")
    for nome, v in (("--profissional", prof), ("--conta-fica", fica), ("--conta-sai", sai)):
        if not uuid_ok(v):
            raise SystemExit(f"{nome} precisa ser um uuid")
    if fica == sai:
        raise SystemExit("--conta-fica e --conta-sai são a mesma conta")
    problemas: list[str] = []
    contas = {c["id"]: c for c in sql_principal(f"""select id::text, nome, dono_id::text, origem, plano, faixa, situacao, isenta_motivo,
                  regras_legadas, cobranca_legada, valor_travado, regra_pix from {S}.contas where id in ({lit(fica)}::uuid, {lit(sai)}::uuid)""")}
    if fica not in contas or sai not in contas:
        raise SystemExit(f"conta não existe no {S}: fica={fica in contas} sai={sai in contas}")
    cf, cs = contas[fica], contas[sai]
    for c in (cf, cs):
        if c["dono_id"] != prof:
            problemas.append(f"a conta {c['id']} não é do profissional (dono {c['dono_id']})")
        if c["origem"] == "app":
            problemas.append(f"a conta {c['id']} é a do app")
    if cf["situacao"] in ("suspensa", "cancelada"):
        problemas.append(f"a conta que fica está {cf['situacao']}")
    membros = sql_principal(f"""select id::text, conta_id::text, user_id::text, papeis, status, codigo_convite, removido_em
                                  from {S}.conta_membros where conta_id in ({lit(fica)}::uuid, {lit(sai)}::uuid) order by criado_em""")
    m_fica = next((m for m in membros if m["conta_id"] == fica and m["user_id"] == prof), None)
    m_sai = next((m for m in membros if m["conta_id"] == sai and m["user_id"] == prof), None)
    if not m_fica or m_fica["status"] != "ativo":
        problemas.append("o profissional não é membro ativo da conta que fica")
    if not m_sai:
        problemas.append("o profissional não é membro da conta que sai")
    outros = [m for m in membros if m["conta_id"] == sai and m["user_id"] != prof and m["status"] != "removido"]
    if outros:
        problemas.append(f"a conta que sai tem outros membros/convites ({len(outros)}): juntar equipe não é deste script")
    papeis = unir_papeis((m_fica or {}).get("papeis"), (m_sai or {}).get("papeis"))
    plano = plano_da_uniao(cf["plano"], cs["plano"])

    cols = "id::text, user_id::text, conta_id::text, nutricionista_id::text, personal_id::text, ativo, deleted_at, config, created_at, " \
           + ", ".join(c for c in CAMPOS_CADASTRO)
    mats_sai = sql_principal(f"select {cols} from {S}.pacientes where conta_id = {lit(sai)}::uuid order by created_at")
    users = sorted({m["user_id"] for m in mats_sai if m["user_id"]})
    mats_fica = sql_principal(f"""select {cols} from {S}.pacientes where conta_id = {lit(fica)}::uuid
                                    and user_id = any({sql_array_uuid(users)})""") if users else []
    pares, soltos, prob_p = parear(mats_sai, mats_fica)
    problemas += prob_p
    por_id = {m["id"]: m for m in mats_sai + mats_fica}
    detalhes_pares = []
    for par in pares:
        s, f = por_id[par["sai"]], por_id[par["fica"]]
        for col in ("nutricionista_id", "personal_id"):
            if s[col] and f[col] and s[col] != f[col]:
                problemas.append(f"par {par['sai']}→{par['fica']}: {col} diferente nas 2 matrículas")
            if s[col] and s[col] != prof and not f[col]:
                problemas.append(f"par {par['sai']}→{par['fica']}: o {col} da que sai não é o profissional")
        cfg, cfg_conflitos = unir_config(s["config"], f["config"])
        detalhes_pares.append({**par, "ativo_sai": s["ativo"], "ativo_fica": f["ativo"],
                               "nutricionista_id": f["nutricionista_id"] or s["nutricionista_id"],
                               "personal_id": f["personal_id"] or s["personal_id"],
                               "config_antes": f["config"], "config_depois": cfg, "config_conflitos": cfg_conflitos,
                               "cadastro_diferente": diferencas_cadastro(s, f)})

    # P26: no staging, só contas de TESTE (o Auth é um só para os 2 schemas)
    ids_pessoas = sorted({prof, *users, *[m["user_id"] for m in membros if m["user_id"]]})
    emails = {x["id"]: x["email"] for x in sql_principal(f"select id::text, email from auth.users where id = any({sql_array_uuid(ids_pessoas)})")}
    if S == "staging":
        reais = [i for i in ids_pessoas if not email_de_teste(emails.get(i))]
        if reais:
            raise SystemExit(f"no staging só contas de TESTE (P26): {len(reais)} login(s) que não são de teste")

    cat = catalogo(S)
    itens_conta = [x for x in cat if x["alvo"] == "contas"]
    itens_pac = [x for x in cat if x["alvo"] == "pacientes"]
    mat_sai = [p["sai"] for p in pares]
    mat_fica = [p["fica"] for p in pares]
    cont_conta = contar(S, itens_conta, [sai], [fica])
    cont_pac = contar(S, itens_pac, mat_sai, mat_fica) if mat_sai else {}
    classes: dict[str, list] = {"conta_mover": [], "conta_historico": [], "conta_especial": [], "conta_parar": [],
                                "paciente_mover": [], "paciente_parar": []}
    for x in itens_conta:
        k = f"{x['tabela']}.{x['coluna']}"
        n = cont_conta[k]["sai"]
        classe = classe_conta(x["tabela"])
        classes[f"conta_{classe}"].append({"tc": k, "sai": n, "sem_fk": x["sem_fk"]})
        if classe == "parar" and n:
            problemas.append(f"{k}: {n} linha(s) da conta que sai — configuração/cobrança da conta, pede decisão")
    for x in itens_pac:
        k = f"{x['tabela']}.{x['coluna']}"
        n = cont_pac.get(k, {"sai": 0})["sai"]
        classe = classe_paciente(x["tabela"])
        classes[f"paciente_{classe}"].append({"tc": k, "sai": n, "sem_fk": x["sem_fk"]})
        if classe == "parar" and n:
            problemas.append(f"{k}: {n} linha(s) na matrícula que sai — pede decisão")
    # ids da conta/matrícula que sai guardados em colunas uuid[] (o bloco não mexe em array): parar se aparecer
    arrays = colunas_array_uuid(S)
    if arrays:
        ids = [sai] + mat_sai
        partes = [f"select {lit(a['tabela'] + '.' + a['coluna'])} as k, count(*)::int as n from {S}.{ident(a['tabela'])} "
                  f"where {ident(a['coluna'])} && {sql_array_uuid(ids)}" for a in arrays]
        for r in sql_principal(" union all ".join(partes)):
            if r["n"]:
                problemas.append(f"{r['k']}: {r['n']} linha(s) com o id da conta/matrícula que sai dentro de um array")

    ja_juntada = (cs["situacao"] == "cancelada" and (m_sai or {}).get("status") == "removido" and cf["plano"] == plano
                  and (m_fica or {}).get("papeis") == papeis and not soltos
                  and all(not d["ativo_sai"] for d in detalhes_pares)
                  and all(x["sai"] == 0 for x in classes["conta_mover"])
                  and all(x["sai"] == 0 for x in classes["paciente_mover"]))
    if not ja_juntada and m_sai and m_sai["status"] != "ativo":
        problemas.append("o membro do profissional na conta que sai não está ativo (e a junção não terminou)")
    if not ja_juntada and cs["situacao"] == "cancelada":
        problemas.append("a conta que sai já está cancelada (e a junção não terminou)")
    return {
        "schema": S, "profissional": prof, "fica": fica, "sai": sai, "ja_juntada": ja_juntada,
        "contas": {"fica": cf, "sai": cs}, "membro_fica": m_fica, "membro_sai": m_sai, "membros": membros,
        "plano_novo": plano, "papeis_novos": papeis, "pares": detalhes_pares, "soltos": soltos,
        "matriculas_da_conta_sai": [{k: m[k] for k in ("id", "user_id", "ativo", "deleted_at", "nutricionista_id", "personal_id")}
                                    for m in mats_sai],
        "classes": classes, "contagens": {**cont_conta, **{f"{k}": v for k, v in cont_pac.items()}},
        "contagens_conta": cont_conta, "contagens_paciente": cont_pac, "emails": emails, "problemas": problemas,
    }


# ───────────────────────── o bloco (uma transação) ─────────────────────────

def _contagem_sql(alvo: str) -> str:
    """Trecho PL/pgSQL: conta {total, sai, fica} de cada item de v_itens ('tabela|coluna|c' ou '|p') e grava em `alvo`."""
    return f"""
  {alvo} := '{{}}'::jsonb;
  foreach v_item in array v_itens loop
    v_t := split_part(v_item, '|', 1); v_c := split_part(v_item, '|', 2);
    if split_part(v_item, '|', 3) = 'c' then
      execute format('select jsonb_build_object(''total'', count(*), ''sai'', count(*) filter (where %I = $1), ''fica'', count(*) filter (where %I = $2)) from %I.%I',
                     v_c, v_c, v_schema, v_t) into v_j using v_sai, v_fica;
    else
      execute format('select jsonb_build_object(''total'', count(*), ''sai'', count(*) filter (where %I = any($1)), ''fica'', count(*) filter (where %I = any($2))) from %I.%I',
                     v_c, v_c, v_schema, v_t) into v_j using v_mat_sai, v_mat_fica;
    end if;
    {alvo} := {alvo} || jsonb_build_object(v_t || '.' || v_c, v_j);
  end loop;"""


def montar_bloco(L: dict, aplicar: bool, hoje_br: str) -> str:
    """O SQL inteiro (begin … commit|rollback). Só UPDATE + 2 INSERT em conta_eventos; confere as contagens e PARA se não batem."""
    S, prof, fica, sai = L["schema"], L["profissional"], L["fica"], L["sai"]
    if S not in SCHEMAS:
        raise ValueError(S)
    mover_c = [x["tc"] for x in L["classes"]["conta_mover"]]
    mover_p = [x["tc"] for x in L["classes"]["paciente_mover"]]
    itens = [f"{tc.replace('.', '|')}|c" for tc in mover_c + [x["tc"] for x in L["classes"]["conta_historico"]]
             + [x["tc"] for x in L["classes"]["conta_especial"]]]
    if L["pares"]:
        itens += [f"{tc.replace('.', '|')}|p" for tc in mover_p]
    for tc in mover_c + mover_p:
        t, c = tc.split(".")
        ident(t), ident(c)
    pares = L["pares"]
    mat_sai = sql_array_uuid([p["sai"] for p in pares])
    mat_fica = sql_array_uuid([p["fica"] for p in pares])
    soltos = sql_array_uuid(L["soltos"])
    papeis = "array[" + ",".join(lit(p) for p in L["papeis_novos"]) + "]::text[]"
    mf, ms = L["membro_fica"], L["membro_sai"]
    motivo = f"juntada na conta {fica} em {hoje_br}"
    pares_json = json.dumps([{"sai": p["sai"], "fica": p["fica"], "user_id": p["user_id"]} for p in pares])
    fim = "commit;" if aplicar else "rollback;"
    disparar = f"perform {S}.espelho_disparar();" if aplicar else "-- (dry-run: o espelho não é chamado)"
    return f"""begin;
do $w1$
declare
  v_schema text := {lit(S)};
  v_prof uuid := {lit(prof)}::uuid;
  v_fica uuid := {lit(fica)}::uuid;
  v_sai uuid := {lit(sai)}::uuid;
  v_mat_sai uuid[] := {mat_sai};
  v_mat_fica uuid[] := {mat_fica};
  v_soltos uuid[] := {soltos};
  v_itens text[] := {sql_array_texto(itens)};
  v_mover_c text[] := {sql_array_texto(mover_c)};
  v_mover_p text[] := {sql_array_texto(mover_p)};
  v_item text; v_t text; v_c text; v_j jsonb; v_id text; i integer; n integer;
  v_antes jsonb; v_depois jsonb;
  v_mudou jsonb := '{{}}'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_cf {S}.contas%rowtype; v_cs {S}.contas%rowtype;
  v_mf {S}.conta_membros%rowtype;
  v_erros text[] := array[]::text[];
  v_saiu integer; v_entrou integer; v_pend integer;
  r jsonb;
begin
  -- 0. trava as 2 contas e confere o que o inventário viu (se mudou entre o inventário e agora: PARA)
  select * into v_cf from {S}.contas where id = v_fica for update;
  select * into v_cs from {S}.contas where id = v_sai for update;
  if v_cf.id is null or v_cs.id is null then raise exception 'W1_PARAR conta_inexistente'; end if;
  if v_cf.dono_id is distinct from v_prof or v_cs.dono_id is distinct from v_prof then raise exception 'W1_PARAR dono_diferente'; end if;
  if v_cf.situacao in ('suspensa', 'cancelada') or v_cf.origem = 'app' or v_cs.origem = 'app' then raise exception 'W1_PARAR conta_invalida'; end if;
  select * into v_mf from {S}.conta_membros where id = {lit(mf['id'])}::uuid and conta_id = v_fica and user_id = v_prof;
  if v_mf.id is null or v_mf.status <> 'ativo' then raise exception 'W1_PARAR membro_fica'; end if;
  if (select count(*) from {S}.pacientes where id = any(v_mat_fica) and conta_id = v_fica and deleted_at is null) <> coalesce(array_length(v_mat_fica, 1), 0)
     or (select count(*) from {S}.pacientes where id = any(v_mat_sai) and conta_id = v_sai) <> coalesce(array_length(v_mat_sai, 1), 0) then
    raise exception 'W1_PARAR matriculas_mudaram';
  end if;
  if exists (select 1 from {S}.pacientes where conta_id = v_sai and id <> all(v_mat_sai) and id <> all(v_soltos)) then
    raise exception 'W1_PARAR paciente_novo_na_conta_que_sai';
  end if;
{_contagem_sql('v_antes')}

  -- 1. o aluno das 2 contas (P7): a matrícula que fica recebe tudo o que apontava para a que sai, uma linha por vez
  --    (linha única por matrícula em conflito fica onde está e vai para o relatório)
  for i in 1 .. coalesce(array_length(v_mat_sai, 1), 0) loop
    foreach v_item in array v_mover_p loop
      v_t := split_part(v_item, '.', 1); v_c := split_part(v_item, '.', 2);
      for v_id in execute format('select id::text from %I.%I where %I = $1 order by 1', v_schema, v_t, v_c) using v_mat_sai[i] loop
        begin
          execute format('update %I.%I set %I = $1 where id::text = $2', v_schema, v_t, v_c) using v_mat_fica[i], v_id;
          v_mudou := jsonb_set(v_mudou, array[v_item], to_jsonb(coalesce((v_mudou ->> v_item)::integer, 0) + 1));
        exception when unique_violation or exclusion_violation then
          v_conflitos := v_conflitos || jsonb_build_object('tabela', v_t, 'coluna', v_c, 'id', v_id, 'de', v_mat_sai[i], 'para', v_mat_fica[i], 'erro', sqlerrm);
        end;
      end loop;
    end loop;
    -- o responsável que faltava e os ajustes que ela não tem (em conflito vale o da que fica); o cadastro não muda
    update {S}.pacientes f
       set nutricionista_id = coalesce(f.nutricionista_id, s.nutricionista_id),
           personal_id = coalesce(f.personal_id, s.personal_id),
           config = coalesce(s.config, '{{}}'::jsonb) || coalesce(f.config, '{{}}'::jsonb)
      from {S}.pacientes s
     where f.id = v_mat_fica[i] and s.id = v_mat_sai[i]
       and (f.nutricionista_id is distinct from coalesce(f.nutricionista_id, s.nutricionista_id)
            or f.personal_id is distinct from coalesce(f.personal_id, s.personal_id)
            or f.config is distinct from coalesce(s.config, '{{}}'::jsonb) || coalesce(f.config, '{{}}'::jsonb));
    get diagnostics n = row_count;
    if n > 0 then v_mudou := jsonb_set(v_mudou, '{{pacientes.matricula_que_fica}}', to_jsonb(coalesce((v_mudou ->> 'pacientes.matricula_que_fica')::integer, 0) + n)); end if;
  end loop;
  -- a matrícula que sai: inativa (encerrada) como histórico — o login, o e-mail e o CPF ficam (a trava de e-mail/CPF não dispara)
  update {S}.pacientes set ativo = false, desvinculado_em = coalesce(desvinculado_em, now()) where id = any(v_mat_sai) and ativo;
  get diagnostics n = row_count;
  if n > 0 then v_mudou := v_mudou || jsonb_build_object('pacientes.matricula_que_sai_encerrada', n); end if;

  -- 2. o que é da conta que sai vai para a que fica (uma linha por vez; conflito de linha única fica onde está)
  foreach v_item in array v_mover_c loop
    v_t := split_part(v_item, '.', 1); v_c := split_part(v_item, '.', 2);
    for v_id in execute format('select id::text from %I.%I where %I = $1 order by 1', v_schema, v_t, v_c) using v_sai loop
      begin
        execute format('update %I.%I set %I = $1 where id::text = $2', v_schema, v_t, v_c) using v_fica, v_id;
        v_mudou := jsonb_set(v_mudou, array[v_item], to_jsonb(coalesce((v_mudou ->> v_item)::integer, 0) + 1));
      exception when unique_violation or exclusion_violation then
        v_conflitos := v_conflitos || jsonb_build_object('tabela', v_t, 'coluna', v_c, 'id', v_id, 'de', v_sai, 'para', v_fica, 'erro', sqlerrm);
      end;
    end loop;
  end loop;
  -- os pacientes da conta que sai sem par na que fica (ex.: inativos antigos): só a conta muda
  update {S}.pacientes set conta_id = v_fica where id = any(v_soltos) and conta_id = v_sai;
  get diagnostics n = row_count;
  if n > 0 then v_mudou := v_mudou || jsonb_build_object('pacientes.conta_id', n); end if;

  -- 3. equipe: o membro da conta que fica soma os papéis; o da que sai sai (removido — o código de convite dele para de valer)
  update {S}.conta_membros set papeis = {papeis} where id = v_mf.id and papeis is distinct from {papeis};
  get diagnostics n = row_count;
  if n > 0 then v_mudou := v_mudou || jsonb_build_object('conta_membros.papeis', n); end if;
  update {S}.conta_membros set status = 'removido', removido_em = coalesce(removido_em, now())
   where id = {lit(ms['id'])}::uuid and conta_id = v_sai and status <> 'removido';
  get diagnostics n = row_count;
  if n > 0 then v_mudou := v_mudou || jsonb_build_object('conta_membros.removido', n); end if;

  -- 4. as contas: a que fica com os 2 módulos (isenção e faixa como estão); a que sai cancelada (nada mais muda nela)
  update {S}.contas set plano = {lit(L['plano_novo'])} where id = v_fica and plano is distinct from {lit(L['plano_novo'])};
  get diagnostics n = row_count;
  if n > 0 then v_mudou := v_mudou || jsonb_build_object('contas.plano', n); end if;
  update {S}.contas set situacao = 'cancelada' where id = v_sai and situacao <> 'cancelada';
  get diagnostics n = row_count;
  if n > 0 then v_mudou := v_mudou || jsonb_build_object('contas.cancelada', n); end if;

  -- 5. 1 evento novo em cada conta (o da cancelada traz o motivo); só se algo mudou agora
  if v_mudou <> '{{}}'::jsonb then
    insert into {S}.conta_eventos (conta_id, tipo, antes, depois, por) values
      (v_fica, 'outro', jsonb_build_object('plano', v_cf.plano, 'papeis', to_jsonb(v_mf.papeis)),
       jsonb_build_object('w1', 'contas_juntadas', 'conta_cancelada', v_sai, 'plano', {lit(L['plano_novo'])}, 'papeis', to_jsonb({papeis}),
                          'matriculas', {lit(pares_json)}::jsonb, 'pacientes_mudaram_de_conta', to_jsonb(v_soltos), 'linhas', v_mudou,
                          'conflitos', v_conflitos, 'em', {lit(hoje_br)}), null),
      (v_sai, 'situacao', jsonb_build_object('situacao', v_cs.situacao, 'isenta_motivo', v_cs.isenta_motivo),
       jsonb_build_object('situacao', 'cancelada', 'motivo', {lit(motivo)}, 'w1', 'contas_juntadas', 'conta_que_fica', v_fica,
                          'por', 'w1_conta_unica'), null);
  end if;
{_contagem_sql('v_depois')}

  -- 6. nada some: total igual em toda tabela contada (menos conta_eventos, que ganha os eventos novos) e o que saiu de um lado
  --    apareceu no outro (menos os conflitos)
  for v_item in select jsonb_object_keys(v_antes) loop
    if split_part(v_item, '.', 1) <> 'conta_eventos' and (v_antes -> v_item ->> 'total') <> (v_depois -> v_item ->> 'total') then
      v_erros := v_erros || (v_item || ' total');
    end if;
  end loop;
  if (v_antes -> 'pacientes.conta_id' ->> 'sai')::integer - (v_depois -> 'pacientes.conta_id' ->> 'sai')::integer <> coalesce(array_length(v_soltos, 1), 0)
     or (v_depois -> 'pacientes.conta_id' ->> 'fica')::integer - (v_antes -> 'pacientes.conta_id' ->> 'fica')::integer <> coalesce(array_length(v_soltos, 1), 0) then
    v_erros := v_erros || 'pacientes.conta_id soltos'::text;
  end if;
  foreach v_item in array v_mover_c || v_mover_p loop
    if not (v_antes ? v_item) then continue; end if;
    v_saiu := (v_antes -> v_item ->> 'sai')::integer - (v_depois -> v_item ->> 'sai')::integer;
    v_entrou := (v_depois -> v_item ->> 'fica')::integer - (v_antes -> v_item ->> 'fica')::integer;
    v_pend := (select count(*) from jsonb_array_elements(v_conflitos) e where (e ->> 'tabela') || '.' || (e ->> 'coluna') = v_item);
    if v_saiu <> v_entrou or (v_depois -> v_item ->> 'sai')::integer <> v_pend then v_erros := v_erros || (v_item || ' saiu/entrou'); end if;
  end loop;
  if coalesce(array_length(v_erros, 1), 0) > 0 then raise exception 'W1_PARAR contagem_nao_bate %', array_to_string(v_erros, ', '); end if;

  {disparar}
  r := jsonb_build_object('antes', v_antes, 'depois', v_depois, 'mudou', v_mudou, 'conflitos', v_conflitos,
    'estado', jsonb_build_object(
      'contas', (select jsonb_agg(jsonb_build_object('id', c.id, 'plano', c.plano, 'faixa', c.faixa, 'situacao', c.situacao,
                   'isenta_motivo', c.isenta_motivo, 'regras_legadas', c.regras_legadas, 'limite_alunos', {S}.conta_limite_alunos(c.id),
                   'alunos_ativos', {S}.conta_alunos_ativos(c.id)) order by c.id = v_sai) from {S}.contas c where c.id in (v_fica, v_sai)),
      'membros', (select jsonb_agg(jsonb_build_object('id', m.id, 'conta_id', m.conta_id, 'papeis', m.papeis, 'status', m.status))
                    from {S}.conta_membros m where m.conta_id in (v_fica, v_sai) and m.user_id = v_prof),
      'matriculas', (select jsonb_agg(jsonb_build_object('id', p.id, 'conta_id', p.conta_id, 'ativo', p.ativo, 'nutricionista_id', p.nutricionista_id,
                       'personal_id', p.personal_id, 'config', p.config, 'desvinculado_em', p.desvinculado_em))
                       from {S}.pacientes p where p.id = any(v_mat_sai || v_mat_fica)),
      'faturas', (select count(*) from {S}.conta_faturas f where f.conta_id in (v_fica, v_sai)),
      'assinaturas', (select count(*) from {S}.conta_assinaturas a where a.conta_id in (v_fica, v_sai)),
      'eventos_novos', (select jsonb_agg(jsonb_build_object('id', e.id, 'conta_id', e.conta_id, 'tipo', e.tipo, 'depois', e.depois) order by e.id)
                          from {S}.conta_eventos e where e.conta_id in (v_fica, v_sai) and e.em >= now()),
      'espelho_pendentes', (select count(*) from {S}.espelho_pendencias e where e.feito_em is null)));
  perform set_config('w1.resultado', r::text, true);
end $w1$;
select current_setting('w1.resultado', true)::jsonb as resultado;
{fim}
"""


def rodar_bloco(sql: str) -> dict:
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": sql},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    if st not in (200, 201) or not isinstance(r, list) or not r or "resultado" not in r[0]:
        raise RuntimeError(f"bloco HTTP {st}: {str(r)[:1500]}")
    return r[0]["resultado"]


# ───────────────────────── backup ─────────────────────────

def backup(L: dict, pasta: Path) -> dict:
    """JSON de tudo o que a junção toca (linhas inteiras) + contagens de TODAS as tabelas dos 2 bancos (o "antes")."""
    S, fica, sai, prof = L["schema"], L["fica"], L["sai"], L["profissional"]
    pasta.mkdir(parents=True, exist_ok=True)
    os.chmod(pasta, 0o700)
    feitos: dict[str, int] = {}

    def p_json(nome: str, sql: str) -> None:
        r = sql_principal(f"select coalesce(json_agg(t), '[]'::json) as j from ({sql}) t")[0]["j"]
        salvar_json(pasta / f"principal.{S}.{nome}.json", r)
        feitos[f"principal.{nome}"] = len(r)

    def t_json(nome: str, sql: str) -> None:
        r = sql_treino(sql)
        salvar_json(pasta / f"treino.{S}.{nome}.json", r)
        feitos[f"treino.{nome}"] = len(r)

    contas = f"({lit(fica)}::uuid, {lit(sai)}::uuid)"
    mat_sai = [p["sai"] for p in L["pares"]]
    mat_fica = [p["fica"] for p in L["pares"]]
    tocadas = mat_sai + mat_fica + L["soltos"]
    p_json("contas", f"select * from {S}.contas where id in {contas}")
    p_json("conta_membros", f"select * from {S}.conta_membros where conta_id in {contas}")
    p_json("pacientes", f"select * from {S}.pacientes where conta_id in {contas} or id = any({sql_array_uuid(tocadas)})")
    p_json("conta_eventos", f"select * from {S}.conta_eventos where conta_id in {contas}")
    movidas = []
    for x in L["classes"]["conta_mover"]:
        if x["sai"]:
            t, c = x["tc"].split(".")
            nome = f"mover.{t}.{c}"
            p_json(nome, f"select * from {S}.{ident(t)} where {ident(c)} = {lit(sai)}::uuid")
            movidas.append({"tc": x["tc"], "arquivo": f"principal.{S}.{nome}.json"})
    for x in L["classes"]["paciente_mover"]:
        if x["sai"]:
            t, c = x["tc"].split(".")
            nome = f"mover.{t}.{c}"
            p_json(nome, f"select * from {S}.{ident(t)} where {ident(c)} = any({sql_array_uuid(mat_sai)})")
            movidas.append({"tc": x["tc"], "arquivo": f"principal.{S}.{nome}.json"})
    pessoas = sorted({prof, *[p["user_id"] for p in L["pares"]]})
    p_json("auth_users", f"select id, email, raw_app_meta_data from auth.users where id = any({sql_array_uuid(pessoas)})")

    # Banco do Treino: as linhas que o espelho mexe (vínculo, perfil, membros, professor) e o treino dos alunos (contagem)
    ident_t = sql_treino(f"""select principal_user_id::text as p, treino_user_id::text as t from {S}.physiq_identidades
                              where principal_user_id = any({sql_array_uuid(pessoas)})""")
    tids = sorted({x["t"] for x in ident_t})
    prof_t = next((x["t"] for x in ident_t if x["p"] == prof), None)
    if tids:
        arr = sql_array_uuid(tids)
        t_json("physiq_identidades", f"select * from {S}.physiq_identidades where treino_user_id = any({arr})")
        t_json("physiq_profiles", f"select * from {S}.physiq_profiles where id = any({arr})"
                                  + (f" or professor_id = {lit(prof_t)}::uuid" if prof_t else "") + f" or conta_id in {contas}")
        t_json("physiq_espelho_membros", f"select * from {S}.physiq_espelho_membros where treino_user_id = any({arr}) or conta_id in {contas}")
        t_json("physiq_professores", f"select * from {S}.physiq_professores where id = any({arr})")
        t_json("auth_users", f"select id, email, raw_app_meta_data from auth.users where id = any({arr})")
    alunos_t = [x["t"] for x in ident_t if x["p"] != prof]
    treino_alunos = treino_do_aluno(S, alunos_t) if alunos_t else {}
    salvar_json(pasta / f"treino.{S}.treino_dos_alunos.json", treino_alunos)

    cont = contagem_geral(S)
    salvar_json(pasta / f"contagens-{S}.json", cont)
    manifesto = {"quando": dt.datetime.now().isoformat(timespec="seconds"), "schema": S, "profissional": prof, "fica": fica, "sai": sai,
                 "pares": [{"sai": p["sai"], "fica": p["fica"], "user_id": p["user_id"]} for p in L["pares"]], "soltos": L["soltos"],
                 "membro_fica": (L["membro_fica"] or {}).get("id"), "membro_sai": (L["membro_sai"] or {}).get("id"),
                 "movidas": movidas, "treino_ids": {"profissional": prof_t, "alunos": alunos_t}, "linhas": feitos}
    salvar_json(pasta / "manifesto.json", manifesto)
    return {"pasta": str(pasta), "linhas": feitos, "tabelas_contadas": len(cont)}


def treino_do_aluno(S: str, tids: list[str]) -> dict:
    """Contagem do treino de cada aluno no Banco do Treino (toda coluna user_id): tem que ser a mesma antes e depois."""
    cols = sql_treino(f"""select c.table_name as tab from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
       where c.table_schema = {lit(S)} and c.column_name = 'user_id' and c.data_type = 'uuid' order by 1""")
    out: dict = {}
    for tid in tids:
        partes = [f"select {lit(x['tab'])} as tab, count(*)::int as n from {S}.{ident(x['tab'])} where user_id = {lit(tid)}::uuid" for x in cols]
        linhas = []
        for i in range(0, len(partes), 30):
            linhas += sql_treino(" union all ".join(partes[i:i + 30]))
        out[tid] = {x["tab"]: x["n"] for x in linhas if x["n"]}
    return out


def contagem_geral(S: str) -> dict:
    cont: dict[str, int] = {}
    pt = sql_principal(f"select table_name as t from information_schema.tables where table_schema = {lit(S)} and table_type = 'BASE TABLE' order by 1")
    for i in range(0, len(pt), 40):
        q = " union all ".join(f"select {lit(x['t'])} as t, count(*)::int as n from {S}.{ident(x['t'])}" for x in pt[i:i + 40])
        cont.update({f"principal.{x['t']}": x["n"] for x in sql_principal(q)})
    tt = sql_treino(f"select table_name as tab from information_schema.tables where table_schema = {lit(S)} and table_type = 'BASE TABLE' order by 1")
    for i in range(0, len(tt), 40):
        q = " union all ".join(f"select {lit(x['tab'])} as tab, count(*)::int as n from {S}.{ident(x['tab'])}" for x in tt[i:i + 40])
        cont.update({f"treino.{x['tab']}": x["n"] for x in sql_treino(q)})
    return cont


# ───────────────────────── espelho ─────────────────────────

def segredo_fila() -> str:
    """hml-16c (S8): o segredo da fila do espelho (o mesmo do Vault physiq_espelho_fila_segredo), que o
    scripts/segredos/servidor.py espelho_fila gerar grava em ~/.physiq-segredo-espelho-fila. Sem ele, o legado."""
    arquivo = Path.home() / ".physiq-segredo-espelho-fila"
    if not arquivo.exists():
        arquivo = Path.home() / ".physiq-espelho-segredo"  # hml-16c F1: reserva — sai no F7
    return arquivo.read_text(encoding="utf-8").strip()


def esperar_espelho(S: str, segundos: int = 120) -> dict:
    """Espera a fila do espelho do schema esvaziar (o espelho_disparar() já chamou a espelho-enviar); se não andar, chama direto."""
    t0 = time.time()
    chamou = False
    while True:
        pend = sql_principal(f"select count(*)::int as n from {S}.espelho_pendencias where feito_em is null and tentativas < 5")[0]["n"]
        if not pend:
            break
        if time.time() - t0 > 45 and not chamou:
            segredo = segredo_fila()
            st, r = http("POST", f"{PRINCIPAL_URL}/functions/v1/espelho-enviar", {"limite": 50},
                         {"x-espelho-segredo": segredo, "x-schema": S}, timeout=120)
            chamou = True
            print(f"   espelho-enviar direto: HTTP {st} {str(r)[:300]}")
        if time.time() - t0 > segundos:
            break
        time.sleep(8)
    falhas = sql_principal(f"""select id, tipo, payload, tentativas, erro from {S}.espelho_pendencias
                                where feito_em is null and tentativas > 0 order by id desc limit 10""")
    pend = sql_principal(f"select count(*)::int as n from {S}.espelho_pendencias where feito_em is null and tentativas < 5")[0]["n"]
    return {"pendentes": pend, "falhas": falhas, "segundos": round(time.time() - t0)}


# ───────────────────────── desfazer ─────────────────────────

def montar_desfazer(pasta: Path, sim: bool) -> tuple[str, dict]:
    man = json.loads((pasta / "manifesto.json").read_text(encoding="utf-8"))
    S, fica, sai = man["schema"], man["fica"], man["sai"]
    if S not in SCHEMAS:
        raise SystemExit("manifesto com schema inválido")

    def ler(nome: str) -> list:
        return json.loads((pasta / f"principal.{S}.{nome}.json").read_text(encoding="utf-8"))

    contas = [c for c in ler("contas") if c["id"] in (fica, sai)]
    membros = [m for m in ler("conta_membros") if m["id"] in (man["membro_fica"], man["membro_sai"])]
    tocadas = {p["sai"] for p in man["pares"]} | {p["fica"] for p in man["pares"]} | set(man["soltos"])
    pacientes = [p for p in ler("pacientes") if p["id"] in tocadas]

    def upd(tabela: str, linhas: list, cols: tuple[str, ...], chave: str | None = None) -> str:
        chave = chave or tabela
        if not linhas:
            return f"-- {chave}: nada"
        sets = ", ".join(f"{ident(c)} = b.{ident(c)}" for c in cols)
        atual = ", ".join(f"x.{ident(c)}" for c in cols)
        antes = ", ".join(f"b.{ident(c)}" for c in cols)
        return (f"update {S}.{ident(tabela)} x set {sets} from json_populate_recordset(null::{S}.{ident(tabela)}, {dollar(json.dumps(linhas))}::json) b "
                f"where x.id = b.id and row({atual}) is distinct from row({antes});\n  get diagnostics n = row_count; "
                f"r := jsonb_set(r, array['voltou', {lit(chave)}], to_jsonb(coalesce((r -> 'voltou' ->> {lit(chave)})::integer, 0) + n));")

    partes = [upd("pacientes", pacientes, COLS_PACIENTES), upd("conta_membros", membros, COLS_MEMBROS), upd("contas", contas, COLS_CONTAS)]
    for m in man["movidas"]:
        t, c = m["tc"].split(".")
        linhas = json.loads((pasta / m["arquivo"]).read_text(encoding="utf-8"))
        partes.append(upd(t, linhas, (c,), chave=m["tc"]))
    corpo = "\n  ".join(partes)
    disparar = f"perform {S}.espelho_disparar();" if sim else "-- (prévia: o espelho não é chamado)"
    sql = f"""begin;
do $w1d$
declare
  r jsonb := jsonb_build_object('voltou', '{{}}'::jsonb);
  n integer;
begin
  {corpo}
  insert into {S}.conta_eventos (conta_id, tipo, depois, por)
  select c, 'outro', jsonb_build_object('w1', 'juncao_desfeita', 'backup', {lit(pasta.name)}), null
    from unnest(array[{lit(fica)}::uuid, {lit(sai)}::uuid]) c where (r -> 'voltou') <> '{{}}'::jsonb;
  {disparar}
  perform set_config('w1.resultado', r::text, true);
end $w1d$;
select current_setting('w1.resultado', true)::jsonb as resultado;
{"commit;" if sim else "rollback;"}
"""
    return sql, man


def conferir_volta(pasta: Path) -> list[str]:
    """Depois do --desfazer --sim: as colunas que a junção muda estão como no backup (só nas linhas que ela mexeu)."""
    man = json.loads((pasta / "manifesto.json").read_text(encoding="utf-8"))
    S = man["schema"]

    def ler(nome: str) -> list:
        return json.loads((pasta / f"principal.{S}.{nome}.json").read_text(encoding="utf-8"))

    tocadas = {p["sai"] for p in man["pares"]} | {p["fica"] for p in man["pares"]} | set(man["soltos"])
    grupos = [("contas", [c for c in ler("contas") if c["id"] in (man["fica"], man["sai"])], COLS_CONTAS),
              ("conta_membros", [m for m in ler("conta_membros") if m["id"] in (man["membro_fica"], man["membro_sai"])], COLS_MEMBROS),
              ("pacientes", [p for p in ler("pacientes") if p["id"] in tocadas], COLS_PACIENTES)]
    for m in man["movidas"]:
        t, c = m["tc"].split(".")
        grupos.append((t, json.loads((pasta / m["arquivo"]).read_text(encoding="utf-8")), (c,)))
    erros = []
    for tabela, linhas, cols in grupos:
        if not linhas:
            continue
        ids = [x["id"] for x in linhas]
        sel = ", ".join(f"to_jsonb({ident(c)}) as {ident(c)}" for c in cols)
        agora = {x["id"]: x for x in sql_principal(f"select id::text as id, {sel} from {S}.{ident(tabela)} where id::text = any({sql_array_texto(ids)})")}
        for b in linhas:
            a = agora.get(b["id"])
            if a is None:
                erros.append(f"{tabela} {b['id']}: sumiu")
                continue
            for c in cols:
                vb, va = b.get(c), a.get(c)
                if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (va, vb)):
                    va, vb = float(va), float(vb)
                if va != vb:
                    erros.append(f"{tabela} {b['id']}.{c}: {vb!r} no backup, {va!r} agora")
    return erros


# ───────────────────────── principal ─────────────────────────

def hoje_br() -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).strftime("%d/%m/%Y")


def resumo(L: dict) -> None:
    cf, cs = L["contas"]["fica"], L["contas"]["sai"]
    print(f"schema {L['schema']} · já juntada: {L['ja_juntada']}")
    print(f"conta que FICA {cf['id']} ({cf['origem']}, {cf['plano']} → {L['plano_novo']}, {cf['situacao']}/{cf['isenta_motivo']}, faixa {cf['faixa']})")
    print(f"conta que SAI  {cs['id']} ({cs['origem']}, {cs['plano']}, {cs['situacao']} → cancelada)")
    print(f"membro: {(L['membro_fica'] or {}).get('papeis')} + {(L['membro_sai'] or {}).get('papeis')} → {L['papeis_novos']}; "
          f"o da conta que sai → removido (código {(L['membro_sai'] or {}).get('codigo_convite')} para de valer)")
    for p in L["pares"]:
        print(f"P7 {p['sai']} → {p['fica']} (ativo {p['ativo_sai']}/{p['ativo_fica']}) nutri={p['nutricionista_id']} personal={p['personal_id']}")
        print(f"   ajustes {p['config_antes']} → {p['config_depois']} · conflitos {p['config_conflitos']}")
        print(f"   cadastro diferente (fica o da que fica): {p['cadastro_diferente']}")
    print(f"pacientes que só mudam de conta: {L['soltos']}")
    for classe, linhas in L["classes"].items():
        com = [f"{x['tc']}={x['sai']}" + ("(sem FK)" if x["sem_fk"] else "") for x in linhas if x["sai"]]
        if com:
            print(f"[{classe}] " + ", ".join(com))
    if L["problemas"]:
        print("PROBLEMAS:", json.dumps(L["problemas"], ensure_ascii=False, indent=1))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--schema", required=True, choices=SCHEMAS)
    ap.add_argument("--profissional")
    ap.add_argument("--conta-fica")
    ap.add_argument("--conta-sai")
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--inventario", action="store_true")
    modo.add_argument("--dry-run", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    modo.add_argument("--desfazer", metavar="PASTA_DO_BACKUP")
    ap.add_argument("--sim", action="store_true", help="confirma o --aplicar / --desfazer")
    ap.add_argument("--conferir-com", metavar="RELATORIO", help="--aplicar só se o inventário for o mesmo deste relatório (do dry-run conferido)")
    ap.add_argument("--pasta")
    a = ap.parse_args()
    agora = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    pasta = Path(a.pasta).expanduser() if a.pasta else PASTA_PADRAO / a.schema

    if a.desfazer:
        pb = Path(a.desfazer).expanduser()
        sql, man = montar_desfazer(pb, a.sim)
        if man["schema"] != a.schema:
            raise SystemExit(f"o backup é do schema {man['schema']}")
        res = rodar_bloco(sql)
        rel = {"quando": agora, "modo": "desfazer" if a.sim else "desfazer-previa", "backup": str(pb), "resultado": res}
        if a.sim:
            rel["espelho"] = esperar_espelho(a.schema)
            rel["diferencas_para_o_backup"] = conferir_volta(pb)
        salvar_json(pasta / f"relatorio-{a.schema}-{rel['modo']}-{agora}.json", rel)
        print(json.dumps(rel, ensure_ascii=False, indent=1, default=str)[:6000])
        return 1 if a.sim and rel["diferencas_para_o_backup"] else 0

    if not (a.profissional and a.conta_fica and a.conta_sai):
        raise SystemExit("informe --profissional, --conta-fica e --conta-sai")
    L = levantar(a.schema, a.profissional, a.conta_fica, a.conta_sai)
    resumo(L)
    modo_txt = "inventario" if a.inventario else "dry-run" if a.dry_run else "aplicar"
    rel = {"quando": agora, "modo": modo_txt, "levantamento": L}
    caminho = pasta / f"relatorio-{a.schema}-{modo_txt}-{agora}.json"
    if L["problemas"]:
        salvar_json(caminho, rel)
        print("relatório:", caminho)
        return 2
    if L["ja_juntada"]:
        print("já juntada — nada a fazer")
        salvar_json(caminho, rel)
        return 0
    if a.inventario:
        salvar_json(caminho, rel)
        print("relatório:", caminho)
        return 0
    if a.aplicar:
        if not a.sim:
            raise SystemExit("--aplicar precisa de --sim (e de um --dry-run conferido antes)")
        if a.conferir_com:
            ref = json.loads(Path(a.conferir_com).expanduser().read_text(encoding="utf-8"))["levantamento"]
            if chave_inventario(ref) != chave_inventario(L):
                print("O INVENTÁRIO MUDOU desde o dry-run conferido — não aplico.")
                salvar_json(caminho, rel)
                return 3
    rel["backup"] = backup(L, pasta / f"backup-{modo_txt}-{agora}")
    sql_aplicar = montar_bloco(L, aplicar=True, hoje_br=hoje_br())
    arq_sql = Path(rel["backup"]["pasta"]) / f"bloco-{a.schema}-aplicar.sql"
    arq_sql.write_text(sql_aplicar, encoding="utf-8")
    os.chmod(arq_sql, 0o600)
    res = rodar_bloco(sql_aplicar if a.aplicar else montar_bloco(L, aplicar=False, hoje_br=hoje_br()))
    rel["resultado"] = res
    rel["conferencia_contagens"] = conferir_contagens(res["antes"], res["depois"],
                                                      [x["tc"] for x in L["classes"]["conta_mover"] + L["classes"]["paciente_mover"]],
                                                      res["conflitos"])
    if a.aplicar:
        rel["espelho"] = esperar_espelho(a.schema)
        rel["contagens_depois"] = contagem_geral(a.schema)
        salvar_json(Path(rel["backup"]["pasta"]) / f"contagens-{a.schema}-depois.json", rel["contagens_depois"])
    salvar_json(caminho, rel)
    print(json.dumps({"mudou": res["mudou"], "conflitos": res["conflitos"], "estado": res["estado"],
                      "conferencia_contagens": rel["conferencia_contagens"], "espelho": rel.get("espelho")},
                     ensure_ascii=False, indent=1, default=str))
    print("backup:", rel["backup"]["pasta"])
    print("relatório:", caminho)
    return 1 if rel["conferencia_contagens"] else 0


if __name__ == "__main__":
    sys.exit(main())
