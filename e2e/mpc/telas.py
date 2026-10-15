#!/usr/bin/env python3
"""Physiq mp-cartao — E2E de TELA do cartão do aluno (contrato hml/mpc/CONTRATO_MPC.md §2.1 e §4): o Brick do Mercado Pago preenchido pelo
robô (o molde do plano_cartao do e2e/hml15/csp.py: os campos seguros em iframe) → a ação aluno_mp_cartao sai com o `pagador` (o titular e o
documento do formulário) e o `device_id` (o id do aparelho do security.js) e o POST /v1/card_tokens do iframe leva o aparelho do SDK
(device.meli.session_id). Na tela só PRESENÇA, tipo e formato — nunca o valor (o CPF, o nome, o id do aparelho, o token).

Modos:
  --seco          sem navegador e sem rede: as conferências puras (o resumo do corpo da ação e o do card token, só presença)
  --base local    (F3, o ENSAIO) o site do e2e/hml15/servidor_dist.py (o build de STAGING na :8080, com a CSP) e a conta de TESTE prof1 (a
                  matrícula do app no MP do Physiq — a mesma do caso aluno_cartao da CSP): Pagar → Pagar com cartão → o Brick preenchido
                  (o cartão de TESTE, a validade, o CVV, o titular e o CPF de teste) → Pagar. NADA vai ao Mercado Pago nem à função: o POST
                  /v1/card_tokens e a ação aluno_mp_cartao são respondidos pelo Playwright (route) com uma resposta falsa — o teste lê o corpo
                  que SAIRIA. Nada é gravado (só a sessão da conta de TESTE, com logout local no fim)
  --base staging  (F5, da sessão principal — NÃO roda na etapa 1) o site de teste com o aluno2 na conta do prof2 no MP do personal (o
                  vendedor de TESTE: a integração e o desfazer do e2e/mpc/api.py, cifrada com a chave das funções) e a ação de VERDADE: o
                  cartão de TESTE paga, a cobrança fica paga e volta (o estorno pelo token do vendedor). --loja: o build da loja (o mesmo
                  fluxo — o cartão do profissional aparece nos 2 canais)
  --explorar      (com --base local) só lista a estrutura do Brick (os iframes e os campos: nome, id, tipo — nunca valor) e sai
Uso: python3 e2e/mpc/telas.py --seco
     python3 e2e/mpc/telas.py --base local --canal msedge [--com-tela] [--explorar]
     python3 e2e/mpc/telas.py --base staging --canal msedge [--loja]          (F5)
Saída: prints em ~/projetos/physiqcalc-scratch/prints/mpc/ (conferidos numa cópia reduzida; nunca no git).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
sys.path.insert(0, str(REPO / "e2e" / "hml14"))

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "mpc"
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "mpc" / "local"
CONTA_LOCAL = "prof1"          # a matrícula do app no MP do Physiq (sem cobertura) — conferida só leitura em 15/10
CARTAO = {"numero": "5031433215406351", "validade": "11/30", "cvv": "123"}   # o Mastercard de TESTE do MP (a chave do Physiq acha o BIN)
TITULAR = "APRO Mpcteste"
CPF_TESTE = "12345678909"
DEVICE_RX = re.compile(r"^[A-Za-z0-9._:-]{8,512}$")
ARGS_NAVEGADOR = ["--no-sandbox", "--disable-dev-shm-usage"]


# ───────────────────────── peças puras (o --seco confere) ─────────────────────────

def resumo_da_acao(corpo: object) -> dict:
    """O corpo da ação aluno_mp_cartao que a tela mandou → só presença, tipo e formato (nunca o valor)."""
    c = corpo if isinstance(corpo, dict) else {}
    pag = c.get("pagador") if isinstance(c.get("pagador"), dict) else {}
    doc = pag.get("documento") if isinstance(pag.get("documento"), dict) else {}
    dev = c.get("device_id")
    return {"acao": c.get("acao"), "tem_token": bool(c.get("card_token")), "metodo": c.get("payment_method_id"), "parcelas": c.get("installments"),
            "pagador_nome": bool(str(pag.get("nome") or "").strip()), "pagador_documento_tipo": doc.get("tipo"),
            "pagador_documento_11_digitos": bool(re.fullmatch(r"\d{11}", str(doc.get("numero") or ""))),
            "device_id": isinstance(dev, str) and bool(DEVICE_RX.fullmatch(dev)), "device_tamanho": len(dev) if isinstance(dev, str) else 0,
            "campos": sorted(k for k in c if k != "acao")}


def resumo_do_token(corpo: object) -> dict:
    """O corpo do POST /v1/card_tokens que o Brick mandou → só se leva o aparelho do SDK (device.meli.session_id) e o titular."""
    c = corpo if isinstance(corpo, dict) else {}
    meli = ((c.get("device") or {}).get("meli") or {}) if isinstance(c.get("device"), dict) else {}
    titular = c.get("cardholder") if isinstance(c.get("cardholder"), dict) else {}
    return {"device_meli_session_id": bool(meli.get("session_id")), "titular_nome": bool(titular.get("name")),
            "titular_documento_tipo": ((titular.get("identification") or {}).get("type") if isinstance(titular.get("identification"), dict) else None),
            "campos": sorted(c)}


def acao_ok(r: dict) -> bool:
    return (r.get("acao") == "aluno_mp_cartao" and r.get("tem_token") and r.get("pagador_nome") and r.get("pagador_documento_tipo") == "CPF"
            and r.get("pagador_documento_11_digitos") and r.get("device_id"))


def token_falso(corpo: object) -> dict:
    """A resposta falsa do POST /v1/card_tokens (o ensaio: nada vai ao MP) — o formato do MP, com os dados do cartão de TESTE."""
    c = corpo if isinstance(corpo, dict) else {}
    titular = c.get("cardholder") if isinstance(c.get("cardholder"), dict) else {}
    agora = time.strftime("%Y-%m-%dT%H:%M:%S.000-03:00")
    return {"id": "ensaiompc" + "0" * 23, "public_key": None, "card_id": None, "status": "active", "date_created": agora, "date_last_updated": agora,
            "date_due": agora, "luhn_validation": True, "live_mode": False, "require_esc": False, "card_number_length": 16,
            "security_code_length": 3, "first_six_digits": CARTAO["numero"][:6], "last_four_digits": CARTAO["numero"][-4:],
            "expiration_month": 11, "expiration_year": 2030, "cardholder": titular or {"name": TITULAR}}


# ───────────────────────── o navegador ─────────────────────────

def explorar_brick(pg) -> dict:
    """A estrutura do Brick: os iframes (nome e o host) e os campos da página dentro do [data-brick-mp] (nome, id, tipo, placeholder)."""
    frames = [{"nome": f.name, "host": re.sub(r"^https?://([^/]+).*$", r"\1", f.url)} for f in pg.frames if f != pg.main_frame]
    campos = pg.evaluate("""() => [...document.querySelectorAll('[data-brick-mp] input, [data-brick-mp] select, [data-brick-mp] button')]
        .map((e) => ({ tag: e.tagName.toLowerCase(), nome: e.name || '', id: e.id || '', tipo: e.type || '', dica: (e.placeholder || '').slice(0, 30),
                       rotulo: (e.getAttribute('aria-label') || '').slice(0, 40), visivel: !!(e.offsetWidth || e.offsetHeight) }))""")
    return {"frames": frames, "campos": campos}


def digitar_no_iframe(pg, nome_parcial: str, texto: str) -> bool:
    sel = f"[data-brick-mp] iframe[name*='{nome_parcial}']"
    if not pg.locator(sel).count():
        return False
    # cada iframe tem inputs escondidos dos outros campos (class "hide"): o visível é o do campo
    campo = pg.frame_locator(sel).first.locator("input:visible").first
    try:
        campo.click(timeout=15000)
        campo.press_sequentially(texto, delay=60)
        return True
    except Exception as e:  # noqa: BLE001 — o relatório diz qual campo não foi
        print(f"   (o campo {nome_parcial} não aceitou: {type(e).__name__})", flush=True)
        return False


def preencher_brick(pg) -> dict:
    """O cartão de TESTE nos campos seguros (iframes) e o titular e o CPF nos campos da página do Brick."""
    feito = {"numero": digitar_no_iframe(pg, "cardNumber", CARTAO["numero"])}
    pg.wait_for_timeout(1500)   # a bandeira (a consulta do BIN)
    feito["validade"] = digitar_no_iframe(pg, "expirationDate", CARTAO["validade"]) or digitar_no_iframe(pg, "expiration", CARTAO["validade"])
    feito["cvv"] = digitar_no_iframe(pg, "securityCode", CARTAO["cvv"])
    nome = pg.locator("[data-brick-mp] input[name*='HOLDER' i], [data-brick-mp] input[id*='cardholderName' i], [data-brick-mp] input[name*='cardholder' i]")
    feito["titular"] = nome.count() > 0
    if feito["titular"]:
        nome.first.fill(TITULAR)
    # medido em 15/10 (--explorar): os iframes cardNumber/expirationDate/securityCode; na página, HOLDER_NAME, o tipo (select) e DOCUMENT
    doc = pg.locator("[data-brick-mp] input[name='DOCUMENT'], [data-brick-mp] input[name*='IDENTIFICATION_NUMBER' i], "
                     "[data-brick-mp] input[name*='identification' i]")
    feito["cpf"] = doc.count() > 0
    if feito["cpf"]:
        doc.first.click()
        doc.first.press_sequentially(CPF_TESTE, delay=40)
    return feito


def rodar_local(a) -> int:
    import telas as T  # noqa: PLC0415 — a base dos E2E de tela (as contas de TESTE, a Rodada, a sessão injetada)
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    C, B5 = T.carregar("staging")
    C.SAIDA, B5.PRINTS = SAIDA, PRINTS
    o = C.Saida("telas_mpc_local" + ("_explorar" if a.explorar else ""), parar=False)
    base = "http://localhost:8080"
    R = T.Rodada(C=C, B5=B5, o=o, base=base, prefixo="mpc_local", producao=False, sess=C.Sessoes())
    capturas: dict = {"token": [], "acao": [], "outras_acoes": []}
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, headless=not a.com_tela, args=ARGS_NAVEGADOR)
        try:
            caso, _ = R.novo_caso(nav, "cartao_aluno", desktop=False)

            def rota_token(route, request) -> None:
                if request.method != "POST":
                    route.continue_()
                    return
                try:
                    corpo = request.post_data_json
                except Exception:  # noqa: BLE001
                    corpo = None
                capturas["token"].append(resumo_do_token(corpo))
                route.fulfill(status=201, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                              body=json.dumps(token_falso(corpo)))

            def rota_funcao(route, request) -> None:
                if request.method != "POST":
                    route.continue_()
                    return
                try:
                    corpo = request.post_data_json
                except Exception:  # noqa: BLE001
                    corpo = None
                if not isinstance(corpo, dict) or corpo.get("acao") not in ("aluno_mp_cartao", "aluno_mp_assinar"):
                    route.continue_()
                    return
                capturas["acao"].append(resumo_da_acao(corpo))
                route.fulfill(status=200, content_type="application/json",
                              headers={"Access-Control-Allow-Origin": base, "Vary": "Origin"},
                              body=json.dumps({"ok": True, "status": "aberta", "status_detail": "cc_rejected_other_reason",
                                               "cobranca": {"id": "ensaio", "status": "aberta"}}))

            caso.ctx.route("https://api.mercadopago.com/v1/card_tokens**", rota_token)
            caso.ctx.route("**/functions/v1/pagamentos-aluno", rota_funcao)
            R.entrar(caso, "/perfil/pagamentos", CONTA_LOCAL)
            pagar = caso.esperar(lambda: caso.tem("[data-pagar-mensalidade]"), 60)
            o.ok(pagar, f"o Pagar da matrícula do app do {CONTA_LOCAL} na tela (390 px)")
            if not pagar:
                caso.diagnostico()
                return o.fim()
            caso.pg.locator("[data-pagar-mensalidade]").first.click()
            folha = caso.esperar(lambda: caso.tem("[data-mp-cartao]"), 30)
            o.ok(folha, "a folha do MP com o 'Pagar com cartão'")
            if not folha:
                return o.fim()
            # o security.js: o id do aparelho pronto antes de abrir o cartão (o tempo de digitar cobre isso na vida real)
            pronto = caso.esperar(lambda: caso.pg.evaluate("() => typeof window.MP_DEVICE_SESSION_ID === 'string'"), 15)
            o.ok(pronto, "o id do aparelho do security.js na página (≤ 15 s; só a presença)")
            caso.pg.locator("[data-mp-cartao]").first.click()
            brick = caso.esperar(lambda: caso.pg.locator("[data-brick-mp] iframe").count() > 0, 60)
            o.ok(brick, "o Brick do cartão carregou (os campos seguros em iframe)")
            if not brick:
                return o.fim()
            caso.pg.wait_for_timeout(3000)
            if a.explorar:
                est = explorar_brick(caso.pg)
                o.linha("   iframes: " + json.dumps(est["frames"], ensure_ascii=False))
                for c in est["campos"]:
                    o.linha("   campo: " + json.dumps(c, ensure_ascii=False))
                caso.print("cartao_aluno_explorar")
                return o.fim()
            feito = preencher_brick(caso.pg)
            o.ok(all(feito.values()), f"o Brick preenchido com o cartão de TESTE ({feito})")
            caso.pg.wait_for_timeout(1500)
            arq = caso.print("cartao_aluno_preenchido")
            o.linha(f"   print: {arq}")
            botao = caso.pg.locator("[data-brick-mp] button[type='submit'], [data-brick-mp] button:has-text('Pagar')").first
            botao.click(timeout=15000)
            enviou = caso.esperar(lambda: bool(capturas["acao"]), 40)
            tok = capturas["token"][-1] if capturas["token"] else {}
            acao = capturas["acao"][-1] if capturas["acao"] else {}
            o.ok(bool(tok) and tok.get("device_meli_session_id") is True,
                 f"o POST /v1/card_tokens do Brick (respondido pelo teste) leva o aparelho do SDK: device.meli.session_id "
                 f"{tok.get('device_meli_session_id')} · o titular {tok.get('titular_nome')} · o documento {tok.get('titular_documento_tipo')}")
            o.ok(enviou and acao_ok(acao),
                 f"a ação aluno_mp_cartao (respondida pelo teste) sai com pagador.nome {acao.get('pagador_nome')}, pagador.documento.tipo "
                 f"{acao.get('pagador_documento_tipo')} (11 dígitos {acao.get('pagador_documento_11_digitos')}) e device_id "
                 f"{acao.get('device_id')} ({acao.get('device_tamanho')} caracteres) — campos {acao.get('campos')}")
            caso.pg.wait_for_timeout(1500)
            o.linha(f"   print: {caso.print('cartao_aluno_depois')}")
        finally:
            try:
                R.sess.fechar(o)
            finally:
                nav.close()
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)   # H-50: a rodada no e2e-rodadas.tsv (como o csp.py)
    return o.fim()


def rodar_staging(a) -> int:
    """F5 (a sessão principal): o fluxo de verdade — o site de teste, o aluno2 na conta do prof2 com o vendedor de TESTE (a integração do
    e2e/mpc/api.py cifrada com a chave das funções), o Brick preenchido e o Pagar de verdade (o sandbox), a cobrança paga e o estorno."""
    sys.path.insert(0, str(AQUI))
    import api as MPC  # noqa: PLC0415 — o preparar, a integração, o estorno e o desfazer da rodada (o mesmo estado do api.py)
    import telas as T  # noqa: PLC0415
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    MPC.CTX["modo"] = "staging"
    MPC.carregar()
    if MPC.ESTADO_ARQ.exists():
        MPC.desfazer()
    MPC.CTX["vendedor"] = MPC.vendedor_de_teste()
    MPC.preparar()
    capturas: dict = {"token": [], "acao": []}
    base = "https://physiqcalc-staging.vercel.app"
    try:
        MPC.integracao_do_vendedor(MPC.W2.chave_do_servico())
        MPC.base_do_caso("mercadopago_conta")
        C, B5 = T.carregar("staging")
        C.SAIDA, B5.PRINTS = SAIDA, PRINTS
        o = C.Saida("telas_mpc_staging" + ("_loja" if a.loja else ""), parar=False)
        R = T.Rodada(C=C, B5=B5, o=o, base=base, prefixo="mpc_staging", producao=False, sess=C.Sessoes())
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=a.canal, headless=not a.com_tela, args=ARGS_NAVEGADOR)
            try:
                caso, _ = R.novo_caso(nav, "cartao_aluno", desktop=False)
                caso.pg.on("request", lambda r: (capturas["token"].append(resumo_do_token(r.post_data_json)) if r.method == "POST" and "/v1/card_tokens" in r.url
                                                 else capturas["acao"].append(resumo_da_acao(r.post_data_json)) if r.method == "POST"
                                                 and r.url.endswith("/functions/v1/pagamentos-aluno") and "aluno_mp_cartao" in (r.post_data or "") else None))
                R.entrar(caso, "/perfil/pagamentos", "aluno2" if "aluno2" in B5.CONTAS else MPC.ALUNO)
                o.ok(caso.esperar(lambda: caso.tem("[data-pagar-mensalidade]"), 60), "o Pagar do aluno2 na tela")
                caso.pg.locator("[data-pagar-mensalidade]").first.click()
                o.ok(caso.esperar(lambda: caso.tem("[data-mp-cartao]"), 30), "a folha do MP do personal com o cartão")
                caso.pg.locator("[data-mp-cartao]").first.click()
                o.ok(caso.esperar(lambda: caso.pg.locator("[data-brick-mp][data-brick-chave='conta'] iframe").count() > 0, 60),
                     "o Brick com a chave do VENDEDOR de teste")
                caso.pg.wait_for_timeout(3000)
                feito = preencher_brick(caso.pg)
                o.ok(all(feito.values()), f"o Brick preenchido ({feito})")
                caso.pg.locator("[data-brick-mp] button[type='submit'], [data-brick-mp] button:has-text('Pagar')").first.click(timeout=15000)
                caso.esperar(lambda: bool(capturas["acao"]), 60)
                caso.pg.wait_for_timeout(8000)
                acao = capturas["acao"][-1] if capturas["acao"] else {}
                tok = capturas["token"][-1] if capturas["token"] else {}
                o.ok(acao_ok(acao), f"a ação com o pagador e o device_id ({ {k: v for k, v in acao.items() if k != 'campos'} })")
                o.ok(tok.get("device_meli_session_id") is True, f"o card token com o aparelho do SDK ({tok.get('device_meli_session_id')})")
                linha = MPC.W2.um(f"""select id::text as id, status, mp_payment_id from {MPC.S}.cobrancas where paciente_id = '{MPC.CTX['pac']}'
                                       and created_at >= {MPC.W2.lit(MPC.CTX['t0'])}::timestamptz order by created_at desc limit 1""") or {}
                o.ok(linha.get("status") == "paga", f"a cobrança paga ({linha.get('status')})")
                if linha.get("mp_payment_id"):
                    MPC.estornar(str(linha["mp_payment_id"]))
            finally:
                try:
                    R.sess.fechar(o)
                finally:
                    nav.close()
        C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
        return o.fim()
    finally:
        MPC.desfazer()


def seco() -> int:
    sys.path.insert(0, str(REPO / "e2e" / "w02"))
    from _comum import Placar  # noqa: PLC0415
    p = Placar()
    dev = "armor." + "a1" * 100
    certo = {"acao": "aluno_mp_cartao", "paciente_id": "p1", "card_token": "t", "payment_method_id": "master", "installments": 1,
             "pagador": {"nome": TITULAR, "documento": {"tipo": "CPF", "numero": CPF_TESTE}}, "device_id": dev}
    r = resumo_da_acao(certo)
    p.check(acao_ok(r) and CPF_TESTE not in json.dumps(r) and TITULAR not in json.dumps(r) and dev not in json.dumps(r),
            "seco: o resumo da ação só com presença, tipo e formato (sem o CPF, o nome e o id)")
    for rotulo, ruim in (("sem device", {k: v for k, v in certo.items() if k != "device_id"}),
                         ("device com quebra", {**certo, "device_id": dev + "\n"}),
                         ("sem documento", {**certo, "pagador": {"nome": TITULAR}}),
                         ("CPF curto", {**certo, "pagador": {"nome": TITULAR, "documento": {"tipo": "CPF", "numero": "123"}}})):
        p.check(not acao_ok(resumo_da_acao(ruim)), f"seco: a ação {rotulo} é acusada")
    t = resumo_do_token({"card_number": "x", "cardholder": {"name": TITULAR, "identification": {"type": "CPF", "number": CPF_TESTE}},
                         "device": {"meli": {"session_id": "s"}}})
    p.check(t["device_meli_session_id"] is True and t["titular_documento_tipo"] == "CPF" and CPF_TESTE not in json.dumps(t),
            "seco: o resumo do card token (o device.meli.session_id e o tipo do documento, sem valor)")
    p.check(resumo_do_token({})["device_meli_session_id"] is False and token_falso({})["first_six_digits"] == CARTAO["numero"][:6],
            "seco: o token sem o aparelho é acusado; o token falso do ensaio tem o formato do MP")
    fonte = {rel: (REPO / rel).read_text(encoding="utf-8") for rel in ("src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx",
                                                                       "src/painel/configuracoes/plano/CartaoPagamento.tsx",
                                                                       "src/app-aluno/perfil/Pagamentos.tsx")}
    p.check(all(s in "".join(fonte.values()) for s in ("data-mp-cartao", "data-brick-mp", "data-pagar-mensalidade", "data-cartao-mp")),
            "seco: os seletores do teste existem nas telas")
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq mp-cartao — E2E de tela do cartão do aluno (o Brick preenchido)")
    ap.add_argument("--base", choices=("local", "staging"), help="local = o ensaio (nada vai ao MP nem à função); staging = F5")
    ap.add_argument("--canal", default="msedge", choices=("chromium", "msedge", "chrome"))
    ap.add_argument("--com-tela", action="store_true")
    ap.add_argument("--loja", action="store_true", help="staging: o build da loja (F5)")
    ap.add_argument("--explorar", action="store_true", help="local: só lista a estrutura do Brick")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.base == "local":
        return rodar_local(a)
    if a.base == "staging":
        return rodar_staging(a)
    ap.error("--seco, --base local ou --base staging")
    return 2


if __name__ == "__main__":
    sys.exit(main())
