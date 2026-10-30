#!/usr/bin/env python3
"""Physiq restaurar-login (30/10/2026) — E2E do SERVIDOR no staging: o banco (a migração 20261030010000), as 2 funções publicadas
(chave-restauracao e restaurar-login, pelo proxy api-principal como o app) e a sessão de verdade no Auth. Sem celular: o "Android" é o
autenticador virtual (e2e/restaurar_login/_autenticador.py — par ES256 de verdade, atestação none, origem android:apk-key-hash:).

Contas de TESTE (P26; já existiam — nenhuma conta nova: o gatilho do cadastro grava no public): w26-lia (a pessoa) e w26-otto (a outra
pessoa), senhas em ~/.physiq-teste-w26-lia e ~/.physiq-teste-w26-otto.

Casos (o pedido A, peça 6):
  sql        o banco direto, em transações DESFEITAS (o DO termina sempre em exceção = rollback; nada fica): quem executa o quê (visitante,
             app, servidor), quem lê as tabelas, o gatilho em auth.users, o desafio da pessoa (uso único, de outra pessoa, vencido), a sessão
             amarrada, os tamanhos, o limite de 10, a substituída, os tetos (20 em 24 h, 20 apagadas), a trava, a conta real no staging, o
             master e as 2 etapas, o restauracao_chave/gastar (sessão morta, chave apagada, uso único, 3 por hora, contador só sobe), a
             limpeza (13 meses da criação) e o gatilho (senha trocada, conta excluída)
  registrar  a Lia entra (senha) → chave-restauracao opcoes → o autenticador cria → registrar → a linha no banco
  entrar     restaurar-login opcoes → o autenticador assina → entrar → a sessão VALE no Auth (/auth/v1/user = a Lia; o refresh gira; AMR otp)
  desafio    a MESMA resposta de novo → 401 (o desafio não repete)
  erradas    origem errada, assinatura de outra chave, RP de outro site, userHandle de outra pessoa → 401; o desafio NÃO é gasto por elas
             (só depois da assinatura conferida): a resposta certa com ele entra
  sem_estado o desafio de entrar não grava nada no banco (HMAC na função); mexido ou inventado → 401
  tolerante  a conferência pelo MEDIDO na fase 0 (TOLERANCIA nas regras): sem o UP RECUSA (401); contador 0 depois de 5 entra, 3 depois
             de 5 não (clone); AAGUID não zerado + androidPackageName + a origem de debug do notebook (só staging) registram e entram
  limite     no máximo 3 entradas por chave por hora: a 4ª → 429 (nunca 401)
  sessao     a sessão que registrou a chave encerrada (logout) → a chave → 401
  senha      a senha trocada (admin) → a chave de antes → 401 ('senha_trocada'); a senha ORIGINAL volta no fim
  apagada    a chave apagada (o Sair local) → 401; a outra chave da Lia segue entrando
  sair       o Sair (apagar todas) → nenhuma chave da Lia entra; a do Otto segue
  trava      a trava desligada (SQL) → as 2 funções respondem "desligado" (na hora: o banco confere); o apagar segue; a trava volta
  public     x-schema public (sem a migração) → as 2 funções recusam limpo ("desligado", 200) e nada existe no public
No fim (sempre): as chaves e os desafios da rodada saem do staging, a trava volta a {"ligado": true, "so_teste": true} e as sessões abertas
pela rodada são encerradas (logout local).
Uso: python3 e2e/restaurar_login/api.py [--casos sql,registrar,...]
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, http, login_principal, pat, senha, service, sql_principal  # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from _autenticador import ORIGEM_DEBUG_STAGING, ORIGEM_FALSA, ORIGEM_PLAY, ORIGEM_UPLOAD, Autenticador, user_handle_de  # noqa: E402

API_P = "https://api-principal.physiqcalc.com.br"
ORIGEM_HTTP = "https://localhost"  # o APK (Capacitor) chama do https://localhost
CONTAS = {"lia": ("w26-lia", "w26.lia.teste.claude@physiqnutri.app"), "otto": ("w26-otto", "w26.otto.teste.claude@physiqnutri.app")}
TRAVA_DO_STAGING = {"ligado": True, "so_teste": True}
p = Placar()
SESSOES: list[str] = []  # os access tokens abertos pela rodada (logout local no fim)
ESTADO: dict = {"inicio": None, "ids": {}}


def q(sql: str) -> list:
    return sql_principal(sql)


def uid(conta: str) -> str:
    if conta not in ESTADO["ids"]:
        ESTADO["ids"][conta] = q(f"select id::text as id from auth.users where lower(email) = '{CONTAS[conta][1]}'")[0]["id"]
    return ESTADO["ids"][conta]


def sessao(conta: str) -> dict:
    """Login por senha (o de teste: como servidor, por causa do captcha global — o cab_login do _comum)."""
    s = login_principal(*CONTAS[conta])
    SESSOES.append(s["access_token"])
    return s


def claims(token: str) -> dict:
    corpo = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4)))


def chave(token: str, corpo: dict, schema: str = "staging") -> tuple[int, dict]:
    st, r, _ = http("POST", f"{API_P}/functions/v1/chave-restauracao", corpo,
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": schema, "Origin": ORIGEM_HTTP}, timeout=40)
    return st, (r if isinstance(r, dict) else {"_": r})


def restaurar(corpo: dict, schema: str = "staging") -> tuple[int, dict]:
    """A função pública (sem login), como o celular novo. 429 do freio por IP (30/min por instância) → espera 1 min e tenta 1 vez mais."""
    for tentativa in range(2):
        st, r, _ = http("POST", f"{API_P}/functions/v1/restaurar-login", corpo,
                        {"apikey": anon(PRINCIPAL_REF), "x-schema": schema, "Origin": ORIGEM_HTTP}, timeout=40)
        if st == 429 and tentativa == 0:
            print("   (freio por IP: esperando 61 s)", flush=True)
            time.sleep(61)
            continue
        return st, (r if isinstance(r, dict) else {"_": r})
    return st, r


def registrar(token: str, a: Autenticador, **extra) -> tuple[int, dict]:
    st, op = chave(token, {"acao": "opcoes"})
    assert st == 200 and op.get("ok") is True, ("opcoes", st, op)
    return chave(token, {"acao": "registrar", "resposta": a.registrar(op["opcoes"]), **extra})


def desafio_entrar(schema: str = "staging") -> str:
    st, op = restaurar({"acao": "opcoes"}, schema)
    assert st == 200 and op.get("ok") is True, ("opcoes de entrar", st, op)
    return op["opcoes"]["challenge"]


def entrar(resposta: dict, schema: str = "staging") -> tuple[int, dict]:
    st, r = restaurar({"acao": "entrar", "resposta": resposta}, schema)
    if st == 200 and r.get("ok"):
        SESSOES.append(r["sessao"]["access_token"])
    return st, r


def linha(cred: str) -> dict | None:
    r = q(f"""select user_id::text as user_id, algoritmo, origem, nuvem, aparelho, versao_app, backup_elegivel, backup_estado, contador, usos, sessao_id::text as sessao,
                     usada_em is not null as usada, apagada_em is not null as apagada, motivo_apagada, aaguid::text as aaguid,
                     octet_length(chave_publica) as tam
                from staging.chaves_restauracao where credencial_id = '{cred}'""")
    return r[0] if r else None


def usuario(token: str) -> tuple[int, dict]:
    st, r, _ = http("GET", f"{PRINCIPAL_URL}/auth/v1/user", None, {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}"})
    return st, (r if isinstance(r, dict) else {})


def trava(valor: dict) -> None:
    q(f"update staging.app_config set valor = '{json.dumps(valor)}'::jsonb where chave = 'restaurar_login'")


# ───────────────────────── sql: o banco direto, em transações desfeitas ─────────────────────────

def desfeito(corpo: str) -> str:
    """Roda `do $t$ <corpo> $t$` (o corpo é o bloco inteiro: [declare …] begin … end) — ele termina SEMPRE em exceção (raise exception
    'R:%', <json>): a transação volta inteira e a mensagem traz o resultado. Devolve a mensagem do erro ("" se não houve exceção — o que
    nunca deveria acontecer)."""
    st, r, _ = http("POST", f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}/database/query", {"query": f"do $t$ {corpo} $t$;"},
                    {"Authorization": f"Bearer {pat()}"}, timeout=120)
    if st in (200, 201):
        return ""
    return str((r or {}).get("message", r)) if isinstance(r, dict) else str(r)


def resultado(msg: str) -> dict:
    m = re.search(r"R:(\{.*\})", msg, re.S)
    return json.loads(m.group(1)) if m else {"_erro": msg[:300]}


COMO = ("execute 'set local role {papel}'; perform set_config('request.jwt.claims', json_build_object('sub', '{sub}', 'role', '{papel}', "
        "'session_id', '{sid}', 'aal', '{aal}')::text, true);")


def como(papel: str, sub: str, sid: str = "", aal: str = "aal1") -> str:
    return COMO.format(papel=papel, sub=sub, sid=sid, aal=aal)


CHAVE_SQL = "'\\x0102030405060708090a0b0c0d0e0f10'::bytea"


def caso_sql() -> None:
    lia, otto = uid("lia"), uid("otto")
    # as sessões de VERDADE (a chave fica amarrada ao session_id do JWT, que tem de existir em auth.sessions)
    sid_lia = claims(sessao("lia")["access_token"])["session_id"]
    sid_otto = claims(sessao("otto")["access_token"])["session_id"]
    # 1. quem executa o quê (os grants): o visitante nada; o app só as 3 da pessoa; ninguém do app lê as tabelas
    servidor = ["restaurar_login_recusa(null)", "restauracao_chave('x')", "restauracao_gastar('x','y',0,now())", "restauracao_limpar()"]
    for papel, chamadas in (("anon", servidor + ["chave_restauracao_desafio()", "chave_restauracao_apagar(null, true)"]), ("authenticated", servidor)):
        for f in chamadas:
            msg = desfeito(f"begin execute 'set local role {papel}'; perform staging.{f}; raise exception 'NAO_RECUSOU'; end")
            p.check("permission denied" in msg, f"[sql] {papel} não executa staging.{f.split('(')[0]} ({msg[:48]})")
    for papel in ("anon", "authenticated"):
        for t in ("chaves_restauracao", "restauracao_desafios"):
            msg = desfeito(f"begin execute 'set local role {papel}'; perform count(*) from staging.{t}; raise exception 'NAO_RECUSOU'; end")
            p.check("permission denied" in msg, f"[sql] {papel} não lê staging.{t} ({msg[:48]})")
    g = q("""select has_function_privilege('authenticated', 'staging.restauracao_auth_mudou()', 'execute') as a,
                    has_function_privilege('anon', 'staging.restauracao_auth_mudou()', 'execute') as b,
                    (select count(*) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and t.tgname = 'physiq_restauracao_auth_staging')::int as gat""")[0]
    p.check(g == {"a": False, "b": False, "gat": 1}, f"[sql] o gatilho physiq_restauracao_auth_staging em auth.users; a função dele ninguém do app executa ({g})")

    # 2. como a Lia: o desafio dela (uso único), o de outra pessoa, o vencido, a sessão, o limite de 10, a substituída e o apagar
    r = resultado(desfeito(f"""declare d text; d2 text; d_otto text; d_venc text; g jsonb; g2 jsonb; g_otto jsonb; g_venc jsonb; g_sem jsonb; g_grande jsonb;
      n int; sub jsonb; i int; dd text; ult text; sess uuid;
    begin
      {como('authenticated', otto, sid_otto)}
      d_otto := staging.chave_restauracao_desafio() ->> 'desafio';
      {como('authenticated', lia, sid_lia)}
      d := staging.chave_restauracao_desafio() ->> 'desafio';
      g := staging.chave_restauracao_gravar(d, 'cred-sql-a-0000000000', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      g2 := staging.chave_restauracao_gravar(d, 'cred-sql-b-0000000000', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      g_otto := staging.chave_restauracao_gravar(d_otto, 'cred-sql-c-0000000000', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      d_venc := staging.chave_restauracao_desafio() ->> 'desafio';
      execute 'reset role';
      update staging.restauracao_desafios set expira_em = now() - interval '1 second' where desafio = d_venc;
      {como('authenticated', lia, sid_lia)}
      g_venc := staging.chave_restauracao_gravar(d_venc, 'cred-sql-d-0000000000', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      -- sem a sessão no JWT (ou com uma que não existe no Auth): não grava
      {como('authenticated', lia, '00000000-0000-4000-8000-000000000000')}
      dd := staging.chave_restauracao_desafio() ->> 'desafio';
      g_sem := staging.chave_restauracao_gravar(dd, 'cred-sql-e-0000000000', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      -- os tamanhos medidos: o id de 129 caracteres não entra
      {como('authenticated', lia, sid_lia)}
      dd := staging.chave_restauracao_desafio() ->> 'desafio';
      g_grande := staging.chave_restauracao_gravar(dd, repeat('A', 129), {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      for i in 1..10 loop
        dd := staging.chave_restauracao_desafio() ->> 'desafio';
        ult := 'cred-sql-lim-' || lpad(i::text, 8, '0');
        perform staging.chave_restauracao_gravar(dd, ult, {CHAVE_SQL}, 0, -257, '{ORIGEM_PLAY}');
      end loop;
      dd := staging.chave_restauracao_desafio() ->> 'desafio';
      sub := staging.chave_restauracao_gravar(dd, 'cred-sql-nova-000000', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}', p_substitui => ult);
      -- 7 desafios pedidos e não usados: ficam só 5 vivos
      for i in 1..7 loop
        perform staging.chave_restauracao_desafio();
      end loop;
      execute 'reset role';
      select count(*) into n from staging.chaves_restauracao where user_id = '{lia}' and apagada_em is null;
      select c.sessao_id into sess from staging.chaves_restauracao c where c.credencial_id = 'cred-sql-a-0000000000';
      raise exception 'R:%', jsonb_build_object('g', g, 'g2', g2, 'g_otto', g_otto, 'g_venc', g_venc, 'g_sem', g_sem, 'g_grande', g_grande,
        'sub', sub, 'ativas', n, 'sessao_certa', sess = '{sid_lia}'::uuid,
        'limite', (select count(*) from staging.chaves_restauracao where user_id = '{lia}' and motivo_apagada = 'limite'),
        'substituida', (select motivo_apagada from staging.chaves_restauracao where credencial_id = ult),
        'desafios_vivos_lia', (select count(*) from staging.restauracao_desafios where user_id = '{lia}'),
        'tam', length(d));
    end"""))
    p.check(r.get("g", {}).get("ok") is True and r.get("tam") == 43, f"[sql] a Lia pede o desafio (43 caracteres) e grava a chave ({r.get('g')})")
    p.check(r.get("sessao_certa") is True, f"[sql] a chave guarda a sessão de quem gravou (o session_id do JWT) ({r.get('sessao_certa')})")
    p.check(r.get("g2") == {"ok": False, "erro": "desafio_invalido"}, f"[sql] o MESMO desafio não grava 2 vezes ({r.get('g2')})")
    p.check(r.get("g_otto") == {"ok": False, "erro": "desafio_invalido"}, f"[sql] o desafio do Otto não serve para a Lia ({r.get('g_otto')})")
    p.check(r.get("g_venc") == {"ok": False, "erro": "desafio_invalido"}, f"[sql] o desafio vencido não grava ({r.get('g_venc')})")
    p.check(r.get("g_sem") == {"ok": False, "erro": "sem_login"}, f"[sql] uma sessão que não existe no Auth não grava chave (achado 1) ({r.get('g_sem')})")
    p.check(r.get("g_grande") == {"ok": False, "erro": "dados_invalidos"}, f"[sql] o id da chave com 129 caracteres não entra (achado 3) ({r.get('g_grande')})")
    p.check(r.get("ativas") == 10 and r.get("limite") == 1, f"[sql] no máximo 10 ativas: 11 gravadas → 10 ativas + 1 'limite' (a mais antiga) ({r.get('ativas')}/{r.get('limite')})")
    p.check(r.get("sub", {}).get("ok") is True and r.get("substituida") == "substituida", f"[sql] a `substitui` vira 'substituida' ({r.get('substituida')})")
    p.check(r.get("desafios_vivos_lia") == 5, f"[sql] no máximo 5 desafios vivos por pessoa: 7 pedidos sem uso → 5 vivos ({r.get('desafios_vivos_lia')})")

    # 3. os tetos por pessoa (achado 3): 20 registros em 24 h; no máximo 20 apagadas guardadas
    r = resultado(desfeito(f"""declare i int; dd text; ult jsonb; ap jsonb;
    begin
      {como('authenticated', lia, sid_lia)}
      for i in 1..20 loop
        dd := staging.chave_restauracao_desafio() ->> 'desafio';
        perform staging.chave_restauracao_gravar(dd, 'cred-sql-teto-' || lpad(i::text, 8, '0'), {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      end loop;
      dd := staging.chave_restauracao_desafio() ->> 'desafio';
      ult := staging.chave_restauracao_gravar(dd, 'cred-sql-teto-00000021', {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      ap := staging.chave_restauracao_apagar(null, true);
      execute 'reset role';
      -- as 20 de antes passam a ter 1 dia (fora do teto) e mais 10 entram: 30 apagadas → ficam 20
      update staging.chaves_restauracao set criada_em = now() - interval '25 hours' where user_id = '{lia}';
      {como('authenticated', lia, sid_lia)}
      for i in 1..10 loop
        dd := staging.chave_restauracao_desafio() ->> 'desafio';
        perform staging.chave_restauracao_gravar(dd, 'cred-sql-mais-' || lpad(i::text, 8, '0'), {CHAVE_SQL}, 0, -7, '{ORIGEM_PLAY}');
      end loop;
      perform staging.chave_restauracao_apagar(null, true);
      execute 'reset role';
      raise exception 'R:%', jsonb_build_object('o_21', ult, 'apagar', ap,
        'apagadas', (select count(*) from staging.chaves_restauracao where user_id = '{lia}' and apagada_em is not null),
        'linhas', (select count(*) from staging.chaves_restauracao where user_id = '{lia}'));
    end"""))
    p.check(r.get("o_21") == {"ok": False, "erro": "muitas_tentativas"}, f"[sql] 20 registros em 24 h: o 21º → muitas_tentativas ({r.get('o_21')})")
    p.check(r.get("apagadas") == 20 and r.get("linhas") == 20, f"[sql] no máximo 20 apagadas guardadas por pessoa: 30 → 20 ({r.get('apagadas')}/{r.get('linhas')})")

    # 4. a trava, a conta real, o master e as 2 etapas (achado 2), dentro da transação desfeita
    r = resultado(desfeito(f"""declare real uuid; a jsonb; b jsonb; c jsonb; e jsonb; f jsonb; m jsonb; m2 jsonb; f1 jsonb; f2 jsonb; dd text;
    begin
      select u.id into real from auth.users u where not staging.email_de_teste(u.email) limit 1;
      {como('authenticated', "' || real || '")}
      a := staging.chave_restauracao_desafio();
      execute 'reset role';
      -- o master pelo perfil deste schema (o papel no Auth é a outra metade: provado no Vitest e na função)
      update staging.profiles set role = 'master' where id = '{lia}';
      {como('authenticated', lia, sid_lia)}
      m := staging.chave_restauracao_desafio();
      execute 'reset role';
      insert into staging.chaves_restauracao (user_id, credencial_id, chave_publica, algoritmo, origem, sessao_id)
        values ('{lia}', 'cred-sql-master-0000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '{sid_lia}');
      m2 := staging.restauracao_chave('cred-sql-master-0000');
      update staging.profiles set role = 'paciente' where id = '{lia}';
      -- 2 etapas: com o fator verificado, só em aal2
      insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
        values (gen_random_uuid(), '{lia}', 'e2e-restaurar-login', 'totp', 'verified', now(), now());
      {como('authenticated', lia, sid_lia, 'aal1')}
      f1 := staging.chave_restauracao_desafio();
      {como('authenticated', lia, sid_lia, 'aal2')}
      f2 := staging.chave_restauracao_desafio();
      execute 'reset role';
      update staging.app_config set valor = '{{"ligado": false, "so_teste": true}}'::jsonb where chave = 'restaurar_login';
      {como('authenticated', lia, sid_lia)}
      b := staging.chave_restauracao_desafio();
      c := staging.chave_restauracao_apagar(null, true);
      execute 'reset role';
      e := staging.restauracao_chave('cred-sql-master-0000');
      update staging.app_config set valor = '{{"ligado": "true"}}'::jsonb where chave = 'restaurar_login';
      f := staging.restauracao_chave('cred-sql-master-0000');
      raise exception 'R:%', jsonb_build_object('real', a, 'master', m, 'master_chave', m2 - 'chave', 'aal1', f1, 'aal2', f2 - 'desafio',
        'desligada', b, 'apagar', c, 'chave_desligada', e, 'texto_true', f);
    end"""))
    p.check(r.get("real") == {"ok": False, "erro": "conta_real_no_staging"}, f"[sql] conta real no staging → conta_real_no_staging ({r.get('real')})")
    p.check(r.get("master") == {"ok": False, "erro": "conta_master"}, f"[sql] o master (perfil) não pede desafio de registro (achado 2) ({r.get('master')})")
    p.check((r.get("master_chave") or {}).get("recusa") == "conta_master", f"[sql] a chave do master (posta à mão) volta com a recusa conta_master ({r.get('master_chave')})")
    p.check(r.get("aal1") == {"ok": False, "erro": "precisa_2fa"} and (r.get("aal2") or {}).get("ok") is True,
            f"[sql] conta com o fator verificado: aal1 → precisa_2fa; aal2 → o desafio (achado 2) ({r.get('aal1')} / {r.get('aal2')})")
    p.check(r.get("desligada") == {"ok": False, "erro": "desligado"} and r.get("chave_desligada") == {"ok": False, "erro": "desligado"},
            f"[sql] a trava desligada → desligado na pessoa e no servidor ({r.get('desligada')} / {r.get('chave_desligada')})")
    p.check(r.get("apagar", {}).get("ok") is True, f"[sql] o apagar vale com a trava desligada ({r.get('apagar')})")
    p.check(r.get("texto_true") == {"ok": False, "erro": "desligado"}, f"[sql] \"ligado\": \"true\" (texto) não liga — só o booleano ({r.get('texto_true')})")

    # 5. o servidor: a chave ativa com a sessão viva; o desafio gasto 1 vez só depois da assinatura (restauracao_gastar); 3 por hora;
    #    o contador que só sobe; a limpeza; o gatilho (senha trocada e conta excluída); a origem no formato
    r = resultado(desfeito(f"""declare k1 jsonb; k2 jsonb; k3 jsonb; g1 jsonb; g2 jsonb; g3 jsonb; g4 jsonb; g5 jsonb; g6 jsonb; gv jsonb; lp jsonb;
      cont bigint; usos int; resto int; origem_ruim text; senha text; excluida text; d1 text := repeat('a', 43); d2 text := repeat('b', 43);
      d3 text := repeat('c', 43); d4 text := repeat('d', 43); d5 text := repeat('e', 43);
    begin
      insert into staging.chaves_restauracao (user_id, credencial_id, chave_publica, algoritmo, origem, sessao_id)
        values ('{lia}', 'cred-srv-a-0000000000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '{sid_lia}'),
               ('{lia}', 'cred-srv-b-0000000000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '{sid_lia}'),
               ('{lia}', 'cred-srv-morta-000000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '00000000-0000-4000-8000-000000000000');
      update staging.chaves_restauracao set apagada_em = now(), motivo_apagada = 'saiu' where credencial_id = 'cred-srv-b-0000000000';
      k1 := staging.restauracao_chave('cred-srv-a-0000000000');
      k2 := staging.restauracao_chave('cred-srv-b-0000000000');
      k3 := staging.restauracao_chave('cred-srv-morta-000000');
      g1 := staging.restauracao_gastar(d1, 'cred-srv-a-0000000000', 7, now() + interval '5 minutes');
      g2 := staging.restauracao_gastar(d1, 'cred-srv-a-0000000000', 3, now() + interval '5 minutes');
      g3 := staging.restauracao_gastar(d2, 'cred-srv-a-0000000000', 3, now() + interval '5 minutes');
      g4 := staging.restauracao_gastar(d3, 'cred-srv-a-0000000000', 0, now() + interval '5 minutes');
      g5 := staging.restauracao_gastar(d4, 'cred-srv-a-0000000000', 0, now() + interval '5 minutes');
      g6 := staging.restauracao_gastar(d5, 'cred-srv-b-0000000000', 0, now() + interval '5 minutes');
      gv := staging.restauracao_gastar(repeat('f', 43), 'cred-srv-a-0000000000', 0, now() - interval '1 second');
      select contador, c.usos into cont, usos from staging.chaves_restauracao c where credencial_id = 'cred-srv-a-0000000000';
      -- a limpeza: o desafio de registrar vencido e o de entrar com mais de 1 h saem; a apagada há mais de 90 dias sai; a ATIVA criada há
      -- mais de 13 meses vira vencida MESMO usada há pouco (achado 1)
      insert into staging.restauracao_desafios (desafio, tipo, user_id, expira_em) values (repeat('V', 43), 'registrar', '{lia}', now() - interval '1 minute');
      update staging.restauracao_desafios set criado_em = now() - interval '61 minutes' where desafio = d1;
      update staging.chaves_restauracao set apagada_em = now() - interval '91 days' where credencial_id = 'cred-srv-b-0000000000';
      insert into staging.chaves_restauracao (user_id, credencial_id, chave_publica, algoritmo, origem, sessao_id, criada_em, usada_em)
        values ('{lia}', 'cred-srv-velha-00000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '{sid_lia}', now() - interval '14 months', now() - interval '1 day');
      lp := staging.restauracao_limpar();
      select count(*) into resto from staging.restauracao_desafios where desafio in (repeat('V', 43), d1);
      begin
        insert into staging.chaves_restauracao (user_id, credencial_id, chave_publica, algoritmo, origem, sessao_id)
          values ('{lia}', 'cred-srv-ruim-000000', {CHAVE_SQL}, -7, 'https://physiqcalc.com.br', '{sid_lia}');
        origem_ruim := 'ENTROU';
      exception when check_violation then origem_ruim := 'recusada';
      end;
      -- o gatilho em auth.users: a senha trocada apaga as chaves ativas da pessoa; a conta excluída (soft delete) também
      insert into staging.chaves_restauracao (user_id, credencial_id, chave_publica, algoritmo, origem, sessao_id)
        values ('{lia}', 'cred-srv-senha-00000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '{sid_lia}'),
               ('{otto}', 'cred-srv-otto-000000', {CHAVE_SQL}, -7, '{ORIGEM_PLAY}', '{sid_otto}');
      update auth.users set encrypted_password = encrypted_password || 'x' where id = '{lia}';
      select motivo_apagada into senha from staging.chaves_restauracao where credencial_id = 'cred-srv-senha-00000';
      update auth.users set deleted_at = now() where id = '{otto}';
      select motivo_apagada into excluida from staging.chaves_restauracao where credencial_id = 'cred-srv-otto-000000';
      raise exception 'R:%', jsonb_build_object('k1', k1 - 'chave', 'k2', k2, 'k3', k3, 'g1', g1, 'g2', g2, 'g3', g3, 'g4', g4, 'g5', g5, 'g6', g6,
        'gv', gv, 'contador', cont, 'usos', usos, 'limpeza', lp, 'resto', resto, 'origem_ruim', origem_ruim, 'senha', senha, 'excluida', excluida,
        'velha', (select motivo_apagada from staging.chaves_restauracao where credencial_id = 'cred-srv-velha-00000'),
        'b_existe', (select count(*) from staging.chaves_restauracao where credencial_id = 'cred-srv-b-0000000000'));
    end"""))
    k1 = r.get("k1") or {}
    p.check(k1.get("ok") is True and k1.get("user_id") == lia and k1.get("recusa") is None, f"[sql] restauracao_chave devolve a dona da chave ativa, sem recusa ({k1})")
    p.check(r.get("k2") == {"ok": False, "erro": "chave_invalida"}, f"[sql] a chave apagada → chave_invalida ({r.get('k2')})")
    p.check(r.get("k3") == {"ok": False, "erro": "chave_invalida"}, f"[sql] a chave cuja sessão não existe mais → chave_invalida (achado 1) ({r.get('k3')})")
    p.check((r.get("g1") or {}).get("ok") is True and r.get("g2") == {"ok": False, "erro": "desafio_invalido"},
            f"[sql] o desafio de entrar é gasto 1 vez (a chave primária) ({r.get('g1')} / {r.get('g2')})")
    p.check((r.get("g3") or {}).get("ok") is True and (r.get("g4") or {}).get("ok") is True and r.get("g5") == {"ok": False, "erro": "muitas_tentativas"},
            f"[sql] no máximo 3 entradas por chave por hora: a 4ª → muitas_tentativas (achado 5) ({r.get('g5')})")
    p.check(r.get("g6") == {"ok": False, "erro": "chave_invalida"} and r.get("gv") == {"ok": False, "erro": "desafio_invalido"},
            f"[sql] gastar com a chave apagada → chave_invalida; com o desafio vencido → desafio_invalido ({r.get('g6')} / {r.get('gv')})")
    p.check(r.get("contador") == 7 and r.get("usos") == 3, f"[sql] o contador só sobe (7, depois 3 → fica 7) e os usos contam ({r.get('contador')}/{r.get('usos')})")
    lp = r.get("limpeza") or {}
    p.check(r.get("resto") == 0 and lp.get("removidas", 0) >= 1 and r.get("b_existe") == 0 and r.get("velha") == "vencida",
            f"[sql] a limpeza: desafios vencidos saem, apagada há 91 dias sai, ativa CRIADA há 14 meses vira 'vencida' mesmo usada ontem ({lp})")
    p.check(r.get("origem_ruim") == "recusada", f"[sql] a tabela só aceita origem android:apk-key-hash: ({r.get('origem_ruim')})")
    p.check(r.get("senha") == "senha_trocada" and r.get("excluida") == "conta_excluida",
            f"[sql] o gatilho: a senha trocada → 'senha_trocada'; a conta excluída (soft delete) → 'conta_excluida' (achados 1 e 9) ({r.get('senha')}/{r.get('excluida')})")
    p.check(q(f"select count(*)::int as n from staging.chaves_restauracao where credencial_id like 'cred-s%'")[0]["n"] == 0,
            "[sql] nada das transações ficou no banco (tudo desfeito)")


# ───────────────────────── as funções publicadas (como o app) ─────────────────────────

def caso_registrar() -> None:
    s = sessao("lia")
    a = Autenticador(ORIGEM_PLAY)
    ESTADO["a"], ESTADO["token_lia"] = a, s["access_token"]
    st, op = chave(s["access_token"], {"acao": "opcoes"})
    o = op.get("opcoes") or {}
    p.check(st == 200 and o.get("rp") == {"id": "physiqcalc.com.br", "name": "Physiq"} and o.get("user", {}).get("id") == user_handle_de(uid("lia"))
            and o.get("attestation") == "none" and "@" not in json.dumps(o), f"chave-restauracao opcoes → as opções (RP, user.id = o uuid da Lia, sem e-mail) ({st})")
    st, r = chave(s["access_token"], {"acao": "registrar", "resposta": a.registrar(o), "nuvem": True,
                                      "aparelho": {"modelo": "Autenticador virtual E2E", "android": 14}, "versao": "3.139"})
    p.check(st == 200 and r == {"ok": True, "credencial": a.id}, f"registrar → 200 com o id da chave ({st} {r})")
    ln = linha(a.id) or {}
    p.check(ln.get("user_id") == uid("lia") and ln.get("algoritmo") == -7 and ln.get("origem") == ORIGEM_PLAY and ln.get("nuvem") is True
            and ln.get("aparelho") == "Autenticador virtual E2E · Android 14" and ln.get("backup_elegivel") is True and ln.get("apagada") is False
            and ln.get("backup_estado") is False and ln.get("aaguid") == "00000000-0000-0000-0000-000000000000" and (ln.get("tam") or 0) > 60,
            f"a linha no staging: dona, ES256, origem da Play, nuvem, aparelho, BE 1 e BS 0 (o medido), AAGUID zerado, a chave COSE ({ln})")
    st, r = chave(s["access_token"], {"acao": "registrar", "resposta": a.registrar(o)})
    p.check(st == 400 and r.get("erro") == "chave_invalida", f"registrar de novo com o MESMO desafio → 400 chave_invalida ({st} {r})")


def caso_entrar() -> None:
    a: Autenticador = ESTADO["a"]
    d = desafio_entrar()
    resp = a.entrar(d)
    ESTADO["resp_usada"] = resp
    t0 = time.time()
    st, r = entrar(resp)
    ms = int((time.time() - t0) * 1000)
    s = r.get("sessao") or {}
    p.check(st == 200 and r.get("ok") is True and set(s) == {"access_token", "refresh_token", "expires_in", "expires_at", "token_type", "user"}
            and s.get("user") == {"id": uid("lia")}, f"restaurar-login entrar → 200 com a sessão (só o id da pessoa) em {ms} ms ({st} {sorted(s)})")
    if st != 200:
        return
    stu, u = usuario(s["access_token"])
    p.check(stu == 200 and u.get("id") == uid("lia"), f"a sessão VALE no Auth: /auth/v1/user = a Lia ({stu})")
    amr = [m.get("method") for m in claims(s["access_token"]).get("amr", [])]
    p.check("otp" in amr and "oauth" not in amr, f"o login restaurado é AMR otp (a opção A; não conta como Google) ({amr})")
    st2, nova, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/token?grant_type=refresh_token", {"refresh_token": s["refresh_token"]}, {"apikey": anon(PRINCIPAL_REF)})
    p.check(st2 == 200 and isinstance(nova, dict) and nova.get("user", {}).get("id") == uid("lia"), f"o refresh da sessão restaurada gira (200) ({st2})")
    if st2 == 200:
        SESSOES.append(nova["access_token"])
    ln = linha(a.id) or {}
    p.check(ln.get("usos") == 1 and ln.get("usada") is True and ln.get("contador") == 0, f"a chave: usos 1, usada_em gravado, contador 0 ({ln.get('usos')})")


def caso_desafio() -> None:
    st, r = entrar(ESTADO["resp_usada"])
    p.check(st == 401 and r == {"ok": False, "erro": "chave_invalida"}, f"a MESMA resposta de novo → 401 chave_invalida (o desafio não repete) ({st} {r})")


def caso_erradas() -> None:
    a: Autenticador = ESTADO["a"]
    outro = Autenticador(ORIGEM_PLAY)
    casos = [
        ("origem de outro app", lambda d: a.entrar(d, origem=ORIGEM_FALSA)),
        ("origem do site (não é do app)", lambda d: a.entrar(d, origem="https://physiqcalc.com.br")),
        ("assinatura de outra chave", lambda d: a.entrar(d, assinar_com=outro)),
        ("RP de outro site", lambda d: a.entrar(d, rp_id="physiqcalc.com.br.evil.example")),
        ("userHandle de outra pessoa", lambda d: a.entrar(d, user_handle=user_handle_de(uid("otto")))),
    ]
    d = desafio_entrar()
    for nome, fazer in casos:
        st, r = entrar(fazer(d))
        p.check(st == 401 and r.get("erro") == "chave_invalida", f"{nome} → 401 chave_invalida ({st} {r.get('erro')})")
    # o desafio só é gasto DEPOIS da assinatura conferida (achado 4): as 5 erradas não o queimaram
    st, r = entrar(a.entrar(d))
    p.check(st == 200, f"…e o desafio NÃO foi gasto pelas erradas: a resposta certa com ele entra ({st} {r.get('erro')})")
    nunca = Autenticador(ORIGEM_PLAY)
    nunca.user_handle = user_handle_de(uid("lia"))
    st, r = entrar(nunca.entrar(desafio_entrar()))
    p.check(st == 401, f"uma chave que nunca foi registrada → 401 ({st})")


def caso_sem_estado() -> None:
    """O desafio de entrar não grava nada (HMAC na função — achado 4): 10 opcoes, 0 linha nova; o desafio mexido ou de outro schema → 401."""
    antes = q("select count(*)::int as n from staging.restauracao_desafios")[0]["n"]
    ds = [desafio_entrar() for _ in range(10)]
    depois = q("select count(*)::int as n from staging.restauracao_desafios")[0]["n"]
    p.check(depois == antes and len(set(ds)) == 10, f"10 opcoes da restaurar-login: 10 desafios diferentes e NENHUMA linha no banco ({antes} → {depois})")
    a = Autenticador(ORIGEM_PLAY)
    st, _ = registrar(ESTADO["token_lia"], a)
    bruto = bytearray(base64.urlsafe_b64decode(ds[0] + "="))
    bruto[20] ^= 1
    mexido = base64.urlsafe_b64encode(bytes(bruto)).decode().rstrip("=")
    st, r = entrar(a.entrar(mexido))
    p.check(st == 401 and r.get("erro") == "chave_invalida", f"o desafio com 1 bit mexido (a marca HMAC não confere) → 401 ({st} {r.get('erro')})")
    st, r = entrar(a.entrar("A" * 43))
    p.check(st == 401, f"um desafio inventado → 401 ({st})")
    st, r = entrar(a.entrar(ds[1]))
    p.check(st == 200, f"o desafio de verdade (pedido antes) entra ({st} {r.get('erro')})")


def caso_tolerante() -> None:
    tok = ESTADO["token_lia"]
    t1 = Autenticador(ORIGEM_PLAY)
    registrar(tok, t1)
    st, r = entrar(t1.entrar(desafio_entrar(), up=False))
    p.check(st == 401 and r.get("erro") == "chave_invalida", f"sem o UP (o toque) → 401 chave_invalida (a fase 0 mediu UP = 1: exigido) ({st} {r.get('erro')})")
    st, r = entrar(t1.entrar(desafio_entrar()))
    p.check(st == 200, f"…e com o UP (o formato medido: flags 0x09) a mesma chave entra ({st} {r.get('erro')})")
    # o contador numa chave própria (no máximo 3 entradas por chave por hora — o 3 que não sobe é recusado antes de gastar)
    t2 = Autenticador(ORIGEM_PLAY)
    registrar(tok, t2)
    for contador, esperado, nome in ((5, 200, "contador 5 (o 1º com contador)"), (0, 200, "contador 0 depois de 5 (a cópia volta com 0: tolerado)"),
                                     (3, 401, "contador 3 depois de 5 (não sobe: sinal de clone — recusa SEMPRE)"), (6, 200, "contador 6 depois de 5")):
        st, r = entrar(t2.entrar(desafio_entrar(), contador=contador))
        p.check(st == esperado, f"{nome} → {esperado} ({st} {r.get('erro')})")
    p.check((linha(t2.id) or {}).get("contador") == 6, f"no banco: o contador guardado é o maior (6) ({(linha(t2.id) or {}).get('contador')})")
    d = Autenticador(ORIGEM_DEBUG_STAGING)
    st, op = chave(tok, {"acao": "opcoes"})
    resposta = d.registrar(op["opcoes"], aaguid=bytes.fromhex("b93fd961f2e6462faa6db4a8b1f1a3c2"), pacote="com.bertoldo.physiqcalc")
    st, r = chave(tok, {"acao": "registrar", "resposta": resposta, "nuvem": False})
    ln = linha(d.id) or {}
    p.check(st == 200 and ln.get("aaguid") == "b93fd961-f2e6-462f-aa6d-b4a8b1f1a3c2" and ln.get("origem") == ORIGEM_DEBUG_STAGING and ln.get("nuvem") is False,
            f"AAGUID não zerado + androidPackageName + a origem de debug do notebook (staging) → registra; guarda o AAGUID e nuvem=false ({st} {r})")
    st, r = entrar(d.entrar(desafio_entrar(), pacote="com.bertoldo.physiqcalc"))
    p.check(st == 200, f"…e entra com ela ({st} {r.get('erro')})")


def caso_limite() -> None:
    """No máximo 3 entradas por chave por hora; a 4ª → 429 muitas_tentativas, NUNCA 401 (o 401 faz o app apagar a chave) — achado 5."""
    a = Autenticador(ORIGEM_PLAY)
    registrar(ESTADO["token_lia"], a)
    sts = [entrar(a.entrar(desafio_entrar()))[0] for _ in range(3)]
    p.check(sts == [200, 200, 200], f"3 entradas com a mesma chave na hora → 200 ({sts})")
    st, r = entrar(a.entrar(desafio_entrar()))
    p.check(st == 429 and r == {"ok": False, "erro": "muitas_tentativas"}, f"a 4ª na mesma hora → 429 muitas_tentativas ({st} {r})")
    p.check((linha(a.id) or {}).get("usos") == 3 and (linha(a.id) or {}).get("apagada") is False, f"a chave: 3 usos e continua ativa ({linha(a.id)})")


def caso_sessao() -> None:
    """A chave vive o que vive a sessão que a registrou (achado 1): a sessão encerrada (o Sair global em outro lugar, a revogação) → 401."""
    s = sessao("otto")
    a = Autenticador(ORIGEM_PLAY)
    st, _ = registrar(s["access_token"], a)
    p.check(st == 200 and str((linha(a.id) or {}).get("sessao")) == claims(s["access_token"]).get("session_id"),
            f"o Otto registra com a sessão nova; a linha guarda o session_id dela ({st})")
    st, _ = entrar(a.entrar(desafio_entrar()))
    p.check(st == 200, f"com a sessão viva, a chave entra ({st})")
    st2, _, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/logout?scope=local", {}, {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {s['access_token']}"})
    st, r = entrar(a.entrar(desafio_entrar()))
    p.check(st2 in (200, 204) and st == 401 and r.get("erro") == "chave_invalida",
            f"a sessão que registrou encerrada (logout {st2}) → a chave dela → 401 chave_invalida ({st} {r.get('erro')})")


def caso_senha() -> None:
    """A senha trocada apaga as chaves (o gatilho em auth.users — achado 1): a chave de antes → 401. A senha ORIGINAL volta no fim."""
    original = senha(CONTAS["lia"][0])
    tok = ESTADO.get("token_lia") or sessao("lia")["access_token"]
    a = Autenticador(ORIGEM_PLAY)
    st, _ = registrar(tok, a)
    st1, _ = entrar(a.entrar(desafio_entrar()))
    p.check(st == 200 and st1 == 200, f"a Lia registra uma chave e entra com ela ({st}/{st1})")
    sk = service(PRINCIPAL_REF)
    cab = {"apikey": sk, "Authorization": f"Bearer {sk}"}
    temporaria = "Tmp-" + base64.urlsafe_b64encode(os.urandom(18)).decode()
    try:
        stt, _, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{uid('lia')}", {"password": temporaria}, cab)
        st, r = entrar(a.entrar(desafio_entrar()))
        ln = linha(a.id) or {}
        p.check(stt == 200 and st == 401 and r.get("erro") == "chave_invalida" and ln.get("motivo_apagada") == "senha_trocada",
                f"a senha trocada (admin, {stt}) → a chave de antes → 401; no banco: 'senha_trocada' ({st} {ln.get('motivo_apagada')})")
    finally:
        stv, _, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{uid('lia')}", {"password": original}, cab)
    s2 = sessao("lia")
    p.check(stv == 200 and bool(s2.get("access_token")), f"a senha ORIGINAL da Lia voltou: o login com ela funciona ({stv})")
    ESTADO["token_lia"] = s2["access_token"]


def caso_apagada() -> None:
    tok = ESTADO["token_lia"]
    b = Autenticador(ORIGEM_UPLOAD)  # a chave de upload vale no staging
    st, r = registrar(tok, b)
    p.check(st == 200, f"a Lia registra uma 2ª chave (outro aparelho, origem de upload) ({st} {r})")
    st, r = chave(tok, {"acao": "apagar", "credencial": b.id})
    p.check(st == 200 and r == {"ok": True, "apagadas": 1}, f"o Sair local apaga a deste aparelho ({st} {r})")
    st, r = entrar(b.entrar(desafio_entrar()))
    p.check(st == 401 and r.get("erro") == "chave_invalida", f"a chave apagada → 401 chave_invalida ({st} {r})")
    p.check((linha(b.id) or {}).get("motivo_apagada") == "saiu", "no banco: apagada com o motivo 'saiu'")
    st, r = entrar(ESTADO["a"].entrar(desafio_entrar()))
    p.check(st == 200, f"a 1ª chave da Lia segue entrando ({st})")


def caso_sair() -> None:
    tok_lia = ESTADO["token_lia"]
    c = Autenticador(ORIGEM_PLAY)
    st, _ = registrar(tok_lia, c)
    so = sessao("otto")
    o = Autenticador(ORIGEM_PLAY)
    st2, _ = registrar(so["access_token"], o)
    p.check(st == 200 and st2 == 200, f"a Lia tem 2 chaves ativas e o Otto 1 ({st}/{st2})")
    ativas = q(f"select count(*)::int as n from staging.chaves_restauracao where user_id = '{uid('lia')}' and apagada_em is null")[0]["n"]
    st, r = chave(tok_lia, {"acao": "apagar", "todas": True})
    p.check(st == 200 and r.get("ok") is True and r.get("apagadas") == ativas >= 2, f"o Sair da Lia (apagar todas) → apagadas = as {ativas} ativas ({st} {r})")
    for nome, x in (("a 1ª", ESTADO["a"]), ("a 3ª", c)):
        st, r = entrar(x.entrar(desafio_entrar()))
        p.check(st == 401, f"depois do Sair, {nome} chave da Lia → 401 ({st})")
    p.check(q(f"select count(*)::int as n from staging.chaves_restauracao where user_id = '{uid('lia')}' and apagada_em is null")[0]["n"] == 0,
            "no banco: nenhuma chave da Lia ativa")
    p.check(q(f"select count(*)::int as n from staging.chaves_restauracao where credencial_id in ('{ESTADO['a'].id}', '{c.id}') and motivo_apagada = 'saiu_todos'")[0]["n"] == 2,
            "no banco: as 2 com o motivo 'saiu_todos'")
    st, r = entrar(o.entrar(desafio_entrar()))
    p.check(st == 200 and (r.get("sessao") or {}).get("user") == {"id": uid("otto")}, f"a chave do Otto segue entrando (na conta DELE) ({st})")
    ESTADO["o"], ESTADO["token_otto"] = o, so["access_token"]


def caso_trava() -> None:
    tok_otto = ESTADO.get("token_otto") or sessao("otto")["access_token"]
    o: Autenticador = ESTADO.get("o") or Autenticador(ORIGEM_PLAY)
    if "o" not in ESTADO:
        registrar(tok_otto, o)
    d = desafio_entrar()  # pedido com a trava ligada (a função guarda a trava por 60 s)
    try:
        trava({"ligado": False, "so_teste": True})
        st, r = chave(tok_otto, {"acao": "opcoes"})
        p.check(st == 200 and r == {"ok": False, "erro": "desligado"}, f"trava desligada → chave-restauracao opcoes: desligado ({st} {r})")
        st, r = entrar(o.entrar(d))
        p.check(st == 200 and r == {"ok": False, "erro": "desligado"}, f"trava desligada → a chave CERTA com o desafio de antes: desligado, sem sessão ({st} {r})")
        # o opcoes não vai ao banco (o desafio sem estado): no cache de 60 s da instância ele ainda pode dar um desafio — que não entra
        st, r = restaurar({"acao": "opcoes"})
        if r.get("ok") is True:
            st, r = entrar(o.entrar(r["opcoes"]["challenge"]))
        p.check(st == 200 and r == {"ok": False, "erro": "desligado"}, f"trava desligada → restaurar-login: desligado (no opcoes ou na entrada) ({st} {r})")
        st, r = chave(tok_otto, {"acao": "apagar", "credencial": o.id})
        p.check(st == 200 and r == {"ok": True, "apagadas": 1}, f"com a trava desligada o apagar segue valendo ({st} {r})")
    finally:
        trava(TRAVA_DO_STAGING)
    p.check(q("select valor from staging.app_config where chave = 'restaurar_login'")[0]["valor"] == TRAVA_DO_STAGING, "a trava do staging voltou a ligada")


def caso_public() -> None:
    tok = ESTADO.get("token_lia") or sessao("lia")["access_token"]
    a = Autenticador(ORIGEM_PLAY)
    a.user_handle = user_handle_de(uid("lia"))
    for nome, corpo in (("opcoes", {"acao": "opcoes"}), ("entrar", {"acao": "entrar", "resposta": a.entrar("A" * 43)})):
        st, r = restaurar(corpo, "public")
        p.check(st == 200 and r == {"ok": False, "erro": "desligado"}, f"public: restaurar-login {nome} → 200 desligado ({st} {r})")
    for nome, corpo in (("opcoes", {"acao": "opcoes"}), ("apagar todas", {"acao": "apagar", "todas": True}),
                        ("registrar", {"acao": "registrar", "resposta": a.registrar({"challenge": "B" * 43, "user": {"id": a.user_handle}})})):
        st, r = chave(tok, corpo, "public")
        p.check(st == 200 and r == {"ok": False, "erro": "desligado"}, f"public: chave-restauracao {nome} → 200 desligado ({st} {r})")
    nada = q("""select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('chaves_restauracao','restauracao_desafios'))::int as t,
                       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and (proname like 'restauracao%' or proname like 'chave_restauracao%' or proname = 'restaurar_login_recusa'))::int as f,
                       (select count(*) from public.app_config where chave = 'restaurar_login')::int as trava,
                       (select count(*) from cron.job where jobname = 'physiq-restauracao-limpeza-public')::int as job""")[0]
    p.check(nada == {"t": 0, "f": 0, "trava": 0, "job": 0}, f"public: nada do restaurar-login existe lá (tabelas, funções, trava, job) ({nada})")


# ───────────────────────── a limpeza (sempre) ─────────────────────────

def limpar() -> None:
    ids = [ESTADO["ids"][c] for c in ESTADO["ids"]]
    if ids:
        lista = ",".join(f"'{i}'" for i in ids)
        n = q(f"with x as (delete from staging.chaves_restauracao where user_id in ({lista}) returning 1) select count(*)::int as n from x")[0]["n"]
        print(f"limpeza: {n} chave(s) da rodada apagadas do staging")
    if ESTADO["inicio"]:
        n = q(f"with x as (delete from staging.restauracao_desafios where criado_em >= '{ESTADO['inicio']}' returning 1) select count(*)::int as n from x")[0]["n"]
        print(f"limpeza: {n} desafio(s) da rodada apagados do staging")
    trava(TRAVA_DO_STAGING)
    # 1 logout por sessão (o refresh gira o token mas a sessão é a mesma: o session_id do JWT)
    por_sessao = {claims(t).get("session_id"): t for t in SESSOES}
    fechadas = 0
    for tok in por_sessao.values():
        st, _, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/logout?scope=local", {}, {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}"})
        fechadas += st in (200, 204)
    print(f"limpeza: {fechadas}/{len(por_sessao)} sessão(ões) da rodada encerradas (logout local)")


# a ordem importa: a senha trocada apaga TODAS as chaves da Lia (o gatilho) — vai por último
CASOS = {"sql": caso_sql, "registrar": caso_registrar, "entrar": caso_entrar, "desafio": caso_desafio, "erradas": caso_erradas,
         "sem_estado": caso_sem_estado, "tolerante": caso_tolerante, "limite": caso_limite, "apagada": caso_apagada, "sair": caso_sair,
         "sessao": caso_sessao, "trava": caso_trava, "public": caso_public, "senha": caso_senha}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", default=",".join(CASOS))
    pedidos = [c.strip() for c in ap.parse_args().casos.split(",") if c.strip()]
    ESTADO["inicio"] = q("select now()::text as t")[0]["t"]
    try:
        for c in pedidos:
            print(f"\n── {c}", flush=True)
            try:
                CASOS[c]()
            except Exception as e:  # noqa: BLE001 — o caso falha, a rodada segue (e a limpeza roda)
                p.check(False, f"{c}: exceção {type(e).__name__}: {str(e)[:300]}")
    finally:
        limpar()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
