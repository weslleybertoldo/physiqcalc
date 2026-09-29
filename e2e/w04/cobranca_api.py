#!/usr/bin/env python3
"""Physiq W4 — E2E de API da cobrança das contas no STAGING (banco principal + Mercado Pago de TESTE + Banco do Treino).

Fluxo (spec 11.3 W4, "pronto quando"): criar conta ("Sou profissional") → teste de 14 dias → Pix (sandbox) → webhook
simulado + idempotência → Pix simulado aprovado (+1 mês a partir do fim do teste) → vence (relógio simulado na tarefa das
03:40) → trava → paga → libera; cartão à vista com o cartão de teste (APRO aprova, OTHE recusa); cobrança automática criada com
a credencial de TESTE (o sandbox não tem assinatura com cartão → assinatura PENDENTE de verdade no MP) + cobrança simulada +
cancelar; mudar de plano (subir, descer se couber); limite da faixa; espelho de acesso no Treino (acesso_liberado_ate e papel
do personal); aviso de WhatsApp ao dono (numa transação desfeita — nada vai para a fila de verdade); legado intocado.

Conta de teste: dono.teste.claude@physiqnutri.app (senha em ~/.physiq-teste-dono; criada aqui se faltar — só contas de teste).
Credenciais do MP de TESTE em ~/.physiq-mp-test e ~/.physiq-mp-public-test (cofre › PhysiqCalc › "Mercado Pago — PhysiqCalc").
Uso: python3 e2e/w04/cobranca_api.py [--sem-reset] [--deixar-vencida]
"""
from __future__ import annotations

import datetime as dt
import json
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, TREINO_URL, Placar, anon, http, login_senha, service, sql_principal, sql_treino  # noqa: E402

SCHEMA = "staging"
ORIGEM = "https://physiqcalc-staging.vercel.app"
EMAIL = "dono.teste.claude@physiqnutri.app"
MP = "https://api.mercadopago.com"
p = Placar()


def ler(nome: str) -> str:
    return Path.home().joinpath(nome).read_text(encoding="utf-8").strip()


def senha_dono() -> str:
    arq = Path.home() / ".physiq-teste-dono"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


def garantir_usuario(email: str, senha: str, nome: str) -> str:
    sp = service(PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    achado = sql_principal(f"select id::text as id from auth.users where lower(email) = '{email}'")
    if achado:
        st, r, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{achado[0]['id']}", {"password": senha, "email_confirm": True}, cab)
        assert st == 200, (st, r)
        return achado[0]["id"]
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users",
                    {"email": email, "password": senha, "email_confirm": True, "user_metadata": {"full_name": nome}}, cab)
    assert st == 200, (st, r)
    return r["id"]


def sessao(email: str, senha: str) -> str:
    return login_senha(PRINCIPAL_URL, anon(PRINCIPAL_REF), email, senha)["access_token"]


def rpc(token: str, fn: str, args: dict | None = None) -> tuple[int, object]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{fn}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Content-Profile": SCHEMA, "Accept-Profile": SCHEMA})
    return st, r


def cobranca(token: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/cobranca-conta", {"acao": acao, **(corpo or {})},
                    {"Authorization": f"Bearer {token}", "apikey": anon(PRINCIPAL_REF), "x-schema": SCHEMA, "Origin": ORIGEM}, timeout=120)
    return st, (r if isinstance(r, dict) else {"_": r})


def webhook(topico: str, rid: str) -> tuple[int, dict]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/mp-webhook-conta?schema={SCHEMA}", {"type": topico, "action": f"{topico}.updated", "data": {"id": rid}})
    return st, (r if isinstance(r, dict) else {"_": r})


def mp(metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
    cab = {"Authorization": f"Bearer {ler('.physiq-mp-test')}"}
    if metodo == "POST":
        cab["X-Idempotency-Key"] = secrets.token_hex(16)
    st, r, _ = http(metodo, f"{MP}{caminho}", corpo, cab)
    return st, (r if isinstance(r, dict) else {"_": r})


def token_cartao(titular: str = "APRO") -> str:
    st, r, _ = http("POST", f"{MP}/v1/card_tokens?public_key={ler('.physiq-mp-public-test')}", {
        "card_number": "5031433215406351", "expiration_month": 11, "expiration_year": 2030, "security_code": "123",
        "cardholder": {"name": titular, "identification": {"type": "CPF", "number": "12345678909"}}})
    assert st in (200, 201) and r.get("id"), (st, r)
    return r["id"]


def conta_do_dono(uid: str) -> dict | None:
    r = sql_principal(f"select id::text, situacao, plano, faixa, periodicidade, teste_ate::text, vence_em::text, tolerancia_dias, valor_travado "
                      f"from {SCHEMA}.contas where dono_id = '{uid}' and origem = 'nova' order by criado_em limit 1")
    return r[0] if r else None


def esperar(cond, timeout=60.0, passo=2.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(passo)
    return False


def hoje_sp() -> str:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()


def somar_meses(d: str, n: int) -> str:
    a, m, dia = map(int, d.split("-"))
    m0 = m - 1 + n
    a2, m2 = a + m0 // 12, m0 % 12 + 1
    import calendar
    return dt.date(a2, m2, min(dia, calendar.monthrange(a2, m2)[1])).isoformat()


def resetar(uid: str) -> None:
    """Só dados de TESTE do staging: fecha no sandbox o que ficou aberto e apaga a conta nova do dono de teste."""
    for f in sql_principal(f"select mp_payment_id from {SCHEMA}.conta_faturas f join {SCHEMA}.contas c on c.id = f.conta_id "
                           f"where c.dono_id = '{uid}' and c.origem = 'nova' and f.status in ('pending','in_process') and f.mp_payment_id is not null and f.mp_payment_id not like 'sim-%'"):
        mp("PUT", f"/v1/payments/{f['mp_payment_id']}", {"status": "cancelled"})
    for a in sql_principal(f"select mp_preapproval_id from {SCHEMA}.conta_assinaturas a join {SCHEMA}.contas c on c.id = a.conta_id "
                           f"where c.dono_id = '{uid}' and c.origem = 'nova' and a.status <> 'cancelled' and a.mp_preapproval_id is not null and a.mp_preapproval_id not like 'sim-%'"):
        mp("PUT", f"/preapproval/{a['mp_preapproval_id']}", {"status": "cancelled"})
    sql_principal(f"""delete from {SCHEMA}.pacientes where conta_id in (select id from {SCHEMA}.contas where dono_id = '{uid}' and origem = 'nova') and email like '%.teste.claude%';
                      delete from {SCHEMA}.contas where dono_id = '{uid}' and origem = 'nova';
                      update {SCHEMA}.profiles set tipo_perfil = null where id = '{uid}';""")


def main() -> int:
    reset = "--sem-reset" not in sys.argv
    senha = senha_dono()
    uid = garantir_usuario(EMAIL, senha, "Dono Teste W4")
    tok = sessao(EMAIL, senha)
    if reset:
        resetar(uid)
    fila_wa_antes = sql_principal(f"select count(*)::int n from {SCHEMA}.mensagens_whatsapp")[0]["n"]
    legados_antes = sql_principal(f"select id::text, situacao, vence_em::text, teste_ate::text from {SCHEMA}.contas where origem <> 'nova' order by id")

    # 1. Sou profissional → conta nova com 14 dias grátis (Treino + Nutrição, até 10 alunos)
    st, r = rpc(tok, "criar_minha_conta", {"p_nome": "Consultoria Teste W4", "p_tipo": "personal", "p_registro": "CREF 000000-G/PE"})
    p.check(st == 200 and r.get("ok") and not r.get("ja_existia"), f"criar_minha_conta → conta nova ({st}, {r})")
    hoje = hoje_sp()
    c = conta_do_dono(uid)
    p.check(c and c["situacao"] == "teste" and c["plano"] == "treino_nutricao" and c["faixa"] == "f10" and c["teste_ate"] == (dt.date.fromisoformat(hoje) + dt.timedelta(days=14)).isoformat(),
            f"teste de 14 dias no Treino + Nutrição 1–10 ({c})")
    st2, r2 = rpc(tok, "criar_minha_conta", {"p_nome": "Outra", "p_tipo": "nutricionista"})
    p.check(st2 == 200 and r2.get("ok") and r2.get("ja_existia") and r2.get("conta_id") == c["id"], "criar de novo devolve a mesma conta (idempotente)")
    st3, r3 = rpc(tok, "criar_minha_conta", {"p_nome": "X", "p_tipo": "dono"})
    p.check(st3 == 200 and r3.get("ok") is True and r3.get("ja_existia"), "idempotente vem antes da validação (mesma conta)")
    membro = sql_principal(f"select papeis, codigo_convite from {SCHEMA}.conta_membros where conta_id = '{c['id']}' and user_id = '{uid}'")
    p.check(membro and sorted(membro[0]["papeis"]) == ["dono", "personal"] and (membro[0]["codigo_convite"] or "").startswith("PROF-"),
            f"membro dono + personal com código {membro}")
    st, sit = rpc(tok, "minha_situacao")
    conta_sit = next((x for x in sit.get("contas", []) if x["id"] == c["id"]), None)
    p.check(conta_sit and conta_sit["limite_alunos"] == 10 and float(conta_sit["valor_mensal"]) == 59.9 and sit.get("precisa_treino") and not sit.get("sem_nada"),
            f"minha_situacao: limite 10, R$ 59,90, precisa do Treino ({conta_sit and {k: conta_sit[k] for k in ('situacao', 'limite_alunos', 'valor_mensal')}})")

    # 2. troca de token (como o app): o personal da conta nova chega ao Treino com o acesso do teste (ponte)
    st, tt, _ = http("POST", f"{TREINO_URL}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {tok}", "x-schema": SCHEMA, "Origin": ORIGEM})
    p.check(st == 200 and tt.get("access_token"), f"trocar-token → sessão do Treino ({st})")
    tid = sql_treino(f"select treino_user_id::text from {SCHEMA}.physiq_identidades where principal_user_id = '{uid}'")[0]["treino_user_id"]
    prof = sql_treino(f"select acesso_liberado_ate::text a, nucleo_acesso_ate::text n, status from {SCHEMA}.physiq_professores where id = '{tid}'")
    p.check(prof and prof[0]["a"] == c["teste_ate"] and prof[0]["status"] == "ativo", f"Treino: professor com acesso até o fim do teste ({prof})")
    papel = sql_treino(f"select raw_app_meta_data->>'role' r from auth.users where id = '{tid}'")[0]["r"]
    p.check(papel == "professor", f"Treino: papel professor no JWT ({papel})")

    # 3. conta legada não usa esta cobrança
    kv = dict(l.strip().split("=", 1) for l in Path.home().joinpath(".physiqcalc-teste-admin").read_text().splitlines() if "=" in l)
    tok_prof1 = sessao("prof1.teste.claude@physiqcalc.app", kv["SENHA"])
    st, r = cobranca(tok_prof1, "status")
    p.check(st in (400, 404) and r.get("erro") in ("conta_legada", "sem_conta"), f"legado Calc recusado na cobrança nova ({st} {r.get('erro')})")

    # 4. status
    st, s = cobranca(tok, "status", {"conta_id": c["id"]})
    p.check(st == 200 and s["conta"]["efetiva"] == "teste" and len(s["precos"]) == 12 and s["simulacao"] is True, f"status: teste, 12 preços, simulação ({st})")

    # 5. Pix (sandbox) + reaproveitar + webhook simulado + conferir
    st, pix = cobranca(tok, "pix_criar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1})
    f = pix.get("fatura") or {}
    p.check(st == 200 and f.get("status") == "pending" and f.get("pix_copia_cola") and f.get("mp_payment_id") and float(f["valor"]) == 59.9,
            f"Pix de R$ 59,90 gerado no sandbox ({st} mp={f.get('mp_payment_id')} simulado={pix.get('simulado')})")
    if f.get("mp_payment_id") and not str(f["mp_payment_id"]).startswith("sim-"):
        stp, pay = mp("GET", f"/v1/payments/{f['mp_payment_id']}")
        p.check(stp == 200 and pay.get("status") == "pending" and (pay.get("external_reference") or "").startswith(f"physiq:staging:conta:{c['id']}:mensal:"),
                f"MP de teste: Pix pendente com a referência physiq:staging:conta:… ({pay.get('status')}, {pay.get('external_reference')})")
        p.check((pay.get("notification_url") or "").endswith("/functions/v1/mp-webhook-conta?schema=staging"), f"notification_url por cobrança ({pay.get('notification_url')})")
    st, pix2 = cobranca(tok, "pix_criar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1})
    p.check(st == 200 and pix2.get("reutilizada") and pix2["fatura"]["id"] == f["id"], "o mesmo Pix aberto é reaproveitado")
    if f.get("mp_payment_id") and not str(f["mp_payment_id"]).startswith("sim-"):
        stw, rw = webhook("payment", f["mp_payment_id"])
        p.check(stw == 200 and rw.get("resultado") == "fatura_pending", f"webhook simulado (Pix ainda aberto) → {rw}")
    stw, rw = webhook("payment", "999999999999")
    p.check(stw == 200 and str(rw.get("resultado", "")).startswith("pagamento_nao_encontrado"), f"webhook de pagamento que não existe → ignorado ({rw})")
    st, ps = cobranca(tok, "pix_status", {"conta_id": c["id"], "fatura_id": f["id"]})
    p.check(st == 200 and ps["fatura"]["status"] == "pending", "pix_status: aguardando")

    # 6. Pix simulado aprovado → +1 mês a partir do FIM DO TESTE (ninguém perde dia)
    st, sa = cobranca(tok, "simular_aprovacao", {"conta_id": c["id"], "fatura_id": f["id"]})
    c2 = conta_do_dono(uid)
    esperado = somar_meses(c["teste_ate"], 1)
    p.check(st == 200 and c2["situacao"] == "ativa" and c2["vence_em"] == esperado, f"Pix aprovado: ativa até {esperado} ({c2['situacao']} {c2['vence_em']})")
    fat = sql_principal(f"select status, pago_em is not null pago, cobre_de::text, cobre_ate::text from {SCHEMA}.conta_faturas where id = '{f['id']}'")[0]
    p.check(fat["status"] == "approved" and fat["pago"] and fat["cobre_de"] == c["teste_ate"] and fat["cobre_ate"] == esperado, f"fatura aprovada, cobre {fat['cobre_de']} a {fat['cobre_ate']}")
    st, sa2 = cobranca(tok, "simular_aprovacao", {"conta_id": c["id"], "fatura_id": f["id"]})
    c3 = conta_do_dono(uid)
    ev = sql_principal(f"select count(*)::int n from {SCHEMA}.conta_eventos where conta_id = '{c['id']}' and tipo = 'pagamento'")[0]["n"]
    p.check(st == 200 and (sa2.get("resultado") or {}).get("ja_aplicada") and c3["vence_em"] == esperado and ev == 1, f"aplicar de novo não soma outro mês (idempotente; eventos {ev})")
    if f.get("mp_payment_id") and not str(f["mp_payment_id"]).startswith("sim-"):
        stw, rw = webhook("payment", f["mp_payment_id"])
        c4 = conta_do_dono(uid)
        p.check(stw == 200 and c4["vence_em"] == esperado, f"webhook repetido depois de aplicado → nada muda ({rw})")

    # 7. espelho de acesso para o Treino (pg_net → espelho-enviar → espelho-nucleo)
    ok = esperar(lambda: sql_treino(f"select acesso_liberado_ate::text a from {SCHEMA}.physiq_professores where id = '{tid}'")[0]["a"] == esperado, 90)
    p.check(ok, f"Treino recebeu o acesso novo do personal (acesso_liberado_ate = {esperado})")
    pend = sql_principal(f"select count(*)::int n from {SCHEMA}.espelho_pendencias where feito_em is null and tentativas < 5 and payload->>'conta_id' = '{c['id']}'")[0]["n"]
    if pend:
        esperar(lambda: sql_principal(f"select count(*)::int n from {SCHEMA}.espelho_pendencias where feito_em is null and tentativas < 5 and payload->>'conta_id' = '{c['id']}'")[0]["n"] == 0, 60)
        pend = sql_principal(f"select count(*)::int n from {SCHEMA}.espelho_pendencias where feito_em is null and tentativas < 5 and payload->>'conta_id' = '{c['id']}'")[0]["n"]
    p.check(pend == 0, f"fila do espelho da conta processada ({pend} pendentes)")

    # 8. cartão à vista com o cartão de TESTE: APRO aprova, OTHE recusa
    st, cr = cobranca(tok, "cartao_pagar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1, "card_token": token_cartao("APRO"), "payment_method_id": "master"})
    c5 = conta_do_dono(uid)
    esperado2 = somar_meses(esperado, 1)
    p.check(st == 200 and cr.get("status") == "approved" and cr.get("aplicou") and c5["vence_em"] == esperado2, f"cartão de teste APRO aprovado → +1 mês ({c5['vence_em']})")
    mp_id_cartao = (cr.get("fatura") or {}).get("mp_payment_id")
    st, rr = cobranca(tok, "cartao_pagar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1, "card_token": token_cartao("OTHE"), "payment_method_id": "master"})
    c6 = conta_do_dono(uid)
    p.check(st == 200 and rr.get("status") == "rejected" and c6["vence_em"] == esperado2, f"cartão OTHE recusado → não soma ({rr.get('status')}, {rr.get('status_detail')})")
    if mp_id_cartao:
        stw, rw = webhook("payment", mp_id_cartao)
        p.check(stw == 200 and conta_do_dono(uid)["vence_em"] == esperado2, f"webhook do cartão aprovado (repetido) → idempotente ({rw})")

    # 9. anual por Pix (só gerar e cancelar) + regra "conta ativa troca o plano pelo Mudar plano"
    st, pa = cobranca(tok, "pix_criar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 12})
    p.check(st == 200 and float(pa["fatura"]["valor"]) == 599 and pa["fatura"]["meses"] == 12, f"Pix anual = 10 mensalidades (R$ 599,00) ({st})")
    st, pe = cobranca(tok, "pix_criar", {"conta_id": c["id"], "plano": "treino", "faixa": "f30", "meses": 1})
    p.check(st == 400 and pe.get("erro") == "use_mudar_plano", f"conta ativa pagando outro plano → 'use_mudar_plano' ({pe.get('erro')})")

    # 10. mudar de plano: subir na hora; descer só se couber (limite da faixa)
    st, mu = cobranca(tok, "mudar_plano", {"conta_id": c["id"], "plano": "treino", "faixa": "f30"})
    c7 = conta_do_dono(uid)
    p.check(st == 200 and c7["plano"] == "treino" and c7["faixa"] == "f30", f"mudar para Só Treino 11–30 ({st} {c7['plano']} {c7['faixa']})")
    anual = sql_principal(f"select status from {SCHEMA}.conta_faturas where id = '{pa['fatura']['id']}'")[0]["status"]
    p.check(anual == "cancelled", f"Pix aberto com o preço antigo foi fechado ({anual})")
    # 11 alunos ativos → descer para 1–10 é recusado; e a 11ª matrícula na faixa 1–10 também
    sql_principal(f"""insert into {SCHEMA}.pacientes (nome, email, conta_id, ativo, origem)
                      select 'Aluno teste W4 ' || g, 'aluno' || g || '.w4.teste.claude@physiqnutri.app', '{c['id']}', true, 'novo'
                      from generate_series(1, 11) g""")
    st, md = cobranca(tok, "mudar_plano", {"conta_id": c["id"], "plano": "treino", "faixa": "f10"})
    p.check(st == 400 and md.get("erro") == "alunos_acima_do_limite" and md.get("limite") == 10 and md.get("alunos") == 11, f"descer com 11 alunos → recusado ({md})")
    sql_principal(f"delete from {SCHEMA}.pacientes where conta_id = '{c['id']}' and email like 'aluno%.w4.teste.claude@physiqnutri.app' and nome like 'Aluno teste W4 1_'")
    ativos = sql_principal(f"select {SCHEMA}.conta_alunos_ativos('{c['id']}') n")[0]["n"]
    st, mb = cobranca(tok, "mudar_plano", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10"})
    p.check(st == 200 and ativos == 9, f"com {ativos} alunos, voltar para Treino + Nutrição 1–10 → ok ({st})")
    # limite: a 11ª matrícula (vincular_aluno_por_codigo) numa conta 1–10 cheia é recusada
    sql_principal(f"insert into {SCHEMA}.pacientes (nome, email, conta_id, ativo, origem) values ('Aluno teste W4 10', 'aluno10b.w4.teste.claude@physiqnutri.app', '{c['id']}', true, 'novo')")
    # (numa transação DESFEITA: se o limite falhasse, a pessoa de teste não fica matriculada)
    pessoa_uid = sql_principal("select id::text from auth.users where lower(email) = 'pessoa.teste.claude@physiqnutri.app'")[0]["id"]
    lim: dict = {}
    try:
        sql_principal(f"do $dry$ declare r jsonb; begin r := {SCHEMA}.matricular_na_conta('{pessoa_uid}', '{c['id']}', '{uid}', null, 'novo', false); "
                      f"raise exception 'DRYRUN %', r; end $dry$;")
    except RuntimeError as e:
        txt = str(e)
        lim = {"erro": "limite_plano"} if '\\"limite_plano\\"' in txt or '"limite_plano"' in txt or "limite_plano" in txt else {"bruto": txt[-300:]}
    p.check(lim.get("erro") == "limite_plano", f"11º aluno numa conta 1–10 (10 ativos) → 'limite_plano' ({lim})")
    sql_principal(f"delete from {SCHEMA}.pacientes where conta_id = '{c['id']}' and email like 'aluno%.w4.teste.claude@physiqnutri.app'")

    # 11. cobrança automática com a credencial de TESTE (sandbox: assinatura pendente de verdade no MP) + simulada + cancelar
    st, asn = cobranca(tok, "assinar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "card_token": token_cartao("APRO"), "payment_method_id": "master"})
    pre_id = (asn.get("assinatura") or {}).get("mp_preapproval_id")
    p.check(st == 200 and asn.get("sandbox") is True and pre_id and asn.get("init_point"), f"assinatura criada no MP de TESTE (pendente, checkout) ({st} {pre_id})")
    if pre_id:
        stp, pre = mp("GET", f"/preapproval/{pre_id}")
        p.check(stp == 200 and pre.get("status") == "pending" and (pre.get("external_reference") or "") == f"physiq:staging:conta:{c['id']}:recorrente"
                and float(pre.get("auto_recurring", {}).get("transaction_amount", 0)) == 59.9, f"MP de teste: preapproval {pre.get('status')} R$ {pre.get('auto_recurring', {}).get('transaction_amount')} ref ok")
        stw, rw = webhook("subscription_preapproval", pre_id)
        p.check(stw == 200 and str(rw.get("resultado", "")).startswith("assinatura_"), f"webhook da assinatura → {rw}")
    antes_rec = conta_do_dono(uid)["vence_em"]
    st, sr = cobranca(tok, "simular_recorrente", {"conta_id": c["id"]})
    c8 = conta_do_dono(uid)
    p.check(st == 200 and c8["vence_em"] == somar_meses(antes_rec, 1) and (sr.get("assinatura") or {}).get("status") == "authorized",
            f"cobrança da assinatura (simulada) → +1 mês ({antes_rec} → {c8['vence_em']})")
    st, sit2 = rpc(tok, "minha_situacao")
    cs = next((x for x in sit2.get("contas", []) if x["id"] == c["id"]), {})
    p.check((cs.get("assinatura") or {}).get("status") == "authorized", "minha_situacao traz a assinatura (card do plano 'Renova em … · cartão')")
    st, pc = cobranca(tok, "pix_criar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1})
    p.check(st == 400 and pc.get("erro") == "cartao_ativo", f"com a cobrança automática ligada, o Pix avulso é recusado (sem cobrança dobrada) ({pc.get('erro')})")
    st, cc = cobranca(tok, "cancelar_assinatura", {"conta_id": c["id"]})
    stp, pre2 = mp("GET", f"/preapproval/{pre_id}") if pre_id else (0, {})
    p.check(st == 200 and pre2.get("status") == "cancelled", f"cancelar a cobrança automática → cancelada no MP ({pre2.get('status')})")

    # 12. relógio simulado: vence → trava no dia seguinte → paga → libera
    vence = conta_do_dono(uid)["vence_em"]
    r1 = sql_principal(f"select {SCHEMA}.contas_tarefa_diaria('{vence}', '{c['id']}') r")[0]["r"]
    p.check(conta_do_dono(uid)["situacao"] == "ativa", f"tarefa das 03:40 NO DIA do vencimento ({vence}): continua ativa ({r1})")
    dia_seguinte = (dt.date.fromisoformat(vence) + dt.timedelta(days=1)).isoformat()
    r2 = sql_principal(f"select {SCHEMA}.contas_tarefa_diaria('{dia_seguinte}', '{c['id']}') r")[0]["r"]
    p.check(conta_do_dono(uid)["situacao"] == "vencida" and r2["contas_mudaram"] >= 1, f"tarefa no DIA SEGUINTE ({dia_seguinte}): vencida ({r2})")
    ev_sit = sql_principal(f"select count(*)::int n from {SCHEMA}.conta_eventos where conta_id = '{c['id']}' and tipo = 'situacao'")[0]["n"]
    p.check(ev_sit >= 1, f"linha do tempo registrou a mudança de situação ({ev_sit})")
    # o vencimento de verdade para "ontem" (a tela e o Treino usam o relógio real) e paga → libera
    ontem = (dt.date.fromisoformat(hoje) - dt.timedelta(days=1)).isoformat()
    sql_principal(f"update {SCHEMA}.contas set vence_em = '{ontem}', teste_ate = '{(dt.date.fromisoformat(hoje) - dt.timedelta(days=20)).isoformat()}' where id = '{c['id']}'")
    sql_principal(f"select {SCHEMA}.contas_tarefa_diaria()")
    st, sv = cobranca(tok, "status", {"conta_id": c["id"]})
    p.check(sv["conta"]["efetiva"] == "vencida", f"vencida ontem → trava hoje ({sv['conta']['efetiva']})")
    ok = esperar(lambda: sql_treino(f"select acesso_liberado_ate::text a from {SCHEMA}.physiq_professores where id = '{tid}'")[0]["a"] == ontem, 90)
    p.check(ok, "Treino: o acesso do personal acompanhou (acesso até ontem = prescrição travada)")
    if "--deixar-vencida" in sys.argv:
        print("\n(deixada vencida para o E2E de tela)")
        return p.fim()
    st, pv = cobranca(tok, "pix_criar", {"conta_id": c["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1})
    st, sa3 = cobranca(tok, "simular_aprovacao", {"conta_id": c["id"], "fatura_id": pv["fatura"]["id"]})
    c9 = conta_do_dono(uid)
    p.check(c9["situacao"] == "ativa" and c9["vence_em"] == somar_meses(hoje, 1), f"pagou vencida → libera, +1 mês a partir de hoje ({c9['vence_em']})")

    # 13. aviso de WhatsApp ao dono 3 dias antes (numa transação DESFEITA: nada fica na fila de verdade)
    tres = (dt.date.fromisoformat(hoje) + dt.timedelta(days=3)).isoformat()
    try:
        sql_principal(f"""do $dry$
        declare v jsonb; n int;
        begin
          insert into {SCHEMA}.whatsapp_instancias (nutricionista_id, status) values ('{uid}', 'conectado')
            on conflict (nutricionista_id) do update set status = 'conectado';
          update {SCHEMA}.profiles set dados_profissionais = coalesce(dados_profissionais, '{{}}'::jsonb) || '{{"whatsapp_e164": "+5500000000000"}}'::jsonb where id = '{uid}';
          update {SCHEMA}.contas set vence_em = '{tres}', situacao = 'ativa' where id = '{c['id']}';
          v := {SCHEMA}.contas_tarefa_diaria();
          select count(*) into n from {SCHEMA}.mensagens_whatsapp where conta_id = '{c['id']}' and tipo = 'assinatura_vencendo';
          raise exception 'DRYRUN %', jsonb_build_object('tarefa', v, 'mensagens', n,
            'texto', (select texto from {SCHEMA}.mensagens_whatsapp where conta_id = '{c['id']}' limit 1),
            'agendada_para', (select agendada_para from {SCHEMA}.mensagens_whatsapp where conta_id = '{c['id']}' limit 1));
        end $dry$;""")
        p.check(False, "o bloco de teste do WhatsApp devia ter desfeito com DRYRUN")
    except RuntimeError as e:
        txt = str(e).replace('\\"', '"')
        uma = '"mensagens": 1' in txt and '"avisos_whatsapp": 1' in txt
        p.check(uma and "Seu plano do Physiq vence em" in txt and "Configurações › Plano" in txt,
                f"WhatsApp ao dono enfileirado 1× com o texto do plano (transação desfeita): {txt[txt.find('DRYRUN'):][:260]}")
    fila_wa_depois = sql_principal(f"select count(*)::int n from {SCHEMA}.mensagens_whatsapp")[0]["n"]
    p.check(fila_wa_depois == fila_wa_antes, f"fila real do WhatsApp intocada ({fila_wa_antes} → {fila_wa_depois})")

    # 14. legados intocados pela tarefa das 03:40
    legados_depois = sql_principal(f"select id::text, situacao, vence_em::text, teste_ate::text from {SCHEMA}.contas where origem <> 'nova' order by id")
    p.check(legados_antes == legados_depois, f"contas legadas intocadas ({len(legados_antes)} contas)")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
