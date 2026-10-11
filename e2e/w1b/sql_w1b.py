#!/usr/bin/env python3
"""Physiq W1b — a guarda cobrancas_guard_mp NO BANCO (20261011220000_w1b_guarda_cobrancas_mp.sql; C1 da revisão do plano da W2: o app
gravava forma, status e mp_payment_id em cobrancas e a pagamentos-aluno estornava esse id com o token do Physiq). O molde do
e2e/w1/sql_w1.py: cada caso com escrita é um bloco que termina com erro de propósito (nada fica gravado) e devolve o resultado na
mensagem do erro. Os passos "como o app" usam o papel authenticated com o sub da conta de TESTE (prof2 = dono da conta "Rafael Lima";
aluno2 = aluno dele; admin.teste = master), como o e2e/hml01/banco.py.
Casos (staging):
  forjado     o ataque do C1 pelo app: INSERT da avulsa "paga pelo MP" (forma mp, status paga, mp_payment_id, mp_status,
              mp_preapproval_id, pix_* e reembolsado_em) → a linha nasce comum: forma e as 7 colunas do MP nulas; status e descrição
              como mandados
  linha_mp    na linha do MP gravada pelo servidor, o dono troca id, status, forma, mp_*, pix_* e reembolsado_em → nada muda (a descrição
              muda); paga, ele não a cancela nem marca estorno
  servidor    o postgres (migrações, scripts), o service_role (as funções — se o postgres da Management API puder trocar de papel) e o
              master gravam o MP
  livre       o que o app faz hoje segue: a avulsa aberta sem forma (o molde do e2e/wp/api.py:722-727), paga no Pix manual, cancelada,
              apagada; a linha do Pix manual não vira do MP
  juntas      as 3 guardas juntas (W1, W1b, W-P): forma infinitepay, ip_handle, meses_cobertos e mp_payment_id no padrão
  (revisão da W1b, 11/10)
  mover       M1: na linha do MP paga, o dono troca o aluno (para o aluno-calc, de OUTRA conta de TESTE), o tipo e a origem e depois a
              conta, quem criou e o responsável → nada disso muda (a descrição muda). Sem o M1, a 1ª troca passa (a policy de UPDATE só
              olha a conta e quem criou) e a 2ª dá -1 (o WITH CHECK recusa)
  upsert      M3: o upsert do PostgREST (Prefer: resolution=merge-duplicates = on conflict do update) do dono na linha do MP do servidor
              → o MP fica como estava (o BEFORE INSERT zera o proposto e o BEFORE UPDATE devolve o velho); a descrição muda
  responsavel M3: o membro que NÃO é dono (o prof1 de TESTE vira personal da conta do prof2 e responsável por uma matrícula sem login SÓ
              dentro do bloco, que volta inteiro): o ataque do C1 pelo INSERT vira uma avulsa comum, e na linha do MP que ele criou não
              troca o MP nem de quem ela é
Sempre:
  catálogo    (só leitura; vale no public) o gatilho existe e está ligado, BEFORE INSERT OR UPDATE por linha; a função é security
              invoker, com search_path vazio, sem EXECUTE para o app e o anon e com o MESMO corpo da migration; as 15 colunas existem;
              as 3 guardas de cobrancas estão lá; nenhum sinal do ataque (cobrança com o mp_payment_id de uma fatura do plano)
  foto        (staging) a foto de antes — as cobranças da matrícula de TESTE, as 'teste_w1b', a matrícula do responsável e o prof1 na
              conta do prof2 — é a mesma no fim: o desfazer apaga o que sobrou (nada, os blocos voltam sozinhos) e confere
Uso: python3 e2e/w1b/sql_w1b.py [--casos forjado,linha_mp,…]   (staging: os casos + o catálogo + a foto)
     python3 e2e/w1b/sql_w1b.py --schema public                (só leitura: o catálogo e o sinal do ataque)
     python3 e2e/w1b/sql_w1b.py --seco [--schema …]            (monta os blocos e confere o formato e o tamanho: NADA vai ao banco)
Antes da migration os casos ficam ❌ (o vermelho): rode depois do --so staging.
Ensaio local (sem Supabase): PHYSIQ_SQL_LOCAL=<pasta do socket de um Postgres descartável> — o mesmo script contra o modelo de
~/projetos/physiqcalc-scratch/w1b/ (só aceita uma pasta de socket: nunca vai à rede).
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
ORIGEM = "teste_w1b"
RESP = "prof1.teste.claude@physiqcalc.app"   # o responsável que NÃO é dono: membro e responsável SÓ dentro do bloco (que volta inteiro)
OUTRO_ALUNO = "teste@teste.com"              # o aluno-calc (TESTE), na conta do master de teste: o "outro aluno" do caso mover (M1)
MARCA_RESP = "teste w1b responsável"         # o nome da matrícula sem login que o bloco do responsável cria (e que volta com ele)
MIGRATION = Path(__file__).resolve().parents[2] / "supabase-principal/migrations/20261011220000_w1b_guarda_cobrancas_mp.sql"
# as colunas que a guarda lê: as 9 do MP e (revisão, M1) as 6 de quem é a linha do MP
COLUNAS = ("forma", "status", "mp_payment_id", "mp_status", "mp_preapproval_id", "pix_qr", "pix_copia_cola", "pix_expira_em", "reembolsado_em",
           "paciente_id", "conta_id", "tipo", "criado_por", "nutricionista_id", "origem")
MP_7 = "num_nonnulls(mp_payment_id, mp_status, mp_preapproval_id, pix_qr, pix_copia_cola, pix_expira_em, reembolsado_em)"
# o RuntimeError do _comum.sql_mgmt corta a resposta de erro em 500 caracteres: o resultado de um bloco cabe com folga abaixo disto
TETO_RESULTADO = 300
CASOS = ("forjado", "linha_mp", "servidor", "livre", "juntas", "mover", "upsert", "responsavel")
TIPO_BEFORE_INSERT_UPDATE_ROW = 1 | 2 | 4 | 16
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


# ───────────────────────── os blocos (o molde do e2e/w1/sql_w1.py) ─────────────────────────

def como(uid: str, master: bool = False) -> str:
    """Daqui em diante o bloco roda como o app (authenticated) com o sub de `uid` (uma variável do bloco)."""
    meta = ", 'app_metadata', json_build_object('role', 'master')" if master else ""
    return (f"  perform set_config('request.jwt.claims', json_build_object('sub', {uid}, 'role', 'authenticated'{meta})::text, true);\n"
            "  perform set_config('role', 'authenticated', true);\n")


VOLTA = "  perform set_config('role', 'postgres', true);\n  perform set_config('request.jwt.claims', '', true);\n"


def bloco_sql(corpo: str) -> str:
    return f"""do $t$
declare v_dono uuid; v_aluno uuid; v_master uuid; v_resp uuid; v_conta uuid; v_pac uuid; v_c uuid; v_c2 uuid; v_pac2 uuid; v_conta2 uuid;
        v_antes text; v_n integer; v_n2 integer; v_res jsonb := '{{}}'::jsonb;
begin
  select u.id into v_dono from auth.users u where lower(u.email) = '{DONO}';
  select u.id into v_aluno from auth.users u where lower(u.email) = '{ALUNO}';
  select u.id into v_master from auth.users u where lower(u.email) = '{MASTER}';
  select u.id into v_resp from auth.users u where lower(u.email) = '{RESP}';
  select c.id into v_conta from {S}.contas c where c.dono_id = v_dono and c.origem <> 'app' order by c.criado_em limit 1;
  select pa.id into v_pac from {S}.pacientes pa where pa.user_id = v_aluno and pa.conta_id = v_conta and pa.deleted_at is null limit 1;
  if v_conta is null or v_pac is null or v_master is null then
    raise exception 'RESULTADO<<%>>', jsonb_build_object('erro', 'sem a conta ou a matricula de TESTE')::text;
  end if;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;"""


def bloco(corpo: str) -> dict:
    return _resultado(bloco_sql(corpo))


def forjada(var: str = "v_c", **troca: str) -> str:
    """O POST /rest/v1/cobrancas do C1 (c1-verificacao §4, passo 2), como o dono: a avulsa "paga pelo MP" com um id de pagamento."""
    campos = {"paciente_id": "v_pac", "conta_id": "v_conta", "nutricionista_id": "v_dono", "criado_por": "v_dono",
              "descricao": "'teste w1b forjada'", "valor": "10", "vencimento": "current_date", "tipo": "'avulsa'", "status": "'paga'",
              "forma": "'mp'", "mp_payment_id": "'W1B-FORJADO'", "mp_status": "'approved'", "mp_preapproval_id": "'W1B-PRE'",
              "pix_qr": "'QR'", "pix_copia_cola": "'COPIA'", "pix_expira_em": "now() + interval '1 day'", "reembolsado_em": "now()",
              "origem": f"'{ORIGEM}'", **troca}
    return (f"  insert into {S}.cobrancas ({', '.join(campos)})\n  values ({', '.join(campos.values())}) returning id into {var};\n")


def do_servidor(var: str = "v_c", **troca: str) -> str:
    """Uma linha do MP como a pagamentos-aluno grava (aqui pelo postgres): a avulsa do dono com o Pix aguardando."""
    campos = {"paciente_id": "v_pac", "conta_id": "v_conta", "nutricionista_id": "v_dono", "criado_por": "v_dono",
              "descricao": "'teste w1b do servidor'", "valor": "10", "vencimento": "current_date", "tipo": "'avulsa'",
              "status": "'aguardando_confirmacao'", "forma": "'mp'", "metodo": "'pix'", "mp_payment_id": "'W1B-REAL'", "mp_status": "'pending'",
              "pix_qr": "'QR'", "pix_copia_cola": "'COPIA'", "pix_expira_em": "now() + interval '3 days'", "origem": f"'{ORIGEM}'", **troca}
    return (f"  insert into {S}.cobrancas ({', '.join(campos)})\n  values ({', '.join(campos.values())}) returning id into {var};\n")


def foto_mp(var: str = "v_c") -> str:
    return f"(select md5(row({', '.join(COLUNAS)})::text) from {S}.cobrancas where id = {var})"


def dentro(sql: str) -> str:
    """Um nível a mais de recuo (o corpo de um if do bloco)."""
    return "".join(f"  {linha}" if linha.strip() else linha for linha in sql.splitlines(keepends=True))


def se_tem(var: str, falta: str, corpo: str) -> str:
    """O caso só roda se a variável do bloco existir; senão o resultado diz o que falta (o caso fica ❌ com o motivo)."""
    return (f"  if {var} is null then\n    v_res := jsonb_build_object('erro', '{falta}');\n  else\n" + dentro(corpo) + "  end if;\n")


def outro_aluno() -> str:
    """A matrícula do aluno-calc (TESTE) em OUTRA conta: para onde o caso mover (M1) tenta levar a linha do MP."""
    return (f"  select pa.id, pa.conta_id into v_pac2, v_conta2 from {S}.pacientes pa join auth.users u on u.id = pa.user_id\n"
            f"   where lower(u.email) = '{OUTRO_ALUNO}' and pa.conta_id is distinct from v_conta and pa.deleted_at is null\n"
            "   order by pa.created_at limit 1;\n")


def mover(autor_novo: str) -> str:
    """O M1 pelo REST, como quem está logado: 1º o aluno, o tipo e a origem (a policy de UPDATE só olha a conta e quem criou: sem a
    guarda a linha muda de aluno); 2º a conta, quem criou e o responsável (sem a guarda o WITH CHECK recusa: -1). v_n e v_n2 = linhas."""
    return (f"""  update {S}.cobrancas set paciente_id = v_pac2, tipo = 'mensalidade', origem = 'migrado_calc', descricao = 'teste w1b movida'
   where id = v_c;
  get diagnostics v_n = row_count;
  begin
    update {S}.cobrancas set conta_id = v_conta2, criado_por = {autor_novo}, nutricionista_id = {autor_novo} where id = v_c;
    get diagnostics v_n2 = row_count;
  exception when insufficient_privilege then
    v_n2 := -1;
  end;
""")


def responsavel_na_conta() -> str:
    """Só dentro do bloco (ele volta inteiro): o prof1 (TESTE) vira personal e nutricionista da conta do prof2 e responsável por uma
    matrícula sem login (v_pac2) — o membro que NÃO é dono da policy "membro cria" (w02 :794)."""
    return (f"""  update {S}.conta_membros set papeis = array['personal', 'nutricionista'], status = 'ativo' where conta_id = v_conta and user_id = v_resp;
  if not found then
    insert into {S}.conta_membros (conta_id, user_id, papeis, status) values (v_conta, v_resp, array['personal', 'nutricionista'], 'ativo');
  end if;
  insert into {S}.pacientes (conta_id, personal_id, nutricionista_id, nome) values (v_conta, v_resp, v_resp, '{MARCA_RESP}')
  returning id into v_pac2;
""")


def blocos() -> dict[str, tuple[str, dict]]:
    """Os 5 casos com escrita desfeita: nome → (o bloco, o resultado esperado)."""
    b: dict[str, tuple[str, dict]] = {}
    b["forjado"] = (
        como("v_dono") + forjada() + VOLTA
        + f"""  v_res := (select jsonb_build_object('forma', forma, 'mp', {MP_7}, 'status', status, 'desc', descricao = 'teste w1b forjada')
                from {S}.cobrancas where id = v_c);
""",
        {"forma": None, "mp": 0, "status": "paga", "desc": True})
    b["linha_mp"] = (
        do_servidor() + f"  v_antes := {foto_mp()};\n" + como("v_dono")
        + f"""  update {S}.cobrancas set mp_payment_id = 'W1B-FORJADO', status = 'paga', forma = 'pix_manual', mp_status = 'approved',
         mp_preapproval_id = 'W1B-PRE', pix_qr = null, pix_copia_cola = 'OUTRO', pix_expira_em = null, reembolsado_em = now(),
         descricao = 'teste w1b editada' where id = v_c;
  get diagnostics v_n = row_count;
""" + VOLTA + f"""  v_res := jsonb_build_object('linhas', v_n, 'mp_igual', {foto_mp()} = v_antes,
                             'desc', (select descricao = 'teste w1b editada' from {S}.cobrancas where id = v_c));
  update {S}.cobrancas set status = 'paga', mp_status = 'approved', pago_em = now() where id = v_c;   -- o MP aprovou (o servidor)
""" + como("v_dono") + f"  update {S}.cobrancas set status = 'cancelada', reembolsado_em = now() where id = v_c;\n" + VOLTA
        + f"  v_res := v_res || jsonb_build_object('paga', (select status = 'paga' and reembolsado_em is null from {S}.cobrancas where id = v_c));\n",
        {"linhas": 1, "mp_igual": True, "desc": True, "paga": True})
    b["servidor"] = (
        do_servidor()
        + f"""  update {S}.cobrancas set mp_payment_id = 'W1B-PG', status = 'cancelada', forma = 'manual', reembolsado_em = now() where id = v_c;
  v_res := jsonb_build_object('postgres', (select mp_payment_id = 'W1B-PG' and status = 'cancelada' and forma = 'manual'
                                            and reembolsado_em is not null from {S}.cobrancas where id = v_c));
  begin
    perform set_config('role', 'service_role', true);
    update {S}.cobrancas set mp_payment_id = 'W1B-SR', forma = 'mp', status = 'paga', pix_copia_cola = null where id = v_c;
""" + VOLTA.replace("  perform", "    perform") + f"""    v_res := v_res || jsonb_build_object('service_role', (select mp_payment_id = 'W1B-SR' and forma = 'mp' and status = 'paga'
                                                                 and pix_copia_cola is null from {S}.cobrancas where id = v_c));
  exception when insufficient_privilege then
    v_res := v_res || jsonb_build_object('service_role', 'sem_troca');
  end;
""" + como("v_master", master=True)
        + f"  update {S}.cobrancas set mp_payment_id = 'W1B-MASTER', forma = 'mp', status = 'aguardando_confirmacao' where id = v_c;\n"
        + forjada("v_c2", nutricionista_id="v_master", criado_por="v_master", mp_payment_id="'W1B-MASTER2'") + VOLTA
        + f"""  v_res := v_res || jsonb_build_object('master', (select mp_payment_id = 'W1B-MASTER' and forma = 'mp' from {S}.cobrancas where id = v_c)
                                              and (select forma = 'mp' and mp_payment_id = 'W1B-MASTER2' from {S}.cobrancas where id = v_c2));
""",
        {"postgres": True, "service_role": True, "master": True})
    b["livre"] = (
        como("v_dono")
        + f"""  insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status, origem)
  values (v_pac, v_conta, v_dono, v_dono, 'teste w1b avulsa', 15, current_date + 9, 'avulsa', 'aberta', '{ORIGEM}') returning id into v_c;
  update {S}.cobrancas set status = 'paga', pago_em = now(), forma = 'pix_manual' where id = v_c;
""" + VOLTA + f"""  v_res := jsonb_build_object('paga', (select status = 'paga' and forma = 'pix_manual' and pago_em is not null from {S}.cobrancas where id = v_c));
""" + como("v_dono") + f"  update {S}.cobrancas set forma = 'mp', mp_payment_id = 'W1B-FORJADO' where id = v_c;\n" + VOLTA
        + f"""  v_res := v_res || jsonb_build_object('nao_vira_mp', (select forma = 'pix_manual' and mp_payment_id is null from {S}.cobrancas where id = v_c));
""" + como("v_dono") + f"""  update {S}.cobrancas set forma = 'manual', status = 'cancelada' where id = v_c;
  update {S}.cobrancas set deleted_at = now() where id = v_c;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('fora_do_mp', (select forma = 'manual' and status = 'cancelada' and deleted_at is not null
                                                     from {S}.cobrancas where id = v_c));
""",
        {"paga": True, "nao_vira_mp": True, "fora_do_mp": True})
    b["juntas"] = (
        como("v_dono") + forjada(forma="'infinitepay'", ip_handle="'w1b.teste'", meses_cobertos="6") + VOLTA
        + f"""  v_res := (select jsonb_build_object('forma', forma, 'ip', ip_handle is null, 'meses', meses_cobertos, 'mp', {MP_7})
                from {S}.cobrancas where id = v_c);
""",
        {"forma": None, "ip": True, "meses": 1, "mp": 0})
    # revisão da W1b (11/10): M1 e M3
    b["mover"] = (
        outro_aluno()
        + se_tem("v_pac2", f"sem a matrícula de TESTE de {OUTRO_ALUNO} em outra conta",
                 do_servidor(status="'paga'", mp_status="'approved'", pago_em="now()") + f"  v_antes := {foto_mp()};\n" + como("v_dono")
                 + mover("v_aluno") + VOLTA
                 + f"""  v_res := jsonb_build_object('linhas', v_n, 'linhas2', v_n2, 'mp_igual', {foto_mp()} = v_antes,
                             'desc', (select descricao = 'teste w1b movida' from {S}.cobrancas where id = v_c));
"""),
        {"linhas": 1, "linhas2": 1, "mp_igual": True, "desc": True})
    b["upsert"] = (
        do_servidor() + f"  v_antes := {foto_mp()};\n" + como("v_dono")
        + f"""  insert into {S}.cobrancas (id, paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status,
                             forma, mp_payment_id, mp_status, reembolsado_em, origem)
  values (v_c, v_pac, v_conta, v_dono, v_dono, 'teste w1b upsert', 10, current_date, 'avulsa', 'paga', 'mp', 'W1B-FORJADO', 'approved', now(),
          '{ORIGEM}')
  on conflict (id) do update set status = excluded.status, forma = excluded.forma, mp_payment_id = excluded.mp_payment_id,
                             mp_status = excluded.mp_status, reembolsado_em = excluded.reembolsado_em, descricao = excluded.descricao;
""" + VOLTA + f"""  v_res := jsonb_build_object('mp_igual', {foto_mp()} = v_antes,
                             'desc', (select descricao = 'teste w1b upsert' from {S}.cobrancas where id = v_c));
""",
        {"mp_igual": True, "desc": True})
    b["responsavel"] = (
        se_tem("v_resp", f"sem a conta de TESTE {RESP}",
               responsavel_na_conta() + como("v_resp") + forjada(paciente_id="v_pac2", nutricionista_id="v_resp", criado_por="v_resp") + VOLTA
               + f"""  v_res := (select jsonb_build_object('forma', forma, 'mp', {MP_7}, 'status', status, 'desc', descricao = 'teste w1b forjada')
                from {S}.cobrancas where id = v_c);
""" + do_servidor("v_c2", paciente_id="v_pac2", nutricionista_id="v_resp", criado_por="v_resp", mp_payment_id="'W1B-REAL-RESP'")
               + f"  v_antes := {foto_mp('v_c2')};\n" + como("v_resp")
               + f"""  update {S}.cobrancas set mp_payment_id = 'W1B-FORJADO', status = 'paga', forma = 'pix_manual', mp_status = 'approved',
         reembolsado_em = now(), paciente_id = v_pac, tipo = 'mensalidade', origem = 'migrado_calc', descricao = 'teste w1b editada'
   where id = v_c2;
  get diagnostics v_n = row_count;
""" + VOLTA + f"""  v_res := v_res || jsonb_build_object('linhas', v_n, 'mp_igual', {foto_mp('v_c2')} = v_antes,
                                     'desc2', (select descricao = 'teste w1b editada' from {S}.cobrancas where id = v_c2));
"""),
        {"forma": None, "mp": 0, "status": "paga", "desc": True, "linhas": 1, "mp_igual": True, "desc2": True})
    return b


TEXTOS = {
    "forjado": "o ataque do C1 pelo app vira uma avulsa comum: forma e as 7 colunas do MP nulas, status e descrição como mandados",
    "linha_mp": "na linha do MP do servidor o dono não troca id, status, forma, mp_*, pix_* nem reembolsado_em (a descrição muda); paga, "
                "não vira cancelada nem estornada",
    "servidor": "o postgres, o service_role e o master gravam o MP",
    "livre": "o app segue: avulsa aberta, paga no Pix manual, cancelada e apagada; o Pix manual não vira do MP",
    "juntas": "as 3 guardas juntas (W1, W1b, W-P): forma, ip_handle, meses_cobertos e o MP no padrão",
    "mover": "M1: na linha do MP paga o dono não troca o aluno (o de outra conta), o tipo, a origem, a conta, quem criou nem o responsável "
             "(a descrição muda)",
    "upsert": "M3: o upsert do PostgREST (on conflict do update) do dono na linha do MP não grava o MP (a descrição muda)",
    "responsavel": "M3: o responsável que não é dono — o ataque do C1 pelo INSERT vira avulsa comum; na linha do MP que ele criou não troca "
                   "o MP nem de quem ela é",
}


def casos(nomes: list[str]) -> None:
    todos = blocos()
    for nome in nomes:
        corpo, esperado = todos[nome]
        try:
            r = bloco(corpo)
        except Exception as e:  # noqa: BLE001
            p.check(False, f"[{nome}] quebrou: {e!r}"[:400])
            continue
        # o postgres da Management API pode não trocar para o service_role: aí o servidor de verdade fica com a regressão w06/api mp
        sem_troca = nome == "servidor" and r == {**esperado, "service_role": "sem_troca"}
        p.check(r == esperado or sem_troca, f"[{nome}] {TEXTOS[nome]} ({r})")
        if sem_troca:
            print("   (o service_role não foi provado aqui: o e2e/w06/api.py --casos mp prova a função gravando o MP)")


# ───────────────────────── catálogo (só leitura) e a foto ─────────────────────────

def corpo_da_migration(s: str) -> str:
    """O corpo da cobrancas_guard_mp como a migration grava (o prosrc: entre o `as $$` e o `$$;`), com o {schema} trocado."""
    t = MIGRATION.read_text(encoding="utf-8")
    i = t.index("create or replace function {schema}.cobrancas_guard_mp()")
    ini = t.index("as $$", i) + len("as $$")
    return t[ini:t.index("\n$$;", ini) + 1].replace("{schema}", s)


def consultas_do_catalogo(s: str) -> dict[str, str]:
    return {
        "funcao": f"""select p.prosecdef as definer, p.proconfig::text as config, md5(p.prosrc) as corpo,
                             has_function_privilege('authenticated', p.oid, 'EXECUTE') as app, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
                             (select t.tgenabled::text from pg_trigger t where t.tgrelid = '{s}.cobrancas'::regclass and t.tgname = 'trg_cobrancas_guard_mp') as ligado,
                             (select t.tgtype::int from pg_trigger t where t.tgrelid = '{s}.cobrancas'::regclass and t.tgname = 'trg_cobrancas_guard_mp') as tipo,
                             (select t.tgfoid = p.oid from pg_trigger t where t.tgrelid = '{s}.cobrancas'::regclass and t.tgname = 'trg_cobrancas_guard_mp') as da_funcao
                        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = '{s}' and p.proname = 'cobrancas_guard_mp'""",
        "colunas": f"""select count(*)::int as n from pg_attribute a where a.attrelid = '{s}.cobrancas'::regclass and a.attnum > 0 and not a.attisdropped
                        and a.attname in ({', '.join(f"'{c}'" for c in COLUNAS)})""",
        "guardas": f"""select coalesce(array_agg(t.tgname::text order by t.tgname), '{{}}') as nomes from pg_trigger t
                        where t.tgrelid = '{s}.cobrancas'::regclass and not t.tgisinternal and t.tgname like 'trg_cobrancas_guard_%'""",
        "sinal": f"""select count(*)::int as n from {s}.cobrancas c where c.mp_payment_id is not null
                      and exists (select 1 from {s}.conta_faturas f where f.mp_payment_id = c.mp_payment_id)""",
    }


def catalogo(s: str) -> None:
    q = consultas_do_catalogo(s)
    f = (ler(q["funcao"]) or [{}])[0]
    # tgtype: ROW 1 + BEFORE 2 + INSERT 4 + UPDATE 16 = 23 (o pg_get_triggerdef tira o schema que está no search_path: não serve no public)
    p.check(f.get("ligado") == "O" and f.get("tipo") == TIPO_BEFORE_INSERT_UPDATE_ROW and f.get("da_funcao") is True,
            f"[{s}] o gatilho trg_cobrancas_guard_mp existe, está ligado e chama a guarda: BEFORE INSERT OR UPDATE, por linha "
            f"({f.get('ligado')}, tgtype {f.get('tipo')})")
    p.check(f.get("definer") is False and f.get("config") == '{"search_path=\\"\\""}',
            f"[{s}] a função é security invoker (o current_user é o de quem grava) com search_path vazio ({f.get('definer')}, {f.get('config')})")
    p.check(f.get("app") is False and f.get("anon") is False, f"[{s}] o app e o anon não executam a função ({f.get('app')}, {f.get('anon')})")
    esperado = hashlib.md5(corpo_da_migration(s).encode("utf-8")).hexdigest()
    p.check(f.get("corpo") == esperado, f"[{s}] o corpo no banco é o da migration 20261011220000 ({str(f.get('corpo'))[:8]} = {esperado[:8]})")
    n = ler(q["colunas"])[0]["n"]
    p.check(n == len(COLUNAS), f"[{s}] as {len(COLUNAS)} colunas que a guarda lê existem em cobrancas ({n})")
    nomes = ler(q["guardas"])[0]["nomes"]
    p.check(set(nomes) >= {"trg_cobrancas_guard_infinitepay", "trg_cobrancas_guard_mp", "trg_cobrancas_guard_periodo"},
            f"[{s}] as 3 guardas de cobrancas (W1, W1b, W-P — rodam em ordem alfabética) ({nomes})")
    sinal = ler(q["sinal"])[0]["n"]
    p.check(sinal == 0, f"[{s}] nenhum sinal do ataque: cobrança com o mp_payment_id de uma fatura do plano ({sinal})")


def foto() -> dict:
    r = ler(f"""select (select count(*) from {S}.cobrancas c join {S}.pacientes pa on pa.id = c.paciente_id join auth.users u on u.id = pa.user_id
                         where lower(u.email) = '{ALUNO}')::int as n,
                       (select md5(coalesce(string_agg(c.id::text || c.status || coalesce(c.forma, '') || coalesce(c.mp_payment_id, '')
                                                       || c.updated_at::text, ',' order by c.id), ''))
                          from {S}.cobrancas c join {S}.pacientes pa on pa.id = c.paciente_id join auth.users u on u.id = pa.user_id
                         where lower(u.email) = '{ALUNO}') as assinatura,
                       (select count(*) from {S}.cobrancas where origem = '{ORIGEM}')::int as teste,
                       (select count(*) from {S}.pacientes where nome = '{MARCA_RESP}')::int as resp_matricula,
                       (select md5(coalesce(string_agg(m.id::text || m.papeis::text || m.status, ',' order by m.id), ''))
                          from {S}.conta_membros m join auth.users u on u.id = m.user_id join {S}.contas c on c.id = m.conta_id
                          join auth.users d on d.id = c.dono_id
                         where lower(u.email) = '{RESP}' and lower(d.email) = '{DONO}') as resp_membro""")
    return r[0]


def desfazer(antes: dict) -> None:
    """Os blocos voltam sozinhos (terminam com erro): o que sobrar com a origem de teste sai (e a matrícula sem login do responsável,
    pela marca), e a foto tem que ser a mesma (o prof1 na conta do prof2 inclusive)."""
    escrever(f"delete from {S}.cobrancas where origem = '{ORIGEM}'")
    escrever(f"delete from {S}.pacientes where nome = '{MARCA_RESP}' and user_id is null")
    depois = foto()
    p.check(depois == antes and depois["teste"] == 0 and depois["resp_matricula"] == 0,
            f"[{S}] nada ficou gravado: a foto da matrícula de TESTE é a mesma ({antes['n']} → {depois['n']}, '{ORIGEM}': {depois['teste']}, "
            f"matrícula do responsável: {depois['resp_matricula']}, o prof1 na conta do prof2 igual: {depois['resp_membro'] == antes['resp_membro']})")


# ───────────────────────── seco e main ─────────────────────────

def seco(s: str, nomes: list[str]) -> int:
    print("── seco: os blocos e as consultas montados e conferidos aqui — NADA vai ao banco")
    if s == S:
        for nome, (corpo, esperado) in blocos().items():
            if nome not in nomes:
                continue
            q = bloco_sql(corpo)
            voltas = q.count("perform set_config('role', 'postgres', true)")
            trocas = q.count("perform set_config('role', '") - voltas
            ok = (q.startswith("do $t$") and q.endswith("end $t$;") and q.count("$t$") == 2 and "{" not in q.replace("'{}'", "")
                  and q.count("RESULTADO<<%>>") == 2 and trocas == voltas)
            tam = len(json.dumps(esperado))
            p.check(ok and tam <= TETO_RESULTADO, f"seco [{nome}]: bloco de {len(q)} bytes bem formado (cada 'como o app' tem o seu volta); "
                                                  f"o resultado esperado tem {tam} caracteres (teto {TETO_RESULTADO})")
    corpo = corpo_da_migration(s)
    p.check("current_user = 'authenticated'" in corpo and f"{s}.eh_master()" in corpo and "{schema}" not in corpo,
            f"seco: o corpo da guarda lido da migration, com o schema {s} ({len(corpo)} bytes)")
    q = consultas_do_catalogo(s)
    p.check(all(f"'{s}.cobrancas'::regclass" in v or f"{s}.cobrancas c" in v for v in q.values()),
            f"seco: as {len(q)} consultas do catálogo só leem o {s}")
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq W1b — a guarda cobrancas_guard_mp no banco")
    ap.add_argument("--schema", default="staging", choices=("staging", "public"))
    ap.add_argument("--casos", default=",".join(CASOS), help="só no staging (padrão: todos)")
    ap.add_argument("--seco", action="store_true", help="só monta e confere: nada vai ao banco")
    a = ap.parse_args()
    nomes = [c.strip() for c in a.casos.split(",") if c.strip()]
    if any(c not in CASOS for c in nomes):
        ap.error(f"casos: {', '.join(CASOS)}")
    if a.seco:
        return seco(a.schema, nomes)
    if LOCAL:
        print(f"── ENSAIO LOCAL: o Postgres descartável do socket {LOCAL} (não é o Supabase)")
    if a.schema != S:
        catalogo(a.schema)   # o public: só leitura
        return p.fim()
    antes = foto()
    try:
        casos(nomes)
    finally:
        desfazer(antes)
    catalogo(S)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
