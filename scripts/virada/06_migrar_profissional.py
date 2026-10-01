#!/usr/bin/env python3
"""Physiq W16b (Parte B) — passa o papel de PROFISSIONAL + MASTER de um login ("de") para outro ("para"), nos 2 bancos, e o
login "de" passa a ser SÓ ALUNO do "para" (decisão do Weslley, 30/09/2026: "Migra todos os alunos do <login de hoje> para o
<login novo>" · "<login de hoje> só será aluno" · "Permissão master será do <login novo> também. Profissional e Master").

O que muda (inventário pelo CATÁLOGO: toda coluna uuid que aponta para o "de" é classificada; coluna sem classe = PARA tudo):
  Banco principal (schema escolhido):
    · contas.dono_id, conta_membros.user_id (os códigos PROF-… vão junto: links e códigos que os alunos têm continuam valendo),
      pacientes.personal_id / nutricionista_id e TODA coluna nutricionista_id (o "dono do registro" do site antigo do Nutri:
      planos, alimentos, receitas, modelos, agenda, financeiro, pré-consulta, exames, WhatsApp…) → "para";
    · perfil do "para" ganha a identidade de profissional do "de" (nome, carimbo, dados_profissionais, config, recebimento,
      tipo_perfil, isenção/teste/pago do site antigo) e role master; o "de" vira role paciente; o código de cadastro (/p/ do
      site antigo) troca entre os 2; app_metadata.role no Auth (compartilhado): "de" → paciente, "para" → master;
    · o "de" vira ALUNO do "para": a matrícula de nutrição que era do login "para" na conta de nutrição (o paciente que ele
      usava como login de aluno) volta para o login "de" (nome e e-mail do "de"); os planos da matrícula do app vão para ela;
      uma matrícula de treino nova na conta de treino (personal "para", o MESMO usuário do Treino — histórico intacto); a
      matrícula do app encerra pelo P7 (app_encerrada_em + motivo vinculou_profissional, como o matricular_na_conta);
    · histórico (conta_eventos.por, *_por) NÃO muda: é o registro de quem fez.
  Banco do Treino (schema escolhido + Auth):
    · physiq_professores (a linha do professor, com o código e o acesso) passa para o usuário do Treino do "para" (criado agora,
      sem senha, se ainda não existe); alunos (physiq_profiles.professor_id), convites, integrações (Mercado Pago), recebimentos
      (Pix), avisos de plano e espelho de membros vão junto; o "de" deixa de ser admin; o "para" vira admin;
    · o treino do "de" como ALUNO (séries, histórico, academias, semana…) fica onde está; o professor dele passa a ser o "para".
  Nenhum e-mail, nenhuma mensagem, nenhuma senha trocada.

Uso:
  python3 scripts/virada/06_migrar_profissional.py --de <uuid> --para <uuid> --schema public --inventario
  python3 scripts/virada/06_migrar_profissional.py --de <uuid> --para <uuid> --schema public --dry-run      (transações desfeitas)
  python3 scripts/virada/06_migrar_profissional.py --de <uuid> --para <uuid> --schema public --aplicar --sim (backup + aplica)
  --pasta <dir> (backup e relatórios; padrão ~/backups/physiq/2026-09-30-w16b/parteB) · --conta-treino/--conta-nutri <uuid>
Idempotente: rodar de novo depois de aplicado não muda nada (tudo filtra pelo "de"; a matrícula de treino só nasce se não existe).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import uuid
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _base import PRINCIPAL_REF, TREINO_CONN, TREINO_REF, email_de_teste, http, lit, pat, salvar_json, sql_principal, sql_treino  # noqa: E402

TREINO_URL = f"https://{TREINO_REF}.supabase.co"
PASTA_PADRAO = Path.home() / "backups" / "physiq" / "2026-09-30-w16b" / "parteB"

# ── classificação das colunas (principal) ──
P_MOVER_FIXAS = {("contas", "dono_id"), ("conta_membros", "user_id"), ("pacientes", "personal_id"), ("pacientes", "nutricionista_id")}
P_ESPECIAIS = {("pacientes", "user_id"), ("profiles", "id")}
P_HISTORICO_COLS = {"por", "criado_por", "confirmado_por", "registrado_por", "decidido_por"}
P_HISTORICO_TABELAS = {"espelho_pendencias", "conta_eventos", "login_tentativas_ip", "login_bloqueios"}
# o que é da PESSOA (fica com o login de sempre): os avisos do sino dela
P_PESSOAIS = {("avisos", "destino_user_id")}
# ── classificação das colunas (Treino) ──
T_MOVER = {("physiq_profiles", "professor_id"), ("physiq_convites", "professor_id"), ("physiq_convites", "criado_por"),
           ("physiq_integracoes", "professor_id"), ("physiq_recebimentos", "professor_id"), ("physiq_avisos_plano", "professor_id"),
           ("physiq_espelho_membros", "treino_user_id")}
T_ESPECIAIS = {("physiq_professores", "id"), ("physiq_profiles", "id"), ("physiq_identidades", "treino_user_id")}
T_POR_CONTEXTO = {("physiq_pagamentos", "user_id"), ("physiq_assinaturas", "user_id")}  # 'aluno' fica; o plano do professor vai
T_HISTORICO = {("physiq_avaliacoes", "created_by"), ("edge_rate_limits", "user_id")}


# ───────────────────────── acesso ─────────────────────────

@lru_cache(maxsize=None)
def chaves(ref: str) -> dict:
    st, lista = http("GET", f"https://api.supabase.com/v1/projects/{ref}/api-keys?reveal=true", cab={"Authorization": f"Bearer {pat()}"})
    if st != 200:
        raise RuntimeError(f"api-keys {ref}: HTTP {st}")
    return {k["name"]: k["api_key"] for k in lista}


def admin_treino(metodo: str, caminho: str, corpo=None) -> tuple[int, object]:
    k = chaves(TREINO_REF)["service_role"]
    return http(metodo, f"{TREINO_URL}/auth/v1/admin/{caminho.lstrip('/')}", corpo, {"apikey": k, "Authorization": f"Bearer {k}"})


def psql_script(script: str) -> list[str]:
    """Roda um script no Banco do Treino (o script decide BEGIN/COMMIT/ROLLBACK); devolve as linhas de saída (-At)."""
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    r = subprocess.run(["psql", TREINO_CONN, "-v", "ON_ERROR_STOP=1", "-At", "-q"], input=script, capture_output=True, text=True,
                       env=env, timeout=600)
    if r.returncode != 0:
        raise RuntimeError(f"psql: {r.stderr[:1500]}")
    return [l for l in r.stdout.splitlines() if l.strip()]


def principal_resultado(bloco: str) -> dict:
    """DO block no principal que termina em raise 'W16B_RESULTADO <json>' (dry-run) ou devolve o json por notice-less select."""
    st, r = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": bloco},
                 {"Authorization": f"Bearer {pat()}"}, timeout=300)
    txt = r.get("message", "") if isinstance(r, dict) else (json.dumps(r) if not isinstance(r, str) else r)
    i = txt.find("W16B_RESULTADO ")
    if i >= 0:
        obj, _ = json.JSONDecoder().raw_decode(txt[i + len("W16B_RESULTADO "):])
        return obj
    if st in (200, 201) and isinstance(r, list) and r and "resultado" in r[0]:
        return r[0]["resultado"]
    raise RuntimeError(f"principal HTTP {st}: {str(r)[:1500]}")


# ───────────────────────── levantamento ─────────────────────────

def colunas_uuid(banco: str, schema: str) -> list[tuple[str, str]]:
    q = f"""select c.table_name t, c.column_name col from information_schema.columns c
              join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
                   and tb.table_type = 'BASE TABLE'
             where c.table_schema = {lit(schema)} and c.data_type = 'uuid' order by 1, 2"""
    linhas = sql_principal(q) if banco == "principal" else sql_treino(q)
    return [(x["t"], x["col"]) for x in linhas]


def contar(banco: str, schema: str, cols: list[tuple[str, str]], ids: list[str]) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(cols), 30):
        partes = []
        for t, c in cols[i:i + 30]:
            filtros = ", ".join(f"count(*) filter (where \"{c}\" = {lit(x)}::uuid) as \"n{j}\"" for j, x in enumerate(ids))
            partes.append(f"select {lit(t)} as t, {lit(c)} as col, {filtros} from {schema}.\"{t}\"")
        q = " union all ".join(partes)
        out += sql_principal(q) if banco == "principal" else sql_treino(q)
    return out


def levantar(a) -> dict:
    S, de, para = a.schema, a.de, a.para
    u = {x["id"]: x for x in sql_principal(f"""select id::text, email, raw_app_meta_data as app, raw_user_meta_data as meta
                                                 from auth.users where id in ({lit(de)}::uuid, {lit(para)}::uuid)""")}
    if de not in u or para not in u:
        raise SystemExit("login 'de' ou 'para' não existe no principal")
    if S == "staging" and not (email_de_teste(u[de]["email"]) and email_de_teste(u[para]["email"])):
        raise SystemExit("no staging só contas de TESTE (P26: o Auth é o da produção)")
    perfis = {x["id"]: x for x in sql_principal(f"select id::text, role, nome, codigo_cadastro from {S}.profiles where id in ({lit(de)}, {lit(para)})")}
    contas = sql_principal(f"select id::text, nome, origem, plano, situacao from {S}.contas where dono_id = {lit(de)} order by criado_em")
    contas_para = sql_principal(f"select id::text from {S}.contas where dono_id = {lit(para)}")
    membros = sql_principal(f"select id::text, conta_id::text, papeis, status, codigo_convite from {S}.conta_membros where user_id = {lit(de)}")
    membros_para = sql_principal(f"select id::text, conta_id::text from {S}.conta_membros where user_id = {lit(para)}")
    # já aplicado (rodar de novo = nada muda): o "de" não tem mais conta nem equipe e as contas são do "para"
    ja_migrado = not contas and not membros and bool(contas_para) and (perfis.get(de) or {}).get("role") != "master"
    ref = contas if contas else (sql_principal(f"select id::text, nome, origem, plano, situacao from {S}.contas where dono_id = {lit(para)} order by criado_em")
                                 if ja_migrado else [])
    ids_contas = [c["id"] for c in ref]
    conta_treino = a.conta_treino or next((c["id"] for c in ref if c["plano"] in ("treino", "treino_nutricao") and c["origem"] != "app"), None)
    conta_nutri = a.conta_nutri or next((c["id"] for c in ref if c["plano"] in ("nutricao", "treino_nutricao") and c["origem"] != "app"), None)
    app = sql_principal(f"""select p.id::text, p.conta_id::text from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
                             where p.user_id = {lit(de)} and c.origem = 'app' and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    mat_para = sql_principal(f"""select id::text, conta_id::text, nutricionista_id::text, personal_id::text, ativo from {S}.pacientes
                                  where user_id = {lit(para)} and deleted_at is null""")
    fora = [m for m in mat_para if m["conta_id"] not in ids_contas]
    if (contas_para or membros_para or fora) and not ja_migrado:
        raise SystemExit(f"o 'para' já tem conta/membro/matrícula fora das contas do 'de': contas {contas_para} membros {membros_para} matrículas {fora}")
    nutri_mat = next((m["id"] for m in mat_para if m["conta_id"] == conta_nutri), None)
    ja_treino = sql_principal(f"select id::text from {S}.pacientes where user_id = {lit(de)} and conta_id = {lit(conta_treino)}::uuid and deleted_at is null") if conta_treino else []
    ident = {x["principal_user_id"]: x["treino_user_id"] for x in sql_treino(f"""select principal_user_id::text, treino_user_id::text
                     from {S}.physiq_identidades where principal_user_id in ({lit(de)}, {lit(para)})""")}
    de_t, para_t = ident.get(de), ident.get(para)
    if not de_t:
        raise SystemExit("o 'de' não tem usuário no Banco do Treino (physiq_identidades)")
    if not para_t:
        achado = sql_treino(f"select id::text from auth.users where lower(email) = lower({lit(u[para]['email'])})")
        if achado:
            raise SystemExit(f"já existe usuário no Treino com o e-mail do 'para' sem vínculo (resolver à mão): {achado}")
    # catálogo
    pc = colunas_uuid("principal", S)
    pcont = contar("principal", S, pc, [de, para])
    tc = colunas_uuid("treino", S)
    tcont = contar("treino", S, tc, [de_t] + ([para_t] if para_t else []))
    nutri_cols = sorted({t for t, c in pc if c == "nutricionista_id" and t != "pacientes"})
    classe_p: dict[str, list] = {"mover": [], "especial": [], "historico": [], "sem_classe": []}
    for x in pcont:
        if not int(x["n0"]):
            continue
        k = (x["t"], x["col"])
        if k in P_MOVER_FIXAS or x["col"] == "nutricionista_id":
            classe_p["mover"].append(x)
        elif k in P_ESPECIAIS:
            classe_p["especial"].append(x)
        elif x["col"] in P_HISTORICO_COLS or x["t"] in P_HISTORICO_TABELAS or k in P_PESSOAIS:
            classe_p["historico"].append(x)
        else:
            classe_p["sem_classe"].append(x)
    classe_t: dict[str, list] = {"mover": [], "especial": [], "aluno_fica": [], "historico": [], "sem_classe": []}
    for x in tcont:
        if not int(x["n0"]):
            continue
        k = (x["t"], x["col"])
        if k in T_MOVER:
            classe_t["mover"].append(x)
        elif k in T_ESPECIAIS:
            classe_t["especial"].append(x)
        elif k in T_HISTORICO:
            classe_t["historico"].append(x)
        elif k in T_POR_CONTEXTO or x["col"] == "user_id":
            classe_t["aluno_fica"].append(x)
        else:
            classe_t["sem_classe"].append(x)
    contexto_prof = {}
    for t in ("physiq_pagamentos", "physiq_assinaturas"):
        contexto_prof[t] = int(sql_treino(f"select count(*)::int n from {S}.{t} where user_id = {lit(de_t)} and coalesce(contexto, 'aluno') <> 'aluno'")[0]["n"])
    return {
        "schema": S, "de": de, "para": para, "ja_migrado": ja_migrado, "de_email": u[de]["email"], "para_email": u[para]["email"],
        "de_role_jwt": (u[de]["app"] or {}).get("role"), "para_role_jwt": (u[para]["app"] or {}).get("role"),
        "perfis": perfis, "contas": contas, "membros": membros, "conta_treino": conta_treino, "conta_nutri": conta_nutri,
        "app_matricula": app[0]["id"] if app else None, "app_conta": app[0]["conta_id"] if app else None,
        "matriculas_do_para": mat_para, "nutri_matricula": nutri_mat, "ja_tem_matricula_treino": [x["id"] for x in ja_treino],
        "de_treino": de_t, "para_treino": para_t, "nutri_cols": nutri_cols,
        "principal": classe_p, "treino": classe_t, "treino_contexto_professor": contexto_prof,
        "nome_de": (perfis.get(de) or {}).get("nome") or (u[de]["meta"] or {}).get("full_name") or u[de]["email"].split("@")[0],
        "nome_para_meta": (u[para]["meta"] or {}).get("full_name"),
    }


# ───────────────────────── os blocos ─────────────────────────

def bloco_principal(L: dict, aplicar: bool, mexer_auth: bool) -> str:
    S, de, para = L["schema"], L["de"], L["para"]
    upd = []
    for t in L["nutri_cols"]:
        upd.append(f"update {S}.\"{t}\" set nutricionista_id = v_para where nutricionista_id = v_de; get diagnostics n = row_count; "
                   f"if n > 0 then r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('{t}.nutricionista_id', n)); end if;")
    contas_sql = ", ".join(f"{lit(c['id'])}::uuid" for c in L["contas"]) or "null::uuid"
    conta_treino = lit(L["conta_treino"]) + "::uuid" if L["conta_treino"] else "null::uuid"
    conta_nutri = lit(L["conta_nutri"]) + "::uuid" if L["conta_nutri"] else "null::uuid"
    app = lit(L["app_matricula"]) + "::uuid" if L["app_matricula"] else "null::uuid"
    app_conta = lit(L["app_conta"]) + "::uuid" if L["app_conta"] else "null::uuid"
    nutri_mat = lit(L["nutri_matricula"]) + "::uuid" if L["nutri_matricula"] else "null::uuid"
    auth = f"""
      update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{{}}'::jsonb) || '{{"role":"paciente"}}'::jsonb
       where id = v_de and coalesce(raw_app_meta_data ->> 'role', '') <> 'paciente';
      get diagnostics n = row_count; r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('auth.de_role_paciente', n));
      update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{{}}'::jsonb) || '{{"role":"master"}}'::jsonb
       where id = v_para and coalesce(raw_app_meta_data ->> 'role', '') <> 'master';
      get diagnostics n = row_count; r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('auth.para_role_master', n));""" if mexer_auth else ""
    fim = "raise exception 'W16B_RESULTADO %', r::text;" if not aplicar else "perform set_config('w16b.resultado', r::text, false);"
    corpo = f"""
do $w16b$
declare
  r jsonb := jsonb_build_object('mudou', '{{}}'::jsonb);
  n integer;
  v_de uuid := {lit(de)}::uuid;
  v_para uuid := {lit(para)}::uuid;
  v_app uuid := {app};
  v_app_conta uuid := {app_conta};
  v_nutri_mat uuid := {nutri_mat};
  v_conta_treino uuid := {conta_treino};
  v_conta_nutri uuid := {conta_nutri};
  v_contas uuid[] := array[{contas_sql}];
  v_nova uuid;
  v_cod_de text;
  v_cod_para text;
begin
  r := r || jsonb_build_object('antes', jsonb_build_object(
    'pacientes_por_conta', (select jsonb_object_agg(x.conta_id, jsonb_build_object('vivos', x.vivos, 'ativos', x.ativos))
                              from (select conta_id::text, count(*) vivos, count(*) filter (where ativo) ativos from {S}.pacientes
                                     where deleted_at is null and conta_id = any(v_contas) group by 1) x),
    'pacientes', (select count(*) from {S}.pacientes), 'contas', (select count(*) from {S}.contas),
    'conta_membros', (select count(*) from {S}.conta_membros), 'planos_alimentares', (select count(*) from {S}.planos_alimentares)));

  -- 1. as contas, a equipe e os alunos do profissional
  update {S}.contas set dono_id = v_para where dono_id = v_de; get diagnostics n = row_count;
  r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('contas.dono_id', n));
  update {S}.conta_membros set user_id = v_para where user_id = v_de; get diagnostics n = row_count;
  r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('conta_membros.user_id', n));
  update {S}.pacientes set personal_id = v_para where personal_id = v_de; get diagnostics n = row_count;
  r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('pacientes.personal_id', n));
  update {S}.pacientes set nutricionista_id = v_para where nutricionista_id = v_de; get diagnostics n = row_count;
  r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('pacientes.nutricionista_id', n));

  -- 2. o que o site antigo do Nutri guarda por dono (nutricionista_id = "profissional dono do registro")
  {' '.join(upd)}

  -- 3. o "de" vira ALUNO do "para"
  -- 3a. a matrícula de nutrição que era do login "para" volta para o login "de" (nome e e-mail do "de")
  if v_nutri_mat is not null then
    update {S}.pacientes set user_id = v_de, nome = {lit(L['nome_de'])}, email = {lit(L['de_email'].lower())}
     where id = v_nutri_mat and user_id = v_para;
    get diagnostics n = row_count;
    r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('pacientes.matricula_nutricao_do_de', n));
  end if;
  -- 3b. os planos da matrícula do app vão para a matrícula de nutrição (o app mostra o ★ ou o mais recente)
  if v_app is not null and v_nutri_mat is not null then
    update {S}.planos_alimentares set paciente_id = v_nutri_mat where paciente_id = v_app;
    get diagnostics n = row_count;
    r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('planos_alimentares.para_matricula_nutricao', n));
  end if;
  -- 3c. matrícula de treino na conta de treino (personal "para"; o MESMO usuário do Treino: o histórico fica)
  if v_conta_treino is not null and not exists (select 1 from {S}.pacientes where user_id = v_de and conta_id = v_conta_treino and deleted_at is null) then
    insert into {S}.pacientes (conta_id, user_id, personal_id, nutricionista_id, treino_user_id, nome, email, telefone, nascimento, genero,
                               objetivo, origem, ativo)
    select v_conta_treino, v_de, v_para, null, {lit(L['de_treino'])}::uuid, {lit(L['nome_de'])}, {lit(L['de_email'].lower())},
           a.telefone, a.nascimento, a.genero, a.objetivo, 'calc', true
      from (select 1) um left join {S}.pacientes a on a.id = v_app
    returning id into v_nova;
    r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('pacientes.matricula_treino_nova', 1));
    r := r || jsonb_build_object('matricula_treino', v_nova);
  end if;
  -- 3d. P7: a matrícula do app encerra (o mesmo que o matricular_na_conta grava); o histórico de cobranças fica nela
  if v_app is not null then
    update {S}.pacientes set ativo = false, app_encerrada_em = now(), app_encerrada_motivo = 'vinculou_profissional'
     where id = v_app and ativo and deleted_at is null;
    get diagnostics n = row_count;
    r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('pacientes.app_encerrada', n));
    if n > 0 then
      insert into {S}.conta_eventos (conta_id, tipo, depois, por)
      values (v_app_conta, 'outro', jsonb_build_object('w07b', 'app_encerrado', 'motivo', 'vinculou_profissional', 'pacientes', jsonb_build_array(v_app),
                                                     'conta_nova', v_conta_treino, 'w16b', 'migrou_profissional'), v_de);
    end if;
  end if;

  -- 4. perfis: o "para" ganha a identidade de profissional e o master; o "de" vira aluno (paciente)
  update {S}.profiles p set role = 'master', nome = d.nome, carimbo_url = d.carimbo_url, dados_profissionais = d.dados_profissionais,
         config = coalesce(d.config, p.config), recebimento = d.recebimento, tipo_perfil = d.tipo_perfil, area_outra = d.area_outra,
         isento_assinatura = d.isento_assinatura, teste_ate = d.teste_ate, pago_ate = d.pago_ate
    from {S}.profiles d where p.id = v_para and d.id = v_de and d.role = 'master';
  get diagnostics n = row_count;
  r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('profiles.para_profissional', n));
  if n > 0 then
    select codigo_cadastro into v_cod_de from {S}.profiles where id = v_de;
    select codigo_cadastro into v_cod_para from {S}.profiles where id = v_para;
    if v_cod_de is not null then
      update {S}.profiles set codigo_cadastro = null where id = v_para;
      update {S}.profiles set codigo_cadastro = v_cod_para where id = v_de;
      update {S}.profiles set codigo_cadastro = v_cod_de where id = v_para;
      r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('profiles.codigo_cadastro_trocado', 1));
    end if;
    update {S}.profiles set role = 'paciente' where id = v_de;
    r := jsonb_set(r, '{{mudou}}', (r -> 'mudou') || jsonb_build_object('profiles.de_paciente', 1));
  end if;

  -- 5. Auth (compartilhado pelos 2 schemas){auth}

  -- 6. registro nas contas e o espelho do Treino (os alunos já entraram na fila pelos gatilhos)
  insert into {S}.conta_eventos (conta_id, tipo, antes, depois, por)
  select c, 'membro', jsonb_build_object('dono', v_de), jsonb_build_object('w16b', 'dono_migrado', 'dono', v_para), null
    from unnest(v_contas) c where c is not null and exists (select 1 from {S}.contas x where x.id = c and x.dono_id = v_para)
     and not exists (select 1 from {S}.conta_eventos e where e.conta_id = c and e.depois ->> 'w16b' = 'dono_migrado' and e.depois ->> 'dono' = v_para::text);
  perform {S}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', v_de));
  perform {S}.espelho_enfileirar('pessoa', jsonb_build_object('principal_user_id', v_para));

  r := r || jsonb_build_object('depois', jsonb_build_object(
    'pacientes_por_conta', (select jsonb_object_agg(x.conta_id, jsonb_build_object('vivos', x.vivos, 'ativos', x.ativos))
                              from (select conta_id::text, count(*) vivos, count(*) filter (where ativo) ativos from {S}.pacientes
                                     where deleted_at is null and conta_id = any(v_contas) group by 1) x),
    'pacientes', (select count(*) from {S}.pacientes), 'contas', (select count(*) from {S}.contas),
    'conta_membros', (select count(*) from {S}.conta_membros), 'planos_alimentares', (select count(*) from {S}.planos_alimentares),
    'sobrou_do_de', jsonb_build_object(
       'contas', (select count(*) from {S}.contas where dono_id = v_de),
       'membros', (select count(*) from {S}.conta_membros where user_id = v_de),
       'alunos_personal', (select count(*) from {S}.pacientes where personal_id = v_de),
       'alunos_nutri', (select count(*) from {S}.pacientes where nutricionista_id = v_de)),
    'matriculas_do_de', (select jsonb_agg(jsonb_build_object('id', p.id, 'conta', p.conta_id, 'ativo', p.ativo, 'personal_e_para', p.personal_id = v_para,
                                                              'nutri_e_para', p.nutricionista_id = v_para, 'app_encerrada', p.app_encerrada_em is not null))
                           from {S}.pacientes p where p.user_id = v_de and p.deleted_at is null),
    'matriculas_do_para', (select count(*) from {S}.pacientes where user_id = v_para and deleted_at is null),
    'planos_da_matricula_nutricao', (select count(*) from {S}.planos_alimentares where paciente_id = v_nutri_mat and deleted_at is null)));
  {fim}
end $w16b$;"""
    if aplicar:
        corpo += "\nselect current_setting('w16b.resultado', true)::jsonb as resultado;"
    return corpo


def bloco_treino(L: dict, para_t: str, aplicar: bool, criar_usuario_falso: bool) -> str:
    S = L["schema"]
    de_t = L["de_treino"]
    email_para = L["para_email"].lower()
    nome = L["nome_de"]
    contexto = ""
    for t in ("physiq_pagamentos", "physiq_assinaturas"):
        contexto += f"update {S}.{t} set user_id = {lit(para_t)} where user_id = {lit(de_t)} and coalesce(contexto, 'aluno') <> 'aluno';\n"
    falso = f"""insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', {lit(para_t)}, 'authenticated', 'authenticated', {lit(email_para)}, '{{}}'::jsonb,
        jsonb_build_object('full_name', {lit(nome)}), now(), now(), now());
""" if criar_usuario_falso else ""
    contagem = f"""select json_build_object('{{rot}}', json_build_object(
  'professores', (select count(*) from {S}.physiq_professores),
  'prof_de', (select count(*) from {S}.physiq_professores where id = {lit(de_t)}),
  'prof_para', (select count(*) from {S}.physiq_professores where id = {lit(para_t)}),
  'codigo_para', (select codigo_convite from {S}.physiq_professores where id = {lit(para_t)}),
  'alunos_do_de', (select count(*) from {S}.physiq_profiles where professor_id = {lit(de_t)}),
  'alunos_do_para', (select count(*) from {S}.physiq_profiles where professor_id = {lit(para_t)}),
  'professor_do_de_como_aluno', (select professor_id::text from {S}.physiq_profiles where id = {lit(de_t)}),
  'conta_do_de_como_aluno', (select conta_id::text from {S}.physiq_profiles where id = {lit(de_t)}),
  'convites', (select count(*) from {S}.physiq_convites where professor_id = {lit(para_t)}),
  'integracoes', (select count(*) from {S}.physiq_integracoes where professor_id = {lit(para_t)}),
  'recebimentos', (select count(*) from {S}.physiq_recebimentos where professor_id = {lit(para_t)}),
  'espelho_membros_para', (select count(*) from {S}.physiq_espelho_membros where treino_user_id = {lit(para_t)}),
  'espelho_membros_de', (select count(*) from {S}.physiq_espelho_membros where treino_user_id = {lit(de_t)}),
  'treino_do_de_como_aluno', json_build_object('series', (select count(*) from {S}.tb_treino_series where user_id = {lit(de_t)}),
       'historico', (select count(*) from {S}.treino_historico where user_id = {lit(de_t)}),
       'concluidos', (select count(*) from {S}.tb_treino_concluido where user_id = {lit(de_t)}),
       'semana', (select count(*) from {S}.tb_semana_treinos where user_id = {lit(de_t)})),
  'role_de', (select raw_app_meta_data ->> 'role' from auth.users where id = {lit(de_t)}),
  'role_para', (select raw_app_meta_data ->> 'role' from auth.users where id = {lit(para_t)}),
  'identidade_para', (select count(*) from {S}.physiq_identidades where principal_user_id = {lit(L['para'])})));
"""
    return f"""\\set ON_ERROR_STOP on
begin;
{falso}{contagem.replace('{rot}', 'antes')}
-- o usuário do Treino do "para" ganha o vínculo de identidade e o perfil de app (o professor também é usuário do app)
insert into {S}.physiq_identidades (principal_user_id, treino_user_id, email, origem)
values ({lit(L['para'])}, {lit(para_t)}, {lit(email_para)}, 'criado') on conflict do nothing;
insert into {S}.physiq_profiles (id, nome, email) values ({lit(para_t)}, {lit(nome)}, {lit(email_para)}) on conflict (id) do nothing;
-- a linha do professor (código, acesso, Pix, plano) passa para o "para": libera o código, copia, move as referências, apaga a velha
update {S}.physiq_professores set codigo_convite = codigo_convite || '-W16B-MOVIDO' where id = {lit(de_t)} and codigo_convite not like '%-W16B-MOVIDO';
insert into {S}.physiq_professores (id, nome, email, foto_url, status, codigo_convite, pix_tipo, pix_chave, pix_favorecido, pix_banco, pix_exibir,
  plano_id, trial_ate, adesao_paga_em, ciclo_inicio, ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada, acesso_liberado_ate,
  alunos_bloqueados_em, alunos_bloqueados_msg, created_at, nucleo_acesso_ate)
select {lit(para_t)}, nome, {lit(email_para)}, foto_url, status, replace(codigo_convite, '-W16B-MOVIDO', ''), pix_tipo, pix_chave, pix_favorecido,
  pix_banco, pix_exibir, plano_id, trial_ate, adesao_paga_em, ciclo_inicio, ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada,
  acesso_liberado_ate, alunos_bloqueados_em, alunos_bloqueados_msg, created_at, nucleo_acesso_ate
  from {S}.physiq_professores where id = {lit(de_t)}
on conflict (id) do nothing;
update {S}.physiq_profiles set professor_id = {lit(para_t)} where professor_id = {lit(de_t)};
update {S}.physiq_convites set professor_id = {lit(para_t)} where professor_id = {lit(de_t)};
update {S}.physiq_convites set criado_por = {lit(para_t)} where criado_por = {lit(de_t)};
update {S}.physiq_integracoes set professor_id = {lit(para_t)} where professor_id = {lit(de_t)};
update {S}.physiq_recebimentos set professor_id = {lit(para_t)} where professor_id = {lit(de_t)};
update {S}.physiq_avisos_plano set professor_id = {lit(para_t)} where professor_id = {lit(de_t)};
update {S}.physiq_espelho_membros set treino_user_id = {lit(para_t)} where treino_user_id = {lit(de_t)};
{contexto}delete from {S}.physiq_professores where id = {lit(de_t)} and exists (select 1 from {S}.physiq_professores where id = {lit(para_t)});
-- o "de" como ALUNO: o professor passa a ser o "para" e a conta é a da matrícula de treino (o treino dele fica onde está)
update {S}.physiq_profiles set professor_id = {lit(para_t)}{(', conta_id = ' + lit(L['conta_treino'])) if L['conta_treino'] else ''} where id = {lit(de_t)};
-- papel no JWT do Treino (o Auth é um só para os 2 schemas): o "de" deixa de ser admin, o "para" vira admin
update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where id = {lit(de_t)} and raw_app_meta_data ->> 'role' in ('admin', 'master');
update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{{}}'::jsonb) || '{{"role":"admin"}}'::jsonb where id = {lit(para_t)};
{contagem.replace('{rot}', 'depois')}
{'commit;' if aplicar else 'rollback;'}
"""


# ───────────────────────── backup ─────────────────────────

def backup(L: dict, pasta: Path) -> dict:
    S, de, para, de_t = L["schema"], L["de"], L["para"], L["de_treino"]
    pasta.mkdir(parents=True, exist_ok=True)
    feitos: dict[str, int] = {}

    def p_json(nome: str, sql: str) -> None:
        r = sql_principal(f"select coalesce(json_agg(t), '[]'::json) as j from ({sql}) t")[0]["j"]
        salvar_json(pasta / f"principal.{S}.{nome}.json", r)
        feitos[f"principal.{nome}"] = len(r)

    def t_json(nome: str, sql: str) -> None:
        r = sql_treino(sql)
        salvar_json(pasta / f"treino.{S}.{nome}.json", r)
        feitos[f"treino.{nome}"] = len(r)

    ids = f"({lit(de)}, {lit(para)})"
    p_json("contas", f"select * from {S}.contas where dono_id = {lit(de)}")
    p_json("conta_membros", f"select * from {S}.conta_membros where user_id = {lit(de)}")
    p_json("pacientes", f"select * from {S}.pacientes where personal_id = {lit(de)} or nutricionista_id = {lit(de)} or user_id in {ids}")
    p_json("profiles", f"select * from {S}.profiles where id in {ids}")
    p_json("auth_users", f"select id, email, raw_app_meta_data, raw_user_meta_data from auth.users where id in {ids}")
    if L["app_matricula"]:
        p_json("planos_da_matricula_app", f"select * from {S}.planos_alimentares where paciente_id = {lit(L['app_matricula'])}")
    for t in L["nutri_cols"]:
        p_json(f"dono.{t}", f"select * from {S}.\"{t}\" where nutricionista_id = {lit(de)}")
    t_json("physiq_professores", f"select * from {S}.physiq_professores where id = {lit(de_t)}")
    t_json("physiq_profiles", f"select * from {S}.physiq_profiles where professor_id = {lit(de_t)} or id = {lit(de_t)}")
    for t, c in sorted(T_MOVER - {("physiq_profiles", "professor_id")}):
        t_json(f"{t}.{c}", f"select * from {S}.{t} where {c} = {lit(de_t)}")
    t_json("physiq_identidades", f"select * from {S}.physiq_identidades where principal_user_id in {ids}")
    t_json("auth_users", f"select id, email, raw_app_meta_data from auth.users where id = {lit(de_t)} or lower(email) = lower({lit(L['para_email'])})")
    # contagens de TODAS as tabelas dos 2 bancos (a conferência antes/depois)
    pt = sql_principal(f"select table_name t from information_schema.tables where table_schema = {lit(S)} and table_type = 'BASE TABLE' order by 1")
    cont = {}
    for i in range(0, len(pt), 40):
        q = " union all ".join(f"select {lit(x['t'])} t, count(*)::int n from {S}.\"{x['t']}\"" for x in pt[i:i + 40])
        cont.update({f"principal.{x['t']}": x["n"] for x in sql_principal(q)})
    tt = sql_treino(f"select table_name t from information_schema.tables where table_schema = {lit(S)} and table_type = 'BASE TABLE' order by 1")
    for i in range(0, len(tt), 40):
        q = " union all ".join(f"select {lit(x['t'])} t, count(*)::int n from {S}.\"{x['t']}\"" for x in tt[i:i + 40])
        cont.update({f"treino.{x['t']}": x["n"] for x in sql_treino(q)})
    salvar_json(pasta / f"contagens-{S}-{dt.datetime.now().strftime('%H%M%S')}.json", cont)
    return {"linhas": feitos, "tabelas_contadas": len(cont)}


# ───────────────────────── principal ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--de", required=True)
    ap.add_argument("--para", required=True)
    ap.add_argument("--schema", required=True, choices=("public", "staging"))
    modo = ap.add_mutually_exclusive_group(required=True)
    modo.add_argument("--inventario", action="store_true")
    modo.add_argument("--dry-run", action="store_true")
    modo.add_argument("--aplicar", action="store_true")
    ap.add_argument("--sim", action="store_true", help="confirma o --aplicar")
    ap.add_argument("--conta-treino")
    ap.add_argument("--conta-nutri")
    ap.add_argument("--sem-auth", action="store_true", help="não muda o app_metadata.role do principal (só para testes)")
    ap.add_argument("--pasta", default=str(PASTA_PADRAO))
    a = ap.parse_args()
    pasta = Path(a.pasta).expanduser()
    agora = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    L = levantar(a)
    relatorio = {"quando": agora, "modo": "inventario" if a.inventario else "dry-run" if a.dry_run else "aplicar", "levantamento": L}
    problemas = []
    if L["principal"]["sem_classe"] or L["treino"]["sem_classe"]:
        problemas.append("colunas sem classe (rever o script)")
    if L["de_role_jwt"] != "master" and (L["perfis"].get(L["de"]) or {}).get("role") != "master" and not L["ja_tem_matricula_treino"]:
        problemas.append("o 'de' não é master")
    if not L["conta_treino"] or not L["conta_nutri"]:
        problemas.append("faltou a conta de treino ou a de nutrição do 'de'")
    relatorio["problemas"] = problemas
    print(json.dumps({k: v for k, v in L.items() if k not in ("principal", "treino")}, ensure_ascii=False, indent=1, default=str))
    for banco in ("principal", "treino"):
        for classe, linhas in L[banco].items():
            if linhas:
                print(f"[{banco}] {classe}: " + ", ".join(f"{x['t']}.{x['col']}={x['n0']}" for x in linhas))
    if problemas:
        print("PROBLEMAS:", problemas)
        salvar_json(pasta / f"relatorio-{a.schema}-{relatorio['modo']}-{agora}.json", relatorio)
        return 2
    if a.inventario:
        salvar_json(pasta / f"relatorio-{a.schema}-inventario-{agora}.json", relatorio)
        return 0

    para_t = L["para_treino"]
    if a.dry_run:
        relatorio["backup"] = backup(L, pasta / f"backup-{a.schema}-{agora}")
        relatorio["principal"] = principal_resultado(bloco_principal(L, aplicar=False, mexer_auth=not a.sem_auth))
        relatorio["treino"] = [json.loads(l) for l in psql_script(bloco_treino(L, para_t or str(uuid.uuid4()), aplicar=False,
                                                                                criar_usuario_falso=not para_t)) if l.startswith("{")]
    else:
        if not a.sim:
            raise SystemExit("--aplicar precisa de --sim (e de um --dry-run conferido antes)")
        relatorio["backup"] = backup(L, pasta / f"backup-{a.schema}-{agora}")
        if not para_t:
            st, u = admin_treino("POST", "users", {"email": L["para_email"].lower(), "email_confirm": True,
                                                   "user_metadata": {"full_name": L["nome_de"]}, "app_metadata": {"role": "admin"}})
            if st not in (200, 201) or not isinstance(u, dict) or not u.get("id"):
                raise SystemExit(f"não criou o usuário do Treino do 'para': HTTP {st} {u}")
            para_t = u["id"]
            relatorio["treino_usuario_criado"] = para_t
        relatorio["principal"] = principal_resultado(bloco_principal(L, aplicar=True, mexer_auth=not a.sem_auth))
        relatorio["treino"] = [json.loads(l) for l in psql_script(bloco_treino(L, para_t, aplicar=True, criar_usuario_falso=False)) if l.startswith("{")]
    caminho = pasta / f"relatorio-{a.schema}-{relatorio['modo']}-{agora}.json"
    salvar_json(caminho, relatorio)
    print(json.dumps({"principal": relatorio["principal"], "treino": relatorio["treino"]}, ensure_ascii=False, indent=1, default=str))
    print("relatório:", caminho)
    return 0


if __name__ == "__main__":
    sys.exit(main())
