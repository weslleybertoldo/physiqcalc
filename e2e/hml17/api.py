#!/usr/bin/env python3
"""Physiq hml-17 (H-38) — E2E de API das RPCs de leitura do plano alimentar (migração 20261010100000_hml17_planos_do_aluno.sql).
SÓ LEITURA nos 2 modos: nada é criado, mudado ou apagado (só login das contas de TESTE e chamadas de leitura; logout local no fim).

--schema staging (as contas w5p-*: a nutri, o personal + dono e a aluna dos 2, com 1 plano de 22 itens; w13-dono = outra conta):
  F0  as 4 funções no schema: as 3 da API SECURITY DEFINER, search_path fixo, EXECUTE só do logado e do servidor; a interna sem
      EXECUTE para anon e authenticated
  P1  nutri e personal: planos_do_aluno(<aluna>) → 1 plano, 22 itens, 0 sem alimento
  P2  a aluna: minha_dieta → o mesmo plano
  P3  os 3 com o MESMO conjunto (alimento_id, kcal do alimento, gramas) e o mesmo total (o porte do gramasDoItem/macrosPorGramas;
      a spec mediu 1.894 kcal)
  P4  plano_alimentar(<id>) = o plano da lista (nutri e personal)
  P5  o JSON da RPC = o REST de hoje (o select do planos.ts), chave a chave e valor a valor, com a nutri (para quem o REST já vem
      completo) — o risco §8.1 (formato diferente quebraria o editor calado)
  P6  planos_favoritos(): só planos de alunos que a pessoa vê (os mesmos ids que o RLS de hoje dá a ela), cada um com o paciente
      {id, nome, conta_id}; o ★ da aluna está na lista da nutri e na do personal
  N1  profissional de OUTRA conta (w13-dono): planos_do_aluno → [], plano_alimentar → null, o ★ da aluna fora dos favoritos
  N2  a aluna chamando planos_do_aluno(<a própria matrícula>) → [] e plano_alimentar → null (o app dela lê pela minha_dieta)
  N3  sem login (só a chave pública): as 3 → 401
  N4  a interna plano_alimentar_json pelo PostgREST (com e sem login) → recusada (401/403/404: sem EXECUTE)
  N5  o RLS de alimentos NÃO abriu: o personal lendo o alimento próprio da nutri direto → []; a lista de alimentos do personal com
      os mesmos 597 (TACO + os dele) de antes; o REST de hoje do personal ainda vem sem esses alimentos (a correção é só na RPC)
--schema public (PRODUÇÃO, SÓ LEITURA — para a sessão principal no F7, depois da migração --so public):
  F0  as 4 funções no public (como acima)
  R1  nutri-legado (nutri.teste.claude): planos_do_aluno(<uuid que não existe>) → []; plano_alimentar(<idem>) → null;
      planos_favoritos() → 200 (lista)
  R2  sem login → 401
  R3  SQL só leitura: os planos vivos pela montadora (planos, itens) e 0 item com alimento_id sem o alimento (a regra da RPC)
Saída: ~/projetos/physiqcalc-scratch/hml/hml17/agente/api_<schema>.txt (só contagens, status e as kcal das contas de TESTE).
Uso: python3 e2e/hml17/api.py --schema staging|public
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C = B.C
NADA = "00000000-0000-4000-8000-0000000000aa"
FUNCOES = ("planos_do_aluno(uuid)", "plano_alimentar(uuid)", "planos_favoritos()")
ALIMENTO = "alimento:alimentos(id,nome,fonte,grupo,energia_kcal,proteina_g,carboidrato_g,lipidio_g,fibra_g,sodio_mg,medidas_caseiras(*))"
SELECT_PLANO = f"*,refeicoes(*,itens:itens_refeicao(*,{ALIMENTO},receita:receitas(id,nome)))"
TACO_ESPERADOS = 597


def conferir_funcoes(o) -> bool:
    s = B.schema()
    linhas = B.ler(f"""
      select p.proname::text as nome, p.prosecdef as definer, p.proconfig is not null as caminho,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = {B.txt(s)} and p.proname in ('planos_do_aluno', 'plano_alimentar', 'planos_favoritos', 'plano_alimentar_json')""")
    por = {x["nome"]: x for x in linhas}
    tudo = o.ok(len(por) == 4, f"F0 as 4 funções da hml-17 existem no {s} ({sorted(por)})")
    for f in ("planos_do_aluno", "plano_alimentar", "planos_favoritos"):
        x = por.get(f) or {}
        tudo &= o.ok(x.get("definer") and x.get("caminho") and not x.get("anon") and x.get("logado") and x.get("servidor"),
                     f"F0 {f}: SECURITY DEFINER, search_path fixo, EXECUTE só do logado e do servidor")
    x = por.get("plano_alimentar_json") or {}
    tudo &= o.ok(x and not x.get("definer") and x.get("caminho") and not x.get("anon") and not x.get("logado"),
                 "F0 plano_alimentar_json (interna): SECURITY INVOKER, search_path fixo, sem EXECUTE para anon e authenticated")
    return bool(tudo)


def lista(st: int, r: object) -> list | None:
    return r if st == 200 and isinstance(r, list) else None


def ordenar(v: object) -> object:
    """Para comparar o JSON da RPC com o REST: as listas de objetos com id pela ordem do id (a tela ordena depois)."""
    if isinstance(v, dict):
        return {k: ordenar(x) for k, x in v.items()}
    if isinstance(v, list):
        itens = [ordenar(x) for x in v]
        if all(isinstance(x, dict) and "id" in x for x in itens):
            return sorted(itens, key=lambda x: str(x["id"]))
        return itens
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return v


def diferencas(a: object, b: object, caminho: str = "") -> list[str]:
    """Os caminhos (sem valores: podem ter dado) em que a e b diferem."""
    if isinstance(a, dict) and isinstance(b, dict):
        saida = [f"{caminho}.{k} (só num dos 2)" for k in sorted(set(a) ^ set(b))]
        for k in sorted(set(a) & set(b)):
            saida += diferencas(a[k], b[k], f"{caminho}.{k}")
        return saida
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{caminho} ({len(a)} × {len(b)} itens)"]
        saida = []
        for i, (x, y) in enumerate(zip(a, b)):
            saida += diferencas(x, y, f"{caminho}[{i}]")
        return saida
    return [] if a == b else [caminho or "(raiz)"]


def staging(o, L: B.Logins) -> None:
    aluna = B.matricula_da_aluna()
    planos: dict[str, list] = {}

    # P1 — nutri e personal pela RPC
    for conta in ("w5p-nutri", "w5p-personal"):
        st, r = B.rpc(L.token(conta), "planos_do_aluno", {"p_aluno": aluna})
        lst = lista(st, r)
        planos[conta] = lst or []
        itens = B.itens_do_plano(lst[0]) if lst else []
        o.ok(lst is not None and len(lst) == 1 and len(itens) == 22 and all(i.get("alimento") for i in itens),
             f"P1 {conta}: planos_do_aluno(<aluna>) → {st}, {len(lst or [])} plano, {len(itens)} itens, "
             f"{sum(1 for i in itens if not i.get('alimento'))} sem alimento (esperado 1 · 22 · 0)")
    # P2 — a aluna pela minha_dieta
    st, r = B.rpc(L.token("w5p-aluna"), "minha_dieta", {})
    dieta = (r or {}).get("planos") if st == 200 and isinstance(r, dict) else None
    plano_nutri = (planos.get("w5p-nutri") or [{}])[0]
    da_aluna = next((x for x in (dieta or []) if x.get("id") == plano_nutri.get("id")), None)
    o.ok(da_aluna is not None and len(B.itens_do_plano(da_aluna)) == 22,
         f"P2 w5p-aluna: minha_dieta → {st}, o mesmo plano ({len(B.itens_do_plano(da_aluna or {}))} itens)")
    # P3 — o mesmo conjunto e o mesmo total nos 3
    perfis = {"nutri": plano_nutri, "personal": (planos.get("w5p-personal") or [{}])[0], "aluna": da_aluna or {}}
    kcal = {k: B.kcal_do_plano(v) for k, v in perfis.items()}
    ass = {k: B.assinatura(v) for k, v in perfis.items()}
    o.ok(ass["nutri"] == ass["personal"] == ass["aluna"] and len(ass["nutri"]) == 22,
         "P3 nutri, personal e aluna: o MESMO conjunto (alimento_id, kcal do alimento, gramas) nos 22 itens")
    o.ok(kcal["nutri"] == kcal["personal"] == kcal["aluna"] and round(kcal["nutri"]) == 1894,
         f"P3 o mesmo total nos 3: {', '.join(f'{k} {round(v)} kcal' for k, v in kcal.items())} (a spec mediu 1.894; antes o personal via 1.540)")
    # P4 — o plano aberto = o da lista
    for conta in ("w5p-nutri", "w5p-personal"):
        p0 = (planos.get(conta) or [{}])[0]
        st, r = B.rpc(L.token(conta), "plano_alimentar", {"p_plano": p0.get("id")})
        o.ok(st == 200 and isinstance(r, dict) and not diferencas(ordenar(r), ordenar(p0)),
             f"P4 {conta}: plano_alimentar(<id>) → {st}, igual ao plano da lista")
    # P5 — o JSON da RPC = o REST de hoje (a nutri vê todos os alimentos do plano dela pelo RLS)
    st, r, _ = B.rest(L.token("w5p-nutri"), "planos_alimentares",
                      f"select={SELECT_PLANO}&paciente_id=eq.{aluna}&deleted_at=is.null&order=created_at.desc")
    rest_nutri = lista(st, r) or []
    dif = diferencas(ordenar(rest_nutri), ordenar(planos.get("w5p-nutri") or []))
    o.ok(st == 200 and len(rest_nutri) == 1 and not dif,
         f"P5 a RPC = o REST de hoje (nutri): chaves e valores iguais em plano, refeições, itens, alimento e medidas "
         f"({len(dif)} diferença(s){': ' + '; '.join(dif[:5]) if dif else ''})")
    # P6 — os favoritos: só alunos que a pessoa vê (os mesmos ids do RLS de hoje) e com o paciente
    for conta in ("w5p-nutri", "w5p-personal"):
        tok = L.token(conta)
        st, r = B.rpc(tok, "planos_favoritos", {})
        fav = lista(st, r) or []
        st2, r2, _ = B.rest(tok, "planos_alimentares", "select=id&favorito=eq.true&deleted_at=is.null")
        pelo_rls = {x["id"] for x in (lista(st2, r2) or [])}
        ids = {x.get("id") for x in fav}
        pacientes = {(x.get("paciente") or {}).get("id") for x in fav}
        st3, r3, _ = B.rest(tok, "pacientes", "select=id&id=in.(" + ",".join(sorted(p for p in pacientes if p)) + ")") if pacientes else (200, [], {})
        visiveis = {x["id"] for x in (lista(st3, r3) or [])}
        com_paciente = all(set((x.get("paciente") or {}).keys()) == {"id", "nome", "conta_id"} for x in fav)
        o.ok(st == 200 and ids == pelo_rls and pacientes <= visiveis and com_paciente and plano_nutri.get("id") in ids,
             f"P6 {conta}: planos_favoritos → {st}, {len(fav)} ★ (o RLS de hoje dá {len(pelo_rls)}), todos de alunos que vê, com "
             f"paciente {{id, nome, conta_id}}, o ★ da aluna incluso")

    # N1 — outra conta
    tok = L.token("w13-dono")
    st, r = B.rpc(tok, "planos_do_aluno", {"p_aluno": aluna})
    o.ok(st == 200 and r == [], f"N1 w13-dono (outra conta): planos_do_aluno(<aluna>) → {st} {r if r == [] else '(veio algo)'}")
    st, r = B.rpc(tok, "plano_alimentar", {"p_plano": plano_nutri.get("id")})
    o.ok(st == 200 and r is None, f"N1 w13-dono: plano_alimentar(<plano da aluna>) → {st} {'null' if r is None else '(veio algo)'}")
    st, r = B.rpc(tok, "planos_favoritos", {})
    o.ok(st == 200 and isinstance(r, list) and plano_nutri.get("id") not in {x.get("id") for x in r},
         f"N1 w13-dono: planos_favoritos → {st}, sem o ★ da aluna")
    # N2 — a aluna nas RPCs do painel
    tok = L.token("w5p-aluna")
    st, r = B.rpc(tok, "planos_do_aluno", {"p_aluno": aluna})
    o.ok(st == 200 and r == [], f"N2 w5p-aluna: planos_do_aluno(<a própria matrícula>) → {st} {r if r == [] else '(veio algo)'}")
    st, r = B.rpc(tok, "plano_alimentar", {"p_plano": plano_nutri.get("id")})
    o.ok(st == 200 and r is None, f"N2 w5p-aluna: plano_alimentar(<o plano dela>) → {st} {'null' if r is None else '(veio algo)'}")
    # N3 — sem login
    for f, args in (("planos_do_aluno", {"p_aluno": aluna}), ("plano_alimentar", {"p_plano": plano_nutri.get("id")}), ("planos_favoritos", {})):
        st, r = B.rpc(None, f, args)
        o.ok(st == 401, f"N3 sem login (só a chave pública): {f} → {st}")
    # N4 — a interna pelo PostgREST
    for rotulo, tok in (("nutri", L.token("w5p-nutri")), ("sem login", None)):
        st, r = B.rpc(tok, "plano_alimentar_json", {"p_plano": plano_nutri.get("id")})
        o.ok(st in (401, 403, 404) and not (isinstance(r, dict) and "refeicoes" in r),
             f"N4 a interna plano_alimentar_json pelo PostgREST ({rotulo}) → {st} (recusada)")
    # N5 — o RLS de alimentos não abriu
    proprios = [i["alimento_id"] for i in B.itens_do_plano(plano_nutri) if (i.get("alimento") or {}).get("fonte") != "taco"]
    tok = L.token("w5p-personal")
    if proprios:
        st, r, _ = B.rest(tok, "alimentos", "select=id&id=in.(" + ",".join(sorted(set(proprios))) + ")")
        o.ok(st == 200 and r == [], f"N5 o personal lendo direto os {len(set(proprios))} alimento(s) próprio(s) da nutri do plano → {st}, "
                                    f"{len(r) if isinstance(r, list) else '?'} linha(s) (o RLS de alimentos não abriu)")
    else:
        o.ok(False, "N5 o plano da aluna tem de ter alimento próprio da nutri (a massa w5p) — sem ele a prova do RLS não vale")
    st, r, h = B.rest(tok, "alimentos", "select=id&limit=1", contar=True)
    total = B.total_do_cabecalho(h)
    meus = B.ler(f"select count(*)::int as n from {B.schema()}.alimentos a where a.fonte = 'taco' or a.nutricionista_id = "
                 f"(select id from auth.users where lower(email) = {B.txt(B.CONTAS['w5p-personal'])})")[0]["n"]
    o.ok(st in (200, 206) and total == meus == TACO_ESPERADOS,
         f"N5 a lista de alimentos do personal: {total} (TACO + os dele = {meus}; antes {TACO_ESPERADOS})")
    st, r, _ = B.rest(tok, "planos_alimentares", f"select={SELECT_PLANO}&paciente_id=eq.{aluna}&deleted_at=is.null")
    sem = sum(1 for i in B.itens_do_plano((lista(st, r) or [{}])[0]) if not i.get("alimento"))
    o.ok(st == 200 and sem == len(proprios),
         f"N5 o REST de hoje do personal ainda vem com {sem} item(ns) sem o alimento (= os próprios da nutri: {len(proprios)}) — "
         f"o RLS ficou como estava; a correção é a RPC")


def producao(o, L: B.Logins) -> None:
    tok = L.token("nutri-legado")
    st, r = B.rpc(tok, "planos_do_aluno", {"p_aluno": NADA})
    o.ok(st == 200 and r == [], f"R1 nutri-legado: planos_do_aluno(<uuid que não existe>) → {st} {r if r == [] else '(veio algo)'}")
    st, r = B.rpc(tok, "plano_alimentar", {"p_plano": NADA})
    o.ok(st == 200 and r is None, f"R1 nutri-legado: plano_alimentar(<uuid que não existe>) → {st}")
    st, r = B.rpc(tok, "planos_favoritos", {})
    o.ok(st == 200 and isinstance(r, list), f"R1 nutri-legado: planos_favoritos() → {st} ({len(r) if isinstance(r, list) else '?'} ★)")
    for f, args in (("planos_do_aluno", {"p_aluno": NADA}), ("plano_alimentar", {"p_plano": NADA}), ("planos_favoritos", {})):
        st, _ = B.rpc(None, f, args)
        o.ok(st == 401, f"R2 sem login: {f} → {st}")
    s = B.schema()
    x = B.ler(f"""
      select (select count(*) from {s}.planos_alimentares pl where pl.deleted_at is null)::int as planos,
             (select count(*) from {s}.planos_alimentares pl join {s}.refeicoes r on r.plano_id = pl.id
                join {s}.itens_refeicao i on i.refeicao_id = r.id where pl.deleted_at is null)::int as itens_tabela,
             (select count(*) from {s}.planos_alimentares pl
                cross join lateral jsonb_array_elements({s}.plano_alimentar_json(pl.id) -> 'refeicoes') rf
                cross join lateral jsonb_array_elements(rf -> 'itens') it where pl.deleted_at is null)::int as itens_json,
             (select count(*) from {s}.planos_alimentares pl
                cross join lateral jsonb_array_elements({s}.plano_alimentar_json(pl.id) -> 'refeicoes') rf
                cross join lateral jsonb_array_elements(rf -> 'itens') it
               where pl.deleted_at is null and it ->> 'alimento_id' is not null
                 and jsonb_typeof(it -> 'alimento') is distinct from 'object')::int as sem_alimento""")[0]
    o.ok(x["itens_json"] == x["itens_tabela"] and x["sem_alimento"] == 0,
         f"R3 SQL só leitura: {x['planos']} planos vivos, {x['itens_json']} itens pela montadora (tabelas: {x['itens_tabela']}), "
         f"{x['sem_alimento']} sem o alimento")


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-17 — E2E de API das RPCs do plano alimentar (só leitura; casos no topo)")
    ap.add_argument("--schema", required=True, choices=("staging", "public"))
    a = ap.parse_args()
    B.usar_schema(a.schema)
    o = C.Saida(f"api_{a.schema}")
    o.linha(f"schema {a.schema} · {'PRODUÇÃO, só leitura' if a.schema == 'public' else 'staging, só leitura'}")
    L = B.Logins()
    try:
        if conferir_funcoes(o):
            staging(o, L) if a.schema == "staging" else producao(o, L)
        else:
            o.ok(False, "parei: sem as funções da hml-17 no schema (aplicar a migração antes — §6 da spec)")
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    finally:
        L.fechar(o)
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)  # H-50: a rodada no e2e-rodadas.tsv (nunca derruba o teste)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
