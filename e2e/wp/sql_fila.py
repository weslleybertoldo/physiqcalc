#!/usr/bin/env python3
"""Physiq W-P (Task 8b) — a fila das cobranças automáticas NO BANCO (20261011030000_wp_fila_automaticas.sql). Cada caso com escrita roda
num bloco que termina com erro de propósito (nada fica gravado: nem a fila, nem o pedido do pg_net) e devolve o resultado na mensagem
do erro, com a matrícula de TESTE.
Casos (staging):
  1. enfileirar 2× o mesmo aluno = 1 pendente, com tentativas 0, pronta, o motivo da vez, sem o erro de antes e com a conta do aluno
  2. a pendência feita não segura a próxima; o índice único segura a 2ª pendente gravada direto; aluno inexistente não entra
  3. motivo inválido → erro 22023; lista vazia ou nula → 0
  4. automaticas_disparar(): sem pendente pronta → null; com pendente pronta → o id do pedido do pg_net SE o Vault
     physiq_automaticas_fila_segredo e o pg_net existem (sem eles, null: grave o segredo — servidor.py automaticas_fila — e rode de novo)
  5. o app não chega na fila: authenticated e anon não leem a tabela nem executam as 2 funções (set local role)
  6. (só leitura; vale no public) privilégios, RLS ligado sem policy, as 2 funções SECURITY DEFINER com search_path vazio e o job
     automaticas-fila-<schema> no cron.job, de hora em hora no minuto 7
Uso: python3 e2e/wp/sql_fila.py [--paciente <matrícula de teste com conta>]   (staging: todos os casos; depois de aplicar a migration)
     python3 e2e/wp/sql_fila.py --schema public                                (só o caso 6, sem escrita)
Saída sem dado pessoal: só contagens e os resultados dos casos.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
from _comum import Placar, sql_principal  # noqa: E402

p = Placar()
VAULT = "physiq_automaticas_fila_segredo"


def _resultado(q: str) -> dict:
    try:
        sql_principal(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO<<(.*)>>", str(e), re.S)
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def bloco(corpo: str) -> dict:
    return _resultado(f"""do $t$
declare v_res jsonb := '{{}}'::jsonb; v_n integer;
begin
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;""")


def pendente(s: str, pac: str, coluna: str) -> str:
    return f"(select {coluna} from {s}.automaticas_fila where paciente_id = '{pac}' and feito_em is null)"


def casos(s: str, pac: str) -> None:
    # 1. 2× o mesmo aluno: 1 pendente, que recomeça (a 2ª chamada também repete o id na lista)
    r = bloco(f"""  delete from {s}.automaticas_fila where paciente_id = '{pac}';
  v_n := {s}.automaticas_enfileirar(array['{pac}']::uuid[], 'plano');
  v_res := v_res || jsonb_build_object('n1', v_n);
  update {s}.automaticas_fila set tentativas = 5, erro = 'mp_500', proxima_em = now() + interval '1 hour'
   where paciente_id = '{pac}' and feito_em is null;
  v_n := {s}.automaticas_enfileirar(array['{pac}', '{pac}']::uuid[], 'aluno');
  v_res := v_res || jsonb_build_object('n2', v_n,
    'linhas', (select count(*) from {s}.automaticas_fila where paciente_id = '{pac}'),
    'pendentes', (select count(*) from {s}.automaticas_fila where paciente_id = '{pac}' and feito_em is null),
    'tentativas', {pendente(s, pac, 'tentativas')}, 'motivo', {pendente(s, pac, 'motivo')},
    'erro_limpo', {pendente(s, pac, 'erro is null')}, 'pronta', {pendente(s, pac, 'proxima_em <= now()')},
    'conta', (select f.conta_id is not distinct from pa.conta_id from {s}.automaticas_fila f join {s}.pacientes pa on pa.id = f.paciente_id
               where f.paciente_id = '{pac}' and f.feito_em is null));
""")
    p.check(r == {"n1": 1, "n2": 1, "linhas": 1, "pendentes": 1, "tentativas": 0, "motivo": "aluno", "erro_limpo": True, "pronta": True,
                  "conta": True},
            f"enfileirar 2× o mesmo aluno = 1 pendente, tentativas 0, pronta, motivo da vez, sem o erro de antes, com a conta ({r})")

    # 2. a feita não segura a próxima; a 2ª pendente direta esbarra no índice único; aluno inexistente fica de fora
    r = bloco(f"""  delete from {s}.automaticas_fila where paciente_id = '{pac}';
  perform {s}.automaticas_enfileirar(array['{pac}']::uuid[], 'plano');
  update {s}.automaticas_fila set feito_em = now(), resultado = 'atualizada' where paciente_id = '{pac}' and feito_em is null;
  v_n := {s}.automaticas_enfileirar(array['{pac}']::uuid[], 'plano');
  v_res := v_res || jsonb_build_object('n', v_n, 'linhas', (select count(*) from {s}.automaticas_fila where paciente_id = '{pac}'),
    'pendentes', (select count(*) from {s}.automaticas_fila where paciente_id = '{pac}' and feito_em is null));
  begin
    insert into {s}.automaticas_fila (paciente_id, motivo) values ('{pac}', 'plano');
    v_res := v_res || '{{"unico": "passou"}}'::jsonb;
  exception when unique_violation then
    v_res := v_res || '{{"unico": "segurou"}}'::jsonb;
  end;
  v_res := v_res || jsonb_build_object('inexistente', {s}.automaticas_enfileirar(array[gen_random_uuid()]::uuid[], 'plano'));
""")
    p.check(r == {"n": 1, "linhas": 2, "pendentes": 1, "unico": "segurou", "inexistente": 0},
            f"a feita não segura a próxima; o índice único segura a 2ª pendente; aluno inexistente não entra ({r})")

    # 3. motivo fora da lista; lista vazia ou nula
    r = bloco(f"""  begin
    perform {s}.automaticas_enfileirar(array['{pac}']::uuid[], 'outro');
    v_res := v_res || '{{"motivo": "passou"}}'::jsonb;
  exception when others then
    v_res := v_res || jsonb_build_object('motivo', sqlstate);
  end;
  v_res := v_res || jsonb_build_object('vazia', {s}.automaticas_enfileirar(array[]::uuid[], 'plano'),
                                       'nula', {s}.automaticas_enfileirar(null, 'plano'));
""")
    p.check(r == {"motivo": "22023", "vazia": 0, "nula": 0}, f"motivo inválido → 22023; lista vazia ou nula → 0 ({r})")

    # 4. o disparo: sem pendente pronta não chama; com pendente pronta chama (se o Vault e o pg_net existem) — o bloco é desfeito,
    #    então o pedido do pg_net não sai
    r = bloco(f"""  update {s}.automaticas_fila set feito_em = now(), resultado = 'igual' where feito_em is null;
  v_res := v_res || jsonb_build_object('sem_pronta', {s}.automaticas_disparar());
  perform {s}.automaticas_enfileirar(array['{pac}']::uuid[], 'plano');
  v_res := v_res || jsonb_build_object('com_pronta', {s}.automaticas_disparar(),
    'vault', exists (select 1 from vault.decrypted_secrets v where v.name = '{VAULT}' and length(v.decrypted_secret) >= 32),
    'pg_net', exists (select 1 from pg_extension where extname = 'pg_net'));
""")
    pode = bool(r.get("vault")) and bool(r.get("pg_net"))
    p.check(r.get("sem_pronta") is None, f"automaticas_disparar() sem pendente pronta → null ({r.get('sem_pronta')})")
    p.check((isinstance(r.get("com_pronta"), int) and r["com_pronta"] > 0) if pode else r.get("com_pronta") is None,
            f"com pendente pronta → {'o id do pedido do pg_net' if pode else 'null (sem o Vault ' + VAULT + ' ou sem o pg_net)'} "
            f"({ {k: r.get(k) for k in ('com_pronta', 'vault', 'pg_net')} })")
    if not pode:
        print(f"   ⚠️  sem o Vault {VAULT}: python3 scripts/segredos/servidor.py automaticas_fila gerar → aceitar → trocar")

    # 5. o app não chega na fila (como authenticated e como anon)
    tentar = ""
    for papel in ("authenticated", "anon"):
        tentar += f"""  execute 'set local role {papel}';
  begin
    perform 1 from {s}.automaticas_fila limit 1;
    v_res := v_res || jsonb_build_object('{papel}_le', 'leu');
  exception when insufficient_privilege then
    v_res := v_res || jsonb_build_object('{papel}_le', 'negado');
  end;
  begin
    perform {s}.automaticas_enfileirar(array[]::uuid[], 'plano');
    v_res := v_res || jsonb_build_object('{papel}_enfileira', 'rodou');
  exception when insufficient_privilege then
    v_res := v_res || jsonb_build_object('{papel}_enfileira', 'negado');
  end;
  begin
    perform {s}.automaticas_disparar();
    v_res := v_res || jsonb_build_object('{papel}_dispara', 'rodou');
  exception when insufficient_privilege then
    v_res := v_res || jsonb_build_object('{papel}_dispara', 'negado');
  end;
  execute 'reset role';
"""
    r = bloco(tentar)
    esperado = {f"{papel}_{acao}": "negado" for papel in ("authenticated", "anon") for acao in ("le", "enfileira", "dispara")}
    p.check(r == esperado, f"authenticated e anon: não leem a fila nem executam enfileirar/disparar ({r})")


def leitura(s: str) -> None:
    # 6. só leitura (vale no public): privilégios, RLS, as funções e o job do pg_cron
    r = sql_principal(f"""select
  has_table_privilege('authenticated', '{s}.automaticas_fila', 'SELECT,INSERT,UPDATE,DELETE') as auth_tabela,
  has_table_privilege('anon', '{s}.automaticas_fila', 'SELECT,INSERT,UPDATE,DELETE') as anon_tabela,
  has_table_privilege('service_role', '{s}.automaticas_fila', 'SELECT') and has_table_privilege('service_role', '{s}.automaticas_fila', 'UPDATE')
    as servidor_tabela,
  has_function_privilege('authenticated', '{s}.automaticas_enfileirar(uuid[], text)', 'EXECUTE')
    or has_function_privilege('anon', '{s}.automaticas_enfileirar(uuid[], text)', 'EXECUTE') as app_enfileira,
  has_function_privilege('authenticated', '{s}.automaticas_disparar()', 'EXECUTE')
    or has_function_privilege('anon', '{s}.automaticas_disparar()', 'EXECUTE') as app_dispara,
  has_function_privilege('service_role', '{s}.automaticas_enfileirar(uuid[], text)', 'EXECUTE')
    and has_function_privilege('service_role', '{s}.automaticas_disparar()', 'EXECUTE') as servidor_funcoes,
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = '{s}' and c.relname = 'automaticas_fila') as rls,
  (select count(*)::int from pg_policies where schemaname = '{s}' and tablename = 'automaticas_fila') as policies,
  (select count(*)::int from pg_proc f join pg_namespace n on n.oid = f.pronamespace
    where n.nspname = '{s}' and f.proname in ('automaticas_enfileirar', 'automaticas_disparar') and f.prosecdef
      and array_to_string(f.proconfig, ',') like '%search_path=""%') as definer,
  (select count(*)::int from cron.job where jobname = 'automaticas-fila-{s}' and schedule = '7 * * * *'
      and command = 'select {s}.automaticas_disparar()') as job""")[0]
    p.check(r == {"auth_tabela": False, "anon_tabela": False, "servidor_tabela": True, "app_enfileira": False, "app_dispara": False,
                  "servidor_funcoes": True, "rls": True, "policies": 0, "definer": 2, "job": 1},
            f"[{s}] só o servidor: tabela e funções fechadas para o app, RLS sem policy, SECURITY DEFINER com search_path vazio, "
            f"o job automaticas-fila-{s} no minuto 7 ({r})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    ap.add_argument("--paciente")
    a = ap.parse_args()
    leitura(a.schema)
    if a.schema != "staging":
        print("   (public: só a leitura — os casos com escrita, mesmo desfeita, são só do staging)")
        return p.fim()
    pac = a.paciente or sql_principal("""select pa.id::text as id from staging.pacientes pa join staging.contas c on c.id = pa.conta_id
        join auth.users u on u.id = pa.user_id where c.origem is distinct from 'app' and pa.deleted_at is null and pa.ativo
          and lower(u.email) like '%teste%' order by pa.created_at limit 1""")[0]["id"]
    casos("staging", pac)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
