#!/usr/bin/env python3
"""Physiq W28 — massa do ENSAIO da virada no STAGING (spec §11.3 W28, passo 1): os casos de produção recriados em contas de
teste `w28.<caso>.teste.claude@…`, nos 2 bancos, ANTES dos scripts 01/03 (que transformam isso em contas do núcleo).

  legado Calc (Banco do Treino, schema staging — physiq_professores com as colunas de cobrança de hoje):
    ciclo (no prazo) · tolerancia (venceu há 3 dias: dentro dos 7) · vencida (venceu há 10) · anual · pausada (cobrança pausada
    pelo master) · suspenso · liberado (acesso liberado até +10, sem ciclo) · assinatura (cartão autorizado + 2 pagamentos)
  legado Nutri (banco principal, schema staging — profiles + assinaturas + pagamentos_assinatura):
    teste (como as 2 nutris reais: teste até +2) · pendente (teste + assinatura PENDENTE de R$ 80, como a de produção) ·
    pix (Pix pago, +20 dias) · vencida (teste acabou) · cartao (assinatura autorizada, próximo vencimento +15)
As assinaturas/pagamentos têm ids FALSOS (`sim-w28-…`/`w28-…`): nada vai ao Mercado Pago. Senhas em ~/.physiq-teste-w28-<caso>.

Uso:
  python3 e2e/w28/massa.py              cria (idempotente) a massa de origem nos 2 bancos
  python3 e2e/w28/massa.py --senhas     depois do 01: põe senha nos logins do PRINCIPAL dos casos do Calc (o 01 cria sem senha)
  python3 e2e/w28/massa.py --limpar     apaga tudo o que a W28 criou (contas, faturas, assinaturas, perfis e logins dos 2 bancos)
"""
from __future__ import annotations

import datetime as dt
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "w02"))
from _comum import (  # noqa: E402
    PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL, exec_treino, http, service, sql_principal, sql_treino,
)

HOJE = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date()
_PLANOS: dict[str, str] = {}


def plano_id(nome: str) -> str:
    """id do plano do Calc no schema staging (cada schema tem os seus)."""
    if not _PLANOS:
        for r in sql_treino("select id::text as id, lower(nome) as nome from staging.physiq_planos_professor"):
            _PLANOS[r["nome"]] = r["id"]
    return _PLANOS[nome]


def d(dias: int) -> str:
    return (HOJE + dt.timedelta(days=dias)).isoformat()


def ts(dias: int) -> str:
    """timestamptz daqui a N dias às 15:10 de São Paulo (o horário em que o teste do Nutri vence nas contas reais)."""
    return f"{d(dias)} 18:10:00+00"


CALC = {
    "ciclo": {"plano": "start", "adesao_paga_em": d(-25), "ciclo_inicio": d(-25), "ciclo_vence_em": d(5), "ciclo_valor": 39.90},
    "tolerancia": {"plano": "studio", "adesao_paga_em": d(-40), "ciclo_inicio": d(-33), "ciclo_vence_em": d(-3), "ciclo_valor": 79.90},
    "vencida": {"plano": "start", "adesao_paga_em": d(-50), "ciclo_inicio": d(-40), "ciclo_vence_em": d(-10), "ciclo_valor": 39.90},
    "anual": {"plano": "pro", "adesao_paga_em": d(-100), "anual_ate": d(200)},
    "pausada": {"plano": "start", "adesao_paga_em": d(-60), "ciclo_vence_em": d(-30), "cobranca_pausada": True},
    "suspenso": {"plano": "start", "adesao_paga_em": d(-25), "ciclo_vence_em": d(5), "status": "suspenso"},
    "liberado": {"plano": "start", "trial_ate": d(-20), "acesso_liberado_ate": d(10)},
    "assinatura": {"plano": "start", "adesao_paga_em": d(-20), "ciclo_inicio": d(-20), "ciclo_vence_em": d(10), "ciclo_valor": 39.90},
}
NUTRI = {
    "teste": {"teste_ate": ts(2)},
    "pendente": {"teste_ate": ts(2), "assinatura": {"status": "pending", "id": "sim-w28-nutri-pendente", "prox": ts(2)}},
    "pix": {"teste_ate": ts(-10), "pago_ate": ts(20), "pix": {"id": "w28-nutri-pix-1", "pago_em": ts(-10), "cobre_ate": ts(20)}},
    "vencida": {"teste_ate": ts(-5)},
    "cartao": {"teste_ate": ts(-30), "assinatura": {"status": "authorized", "id": "sim-w28-nutri-cartao", "prox": ts(15)}},
}


def email_calc(caso: str) -> str:
    return f"w28.calc.{caso}.teste.claude@physiqcalc.app"


def email_nutri(caso: str) -> str:
    return f"w28.nutri.{caso}.teste.claude@physiqnutri.app"


def senha(nome: str) -> str:
    arq = Path.home() / f".physiq-teste-w28-{nome}"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


def lit(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def garantir_login(url: str, chave: str, email: str, pw: str, app_meta: dict, user_meta: dict, achar_sql) -> str:
    cab = {"apikey": chave, "Authorization": f"Bearer {chave}"}
    achado = achar_sql(f"select id::text as id from auth.users where lower(email) = {lit(email)}")
    if achado:
        st, r, _ = http("PUT", f"{url}/auth/v1/admin/users/{achado[0]['id']}", {"password": pw, "email_confirm": True}, cab)
        assert st == 200, (email, st, r)
        return achado[0]["id"]
    st, r, _ = http("POST", f"{url}/auth/v1/admin/users",
                    {"email": email, "password": pw, "email_confirm": True, "app_metadata": app_meta, "user_metadata": user_meta}, cab)
    assert st == 200, (email, st, r)
    return r["id"]


def criar() -> None:
    st = service(TREINO_REF)
    for caso, c in CALC.items():
        email = email_calc(caso)
        uid = garantir_login(TREINO_URL, st, email, senha(f"calc-{caso}"), {"role": "professor"},
                             {"full_name": f"W28 Calc {caso.capitalize()}", "ambiente": "staging"}, sql_treino)
        exec_treino(f"""insert into staging.physiq_profiles (id, nome, email) values ({lit(uid)}, {lit('W28 Calc ' + caso.capitalize())}, {lit(email)})
            on conflict (id) do nothing;
          insert into staging.physiq_professores (id, nome, email, status, codigo_convite, plano_id, trial_ate, adesao_paga_em, ciclo_inicio,
              ciclo_vence_em, ciclo_valor, anual_ate, cobranca_pausada, acesso_liberado_ate)
          values ({lit(uid)}, {lit('W28 Calc ' + caso.capitalize())}, {lit(email)}, {lit(c.get('status', 'ativo'))}, {lit('PROF-W28-' + caso.upper())},
              {lit(plano_id(c['plano']))}, {lit(c.get('trial_ate'))}, {lit(c.get('adesao_paga_em'))}, {lit(c.get('ciclo_inicio'))},
              {lit(c.get('ciclo_vence_em'))}, {lit(c.get('ciclo_valor'))}, {lit(c.get('anual_ate'))}, {lit(c.get('cobranca_pausada', False))},
              {lit(c.get('acesso_liberado_ate'))})
          on conflict (id) do update set status = excluded.status, plano_id = excluded.plano_id, trial_ate = excluded.trial_ate,
              adesao_paga_em = excluded.adesao_paga_em, ciclo_inicio = excluded.ciclo_inicio, ciclo_vence_em = excluded.ciclo_vence_em,
              ciclo_valor = excluded.ciclo_valor, anual_ate = excluded.anual_ate, cobranca_pausada = excluded.cobranca_pausada,
              acesso_liberado_ate = excluded.acesso_liberado_ate""")
        if caso == "assinatura":
            exec_treino(f"""insert into staging.physiq_assinaturas (user_id, mp_preapproval_id, status, valor, contexto)
                select {lit(uid)}, 'sim-w28-calc-assinatura', 'authorized', 39.90, 'plano_professor'
                 where not exists (select 1 from staging.physiq_assinaturas where mp_preapproval_id = 'sim-w28-calc-assinatura');
              insert into staging.physiq_pagamentos (user_id, tipo, valor, mes_ref, mp_payment_id, status, contexto, plano_id, tipo_cobranca, created_at, updated_at)
                values ({lit(uid)}, 'pix', 500, {lit(d(-20)[:8] + '01')}, 'w28-calc-pag-adesao', 'approved', 'plano_professor', {lit(plano_id('start'))}, 'adesao', now() - interval '20 days', now() - interval '20 days'),
                       ({lit(uid)}, 'cartao', 39.90, {lit(d(-20)[:8] + '01')}, 'w28-calc-pag-mensal', 'approved', 'plano_professor', {lit(plano_id('start'))}, 'mensal', now() - interval '20 days', now() - interval '20 days')
              on conflict (mp_payment_id) do nothing""")
        print(f"calc   {caso:11s} {email:48s} {uid}")
    sp = service(PRINCIPAL_REF)
    for caso, c in NUTRI.items():
        email = email_nutri(caso)
        # sem papel no cadastro nem no JWT: o gatilho do principal grava 'pessoa' nos 2 schemas (com 'nutricionista' — no cadastro
        # ou depois, pelo gatilho sincronizar_papel_do_jwt — a nutri de teste iria também para o PUBLIC e o 01 de produção criaria
        # uma conta legado_nutri pra ela); o papel de nutricionista fica SÓ no staging.profiles
        uid = garantir_login(PRINCIPAL_URL, sp, email, senha(f"nutri-{caso}"), {},
                             {"full_name": f"W28 Nutri {caso.capitalize()}"}, sql_principal)
        sql_principal(f"""insert into staging.profiles (id, nome, email, role, tipo_perfil, teste_ate, pago_ate, isento_assinatura)
            values ({lit(uid)}, {lit('W28 Nutri ' + caso.capitalize())}, {lit(email)}, 'nutricionista', 'nutricionista', {lit(c.get('teste_ate'))},
                    {lit(c.get('pago_ate'))}, false)
            on conflict (id) do update set role = 'nutricionista', teste_ate = excluded.teste_ate, pago_ate = excluded.pago_ate,
                    isento_assinatura = false""")
        a = c.get("assinatura")
        if a:
            sql_principal(f"""insert into staging.assinaturas (nutricionista_id, mp_preapproval_id, status, valor, proximo_vencimento)
                select {lit(uid)}, {lit(a['id'])}, {lit(a['status'])}, 80, {lit(a['prox'])}
                 where not exists (select 1 from staging.assinaturas where nutricionista_id = {lit(uid)})""")
        p = c.get("pix")
        if p:
            sql_principal(f"""insert into staging.pagamentos_assinatura (nutricionista_id, mp_payment_id, valor, status, pago_em, cobre_ate)
                select {lit(uid)}, {lit(p['id'])}, 80, 'approved', {lit(p['pago_em'])}, {lit(p['cobre_ate'])}
                 where not exists (select 1 from staging.pagamentos_assinatura where mp_payment_id = {lit(p['id'])})""")
        print(f"nutri  {caso:11s} {email:48s} {uid}")


def senhas() -> None:
    """O 01 cria o login do principal SEM senha (o professor do Calc entra com o Google): os de teste ganham senha."""
    sp = service(PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    for caso in CALC:
        email = email_calc(caso)
        achado = sql_principal(f"select id::text as id from auth.users where lower(email) = {lit(email)}")
        if not achado:
            print(f"sem login no principal ainda: {email} (rode o 01 antes)")
            continue
        st, r, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{achado[0]['id']}", {"password": senha(f"calc-{caso}"), "email_confirm": True}, cab)
        print(f"senha principal {email}: HTTP {st}")


def limpar() -> None:
    like_calc = "w28.calc.%.teste.claude@physiqcalc.app"
    like_nutri = "w28.nutri.%.teste.claude@physiqnutri.app"
    # principal: contas (faturas, assinaturas, eventos e membros vão em cascata), matrículas, perfis, assinaturas antigas, logins
    like_todas = "w28.%.teste.claude@physiq%.app"  # inclui o master de teste do e2e/w28/telas.py
    p_ids = [r["id"] for r in sql_principal(f"select id::text as id from auth.users where lower(email) like '{like_todas}'")]
    if p_ids:
        lista = ",".join(lit(x) for x in p_ids)
        sql_principal(f"""delete from staging.conta_membros where conta_id in (select id from staging.contas where dono_id in ({lista}));
          delete from staging.contas where dono_id in ({lista});
          delete from staging.pacientes where user_id in ({lista});
          delete from staging.assinaturas where nutricionista_id in ({lista});
          delete from staging.pagamentos_assinatura where nutricionista_id in ({lista});
          delete from staging.espelho_pendencias where payload->>'principal_user_id' in ({lista});
          delete from staging.profiles where id in ({lista});
          delete from public.profiles where id in ({lista}) and role in ('pessoa', 'nutricionista', 'master')
            and not exists (select 1 from public.contas c where c.dono_id = public.profiles.id)""")
        sp = service(PRINCIPAL_REF)
        for uid in p_ids:
            st, _, _ = http("DELETE", f"{PRINCIPAL_URL}/auth/v1/admin/users/{uid}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
            print(f"principal login apagado {uid}: HTTP {st}")
    t_ids = [r["id"] for r in sql_treino(f"select id::text as id from auth.users where lower(email) like '{like_todas}'")]
    if t_ids:
        lista = ",".join(lit(x) for x in t_ids)
        exec_treino(f"""delete from staging.physiq_pagamentos where user_id in ({lista});
          delete from staging.physiq_assinaturas where user_id in ({lista});
          delete from staging.physiq_espelho_membros where treino_user_id in ({lista});
          delete from staging.physiq_identidades where treino_user_id in ({lista});
          delete from staging.physiq_professores where id in ({lista});
          delete from staging.physiq_profiles where id in ({lista})""")
        st_ = service(TREINO_REF)
        for uid in t_ids:
            st, _, _ = http("DELETE", f"{TREINO_URL}/auth/v1/admin/users/{uid}", None, {"apikey": st_, "Authorization": f"Bearer {st_}"})
            print(f"treino login apagado {uid}: HTTP {st}")
    print("limpo")


if __name__ == "__main__":
    if "--limpar" in sys.argv:
        limpar()
    elif "--senhas" in sys.argv:
        senhas()
    else:
        criar()
