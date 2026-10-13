#!/usr/bin/env python3
"""Physiq hml-21b (H-43 parte 2 · jeito 2, etapa 3, 13/10/2026) — as 2 RPCs atômicas da Agenda NO STAGING, como a pessoa: a migration
20261013100000_hml21b_agenda_atomicas (agenda_excluir_calendario e agenda_garantir_inicio). O molde do e2e/wa/sql_wa.py: cada caso é UM
bloco que termina com erro de propósito (nada fica gravado — a massa nasce DENTRO do bloco e volta junto) e devolve o resultado na mensagem.
"Como o app" = o papel authenticated com o sub de uma conta de TESTE (w5p-nutri, w5p-personal = o dono da conta, w5p-aluna, w13-dono = OUTRA
conta); "sem login" = as claims vazias. A prova da criação (o 1º acesso de quem não tem calendário) é feita DENTRO do bloco: os calendários
da nutri vão à Lixeira só nele (nenhuma conta nova no Auth — decisão I) e voltam com o bloco.
Casos (staging): excluir E1–E7 · garantir G1–G9 + G5b (⚪7 da revisão: os 2 lados dos `or` da forma — papéis e módulos — e a trava
pg_advisory_xact_lock tomada pelo authenticated) · catalogo K1–K2 (só leitura; vale no public).
Uso: python3 e2e/hml21/sql_agenda.py [--grupo excluir,garantir,catalogo] [--casos E1,G2]     (staging; roda na ETAPA 2, depois da migration)
     python3 e2e/hml21/sql_agenda.py --so-catalogo --schema staging|public                 (só leitura)
     python3 e2e/hml21/sql_agenda.py --seco                                                 (monta os blocos; NADA vai ao banco)
Antes da migration os casos ficam ❌ (a função não existe). Antes de CADA execução que toca o staging: a PAUSA
(~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "sql_agenda.py …") e o /health (aqui dentro).
Saída sem dado pessoal: só códigos, contagens e booleanos.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C = B.C
S = "staging"
MARCA = B.MARCA
FALHA_SQL = re.compile(r"RESULTADO<<(\{.*?\})>>", re.S)
FUNCOES = ("agenda_excluir_calendario(uuid)", "agenda_garantir_inicio(uuid, text[], text[])")


# ───────────────────────── os blocos (o molde do sql_wa.py) ─────────────────────────
def como(uid: str) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` (uma variável do bloco)."""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated')::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


SEM_LOGIN = "  perform set_config('request.jwt.claims', '', true);\n  perform set_config('role', 'authenticated', true);\n"
VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"


def res(**kv: str) -> str:
    """v_res ganha as chaves (cada valor é uma expressão SQL)."""
    return "  v_res := v_res || jsonb_build_object(" + ", ".join(f"'{k}', {v}" for k, v in kv.items()) + ");\n"


def erro(chave: str, sql: str) -> str:
    """O comando num sub-bloco: o código do erro (sqlerrm) ou 'passou' — o sub-bloco volta o que o comando fez (savepoint)."""
    return (f"  begin\n    {sql}\n    v_res := v_res || jsonb_build_object('{chave}', 'passou');\n"
            f"  exception when others then\n    v_res := v_res || jsonb_build_object('{chave}', sqlerrm);\n  end;\n")


def bloco_sql(corpo: str) -> str:
    """O bloco: as contas de TESTE (pelo e-mail), a conta da aluna (a da nutri), o calendário de TESTE da nutri na conta com 2 consultas
    vivas sem aluno (o gatilho W20 não avisa ninguém) e 1 na Lixeira — tudo com a marca, criado como postgres (fora do RLS) e desfeito no
    fim (o raise RESULTADO)."""
    e = B.B5.CONTAS
    return f"""do $t$
declare
  v_nutri uuid; v_personal uuid; v_aluna uuid; v_dono_b uuid; v_conta_a uuid; v_pac_a uuid;
  v_cal uuid; v_ag1 uuid; v_ag2 uuid; v_ag3 uuid; v_n integer; v_j jsonb; v_cals integer; v_tags integer;
  v_antiga timestamptz := now() - interval '3 days';
  v_res jsonb := '{{}}'::jsonb;
begin
  select u.id into v_nutri from auth.users u where lower(u.email) = '{e["w5p-nutri"][0].lower()}';
  select u.id into v_personal from auth.users u where lower(u.email) = '{e["w5p-personal"][0].lower()}';
  select u.id into v_aluna from auth.users u where lower(u.email) = '{e["w5p-aluna"][0].lower()}';
  select u.id into v_dono_b from auth.users u where lower(u.email) = '{e["w13-dono"][0].lower()}';
  select p.id, p.conta_id into v_pac_a, v_conta_a from {S}.pacientes p
   where p.user_id = v_aluna and p.deleted_at is null and p.nutricionista_id = v_nutri order by p.created_at limit 1;
  if v_nutri is null or v_personal is null or v_aluna is null or v_dono_b is null or v_conta_a is null then
    raise exception 'RESULTADO<<%>>', jsonb_build_object('erro', 'massa de TESTE incompleta', 'falta', jsonb_strip_nulls(jsonb_build_object(
      'nutri', v_nutri is null, 'personal', v_personal is null, 'aluna', v_aluna is null, 'dono_b', v_dono_b is null,
      'conta_a', v_conta_a is null)))::text;
  end if;
  -- o calendário de TESTE da nutri na conta da aluna, com 2 consultas vivas (sem aluno) e 1 já na Lixeira (há 3 dias)
  insert into {S}.calendarios (nutricionista_id, conta_id, nome, cor) values (v_nutri, v_conta_a, '{MARCA} sql_agenda', '#a78bfa')
  returning id into v_cal;
  insert into {S}.agendamentos (nutricionista_id, calendario_id, conta_id, titulo, inicio, fim, modulo)
  values (v_nutri, v_cal, v_conta_a, '{MARCA} 1', now() + interval '20 days', now() + interval '20 days 30 minutes', 'geral') returning id into v_ag1;
  insert into {S}.agendamentos (nutricionista_id, calendario_id, conta_id, titulo, inicio, fim, modulo)
  values (v_nutri, v_cal, v_conta_a, '{MARCA} 2', now() + interval '21 days', now() + interval '21 days 30 minutes', 'geral') returning id into v_ag2;
  insert into {S}.agendamentos (nutricionista_id, calendario_id, conta_id, titulo, inicio, fim, modulo, deleted_at)
  values (v_nutri, v_cal, v_conta_a, '{MARCA} 3', now() + interval '22 days', now() + interval '22 days 30 minutes', 'geral', v_antiga) returning id into v_ag3;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;"""


def vivos(var: str = "v_cal") -> str:
    return f"(select count(*) from {S}.agendamentos a where a.calendario_id = {var} and a.deleted_at is null)"


def casos() -> dict[str, tuple[str, str, dict]]:
    """id → (grupo, corpo do bloco, o resultado esperado)."""
    k: dict[str, tuple[str, str, dict]] = {}
    instante_igual = (f"(select c.deleted_at from {S}.calendarios c where c.id = v_cal) is not null and (select c.deleted_at from {S}.calendarios c "
                      f"where c.id = v_cal) = all(select a.deleted_at from {S}.agendamentos a where a.id in (v_ag1, v_ag2))")
    # ───────────── EXCLUIR (agenda_excluir_calendario) ─────────────
    k["E1"] = ("excluir",
               como("v_nutri") + f"  v_n := {S}.agenda_excluir_calendario(v_cal);\n" + VOLTA
               + res(n="v_n", mesmo_instante=instante_igual, vivos=vivos(),
                     lixeira_antiga=f"(select a.deleted_at = v_antiga from {S}.agendamentos a where a.id = v_ag3)"),
               {"n": 2, "mesmo_instante": True, "vivos": 0, "lixeira_antiga": True})
    k["E2"] = ("excluir",
               como("v_dono_b") + erro("outra_conta", f"perform {S}.agenda_excluir_calendario(v_cal);") + VOLTA
               + res(cal_vivo=f"(select c.deleted_at is null from {S}.calendarios c where c.id = v_cal)", vivos=vivos()),
               {"outra_conta": "nao_encontrado", "cal_vivo": True, "vivos": 2})
    k["E3"] = ("excluir",
               SEM_LOGIN + erro("sem_login", f"perform {S}.agenda_excluir_calendario(v_cal);") + VOLTA + res(vivos=vivos()),
               {"sem_login": "sem_login", "vivos": 2})
    k["E4"] = ("excluir",
               como("v_nutri") + erro("nulo", f"perform {S}.agenda_excluir_calendario(null);") + VOLTA,
               {"nulo": "dados_invalidos"})
    k["E5"] = ("excluir",
               f"  update {S}.calendarios set deleted_at = v_antiga where id = v_cal;\n"
               + como("v_nutri") + erro("na_lixeira", f"perform {S}.agenda_excluir_calendario(v_cal);") + VOLTA
               + res(vivos=vivos(), cal_igual=f"(select c.deleted_at = v_antiga from {S}.calendarios c where c.id = v_cal)"),
               {"na_lixeira": "nao_encontrado", "vivos": 2, "cal_igual": True})
    k["E6"] = ("excluir",
               como("v_personal") + f"  v_n := {S}.agenda_excluir_calendario(v_cal);\n" + VOLTA
               + res(dono_da_conta="v_n", mesmo_instante=instante_igual),
               {"dono_da_conta": 2, "mesmo_instante": True})
    k["E7"] = ("excluir",
               como("v_aluna") + erro("aluna", f"perform {S}.agenda_excluir_calendario(v_cal);") + VOLTA + res(vivos=vivos()),
               {"aluna": "nao_encontrado", "vivos": 2})
    # ───────────── GARANTIR (agenda_garantir_inicio) ─────────────
    contar = (f"  select count(*) into v_cals from {S}.calendarios where nutricionista_id = v_nutri;\n"
              f"  select count(*) into v_tags from {S}.agenda_tags where profissional_id = v_nutri;\n")
    sem_calendarios = f"  update {S}.calendarios set deleted_at = now() where nutricionista_id = v_nutri and deleted_at is null;\n"
    k["G1"] = ("garantir",
               contar + como("v_nutri") + f"  v_j := {S}.agenda_garantir_inicio(v_conta_a, array['nutricionista'], array['nutricao']);\n" + VOLTA
               + res(criados="jsonb_array_length(v_j -> 'criados')",
                     cal_igual=f"(select count(*) from {S}.calendarios where nutricionista_id = v_nutri) = v_cals",
                     tags_igual=f"(select count(*) from {S}.agenda_tags where profissional_id = v_nutri) = v_tags"),
               {"criados": 0, "cal_igual": True, "tags_igual": True})
    k["G2"] = ("garantir",
               sem_calendarios + como("v_nutri")
               + f"  v_j := {S}.agenda_garantir_inicio(v_conta_a, array['personal', 'nutricionista'], array['treino', 'nutricao']);\n" + VOLTA
               + res(nomes="(select jsonb_agg(x ->> 'nome' order by o) from jsonb_array_elements(v_j -> 'criados') with ordinality t(x, o))",
                     padrao="(select jsonb_agg((x ->> 'padrao')::boolean order by o) from jsonb_array_elements(v_j -> 'criados') with ordinality t(x, o))",
                     cores="(select jsonb_agg(x ->> 'cor' order by o) from jsonb_array_elements(v_j -> 'criados') with ordinality t(x, o))",
                     dono_e_conta="(select bool_and((x ->> 'nutricionista_id')::uuid = v_nutri and (x ->> 'conta_id')::uuid = v_conta_a) "
                                  "from jsonb_array_elements(v_j -> 'criados') x)",
                     tags_da_area=(f"(select bool_and(t.base and t.profissional_id = v_nutri and t.area = case x ->> 'nome' when 'Treino' then 'treino' "
                                   f"else 'nutricao' end) from jsonb_array_elements(v_j -> 'criados') x join {S}.agenda_tags t on t.id = (x ->> 'tag_padrao_id')::uuid)"),
                     base_vivas=f"(select count(distinct t.area) from {S}.agenda_tags t where t.profissional_id = v_nutri and t.base and t.deleted_at is null)",
                     ordem=f"(select (array_agg(c.nome order by c.created_at, c.id))[1:2] = array['Treino', 'Nutrição'] from {S}.calendarios c "
                           f"where c.nutricionista_id = v_nutri and c.deleted_at is null)"),
               {"nomes": ["Treino", "Nutrição"], "padrao": [True, False], "cores": ["#a78bfa", "#34d399"], "dono_e_conta": True, "tags_da_area": True,
                "base_vivas": 3, "ordem": True})
    k["G3"] = ("garantir",
               sem_calendarios + como("v_nutri")
               + f"  v_j := {S}.agenda_garantir_inicio(v_conta_a, array['personal', 'nutricionista'], array['treino', 'nutricao']);\n"
               + f"  v_j := {S}.agenda_garantir_inicio(v_conta_a, array['personal', 'nutricionista'], array['treino', 'nutricao']);\n" + VOLTA
               + res(segunda="jsonb_array_length(v_j -> 'criados')",
                     vivos=f"(select count(*) from {S}.calendarios where nutricionista_id = v_nutri and deleted_at is null)"),
               {"segunda": 0, "vivos": 2})
    k["G4"] = ("garantir",
               SEM_LOGIN + erro("sem_login", f"perform {S}.agenda_garantir_inicio(v_conta_a, '{{}}'::text[], '{{}}'::text[]);") + VOLTA,
               {"sem_login": "sem_login"})
    k["G5"] = ("garantir",
               como("v_nutri")
               + erro("onze", f"perform {S}.agenda_garantir_inicio(v_conta_a, array_fill('x'::text, array[11]), '{{}}'::text[]);")
               + erro("vazio", f"perform {S}.agenda_garantir_inicio(v_conta_a, array[''], '{{}}'::text[]);")
               + erro("nulo_na_lista", f"perform {S}.agenda_garantir_inicio(v_conta_a, array['personal', null], '{{}}'::text[]);")
               + erro("duas_dimensoes", f"perform {S}.agenda_garantir_inicio(v_conta_a, array[array['a'], array['b']], '{{}}'::text[]);") + VOLTA,
               {"onze": "dados_invalidos", "vazio": "dados_invalidos", "nulo_na_lista": "dados_invalidos", "duas_dimensoes": "dados_invalidos"})
    # ⚪7 da revisão: os 2 lados dos `or` da forma (os PAPÉIS e os MÓDULOS — cada condição recusa sozinha) …
    k["G5b"] = ("garantir",
                como("v_nutri")
                + erro("onze_modulos", f"perform {S}.agenda_garantir_inicio(v_conta_a, '{{}}'::text[], array_fill('x'::text, array[11]));")
                + erro("modulo_vazio", f"perform {S}.agenda_garantir_inicio(v_conta_a, '{{}}'::text[], array['']);")
                + erro("modulo_nulo", f"perform {S}.agenda_garantir_inicio(v_conta_a, '{{}}'::text[], array['treino', null]);")
                + erro("modulos_2d", f"perform {S}.agenda_garantir_inicio(v_conta_a, '{{}}'::text[], array[array['a'], array['b']]);")
                + erro("modulo_41", f"perform {S}.agenda_garantir_inicio(v_conta_a, '{{}}'::text[], array[repeat('m', 41)]);") + VOLTA,
                {"onze_modulos": "dados_invalidos", "modulo_vazio": "dados_invalidos", "modulo_nulo": "dados_invalidos", "modulos_2d": "dados_invalidos",
                 "modulo_41": "dados_invalidos"})
    # … e a trava por pessoa (pg_advisory_xact_lock) PELO authenticated: depois da chamada (o INVOKER roda com o papel de quem chama), o lock
    # consultivo desta transação está tomado (pg_locks) — e o lock some no fim da transação (o bloco volta)
    k["G9"] = ("garantir",
               f"  select count(*) into v_n from pg_catalog.pg_locks l where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid() and l.granted;\n"
               + como("v_nutri") + f"  v_j := {S}.agenda_garantir_inicio(v_conta_a, array['nutricionista'], array['nutricao']);\n"
               + res(papel="current_user::text") + VOLTA
               + res(locks_antes="v_n",
                     locks_depois=("(select count(*) from pg_catalog.pg_locks l where l.locktype = 'advisory' and l.pid = pg_catalog.pg_backend_pid() "
                                   "and l.granted)")),
               {"papel": "authenticated", "locks_antes": 0, "locks_depois": 1})
    k["G6"] = ("garantir",
               sem_calendarios + como("v_nutri") + f"  v_j := {S}.agenda_garantir_inicio(v_conta_a, array['nutricionista'], array['nutricao']);\n" + VOLTA
               + res(nomes="(select jsonb_agg(x ->> 'nome') from jsonb_array_elements(v_j -> 'criados') x)",
                     area_da_tag=(f"(select t.area from jsonb_array_elements(v_j -> 'criados') x join {S}.agenda_tags t on t.id = (x ->> 'tag_padrao_id')::uuid "
                                  f"limit 1)")),
               {"nomes": ["Calendário principal"], "area_da_tag": "nutricao"})
    k["G7"] = ("garantir",
               # 2 chamadas no MESMO bloco (a 2ª depois da 1ª: a trava por pessoa só segura a transação; aqui a prova é que a 2ª vê os da 1ª)
               sem_calendarios + como("v_nutri") + f"  v_j := {S}.agenda_garantir_inicio(null, '{{}}'::text[], '{{}}'::text[]);\n" + VOLTA
               + res(nomes="(select jsonb_agg(x ->> 'nome') from jsonb_array_elements(v_j -> 'criados') x)",
                     sem_conta="(select bool_and(x -> 'conta_id' = 'null'::jsonb) from jsonb_array_elements(v_j -> 'criados') x)",
                     sem_tag="(select bool_and(x -> 'tag_padrao_id' = 'null'::jsonb) from jsonb_array_elements(v_j -> 'criados') x)"),
               {"nomes": ["Calendário principal"], "sem_conta": True, "sem_tag": True})
    k["G8"] = ("garantir",
               # o dono é SEMPRE quem chama (a outra conta não cria calendário para a nutri, nem com a conta dela no corpo)
               f"  select count(*) into v_cals from {S}.calendarios where nutricionista_id = v_nutri;\n"
               + como("v_dono_b") + erro("outra", f"v_j := {S}.agenda_garantir_inicio(v_conta_a, array['nutricionista'], array['nutricao']);") + VOLTA
               + res(nutri_igual=f"(select count(*) from {S}.calendarios where nutricionista_id = v_nutri) = v_cals",
                     dono_dos_criados="(select coalesce(bool_and((x ->> 'nutricionista_id')::uuid = v_dono_b), true) from jsonb_array_elements(coalesce(v_j -> 'criados', '[]'::jsonb)) x)"),
               {"outra": "passou", "nutri_igual": True, "dono_dos_criados": True})
    return k


# ───────────────────────── a execução (a Management API; o bloco volta inteiro) ─────────────────────────
def _mgmt(q: str) -> list:
    st, r, _ = B.B5.http("POST", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/database/query", {"query": q},
                         {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=180)
    if st not in (200, 201):
        msg = r.get("message") if isinstance(r, dict) else r
        raise RuntimeError(f"SQL HTTP {st}: {msg}")
    return r or []


def resultado(q: str) -> dict:
    """Roda um bloco que TERMINA com raise 'RESULTADO<<json>>' (nada fica gravado) e devolve o json. Outro erro → RuntimeError."""
    try:
        _mgmt(q)
    except RuntimeError as e:
        m = FALHA_SQL.search(str(e))
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado (RESULTADO<<…>>)")


def catalogo(o, s: str) -> None:
    """K1–K2 (só leitura; vale no public): as 2 funções existem, INVOKER com search_path '' e o EXECUTE só do logado e do servidor."""
    # o to_regprocedure aceita a assinatura como escrita (com espaços) e devolve null se não existe (o texto do regprocedure não tem espaço)
    fs = ", ".join(f"to_regprocedure({C.txt(f'{s}.{f}')})" for f in FUNCOES)
    linhas = B.ler_principal(
        f"select p.oid::regprocedure::text as f, p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as cfg, "
        f"has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado, "
        f"has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor from pg_proc p where p.oid = any(array[{fs}]::oid[])")
    o.ok(len(linhas) == 2, f"[K1/{s}] as 2 funções da migration existem ({len(linhas)})")
    o.ok(all(x["definer"] is False and x["cfg"] in ('search_path=""', "search_path=") and x["anon"] is False and x["autenticado"] is True
             and x["servidor"] is True for x in linhas) and len(linhas) == 2,
         f"[K2/{s}] INVOKER com search_path '' e o EXECUTE só do logado e do servidor ({[(x['f'].split('(')[0].split('.')[-1], x['definer'], x['cfg']) for x in linhas]})")


def rodar(o, ids: list[str]) -> None:
    ks = casos()
    for i in ids:
        grupo, corpo, esperado = ks[i]
        try:
            r = resultado(bloco_sql(corpo))
        except RuntimeError as e:
            o.ok(False, f"[{i}] {grupo}: erro — {str(e).strip().splitlines()[0][:200]}")
            continue
        o.ok(r == esperado, f"[{i}] {grupo}: {json.dumps(r, ensure_ascii=False)[:500]}"
             + ("" if r == esperado else f"  ≠ esperado {json.dumps(esperado, ensure_ascii=False)[:400]}"))


def seco(o, ids: list[str]) -> None:
    ks = casos()
    for i in ids:
        q = bloco_sql(ks[i][1])
        o.ok(q.count("$t$") == 2 and q.count("perform set_config('role', 'authenticated'") == q.count("perform set_config('role', 'postgres'")
             and "public." not in q and q.rstrip().endswith("end $t$;") and "raise exception 'RESULTADO<<%>>', v_res::text;" in q,
             f"[{i}] bloco bem formado ({len(q)} caracteres; cada 'como o app' com o seu VOLTA; só staging; termina no RESULTADO — nada fica gravado)")
    o.ok({k[0] for k in ks.values()} == {"excluir", "garantir"} and len([i for i in ks if i.startswith("E")]) == 7 and len([i for i in ks if i.startswith("G")]) == 10,
         "os casos: excluir E1–E7 (a nutri, outra conta, sem login, nulo, na Lixeira, o dono da conta, a aluna) e garantir G1–G9 + G5b (idempotente, "
         "a criação — Treino e Nutrição, a 2ª chamada, sem login, a forma dos papéis e dos MÓDULOS — os 2 lados dos or —, só nutri, sem conta, "
         "outra conta, a trava por pessoa tomada pelo authenticated)")
    o.ok(FALHA_SQL.search('erro: RESULTADO<<{"a": 1}>> fim').group(1) == '{"a": 1}', "o RESULTADO sai da mensagem do erro (o molde do sql_wa.py)")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21b — as 2 RPCs atômicas da Agenda no staging, como a pessoa (blocos desfeitos)")
    ap.add_argument("--grupo", default="")
    ap.add_argument("--casos", default="")
    ap.add_argument("--so-catalogo", action="store_true")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    ks = casos()
    ids = [x.strip() for x in a.casos.split(",") if x.strip()] or [i for i, (g, _, _) in ks.items() if not a.grupo or g in a.grupo.split(",")]
    fora = [i for i in ids if i not in ks]
    if fora:
        raise SystemExit(f"casos desconhecidos: {fora}")
    nome = "sql_agenda_" + ("seco" if a.seco else f"catalogo_{a.schema}" if a.so_catalogo or a.schema == "public" else "staging")
    o = C.Saida(nome)
    try:
        if a.seco:
            seco(o, ids)
            return o.fim()
        B.usar_base("staging" if a.schema == "staging" else "prod")
        B.exigir_saude(o, "o sql_agenda.py da hml-21b")
        if a.so_catalogo or a.schema == "public":
            catalogo(o, a.schema)
        else:
            rodar(o, ids)
            if not a.casos and (not a.grupo or "catalogo" in a.grupo):
                catalogo(o, "staging")
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
