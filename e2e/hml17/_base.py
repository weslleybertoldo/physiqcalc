"""Physiq hml-17 (H-38 · H-39 · H-53, 10/10/2026) — base dos E2E da hml-17 (api.py e telas.py).

Reaproveita a base da hml-09 (C: ler() SÓ LEITURA, Saida, Sessoes) e a da W5 (B5: http, chaves pela Management API com ~/.pc-pat,
login de TESTE por e-mail e senha pelo cab_login — o captcha global da W28 —, o Caso do navegador e a porta do aceite da hml-12).
Novo aqui:
  · Contas  as contas de TESTE da hml-17 (só *.teste.claude@physiqnutri.app): w5p-nutri (nutricionista), w5p-personal (dono + personal),
            w5p-aluna (a aluna dos 2, com o plano de 22 itens), w7b-sozinho (aluno do app sem profissional), w13-dono (profissional de
            OUTRA conta) e w27-master (master só no staging.profiles);
  · Logins  1 login por conta por rodada (guardado) e, no fim, o logout SÓ das sessões que o teste abriu (scope=local — nunca o global);
  · Tela    o navegador com a sessão ANTES do 1º documento (add_init_script): com a sessão posta numa página já aberta, o app da página
            velha acha a sessão ao sair e chama o pos-login também (o "pos-login 2x" da spec §1.1); cair_api()/voltar_api() =
            route.abort nos 2 domínios da API (rest, functions, storage) — o /auth/ passa (a sessão fica); o contador de pedidos por
            alvo (rpc/tabela/função + ação), com o tempo desde a abertura.
Sem segredo nem dado pessoal na saída: chaves pela Management API, senhas em ~/.physiq-teste-<nome> (600); das respostas só saem
contagens, status e as kcal das contas de TESTE.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]

_ESPEC = importlib.util.spec_from_file_location("_comum_hml09", REPO / "e2e" / "hml09" / "_comum.py")
C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_comum_hml09"] = C
_ESPEC.loader.exec_module(C)  # type: ignore[union-attr]
B5 = C.B5

SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml17"
C.SAIDA = SCRATCH / "agente"
PRINTS_RAIZ = SCRATCH / "prints"
PRINCIPAL_REF, PRINCIPAL_URL = C.PRINCIPAL_REF, C.PRINCIPAL_URL
API_P_HOST = "api-principal.physiqcalc.com.br"
API_T_HOST = "api.physiqcalc.com.br"
API_P = f"https://{API_P_HOST}"
# a queda da API (spec §4): rest, rpc, functions e storage dos 2 domínios; o /auth/ passa
QUEDA = re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/(rest|functions|storage)/")

CONTAS = {
    "w5p-nutri": "w5p.nutri.teste.claude@physiqnutri.app",
    "w5p-personal": "w5p.personal.teste.claude@physiqnutri.app",
    "w5p-aluna": "w5p.aluna.teste.claude@physiqnutri.app",
    "w7b-sozinho": "w7b.sozinho.teste.claude@physiqnutri.app",
    "w13-dono": "w13.dono.teste.claude@physiqnutri.app",
    "w27-master": "w27.master.teste.claude@physiqnutri.app",
}
for _chave, _email in CONTAS.items():
    if _chave not in B5.CONTAS:
        B5.CONTAS[_chave] = (_email, B5.senha_de(_chave))
    assert C.eh_email_de_teste(B5.CONTAS[_chave][0]), _chave


def usar_schema(schema: str) -> None:
    assert schema in ("staging", "public"), schema
    B5.ESTADO["schema"] = schema


def schema() -> str:
    return B5.ESTADO["schema"]


def ler(sql: str) -> list[dict]:
    """SQL SÓ LEITURA no principal (read_only: o Postgres recusa qualquer escrita na transação)."""
    return C.ler(PRINCIPAL_REF, sql)


def txt(v: object) -> str:
    return C.txt(v)


# ───────────────────────── logins ─────────────────────────
class Logins:
    """1 login por conta (guardado) e, no fim, o logout local de cada sessão que o teste abriu."""

    def __init__(self) -> None:
        self.sessoes = C.Sessoes()
        self.por_conta: dict[str, dict] = {}

    def sessao(self, conta: str) -> dict:
        if conta in self.por_conta:
            return self.por_conta[conta]
        email = B5.CONTAS[conta][0]
        # *.teste.claude@physiqnutri.app (P26) ou as de teste da produção (teste@teste.com, admin.teste.claude@physiqcalc.app — a regra
        # do B5); nunca as contas demo da Play (revisao.*)
        if not (C.eh_email_de_teste(email) or B5.email_de_teste(email)) or "revisao" in email.lower():
            raise SystemExit(f"não é conta de teste: {conta}")
        s = B5.sessao(conta)
        self.sessoes.guardar("principal", s["access_token"], f"{conta} (login do teste)")
        self.por_conta[conta] = s
        return s

    def token(self, conta: str) -> str:
        return self.sessao(conta)["access_token"]

    def uid(self, conta: str) -> str:
        return (self.sessao(conta).get("user") or {}).get("id") or ""

    def fechar(self, o) -> None:
        self.sessoes.fechar(o)


# ───────────────────────── API (como a pessoa) ─────────────────────────
def cab(token: str | None) -> dict:
    """O que o app manda: a chave pública e, com login, o token da pessoa (sem login: só a publishable)."""
    chave = B5.anon(PRINCIPAL_REF)
    return {"apikey": chave, "Authorization": f"Bearer {token or chave}", "Accept-Profile": schema(), "Content-Profile": schema()}


def rpc(token: str | None, funcao: str, args: dict | None = None) -> tuple[int, object]:
    st, r, _ = B5.http("POST", f"{API_P}/rest/v1/rpc/{funcao}", args or {}, cab(token), timeout=90)
    return st, r


def rest(token: str | None, tabela: str, filtro: str, contar: bool = False) -> tuple[int, object, dict]:
    h = cab(token)
    if contar:
        h["Prefer"] = "count=exact"
    return B5.http("GET", f"{API_P}/rest/v1/{tabela}?{filtro}", None, h, timeout=90)


def total_do_cabecalho(h: dict) -> int | None:
    v = C.cabecalho(h, "content-range")
    m = re.search(r"/(\d+)$", v or "")
    return int(m.group(1)) if m else None


# ───────────────────────── as contas da massa w5p (só leitura) ─────────────────────────
def matricula_da_aluna() -> str:
    r = ler(f"select p.id::text as id from {schema()}.pacientes p join auth.users u on u.id = p.user_id "
            f"where lower(u.email) = {txt(CONTAS['w5p-aluna'])} and p.deleted_at is null order by p.created_at limit 2")
    if len(r) != 1:
        raise SystemExit(f"a w5p-aluna tem de ter 1 matrícula viva no {schema()} (achei {len(r)})")
    return C.uuid_ok(r[0]["id"])


# ───────────────────────── a conta das kcal (porte do src/nutricao/editor/lib/dietaUtil.ts) ─────────────────────────
def arred(n: float, casas: int = 2) -> float:
    """Math.round(n · 10^casas) / 10^casas do JS (meio para cima)."""
    f = 10 ** casas
    return (n * f + 0.5) // 1 / f if n >= 0 else -((-n * f + 0.5) // 1) / f


def gramas_do_item(i: dict) -> float:
    """gramasDoItem: pela medida caseira (quantidade × gramas da medida) quando houver; senão a quantidade_g."""
    a = i.get("alimento") or {}
    m = next((x for x in (a.get("medidas_caseiras") or []) if x.get("id") == i.get("medida_caseira_id")), None) \
        if i.get("medida_caseira_id") else None
    qm = i.get("quantidade_medida")
    if m and qm is not None and float(qm) > 0:
        return arred(float(qm) * float(m["gramas"]), 2)
    g = float(i.get("quantidade_g") or 0)
    return arred(g, 2) if g > 0 else 0.0


def kcal_do_item(i: dict) -> float:
    """macrosDoItem(i).energia_kcal: regra de 3 dos 100 g (porGramas, 2 casas); sem alimento ou sem kcal = 0."""
    a = i.get("alimento")
    if not a or a.get("energia_kcal") is None:
        return 0.0
    return arred(float(a["energia_kcal"]) * gramas_do_item(i) / 100, 2)


def itens_do_plano(plano: dict) -> list[dict]:
    return [i for r in (plano.get("refeicoes") or []) for i in (r.get("itens") or [])]


def kcal_do_plano(plano: dict) -> float:
    """totaisDoPlano(refeicoes).energia_kcal (todas as refeições — o data-plano-kcal da lista)."""
    return arred(sum(kcal_do_item(i) for i in itens_do_plano(plano)), 2)


def assinatura(plano: dict) -> list[tuple]:
    """O conjunto (alimento_id, energia_kcal do alimento, gramas) dos itens — o que os 3 perfis têm de ver igual."""
    saida = []
    for i in itens_do_plano(plano):
        a = i.get("alimento") or {}
        kcal = a.get("energia_kcal")
        saida.append((i.get("alimento_id"), None if kcal is None else float(kcal), gramas_do_item(i)))
    return sorted(saida, key=lambda t: (str(t[0]), t[1] or 0, t[2]))


# ───────────────────────── o navegador ─────────────────────────
def alvo(url: str) -> tuple[str, str]:
    p = urlparse(url).path
    if m := re.match(r"^/rest/v1/rpc/([A-Za-z0-9_]+)", p):
        return "rpc", m.group(1)
    if m := re.match(r"^/rest/v1/([A-Za-z0-9_]+)", p):
        return "tab", m.group(1)
    if m := re.match(r"^/functions/v1/([A-Za-z0-9_-]+)", p):
        return "fn", m.group(1)
    if p.startswith("/auth/"):
        return "auth", p.replace("/auth/v1/", "")
    if p.startswith("/storage/"):
        return "storage", "sign" if "/object/sign/" in p else "objeto"
    return "outro", "?"


def acao_do_corpo(req) -> str | None:
    try:
        b = json.loads(req.post_data or "{}")
        return b.get("action") or b.get("acao") if isinstance(b, dict) else None
    except Exception:  # noqa: BLE001
        return None


def rpcs_de_leitura() -> set[str]:
    """As RPCs que só leem (RPC_SO_LEITURA de src/integrations/repeticao.ts — o repeticao.test.ts confere que toda RPC do front está
    decidida): qualquer outra é tratada como escrita pela Guarda."""
    texto = (REPO / "src" / "integrations" / "repeticao.ts").read_text(encoding="utf-8")
    bloco = texto.split("export const RPC_SO_LEITURA", 1)[1].split("]);", 1)[0]
    return set(re.findall(r'"([a-z0-9_]+)"', bloco))


LEITURAS_PAGAMENTOS = {"prof_resumo", "prof_aluno", "prof_aluno_cobrancas", "aluno_status", "aluno_historico"}
LEITURAS_SEMANA = {"get", "volume", "volumePraticado", "getSeriesPadrao", "exerciciosTreino", "semanaAtual", "resolverAluno", "quemRecebe",
                   "quemRecebeLista", "modelos"}


class Guarda:
    """PRODUÇÃO SÓ LEITURA (o molde do e2e/w26/prod.py e do e2e/hml14/telas.py): o navegador bloqueia toda escrita das telas —
    POST/PATCH/PUT/DELETE em tabela, RPC fora da lista de leitura, Storage que não é o "sign", e nas funções as ações que gravam
    (pagamentos-aluno fora das leituras, admin-semana-treinos fora das leituras, admin-delete-user, admin-update-user, admin-tags que
    não lista). O resto segue (fallback: a queda da API, quando ligada, vem antes e aborta)."""

    def __init__(self) -> None:
        self.bloqueadas: list[str] = []
        self.leitura = rpcs_de_leitura()

    def escrita(self, req) -> bool:
        u, m = req.url, req.method
        if urlparse(u).hostname not in (API_P_HOST, API_T_HOST) or m in ("GET", "HEAD", "OPTIONS"):
            return False
        tipo, nome = alvo(u)
        acao = acao_do_corpo(req)
        if tipo == "tab":
            return True
        if tipo == "rpc":
            return nome not in self.leitura
        if tipo == "storage":
            return nome != "sign"
        if tipo == "fn":
            return (nome == "pagamentos-aluno" and acao not in LEITURAS_PAGAMENTOS) or nome in ("admin-delete-user", "admin-update-user") \
                or (nome == "admin-semana-treinos" and acao not in LEITURAS_SEMANA) \
                or (nome == "admin-tags" and not str(acao or "").lower().startswith(("list", "get")))
        return False

    def instalar(self, ctx) -> None:
        def rota(route, req) -> None:
            if self.escrita(req):
                self.bloqueadas.append(f"{req.method} {alvo(req.url)[0]}:{alvo(req.url)[1]}")
                route.abort()
                return
            route.fallback()
        ctx.route(re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/"), rota)


class Tela:
    """Um contexto limpo do navegador (o Caso da W5: painel 1280 × 883 ou celular 390 × 844), com a sessão da conta de TESTE
    ANTES do 1º documento, a queda da API sob comando e os pedidos contados por alvo (com a Guarda, na produção)."""

    def __init__(self, nav, base: str, prefixo: str, nome: str, desktop: bool = True, guarda: Guarda | None = None) -> None:
        self.caso = B5.Caso(nav, base, prefixo, nome, desktop=desktop)
        self.pg, self.ctx, self.base, self.nome = self.caso.pg, self.caso.ctx, base, nome
        if guarda:
            guarda.instalar(self.ctx)
        self.largura = 1280 if desktop else 390
        self.pedidos: list[dict] = []
        self.t0 = time.time()
        self.caida = False
        self.pg.on("request", self._anotar)

    # pedidos
    def _anotar(self, req) -> None:
        u = urlparse(req.url)
        if u.hostname not in (API_P_HOST, API_T_HOST) or req.method == "OPTIONS":
            return
        tipo, nome = alvo(req.url)
        corpo = req.post_data or ""
        self.pedidos.append({"t": round(time.time() - self.t0, 2), "host": "P" if u.hostname == API_P_HOST else "T", "metodo": req.method,
                             "tipo": tipo, "nome": nome, "acao": acao_do_corpo(req) if tipo == "fn" else None, "url": req.url,
                             "corpo": corpo, "chave": hashlib.sha1((u.query + "|" + corpo).encode()).hexdigest()[:8], "caida": self.caida})

    def zerar_pedidos(self) -> None:
        self.pedidos = []
        self.t0 = time.time()

    def por_alvo(self, sem_auth: bool = True) -> dict[str, int]:
        cont: dict[str, int] = {}
        for p in self.pedidos:
            if sem_auth and p["tipo"] == "auth":
                continue
            k = f"{p['tipo']}:{p['nome']}" + (f"({p['acao']})" if p["acao"] else "")
            cont[k] = cont.get(k, 0) + 1
        return dict(sorted(cont.items(), key=lambda x: -x[1]))

    def contar(self, tipo: str, nome: str, filtro=None) -> int:
        return sum(1 for p in self.pedidos if p["tipo"] == tipo and p["nome"] == nome and (filtro is None or filtro(p)))

    # entrada e queda
    def entrar(self, logins: Logins, conta: str, rota: str, conta_ativa: str | None = None) -> None:
        """A sessão ANTES do 1º documento (só se ainda não houver: depois do refresh o app guarda a nova) e a rota."""
        if schema() == "staging":
            B5.zerar_limite_troca(conta)  # a troca de token tem limite por hora (só no staging)
        s = logins.sessao(conta)
        uid = (s.get("user") or {}).get("id") or ""
        extra = f"localStorage.setItem('physiq_conta_ativa:{uid}', {json.dumps(conta_ativa)});" if conta_ativa and uid else ""
        self.ctx.add_init_script(
            "(v => { try { if (!localStorage.getItem('physiq-principal-auth')) { localStorage.setItem('physiq-principal-auth', v);"
            " localStorage.setItem('physiqcalc-pwa-dismissed', 'true');"
            " localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));" + extra + " } } catch (e) {} })("
            + json.dumps(json.dumps(s)) + ")")
        self.ir(rota)

    def ir(self, rota: str) -> None:
        self.zerar_pedidos()
        self.pg.goto(self.base + rota, wait_until="domcontentloaded")

    def cair_api(self) -> None:
        if not self.caida:
            self.ctx.route(QUEDA, lambda r: r.abort())
            self.caida = True

    def voltar_api(self) -> None:
        if self.caida:
            self.ctx.unroute(QUEDA)
            self.caida = False

    # leitura da tela
    def esperar(self, cond, timeout: float, passo: float = 0.25) -> bool:
        return self.caso.esperar(cond, timeout, passo)

    def tem(self, seletor: str) -> bool:
        return self.caso.tem(seletor)

    def n(self, seletor: str) -> int:
        try:
            return self.pg.locator(seletor).count()
        except Exception:  # noqa: BLE001
            return 0

    def attr(self, seletor: str, nome: str) -> list[str]:
        try:
            return self.pg.evaluate("([s, a]) => [...document.querySelectorAll(s)].map((e) => e.getAttribute(a))", [seletor, nome])
        except Exception:  # noqa: BLE001
            return []

    def texto(self, seletor: str = "body") -> str:
        loc = self.pg.locator(seletor)
        try:
            return re.sub(r"\s+", " ", loc.first.inner_text()).strip() if loc.count() else ""
        except Exception:  # noqa: BLE001
            return ""

    def clicar(self, seletor: str, timeout: float = 10_000) -> None:
        self.pg.locator(seletor).first.click(timeout=timeout)

    def print(self, pasta: Path, nome: str, borrar: str | None = None) -> str:
        """O print em <pasta>/<nome>_<largura>.png (até 3 tentativas: o "Unable to capture screenshot" do notebook)."""
        pasta.mkdir(parents=True, exist_ok=True)
        caminho = pasta / f"{nome}_{self.largura}.png"
        if borrar:
            self.pg.add_style_tag(content=f"{borrar} {{ filter: blur(7px) !important; }}")
        for tentativa in range(3):
            try:
                self.pg.wait_for_timeout(700)
                self.pg.screenshot(path=str(caminho))
                return str(caminho)
            except Exception as e:  # noqa: BLE001
                if "Unable to capture screenshot" not in str(e) or tentativa == 2:
                    raise
                self.pg.wait_for_timeout(1500)
        return str(caminho)

    def fim(self) -> None:
        self.voltar_api()
        self.caso.fim()
