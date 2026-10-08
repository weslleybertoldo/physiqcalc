#!/usr/bin/env python3
"""Physiq hml-08 (H-22) — E2E de tela do "master só no site": o painel master continua igual no SITE e sai do APP (APK e AAB).

Base: a da W27 (master de teste `w27-master` = master SÓ no staging.profiles, nunca o claim global — hml-02/H-04) + a ponte
Android de mentira da H2 (`e2e/h2/ponte_android.js`: `Capacitor.isNativePlatform()` = true no Playwright, o mesmo caminho do JS
no aparelho). Profissional = Lucas Ferreira (`w13-dono`), aluno = Rafael Moura (`w13-aluno`). Só contas de TESTE; nenhum login
novo é criado: o `--preparar` só dá o papel master ao `w27-master` (que já existe) no staging e o `--limpar` tira.

Site (o de sempre — tem que continuar igual):
  site_master       master no computador: /master Visão geral (S1) e "Master" no menu do usuário do painel (S2); no celular, pelo
                    navegador, o /master abre (S3)
  site_negativo     profissional (não master) abre /master/contas → volta para o painel (S4)
App (ponte Android; no local, o JS do `npm run build:apk` servido pelo `vite preview` = o build do APK/AAB; no staging, o site
com a ponte = a guarda de runtime):
  app_master        master entra no app → "Conta master: use o site" (A1); a sessão sai SÓ deste aparelho (a chave some do
                    localStorage, a sessão do app some do Auth e a do site, aberta noutro login, continua viva e renova);
                    "Abrir o site" chama o Browser.open com o /master do site; "Entendi" vai para a entrada
  app_profissional  profissional no app: o painel abre e o menu do usuário ("Mais") não tem "Master" (A2)
  app_rota_master   profissional no app: /master e /master/professores → "Página não encontrada" (A3)
  app_aluno         aluno no app: abre normal (a trava só pega quem é master)

Uso: python3 e2e/hml08/telas.py --preparar                       (staging: master de teste no w27-master)
     python3 e2e/hml08/telas.py --base http://localhost:8080 --prefixo local --casos site_master,site_negativo
     python3 e2e/hml08/telas.py --base http://localhost:8080 --prefixo local_apk --casos app_master,app_profissional,...
     python3 e2e/hml08/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging
     python3 e2e/hml08/telas.py --limpar                         (tira o master de teste dos 2 bancos)
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w27", Path(__file__).parent.parent / "w27" / "_base.py")
B = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w27"] = B
_ESPEC.loader.exec_module(B)  # type: ignore[union-attr]

from playwright.sync_api import sync_playwright  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml08"
B.B5.PRINTS = PRINTS  # o diagnóstico de falha do Caso grava aqui
PONTE = (Path(__file__).parent.parent / "h2" / "ponte_android.js").read_text(encoding="utf-8")
UA_WEBVIEW = ("Mozilla/5.0 (Linux; Android 14; 21121210G Build/UKQ1.231003.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36")
UA_ANDROID = ("Mozilla/5.0 (Linux; Android 14; 21121210G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile "
              "Safari/537.36")
MASTER, PROFISSIONAL, ALUNO = "w27-master", "w13-dono", "w13-aluno"
CARTAO = "Conta master: use o site"
NAO_ENCONTRADA = "Página não encontrada"
CASOS: dict[str, object] = {}
ESTADO: dict = {}


def caso(fn):
    CASOS[fn.__name__.replace("caso_", "")] = fn
    return fn


def novo(nav, nome: str, celular: bool = False, ua: str | None = None, ponte: bool = False):
    """Contexto limpo (o Caso da W5) com o user-agent pedido e, no "app", a ponte Android antes de qualquer script da página."""
    original = nav.new_context

    def com_ua(**kw):
        if ua:
            kw["user_agent"] = ua
        return original(**kw)

    nav.new_context = com_ua
    try:
        c = B.Caso(nav, ESTADO["base"], ESTADO["prefixo"], nome, desktop=not celular)
    finally:
        nav.new_context = original
    if ponte:
        c.pg.add_init_script("window.__PONTE_CFG = {};\n" + PONTE)
    return c


def foto(c, nome: str) -> str:
    PRINTS.mkdir(parents=True, exist_ok=True)
    caminho = PRINTS / f"{ESTADO['prefixo']}_{nome}.png"
    c.pg.wait_for_timeout(900)
    c.pg.screenshot(path=str(caminho))
    print(f"   print: {caminho}", flush=True)
    return str(caminho)


def claim(token: str, nome: str) -> str:
    corpo = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(corpo + "=" * (-len(corpo) % 4))).get(nome, "")


def sessoes_vivas(ids: list[str]) -> set[str]:
    lista = ",".join(f"'{i}'" for i in ids if i)
    return {r["id"] for r in B.sql_principal(f"select id::text as id from auth.sessions where id in ({lista})")} if lista else set()


def cab(token: str) -> dict:
    return {"apikey": B.anon(B.PRINCIPAL_REF), "Authorization": f"Bearer {token}"}


def sair_local(token: str) -> int:
    """Fecha só a sessão do teste (logout local) — nunca o global, que derrubaria as outras sessões da conta."""
    st, _, _ = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/logout?scope=local", {}, cab(token))
    return st


def abrir_mais(c) -> bool:
    """No celular o menu do usuário fica no "Mais" da barra de baixo."""
    barra = c.pg.locator('nav[aria-label="Menu do painel"]')
    if not c.esperar(lambda: barra.count() > 0 and barra.first.is_visible(), 30):
        return False
    barra.get_by_text("Mais", exact=True).first.click()
    return c.esperar(lambda: c.tem('[data-acao-usuario="sair"]'), 10)


# ── site ────────────────────────────────────────────────────────────────────────────────────────────────────────────────


@caso
def caso_site_master(nav):
    c = novo(nav, "site_master")
    c.entrar(MASTER, "/master")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem('[data-pagina-master="visao-geral"]') and "Carregando" not in c.texto()[:3000], 45)
    p.check(ok, f"[site_master] /master abre a Visão geral no site ({c.caminho()})")
    foto(c, "S1_site_master_visao_geral")
    c.ir("/painel")
    c.fechar_avisos()
    botao = c.pg.locator("[data-menu-usuario-botao]")
    ok = c.esperar(lambda: botao.count() > 0 and botao.first.is_visible(), 45)
    p.check(ok, f"[site_master] o painel abre para o master ({c.caminho()})")
    if ok:
        botao.first.click()
        ok = c.esperar(lambda: c.tem('[data-acao-usuario="master"]'), 10)
        p.check(ok, "[site_master] \"Master\" no menu do usuário do painel (site)")
        foto(c, "S2_site_painel_menu_com_master")
        if ok:
            c.pg.locator('[data-acao-usuario="master"]').first.click()
            p.check(c.esperar(lambda: c.caminho().startswith("/master"), 15), f"[site_master] o item leva ao /master ({c.caminho()})")
    c.fim()
    # celular, pelo navegador (não é o app): o master continua abrindo
    c = novo(nav, "site_master_celular", celular=True, ua=UA_ANDROID)
    c.entrar(MASTER, "/master")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.tem('[data-pagina-master="visao-geral"]') and "Carregando" not in c.texto()[:3000], 45)
    p.check(ok, f"[site_master] /master abre no navegador do celular ({c.caminho()})")
    p.check(CARTAO not in c.texto(), "[site_master] sem o cartão \"use o site\" no navegador")
    foto(c, "S3_site_master_celular")
    c.fim()


@caso
def caso_site_negativo(nav):
    c = novo(nav, "site_negativo")
    c.entrar(PROFISSIONAL, "/master/contas")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.caminho().startswith("/painel") and c.tem("[data-menu-usuario-botao]"), 45)
    p.check(ok, f"[site_negativo] profissional em /master/contas volta para o painel ({c.caminho()})")
    p.check(not c.tem("[data-pagina-master]"), "[site_negativo] nenhuma página do master na tela")
    foto(c, "S4_site_profissional_volta_ao_painel")
    c.fim()


# ── app (ponte Android) ─────────────────────────────────────────────────────────────────────────────────────────────────


@caso
def caso_app_master(nav):
    # a sessão do "site" (outro aparelho): login à parte, que tem que continuar viva depois que o app tira a conta
    site = B.B5.sessao(MASTER)
    c = novo(nav, "app_master", celular=True, ua=UA_WEBVIEW, ponte=True)
    app = c.entrar(MASTER, "/")
    sid_app, sid_site = claim(app["access_token"], "session_id"), claim(site["access_token"], "session_id")
    p.check(bool(sid_app) and bool(sid_site) and sid_app != sid_site, "[app_master] 2 sessões separadas (app e site)")
    ok = c.esperar(lambda: CARTAO in c.texto(), 45)
    p.check(ok, f"[app_master] o app mostra \"{CARTAO}\" ({c.caminho()})")
    foto(c, "A1_app_master_use_o_site")
    p.check(not c.tem("[data-pagina-master]") and not c.tem("[data-menu-usuario-botao]"), "[app_master] nem master nem painel por trás")
    chave = c.esperar(lambda: c.pg.evaluate("localStorage.getItem('physiq-principal-auth')") is None, 15)
    p.check(chave, "[app_master] a sessão saiu do aparelho (chave do login some do localStorage)")
    vivas = set()
    for _ in range(10):  # o logout chega ao Auth logo depois do cartão
        vivas = sessoes_vivas([sid_app, sid_site])
        if sid_app not in vivas:
            break
        time.sleep(1.5)
    p.check(sid_app not in vivas, "[app_master] a sessão do app foi encerrada no Auth")
    p.check(sid_site in vivas, "[app_master] a sessão do site continua no Auth (logout LOCAL, não global)")
    st, _, _ = B.http("GET", f"{B.PRINCIPAL_URL}/auth/v1/user", None, cab(site["access_token"]))
    p.check(st == 200, f"[app_master] o site continua logado (/auth/v1/user {st})")
    st, r, _ = B.http("POST", f"{B.PRINCIPAL_URL}/auth/v1/token?grant_type=refresh_token", {"refresh_token": site["refresh_token"]},
                      {"apikey": B.anon(B.PRINCIPAL_REF)})
    p.check(st == 200, f"[app_master] o site renova a sessão ({st})")
    if st == 200 and isinstance(r, dict):
        site = r
    # "Abrir o site" → Browser.open no /master do site do ambiente
    c.pg.get_by_role("button", name="Abrir o site").click()
    ok = c.esperar(lambda: c.pg.evaluate(
        "window.__ponte.chamadas.some(x => x.plugin === 'Browser' && x.metodo === 'open' && /\\/master$/.test((x.opcoes || {}).url || ''))"), 10)
    url = c.pg.evaluate("(window.__ponte.chamadas.filter(x => x.plugin === 'Browser').pop() || {}).opcoes")
    p.check(ok, f"[app_master] \"Abrir o site\" abre o /master no navegador ({url})")
    c.pg.get_by_role("button", name="Entendi").click()
    ok = c.esperar(lambda: c.caminho().startswith("/entrar") and CARTAO not in c.texto(), 15)
    p.check(ok, f"[app_master] \"Entendi\" leva à entrada ({c.caminho()})")
    foto(c, "A1b_app_master_entendi")
    c.fim()
    p.check(sair_local(site["access_token"]) in (200, 204), "[app_master] sessão do teste (site) fechada no fim")


@caso
def caso_app_profissional(nav):
    c = novo(nav, "app_profissional", celular=True, ua=UA_WEBVIEW, ponte=True)
    sess = c.entrar(PROFISSIONAL, "/painel")
    c.fechar_avisos()
    ok = abrir_mais(c)
    p.check(ok, f"[app_profissional] o painel abre no app e o \"Mais\" mostra o menu do usuário ({c.caminho()})")
    p.check(CARTAO not in c.texto(), "[app_profissional] sem o cartão do master")
    p.check(c.pg.locator('[data-acao-usuario="master"]').count() == 0, "[app_profissional] menu do usuário sem \"Master\"")
    c.pg.locator('[data-acao-usuario="sair"]').first.scroll_into_view_if_needed()  # o print mostra o menu do usuário
    foto(c, "A2_app_profissional_menu_sem_master")
    c.fim()
    sair_local(sess["access_token"])


@caso
def caso_app_rota_master(nav):
    c = novo(nav, "app_rota_master", celular=True, ua=UA_WEBVIEW, ponte=True)
    sess = c.entrar(PROFISSIONAL, "/master")
    c.fechar_avisos()
    ok = c.esperar(lambda: NAO_ENCONTRADA in c.texto(), 45)
    p.check(ok, f"[app_rota_master] /master no app → \"{NAO_ENCONTRADA}\" ({c.caminho()})")
    foto(c, "A3_app_rota_master_nao_encontrada")
    c.ir("/master/professores")
    ok = c.esperar(lambda: NAO_ENCONTRADA in c.texto(), 30)
    p.check(ok, f"[app_rota_master] /master/professores (rota antiga) no app → \"{NAO_ENCONTRADA}\" ({c.caminho()})")
    p.check(not c.tem("[data-pagina-master]"), "[app_rota_master] nenhuma página do master")
    c.fim()
    sair_local(sess["access_token"])


@caso
def caso_app_aluno(nav):
    c = novo(nav, "app_aluno", celular=True, ua=UA_WEBVIEW, ponte=True)
    sess = c.entrar(ALUNO, "/")
    c.fechar_avisos()
    ok = c.esperar(lambda: c.caminho() in ("/", "/inicio") and len(c.texto()) > 200 and "Carregando" not in c.texto()[:2000], 45)
    p.check(ok, f"[app_aluno] o app do aluno abre normal ({c.caminho()})")
    p.check(CARTAO not in c.texto(), "[app_aluno] sem o cartão do master")
    p.check(c.pg.evaluate("localStorage.getItem('physiq-principal-auth')") is not None, "[app_aluno] a sessão continua no aparelho")
    foto(c, "app_aluno_inicio")
    c.fim()
    sair_local(sess["access_token"])


def preparar() -> None:
    assert B.uid(MASTER), "o w27-master tem que existir (hml-08 não cria login novo)"
    B.B5.garantir_usuario(B.EMAIL[MASTER], B.CONTAS[MASTER][1], B.NOMES[MASTER])  # login já existe: só a senha do arquivo
    B.dar_master(MASTER)
    r = B.sql_principal(f"select role from staging.profiles where id = '{B.uid(MASTER)}'")
    print("master de teste (só no staging):", B.EMAIL[MASTER], r)


def limpar() -> None:
    B.tirar_master(MASTER)
    r = B.sql_principal(f"""select (select role from staging.profiles where id = '{B.uid(MASTER)}') as staging,
                                   (select role from public.profiles where id = '{B.uid(MASTER)}') as public,
                                   (select raw_app_meta_data->>'role' from auth.users where id = '{B.uid(MASTER)}') as claim""")
    print("master de teste retirado:", r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base")
    ap.add_argument("--prefixo")
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--preparar", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.preparar:
        preparar()
        return 0
    if a.limpar:
        limpar()
        return 0
    assert a.base and a.prefixo, "--base e --prefixo"
    ESTADO.update(base=a.base.rstrip("/"), prefixo=a.prefixo)
    t0 = time.time()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x for x in a.casos.split(",") if x]:
            fn = CASOS[nome]
            B.saude_ok(f"o caso {nome}")
            print(f"\n── {nome}", flush=True)
            for _ in (1, 2):
                try:
                    fn(nav)  # type: ignore[operator]
                    break
                except Exception as e:  # noqa: BLE001
                    if "Target crashed" in str(e) or "has been closed" in str(e):
                        print("   o navegador caiu — 2ª tentativa", flush=True)
                        nav = pw.chromium.launch(args=["--no-sandbox"])
                        continue
                    p.check(False, f"[{nome}] exceção: {str(e)[:300]}")
                    caso_atual = B.B5.ESTADO.get("caso")
                    if caso_atual is not None:
                        caso_atual.diagnostico()
                    break
            time.sleep(2)
        nav.close()
    print(f"\nhml-08 · telas ({a.prefixo}) · {time.time() - t0:.0f}s")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
