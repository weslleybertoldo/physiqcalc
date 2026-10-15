#!/usr/bin/env python3
"""Physiq mp-cartao — E2E de SERVIDOR da aprovação do cartão no Mercado Pago (contrato hml/mpc/CONTRATO_MPC.md §2.2 e §4): a
pagamentos-aluno manda no CARTÃO o aparelho (o cabeçalho X-meli-session-id), o titular e o documento (o payer), 1 item
(additional_info.items) e o descritor "PHYSIQ"; na AUTOMÁTICA só o cabeçalho; a recusa vai ao log com o motivo (mp_cartao_recusado, o
cc_rejected_… da mensagem na automática) e o resultado com/sem aparelho. Contas de TESTE: o aluno2 paga, na conta do prof2 (o modo de
receber muda por caso, por SQL do servidor, SÓ no staging). Saída sem dado pessoal nem segredo: códigos, status, contagens e booleanos.

Modos:
  --seco             nada sai de 127.0.0.1 (sem banco e sem login): as conferências puras deste arquivo (o corpo esperado do cartão e da
                     automática, a leitura do log, a busca dos valores de teste) e o simulador do MP (e2e/w2/simulador_mp.py) com os 2
                     cenários novos — o cabeçalho registrado só como "veio/não veio" e o titular e o documento mascarados
  --local            (F3) a pagamentos-aluno no Deno LOCAL (e2e/w1/servir_local.ts, porta 8790) contra o banco do STAGING (x-schema
                     staging — outro schema nunca) e o SIMULADOR do MP (porta 8799) no lugar do MP (MP_API_BASE). Casos:
                       physiq_avista, physiq_automatica  o MP do Physiq ('mercadopago': o token physiq_teste do simulador)
                       conta_avista, conta_automatica    o MP do personal ('mercadopago_conta': o par do vendedor A do simulador, cifrado
                                                          com a chave da rodada)
                       sem_device         sem device_id → sem cabeçalho; a recusa (cc_rejected_insufficient_amount) no log com sem_device
                       device_ruim        o device com quebra de linha e com 600 caracteres → sem cabeçalho e 200 (nunca 500)
                       dv_errado          o CPF com o dígito verificador errado → o payer sem identification e 200
                       apk_antigo         o corpo de antes (sem pagador e sem device_id) → 200 com o item e o descritor
                       recusa_seguranca   201 rejected cc_rejected_high_risk → o status_detail na resposta (a tela escolhe o texto) e o
                                          log mp_cartao_recusado com o código e com_device
                       automatica_recusa  o POST /preapproval 400 com o código SÓ na mensagem (14/10) → cartao_recusado com o
                                          status_detail e o log mp_assinatura_falhou com o código
                     e, no fim de toda rodada, o log do Deno da rodada SEM o CPF, o nome e o device de teste (0 ocorrência)
  --local --sandbox  (F3) a MESMA função local com o MP de VERDADE em SANDBOX: o VENDEDOR DE TESTE (--vendedor oauth, o padrão: o par de
                     ~/.physiq-mp-vendedor-teste-oauth.json — o caminho da W2; app: a aplicação PRÓPRIA dele, ~/.physiq-mp-vendedor-teste-app.json)
                     no MP do Physiq (o token dele no Deno local: nada da conta real do Physiq) e no do personal (a integração cifrada com a
                     chave da rodada), o COMPRADOR de teste e o cartão de teste (a bandeira que a chave acha pelo BIN) → aluno_mp_cartao com o
                     titular, o CPF de teste e o id do aparelho (o de verdade do security.js; sem ele, um no formato). O sandbox NÃO paga
                     (15/10: o par da W2 → 2034; a aplicação própria → 401): a prova é a recusa — nunca 500, sem o texto do MP na resposta,
                     o motivo no log do Deno (mp_cartao_falhou com as causas e com/sem device) e nada pago. Se o MP um dia aprovar: o GET do
                     pagamento mostra o item (5 campos), o descritor e o tipo do documento, e o pagamento volta (o estorno)
  (sem --local)      (F5, da sessão principal — NÃO roda na etapa 1; a revisão mpc 🟡1) a pagamentos-aluno PUBLICADA no staging com o par
                     do OAuth da W2 (a integração cifrada com a MP_TOKENS_CHAVE das funções, lida do cofre só na memória, conferida pelo digest):
                     recusado_com_device (o titular + o aparelho), recusado_sem_device (o corpo do APK de antes) e automatica — nunca 500, o
                     log PUBLICADO (o endpoint de logs, até 150 s) com mp_cartao_falhou/mp_assinatura_falhou, as causas do sandbox (2034 com
                     o par da W2; outra = anotar) e com/sem device; nada pago; a automática criada no MP cancelada na hora
  --limpar           só desfaz uma rodada que caiu no meio (pelo arquivo de estado)
Desfazer (o do e2e/w2/api.py — W2.desfazer): ANTES de gravar, a foto (a matrícula do aluno2, a conta do prof2 — modo e bloqueio —, as
flags, as mensalidades e automáticas de antes e os 2 jobs do MP) vai para ~/projetos/physiqcalc-scratch/hml/mpc/local/api-estado.json (600);
no fim (ou no --limpar) saem as automáticas da rodada, a integração do MP da conta, as cobranças, os avisos e os eventos da rodada, e o
resto volta à foto — o último ✅ confere campo a campo. Os 2 jobs (mp-renovar-staging e automaticas-fila-staging: chamariam as funções
PUBLICADAS com a integração da rodada) ficam PARADOS durante a rodada e voltam no desfazer. A rodada só começa com a conta do prof2 SEM
integração do MP e sem automática viva. Processos (o Deno, o simulador, o navegador): o pid na tela e o fim pelo pid.
Precisa: ~/.pc-pat, as senhas das contas de TESTE, o ~/.deno/bin/deno e as portas 8790 e 8799 livres; no --sandbox, os arquivos 600 do
vendedor e do comprador de teste (a W2) e o Playwright (--canal msedge).
Uso: python3 e2e/mpc/api.py --seco
     python3 e2e/mpc/api.py --local [--casos physiq_avista,...]
     python3 e2e/mpc/api.py --local --sandbox [--vendedor oauth|app] [--canal msedge] [--sem-device-real]
     python3 e2e/mpc/api.py [--casos recusado_com_device,...]                (F5: a função PUBLICADA no staging)
     python3 e2e/mpc/api.py --limpar
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(RAIZ / "e2e" / "w2"))
import api as W2  # noqa: E402 — as peças da W2 (a rede sem proxy, a cifra, a foto e o desfazer); importar não abre rede nem lê senha
import simulador_mp as SIM  # noqa: E402

S = "staging"
DONO, ALUNO = W2.DONO, W2.ALUNO                 # prof2 (dono da conta) e aluno2 (paga) — contas de TESTE
CASA = Path.home()
DIR = CASA / "projetos" / "physiqcalc-scratch" / "hml" / "mpc" / "local"
ESTADO_ARQ = DIR / "api-estado.json"
LOG_DENO = DIR / "deno-local.log"
PORTAS = {"pag": 8790, "sim": 8799}
DENO = W2.DENO
MP = "https://api.mercadopago.com"
SEGURANCA_JS = "https://www.mercadopago.com/v2/security.js"
ARQ_VENDEDOR_APP = ".physiq-mp-vendedor-teste-app.json"     # as credenciais de PRODUÇÃO da aplicação PRÓPRIA do vendedor de TESTE (= sandbox)
ARQ_VENDEDOR_OAUTH = ".physiq-mp-vendedor-teste-oauth.json"   # o par do OAuth pela aplicação REAL (a W2): o MP recusa com 2034 (15/10)
ARQ_COMPRADOR = ".physiq-mp-comprador-teste.json"
# os cartões de TESTE do MP (Brasil): a bandeira que a chave do vendedor ACEITA é escolhida na hora (/v1/payment_methods/search) — com o
# par do OAuth da W2 o Mastercard (503143…) deu bin_not_found e o Visa achou o BIN (15/10)
CARTOES_TESTE = (("master", "5031433215406351"), ("visa", "4235647728025682"))
VALIDADE_TESTE = {"expiration_month": 11, "expiration_year": 2030, "security_code": "123"}
METODO_TESTE = "visa"
CPF_TESTE = "12345678909"            # o CPF de teste do MP (o dos card tokens dos E2E) — de ninguém
CPF_DV_ERRADO = "12345678900"
TITULAR = ("Joaquina", "Brandão Mpcteste")   # o titular de TESTE (o log do Deno não pode ter nenhum dos 2)
PAGADOR_SIM = W2.PAGADOR_SIM
OCULTO = SIM.OCULTO
DESCRITOR = "PHYSIQ"
CATEGORIA = "services"
DEVICE_RX = re.compile(r"^[A-Za-z0-9._:-]{8,512}$")   # o de _shared/mp-pagador-regras.ts › DEVICE_RX
VALOR = 10                                            # a mensalidade de teste (R$ 10,00), como a W2
CHAVES_CARTAO = {"transaction_amount", "token", "description", "installments", "payer", "external_reference", "notification_url",
                 "additional_info", "statement_descriptor", "payment_method_id", "issuer_id"}
CHAVES_AUTOMATICA = {"reason", "external_reference", "payer_email", "auto_recurring", "back_url", "notification_url", "card_token_id", "status"}
CASOS_LOCAL = ("physiq_avista", "physiq_automatica", "conta_avista", "conta_automatica", "sem_device", "device_ruim", "dv_errado", "apk_antigo",
               "avulsa", "recusa_seguranca", "automatica_recusa", "renova_com_device")
CASOS_SANDBOX = ("sandbox_physiq", "sandbox_conta")
# revisão mpc 🟡1 (o roteiro da F5): com a função PUBLICADA e o sandbox que NÃO paga, prova-se o caminho da recusa — nunca 500, o motivo no log
CASOS_STAGING = ("recusado_com_device", "recusado_sem_device", "automatica")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"

B = None   # a base dos E2E (e2e/w06/_base.py), carregada no main (o --seco não carrega: nada de rede)
p = None
CTX: dict = {"logins": set(), "procs": {}, "valores": set(), "modo": None}


# ───────────────────────── peças puras (o --seco confere) ─────────────────────────

def corpo_cartao(paciente: str, *, cartao: str = "sim-card-APRO", titular: tuple[str, str] | None = TITULAR, documento: str | None = CPF_TESTE,
                 device: str | None = None, antigo: bool = False, metodo: str = "master") -> dict:
    """O corpo do aluno_mp_cartao como a tela manda (a folha PagarMercadoPago): o de antes + `pagador` e `device_id` quando há. antigo = o
    corpo do APK de antes (sem os 2)."""
    c: dict = {"paciente_id": paciente, "card_token": cartao, "payment_method_id": metodo, "installments": 1}
    if antigo:
        return c
    pagador: dict = {}
    if titular:
        pagador["nome"] = " ".join(titular)
    if documento:
        pagador["documento"] = {"tipo": "CPF", "numero": documento}
    if pagador:
        c["pagador"] = pagador
    if device is not None:
        c["device_id"] = device
    return c


def problemas_do_cartao(pedido: dict | None, *, titular: bool, documento: bool, device: bool, item_id: str = "mensalidade",
                        valor: float = VALOR, email: str = PAGADOR_SIM) -> list[str]:
    """O POST /v1/payments como o simulador registrou (o corpo mascarado; o cabeçalho do aparelho só como veio/não veio) → o que está fora
    do contrato §2.2 (vazio = certo): o payer (o e-mail + o titular e o documento quando vêm), 1 item com os 5 campos, o additional_info.payer
    só com o titular, o descritor, o cabeçalho e nenhum campo a mais."""
    if not pedido:
        return ["o POST /v1/payments não chegou ao simulador"]
    c = pedido.get("corpo") if isinstance(pedido.get("corpo"), dict) else {}
    erros: list[str] = []
    if bool(pedido.get("device")) != device:
        erros.append("o cabeçalho do aparelho " + ("faltou" if device else "veio sem dever"))
    esperado: dict = {"email": email}
    if titular:
        esperado |= {"first_name": OCULTO, "last_name": OCULTO}
    if documento:
        esperado["identification"] = {"type": "CPF", "number": OCULTO}
    payer = c.get("payer") if isinstance(c.get("payer"), dict) else {}
    if payer != esperado:
        erros.append(f"o payer tem {sorted(payer)} (esperado {sorted(esperado)}; o tipo do documento {((payer.get('identification') or {}).get('type'))})")
    info = c.get("additional_info") if isinstance(c.get("additional_info"), dict) else {}
    itens = info.get("items") if isinstance(info.get("items"), list) else []
    if len(itens) != 1 or not isinstance(itens[0], dict):
        erros.append(f"{len(itens)} item(ns) no additional_info")
    else:
        it = itens[0]
        titulo = str(it.get("title") or "")
        if (set(it) != {"id", "title", "category_id", "quantity", "unit_price"} or it.get("id") != item_id or it.get("category_id") != CATEGORIA
                or it.get("quantity") != 1 or it.get("unit_price") != valor or not titulo.strip() or len(titulo) > 120):
            erros.append(f"o item fora do contrato (campos {sorted(it)}; id certo {it.get('id') == item_id}; categoria {it.get('category_id')!r}; "
                         f"quantidade {it.get('quantity')!r}; valor certo {it.get('unit_price') == valor}; título com {len(titulo)} caracteres)")
    pag_info = info.get("payer")
    if titular and pag_info != {"first_name": OCULTO, "last_name": OCULTO}:
        erros.append(f"o additional_info.payer tem {sorted(pag_info) if isinstance(pag_info, dict) else pag_info!r}")
    if not titular and pag_info is not None:
        erros.append("o additional_info.payer veio sem o titular")
    if set(info) - {"items", "payer"}:
        erros.append(f"o additional_info com {sorted(set(info) - {'items', 'payer'})}")
    if c.get("statement_descriptor") != DESCRITOR:
        erros.append(f"o descritor {c.get('statement_descriptor')!r}")
    # revisão mpc ⚪8e: o valor do pagamento = o do item × a quantidade (hoje o código usa o mesmo número nos 2)
    if len(itens) == 1 and isinstance(itens[0], dict) and c.get("transaction_amount") != (itens[0].get("unit_price") or 0) * (itens[0].get("quantity") or 0):
        erros.append("o transaction_amount ≠ unit_price × quantity")
    if set(c) - CHAVES_CARTAO:
        erros.append(f"campos a mais no pedido: {sorted(set(c) - CHAVES_CARTAO)}")
    return erros


def problemas_da_automatica(pedido: dict | None, *, device: bool) -> list[str]:
    """O POST /preapproval (authorized, com cartão) → fora do contrato (decisão 6: o corpo de antes + só o cabeçalho)."""
    if not pedido:
        return ["o POST /preapproval não chegou ao simulador"]
    c = pedido.get("corpo") if isinstance(pedido.get("corpo"), dict) else {}
    erros: list[str] = []
    if bool(pedido.get("device")) != device:
        erros.append("o cabeçalho do aparelho " + ("faltou" if device else "veio sem dever"))
    if set(c) != CHAVES_AUTOMATICA:
        erros.append(f"o corpo mudou: {sorted(set(c) ^ CHAVES_AUTOMATICA)}")
    if c.get("status") != "authorized" or c.get("card_token_id") != OCULTO:
        erros.append(f"status {c.get('status')!r}, cartão {'sim' if c.get('card_token_id') else 'não'}")
    return erros


def linhas_do_log(texto: str, funcao: str = "pagamentos-aluno") -> list[dict]:
    """As linhas JSON do _shared/log.ts da função (o resto do log do Deno fica fora)."""
    saida: list[dict] = []
    for linha in texto.splitlines():
        linha = linha.strip()
        if not linha.startswith("{"):
            continue
        try:
            d = json.loads(linha)
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("funcao") == funcao:
            saida.append(d)
    return saida


def ocorrencias(texto: str, valores: set[str]) -> int:
    """Quantas vezes os valores de TESTE (o CPF, o nome, o device) aparecem no texto (o log da rodada tem de dar 0)."""
    return sum(texto.count(v) for v in valores if v)


def ultimo_pedido(pedidos: list[dict], metodo: str, caminho: str) -> dict | None:
    achados = [x for x in pedidos if x.get("metodo") == metodo and str(x.get("caminho") or "").split("?")[0] == caminho]
    return achados[-1] if achados else None


def device_de_teste() -> str:
    """Um id de aparelho no formato do de verdade (letras, dígitos e '.'; o security.js deu 231 caracteres em 15/10) — valor de TESTE."""
    return f"mpcteste.{secrets.token_hex(64)}.{secrets.token_hex(40)}"


def resumo_do_pagamento(pay: dict) -> dict:
    """O GET do pagamento no MP → SÓ o que o aceite confere (booleanos, códigos e tamanhos): nunca o número do documento, o nome ou o e-mail."""
    info = pay.get("additional_info") if isinstance(pay.get("additional_info"), dict) else {}
    itens = info.get("items") if isinstance(info.get("items"), list) else []
    it = itens[0] if itens and isinstance(itens[0], dict) else {}
    ident = ((pay.get("payer") or {}).get("identification") or {}) if isinstance(pay.get("payer"), dict) else {}
    num = str(ident.get("number") or "")

    def numero(v) -> float | None:
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    return {
        "status": pay.get("status"), "status_detail": pay.get("status_detail"), "live_mode": pay.get("live_mode"),
        "itens": len(itens),
        "item_5_campos": [k for k in ("id", "title", "category_id", "quantity", "unit_price") if it.get(k) not in (None, "")],
        "item_id_certo": it.get("id") == "mensalidade", "item_categoria": it.get("category_id"),
        "item_quantidade_1": numero(it.get("quantity")) == 1.0, "item_valor_certo": numero(it.get("unit_price")) == float(VALOR),
        "statement_descriptor": pay.get("statement_descriptor"),
        "payer_identification_type": ident.get("type"), "payer_identification_11_digitos": bool(re.fullmatch(r"\d{11}", num)),
        "additional_info_payer_first_name": bool((info.get("payer") or {}).get("first_name")) if isinstance(info.get("payer"), dict) else False,
    }


def aceite_ok(r: dict) -> bool:
    """O MP aceitou e guardou o corpo novo: 1 item com os 5 campos (id, categoria, 1 unidade, o valor), o descritor e o tipo do documento."""
    return (r.get("itens") == 1 and len(r.get("item_5_campos") or []) == 5 and r.get("item_id_certo") and r.get("item_categoria") == CATEGORIA
            and r.get("item_quantidade_1") and r.get("item_valor_certo") and r.get("statement_descriptor") == DESCRITOR
            and r.get("payer_identification_type") == "CPF" and r.get("payer_identification_11_digitos"))


# ───────────────────────── a base, o banco e a rede ─────────────────────────

def carregar() -> None:
    """A base dos E2E (as chaves pela Management API, as senhas das contas de TESTE) e as peças da W2 apontadas para ESTA rodada."""
    global B, p
    W2.carregar_base()
    B, p = W2.B, W2.p
    W2.ESTADO_ARQ = ESTADO_ARQ             # o estado e o desfazer desta rodada (não o arquivo da W2)
    W2.PORTAS["sim"] = PORTAS["sim"]        # o W2.integracao e os W2.sim_* falam com o simulador DESTA rodada


def token(conta: str) -> str:
    """A sessão da conta de TESTE (o B.token guarda 40 min: 1 login por conta na rodada) — conta os logins."""
    CTX["logins"].add(conta)
    return B.token(conta)


def pedir(conta: str, acao: str, corpo: dict | None = None) -> tuple[int, dict]:
    """Uma ação da pagamentos-aluno como a conta de TESTE: a do Deno local (--local) ou a PUBLICADA (F5) — sempre o schema staging."""
    corpo = corpo or {}
    if CTX["modo"] == "staging":
        CTX["logins"].add(conta)
        st, r = B.pag(conta, acao, corpo)
    else:
        st, r, _ = W2.rede("POST", f"http://127.0.0.1:{PORTAS['pag']}", {"acao": acao, **corpo},
                           {"Authorization": f"Bearer {token(conta)}", "x-schema": S, "Origin": "http://localhost:8080"}, timeout=120)
    return st, (r if isinstance(r, dict) else {})


def tamanho_do_log() -> int:
    return LOG_DENO.stat().st_size if LOG_DENO.exists() else 0


def log_desde(pos: int) -> str:
    time.sleep(0.4)   # o console.warn/error do Deno já foi escrito; a folga é do arquivo
    with LOG_DENO.open("rb") as f:
        f.seek(pos)
        return f.read().decode("utf-8", "replace")


def ambiente_deno(sandbox: bool, pagador: str) -> dict:
    """O ambiente do Deno local (só neste processo; nada impresso). A chave dos tokens da conta é a da RODADA (W2.segredos_da_rodada). No
    sandbox o MP do Physiq fica fora (tokens inválidos de propósito) e o client do OAuth é o falso do simulador (nada renova de verdade)."""
    sg = W2.segredos_da_rodada()
    env = {k: v for k, v in os.environ.items() if not k.startswith(("MP_", "SEGREDO_", "SUPABASE_", "INFINITEPAY_", "PROXY_", "ERROS_"))}
    env |= {"DENO_NO_PACKAGE_JSON": "1", "ERROS_AVISO_DESLIGADO": "1", "MP_CLIENT_ID": SIM.CLIENTE_ID, "MP_CLIENT_SECRET": SIM.CLIENTE_SEGREDO,
            "MP_TOKENS_CHAVE": sg["chave"], "MP_TEST_PAYER_EMAIL": pagador, "INFINITEPAY_API": "http://127.0.0.1:19",
            "SUPABASE_URL": B.PRINCIPAL_URL, "SUPABASE_SERVICE_ROLE_KEY": B.service(B.PRINCIPAL_REF), "SUPABASE_ANON_KEY": B.anon(B.PRINCIPAL_REF)}
    if sandbox:
        # o "MP do Physiq" do sandbox = a aplicação PRÓPRIA do vendedor de TESTE (a decisão de 15/10): nada da conta real do Physiq
        env |= {"MP_ACCESS_TOKEN_TEST": CTX["vendedor"]["token"], "MP_ACCESS_TOKEN_PROD": "APP_USR-mpc-sandbox-sem-o-mp-do-physiq"}
    else:
        env |= {"MP_API_BASE": f"http://127.0.0.1:{PORTAS['sim']}", "MP_AUTH_BASE": f"http://127.0.0.1:{PORTAS['sim']}",
                "MP_ACCESS_TOKEN_TEST": SIM.TOKEN_PHYSIQ_TESTE, "MP_ACCESS_TOKEN_PROD": SIM.TOKEN_PHYSIQ_PROD}
    return env


def subir_local(sandbox: bool, pagador: str) -> None:
    """O simulador (fora do sandbox) e a pagamentos-aluno no Deno local. A rede do Deno: 127.0.0.1, o Supabase e, só no sandbox, a API do MP."""
    portas = [PORTAS["pag"]] + ([] if sandbox else [PORTAS["sim"]])
    for porta in portas:
        if W2.porta_aberta(porta):
            raise RuntimeError(f"a porta {porta} já está em uso (ss -ltnp | grep {porta}) — outra sessão?")
    DIR.mkdir(parents=True, exist_ok=True)
    saida = LOG_DENO.open("a", encoding="utf-8")
    saida.write(f"\n===== {time.strftime('%Y-%m-%d %H:%M:%S')} e2e/mpc/api.py {'--local --sandbox' if sandbox else '--local'} =====\n")
    saida.flush()
    CTX["saida"], CTX["log_inicio"] = saida, tamanho_do_log()
    env = ambiente_deno(sandbox, pagador)
    procs: dict = {}
    if not sandbox:
        procs["sim"] = subprocess.Popen([sys.executable, str(RAIZ / "e2e" / "w2" / "simulador_mp.py"), "--porta", str(PORTAS["sim"])],
                                        cwd=RAIZ, stdout=saida, stderr=saida)
    rede_ = f"127.0.0.1,{B.PRINCIPAL_REF}.supabase.co" + (",api.mercadopago.com" if sandbox else "")
    procs["pag"] = subprocess.Popen([str(DENO), "run", f"--allow-net={rede_}", "--allow-env", "--allow-read", "e2e/w1/servir_local.ts",
                                     "supabase-principal/functions/pagamentos-aluno/index.ts", str(PORTAS["pag"])],
                                    cwd=RAIZ, env=env, stdout=saida, stderr=saida)
    CTX["procs"] = procs
    print(f"   processos: {', '.join(f'{k} pid {v.pid}' for k, v in procs.items())} (log: {LOG_DENO})", flush=True)
    if not W2.esperar(lambda: all(W2.porta_aberta(x) for x in portas), 120, 1.0):
        descer_local()
        raise RuntimeError(f"o Deno local não subiu em 120 s (veja {LOG_DENO})")


def descer_local() -> None:
    """Cada processo da rodada pelo pid (SIGTERM; 10 s depois, SIGKILL)."""
    procs = CTX.get("procs") or {}
    for pr in procs.values():
        if pr.poll() is None:
            pr.terminate()
    for nome, pr in procs.items():
        try:
            pr.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pr.kill()
            pr.wait(timeout=10)
        print(f"   {nome} (pid {pr.pid}) encerrado: {pr.returncode}", flush=True)
    CTX["procs"] = {}
    if CTX.get("saida"):
        CTX["saida"].close()
        CTX["saida"] = None


# ───────────────────────── a rodada: foto, ponto de partida e desfazer ─────────────────────────

def preparar() -> None:
    """A matrícula do aluno2 na conta do prof2 SEM integração do MP e sem automática viva (senão para antes de gravar); a foto no estado
    (600) ANTES de gravar; o ponto de partida: as mensalidades de antes escondidas (voltam no fim), R$ 10,00 vencida, o modo de hoje, a
    "barreira" (uma automática cancelada da rodada: o aluno_mp_assinar reaproveita a linha mais nova) e os 2 jobs do MP parados."""
    m = W2.um(f"""select p.id::text as id, p.conta_id::text as conta, p.user_id::text as aluno_uid, c.dono_id::text as dono_uid, c.origem
                    from {S}.pacientes p join auth.users u on u.id = p.user_id left join {S}.contas c on c.id = p.conta_id
                   where lower(u.email) = {W2.lit(B.CONTAS[ALUNO][0])} and p.deleted_at is null order by p.ativo desc, p.created_at limit 1""")
    if not m or m["origem"] == "app" or m["dono_uid"] != B.uid(DONO):
        raise RuntimeError(f"a matrícula de TESTE do {ALUNO} tem que estar na conta do {DONO}")
    pac, conta = m["id"], m["conta"]
    pre = W2.um(f"""select (select count(*) from {S}.recebimento_integracoes where conta_id = '{conta}' and provedor = 'mercadopago')::int as integ,
                           {S}.mp_automaticas_vivas('{conta}') as vivas""")
    if pre["integ"] or pre["vivas"]:
        raise RuntimeError(f"a conta do {DONO} já tem integração do MP ({pre['integ']}) ou automática viva ({pre['vivas']}): a rodada não "
                           "começa (nada foi gravado)")
    W2.sql(f"select {S}.mensalidade_recalcular('{pac}')")
    t0 = W2.um("select clock_timestamp()::text as t0")["t0"]
    est = {"t0": t0, "modo_da_rodada": "local", "paciente": pac, "conta_id": conta, "aluno_uid": m["aluno_uid"], "dono_uid": m["dono_uid"],
           "master_uid": None, "mp_criados": [], "rodada": CTX["modo"], **W2.foto(pac, conta, None)}
    if any(v is None for v in est["jobs"].values()):
        raise RuntimeError(f"os 2 jobs do MP não existem no staging ({est['jobs']}): a rodada não começa (nada foi gravado)")
    W2.gravar_estado(est)
    W2.CTX.update(estado=est, pac=pac, conta=conta, aluno_uid=m["aluno_uid"], dono_uid=m["dono_uid"], t0=t0, local=True)
    CTX.update(pac=pac, conta=conta, t0=t0, estado=est)
    print(f"   t0 da rodada: {t0} (a marca das linhas da rodada: a matrícula do aluno2 e a conta do prof2 depois dele)", flush=True)
    if est["vivas"]:
        W2.sql(f"update {S}.cobrancas set deleted_at = now() where id = any(array[{', '.join(W2.lit(x) for x in est['vivas'])}]::uuid[])")
    W2.sql(f"""update {S}.pacientes set plano_aluno_id = null, plano_modalidade = null, plano_valor_negociado = null, mensalidade_valor = {VALOR},
                      cobranca_pausada = false, mensalidade_desde = now() - interval '1 day' where id = '{pac}'""")
    W2.inserir_assinatura(None, "cancelled", None, {"barreira_e2e_mpc": True})
    W2.sql(f"select {S}.mensalidade_recalcular('{pac}')")
    W2.parar_jobs()
    print(f"   os 2 jobs do MP parados na rodada (a foto: {est['jobs']})", flush=True)


def desfazer() -> None:
    """O desfazer da W2 com o estado desta rodada (W2.ESTADO_ARQ = o daqui): o último ✅ confere a foto campo a campo e as sobras."""
    est = json.loads(ESTADO_ARQ.read_text(encoding="utf-8")) if ESTADO_ARQ.exists() else CTX.get("estado")
    if est:
        W2.desfazer(est)


def base_do_caso(modo: str) -> None:
    """O ponto de partida de cada caso: o cenário padrão no simulador, nenhuma automática viva, as mensalidades da rodada fora e o modo."""
    if CTX["modo"] == "local":
        W2.sim_cenario()
    W2.cancelar_vivas()
    W2.esconder()
    W2.modo_conta(modo)


def janela(fazer) -> tuple[tuple[int, dict], list[dict], str]:
    """A ação + os pedidos que ela fez ao simulador + o log do Deno do mesmo intervalo."""
    de, pos = W2.sim_n(), tamanho_do_log()
    r = fazer()
    return r, W2.sim_pedidos(de), log_desde(pos)


def sem_valores(r: dict) -> bool:
    """A resposta da função não leva o CPF, o nome nem o device de teste."""
    return ocorrencias(json.dumps(r, ensure_ascii=False), CTX["valores"]) == 0


# ───────────────────────── casos --local (o simulador no lugar do MP) ─────────────────────────

def _avista(nome: str, modo: str, token_nome: str) -> None:
    base_do_caso(modo)
    (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], device=CTX["device"])))
    post = ultimo_pedido(pedidos, "POST", "/v1/payments")
    erros = problemas_do_cartao(post, titular=True, documento=True, device=True)
    p.check(st == 200 and r.get("status") == "paga" and (post or {}).get("token_nome") == token_nome and not erros and sem_valores(r),
            f"[{nome}] à vista: paga ({st} {r.get('status') or r.get('erro')}) com o token {(post or {}).get('token_nome')}; o pedido ao MP com o "
            f"titular, o CPF, 1 item (5 campos), PHYSIQ e o cabeçalho do aparelho ({'; '.join(erros) or 'tudo como o contrato'})")


def _automatica(nome: str, modo: str, token_nome: str) -> None:
    base_do_caso(modo)
    (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO",
                                                                         "device_id": CTX["device"]}))
    post = ultimo_pedido(pedidos, "POST", "/preapproval")
    erros = problemas_da_automatica(post, device=True)
    a = W2.assinatura_viva()
    p.check(st == 200 and a.get("status") == "authorized" and (post or {}).get("token_nome") == token_nome and not erros and sem_valores(r),
            f"[{nome}] automática: authorized ({st} {r.get('erro') or a.get('status')}) com o token {(post or {}).get('token_nome')}; SÓ o cabeçalho "
            f"a mais — o corpo de antes ({'; '.join(erros) or 'tudo como o contrato'})")


def garantir_integracao() -> None:
    """A integração do MP da conta do prof2 (o vendedor A do simulador, o par cifrado com a chave da rodada) — 1 vez na rodada."""
    if not CTX.get("integracao"):
        W2.integracao(SIM.VENDEDOR_A)
        CTX["integracao"] = True


def local_physiq_avista() -> None:
    print("\n── physiq_avista: o MP do Physiq ('mercadopago') — o cartão com o titular, o CPF, o item, o descritor e o aparelho")
    _avista("physiq_avista", "mercadopago", W2.PHYSIQ)


def local_physiq_automatica() -> None:
    print("\n── physiq_automatica: o MP do Physiq — a automática com o cabeçalho e o corpo de antes")
    _automatica("physiq_automatica", "mercadopago", W2.PHYSIQ)


def local_conta_avista() -> None:
    print("\n── conta_avista: o MP do personal ('mercadopago_conta', o vendedor A) — a mesma linha nos 2 MPs")
    garantir_integracao()
    _avista("conta_avista", "mercadopago_conta", W2.CONTA_A)


def local_conta_automatica() -> None:
    print("\n── conta_automatica: o MP do personal — a automática com o cabeçalho e o corpo de antes")
    garantir_integracao()
    _automatica("conta_automatica", "mercadopago_conta", W2.CONTA_A)


def local_sem_device() -> None:
    print("\n── sem_device: sem device_id → sem o cabeçalho; a recusa vai ao log com sem_device e o motivo")
    garantir_integracao()
    base_do_caso("mercadopago_conta")
    W2.sim_cenario(cartao_status_detail="cc_rejected_insufficient_amount")
    (st, r), pedidos, log = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"])))
    post = ultimo_pedido(pedidos, "POST", "/v1/payments")
    erros = problemas_do_cartao(post, titular=True, documento=True, device=False)
    recusa = [x for x in linhas_do_log(log) if x.get("codigo") == "mp_cartao_recusado"]
    p.check(st == 200 and r.get("status") == "cancelada" and r.get("status_detail") == "cc_rejected_insufficient_amount" and not erros,
            f"[sem_device] recusado (cc_rejected_insufficient_amount) → 200 cancelada; o pedido sem o cabeçalho e com o resto ({st} "
            f"{r.get('status') or r.get('erro')}; {'; '.join(erros) or 'tudo como o contrato'})")
    p.check(len(recusa) == 1 and recusa[0].get("nivel") == "aviso" and recusa[0].get("resultado") == "sem_device"
            and recusa[0].get("externo") == {"mp_status_detail": "cc_rejected_insufficient_amount"} and recusa[0].get("schema") == S,
            f"[sem_device] o log: 1 mp_cartao_recusado (aviso) com resultado sem_device e só o status_detail ({len(recusa)} linha(s); "
            f"{[{k: x.get(k) for k in ('nivel', 'resultado', 'externo')} for x in recusa]})")


def local_device_ruim() -> None:
    print("\n── device_ruim: o device com quebra de linha e com 600 caracteres → sem o cabeçalho e 200 (nunca 500)")
    garantir_integracao()
    for rotulo, ruim in (("quebra de linha", CTX["device"] + "\nX-Idempotency-Key: x"), ("600 caracteres", "a" * 600)):
        base_do_caso("mercadopago_conta")
        CTX["valores"].add(ruim.split("\n")[0])
        (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], device=ruim)))
        post = ultimo_pedido(pedidos, "POST", "/v1/payments")
        erros = problemas_do_cartao(post, titular=True, documento=True, device=False)
        p.check(st == 200 and r.get("status") == "paga" and not erros,
                f"[device_ruim] {rotulo}: 200 paga, sem o cabeçalho ({st} {r.get('status') or r.get('erro')}; {'; '.join(erros) or 'certo'})")


def local_dv_errado() -> None:
    print("\n── dv_errado: o CPF com o dígito verificador errado fica FORA (o MP recusaria o pedido inteiro) — e paga")
    garantir_integracao()
    base_do_caso("mercadopago_conta")
    (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], documento=CPF_DV_ERRADO, device=CTX["device"])))
    post = ultimo_pedido(pedidos, "POST", "/v1/payments")
    erros = problemas_do_cartao(post, titular=True, documento=False, device=True)
    p.check(st == 200 and r.get("status") == "paga" and not erros,
            f"[dv_errado] 200 paga; o payer sem identification, com o titular ({st} {r.get('status') or r.get('erro')}; {'; '.join(erros) or 'certo'})")


def local_apk_antigo() -> None:
    print("\n── apk_antigo: o corpo de antes (sem pagador e sem device_id) → o pedido de antes + o item + o descritor")
    garantir_integracao()
    base_do_caso("mercadopago_conta")
    (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], antigo=True)))
    post = ultimo_pedido(pedidos, "POST", "/v1/payments")
    erros = problemas_do_cartao(post, titular=False, documento=False, device=False)
    p.check(st == 200 and r.get("status") == "paga" and not erros,
            f"[apk_antigo] 200 paga; payer só com o e-mail, 1 item, PHYSIQ, sem o cabeçalho ({st} {r.get('status') or r.get('erro')}; "
            f"{'; '.join(erros) or 'certo'})")


def local_recusa_seguranca() -> None:
    print("\n── recusa_seguranca: o antifraude do MP recusa (201 rejected cc_rejected_high_risk) → o código na resposta e no log")
    garantir_integracao()
    base_do_caso("mercadopago_conta")
    W2.sim_cenario(cartao_status_detail="cc_rejected_high_risk")
    (st, r), _, log = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], device=CTX["device"])))
    recusa = [x for x in linhas_do_log(log) if x.get("codigo") == "mp_cartao_recusado"]
    p.check(st == 200 and r.get("status") == "cancelada" and r.get("status_detail") == "cc_rejected_high_risk" and sem_valores(r),
            f"[recusa_seguranca] 200 cancelada com status_detail cc_rejected_high_risk (a tela mostra o texto da recusa por segurança — o "
            f"Vitest do Pagamentos.test.tsx) ({st} {r.get('status') or r.get('erro')} {r.get('status_detail')})")
    p.check(len(recusa) == 1 and recusa[0].get("resultado") == "com_device" and recusa[0].get("externo") == {"mp_status_detail": "cc_rejected_high_risk"}
            and str(recusa[0].get("ref") or "").isdigit(),
            f"[recusa_seguranca] o log: mp_cartao_recusado com_device, o código e o id do pagamento como ref ({len(recusa)} linha(s))")


def local_automatica_recusa() -> None:
    print("\n── automatica_recusa: o POST /preapproval 400 com o código SÓ na mensagem (o retrato de 14/10) → o código no log e na resposta")
    garantir_integracao()
    # revisão mpc 🟡2: a mensagem do cc_rejected_… e a da validação do cartão ("CC_VAL_433 Credit card validation has failed" → cc_val_433)
    for mensagem, codigo in (("cc_rejected_high_risk", "cc_rejected_high_risk"), ("CC_VAL_433 Credit card validation has failed", "cc_val_433")):
        base_do_caso("mercadopago_conta")
        W2.sim_cenario(preapproval_recusa=mensagem)
        (st, r), pedidos, log = janela(lambda: pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": "sim-card-APRO",
                                                                                "device_id": CTX["device"]}))
        post = ultimo_pedido(pedidos, "POST", "/preapproval")
        falhou = [x for x in linhas_do_log(log) if x.get("codigo") == "mp_assinatura_falhou"]
        p.check(st == 400 and r.get("erro") == "cartao_recusado" and r.get("status_detail") == codigo and "detalhe" not in r
                and bool((post or {}).get("device")) and sem_valores(r),
                f"[automatica_recusa · {codigo}] 400 cartao_recusado com status_detail {codigo} e SEM o texto do MP (o detalhe saiu); o POST "
                f"/preapproval levou o cabeçalho ({st} {r.get('erro')} {r.get('status_detail')})")
        p.check(len(falhou) == 1 and falhou[0].get("status") == 400 and falhou[0].get("resultado") == "com_device"
                and falhou[0].get("externo") == {"mp_status_detail": codigo},
                f"[automatica_recusa · {codigo}] o log: mp_assinatura_falhou 400, com_device e o mp_status_detail tirado da mensagem (14/10 "
                f"ficou {{}}) ({[{k: x.get(k) for k in ('status', 'resultado', 'externo')} for x in falhou]})")


def local_avulsa() -> None:
    print("\n── avulsa: a cobrança avulsa no cartão → o item com o id \"avulsa\" e o valor dela (revisão mpc ⚪8e)")
    garantir_integracao()
    base_do_caso("mercadopago_conta")
    av = W2.um(f"""insert into {S}.cobrancas (paciente_id, conta_id, nutricionista_id, criado_por, descricao, valor, vencimento, tipo, status, origem)
                    values ('{CTX['pac']}', '{CTX['conta']}', '{W2.CTX['dono_uid']}', '{W2.CTX['dono_uid']}', 'mpc e2e avulsa', 7.5, current_date,
                            'avulsa', 'aberta', 'teste_mpc_api') returning id::text as id""")["id"]
    (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", {**corpo_cartao(CTX["pac"], device=CTX["device"]), "cobranca_id": av}))
    post = ultimo_pedido(pedidos, "POST", "/v1/payments")
    erros = problemas_do_cartao(post, titular=True, documento=True, device=True, item_id="avulsa", valor=7.5)
    p.check(st == 200 and r.get("status") == "paga" and not erros,
            f"[avulsa] paga; o item com id avulsa e unit_price = o valor da avulsa (= transaction_amount) ({st} {r.get('status') or r.get('erro')}; "
            f"{'; '.join(erros) or 'certo'})")


def local_renova_com_device() -> None:
    print("\n── renova_com_device: o 401 da hora do uso → /users/me → renova → a nova tentativa leva o cabeçalho de novo (revisão mpc ⚪8e)")
    W2.integracao(SIM.VENDEDOR_A, origem="oauth")
    CTX["integracao"] = True
    base_do_caso("mercadopago_conta")
    W2.sim_post("/_expirar", {"vendedor": SIM.VENDEDOR_A})
    (st, r), pedidos, _ = janela(lambda: pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], device=CTX["device"])))
    posts = [x for x in pedidos if x.get("metodo") == "POST" and str(x.get("caminho") or "").split("?")[0] == "/v1/payments"]
    renovou = any(str(x.get("caminho") or "").split("?")[0] == "/oauth/token" and x.get("status") == 200 for x in pedidos)
    p.check(st == 200 and r.get("status") == "paga" and renovou and len(posts) == 2 and [x.get("token") for x in posts] == ["morto", "vivo"]
            and all(x.get("device") for x in posts) and [x.get("status") for x in posts] == [401, 201],
            f"[renova_com_device] 401 → renova → o 2º POST /v1/payments com o token novo E o cabeçalho ({st} {r.get('status') or r.get('erro')}; "
            f"os POSTs {[(x.get('token'), x.get('status'), x.get('device')) for x in posts]}; renovou {renovou})")


FUNCOES_LOCAL = {"physiq_avista": local_physiq_avista, "physiq_automatica": local_physiq_automatica, "conta_avista": local_conta_avista,
                 "conta_automatica": local_conta_automatica, "sem_device": local_sem_device, "device_ruim": local_device_ruim,
                 "dv_errado": local_dv_errado, "apk_antigo": local_apk_antigo, "avulsa": local_avulsa, "recusa_seguranca": local_recusa_seguranca,
                 "automatica_recusa": local_automatica_recusa, "renova_com_device": local_renova_com_device}


def conferir_log_da_rodada() -> None:
    """O log do Deno da rodada inteira: os valores de TESTE (o CPF, o CPF com o DV errado, o nome do titular e os devices) — 0 ocorrência."""
    if not LOG_DENO.exists():
        p.check(False, "o log do Deno da rodada não existe")
        return
    texto = log_desde(CTX.get("log_inicio", 0))
    n = ocorrencias(texto, CTX["valores"])
    linhas = linhas_do_log(texto)
    # no --local a rodada TEM linhas do log (as 2 recusas e a automática recusada): sem elas, a busca não provaria nada
    p.check(n == 0 and (len(linhas) > 0 or CTX["modo"] != "local"),
            f"o log do Deno da rodada ({len(texto) // 1024} KB, {len(linhas)} linha(s) do log da função) sem o CPF, o nome e o device de teste: "
            f"{n} ocorrência(s)")


# ───────────────────────── o MP de verdade (sandbox / F5) ─────────────────────────

def ler_600(nome: str) -> dict:
    arq = CASA / nome
    if not arq.exists() or (arq.stat().st_mode & 0o077):
        raise RuntimeError(f"~/{nome}: falta ou não está 600")
    return json.loads(arq.read_text(encoding="utf-8"))


def vendedor_de_teste(fonte: str = "oauth") -> dict:
    """As credenciais do vendedor de TESTE. "oauth" (o padrão — a revisão mpc 🟡1: o do roteiro da F5): o par do OAuth pela aplicação real (a
    W2; o sandbox recusa com 2034 "Invalid users involved", medido em 15/10). "app": as de PRODUÇÃO da aplicação PRÓPRIA dele (o painel dele,
    15/10; o user id pelo /users/me — o MP recusa com 401 "Unauthorized use of live credentials" até alguém ativar). Nada aqui é a credencial
    da conta real do Physiq."""
    if fonte == "app":
        d = ler_600(ARQ_VENDEDOR_APP)
        st, eu, _ = W2.rede("GET", f"{MP}/users/me", None, {"Authorization": f"Bearer {d['access_token']}"}, timeout=60)
        if st != 200 or not isinstance(eu, dict) or not eu.get("id"):
            raise RuntimeError(f"/users/me com o token da aplicação do vendedor de teste: {st}")
        return {"token": d["access_token"], "refresh": None, "user_id": int(eu["id"]), "public_key": d["public_key"], "par": "aplicacao_propria"}
    d = ler_600(ARQ_VENDEDOR_OAUTH)   # o "oauth"
    for chave in ("teste", "producao"):
        par = d.get(chave) or {}
        if par.get("access_token") and par.get("public_key") and par.get("user_id"):
            return {"token": par["access_token"], "refresh": par.get("refresh_token"), "user_id": int(par["user_id"]), "public_key": par["public_key"],
                    "par": chave}
    raise RuntimeError(f"~/{ARQ_VENDEDOR_OAUTH} sem um par completo")


def mp_vendedor(metodo: str, caminho: str, corpo=None, vend: dict | None = None) -> tuple[int, dict]:
    cab = {"Authorization": f"Bearer {(vend or CTX['vendedor'])['token']}"}
    if metodo == "POST":
        cab["X-Idempotency-Key"] = str(uuid.uuid4())
    st, r, _ = W2.rede(metodo, f"{MP}{caminho}", corpo, cab, timeout=60)
    return st, (r if isinstance(r, dict) else {})


def conferir_vendedor() -> str:
    """O /users/me do vendedor de TESTE (só booleanos na tela) → o e-mail do comprador de TESTE (a regra do e2e/w2/prova_public_key.py)."""
    st, eu = mp_vendedor("GET", "/users/me")
    teste = "test_user" in (eu.get("tags") or [])
    p.check(st == 200 and teste and int(eu.get("id") or 0) == CTX["vendedor"]["user_id"] and eu.get("site_id") == "MLB",
            f"o vendedor de TESTE responde no /users/me: {st}, usuário de teste {teste}, o id do par {int(eu.get('id') or 0) == CTX['vendedor']['user_id']}, "
            f"site {eu.get('site_id')} (o par '{CTX['vendedor']['par']}')")
    comprador = ler_600(ARQ_COMPRADOR)
    import prova_public_key as PROVA  # noqa: PLC0415 — a regra do e-mail do comprador (o POST /users/test não devolve o e-mail)
    email, regra = PROVA.email_do_comprador(eu, comprador)
    print(f"   o e-mail do comprador de teste pela regra: {regra}", flush=True)
    return email


def integracao_do_vendedor(chave: str) -> None:
    """A integração do MP da conta do prof2 com o par do vendedor de TESTE, cifrado com `chave` (a da rodada no --local; a das funções no
    F5) e o AD da conta — como a confirmação grava (o servidor, só no staging). mp_origem teste_local: nada renova sozinho."""
    v, conta = CTX["vendedor"], CTX["conta"]
    acc = W2.cifrar(v["token"], W2.dado_associado(conta, "access"), chave)
    ref = W2.cifrar(v["refresh"], W2.dado_associado(conta, "refresh"), chave) if v.get("refresh") else None
    W2.sql(f"""insert into {S}.recebimento_integracoes (conta_id, provedor, status, mp_user_id, mp_apelido, mp_public_key, mp_access_token,
              mp_refresh_token, mp_expira_em, mp_teste, mp_origem, mp_renovar_tentativas, mp_erro, mp_conferido_em, conectado_em)
            values ('{conta}', 'mercadopago', 'ativa', {int(v['user_id'])}, 'TESTE (mpc)', {W2.lit(v['public_key'])}, {W2.lit(acc)}, {W2.lit(ref)},
                    now() + interval '170 days', true, 'teste_local', 0, null, now(), now())""")
    CTX["integracao"] = True


def device_de_verdade(canal: str) -> str | None:
    """O id do aparelho de verdade: o security.js numa página em branco (como a folha de pagar põe), lido de window.MP_DEVICE_SESSION_ID —
    só o tamanho e o alfabeto na tela. O navegador fecha no fim (o pid na tela)."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415
    html = f'<!doctype html><html><head><script src="{SEGURANCA_JS}" view="checkout"></script></head><body>mpc</body></html>'
    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=canal, headless=True)
        try:
            pg = nav.new_context(user_agent=UA, locale="pt-BR").new_page()
            pg.set_content(html, wait_until="load")
            fim = time.time() + 15
            while time.time() < fim:
                v = pg.evaluate("() => typeof window.MP_DEVICE_SESSION_ID === 'string' ? window.MP_DEVICE_SESSION_ID : null")
                if v:
                    print(f"   o id do aparelho de verdade (security.js): {len(v)} caracteres, no formato {bool(DEVICE_RX.fullmatch(v))}", flush=True)
                    return v if DEVICE_RX.fullmatch(v) else None
                pg.wait_for_timeout(250)
        finally:
            nav.close()
    return None


def cartao_aceito(public_key: str) -> tuple[str, str] | None:
    """A bandeira de TESTE que a chave do vendedor acha pelo BIN (o que o Brick consulta): (payment_method_id, número)."""
    for metodo, numero in CARTOES_TESTE:
        q = urllib.parse.urlencode({"public_key": public_key, "bins": numero[:6], "marketplace": "NONE", "status": "active"})
        st, r, _ = W2.rede("GET", f"{MP}/v1/payment_methods/search?{q}", timeout=60)
        achados = [x.get("id") for x in ((r or {}).get("results") or [])] if isinstance(r, dict) else []
        if st == 200 and achados:
            return str(achados[0]), numero
    return None


def token_do_cartao(public_key: str, titular: str = "APRO") -> str | None:
    """O card token do cartão de TESTE (a bandeira que a chave aceita) pela chave pública do vendedor (o que o Brick faz) — o titular decide o
    resultado no sandbox. CTX["metodo"] = a bandeira (o payment_method_id do pedido)."""
    aceito = cartao_aceito(public_key)
    if not aceito:
        print("   nenhuma bandeira de teste achada pelo BIN com a chave do vendedor", flush=True)
        return None
    CTX["metodo"], numero = aceito
    st, r, _ = W2.rede("POST", f"{MP}/v1/card_tokens?public_key={urllib.parse.quote(public_key)}",
                       {"card_number": numero, **VALIDADE_TESTE, "cardholder": {"name": titular, "identification": {"type": "CPF", "number": CPF_TESTE}}},
                       timeout=60)
    ok = st in (200, 201) and isinstance(r, dict) and bool(r.get("id"))
    print(f"   o cartão de teste: {CTX['metodo']}; o card token {'saiu' if ok else 'NÃO saiu (' + str(st) + ')'}", flush=True)
    return r.get("id") if ok else None


def pagamento_da_rodada(cid: str | None, log: str) -> str | None:
    """O id do pagamento no MP: o da linha (paga ou recusada) ou, se a função desfez a linha (o MENOR 20), o ref do log."""
    if cid:
        pid = W2.cobranca(cid).get("mp_payment_id")
        if pid:
            return str(pid)
    for x in linhas_do_log(log):
        if x.get("codigo") in ("mp_cartao_modo_errado", "mp_cartao_recusado") and str(x.get("ref") or "").isdigit():
            return str(x["ref"])
    return None


def estornar(pid: str) -> None:
    """O pagamento aprovado da rodada volta (token do vendedor de TESTE): nada fica cobrado nem no sandbox."""
    st, r = mp_vendedor("GET", f"/v1/payments/{pid}")
    if r.get("status") != "approved":
        p.check(True, f"o pagamento da rodada não precisa de estorno (status {r.get('status')})")
        return
    st, r = mp_vendedor("POST", f"/v1/payments/{pid}/refunds", {})
    st2, depois = mp_vendedor("GET", f"/v1/payments/{pid}")
    p.check(st in (200, 201) and depois.get("status") == "refunded", f"o estorno pelo token do vendedor de TESTE: {st} → {depois.get('status')}")


def log_publicado(desde: str, acao: str, codigos: tuple[str, ...], esperar_s: float = 150) -> list[dict]:
    """O log da pagamentos-aluno PUBLICADA (o endpoint de logs da Management API, só leitura; o molde do prova_real.py): as linhas do schema
    staging com a ação e os códigos, desde `desde` (UTC). O log chega com atraso: tenta a cada 15 s até `esperar_s`."""
    fim = time.time() + esperar_s
    while True:
        sql = ("SELECT timestamp AS t, event_message FROM logs WHERE source = 'function_logs' AND "
               "positionCaseInsensitive(event_message, '\"funcao\":\"pagamentos-aluno\"') > 0 ORDER BY t DESC LIMIT 200")
        q = urllib.parse.urlencode({"sql": sql, "iso_timestamp_start": desde, "iso_timestamp_end": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
        st, r, _ = W2.rede("GET", f"https://api.supabase.com/v1/projects/{B.PRINCIPAL_REF}/analytics/endpoints/logs?{q}", None,
                           {"Authorization": f"Bearer {B.ler('.pc-pat')}"}, timeout=90)
        texto = "\n".join(str(x.get("event_message") or "") for x in ((r or {}).get("result") or [])) if isinstance(r, dict) else ""
        linhas = [x for x in linhas_do_log(texto) if x.get("schema") == S and x.get("acao") == acao and x.get("codigo") in codigos]
        if linhas or time.time() >= fim:
            return linhas
        time.sleep(15)


def pagas_na_rodada() -> int:
    return W2.um(f"""select count(*)::int as n from {S}.cobrancas where paciente_id = '{CTX['pac']}' and status = 'paga'
                       and created_at >= {W2.lit(CTX['t0'])}::timestamptz""")["n"]


def caso_mp_real(modo: str, rotulo: str, *, device: bool = True, antigo: bool = False) -> None:
    """O cartão com o MP de VERDADE (sandbox): a função local (--local --sandbox) ou a PUBLICADA (F5). O que se prova com o sandbox que NÃO
    paga (15/10: o par do OAuth da W2 → 2034; a aplicação própria → 401) — a revisão mpc 🟡1: a função nunca responde 500 (cartao_recusado
    400 ou mp_error 502), o motivo vai ao log (mp_cartao_falhou com as causas do sandbox e com/sem device) e nada fica pago. Se o MP um dia
    aprovar, vale o aceite inteiro: o GET mostra os campos novos e o pagamento volta (o estorno pelo token do vendedor)."""
    print(f"\n── {rotulo}: o cartão no MP de VERDADE ({'o MP do Physiq' if modo == 'mercadopago' else 'o MP do personal'}; "
          f"{'o corpo de antes (o APK antigo)' if antigo else 'o titular, o CPF de teste e ' + ('o aparelho' if device else 'SEM o aparelho')})")
    base_do_caso(modo)
    tok = token_do_cartao(CTX["vendedor"]["public_key"])
    if not tok:
        p.check(False, f"[{rotulo}] o card token do cartão de teste (a chave pública do vendedor) não saiu — o caso para aqui")
        return
    desde = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 5))
    pos = tamanho_do_log() if CTX["modo"] != "staging" else 0
    st, r = pedir(ALUNO, "aluno_mp_cartao", corpo_cartao(CTX["pac"], cartao=tok, titular=("APRO", "Mpcteste"), device=CTX["device"] if device else None,
                                                        antigo=antigo, metodo=CTX.get("metodo") or METODO_TESTE))
    pago = st == 200 and r.get("status") == "paga"
    if pago:
        pid = pagamento_da_rodada((r.get("cobranca") or {}).get("id"), "")
        stg, pay = mp_vendedor("GET", f"/v1/payments/{pid}") if pid else (0, {})
        res = resumo_do_pagamento(pay)
        CTX.setdefault("evidencia_sandbox", {})[rotulo] = {"http_get": stg, **res}
        p.check(stg == 200 and (aceite_ok(res) if not antigo else res.get("itens") == 1 and res.get("statement_descriptor") == DESCRITOR),
                f"[{rotulo}] o MP APROVOU: o GET (token do vendedor) mostra o item ({res['item_5_campos']}), o descritor "
                f"{res['statement_descriptor']!r} e o tipo do documento {res['payer_identification_type']!r} (o número não impresso)")
        if pid:
            estornar(pid)
        return
    resultado = "com_device" if device else "sem_device"
    linhas = (linhas_do_log(log_desde(pos)) if CTX["modo"] != "staging"
              else log_publicado(desde, "aluno_mp_cartao", ("mp_cartao_falhou", "mp_cartao_modo_errado", "mp_cartao_recusado", "excecao")))
    falhou = [x for x in linhas if x.get("codigo") == "mp_cartao_falhou"]
    causas = (falhou[-1].get("externo") or {}).get("mp_causas") if falhou else None
    p.check(st != 500 and r.get("erro") in ("cartao_recusado", "mp_error") and "detalhe" not in r and pagas_na_rodada() == 0,
            f"[{rotulo}] o sandbox recusou e a função NÃO deu 500: {st} {r.get('erro')} (status_detail {r.get('status_detail')}); sem o texto do "
            f"MP na resposta; nada pago na rodada")
    p.check(bool(falhou) and falhou[-1].get("resultado") == resultado and bool(causas) and not [x for x in linhas if x.get("codigo") == "excecao"],
            f"[{rotulo}] o log: mp_cartao_falhou com {resultado} e as causas do sandbox {causas} "
            f"({'= o 2034 esperado com o par da W2' if causas == [2034] else 'OUTRA causa — anotar' if causas else 'sem a linha'}; "
            f"{len(linhas)} linha(s) da ação)")


def caso_automatica_real(rotulo: str = "automatica") -> None:
    """A automática com cartão no MP de VERDADE (a função publicada, F5): só o cabeçalho a mais (decisão 6). O sandbox não tem automática com
    cartão: o pendente (o checkout do MP — a rede do sandbox) ou cartao_recusado — nunca 500; o log com o resultado; o pendente criado no MP é
    cancelado na hora pelo token do vendedor."""
    print(f"\n── {rotulo}: a automática com cartão no MP de VERDADE (o cabeçalho do aparelho; o corpo de antes)")
    base_do_caso("mercadopago_conta")
    tok = token_do_cartao(CTX["vendedor"]["public_key"])
    desde = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 5))
    pos = tamanho_do_log() if CTX["modo"] != "staging" else 0
    st, r = pedir(ALUNO, "aluno_mp_assinar", {"paciente_id": CTX["pac"], "card_token": tok or "sem-token", "device_id": CTX["device"]})
    a = W2.assinatura_viva()
    if a.get("mp_preapproval_id"):
        stc, c = mp_vendedor("PUT", f"/preapproval/{a['mp_preapproval_id']}", {"status": "cancelled"})
        print(f"   a automática criada no MP (status {a.get('status')}) cancelada pelo token do vendedor: {stc} {c.get('status')}", flush=True)
    p.check(st != 500 and (st == 200 or r.get("erro") in ("cartao_recusado", "mp_error")),
            f"[{rotulo}] nunca 500: {st} {r.get('erro') or a.get('status')} (sandbox {r.get('sandbox')}; status_detail {r.get('status_detail')})")
    if st != 200:
        linhas = (linhas_do_log(log_desde(pos)) if CTX["modo"] != "staging"
                  else log_publicado(desde, "aluno_mp_assinar", ("mp_assinatura_falhou", "excecao")))
        falhou = [x for x in linhas if x.get("codigo") == "mp_assinatura_falhou"]
        p.check(bool(falhou) and falhou[-1].get("resultado") == "com_device",
                f"[{rotulo}] o log: mp_assinatura_falhou com_device ({[{k: x.get(k) for k in ('status', 'resultado', 'externo')} for x in falhou][-1:]})")


def sandbox_physiq() -> None:
    caso_mp_real("mercadopago", "sandbox_physiq")


def sandbox_conta() -> None:
    caso_mp_real("mercadopago_conta", "sandbox_conta")


# ───────────────────────── F5 (a função PUBLICADA) — o roteiro da revisão mpc 🟡1 ─────────────────────────

def staging_recusado_com_device() -> None:
    caso_mp_real("mercadopago_conta", "recusado_com_device")


def staging_recusado_sem_device() -> None:
    caso_mp_real("mercadopago_conta", "recusado_sem_device", device=False, antigo=True)


def staging_automatica() -> None:
    caso_automatica_real("automatica")


FUNCOES_STAGING = {"recusado_com_device": staging_recusado_com_device, "recusado_sem_device": staging_recusado_sem_device,
                   "automatica": staging_automatica}


# ───────────────────────── seco ─────────────────────────

def seco() -> int:
    print("── seco: nada sai de 127.0.0.1 — as conferências deste arquivo e o simulador com os cenários da mp-cartao")
    global p
    W2.carregar_placar()
    p = W2.p
    dev = device_de_teste()
    p.check(bool(DEVICE_RX.fullmatch(dev)) and len(dev) > 200, f"seco: o device de teste no formato da função ({len(dev)} caracteres)")
    c = corpo_cartao("p1", device=dev)
    p.check(c["pagador"] == {"nome": "Joaquina Brandão Mpcteste", "documento": {"tipo": "CPF", "numero": CPF_TESTE}} and c["device_id"] == dev
            and set(corpo_cartao("p1", antigo=True)) == {"paciente_id", "card_token", "payment_method_id", "installments"},
            "seco: o corpo da tela (pagador + device_id) e o do APK de antes (sem os 2)")
    bom = {"device": True, "corpo": {"transaction_amount": 10, "token": OCULTO, "description": "Mensalidade", "installments": 1,
                                     "payer": {"email": PAGADOR_SIM, "first_name": OCULTO, "last_name": OCULTO, "identification": {"type": "CPF", "number": OCULTO}},
                                     "external_reference": "x", "notification_url": "y", "statement_descriptor": "PHYSIQ", "payment_method_id": "master",
                                     "additional_info": {"items": [{"id": "mensalidade", "title": "Mensalidade", "category_id": "services", "quantity": 1,
                                                                    "unit_price": 10}], "payer": {"first_name": OCULTO, "last_name": OCULTO}}}}
    ruins = {
        "sem cabeçalho": {**bom, "device": False},
        "sem descritor": {**bom, "corpo": {k: v for k, v in bom["corpo"].items() if k != "statement_descriptor"}},
        "item com 4 campos": {**bom, "corpo": {**bom["corpo"], "additional_info": {"items": [{"id": "mensalidade", "title": "x", "quantity": 1,
                                                                                             "unit_price": 10}], "payer": {"first_name": OCULTO, "last_name": OCULTO}}}},
        "CPF fora": {**bom, "corpo": {**bom["corpo"], "payer": {"email": PAGADOR_SIM, "first_name": OCULTO, "last_name": OCULTO}}},
        "campo a mais": {**bom, "corpo": {**bom["corpo"], "device_id": "x"}},
        "valor ≠ item × quantidade": {**bom, "corpo": {**bom["corpo"], "transaction_amount": 11}},
    }
    p.check(problemas_do_cartao(bom, titular=True, documento=True, device=True) == []
            and all(problemas_do_cartao(v, titular=True, documento=True, device=True) for v in ruins.values())
            and problemas_do_cartao(None, titular=True, documento=True, device=True),
            f"seco: a conferência do pedido do cartão aceita o certo e acusa os {len(ruins)} errados ({', '.join(ruins)}) e o que não chegou")
    auto = {"device": True, "corpo": {k: (OCULTO if k == "card_token_id" else "authorized" if k == "status" else "x") for k in CHAVES_AUTOMATICA}}
    p.check(problemas_da_automatica(auto, device=True) == [] and problemas_da_automatica({**auto, "device": False}, device=True)
            and problemas_da_automatica({**auto, "corpo": {**auto["corpo"], "payer": {}}}, device=True),
            "seco: a conferência da automática (o corpo de antes + só o cabeçalho)")
    log = "\n".join(['lixo', json.dumps({"nivel": "aviso", "funcao": "pagamentos-aluno", "codigo": "mp_cartao_recusado", "resultado": "com_device"}),
                     json.dumps({"nivel": "erro", "funcao": "outra", "codigo": "x"}), "{quebrado"])
    p.check([x["codigo"] for x in linhas_do_log(log)] == ["mp_cartao_recusado"] and ocorrencias(f"a {CPF_TESTE} b {dev}", {CPF_TESTE, dev}) == 2
            and ocorrencias("nada", {CPF_TESTE}) == 0, "seco: a leitura do log (só as linhas da função) e a busca dos valores de teste")
    pay = {"status": "approved", "status_detail": "accredited", "live_mode": False, "statement_descriptor": "PHYSIQ",
           "payer": {"identification": {"type": "CPF", "number": CPF_TESTE}},
           "additional_info": {"items": [{"id": "mensalidade", "title": "Mensalidade", "category_id": "services", "quantity": "1", "unit_price": "10.0"}],
                               "payer": {"first_name": "APRO"}}}
    res = resumo_do_pagamento(pay)
    p.check(aceite_ok(res) and CPF_TESTE not in json.dumps(res) and not aceite_ok(resumo_do_pagamento({**pay, "statement_descriptor": None})),
            "seco: o resumo do GET do pagamento (quantidade e valor como texto também) sem o número do documento; o aceite acusa o descritor faltando")
    # o simulador de verdade (na memória, porta livre de 127.0.0.1): o cabeçalho só como veio/não veio e o titular mascarado
    srv = SIM.servidor(0)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    porta = srv.server_address[1]
    try:
        SIM.zerar()
        par = SIM.emitir_par(SIM.VENDEDOR_A)
        corpo = {"transaction_amount": 10, "token": "sim-card-APRO", "installments": 1, "payer": {"email": PAGADOR_SIM, "first_name": TITULAR[0],
                 "last_name": TITULAR[1], "identification": {"type": "CPF", "number": CPF_TESTE}}, "statement_descriptor": "PHYSIQ"}
        st, _, _ = W2.rede("POST", f"http://127.0.0.1:{porta}/v1/payments", corpo, {"Authorization": f"Bearer {par['access']}", "X-meli-session-id": dev})
        st2, ped, _ = W2.rede("GET", f"http://127.0.0.1:{porta}/_pedidos")
        texto = json.dumps(ped, ensure_ascii=False)
        p.check(st == 201 and isinstance(ped, list) and ped[-1].get("device") is True and ocorrencias(texto, {CPF_TESTE, TITULAR[0], dev}) == 0,
                f"seco: o simulador registra o cabeçalho só como veio ({(ped or [{}])[-1].get('device') if isinstance(ped, list) else '?'}) e "
                f"mascara o titular e o documento ({st}/{st2})")
    finally:
        srv.shutdown()
        srv.server_close()
    p.check(set(FUNCOES_LOCAL) == set(CASOS_LOCAL) and set(FUNCOES_STAGING) == set(CASOS_STAGING),
            f"seco: cada caso tem função ({len(CASOS_LOCAL)} do --local, {len(CASOS_SANDBOX)} do --sandbox, {len(CASOS_STAGING)} do F5)")
    return p.fim()


# ───────────────────────── main ─────────────────────────

def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq mp-cartao — E2E de servidor da aprovação do cartão no Mercado Pago (staging)")
    ap.add_argument("--local", action="store_true", help="a pagamentos-aluno no Deno local (contra o banco do staging) + o simulador do MP")
    ap.add_argument("--sandbox", action="store_true", help="com --local: o MP de VERDADE em sandbox com o vendedor e o comprador de TESTE")
    ap.add_argument("--casos", default=None, help="lista separada por vírgula (padrão: todos do modo)")
    ap.add_argument("--canal", default="msedge", help="--sandbox: o navegador do id do aparelho de verdade")
    ap.add_argument("--sem-device-real", action="store_true", help="--sandbox: um id no formato em vez do de verdade do security.js")
    ap.add_argument("--vendedor", choices=("oauth", "app"), default="oauth",
                    help="o vendedor de teste do MP de verdade: o par do OAuth da W2 (o padrão; 2034) ou a aplicação própria dele (401)")
    ap.add_argument("--sinal", default=None, help="o arquivo-sinal da trava do banco do staging (sem ele não começa; sumiu → para antes do caso)")
    modo_ = ap.add_mutually_exclusive_group()
    modo_.add_argument("--seco", action="store_true")
    modo_.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.sandbox and not a.local:
        ap.error("--sandbox só com --local (o F5 é o modo sem --local)")
    if a.seco:
        return seco()
    CTX["modo"] = ("sandbox" if a.sandbox else "local") if a.local else "staging"
    validos = CASOS_SANDBOX if a.sandbox else CASOS_LOCAL if a.local else CASOS_STAGING
    casos = [c.strip() for c in (a.casos or ",".join(validos)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        ap.error(f"casos deste modo: {', '.join(validos)}")
    carregar()
    pendente = ESTADO_ARQ.exists()
    if pendente:
        print(f"   a rodada anterior não terminou ({ESTADO_ARQ}): desfazendo antes", flush=True)
        desfazer()
        if ESTADO_ARQ.exists():
            return p.fim()
    if a.limpar:
        if not pendente:
            p.check(True, "nada a desfazer (sem estado pendente)")
        return p.fim()
    sinal = Path(a.sinal).expanduser() if a.sinal else None
    if sinal and not sinal.exists():
        print(f"   sem o sinal {sinal}: a rodada não começa", flush=True)
        return 3
    if not DENO.exists() and a.local:
        p.check(False, "falta o ~/.deno/bin/deno")
        return p.fim()
    if not W2.um(f"select to_regclass('{S}.mp_conexoes') is not null as ok")["ok"]:
        p.check(False, f"{S}: sem a W2 (mp_conexoes) — a rodada não começa")
        return p.fim()
    CTX["device"] = device_de_teste()
    CTX["valores"] |= {CPF_TESTE, CPF_DV_ERRADO, TITULAR[0], TITULAR[1].split()[-1], CTX["device"]}
    pagador = PAGADOR_SIM
    try:
        if CTX["modo"] in ("sandbox", "staging"):
            CTX["vendedor"] = vendedor_de_teste(a.vendedor)
            pagador = conferir_vendedor()
            if not a.sem_device_real:
                real = device_de_verdade(a.canal)
                if real:
                    CTX["device"] = real
                    CTX["valores"].add(real)
                p.check(True, f"o id do aparelho do caso: {'o de verdade do security.js' if real else 'um no formato (o de verdade não veio)'}")
        if a.local:
            subir_local(a.sandbox, pagador)
    except Exception as e:  # noqa: BLE001
        p.check(False, f"a rodada não começou: {type(e).__name__}: {str(e)[:300]}")
        descer_local()
        return p.fim()
    try:
        try:
            preparar()
            if CTX["modo"] == "sandbox":
                integracao_do_vendedor(W2.segredos_da_rodada()["chave"])
            elif CTX["modo"] == "staging":
                integracao_do_vendedor(W2.chave_do_servico())
        except Exception as e:  # noqa: BLE001
            p.check(False, f"a rodada não começou: {type(e).__name__}: {str(e)[:300]}")
            casos = []
        funcoes = {"sandbox_physiq": sandbox_physiq, "sandbox_conta": sandbox_conta} if a.sandbox else FUNCOES_LOCAL if a.local else FUNCOES_STAGING
        for nome in casos:
            if sinal and not sinal.exists():
                print(f"\n⏸️  o sinal {sinal.name} sumiu: parei antes do caso '{nome}'", flush=True)
                break
            try:
                funcoes[nome]()
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
    finally:
        try:
            desfazer()
        finally:
            descer_local()
    if a.local:
        conferir_log_da_rodada()
    print(f"\n   logins da rodada: {len(CTX['logins'])} ({', '.join(sorted(CTX['logins'])) or 'nenhum'}) · sem logout (as sessões ficam para a "
          f"próxima, o B.token guarda 40 min)", flush=True)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
