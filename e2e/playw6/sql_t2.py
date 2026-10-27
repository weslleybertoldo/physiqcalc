#!/usr/bin/env python3
"""Physiq play-W6 · T2 (26/10/2026) — as 2 migrations do T2 no banco principal. O molde do e2e/playw6/sql_playw6.py (cada caso com escrita
é um bloco que termina com erro de propósito: nada fica gravado; o resultado vem na mensagem — RESULTADO<<json>>).
  A  20261027010000_playw6_troca_para.sql   a troca agendada (DEFERRED) até o app: a coluna play_assinaturas.troca_para, a play_aplicar
                                            que grava o p->>'troca_para' (null/vazio LIMPA) e as leituras do aluno (meu_plano_app,
                                            financeiro_do_aluno) com o 'troca_para' dentro de 'play'.
  B  20261027020000_precos_app_20_35.sql    os preços do plano do app (pedido do Weslley, 26/10/2026): Treino R$ 20,00 · Treino + Alimentação
                                            R$ 35,00 — os 2 planos da conta do app + as matrículas ATIVAS da conta do app no preço velho do
                                            plano delas (o gatilho planos_aluno_propagar_valor pula a conta do app — B2).

Modos (os de foto e de catálogo são SÓ LEITURA e valem no staging e no public; o arquivo da foto fica FORA do repo):
  --catalogo-foto <arq> [--schema S]       o retrato do que a A toca: a tabela (colunas, constraints, RLS, policies, grants da tabela e das
                                           colunas) e as 3 funções (md5 do corpo, definer, search_path, grants).
  --catalogo-comparar <arq> [--schema S] [--como igual|depois_da_a|depois_da_reversa]
                                           igual (o padrão): tudo igual à foto (aplicar a A de novo não muda nada); depois_da_a: os grants, o
                                           RLS, as policies e o definer/search_path IGUAIS, os 3 corpos trocados, a coluna e a constraint novas
                                           (e só isso); depois_da_reversa: os 3 corpos de volta aos da foto (a coluna e a constraint ficam).
  --so-catalogo [--schema S]               o catálogo da A: a coluna text nula + a constraint; as 3 funções com o troca_para; a play_aplicar
                                           definer + search_path vazio + só o service_role; a tabela sem acesso do app/visitante, nem na coluna.
  --precos-foto <arq> [--schema S]         os planos da conta do app, as matrículas da conta do app (ativa, plano, valor), o resumo das OUTRAS
                                           contas (planos e matrículas) e a cobertura de todas as matrículas.
  --precos-comparar <arq> [--schema S] [--como b|igual]
                                           b (o padrão): os 2 planos do app no preço novo, as ativas no preço velho → o novo (e SÓ elas), o
                                           resto da conta do app igual, as outras contas iguais, a cobertura de todas igual; igual: nada mudou.
  (sem modo) [--casos 22,23]               os casos — SÓ no ensaio local (PHYSIQ_SQL_LOCAL; a massa sintética do
                                           ~/projetos/physiqcalc-scratch/hml/playw6/ferramentas/massa_playw6.sql):
   22 grava      a play_aplicar grava o troca_para (na compra nova e no update); sem ele (o Google virou) e o vazio LIMPAM; > 100
                 caracteres → invalido (nada muda)
   23 leituras   meu_plano_app e financeiro_do_aluno: 'play' com o troca_para (o valor; sem troca = null), sem token nem pedido
Uso: python3 e2e/playw6/sql_t2.py [--casos …] (local) · --so-catalogo | --catalogo-foto/--catalogo-comparar | --precos-foto/--precos-comparar
Saída sem dado pessoal: só o começo dos ids (das linhas que mudam), contagens, códigos e booleanos.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "wa"))
import _base as B  # noqa: E402

P = B.C.C2.Placar()
FUNCOES_A = ("play_aplicar", "meu_plano_app", "financeiro_do_aluno")
# os preços (26/10/2026): o velho → o novo de cada plano do app
PRECOS = {"app_treino": ("29.90", "20.00"), "app_treino_alimentacao": ("49.90", "35.00")}
SUFIXO = {"A1": "11", "A5": "15", "A7": "17"}


def sql(texto: str, s: str) -> str:
    pre = "c1000000" if s == "staging" else "c2000000"
    for nome, suf in SUFIXO.items():
        texto = texto.replace(f"@{nome}@", f"{pre}-0000-4000-8000-0000000000{suf}")
    return texto.replace("@S@", s)


def epoca(campo: str) -> str:
    return f"case when {campo} is null then null else extract(epoch from {campo})::numeric(20,6)::text end"


# ───────────────────────── o catálogo da A (só leitura) ─────────────────────────
def retrato(s: str) -> dict:
    r = B.ler(f"""
select
  (select c.relacl::text from pg_class c where c.oid = to_regclass('{s}.play_assinaturas')) as tab_acl,
  (select c.relrowsecurity from pg_class c where c.oid = to_regclass('{s}.play_assinaturas')) as rls,
  (select count(*) from pg_policy pl where pl.polrelid = to_regclass('{s}.play_assinaturas')) as policies,
  (select jsonb_object_agg(a.attname, jsonb_build_array(format_type(a.atttypid, a.atttypmod), a.attnotnull, a.attacl::text,
                                                         pg_get_expr(d.adbin, d.adrelid)))
     from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = to_regclass('{s}.play_assinaturas') and a.attnum > 0 and not a.attisdropped) as colunas,
  (select jsonb_object_agg(c.conname, pg_get_constraintdef(c.oid)) from pg_constraint c where c.conrelid = to_regclass('{s}.play_assinaturas')) as constraints,
  (select jsonb_object_agg(p.proname, jsonb_build_array(md5(pg_get_functiondef(p.oid)), p.prosecdef, coalesce(p.proconfig, '{{}}')::text, p.proacl::text))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = '{s}' and p.proname in ({', '.join(repr(f) for f in FUNCOES_A)})) as funcoes
""")[0]
    return {"schema": s, **r}


def comparar_catalogo(arquivo: Path, s: str, como: str) -> None:
    antes = json.loads(arquivo.read_text(encoding="utf-8"))
    if antes.get("schema") != s:
        raise SystemExit(f"a foto é do schema {antes.get('schema')}, não do {s}")
    agora = retrato(s)
    P.check(antes["tab_acl"] == agora["tab_acl"] and antes["rls"] == agora["rls"] and antes["policies"] == agora["policies"],
            f"[{s}] play_assinaturas: os grants da tabela, o RLS e as policies IGUAIS à foto")
    fa, fd = antes["funcoes"] or {}, agora["funcoes"] or {}
    P.check(sorted(fa) == sorted(fd) == sorted(FUNCOES_A), f"[{s}] as 3 funções lá ({sorted(fd)})")
    attrs = [f for f in FUNCOES_A if f in fa and f in fd and fa[f][1:] != fd[f][1:]]
    P.check(not attrs, f"[{s}] o definer, o search_path e os grants das 3 funções IGUAIS à foto (diferentes: {attrs or 'nenhuma'})")
    corpos = sorted(f for f in FUNCOES_A if f in fa and f in fd and fa[f][0] != fd[f][0])
    ca, cd = antes["colunas"] or {}, agora["colunas"] or {}
    ka, kd = antes["constraints"] or {}, agora["constraints"] or {}
    if como == "depois_da_a":
        P.check(corpos == sorted(FUNCOES_A), f"[{s}] os 3 corpos trocados pela A ({corpos})")
        P.check(set(cd) - set(ca) == {"troca_para"} and all(ca[c] == cd[c] for c in ca),
                f"[{s}] a coluna nova troca_para e SÓ ela (as {len(ca)} de antes iguais: tipo, nula, grants da coluna, default)")
        P.check(set(kd) - set(ka) == {"play_assinaturas_troca_para_check"} and all(ka[c] == kd[c] for c in ka),
                f"[{s}] a constraint nova play_assinaturas_troca_para_check e SÓ ela (as {len(ka)} de antes iguais)")
    elif como == "depois_da_reversa":
        P.check(not corpos, f"[{s}] os 3 corpos de volta aos da foto, letra por letra (diferentes: {corpos or 'nenhum'})")
        P.check(set(cd) - set(ca) <= {"troca_para"} and all(ca[c] == cd[c] for c in ca), f"[{s}] as colunas de antes iguais (a troca_para FICA)")
    else:
        P.check(not corpos and ca == cd and ka == kd,
                f"[{s}] TUDO igual à foto: os 3 corpos, as {len(cd)} colunas e as {len(kd)} constraints (diferentes: {corpos or 'nenhum'})")


def catalogo_a(s: str) -> None:
    r = B.ler(f"""
select
  (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = to_regclass('{s}.play_assinaturas')
      and a.attname = 'troca_para' and not a.attisdropped) as tipo,
  (select not a.attnotnull from pg_attribute a where a.attrelid = to_regclass('{s}.play_assinaturas') and a.attname = 'troca_para'
      and not a.attisdropped) as nula,
  (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid = to_regclass('{s}.play_assinaturas')
      and c.conname = 'play_assinaturas_troca_para_check') as cheque,
  (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = '{s}'
      and pr.proname in ({', '.join(repr(f) for f in FUNCOES_A)}) and pr.prosrc like '%troca_para%') as leem,
  (select pr.prosecdef and coalesce(pr.proconfig, '{{}}') @> array['search_path=""'] from pg_proc pr
    where pr.oid = to_regprocedure('{s}.play_aplicar(jsonb)')) as definer,
  has_function_privilege('anon', to_regprocedure('{s}.play_aplicar(jsonb)'), 'execute') as anon_fn,
  has_function_privilege('authenticated', to_regprocedure('{s}.play_aplicar(jsonb)'), 'execute') as auth_fn,
  has_function_privilege('service_role', to_regprocedure('{s}.play_aplicar(jsonb)'), 'execute') as srv_fn,
  (select c.relrowsecurity from pg_class c where c.oid = to_regclass('{s}.play_assinaturas')) as rls,
  (select count(*) from pg_policy pl where pl.polrelid = to_regclass('{s}.play_assinaturas')) as policies,
  has_column_privilege('anon', to_regclass('{s}.play_assinaturas'), 'troca_para', 'select, insert, update') as anon_col,
  has_column_privilege('authenticated', to_regclass('{s}.play_assinaturas'), 'troca_para', 'select, insert, update') as auth_col,
  has_column_privilege('service_role', to_regclass('{s}.play_assinaturas'), 'troca_para', 'select, update') as srv_col,
  has_function_privilege('anon', to_regprocedure('{s}.financeiro_do_aluno()'), 'execute') as anon_fin,
  has_function_privilege('authenticated', to_regprocedure('{s}.financeiro_do_aluno()'), 'execute') as auth_fin
""")[0]
    P.check(r["tipo"] == "text" and r["nula"] is True, f"[{s}] A: a coluna play_assinaturas.troca_para (text, nula) — tipo {r['tipo']}")
    P.check(isinstance(r["cheque"], str) and "char_length(troca_para)" in r["cheque"], f"[{s}] A: a constraint do tamanho do troca_para")
    P.check(r["leem"] == 3, f"[{s}] A: a play_aplicar, o meu_plano_app e o financeiro_do_aluno com o troca_para ({r['leem']}/3)")
    P.check(r["definer"] is True and r["anon_fn"] is False and r["auth_fn"] is False and r["srv_fn"] is True,
            f"[{s}] A: a play_aplicar SECURITY DEFINER + search_path vazio, só o service_role executa")
    P.check(r["rls"] is True and r["policies"] == 0, f"[{s}] A: play_assinaturas com RLS e SEM policy")
    P.check(r["anon_col"] is False and r["auth_col"] is False and r["srv_col"] is True,
            f"[{s}] A: o visitante e o app sem acesso à coluna nova; o service_role lê e grava")
    P.check(r["anon_fin"] is False and r["auth_fin"] is True, f"[{s}] A: financeiro_do_aluno: o app executa, o visitante não (como antes)")


# ───────────────────────── os preços (só leitura) ─────────────────────────
def precos_foto(s: str) -> dict:
    r = B.ler(f"""
with app as (select id from {s}.contas where origem = 'app' order by criado_em limit 1)
select
  (select coalesce(jsonb_object_agg(pa.id::text, jsonb_build_array(pa.codigo, pa.valor::numeric(12,2)::text, pa.ativo)), '{{}}'::jsonb)
     from {s}.planos_aluno pa where pa.conta_id = (select id from app)) as planos_app,
  (select coalesce(jsonb_object_agg(p.id::text, jsonb_build_array(p.ativo and p.deleted_at is null, pa.codigo,
                                                                   p.mensalidade_valor::numeric(12,2)::text)), '{{}}'::jsonb)
     from {s}.pacientes p left join {s}.planos_aluno pa on pa.id = p.plano_aluno_id where p.conta_id = (select id from app)) as matriculas_app,
  (select count(*) || ':' || coalesce(md5(string_agg(pa.id::text || '|' || pa.valor::text || '|' || coalesce(pa.meses::text, '') || '|'
            || coalesce(pa.valor_parcela_mensal::text, '') || '|' || pa.ativo::text, ',' order by pa.id)), '')
     from {s}.planos_aluno pa where pa.conta_id is distinct from (select id from app)) as outros_planos,
  (select count(*) || ':' || coalesce(md5(string_agg(p.id::text || '|' || coalesce(p.mensalidade_valor::text, '') || '|'
            || coalesce(p.plano_valor_negociado::text, ''), ',' order by p.id)), '')
     from {s}.pacientes p where p.conta_id is distinct from (select id from app)) as outras_matriculas,
  (select count(*) || ':' || coalesce(md5(string_agg(a.id::text || '|' || coalesce(a.valor::text, '') || '|' || a.status, ',' order by a.id)), '')
     from {s}.aluno_assinaturas a) as automaticas,
  (select coalesce(jsonb_object_agg(p.id::text, {epoca('p.mensalidade_pago_ate')}), '{{}}'::jsonb) from {s}.pacientes p) as cobertura
""")[0]
    return {"schema": s, **r}


def esperado_depois_da_b(antes: dict) -> tuple[dict, dict, list, list]:
    planos = {}
    mudam_planos = []
    for i, (cod, valor, ativo) in antes["planos_app"].items():
        novo = PRECOS[cod][1] if cod in PRECOS and valor == PRECOS[cod][0] else valor
        planos[i] = [cod, novo, ativo]
        if novo != valor:
            mudam_planos.append(i)
    mats = {}
    mudam = []
    for i, (ativa, cod, valor) in antes["matriculas_app"].items():
        novo = PRECOS[cod][1] if ativa and cod in PRECOS and valor == PRECOS[cod][0] else valor
        mats[i] = [ativa, cod, novo]
        if novo != valor:
            mudam.append(i)
    return planos, mats, mudam_planos, mudam


def precos_comparar(arquivo: Path, s: str, como: str) -> None:
    antes = json.loads(arquivo.read_text(encoding="utf-8"))
    if antes.get("schema") != s:
        raise SystemExit(f"a foto é do schema {antes.get('schema')}, não do {s}")
    agora = precos_foto(s)
    if como == "igual":
        planos, mats, mp, mm = antes["planos_app"], antes["matriculas_app"], [], []
    else:
        planos, mats, mp, mm = esperado_depois_da_b(antes)
    P.check(agora["planos_app"] == planos,
            f"[{s}] os {len(planos)} planos da conta do app: {len(mp)} no preço novo ({', '.join(i[:8] for i in sorted(mp)) or 'nenhum'})"
            + (" — " + ", ".join(f"{v[0]} {v[1]}" for v in sorted(agora['planos_app'].values())) if agora["planos_app"] else ""))
    dif = sorted(i for i in set(mats) | set(agora["matriculas_app"]) if mats.get(i) != agora["matriculas_app"].get(i))
    P.check(not dif, f"[{s}] as {len(mats)} matrículas da conta do app: {len(mm)} ativas do preço velho → o novo "
                     f"({', '.join(i[:8] for i in sorted(mm)) or 'nenhuma'}); o resto igual (fora do esperado: {len(dif)})")
    ficam = [i for i, (ativa, cod, valor) in antes["matriculas_app"].items() if i not in mm]
    print(f"   [{s}] ficam como estavam {len(ficam)} matrícula(s) da conta do app: "
          + ", ".join(f"{i[:8]} ({'ativa' if a else 'inativa'}, {c}, {v})" for i, (a, c, v) in sorted(antes["matriculas_app"].items()) if i in ficam),
          flush=True)
    for k, nome in (("outros_planos", "os planos das OUTRAS contas"), ("outras_matriculas", "as matrículas das OUTRAS contas"),
                    ("automaticas", "as automáticas do MP (aluno_assinaturas)")):
        P.check(agora[k] == antes[k], f"[{s}] {nome} IGUAIS ({agora[k].split(':')[0]} linhas)")
    d = sum(1 for k in set(antes["cobertura"]) | set(agora["cobertura"]) if antes["cobertura"].get(k) != agora["cobertura"].get(k))
    P.check(d == 0, f"[{s}] a cobertura (mensalidade_pago_ate) das {len(agora['cobertura'])} matrículas IGUAL ({d} diferente(s))")


# ───────────────────────── os casos (blocos desfeitos; só no ensaio local) ─────────────────────────
APLICAR = "@S@.play_aplicar(jsonb_strip_nulls(jsonb_build_object({})))"


def ap(*pares: str) -> str:
    return APLICAR.format(", ".join(pares))


def caso(numero: int, corpo: str, s: str) -> dict:
    return B.resultado(sql(f"do $c{numero}$\n{corpo}\nend $c{numero}$;", s))


def casos(s: str, quais: set[int]) -> None:
    if 22 in quais:
        base = ("'paciente_id', a7", "'token', 't2-e2e-c22'", "'produto', 'app_treino_alimentacao'", "'estado', 'ativa'",
                "'expira_em', e1", "'renova', false")
        r = caso(22, f"""
declare
  a7 uuid := '@A7@';
  e1 timestamptz := now() + interval '20 days';
  o1 jsonb; o2 jsonb; o3 jsonb; o4 jsonb; o5 jsonb;
  t1 text; t2 text; t3 text; t4 text; t5 text;
begin
  -- a compra nova já com a troca marcada (o token novo do DEFERRED: o vigente = o completo, o troca_para = o Treino)
  o1 := {ap(*base, "'troca_para', 'app_treino'")};
  select troca_para into t1 from @S@.play_assinaturas where token = 't2-e2e-c22';
  -- a mesma SEM a troca (o Google não traz mais o deferredItemReplacement: desfeita, ou já virou) → LIMPA
  o2 := {ap(*base)};
  select troca_para into t2 from @S@.play_assinaturas where token = 't2-e2e-c22';
  -- marca de novo (o update) e o vazio também limpa
  o3 := {ap(*base, "'troca_para', 'app_treino'")};
  select troca_para into t3 from @S@.play_assinaturas where token = 't2-e2e-c22';
  o4 := {ap(*base, "'troca_para', ''")};
  select troca_para into t4 from @S@.play_assinaturas where token = 't2-e2e-c22';
  -- maior que 100 → invalido e nada muda (a troca de antes fica)
  perform {ap(*base, "'troca_para', 'app_treino'")};
  o5 := {ap(*base, "'troca_para', repeat('x', 101)")};
  select troca_para into t5 from @S@.play_assinaturas where token = 't2-e2e-c22';
  raise exception 'RESULTADO<<%>>', jsonb_build_object('ok1', o1 -> 'ok', 'nova1', o1 -> 'nova', 't1', t1, 'ok2', o2 -> 'ok', 't2', t2,
    'ok3', o3 -> 'ok', 'nova3', o3 -> 'nova', 't3', t3, 'ok4', o4 -> 'ok', 't4', t4, 'ok5', o5 -> 'ok', 'erro5', o5 ->> 'erro', 't5', t5)::text;""", s)
        P.check(r["ok1"] is True and r["nova1"] is True and r["t1"] == "app_treino", f"[{s}] 22 a compra nova grava o troca_para")
        P.check(r["ok2"] is True and r["t2"] is None, f"[{s}] 22 sem o troca_para (o Google não traz mais a troca) LIMPA")
        P.check(r["ok3"] is True and r["nova3"] is False and r["t3"] == "app_treino", f"[{s}] 22 o update grava o troca_para de novo")
        P.check(r["ok4"] is True and r["t4"] is None, f"[{s}] 22 o vazio também limpa")
        P.check(r["ok5"] is False and r["erro5"] == "invalido" and r["t5"] == "app_treino",
                f"[{s}] 22 maior que 100 caracteres → invalido, e nada muda")

    if 23 in quais:
        r = caso(23, f"""
declare
  f jsonb; m jsonb; f2 jsonb; m2 jsonb;
begin
  perform {ap("'paciente_id', '@A5@'::uuid", "'token', 't2-e2e-c23-segredo'", "'produto', 'app_treino_alimentacao'", "'estado', 'ativa'",
              "'expira_em', now() + interval '30 days'", "'renova', false", "'pedido', 'GPA.T2-E2E-23'", "'valor', 35",
              "'troca_para', 'app_treino'")};
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000015', 'role', 'authenticated')::text, true);
  f := @S@.financeiro_do_aluno();
  m := @S@.meu_plano_app();
  perform {ap("'paciente_id', '@A1@'::uuid", "'token', 't2-e2e-c23-sem-troca'", "'produto', 'app_treino'", "'estado', 'ativa'",
              "'expira_em', now() + interval '30 days'", "'renova', true")};
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000011', 'role', 'authenticated')::text, true);
  f2 := @S@.financeiro_do_aluno();
  m2 := @S@.meu_plano_app();
  raise exception 'RESULTADO<<%>>', jsonb_build_object(
    'fin', (select e -> 'play' from jsonb_array_elements(f) e where (e ->> 'app')::boolean limit 1),
    'plano', m -> 'matricula' -> 'play',
    'fin2', (select e -> 'play' from jsonb_array_elements(f2) e where (e ->> 'app')::boolean limit 1),
    'plano2', m2 -> 'matricula' -> 'play',
    'vaza', position('t2-e2e-c23' in (f::text || m::text || f2::text || m2::text)) > 0
            or position('GPA.T2-E2E-23' in (f::text || m::text)) > 0)::text;""", s)
        chaves = ["estado", "expira_em", "produto", "renova", "troca_para"]
        for nome, rot in (("fin", "financeiro_do_aluno"), ("plano", "meu_plano_app")):
            x = r.get(nome) or {}
            P.check(isinstance(x, dict) and sorted(x) == chaves and x.get("produto") == "app_treino_alimentacao" and x.get("troca_para") == "app_treino",
                    f"[{s}] 23 {rot}: play = {{estado, renova, expira_em, produto, troca_para}} com a troca marcada")
        for nome, rot in (("fin2", "financeiro_do_aluno"), ("plano2", "meu_plano_app")):
            x = r.get(nome) or {}
            P.check(isinstance(x, dict) and sorted(x) == chaves and x.get("troca_para") is None, f"[{s}] 23 {rot} sem troca: troca_para = null")
        P.check(r["vaza"] is False, f"[{s}] 23 o token e o pedido NÃO saem nas leituras do aluno")


def main() -> int:
    a_ = argparse.ArgumentParser()
    a_.add_argument("--schema", default="staging", choices=("staging", "public"))
    a_.add_argument("--catalogo-foto")
    a_.add_argument("--catalogo-comparar")
    a_.add_argument("--so-catalogo", action="store_true")
    a_.add_argument("--precos-foto")
    a_.add_argument("--precos-comparar")
    a_.add_argument("--como", default="")
    a_.add_argument("--casos", default="")
    a = a_.parse_args()
    s = a.schema
    if a.catalogo_foto:
        f = retrato(s)
        Path(a.catalogo_foto).write_text(json.dumps(f), encoding="utf-8")
        print(f"[{s}] retrato do catálogo: {len(f['colunas'] or {})} colunas, {len(f['constraints'] or {})} constraints, "
              f"{len(f['funcoes'] or {})} funções", flush=True)
        return 0 if f["colunas"] and len(f["funcoes"] or {}) == 3 else 1
    if a.catalogo_comparar:
        comparar_catalogo(Path(a.catalogo_comparar), s, a.como or "igual")
        return P.fim()
    if a.so_catalogo:
        catalogo_a(s)
        return P.fim()
    if a.precos_foto:
        f = precos_foto(s)
        Path(a.precos_foto).write_text(json.dumps(f), encoding="utf-8")
        ativas_velhas = sum(1 for (ativa, cod, valor) in f["matriculas_app"].values() if ativa and cod in PRECOS and valor == PRECOS[cod][0])
        print(f"[{s}] preços: {len(f['planos_app'])} planos do app ("
              + ", ".join(f"{c} {v}" for c, v, _ in sorted(f["planos_app"].values())) + f"); {len(f['matriculas_app'])} matrículas da conta"
              f" do app, {ativas_velhas} ativa(s) no preço velho; {len(f['cobertura'])} matrículas no total", flush=True)
        return 0 if f["planos_app"] else 1
    if a.precos_comparar:
        precos_comparar(Path(a.precos_comparar), s, a.como or "b")
        return P.fim()
    if not B.LOCAL:
        raise SystemExit("os casos usam a massa sintética do PG local: rode com PHYSIQ_SQL_LOCAL (ferramentas/local_t2.py)")
    quais = {int(x) for x in a.casos.split(",") if x.strip()} or {22, 23}
    casos(s, quais)
    catalogo_a(s)
    return P.fim()


if __name__ == "__main__":
    raise SystemExit(main())
