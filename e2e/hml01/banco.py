#!/usr/bin/env python3
"""Physiq hml-01 (homologação, 07/10/2026) — permissões dos 2 bancos, SÓ LEITURA (vale em staging e em produção).

Cada conferência roda numa transação só leitura pela Management API (~/.pc-pat). Quando simula um perfil, usa o papel da API
(anon ou authenticated) com um uuid inventado ou a conta de TESTE — nunca a sessão de uma pessoa de verdade — e só conta linhas.

  principal  visitante sem privilégio em tabela; logado sem TRUNCATE; as funções internas só para o servidor; as 2 funções de
             acesso do aluno com a guarda nova (conta qualquer → sem_acesso); sem a policy que entregava o perfil da nutricionista;
  treino     visitante só nos 2 catálogos (e só o global); conta qualquer não lê treino montado, pasta nem vínculo de pasta;
             funções de servidor fechadas; guarda das colunas de controle do aluno.

Uso: python3 e2e/hml01/banco.py --schema staging|public
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, TREINO_REF, Placar, http, pat  # noqa: E402

UUID_FALSO = "00000000-0000-4000-8000-00000000abcd"
INTERNAS = ["w27_conta_linha", "w27_nome", "w13_foto_do_aluno", "w13_conta_do_personal", "conta_alunos_ativos", "conta_limite_alunos",
            "conta_pode_adicionar_aluno", "conta_tem_modulo", "equipe_motivo_bloqueio", "papeis_do_plano", "w13_conta_travada",
            "preconsulta_autor_nutri", "w13_dono_do_codigo", "w13_erro_limite", "w13_modulos_do_aluno", "w14_matricula_da_rota",
            "whatsapp_enfileirar", "whatsapp_destravar_fila", "papeis_permitidos"]


def ler(ref: str, sql: str) -> tuple[int, object]:
    """Uma consulta só leitura; devolve (status, linhas ou mensagem de erro)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query",
                    {"query": "set transaction read only;\n" + sql}, {"Authorization": f"Bearer {pat()}"}, timeout=180)
    return st, r


def como(papel: str, claims: str, consulta: str) -> str:
    return (f"select set_config('request.jwt.claims', {claims}, true);\n"
            f"select set_config('role', '{papel}', true);\n{consulta}")


def principal(S: str, p: Placar) -> None:
    lst = lambda xs: ", ".join(f"'{x}'" for x in xs)  # noqa: E731
    st, r = ler(PRINCIPAL_REF, f"""
      select count(*) filter (where has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) as anon_tab,
             count(*) filter (where has_table_privilege('authenticated', c.oid, 'TRUNCATE')) as auth_trunc
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '{S}' and c.relkind in ('r','p')""")
    p.check(st in (200, 201) and r[0]["anon_tab"] == 0, f"[principal/{S}] visitante sem privilégio em tabela ({r[0]['anon_tab'] if st in (200, 201) else r})")
    p.check(st in (200, 201) and r[0]["auth_trunc"] == 0, f"[principal/{S}] logado sem TRUNCATE")
    st, r = ler(PRINCIPAL_REF, f"""
      select count(*) as n, count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')
                                                or has_function_privilege('anon', p.oid, 'EXECUTE')) as abertas,
             count(*) filter (where has_function_privilege('service_role', p.oid, 'EXECUTE')) as servidor
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '{S}' and p.proname in ({lst(INTERNAS)})""")
    p.check(st in (200, 201) and r[0]["n"] == len(INTERNAS) and r[0]["abertas"] == 0 and r[0]["servidor"] == len(INTERNAS),
            f"[principal/{S}] {len(INTERNAS)} funções internas só para o servidor ({r[0] if st in (200, 201) else r})")
    st, r = ler(PRINCIPAL_REF, f"""
      select count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as logado,
             count(*) filter (where position('pode_mexer_no_acesso' in p.prosrc) > 0) as guarda_nova
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = '{S}' and p.proname in ('paciente_definir_acesso', 'paciente_remover_acesso')""")
    p.check(st in (200, 201) and r[0]["logado"] == 2 and r[0]["guarda_nova"] == 2, f"[principal/{S}] acesso do aluno: guarda nova e o site antigo da Nutri chamando")
    st, r = ler(PRINCIPAL_REF, f"select count(*) as n from {S}.pacientes where nutricionista_id is null and deleted_at is null")
    if st in (200, 201) and r[0]["n"]:
        st, r = ler(PRINCIPAL_REF, f"""
          select set_config('hml.pid', (select id::text from {S}.pacientes where nutricionista_id is null and deleted_at is null limit 1), true);
          """ + como("authenticated", f"'{{\"sub\":\"{UUID_FALSO}\",\"role\":\"authenticated\"}}'",
                     f"select {S}.paciente_definir_acesso(current_setting('hml.pid')::uuid, true);"))
        p.check(st == 400 and "sem_acesso" in str(r), f"[principal/{S}] conta qualquer no aluno sem nutricionista → sem_acesso")
    st, r = ler(PRINCIPAL_REF, f"select count(*) as n from pg_policies where schemaname = '{S}' and tablename = 'profiles' "
                               "and policyname = 'paciente: ler o perfil da sua nutricionista'")
    p.check(st in (200, 201) and r[0]["n"] == 0, f"[principal/{S}] sem a policy do perfil inteiro da nutricionista")


def treino(S: str, p: Placar) -> None:
    st, r = ler(TREINO_REF, f"""
      select string_agg(c.relname, ',' order by c.relname) filter (where has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) as anon_tab,
             count(*) filter (where has_table_privilege('authenticated', c.oid, 'TRUNCATE')) as auth_trunc
        from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = '{S}' and c.relkind in ('r','p')""")
    p.check(st in (200, 201) and r[0]["anon_tab"] == "grupos_musculares,tb_exercicios", f"[treino/{S}] visitante só nos 2 catálogos ({r[0]['anon_tab'] if st in (200, 201) else r})")
    p.check(st in (200, 201) and r[0]["auth_trunc"] == 0, f"[treino/{S}] logado sem TRUNCATE")
    st, r = ler(TREINO_REF, como("anon", "'{\"role\":\"anon\"}'", f"""
      select (select count(*) from {S}.tb_exercicios) as ex, (select count(*) from {S}.grupos_musculares) as mu"""))
    st2, r2 = ler(TREINO_REF, f"""select (select count(*) from {S}.tb_exercicios where professor_id is null) as ex,
                                         (select count(*) from {S}.grupos_musculares where professor_id is null) as mu""")
    p.check(st in (200, 201) and st2 in (200, 201) and r[0] == r2[0], f"[treino/{S}] visitante lê só o catálogo global ({r[0] if st in (200, 201) else r})")
    tabs = ["tb_grupos_treino", "tb_grupos_exercicios", "tb_pastas_treino", "tb_pastas_treino_grupos"]
    st, r = ler(TREINO_REF, como("authenticated", f"'{{\"sub\":\"{UUID_FALSO}\",\"role\":\"authenticated\"}}'",
                                 "select " + ", ".join(f"(select count(*) from {S}.{t}) as {t}" for t in tabs) + ";"))
    p.check(st in (200, 201) and all(v == 0 for v in r[0].values()), f"[treino/{S}] conta qualquer não lê treino montado nem pasta ({r[0] if st in (200, 201) else r})")
    st, r = ler(TREINO_REF, f"""
      select string_agg(p.proname, ',' order by p.proname) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_x,
             string_agg(p.proname, ',' order by p.proname) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as auth_x
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = '{S}' and p.proname in ('physiq_gerar_codigo_professor', 'physiq_professor_pode_convidar', 'check_rate_limit',
             'physiq_avisos_tolerancia', 'physiq_aluno_bloqueado', 'physiq_professor_acesso_ok', 'physiq_meu_professor')""")
    p.check(st in (200, 201) and r[0]["anon_x"] is None and r[0]["auth_x"] == "physiq_aluno_bloqueado,physiq_meu_professor,physiq_professor_acesso_ok",
            f"[treino/{S}] funções: servidor fechadas; visitante fora ({r[0] if st in (200, 201) else r})")
    st, r = ler(TREINO_REF, f"select position('admin_locked' in p.prosrc) > 0 as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
                            f"where n.nspname = '{S}' and p.proname = 'physiq_profiles_guard'")
    p.check(st in (200, 201) and r and r[0]["ok"], f"[treino/{S}] guarda das colunas de controle do aluno")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", choices=["staging", "public"], required=True)
    a = ap.parse_args()
    p = Placar()
    principal(a.schema, p)
    treino(a.schema, p)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
