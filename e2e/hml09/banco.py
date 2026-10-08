#!/usr/bin/env python3
"""Physiq hml-09 (homologação, 08/10/2026) — a trava "pegada em produção" (H-23) nos 2 bancos, SÓ LEITURA.

Roda DEPOIS das migrations do staging (supabase-principal/migrations/20261008090000_hml09_exclusao_staging.sql --so staging e
supabase/migrations/20261008090100_hml09_exclusao_staging.sql com physiq.schemas = 'staging'). Cada conferência é uma transação só
leitura pela Management API (~/.pc-pat); as 2 funções novas só leem (STABLE). Só aparecem e-mails de TESTE e contagens.

  principal  staging.pegada_em_producao: verdadeira para as 7 contas de teste com dado em produção (spec §2.1) e, para TODO login de
             teste, igual à conta feita à parte (as FKs de public → auth.users, menos public.profiles.id); falsa para os de teste
             sem dado em public (amostra) e para excluir1/2/3; EXECUTE só da service_role; as 3 redefinidas com o EXECUTE de antes;
             D4 (conta_em_producao) nas 2 do staging que apagam login; D5 (login_compartilhado) no staging.paciente_remover_acesso
             e, com --producao, no public.paciente_remover_acesso (a produção recebe o D5 depois, pelo bloco compartilhado);
  treino     staging.physiq_pegada_em_producao: verdadeira para os 2 logins de teste com vínculo no staging E dado em public e,
             para todo vínculo de teste do staging, igual à conta à parte (vínculo de produção pelo principal ou pelo Treino, ou
             linha nas FKs de public); falsa para excluir1; o id do Treino vazio tratado; EXECUTE só da service_role.

Uso: python3 e2e/hml09/banco.py [--producao]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, TREINO_REF, Placar, http, pat  # noqa: E402

# spec §2.1 (medido em 08/10/2026): as contas de teste que também têm dado em produção
PRINCIPAL_EM_PRODUCAO = ["admin.teste.claude@physiqcalc.app", "nutri.teste.claude@physiqnutri.app", "prova.teste.claude@physiqnutri.app",
                         "teste2@physiqnutri.app", "teste@physiqnutri.app", "teste@teste.com", "w7b.prod.teste.claude@physiqnutri.app"]
TREINO_EM_PRODUCAO = ["admin.teste.claude@physiqcalc.app", "teste@teste.com"]
DESCARTAVEIS = [f"excluir{i}.teste.claude@physiqnutri.app" for i in (1, 2, 3)]
UUID_FALSO = "00000000-0000-4000-8000-00000000abcd"
# a mesma regra do emailDeTeste das Edge Functions (o Treino não tem a staging.email_de_teste)
TESTE_SQL = ("(lower(btrim(coalesce(u.email, ''))) = 'teste@teste.com' "
             "or lower(btrim(coalesce(u.email, ''))) ~ '^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\\.app$')")
FKS_SQL = """select cl.relname as t, a.attname as c, cardinality(c.conkey) as n
               from pg_constraint c join pg_class cl on cl.oid = c.conrelid
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
              where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace = 'public'::regnamespace
              order by 1, 2"""


def ler(ref: str, sql: str) -> tuple[bool, object]:
    """Uma consulta só leitura; devolve (deu certo, linhas) ou (False, mensagem curta do erro)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query",
                    {"query": "set transaction read only;\n" + sql}, {"Authorization": f"Bearer {pat()}"}, timeout=180)
    if st in (200, 201):
        return True, r or []
    msg = str(r.get("message") if isinstance(r, dict) else r)
    if "ERROR:" in msg:  # só a linha do erro (sem o trecho da consulta que o Postgres repete)
        msg = msg[msg.index("ERROR:"):].splitlines()[0]
    return False, f"HTTP {st}: {msg[:200]}"


def motivo(ok_: bool, r: object) -> str:
    return "" if ok_ else f" — {r}"


def conta_a_parte(fks: list[dict], alvo: str, ignorar: set[tuple[str, str]]) -> str:
    """Expressão SQL que diz se <alvo> tem linha em alguma FK de public → auth.users (feita à parte da função)."""
    partes = [f'exists (select 1 from public."{f["t"]}" x where x."{f["c"]}" = {alvo})' for f in fks if (f["t"], f["c"]) not in ignorar]
    return "(" + " or ".join(partes) + ")"


def execute_so_servidor(p: Placar, ref: str, rotulo: str, assinatura: str) -> None:
    ok_, r = ler(ref, f"""
      select has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor, p.prosecdef as definer, p.provolatile::text as vol,
             pg_get_userbyid(p.proowner) as dono
        from pg_proc p where p.oid = to_regprocedure('{assinatura}')""")
    achou = ok_ and len(r) == 1
    p.check(achou and r[0] == {"anon": False, "logado": False, "servidor": True, "definer": True, "vol": "s", "dono": "postgres"},
            f"[{rotulo}] {assinatura}: EXECUTE só da service_role (visitante e logado sem), STABLE SECURITY DEFINER, dono postgres"
            + ("" if achou else (" — função inexistente" if ok_ else motivo(ok_, r))))


def principal(p: Placar, producao: bool) -> None:
    ok_, fks = ler(PRINCIPAL_REF, FKS_SQL)
    p.check(ok_ and fks and all(f["n"] == 1 for f in fks),
            f"[principal] FKs de public → auth.users: {len(fks) if ok_ else '?'}, todas de 1 coluna (a conta à parte cobre todas)" + motivo(ok_, fks))
    if not ok_:
        return
    ok_, esperado = ler(PRINCIPAL_REF, f"""
      select u.email, {conta_a_parte(fks, 'u.id', {("profiles", "id")})} as tem
        from auth.users u where staging.email_de_teste(u.email) order by u.email""")
    if not ok_:
        p.check(False, "[principal] conta à parte das contas de teste" + motivo(ok_, esperado))
        return
    tem = {r["email"]: r["tem"] for r in esperado}
    com_dado = sorted(e for e, v in tem.items() if v)
    faltam = [e for e in PRINCIPAL_EM_PRODUCAO if not tem.get(e)]
    p.check(not faltam, f"[principal] conta à parte: {len(com_dado)} de {len(tem)} logins de teste com dado em public, as 7 do §2.1 entre eles"
                        f" ({', '.join(com_dado)})" + (f" — faltam: {', '.join(faltam)}" if faltam else ""))

    ok_, fn = ler(PRINCIPAL_REF, """
      select u.email, (x.p ->> 'em_producao')::boolean as em_producao, jsonb_array_length(x.p -> 'colunas') as n
        from auth.users u cross join lateral (select staging.pegada_em_producao(u.id) as p) x
       where staging.email_de_teste(u.email) order by u.email""")
    if not ok_:
        p.check(False, "[principal] staging.pegada_em_producao em todos os logins de teste" + motivo(ok_, fn))
        p.check(False, "[principal] staging.pegada_em_producao verdadeira para as 7 do §2.1")
        p.check(False, "[principal] staging.pegada_em_producao falsa para excluir1/2/3 e para os de teste sem dado em public")
    else:
        res = {r["email"]: r for r in fn}
        diverge = sorted(e for e in tem if e not in res or res[e]["em_producao"] is not tem[e] or (res[e]["n"] > 0) is not tem[e])
        p.check(not diverge and len(res) == len(tem),
                f"[principal] staging.pegada_em_producao = conta à parte em todos os {len(tem)} logins de teste (ignora só public.profiles.id)"
                + (f" — diferente em: {', '.join(diverge)}" if diverge else ""))
        verdade = sorted(e for e, r in res.items() if r["em_producao"])
        p.check(all(res.get(e, {}).get("em_producao") is True for e in PRINCIPAL_EM_PRODUCAO),
                f"[principal] staging.pegada_em_producao verdadeira para as 7 do §2.1 (verdadeira em {len(verdade)}: {', '.join(verdade)})")
        falsos = [e for e, r in res.items() if r["em_producao"] is False and e not in DESCARTAVEIS]
        existem = [e for e in DESCARTAVEIS if e in res]
        p.check(all(res[e]["em_producao"] is False for e in existem) and len(falsos) + len(existem) == len(res) - len(verdade),
                f"[principal] staging.pegada_em_producao falsa para {', '.join(x.split('.')[0] for x in existem) or '(excluir1/2/3 não existem)'}"
                f" e para os {len(falsos)} outros de teste sem dado em public (amostra: {', '.join(sorted(falsos)[:5])})")
    ok_, r = ler(PRINCIPAL_REF, f"select staging.pegada_em_producao('{UUID_FALSO}'::uuid) as p")
    p.check(ok_ and r and r[0]["p"] == {"em_producao": False, "colunas": []},
            "[principal] staging.pegada_em_producao de um id que não existe → {em_producao: false, colunas: []}" + motivo(ok_, r))
    execute_so_servidor(p, PRINCIPAL_REF, "principal", "staging.pegada_em_producao(uuid)")

    alvos = ["staging.master_excluir_profissional(uuid)", "staging.paciente_remover_acesso(uuid)"] + (
        ["public.paciente_remover_acesso(uuid)"] if producao else [])
    lista = ", ".join(f"('{a}')" for a in alvos)
    ok_, r = ler(PRINCIPAL_REF, f"""
      select e.f, p.oid is not null as existe, position('conta_em_producao' in coalesce(p.prosrc, '')) > 0 as d4,
             position('login_compartilhado' in coalesce(p.prosrc, '')) > 0 as d5,
             position('delete from auth.users' in coalesce(p.prosrc, '')) > coalesce(nullif(greatest(
               position('conta_em_producao' in coalesce(p.prosrc, '')), position('login_compartilhado' in coalesce(p.prosrc, ''))), 0), 1000000) as antes_do_delete,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('authenticated', p.oid, 'EXECUTE') as logado,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor, p.prosecdef as definer, p.provolatile::text as vol
        from (values {lista}) as e(f) left join pg_proc p on p.oid = to_regprocedure(e.f)""")
    if not ok_:
        p.check(False, "[principal] corpos vivos do D4/D5" + motivo(ok_, r))
        return
    f = {x["f"]: x for x in r}
    for a in alvos[:2]:
        p.check(f[a]["d4"] and f[a]["antes_do_delete"], f"[principal] D4: {a} recusa conta_em_producao antes do delete do login")
    a = "staging.paciente_remover_acesso(uuid)"
    p.check(f[a]["d5"] and f[a]["antes_do_delete"], f"[principal] D5: {a} recusa login_compartilhado antes do delete do login")
    if producao:
        a = "public.paciente_remover_acesso(uuid)"
        p.check(f[a]["d5"] and f[a]["antes_do_delete"], f"[principal] D5 em produção: {a} recusa login_compartilhado antes do delete do login")
    for a in alvos:
        x = f[a]
        p.check(x["existe"] and not x["anon"] and x["logado"] and x["servidor"] and x["definer"] and x["vol"] == "v",
                f"[principal] {a}: o EXECUTE de antes (logado e service_role; visitante sem), VOLATILE SECURITY DEFINER")


def treino(p: Placar) -> None:
    ok_, fks = ler(TREINO_REF, FKS_SQL)
    p.check(ok_ and fks and all(f["n"] == 1 for f in fks),
            f"[treino] FKs de public → auth.users: {len(fks) if ok_ else '?'}, todas de 1 coluna" + motivo(ok_, fks))
    if not ok_:
        return
    base = f"""from staging.physiq_identidades si join auth.users u on u.id = si.treino_user_id where {TESTE_SQL}"""
    ok_, esperado = ler(TREINO_REF, f"""
      select u.email, exists (select 1 from public.physiq_identidades i where i.principal_user_id = si.principal_user_id)
                      or {conta_a_parte(fks, 'si.treino_user_id', set())} as tem
        {base} order by u.email""")
    if not ok_:
        p.check(False, "[treino] conta à parte dos vínculos de teste do staging" + motivo(ok_, esperado))
        return
    tem = {r["email"]: r["tem"] for r in esperado}
    com_dado = sorted(e for e, v in tem.items() if v)
    faltam = [e for e in TREINO_EM_PRODUCAO if not tem.get(e)]
    p.check(not faltam, f"[treino] conta à parte: {len(com_dado)} de {len(tem)} vínculos de teste do staging com dado em produção, os 2 do §2.1"
                        f" entre eles ({', '.join(com_dado)})" + (f" — faltam: {', '.join(faltam)}" if faltam else ""))

    ok_, fn = ler(TREINO_REF, f"""
      select u.email, (x.p ->> 'em_producao')::boolean as em_producao, jsonb_array_length(x.p -> 'colunas') as n
        from staging.physiq_identidades si join auth.users u on u.id = si.treino_user_id
        cross join lateral (select staging.physiq_pegada_em_producao(si.principal_user_id, si.treino_user_id) as p) x
       where {TESTE_SQL} order by u.email""")
    if not ok_:
        p.check(False, "[treino] staging.physiq_pegada_em_producao em todos os vínculos de teste do staging" + motivo(ok_, fn))
        p.check(False, "[treino] staging.physiq_pegada_em_producao verdadeira para os 2 do §2.1")
    else:
        res = {r["email"]: r for r in fn}
        diverge = sorted(e for e in tem if e not in res or res[e]["em_producao"] is not tem[e] or (res[e]["n"] > 0) is not tem[e])
        p.check(not diverge and len(res) == len(tem),
                f"[treino] staging.physiq_pegada_em_producao = conta à parte nos {len(tem)} vínculos de teste do staging"
                + (f" — diferente em: {', '.join(diverge)}" if diverge else ""))
        verdade = sorted(e for e, r in res.items() if r["em_producao"])
        p.check(all(res.get(e, {}).get("em_producao") is True for e in TREINO_EM_PRODUCAO),
                f"[treino] staging.physiq_pegada_em_producao verdadeira para os 2 do §2.1 (verdadeira em {len(verdade)}: {', '.join(verdade)})")
        e1 = DESCARTAVEIS[0]
        if e1 in res:
            p.check(res[e1]["em_producao"] is False, "[treino] staging.physiq_pegada_em_producao falsa para excluir1 (só tem staging)")
    # o id do Treino vazio (antes do vínculo no staging): vale o vínculo de produção pelo principal; sem nenhum id, recusa
    ok_, r = ler(TREINO_REF, f"""
      select (select (staging.physiq_pegada_em_producao(i.principal_user_id, null) ->> 'em_producao')::boolean
                from public.physiq_identidades i join auth.users u on u.id = i.treino_user_id where {TESTE_SQL} limit 1) as pelo_principal,
             staging.physiq_pegada_em_producao('{UUID_FALSO}'::uuid, null) as inexistente""")
    p.check(ok_ and r and r[0]["pelo_principal"] is True and r[0]["inexistente"] == {"em_producao": False, "colunas": []},
            "[treino] id do Treino vazio: vínculo de produção pelo principal → verdadeira; principal sem vínculo → falsa" + motivo(ok_, r))
    ok_, r = ler(TREINO_REF, "select staging.physiq_pegada_em_producao(null, null) as p")
    recusou = not ok_ and "ids vazios" in str(r)
    p.check(recusou, "[treino] sem nenhum id → recusa (ids vazios)" + ("" if recusou else (" — não recusou" if ok_ else f" — {r}")))
    execute_so_servidor(p, TREINO_REF, "treino", "staging.physiq_pegada_em_producao(uuid,uuid)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--producao", action="store_true", help="confere também o D5 em public.paciente_remover_acesso (bloco compartilhado)")
    a = ap.parse_args()
    p = Placar()
    principal(p, a.producao)
    treino(p)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
