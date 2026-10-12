#!/usr/bin/env python3
"""Physiq W2 — o Mercado Pago DO PERSONAL no banco (20261011210000_w2_mp_personal.sql — UMA migration). O molde do e2e/w1/sql_w1.py e do
e2e/w1b/sql_w1b.py: cada caso com escrita é um bloco que termina com erro de propósito (nada fica gravado) e devolve o resultado na
mensagem do erro. "Como o app" = o papel authenticated com o sub da conta de TESTE (prof2 = dono da conta; aluno2 = aluno dele;
admin.teste = master). Ponto de partida de todo bloco: a conta do prof2 em pix_manual, sem integração do MP, a flag ligada e nenhuma
automática viva nos alunos dela. As integrações e conexões de teste levam cifras FALSAS no formato (v1: + 16 + : + 24) — nenhum token.
Casos (staging):
   1 modo            o CHECK aceita mercadopago_conta (como o servidor, com a integração ativa); um modo inventado segue recusado
   2 sem integração  entrar no mercadopago_conta sem a integração → mp_conta_sem_integracao para o dono, o postgres e o service_role
   3 com integração  o dono liga com a integração ativa; desconectada ou erro → mp_conta_sem_integracao
   4 automática      sair do MP da conta com automática authorized → automaticas_ativas:1; cancelada → passa; do MP do Physiq
                     (pending) também, para o dono e para o postgres
   5 sair            sair do MP da conta → integração desconectada (desconectada_em; a trava some; os tokens ficam os 7 dias)
   6 master          master_conta_acao: mercadopago_conta → modo_invalido; sair com automática → automaticas_ativas {alunos: 1}
                     (antes do gatilho); sem → ok e a integração desconectada; sem o modo no pedido → modo_invalido
   7 o app não lê    recebimento_integracoes, mp_conexoes e a w27_conta_linha (I7) → insufficient_privilege; o mp_collector_id
                     em cobrancas fica nulo no INSERT e igual no UPDATE; aluno_assinaturas: o UPDATE do dono não acha linha (RLS)
   8 CHECK integr.   token sem v1: · ativa sem token · oauth ativa sem refresh · sem mp_origem · desconectada sem desconectada_em →
                     violação; teste_sem_oauth sem refresh · desconectada sem token · oauth com mp_erro sem_renovacao → passa
   9 redirect        mp_conexoes no staging: o redirect próprio e https://www.mercadopago.com passam; o do public, outro endereço,
                     'confirmar' sem o par e 'confirmar' sem o mp_user_id → violação
  10 trava           mp_integracao_reservar: 1ª true, 2ª false; vencida → true (com o prazo pedido); desconectada → false
  11 faxina          mp_contas_renovar_disparar(): desconectada há 6 dias fica com os tokens, há 8 perde; state vencido há 2 dias
                     sai; o par 'confirmar' de 16 min perde os tokens e vira 'vencido' (o de 5 min fica) — o pg_net não manda nada
                     (bloco desfeito)
  12 master vê       w27_conta_linha → 'mercadopago_conta' com a situação e o apelido, sem chave com "token" e sem cifra no texto;
                     master_integracoes conta o mercadopago_conta e traz o mp_conta_erro
  13 encerrada       a conta cancelada perde a integração do MP (o gatilho da W1)
  14 nada gravado    (no fim) a foto da conta de TESTE é a mesma e não sobra linha de teste (por marca)
  15 C1 / W1b        a guarda da W1b segue de pé com a nova ao lado: o INSERT do dono nasce sem forma mp, sem mp_payment_id, sem
                     reembolsado_em e sem collector; numa linha mp do servidor o UPDATE do dono não muda nada do MP nem o collector
  16 I8              recebimento_mp_confirmar: sem sessão → sem_login; o aluno → outra_pessoa (nada gravado); o dono → ok: ativa, oauth,
                     as cifras IGUAIS às da conexão, a conexão 'ok' sem o par, o modo trocado; de novo → invalido; usado há 16 min →
                     vencido; a flag desligada → mp_conta_em_teste
  17 I5 + MENOR 29   trocar de conta do MP (777 → 888): Pix aberto da antiga → outra_conta (a integração segue na 777); Pix vencido →
                     passa; automática viva da 777 em OUTRA conta do Physiq não conta; desconectada há 3 dias com token e Pix aberto
                     → outra_conta (decisão 10)
  18 o modo          no MP do Physiq com automática viva → conectado_sem_trocar (a integração fica; o modo não); sem → ok e o modo
                     trocado; 1 evento por confirmação
Sempre (só leitura; vale no public): o catálogo — as colunas novas, a mp_conexoes com RLS e sem grant para o app/anon, as 6 internas
novas (search_path, sem EXECUTE para o app/anon), a recebimento_mp_confirmar (definer, search_path, EXECUTE para authenticated e
service_role, NÃO para anon), a w27_conta_linha só do servidor (I7), os gatilhos (o da W1b ligado — C1 — e os 3 da W2), o job
mp-renovar-<schema>, as 2 flags, os 2 CHECK e os corpos IGUAIS aos da migration.
Uso: python3 e2e/w2/sql_w2.py [--casos 1,2,…]                       (staging: os casos + o catálogo + a foto)
     python3 e2e/w2/sql_w2.py --so-catalogo --schema staging|public  (só leitura)
     python3 e2e/w2/sql_w2.py --seco [--schema …]                    (monta os blocos e confere formato e tamanho: NADA vai ao banco)
Antes da migration os casos ficam ❌ (o vermelho). Ensaio local (sem Supabase): PHYSIQ_SQL_LOCAL=<pasta do socket de um Postgres
descartável> — o mesmo script contra o principal local de ~/projetos/physiqcalc-scratch/w2/t6/ (só aceita uma pasta de socket: nunca
vai à rede).
Saída sem dado pessoal: só contagens, códigos e os valores dos casos de teste.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
from _comum import Placar, sql_principal  # noqa: E402

p = Placar()
S = "staging"
DONO, ALUNO, MASTER = "prof2.teste.claude@physiqcalc.app", "aluno2.teste.claude@physiqcalc.app", "admin.teste.claude@physiqcalc.app"
ORIGEM = "teste_w2"          # as cobranças de teste
MARCA = "W2 TESTE"           # o mp_apelido das integrações e conexões de teste
PRE = "W2-E2E-"              # o mp_preapproval_id das automáticas e o mp_payment_id das cobranças de teste
MIGRATION = Path(__file__).resolve().parents[2] / "supabase-principal/migrations/20261011210000_w2_mp_personal.sql"
# cifras FALSAS no formato 'v1:<16>:<20+>' (a regra do CHECK e do _shared/cifra-mp.ts) — nada aqui abre em lugar nenhum
CIFRA_A, CIFRA_R = "v1:" + "A" * 16 + ":" + "a" * 24, "v1:" + "R" * 16 + ":" + "r" * 24
CIFRA_CA, CIFRA_CR = "v1:" + "C" * 16 + ":" + "c" * 24, "v1:" + "D" * 16 + ":" + "d" * 24
CIFRA_V = "v1:" + "V" * 16 + ":" + "v" * 24
CHAVE_PUBLICA = "TEST-00000000-0000-0000-0000-000000000w2"
TOKEN_CLARO = "APP_USR-0000000000000000-000000-aaaaaaaaaaaaaaaaaaaa-000"   # um "token" sem cifra (de mentira): o CHECK recusa
REDIRECT = "https://api-principal.physiqcalc.com.br/functions/v1/mp-conectar-retorno/"
REDIRECT_TESTE = "https://www.mercadopago.com"
# o RuntimeError do _comum.sql_mgmt corta a resposta de erro em 500 caracteres: o resultado de um bloco cabe com folga abaixo disto
TETO_RESULTADO = 300
INTERNAS = ("mp_automaticas_vivas", "contas_guard_mp", "contas_saiu_do_mp_conta", "cobrancas_guard_mp_conta", "mp_integracao_reservar",
            "mp_contas_renovar_disparar")
CORPOS = INTERNAS + ("recebimento_mp_confirmar", "w27_conta_linha", "master_integracoes", "master_conta_acao")
COLUNAS_INTEGRACAO = ("mp_user_id", "mp_apelido", "mp_public_key", "mp_access_token", "mp_refresh_token", "mp_expira_em", "mp_teste",
                      "mp_origem", "mp_renovado_em", "mp_renovando_ate", "mp_renovar_tentativas", "mp_renovar_proxima_em", "mp_erro",
                      "mp_avisado_em", "conectado_em", "desconectada_em", "mp_conferido_em")
COLUNAS_CONEXAO = ("id", "estado_hash", "conta_id", "user_id", "verificador", "redirect_uri", "criado_em", "expira_em", "usado_em",
                   "resultado", "token_access", "token_refresh", "token_expira_em", "mp_user_id", "mp_apelido", "public_key", "live",
                   "renovavel")
# tgtype: ROW 1 + BEFORE 2 + INSERT 4 + UPDATE 16 (AFTER = sem o 2)
GATILHOS = {("cobrancas", "trg_cobrancas_guard_mp"): ("cobrancas_guard_mp", 23),          # o da W1b (C1)
            ("cobrancas", "trg_cobrancas_guard_mp_conta"): ("cobrancas_guard_mp_conta", 23),
            ("contas", "trg_contas_guard_mp"): ("contas_guard_mp", 19),
            ("contas", "trg_contas_saiu_do_mp_conta"): ("contas_saiu_do_mp_conta", 17)}
CASOS = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18)
LOCAL = os.environ.get("PHYSIQ_SQL_LOCAL", "").strip()


# ───────────────────────── o banco (o Supabase pela Management API, ou o ensaio local) ─────────────────────────

def _local(q: str, leitura: bool) -> list:
    """O ensaio: psql no socket de um Postgres descartável. Só aceita uma pasta com o socket — nunca um host da rede."""
    pasta = Path(LOCAL)
    if not pasta.is_absolute() or not pasta.is_dir() or not any(pasta.glob(".s.PGSQL.*")):
        raise SystemExit(f"PHYSIQ_SQL_LOCAL tem que ser a pasta do socket de um Postgres local ({LOCAL!r})")
    env = dict(os.environ, PATH=f"{Path.home()}/.local/bin:{os.environ.get('PATH', '')}")
    base = ["psql", "-h", str(pasta), "-U", "postgres", "-d", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]
    cmd = base + (["-1", "-c", "set transaction read only", "-c", f"select coalesce(json_agg(t), '[]'::json) from ({q}) t"] if leitura
                  else ["-c", q])
    r = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"SQL local: {r.stderr[:500]}")
    return json.loads(r.stdout.strip() or "[]") if leitura else []


def ler(q: str) -> list:
    """Só leitura (vale no public): a transação é read only, como o e2e/hml01/banco.py."""
    return _local(q, True) if LOCAL else sql_principal("set transaction read only;\n" + q)


def escrever(q: str) -> list:
    return _local(q, False) if LOCAL else sql_principal(q)


def _resultado(q: str) -> dict:
    try:
        escrever(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO<<(.*)>>", str(e), re.S)
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def tem_w2(s: str = S) -> bool:
    return bool(ler(f"select to_regclass('{s}.mp_conexoes') is not null as ok")[0]["ok"])


# ───────────────────────── os blocos ─────────────────────────

def como(uid: str, master: bool = False) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` (uma variável do bloco)."""
    meta = ", 'app_metadata', json_build_object('role', 'master')" if master else ""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"
MODO = f"(select recebimento_modo from {S}.contas where id = v_conta)"
INTEG = f"{S}.recebimento_integracoes where conta_id = v_conta and provedor = 'mercadopago'"


def bloco_sql(corpo: str) -> str:
    return f"""do $t$
declare v_dono uuid; v_aluno uuid; v_master uuid; v_conta uuid; v_pac uuid; v_pac2 uuid; v_c uuid; v_c2 uuid; v_k uuid; v_k2 uuid;
        v_j jsonb; v_t text; v_b boolean; v_n integer; v_res jsonb := '{{}}'::jsonb;
begin
  select u.id into v_dono from auth.users u where lower(u.email) = '{DONO}';
  select u.id into v_aluno from auth.users u where lower(u.email) = '{ALUNO}';
  select u.id into v_master from auth.users u where lower(u.email) = '{MASTER}';
  select c.id into v_conta from {S}.contas c where c.dono_id = v_dono and c.origem <> 'app' order by c.criado_em limit 1;
  select pa.id into v_pac from {S}.pacientes pa where pa.user_id = v_aluno and pa.conta_id = v_conta and pa.deleted_at is null limit 1;
  if v_conta is null or v_pac is null or v_master is null then
    raise exception 'RESULTADO<<%>>', jsonb_build_object('erro', 'sem a conta ou a matricula de TESTE')::text;
  end if;
  -- ponto de partida (o bloco inteiro volta no fim): nenhuma automática viva nos alunos da conta, sem integração do MP, Pix manual,
  -- a flag ligada
  update {S}.aluno_assinaturas a set status = 'cancelled' from {S}.pacientes pa
   where pa.id = a.paciente_id and pa.conta_id = v_conta and a.status in ('authorized', 'pending', 'paused');
  delete from {S}.recebimento_integracoes where conta_id = v_conta and provedor = 'mercadopago';
  update {S}.contas set recebimento_modo = 'pix_manual' where id = v_conta;
  update {S}.app_config set valor = jsonb_build_object('liberada', true) where chave = 'mercadopago_conta';
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;"""


def bloco(corpo: str) -> dict:
    return _resultado(bloco_sql(corpo))


def lit(v: str | None) -> str:
    return "null" if v is None else "'" + v.replace("'", "''") + "'"


def integracao(status: str = "ativa", origem: str = "oauth", collector: int = 777, refresh: bool = True,
               desconectada_ha: str | None = None) -> str:
    """A integração do MP da conta do prof2 como o servidor grava (aqui pelo postgres), com as cifras falsas."""
    desc = f"now() - interval '{desconectada_ha}'" if desconectada_ha else "null"
    return (f"  insert into {S}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_public_key, mp_access_token,\n"
            f"    mp_refresh_token, mp_expira_em, mp_teste, mp_origem, conectado_em, desconectada_em)\n"
            f"  values (v_conta, 'mercadopago', '{status}', {collector}, '{MARCA} {collector}', '{CHAVE_PUBLICA}', '{CIFRA_A}',\n"
            f"    {lit(CIFRA_R) if refresh else 'null'}, now() + interval '170 days', true, '{origem}', now(), {desc});\n")


def mudar_integracao(sets: str) -> str:
    """Muda a integração do MP da conta do prof2 (como o servidor)."""
    return f"  update {S}.recebimento_integracoes set {sets} where conta_id = v_conta and provedor = 'mercadopago';\n"


def conexao(var: str, collector: int = 777, usado_ha: str = "0 minutes", quem: str = "v_dono") -> str:
    """Uma conexão que a volta do OAuth deixou para confirmar (como o servidor grava), o par com as cifras falsas."""
    return (f"  insert into {S}.mp_conexoes (estado_hash, conta_id, user_id, verificador, redirect_uri, criado_em, expira_em, usado_em, resultado,\n"
            f"    token_access, token_refresh, token_expira_em, mp_user_id, mp_apelido, public_key, live, renovavel)\n"
            f"  values (md5(random()::text) || md5(random()::text), v_conta, {quem}, '{CIFRA_V}', '{REDIRECT}{S}',\n"
            f"    now() - interval '{usado_ha}' - interval '1 minute', now() - interval '{usado_ha}' + interval '9 minutes',\n"
            f"    now() - interval '{usado_ha}', 'confirmar', '{CIFRA_CA}', '{CIFRA_CR}', now() + interval '180 days', {collector},\n"
            f"    '{MARCA} {collector}', '{CHAVE_PUBLICA}', false, true) returning id into {var};\n")


def assinatura(status: str, collector: str, sufixo: str, pac: str = "v_pac") -> str:
    """Uma automática (aluno_assinaturas) como a pagamentos-aluno grava: collector 'null' = o MP do Physiq."""
    return (f"  insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, mp_collector_id)\n"
            f"  values ({pac}, (select pa.conta_id from {S}.pacientes pa where pa.id = {pac}), '{PRE}PRE-{sufixo}', '{status}', 10, {collector});\n")


def cobranca_mp(var: str, collector: int, pix_expira: str, sufixo: str) -> str:
    """Uma cobrança do MP (Pix aguardando) do aluno2, como a pagamentos-aluno grava (aqui pelo postgres)."""
    return (f"  insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status, forma,\n"
            f"    metodo, mp_payment_id, mp_status, pix_qr, pix_copia_cola, pix_expira_em, origem, mp_collector_id)\n"
            f"  values (v_pac, v_conta, v_dono, v_dono, 'teste w2 pix', 10, current_date, 'avulsa', 'aguardando_confirmacao', 'mp', 'pix',\n"
            f"    '{PRE}PIX-{sufixo}', 'pending', 'QR', 'COPIA', {pix_expira}, '{ORIGEM}', {collector}) returning id into {var};\n")


def erro_p0001(chave: str, sql: str) -> str:
    """O comando num sub-bloco: o texto do P0001 (a mensagem da guarda) ou 'passou'."""
    return (f"  begin\n    {sql}\n    v_res := v_res || jsonb_build_object('{chave}', 'passou');\n"
            f"  exception when sqlstate 'P0001' then\n    v_res := v_res || jsonb_build_object('{chave}', sqlerrm);\n  end;\n")


def negado(chave: str, sql: str) -> str:
    """O comando num sub-bloco: 'negado' (insufficient_privilege) ou 'leu'."""
    return (f"  begin\n    {sql}\n    v_res := v_res || jsonb_build_object('{chave}', 'leu');\n"
            f"  exception when insufficient_privilege then\n    v_res := v_res || jsonb_build_object('{chave}', 'negado');\n  end;\n")


def tenta(chave: str, sql: str, limpar: str = "") -> str:
    """O comando num sub-bloco: 'check' (check_violation) ou 'passou' (e o `limpar` desfaz para o próximo)."""
    return (f"  begin\n    {sql}\n    {limpar}\n    v_res := v_res || jsonb_build_object('{chave}', 'passou');\n"
            f"  exception when check_violation then\n    v_res := v_res || jsonb_build_object('{chave}', 'check');\n  end;\n")


def tenta_integracao(chave: str, status: str, origem: str | None, access: str | None, refresh: str | None, erro: str | None = None,
                     sem_data: bool = False) -> str:
    desc = "now()" if status == "desconectada" and not sem_data else "null"
    return tenta(chave, (f"insert into {S}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_access_token,\n"
                         f"      mp_refresh_token, mp_expira_em, mp_origem, mp_erro, desconectada_em)\n"
                         f"    values (v_conta, 'mercadopago', '{status}', 777, '{MARCA} 777', {lit(access)}, {lit(refresh)},\n"
                         f"      now() + interval '1 day', {lit(origem)}, {lit(erro)}, {desc});"),
                 f"delete from {INTEG};")


def tenta_conexao(chave: str, redirect: str, confirmar: str | None = None) -> str:
    """confirmar = 'sem_par' (resultado 'confirmar' sem os tokens) ou 'sem_collector' (com o par, sem o mp_user_id)."""
    extra_c, extra_v = {None: ("", ""),
                        "sem_par": (", usado_em, resultado", ", now(), 'confirmar'"),
                        "sem_collector": (", usado_em, resultado, token_access, token_refresh, token_expira_em",
                                          f", now(), 'confirmar', '{CIFRA_CA}', '{CIFRA_CR}', now() + interval '180 days'")}[confirmar]
    return tenta(chave, (f"insert into {S}.mp_conexoes (estado_hash, conta_id, user_id, verificador, redirect_uri{extra_c})\n"
                         f"    values (md5(random()::text) || md5(random()::text), v_conta, v_dono, '{CIFRA_V}', '{redirect}'{extra_v});"),
                 f"delete from {S}.mp_conexoes where conta_id = v_conta and verificador = '{CIFRA_V}';")


def confirmar(var: str, quem: str, master: bool = False) -> str:
    return como(quem, master) + f"  v_j := {S}.recebimento_mp_confirmar({var});\n" + VOLTA


def outro_paciente() -> str:
    """Uma matrícula de OUTRA conta (qualquer uma): a automática dela com o collector antigo não conta no I5 (MENOR 29)."""
    return (f"  select pa.id into v_pac2 from {S}.pacientes pa where pa.conta_id is not null and pa.conta_id is distinct from v_conta\n"
            "   and pa.deleted_at is null order by pa.created_at limit 1;\n")


def dentro(sql: str) -> str:
    return "".join(f"  {linha}" if linha.strip() else linha for linha in sql.splitlines(keepends=True))


def blocos() -> dict[int, tuple[str, dict]]:
    """Os casos com escrita desfeita: número → (o corpo do bloco, o resultado esperado)."""
    sair_pix = f"update {S}.contas set recebimento_modo = 'pix_manual' where id = v_conta;"
    entrar_conta = f"update {S}.contas set recebimento_modo = 'mercadopago_conta' where id = v_conta;"
    b: dict[int, tuple[str, dict]] = {}
    b[1] = (
        integracao() + f"  {entrar_conta}\n  v_res := v_res || jsonb_build_object('modo', {MODO});\n"
        + tenta("inventado", f"update {S}.contas set recebimento_modo = 'mercadopago_x' where id = v_conta;"),
        {"modo": "mercadopago_conta", "inventado": "check"})
    b[2] = (
        como("v_dono") + erro_p0001("dono", entrar_conta) + VOLTA
        + erro_p0001("postgres", entrar_conta)
        + "  begin\n    perform set_config('role', 'service_role', true);\n" + dentro(erro_p0001("service_role", entrar_conta)) + dentro(VOLTA)
        + "  exception when insufficient_privilege then\n    v_res := v_res || jsonb_build_object('service_role', 'sem_troca');\n  end;\n"
        + f"  v_res := v_res || jsonb_build_object('modo', {MODO});\n",
        {"dono": "mp_conta_sem_integracao", "postgres": "mp_conta_sem_integracao", "service_role": "mp_conta_sem_integracao",
         "modo": "pix_manual"})
    b[3] = (
        integracao() + como("v_dono") + f"  {entrar_conta}\n" + VOLTA
        + f"  v_res := v_res || jsonb_build_object('ativa', {MODO});\n  {sair_pix}   -- sair marca a integração desconectada (caso 5)\n"
        + como("v_dono") + erro_p0001("desconectada", entrar_conta) + VOLTA
        + mudar_integracao("status = 'erro', desconectada_em = null")
        + como("v_dono") + erro_p0001("erro", entrar_conta) + VOLTA,
        {"ativa": "mercadopago_conta", "desconectada": "mp_conta_sem_integracao", "erro": "mp_conta_sem_integracao"})
    b[4] = (
        integracao() + f"  {entrar_conta}\n" + assinatura("authorized", "777", "4A")
        + como("v_dono") + erro_p0001("conta_viva", sair_pix) + VOLTA
        + f"  update {S}.aluno_assinaturas set status = 'cancelled' where mp_preapproval_id = '{PRE}PRE-4A';\n"
        + como("v_dono") + f"  {sair_pix}\n" + VOLTA + f"  v_res := v_res || jsonb_build_object('cancelada', {MODO});\n"
        + "  -- o MP do Physiq também: o master liga (aqui pelo banco) e o aluno assina; nem o dono nem o servidor saem com ela viva\n"
        + f"  update {S}.contas set recebimento_modo = 'mercadopago' where id = v_conta;\n" + assinatura("pending", "null", "4B")
        + como("v_dono") + erro_p0001("physiq_viva", sair_pix) + VOLTA + erro_p0001("postgres", sair_pix)
        + f"  v_res := v_res || jsonb_build_object('modo', {MODO});\n",
        {"conta_viva": "automaticas_ativas:1", "cancelada": "pix_manual", "physiq_viva": "automaticas_ativas:1",
         "postgres": "automaticas_ativas:1", "modo": "mercadopago"})
    b[5] = (
        integracao() + f"  {entrar_conta}\n" + mudar_integracao("mp_renovando_ate = now() + interval '1 minute'")
        + como("v_dono") + f"  {sair_pix}\n" + VOLTA
        + f"""  v_res := (select jsonb_build_object('modo', {MODO}, 'status', i.status, 'desde', i.desconectada_em is not null,
                                      'trava', i.mp_renovando_ate is null, 'tokens', i.mp_access_token is not null and i.mp_refresh_token is not null)
              from {S}.recebimento_integracoes i where i.conta_id = v_conta and i.provedor = 'mercadopago');
""",
        {"modo": "pix_manual", "status": "desconectada", "desde": True, "trava": True, "tokens": True})
    acao = lambda modo: (como("v_master", master=True)  # noqa: E731
                         + f"  v_j := {S}.master_conta_acao(v_conta, 'recebimento', {modo});\n" + VOLTA)
    b[6] = (
        acao("jsonb_build_object('modo', 'mercadopago_conta')") + "  v_res := v_res || jsonb_build_object('mp_conta', v_j ->> 'erro');\n"
        + integracao() + f"  {entrar_conta}\n" + assinatura("authorized", "777", "6A")
        + acao("jsonb_build_object('modo', 'pix_manual')")
        + f"  v_res := v_res || jsonb_build_object('viva', v_j ->> 'erro', 'alunos', (v_j ->> 'alunos')::int, 'modo_viva', {MODO});\n"
        + f"  update {S}.aluno_assinaturas set status = 'cancelled' where mp_preapproval_id = '{PRE}PRE-6A';\n"
        + acao("jsonb_build_object('modo', 'pix_manual')")
        + f"  v_res := v_res || jsonb_build_object('sem', (v_j ->> 'ok')::boolean, 'modo', {MODO}, 'integracao', (select status from {INTEG}));\n"
        + acao("'{}'::jsonb") + "  v_res := v_res || jsonb_build_object('sem_modo', v_j ->> 'erro');\n",
        {"mp_conta": "modo_invalido", "viva": "automaticas_ativas", "alunos": 1, "modo_viva": "mercadopago_conta", "sem": True,
         "modo": "pix_manual", "integracao": "desconectada", "sem_modo": "modo_invalido"})
    b[7] = (
        integracao() + cobranca_mp("v_c", 777, "now() + interval '3 days'", "7") + assinatura("authorized", "777", "7")
        + como("v_dono")
        + negado("integ", f"perform 1 from {S}.recebimento_integracoes limit 1;")
        + negado("conexoes", f"perform 1 from {S}.mp_conexoes limit 1;")
        + negado("w27", f"perform {S}.w27_conta_linha(v_conta);")
        + f"""  insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status, origem,
                             mp_collector_id)
  values (v_pac, v_conta, v_dono, v_dono, 'teste w2 app', 15, current_date + 9, 'avulsa', 'aberta', '{ORIGEM}', 9) returning id into v_c2;
  update {S}.cobrancas set mp_collector_id = 9, descricao = 'teste w2 editada' where id = v_c;
  update {S}.aluno_assinaturas set mp_collector_id = 9 where mp_preapproval_id = '{PRE}PRE-7';
  get diagnostics v_n = row_count;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('insert', (select mp_collector_id from {S}.cobrancas where id = v_c2),
                                     'update', (select mp_collector_id from {S}.cobrancas where id = v_c),
                                     'desc', (select descricao = 'teste w2 editada' from {S}.cobrancas where id = v_c), 'assinatura', v_n,
                                     'assinatura_col', (select mp_collector_id from {S}.aluno_assinaturas where mp_preapproval_id = '{PRE}PRE-7'));
""",
        {"integ": "negado", "conexoes": "negado", "w27": "negado", "insert": None, "update": 777, "desc": True, "assinatura": 0,
         "assinatura_col": 777})
    b[8] = (
        tenta_integracao("sem_v1", "ativa", "oauth", TOKEN_CLARO, CIFRA_R)
        + tenta_integracao("ativa_sem_token", "ativa", "oauth", None, CIFRA_R)
        + tenta_integracao("teste_sem_refresh", "ativa", "teste_sem_oauth", CIFRA_A, None)
        + tenta_integracao("desconectada_sem_token", "desconectada", "oauth", None, None)
        + tenta_integracao("oauth_sem_refresh", "ativa", "oauth", CIFRA_A, None)
        + tenta_integracao("sem_renovacao", "ativa", "oauth", CIFRA_A, None, "sem_renovacao")
        # o NULL passa no CHECK se a regra não cuidar dele (a prova local pegou no texto do plano)
        + tenta_integracao("sem_origem", "ativa", None, CIFRA_A, CIFRA_R)
        + tenta_integracao("desconectada_sem_data", "desconectada", "oauth", CIFRA_A, CIFRA_R, sem_data=True),
        {"sem_v1": "check", "ativa_sem_token": "check", "teste_sem_refresh": "passou", "desconectada_sem_token": "passou",
         "oauth_sem_refresh": "check", "sem_renovacao": "passou", "sem_origem": "check", "desconectada_sem_data": "check"})
    b[9] = (
        tenta_conexao("proprio", REDIRECT + S) + tenta_conexao("teste", REDIRECT_TESTE)
        + tenta_conexao("public", REDIRECT + "public") + tenta_conexao("outro", "https://physiq.example/volta")
        + tenta_conexao("confirmar_sem_par", REDIRECT + S, confirmar="sem_par")
        + tenta_conexao("confirmar_sem_collector", REDIRECT + S, confirmar="sem_collector"),
        {"proprio": "passou", "teste": "passou", "public": "check", "outro": "check", "confirmar_sem_par": "check",
         "confirmar_sem_collector": "check"})
    b[10] = (
        integracao() + f"""  v_b := {S}.mp_integracao_reservar(v_conta);
  v_res := v_res || jsonb_build_object('1a', v_b);
  v_b := {S}.mp_integracao_reservar(v_conta);
  v_res := v_res || jsonb_build_object('2a', v_b);
  update {S}.recebimento_integracoes set mp_renovando_ate = now() - interval '1 minute' where conta_id = v_conta and provedor = 'mercadopago';
  v_b := {S}.mp_integracao_reservar(v_conta, 60);
  v_res := v_res || jsonb_build_object('vencida', v_b, 'prazo', (select mp_renovando_ate = now() + interval '60 seconds' from {INTEG}));
  update {S}.recebimento_integracoes set status = 'desconectada', desconectada_em = now(), mp_renovando_ate = null
   where conta_id = v_conta and provedor = 'mercadopago';
  v_b := {S}.mp_integracao_reservar(v_conta);
  v_res := v_res || jsonb_build_object('desconectada', v_b);
""",
        {"1a": True, "2a": False, "vencida": True, "prazo": True, "desconectada": False})
    b[11] = (
        integracao("desconectada", desconectada_ha="6 days") + conexao("v_k", usado_ha="16 minutes") + conexao("v_k2", usado_ha="5 minutes")
        + f"""  insert into {S}.mp_conexoes (estado_hash, conta_id, user_id, verificador, redirect_uri, criado_em, expira_em)
  values (md5(random()::text) || md5(random()::text), v_conta, v_dono, '{CIFRA_V}', '{REDIRECT}{S}', now() - interval '2 days 10 minutes',
          now() - interval '2 days') returning id into v_c;
  perform {S}.mp_contas_renovar_disparar();
  v_res := v_res || jsonb_build_object('6d', (select mp_access_token is not null and mp_refresh_token is not null from {INTEG}));
  update {S}.recebimento_integracoes set desconectada_em = now() - interval '8 days' where conta_id = v_conta and provedor = 'mercadopago';
  perform {S}.mp_contas_renovar_disparar();
  v_res := v_res || jsonb_build_object('8d', (select mp_access_token is null and mp_refresh_token is null from {INTEG}),
    'state', (select count(*) from {S}.mp_conexoes where id = v_c),
    'par16', (select resultado || ':' || (token_access is null and token_refresh is null)::text from {S}.mp_conexoes where id = v_k),
    'par5', (select resultado || ':' || (token_access is not null and token_refresh is not null)::text from {S}.mp_conexoes where id = v_k2));
""",
        {"6d": True, "8d": True, "state": 0, "par16": "vencido:true", "par5": "confirmar:true"})
    b[12] = (
        integracao() + f"""  {entrar_conta}
  v_j := {S}.w27_conta_linha(v_conta);
  v_res := v_res || jsonb_build_object('status', v_j -> 'mercadopago_conta' ->> 'status',
    'apelido', v_j -> 'mercadopago_conta' ->> 'apelido' = '{MARCA} 777', 'chave', (v_j -> 'mercadopago_conta' ->> 'chave_publica')::boolean,
    'sem_token', not exists (select 1 from jsonb_object_keys(v_j -> 'mercadopago_conta') k where k like '%token%'),
    'sem_cifra', position('v1:' in v_j::text) = 0);
""" + como("v_master", master=True) + f"  v_j := {S}.master_integracoes(0, 100);\n" + VOLTA
        + """  v_res := v_res || jsonb_build_object('resumo', (v_j -> 'resumo' ->> 'mercadopago_conta')::int >= 1,
    'erro_conta', (v_j -> 'resumo' ->> 'mp_conta_erro') is not null);
""",
        {"status": "ativa", "apelido": True, "chave": True, "sem_token": True, "sem_cifra": True, "resumo": True, "erro_conta": True})
    b[13] = (
        integracao() + f"""  update {S}.contas set situacao = 'cancelada' where id = v_conta;
  v_res := jsonb_build_object('integracoes', (select count(*) from {INTEG}));
""",
        {"integracoes": 0})
    linha_mp = "md5(row(forma, status, mp_payment_id, mp_status, pix_copia_cola, pix_expira_em, reembolsado_em, mp_collector_id)::text)"
    b[15] = (
        integracao() + como("v_dono")
        + f"""  insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status, forma,
                             mp_payment_id, reembolsado_em, origem, mp_collector_id)
  values (v_pac, v_conta, v_dono, v_dono, 'teste w2 forjada', 10, current_date, 'avulsa', 'paga', 'mp', '{PRE}X1', now(), '{ORIGEM}', 9)
  returning id into v_c;
""" + VOLTA + f"""  v_res := (select jsonb_build_object('forma', forma, 'pid', mp_payment_id, 'reemb', reembolsado_em, 'col', mp_collector_id, 'status', status)
              from {S}.cobrancas where id = v_c);
""" + cobranca_mp("v_c2", 777, "now() + interval '3 days'", "15")
        + f"  v_t := (select {linha_mp} from {S}.cobrancas where id = v_c2);\n" + como("v_dono")
        + f"""  update {S}.cobrancas set mp_payment_id = '{PRE}X2', status = 'paga', pix_copia_cola = 'OUTRO', reembolsado_em = now(), mp_collector_id = 9,
         descricao = 'teste w2 editada' where id = v_c2;
  get diagnostics v_n = row_count;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('linhas', v_n, 'igual', (select {linha_mp} from {S}.cobrancas where id = v_c2) = v_t,
                                     'desc', (select descricao = 'teste w2 editada' from {S}.cobrancas where id = v_c2));
""",
        {"forma": None, "pid": None, "reemb": None, "col": None, "status": "paga", "linhas": 1, "igual": True, "desc": True})
    b[16] = (
        conexao("v_k") + f"  v_j := {S}.recebimento_mp_confirmar(v_k);\n  v_res := v_res || jsonb_build_object('sem_login', v_j ->> 'erro');\n"
        + confirmar("v_k", "v_aluno")
        + f"  v_res := v_res || jsonb_build_object('aluno', v_j ->> 'erro', 'nada', (select count(*) from {INTEG}));\n"
        + confirmar("v_k", "v_dono")
        + f"""  v_res := v_res || jsonb_build_object('dono', v_j ->> 'resultado',
    'integ', (select status || '/' || mp_origem || '/' || mp_user_id from {INTEG}),
    'cifras', (select mp_access_token = '{CIFRA_CA}' and mp_refresh_token = '{CIFRA_CR}' and mp_erro is null from {INTEG}),
    'con', (select resultado || '/' || (token_access is null and token_refresh is null)::text from {S}.mp_conexoes where id = v_k),
    'modo', {MODO});
""" + confirmar("v_k", "v_dono") + "  v_res := v_res || jsonb_build_object('de_novo', v_j ->> 'erro');\n"
        + conexao("v_k2", usado_ha="16 minutes") + confirmar("v_k2", "v_dono") + "  v_res := v_res || jsonb_build_object('velha', v_j ->> 'erro');\n"
        + f"  update {S}.app_config set valor = jsonb_build_object('liberada', false) where chave = 'mercadopago_conta';\n"
        + conexao("v_k2") + confirmar("v_k2", "v_dono") + "  v_res := v_res || jsonb_build_object('flag', v_j ->> 'erro');\n",
        {"sem_login": "sem_login", "aluno": "outra_pessoa", "nada": 0, "dono": "ok", "integ": "ativa/oauth/777", "cifras": True,
         "con": "ok/true", "modo": "mercadopago_conta", "de_novo": "invalido", "velha": "vencido", "flag": "mp_conta_em_teste"})
    recomeca = f"  {sair_pix}\n  delete from {INTEG};\n"
    b[17] = (
        "  -- a) a antiga (777) com um Pix do MP aberto até amanhã → trocar para a 888 = outra_conta; a integração segue na 777\n"
        + integracao(collector=777) + cobranca_mp("v_c", 777, "now() + interval '1 day'", "17A") + conexao("v_k", 888) + confirmar("v_k", "v_dono")
        + f"""  v_res := v_res || jsonb_build_object('aberto', v_j ->> 'erro', 'abertos', (v_j ->> 'abertos')::int,
    'segue', (select mp_user_id from {INTEG}), 'con', (select resultado from {S}.mp_conexoes where id = v_k));
  -- b) o Pix venceu ontem → passa (a integração vira a 888)
  update {S}.cobrancas set pix_expira_em = now() - interval '1 day' where id = v_c;
""" + conexao("v_k2", 888) + confirmar("v_k2", "v_dono")
        + f"  v_res := v_res || jsonb_build_object('vencido', v_j ->> 'resultado', 'agora', (select mp_user_id from {INTEG}));\n"
        + "  -- c) a automática viva da 777 numa OUTRA conta do Physiq não conta (MENOR 29)\n"
        + f"  delete from {S}.cobrancas where id = v_c;\n" + recomeca + integracao(collector=777) + outro_paciente()
        + "  if v_pac2 is null then\n    v_res := v_res || jsonb_build_object('outra_conta_do_physiq', 'sem matricula de outra conta');\n  else\n"
        + dentro(assinatura("authorized", "777", "17C", pac="v_pac2") + conexao("v_k", 888) + confirmar("v_k", "v_dono"))
        + "    v_res := v_res || jsonb_build_object('outra_conta_do_physiq', v_j ->> 'resultado');\n  end if;\n"
        + "  -- d) a desconectada há 3 dias COM token e o Pix aberto → outra_conta (decisão 10)\n"
        + recomeca + integracao("desconectada", collector=777, desconectada_ha="3 days")
        + cobranca_mp("v_c", 777, "now() + interval '1 day'", "17D") + conexao("v_k2", 888) + confirmar("v_k2", "v_dono")
        + "  v_res := v_res || jsonb_build_object('desconectada_3d', v_j ->> 'erro');\n",
        {"aberto": "outra_conta", "abertos": 1, "segue": 777, "con": "outra_conta", "vencido": "ok", "agora": 888,
         "outra_conta_do_physiq": "ok", "desconectada_3d": "outra_conta"})
    b[18] = (
        "  -- a) no MP do Physiq com automática viva: a integração fica gravada, o modo NÃO troca (o gatilho recusa dentro do bloco)\n"
        + f"  update {S}.contas set recebimento_modo = 'mercadopago' where id = v_conta;\n" + assinatura("authorized", "null", "18")
        + conexao("v_k") + confirmar("v_k", "v_dono")
        + f"  v_res := v_res || jsonb_build_object('com_viva', v_j ->> 'resultado', 'integ', (select status from {INTEG}), 'modo1', {MODO});\n"
        + "  -- b) sem automática viva: troca\n"
        + f"  update {S}.aluno_assinaturas set status = 'cancelled' where mp_preapproval_id = '{PRE}PRE-18';\n"
        + conexao("v_k2") + confirmar("v_k2", "v_dono")
        + f"""  v_res := v_res || jsonb_build_object('sem_viva', v_j ->> 'resultado', 'modo2', {MODO},
    'eventos', (select count(*) from {S}.conta_eventos where conta_id = v_conta and depois ->> 'w2' = 'mp_conectado' and em = now()));
""",
        {"com_viva": "conectado_sem_trocar", "integ": "ativa", "modo1": "mercadopago", "sem_viva": "ok", "modo2": "mercadopago_conta",
         "eventos": 2})
    return b


TEXTOS = {
    1: "o CHECK aceita mercadopago_conta (com a integração ativa); um modo inventado segue recusado",
    2: "entrar no MP da conta sem a integração: recusado para o dono, o postgres e o service_role",
    3: "o dono liga com a integração ativa; desconectada ou erro, não",
    4: "sair de um MP com automática viva: recusado (MP da conta e MP do Physiq; dono e postgres); cancelada, passa",
    5: "sair do MP da conta marca a integração desconectada (a trava some; os tokens ficam os 7 dias)",
    6: "master_conta_acao: não liga o MP da conta; automaticas_ativas antes do gatilho; sem automática troca; sem modo → modo_invalido",
    7: "o app não lê a integração, as conexões nem a w27_conta_linha (I7) e não grava o collector (cobrancas e aluno_assinaturas)",
    8: "o CHECK da integração (cifra v1, ativa com token, refresh do OAuth ou sem_renovacao, origem, a data da desconexão)",
    9: "o CHECK do redirect da conexão no staging (o próprio e o de teste; nunca o do public nem outro) e o par e o collector da 'confirmar'",
    10: "a trava da renovação (mp_integracao_reservar)",
    11: "a faxina do mp_contas_renovar_disparar (7 dias, states de 1 dia, o par não confirmado em 15 min)",
    12: "o master vê o MP da conta sem token nem cifra; master_integracoes conta o mercadopago_conta",
    13: "a conta encerrada perde a integração do MP",
    15: "C1: a guarda da W1b segue de pé com a da W2 ao lado (INSERT e UPDATE do dono não gravam o MP nem o collector)",
    16: "I8: a confirmação só passa para quem começou e é dono (cifras copiadas, par apagado, modo trocado; invalido, vencido, flag)",
    17: "I5 + MENOR 29: trocar de conta do MP espera o que está aberto na antiga, só nos alunos desta conta",
    18: "o modo na confirmação: com automática viva no MP de antes conecta sem trocar; sem ela troca",
}


def casos(nums: list[int]) -> None:
    todos = blocos()
    for n in nums:
        corpo, esperado = todos[n]
        try:
            r = bloco(corpo)
        except Exception as e:  # noqa: BLE001
            p.check(False, f"[{n}] quebrou: {e!r}"[:400])
            continue
        # o postgres da Management API pode não trocar para o service_role: o caso 2 aceita (o servidor de verdade fica com o api.py)
        sem_troca = n == 2 and r == {**esperado, "service_role": "sem_troca"}
        p.check(r == esperado or sem_troca, f"[{n}] {TEXTOS[n]} ({json.dumps(r, ensure_ascii=False)})")


# ───────────────────────── catálogo (só leitura) e a foto ─────────────────────────

def corpo_da_migration(nome: str, s: str) -> str:
    """O corpo de uma função como a migration grava (o prosrc: entre o `as $$` e o `$$;`), com o {schema} trocado."""
    t = MIGRATION.read_text(encoding="utf-8")
    i = t.index(f"create or replace function {{schema}}.{nome}(")
    ini = t.index("as $$", i) + len("as $$")
    return t[ini:t.index("\n$$;", ini) + 1].replace("{schema}", s)


def consultas_do_catalogo(s: str) -> dict[str, str]:
    lst = lambda xs: ", ".join(f"'{x}'" for x in xs)  # noqa: E731
    priv = "has_table_privilege('{p}', c.oid, 'SELECT') or has_table_privilege('{p}', c.oid, 'INSERT') or " \
           "has_table_privilege('{p}', c.oid, 'UPDATE') or has_table_privilege('{p}', c.oid, 'DELETE')"
    return {
        "colunas": f"""select c.relname as tabela, count(*)::int as n from pg_attribute a join pg_class c on c.oid = a.attrelid
                         join pg_namespace ns on ns.oid = c.relnamespace
                        where ns.nspname = '{s}' and a.attnum > 0 and not a.attisdropped
                          and ((c.relname = 'recebimento_integracoes' and a.attname in ({lst(COLUNAS_INTEGRACAO)}))
                            or (c.relname = 'mp_conexoes' and a.attname in ({lst(COLUNAS_CONEXAO)}))
                            or (c.relname in ('cobrancas', 'aluno_assinaturas') and a.attname = 'mp_collector_id'))
                        group by 1 order by 1""",
        "tabelas": f"""select c.relname as tabela, c.relrowsecurity as rls, ({priv.format(p='authenticated')}) as app,
                              ({priv.format(p='anon')}) as anon, ({priv.format(p='service_role')}) as servidor
                         from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                        where ns.nspname = '{s}' and c.relname in ('mp_conexoes', 'recebimento_integracoes') order by 1""",
        "funcoes": f"""select p.proname as nome, p.prosecdef as definer, coalesce(p.proconfig::text, '') as config, md5(p.prosrc) as corpo,
                              has_function_privilege('authenticated', p.oid, 'EXECUTE') as app, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                              has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor
                         from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                        where ns.nspname = '{s}' and p.proname in ({lst(CORPOS)}) order by 1""",
        "gatilhos": f"""select c.relname as tabela, t.tgname as gatilho, t.tgenabled::text as ligado, t.tgtype::int as tipo, p.proname as funcao
                          from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
                          join pg_proc p on p.oid = t.tgfoid
                         where ns.nspname = '{s}' and not t.tgisinternal and t.tgname in ({lst(g for _, g in GATILHOS)}) order by 1, 2""",
        # a mesma consulta da Task 0 (Step 3b): o gatilho da W1b achado pelo CORPO (congela o MP para o authenticated)
        "w1b": f"""select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
                     join pg_proc p on p.oid = t.tgfoid
                    where c.relname = 'cobrancas' and ns.nspname = '{s}' and not t.tgisinternal and t.tgenabled <> 'D'
                      and p.prosrc like '%mp_payment_id%' and p.prosrc like '%authenticated%' and p.prosrc like '%pix_copia_cola%'""",
        "job": f"select schedule, command from cron.job where jobname = 'mp-renovar-{s}'",
        "flags": f"select chave, valor::text as valor, publica from {s}.app_config where chave in ('mercadopago_conta', 'mp_webhook') order by 1",
        "checks": f"""select c.conname as nome, pg_get_constraintdef(c.oid) as def from pg_constraint c
                       where c.conrelid in ('{s}.contas'::regclass, coalesce(to_regclass('{s}.mp_conexoes'), '{s}.contas'::regclass))
                         and c.conname in ('contas_recebimento_modo_check', 'mp_conexoes_check') order by 1""",
    }


def catalogo(s: str) -> None:
    q = consultas_do_catalogo(s)
    cols = {x["tabela"]: x["n"] for x in ler(q["colunas"])}
    esperado = {"aluno_assinaturas": 1, "cobrancas": 1, "mp_conexoes": len(COLUNAS_CONEXAO), "recebimento_integracoes": len(COLUNAS_INTEGRACAO)}
    p.check(cols == esperado, f"[{s}] as colunas novas (integração {len(COLUNAS_INTEGRACAO)}, conexões {len(COLUNAS_CONEXAO)}, o collector em "
                              f"cobrancas e aluno_assinaturas) ({cols})")
    t = {x["tabela"]: x for x in ler(q["tabelas"])}
    p.check(len(t) == 2 and all(x["rls"] and not x["app"] and not x["anon"] and x["servidor"] for x in t.values()),
            f"[{s}] mp_conexoes e recebimento_integracoes: RLS ligado, nada para o app e o anon, tudo para o servidor ({list(t.values())})")
    f = {x["nome"]: x for x in ler(q["funcoes"])}
    faltam = [n for n in CORPOS if n not in f]
    p.check(not faltam, f"[{s}] as funções da W2 existem ({len(f)}/{len(CORPOS)}; faltam {faltam})")
    internas = [f[n] for n in INTERNAS if n in f]
    p.check(len(internas) == len(INTERNAS) and all("search_path=" in x["config"] and not x["app"] and not x["anon"] for x in internas),
            f"[{s}] as {len(INTERNAS)} internas novas: search_path e sem EXECUTE para o app e o anon "
            f"({[(x['nome'], x['app'], x['anon']) for x in internas if x['app'] or x['anon'] or 'search_path=' not in x['config']]})")
    servidor = [n for n in ("mp_automaticas_vivas", "mp_integracao_reservar", "mp_contas_renovar_disparar") if f.get(n, {}).get("servidor")]
    p.check(len(servidor) == 3, f"[{s}] o servidor executa as 3 internas que não são de gatilho ({servidor})")
    c = f.get("recebimento_mp_confirmar") or {}
    p.check(c.get("definer") is True and "search_path=" in c.get("config", "") and c.get("app") is True and c.get("servidor") is True
            and c.get("anon") is False,
            f"[{s}] recebimento_mp_confirmar: definer com search_path, EXECUTE para authenticated e service_role, NÃO para anon "
            f"({c.get('definer')}, app {c.get('app')}, anon {c.get('anon')}, servidor {c.get('servidor')})")
    w = f.get("w27_conta_linha") or {}
    p.check(w.get("app") is False and w.get("anon") is False and w.get("servidor") is True,
            f"[{s}] I7: a w27_conta_linha segue só do servidor (app {w.get('app')}, anon {w.get('anon')}, servidor {w.get('servidor')})")
    m = f.get("master_conta_acao") or {}
    p.check(m.get("app") is True and m.get("anon") is False, f"[{s}] a master_conta_acao como a w27 deixou (app {m.get('app')}, anon {m.get('anon')})")
    diferentes = [n for n in CORPOS if n in f and f[n]["corpo"] != hashlib.md5(corpo_da_migration(n, s).encode("utf-8")).hexdigest()]
    p.check(not diferentes and not faltam, f"[{s}] os {len(CORPOS)} corpos no banco são os da migration 20261011210000 (diferentes: {diferentes})")
    g = {(x["tabela"], x["gatilho"]): x for x in ler(q["gatilhos"])}
    ruins = [k for k, (fn, tipo) in GATILHOS.items() if not (g.get(k) and g[k]["ligado"] == "O" and g[k]["tipo"] == tipo and g[k]["funcao"] == fn)]
    p.check(not ruins, f"[{s}] os gatilhos ligados: o da W1b (C1) e os 3 da W2, com o tipo e a função certos (errados: {ruins})")
    n = ler(q["w1b"])[0]["n"]
    p.check(n >= 1, f"[{s}] C1: a guarda da W1b em cobrancas ligada (a consulta da Task 0, pelo corpo) ({n})")
    j = ler(q["job"])
    p.check(len(j) == 1 and j[0]["schedule"] == "41 * * * *" and f"{s}.mp_contas_renovar_disparar()" in j[0]["command"],
            f"[{s}] o pg_cron mp-renovar-{s} de hora em hora, no minuto 41 ({j})")
    fl = {x["chave"]: x for x in ler(q["flags"])}
    p.check(set(fl) == {"mercadopago_conta", "mp_webhook"} and not any(x["publica"] for x in fl.values()),
            f"[{s}] as 2 flags (só o servidor lê): {[(k, x['valor']) for k, x in fl.items()]}")
    ck = {x["nome"]: x["def"] for x in ler(q["checks"])}
    modo = ck.get("contas_recebimento_modo_check", "")
    p.check(all(f"'{v}'" in modo for v in ("pix_manual", "nenhum", "mercadopago", "infinitepay", "mercadopago_conta")),
            f"[{s}] o CHECK do modo tem os 4 de antes + mercadopago_conta")
    red = ck.get("mp_conexoes_check", "")
    p.check(f"mp-conectar-retorno/{s}'" in red and ("mp-conectar-retorno/staging'" not in red or s == "staging"),
            f"[{s}] o CHECK do redirect da conexão aceita o endereço próprio do {s} (o de teste do MP só vale com '{s}' = 'staging')")


def foto() -> dict:
    w2 = tem_w2()
    conta = f"""(select c.id from {S}.contas c join auth.users u on u.id = c.dono_id where lower(u.email) = '{DONO}' and c.origem <> 'app'
                 order by c.criado_em limit 1)"""
    return ler(f"""select (select recebimento_modo from {S}.contas where id = {conta}) as modo,
                          (select count(*) from {S}.recebimento_integracoes where conta_id = {conta})::int as integracoes,
                          (select md5(coalesce(string_agg(a.id::text || a.status || coalesce(a.mp_preapproval_id, '') || a.atualizado_em::text, ','
                                                          order by a.id), ''))
                             from {S}.aluno_assinaturas a join {S}.pacientes pa on pa.id = a.paciente_id where pa.conta_id = {conta}) as assinaturas,
                          (select md5(coalesce(string_agg(c.id::text || c.status || coalesce(c.forma, '') || coalesce(c.mp_payment_id, '')
                                                          || c.updated_at::text, ',' order by c.id), ''))
                             from {S}.cobrancas c join {S}.pacientes pa on pa.id = c.paciente_id join auth.users u on u.id = pa.user_id
                            where lower(u.email) = '{ALUNO}') as cobrancas,
                          (select count(*) from {S}.conta_eventos where conta_id = {conta})::int as eventos,
                          (select count(*) from {S}.cobrancas where origem = '{ORIGEM}')::int as teste,
                          (select count(*) from {S}.aluno_assinaturas where mp_preapproval_id like '{PRE}%')::int as automaticas_teste,
                          (select valor::text from {S}.app_config where chave = 'mercadopago_conta') as flag,
                          {f"(select count(*) from {S}.mp_conexoes where conta_id = {conta})::int" if w2 else "0"} as conexoes""")[0]


def desfazer(antes: dict) -> None:
    """Os blocos voltam sozinhos (terminam com erro): o que sobrar com a marca de teste sai, e a foto tem que ser a mesma."""
    escrever(f"delete from {S}.cobrancas where origem = '{ORIGEM}'")
    escrever(f"delete from {S}.aluno_assinaturas where mp_preapproval_id like '{PRE}%'")
    if tem_w2():
        escrever(f"delete from {S}.mp_conexoes where verificador = '{CIFRA_V}' or mp_apelido like '{MARCA}%'")
        escrever(f"delete from {S}.recebimento_integracoes where provedor = 'mercadopago' and mp_apelido like '{MARCA}%'")
    depois = foto()
    p.check(depois == antes and depois["teste"] == 0 and depois["automaticas_teste"] == 0,
            f"[14] nada ficou gravado: a foto da conta de TESTE é a mesma (modo {antes['modo']} → {depois['modo']}, integrações "
            f"{antes['integracoes']} → {depois['integracoes']}, conexões {antes['conexoes']} → {depois['conexoes']}, eventos "
            f"{antes['eventos']} → {depois['eventos']}, '{ORIGEM}': {depois['teste']}, automáticas '{PRE}': {depois['automaticas_teste']}, "
            f"assinaturas e cobranças iguais: {depois['assinaturas'] == antes['assinaturas'] and depois['cobrancas'] == antes['cobrancas']})")


# ───────────────────────── seco e main ─────────────────────────

def seco(s: str, nums: list[int]) -> int:
    print("── seco: os blocos e as consultas montados e conferidos aqui — NADA vai ao banco")
    if s == S:
        todos = blocos()
        for n in nums:
            corpo, esperado = todos[n]
            q = bloco_sql(corpo)
            voltas = q.count("perform set_config('role', 'postgres', true)")
            trocas = q.count("perform set_config('role', '") - voltas
            ok = (q.startswith("do $t$") and q.endswith("end $t$;") and q.count("$t$") == 2 and "{" not in q.replace("'{}'", "")
                  and q.count("RESULTADO<<%>>") == 2 and trocas == voltas and q.count(" begin\n") == q.count(" end;\n"))
            tam = len(json.dumps(esperado))
            p.check(ok and tam <= TETO_RESULTADO, f"seco [{n}]: bloco de {len(q)} bytes bem formado (cada 'como o app' tem o seu volta; "
                                                  f"os begin fecham); o resultado esperado tem {tam} caracteres (teto {TETO_RESULTADO})")
    corpos = {n: corpo_da_migration(n, s) for n in CORPOS}
    p.check(all(c.strip() and "{schema}" not in c for c in corpos.values()),
            f"seco: os {len(corpos)} corpos lidos da migration, com o schema {s} ({sum(len(c) for c in corpos.values())} bytes)")
    q = consultas_do_catalogo(s)
    outro = "public" if s == S else S
    p.check(all(f"'{s}'" in v or f"{s}." in v or f"-{s}'" in v for v in q.values()) and not any(f"'{outro}'" in v or f" {outro}." in v for v in q.values()),
            f"seco: as {len(q)} consultas do catálogo só leem o {s}")
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W2 — o Mercado Pago do personal no banco")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap.add_argument("--casos", default=",".join(map(str, CASOS)), help="só no staging (padrão: todos)")
    ap.add_argument("--so-catalogo", action="store_true", help="só leitura (vale no public)")
    ap.add_argument("--seco", action="store_true", help="só monta e confere: nada vai ao banco")
    a = ap.parse_args()
    try:
        nums = [int(c) for c in a.casos.split(",") if c.strip()]
    except ValueError:
        ap.error(f"casos: {', '.join(map(str, CASOS))}")
    if any(n not in CASOS for n in nums):
        ap.error(f"casos: {', '.join(map(str, CASOS))} (o 14 roda sempre, no fim)")
    if a.seco:
        return seco(a.schema, nums)
    if LOCAL:
        print(f"── ENSAIO LOCAL: o Postgres descartável do socket {LOCAL} (não é o Supabase)")
    if a.so_catalogo or a.schema != S:
        catalogo(a.schema)
        return p.fim()
    antes = foto()
    try:
        casos(nums)
    finally:
        desfazer(antes)
    catalogo(S)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
