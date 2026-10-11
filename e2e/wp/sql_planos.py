#!/usr/bin/env python3
"""Physiq W-P — os planos do aluno NO BANCO (20261011010000_wp_planos_modalidades.sql e 20261011020000_wp_trava_cobranca.sql)
com os MESMOS números das regras puras (src/financeiro/planos.test.ts). Cada caso roda num bloco que termina com erro de propósito
(nada fica gravado): cria um plano de teste na conta da matrícula de TESTE, mexe e devolve o resultado na mensagem do erro.
A regressão recalcula a cobertura de TODOS os alunos dentro de um bloco desfeito e compara com o que está gravado.

Uso: python3 e2e/wp/sql_planos.py [--paciente <matrícula de teste com conta>]                 (staging: todos os casos)
     python3 e2e/wp/sql_planos.py --so-regressao --schema staging|public --guardar <arq.json>   (ANTES da migration)
     python3 e2e/wp/sql_planos.py --so-regressao --schema staging|public --comparar <arq.json>  (DEPOIS: tem que bater)
Saída sem dado pessoal: só contagem, datas e valores dos casos de teste.
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


def _resultado(q: str) -> dict:
    try:
        sql_principal(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO<<(.*)>>", str(e), re.S)
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def bloco(s: str, pac: str, corpo: str) -> dict:
    return _resultado(f"""do $t$
declare v_nutri uuid; v_conta uuid; v_plano uuid; v_res jsonb := '{{}}'::jsonb; i integer;
begin
  select coalesce(c.dono_id, pa.personal_id, pa.nutricionista_id), pa.conta_id into v_nutri, v_conta
    from {s}.pacientes pa left join {s}.contas c on c.id = pa.conta_id where pa.id = '{pac}';
  delete from {s}.aluno_assinaturas where paciente_id = '{pac}';
  update {s}.cobrancas set deleted_at = now() where paciente_id = '{pac}' and tipo = 'mensalidade' and deleted_at is null;
  update {s}.pacientes set plano_modalidade = null, plano_valor_negociado = null, app_teste_de = null, app_teste_ate = null where id = '{pac}';
  insert into {s}.planos_aluno (conta_id, nome, valor, meses, modalidades, max_parcelas_cartao)
  values (v_conta, 'WP teste ' || gen_random_uuid(), 1000, 12, array['avista', 'cartao_parcelado', 'mensal'], 10) returning id into v_plano;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;""")


def paga(s: str, pac: str, dia: str, meses: int = 1, total: str = "null", status: str = "paga") -> str:
    return (f"  insert into {s}.cobrancas (nutricionista_id, paciente_id, descricao, valor, vencimento, status, pago_em, tipo, forma, origem,"
            f" meses_cobertos, parcelas_total, plano_aluno_id) values (v_nutri, '{pac}', 'teste wp', 10, '{dia}', '{status}', '{dia}T12:00:00Z',"
            f" 'mensalidade', 'manual', 'teste_wp', {meses}, {total}, v_plano);\n")


def pago_ate(s: str, pac: str) -> str:
    return (f"  v_res := v_res || jsonb_build_object('pago_ate', (select to_char(mensalidade_pago_ate at time zone 'UTC', 'YYYY-MM-DD')"
            f" from {s}.pacientes where id = '{pac}'));\n")


def automatica(s: str, pac: str) -> str:
    return (f"  insert into {s}.aluno_assinaturas (paciente_id, status, valor, proximo_vencimento, mp_preapproval_id)"
            f" values ('{pac}', 'authorized', 10, '2026-12-15T12:00:00Z', 'teste-wp-' || gen_random_uuid());\n")


def casos(s: str, pac: str) -> None:
    # 1. cobertura com meses_cobertos (as datas do Calc continuam no e2e/w06/sql_cobertura.py, que tem que seguir passando)
    r = bloco(s, pac, paga(s, pac, "2026-07-15", 12) + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2027-07-15"}, f"à vista de 12 meses: 15/07/2026 → 15/07/2027 ({r})")
    r = bloco(s, pac, paga(s, pac, "2026-01-10") + paga(s, pac, "2026-02-01", 12) + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2027-02-10"}, f"1 mês e depois 12 meses: 10/01 + 01/02 → 10/02/2027 ({r})")
    r = bloco(s, pac, automatica(s, pac) + paga(s, pac, "2026-07-20", 12) + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2027-07-20"}, f"a automática (dia 15) não encurta o período todo ({r})")
    r = bloco(s, pac, automatica(s, pac) + paga(s, pac, "2026-07-20", 1, "12") + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2026-08-15"}, f"no mês a mês o dia da automática continua mandando ({r})")
    # 2. parcela n de N: recusa sai da conta; depois da 12ª volta a 1 (P-A "1": renova)
    r = bloco(s, pac, paga(s, pac, "2026-07-01", 1, "12") + paga(s, pac, "2026-08-01", 1, "12", "cancelada")
              + paga(s, pac, "2026-08-02", 1, "12") + paga(s, pac, "2026-09-01", 1, "12")
              + f"  v_res := jsonb_build_object('nums', (select jsonb_agg(parcela_num order by pago_em) from {s}.cobrancas"
                f" where paciente_id = '{pac}' and origem = 'teste_wp' and status = 'paga' and deleted_at is null));\n")
    p.check(r == {"nums": [1, 2, 3]}, f"parcelas 1, 2, 3 (a cancelada não conta) ({r})")
    r = bloco(s, pac, f"""  for i in 0..12 loop
    insert into {s}.cobrancas (nutricionista_id, paciente_id, descricao, valor, vencimento, status, pago_em, tipo, forma, origem,
                               meses_cobertos, parcelas_total, plano_aluno_id)
    values (v_nutri, '{pac}', 'teste wp', 83.33, '2026-01-05'::date + i * 30, 'paga', ('2026-01-05'::date + i * 30) + time '12:00',
            'mensalidade', 'manual', 'teste_wp', 1, 12, v_plano);
  end loop;
  v_res := jsonb_build_object('nums', (select jsonb_agg(parcela_num order by pago_em) from {s}.cobrancas
                                         where paciente_id = '{pac}' and origem = 'teste_wp' and deleted_at is null));
""")
    p.check(r == {"nums": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1]}, f"depois da 12ª volta à parcela 1 ({r})")
    # 3. valor do próximo pagamento: gatilho, negociado, propagação, gravação direta e o modo de hoje (B1)
    v = f"(select mensalidade_valor from {s}.pacientes where id = '{pac}')"
    r = bloco(s, pac, f"""  update {s}.pacientes set plano_aluno_id = v_plano, plano_modalidade = 'mensal' where id = '{pac}';
  v_res := v_res || jsonb_build_object('mensal', {v});
  update {s}.pacientes set plano_valor_negociado = 75 where id = '{pac}';
  v_res := v_res || jsonb_build_object('negociado', {v});
  update {s}.pacientes set plano_valor_negociado = null, plano_modalidade = 'avista' where id = '{pac}';
  v_res := v_res || jsonb_build_object('avista', {v});
  update {s}.planos_aluno set valor = 1200 where id = v_plano;
  v_res := v_res || jsonb_build_object('propagou', {v});
  update {s}.pacientes set mensalidade_valor = 1 where id = '{pac}';
  v_res := v_res || jsonb_build_object('direta', {v});
  update {s}.pacientes set plano_modalidade = null, mensalidade_valor = 50 where id = '{pac}';
  v_res := v_res || jsonb_build_object('hoje', {v}, 'negociado_some', (select plano_valor_negociado is null from {s}.pacientes where id = '{pac}'));
""")
    p.check(r == {"mensal": 83.33, "negociado": 75, "avista": 1000, "propagou": 1200, "direta": 1200, "hoje": 50, "negociado_some": True},
            f"valor: parcela 83,33 · negociado 75 · à vista 1.000 · plano a 1.200 propaga · gravação direta não descasa · modo de hoje manda ({r})")
    # 4. B2: os 2 planos do app ficaram iguais (só leitura)
    n = sql_principal(f"""select count(*)::int as n from {s}.planos_aluno pa join {s}.contas c on c.id = pa.conta_id
                           where c.origem = 'app' and (pa.meses <> 1 or pa.modalidades <> array['avista']::text[] or pa.max_parcelas_cartao is not null)""")[0]["n"]
    p.check(n == 0, f"os planos do app seguem 1 mês, à vista ({n} diferentes)")
    # 5. nada ficou gravado
    sobra = sql_principal(f"select (select count(*) from {s}.cobrancas where origem = 'teste_wp') + (select count(*) from {s}.planos_aluno where nome like 'WP teste %') as n")[0]["n"]
    p.check(sobra == 0, f"nenhuma cobrança nem plano de teste ficou gravado ({sobra})")


def regressao(s: str) -> dict:
    return _resultado(f"""do $t$
declare r record; v_total integer := 0; v_ids text[] := '{{}}';
begin
  for r in select pa.id, pa.mensalidade_pago_ate from {s}.pacientes pa
            where pa.deleted_at is null
              and (pa.mensalidade_pago_ate is not null or exists (select 1 from {s}.cobrancas c where c.paciente_id = pa.id and c.tipo = 'mensalidade'))
  loop
    v_total := v_total + 1;
    if {s}.mensalidade_recalcular(r.id) is distinct from r.mensalidade_pago_ate then v_ids := v_ids || r.id::text; end if;
  end loop;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('total', v_total, 'diferentes', cardinality(v_ids),
    'assinatura', md5(coalesce(array_to_string(array(select x from unnest(v_ids) x order by x), ','), '')))::text;
end $t$;""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    ap.add_argument("--paciente")
    ap.add_argument("--so-regressao", action="store_true")
    ap.add_argument("--guardar")
    ap.add_argument("--comparar")
    a = ap.parse_args()
    if a.so_regressao:
        r = regressao(a.schema)
        print(f"   regressão {a.schema}: {r['total']} alunos, {r['diferentes']} já diferentes do gravado")
        if a.guardar:
            Path(a.guardar).write_text(json.dumps(r))
        if a.comparar:
            antes = json.loads(Path(a.comparar).read_text())
            p.check(r == antes, f"a régua nova dá o MESMO 'pago até' que a antiga para todos ({antes} → {r})")
        return p.fim()
    if a.schema != "staging":
        raise SystemExit("os casos com escrita (desfeita) são só do staging")
    pac = a.paciente or sql_principal("""select pa.id::text as id from staging.pacientes pa join staging.contas c on c.id = pa.conta_id
        join auth.users u on u.id = pa.user_id where c.origem is distinct from 'app' and pa.deleted_at is null and pa.ativo
          and lower(u.email) like '%teste%' order by pa.created_at limit 1""")[0]["id"]
    casos("staging", pac)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
