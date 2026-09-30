#!/usr/bin/env python3
"""Physiq W7b — PROVA VIVA do cartão do aluno do app em PRODUÇÃO (o Weslley paga com o cartão dele) e o ESTORNO depois.
Modelo da W4 (e2e/w04/prova_real.py). Só mexe na conta de TESTE w7b.prod.teste.claude@physiqnutri.app ("Teste App W7b",
aluna do app criada pelo smoke_prod.py desta pasta; senha em ~/.physiq-teste-w7b-prod e no cofre, item "Physiq — conta de
teste da prova do app (W7b)"); recusa pagamento que não é da matrícula dela.

  preparar  plano Treino com o preço especial R$ 1,00 SÓ nesta matrícula de teste e os dias grátis ACABADOS (o app fecha e
            só Perfil › Pagamentos abre) — a cobrança sai na hora. Imprime o passo a passo.
  conferir  matrícula, cobranças e assinatura (e o que o Mercado Pago diz de cada uma)
  estornar  --mp-payment-id <id> [--cancelar-assinatura] [--dry-run]: estorna o pagamento inteiro no MP
            (POST /v1/payments/<id>/refunds), cancela a cobrança automática se pedir, e chama o mp-webhook-aluno para a
            cobrança ficar certa na hora
  limpar    fecha no MP o Pix/assinatura que ficaram abertos na conta de teste
Credencial do MP: ~/.physiq-mp-prod (cofre › PhysiqCalc › "Mercado Pago — PhysiqCalc").
"""
from __future__ import annotations

import argparse
import secrets
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
for _cand in (Path(__file__).resolve().parent, Path.home() / "projetos" / "physiqcalc" / "e2e" / "w07b", Path.home() / "projetos" / "physiqcalc-w07b-sem-profissional" / "e2e" / "w07b",
              Path(__file__).resolve().parent / "e2e" / "w07b"):  # cópia da base (2026-09-29), se o repo ainda não tiver a W7b
    if (_cand / "_base.py").exists():
        sys.path.insert(0, str(_cand))
        break
import _base as B  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
DESC = "w7b-prod"
EMAIL = "w7b.prod.teste.claude@physiqnutri.app"
B.CONTAS[DESC] = (EMAIL, B.senha_de(DESC))
MP = "https://api.mercadopago.com"


def mp(metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
    token = (Path.home() / ".physiq-mp-prod").read_text(encoding="utf-8").strip()
    cab = {"Authorization": f"Bearer {token}"}
    if metodo == "POST":
        cab["X-Idempotency-Key"] = secrets.token_hex(16)
    st, r, _ = B.http(metodo, f"{MP}{caminho}", corpo, cab)
    return st, (r if isinstance(r, dict) else {"_": r})


def matricula() -> dict:
    assert EMAIL.endswith(".teste.claude@physiqnutri.app")
    m = B.app_da(DESC)
    if not m:
        raise SystemExit("a conta de teste não é aluna do app — rode antes: python3 smoke_prod.py aluno")
    return m


def preparar(a) -> int:
    m = matricula()
    B.sql_principal(f"""update {S}.pacientes set plano_aluno_id = (select id from {S}.planos_aluno where conta_id = {S}.conta_do_app() and codigo = 'app_treino'),
                               mensalidade_valor = 1.00, app_teste_de = now() - interval '8 days', app_teste_ate = now() - interval '1 hour'
                         where id = '{m['id']}';
                        select {S}.mensalidade_recalcular('{m['id']}')""")
    m = matricula()
    st, r = B.funcao(B.token(DESC), "pagamentos-aluno", {"acao": "aluno_status"}, origem="https://physiqcalc.com.br")
    mens = [x for x in ((r or {}).get("matriculas") or []) if x.get("paciente_id") == m["id"]] if isinstance(r, dict) else []
    print(f"matrícula {m['id']}: plano {m['plano']} · R$ {m['valor']} · grátis até {m['teste_ate']} · coberta até {m['pago_ate']}")
    print(f"pagamentos-aluno aluno_status: HTTP {st} {str(mens)[:300] if mens else str(r)[:300]}")
    print(f"""
PASSO A PASSO (prova viva — o Weslley, no celular):
  1. Abra o app Physiq (ou https://physiqcalc.com.br) e entre com {EMAIL}
     (senha: cofre › PhysiqCalc › "Physiq — conta de teste da prova do app (W7b)").
  2. O app abre FECHADO: "Seus dias grátis acabaram" com "Pagar" (a aba Treino e o Perfil também).
  3. Toque em Pagar → Perfil › Pagamentos mostra "Plano do app · Treino · R$ 1,00" vencido → "Pagar R$ 1,00".
  4. Escolha "Pagar com cartão", use o seu cartão de verdade e confirme.
  5. Em segundos o Pagamentos mostra "em dia" e o app abre de novo (volte à aba Treino).
  6. Me mande o número do pagamento (ou só "paguei"): eu estorno com
       python3 {Path(__file__).resolve()} estornar --mp-payment-id <id>
     (o conferir mostra o id: python3 {Path(__file__).resolve()} conferir)""")
    return 0


def conferir(a) -> int:
    m = matricula()
    print(f"matrícula {m['id']}: plano {m['plano']} · R$ {m['valor']} · grátis até {m['teste_ate']} · coberta até {m['pago_ate']} · ativa {m['ativo']}")
    for c in B.sql_principal(f"""select id::text, status, valor::text, metodo, mp_payment_id, created_at::text from {S}.cobrancas
                                   where paciente_id = '{m['id']}' and deleted_at is null order by created_at"""):
        mpst = ""
        if c["mp_payment_id"] and not str(c["mp_payment_id"]).startswith("sim-"):
            st, pay = mp("GET", f"/v1/payments/{c['mp_payment_id']}")
            mpst = f" · MP {st} {pay.get('status')} R$ {pay.get('transaction_amount')} (estornado R$ {pay.get('transaction_amount_refunded')})"
        print(f"  cobrança {c['id']}: {c['status']} R$ {c['valor']} {c['metodo']} mp={c['mp_payment_id']}{mpst}")
    for s in B.sql_principal(f"select id::text, status, mp_preapproval_id, valor::text from {S}.aluno_assinaturas where paciente_id = '{m['id']}'"):
        print(f"  assinatura {s['id']}: {s['status']} R$ {s['valor']} mp={s['mp_preapproval_id']}")
    return 0


def estornar(a) -> int:
    m = matricula()
    st, pay = mp("GET", f"/v1/payments/{a.mp_payment_id}")
    if st != 200:
        raise SystemExit(f"pagamento não encontrado no MP ({st})")
    ref = str(pay.get("external_reference") or "")
    if not ref.startswith(f"physiq:public:aluno:{m['id']}:"):
        raise SystemExit(f"recusado: o pagamento não é da matrícula de teste ({ref!r})")
    print(f"pagamento {a.mp_payment_id}: {pay.get('status')} R$ {pay.get('transaction_amount')} ref={ref}")
    if a.dry_run:
        print("(dry-run: nada estornado)")
        return 0
    if pay.get("status") == "approved":
        st, r = mp("POST", f"/v1/payments/{a.mp_payment_id}/refunds", {})
        print(f"estorno: HTTP {st} {r.get('status')} R$ {r.get('amount')} id={r.get('id')}")
        if st not in (200, 201):
            return 1
    else:
        print("não está aprovado: nada a estornar")
    if a.cancelar_assinatura:
        for x in B.sql_principal(f"select id::text, mp_preapproval_id from {S}.aluno_assinaturas where paciente_id = '{m['id']}' and status in ('authorized','pending','paused')"):
            if x["mp_preapproval_id"] and not x["mp_preapproval_id"].startswith("sim-"):
                st, r = mp("PUT", f"/preapproval/{x['mp_preapproval_id']}", {"status": "cancelled"})
                print(f"assinatura {x['mp_preapproval_id']}: HTTP {st} {r.get('status')}")
            B.sql_principal(f"update {S}.aluno_assinaturas set status = 'cancelled' where id = '{x['id']}'")
    B.http("POST", f"{B.PRINCIPAL_URL}/functions/v1/mp-webhook-aluno?schema={S}", {"type": "payment", "data": {"id": str(a.mp_payment_id)}})
    time.sleep(2)
    st, pay2 = mp("GET", f"/v1/payments/{a.mp_payment_id}")
    c = B.sql_principal(f"select status from {S}.cobrancas where mp_payment_id = '{a.mp_payment_id}'")
    print(f"depois: MP {pay2.get('status')} (estornado R$ {pay2.get('transaction_amount_refunded')}) · cobrança {c[0]['status'] if c else '—'}")
    return 0 if pay2.get("status") in ("refunded", "partially_refunded") or pay.get("status") != "approved" else 1


def limpar(a) -> int:
    m = matricula()
    for c in B.sql_principal(f"""select mp_payment_id from {S}.cobrancas where paciente_id = '{m['id']}' and status = 'aguardando_confirmacao'
                                   and mp_payment_id is not null and mp_payment_id not like 'sim-%'"""):
        st, r = mp("PUT", f"/v1/payments/{c['mp_payment_id']}", {"status": "cancelled"})
        print(f"Pix {c['mp_payment_id']}: {st} {r.get('status')}")
    for x in B.sql_principal(f"select id::text, mp_preapproval_id from {S}.aluno_assinaturas where paciente_id = '{m['id']}' and status in ('authorized','pending','paused')"):
        if x["mp_preapproval_id"] and not x["mp_preapproval_id"].startswith("sim-"):
            st, r = mp("PUT", f"/preapproval/{x['mp_preapproval_id']}", {"status": "cancelled"})
            print(f"assinatura {x['mp_preapproval_id']}: {st} {r.get('status')}")
        B.sql_principal(f"update {S}.aluno_assinaturas set status = 'cancelled' where id = '{x['id']}'")
    st, r = B.funcao(B.token(DESC), "pagamentos-aluno", {"acao": "aluno_status"}, origem="https://physiqcalc.com.br")
    print(f"aluno_status depois: HTTP {st}")
    return conferir(a)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("modo", choices=["preparar", "conferir", "estornar", "limpar"])
    ap.add_argument("--mp-payment-id")
    ap.add_argument("--cancelar-assinatura", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.modo == "estornar" and not a.mp_payment_id:
        ap.error("estornar precisa de --mp-payment-id")
    return {"preparar": preparar, "conferir": conferir, "estornar": estornar, "limpar": limpar}[a.modo](a)


if __name__ == "__main__":
    sys.exit(main())
