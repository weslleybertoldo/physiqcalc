#!/usr/bin/env python3
"""Physiq W4 — PROVA VIVA do cartão em produção (C94: a assinatura no cartão de profissional nunca foi testada com cartão
real) e o ESTORNO depois. Só mexe em conta de TESTE (e-mail *teste*@physiq…); recusa pagamento que não é das contas do Physiq.

  preparar  --ambiente public --valor 1.00
            cria (ou reaproveita) a conta de teste prova.teste.claude@physiqnutri.app com a conta nova "Prova do cartão",
            põe o preço especial (valor_travado = --valor) e deixa a conta VENCIDA (a 1ª cobrança da assinatura sai na hora,
            sem esperar o fim do teste). Senha em ~/.physiq-teste-prova (e no cofre, item "Physiq — conta de teste da prova do
            cartão"). Imprime o passo a passo.
  conferir  --ambiente public         situação da conta, faturas, assinatura (e o que o Mercado Pago diz de cada uma)
  checkout  --ambiente public         cria a assinatura PENDENTE com o link do checkout do MP (init_point) — prova sem pagar
  estornar  --ambiente public --mp-payment-id <id> [--cancelar-assinatura] [--dry-run]
            estorna o pagamento inteiro no MP (POST /v1/payments/<id>/refunds) e, com --cancelar-assinatura, cancela a
            cobrança automática da conta; depois confere a fatura (o webhook marca 'refunded')
  limpar    --ambiente public         fecha no MP o Pix/assinatura que ficaram abertos na conta de teste e tira o preço especial

Credenciais do MP: ~/.physiq-mp-prod (produção) e ~/.physiq-mp-test (staging) — cofre › PhysiqCalc › "Mercado Pago — PhysiqCalc".
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, anon, http, service, sql_principal  # noqa: E402

MP = "https://api.mercadopago.com"
EMAIL = "prova.teste.claude@physiqnutri.app"
NOME_CONTA = "Prova do cartão (teste)"


def senha() -> str:
    arq = Path.home() / ".physiq-teste-prova"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(14), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


def token_mp(ambiente: str) -> str:
    return Path.home().joinpath(".physiq-mp-prod" if ambiente == "public" else ".physiq-mp-test").read_text().strip()


def mp(ambiente: str, metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
    cab = {"Authorization": f"Bearer {token_mp(ambiente)}"}
    if metodo == "POST":
        cab["X-Idempotency-Key"] = secrets.token_hex(16)
    st, r, _ = http(metodo, f"{MP}{caminho}", corpo, cab)
    return st, (r if isinstance(r, dict) else {"_": r})


def garantir_usuario() -> str:
    sp = service(PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    achado = sql_principal(f"select id::text as id from auth.users where lower(email) = '{EMAIL}'")
    if achado:
        st, r, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{achado[0]['id']}", {"password": senha(), "email_confirm": True}, cab)
        assert st == 200, (st, r)
        return achado[0]["id"]
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users",
                    {"email": EMAIL, "password": senha(), "email_confirm": True, "user_metadata": {"full_name": "Prova Cartão Teste"}}, cab)
    assert st == 200, (st, r)
    return r["id"]


def sessao() -> str:
    st, s, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/token?grant_type=password", {"email": EMAIL, "password": senha()}, {"apikey": anon(PRINCIPAL_REF)})
    assert st == 200, (st, s)
    return s["access_token"]


def conta(ambiente: str, uid: str) -> dict | None:
    r = sql_principal(f"select id::text, nome, situacao, plano, faixa, teste_ate::text, vence_em::text, valor_travado from {ambiente}.contas "
                      f"where dono_id = '{uid}' and origem = 'nova' order by criado_em limit 1")
    return r[0] if r else None


def cobranca(ambiente: str, tok: str, acao: str, corpo: dict) -> tuple[int, dict]:
    origem = "https://physiqcalc.com.br" if ambiente == "public" else "https://physiqcalc-staging.vercel.app"
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/cobranca-conta", {"acao": acao, **corpo},
                    {"Authorization": f"Bearer {tok}", "apikey": anon(PRINCIPAL_REF), "x-schema": ambiente, "Origin": origem}, timeout=120)
    return st, (r if isinstance(r, dict) else {"_": r})


def preparar(a) -> int:
    uid = garantir_usuario()
    tok = sessao()
    c = conta(a.ambiente, uid)
    if not c:
        st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/criar_minha_conta", {"p_nome": NOME_CONTA, "p_tipo": "personal", "p_registro": None},
                        {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {tok}", "Content-Profile": a.ambiente, "Accept-Profile": a.ambiente})
        assert st == 200 and r.get("ok"), (st, r)
        c = conta(a.ambiente, uid)
    ontem = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3, days=1)).date().isoformat()
    valor = round(float(a.valor), 2)
    if valor < 1:
        raise SystemExit("valor mínimo: 1.00 (o Mercado Pago recusa menos no cartão)")
    sql_principal(f"update {a.ambiente}.contas set valor_travado = {valor}, teste_ate = '{ontem}', vence_em = null, situacao = 'vencida' where id = '{c['id']}'")
    c = conta(a.ambiente, uid)
    site = "https://physiqcalc.com.br" if a.ambiente == "public" else "https://physiqcalc-staging.vercel.app"
    print(json.dumps({"conta": c, "login": EMAIL, "senha_em": "~/.physiq-teste-prova"}, ensure_ascii=False, indent=1))
    print(f"""
PASSO A PASSO (Weslley):
 1. Abra {site}/entrar/email e entre com {EMAIL} (senha: arquivo ~/.physiq-teste-prova no notebook, ou o cofre).
 2. O painel abre travado ("Seu plano venceu") → "Pagar agora" → Configurações › Plano.
 3. Em "Escolha o plano" deixe Treino + Nutrição · 1–10 alunos · Mensal (o preço especial desta conta é R$ {valor:.2f}).
 4. Clique "Cobrança automática", preencha o SEU cartão no quadro do Mercado Pago e confirme (1ª cobrança: hoje, R$ {valor:.2f}).
 5. Em até 1 minuto a tela mostra "Cobrança automática ATIVA", a fatura paga no histórico e o card do menu "Renova em … · cartão".
 6. Estorno (aqui no notebook): python3 e2e/w04/prova_real.py conferir --ambiente {a.ambiente}   (pega o mp_payment_id)
    python3 e2e/w04/prova_real.py estornar --ambiente {a.ambiente} --mp-payment-id <id> --cancelar-assinatura
""")
    return 0


def conferir(a) -> int:
    uid = garantir_usuario()
    c = conta(a.ambiente, uid)
    if not c:
        print("sem conta de prova neste ambiente (rode preparar)")
        return 1
    fats = sql_principal(f"select id::text, tipo, forma, valor, status, mp_payment_id, pago_em::text, cobre_de::text, cobre_ate::text, criado_em::text "
                         f"from {a.ambiente}.conta_faturas where conta_id = '{c['id']}' order by criado_em desc limit 10")
    ass = sql_principal(f"select mp_preapproval_id, status, valor, proximo_vencimento::text, payload->>'init_point' init_point from {a.ambiente}.conta_assinaturas where conta_id = '{c['id']}'")
    print(json.dumps({"conta": c, "assinatura": ass, "faturas": fats}, ensure_ascii=False, indent=1, default=str))
    for f in fats:
        if f["mp_payment_id"] and not f["mp_payment_id"].startswith("sim-"):
            st, pay = mp(a.ambiente, "GET", f"/v1/payments/{f['mp_payment_id']}")
            print(f"  MP pagamento {f['mp_payment_id']}: {pay.get('status')} {pay.get('status_detail')} R$ {pay.get('transaction_amount')} reembolsado={pay.get('transaction_amount_refunded')}")
    for x in ass:
        if x["mp_preapproval_id"] and not x["mp_preapproval_id"].startswith("sim-"):
            st, pre = mp(a.ambiente, "GET", f"/preapproval/{x['mp_preapproval_id']}")
            print(f"  MP assinatura {x['mp_preapproval_id']}: {pre.get('status')} próxima {pre.get('next_payment_date')}")
    return 0


def checkout(a) -> int:
    uid = garantir_usuario()
    c = conta(a.ambiente, uid)
    if not c:
        raise SystemExit("rode preparar antes")
    st, r = cobranca(a.ambiente, sessao(), "assinar", {"conta_id": c["id"], "plano": c["plano"], "faixa": c["faixa"], "checkout": True})
    print(st, json.dumps({k: r.get(k) for k in ("ok", "erro", "init_point", "primeira_cobranca", "sandbox")}, ensure_ascii=False))
    return 0 if st == 200 and r.get("init_point") else 1


def estornar(a) -> int:
    st, pay = mp(a.ambiente, "GET", f"/v1/payments/{a.mp_payment_id}")
    if st != 200:
        raise SystemExit(f"pagamento não encontrado no MP ({st})")
    ref = pay.get("external_reference") or ""
    pre_id = (pay.get("metadata") or {}).get("preapproval_id") or ((pay.get("point_of_interaction") or {}).get("transaction_data") or {}).get("subscription_id")
    fat = sql_principal(f"select f.id::text, f.conta_id::text, u.email from {a.ambiente}.conta_faturas f join {a.ambiente}.contas c on c.id = f.conta_id "
                        f"join auth.users u on u.id = c.dono_id where f.mp_payment_id = '{a.mp_payment_id}'")
    if not (ref.startswith(f"physiq:{a.ambiente}:conta:") or (pre_id and fat)):
        raise SystemExit(f"recusado: o pagamento não é de uma conta do Physiq ({ref!r})")
    if fat and "teste" not in (fat[0]["email"] or "") and not a.forcar:
        raise SystemExit("recusado: a conta não é de teste (use --forcar só com a palavra do Weslley)")
    print(f"pagamento {a.mp_payment_id}: {pay.get('status')} R$ {pay.get('transaction_amount')} ref={ref} assinatura={pre_id}")
    if a.dry_run:
        print("(dry-run: nada estornado)")
        return 0
    if pay.get("status") == "approved":
        st, r = mp(a.ambiente, "POST", f"/v1/payments/{a.mp_payment_id}/refunds", {})
        print(f"estorno: HTTP {st} {r.get('status')} R$ {r.get('amount')} id={r.get('id')}")
        if st not in (200, 201):
            return 1
    else:
        print("não está aprovado: nada a estornar")
    if a.cancelar_assinatura and fat:
        for x in sql_principal(f"select mp_preapproval_id from {a.ambiente}.conta_assinaturas where conta_id = '{fat[0]['conta_id']}' and status <> 'cancelled'"):
            if x["mp_preapproval_id"] and not x["mp_preapproval_id"].startswith("sim-"):
                st, r = mp(a.ambiente, "PUT", f"/preapproval/{x['mp_preapproval_id']}", {"status": "cancelled"})
                print(f"assinatura {x['mp_preapproval_id']}: HTTP {st} {r.get('status')}")
                sql_principal(f"update {a.ambiente}.conta_assinaturas set status = 'cancelled' where mp_preapproval_id = '{x['mp_preapproval_id']}'")
    # o aviso do MP também chega; chamar o webhook agora deixa a fatura certa na hora
    http("POST", f"{PRINCIPAL_URL}/functions/v1/mp-webhook-conta?schema={a.ambiente}", {"type": "payment", "data": {"id": str(a.mp_payment_id)}})
    time.sleep(2)
    st, pay2 = mp(a.ambiente, "GET", f"/v1/payments/{a.mp_payment_id}")
    f2 = sql_principal(f"select status from {a.ambiente}.conta_faturas where mp_payment_id = '{a.mp_payment_id}'")
    print(f"depois: MP {pay2.get('status')} (reembolsado R$ {pay2.get('transaction_amount_refunded')}) · fatura {f2[0]['status'] if f2 else '—'}")
    return 0 if pay2.get("status") in ("refunded", "partially_refunded") or not pay.get("status") == "approved" else 1


def limpar(a) -> int:
    uid = garantir_usuario()
    c = conta(a.ambiente, uid)
    if not c:
        return 0
    for f in sql_principal(f"select mp_payment_id from {a.ambiente}.conta_faturas where conta_id = '{c['id']}' and status in ('pending','in_process') and mp_payment_id is not null and mp_payment_id not like 'sim-%'"):
        st, r = mp(a.ambiente, "PUT", f"/v1/payments/{f['mp_payment_id']}", {"status": "cancelled"})
        print(f"Pix {f['mp_payment_id']}: {st} {r.get('status')}")
    sql_principal(f"update {a.ambiente}.conta_faturas set status = 'cancelled' where conta_id = '{c['id']}' and status in ('pending','in_process')")
    for x in sql_principal(f"select mp_preapproval_id from {a.ambiente}.conta_assinaturas where conta_id = '{c['id']}' and status <> 'cancelled' and mp_preapproval_id is not null"):
        if not x["mp_preapproval_id"].startswith("sim-"):
            st, r = mp(a.ambiente, "PUT", f"/preapproval/{x['mp_preapproval_id']}", {"status": "cancelled"})
            print(f"assinatura {x['mp_preapproval_id']}: {st} {r.get('status')}")
    sql_principal(f"update {a.ambiente}.conta_assinaturas set status = 'cancelled' where conta_id = '{c['id']}';"
                  f"update {a.ambiente}.contas set valor_travado = null where id = '{c['id']}'")
    print("limpo")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("acao", choices=["preparar", "conferir", "checkout", "estornar", "limpar"])
    ap.add_argument("--ambiente", choices=["public", "staging"], required=True)
    ap.add_argument("--valor", default="1.00")
    ap.add_argument("--mp-payment-id")
    ap.add_argument("--cancelar-assinatura", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--forcar", action="store_true")
    a = ap.parse_args()
    if a.acao == "estornar" and not a.mp_payment_id:
        raise SystemExit("--mp-payment-id é obrigatório")
    return {"preparar": preparar, "conferir": conferir, "checkout": checkout, "estornar": estornar, "limpar": limpar}[a.acao](a)


if __name__ == "__main__":
    sys.exit(main())
