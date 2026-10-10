"""Physiq W5 — base dos testes de ponta a ponta da equipe (Configurações do profissional) e da correção "painel sem o
Treino". Sem segredo no repo: chaves pela Management API (~/.pc-pat), senhas das contas de TESTE em ~/.physiq-teste-<nome>.

Contas de TESTE da W5 (criadas por e2e/w05/contas_equipe.py; só *.teste.claude@physiqnutri.app — P26):
  w5-dono      w5.dono.teste.claude@physiqnutri.app      dono + personal da "Consultoria Equipe W5" (conta nova)
  w5-personal  w5.personal.teste.claude@physiqnutri.app  convidado como personal pela tela (aceita no 1º login)
  w5-nutri     w5.nutri.teste.claude@physiqnutri.app     convidada como nutricionista pela tela
  w5-aluno1    w5.aluno1.teste.claude@physiqnutri.app    aluno do personal (entra pelo código do Convite do personal)
  w5-aluno2    w5.aluno2.teste.claude@physiqnutri.app    aluno da nutri (entra pelo código do Convite da nutri)
"""
from __future__ import annotations

import datetime as dt
import json
import re
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import (  # noqa: E402,F401
    PRINCIPAL_REF,
    PRINCIPAL_URL,
    TREINO_REF,
    TREINO_URL,
    Placar,
    anon,
    cab_login,
    exec_treino,
    http,
    segredo_do_ambiente,
    segredo_fila,
    senha,
    service,
    sql_principal,
    sql_treino,
)

PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w05"
API_P = "https://api-principal.physiqcalc.com.br"
API_T = "https://api.physiqcalc.com.br"
CHAVE_PRINCIPAL = "physiq-principal-auth"
DOMINIO_TESTE = "@physiqnutri.app"
p = Placar()
ESTADO: dict = {"schema": "staging", "caso": None}


def kv(nome: str) -> dict:
    return dict(l.strip().split("=", 1) for l in Path.home().joinpath(nome).read_text().splitlines() if "=" in l)


def senha_de(nome: str) -> str:
    """Senha da conta de TESTE (cria na 1ª vez, arquivo 600 em ~)."""
    arq = Path.home() / f".physiq-teste-{nome}"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


ADMIN = kv(".physiqcalc-teste-admin")
ALUNO_CALC = kv(".physiqcalc-teste-aluno-teste")
CONTAS: dict[str, tuple[str, str]] = {
    "w5-dono": ("w5.dono.teste.claude@physiqnutri.app", senha_de("w5-dono")),
    "w5-personal": ("w5.personal.teste.claude@physiqnutri.app", senha_de("w5-personal")),
    "w5-nutri": ("w5.nutri.teste.claude@physiqnutri.app", senha_de("w5-nutri")),
    "w5-aluno1": ("w5.aluno1.teste.claude@physiqnutri.app", senha_de("w5-aluno1")),
    "w5-aluno2": ("w5.aluno2.teste.claude@physiqnutri.app", senha_de("w5-aluno2")),
    "prof1": ("prof1.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
    "master": ("admin.teste.claude@physiqcalc.app", ADMIN["SENHA"]),
    "nutri-legado": ("nutri.teste.claude@physiqnutri.app", senha("nutri")),
    "pessoa": ("pessoa.teste.claude@physiqnutri.app", senha("pessoa")),
    "aluno-calc": ("teste@teste.com", ALUNO_CALC["SENHA"]),
}


def email_de_teste(email: str) -> bool:
    """Trava da W5: convite só para endereço de TESTE (nenhum e-mail para pessoa real)."""
    e = (email or "").strip().lower()
    return e.endswith(".teste.claude" + DOMINIO_TESTE) or e.endswith("teste.claude@physiqcalc.app") or e == "teste@teste.com"


def schema() -> str:
    return ESTADO["schema"]


def uid(conta: str) -> str | None:
    r = sql_principal(f"select id::text as id from auth.users where lower(email) = '{CONTAS[conta][0]}'")
    return r[0]["id"] if r else None


def treino_id(conta: str) -> str | None:
    u = uid(conta)
    if not u:
        return None
    r = sql_treino(f"select treino_user_id::text as tid from {schema()}.physiq_identidades where principal_user_id = '{u}'")
    return r[0]["tid"] if r else None


def garantir_usuario(email: str, senha_: str, nome: str) -> str:
    assert email_de_teste(email), f"conta não é de teste: {email}"
    sp = service(PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    achado = sql_principal(f"select id::text as id from auth.users where lower(email) = '{email}'")
    if achado:
        st, r, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{achado[0]['id']}", {"password": senha_, "email_confirm": True}, cab)
        assert st == 200, (st, r)
        return achado[0]["id"]
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users",
                    {"email": email, "password": senha_, "email_confirm": True, "user_metadata": {"full_name": nome}}, cab)
    assert st == 200, (st, r)
    return r["id"]


def sessao(conta: str) -> dict:
    """Login por e-mail e senha no banco principal (pelo domínio próprio, como o app)."""
    email, s = CONTAS[conta]
    st, sess = 0, None
    for tentativa in range(4):  # a rede até o Supabase às vezes devolve 522 (Cloudflare) — tenta de novo
        # W28: captcha global do Auth ligado → o login de teste vai como servidor (cab_login do _comum)
        st, sess, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": s}, cab_login(API_P, anon(PRINCIPAL_REF)))
        if st == 200:
            break
        time.sleep(4 * (tentativa + 1))
    assert st == 200, (conta, st, sess)
    return sess


def rpc(conta_ou_token: str, funcao: str, args: dict | None = None) -> tuple[int, object]:
    """Chama uma função do banco principal COMO a pessoa (RLS/auth.uid() de verdade)."""
    token = sessao(conta_ou_token)["access_token"] if conta_ou_token in CONTAS else conta_ou_token
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/rest/v1/rpc/{funcao}", args or {},
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Content-Profile": schema(), "Accept-Profile": schema()})
    return st, r


def rest(token: str, tabela: str, filtro: str = "select=*") -> tuple[int, object]:
    st, r, _ = http("GET", f"{PRINCIPAL_URL}/rest/v1/{tabela}?{filtro}", None,
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "Accept-Profile": schema()})
    return st, r


def funcao(token: str, nome: str, corpo: dict, origem: str = "https://physiqcalc-staging.vercel.app") -> tuple[int, object]:
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/{nome}", corpo,
                    {"apikey": anon(PRINCIPAL_REF), "Authorization": f"Bearer {token}", "x-schema": schema(), "Origin": origem})
    return st, r


def zerar_limite_troca(conta: str) -> None:
    """A troca de token tem limite de 20/h por pessoa e o E2E entra muitas vezes com a MESMA conta de TESTE: zera só ela."""
    u = uid(conta)
    if u and "teste" in CONTAS[conta][0]:
        exec_treino(f"delete from {schema()}.edge_rate_limits where endpoint = 'trocar-token' and user_id = '{u}'")


def trocar_token(conta: str) -> tuple[int, dict]:
    """Troca o login do principal por uma sessão do Treino (a mesma chamada do app)."""
    zerar_limite_troca(conta)
    tok = sessao(conta)["access_token"]
    st, r, _ = http("POST", f"{API_T}/functions/v1/trocar-token", {}, {"Authorization": f"Bearer {tok}", "x-schema": schema(),
                    "Origin": "https://physiqcalc-staging.vercel.app"})
    return st, (r if isinstance(r, dict) else {})


def processar_espelho(rodadas: int = 6) -> list[dict]:
    """Força a fila do espelho (em vez de esperar os 10 min do pg_cron): chama a espelho-enviar do schema até esvaziar."""
    saida: list[dict] = []
    for _ in range(rodadas):
        st, r, _ = http("POST", f"{PRINCIPAL_URL}/functions/v1/espelho-enviar", {"limite": 50},
                        {"x-espelho-segredo": segredo_fila(), "x-schema": schema()}, timeout=120)  # S8 (hml-16c)
        assert st == 200, (st, r)
        res = (r or {}).get("resultados", []) if isinstance(r, dict) else []
        saida.extend(res)
        if not res:
            break
    return saida


def hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


# ───────────────────────── hml-12 (H-30): o aceite no acesso e o consentimento de saúde ─────────────────────────
# No build de staging, com a versão dos textos ligada no banco (staging.app_config.textos_legais), quem não aceitou a versão vigente
# vê a porta do aceite antes de qualquer área logada; o aluno do app sem o consentimento de saúde ou sem a data de nascimento vê
# também a caixa de saúde e a data. Os E2E antigos entram com contas de TESTE que nunca aceitaram: o fechar_avisos() aceita como a
# pessoa faria. A conta que aceitou uma vez não vê mais a porta (o aceite só cresce). Na produção (antes da virada) não há porta.
REPO = Path(__file__).resolve().parents[2]
PORTA = "[data-aceite-no-acesso]"
# o estado da porta pela situação guardada no aparelho (src/nucleo/situacao.ts: physiq_situacao:<uid>, com o `legal` da hml-12) —
# a mesma ordem da porta (src/publico/legal/aceite/regras.ts): o pendente vem antes da trava de idade
_JS_LEGAL = """() => {
  if (!localStorage.getItem('physiq-principal-auth')) return 'sem_login';
  const k = Object.keys(localStorage).find((x) => x.startsWith('physiq_situacao:'));
  if (!k) return 'carregando';
  try {
    const l = JSON.parse(localStorage.getItem(k)).legal;
    if (!l || !l.versao) return 'livre';
    if (l.aceite_pendente || l.saude_pendente || l.nascimento_pendente) return 'pendente';
    return l.menor ? 'menor' : 'livre';
  } catch (e) { return 'livre'; }
}"""


def versao_dos_textos() -> str:
    """A versão dos textos legais que o app manda no aceite e no consentimento (VERSAO_TEXTOS de src/publico/legal/versao.ts; o
    banco do staging guarda a mesma em app_config.textos_legais — o e2e/hml12/banco.py confere)."""
    m = re.search(r'VERSAO_TEXTOS\s*=\s*"(\d{4}-\d{2}-\d{2})"', (REPO / "src" / "publico" / "legal" / "versao.ts").read_text(encoding="utf-8"))
    if not m:
        raise RuntimeError("VERSAO_TEXTOS não achada em src/publico/legal/versao.ts")
    return m.group(1)


def data_com_idade(anos: int, folga_dias: int = 60) -> str:
    """Uma data de nascimento (AAAA-MM-DD) de quem tem `anos` completos hoje em São Paulo, longe do aniversário (folga em dias)."""
    h = hoje()
    return (dt.date(h.year - anos, h.month, min(h.day, 28)) - dt.timedelta(days=folga_dias)).isoformat()


def nascimento_adulto() -> str:
    """Data de adulto (30 anos) para o aceite e o plano sem profissional (18+)."""
    return data_com_idade(30)


def args_sem_profissional(objetivo: str, plano: str, nascimento: str | None = None) -> dict:
    """Os argumentos da entrar_sem_profissional de 5 (hml-12): a de 2 devolve atualize_o_app com a versão dos textos ligada no banco
    (o staging). Data de adulto (o plano do app é 18+), o consentimento de saúde da versão do app e a origem 'site'."""
    return {"p_objetivo": objetivo, "p_plano": plano, "p_nascimento": nascimento or nascimento_adulto(),
            "p_consentimento": versao_dos_textos(), "p_origem": "site"}


def estado_da_porta(caso) -> str:
    """sem_login · carregando (a situação ainda não chegou) · livre (sem a versão ligada ou nada pendente) · pendente · menor."""
    try:
        return caso.pg.evaluate(_JS_LEGAL) or "carregando"
    except Exception:  # noqa: BLE001 — navegando
        return "carregando"


def porta_na_tela(caso, timeout: float = 40) -> bool:
    """Espera a situação chegar e diz se a porta do aceite está na tela. Sem login, sem a versão ligada, nada pendente, a trava de
    idade ou o aviso "o Physiq mudou" na tela (ele só monta depois da porta): False assim que souber. Pendente e a porta não vem
    (rota livre — páginas públicas e exclusão — ou sem internet): False depois de 10 s."""
    visto = {"estado": "carregando"}

    def decidiu() -> bool:
        if caso.tem(PORTA):
            return True
        if caso.tem("[data-tela-menor]") or caso.tem("[data-aviso-mudanca-ok]"):
            visto["estado"] = "outra"
            return True
        visto["estado"] = estado_da_porta(caso)
        return visto["estado"] != "carregando"

    caso.esperar(decidiu, timeout)
    if caso.tem(PORTA):
        return True
    return visto["estado"] == "pendente" and caso.esperar(lambda: caso.tem(PORTA), 10)


def marcar(loc) -> None:
    """Marca a caixa (input checkbox, [role=checkbox] ou o rótulo em volta dela), se ainda não estiver marcada."""
    alvo = loc.first
    for tentativa in (alvo, alvo.locator("input[type='checkbox'], [role='checkbox']").first):
        try:
            if tentativa.count() and not tentativa.is_checked():
                tentativa.check(timeout=5000)
            if tentativa.count():
                return
        except Exception:  # noqa: BLE001 — não é caixa: tenta a de dentro
            continue
    alvo.click()


def preencher_porta(caso, nascimento: str | None = None) -> None:
    """Na tela do aceite: a caixa do aceite e, quando aparecem (aluno do app), a caixa de saúde e a data de nascimento."""
    pg = caso.pg
    marcar(pg.locator("[data-aceite-caixa]"))
    if pg.locator(f"{PORTA} [data-consentimento-saude-caixa]").count():
        marcar(pg.locator(f"{PORTA} [data-consentimento-saude-caixa]"))
    data = pg.locator(f"{PORTA} [data-campo-nascimento] input[type='date']")
    if data.count() and data.first.is_visible():
        data.first.fill(nascimento or nascimento_adulto())


def aceitar_a_porta(caso, nascimento: str | None = None, timeout: float = 60) -> tuple[bool, str]:
    """Preenche a tela do aceite, clica em "Aceitar e continuar" e espera a tela sumir. Devolve (saiu, o erro da tela, se ficou)."""
    preencher_porta(caso, nascimento)
    botao = caso.pg.locator("[data-aceitar]").first
    caso.esperar(lambda: botao.is_enabled(), 10)
    botao.click()
    saiu = caso.esperar(lambda: not caso.tem(PORTA), timeout)
    erro = ""
    if not saiu and caso.pg.locator("[data-aceite-erro]").count():
        erro = caso.pg.locator("[data-aceite-erro]").first.inner_text().strip()
    return saiu, erro


class Caso:
    """Um contexto limpo do navegador por caso (painel 1280 × 883 × 2 = 2560 × 1766, como as telas 6–8)."""

    def __init__(self, nav, base: str, prefixo: str, nome: str, desktop: bool = True):
        self.base, self.prefixo, self.nome = base, prefixo, nome
        if desktop:
            self.ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo",
                                       service_workers="block")
        else:
            self.ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                       locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
        # service worker bloqueado: com ele a chamada à API sai pelo worker e o Playwright não vê o pedido na página (a contagem
        # das trocas de token — "sem laço" — precisa ver todos)
        self.pg = self.ctx.new_page()
        self.erros: list[str] = []
        self.console: list[str] = []
        self.trocas: list[str] = []
        self.falhas_antes = sum(1 for ok, _ in p.itens if not ok)
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)))
        self.pg.on("console", lambda m: self.console.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        self.pg.on("request", lambda r: self.trocas.append(r.method) if "/functions/v1/trocar-token" in r.url and r.method == "POST" else None)
        self.rede: list[str] = []
        self.pg.on("response", lambda r: self.rede.append(f"{r.status} {r.request.method} {r.url.split('?')[0][-60:]}")
                   if ("/functions/v1/" in r.url or "/rpc/" in r.url) and r.request.method != "OPTIONS" else None)
        self.pg.on("dialog", lambda d: d.accept())
        ESTADO["caso"] = self

    def confirmar_no_app(self, espera: float = 10.0) -> bool:
        """hml-18a (H-40, B): a confirmação do APP (src/ui/premium/Confirmar.tsx, o AlertDialog com o verbo da ação) no lugar do
        window.confirm. Antes o diálogo nativo era aceito sozinho (o page.on("dialog") acima); agora o teste toca no botão da ação
        ([data-confirmar-ok]) e espera a janela sair. Chame logo depois do toque que pedia a confirmação. False = não apareceu."""
        ok = self.pg.locator("[role=alertdialog][data-state=open] [data-confirmar-ok]").first
        try:
            ok.wait_for(state="visible", timeout=int(espera * 1000))
        except Exception:  # noqa: BLE001
            return False
        ok.click()
        try:
            self.pg.locator("[role=alertdialog]").first.wait_for(state="detached", timeout=5000)
        except Exception:  # noqa: BLE001
            pass
        return True

    def entrar(self, conta: str, rota: str, zerar: bool = True) -> dict:
        if zerar and schema() == "staging":
            zerar_limite_troca(conta)
        sess = sessao(conta)
        self.pg.goto(self.base + "/privacidade", wait_until="domcontentloaded")
        self.pg.evaluate("""([k, v]) => { localStorage.setItem(k, v); localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));
            localStorage.setItem('physiqcalc-pwa-dismissed', 'true'); }""", [CHAVE_PRINCIPAL, json.dumps(sess)])
        self.pg.goto(self.base + rota, wait_until="domcontentloaded")
        return sess

    def ir(self, rota: str) -> None:
        self.pg.goto(self.base + rota, wait_until="domcontentloaded")

    def esperar(self, cond, timeout: float, passo: float = 0.5) -> bool:
        """Espera a condição; entre as tentativas o Playwright roda (wait_for_timeout), senão os eventos da página (pedidos
        de rede contados, console) só chegam na próxima chamada à página."""
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if cond():
                    return True
            except Exception:  # noqa: BLE001 — navegando
                pass
            try:
                self.pg.wait_for_timeout(passo * 1000)
            except Exception:  # noqa: BLE001 — página fechando
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
        """hml-12: a porta do aceite, se aparecer — marca a caixa (e, no aluno do app, a caixa de saúde e a data de 30 anos atrás),
        clica em "Aceitar e continuar" e espera a tela sumir. True = aceitou."""
        if not porta_na_tela(self, timeout):
            return False
        saiu, erro = aceitar_a_porta(self)
        p.check(saiu, f"[{self.nome}] porta do aceite (hml-12): aceitou e a tela abriu" + (f" — erro na tela: {erro!r}" if erro else ""))
        return saiu

    def fechar_avisos(self) -> None:
        """A porta do aceite (hml-12), se aparecer; depois fecha o aviso "o Physiq mudou" (1 vez por pessoa) se ele aparecer."""
        self.aceitar_porta()
        if self.esperar(lambda: self.tem("[data-aviso-mudanca-ok]"), 4):
            self.pg.locator("[data-aviso-mudanca-ok]").click()
            self.pg.wait_for_timeout(500)

    def print(self, nome: str) -> str:
        PRINTS.mkdir(parents=True, exist_ok=True)
        caminho = PRINTS / f"{self.prefixo}_{nome}.png"
        self.pg.wait_for_timeout(800)
        self.pg.screenshot(path=str(caminho))
        return str(caminho)

    def diagnostico(self) -> None:
        try:
            PRINTS.mkdir(parents=True, exist_ok=True)
            self.pg.screenshot(path=str(PRINTS / f"falha_{self.prefixo}_{self.nome}.png"))
            print(f"   diagnóstico: {self.caminho()} · console: {[x for x in self.console if 'Future Flag' not in x and 'preloaded' not in x][-6:]}", flush=True)
            print(f"   rede: {self.rede[-12:]}", flush=True)
        except Exception:  # noqa: BLE001
            pass

    def fim(self) -> None:
        graves = [e for e in self.erros if "ResizeObserver" not in e]
        p.check(not graves, f"[{self.nome}] sem erro de página ({graves[:2]})")
        if sum(1 for ok, _ in p.itens if not ok) > self.falhas_antes:
            self.diagnostico()
        self.ctx.close()
