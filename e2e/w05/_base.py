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
    espelho_segredo,
    exec_treino,
    http,
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
        st, sess, _ = http("POST", f"{API_P}/auth/v1/token?grant_type=password", {"email": email, "password": s}, {"apikey": anon(PRINCIPAL_REF)})
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
                        {"x-espelho-segredo": espelho_segredo(), "x-schema": schema()}, timeout=120)
        assert st == 200, (st, r)
        res = (r or {}).get("resultados", []) if isinstance(r, dict) else []
        saida.extend(res)
        if not res:
            break
    return saida


def hoje() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date()


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

    def fechar_avisos(self) -> None:
        """Fecha o aviso "o Physiq mudou" (1 vez por pessoa) se ele aparecer."""
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
