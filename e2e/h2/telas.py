#!/usr/bin/env python3
"""Physiq H2 — E2E de tela do "abrir o app pelo link do e-mail": a faixa "Abrir no app Physiq" no navegador do Android e o APK
abrindo NA tela do link (pela ponte Android de mentira — e2e/h2/ponte_android.js —, o mesmo caminho do JS no aparelho: o
getLaunchUrl com o app fechado, o appUrlOpen retido para o 1º ouvinte e o appUrlOpen com o app aberto). Celular 390 × 844 × 3,4
(= 1326 × 2870, como as telas do app); computador 1280 × 883 × 2. Só contas de TESTE (Rafael Moura = aluno com Treino + Nutrição
e a agenda da massa da W20; Bruno Treino = aluno só de Treino; Lucas Ferreira = profissional). Nenhum e-mail, push ou WhatsApp.

Positivo:
  faixa        Android, logado, /perfil/agenda (o botão do e-mail "Ver minha agenda"): a faixa no alto com o intent:// da
               MESMA tela (print); Fechar some e, ao recarregar, continua fechada (lembrado no aparelho).
  entrada      Android, SEM login: o link /perfil/agenda cai na entrada → a faixa abre a Agenda no app (print); no "Entrar com
               e-mail e senha" ela continua; ao entrar (a volta do Google recarrega o /entrar), a pessoa volta à Agenda (print).
  apk_frio     APK fechado aberto pelo link: o WebView carrega o "/" e o app vai à Agenda (print); um recarregar da página não
               leva de volta ao link.
  apk_aberto   APK aberto: o link (appUrlOpen) leva à Agenda (print) e à Dieta com a busca; o ?prof= abre o popup por cima sem
               trocar de tela (W7b) e o link do painel não troca de tela.
  apk_login    APK sem login aberto pelo link: entrada → depois de entrar, a Agenda (print).
  sem_modulo   APK, aluno só de Treino aberto pelo link da Dieta: o app faz o de sempre com a aba que ele não tem (a abertura).
Negativo:
  desktop      computador: nenhuma faixa (logado na Agenda e na entrada vinda do link).
  publicas     Android: nenhuma faixa nas páginas públicas nem no painel do profissional.
  apk_sem      APK: nenhuma faixa (nem nas páginas do aluno).

Uso: python3 e2e/h2/telas.py --base http://localhost:5173 --prefixo local [--casos faixa,entrada,...]
     staging: --base https://physiqcalc-staging.vercel.app --prefixo staging
     produção (só leitura, contas de teste): --base https://physiqcalc.com.br --prefixo prod --schema public --aluno <conta>
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

p = B.p
CASOS: dict[str, object] = {}
ESTADO: dict = {"aluno": "w13-aluno", "so_treino": "w7-treino", "profissional": "w13-dono"}
UA_WEBVIEW = ("Mozilla/5.0 (Linux; Android 14; 21121210G Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36")
FAIXA = "[data-faixa-abrir-app]"
AGENDA = "[data-pagina-agenda]"


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def novo(nav, nome: str, ua: str = B.UA_ANDROID, desktop: bool = False):
    """Contexto limpo com o user-agent pedido (o Caso da W5 cria o contexto; aqui só entra o user_agent)."""
    original = nav.new_context

    def com_ua(**kw):
        kw["user_agent"] = ua
        return original(**kw)

    nav.new_context = com_ua
    try:
        return B.B5.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=desktop)
    finally:
        nav.new_context = original


def preparar(c, conta: str | None) -> None:
    """Abre uma página pública, grava a sessão (se houver conta) e as marcas que tiram os avisos de 1ª vez do caminho."""
    c.pg.goto(c.base + "/privacidade", wait_until="domcontentloaded")
    sess = json.dumps(B.sessao(conta)) if conta else None
    c.pg.evaluate("""(s) => { if (s) localStorage.setItem('physiq-principal-auth', s);
        localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
        localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", sess)


def com_ponte(c, cfg: dict) -> None:
    c.pg.add_init_script("window.__PONTE_CFG = " + json.dumps(cfg) + ";\n" + B.PONTE)


def emitir(c, evento: str, dados: dict) -> int:
    return c.pg.evaluate("([e, d]) => window.__ponte.emitir('App', e, d)", [evento, dados])


def chamadas(c, metodo: str | None = None) -> list[dict]:
    try:
        lista = c.pg.evaluate("() => (window.__ponte && window.__ponte.chamadas) || []")
    except Exception:  # noqa: BLE001
        return []
    return [x for x in lista if x["plugin"] == "App" and (metodo is None or x["metodo"] == metodo)]


def href_faixa(c) -> str:
    return c.pg.locator(f"{FAIXA} [data-faixa-abrir-app-link]").first.get_attribute("href") or ""


def sem_toasts(c) -> None:
    """Tira os avisos da tela (toast da consulta nova da W20 etc.) antes do print."""
    try:
        c.pg.evaluate("() => document.querySelectorAll('[data-sonner-toast]').forEach((t) => t.remove())")
    except Exception:  # noqa: BLE001
        pass


@caso
def caso_faixa(nav):
    c = novo(nav, "faixa")
    c.entrar(ESTADO["aluno"], "/perfil/agenda", zerar=ESTADO["schema"] == "staging")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem(AGENDA), 90)
    p.check(ok, "[faixa] /perfil/agenda (o link do e-mail) abriu já logado na Agenda")
    ok = c.esperar(lambda: c.tem(FAIXA), 20)
    p.check(ok, "[faixa] Android: a faixa \"Abrir no app Physiq\" aparece")
    if ok:
        texto = c.pg.locator(FAIXA).inner_text()
        p.check("Abrir no app Physiq" in texto and "Abrir" in texto, f"[faixa] texto da faixa ({texto[:80]!r})")
        p.check(href_faixa(c) == B.intent_esperado("/perfil/agenda"), f"[faixa] o botão é o intent:// da MESMA tela, com o pacote do APK e a página de baixar o APK ({href_faixa(c)})")
        caixa = c.pg.locator(FAIXA).bounding_box() or {}
        p.check(caixa.get("y", 999) < 40 and caixa.get("height", 0) < 100, f"[faixa] discreta, no alto da página ({caixa})")
        agenda = c.pg.locator(AGENDA).bounding_box() or {}
        p.check(agenda.get("y", 0) >= caixa.get("y", 0) + caixa.get("height", 0) - 1, "[faixa] não cobre a Agenda (fica acima dela)")
        p.check(c.pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "[faixa] sem rolagem para o lado")
        sem_toasts(c)
        c.print("faixa_agenda")
        c.pg.locator("[data-faixa-abrir-app-fechar]").click()
        p.check(c.esperar(lambda: not c.tem(FAIXA), 5), "[faixa] Fechar: a faixa some")
        p.check(c.pg.evaluate("localStorage.getItem('physiq_faixa_abrir_app_fechada')") == "1", "[faixa] e fica lembrado no aparelho")
        c.pg.reload(wait_until="domcontentloaded")
        c.esperar(lambda: c.tem(AGENDA), 60)
        c.pg.wait_for_timeout(1500)
        p.check(c.tem(AGENDA) and not c.tem(FAIXA), "[faixa] recarregou: a Agenda abre e a faixa continua fechada")
        sem_toasts(c)
        c.print("faixa_fechada")
    c.fim()


@caso
def caso_entrada(nav):
    c = novo(nav, "entrada")
    preparar(c, None)
    c.ir("/perfil/agenda")
    ok = c.esperar(lambda: c.caminho().startswith("/entrar"), 40)
    p.check(ok, f"[entrada] sem login, o link /perfil/agenda cai na entrada ({c.caminho()})")
    ok = c.esperar(lambda: c.tem(FAIXA), 20)
    p.check(ok, "[entrada] a faixa aparece na entrada (veio do link de uma página do aluno)")
    if ok:
        p.check(href_faixa(c) == B.intent_esperado("/perfil/agenda"), f"[entrada] a faixa abre a AGENDA no app ({href_faixa(c)})")
        destino = c.pg.evaluate("JSON.parse(localStorage.getItem('physiq_destino_do_link') || 'null')")
        p.check(bool(destino) and destino.get("rota") == "/perfil/agenda", f"[entrada] o destino do link ficou guardado ({destino})")
        c.print("faixa_entrar")
        c.pg.locator("[data-entrar-email]").click()
        c.esperar(lambda: c.caminho().startswith("/entrar/email"), 10)
        p.check(c.esperar(lambda: c.tem(FAIXA), 10) and href_faixa(c) == B.intent_esperado("/perfil/agenda"),
                "[entrada] em \"Entrar com e-mail e senha\" a faixa continua (e ainda abre a Agenda)")
    # entrar: a volta do Google recarrega o /entrar (?code=) e o state do router se perde — a sessão chega e a página recarrega
    sess = json.dumps(B.sessao(ESTADO["aluno"]))
    c.pg.evaluate("(s) => localStorage.setItem('physiq-principal-auth', s)", sess)
    c.ir("/entrar")
    ok = c.esperar(lambda: c.caminho() == "/perfil/agenda" and c.tem(AGENDA), 90)
    p.check(ok, f"[entrada] depois de entrar, volta à tela do link: a Agenda ({c.caminho()})")
    c.fechar_avisos()
    if ok:
        p.check(c.pg.evaluate("localStorage.getItem('physiq_destino_do_link')") is None, "[entrada] o destino foi usado e esquecido")
        sem_toasts(c)
        c.print("volta_ao_link")
    c.fim()


@caso
def caso_desktop(nav):
    c = novo(nav, "desktop", ua=B.UA_DESKTOP, desktop=True)
    c.entrar(ESTADO["aluno"], "/perfil/agenda", zerar=ESTADO["schema"] == "staging")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem(AGENDA), 90)
    c.pg.wait_for_timeout(1500)
    p.check(ok and not c.tem(FAIXA), "[desktop] computador, logado na Agenda: nenhuma faixa")
    c.fim()
    c = novo(nav, "desktop-entrada", ua=B.UA_DESKTOP, desktop=True)
    preparar(c, None)
    c.ir("/perfil/agenda")
    ok = c.esperar(lambda: c.caminho().startswith("/entrar") and c.tem("[data-entrar-email]"), 40)
    c.pg.wait_for_timeout(1000)
    p.check(ok and not c.tem(FAIXA), "[desktop] computador, entrada vinda do link: nenhuma faixa")
    c.fim()


@caso
def caso_publicas(nav):
    c = novo(nav, "publicas")
    preparar(c, None)
    for rota in ("/privacidade", "/termos", "/calculator"):
        c.ir(rota)
        c.pg.wait_for_timeout(2500)
        p.check(c.caminho().startswith(rota) and not c.tem(FAIXA), f"[publicas] {rota}: nenhuma faixa (página pública)")
    c.fim()
    c = novo(nav, "painel")
    c.entrar(ESTADO["profissional"], "/painel", zerar=ESTADO["schema"] == "staging")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.caminho().startswith("/painel") and c.tem('[data-casca="painel"]'), 90)
    c.pg.wait_for_timeout(2000)
    p.check(ok and not c.tem(FAIXA), f"[publicas] profissional no painel ({c.caminho()}): nenhuma faixa (o profissional segue no navegador)")
    c.fim()


def abrir_apk(nav, nome: str, conta: str | None, cfg: dict):
    c = novo(nav, nome, ua=UA_WEBVIEW)
    preparar(c, conta)
    com_ponte(c, cfg)
    c.ir("/")  # o WebView do APK carrega sempre o index; o link chega pelo Android
    return c


@caso
def caso_apk_frio(nav):
    c = abrir_apk(nav, "apk_frio", ESTADO["aluno"], {"launchUrl": "https://physiqcalc.com.br/perfil/agenda"})
    ok = c.esperar(lambda: c.caminho() == "/perfil/agenda" and c.tem(AGENDA), 90)
    p.check(ok, f"[apk_frio] app fechado aberto pelo link: o app foi à Agenda ({c.caminho()})")
    c.fechar_avisos()
    p.check(bool(chamadas(c, "getLaunchUrl")), "[apk_frio] leu o link da abertura (App.getLaunchUrl)")
    p.check(not c.tem(FAIXA), "[apk_frio] no APK não há faixa")
    sem_toasts(c)
    c.print("apk_frio_agenda")
    # vai para outra aba e recarrega a página (o WebView recarrega): o link da abertura não leva de volta
    c.pg.evaluate("() => { history.pushState(null, '', '/perfil'); dispatchEvent(new PopStateEvent('popstate')); }")
    c.esperar(lambda: c.caminho() == "/perfil", 10)
    c.pg.reload(wait_until="domcontentloaded")
    c.pg.wait_for_timeout(5000)
    p.check(c.caminho() == "/perfil", f"[apk_frio] recarregar a página não volta ao link ({c.caminho()})")
    c.fim()


@caso
def caso_apk_aberto(nav):
    c = abrir_apk(nav, "apk_aberto", ESTADO["aluno"], {})
    ok = c.esperar(lambda: c.tem("[data-aba-inicio]"), 90)
    p.check(ok, f"[apk_aberto] app aberto no Início ({c.caminho()})")
    c.fechar_avisos()
    c.pg.wait_for_timeout(1500)
    n = emitir(c, "appUrlOpen", {"url": "https://physiqcalc.com.br/perfil/agenda"})
    ok = c.esperar(lambda: c.caminho() == "/perfil/agenda" and c.tem(AGENDA), 30)
    p.check(ok and n >= 2, f"[apk_aberto] o link (appUrlOpen; {n} ouvintes) leva à Agenda ({c.caminho()})")
    p.check(not c.tem(FAIXA), "[apk_aberto] no APK não há faixa")
    sem_toasts(c)
    c.print("apk_aberto_agenda")
    emitir(c, "appUrlOpen", {"url": "https://physiqcalc.com.br/dieta?ver=metas"})
    ok = c.esperar(lambda: c.caminho() == "/dieta?ver=metas", 30)
    p.check(ok, f"[apk_aberto] o link da Dieta leva à Dieta com a busca ({c.caminho()})")
    emitir(c, "appUrlOpen", {"url": "https://physiqcalc.com.br/painel/agenda?data=2026-10-01"})
    c.pg.wait_for_timeout(1500)
    p.check(c.caminho() == "/dieta?ver=metas", f"[apk_aberto] o link do painel não troca de tela ({c.caminho()})")
    emitir(c, "appUrlOpen", {"url": "https://physiqcalc.com.br/?prof=PROF-H2-NAO-EXISTE"})
    ok = c.esperar(lambda: c.tem("[data-popup-vinculo]"), 30)
    p.check(ok and c.caminho() == "/dieta?ver=metas", f"[apk_aberto] o ?prof= abre o popup do profissional POR CIMA, sem trocar de tela ({c.caminho()})")
    if ok:
        for sel in ("[data-vinculo-fechar]", "[data-vinculo-cancelar]"):
            if c.esperar(lambda s=sel: c.tem(s), 20):
                c.pg.locator(sel).first.click()
                break
        p.check(c.esperar(lambda: not c.tem("[data-popup-vinculo]"), 10), "[apk_aberto] fechou o popup (nada vinculado)")
    c.pg.evaluate("localStorage.removeItem('physiq_prof_pendente')")
    c.fim()


@caso
def caso_apk_login(nav):
    c = abrir_apk(nav, "apk_login", None, {"launchUrl": "https://physiqcalc.com.br/perfil/agenda"})
    ok = c.esperar(lambda: c.caminho().startswith("/entrar") and c.tem("[data-entrar-email]"), 60)
    p.check(ok, f"[apk_login] sem login o app abre na entrada ({c.caminho()})")
    destino = c.pg.evaluate("JSON.parse(localStorage.getItem('physiq_destino_do_link') || 'null')")
    p.check(bool(destino) and destino.get("rota") == "/perfil/agenda", f"[apk_login] o destino do link ficou guardado ({destino})")
    p.check(not c.tem(FAIXA), "[apk_login] no APK não há faixa (nem na entrada)")
    sess = json.dumps(B.sessao(ESTADO["aluno"]))
    c.pg.evaluate("(s) => localStorage.setItem('physiq-principal-auth', s)", sess)
    c.ir("/entrar")
    ok = c.esperar(lambda: c.caminho() == "/perfil/agenda" and c.tem(AGENDA), 90)
    p.check(ok, f"[apk_login] depois de entrar, a Agenda ({c.caminho()})")
    c.fechar_avisos()
    sem_toasts(c)
    c.print("apk_login_agenda")
    c.fim()


@caso
def caso_sem_modulo(nav):
    c = abrir_apk(nav, "sem_modulo", ESTADO["so_treino"], {"launchUrl": "https://physiqcalc.com.br/dieta"})
    c.pg.wait_for_timeout(3000)
    ok = c.esperar(lambda: c.caminho() in ("/", "/treino") and c.tem("[data-aba-inicio], [data-aba-treino]"), 90)
    p.check(ok, f"[sem_modulo] aluno só de Treino com o link da Dieta: o app faz o de sempre (a abertura: {c.caminho()})")
    p.check(not c.tem("[data-nao-encontrada]"), "[sem_modulo] sem página de erro")
    c.fim()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--schema", default="staging")
    ap.add_argument("--aluno", default="w13-aluno")
    ap.add_argument("--casos", default="faixa,entrada,desktop,publicas,apk_frio,apk_aberto,apk_login,sem_modulo")
    a = ap.parse_args()
    ESTADO["base"], ESTADO["prefixo"], ESTADO["schema"], ESTADO["aluno"] = a.base.rstrip("/"), a.prefixo, a.schema, a.aluno
    B.ESTADO["schema"] = a.schema
    B.saude_ok("telas H2")
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
        finally:
            nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
