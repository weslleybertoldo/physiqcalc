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


# hml-21a (H-113, "pode ir" da LINUX 3): + o prof_planos (a aba Planos da W-P lê pela pagamentos-aluno › prof_planos; antes, gravação)
LEITURAS_PAGAMENTOS = {"prof_resumo", "prof_aluno", "prof_aluno_cobrancas", "aluno_status", "aluno_historico", "prof_planos"}
LEITURAS_SEMANA = {"get", "volume", "volumePraticado", "getSeriesPadrao", "exerciciosTreino", "semanaAtual", "resolverAluno", "quemRecebe",
                   "quemRecebeLista", "modelos"}
# hml-19a (risco 2 da spec hml-19 §8): função que a Guarda NÃO conhece é gravação (barrada na produção) — uma função nova do jeito 2
# não passa calada por um E2E "só leitura". As que existiam em 11/10/2026 (os 2 projetos) seguem a regra de antes, logo abaixo; a
# nutricao (jeito 2: as gravações da nutrição pelo servidor) grava em TODA ação. Função nova: entra numa das 2 listas, decidida.
FUNCOES_CONHECIDAS = {
    # principal (supabase-principal/functions)
    "agenda-avisar", "aluno-enviar", "alunos", "cobranca-conta", "convites", "entrar-senha", "erro-avisar", "espelho-enviar",
    "espelho-resumo", "excluir-minha-conta", "exportar-meus-dados", "master-contas", "master-financeiro", "master-planos", "mp-assinar",
    "mp-webhook", "mp-webhook-aluno", "mp-webhook-conta", "pagamentos-aluno", "pos-login", "push-enviar", "vincular-aluno",
    "whatsapp-agente", "whatsapp-conectar",
    # Treino (supabase/functions)
    "admin-avaliacoes", "admin-delete-user", "admin-get-overrides", "admin-get-user", "admin-get-workout-plan", "admin-list-users",
    "admin-relatorio", "admin-semana-treinos", "admin-tags", "admin-update-user", "delete-my-account", "espelho-nucleo",
    "master-professores", "mp-payments", "painel-resumo-treino", "professor-convites", "treino-leitura", "trocar-token",
    "vincular-professor",
}
# a automaticas-fila (W-P, 11/10/2026: a fila das cobranças automáticas, chamada só pelo pg_cron) processa cobrança: se um dia sair do
# navegador, é gravação.
# hml-19c (11/10, depois do merge da W1 InfinitePay da LINUX 3): o infinitepay-webhook-aluno (o aviso de pagamento da InfinitePay,
# chamado pelo servidor dela) processa cobrança — se um dia sair do navegador, é gravação.
# hml-19d (decisão I): a financeiro (jeito 2 do Financeiro: as gravações pelo servidor) grava em TODA ação, como a nutricao.
# W2 (LINUX 3, 11/10): a mp-contas-renovar (a renovação do MP do personal, chamada só pelo pg_cron com o S10) e a mp-conectar-retorno
# (a volta do OAuth do MP: o GET que grava a conexão) gravam — se um dia saírem do navegador, é gravação.
# hml-21a (decisão F): a conta (jeito 2 do resto do principal: a casca e o app do aluno) grava em TODA ação, como a nutricao e a financeiro.
# W-A P2 (LINUX 3, 13/10): as 3 da W-A — acessos e aluno-dia (principal) e treino-acessos (Treino) — gravam em TODA ação, menos o ler pelo corpo.
# hml-21d (decisão F): a treinos (Treino — o jeito 2 do cadastro do professor, do Master e dos treinos prontos) grava em TODA ação, menos o ler.
# hml-21c (decisão 23 da spec hml-21 — o "pode ir" da LINUX 3 em 12/10 ~20:30; o achado 7): a whatsapp-conectar grava em TODA ação — o
# `status` CRIA a instância na 1ª visita e renova o pedido_em no aguardando_qr (whatsapp-conectar/index.ts:96-115), o conectar/desconectar
# gravam e o teste MANDA mensagem. Ela segue nas "conhecidas" (existia em 11/10); esta lista vem antes na regra (funcao_grava).
# play-W6 (22/10/2026): as 2 da Google Play gravam em TODA ação — a play-compras (o `estado` relê no Google a assinatura vencida e grava; o
# `registrar` grava) e a play-conferir (só o pg_cron, com o S11). Nenhuma das 2 tem leitura pelo corpo.
FUNCOES_QUE_SEMPRE_GRAVAM = {"nutricao", "automaticas-fila", "infinitepay-webhook-aluno", "financeiro", "mp-conectar-retorno",
                             "mp-contas-renovar", "conta", "acessos", "aluno-dia", "treino-acessos", "treinos", "whatsapp-conectar",
                             "play-compras", "play-conferir"}
# hml-20a (decisão I da hml-20a, H-42): as LEITURAS do jeito 2 passam pelo CORPO — { "acao": "ler" } na nutricao e na financeiro e
# { "action": "minha_evolucao" } na admin-avaliacoes. O campo é o que a FUNÇÃO lê (um { "action": "ler", "acao": "<gravação>" } na
# nutricao grava → barrado); corpo ilegível, sem a ação ou com outra ação = gravação, como antes. Sem o corpo (quem só tem a ação), a
# regra de antes. Teste: python3 e2e/hml19/guarda_teste.py.
# hml-21a (decisão F): + o { "acao": "ler" } da conta (o campo que ela lê é o `acao`).
# W-A P2: + o { "acao": "ler" } das 3 da W-A (o campo que as 3 leem é o acao).
# hml-21d (decisão F): + o { "acao": "ler" } da treinos (o campo que ela lê é o `acao`; o host é o do Treino — o alvo() olha só o caminho).
LEITURAS_PELO_CORPO = {"nutricao": ("acao", frozenset({"ler"})), "financeiro": ("acao", frozenset({"ler"})),
                       "admin-avaliacoes": ("action", frozenset({"minha_evolucao"})), "conta": ("acao", frozenset({"ler"})),
                       "acessos": ("acao", frozenset({"ler"})), "aluno-dia": ("acao", frozenset({"ler"})),
                       "treino-acessos": ("acao", frozenset({"ler"})), "treinos": ("acao", frozenset({"ler"}))}


def corpo_de_leitura(nome: str, corpo: str | None) -> bool:
    """O corpo (o texto JSON do pedido) é de uma ação de LEITURA da função (LEITURAS_PELO_CORPO)? Ilegível ou outra ação → não."""
    regra = LEITURAS_PELO_CORPO.get(nome)
    if not regra or not isinstance(corpo, str):
        return False
    try:
        b = json.loads(corpo)
    except Exception:  # noqa: BLE001
        return False
    return isinstance(b, dict) and isinstance(b.get(regra[0]), str) and b.get(regra[0]) in regra[1]


def corpo_do_pedido(req) -> str | None:
    """O post_data do pedido do Playwright (o corpo binário — a foto subindo — não é o JSON de uma ação: None)."""
    try:
        return req.post_data
    except UnicodeDecodeError:
        return None


def funcao_grava(nome: str, acao: str | None, corpo: str | None = None) -> bool:
    """A chamada à função grava? Desconhecida e a nutricao: sempre; as de antes: pela regra de antes (a ação decide nas 4 mistas).
    hml-19c (decisão K): a admin-avaliacoes só LÊ na "list" — create, update, proxima, delete e as foto_* (a foto mensal pelo servidor)
    gravam (antes, a Guarda deixava passar todas as ações dela).
    hml-20a (decisão I): com o `corpo`, as leituras do jeito 2 (corpo_de_leitura: `ler` da nutricao/financeiro, minha_evolucao da
    admin-avaliacoes) passam; o resto dessas funções segue gravação."""
    if corpo is not None and corpo_de_leitura(nome, corpo):
        return False
    if nome in FUNCOES_QUE_SEMPRE_GRAVAM or nome not in FUNCOES_CONHECIDAS:
        return True
    return (nome == "pagamentos-aluno" and acao not in LEITURAS_PAGAMENTOS) or nome in ("admin-delete-user", "admin-update-user") \
        or (nome == "admin-semana-treinos" and acao not in LEITURAS_SEMANA) \
        or (nome == "admin-tags" and not str(acao or "").lower().startswith(("list", "get"))) \
        or (nome == "admin-avaliacoes" and acao != "list")


class Guarda:
    """PRODUÇÃO SÓ LEITURA (o molde do e2e/w26/prod.py e do e2e/hml14/telas.py): o navegador bloqueia toda escrita das telas —
    POST/PATCH/PUT/DELETE em tabela, RPC fora da lista de leitura, Storage que não é o "sign", e nas funções as ações que gravam
    (pagamentos-aluno fora das leituras, admin-semana-treinos fora das leituras, admin-delete-user, admin-update-user, admin-tags que
    não lista; hml-19a: a nutricao inteira e QUALQUER função que a Guarda não conhece — funcao_grava; hml-19c: a admin-avaliacoes fora
    da "list"; hml-19d: a financeiro inteira; hml-20a: menos as LEITURAS pelo corpo — `ler` da nutricao/financeiro e minha_evolucao da
    admin-avaliacoes; W2: a mp-conectar-retorno e a mp-contas-renovar inteiras; W-A P2: a acessos, a aluno-dia e a treino-acessos
    inteiras, menos o `ler` pelo corpo; hml-21d: a treinos inteira, menos o `ler` pelo corpo). O resto segue (fallback: a
    queda da API, quando ligada, vem antes e aborta). Teste: python3 e2e/hml19/guarda_teste.py."""

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
            return funcao_grava(nome, acao, corpo_do_pedido(req))
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
        try:
            corpo = req.post_data or ""
        except UnicodeDecodeError:  # hml-19c: corpo binário (a foto subindo no Storage) — não é o JSON de uma ação; antes, o erro aqui
            corpo = ""              # derrubava o ouvinte do Playwright no meio do pedido (e o pedido nem era contado)
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
