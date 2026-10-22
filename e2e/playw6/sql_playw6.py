#!/usr/bin/env python3
"""Physiq play-W6 — a assinatura da Google Play no banco (20261016010000_playw6_play_billing.sql). O molde do e2e/w2/sql_w2.py e do
e2e/hml23/sql_23.py: cada caso com escrita é um bloco que termina com erro de propósito (nada fica gravado) e devolve o resultado na
mensagem do erro (RESULTADO<<json>>).

Modos:
  --foto <arquivo> [--schema S]       SÓ LEITURA: a cobertura (mensalidade_pago_ate) de TODAS as matrículas, as cobre_* de todas as
                                      mensalidades e o corpo (md5 do pg_get_functiondef) das 3 funções trocadas; no ensaio local, também
                                      as leituras do aluno (financeiro_do_aluno e meu_plano_app de cada login, sem a chave nova 'play').
                                      No staging e no local, + a cobertura RECALCULADA pelo corpo de antes num bloco desfeito (nada fica
                                      gravado; o public nunca). O arquivo fica FORA do repo (só ids e números).
  --comparar <arquivo> [--schema S]   a mesma foto de novo + a cobertura RECALCULADA de todas as matrículas num bloco desfeito, comparadas
                                      com a foto (com a RECALCULADA da foto, quando ela tem: o corpo novo × o de antes): sem linha da Play,
                                      IGUAL (diferença = falha). --funcoes-iguais: os 3 corpos também iguais
                                      letra por letra (depois da reversa). Só staging ou local (o public nunca recebe o bloco).
  --so-catalogo [--schema S]          SÓ LEITURA (vale no public): a tabela com RLS e sem policy, os grants (o app e o visitante não leem
                                      nem gravam; só o service_role executa a play_aplicar), os gatilhos, a forma no CHECK, o índice do
                                      pedido e a trava play_billing (false no public, true no staging); a rotina de hora em hora (22/10):
                                      o play_conferir_disparar só do servidor, o job play-conferir-<schema> no minuto 25 e o marcador
                                      play_conferir (não público). O staging tem a versão de 16/10 até reaplicar (F4): lá, a rotina falha.
  (sem modo)                          os casos — SÓ no ensaio local (PHYSIQ_SQL_LOCAL; a massa sintética do
                                      ~/projetos/physiqcalc-scratch/hml/playw6/ferramentas/massa_playw6.sql):
   1 estados        cada estado do Google → o nosso: ativa, cancelada e carência cobrem até o expira_em; pendente, suspensa, pausada,
                    expirada e revogada não (a matrícula vencida segue vencida)
   2 renovação      a compra (1 cobrança google_play paga, do recebedor da conta do app, sem cobre_*) e a renovação (+1 cobrança, a
                    cobertura anda); o mesmo aviso 2× = nada novo
   3 carência       a carência estende o expira_em (cobre); a suspensão trava
   4 cancelada      cancelada vale até o fim (cancelada_por google); expirada trava
   5 troca          upgrade: a anterior 'substituida', o plano da matrícula vira o completo na hora; downgrade: o plano fica até a
                    renovação; o aviso velho da substituída não a ressuscita
   6 devolução      o pedido devolvido vira 'cancelada' + reembolsado_em; revogada trava (volta a cobertura de antes)
   7 defer          a 1ª compra no teste ou com o mês do MP guarda adiar_ate (a cobertura de antes); vencida, não; na troca, não; o
                    adiada marca 1 vez
   8 teste Google   a compra de TESTE do Google: a assinatura (teste=true) cobre, sem cobrança
   9 1 viva         outra compra viva sem ligação → outra_viva (nada muda); a cancelada vencida não segura a vaga
  10 erros          token de outra matrícula, matrícula de profissional, produto, entrada inválida, matrícula inexistente
  11 encerrada      a matrícula encerrada registra (sem trocar o plano)
  12 RLS/grants     anon e authenticated: sem SELECT/INSERT na play_assinaturas e sem EXECUTE na play_aplicar; service_role executa
  13 guarda         o app cria cobrança 'google_play' → nasce comum (sem forma nem pedido); numa linha da Play o UPDATE do app não muda nada
  14 leituras       financeiro_do_aluno e meu_plano_app com a Play viva: 'play' {estado, renova, expira_em, produto}, sem token nem pedido
  15 gatilho        apagar a assinatura recalcula a cobertura
  16 vencida        a cancelada que já venceu fora das leituras do aluno (a revisão, 🟡3); a cancelada no prazo continua
  17 rotina         a conferência de hora em hora (22/10/2026, no lugar do RTDN): o play_conferir_disparar() sem assinatura da Play não
                    chama; sem o segredo do Vault (ou curto) não chama; com os 2, 1 pedido do pg_net para a play-conferir com o schema, o
                    x-espelho-segredo e 120 s; o job play-conferir-<schema> no minuto 25; o marcador play_conferir no app_config (não
                    público; a migration não pisa no que a função gravou)
Uso: python3 e2e/playw6/sql_playw6.py [--casos 1,2,…] [--schema staging|public]   (local)
     python3 e2e/playw6/sql_playw6.py --foto <arq> | --comparar <arq> [--funcoes-iguais] | --so-catalogo  [--schema …]
Saída sem dado pessoal: só contagens, códigos, estados e booleanos (nenhum id, token ou pedido).
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
FUNCOES = ("mensalidade_recalcular", "financeiro_do_aluno", "meu_plano_app")
# a massa sintética do PG local (massa_playw6.sql): staging = c1…, public = c2…
SUFIXO = {"A1": "11", "A2": "12", "A3": "13", "A4": "14", "A5": "15", "A6": "16", "A7": "17", "S1": "21", "S2": "22"}
PROF = "b0000000-0000-4000-8000-000000000002"
MESTRE = "b0000000-0000-4000-8000-000000000001"


def sql(texto: str, s: str) -> str:
    """Troca @S@ pelo schema e @A1@… pelos ids da massa local."""
    pre = "c1000000" if s == "staging" else "c2000000"
    for nome, suf in SUFIXO.items():
        texto = texto.replace(f"@{nome}@", f"{pre}-0000-4000-8000-0000000000{suf}")
    return texto.replace("@S@", s).replace("@PROF@", PROF).replace("@MESTRE@", MESTRE)


def epoca(campo: str) -> str:
    return f"case when {campo} is null then null else extract(epoch from {campo})::numeric(20,6)::text end"


# ───────────────────────── a foto (só leitura) ─────────────────────────
def foto(s: str) -> dict:
    pac = B.ler(f"select p.id::text as id, {epoca('p.mensalidade_pago_ate')} as v from {s}.pacientes p")
    cob = B.ler(f"select c.id::text as id, {epoca('c.cobre_de')} as de, {epoca('c.cobre_ate')} as ate, c.parcela_num as n "
                f"from {s}.cobrancas c where c.tipo = 'mensalidade'")
    fun = B.ler("select pr.proname as nome, md5(pg_get_functiondef(pr.oid)) as md5 from pg_proc pr "
                f"join pg_namespace n on n.oid = pr.pronamespace where n.nspname = '{s}' and pr.proname in "
                f"({', '.join(repr(f) for f in FUNCOES)})")
    saida = {"schema": s, "pacientes": {r["id"]: r["v"] for r in pac},
             "cobrancas": {r["id"]: [r["de"], r["ate"], r["n"]] for r in cob},
             "funcoes": {r["nome"]: r["md5"] for r in fun}}
    if B.LOCAL:
        saida["leituras"] = leituras(s)
    return saida


def leituras(s: str) -> dict:
    """As leituras do aluno de cada login (financeiro_do_aluno e meu_plano_app, sem a chave nova 'play') — só no ensaio local."""
    return B.resultado(sql("""
do $l$
declare
  r record;
  v jsonb := '{}'::jsonb;
  f jsonb;
  m jsonb;
begin
  for r in select distinct p.user_id from @S@.pacientes p where p.user_id is not null loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', r.user_id, 'role', 'authenticated')::text, true);
    f := @S@.financeiro_do_aluno();
    m := @S@.meu_plano_app();
    v := v || jsonb_build_object(r.user_id::text, jsonb_build_object(
      'fin', md5(coalesce((select jsonb_agg(e.x - 'play' order by e.o) from jsonb_array_elements(f) with ordinality as e(x, o)), '[]'::jsonb)::text),
      'plano', md5((m #- '{matricula,play}')::text),
      'com_play', (select count(*) from jsonb_array_elements(f) e where e ? 'play' and e -> 'play' <> 'null'::jsonb)
                  + case when jsonb_typeof(m -> 'matricula') = 'object' and m -> 'matricula' ? 'play'
                              and m -> 'matricula' -> 'play' <> 'null'::jsonb then 1 else 0 end));
  end loop;
  raise exception 'RESULTADO<<%>>', v::text;
end $l$;""", s))


def recalculada(s: str) -> dict:
    """A cobertura de todas as matrículas recalculada pelo corpo em vigor, num bloco DESFEITO (nada fica gravado)."""
    return B.resultado(sql(f"""
do $r$
declare
  r record;
begin
  for r in select p.id from @S@.pacientes p loop
    perform @S@.mensalidade_recalcular(r.id);
  end loop;
  raise exception 'RESULTADO<<%>>', jsonb_build_object(
    'pacientes', (select coalesce(jsonb_object_agg(p.id::text, {epoca('p.mensalidade_pago_ate')}), '{{}}'::jsonb) from @S@.pacientes p),
    'cobrancas', (select coalesce(jsonb_object_agg(c.id::text, jsonb_build_array({epoca('c.cobre_de')}, {epoca('c.cobre_ate')}, c.parcela_num)),
                                  '{{}}'::jsonb) from @S@.cobrancas c where c.tipo = 'mensalidade'))::text;
end $r$;""", s))


def diferencas(a: dict, b: dict) -> int:
    return sum(1 for k in set(a) | set(b) if a.get(k) != b.get(k))


def comparar(arquivo: Path, s: str, funcoes_iguais: bool) -> None:
    antes = json.loads(arquivo.read_text(encoding="utf-8"))
    if antes.get("schema") != s:
        raise SystemExit(f"a foto é do schema {antes.get('schema')}, não do {s}")
    agora = foto(s)
    n = len(antes["pacientes"])
    P.check(n > 0 and set(antes["pacientes"]) == set(agora["pacientes"]),
            f"[{s}] as mesmas {n} matrículas da foto (nenhuma entrou nem saiu)")
    d = diferencas(antes["pacientes"], agora["pacientes"])
    P.check(d == 0, f"[{s}] a cobertura (mensalidade_pago_ate) das {n} matrículas IGUAL à da foto ({d} diferente(s))")
    d = diferencas(antes["cobrancas"], agora["cobrancas"])
    P.check(d == 0, f"[{s}] as cobre_de/cobre_ate/parcela_num das {len(antes['cobrancas'])} mensalidades IGUAIS ({d} diferente(s))")
    rec = recalculada(s)
    base = antes.get("recalculada")
    if base:
        # a foto guardou a RECALCULADA pelo corpo de ANTES (bloco desfeito): a de agora (o corpo novo) tem de dar o MESMO em todas — a
        # prova de que a migration não muda a cobertura sem linha da Play, mesmo onde a gravada já não batia com o recálculo (isso é de
        # antes da migration: as mesmas matrículas, o mesmo valor)
        d = diferencas(base["pacientes"], rec["pacientes"])
        P.check(d == 0, f"[{s}] RECALCULADA pelo corpo em vigor = a RECALCULADA pelo corpo de antes (a da foto): a cobertura das {n} IGUAL "
                        f"({d} diferente(s))")
        d = diferencas(base["cobrancas"], rec["cobrancas"])
        P.check(d == 0, f"[{s}] RECALCULADA: as cobre_*/parcela_num das mensalidades IGUAIS às do corpo de antes ({d} diferente(s))")
        ja = {k for k in set(antes["pacientes"]) | set(base["pacientes"]) if antes["pacientes"].get(k) != base["pacientes"].get(k)}
        agora_dif = {k for k in set(antes["pacientes"]) | set(rec["pacientes"]) if antes["pacientes"].get(k) != rec["pacientes"].get(k)}
        P.check(agora_dif == ja, f"[{s}] a gravada × a recalculada: {len(agora_dif)} diferente(s) — as MESMAS {len(ja)} de antes da migration "
                                 f"(gravadas que já não batiam com o recálculo do corpo de antes)")
    else:
        d = diferencas(antes["pacientes"], rec["pacientes"])
        P.check(d == 0, f"[{s}] RECALCULADA pelo corpo em vigor (bloco desfeito): a cobertura das {n} IGUAL à da foto ({d} diferente(s))")
        d = diferencas(antes["cobrancas"], {k: v for k, v in rec["cobrancas"].items()})
        P.check(d == 0, f"[{s}] RECALCULADA: as cobre_*/parcela_num das mensalidades IGUAIS ({d} diferente(s))")
    trocadas = sorted(f for f in FUNCOES if antes["funcoes"].get(f) != agora["funcoes"].get(f))
    if funcoes_iguais:
        P.check(not trocadas and len(agora["funcoes"]) == 3,
                f"[{s}] os corpos das 3 funções IGUAIS aos da foto, letra por letra (diferentes: {trocadas or 'nenhum'})")
    else:
        print(f"   [{s}] os corpos trocados desde a foto: {trocadas or 'nenhum'}", flush=True)
    if "leituras" in antes and "leituras" in agora:
        a, b = antes["leituras"], agora["leituras"]
        iguais = sum(1 for k in a if k in b and a[k]["fin"] == b[k]["fin"] and a[k]["plano"] == b[k]["plano"])
        P.check(set(a) == set(b) and iguais == len(a),
                f"[{s}] as leituras do aluno (financeiro_do_aluno e meu_plano_app, sem a chave nova) de {len(a)} logins IGUAIS ({iguais}/{len(a)})")
        P.check(sum(int(x["com_play"]) for x in b.values()) == 0, f"[{s}] nenhuma leitura com 'play' preenchido (nenhuma linha da Play)")


# ───────────────────────── o catálogo (só leitura) ─────────────────────────
def catalogo(s: str) -> None:
    r = B.ler(f"""
select
  (select c.relrowsecurity from pg_class c where c.oid = to_regclass('{s}.play_assinaturas')) as rls,
  (select count(*) from pg_policy pl where pl.polrelid = to_regclass('{s}.play_assinaturas')) as policies,
  has_table_privilege('anon', '{s}.play_assinaturas', 'select, insert, update, delete') as anon_tab,
  has_table_privilege('authenticated', '{s}.play_assinaturas', 'select, insert, update, delete') as auth_tab,
  has_table_privilege('service_role', '{s}.play_assinaturas', 'select, insert, update, delete') as srv_tab,
  (select pr.prosecdef from pg_proc pr where pr.oid = to_regprocedure('{s}.play_aplicar(jsonb)')) as definer,
  (select coalesce(pr.proconfig, '{{}}') @> array['search_path=""'] from pg_proc pr where pr.oid = to_regprocedure('{s}.play_aplicar(jsonb)')) as caminho,
  has_function_privilege('anon', '{s}.play_aplicar(jsonb)', 'execute') as anon_fn,
  has_function_privilege('authenticated', '{s}.play_aplicar(jsonb)', 'execute') as auth_fn,
  has_function_privilege('service_role', '{s}.play_aplicar(jsonb)', 'execute') as srv_fn,
  (select count(*) from pg_trigger t where t.tgrelid = to_regclass('{s}.play_assinaturas') and t.tgname = 'trg_play_assinaturas_recalcular') as trg_play,
  (select count(*) from pg_trigger t where t.tgrelid = to_regclass('{s}.cobrancas') and t.tgname = 'trg_cobrancas_guard_play') as trg_guarda,
  (select pg_get_constraintdef(c.oid) like '%google_play%' from pg_constraint c where c.conrelid = to_regclass('{s}.cobrancas')
      and c.conname = 'cobrancas_forma_check') as forma,
  (select count(*) from pg_indexes i where i.schemaname = '{s}' and i.tablename = 'cobrancas' and i.indexname = 'cobrancas_play_pedido_uq') as idx_pedido,
  (select count(*) from pg_indexes i where i.schemaname = '{s}' and i.tablename = 'play_assinaturas' and i.indexname = 'play_assinaturas_viva_uq') as idx_viva,
  (select a.valor ->> 'liberada' from {s}.app_config a where a.chave = 'play_billing') as trava,
  (select a.publica from {s}.app_config a where a.chave = 'play_billing') as trava_publica,
  (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace where n.nspname = '{s}'
      and pr.proname in ('mensalidade_recalcular', 'financeiro_do_aluno', 'meu_plano_app') and pr.prosrc like '%play_assinaturas%') as leem_play,
  (select pr.prosecdef and coalesce(pr.proconfig, '{{}}') @> array['search_path=""'] from pg_proc pr
    where pr.oid = to_regprocedure('{s}.play_conferir_disparar()')) as disparo_definer,
  has_function_privilege('anon', to_regprocedure('{s}.play_conferir_disparar()'), 'execute') as anon_disparo,
  has_function_privilege('authenticated', to_regprocedure('{s}.play_conferir_disparar()'), 'execute') as auth_disparo,
  has_function_privilege('service_role', to_regprocedure('{s}.play_conferir_disparar()'), 'execute') as srv_disparo,
  (select count(*) from cron.job j where j.jobname = 'play-conferir-{s}' and j.schedule = '25 * * * *'
      and j.command = 'select {s}.play_conferir_disparar()') as job,
  (select count(*) from {s}.app_config a where a.chave = 'play_conferir' and not a.publica) as marca
""")[0]
    P.check(r["rls"] is True and r["policies"] == 0, f"[{s}] play_assinaturas com RLS ligado e SEM policy")
    P.check(r["anon_tab"] is False and r["auth_tab"] is False and r["srv_tab"] is True,
            f"[{s}] play_assinaturas: o visitante e o app sem acesso; o service_role com")
    P.check(r["definer"] is True and r["caminho"] is True, f"[{s}] play_aplicar SECURITY DEFINER com o search_path vazio")
    P.check(r["anon_fn"] is False and r["auth_fn"] is False and r["srv_fn"] is True, f"[{s}] play_aplicar: só o service_role executa")
    P.check(r["trg_play"] == 1 and r["trg_guarda"] == 1, f"[{s}] os 2 gatilhos (a cobertura da Play e a guarda das cobranças)")
    P.check(r["forma"] is True and r["idx_pedido"] == 1 and r["idx_viva"] == 1,
            f"[{s}] a forma google_play no CHECK, o índice único do pedido e o de 1 viva por matrícula")
    esperado = "true" if s == "staging" else "false"
    P.check(r["trava"] == esperado and r["trava_publica"] is False, f"[{s}] a trava play_billing liberada = {r['trava']} (esperado {esperado}), não pública")
    P.check(r["leem_play"] == 3, f"[{s}] as 3 funções trocadas leem a play_assinaturas ({r['leem_play']}/3)")
    # a rotina de hora em hora (22/10/2026, no lugar do aviso do Google pelo Pub/Sub)
    P.check(r["disparo_definer"] is True and r["anon_disparo"] is False and r["auth_disparo"] is False and r["srv_disparo"] is True,
            f"[{s}] play_conferir_disparar SECURITY DEFINER com o search_path vazio; só o service_role executa")
    P.check(r["job"] == 1, f"[{s}] o job play-conferir-{s} de hora em hora no minuto 25 ({r['job']})")
    P.check(r["marca"] == 1, f"[{s}] o marcador play_conferir no app_config, não público ({r['marca']})")


# ───────────────────────── os casos (blocos desfeitos; só no ensaio local) ─────────────────────────
APLICAR = "@S@.play_aplicar(jsonb_strip_nulls(jsonb_build_object({})))"


def ap(*pares: str) -> str:
    return APLICAR.format(", ".join(pares))


def caso(numero: int, corpo: str, s: str) -> dict:
    return B.resultado(sql(f"do $c{numero}$\n{corpo}\nend $c{numero}$;", s))


def casos(s: str, quais: set[int]) -> None:
    if 1 in quais:
        r = caso(1, f"""
declare
  a5 uuid := '@A5@';
  base timestamptz;
  pago timestamptz;
  e text;
  o jsonb;
  res jsonb := '{{}}'::jsonb;
begin
  select mensalidade_pago_ate into base from @S@.pacientes where id = a5;
  foreach e in array array['pendente', 'ativa', 'cancelada', 'carencia', 'suspensa', 'pausada', 'expirada', 'revogada'] loop
    begin
      o := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c1-' || e", "'produto', 'app_treino'", "'estado', e",
               "'expira_em', now() + interval '20 days'", "'renova', e in ('ativa', 'carencia')")};
      select mensalidade_pago_ate into pago from @S@.pacientes where id = a5;
      res := res || jsonb_build_object(e, jsonb_build_object('ok', o -> 'ok', 'estado', o ->> 'estado',
                                                             'cobre', pago = now() + interval '20 days', 'igual', pago is not distinct from base));
      raise exception 'desfaz';
    exception when others then
      if sqlerrm <> 'desfaz' then res := res || jsonb_build_object(e, sqlerrm); end if;
    end;
  end loop;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('vencida', base < now(), 'r', res)::text;""", s)
        P.check(r.get("vencida") is True, f"[{s}] 1 a matrícula de partida está vencida")
        for e in ("ativa", "cancelada", "carencia"):
            x = r["r"].get(e, {})
            P.check(isinstance(x, dict) and x.get("ok") is True and x.get("estado") == e and x.get("cobre") is True,
                    f"[{s}] 1 {e} → cobre até o expira_em")
        for e in ("pendente", "suspensa", "pausada", "expirada", "revogada"):
            x = r["r"].get(e, {})
            P.check(isinstance(x, dict) and x.get("ok") is True and x.get("estado") == e and x.get("igual") is True,
                    f"[{s}] 1 {e} → não cobre (segue vencida)")

    if 2 in quais:
        r = caso(2, f"""
declare
  a5 uuid := '@A5@';
  e1 timestamptz := now() + interval '30 days';
  o1 jsonb; o2 jsonb; o3 jsonb;
  pago timestamptz;
  n_cob integer; n_ass integer; certo integer;
begin
  o1 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c2'", "'produto', 'app_treino'", "'plano_base', 'mensal'", "'estado', 'ativa'",
            "'expira_em', e1", "'renova', true", "'reconhecida', true", "'pedido', 'GPA.PLAYW6-E2E-2'", "'valor', 29.9",
            "'pago_em', now() - interval '1 minute'")};
  o2 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c2'", "'produto', 'app_treino'", "'plano_base', 'mensal'", "'estado', 'ativa'",
            "'expira_em', e1", "'renova', true", "'reconhecida', true", "'pedido', 'GPA.PLAYW6-E2E-2'", "'valor', 29.9")};
  select count(*) into n_cob from @S@.cobrancas where paciente_id = a5 and forma = 'google_play';
  select count(*) into n_ass from @S@.play_assinaturas where paciente_id = a5;
  select count(*) into certo from @S@.cobrancas c join @S@.contas ct on ct.id = c.conta_id
   where c.paciente_id = a5 and c.forma = 'google_play' and c.status = 'paga' and c.valor = 29.90 and c.tipo = 'mensalidade'
     and c.meses_cobertos = 1 and c.cobre_de is null and c.nutricionista_id = ct.dono_id and ct.origem = 'app' and c.play_pedido is not null;
  o3 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c2'", "'produto', 'app_treino'", "'estado', 'ativa'",
            "'expira_em', e1 + interval '30 days'", "'renova', true", "'reconhecida', true", "'pedido', 'GPA.PLAYW6-E2E-2..0'", "'valor', 29.9")};
  select mensalidade_pago_ate into pago from @S@.pacientes where id = a5;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('c1', o1 ->> 'cobranca', 'c2', o2 ->> 'cobranca', 'n_cob_1', n_cob, 'n_ass', n_ass,
    'certo', certo, 'c3', o3 ->> 'cobranca', 'n_cob_2', (select count(*) from @S@.cobrancas where paciente_id = a5 and forma = 'google_play'),
    'anda', pago = e1 + interval '30 days', 'reconhecida', (o1 ->> 'reconhecida_em') is not null)::text;""", s)
        P.check(r["c1"] == "nova" and r["certo"] == 1 and r["reconhecida"] is True,
                f"[{s}] 2 a compra: 1 cobrança google_play paga (29,90, 1 mês, sem cobre_*, do recebedor da conta do app) e reconhecida_em")
        P.check(r["c2"] == "ja_tinha" and r["n_cob_1"] == 1 and r["n_ass"] == 1, f"[{s}] 2 o mesmo aviso 2× = nada novo (1 cobrança, 1 assinatura)")
        P.check(r["c3"] == "nova" and r["n_cob_2"] == 2 and r["anda"] is True, f"[{s}] 2 a renovação: +1 cobrança e a cobertura anda")

    if 3 in quais:
        r = caso(3, f"""
declare
  a5 uuid := '@A5@';
  base timestamptz;
  e1 timestamptz := now() + interval '1 hour';
  p1 timestamptz; p2 timestamptz;
begin
  select mensalidade_pago_ate into base from @S@.pacientes where id = a5;
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c3'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', e1", "'renova', true")};
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c3'", "'produto', 'app_treino'", "'estado', 'carencia'", "'expira_em', e1 + interval '3 days'", "'renova', true")};
  select mensalidade_pago_ate into p1 from @S@.pacientes where id = a5;
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c3'", "'produto', 'app_treino'", "'estado', 'suspensa'", "'expira_em', e1", "'renova', true")};
  select mensalidade_pago_ate into p2 from @S@.pacientes where id = a5;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('carencia', p1 = e1 + interval '3 days', 'suspensa', p2 is not distinct from base)::text;""", s)
        P.check(r["carencia"] is True, f"[{s}] 3 a carência (o Google estende o expira_em) cobre")
        P.check(r["suspensa"] is True, f"[{s}] 3 a suspensão (ON_HOLD) trava: volta a cobertura de antes")

    if 4 in quais:
        r = caso(4, f"""
declare
  a5 uuid := '@A5@';
  base timestamptz;
  e1 timestamptz := now() + interval '10 days';
  p1 timestamptz; p2 timestamptz; por text;
begin
  select mensalidade_pago_ate into base from @S@.pacientes where id = a5;
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c4'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', e1", "'renova', true")};
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c4'", "'produto', 'app_treino'", "'estado', 'cancelada'", "'expira_em', e1", "'renova', false")};
  select mensalidade_pago_ate into p1 from @S@.pacientes where id = a5;
  select cancelada_por into por from @S@.play_assinaturas where token = 'playw6-e2e-c4';
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c4'", "'produto', 'app_treino'", "'estado', 'expirada'", "'expira_em', now() - interval '1 minute'")};
  select mensalidade_pago_ate into p2 from @S@.pacientes where id = a5;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('ate_o_fim', p1 = e1, 'por', por, 'expirada', p2 is not distinct from base)::text;""", s)
        P.check(r["ate_o_fim"] is True and r["por"] == "google", f"[{s}] 4 cancelada vale até o fim (cancelada_por = google)")
        P.check(r["expirada"] is True, f"[{s}] 4 expirada trava")

    if 5 in quais:
        r = caso(5, f"""
declare
  a7 uuid := '@A7@';
  e1 timestamptz := now() + interval '30 days';
  o2 jsonb; o3 jsonb; o4 jsonb;
  t1 text; t2 text; p_up text; v_up numeric; p_down text; p_ren text; mod_up text[]; adiar2 timestamptz;
begin
  perform {ap("'paciente_id', a7", "'token', 'playw6-e2e-c5-t1'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', e1", "'renova', true")};
  o2 := {ap("'paciente_id', a7", "'token', 'playw6-e2e-c5-t2'", "'token_anterior', 'playw6-e2e-c5-t1'", "'produto', 'app_treino_alimentacao'",
            "'estado', 'ativa'", "'expira_em', e1", "'renova', true")};
  select estado into t1 from @S@.play_assinaturas where token = 'playw6-e2e-c5-t1';
  select pa.codigo, p.mensalidade_valor, pa.modulos into p_up, v_up, mod_up from @S@.pacientes p join @S@.planos_aluno pa on pa.id = p.plano_aluno_id where p.id = a7;
  select adiar_ate into adiar2 from @S@.play_assinaturas where token = 'playw6-e2e-c5-t2';
  -- downgrade na renovação: o token novo chega com o produto VIGENTE (o completo) até renovar
  o3 := {ap("'paciente_id', a7", "'token', 'playw6-e2e-c5-t3'", "'token_anterior', 'playw6-e2e-c5-t2'", "'produto', 'app_treino_alimentacao'",
            "'estado', 'ativa'", "'expira_em', e1", "'renova', true")};
  select estado into t2 from @S@.play_assinaturas where token = 'playw6-e2e-c5-t2';
  select pa.codigo into p_down from @S@.pacientes p join @S@.planos_aluno pa on pa.id = p.plano_aluno_id where p.id = a7;
  o4 := {ap("'paciente_id', a7", "'token', 'playw6-e2e-c5-t3'", "'produto', 'app_treino'", "'estado', 'ativa'",
            "'expira_em', e1 + interval '30 days'", "'renova', true")};
  select pa.codigo into p_ren from @S@.pacientes p join @S@.planos_aluno pa on pa.id = p.plano_aluno_id where p.id = a7;
  -- o aviso velho da substituída (EXPIRED) não a ressuscita
  perform {ap("'paciente_id', a7", "'token', 'playw6-e2e-c5-t1'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', e1", "'renova', true")};
  raise exception 'RESULTADO<<%>>', jsonb_build_object('ok2', o2 -> 'ok', 't1', t1, 'up', p_up, 'valor_up', v_up,
    'mod_up', to_jsonb(mod_up), 'adiar2', adiar2 is null, 'ok3', o3 -> 'ok', 't2', t2, 'down', p_down, 'ok4', o4 -> 'ok', 'ren', p_ren,
    't1_fim', (select estado from @S@.play_assinaturas where token = 'playw6-e2e-c5-t1'),
    'vivas', (select count(*) from @S@.play_assinaturas where paciente_id = a7 and estado in ('pendente','ativa','cancelada','carencia','suspensa','pausada')))::text;""", s)
        P.check(r["ok2"] is True and r["t1"] == "substituida" and r["up"] == "app_treino_alimentacao" and float(r["valor_up"]) == 49.9
                and sorted(r["mod_up"]) == ["nutricao", "treino"],
                f"[{s}] 5 upgrade: a anterior 'substituida' e o plano vira o completo na hora (49,90; treino + nutrição)")
        P.check(r["adiar2"] is True, f"[{s}] 5 a troca (com ligação) não guarda adiar_ate")
        P.check(r["ok3"] is True and r["t2"] == "substituida" and r["down"] == "app_treino_alimentacao",
                f"[{s}] 5 downgrade: o plano fica o completo até a renovação")
        P.check(r["ok4"] is True and r["ren"] == "app_treino", f"[{s}] 5 na renovação o plano vira o Treino")
        P.check(r["t1_fim"] == "substituida" and r["vivas"] == 1, f"[{s}] 5 o aviso velho não ressuscita a substituída (1 viva)")

    if 6 in quais:
        r = caso(6, f"""
declare
  a2 uuid := '@A2@';
  base timestamptz;
  o jsonb;
  p2 timestamptz;
begin
  select mensalidade_pago_ate into base from @S@.pacientes where id = a2;
  perform {ap("'paciente_id', a2", "'token', 'playw6-e2e-c6'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '60 days'",
              "'renova', true", "'pedido', 'GPA.PLAYW6-E2E-6'", "'valor', 29.9")};
  o := {ap("'paciente_id', a2", "'token', 'playw6-e2e-c6'", "'produto', 'app_treino'", "'estado', 'revogada'", "'expira_em', now()",
           "'renova', false", "'devolvido_pedido', 'GPA.PLAYW6-E2E-6'")};
  select mensalidade_pago_ate into p2 from @S@.pacientes where id = a2;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('devolvidas', o -> 'devolvidas',
    'cancelada', (select count(*) from @S@.cobrancas where play_pedido = 'GPA.PLAYW6-E2E-6' and status = 'cancelada' and reembolsado_em is not null),
    'volta', p2 is not distinct from base, 'base_coberta', base > now())::text;""", s)
        P.check(r["devolvidas"] == 1 and r["cancelada"] == 1, f"[{s}] 6 a devolução: a cobrança do pedido vira 'cancelada' + reembolsado_em")
        P.check(r["volta"] is True and r["base_coberta"] is True, f"[{s}] 6 revogada trava a Play: volta a cobertura de antes (o mês do MP)")

    if 7 in quais:
        r = caso(7, f"""
declare
  a1 uuid := '@A1@'; a2 uuid := '@A2@'; a5 uuid := '@A5@';
  t_a1 timestamptz; c_a2 timestamptz;
  o1 jsonb; o1b jsonb; o1c jsonb; o2 jsonb; o5 jsonb;
  p1 timestamptz;
begin
  select app_teste_ate into t_a1 from @S@.pacientes where id = a1;
  select mensalidade_pago_ate into c_a2 from @S@.pacientes where id = a2;
  o1 := {ap("'paciente_id', a1", "'token', 'playw6-e2e-c7-a1'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  o1b := {ap("'paciente_id', a1", "'token', 'playw6-e2e-c7-a1'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '36 days'",
             "'renova', true", "'adiada', true")};
  select mensalidade_pago_ate into p1 from @S@.pacientes where id = a1;
  o1c := {ap("'paciente_id', a1", "'token', 'playw6-e2e-c7-a1'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '36 days'",
             "'renova', true", "'adiada', true")};
  o2 := {ap("'paciente_id', a2", "'token', 'playw6-e2e-c7-a2'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  o5 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c7-a5'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  raise exception 'RESULTADO<<%>>', jsonb_build_object(
    'a1_teste', (o1 ->> 'adiar_ate')::timestamptz = t_a1, 'a1_antes', (o1 ->> 'cobertura_antes')::timestamptz = t_a1,
    'a1_adiada', (o1b ->> 'adiada_em') is not null, 'a1_cobre', p1 = now() + interval '36 days',
    'a1_uma_vez', (o1c ->> 'adiada_em') = (o1b ->> 'adiada_em') and (o1c ->> 'adiar_ate') = (o1 ->> 'adiar_ate'),
    'a2_mp', (o2 ->> 'adiar_ate')::timestamptz = c_a2 and c_a2 > now() + interval '1 day',
    'a5_nada', (o5 ->> 'adiar_ate') is null)::text;""", s)
        P.check(r["a1_teste"] is True and r["a1_antes"] is True, f"[{s}] 7 a 1ª compra no teste guarda adiar_ate = o fim do teste")
        P.check(r["a1_adiada"] is True and r["a1_cobre"] is True and r["a1_uma_vez"] is True,
                f"[{s}] 7 o defer feito: adiada_em 1 vez e a cobertura vai ao expira_em novo")
        P.check(r["a2_mp"] is True, f"[{s}] 7 a 1ª compra com o mês do MP guarda adiar_ate = a cobertura do MP")
        P.check(r["a5_nada"] is True, f"[{s}] 7 a vencida não adia")

    if 8 in quais:
        r = caso(8, f"""
declare
  a5 uuid := '@A5@';
  o jsonb;
  pago timestamptz;
begin
  o := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c8'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '5 minutes'",
           "'renova', true", "'teste', true", "'pedido', 'GPA.PLAYW6-E2E-8'", "'valor', 29.9")};
  select mensalidade_pago_ate into pago from @S@.pacientes where id = a5;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('cobranca', o -> 'cobranca', 'teste', (select teste from @S@.play_assinaturas where token = 'playw6-e2e-c8'),
    'n', (select count(*) from @S@.cobrancas where paciente_id = a5 and forma = 'google_play'), 'cobre', pago = now() + interval '5 minutes')::text;""", s)
        P.check(r["cobranca"] is None and r["n"] == 0 and r["teste"] is True and r["cobre"] is True,
                f"[{s}] 8 a compra de TESTE do Google: teste=true, cobre, nenhuma cobrança")

    if 9 in quais:
        r = caso(9, f"""
declare
  a5 uuid := '@A5@';
  o1 jsonb; o2 jsonb; o3 jsonb; o4 jsonb;
begin
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c9-t1'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  o1 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c9-t9'", "'produto', 'app_treino_alimentacao'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  o2 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c9-t9'", "'produto', 'app_treino_alimentacao'", "'estado', 'expirada'", "'expira_em', now() - interval '1 day'")};
  -- a cancelada que já venceu (o EXPIRED que se perdeu) não segura a vaga
  o3 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c9-t1'", "'produto', 'app_treino'", "'estado', 'cancelada'", "'expira_em', now() - interval '1 day'", "'renova', false")};
  o4 := {ap("'paciente_id', a5", "'token', 'playw6-e2e-c9-t10'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  raise exception 'RESULTADO<<%>>', jsonb_build_object('outra', o1 ->> 'erro', 'expirada_ok', o2 -> 'ok', 'nova_ok', o4 -> 'ok',
    't1', (select estado from @S@.play_assinaturas where token = 'playw6-e2e-c9-t1'),
    'vivas', (select count(*) from @S@.play_assinaturas where paciente_id = a5 and estado in ('pendente','ativa','cancelada','carencia','suspensa','pausada')))::text;""", s)
        P.check(r["outra"] == "outra_viva", f"[{s}] 9 outra compra viva sem ligação → outra_viva")
        P.check(r["expirada_ok"] is True, f"[{s}] 9 a mesma, expirada, registra (não é viva)")
        P.check(r["nova_ok"] is True and r["t1"] == "expirada" and r["vivas"] == 1, f"[{s}] 9 a cancelada vencida vira expirada e libera a vaga (1 viva)")

    if 10 in quais:
        r = caso(10, f"""
declare
  o1 jsonb; o2 jsonb; o3 jsonb; o4 jsonb; o5 jsonb; o6 jsonb; o7 jsonb;
begin
  perform {ap("'paciente_id', '@A5@'::uuid", "'token', 'playw6-e2e-c10'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'")};
  o1 := {ap("'paciente_id', '@A6@'::uuid", "'token', 'playw6-e2e-c10'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'")};
  o2 := {ap("'paciente_id', '@S1@'::uuid", "'token', 'playw6-e2e-c10b'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'")};
  o3 := {ap("'paciente_id', '@A6@'::uuid", "'token', 'playw6-e2e-c10c'", "'produto', 'app_xyz'", "'estado', 'ativa'")};
  o4 := {ap("'paciente_id', '@A6@'::uuid", "'token', 'playw6-e2e-c10d'", "'produto', 'app_treino'", "'estado', 'xyz'")};
  o5 := @S@.play_aplicar(jsonb_build_object('paciente_id', 'abc', 'token', 'playw6-e2e-c10e', 'produto', 'app_treino', 'estado', 'ativa'));
  o6 := {ap("'paciente_id', gen_random_uuid()", "'token', 'playw6-e2e-c10f'", "'produto', 'app_treino'", "'estado', 'ativa'")};
  o7 := @S@.play_aplicar(jsonb_build_object('paciente_id', '@A6@', 'token', '', 'produto', 'app_treino', 'estado', 'ativa'));
  raise exception 'RESULTADO<<%>>', jsonb_build_object('outra_mat', o1 ->> 'erro', 'prof', o2 ->> 'erro', 'produto', o3 ->> 'erro',
    'estado', o4 ->> 'erro', 'uuid', o5 ->> 'erro', 'sem', o6 ->> 'erro', 'vazio', o7 ->> 'erro')::text;""", s)
        P.check(r["outra_mat"] == "token_de_outra_matricula", f"[{s}] 10 o token de outra matrícula → token_de_outra_matricula")
        P.check(r["prof"] == "nao_e_do_app", f"[{s}] 10 a matrícula de um profissional → nao_e_do_app")
        P.check(r["produto"] == "produto_invalido", f"[{s}] 10 produto que não é plano do app → produto_invalido")
        P.check(r["estado"] == "invalido" and r["uuid"] == "invalido" and r["vazio"] == "invalido", f"[{s}] 10 entrada inválida → invalido")
        P.check(r["sem"] == "sem_matricula", f"[{s}] 10 matrícula inexistente → sem_matricula")

    if 11 in quais:
        r = caso(11, f"""
declare
  a4 uuid := '@A4@';
  plano_antes uuid;
  o jsonb;
begin
  select plano_aluno_id into plano_antes from @S@.pacientes where id = a4;
  o := {ap("'paciente_id', a4", "'token', 'playw6-e2e-c11'", "'produto', 'app_treino_alimentacao'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'", "'renova', true")};
  raise exception 'RESULTADO<<%>>', jsonb_build_object('ok', o -> 'ok', 'ativa', o -> 'matricula_ativa', 'plano', o -> 'plano',
    'mesmo_plano', (select plano_aluno_id from @S@.pacientes where id = a4) = plano_antes)::text;""", s)
        P.check(r["ok"] is True and r["ativa"] is False and r["plano"] is None and r["mesmo_plano"] is True,
                f"[{s}] 11 a matrícula encerrada registra sem trocar o plano")

    if 12 in quais:
        r = caso(12, f"""
declare
  res jsonb := '{{}}'::jsonb;
  papel text;
  o jsonb;
begin
  perform {ap("'paciente_id', '@A5@'::uuid", "'token', 'playw6-e2e-c12'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'")};
  foreach papel in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000015', 'role', papel)::text, true);
    begin
      execute format('set local role %I', papel);
      perform count(*) from @S@.play_assinaturas;
      res := res || jsonb_build_object(papel || '_select', 'leu');
    exception when insufficient_privilege then res := res || jsonb_build_object(papel || '_select', 'negado');
    end;
    reset role;
    begin
      execute format('set local role %I', papel);
      insert into @S@.play_assinaturas (paciente_id, produto, token, estado) values ('@A5@', 'app_treino', 'playw6-e2e-c12-x', 'ativa');
      res := res || jsonb_build_object(papel || '_insert', 'gravou');
    exception when insufficient_privilege then res := res || jsonb_build_object(papel || '_insert', 'negado');
    end;
    reset role;
    begin
      execute format('set local role %I', papel);
      o := @S@.play_aplicar('{{}}'::jsonb);
      res := res || jsonb_build_object(papel || '_exec', 'executou');
    exception when insufficient_privilege then res := res || jsonb_build_object(papel || '_exec', 'negado');
    end;
    reset role;
  end loop;
  begin
    set local role service_role;
    o := @S@.play_aplicar('{{}}'::jsonb);
    res := res || jsonb_build_object('servidor_exec', o ->> 'erro');
  exception when insufficient_privilege then res := res || jsonb_build_object('servidor_exec', 'negado');
  end;
  reset role;
  raise exception 'RESULTADO<<%>>', res::text;""", s)
        for papel in ("anon", "authenticated"):
            P.check(r.get(f"{papel}_select") == "negado" and r.get(f"{papel}_insert") == "negado",
                    f"[{s}] 12 {papel}: sem SELECT e sem INSERT na play_assinaturas")
            P.check(r.get(f"{papel}_exec") == "negado", f"[{s}] 12 {papel}: sem EXECUTE na play_aplicar")
        P.check(r.get("servidor_exec") == "invalido", f"[{s}] 12 o service_role executa a play_aplicar (a entrada vazia → invalido)")

    if 13 in quais:
        r = caso(13, f"""
declare
  s2 uuid := '@S2@';
  cprof uuid;
  idn uuid; idp uuid;
  f text; ped text; st text; v numeric;
begin
  select conta_id into cprof from @S@.pacientes where id = s2;
  -- a linha da Play gravada pelo servidor (aqui o postgres) numa conta comum, para o UPDATE do app
  insert into @S@.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, pago_em, forma, tipo, play_pedido)
  values ('@PROF@', s2, cprof, 'PLAYW6 E2E guarda', 10, now()::date, 'paga', now(), 'google_play', 'mensalidade', 'GPA.PLAYW6-E2E-13')
  returning id into idp;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '@PROF@', 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into @S@.cobrancas (nutricionista_id, paciente_id, conta_id, descricao, valor, vencimento, status, forma, tipo, play_pedido, criado_por)
  values ('@PROF@', s2, cprof, 'PLAYW6 E2E app', 10, now()::date, 'aberta', 'google_play', 'avulsa', 'GPA.PLAYW6-E2E-13b', '@PROF@')
  returning id into idn;
  update @S@.cobrancas set status = 'cancelada', valor = 1, play_pedido = 'GPA.PLAYW6-E2E-13c', forma = 'mp' where id = idp;
  reset role;
  select forma, play_pedido into f, ped from @S@.cobrancas where id = idn;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('nova_forma', f, 'nova_pedido', ped,
    'play_igual', (select status = 'paga' and valor = 10 and forma = 'google_play' and play_pedido = 'GPA.PLAYW6-E2E-13' from @S@.cobrancas where id = idp))::text;""", s)
        P.check(r["nova_forma"] is None and r["nova_pedido"] is None, f"[{s}] 13 o app cria cobrança 'google_play' → nasce comum (sem forma nem pedido)")
        P.check(r["play_igual"] is True, f"[{s}] 13 numa linha da Play, o UPDATE do app não muda status, valor, forma nem pedido")

    if 14 in quais:
        r = caso(14, f"""
declare
  f jsonb; m jsonb; fs jsonb;
begin
  perform {ap("'paciente_id', '@A5@'::uuid", "'token', 'playw6-e2e-c14-segredo'", "'produto', 'app_treino'", "'estado', 'ativa'",
              "'expira_em', now() + interval '30 days'", "'renova', true", "'pedido', 'GPA.PLAYW6-E2E-14'", "'valor', 29.9")};
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000015', 'role', 'authenticated')::text, true);
  f := @S@.financeiro_do_aluno();
  m := @S@.meu_plano_app();
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000021', 'role', 'authenticated')::text, true);
  fs := @S@.financeiro_do_aluno();
  raise exception 'RESULTADO<<%>>', jsonb_build_object(
    'fin_play', (select e -> 'play' from jsonb_array_elements(f) e where (e ->> 'app')::boolean limit 1),
    'plano_play', m -> 'matricula' -> 'play',
    'vaza', position('playw6-e2e-c14-segredo' in (f::text || m::text)) > 0 or position('GPA.PLAYW6-E2E-14' in (f::text || m::text)) > 0,
    'prof_play', (select count(*) from jsonb_array_elements(fs) e where e -> 'play' <> 'null'::jsonb))::text;""", s)
        for nome in ("fin_play", "plano_play"):
            x = r.get(nome) or {}
            P.check(isinstance(x, dict) and sorted(x) == ["estado", "expira_em", "produto", "renova"] and x.get("estado") == "ativa"
                    and x.get("produto") == "app_treino" and x.get("renova") is True,
                    f"[{s}] 14 {'financeiro_do_aluno' if nome == 'fin_play' else 'meu_plano_app'}: play = {{estado, renova, expira_em, produto}}")
        P.check(r["vaza"] is False, f"[{s}] 14 o token e o pedido NÃO saem nas leituras do aluno")
        P.check(r["prof_play"] == 0, f"[{s}] 14 a matrícula de profissional sem 'play'")

    if 15 in quais:
        r = caso(15, f"""
declare
  a5 uuid := '@A5@';
  base timestamptz; p1 timestamptz; p2 timestamptz;
begin
  select mensalidade_pago_ate into base from @S@.pacientes where id = a5;
  perform {ap("'paciente_id', a5", "'token', 'playw6-e2e-c15'", "'produto', 'app_treino'", "'estado', 'ativa'", "'expira_em', now() + interval '30 days'")};
  select mensalidade_pago_ate into p1 from @S@.pacientes where id = a5;
  delete from @S@.play_assinaturas where token = 'playw6-e2e-c15';
  select mensalidade_pago_ate into p2 from @S@.pacientes where id = a5;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('cobriu', p1 > now(), 'voltou', p2 is not distinct from base)::text;""", s)
        P.check(r["cobriu"] is True and r["voltou"] is True, f"[{s}] 15 apagar a assinatura recalcula a cobertura (volta a de antes)")


    if 16 in quais:
        # a revisão, 🟡3: a cancelada que já venceu (a expiração que ainda não chegou ao banco) NÃO é "viva" nas leituras do aluno — a mesma regra
        # da play_aplicar (a vaga) e das leituras do servidor; a cancelada ainda no prazo continua aparecendo
        r = caso(16, f"""
declare
  f jsonb; m jsonb; f2 jsonb; m2 jsonb;
begin
  perform {ap("'paciente_id', '@A5@'::uuid", "'token', 'playw6-e2e-c16'", "'produto', 'app_treino'", "'estado', 'cancelada'",
              "'expira_em', now() - interval '1 hour'", "'renova', false")};
  perform set_config('request.jwt.claims', jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000015', 'role', 'authenticated')::text, true);
  f := @S@.financeiro_do_aluno();
  m := @S@.meu_plano_app();
  update @S@.play_assinaturas set expira_em = now() + interval '1 day' where token = 'playw6-e2e-c16';
  f2 := @S@.financeiro_do_aluno();
  m2 := @S@.meu_plano_app();
  raise exception 'RESULTADO<<%>>', jsonb_build_object(
    'fin_vencida', (select e -> 'play' from jsonb_array_elements(f) e where (e ->> 'app')::boolean limit 1),
    'plano_vencida', m -> 'matricula' -> 'play',
    'fin_no_prazo', (select e -> 'play' ->> 'estado' from jsonb_array_elements(f2) e where (e ->> 'app')::boolean limit 1),
    'plano_no_prazo', m2 -> 'matricula' -> 'play' ->> 'estado')::text;""", s)
        P.check(r.get("fin_vencida") is None and r.get("plano_vencida") is None,
                f"[{s}] 16 a cancelada VENCIDA fora das leituras do aluno (financeiro_do_aluno e meu_plano_app sem 'play')")
        P.check(r.get("fin_no_prazo") == "cancelada" and r.get("plano_no_prazo") == "cancelada",
                f"[{s}] 16 a cancelada ainda no prazo continua nas leituras (vale até o fim)")

    if 17 in quais:
        # a rotina de hora em hora (22/10/2026): o disparo pelo pg_net (o stub local guarda o pedido em net.http_request_queue, como o de
        # verdade; o bloco desfaz) — o molde do mp_contas_renovar_disparar da W2
        r = caso(17, f"""
declare
  r_sem_play bigint; r_sem_segredo bigint; r_curto bigint; r_ok bigint;
  q record;
  m0 jsonb; m1 jsonb;
begin
  delete from @S@.play_assinaturas;
  delete from vault.secrets where name = 'physiq_play_conferir_segredo';
  perform vault.create_secret(repeat('s', 48), 'physiq_play_conferir_segredo');
  r_sem_play := @S@.play_conferir_disparar();
  perform {ap("'paciente_id', '@A5@'::uuid", "'token', 'playw6-e2e-c17'", "'produto', 'app_treino'", "'estado', 'ativa'",
              "'expira_em', now() + interval '20 days'", "'renova', true")};
  delete from vault.secrets where name = 'physiq_play_conferir_segredo';
  r_sem_segredo := @S@.play_conferir_disparar();
  perform vault.create_secret(repeat('c', 20), 'physiq_play_conferir_segredo');
  r_curto := @S@.play_conferir_disparar();
  delete from vault.secrets where name = 'physiq_play_conferir_segredo';
  perform vault.create_secret(repeat('s', 48), 'physiq_play_conferir_segredo');
  r_ok := @S@.play_conferir_disparar();
  select * into q from net.http_request_queue where id = r_ok;
  -- a migration de novo NÃO pisa no marcador que a função gravou (on conflict do nothing)
  update @S@.app_config set valor = jsonb_build_object('voided_ate', '2026-10-22T20:00:00.000Z') where chave = 'play_conferir';
  insert into @S@.app_config (chave, valor, publica) values ('play_conferir', '{{}}'::jsonb, false) on conflict (chave) do nothing;
  select a.valor into m1 from @S@.app_config a where a.chave = 'play_conferir';
  raise exception 'RESULTADO<<%>>', jsonb_build_object(
    'sem_play', r_sem_play is null, 'sem_segredo', r_sem_segredo is null, 'curto', r_curto is null, 'chamou', r_ok is not null,
    'url', q.url, 'schema', q.body ->> 'schema', 'segredo_certo', (q.headers ->> 'x-espelho-segredo') = repeat('s', 48),
    'tempo', q.timeout_milliseconds, 'metodo', q.method,
    'job', (select jsonb_build_object('quando', j.schedule, 'comando', j.command) from cron.job j where j.jobname = 'play-conferir-@S@'),
    'marca_publica', (select a.publica from @S@.app_config a where a.chave = 'play_conferir'),
    'marca_ficou', m1 ->> 'voided_ate')::text;""", s)
        P.check(r.get("sem_play") is True, f"[{s}] 17 sem assinatura da Play no schema, o disparo não chama a função")
        P.check(r.get("sem_segredo") is True and r.get("curto") is True, f"[{s}] 17 sem o segredo do Vault (ou com menos de 32), não chama")
        P.check(r.get("chamou") is True and r.get("metodo") == "POST" and r.get("url") == "https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/play-conferir"
                and r.get("schema") == s and r.get("segredo_certo") is True and r.get("tempo") == 120000,
                f"[{s}] 17 com os 2: 1 POST do pg_net para a play-conferir com o schema, o x-espelho-segredo e 120 s")
        P.check(r.get("job") == {"quando": "25 * * * *", "comando": f"select {s}.play_conferir_disparar()"},
                f"[{s}] 17 o job play-conferir-{s} de hora em hora no minuto 25")
        P.check(r.get("marca_publica") is False and r.get("marca_ficou") == "2026-10-22T20:00:00.000Z",
                f"[{s}] 17 o marcador play_conferir não público; aplicar de novo não pisa no que a função gravou")


def main() -> int:
    ap_ = argparse.ArgumentParser()
    ap_.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap_.add_argument("--foto")
    ap_.add_argument("--comparar")
    ap_.add_argument("--funcoes-iguais", action="store_true")
    ap_.add_argument("--so-catalogo", action="store_true")
    ap_.add_argument("--casos", default="")
    a = ap_.parse_args()
    s = a.schema
    if a.foto:
        f = foto(s)
        if s == "staging" or B.LOCAL:
            # + a RECALCULADA pelo corpo de antes (bloco desfeito: nada gravado; nunca no public) — o --comparar a compara com a do corpo novo
            f["recalculada"] = recalculada(s)
        Path(a.foto).write_text(json.dumps(f), encoding="utf-8")
        ja = sum(1 for k in f["pacientes"] if "recalculada" in f and f["pacientes"].get(k) != f["recalculada"]["pacientes"].get(k))
        print(f"[{s}] foto: {len(f['pacientes'])} matrículas, {len(f['cobrancas'])} mensalidades, {len(f['funcoes'])} funções"
              + (f", {len(f['leituras'])} logins" if "leituras" in f else "")
              + (f"; a recalculada pelo corpo de hoje: {ja} gravada(s) que já não batem com o recálculo" if "recalculada" in f else ""), flush=True)
        return 0 if f["pacientes"] and len(f["funcoes"]) == 3 else 1
    if a.comparar:
        if s == "public" and not B.LOCAL:
            raise SystemExit("o --comparar recalcula num bloco desfeito: só no staging ou no ensaio local (nunca no public)")
        comparar(Path(a.comparar), s, a.funcoes_iguais)
        return P.fim()
    if a.so_catalogo:
        catalogo(s)
        return P.fim()
    if not B.LOCAL:
        raise SystemExit("os casos usam a massa sintética do PG local: rode com PHYSIQ_SQL_LOCAL (ferramentas/local_playw6.py)")
    quais = {int(x) for x in a.casos.split(",") if x.strip()} or set(range(1, 18))
    casos(s, quais)
    catalogo(s)
    return P.fim()


if __name__ == "__main__":
    raise SystemExit(main())
