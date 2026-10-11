#!/usr/bin/env python3
"""Physiq W1 — a InfinitePay NO BANCO (20261011200000_w1_infinitepay.sql — UMA migration; a 1ª parte na Task 5, a 2ª na 6). Staging, em
blocos que terminam com erro de propósito (nada fica gravado — o molde do e2e/wp/sql_planos.py). Os passos "como o app" usam o papel
authenticated com o sub da conta de TESTE (prof2 = dono da conta; aluno2 = aluno; admin.teste = master), como o e2e/hml01/banco.py.
Casos (m1 = a 1ª parte da migration, Task 5; m2 = a 2ª parte, Task 6):
  m1  1 modos e formas   o CHECK aceita infinitepay em contas e em cobrancas; o NSU é único por InfiniteTag (outra tag, mesmo NSU: passa);
                         o pedido do link é único (I4)
  m1  2 guarda da conta  o dono (authenticated) liga a InfinitePay SÓ com a integração ativa; sem ela a conta fica como estava
  m1  3 integração       recebimento_infinitepay_salvar: o dono grava (normalizada); o aluno → so_o_dono; InfiniteTag ruim →
                         infinitetag_invalida; flag desligada → infinitepay_em_teste; o app não lê recebimento_integracoes
  m1  4 chave Pix        recebimento_chave_ligar: 1 só ligada; o aluno não liga (chave_inexistente)
  m1  5 guarda cobrança  o app não grava forma infinitepay nem ip_* (ficam no padrão)
  m1  6 aguardando       financeiro_do_aluno: tentativa viva = aguardando; vencida = não; a avulsa vencida volta às abertas
  m1  7 master           w27_conta_linha com a InfinitePay; master_integracoes conta as contas infinitepay
  m1  8 conta encerrada  a conta cancelada perde a integração
  m2  9 fechar vencidas  mensalidade vencida sem aviso → cancelada e fora do histórico (o handle fica); com aviso pendente fica; avulsa → aberta;
                         a apagada não é tocada (MENOR 2)
  m2 10 rodada           infinitepay_rodada(): fecha as vencidas e põe no pg_net os avisos prontos (no bloco desfeito nada sai)
     11 nada ficou gravado
Uso: python3 e2e/w1/sql_w1.py [--so m1|m2|tudo]                     (staging; as escritas são desfeitas)
     python3 e2e/w1/sql_w1.py --so-catalogo --schema staging|public  (só leitura: os objetos existem — o public depois da migration)
Saída sem dado pessoal: só contagens, códigos e os valores dos casos de teste.
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
S = "staging"
DONO, ALUNO, MASTER = "prof2.teste.claude@physiqcalc.app", "aluno2.teste.claude@physiqcalc.app", "admin.teste.claude@physiqcalc.app"
COLUNAS_IP = ("ip_handle", "ip_link_url", "ip_expira_em", "ip_transaction_nsu", "ip_slug", "ip_recibo_url", "ip_valor_pago",
              "ip_parcelas", "ip_meio", "ip_conferido_em")


def _resultado(q: str) -> dict:
    try:
        sql_principal(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO<<(.*)>>", str(e), re.S)
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def como(uid: str, master: bool = False) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` (uma variável do bloco)."""
    meta = ", 'app_metadata', json_build_object('role', 'master')" if master else ""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"


def tentativa(tipo: str, expira: str, status: str = "aguardando_confirmacao", var: str = "v_c") -> str:
    """Uma tentativa da InfinitePay da matrícula de teste (como o servidor grava: forma, handle, prazo) e o link 1 dela (I4: o pedido
    `<id>-1` com a InfiniteTag e o preço)."""
    return (f"  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem,"
            f" ip_handle, ip_link_url, ip_expira_em) values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, '{status}', '{tipo}',"
            f" 'infinitepay', 'teste_w1', 'w1teste', 'https://checkout.infinitepay.io/w1teste?lenc=t', {expira}) returning id into {var};\n"
            f"  insert into {S}.infinitepay_links (pedido, cobranca_id, n, handle, centavos) values ({var}::text || '-1', {var}, 1, 'w1teste', 1000);\n")


def bloco(corpo: str) -> dict:
    return _resultado(f"""do $t$
declare v_dono uuid; v_aluno uuid; v_master uuid; v_conta uuid; v_pac uuid; v_c uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_k1 uuid; v_k2 uuid;
        v_j jsonb; v_res jsonb := '{{}}'::jsonb; v_n integer;
begin
  select u.id into v_dono from auth.users u where lower(u.email) = '{DONO}';
  select u.id into v_aluno from auth.users u where lower(u.email) = '{ALUNO}';
  select u.id into v_master from auth.users u where lower(u.email) = '{MASTER}';
  select c.id into v_conta from {S}.contas c where c.dono_id = v_dono and c.origem <> 'app' order by c.criado_em limit 1;
  select pa.id into v_pac from {S}.pacientes pa where pa.user_id = v_aluno and pa.conta_id = v_conta and pa.deleted_at is null limit 1;
  -- ponto de partida (desfeito no fim): Pix manual, sem integração, a flag ligada, nada aguardando para o aluno de teste
  update {S}.contas set recebimento_modo = 'pix_manual' where id = v_conta;
  delete from {S}.recebimento_integracoes where conta_id = v_conta;
  update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'infinitepay';
  update {S}.cobrancas set deleted_at = now() where paciente_id = v_pac and status = 'aguardando_confirmacao' and deleted_at is null;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;""")


def aguardando() -> str:
    return (f"(select (x ->> 'aguardando')::boolean from jsonb_array_elements({S}.financeiro_do_aluno()) x"
            f" where x ->> 'paciente_id' = v_pac::text)")


def casos_m1() -> None:
    # 1. modos e formas; o NSU é único por InfiniteTag
    r = bloco(f"""  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;   -- como o servidor: o CHECK aceita
  v_res := v_res || jsonb_build_object('modo', (select recebimento_modo from {S}.contas where id = v_conta));
  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem, ip_handle, ip_transaction_nsu)
  values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, 'paga', 'avulsa', 'infinitepay', 'teste_w1', 'w1teste', 'NSU-W1-1');
  begin
    insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem, ip_handle, ip_transaction_nsu)
    values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, 'paga', 'avulsa', 'infinitepay', 'teste_w1', 'w1teste', 'NSU-W1-1');
    v_res := v_res || jsonb_build_object('nsu_unico', false);
  exception when unique_violation then v_res := v_res || jsonb_build_object('nsu_unico', true);
  end;
  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, forma, origem, ip_handle, ip_transaction_nsu)
  values (v_dono, v_pac, v_conta, 'teste w1', 10, current_date, 'paga', 'avulsa', 'infinitepay', 'teste_w1', 'outra.tag', 'NSU-W1-1');
  v_res := v_res || jsonb_build_object('outra_tag', true);
""" + tentativa("avulsa", "now() + interval '1 hour'") + f"""  begin
    insert into {S}.infinitepay_links (pedido, cobranca_id, n, handle, centavos) values (v_c::text || '-1', v_c, 1, 'outra.tag', 500);
    v_res := v_res || jsonb_build_object('pedido_unico', false);
  exception when unique_violation then v_res := v_res || jsonb_build_object('pedido_unico', true);
  end;
""")
    p.check(r == {"modo": "infinitepay", "nsu_unico": True, "outra_tag": True, "pedido_unico": True},
            f"1. modo e forma infinitepay; NSU único por InfiniteTag; o pedido do link é único (I4) ({r})")

    # 2. a guarda da conta: o dono só liga a InfinitePay com a integração ativa
    r = bloco(como("v_dono") + f"""  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('sem_integracao', (select recebimento_modo from {S}.contas where id = v_conta));
  insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em) values (v_conta, 'infinitepay', 'w1teste', 'ativa', now());
""" + como("v_dono") + f"""  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('com_integracao', (select recebimento_modo from {S}.contas where id = v_conta));
""")
    p.check(r == {"sem_integracao": "pix_manual", "com_integracao": "infinitepay"}, f"2. o dono liga a InfinitePay só com a integração ativa ({r})")

    # 3. a InfiniteTag pela RPC (como a pessoa)
    r = bloco(como("v_dono") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, ' $W1Teste ');
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('dono', v_j ->> 'handle', 'gravada', (select infinitepay_handle from {S}.recebimento_integracoes
                                       where conta_id = v_conta and provedor = 'infinitepay'));
""" + como("v_aluno") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'outra');
  v_res := v_res || jsonb_build_object('aluno', v_j ->> 'erro');
  begin
    perform 1 from {S}.recebimento_integracoes limit 1;
    v_res := v_res || jsonb_build_object('app_le', true);
  exception when insufficient_privilege then v_res := v_res || jsonb_build_object('app_le', false);
  end;
""" + VOLTA + como("v_dono") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'ana personal');
  v_res := v_res || jsonb_build_object('ruim', v_j ->> 'erro');
""" + VOLTA + f"""  update {S}.app_config set valor = jsonb_build_object('liberada', false) where chave = 'infinitepay';
""" + como("v_dono") + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'w1teste');
  v_res := v_res || jsonb_build_object('flag', v_j ->> 'erro');
""" + VOLTA + como("v_master", master=True) + f"""  v_j := {S}.recebimento_infinitepay_salvar(v_conta, 'w1teste');
  v_res := v_res || jsonb_build_object('master_com_flag_desligada', v_j ->> 'ok');
""" + VOLTA)
    p.check(r == {"dono": "w1teste", "gravada": "w1teste", "aluno": "so_o_dono", "app_le": False, "ruim": "infinitetag_invalida",
                  "flag": "infinitepay_em_teste", "master_com_flag_desligada": "true"},
            f"3. a InfiniteTag: o dono grava, o aluno não, o app não lê a tabela, a flag segura o personal e não o master ({r})")

    # 4. ligar uma chave Pix desliga as outras, numa transação
    r = bloco(f"""  insert into {S}.recebimento_chaves (conta_id, tipo, chave, ativa) values (v_conta, 'email', 'w1a@teste.com', false) returning id into v_k1;
  insert into {S}.recebimento_chaves (conta_id, tipo, chave, ativa) values (v_conta, 'email', 'w1b@teste.com', false) returning id into v_k2;
""" + como("v_dono") + f"""  v_j := {S}.recebimento_chave_ligar(v_conta, v_k1, true);
  v_j := {S}.recebimento_chave_ligar(v_conta, v_k2, true);
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('ligadas', (select count(*) from {S}.recebimento_chaves where conta_id = v_conta and ativa),
                                       'a_ligada', (select id = v_k2 from {S}.recebimento_chaves where conta_id = v_conta and ativa));
""" + como("v_aluno") + f"""  v_j := {S}.recebimento_chave_ligar(v_conta, v_k1, true);
""" + VOLTA + "  v_res := v_res || jsonb_build_object('aluno', v_j ->> 'erro');\n")
    p.check(r == {"ligadas": 1, "a_ligada": True, "aluno": "chave_inexistente"}, f"4. 1 chave ligada por vez; o aluno não liga ({r})")

    # 5. o app não grava a tentativa nem a baixa
    # como o dono pela API: criado_por = ele (a policy da w02 pede — MENOR 1 da revisão; o molde do e2e/wp/api.py:722-724)
    r = bloco(como("v_dono") + f"""  insert into {S}.cobrancas (nutricionista_id, paciente_id, conta_id, criado_por, descricao, valor, vencimento, status, tipo, forma,
                             origem, ip_handle, ip_transaction_nsu, ip_recibo_url)
  values (v_dono, v_pac, v_conta, v_dono, 'teste w1 app', 10, current_date, 'aberta', 'avulsa', 'infinitepay', 'teste_w1', 'w1teste',
          'NSU-APP', 'https://recibo.infinitepay.io/x') returning id into v_c;
""" + VOLTA + f"""  v_res := v_res || (select jsonb_build_object('forma', forma, 'handle', ip_handle, 'nsu', ip_transaction_nsu, 'recibo', ip_recibo_url)
                      from {S}.cobrancas where id = v_c);
""")
    p.check(r == {"forma": None, "handle": None, "nsu": None, "recibo": None}, f"5. o app não grava forma infinitepay nem ip_* ({r})")

    # 6. a trava do inadimplente: a tentativa só conta como aguardando enquanto vale (W1-B1)
    r = bloco(tentativa("mensalidade", "now() + interval '1 hour'") + como("v_aluno")
              + f"  v_res := v_res || jsonb_build_object('viva', {aguardando()});\n" + VOLTA
              + f"  update {S}.cobrancas set ip_expira_em = now() - interval '1 minute' where id = v_c;\n" + como("v_aluno")
              + f"  v_res := v_res || jsonb_build_object('vencida', {aguardando()});\n" + VOLTA
              + tentativa("avulsa", "now() - interval '1 minute'", var="v_c2") + como("v_aluno")
              + f"""  v_res := v_res || jsonb_build_object('avulsa_aberta', exists (select 1 from jsonb_array_elements({S}.financeiro_do_aluno()) x,
                   jsonb_array_elements(x -> 'abertas') a where a ->> 'id' = v_c2::text));
""" + VOLTA)
    p.check(r == {"viva": True, "vencida": False, "avulsa_aberta": True}, f"6. aguardando só enquanto vale; a avulsa vencida volta às abertas ({r})")

    # 7. o master vê a InfinitePay
    r = bloco(f"""  insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em) values (v_conta, 'infinitepay', 'w1teste', 'ativa', now());
  update {S}.contas set recebimento_modo = 'infinitepay' where id = v_conta;
  v_res := v_res || jsonb_build_object('linha', {S}.w27_conta_linha(v_conta) -> 'infinitepay' ->> 'handle');
""" + como("v_master", master=True) + f"""  v_j := {S}.master_integracoes(0, 100);
""" + VOLTA + "  v_res := v_res || jsonb_build_object('resumo', (v_j -> 'resumo' ->> 'infinitepay')::int >= 1);\n")
    p.check(r == {"linha": "w1teste", "resumo": True}, f"7. o master vê a InfiniteTag e a contagem ({r})")

    # 8. a conta encerrada perde a integração (a InfiniteTag não fica guardada)
    r = bloco(f"""  insert into {S}.recebimento_integracoes (conta_id, provedor, infinitepay_handle, status, testado_em) values (v_conta, 'infinitepay', 'w1teste', 'ativa', now());
  update {S}.contas set situacao = 'cancelada' where id = v_conta;
  v_res := v_res || jsonb_build_object('integracoes', (select count(*) from {S}.recebimento_integracoes where conta_id = v_conta));
""")
    p.check(r == {"integracoes": 0}, f"8. conta encerrada sem integração ({r})")


def casos_m2() -> None:
    # 9. fechar as vencidas
    r = bloco(tentativa("mensalidade", "now() - interval '1 minute'")
              + tentativa("mensalidade", "now() - interval '1 minute'", var="v_c2")
              + f"  insert into {S}.infinitepay_avisos (cobranca_id, pedido, transaction_nsu, origem) values (v_c2, v_c2::text || '-1', 'NSU-PEND', 'webhook');\n"
              + tentativa("avulsa", "now() - interval '1 minute'", var="v_c3")
              + tentativa("mensalidade", "now() - interval '1 minute'", var="v_c4")
              + f"  update {S}.cobrancas set deleted_at = now() where id = v_c4;   -- apagada: não é tocada (MENOR 2)\n"
              + f"""  v_n := {S}.infinitepay_fechar_vencidas(v_pac);
  v_res := jsonb_build_object('fechadas', v_n,
    'mensalidade', (select jsonb_build_object('status', status, 'fora', deleted_at is not null, 'handle', ip_handle) from {S}.cobrancas where id = v_c),
    'com_aviso', (select status from {S}.cobrancas where id = v_c2),
    'avulsa', (select jsonb_build_object('status', status, 'forma', forma, 'handle', ip_handle, 'link', ip_link_url) from {S}.cobrancas where id = v_c3),
    'apagada', (select status from {S}.cobrancas where id = v_c4));
""")
    p.check(r == {"fechadas": 2, "mensalidade": {"status": "cancelada", "fora": True, "handle": "w1teste"}, "com_aviso": "aguardando_confirmacao",
                  "avulsa": {"status": "aberta", "forma": None, "handle": "w1teste", "link": None}, "apagada": "aguardando_confirmacao"},
            f"9. vencidas fecham; com aviso pendente fica; a apagada não é tocada; a InfiniteTag fica para a baixa atrasada ({r})")
    # 10. a rodada (no bloco desfeito o pg_net não manda nada)
    r = bloco(tentativa("mensalidade", "now() + interval '1 hour'")
              + f"""  insert into {S}.infinitepay_avisos (cobranca_id, pedido, transaction_nsu, origem, proxima_em)
  values (v_c, v_c::text || '-1', 'NSU-RODADA', 'webhook', now() - interval '1 minute');
  v_j := {S}.infinitepay_rodada();
  v_res := jsonb_build_object('reenviados', (v_j ->> 'reenviados')::int >= 1,
                              'adiada', (select proxima_em > now() from {S}.infinitepay_avisos where cobranca_id = v_c and transaction_nsu = 'NSU-RODADA'));
""")
    p.check(r == {"reenviados": True, "adiada": True}, f"10. a rodada reenvia o aviso pronto e o adia 15 min ({r})")


def sobras() -> None:
    n = sql_principal(f"""select (select count(*) from {S}.cobrancas where origem = 'teste_w1')
                               + (select count(*) from {S}.recebimento_chaves where chave like 'w1_@teste.com') as n""")[0]["n"]
    p.check(n == 0, f"11. nada ficou gravado ({n})")


def catalogo(s: str) -> None:
    """Só leitura (vale no public): o que a migration criou está lá, o app não alcança as 3 tabelas novas e o job existe."""
    colunas = sql_principal(f"""select count(*)::int as n from information_schema.columns where table_schema = '{s}' and table_name = 'cobrancas'
                                 and column_name in ({", ".join(f"'{c}'" for c in COLUNAS_IP)})""")[0]["n"]
    p.check(colunas == len(COLUNAS_IP), f"[{s}] as {len(COLUNAS_IP)} colunas ip_* em cobrancas ({colunas})")
    t = sql_principal(f"""select c.relname, c.relrowsecurity as rls, has_table_privilege('authenticated', c.oid, 'SELECT') as app_le,
                                 has_table_privilege('anon', c.oid, 'SELECT') as anon_le
                            from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = '{s}' and c.relname in ('recebimento_integracoes', 'infinitepay_avisos', 'infinitepay_links')
                           order by 1""")
    p.check(len(t) == 3 and all(x["rls"] and not x["app_le"] and not x["anon_le"] for x in t), f"[{s}] as 3 tabelas novas: RLS e só o servidor ({t})")
    f = {x["proname"] for x in sql_principal(f"""select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '{s}'
                and p.proname in ('recebimento_integracao_ativa', 'recebimento_infinitepay_salvar', 'recebimento_chave_ligar', 'cobrancas_guard_infinitepay',
                                  'contas_encerrada_sem_integracao', 'infinitepay_fechar_vencidas', 'infinitepay_rodada')""")}
    p.check(len(f) == 7, f"[{s}] as 7 funções novas ({sorted(f)})")
    job = sql_principal(f"select count(*)::int as n from cron.job where jobname = 'infinitepay-rodada-{s}'")[0]["n"]
    p.check(job == 1, f"[{s}] o pg_cron infinitepay-rodada-{s} ({job})")
    flag = sql_principal(f"select valor::text as v from {s}.app_config where chave = 'infinitepay'")
    p.check(len(flag) == 1, f"[{s}] a flag da InfinitePay existe: {flag[0]['v'] if flag else 'falta'}")
    chk = sql_principal(f"""select count(*)::int as n from pg_constraint c where c.conrelid in ('{s}.contas'::regclass, '{s}.cobrancas'::regclass)
                             and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%infinitepay%'""")[0]["n"]
    p.check(chk >= 2, f"[{s}] os CHECK de contas.recebimento_modo e cobrancas.forma aceitam infinitepay ({chk})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", default="tudo", choices=("m1", "m2", "tudo"))
    ap.add_argument("--so-catalogo", action="store_true")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    a = ap.parse_args()
    if a.so_catalogo:
        catalogo(a.schema)
        return p.fim()
    if a.schema != "staging":
        raise SystemExit("os casos com escrita (desfeita) são só do staging")
    if a.so in ("m1", "tudo"):
        casos_m1()
    if a.so in ("m2", "tudo"):
        casos_m2()
    sobras()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
