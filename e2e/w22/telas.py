#!/usr/bin/env python3
"""Physiq W22 — E2E das telas do Painel › Mensagens (padrão da tela 6). Contexto limpo por caso; painel 1280 × 883 × 2 (= 2560 × 1766).

Positivo:
  personal   prof2 (personal, conta SÓ TREINO): a tela inteira — números, conexão (o WhatsApp de Configurações), as 6 automáticas
             nascendo desligadas + o aviso do plano, o histórico (enviada · falhou · cancelada) e o número do menu = falhas novas do banco.
  qr         ele pede a conexão: a tela espera o agente e mostra o QR (no local o QR é simulado na resposta da função; no staging o QR
             é o que o agente do celular publica de verdade — 1 vez, conta de teste — e ele cancela em seguida).
  conectado  com a conexão simulada na resposta da função (o banco segue "desconectado" — nada pode sair): liga 1 automática + o horário
             e SALVA de verdade (profiles.config.whatsapp no banco), o texto com a prévia, o teste e o Reenviar simulados.
  fora       a batida do celular de 15 min atrás (resposta do whatsapp_resumo trocada): a faixa "fora do ar" aparece.
  limpar     "Limpar falhas" de verdade: o número do menu some e o filtro "Com falha" esvazia; o histórico continua com "Falhou".
  dono       Lucas (dono da W13): "Toda a equipe" mostra a mensagem do Bruno (do WhatsApp de Bruno), sem Reenviar.
  nutri      a nutri do legado: a MESMA config do site antigo (horário 08:00, 2 momentos, o texto próprio da véspera) e o histórico.
  rotas      /whatsapp (rota do Nutri) → /painel/mensagens.
Negativo:
  membro     Bruno (2º personal): sem o seletor da equipe; só a mensagem dele (não a do Lucas).
  aluno      um aluno não abre o Painel › Mensagens.

Uso: python3 e2e/w22/telas.py --base http://localhost:5173 --prefixo local [--casos personal,qr,...]
     (staging: --base https://physiqcalc-staging.vercel.app --prefixo staging --qr-real). A massa: python3 e2e/w22/massa.py (antes) e
     python3 e2e/w22/massa.py --limpar (no fim).
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import struct
import sys
import time
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p, q = B.p, B.q
CASOS: dict[str, object] = {}
ESTADO: dict = {}
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-schema",
        "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json"}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def m() -> dict:
    return ESTADO["massa"]


def qr_simulado() -> str:
    """Um PNG preto e branco (quadriculado) só para a tela do local — o QR de verdade é o que o agente publica no staging."""
    n, esc = 29, 8
    linhas = []
    for y in range(n * esc):
        linha = bytearray([0])
        for x in range(n * esc):
            cx, cy = x // esc, y // esc
            canto = (cx < 7 and cy < 7) or (cx >= n - 7 and cy < 7) or (cx < 7 and cy >= n - 7)
            preto = ((cx % 6 in (0, 6)) or (cy % 6 in (0, 6))) if canto else ((cx * 7 + cy * 13 + cx * cy) % 3 == 0)
            linha.append(0 if preto else 255)
        linhas.append(bytes(linha))
    cru = b"".join(linhas)
    def bloco(tipo: bytes, dados: bytes) -> bytes:
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", n * esc, n * esc, 8, 0, 0, 0, 0)) + bloco(b"IDAT", zlib.compress(cru)) + bloco(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(png).decode()


def abrir(nav, nome: str, conta: str, rota: str = "/painel/mensagens", esperar: str = "[data-pagina-mensagens]", antes=None):
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=True)
    if antes:
        antes(c)
    c.entrar(conta, rota)
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem(esperar), 90)
    p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
    return c


def pronto(c, timeout: float = 45) -> bool:
    """A página carregou tudo: conexão (não carregando), números, automáticas e o histórico."""
    return c.esperar(lambda: c.pg.evaluate("""() => {
        const cx = document.querySelector('[data-card-conexao]');
        const k = document.querySelector('[data-kpis-mensagens]');
        const d = document.querySelector('[data-card-disparos]');
        const h = document.querySelector('[data-card-historico]');
        return !!cx && cx.getAttribute('data-whatsapp-carregando') === '0' && !!k && !k.getAttribute('data-estado')
          && !!d && !d.getAttribute('data-estado') && !!h && h.getAttribute('data-atualizando') === '0'
          && !document.querySelector('[data-card-historico] [data-estado="carregando"]');
    }"""), timeout)


def sem_toast(c, timeout: float = 9) -> None:
    c.esperar(lambda: c.pg.locator("[data-sonner-toast]").count() == 0, timeout)


def numero_do_menu(c) -> int:
    loc = c.pg.locator('[data-nav="/painel/mensagens"] [data-contador]')
    return int(loc.first.inner_text().strip()) if loc.count() else 0


def falhas_no_banco(conta: str) -> int:
    st, r = B.rpc(conta, "whatsapp_resumo", {"p_conta": None})
    assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
    return int(r["falhas"])


def simular_conexao(c, status: str = "conectado", qr_depois: bool = False) -> dict:
    """Troca SÓ a resposta da função whatsapp-conectar neste navegador: o banco segue como está (desconectado) — nada pode sair."""
    estado = {"status": status, "chamadas": [], "qr": qr_depois}
    png = qr_simulado()

    def tratar(route) -> None:
        if route.request.method == "OPTIONS":
            route.fulfill(status=200, headers=CORS, body="ok")
            return
        try:
            acao = (json.loads(route.request.post_data or "{}") or {}).get("acao", "status")
        except Exception:  # noqa: BLE001
            acao = "status"
        estado["chamadas"].append(acao)
        if acao == "teste":
            route.fulfill(status=200, headers=CORS, body=json.dumps({"mensagem": {"id": "simulado", "status": "pendente"}, "repetida": False}))
            return
        if acao == "status":
            # SÓ o status vai à função de verdade (lê/cria a linha 'desconectado'); conectar/desconectar NUNCA saem deste navegador
            resp = route.fetch()
            estado["real"] = (resp.json() or {}).get("instancia") or estado.get("real") or {}
        elif acao not in ("conectar", "desconectar"):
            route.fulfill(status=400, headers=CORS, body='{"error": "acao_invalida"}')
            return
        inst = dict(estado.get("real") or {"id": "simulada", "numero_e164": m()["numero"]})
        agora = dt.datetime.now(dt.timezone.utc).isoformat()
        if acao == "conectar":
            estado["status"] = "aguardando_qr"
        elif acao == "desconectar":
            estado["status"] = "desconectado"
        inst = {**inst, "status": estado["status"], "numero_conectado": m()["numero"] if estado["status"] == "conectado" else None,
                "qr_code": png if estado["status"] == "aguardando_qr" and estado["qr"] and len(estado["chamadas"]) > 2 else None,
                "qr_atualizado_em": agora if estado["status"] == "aguardando_qr" else None, "ultimo_ping": agora}
        route.fulfill(status=200, headers=CORS, body=json.dumps({"instancia": inst}))
    c.ctx.route("**/functions/v1/whatsapp-conectar", tratar)
    return estado


# ───────────────────────── casos ─────────────────────────

@caso
def caso_personal(nav) -> None:
    c = abrir(nav, "personal", "prof2")
    p.check(pronto(c), "[personal] a página inteira carregou (conexão, números, automáticas e histórico)")
    cx = c.pg.locator("[data-card-conexao]")
    p.check(cx.get_attribute("data-whatsapp-situacao") == "desconectado", f"[personal] conexão: desconectado ({cx.get_attribute('data-whatsapp-situacao')})")
    p.check("+55 (00) 90000-0099" in (c.pg.locator("[data-numero-whatsapp]").inner_text() or ""), "[personal] o WhatsApp de Configurações › Perfil aparece")
    p.check(c.pg.locator("[data-disparo]").count() == 7, "[personal] as 6 automáticas + o aviso do plano")
    desligadas = c.pg.evaluate("""() => [...document.querySelectorAll('[data-toggle-disparo]')].every(b => b.getAttribute('aria-checked') === 'false' && b.disabled)""")
    p.check(desligadas and c.pg.locator("[data-toggle-geral]").is_disabled(), "[personal] tudo nascendo DESLIGADO e travado até conectar")
    p.check(c.pg.locator("[data-mensagem]").count() == 5, f"[personal] o histórico da fila dele: {c.pg.locator('[data-mensagem]').count()} mensagens")
    chips = c.pg.evaluate("() => [...document.querySelectorAll('[data-status-msg]')].map(e => e.getAttribute('data-status-msg'))")
    p.check(set(chips) == {"enviada", "falhou", "cancelada"}, f"[personal] enviada · falhou · cancelada no histórico ({chips})")
    banco = falhas_no_banco("prof2")
    c.esperar(lambda: numero_do_menu(c) == banco, 20)
    p.check(banco == 1 and numero_do_menu(c) == 1, f"[personal] número do menu (violeta) = falhas novas do banco: menu {numero_do_menu(c)} = banco {banco}")
    destaque = c.pg.evaluate("""() => { const e = document.querySelector('[data-nav="/painel/mensagens"] [data-contador]'); return e ? getComputedStyle(e).backgroundColor : ''; }""")
    p.check("139, 92, 246" in destaque, f"[personal] o número do menu é o violeta da tela 6 ({destaque})")
    p.check(c.pg.locator("[data-kpis-mensagens]").get_attribute("data-falhas") == "1", "[personal] o KPI 'Com falha' = o número do menu")
    p.check(c.pg.locator('[data-mensagem-status="falhou"] [data-mensagem-erro]').inner_text().find("não tem WhatsApp") >= 0, "[personal] a falha mostra o motivo")
    p.check(not c.tem("[data-aviso-agente]"), "[personal] com o celular de envio no ar, nenhuma faixa de 'fora do ar'")
    sem_toast(c)
    c.print("tela6_mensagens_personal")
    c.pg.mouse.wheel(0, 900)
    c.pg.wait_for_timeout(700)
    c.print("tela6_mensagens_personal_historico")
    c.fim()


@caso
def caso_qr(nav) -> None:
    real = ESTADO["qr_real"]
    nome = "qr-real" if real else "qr"
    estado = None if real else {}

    def preparar(c):
        if not real:
            estado.update(simular_conexao(c, "desconectado", qr_depois=True))
    c = abrir(nav, nome, "prof2", antes=preparar)
    p.check(pronto(c), f"[{nome}] a página carregou")
    if real:
        B.garantir_seguro(["prof2"])
        p.check(B.pendentes_de(S, [B.uid("prof2")]) == 0, f"[{nome}] a fila do prof2 não tem NADA pendente (nada sairia mesmo se alguém lesse o QR)")
    c.pg.locator("[data-card-conexao] [data-btn-conectar]").click()
    p.check(c.esperar(lambda: c.tem("[data-aguardando-qr]") or c.tem("[data-qr-code]"), 20), f"[{nome}] pediu a conexão: 'Preparando o QR code…'")
    ok = c.esperar(lambda: c.tem("[data-qr-code] img"), 90 if real else 20)
    p.check(ok, f"[{nome}] o QR aparece ({'publicado pelo agente do celular' if real else 'simulado na resposta'})")
    if ok:
        src = c.pg.locator("[data-qr-code] img").get_attribute("src") or ""
        p.check(src.startswith("data:image/"), f"[{nome}] o QR é a imagem que o agente publica (dataURL, {len(src)} bytes)")
        p.check(c.pg.locator("[data-card-conexao] [data-btn-conectar]").get_attribute("data-btn-acao") == "Cancelar", f"[{nome}] o botão vira 'Cancelar'")
        sem_toast(c)
        c.print("qr_real" if real else "qr")
    c.pg.locator("[data-card-conexao] [data-btn-conectar]").click()
    p.check(c.esperar(lambda: c.pg.locator("[data-card-conexao]").get_attribute("data-whatsapp-situacao") == "desconectado", 30), f"[{nome}] cancelou: volta a desconectado")
    if real:
        st = B.sql_principal(f"select status, qr_code is null sem_qr from {S}.whatsapp_instancias where nutricionista_id = {q(B.uid('prof2'))}")
        p.check(bool(st) and st[0]["status"] == "desconectado" and st[0]["sem_qr"], f"[{nome}] no banco: desconectado e sem QR ({st})")
    c.fim()


@caso
def caso_conectado(nav) -> None:
    estado: dict = {}

    def preparar(c):
        estado.update(simular_conexao(c, "conectado"))
        c.ctx.route("**/rest/v1/rpc/whatsapp_reenviar", lambda r: r.fulfill(status=200, headers=CORS, body='{"ok": true}') if r.request.method != "OPTIONS"
                    else r.fulfill(status=200, headers=CORS, body="ok"))
    c = abrir(nav, "conectado", "prof2", antes=preparar)
    p.check(pronto(c), "[conectado] a página carregou")
    p.check(c.pg.locator("[data-card-conexao]").get_attribute("data-whatsapp-situacao") == "conectado", "[conectado] conexão simulada: conectado")
    p.check("Conectado com o número" in c.pg.locator("[data-texto-situacao]").inner_text(), "[conectado] mostra o número confirmado pelo WhatsApp")
    # o teste (simulado: a função do banco nunca recebe o pedido)
    c.pg.locator("[data-btn-teste]").click()
    p.check(c.esperar(lambda: "Mensagem de teste na fila" in c.texto(), 15) and "teste" in estado["chamadas"], "[conectado] Enviar teste → 'Mensagem de teste na fila' (simulado)")
    sem_toast(c)
    # liga as automáticas + a véspera + o horário e salva DE VERDADE
    c.pg.locator("[data-toggle-geral]").click()
    c.pg.locator('[data-toggle-disparo="lembrete_vespera"]').click()
    c.pg.select_option("[data-select-horario]", "08:00")
    p.check(c.pg.locator("[data-btn-salvar-disparos]").is_enabled(), "[conectado] o Salvar acende quando algo mudou")
    c.pg.locator('[data-btn-texto="lembrete_vespera"]').click()
    p.check(c.esperar(lambda: c.tem('[data-textarea="lembrete_vespera"]'), 10), "[conectado] abre o texto da véspera")
    area = c.pg.locator('[data-textarea="lembrete_vespera"]')
    p.check("Passando pra lembrar da sua consulta amanhã" in area.input_value(), "[conectado] o texto padrão é o do banco (o mesmo do site antigo)")
    p.check("Oi, Ana!" in c.pg.locator("[data-previa]").inner_text(), "[conectado] a prévia troca as variáveis")
    area.fill("Oi, {nome}! Amanhã ({data}) tem treino às {hora}. Bora!")
    c.pg.wait_for_timeout(400)
    c.print("texto_vespera")
    c.pg.locator("[data-btn-texto-pronto]").click()
    c.pg.wait_for_timeout(400)
    c.pg.locator("[data-btn-salvar-disparos]").click()
    ok = c.esperar(lambda: c.pg.locator("[data-card-disparos]").get_attribute("data-disparos-tocado") == "0"
                   and c.pg.locator("[data-card-disparos]").get_attribute("data-salvando-disparos") == "0", 30)
    cfg = B.sql_principal(f"select config -> 'whatsapp' w from {S}.profiles where id = {q(B.uid('prof2'))}")[0]["w"] or {}
    p.check(ok and cfg.get("ativo") is True and cfg.get("horario") == "08:00" and (cfg.get("momentos") or {}).get("lembrete_vespera") is True
            and "tem treino" in ((cfg.get("textos") or {}).get("lembrete_vespera") or ""), f"[conectado] salvou no banco (profiles.config.whatsapp): {cfg}")
    p.check(B.pendentes_de(S, [B.uid("prof2")]) == 0, "[conectado] nada entrou na fila (o banco segue desconectado)")
    sem_toast(c)
    c.pg.reload(wait_until="domcontentloaded")
    pronto(c)
    p.check(c.pg.locator('[data-toggle-disparo="lembrete_vespera"]').get_attribute("aria-checked") == "true"
            and c.pg.input_value("[data-select-horario]") == "08:00", "[conectado] depois de recarregar, a config salva volta")
    # o Reenviar (simulado: o banco recusaria — a instância de verdade está desconectada)
    c.pg.locator('[data-mensagem-status="falhou"] [data-btn-reenviar]').first.click()
    p.check(c.esperar(lambda: "Mensagem de volta na fila" in c.texto(), 15), "[conectado] Reenviar a falha → 'Mensagem de volta na fila' (simulado)")
    sem_toast(c)
    c.pg.mouse.wheel(0, -6000)
    c.pg.wait_for_timeout(600)
    c.print("tela6_mensagens_conectado")
    c.fim()


@caso
def caso_fora(nav) -> None:
    def preparar(c):
        def tratar(route) -> None:
            if route.request.method == "OPTIONS":
                route.continue_()
                return
            resp = route.fetch()
            corpo = resp.json()
            corpo["agente_ping"] = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=15)).isoformat()
            route.fulfill(response=resp, body=json.dumps(corpo))
        c.ctx.route("**/rest/v1/rpc/whatsapp_resumo", tratar)
    c = abrir(nav, "fora", "prof2", antes=preparar)
    pronto(c)
    ok = c.esperar(lambda: c.tem('[data-aviso-agente="fora"]'), 30)
    p.check(ok, "[fora] sem batida do celular há 15 min: a faixa 'fora do ar' aparece")
    if ok:
        t = c.pg.locator("[data-aviso-agente]").inner_text()
        p.check("fora do ar há 15 min" in t and "ficam na fila" in t, f"[fora] o texto: {t[:140]}")
    sem_toast(c)
    c.print("aviso_fora_do_ar")
    c.fim()


@caso
def caso_limpar(nav) -> None:
    c = abrir(nav, "limpar", "prof2")
    pronto(c)
    c.esperar(lambda: numero_do_menu(c) == 1, 20)
    p.check(numero_do_menu(c) == 1, "[limpar] antes: 1 falha nova no menu")
    c.pg.locator("[data-historico-filtro]").locator('[role="radio"]', has_text="Com falha").click()
    c.esperar(lambda: c.pg.locator("[data-card-historico]").get_attribute("data-historico-filtro") == "falhas" and c.pg.locator("[data-mensagem]").count() == 1, 20)
    p.check(c.pg.locator("[data-mensagem]").count() == 1, "[limpar] o filtro 'Com falha' = o número do menu (1)")
    c.pg.locator("[data-btn-limpar-falhas]").click()
    ok = c.esperar(lambda: numero_do_menu(c) == 0 and c.pg.locator("[data-mensagem]").count() == 0, 30)
    p.check(ok and falhas_no_banco("prof2") == 0, f"[limpar] 'Limpar falhas': o número do menu some e o filtro esvazia (banco {falhas_no_banco('prof2')})")
    c.pg.locator("[data-historico-filtro]").locator('[role="radio"]', has_text="Todas").click()
    c.esperar(lambda: c.pg.locator("[data-mensagem]").count() == 5, 20)
    p.check(c.pg.locator('[data-mensagem-status="falhou"]').count() == 1, "[limpar] o histórico continua mostrando a mensagem com 'Falhou'")
    sem_toast(c)
    c.pg.evaluate("document.querySelector('[data-card-historico]').scrollIntoView({block: 'start'})")
    c.pg.wait_for_timeout(600)
    c.print("falhas_limpas")
    c.fim()


@caso
def caso_dono(nav) -> None:
    c = abrir(nav, "dono", "w13-dono")
    pronto(c)
    p.check(c.tem('[role="radiogroup"][aria-label="De quem"]'), "[dono] o dono tem 'Minha fila · Toda a equipe'")
    minhas = c.pg.locator("[data-mensagem]").count()
    c.pg.locator('[role="radio"]', has_text="Toda a equipe").click()
    ok = c.esperar(lambda: c.pg.locator("[data-card-historico]").get_attribute("data-historico-escopo") == "conta"
                   and c.tem(f'[data-mensagem-aluno="{m()["carlos"]}"]'), 30)
    p.check(ok, f"[dono] 'Toda a equipe' mostra a mensagem do Bruno para o Carlos (minha fila tinha {minhas})")
    if ok:
        linha = c.pg.locator(f'[data-mensagem]:has([data-mensagem-aluno="{m()["carlos"]}"])')
        p.check("do WhatsApp de Bruno" in linha.inner_text() and linha.locator("[data-btn-reenviar]").count() == 0,
                "[dono] com o autor ('do WhatsApp de Bruno') e sem Reenviar (o WhatsApp é do Bruno)")
        p.check(c.tem(f'[data-mensagem-aluno="{m()["joao"]}"]'), "[dono] e a dele (o lembrete do João)")
    sem_toast(c)
    c.pg.evaluate("document.querySelector('[data-card-historico]').scrollIntoView({block: 'start'})")
    c.pg.wait_for_timeout(600)
    c.print("tela6_mensagens_dono_equipe")
    c.fim()


@caso
def caso_membro(nav) -> None:
    c = abrir(nav, "membro", "w13-personal2")
    pronto(c)
    p.check(not c.tem('[role="radiogroup"][aria-label="De quem"]'), "[membro] o 2º personal NÃO tem o seletor da equipe")
    p.check(c.tem(f'[data-mensagem-aluno="{m()["carlos"]}"]') and not c.tem(f'[data-mensagem-aluno="{m()["joao"]}"]'),
            "[membro] vê só a dele (o Carlos), não a do dono (o João)")
    c.fim()


@caso
def caso_nutri(nav) -> None:
    c = abrir(nav, "nutri", "nutri-legado")
    pronto(c)
    cfg = m()["cfg_nutri"]
    geral = c.pg.locator("[data-toggle-geral]").get_attribute("aria-checked")
    ligados = c.pg.evaluate("() => [...document.querySelectorAll('[data-toggle-disparo]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.getAttribute('data-toggle-disparo')).sort()")
    p.check(geral == "true" and ligados == sorted(cfg["momentos"].keys()) and c.pg.input_value("[data-select-horario]") == cfg["horario"],
            f"[nutri] a MESMA config do site antigo: ligadas {geral}, momentos {ligados}, horário {c.pg.input_value('[data-select-horario]')}")
    p.check("texto seu" in c.pg.locator('[data-disparo="lembrete_vespera"]').inner_text(), "[nutri] a véspera com o texto próprio dela")
    p.check(c.pg.locator("[data-mensagem]").count() == 3, f"[nutri] o histórico dela (3) → {c.pg.locator('[data-mensagem]').count()}")
    c.fim()


@caso
def caso_rotas(nav) -> None:
    c = abrir(nav, "rotas", "prof2", rota="/whatsapp")
    p.check(c.esperar(lambda: c.caminho().startswith("/painel/mensagens"), 30), f"[rotas] /whatsapp (rota do Nutri) → {c.caminho()}")
    c.fim()


@caso
def caso_aluno(nav) -> None:
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], "aluno", desktop=True)
    c.entrar("w13-aluno", "/painel/mensagens")
    c.fechar_avisos()
    c.pg.wait_for_timeout(9000)
    p.check(not c.tem("[data-pagina-mensagens]"), f"[aluno] o aluno não abre o Painel › Mensagens (ficou em {c.caminho()})")
    c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--qr-real", action="store_true", help="o QR de verdade (o agente do celular) — staging, conta de teste, 1 vez")
    a = ap.parse_args()
    ESTADO.update({"base": a.base.rstrip("/"), "prefixo": a.prefixo, "qr_real": a.qr_real, "massa": json.loads((B.SCRATCH / "massa_staging.json").read_text(encoding="utf-8"))})
    B.saude_ok("telas W22")
    B.garantir_seguro(["prof2", "w13-dono", "w13-personal2", "nutri-legado"])
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            B.saude_ok(f"caso {nome}")
            t0 = time.time()
            try:
                CASOS[nome](nav)  # type: ignore[operator]
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {str(e)[:300]}")
                caso_atual = B.B5.ESTADO.get("caso")
                if caso_atual is not None:
                    try:
                        caso_atual.diagnostico()
                        caso_atual.ctx.close()
                    except Exception:  # noqa: BLE001
                        pass
            print(f"   ({nome}: {time.time() - t0:.0f} s)", flush=True)
            time.sleep(2)
        nav.close()
    p.check(B.pendentes_de(S, [B.uid(x) for x in ("prof2", "w13-dono", "w13-personal2", "nutri-legado")]) == 0, "no fim: nada pendente nas filas usadas")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
