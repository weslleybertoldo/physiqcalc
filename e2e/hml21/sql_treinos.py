#!/usr/bin/env python3
"""Physiq hml-21d (H-43 parte 3 · jeito 2, etapa 3, 13/10/2026) — as 2 RPCs atômicas do Treino NO STAGING DO TREINO, como a pessoa: a migration
20261013100000_hml21d_treinos_atomicas (modelo_ordenar e treino_pronto_salvar). O molde do e2e/hml21/sql_agenda.py (e do e2e/wa/sql_wa.py):
cada caso é UM bloco que termina com erro de propósito (nada fica gravado — a massa nasce DENTRO do bloco e volta junto) e devolve o
resultado na mensagem. "Como o app" = o papel authenticated com o sub do TREINO de uma conta de TESTE (o physiq_identidades: w5p-personal,
w13-dono = OUTRO profissional, w5p-aluna = o aluno) e o app_metadata.role DELE (lido do auth.users do Treino — o mesmo que a troca de token
põe no JWT: o RLS do Treino lê o papel); "sem login" = as claims vazias.
Casos (staging do Treino): ordenar O1–O7 (o dono, outro profissional, sem login, a forma, o id que não é do modelo, o aluno, o modelo
global) · salvar S1–S4 (SÓ a recusa: o Master é a prova viva do Weslley — decisão 19; quem não é master não cria nem edita, sem login, a
forma) · catalogo K1–K2 (só leitura; vale no public).
Uso: python3 e2e/hml21/sql_treinos.py [--grupo ordenar,salvar,catalogo] [--casos O1,S2]   (staging; roda na ETAPA 2, depois da migration)
     python3 e2e/hml21/sql_treinos.py --so-catalogo --schema staging|public               (só leitura)
     python3 e2e/hml21/sql_treinos.py --seco                                               (monta os blocos; NADA vai ao banco)
Antes da migration os casos ficam ❌ (a função não existe). Antes de CADA execução que toca o staging: a PAUSA
(~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "sql_treinos.py …") e o /health (aqui dentro).
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
TREINO_REF = B.B19.TREINO_REF
FALHA_SQL = re.compile(r"RESULTADO<<(\{.*?\})>>", re.S)
FUNCOES = ("treino_pronto_salvar(uuid, jsonb, jsonb)", "modelo_ordenar(uuid, uuid[])")
CONTAS = {"v_personal": "w5p-personal", "v_outro": "w13-dono", "v_aluna": "w5p-aluna"}
RLS_PRONTOS = 'new row violates row-level security policy for table "physiq_treinos_prontos"'


# ───────────────────────── os blocos (o molde do sql_agenda.py) ─────────────────────────
def como(var: str) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub do Treino de `var` e o papel dele (o app_metadata.role)."""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {var}, 'role', 'authenticated', 'aud', 'authenticated', "
            f"'app_metadata', json_build_object('role', {var}_papel))::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


SEM_LOGIN = "  perform set_config('request.jwt.claims', '', true);\n  perform set_config('role', 'authenticated', true);\n"
VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"


def res(**kv: str) -> str:
    """v_res ganha as chaves (cada valor é uma expressão SQL)."""
    return "  v_res := v_res || jsonb_build_object(" + ", ".join(f"'{k}', {v}" for k, v in kv.items()) + ");\n"


def erro(chave: str, sql: str) -> str:
    """O comando num sub-bloco: a mensagem do erro (sqlerrm) ou 'passou' — o sub-bloco volta o que o comando fez (savepoint)."""
    return (f"  begin\n    {sql}\n    v_res := v_res || jsonb_build_object('{chave}', 'passou');\n"
            f"  exception when others then\n    v_res := v_res || jsonb_build_object('{chave}', sqlerrm);\n  end;\n")


def bloco_sql(corpo: str, uids: dict[str, str]) -> str:
    """O bloco: os ids do TREINO das contas de TESTE (o physiq_identidades, pelo id do principal de cada uma — lido antes, SQL só leitura) e o
    papel de cada uma (o app_metadata do auth.users do Treino); o modelo de TESTE do personal com 3 exercícios GLOBAIS (ordem 0, 1, 2) e um 4º
    global de fora do modelo; o modelo GLOBAL de teste com 2 — tudo com a marca, criado como postgres (fora do RLS) e desfeito no fim (o raise
    RESULTADO)."""
    for k in CONTAS:
        C.uuid_ok(uids.get(k))
    sel = "".join(f"  select i.treino_user_id into {k} from {S}.physiq_identidades i where i.principal_user_id = '{uids[k]}';\n"
                  f"  select u.raw_app_meta_data ->> 'role' into {k}_papel from auth.users u where u.id = {k};\n" for k in CONTAS)
    return f"""do $t$
declare
  v_personal uuid; v_outro uuid; v_aluna uuid; v_personal_papel text; v_outro_papel text; v_aluna_papel text;
  v_modelo uuid; v_global uuid; v_ex uuid[]; v_pronto uuid; v_n integer; v_id uuid; v_grupos integer;
  v_res jsonb := '{{}}'::jsonb;
begin
{sel}  select array_agg(x.id order by x.id) into v_ex from (select e.id from {S}.tb_exercicios e where e.professor_id is null order by e.id limit 4) x;
  select p.id into v_pronto from {S}.physiq_treinos_prontos p order by p.ordem, p.id limit 1;
  if v_personal is null or v_outro is null or v_aluna is null or coalesce(array_length(v_ex, 1), 0) < 4 then
    raise exception 'RESULTADO<<%>>', jsonb_build_object('erro', 'massa de TESTE incompleta', 'falta', jsonb_strip_nulls(jsonb_build_object(
      'personal', v_personal is null, 'outro', v_outro is null, 'aluna', v_aluna is null, 'globais', coalesce(array_length(v_ex, 1), 0) < 4)))::text;
  end if;
  -- o modelo de TESTE do personal (3 exercícios globais, ordem 0..2) e o modelo GLOBAL de teste (2)
  insert into {S}.tb_grupos_treino (nome, professor_id) values ('{MARCA} sql_treinos', v_personal) returning id into v_modelo;
  insert into {S}.tb_grupos_exercicios (grupo_id, exercicio_id, ordem) values (v_modelo, v_ex[1], 0), (v_modelo, v_ex[2], 1), (v_modelo, v_ex[3], 2);
  insert into {S}.tb_grupos_treino (nome, professor_id) values ('{MARCA} sql_treinos global', null) returning id into v_global;
  insert into {S}.tb_grupos_exercicios (grupo_id, exercicio_id, ordem) values (v_global, v_ex[1], 0), (v_global, v_ex[2], 1);
  select count(*) into v_grupos from {S}.physiq_treinos_prontos_grupos g where g.treino_id = v_pronto;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;"""


def ordem(var: str = "v_modelo") -> str:
    """A ordem do modelo (o exercício na posição) — para comparar: a lista dos índices de v_ex na ordem."""
    return (f"(select jsonb_agg(array_position(v_ex, ge.exercicio_id) order by ge.ordem) from {S}.tb_grupos_exercicios ge "
            f"where ge.grupo_id = {var})")


# o treino pronto como a tela do Master manda, DENTRO das regras da tabela (o objetivo, o nível, a letra, os dias e o nome da divisão do catálogo:
# hml21/medicao/treino21d_regras.txt) — a recusa que o caso prova é a do RLS/da forma, não a de uma regra da tabela
TREINO_OK = (f"jsonb_build_object('codigo', 'hml21-e2e-sql', 'nome', '{MARCA} sql_treinos', 'objetivo', 'ganhar_massa', 'nivel', 'iniciante', "
             "'dias_por_semana', 3, 'divisao', 'A', 'descricao', null, 'ordem', 999, 'ativo', false)")
DIVISOES_OK = ("jsonb_build_array(jsonb_build_object('letra', 'A', 'nome', 'Treino A', 'dias', jsonb_build_array('SEG'), 'exercicios', "
               "jsonb_build_array(jsonb_build_object('exercicio_id', v_ex[1], 'series', 3, 'reps', '10', 'descanso_segundos', 60, 'observacao', null))))")


def casos() -> dict[str, tuple[str, str, dict]]:
    """id → (grupo, corpo do bloco, o resultado esperado)."""
    k: dict[str, tuple[str, str, dict]] = {}
    # ───────────── ORDENAR (modelo_ordenar) ─────────────
    k["O1"] = ("ordenar",
               como("v_personal") + f"  v_n := {S}.modelo_ordenar(v_modelo, array[v_ex[3], v_ex[1], v_ex[2]]);\n" + VOLTA
               + res(n="v_n", ordem=ordem(), papel="v_personal_papel = 'professor'"),
               {"n": 3, "ordem": [3, 1, 2], "papel": True})
    k["O2"] = ("ordenar",
               como("v_outro") + erro("outro", f"perform {S}.modelo_ordenar(v_modelo, array[v_ex[3], v_ex[1], v_ex[2]]);") + VOLTA + res(ordem=ordem()),
               {"outro": "nao_encontrado", "ordem": [1, 2, 3]})
    k["O3"] = ("ordenar",
               SEM_LOGIN + erro("sem_login", f"perform {S}.modelo_ordenar(v_modelo, array[v_ex[3], v_ex[1], v_ex[2]]);") + VOLTA + res(ordem=ordem()),
               {"sem_login": "sem_login", "ordem": [1, 2, 3]})
    k["O4"] = ("ordenar",
               como("v_personal")
               + erro("vazia", f"perform {S}.modelo_ordenar(v_modelo, '{{}}'::uuid[]);")
               + erro("nula", f"perform {S}.modelo_ordenar(v_modelo, null);")
               + erro("repetido", f"perform {S}.modelo_ordenar(v_modelo, array[v_ex[1], v_ex[1], v_ex[2]]);")
               + erro("id_nulo", f"perform {S}.modelo_ordenar(v_modelo, array[v_ex[1], null]);")
               + erro("modelo_nulo", f"perform {S}.modelo_ordenar(null, array[v_ex[1]]);")
               + erro("duas_dimensoes", f"perform {S}.modelo_ordenar(v_modelo, array[array[v_ex[1]], array[v_ex[2]]]);")
               + erro("mil_e_um", f"perform {S}.modelo_ordenar(v_modelo, array(select gen_random_uuid() from generate_series(1, 1001)));")
               + VOLTA + res(ordem=ordem()),
               {"vazia": "dados_invalidos", "nula": "dados_invalidos", "repetido": "dados_invalidos", "id_nulo": "dados_invalidos",
                "modelo_nulo": "dados_invalidos", "duas_dimensoes": "dados_invalidos", "mil_e_um": "dados_invalidos", "ordem": [1, 2, 3]})
    k["O5"] = ("ordenar",
               # o 4º global NÃO é do modelo: a RPC recusa e NADA muda (hoje: os outros 2 mudavam e o 3º "dava certo" calado)
               como("v_personal") + erro("de_fora", f"perform {S}.modelo_ordenar(v_modelo, array[v_ex[2], v_ex[1], v_ex[4]]);") + VOLTA + res(ordem=ordem()),
               {"de_fora": "nao_encontrado", "ordem": [1, 2, 3]})
    k["O6"] = ("ordenar",
               como("v_aluna") + erro("aluno", f"perform {S}.modelo_ordenar(v_modelo, array[v_ex[3], v_ex[1], v_ex[2]]);") + VOLTA + res(ordem=ordem()),
               {"aluno": "nao_encontrado", "ordem": [1, 2, 3]})
    k["O7"] = ("ordenar",
               como("v_personal") + erro("global", f"perform {S}.modelo_ordenar(v_global, array[v_ex[2], v_ex[1]]);") + VOLTA + res(ordem=ordem("v_global")),
               {"global": "nao_encontrado", "ordem": [1, 2]})
    # ───────────── SALVAR (treino_pronto_salvar) — SÓ a recusa (o Master = a prova viva) ─────────────
    contar_prontos = f"(select count(*) from {S}.physiq_treinos_prontos where nome like '%{MARCA}%')"
    k["S1"] = ("salvar",
               como("v_personal") + erro("criar", f"v_id := {S}.treino_pronto_salvar(null, {TREINO_OK}, {DIVISOES_OK});") + VOLTA
               + res(criados=contar_prontos),
               {"criar": RLS_PRONTOS, "criados": 0})
    k["S2"] = ("salvar",
               como("v_personal") + erro("editar", f"v_id := {S}.treino_pronto_salvar(v_pronto, {TREINO_OK}, {DIVISOES_OK});") + VOLTA
               + res(grupos_iguais=f"(select count(*) from {S}.physiq_treinos_prontos_grupos g where g.treino_id = v_pronto) = v_grupos",
                     nome_igual=f"(select p.nome not like '%{MARCA}%' from {S}.physiq_treinos_prontos p where p.id = v_pronto)"),
               {"editar": "nao_encontrado", "grupos_iguais": True, "nome_igual": True})
    k["S3"] = ("salvar",
               SEM_LOGIN + erro("sem_login", f"v_id := {S}.treino_pronto_salvar(null, {TREINO_OK}, {DIVISOES_OK});") + VOLTA + res(criados=contar_prontos),
               {"sem_login": "sem_login", "criados": 0})
    k["S4"] = ("salvar",
               como("v_personal")
               + erro("sem_divisoes", f"v_id := {S}.treino_pronto_salvar(null, {TREINO_OK}, '[]'::jsonb);")
               + erro("treino_lista", f"v_id := {S}.treino_pronto_salvar(null, '[]'::jsonb, {DIVISOES_OK});")
               + erro("exercicio_nao_uuid", f"v_id := {S}.treino_pronto_salvar(null, {TREINO_OK}, jsonb_build_array(jsonb_build_object('letra', 'A', "
                                            "'nome', 'Treino A', 'dias', jsonb_build_array('SEG'), 'exercicios', jsonb_build_array(jsonb_build_object("
                                            "'exercicio_id', 'x', 'series', 3, 'reps', '10')))));")
               + VOLTA + res(criados=contar_prontos),
               {"sem_divisoes": "dados_invalidos", "treino_lista": "dados_invalidos", "exercicio_nao_uuid": "dados_invalidos", "criados": 0})
    return k


# ───────────────────────── a execução (a Management API do Treino; o bloco volta inteiro) ─────────────────────────
def _mgmt(q: str) -> list:
    st, r, _ = B.B5.http("POST", f"https://api.supabase.com/v1/projects/{TREINO_REF}/database/query", {"query": q},
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


def uids_principal() -> dict[str, str]:
    """Os ids do PRINCIPAL das contas de teste (SQL só leitura no auth.users do principal) — o bloco acha o id do Treino pelo physiq_identidades."""
    saida = {}
    for var, conta in CONTAS.items():
        u = B.uid_da_conta(conta)
        if not C.eh_uuid(u):
            raise SystemExit(f"a conta de teste {var} não existe no principal")
        saida[var] = u
    return saida


def catalogo(o, s: str) -> None:
    """K1–K2 (só leitura; vale no public): as 2 funções existem, INVOKER com search_path '' e o EXECUTE só do logado e do servidor."""
    fs = ", ".join(f"to_regprocedure({C.txt(f'{s}.{f}')})" for f in FUNCOES)
    linhas = B.B19.ler_treino(
        f"select p.oid::regprocedure::text as f, p.prosecdef as definer, p.provolatile::text as vol, coalesce(array_to_string(p.proconfig, ','), '') as cfg, "
        f"has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado, "
        f"has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor from pg_proc p where p.oid = any(array[{fs}]::oid[])")
    o.ok(len(linhas) == 2, f"[K1/{s}] as 2 funções da migration existem no Treino ({len(linhas)})")
    o.ok(len(linhas) == 2 and all(x["definer"] is False and x["vol"] == "v" and x["cfg"] in ('search_path=""', "search_path=") and x["anon"] is False
                                  and x["autenticado"] is True and x["servidor"] is True for x in linhas),
         f"[K2/{s}] INVOKER, VOLATILE, search_path '' e o EXECUTE só do logado e do servidor "
         f"({[(x['f'].split('(')[0].split('.')[-1], x['definer'], x['vol'], x['cfg']) for x in linhas]})")


def rodar(o, ids: list[str]) -> None:
    ks = casos()
    uids = uids_principal()
    for i in ids:
        grupo, corpo, esperado = ks[i]
        try:
            r = resultado(bloco_sql(corpo, uids))
        except RuntimeError as e:
            o.ok(False, f"[{i}] {grupo}: erro — {str(e).strip().splitlines()[0][:200]}")
            continue
        o.ok(r == esperado, f"[{i}] {grupo}: {json.dumps(r, ensure_ascii=False)[:500]}"
             + ("" if r == esperado else f"  ≠ esperado {json.dumps(esperado, ensure_ascii=False)[:400]}"))


def seco(o, ids: list[str]) -> None:
    ks = casos()
    uids = {k: f"{n:08d}-0000-4000-8000-000000000000" for n, k in enumerate(CONTAS, start=1)}
    for i in ids:
        q = bloco_sql(ks[i][1], uids)
        usa_como = "json_build_object('sub', v_" in ks[i][1]
        o.ok(q.count("$t$") == 2 and q.count("perform set_config('role', 'authenticated'") == q.count("perform set_config('role', 'postgres'")
             and "public." not in q and q.rstrip().endswith("end $t$;") and "raise exception 'RESULTADO<<%>>', v_res::text;" in q
             and (not usa_como or "'app_metadata', json_build_object('role', v_" in q),
             f"[{i}] bloco bem formado ({len(q)} caracteres; cada 'como o app' com o seu VOLTA e o papel do token; só staging; termina no RESULTADO — "
             "nada fica gravado)")
    recusado = False
    try:
        bloco_sql("", {**uids, "v_outro": "x"})
    except Exception:  # noqa: BLE001 — o uuid_ok levanta o Parou
        recusado = True
    o.ok({k[0] for k in ks.values()} == {"ordenar", "salvar"} and len([i for i in ks if i.startswith("O")]) == 7 and len([i for i in ks if i.startswith("S")]) == 4
         and recusado and "app_metadata" in como("v_personal"),
         "os casos: ordenar O1–O7 (o dono, outro profissional, sem login, a forma, o id de fora do modelo, o aluno, o modelo global) e salvar S1–S4 "
         "(só a recusa: o personal não cria nem edita — o Master é a prova viva; sem login; a forma); um id de conta fora do formato → recusado")
    o.ok(FALHA_SQL.search('erro: RESULTADO<<{"a": 1}>> fim').group(1) == '{"a": 1}', "o RESULTADO sai da mensagem do erro (o molde do sql_wa.py)")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-21d — as 2 RPCs atômicas do Treino no staging, como a pessoa (blocos desfeitos)")
    ap.add_argument("--grupo", default="")
    ap.add_argument("--casos", default="")
    ap.add_argument("--so-catalogo", action="store_true")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    B.usar_area("treinos")
    ks = casos()
    ids = [x.strip() for x in a.casos.split(",") if x.strip()] or [i for i, (g, _, _) in ks.items() if not a.grupo or g in a.grupo.split(",")]
    fora = [i for i in ids if i not in ks]
    if fora:
        raise SystemExit(f"casos desconhecidos: {fora}")
    nome = "sql_treinos_" + ("seco" if a.seco else f"catalogo_{a.schema}" if a.so_catalogo or a.schema == "public" else "staging")
    o = C.Saida(nome)
    try:
        if a.seco:
            seco(o, ids)
            return o.fim()
        B.usar_base("staging" if a.schema == "staging" else "prod")
        B.exigir_saude(o, "o sql_treinos.py da hml-21d")
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
