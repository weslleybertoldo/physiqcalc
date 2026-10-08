#!/usr/bin/env python3
"""Physiq W4 — E2E de TELA da cobrança das contas + "Sou profissional" (Playwright, contexto limpo por caso) e os prints nos
tamanhos das telas aprovadas (app 390 px × 3,4 como a tela 1; painel 1280 × 883 × 2 = 2560 × 1766, como as telas 6 e 7).

Casos (positivos e negativos), na ordem:
  criar       pessoa nova (sem conta) → Boas-vindas → "Sou profissional" → conta com 14 dias grátis → painel com o card do
              plano "Teste até dd/mm" (tela 6)
  plano       Configurações › Plano no teste (tela 6/7) → Pix → QR e copia-e-cola → "Simular aprovação" → ativa; card do
              menu "Vence em … · Pix"
  cartao      o Brick do Mercado Pago (cartão à vista) abre no painel deslizante
  assinatura  cobrança automática criada com a credencial de TESTE (pendente no MP) → cobrança simulada → card do menu
              "Renova em … · cartão" (tela 6) → cancelar pela tela
  faixa       vence em 5 dias → faixa −7 no topo; o X esconde e continua escondida depois de recarregar
  vencida     relógio: venceu ontem (+ tarefa das 03:40) → tela de plano vencido no lugar do painel → "Pagar agora" → paga →
              painel liberado
  membro      outro membro da conta vencida vê "Fale com <dono>" (sem Pagar)
  legado      legado Calc: a tela Planos de hoje; legado Nutri: o aviso com o link para a Assinatura do PhysiqNutri
  master      o master nunca trava; "Conta master"
Uso: python3 e2e/w04/telas.py --base http://localhost:5173 --prefixo local [--casos a,b] [--schema staging]
(hml-12: no build de staging, logo depois do login a porta do aceite é aceita como a pessoa faria — Caso.aceitar_porta)
Contas: novo.teste.claude@ e membro.teste.claude@physiqnutri.app (criadas aqui, só de teste — senhas em ~/.physiq-teste-<nome>).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import secrets
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, exec_treino, http, senha, service, sql_principal, sql_treino  # noqa: E402

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w04"
API_P = "https://api-principal.physiqcalc.com.br"
CHAVE_PRINCIPAL = "physiq-principal-auth"
MP = "https://api.mercadopago.com"
p = Placar()
SCHEMA = "staging"
ATUAL: dict = {}
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


def senha_de(nome: str) -> str:
    arq = Path.home() / f".physiq-teste-{nome}"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


ADMIN = kv(".physiqcalc-teste-admin")
CONTAS = {
    "novo": ("novo.teste.claude@physiqnutri.app", senha_de("novo")),
    "membro": ("membro.teste.claude@physiqnutri.app", senha_de("membro")),
    "prof1": ("prof1.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
    "master": ("admin.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
    "nutri": ("nutri.teste.claude@physiqnutri.app", senha("nutri")),
}


def garantir_usuario(email: str, senha_: str, nome: str) -> str:
    sp = service(PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    achado = sql_principal(f"select id::text as id from auth.users where lower(email) = '{email}'")
    if achado:
        st, r, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{achado[0]['id']}", {"password": senha_, "email_confirm": True}, cab)
        assert st == 200, (st, r)
        return achado[0]["id"]
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users", {"email": email, "password": senha_, "email_confirm": True, "user_metadata": {"full_name": nome}}, cab)
    assert st == 200, (st, r)
    return r["id"]


def uid(conta: str) -> str:
    return sql_principal(f"select id::text as id from auth.users where lower(email) = '{CONTAS[conta][0]}'")[0]["id"]


def conta_nova(conta: str) -> dict | None:
    r = sql_principal(f"select id::text, situacao, vence_em::text, teste_ate::text, plano, faixa from {SCHEMA}.contas "
                      f"where dono_id = '{uid(conta)}' and origem = 'nova' order by criado_em limit 1")
    return r[0] if r else None


def hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


def mp_teste(metodo: str, caminho: str, corpo: dict | None = None) -> tuple[int, dict]:
    cab = {"Authorization": f"Bearer {Path.home().joinpath('.physiq-mp-test').read_text().strip()}"}
    st, r, _ = http(metodo, f"{MP}{caminho}", corpo, cab)
    return st, (r if isinstance(r, dict) else {})


def fechar_sandbox(conta_id: str) -> None:
    for f in sql_principal(f"select mp_payment_id from {SCHEMA}.conta_faturas where conta_id = '{conta_id}' and status in ('pending','in_process') "
                           f"and mp_payment_id is not null and mp_payment_id not like 'sim-%'"):
        mp_teste("PUT", f"/v1/payments/{f['mp_payment_id']}", {"status": "cancelled"})
    for a in sql_principal(f"select mp_preapproval_id from {SCHEMA}.conta_assinaturas where conta_id = '{conta_id}' and status <> 'cancelled' "
                           f"and mp_preapproval_id is not null and mp_preapproval_id not like 'sim-%'"):
        mp_teste("PUT", f"/preapproval/{a['mp_preapproval_id']}", {"status": "cancelled"})


def preparar_contas() -> None:
    """Pessoa nova SEM conta (o caso 'criar' cria) e o membro de teste; só dados de teste do staging."""
    u_novo = garantir_usuario(CONTAS["novo"][0], CONTAS["novo"][1], "Novo Teste W4")
    garantir_usuario(CONTAS["membro"][0], CONTAS["membro"][1], "Membro Teste W4")
    c = conta_nova("novo")
    if c:
        fechar_sandbox(c["id"])
    sql_principal(f"""delete from {SCHEMA}.contas where dono_id = '{u_novo}' and origem = 'nova';
                      update {SCHEMA}.profiles set tipo_perfil = null, config = coalesce(config, '{{}}'::jsonb) - 'aviso_mudanca_visto' where id = '{u_novo}';""")


class Caso:
    def __init__(self, nav, base: str, prefixo: str, nome: str, desktop: bool = True):
        self.base, self.prefixo, self.nome = base, prefixo, nome
        if desktop:
            self.ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
        else:
            self.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                       locale="pt-BR", timezone_id="America/Sao_Paulo")
        self.pg = self.ctx.new_page()
        self.erros: list[str] = []
        self.console: list[str] = []
        self.falhas_antes = sum(1 for ok, _ in p.itens if not ok)
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("console", lambda m: self.console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        self.pg.on("dialog", lambda d: d.dismiss())
        ATUAL["caso"] = self

    def entrar(self, conta: str, rota: str) -> None:
        email, s = CONTAS[conta]
        # a troca de token tem limite de 20 por hora por pessoa (e o E2E entra muitas vezes com a mesma conta de TESTE):
        # zera só o contador dessa conta de teste no staging
        if "teste" in email and SCHEMA == "staging":
            exec_treino(f"delete from staging.edge_rate_limits where endpoint = 'trocar-token' and user_id = '{uid(conta)}'")
        for tentativa in range(4):  # a rede até o Supabase às vezes devolve 522 (Cloudflare) — tenta de novo
            st, sess, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": s}, {"apikey": anon(PRINCIPAL_REF)})
            if st == 200:
                break
            time.sleep(5 * (tentativa + 1))
        assert st == 200, (conta, st, sess)
        self.pg.goto(self.base + "/privacidade", wait_until="domcontentloaded")
        self.pg.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
            localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [CHAVE_PRINCIPAL, json.dumps(sess)])
        self.pg.goto(self.base + rota, wait_until="domcontentloaded")
        self.aceitar_porta()  # hml-12: a porta vem antes de tudo o que o caso confere (Boas-vindas, painel, plano)

    def esperar(self, cond, timeout: float, passo: float = 0.5) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if cond():
                    return True
            except Exception:  # noqa: BLE001 — navegando
                pass
            time.sleep(passo)
        return False

    def tem(self, seletor: str) -> bool:
        loc = self.pg.locator(seletor)
        return loc.count() > 0 and loc.first.is_visible()

    def texto(self) -> str:
        try:
            return self.pg.inner_text("body")
        except Exception:  # noqa: BLE001
            return ""

    def caminho(self) -> str:
        try:
            return self.pg.evaluate("location.pathname + location.search")
        except Exception:  # noqa: BLE001
            return ""

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

    def fechar_aviso_mudanca(self) -> None:
        if self.esperar(lambda: self.tem("[data-aviso-mudanca-ok]"), 4):
            self.pg.locator("[data-aviso-mudanca-ok]").click()
            self.pg.wait_for_timeout(500)

    def print(self, nome: str) -> str:
        PRINTS.mkdir(parents=True, exist_ok=True)
        caminho = PRINTS / f"{self.prefixo}_{nome}.png"
        self.pg.wait_for_timeout(700)
        self.pg.screenshot(path=str(caminho))
        return str(caminho)

    def diagnostico(self) -> None:
        """Houve falha neste caso: print da tela e o fim do console (para achar a causa sem rodar de novo)."""
        try:
            PRINTS.mkdir(parents=True, exist_ok=True)
            self.pg.screenshot(path=str(PRINTS / f"falha_{self.prefixo}_{self.nome}.png"))
            print(f"   diagnóstico: {self.caminho()} · console: {[x for x in self.console if 'Future Flag' not in x][-6:]}", flush=True)
            sit = self.pg.evaluate("""() => { const k = Object.keys(localStorage).find(x => x.startsWith('physiq_situacao:'));
                if (!k) return null; const s = JSON.parse(localStorage.getItem(k));
                return (s.contas || []).map(c => ({ id: c.id, origem: c.origem, situacao: c.situacao, vence_em: c.vence_em, teste_ate: c.teste_ate,
                  assinatura: c.assinatura })) }""")
            faixas = self.pg.evaluate("() => Object.keys(localStorage).filter(k => k.startsWith('aviso-plano:'))")
            print(f"   situação guardada: {sit} · faixas fechadas: {faixas}", flush=True)
        except Exception:  # noqa: BLE001
            pass

    def fim(self) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e]
        p.check(not graves, f"[{self.nome}] sem erro de página ({graves[:2]})")
        if sum(1 for ok, _ in p.itens if not ok) > self.falhas_antes:
            self.diagnostico()
        self.ctx.close()


def caso_criar(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "criar", desktop=False)
    c.entrar("novo", "/")
    p.check(c.esperar(lambda: "/boas-vindas" in c.caminho(), 90), f"pessoa sem conta cai nas Boas-vindas ({c.caminho()})")
    p.check(c.esperar(lambda: c.tem("[data-onboarding='CriarConta']"), 30) and "14 DIAS GRÁTIS" in c.texto().upper(), "Boas-vindas: 'Sou profissional' com 14 dias grátis")
    p.check("EM BREVE" not in c.texto().upper(), "o 'em breve' da W3 saiu")
    c.print("boas_vindas_profissional")
    c.pg.locator("[data-criar-conta-abrir]").click()
    c.esperar(lambda: c.tem("[data-form-criar-conta]"), 10)
    c.pg.locator("[data-criar-conta-enviar]").click()
    p.check(c.esperar(lambda: "Escolha como você atende." in c.texto(), 10), "negativo: sem o tipo de perfil não cria")
    c.pg.get_by_placeholder("Ex.: Consultoria Ferreira").fill("Consultoria Novo W4")
    c.pg.locator("[data-tipo-perfil='personal']").click()
    c.pg.get_by_placeholder("CREF 000000-G/UF").fill("CREF 000123-G/PE")
    c.pg.wait_for_timeout(300)
    c.print("criar_conta_form")
    c.pg.locator("[data-criar-conta-enviar]").click()
    p.check(c.esperar(lambda: c.tem("[data-conta-criada]"), 30), "conta criada: 'Pronto! Sua conta está no teste até …'")
    p.check(c.esperar(lambda: c.caminho().startswith("/painel"), 60), f"abre o painel ({c.caminho()})")
    conta = conta_nova("novo")
    fim_teste = (hoje() + dt.timedelta(days=14)).isoformat()
    p.check(conta and conta["situacao"] == "teste" and conta["teste_ate"] == fim_teste and conta["plano"] == "treino_nutricao",
            f"no banco: teste até {fim_teste} no Treino + Nutrição ({conta})")
    c.fim()
    # painel no computador: card do plano da tela 6 com o teste real
    d = Caso(nav, a.base, a.prefixo, "criar-painel")
    d.entrar("novo", "/painel/configuracoes/plano")
    d.fechar_aviso_mudanca()
    p.check(d.esperar(lambda: d.tem("[data-card-plano]"), 90), "painel com o card do plano no menu")
    linha = d.pg.locator("[data-card-plano]").inner_text()
    p.check(f"Teste até {fim_teste[8:10]}/{fim_teste[5:7]}" in linha and "Treino + Nutrição" in linha, f"card do plano: '{linha.strip()}' (tela 6)")
    p.check(d.esperar(lambda: d.tem("[data-plano-conta='teste']"), 60), "Configurações › Plano da conta nova (no teste)")
    p.check(d.esperar(lambda: d.tem("[data-escolha-plano]") and "PARA DEPOIS DO TESTE" in d.texto().upper(), 30), "escolha do plano para depois do teste")
    d.print("plano_teste")
    d.fim()


def caso_plano(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "plano")
    c.entrar("novo", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-botao-pix]"), 90), "o Plano abre com os botões de pagar")
    c.pg.locator("[data-plano-opcao='treino_nutricao']").click()
    c.pg.locator("[data-faixa-opcao='f10']").click()
    c.pg.locator("[data-botao-pix]").click()
    p.check(c.esperar(lambda: c.tem("[data-pix-aberto]") and c.tem("[data-pix-copia-cola]"), 60), "Pix gerado: QR e copia-e-cola do Mercado Pago (sandbox)")
    copia = c.pg.locator("[data-pix-copia-cola]").input_value()
    p.check(len(copia) > 30, f"copia-e-cola preenchido ({len(copia)} caracteres)")
    p.check(c.tem("[data-pix-qr]") or "SIMULADO" in copia, "QR do Pix na tela")
    p.check("Aguardando confirmação do Mercado Pago" in c.texto(), "'Aguardando confirmação do Mercado Pago'")
    c.print("plano_pix")
    c.pg.locator("[data-simular-aprovacao]").click()
    conta = None
    p.check(c.esperar(lambda: (conta_nova("novo") or {}).get("situacao") == "ativa", 40), "aprovação simulada → conta ativa no banco")
    conta = conta_nova("novo")
    vence = conta["vence_em"]
    p.check(c.esperar(lambda: c.tem("[data-plano-conta='ativa']"), 40), "a tela mostra a conta ativa")
    linha_esperada = f"Vence em {vence[8:10]}/{vence[5:7]} · Pix"
    p.check(c.esperar(lambda: linha_esperada in c.pg.locator("[data-card-plano]").inner_text(), 40), f"card do menu: '{linha_esperada}'")
    p.check(c.esperar(lambda: c.pg.locator("[data-fatura='approved']").count() >= 1, 20), "histórico de faturas com a paga (✓)")
    c.print("plano_ativa")
    c.fim()


def caso_cartao(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "cartao")
    c.entrar("novo", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-botao-cartao]"), 90), "botão 'Cartão à vista'")
    c.pg.locator("[data-botao-cartao]").click()
    p.check(c.esperar(lambda: c.tem("[data-cartao-mp='avista']"), 20), "o painel do cartão abre")
    p.check(c.esperar(lambda: c.pg.locator("[data-brick-mp] iframe").count() > 0, 60), "o Brick do Mercado Pago carregou (campos seguros em iframe)")
    c.pg.wait_for_timeout(2500)
    c.print("plano_cartao")
    c.fim()


def caso_assinatura(nav, a) -> None:
    conta = conta_nova("novo")
    # cria a cobrança automática como a tela faz (card token do cartão de teste + a função) — o Brick usa o mesmo caminho
    st, tok, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": CONTAS["novo"][0], "password": CONTAS["novo"][1]}, {"apikey": anon(PRINCIPAL_REF)})
    pk = Path.home().joinpath(".physiq-mp-public-test").read_text().strip()
    _, ct, _ = http("POST", f"{MP}/v1/card_tokens?public_key={pk}", {"card_number": "5031433215406351", "expiration_month": 11, "expiration_year": 2030,
                    "security_code": "123", "cardholder": {"name": "APRO", "identification": {"type": "CPF", "number": "12345678909"}}})
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/cobranca-conta", {"acao": "assinar", "conta_id": conta["id"], "plano": conta["plano"], "faixa": conta["faixa"],
                    "card_token": ct["id"], "payment_method_id": "master"},
                    {"Authorization": f"Bearer {tok['access_token']}", "apikey": anon(PRINCIPAL_REF), "x-schema": SCHEMA, "Origin": "https://physiqcalc-staging.vercel.app"})
    p.check(st == 200 and r.get("sandbox") is True, f"cobrança automática criada com a credencial de TESTE ({st}, sandbox={r.get('sandbox')})")
    c = Caso(nav, a.base, a.prefixo, "assinatura")
    c.entrar("novo", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-assinatura='pending']") and c.tem("[data-assinatura-sandbox]"), 90), "card 'Cobrança automática' pendente (ambiente de teste)")
    c.print("plano_assinatura_teste")
    c.pg.locator("[data-simular-recorrente]").click()
    p.check(c.esperar(lambda: c.tem("[data-assinatura='authorized']"), 40), "cobrança simulada → assinatura ativa")
    p.check(c.esperar(lambda: "· cartão" in c.pg.locator("[data-card-plano]").inner_text() and "Renova em" in c.pg.locator("[data-card-plano]").inner_text(), 40),
            f"card do menu 'Renova em … · cartão' (tela 6): '{c.pg.locator('[data-card-plano]').inner_text().strip()}'")
    p.check(c.pg.locator("[data-botao-pix]").is_disabled(), "com a cobrança automática, o Pix fica bloqueado (sem cobrança dobrada)")
    c.print("plano_assinatura_ativa")
    c.pg.locator("[data-cancelar-assinatura]").click()
    c.pg.locator("[data-confirmar-cancelar]").click()
    p.check(c.esperar(lambda: not c.tem("[data-assinatura='authorized']"), 40), "cancelar pela tela")
    pre = sql_principal(f"select mp_preapproval_id, status from {SCHEMA}.conta_assinaturas where conta_id = '{conta['id']}'")
    stp, prm = mp_teste("GET", f"/preapproval/{pre[0]['mp_preapproval_id']}") if pre else (0, {})
    p.check(pre and pre[0]["status"] == "cancelled" and prm.get("status") == "cancelled", f"assinatura cancelada no banco e no MP de teste ({pre and pre[0]['status']} / {prm.get('status')})")
    c.fim()


def caso_faixa(nav, a) -> None:
    conta = conta_nova("novo")
    vence = (hoje() + dt.timedelta(days=5)).isoformat()
    # o teste já acabou (senão o acesso vai até o fim do teste e a faixa só aparece perto dele)
    sql_principal(f"update {SCHEMA}.contas set vence_em = '{vence}', teste_ate = '{(hoje() - dt.timedelta(days=20)).isoformat()}', situacao = 'ativa' where id = '{conta['id']}'")
    c = Caso(nav, a.base, a.prefixo, "faixa")
    c.entrar("novo", "/painel/alunos")
    c.fechar_aviso_mudanca()
    c.esperar(lambda: c.tem("[data-card-plano]"), 120)
    p.check(c.esperar(lambda: c.tem("[data-faixa-aviso-plano='7']"), 120), "vence em 5 dias → faixa de aviso (marco −7)")
    p.check("vence em 5 dias" in c.pg.locator("[data-faixa-aviso-plano]").inner_text(), "texto: 'Seu plano de R$ … vence em 5 dias (dd/mm)'")
    c.print("faixa_aviso")
    c.pg.locator("[data-faixa-aviso-fechar]").click()
    p.check(c.esperar(lambda: not c.tem("[data-faixa-aviso-plano]"), 10), "o X esconde a faixa")
    chave = c.pg.evaluate(f"() => localStorage.getItem('aviso-plano:{conta['id']}:{vence}:7')")
    p.check(chave == "1", "o X guardou aviso-plano:<conta>:<vence>:7 no aparelho")
    c.pg.reload(wait_until="domcontentloaded")
    c.pg.wait_for_timeout(6000)
    p.check(not c.tem("[data-faixa-aviso-plano]"), "recarregou: a faixa fechada não volta (mesmo marco)")
    c.fim()


def caso_vencida(nav, a) -> None:
    conta = conta_nova("novo")
    ontem = (hoje() - dt.timedelta(days=1)).isoformat()
    sql_principal(f"update {SCHEMA}.contas set vence_em = '{ontem}', teste_ate = '{(hoje() - dt.timedelta(days=15)).isoformat()}', situacao = 'ativa' where id = '{conta['id']}'")
    r = sql_principal(f"select {SCHEMA}.contas_tarefa_diaria() r")[0]["r"]
    p.check(conta_nova("novo")["situacao"] == "vencida", f"relógio: venceu ontem + tarefa das 03:40 → vencida ({r})")
    c = Caso(nav, a.base, a.prefixo, "vencida")
    c.entrar("novo", "/painel/alunos")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-plano-vencido='vencida']"), 90), "no dia seguinte: tela de plano vencido no lugar do painel")
    p.check(f"{ontem[8:10]}/{ontem[5:7]}/{ontem[:4]}" in c.pg.locator("[data-plano-vencido-titulo]").inner_text(), "título com a data do vencimento")
    p.check("Seus alunos continuam usando o app" in c.texto(), "diz que os alunos continuam usando o app")
    p.check(c.pg.locator("[data-card-plano]").count() and "Venceu em" in c.pg.locator("[data-card-plano]").inner_text(), "card do menu 'Venceu em …' (rosa)")
    c.print("plano_vencido")
    c.pg.locator("[data-plano-vencido-pagar]").click()
    p.check(c.esperar(lambda: "/painel/configuracoes/plano" in c.caminho() and c.tem("[data-plano-conta='vencida']"), 40), "'Pagar agora' abre o Plano (a única aba que abre)")
    p.check("PARA VOLTAR AO PAINEL" in c.texto().upper(), "escolher o plano para voltar ao painel")
    c.print("plano_vencido_pagar")
    c.pg.locator("[data-botao-pix]").click()
    p.check(c.esperar(lambda: c.tem("[data-simular-aprovacao]"), 60), "Pix gerado")
    c.pg.locator("[data-simular-aprovacao]").click()
    p.check(c.esperar(lambda: (conta_nova("novo") or {}).get("situacao") == "ativa", 40), "pagou → ativa")
    c.pg.goto(a.base + "/painel/alunos", wait_until="domcontentloaded")
    p.check(c.esperar(lambda: not c.tem("[data-plano-vencido]") and c.caminho().startswith("/painel/alunos"), 60), "painel liberado")
    c.pg.wait_for_timeout(4000)
    c.print("painel_liberado")
    c.fim()


def caso_membro(nav, a) -> None:
    conta = conta_nova("novo")
    u_m = uid("membro")
    sql_principal(f"""insert into {SCHEMA}.conta_membros (conta_id, user_id, papeis, status) values ('{conta['id']}', '{u_m}', array['personal'], 'ativo')
                      on conflict (conta_id, user_id) where user_id is not null do update set status = 'ativo', papeis = array['personal'];
                      update {SCHEMA}.contas set vence_em = '{(hoje() - dt.timedelta(days=2)).isoformat()}', situacao = 'vencida' where id = '{conta['id']}';""")
    c = Caso(nav, a.base, a.prefixo, "membro")
    c.entrar("membro", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-plano-vencido='vencida']"), 90), "membro (não dono): tela de plano vencido, até na rota do Plano")
    p.check(c.tem("[data-plano-vencido-fale]") and not c.tem("[data-plano-vencido-pagar]"), f"'Fale com <dono>' e sem Pagar ({c.pg.locator('[data-plano-vencido-fale]').inner_text() if c.tem('[data-plano-vencido-fale]') else ''})")
    c.print("plano_vencido_membro")
    c.fim()
    # volta a conta de teste a ativa (o próximo caso começa em dia)
    sql_principal(f"""update {SCHEMA}.contas set vence_em = '{(hoje() + dt.timedelta(days=30)).isoformat()}', situacao = 'ativa' where id = '{conta['id']}';
                      update {SCHEMA}.conta_membros set status = 'removido', removido_em = now() where conta_id = '{conta['id']}' and user_id = '{u_m}';""")


def caso_legado(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "legado-calc")
    c.entrar("prof1", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-plano-legado='calc']") and c.tem("[data-plano-page]"), 90), "legado Calc: a tela Planos de hoje dentro da casca")
    p.check(not c.tem("[data-plano-conta]"), "legado Calc não vê a cobrança nova")
    c.pg.wait_for_timeout(2500)
    c.print("plano_legado_calc")
    c.fim()
    # a nutri de teste é isenta no staging: fica NÃO isenta (em teste por 5 dias) só durante o print e volta como estava
    un = uid("nutri")
    antes_p = sql_principal(f"select isento_assinatura, teste_ate::text from {SCHEMA}.profiles where id = '{un}'")[0]
    antes_c = sql_principal(f"select id::text, situacao, isenta_motivo, teste_ate::text from {SCHEMA}.contas where dono_id = '{un}' and origem = 'legado_nutri'")
    teste_ate = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=5)).isoformat()
    try:
        sql_principal(f"update {SCHEMA}.profiles set isento_assinatura = false, teste_ate = '{teste_ate}' where id = '{un}'")
        for cc in antes_c:
            sql_principal(f"update {SCHEMA}.contas set situacao = 'teste', isenta_motivo = null, teste_ate = '{teste_ate[:10]}' where id = '{cc['id']}'")
        d = Caso(nav, a.base, a.prefixo, "legado-nutri")
        d.entrar("nutri", "/painel/configuracoes/plano")
        d.fechar_aviso_mudanca()
        p.check(d.esperar(lambda: d.tem("[data-plano-legado='nutri']"), 90), "legado Nutri: o aviso da Assinatura do PhysiqNutri (preço e regras de hoje)")
        p.check(d.tem("[data-link-assinatura-nutri]") and d.pg.locator("[data-link-assinatura-nutri]").get_attribute("href") == "https://nutri.physiqcalc.com.br/configuracoes",
                "link para a Assinatura do site do Nutri")
        p.check(not d.tem("[data-plano-conta]") and not d.tem("[data-plano-vencido]"), "legado Nutri não vê a cobrança nova nem a trava nova")
        d.print("plano_legado_nutri")
        d.fim()
    finally:
        sql_principal(f"update {SCHEMA}.profiles set isento_assinatura = {str(bool(antes_p['isento_assinatura'])).lower()}, "
                      f"teste_ate = {('null' if not antes_p['teste_ate'] else repr(antes_p['teste_ate']))} where id = '{un}'")
        for cc in antes_c:
            sql_principal(f"update {SCHEMA}.contas set situacao = '{cc['situacao']}', isenta_motivo = {('null' if cc['isenta_motivo'] is None else repr(cc['isenta_motivo']))}, "
                          f"teste_ate = {('null' if not cc['teste_ate'] else repr(cc['teste_ate']))} where id = '{cc['id']}'")


def caso_master(nav, a) -> None:
    c = Caso(nav, a.base, a.prefixo, "master")
    c.entrar("master", "/painel/configuracoes/plano")
    c.fechar_aviso_mudanca()
    p.check(c.esperar(lambda: c.tem("[data-plano-legado='calc']") or c.tem("[data-plano-isento]"), 90), "master: Plano sem cobrança (legado isento)")
    p.check(not c.tem("[data-plano-vencido]") and not c.tem("[data-faixa-aviso-plano]"), "o master nunca trava e não recebe faixa")
    c.pg.wait_for_timeout(2500)
    c.print("master_plano")
    c.fim()


CASOS = {"criar": caso_criar, "plano": caso_plano, "cartao": caso_cartao, "assinatura": caso_assinatura, "faixa": caso_faixa,
         "vencida": caso_vencida, "membro": caso_membro, "legado": caso_legado, "master": caso_master}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--sem-preparar", action="store_true")
    a = ap.parse_args()
    casos = [x.strip() for x in a.casos.split(",") if x.strip()]
    if "criar" in casos and not a.sem_preparar:
        preparar_contas()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in casos:
            print(f"\n── {nome}", flush=True)
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = ATUAL.get("caso")
                if caso is not None:
                    caso.diagnostico()
                    try:
                        caso.ctx.close()
                    except Exception:  # noqa: BLE001
                        pass
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
