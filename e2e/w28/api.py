#!/usr/bin/env python3
"""Physiq W28 — E2E de API do ENSAIO da virada no STAGING (depois de: e2e/w28/massa.py, 01, massa --senhas, 03, fila do espelho
zerada e a physiq_professor_acesso_ok nova no staging do Treino). Prova que as contas legadas pagam e travam pelo NÚCLEO com o
preço e as regras de hoje, e que os avisos antigos do Mercado Pago (Calc e Nutri) passam a valer na conta:

  A  Configurações › Plano da legada (cobranca-conta status): no núcleo, preço de hoje só no plano dela, tabela nos outros
  B  Pix do legado Nutri = +30 dias (regra_pix 30dias), sem tolerância
  C  Pix do legado Calc na tolerância = +1 mês a partir de hoje e a tolerância de 7 volta (aplicar_pagamento_conta)
  D  legado Calc vencido paga OUTRO plano = preço da tabela e sai do legado (gatilho contas_sai_do_legado)
  E  "Mudar plano" numa legada ativa = sai do legado (sem preço travado, Pix +1 mês)
  F  legada com cartão autorizado não gera Pix avulso (cobrança dobrada)
  G  repasse do Treino: Pix de SANDBOX com a referência antiga do Calc (plano_professor) → mp-webhook do Treino → mp-webhook-conta
  H  repasse do Nutri: Pix de SANDBOX "physiqnutri-pix:" → mp-webhook do Nutri (principal) → mp-webhook-conta
  I  conta ainda na cobrança antiga (desfeita com w28_desfazer_conta_legada): o aviso antigo NÃO aplica no núcleo; a equipe e a
     cobrança-conta seguem travadas; o 03 refaz a conta (idempotente)
  J  equipe das legadas convida (equipe_motivo_bloqueio = null) · tarefa diária: a tolerância vence no dia certo (transação
     desfeita) · limite de alunos do legado Nutri = sem limite, do legado Calc = o do plano
  K  Banco do Treino: o pagamento do C chega ao nucleo_acesso_ate (espelho) e a physiq_professor_acesso_ok segue o núcleo
Pagamentos de SANDBOX (credencial de TESTE, ~/.physiq-mp-test) e sempre cancelados no fim; nada no Mercado Pago de produção.
Uso: python3 e2e/w28/api.py [--de G]   (--de: começa na seção dada — A–F mudam a massa: pagamentos e troca de plano)
"""
from __future__ import annotations

import datetime as dt
import json
import secrets
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "w02"))
from _comum import (  # noqa: E402
    PRINCIPAL_REF, PRINCIPAL_URL, TREINO_URL, Placar, anon, http, login_senha, sql_principal, sql_treino,
)

SCHEMA = "staging"
ORIGEM = "https://physiqcalc-staging.vercel.app"
MP = "https://api.mercadopago.com"
RAIZ = Path(__file__).resolve().parents[2]
p = Placar()
HOJE = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def d(dias: int) -> str:
    return (HOJE + dt.timedelta(days=dias)).isoformat()


def mais_mes(data: str) -> str:
    a, m, dd = (int(x) for x in data.split("-"))
    m += 1
    if m == 13:
        a, m = a + 1, 1
    import calendar
    return dt.date(a, m, min(dd, calendar.monthrange(a, m)[1])).isoformat()


def senha(nome: str) -> str:
    return Path.home().joinpath(f".physiq-teste-w28-{nome}").read_text(encoding="utf-8").strip()


def email(app: str, caso: str) -> str:
    return f"w28.{app}.{caso}.teste.claude@physiq{'calc' if app == 'calc' else 'nutri'}.app"


def entrar(app: str, caso: str) -> str:
    time.sleep(1.5)  # sem rajada no Auth
    return login_senha(PRINCIPAL_URL, anon(PRINCIPAL_REF), email(app, caso), senha(f"{app}-{caso}"))["access_token"]


def conta_de(app: str, caso: str) -> dict:
    origem = "legado_calc" if app == "calc" else "legado_nutri"
    r = sql_principal(f"""select c.id::text as id, c.plano, c.faixa, c.situacao, c.teste_ate::text as teste_ate, c.vence_em::text as vence_em,
          c.tolerancia_dias, c.valor_travado, c.regra_pix, c.cobranca_legada, c.regras_legadas, to_jsonb(c) as linha
        from {SCHEMA}.contas c join auth.users u on u.id = c.dono_id
       where lower(u.email) = '{email(app, caso)}' and c.origem = '{origem}' order by c.criado_em limit 1""")
    assert r, f"sem conta {app}/{caso}"
    return r[0]


def cobranca(token: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/cobranca-conta", {"acao": acao, **(corpo or {})},
                    {"Authorization": f"Bearer {token}", "apikey": anon(PRINCIPAL_REF), "x-schema": SCHEMA, "Origin": ORIGEM}, timeout=120)
    return st, (r if isinstance(r, dict) else {"_": r})


def preco(status: dict, plano: str, faixa: str) -> float | None:
    for x in status.get("precos") or []:
        if x["plano"] == plano and x["faixa"] == faixa:
            return None if x["valor_mensal"] is None else round(float(x["valor_mensal"]), 2)
    return None


def mp(metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
    cab = {"Authorization": f"Bearer {Path.home().joinpath('.physiq-mp-test').read_text().strip()}"}
    if metodo == "POST":
        cab["X-Idempotency-Key"] = secrets.token_hex(16)
    st, r, _ = http(metodo, f"{MP}{caminho}", corpo, cab)
    return st, (r if isinstance(r, dict) else {"_": r})


def pix_sandbox(ref: str, valor: float) -> str | None:
    st, r = mp("POST", "/v1/payments", {"transaction_amount": valor, "description": "Physiq W28 — E2E do repasse (sandbox)",
                                         "payment_method_id": "pix", "payer": {"email": "comprador.physiqcalc@example.com"},
                                         "external_reference": ref})
    if st in (200, 201) and r.get("id"):
        return str(r["id"])
    print("   (sandbox do MP recusou o Pix:", st, str(r)[:200], ")")
    return None


def esperar(cond, timeout=90.0, passo=3.0) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(passo)
    return False


def dryrun(sql: str) -> dict:
    """Roda um SELECT que devolve 1 jsonb dentro de uma transação DESFEITA (raise) e devolve o jsonb."""
    try:
        sql_principal(f"do $dry$ declare r jsonb; begin select ({sql}) into r; raise exception 'DRYRUN %', r::text; end $dry$;")
    except RuntimeError as e:
        txt = str(e)
        i = txt.find("DRYRUN ")
        if i >= 0:
            obj, _ = json.JSONDecoder().raw_decode(txt[i + 7:].replace('\\"', '"'))
            return obj
        raise
    raise RuntimeError("dryrun sem resultado")


def main() -> int:
    de = sys.argv[sys.argv.index("--de") + 1].upper() if "--de" in sys.argv else "A"
    if de > "A":
        return main_de(de)
    # ───── A. a tela do Plano da legada no núcleo ─────
    print("\n== A. Configurações › Plano das legadas (núcleo)")
    tk_pix = entrar("nutri", "pix")
    st, s = cobranca(tk_pix, "status", {"conta_id": conta_de("nutri", "pix")["id"]})
    c = s.get("conta") or {}
    p.check(st == 200 and s.get("ok"), f"status da legada Nutri responde 200 ({st} {s.get('erro')})")
    p.check(c.get("cobranca_legada") is False and c.get("regras_legadas") is True, "Nutri: no núcleo com o preço/regras de hoje")
    p.check(round(float(s.get("valor_mensal") or 0), 2) == 80.0, f"Nutri: R$ 80 de hoje ({s.get('valor_mensal')})")
    p.check(preco(s, "nutricao", "livre") == 80.0 and preco(s, "treino_nutricao", "f10") == 59.9,
            f"Nutri: travado só no plano dela; outro plano = tabela ({preco(s, 'nutricao', 'livre')} / {preco(s, 'treino_nutricao', 'f10')})")
    p.check(c.get("regra_pix") == "30dias" and int(c.get("tolerancia_dias") or 0) == 0, "Nutri: Pix de 30 dias e sem tolerância")

    # ───── B. Pix do legado Nutri = +30 dias ─────
    print("\n== B. Pix do legado Nutri (+30 dias)")
    antes = conta_de("nutri", "pix")
    st, r = cobranca(tk_pix, "pix_criar", {"conta_id": antes["id"], "plano": "nutricao", "faixa": "livre", "meses": 1})
    f = r.get("fatura") or {}
    p.check(st == 200 and f.get("id") and round(float(f.get("valor") or 0), 2) == 80.0, f"Pix de R$ 80 criado ({st} {r.get('erro')})")
    st, r = cobranca(tk_pix, "simular_aprovacao", {"conta_id": antes["id"], "fatura_id": f.get("id")})
    depois = conta_de("nutri", "pix")
    esperado = (dt.date.fromisoformat(max(antes["vence_em"], d(0))) + dt.timedelta(days=30)).isoformat()
    p.check(st == 200 and depois["vence_em"] == esperado, f"vence {antes['vence_em']} → {depois['vence_em']} (esperado {esperado}: +30 dias)")
    p.check(depois["regras_legadas"] is True and int(depois["tolerancia_dias"]) == 0, "Nutri segue no preço de hoje, tolerância 0")

    # ───── C. legado Calc na tolerância paga: +1 mês e a tolerância de 7 volta ─────
    print("\n== C. Pix do legado Calc na tolerância (+1 mês, tolerância 7)")
    tk_tol = entrar("calc", "tolerancia")
    antes = conta_de("calc", "tolerancia")
    st, s = cobranca(tk_tol, "status", {"conta_id": antes["id"]})
    p.check(st == 200 and (s.get("conta") or {}).get("efetiva") == "ativa", f"na tolerância a conta está ativa (vence {antes['vence_em']} + 7)")
    p.check(round(float(s.get("valor_mensal") or 0), 2) == 79.9, f"Studio de hoje R$ 79,90 ({s.get('valor_mensal')})")
    st, r = cobranca(tk_tol, "pix_criar", {"conta_id": antes["id"], "plano": "treino", "faixa": "f30", "meses": 1})
    f = r.get("fatura") or {}
    st2, _ = cobranca(tk_tol, "simular_aprovacao", {"conta_id": antes["id"], "fatura_id": f.get("id")})
    depois = conta_de("calc", "tolerancia")
    esperado = mais_mes(max(antes["vence_em"], d(0)))
    p.check(st == 200 and st2 == 200 and depois["vence_em"] == esperado, f"vence {antes['vence_em']} → {depois['vence_em']} (esperado {esperado})")
    p.check(int(depois["tolerancia_dias"]) == 7 and depois["regras_legadas"] is True, "a tolerância de 7 dias do Calc volta no pagamento mensal")
    venc_tol = depois["vence_em"]

    # ───── D. legado Calc vencido paga OUTRO plano: tabela e sai do legado ─────
    print("\n== D. legado Calc vencido escolhe outro plano ao pagar")
    tk_ven = entrar("calc", "vencida")
    antes = conta_de("calc", "vencida")
    st, s = cobranca(tk_ven, "status", {"conta_id": antes["id"]})
    p.check((s.get("conta") or {}).get("efetiva") == "vencida", "a conta vencida há 10 dias está vencida no núcleo (passou dos 7)")
    p.check(preco(s, "treino", "f10") == 39.9 and preco(s, "treino_nutricao", "f10") == 59.9, "preço de hoje no plano dele; tabela nos outros")
    st, r = cobranca(tk_ven, "pix_criar", {"conta_id": antes["id"], "plano": "treino_nutricao", "faixa": "f10", "meses": 1})
    f = r.get("fatura") or {}
    p.check(st == 200 and round(float(f.get("valor") or 0), 2) == 59.9, f"outro plano cobra a tabela: R$ {f.get('valor')}")
    cobranca(tk_ven, "simular_aprovacao", {"conta_id": antes["id"], "fatura_id": f.get("id")})
    depois = conta_de("calc", "vencida")
    p.check(depois["plano"] == "treino_nutricao" and depois["regras_legadas"] is False and depois["valor_travado"] is None
            and depois["regra_pix"] == "mes" and int(depois["tolerancia_dias"]) == 0,
            f"saiu do legado (plano {depois['plano']}, travado {depois['valor_travado']}, pix {depois['regra_pix']}, tol {depois['tolerancia_dias']})")
    p.check(depois["vence_em"] == mais_mes(d(0)), f"vence {depois['vence_em']} (hoje + 1 mês)")
    ev = sql_principal(f"select count(*)::int as n from {SCHEMA}.conta_eventos where conta_id = '{depois['id']}' and depois->>'saiu_do_legado' = 'true'")[0]["n"]
    p.check(ev == 1, "a linha do tempo registra a saída do legado")

    # ───── E. Mudar plano numa legada ativa ─────
    print("\n== E. Mudar plano numa legada ativa (sai do legado)")
    tk_cic = entrar("calc", "ciclo")
    antes = conta_de("calc", "ciclo")
    st, r = cobranca(tk_cic, "mudar_plano", {"conta_id": antes["id"], "plano": "treino", "faixa": "f30"})
    depois = conta_de("calc", "ciclo")
    p.check(st == 200 and depois["faixa"] == "f30" and depois["regras_legadas"] is False and depois["valor_travado"] is None,
            f"Start → Studio: sai do legado ({st} {r.get('erro')})")
    p.check(round(float(r.get("valor_mensal") or 0), 2) == 79.9, f"o preço passa a ser o da tabela: R$ {r.get('valor_mensal')}")
    p.check(depois["vence_em"] == antes["vence_em"] and int(depois["tolerancia_dias"]) == 7,
            "o vencimento e a tolerância do ciclo pago valem até o próximo pagamento")

    # ───── F. cartão autorizado: sem Pix avulso ─────
    print("\n== F. legada com o cartão autorizado (assinatura antiga)")
    tk_car = entrar("nutri", "cartao")
    cc = conta_de("nutri", "cartao")
    st, s = cobranca(tk_car, "status", {"conta_id": cc["id"]})
    a = s.get("assinatura") or {}
    p.check(a.get("status") == "authorized" and a.get("mp_preapproval_id") == "sim-w28-nutri-cartao", "a assinatura antiga do Mercado Pago é a da conta")
    st, r = cobranca(tk_car, "pix_criar", {"conta_id": cc["id"], "plano": "nutricao", "faixa": "livre", "meses": 1})
    p.check(st == 400 and r.get("erro") == "cartao_ativo", f"Pix avulso recusado com o cartão ativo ({st} {r.get('erro')})")

    return main_de("G", venc_tol)


def main_de(de: str, venc_tol: str | None = None) -> int:
    venc_tol = venc_tol or conta_de("calc", "tolerancia")["vence_em"]
    # ───── G. repasse do Treino (Calc, plano_professor) ─────
    print("\n== G. aviso antigo do Calc (professor) → Treino → núcleo")
    t_anual = sql_treino(f"select id::text as id from auth.users where lower(email) = '{email('calc', 'anual')}'")[0]["id"]
    ca = conta_de("calc", "anual")
    pid = pix_sandbox(f"staging:{t_anual}:{d(0)[:8]}01:plano_professor:mensal", 149.9)
    if pid:
        st, _, _ = http("POST", f"{TREINO_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": pid}})
        p.check(st == 200, f"mp-webhook do Treino responde 200 ({st})")
        ok_f = esperar(lambda: sql_principal(f"select count(*)::int as n from {SCHEMA}.conta_faturas where mp_payment_id = '{pid}' and conta_id = '{ca['id']}' and origem = 'legado_calc'")[0]["n"] == 1, 40)
        p.check(ok_f, "o pagamento antigo virou fatura na conta legado_calc (repasse → mp-webhook-conta)")
        p.check(sql_treino(f"select count(*)::int as n from staging.physiq_pagamentos where mp_payment_id = '{pid}'")[0]["n"] == 1,
                "o Treino continua gravando o que gravava (physiq_pagamentos)")
        mp("PUT", f"/v1/payments/{pid}", {"status": "cancelled"})
        http("POST", f"{TREINO_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": pid}})
        p.check(esperar(lambda: sql_principal(f"select status from {SCHEMA}.conta_faturas where mp_payment_id = '{pid}'")[0]["status"] == "cancelled", 40),
                "cancelado no sandbox → a fatura fica cancelada (o acesso não muda)")
        p.check(conta_de("calc", "anual")["vence_em"] == ca["vence_em"], "nenhum mês somado por Pix não pago")
    else:
        p.check(False, "não deu para criar o Pix de sandbox do Calc")

    # ───── H. repasse do Nutri (Pix de 30 dias) ─────
    print("\n== H. aviso antigo do Nutri (Pix) → mp-webhook do Nutri → núcleo")
    u_teste = sql_principal(f"select id::text as id from auth.users where lower(email) = '{email('nutri', 'teste')}'")[0]["id"]
    ct = conta_de("nutri", "teste")
    pid = pix_sandbox(f"physiqnutri-pix:staging:{u_teste}", 80)
    if pid:
        st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": pid}})
        p.check(st == 200, f"mp-webhook do Nutri responde 200 ({st} {str(r)[:80]})")
        p.check(esperar(lambda: sql_principal(f"select count(*)::int as n from {SCHEMA}.conta_faturas where mp_payment_id = '{pid}' and conta_id = '{ct['id']}' and origem = 'legado_nutri'")[0]["n"] == 1, 40),
                "o Pix antigo virou fatura na conta legado_nutri")
        p.check(sql_principal(f"select count(*)::int as n from {SCHEMA}.pagamentos_assinatura where mp_payment_id = '{pid}'")[0]["n"] == 1,
                "o Nutri continua gravando o que gravava (pagamentos_assinatura)")
        mp("PUT", f"/v1/payments/{pid}", {"status": "cancelled"})
        http("POST", f"{PRINCIPAL_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": pid}})
        p.check(esperar(lambda: sql_principal(f"select status from {SCHEMA}.conta_faturas where mp_payment_id = '{pid}'")[0]["status"] in ("cancelled", "expired"), 40),
                "cancelado no sandbox → fatura cancelada")
        p.check(conta_de("nutri", "teste")["teste_ate"] == ct["teste_ate"] and conta_de("nutri", "teste")["vence_em"] == ct["vence_em"],
                "nenhum dia somado por Pix não pago")
    else:
        p.check(False, "não deu para criar o Pix de sandbox do Nutri")

    # ───── I. conta de volta à cobrança antiga: nada vale no núcleo; o 03 refaz ─────
    print("\n== I. desfazer uma conta (voltar atrás) e refazer pelo 03")
    cv = conta_de("nutri", "vencida")
    rel = json.loads((Path.home() / "backups/physiq" / f"{HOJE.isoformat()}-w28" / "relatorio-03-staging-real.json").read_text())
    antes_linha = next(x["conta_antes"] for x in rel["plano"]["contas"] if x["conta_id"] == cv["id"])
    r = sql_principal(f"select {SCHEMA}.w28_desfazer_conta_legada('{cv['id']}', '{json.dumps(antes_linha).replace(chr(39), chr(39) * 2)}'::jsonb) as r")[0]["r"]
    volta = conta_de("nutri", "vencida")
    p.check(r.get("ok") and volta["cobranca_legada"] is True and volta["regras_legadas"] is False, "desfeita: a conta volta à cobrança antiga")
    p.check(sql_principal(f"select {SCHEMA}.equipe_motivo_bloqueio('{cv['id']}') as m")[0]["m"] == "conta_legada", "na cobrança antiga a equipe segue travada")
    tk_v = entrar("nutri", "vencida")
    st, r2 = cobranca(tk_v, "status", {"conta_id": cv["id"]})
    p.check(st == 400 and r2.get("erro") == "conta_legada", f"e a cobranca-conta recusa ({st} {r2.get('erro')})")
    u_v = sql_principal(f"select id::text as id from auth.users where lower(email) = '{email('nutri', 'vencida')}'")[0]["id"]
    pid = pix_sandbox(f"physiqnutri-pix:staging:{u_v}", 80)
    if pid:
        http("POST", f"{PRINCIPAL_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": pid}})
        time.sleep(6)
        n = sql_principal(f"select count(*)::int as n from {SCHEMA}.conta_faturas where mp_payment_id = '{pid}'")[0]["n"]
        p.check(n == 0, "aviso antigo de conta ainda na cobrança antiga NÃO entra no núcleo")
        mp("PUT", f"/v1/payments/{pid}", {"status": "cancelled"})
        http("POST", f"{PRINCIPAL_URL}/functions/v1/mp-webhook", {"type": "payment", "data": {"id": pid}})
    proc = subprocess.run([sys.executable, str(RAIZ / "scripts/virada/03_cobranca_legada.py"), "--schema", SCHEMA, "--conta", cv["id"],
                           "--relatorio", str(Path.home() / "backups/physiq" / f"{HOJE.isoformat()}-w28" / "relatorio-03-staging-refeita.json")],
                          capture_output=True, text=True)
    refeita = conta_de("nutri", "vencida")
    p.check(proc.returncode == 0 and refeita["cobranca_legada"] is False and refeita["regras_legadas"] is True, "o 03 refaz a conta (idempotente)")
    p.check(refeita["situacao"] == volta["situacao"] == "vencida" and refeita["teste_ate"] == cv["teste_ate"], "com a mesma situação e as mesmas datas")

    # ───── J. equipe, tarefa diária e limite ─────
    print("\n== J. equipe, tarefa diária e limite de alunos")
    ca = conta_de("calc", "anual")
    p.check(sql_principal(f"select {SCHEMA}.equipe_motivo_bloqueio('{ca['id']}') as m")[0]["m"] is None, "a legada no núcleo convida para a equipe")
    ctol = conta_de("calc", "tolerancia")
    ultimo = (dt.date.fromisoformat(venc_tol) + dt.timedelta(days=7)).isoformat()
    seguinte = (dt.date.fromisoformat(ultimo) + dt.timedelta(days=1)).isoformat()
    r1 = dryrun(f"{SCHEMA}.contas_tarefa_diaria(date '{ultimo}', '{ctol['id']}'::uuid)")
    r2 = dryrun(f"{SCHEMA}.contas_tarefa_diaria(date '{seguinte}', '{ctol['id']}'::uuid)")
    p.check(int(r1.get("contas_mudaram", -1)) == 0 and int(r2.get("contas_mudaram", -1)) == 1,
            f"tarefa das 03:40: ainda ativa no 7º dia ({ultimo}) e vencida no 8º ({seguinte}) — transação desfeita")
    p.check(conta_de("calc", "tolerancia")["situacao"] == "ativa", "nada gravado pela simulação")
    lim_n = sql_principal(f"select {SCHEMA}.conta_limite_alunos('{conta_de('nutri', 'teste')['id']}') as n")[0]["n"]
    p.check(lim_n is None, f"legado Nutri em teste: sem limite de alunos ({lim_n})")
    prof2 = sql_principal(f"""select c.id::text as id from {SCHEMA}.contas c join auth.users u on u.id = c.dono_id
        where lower(u.email) = 'prof2.teste.claude@physiqcalc.app' and c.origem = 'legado_calc' limit 1""")
    if prof2:
        lim_c = sql_principal(f"select {SCHEMA}.conta_limite_alunos('{prof2[0]['id']}') as n")[0]["n"]
        p.check(lim_c == 10, f"legado Calc no teste: o limite do plano dele (Start = 10) ({lim_c})")

    # ───── K. Treino segue o núcleo ─────
    print("\n== K. Banco do Treino (espelho + physiq_professor_acesso_ok)")
    t_tol = sql_treino(f"select id::text as id from auth.users where lower(email) = '{email('calc', 'tolerancia')}'")[0]["id"]
    alvo = (dt.date.fromisoformat(venc_tol) + dt.timedelta(days=7)).isoformat()
    ok_e = esperar(lambda: sql_treino(f"select nucleo_acesso_ate::text as n from staging.physiq_professores where id = '{t_tol}'")[0]["n"] == alvo, 180, 6)
    p.check(ok_e, f"o pagamento do C chegou ao Treino: nucleo_acesso_ate = {alvo}")
    for caso, esperado in (("tolerancia", True), ("vencida", True), ("suspenso", False), ("pausada", True), ("liberado", True)):
        tid = sql_treino(f"select id::text as id from auth.users where lower(email) = '{email('calc', caso)}'")[0]["id"]
        ok_t = sql_treino(f"select staging.physiq_professor_acesso_ok('{tid}'::uuid) as ok")[0]["ok"]
        p.check(bool(ok_t) == esperado, f"Treino: {caso} → acesso {ok_t} (esperado {esperado})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
