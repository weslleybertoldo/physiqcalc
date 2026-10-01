#!/usr/bin/env python3
"""Physiq W22 — a prova da FILA (o "pronto quando" da spec: "lembrete de consulta de um aluno com mensagens ligadas sai; de um com
mensagens desligadas não"), pelo enfileirador DE VERDADE (whatsapp_enfileirar, o mesmo do pg_cron) e pelo gatilho da confirmação, numa
TRANSAÇÃO DESFEITA: a instância "conectada", a config, os alunos fictícios (telefone +55 00 9…), o calendário, as consultas e as cobranças
só existem dentro dela; o bloco termina em raise (nada fica gravado; o agente do celular lê o que está gravado e nunca vê nada disto).

Casos (personal = o profissional de teste, como PERSONAL dos alunos — R7):
  A  mensagens LIGADAS, faz aniversário hoje, consulta amanhã, mensalidade (régua do Calc) vence amanhã
     → aniversário + lembrete da véspera + confirmação ao agendar + cobrança a vencer (mensalidade)
  B  mensagens DESLIGADAS, o mesmo de A → NADA
  C  ligadas, mensalidade venceu ontem e segue sem cobertura → cobrança vencida (mensalidade)
  D  ligadas, mensalidade vence amanhã mas tem comprovante AGUARDANDO confirmação → nada
  E  ligadas, mensalidade vence amanhã mas a cobrança está PAUSADA → nada
  H  ligadas, sem telefone → nada
  G  ligadas, consulta HOJE mais tarde + cobrança avulsa (a do Nutri) vence amanhã → lembrete do dia + confirmação + cobrança a vencer
Equipe (só no staging, contas da W13): o aluno M do Bruno (personal) na conta do Lucas (dono): o aniversário sai do WhatsApp do BRUNO e a
mensalidade do WhatsApp do LUCAS (quem recebe); a fila do Lucas "conta" mostra a do Bruno; a Camila (nutri) não vê; o Bruno só a dele.
Funções da tela: whatsapp_resumo, whatsapp_fila, whatsapp_reenviar (positivo e 3 negativos), whatsapp_limpar_falhas, whatsapp_salvar_config.

Uso: python3 e2e/w22/fila.py --schema staging          (produção: --schema public — só a parte do profissional, com a nutri de teste)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p, q = B.p, B.q

BLOCO = r"""
do $w22$
declare
  v_x uuid := '__X__';
  v_conta uuid := '__CONTA__';
  v_hoje date := (timezone('America/Sao_Paulo', now()))::date;
  v_amanha_meio timestamptz := ((v_hoje + 1)::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo';
  v_ontem_meio timestamptz := ((v_hoje - 1)::text || ' 12:00')::timestamp at time zone 'America/Sao_Paulo';
  v_mais_tarde timestamptz;
  v_tem_dia boolean;
  v_nasc date := make_date(1990, extract(month from v_hoje)::int, least(extract(day from v_hoje)::int, 28));
  v_aniv_hoje boolean := extract(day from v_hoje)::int <= 28;
  v_cal uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; h uuid; g uuid; m uuid;
  v_ag_b uuid;
  v_fila jsonb; v_res jsonb := '{}'::jsonb; v_enf jsonb; v_tmp jsonb; v_id uuid; v_id2 uuid;
  v_lucas uuid := '__LUCAS__'; v_bruno uuid := '__BRUNO__'; v_camila uuid := '__CAMILA__'; v_w13 uuid := '__W13__';
  v_cfg jsonb := jsonb_build_object('ativo', true, 'horario', '06:00', 'momentos', jsonb_build_object('aniversario', true, 'lembrete_vespera', true,
                   'lembrete_dia', true, 'cobranca_vencendo', true, 'cobranca_vencida', true, 'confirmacao_agendamento', true), 'textos', '{}'::jsonb);
begin
  -- trava: só conta de TESTE e nunca uma instância conectada de verdade
  if not exists (select 1 from auth.users u where u.id = v_x and u.email like '%teste.claude@%') then raise exception 'ABORTOU: não é conta de teste'; end if;
  if exists (select 1 from __S__.whatsapp_instancias w where w.nutricionista_id = v_x and w.status = 'conectado') then
    raise exception 'ABORTOU: a instância do profissional está conectada de verdade';
  end if;
  if (timezone('America/Sao_Paulo', now()))::time >= '22:30' or (timezone('America/Sao_Paulo', now()))::time < '06:05' then
    raise exception 'ABORTOU: rode entre 06:05 e 22:30 (o horário 06:00 e a consulta de hoje mais tarde)';
  end if;
  v_mais_tarde := now() + interval '60 minutes';
  v_tem_dia := (timezone('America/Sao_Paulo', v_mais_tarde))::date = v_hoje;

  -- 1. o profissional "conectado" (só nesta transação) e com as 6 automáticas ligadas a partir das 06:00
  insert into __S__.whatsapp_instancias (nutricionista_id, status, numero_conectado, conectado_em)
  values (v_x, 'conectado', '+5500900000099', now())
  on conflict (nutricionista_id) do update set status = 'conectado', numero_conectado = '+5500900000099', conectado_em = now();
  update __S__.profiles set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('whatsapp', v_cfg) where id = v_x;

  -- 2. os alunos fictícios (o profissional é o PERSONAL deles — R7), na conta dele
  insert into __S__.pacientes (nome, telefone, nascimento, personal_id, conta_id, config, mensalidade_valor, mensalidade_pago_ate)
  values ('W22 Sim A Ligado', '+5500900000101', v_nasc, v_x, v_conta, '{"mensagens_automaticas": true}', 150, v_amanha_meio) returning id into a;
  insert into __S__.pacientes (nome, telefone, nascimento, personal_id, conta_id, config, mensalidade_valor, mensalidade_pago_ate)
  values ('W22 Sim B Desligado', '+5500900000102', v_nasc, v_x, v_conta, '{"mensagens_automaticas": false}', 150, v_amanha_meio) returning id into b;
  insert into __S__.pacientes (nome, telefone, personal_id, conta_id, config, mensalidade_valor, mensalidade_pago_ate)
  values ('W22 Sim C Vencida', '+5500900000103', v_x, v_conta, '{"mensagens_automaticas": true}', 99.9, v_ontem_meio) returning id into c;
  insert into __S__.pacientes (nome, telefone, personal_id, conta_id, config, mensalidade_valor)
  values ('W22 Sim D Aguardando', '+5500900000104', v_x, v_conta, '{"mensagens_automaticas": true}', 150) returning id into d;
  insert into __S__.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo)
  values (v_x, d, v_conta, 'W22 Sim comprovante', 150, v_hoje, 'aguardando_confirmacao', 'mensalidade');
  update __S__.pacientes set mensalidade_pago_ate = v_amanha_meio where id = d;  -- depois do recálculo da cobertura (o gatilho da W6)
  insert into __S__.pacientes (nome, telefone, personal_id, conta_id, config, mensalidade_valor, mensalidade_pago_ate, cobranca_pausada)
  values ('W22 Sim E Pausada', '+5500900000105', v_x, v_conta, '{"mensagens_automaticas": true}', 150, v_amanha_meio, true) returning id into e;
  insert into __S__.pacientes (nome, telefone, nascimento, personal_id, conta_id, config, mensalidade_valor, mensalidade_pago_ate)
  values ('W22 Sim H Sem Telefone', null, v_nasc, v_x, v_conta, '{"mensagens_automaticas": true}', 150, v_amanha_meio) returning id into h;
  insert into __S__.pacientes (nome, telefone, personal_id, conta_id, config)
  values ('W22 Sim G Hoje', '+5500900000107', v_x, v_conta, '{"mensagens_automaticas": true}') returning id into g;
  insert into __S__.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, tipo, criado_por)
  values (v_x, g, v_conta, 'W22 Sim avulsa', 80, v_hoje + 1, 'aberta', 'avulsa', v_x);

  -- 3. as consultas (o gatilho da confirmação ao agendar roda no insert, com o ajuste do aluno — W14/W20)
  insert into __S__.calendarios (nutricionista_id, nome, conta_id) values (v_x, 'W22 Sim calendário', v_conta) returning id into v_cal;
  insert into __S__.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id)
  values (v_x, v_cal, a, 'W22 Sim A', v_amanha_meio - interval '2 hours', v_amanha_meio - interval '1 hour', 'treino', v_conta);
  insert into __S__.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id)
  values (v_x, v_cal, b, 'W22 Sim B', v_amanha_meio - interval '1 hour', v_amanha_meio, 'treino', v_conta) returning id into v_ag_b;
  if v_tem_dia then
    insert into __S__.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, modulo, conta_id)
    values (v_x, v_cal, g, 'W22 Sim G', v_mais_tarde, v_mais_tarde + interval '30 minutes', 'treino', v_conta);
  end if;

  -- 4. o enfileirador como o profissional (o mesmo do pg_cron, só que limitado a ele)
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_x::text, true);
  execute 'set local role authenticated';
  v_enf := __S__.whatsapp_enfileirar();
  v_enf := v_enf || jsonb_build_object('2a_rodada', (__S__.whatsapp_enfileirar() ->> 'enfileiradas')::int);  -- não repete
  execute 'reset role';

  select coalesce(jsonb_object_agg(z.nome, z.tipos), '{}'::jsonb) into v_fila from (
    select pa.nome, jsonb_agg(m2.tipo || case when m2.cobranca_id is not null then ':avulsa' when m2.tipo like 'cobranca%' then ':mensalidade' else '' end
                              order by m2.tipo) tipos
      from __S__.mensagens_whatsapp m2 join __S__.pacientes pa on pa.id = m2.paciente_id
     where m2.nutricionista_id = v_x and m2.status = 'pendente' group by pa.nome) z;
  v_res := v_res || jsonb_build_object('enfileirar', v_enf, 'fila', v_fila, 'tem_dia', v_tem_dia, 'aniv_hoje', v_aniv_hoje,
    'texto_A_vespera', (select m2.texto from __S__.mensagens_whatsapp m2 where m2.paciente_id = a and m2.tipo = 'lembrete_consulta'),
    'texto_A_mensalidade', (select m2.texto from __S__.mensagens_whatsapp m2 where m2.paciente_id = a and m2.tipo = 'cobranca_vencendo'),
    'texto_C', (select m2.texto from __S__.mensagens_whatsapp m2 where m2.paciente_id = c and m2.tipo = 'cobranca_vencida'));

  -- 5. as funções da tela, como o profissional (as linhas de histórico entram como o banco — o app nunca grava na fila)
  insert into __S__.mensagens_whatsapp (nutricionista_id, tipo, destino_e164, texto, status, erro)
  values (v_x, 'teste', '+5500900000099', 'W22 Sim teste', 'falhou', 'sessão não está aberta neste aparelho') returning id into v_id;
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_x::text, true);
  execute 'set local role authenticated';
  v_res := v_res || jsonb_build_object('resumo_antes', __S__.whatsapp_resumo(v_conta) - 'serie_enviadas' - 'agente_ping' - 'falhas_desde');
  v_res := v_res || jsonb_build_object('reenviar_teste', __S__.whatsapp_reenviar(v_id));
  -- (num comando à parte: no mesmo comando a leitura usaria a foto de antes do reenviar)
  v_res := v_res || jsonb_build_object('teste_depois', (select jsonb_build_object('status', m2.status, 'tentativas', m2.tentativas, 'erro', m2.erro,
                       'destino', m2.destino_e164) from __S__.mensagens_whatsapp m2 where m2.id = v_id));
  execute 'reset role';
  -- uma falha do aluno desligado (B) e um aniversário de ontem
  insert into __S__.mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, status, erro, referencia_dia, agendamento_id)
  values (v_x, b, 'lembrete_consulta', '+5500900000102', 'W22 Sim B', 'falhou', 'número inválido', v_hoje - 1, v_ag_b) returning id into v_id;
  insert into __S__.mensagens_whatsapp (nutricionista_id, paciente_id, tipo, destino_e164, texto, status, erro, referencia_dia)
  values (v_x, a, 'aniversario', '+5500900000101', 'W22 Sim aniv ontem', 'falhou', 'número inválido', v_hoje - 1) returning id into v_id2;
  perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_x::text, true);
  execute 'set local role authenticated';
  v_res := v_res || jsonb_build_object('reenviar_desligado', __S__.whatsapp_reenviar(v_id));
  v_res := v_res || jsonb_build_object('reenviar_aniv_ontem', __S__.whatsapp_reenviar(v_id2),
    'resumo_falhas', (__S__.whatsapp_resumo(v_conta) ->> 'falhas')::int,
    'fila_falhas', jsonb_array_length(__S__.whatsapp_fila(v_conta, 'meus', 'falhas') -> 'itens'));
  v_res := v_res || jsonb_build_object('limpar', __S__.whatsapp_limpar_falhas());
  v_res := v_res || jsonb_build_object(
    'resumo_falhas_depois_limpar', (__S__.whatsapp_resumo(v_conta) ->> 'falhas')::int,
    'fila_falhas_depois_limpar', jsonb_array_length(__S__.whatsapp_fila(v_conta, 'meus', 'falhas') -> 'itens'),
    'fila_todas', jsonb_array_length(__S__.whatsapp_fila(v_conta, 'meus', 'todas', 100) -> 'itens'),
    'fila_pagina', (select jsonb_build_object('p1', jsonb_array_length(f1 -> 'itens'), 'mais', f1 -> 'mais',
                      'p2', jsonb_array_length(__S__.whatsapp_fila(v_conta, 'meus', 'todas', 3, (f1 -> 'itens' -> 2 ->> 'criado_em')::timestamptz,
                                                                     (f1 -> 'itens' -> 2 ->> 'id')::uuid) -> 'itens'),
                      'repetidas', (select count(*) from (select jsonb_array_elements(f1 -> 'itens') ->> 'id' i
                                                          union all
                                                          select jsonb_array_elements(__S__.whatsapp_fila(v_conta, 'meus', 'todas', 3,
                                                            (f1 -> 'itens' -> 2 ->> 'criado_em')::timestamptz, (f1 -> 'itens' -> 2 ->> 'id')::uuid) -> 'itens') ->> 'id') z
                                    group by i having count(*) > 1 limit 1))
                      from (select __S__.whatsapp_fila(v_conta, 'meus', 'todas', 3) f1) z));
  v_res := v_res || jsonb_build_object(
    'salvar_config', __S__.whatsapp_salvar_config('{"ativo": "sim", "horario": "03:00", "momentos": {"aniversario": true, "inventado": true, "lembrete_dia": "x"}, "textos": {"aniversario": "  Oi {nome}  ", "lembrete_dia": ""}}'::jsonb));
  execute 'reset role';
  v_res := v_res || jsonb_build_object(
    'config_gravada', (select pr.config -> 'whatsapp' from __S__.profiles pr where pr.id = v_x),
    'config_resto', (select (pr.config ? 'whatsapp_falhas_vistas_em') from __S__.profiles pr where pr.id = v_x));

  -- 6. a equipe (P1 e "cada profissional manda o seu"), só onde as contas da W13 existem
  if v_w13 is not null and v_lucas is not null and v_bruno is not null then
    insert into __S__.whatsapp_instancias (nutricionista_id, status, numero_conectado) values (v_lucas, 'conectado', '+5500900000097')
      on conflict (nutricionista_id) do update set status = 'conectado';
    insert into __S__.whatsapp_instancias (nutricionista_id, status, numero_conectado) values (v_bruno, 'conectado', '+5500900000098')
      on conflict (nutricionista_id) do update set status = 'conectado';
    update __S__.profiles set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('whatsapp', v_cfg) where id in (v_lucas, v_bruno);
    insert into __S__.pacientes (nome, telefone, nascimento, personal_id, conta_id, config, mensalidade_valor, mensalidade_pago_ate)
    values ('W22 Sim M do Bruno', '+5500900000108', v_nasc, v_bruno, v_w13, '{"mensagens_automaticas": true}', 120, v_amanha_meio) returning id into m;
    perform set_config('request.jwt.claims', json_build_object('sub', v_lucas, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_lucas::text, true);
    execute 'set local role authenticated';
    perform __S__.whatsapp_enfileirar();
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_bruno::text, true);
    execute 'set local role authenticated';
    perform __S__.whatsapp_enfileirar();
    v_res := v_res || jsonb_build_object('bruno_meus', (select jsonb_agg(i ->> 'tipo' order by i ->> 'tipo') from jsonb_array_elements(__S__.whatsapp_fila(v_w13, 'meus', 'todas', 100) -> 'itens') i),
                                         'bruno_conta_vira_meus', __S__.whatsapp_fila(v_w13, 'conta', 'todas') ->> 'escopo');
    execute 'reset role';
    v_res := v_res || jsonb_build_object('equipe', (select jsonb_object_agg(pr.nome, z.tipos) from (
        select m2.nutricionista_id, jsonb_agg(m2.tipo order by m2.tipo) tipos from __S__.mensagens_whatsapp m2 where m2.paciente_id = m group by 1) z
        join __S__.profiles pr on pr.id = z.nutricionista_id));
    perform set_config('request.jwt.claims', json_build_object('sub', v_lucas, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_lucas::text, true);
    execute 'set local role authenticated';
    v_tmp := __S__.whatsapp_fila(v_w13, 'conta', 'todas', 100);
    v_res := v_res || jsonb_build_object('lucas_conta', jsonb_build_object('escopo', v_tmp ->> 'escopo',
        'do_bruno', (select count(*) from jsonb_array_elements(v_tmp -> 'itens') i where i -> 'autor' ->> 'id' = v_bruno::text),
        'minhas', (select count(*) from jsonb_array_elements(v_tmp -> 'itens') i where (i ->> 'minha')::boolean),
        'reenviar_do_bruno', (select bool_or((i ->> 'pode_reenviar')::boolean) from jsonb_array_elements(v_tmp -> 'itens') i where i -> 'autor' ->> 'id' = v_bruno::text)),
      'lucas_meus_do_bruno', (select count(*) from jsonb_array_elements(__S__.whatsapp_fila(v_w13, 'meus', 'todas', 100) -> 'itens') i where i -> 'autor' ->> 'id' = v_bruno::text),
      'lucas_rest_ve_do_bruno', (select count(*) from __S__.mensagens_whatsapp m2 where m2.nutricionista_id = v_bruno));
    -- o buraco da W2 fechado: o dono não grava mais na fila de um membro
    begin
      insert into __S__.mensagens_whatsapp (nutricionista_id, tipo, destino_e164, texto, conta_id, status)
      values (v_bruno, 'teste', '+5500900000098', 'W22 Sim dono grava', v_w13, 'cancelada');
      v_res := v_res || jsonb_build_object('dono_grava_na_fila', true);
    exception when others then
      v_res := v_res || jsonb_build_object('dono_grava_na_fila', false);
    end;
    execute 'reset role';
    if v_camila is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', v_camila, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', v_camila::text, true);
      execute 'set local role authenticated';
      v_res := v_res || jsonb_build_object('camila_conta', (select count(*) from jsonb_array_elements(__S__.whatsapp_fila(v_w13, 'conta', 'todas', 100) -> 'itens') i
                                                              where i -> 'autor' ->> 'id' = v_bruno::text),
                                           'camila_rest', (select count(*) from __S__.mensagens_whatsapp m2 where m2.nutricionista_id = v_bruno));
      execute 'reset role';
    end if;
  end if;

  raise exception 'RESULTADO %', v_res;
end $w22$;
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", required=True, choices=["public", "staging"])
    ap.add_argument("--profissional", default=None, help="conta de teste (padrão: prof2 no staging, nutri-legado em produção)")
    a = ap.parse_args()
    S = a.schema
    B.ESTADO["schema"] = S
    B.saude_ok("fila W22")
    prof = a.profissional or ("prof2" if S == "staging" else "nutri-legado")
    usados = [prof] + (["w13-dono", "w13-personal2", "w13-nutri"] if S == "staging" else [])
    print("instâncias por status:", json.dumps(B.instancias_por_status(), ensure_ascii=False))
    B.garantir_seguro(usados)
    x = B.uid(prof)
    conta = B.conta_prof2() if prof == "prof2" else B.conta_nutri_legado()
    w13 = B.conta_de("w13-dono", B.NOME_CONTA) if S == "staging" else None
    antes = B.sql_principal(f"select (select count(*) from {S}.mensagens_whatsapp)::int fila, (select count(*) from {S}.pacientes)::int pac, "
                            f"(select count(*) from {S}.whatsapp_instancias)::int inst, (select count(*) from {S}.agendamentos)::int ag, "
                            f"(select md5(coalesce(config::text, '')) from {S}.profiles where id = {q(x)}) cfg")[0]
    # o que JÁ está gravado (a massa das telas, por exemplo) entra nas contas do histórico
    base_x = B.sql_principal(f"select count(*)::int n from {S}.mensagens_whatsapp where nutricionista_id = {q(x)}")[0]["n"]
    base_bruno = sorted(r["tipo"] for r in B.sql_principal(f"select tipo from {S}.mensagens_whatsapp where nutricionista_id = {q(B.uid('w13-personal2'))}")) if w13 else []
    nulo = "00000000-0000-0000-0000-000000000000"
    sql = (BLOCO.replace("__S__", S).replace("__X__", x).replace("__CONTA__", conta)
           .replace("'__LUCAS__'", q(B.uid("w13-dono")) if w13 else "null").replace("'__BRUNO__'", q(B.uid("w13-personal2")) if w13 else "null")
           .replace("'__CAMILA__'", q(B.uid("w13-nutri")) if w13 else "null").replace("'__W13__'", q(w13) if w13 else "null"))
    assert nulo not in sql
    r = B.desfeito(sql)
    (B.SCRATCH / f"fila_{S}.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    fila = r["fila"]
    A, Bd, C, D, E, H, G = (fila.get(n, []) for n in ("W22 Sim A Ligado", "W22 Sim B Desligado", "W22 Sim C Vencida", "W22 Sim D Aguardando",
                                                       "W22 Sim E Pausada", "W22 Sim H Sem Telefone", "W22 Sim G Hoje"))
    esperado_a = sorted((["aniversario"] if r["aniv_hoje"] else []) + ["cobranca_vencendo:mensalidade", "confirmacao_agendamento", "lembrete_consulta"])
    p.check(sorted(A) == esperado_a, f"A (mensagens LIGADAS): {A} = {esperado_a} — o lembrete da véspera SAI (e aniversário, confirmação, mensalidade)")
    p.check(Bd == [], f"B (mensagens DESLIGADAS): nada na fila → {Bd} (nem lembrete, nem aniversário, nem confirmação, nem mensalidade)")
    p.check(C == ["cobranca_vencida:mensalidade"], f"C: mensalidade venceu ontem sem cobertura → cobrança vencida ({C})")
    p.check(D == [] and E == [] and H == [], f"D (comprovante aguardando), E (pausada), H (sem telefone) → nada ({D}, {E}, {H})")
    esperado_g = sorted(["cobranca_vencendo:avulsa"] + (["confirmacao_agendamento", "lembrete_consulta"] if r["tem_dia"] else []))
    p.check(sorted(G) == esperado_g, f"G: lembrete do DIA + confirmação + avulsa a vencer (a do Nutri) → {G} = {esperado_g}")
    p.check(r["enfileirar"].get("2a_rodada") == 0, f"o cron rodando de novo não repete nada ({r['enfileirar']})")
    tv = r.get("texto_A_vespera") or ""
    p.check(tv.startswith("Oi, W22! Passando pra lembrar da sua consulta amanhã, dia ") and "{" not in tv,
            f"texto da véspera (o padrão do banco, variáveis trocadas): {tv}")
    p.check("R$ 150,00" in (r.get("texto_A_mensalidade") or "") and "vence amanhã" in (r.get("texto_A_mensalidade") or ""),
            f"texto da mensalidade a vencer: {r.get('texto_A_mensalidade')}")
    p.check("R$ 99,90" in (r.get("texto_C") or "") and "venceu em" in (r.get("texto_C") or ""), f"texto da vencida: {r.get('texto_C')}")
    ra = r["resumo_antes"]
    p.check(ra.get("ok") is True and ra.get("pendentes", 0) >= 6 and ra.get("falhas") == 1, f"resumo: pendentes {ra.get('pendentes')}, falhas {ra.get('falhas')} (a do teste)")
    al = ra.get("alcance") or {}
    p.check(al.get("ligadas", 0) - al.get("com_telefone", 0) == -1 and al.get("alunos", 0) - al.get("com_telefone", 0) >= 1 and al.get("ligadas", 0) >= 5,
            f"alcance (os 7 fictícios: 6 com telefone, 5 deles ligados — B desligado, H sem telefone): {al}")
    p.check(r["reenviar_teste"].get("ok") is True and r["teste_depois"]["status"] == "pendente" and r["teste_depois"]["tentativas"] == 0
            and r["teste_depois"]["erro"] is None and r["teste_depois"]["destino"] == "+5500900000099",
            f"reenviar a própria falha: volta pra fila (pendente, 0 tentativas, sem erro, o número conectado) → {r['teste_depois']}")
    p.check(r["reenviar_desligado"].get("erro") == "mensagens_desligadas", f"reenviar para aluno com mensagens DESLIGADAS é recusado ({r['reenviar_desligado']})")
    p.check(r["reenviar_aniv_ontem"].get("erro") == "fora_do_dia", f"reenviar aniversário de ontem é recusado ({r['reenviar_aniv_ontem']})")
    p.check(r["resumo_falhas"] == 2 and r["fila_falhas"] == 2, f"número do menu = filtro Com falha: {r['resumo_falhas']} = {r['fila_falhas']} (as 2 que sobraram)")
    p.check(r["limpar"].get("ok") is True and r["resumo_falhas_depois_limpar"] == 0 and r["fila_falhas_depois_limpar"] == 0,
            f"Limpar falhas zera o número e o filtro ({r['resumo_falhas_depois_limpar']}, {r['fila_falhas_depois_limpar']}); o histórico continua")
    p.check(r["fila_todas"] == min(100, base_x + ra.get("pendentes", 0) + 3),
            f"o histórico (todas) lista a fila dele: {r['fila_todas']} = {base_x} já gravadas + {ra.get('pendentes')} na fila + 3 falhas")
    fp = r["fila_pagina"]
    p.check(fp["p1"] == 3 and fp["mais"] is True and fp["p2"] == 3 and not fp.get("repetidas"),
            f"página por (data, id) sem pular nem repetir linhas gravadas no mesmo instante: {fp}")
    cg = r["config_gravada"]
    p.check(r["salvar_config"].get("ok") is True and cg == {"ativo": False, "horario": "09:00", "momentos": {"aniversario": True}, "textos": {"aniversario": "Oi {nome}"}},
            f"salvar a config com lixo grava só o que vale (ativo só booleano, horário da lista, os 6 momentos): {cg}")
    p.check(r["config_resto"] is True, "o resto do config (a marca do Limpar) fica como estava")
    if "equipe" in r:
        eq = r["equipe"]
        lucas, bruno = B.NOMES.get("w13-dono", "Lucas Ferreira"), B.NOMES.get("w13-personal2", "Bruno Lima")
        p.check(eq.get(bruno) == (["aniversario"] if r["aniv_hoje"] else None) or (not r["aniv_hoje"] and bruno not in eq),
                f"equipe: o aniversário do aluno do Bruno sai do WhatsApp do BRUNO (personal) → {eq}")
        p.check(eq.get(lucas) == ["cobranca_vencendo"], f"equipe: a mensalidade sai do WhatsApp do LUCAS (dono = quem recebe) → {eq}")
        lc = r["lucas_conta"]
        p.check(lc["escopo"] == "conta" and lc["do_bruno"] >= 1 and lc["reenviar_do_bruno"] is False,
                f"o dono vê a fila da EQUIPE (a do Bruno, sem poder reenviar a dele): {lc}")
        p.check(r["lucas_meus_do_bruno"] == 0, f"na 'Minha fila' do dono não entra a do Bruno ({r['lucas_meus_do_bruno']})")
        p.check(r["dono_grava_na_fila"] is False, "o dono NÃO grava mais na fila de um membro (a política ALL da W2 virou SELECT)")
        p.check(r.get("camila_conta") == 0 and r.get("camila_rest") == 0, f"a nutri (membro) não vê a fila do Bruno ({r.get('camila_conta')}, {r.get('camila_rest')})")
        p.check(r["bruno_conta_vira_meus"] == "meus", "membro pedindo a fila da conta recebe só a dele")
        esperado_b = sorted(base_bruno + (["aniversario"] if r["aniv_hoje"] else []))
        p.check(sorted(r["bruno_meus"] or []) == esperado_b, f"a fila do Bruno: {r['bruno_meus']} = {base_bruno} já gravadas + o aniversário")
    depois = B.sql_principal(f"select (select count(*) from {S}.mensagens_whatsapp)::int fila, (select count(*) from {S}.pacientes)::int pac, "
                             f"(select count(*) from {S}.whatsapp_instancias)::int inst, (select count(*) from {S}.agendamentos)::int ag, "
                             f"(select md5(coalesce(config::text, '')) from {S}.profiles where id = {q(x)}) cfg")[0]
    p.check(antes == depois, f"transação desfeita: fila, alunos, instâncias, agenda e config iguais antes/depois ({antes} × {depois})")
    p.check(B.pendentes_de(S, [x]) == 0, "nada pendente na fila do profissional de teste")
    print("instâncias por status (depois):", json.dumps(B.instancias_por_status(S), ensure_ascii=False))
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
