#!/usr/bin/env python3
"""Physiq W20c — E2E de tela do push no celular, com o app achando que está no APK Android (ponte_android.js: o mesmo caminho do
JS no aparelho — permissão, canal, token, eventos do FCM — com respostas de mentira e token FALSO). Celular 390 × 844 × 3,4
(= 1326 × 2870, como as telas do app). Só contas de TESTE (Rafael Moura = aluno da massa da W20; Lucas = o profissional).

Positivo:
  pedido      Rafael abre o app (Android com Firebase, ainda não decidiu a permissão) → o pedido "Avisos no celular" (print) →
              "Ativar avisos" → o Android permite → canal "avisos" (importância 4) + register → o token chega → o app grava no banco.
  envio       com o token gravado PELO APP: o Lucas marca uma consulta → aviso → gatilho → push-enviar → FCM recusa o token falso →
              o aparelho sai da lista (o mesmo fim de ponta a ponta do aparelho de verdade, só que o FCM não tem para quem entregar).
  recebido    push com o app aberto: aviso na tela com o texto do push (print).
  toque       tocar na notificação abre a tela do aviso (/perfil/agenda) (print).
  fechado     app FECHADO: o toque fica guardado pelo Android até o 1º ouvinte → o app abre e vai para /perfil/agenda; com a
              permissão já dada, registra calado (sem pedido).
  sair        Perfil › Sair apaga o token deste aparelho no banco e no FCM (unregister).
  pacote      (item extra) Perfil › Agenda: o mês desmarcado pelo profissional aparece "profissional desmarcou · não conta" e o
              crédito continua (print).
Negativo:
  site        no navegador (sem APK): nenhum pedido, nenhum registro.
  negado      Android com a permissão negada: nenhum pedido, nenhum registro, nenhum erro na tela.
  semfirebase APK sem o google-services.json (PushFirebase.disponivel = false): nenhum pedido e o register (que derrubaria o app)
              nunca é chamado.
  adiado      "Agora não": fecha e não pergunta de novo na próxima abertura.

Uso: python3 e2e/w20c/telas.py --base http://localhost:5173 --prefixo local [--casos pedido,envio,...]
     staging: --base https://physiqcalc-staging.vercel.app --prefixo staging
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p, q = B.p, B.q
CASOS: dict[str, object] = {}
ESTADO: dict = {}
ALUNO = "w13-aluno"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def abrir(nav, nome: str, rota: str = "/", cfg: dict | None = None, esperar: str | None = "[data-aba-inicio]", conta: str = ALUNO):
    """Contexto limpo no celular, a ponte Android (se cfg) antes do app, a sessão injetada e a rota."""
    c = B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=False)
    c.pedidos = []
    c.pg.on("request", lambda r: c.pedidos.append(r.url) if "/rpc/push_" in r.url and r.method == "POST" else None)
    if cfg is not None:
        c.pg.add_init_script("window.__PONTE_CFG = " + json.dumps(cfg) + ";\n" + B.PONTE)
    c.entrar(conta, rota, zerar=True)
    c.fechar_avisos()
    if esperar:
        ok = c.esperar(lambda: c.tem(esperar), 120)
        p.check(ok, f"[{nome}] {rota} abriu já logado ({esperar})")
    return c


def chamadas(c, plugin: str | None = None, metodo: str | None = None) -> list[dict]:
    try:
        lista = c.pg.evaluate("() => (window.__ponte && window.__ponte.chamadas) || []")
    except Exception:  # noqa: BLE001
        return []
    return [x for x in lista if (plugin is None or x["plugin"] == plugin) and (metodo is None or x["metodo"] == metodo)]


def emitir(c, plugin: str, evento: str, dados: dict) -> int:
    return c.pg.evaluate("([p, e, d]) => window.__ponte.emitir(p, e, d)", [plugin, evento, dados])


def rafael() -> str:
    if "rafael" not in ESTADO:
        ESTADO["rafael"] = B.uid_de(ALUNO)
    return ESTADO["rafael"]


@caso
def caso_pedido(nav):
    tok = B.token_falso("app")
    ESTADO["token_app"] = tok
    c = abrir(nav, "pedido", "/", {"permissao": "prompt", "pedido": "granted", "firebase": True, "token": tok})
    ok = c.esperar(lambda: c.tem("[data-push-pedido]"), 45)
    p.check(ok, "[pedido] o pedido \"Avisos no celular\" aparece depois do login (Android com Firebase, permissão ainda não decidida)")
    p.check(not c.tem("[data-sonner-toast]"), "[pedido] sem aviso por cima do pedido (ele espera os avisos da tela saírem)")
    if ok:
        texto = c.pg.locator("[data-painel]").inner_text()
        p.check("Avisos no celular" in texto and "mesmo com o app fechado" in texto and "Consulta marcada, remarcada ou desmarcada" in texto,
                "[pedido] título, o porquê e os 3 avisos que chegam")
        c.print("push_pedido")
        c.pg.locator("[data-push-ativar]").click()
    ok = c.esperar(lambda: "Avisos ligados neste celular" in c.texto(), 20)
    p.check(ok, "[pedido] \"Ativar avisos\" → o Android permitiu → \"Avisos ligados neste celular\"")
    canal = chamadas(c, "PushNotifications", "createChannel")
    p.check(bool(canal) and canal[0]["opcoes"]["id"] == "avisos" and canal[0]["opcoes"]["name"] == "Avisos" and canal[0]["opcoes"]["importance"] == 4,
            f"[pedido] canal próprio \"Avisos\", importância alta ({canal[0]['opcoes'] if canal else '-'})")
    p.check(bool(chamadas(c, "PushNotifications", "requestPermissions")) and bool(chamadas(c, "PushNotifications", "register")),
            "[pedido] pediu a permissão do Android e registrou no FCM")
    gravado = B.esperar(lambda: B.aparelho(tok), 20, passo=1)
    p.check(bool(gravado) and gravado["user_id"] == rafael() and gravado["plataforma"] == "android",
            f"[pedido] o APP gravou o token do aparelho no banco principal (push_registrar): {gravado}")
    c.pg.wait_for_timeout(600)  # deixa o Playwright entregar os eventos de rede da página
    p.check(any("/rpc/push_registrar" in u for u in c.pedidos), "[pedido] pela função push_registrar")
    guardado = c.pg.evaluate("localStorage.getItem('physiq_push_token')") or ""
    p.check(tok in guardado, "[pedido] guardou o token no aparelho (para apagar ao sair)")
    c.print("push_ativado")
    ESTADO["c_pedido"] = c


@caso
def caso_envio(nav):
    tok = ESTADO.get("token_app")
    if not tok or not B.aparelho(tok):
        p.check(False, "[envio] precisa do token gravado pelo app (caso pedido)")
        return
    B.saude_ok("envio")
    m = B.massa_w20()
    desde = B.agora_iso()
    dia = B.hoje() + dt.timedelta(days=13)
    while dia.weekday() == 6:
        dia += dt.timedelta(days=1)
    st, ag = B.rest_como("w13-dono", "POST", "agendamentos", "", {
        "nutricionista_id": m["lucas"], "calendario_id": m["cal_lucas"], "paciente_id": m["alunos"]["Rafael Moura"], "titulo": "Retorno (W20c telas)",
        "inicio": B.sp(dia, "11:00"), "fim": B.sp(dia, "11:30"), "status": "agendado", "confirmacao": "a_confirmar", "modulo": "treino", "conta_id": m["conta"]})
    ag_id = ag[0]["id"] if st in (200, 201) and isinstance(ag, list) and ag else None
    ESTADO["ag_envio"] = ag_id
    p.check(bool(ag_id), f"[envio] o Lucas marcou uma consulta para o Rafael ({st})")
    av = B.esperar(lambda: B.sql_principal(f"select id::text as id, titulo from {S}.avisos where destino_user_id = {q(rafael())} and criado_em >= {q(desde)} and tipo = 'consulta_marcada' order by criado_em desc limit 1"), 20, passo=1)
    p.check(bool(av), f"[envio] o aviso no sino: {av[0]['titulo'] if av else '-'}")
    if not av:
        return
    ESTADO["aviso_envio"] = av[0]
    e = B.esperar_envio(av[0]["id"], 60)
    res = ((e or {}).get("resultado") or [{}])[0]
    p.check(bool(e) and e["aparelhos"] == 1 and e["recusados"] == 1, f"[envio] a push-enviar mandou ao FCM pelo token do app: {res}")
    p.check(res.get("codigo") in ("UNREGISTERED", "INVALID_ARGUMENT") and res.get("aparelho") == f"…{tok[-6:]}", "[envio] o FCM recusou o token falso (o registro mostra a resposta)")
    p.check(bool(B.esperar(lambda: B.aparelho(tok) is None, 20, passo=1)), "[envio] o token recusado saiu da lista")


@caso
def caso_recebido(nav):
    c = ESTADO.get("c_pedido")
    if not c:
        p.check(False, "[recebido] precisa do caso pedido")
        return
    titulo = (ESTADO.get("aviso_envio") or {}).get("titulo") or "Consulta marcada: ter, 14/10 às 11:00. Confirme no app"
    n = emitir(c, "PushNotifications", "pushNotificationReceived", {"id": "0:1", "title": "Agenda", "body": titulo, "data": {"link": "/perfil/agenda", "tipo": "consulta_marcada"}})
    p.check(n >= 1, f"[recebido] o app ouve o push com o app aberto ({n} ouvinte)")
    ok = c.esperar(lambda: titulo in c.texto(), 10)
    p.check(ok, f"[recebido] o aviso aparece na tela com o texto do push (\"{titulo}\")")
    c.print("push_recebido")


@caso
def caso_toque(nav):
    c = ESTADO.get("c_pedido")
    if not c:
        p.check(False, "[toque] precisa do caso pedido")
        return
    emitir(c, "PushNotifications", "pushNotificationActionPerformed", {"actionId": "tap", "notification": {"id": "0:1", "data": {"link": "/perfil/agenda"}}})
    ok = c.esperar(lambda: c.caminho().startswith("/perfil/agenda") and c.tem("[data-pagina-agenda]"), 30)
    p.check(ok, f"[toque] tocar na notificação abre a Agenda ({c.caminho()})")
    c.esperar(lambda: not c.tem("[data-sonner-toast]"), 15)  # o print sem os avisos dos casos anteriores por cima
    c.print("push_toque")
    # link de fora nunca abre outro site
    emitir(c, "PushNotifications", "pushNotificationActionPerformed", {"actionId": "tap", "notification": {"data": {"link": "https://golpe.example/x"}}})
    ok = c.esperar(lambda: c.caminho() in ("/", "/inicio") or c.tem("[data-aba-inicio]"), 20)
    p.check(ok and "golpe" not in c.pg.url, f"[toque] link de fora: fica no app, no início ({c.caminho()})")


@caso
def caso_sair(nav):
    c = ESTADO.pop("c_pedido", None)
    if not c:
        p.check(False, "[sair] precisa do caso pedido")
        return
    # o FCM recusou o token no caso envio e ele saiu da lista; a próxima abertura (permissão já dada) registra de novo, calada
    tok = ESTADO["token_app"]
    c.pg.reload(wait_until="domcontentloaded")
    gravado = B.esperar(lambda: B.aparelho(tok), 40, passo=1)
    p.check(bool(gravado), "[sair] na abertura seguinte (permissão já dada) o app registrou o aparelho de novo, calado")
    p.check(not c.tem("[data-push-pedido]"), "[sair] sem pedido de novo (a permissão já foi dada)")
    c.ir("/perfil")
    c.esperar(lambda: c.tem("[data-perfil-sair]"), 60)
    c.pg.locator("[data-perfil-sair]").click()
    c.esperar(lambda: c.tem("[data-perfil-sair-confirmar]"), 10)
    c.pg.locator("[data-perfil-sair-confirmar]").click()
    some = B.esperar(lambda: B.aparelho(tok) is None, 30, passo=1)
    p.check(bool(some), "[sair] Sair apagou o token deste aparelho no banco (push_esquecer)")
    p.check(bool(chamadas(c, "PushNotifications", "unregister")), "[sair] e no FCM (unregister)")
    p.check(any("/rpc/push_esquecer" in u for u in c.pedidos), "[sair] pela função push_esquecer, antes de sair")
    p.check(not (c.pg.evaluate("localStorage.getItem('physiq_push_token')") or ""), "[sair] esqueceu o token guardado no aparelho")
    c.fim()


@caso
def caso_fechado(nav):
    tok = B.token_falso("fechado")
    toque = {"actionId": "tap", "notification": {"id": "0:2", "data": {"link": "/perfil/agenda", "tipo": "consulta_marcada"}}}
    c = abrir(nav, "fechado", "/", {"permissao": "granted", "firebase": True, "token": tok, "toqueGuardado": toque}, esperar=None)
    ok = c.esperar(lambda: c.caminho().startswith("/perfil/agenda") and c.tem("[data-pagina-agenda]"), 60)
    p.check(ok, f"[fechado] app fechado: tocar no push abre o app direto na Agenda ({c.caminho()})")
    gravado = B.esperar(lambda: B.aparelho(tok), 30, passo=1)
    p.check(bool(gravado), "[fechado] permissão já dada: registrou calado na abertura")
    p.check(not c.tem("[data-push-pedido]"), "[fechado] sem pedido na tela")
    c.print("push_fechado")
    B.sql_principal(f"delete from {S}.push_aparelhos where token = {q(tok)}")
    c.fim()


def sem_registro(c, nome: str, segundos: float = 12) -> None:
    c.pg.wait_for_timeout(segundos * 1000)
    p.check(not c.tem("[data-push-pedido]"), f"[{nome}] nenhum pedido de permissão")
    c.pg.wait_for_timeout(300)
    p.check(not any("/rpc/push_registrar" in u for u in c.pedidos), f"[{nome}] nenhum registro no banco")
    p.check(not chamadas(c, "PushNotifications", "register"), f"[{nome}] o register nunca é chamado")


@caso
def caso_site(nav):
    c = abrir(nav, "site", "/", None)
    sem_registro(c, "site")
    c.fim()


@caso
def caso_negado(nav):
    c = abrir(nav, "negado", "/", {"permissao": "denied", "firebase": True, "token": B.token_falso("negado")})
    sem_registro(c, "negado")
    p.check(c.tem("[data-aba-inicio]"), "[negado] o app segue normal (sino, e-mail e notificação local)")
    c.fim()


@caso
def caso_semfirebase(nav):
    c = abrir(nav, "semfirebase", "/", {"permissao": "prompt", "firebase": False, "token": B.token_falso("semfb")})
    sem_registro(c, "semfirebase")
    p.check(bool(chamadas(c, "PushFirebase", "disponivel")), "[semfirebase] perguntou ao APK se tem o Firebase antes de tudo")
    c.fim()


@caso
def caso_adiado(nav):
    cfg = {"permissao": "prompt", "firebase": True, "token": B.token_falso("adiado")}
    c = abrir(nav, "adiado", "/", cfg)
    ok = c.esperar(lambda: c.tem("[data-push-agora-nao]"), 45)
    p.check(ok, "[adiado] o pedido aparece")
    if ok:
        c.pg.locator("[data-push-agora-nao]").click()
        p.check(c.esperar(lambda: not c.tem("[data-push-pedido]"), 10), "[adiado] \"Agora não\" fecha o pedido")
    p.check(not chamadas(c, "PushNotifications", "requestPermissions"), "[adiado] não pediu ao Android")
    c.pg.reload(wait_until="domcontentloaded")
    c.esperar(lambda: c.tem("[data-aba-inicio]"), 60)
    sem_registro(c, "adiado (reabriu)")
    c.fim()


@caso
def caso_pacote(nav):
    m = B.massa_w20()
    pac_rafael, camila = m["alunos"]["Rafael Moura"], m["camila"]
    cal = m["cal_camila"]
    ini = B.sql_principal("select (date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '4 months')::date::text as d")[0]["d"]
    existe = B.sql_principal(f"select 1 from {S}.agenda_pacotes where paciente_id = {q(pac_rafael)} and profissional_id = {q(camila)} and encerrado_em is null")
    p.check(not existe, "[pacote] o Rafael não tem pacote com a Camila (a massa só tem o do Lucas)")
    pid = B.sql_principal(f"""insert into {S}.agenda_pacotes (paciente_id, profissional_id, total, mes_inicio) values ({q(pac_rafael)}, {q(camila)}, 4, {q(ini)})
                               returning id::text as id""")[0]["id"]
    ag = B.sql_principal(f"""insert into {S}.agendamentos (nutricionista_id, calendario_id, paciente_id, titulo, inicio, fim, status, confirmacao, modulo)
                              values ({q(camila)}, {q(cal)}, {q(pac_rafael)}, 'Desmarcada pela nutri (W20c)', ({q(ini)}::date + interval '9 days' + time '10:00') at time zone 'America/Sao_Paulo',
                                      ({q(ini)}::date + interval '9 days' + time '10:30') at time zone 'America/Sao_Paulo', 'desmarcado', 'desmarcado', 'nutricao') returning id::text as id""")[0]["id"]
    try:
        s = B.sql_principal(f"select {S}.agenda_pacote_situacao({q(pac_rafael)}, {q(camila)}) as s")[0]["s"]
        estados = [x["estado"] for x in s["meses"]]
        p.check(estados[0] == "desmarcada" and s["devolvidos"] == 1 and len(estados) == 5,
                f"[pacote] banco: o mês desmarcado pela Camila não conta e o pacote anda 1 mês ({estados}, restam {s['restam']} de {s['total']})")
        c = abrir(nav, "pacote", "/perfil/agenda", {"permissao": "granted", "firebase": True, "token": B.token_falso("pacote")}, esperar="[data-pagina-agenda]")
        ok = c.esperar(lambda: c.tem(f'[data-cartao-pacote] [data-mes="{ini}"][data-mes-estado="desmarcada"]'), 60)
        p.check(ok, "[pacote] o app mostra o mês como \"profissional desmarcou · não conta\"")
        cartoes = c.pg.locator("[data-cartao-pacote]")
        alvo = None
        for i in range(cartoes.count()):
            if cartoes.nth(i).locator(f'[data-mes="{ini}"]').count():
                alvo = cartoes.nth(i)
        if alvo is not None:
            txt = alvo.inner_text()
            p.check("profissional desmarcou · não conta" in txt.lower() or "PROFISSIONAL DESMARCOU" in txt, f"[pacote] rótulo do mês ({txt[:160]!r})")
            p.check(f"Restam {s['restam']} de 4" in txt or f"RESTAM {s['restam']} DE 4" in txt, f"[pacote] o número certo: restam {s['restam']} de 4")
            alvo.scroll_into_view_if_needed()
        c.print("pacote_desmarcada")
        c.fim()
    finally:
        B.sql_principal(f"delete from {S}.agendamentos where id = {q(ag)}")
        B.sql_principal(f"delete from {S}.agenda_pacotes where id = {q(pid)}")
        B.sql_principal(f"delete from {S}.push_aparelhos where token like 'e2e-w20c-%'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default="pedido,envio,recebido,toque,sair,fechado,site,negado,semfirebase,adiado,pacote")
    a = ap.parse_args()
    ESTADO["base"], ESTADO["prefixo"] = a.base.rstrip("/"), a.prefixo
    B.saude_ok("telas")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            for nome in a.casos.split(","):
                fn = CASOS[nome.strip()]
                print(f"\n── {nome} ──", flush=True)
                try:
                    fn(nav)  # type: ignore[operator]
                except SystemExit:
                    raise
                except Exception as e:  # noqa: BLE001
                    p.check(False, f"[{nome}] erro: {type(e).__name__}: {str(e)[:300]}")
                    c = B.B5.ESTADO.get("caso")
                    if c:
                        c.diagnostico()
                time.sleep(1.5)
            c = ESTADO.pop("c_pedido", None)
            if c:
                c.fim()
        finally:
            ag = ESTADO.get("ag_envio")
            if ag:
                B.sql_principal(f"delete from {S}.agendamentos where id = {q(ag)}")
            av = ESTADO.get("aviso_envio")
            if av:
                B.sql_principal(f"delete from {S}.avisos where id = {q(av['id'])}")
            B.sql_principal(f"delete from {S}.push_aparelhos where token like 'e2e-w20c-%'")
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
