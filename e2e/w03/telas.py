#!/usr/bin/env python3
"""Physiq W3 — E2E de TELA do login único (Playwright, um contexto limpo por caso) + prints nos tamanhos das telas
aprovadas (app 390 px × 3,4 = 1326 px de largura, como a tela 1; painel 1280 × 883 × 2 = 2560 × 1766, como a tela 6).

Casos (positivos e negativos):
  entrar        sem login: a tela Entrar (Google + e-mail e senha + "Sou profissional"), no padrão da tela 1
  google        o botão do Google vai para o Google com a volta certa (authorize do principal → 302 accounts.google.com,
                redirect_uri = callback do principal, state.referrer = <origem>/entrar) e o fluxo do APK (deep link)
  aluno         aluno do Calc entra por e-mail e senha → aviso "o Physiq mudou" → Treino com as séries antigas
                (+ --escrever: série marcada SEM internet e sincronizada depois, conferida no banco e apagada)
  pessoa        pessoa nova → Boas-vindas ("Tenho um código" + "Sou profissional", aberto na W4); código inválido recusado
  professor     professor do Calc → painel com a casca da tela 6 e os alunos dele (página antiga dentro)
  master        master de teste → painel + Master
  nutri         nutricionista do Nutri → painel de nutrição com "use o site do PhysiqNutri por enquanto"
  paciente      paciente do Nutri → app com "Sua dieta continua no PhysiqNutri por enquanto"
  conflito      e-mail e senha com e-mail que já existe no Treino sem vínculo → "Sua conta precisa de uma conferência"
  bloqueado     aluno de conta bloqueada pelo master → "Acesso pausado"
  offline       (build publicado) reabre SEM internet com as sessões guardadas e mostra o treino
  (hml-12: no build de staging, logo depois do login a porta do aceite é aceita como a pessoa faria — Caso.aceitar_porta)
Uso: python3 e2e/w03/telas.py --base http://localhost:5173 --prefixo local [--casos a,b] [--escrever] [--schema staging]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, Placar, anon, http, senha, sql_principal, sql_treino  # noqa: E402

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w03"
API_P = "https://api-principal.physiqcalc.com.br"
CHAVE_PRINCIPAL = "physiq-principal-auth"
p = Placar()
# hml-12 (H-30): a porta do aceite (só no build de staging, com a versão dos textos ligada no banco) aparece logo depois do login para
# quem não aceitou a versão vigente; o Caso.aceitar_porta() aceita como a pessoa faria (o mesmo do fechar_avisos() da base da W5)
PORTA = "[data-aceite-no-acesso]"
JS_LEGAL = """() => {
  if (!localStorage.getItem('physiq-principal-auth')) return 'sem_login';
  const k = Object.keys(localStorage).find((x) => x.startsWith('physiq_situacao:'));
  if (!k) return 'carregando';
  try {
    const l = JSON.parse(localStorage.getItem(k)).legal;
    if (!l || !l.versao) return 'livre';
    return (l.aceite_pendente || l.saude_pendente || l.nascimento_pendente) ? 'pendente' : 'livre';
  } catch (e) { return 'livre'; }
}"""


def kv(nome: str) -> dict:
    return dict(l.strip().split("=", 1) for l in Path.home().joinpath(nome).read_text().splitlines() if "=" in l)


ADMIN, ALUNO = kv(".physiqcalc-teste-admin"), kv(".physiqcalc-teste-aluno-teste")
CONTAS = {
    "aluno": ("teste@teste.com", ALUNO["SENHA"]),
    "professor": ("prof1.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
    "master": ("admin.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
    "nutri": ("nutri.teste.claude@physiqnutri.app", senha("nutri")),
    "paciente": ("paciente.teste.claude@physiqnutri.app", senha("paciente")),
    "pessoa": ("pessoa.teste.claude@physiqnutri.app", senha("pessoa")),
    "conflito": ("conflito.teste.claude@physiqnutri.app", senha("conflito")),
    "bloqueado": ("aluno2.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
}


class Caso:
    def __init__(self, nav, base: str, prefixo: str, nome: str, desktop: bool = False):
        self.base, self.prefixo, self.nome = base, prefixo, nome
        if desktop:
            self.ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
        else:
            self.ctx = nav.new_context(viewport={"width": 390, "height": 790}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                       locale="pt-BR", timezone_id="America/Sao_Paulo")
        self.pg = self.ctx.new_page()
        self.logs: list[str] = []
        self.erros: list[str] = []
        self.pg.on("console", lambda m: self.logs.append(f"{m.type}: {m.text}"))
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("dialog", lambda d: d.dismiss())

    def preparar(self) -> None:
        self.pg.goto(self.base + "/privacidade", wait_until="domcontentloaded")
        self.pg.evaluate("""() => { localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
            localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""")

    def entrar_pela_tela(self, conta: str) -> None:
        email, s = CONTAS[conta]
        self.pg.goto(self.base + "/entrar/email", wait_until="domcontentloaded")
        self.pg.get_by_placeholder("voce@email.com").fill(email, timeout=60000)
        self.pg.get_by_placeholder("Sua senha").fill(s)
        self.pg.locator("[data-btn-entrar]").click()
        self.aceitar_porta()

    def aceitar_porta(self, timeout: float = 40) -> bool:
        """hml-12: a porta do aceite, se aparecer depois do login (o mesmo do fechar_avisos() de e2e/w05/_base.py): a caixa do
        aceite; a caixa de saúde e a data de 30 anos atrás quando aparecem (aluno do app); "Aceitar e continuar"; espera a tela
        sumir. Sem login, sem a versão ligada (produção), já aceito, a trava de idade ou o aviso "o Physiq mudou" na tela: nada."""
        estado = {"v": "carregando"}

        def decidiu() -> bool:
            if self.tem(PORTA) or self.tem("[data-tela-menor]") or self.tem("[data-aviso-mudanca-ok]"):
                return True
            try:
                estado["v"] = self.pg.evaluate(JS_LEGAL) or "carregando"
            except Exception:  # noqa: BLE001 — navegando
                estado["v"] = "carregando"
            return estado["v"] != "carregando"

        self.esperar(decidiu, timeout)
        if not self.tem(PORTA) and not (estado["v"] == "pendente" and self.esperar(lambda: self.tem(PORTA), 10)):
            return False
        self.pg.locator("[data-aceite-caixa]").first.check()
        if self.pg.locator(f"{PORTA} [data-consentimento-saude-caixa]").count():
            self.pg.locator(f"{PORTA} [data-consentimento-saude-caixa]").first.check()
        data = self.pg.locator(f"{PORTA} [data-campo-nascimento] input[type='date']")
        if data.count():
            h = dt.date.today()
            data.first.fill((dt.date(h.year - 30, h.month, min(h.day, 28))).isoformat())
        self.pg.locator("[data-aceitar]").first.click()
        saiu = self.esperar(lambda: not self.tem(PORTA), 60)
        p.check(saiu, f"[{self.nome}] porta do aceite (hml-12): aceitou e a tela abriu")
        return saiu

    def injetar(self, conta: str) -> dict:
        email, s = CONTAS[conta]
        st, sess, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": s}, {"apikey": anon(PRINCIPAL_REF)})
        assert st == 200, (conta, st, sess)
        self.pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_PRINCIPAL, json.dumps(sess)])
        return sess

    def esperar(self, cond, timeout: float, passo: float = 0.5) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if cond():
                    return True
            except Exception:  # noqa: BLE001 — a página pode estar navegando
                pass
            time.sleep(passo)
        return False

    def caminho(self) -> str:
        """location.pathname + search lido da página (o page.url do Playwright atrasa no replaceState do React Router)."""
        try:
            return self.pg.evaluate("location.pathname + location.search")
        except Exception:  # noqa: BLE001 — navegando
            return ""

    def fechar_aviso(self, nome_print: str | None = None) -> bool:
        """Fecha o aviso "o Physiq mudou" se ele aparecer (1 vez por pessoa) — e tira o print dele antes, se pedido."""
        if not self.esperar(lambda: self.tem("[data-aviso-mudanca]"), 8):
            return False
        self.pg.wait_for_timeout(900)
        if nome_print:
            self.print(nome_print)
        self.pg.locator("[data-aviso-mudanca-ok]").click()
        self.esperar(lambda: not self.tem("[data-aviso-mudanca]"), 10)
        return True

    def tem(self, seletor: str) -> bool:
        return self.pg.locator(seletor).count() > 0 and self.pg.locator(seletor).first.is_visible()

    def texto(self) -> str:
        try:
            return self.pg.inner_text("body")
        except Exception:  # noqa: BLE001
            return ""

    def print(self, nome: str, inteira: bool = False) -> str:
        PRINTS.mkdir(parents=True, exist_ok=True)
        caminho = PRINTS / f"{self.prefixo}_{nome}.png"
        self.pg.screenshot(path=str(caminho), full_page=inteira)
        return str(caminho)

    def fim(self) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e]
        p.check(not graves, f"[{self.nome}] sem erro de página ({graves[:2]})")
        self.ctx.close()


def caso_entrar(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "entrar")
    c.pg.goto(a.base + "/entrar", wait_until="domcontentloaded")
    p.check(c.esperar(lambda: c.tem("[data-entrar-google]"), 90), "Entrar abre com o botão do Google")
    p.check(c.tem("[data-entrar-email]") and c.tem("[data-sou-profissional]"), "Entrar tem e-mail e senha e 'Sou profissional'")
    c.pg.wait_for_timeout(800)
    c.print("entrar")
    c.pg.locator("[data-sou-profissional]").click()
    # W4: o cadastro de profissional abriu (antes: "abre em breve")
    p.check(c.esperar(lambda: "14 dias grátis" in c.texto(), 5), "'Sou profissional' explica o cadastro com 14 dias grátis (W4)")
    c.pg.goto(a.base + "/entrar/email", wait_until="domcontentloaded")
    p.check(c.esperar(lambda: c.tem("[data-form-email]"), 30), "Entrar com e-mail e senha abre")
    c.pg.wait_for_timeout(500)
    c.print("entrar_email")
    # negativo: senha errada
    c.pg.get_by_placeholder("voce@email.com").fill("teste@teste.com")
    c.pg.get_by_placeholder("Sua senha").fill("senha-errada-w03")
    c.pg.locator("[data-btn-entrar]").click()
    p.check(c.esperar(lambda: "E-mail ou senha incorretos." in c.texto(), 30), "senha errada: 'E-mail ou senha incorretos.'")
    c.fim()


def referrer_do_state(state: str | None) -> str | None:
    """O GoTrue guarda a volta pedida (redirect_to aceito pela allow list) em auth.flow_state.referrer; a não aceita vira o Site URL."""
    if not state or not re.fullmatch(r"[0-9a-f-]{36}", state):
        return None
    r = sql_principal(f"select referrer from auth.flow_state where id = '{state}'")
    return r[0]["referrer"] if r else None


def caso_google(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "google")
    capturado: dict[str, str] = {}

    def ver(req):
        if "/auth/v1/authorize" in req.url:
            capturado.setdefault("authorize", req.url)
        if req.url.startswith("https://accounts.google.com/"):
            capturado.setdefault("google", req.url)

    c.pg.on("request", ver)
    c.pg.goto(a.base + "/entrar", wait_until="domcontentloaded")
    c.esperar(lambda: c.tem("[data-entrar-google]"), 90)
    c.pg.locator("[data-entrar-google]").click()
    p.check(c.esperar(lambda: "google" in capturado, 40), "o botão leva ao Google (302 do authorize do principal)")
    auth = urllib.parse.urlparse(capturado.get("authorize", ""))
    qa = urllib.parse.parse_qs(auth.query)
    p.check(auth.netloc == "api-principal.physiqcalc.com.br" and qa.get("provider") == ["google"], f"authorize no banco principal pelo domínio próprio ({auth.netloc})")
    p.check(qa.get("redirect_to") == [f"{a.base}/entrar"] and qa.get("code_challenge_method", [""])[0].lower() == "s256", f"redirect_to = {a.base}/entrar com PKCE ({qa.get('redirect_to')})")
    g = urllib.parse.parse_qs(urllib.parse.urlparse(capturado.get("google", "")).query)
    p.check(g.get("redirect_uri") == [f"https://{PRINCIPAL_REF}.supabase.co/auth/v1/callback"], f"Google volta no callback do principal ({g.get('redirect_uri')})")
    ref = referrer_do_state((g.get("state") or [None])[0])
    p.check(ref == f"{a.base}/entrar", f"o principal aceitou a volta para o Physiq (flow_state.referrer = {ref})")
    c.fim()
    # APK: o mesmo authorize com o deep link (o que o capacitorAuth manda com skipBrowserRedirect)
    st, _, h = http("GET", f"{API_P}/auth/v1/authorize?provider=google&redirect_to={urllib.parse.quote('com.bertoldo.physiqcalc://login-callback')}"
                    f"&code_challenge=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG&code_challenge_method=s256", seguir=False, cab={"apikey": anon(PRINCIPAL_REF)})
    loc = h.get("Location") or h.get("location") or ""
    gq = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
    p.check(st in (302, 303) and loc.startswith("https://accounts.google.com/"), f"APK: authorize → 302 accounts.google.com ({st})")
    ref = referrer_do_state((gq.get("state") or [None])[0])
    p.check(ref == "com.bertoldo.physiqcalc://login-callback", f"APK: volta pelo deep link com.bertoldo.physiqcalc://login-callback (flow_state.referrer = {ref})")


def reset_aviso(email: str, schema: str) -> None:
    sql_principal(f"""update {schema}.profiles set config = config #- '{{aviso_mudanca_visto,1}}'
                      where id = (select id from auth.users where lower(email) = '{email}')""")


def status_sync(c: Caso) -> str:
    t = c.texto().upper()
    for s in ("SINCRONIZADO", "OFFLINE", "SINCRONIZANDO"):
        if s in t:
            return s
    return "?"


def caso_aluno(nav, a) -> None:
    reset_aviso(CONTAS["aluno"][0], a.schema)
    c = Caso(nav, a.base, a.prefixo, "aluno")
    c.preparar()
    c.entrar_pela_tela("aluno")
    p.check(c.esperar(lambda: c.tem("[data-aviso-mudanca]"), 120), "aluno do Calc: depois do login, o aviso 'o Physiq mudou'")
    c.pg.wait_for_timeout(1200)
    c.print("aviso_mudanca")
    c.pg.locator("[data-aviso-mudanca-ok]").click()
    p.check(c.esperar(lambda: "/treino" in c.caminho() and not c.tem("[data-aviso-mudanca]"), 30), f"aviso fechado e o app abre no Treino ({c.caminho()})")
    p.check(c.esperar(lambda: status_sync(c) == "SINCRONIZADO", 120), f"PowerSync conectado com a sessão da troca ({status_sync(c)})")
    visto = sql_principal(f"""select (config -> 'aviso_mudanca_visto' ->> '1') is not null as v from {a.schema}.profiles
                               where id = (select id from auth.users where lower(email) = '{CONTAS['aluno'][0]}')""")[0]["v"]
    p.check(visto, "o aviso ficou marcado como visto (uma vez por pessoa)")
    uid_t = sql_treino(f"""select i.treino_user_id::text as tid from {a.schema}.physiq_identidades i join auth.users u on u.id = i.treino_user_id
                           where lower(u.email) = '{CONTAS['aluno'][0]}'""")[0]["tid"]
    ls_uid = c.pg.evaluate("() => { try { const k = Object.keys(localStorage).find(x => x.startsWith('sb-') && x.endsWith('-auth-token')); return JSON.parse(localStorage.getItem(k)).user.id } catch { return null } }")
    p.check(ls_uid == uid_t, "a sessão do Treino no aparelho é a do usuário antigo do Calc (vínculo do script 01)")
    c.pg.wait_for_timeout(2500)
    p.check(c.pg.locator("[data-tabbar]").count() > 0, "barra de abas do app (tela 1)")
    c.print("app_treino")
    # histórico antigo: o calendário do Treino mostra os treinos já feitos (séries antigas do public)
    n_series = sql_treino(f"select count(*)::int as n from public.tb_treino_series where user_id = '{uid_t}'")[0]["n"]
    n_local = c.pg.evaluate("""async () => { try { const db = window.__physiqPowerSync || null; return db ? (await db.getAll('select count(*) as n from tb_treino_series'))[0].n : -1 } catch { return -1 } }""")
    p.check(n_series > 0, f"o aluno tem séries antigas no Banco do Treino ({n_series}); no aparelho (SQLite): {n_local if n_local >= 0 else 'n/d'}")
    # as séries antigas na tela: o histórico de treinos (vem do PowerSync, do usuário antigo do Calc)
    c.pg.locator("button[title='Histórico de Treinos']").first.click()
    p.check(c.esperar(lambda: "HISTÓRICO DE TREINOS" in c.texto().upper(), 30), "histórico de treinos abre")
    total = c.pg.evaluate("""() => { const el = [...document.querySelectorAll('p')].find(p => /^total$/i.test(p.textContent.trim()));
        return el ? Number(el.nextElementSibling?.textContent?.trim() || 0) : -1 }""")
    p.check(c.esperar(lambda: c.pg.evaluate("""() => { const el = [...document.querySelectorAll('p')].find(p => /^total$/i.test(p.textContent.trim()));
        return el ? Number(el.nextElementSibling?.textContent?.trim() || 0) : 0 }""") > 0, 30), f"o histórico mostra os treinos antigos do Calc (total > 0; {total})")
    c.pg.wait_for_timeout(1200)
    c.print("app_historico_antigo")
    c.pg.go_back() if False else c.pg.goto(c.base + "/treino", wait_until="domcontentloaded")
    c.esperar(lambda: status_sync(c) == "SINCRONIZADO", 90)
    if a.escrever:
        offline_serie(c, a.schema, uid_t)
    c.fim()


def offline_serie(c: Caso, schema: str, uid: str) -> None:
    """A série marcada SEM internet fica na fila e sobe quando a internet volta (staging grava em staging)."""
    hoje = dt.datetime.now(dt.timezone(dt.timedelta(hours=-3))).date().isoformat()
    t0 = dt.datetime.now(dt.timezone.utc).isoformat()
    pg = c.pg
    print("   == offline")
    c.ctx.set_offline(True)
    pg.wait_for_timeout(1500)
    p.check(pg.evaluate("navigator.onLine") is False, "navegador sem internet")
    ja_tem = pg.locator("div[data-exercicio-id]").count() > 0
    if not ja_tem:
        pg.locator("button", has_text=re.compile(r"Adicionar (outro )?treino", re.I)).first.click()
        dlg = pg.locator('[role="dialog"][data-state="open"]')
        dlg.wait_for(state="visible", timeout=15000)
        dlg.get_by_role("button", name=re.compile("Peito", re.I)).first.click()
        pg.wait_for_timeout(800)
    p.check(c.esperar(lambda: pg.locator("div[data-exercicio-id]").count() > 0, 30), "treino do dia na tela sem internet")
    card = pg.locator("div[data-exercicio-id]").first
    ex_id = card.get_attribute("data-exercicio-id")
    oks = card.locator("button", has_text=re.compile(r"^\s*OK\s*$")).count()
    card.locator("button", has_text=re.compile(r"^\s*OK\s*$")).first.click()
    p.check(c.esperar(lambda: card.locator("button", has_text=re.compile(r"^\s*OK\s*$")).count() == oks - 1, 15), "série marcada sem internet aparece na tela")
    pg.wait_for_timeout(1500)
    c.print("app_treino_offline")
    print("   == online de novo")
    corte = len(c.logs)
    c.ctx.set_offline(False)
    linhas_ser: list = []
    linhas_ovr: list = []
    for _ in range(24):
        time.sleep(5)
        linhas_ovr = sql_treino(f"select id::text as id from {schema}.tb_treino_dia_override where user_id='{uid}' and data_treino='{hoje}' and created_at >= '{t0}'")
        linhas_ser = sql_treino(f"select id::text as id, exercicio_id::text as ex from {schema}.tb_treino_series where user_id='{uid}' and data_treino='{hoje}' and created_at >= '{t0}'")
        if (ja_tem or linhas_ovr) and linhas_ser:
            break
    problemas = [l for l in c.logs[corte:] if re.search(r"\[PowerSync\] (Upload error|Upload exception|FATAL)", l)]
    p.check(not problemas, f"envio sem erro ao voltar a internet ({problemas[:2]})")
    p.check(any(l["ex"] == ex_id for l in linhas_ser), f"a série chegou ao banco ({schema}.tb_treino_series: {len(linhas_ser)})")
    ids_s = ",".join(f"'{l['id']}'" for l in linhas_ser)
    ids_o = ",".join(f"'{l['id']}'" for l in linhas_ovr)
    from _comum import exec_treino  # noqa: E402
    if ids_s:
        exec_treino(f"delete from {schema}.tb_treino_series where id in ({ids_s})")
    if ids_o:
        exec_treino(f"delete from {schema}.tb_treino_dia_override where id in ({ids_o})")
    print(f"   limpeza: {len(linhas_ser)} série(s), {len(linhas_ovr)} override(s) apagados de {schema}")


def caso_pessoa(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "pessoa")
    c.preparar()
    c.entrar_pela_tela("pessoa")
    p.check(c.esperar(lambda: "/boas-vindas" in c.caminho() and c.tem("[data-onboarding='TenhoCodigo']"), 120), f"pessoa nova → Boas-vindas ({c.caminho()})")
    p.check(c.tem("[data-onboarding='CriarConta']"), "'Sou profissional' (W4: o cadastro abriu)")
    c.pg.wait_for_timeout(800)
    c.print("boas_vindas")
    c.pg.get_by_placeholder("PROF-NOME-SOBRENOME").fill("PROF-NAO-EXISTE-W3")
    c.pg.get_by_role("button", name="Entrar na lista").click()
    p.check(c.esperar(lambda: c.tem("[data-vinculo-erro]"), 30), "código inválido recusado com a frase certa")
    c.print("boas_vindas_codigo_invalido")
    # não vira nutricionista: o painel não abre
    c.pg.goto(a.base + "/painel", wait_until="domcontentloaded")
    p.check(c.esperar(lambda: "/boas-vindas" in c.caminho(), 60), f"pessoa sem conta não entra no painel ({c.caminho()})")
    c.fim()


def caso_professor(nav, a) -> None:
    reset_aviso(CONTAS["professor"][0], a.schema)
    c = Caso(nav, a.base, a.prefixo, "professor", desktop=True)
    c.preparar()
    c.injetar("professor")
    c.pg.goto(a.base + "/", wait_until="domcontentloaded")
    c.aceitar_porta()  # hml-12
    p.check(c.esperar(lambda: "/painel" in c.caminho() and c.tem("[data-menu-lateral]"), 120), f"professor do Calc cai no painel ({c.caminho()})")
    c.fechar_aviso("aviso_mudanca_painel")
    p.check(c.esperar(lambda: "aluno1" in c.texto().lower() or "Aluno Um" in c.texto(), 90), "painel: os alunos dele (página antiga dentro da casca)")
    card = c.pg.locator("[data-card-conta]").first.inner_text()
    p.check("Rafael Lima" in card, f"card da conta com a conta legado_calc ({card!r})")
    p.check(c.esperar(lambda: c.tem("[data-card-plano]"), 30), "card do plano no rodapé do menu")
    c.pg.wait_for_timeout(1500)
    c.print("painel_professor")
    c.fim()


def caso_master(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "master", desktop=True)
    c.preparar()
    c.injetar("master")
    c.pg.goto(a.base + "/painel/alunos", wait_until="domcontentloaded")
    c.aceitar_porta()  # hml-12
    p.check(c.esperar(lambda: c.tem("[data-menu-lateral]"), 120), "master: painel abre")
    c.fechar_aviso()
    c.pg.goto(a.base + "/master", wait_until="domcontentloaded")
    p.check(c.esperar(lambda: c.tem('[data-casca="master"] [data-menu-lateral]'), 90), "master: /master abre (papel admin do Treino mantido)")
    p.check(c.esperar(lambda: "PROFESSORES ATIVOS" in c.texto().upper(), 90), "master: a visão geral carrega os números (funções master do Treino com a sessão da troca)")
    c.pg.wait_for_timeout(1200)
    c.print("master")
    c.fim()


def caso_nutri(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "nutri", desktop=True)
    c.preparar()
    c.injetar("nutri")
    c.pg.goto(a.base + "/", wait_until="domcontentloaded")
    c.aceitar_porta()  # hml-12
    p.check(c.esperar(lambda: "/painel" in c.caminho() and c.tem("[data-aviso-use-nutri]"), 120), f"nutri → painel com 'use o site do PhysiqNutri' ({c.caminho()})")
    c.fechar_aviso()
    itens = [x.inner_text().strip() for x in c.pg.locator("[data-menu-lateral] [data-nav]").all()]
    p.check("Treinos" not in " ".join(itens), f"sem o módulo Treino, o item Treinos some ({itens})")
    c.pg.wait_for_timeout(1200)
    c.print("painel_nutri")
    c.fim()


def caso_paciente(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "paciente")
    c.preparar()
    c.entrar_pela_tela("paciente")
    p.check(c.esperar(lambda: c.tem("[data-trava-app='use-o-nutri']"), 120), "paciente do Nutri → 'Sua dieta continua no PhysiqNutri por enquanto'")
    c.pg.wait_for_timeout(800)
    c.print("app_paciente_nutri")
    c.fim()


def caso_conflito(nav, a) -> None:
    email, s = CONTAS["conflito"]
    st, sess, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": s}, {"apikey": anon(PRINCIPAL_REF)})
    http("POST", f"{API_P}/functions/v1/vincular-aluno", {"codigo": "PROF-RAFAEL-LIMA"},
         {"Authorization": f"Bearer {sess['access_token']}", "apikey": anon(PRINCIPAL_REF), "x-schema": a.schema, "Origin": a.base})
    try:
        c = Caso(nav, a.base, a.prefixo, "conflito")
        c.preparar()
        c.entrar_pela_tela("conflito")
        p.check(c.esperar(lambda: c.tem("[data-trava-app='troca-conflito']"), 120), "conflito de conta → 'Sua conta precisa de uma conferência'")
        c.pg.wait_for_timeout(800)
        c.print("app_conflito")
        c.fim()
    finally:
        sql_principal(f"delete from {a.schema}.pacientes where user_id = '{sess['user']['id']}'")


def caso_bloqueado(nav, a) -> None:
    conta = sql_principal(f"""select p.conta_id::text as c from {a.schema}.pacientes p join auth.users u on u.id = p.user_id
         where u.email = '{CONTAS['bloqueado'][0]}' and p.deleted_at is null limit 1""")[0]["c"]
    sql_principal(f"update {a.schema}.contas set alunos_bloqueados_em = now(), alunos_bloqueados_msg = 'Acesso pausado pelo master (teste E2E W3).' where id = '{conta}'")
    try:
        c = Caso(nav, a.base, a.prefixo, "bloqueado")
        c.preparar()
        c.entrar_pela_tela("bloqueado")
        p.check(c.esperar(lambda: c.tem("[data-trava-app='bloqueio-master']"), 120), "aluno de conta bloqueada pelo master → 'Acesso pausado'")
        c.fechar_aviso()
        p.check("teste E2E W3" in c.texto(), "com a mensagem do master")
        c.pg.wait_for_timeout(800)
        c.print("app_bloqueado")
        c.fim()
    finally:
        sql_principal(f"update {a.schema}.contas set alunos_bloqueados_em = null, alunos_bloqueados_msg = null where id = '{conta}'")


def caso_offline(nav, a) -> None:
    """Só no build publicado (service worker): entra com internet, fecha, reabre SEM internet → o treino abre."""
    c = Caso(nav, a.base, a.prefixo, "offline")
    c.preparar()
    c.injetar("aluno")
    reset_aviso(CONTAS["aluno"][0], a.schema)
    sql_principal(f"""update {a.schema}.profiles set config = jsonb_set(coalesce(config,'{{}}'::jsonb), '{{aviso_mudanca_visto}}', '{{"1": "e2e"}}'::jsonb, true)
                      where id = (select id from auth.users where lower(email) = '{CONTAS['aluno'][0]}')""")
    c.pg.goto(a.base + "/treino", wait_until="domcontentloaded")
    c.aceitar_porta()  # hml-12
    p.check(c.esperar(lambda: status_sync(c) == "SINCRONIZADO", 150), f"online: treino sincronizado ({status_sync(c)})")
    c.pg.wait_for_timeout(4000)
    c.ctx.set_offline(True)
    c.pg.reload(wait_until="domcontentloaded")
    p.check(c.esperar(lambda: c.pg.locator("[data-tabbar]").count() > 0 and "/treino" in c.caminho() and "Entrar com Google" not in c.texto(), 90),
            f"sem internet: reabre no Treino com as sessões guardadas ({c.caminho()})")
    c.pg.wait_for_timeout(1500)
    c.print("app_treino_reaberto_offline")
    c.ctx.set_offline(False)
    c.fim()


CASOS = {"entrar": caso_entrar, "google": caso_google, "aluno": caso_aluno, "pessoa": caso_pessoa, "professor": caso_professor,
         "master": caso_master, "nutri": caso_nutri, "paciente": caso_paciente, "conflito": caso_conflito, "bloqueado": caso_bloqueado,
         "offline": caso_offline}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default="entrar,google,aluno,pessoa,professor,master,nutri,paciente,conflito,bloqueado")
    ap.add_argument("--escrever", action="store_true", help="grava (série offline) — só com schema staging")
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    a = ap.parse_args()
    a.base = a.base.rstrip("/")
    if a.escrever and a.schema != "staging":
        raise SystemExit("--escrever só no staging")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in a.casos.split(","):
            print(f"== {nome}")
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001 — registra e segue para o próximo caso
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
