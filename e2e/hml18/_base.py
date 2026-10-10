"""Physiq hml-18 (H-40 · H-54, 10/10/2026) — base dos E2E da hml-18 (largura.py, dialogos.py, shell.py; o saida.py e o velocidade.py
vêm depois, na mesma pasta).

Reaproveita a base da hml-17 (e2e/hml17/_base.py: as contas de TESTE, os Logins com o logout local no fim, a Guarda de escrita da
produção, o alvo dos pedidos e o SQL só leitura) e acrescenta:
  · Celular   o contexto de celular do Edge (is_mobile + has_touch, device_scale_factor 2) a 390 × 844 ou 360 × 780, com o
              reduced_motion como parâmetro; a sessão entra ANTES do 1º documento (add_init_script) e os avisos de uma vez já vistos;
              o pos-login e a minha_situacao voltam com o `legal` desligado SÓ no navegador (a porta do aceite não cobre a tela —
              o mesmo da medição da spec); qualquer diálogo nativo (window.confirm/alert/prompt) é dispensado e CONTADO
  · Medidas   as funções da spec (hml18/ferramentas/medir_hml18.py): JS_LARGURA, JS_TOCAVEIS (com o seletor partido só nas vírgulas
              de fora — a regra base do toque é um :where(…) com lista), JS_SAIDA; e o JS_NOMES_LONGOS (+40 caracteres com espaço em
              todo .truncate e [data-*-nome])
  · Aberturas as 60 da spec (personal, nutri, aluna, paciente) + as 11 do master (só no staging/local), com a rota final esperada
  · Rodada    o placar pelo Placar do e2e/w02/_comum.py (o fim() grava a rodada no e2e-rodadas.tsv) + a cópia da saída em hml18/agente/
  · Master    no máximo 4 logins no contrato: a sessão da w27-master fica guardada (600, no TMPDIR) e a próxima rodada a reusa (o
              access token vale 1 h; perto de vencer, o refresh — que não é login); no fim de cada rodada a sessão MAIS NOVA do
              navegador volta para o arquivo (o app renova o refresh token). O logout dela é o --sair-master (no fim do contrato)
Bases: local (o vite preview do build de STAGING em http://localhost:8080 — a porta que as funções aceitam) · staging · prod (SÓ
LEITURA: a Guarda no navegador; as contas de teste de lá; nada de master nem de massa).
Sem segredo nem dado pessoal na saída: só contagem, status, px, ms, classe e nome de atributo.
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]

_ESPEC = importlib.util.spec_from_file_location("_base_hml17", REPO / "e2e" / "hml17" / "_base.py")
B17 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_hml17"] = B17
_ESPEC.loader.exec_module(B17)  # type: ignore[union-attr]
C, B5 = B17.C, B17.B5
C2 = C.C2  # e2e/w02/_comum.py: Placar e registrar_rodada

SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch"
SAIDA = SCRATCH / "hml" / "hml18" / "agente"
PRINTS = SCRATCH / "prints" / "hml18"
C.SAIDA = SAIDA
TMP = Path(os.environ.get("TMPDIR") or (SCRATCH / "hml" / "hml18" / "tmp"))

BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
HOSTS_DE_PRODUCAO = {"physiqcalc.com.br", "www.physiqcalc.com.br"}
API_HOSTS = (B17.API_P_HOST, B17.API_T_HOST)
LARGURAS = {390: 844, 360: 780}

B5.CONTAS.setdefault("w7-paciente", ("w7.paciente.teste.claude@physiqnutri.app", B5.senha_de("w7-paciente")))
B5.CONTAS.setdefault("w7b-prod", ("w7b.prod.teste.claude@physiqnutri.app", B5.senha_de("w7b-prod")))
for _k in ("w7-paciente", "w7b-prod"):
    assert C.eh_email_de_teste(B5.CONTAS[_k][0]), _k

# as contas de TESTE de cada base, por papel (prod: as de teste de lá — admin.teste = "master" nas CONTAS da W5, dono + personal de
# uma conta só de Treino; teste@teste.com = "aluno-calc"; nada de master: na produção nenhuma conta de teste é master)
CONTAS_DA_BASE = {
    "staging": {"personal": "w5p-personal", "nutri": "w5p-nutri", "aluna": "w5p-aluna", "paciente": "w7-paciente", "master": "w27-master"},
    "prod": {"personal": "master", "nutri": "nutri-legado", "aluna": "aluno-calc", "paciente": "w7b-prod", "master": None},
}

# As 60 aberturas da spec (§1.2: conta × tela/aba) + as 11 do master (decisão 12). final = a rota que a tela abre (as que redirecionam
# por desenho: /perfil/alimentacao → /dieta, /painel/configuracoes → …/perfil e, no staging, /master/biblioteca → /painel — o master de
# teste não é master no Treino, P9). passava = passa_px > 0 na linha de base (F0, a 360).
ABERTURAS: list[dict] = []


def _abrir(papel: str, rotas: str, passava: tuple[str, ...] = (), finais: dict | None = None) -> None:
    for r in rotas.split():
        ABERTURAS.append({"papel": papel, "rota": r, "final": (finais or {}).get(r, r.split("?")[0]), "passava": r in passava})


_abrir("personal", "/painel /painel/alunos /painel/alunos/:aluno /painel/alunos/:aluno/editar /painel/alunos/:aluno/treino /painel/agenda "
       "/painel/financeiro /painel/treinos /painel/alunos/:aluno/dieta /painel/alunos/:aluno/avaliacao /painel/alunos/:aluno/prontuario "
       "/painel/alunos/:aluno/financeiro /painel/treinos?aba=biblioteca /painel/treinos?aba=historico /painel/treinos?aba=relatorio "
       "/painel/pre-consulta /painel/pre-consulta?aba=respostas /painel/mensagens /painel/financeiro?aba=mensalidades "
       "/painel/financeiro?aba=lancamentos /painel/financeiro?aba=recibos /painel/financeiro?aba=categorias /painel/configuracoes "
       "/painel/configuracoes/conta /painel/configuracoes/equipe /painel/configuracoes/plano /painel/configuracoes/recebimento "
       "/painel/configuracoes/convite /painel/configuracoes/aplicativo /painel/modelos /painel/calculadora /painel/lixeira",
       passava=("/painel", "/painel/alunos/:aluno/editar", "/painel/alunos/:aluno/treino", "/painel/agenda", "/painel/financeiro",
                "/painel/alunos/:aluno/financeiro", "/painel/treinos?aba=biblioteca", "/painel/treinos?aba=historico", "/painel/mensagens",
                "/painel/financeiro?aba=mensalidades", "/painel/financeiro?aba=lancamentos", "/painel/financeiro?aba=recibos",
                "/painel/financeiro?aba=categorias", "/painel/configuracoes/equipe", "/painel/calculadora"),
       finais={"/painel/configuracoes": "/painel/configuracoes/perfil"})
_abrir("nutri", "/painel /painel/dietas /painel/dietas?aba=receitas /painel/dietas?aba=diario /painel/impressos /painel/alunos/:aluno/dieta "
       "/painel/alunos/:aluno/prontuario?secao=exames /painel/alunos/:aluno/prontuario?secao=consultas "
       "/painel/alunos/:aluno/prontuario?secao=anamnese /painel/alunos/:aluno/prontuario?secao=documentos /painel/alunos/:aluno/avaliacao "
       "/painel/agenda /painel/alunos",
       passava=("/painel/alunos/:aluno/avaliacao", "/painel/agenda"))
_abrir("aluna", "/ /treino /dieta /evolucao /perfil /perfil/agenda /perfil/meu-plano /perfil/pagamentos /perfil/treinos-prontos "
       "/perfil/alimentacao /perfil/conta", finais={"/perfil/alimentacao": "/dieta"})
_abrir("paciente", "/ /dieta /evolucao /perfil")
_abrir("master", "/master /master/contas /master/alunos /master/financeiro /master/planos /master/integracoes /master/app-do-aluno "
       "/master/app-do-aluno?aba=treinos /master/app-do-aluno?aba=pratos /master/biblioteca /master/configuracoes",
       passava=("/master", "/master/app-do-aluno?aba=treinos"), finais={"/master/biblioteca": "/painel"})
PAPEIS = ("personal", "nutri", "aluna", "paciente", "master")


def nome_da_rota(rota: str) -> str:
    return re.sub(r"\W+", "_", rota.replace(":aluno", "id")).strip("_") or "inicio"


# ───────────────────────── a rodada (placar + cópia da saída) ─────────────────────────
class Rodada:
    """O placar pelo Placar do e2e/w02/_comum.py (check ✅/❌; o fim() imprime "N/M ok" e grava a rodada no e2e-rodadas.tsv) e a cópia
    da saída em hml18/agente/<nome>.txt. ok() tem a assinatura da Saida (o logout dos Logins da hml-17 chama ok(…, parar=False))."""

    def __init__(self, nome: str) -> None:
        self.nome = nome
        self.placar = C2.Placar()
        self.linhas: list[str] = []
        self.linha(f"# {nome} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

    def linha(self, texto: str) -> None:
        print(texto, flush=True)
        self.linhas.append(texto)

    def ok(self, cond: object, texto: str, parar: bool | None = None) -> bool:  # noqa: ARG002 — a assinatura da Saida
        bom = self.placar.check(bool(cond), texto)
        self.linhas.append(("✅ " if bom else "❌ ") + texto)
        return bom

    def fim(self) -> int:
        codigo = self.placar.fim()
        bons = sum(1 for b, _ in self.placar.itens if b)
        falhas = [t for b, t in self.placar.itens if not b]
        self.linhas.append(f"\n{bons}/{len(self.placar.itens)} ok" + (f" — FALHAS: {falhas}" if falhas else ""))
        SAIDA.mkdir(parents=True, exist_ok=True)
        (SAIDA / f"{self.nome}.txt").write_text("\n".join(self.linhas) + "\n", encoding="utf-8")
        print(f"cópia: {SAIDA / (self.nome + '.txt')}", flush=True)
        return codigo


# ───────────────────────── a base e o build ─────────────────────────
def resolver_base(nome: str) -> tuple[str, str, bool]:
    """(url, prefixo dos prints, produção?)"""
    url = BASES.get(nome, nome).rstrip("/")
    host = urlparse(url).hostname or ""
    producao = host in HOSTS_DE_PRODUCAO
    if nome == "prod" and not producao:
        raise SystemExit("--base prod precisa ser a produção")
    prefixo = nome if nome in BASES else ("local" if host in ("localhost", "127.0.0.1") else "url")
    B17.usar_schema("public" if producao else "staging")
    return url, prefixo, producao


def ler_saude(base: str) -> dict:
    """O health.json do build (no local, o vite preview serve o dist/; na Vercel, o /health)."""
    import urllib.request  # noqa: PLC0415

    for caminho in ("/health.json", "/health"):
        try:
            req = urllib.request.Request(base + caminho, headers={"User-Agent": "physiq-unificado/1.0 (e2e-hml18)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode() or "{}")
                if isinstance(d, dict) and d.get("app") == "physiq":
                    return d
        except Exception:  # noqa: BLE001
            continue
    return {}


def conferir_build(R: Rodada, nav, base: str, producao: bool) -> bool:
    """O build é o certo antes de qualquer conta: o health.json (schema) e a faixa "Ambiente de teste" na /entrar (staging e local)."""
    saude = ler_saude(base)
    R.linha(f"   health: versão {saude.get('versao')} · commit {saude.get('commit')} · schema {saude.get('schema')}")
    esperado = "public" if producao else "staging"
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, service_workers="block")
    try:
        pg = ctx.new_page()
        pg.goto(base + "/entrar", wait_until="domcontentloaded", timeout=60000)
        t0 = time.time()
        while time.time() - t0 < 45 and not pg.locator("[data-entrar-google], [data-entrada-staging]").count():
            pg.wait_for_timeout(300)
        faixa = pg.locator("[data-entrada-staging]").count() > 0
    finally:
        ctx.close()
    if producao:
        return R.ok(saude.get("schema") == esperado and not faixa, f"o build é o de produção (schema {saude.get('schema')}, sem a faixa de teste)")
    return R.ok(saude.get("schema") == esperado and faixa, f"o build é o de staging (schema {saude.get('schema')} e a faixa 'Ambiente de teste' "
                                                          f"na /entrar) — senão nada roda com conta")


# ───────────────────────── logins (master: 1 por janela de 1 h) ─────────────────────────
ARQ_MASTER = TMP / "hml18_sessao_w27-master.json"
REG_MASTER = SAIDA / "master_logins.txt"


def _refresh(sessao: dict) -> dict | None:
    """Renova a sessão pelo refresh token (não é login). None = não deu (o refresh já foi usado ou venceu)."""
    st, s, _ = B5.http("POST", f"{B5.API_P}/auth/v1/token?grant_type=refresh_token", {"refresh_token": sessao.get("refresh_token", "")},
                       B5.cab_login(B5.API_P, B5.anon(B5.PRINCIPAL_REF)))
    return s if st == 200 and isinstance(s, dict) and s.get("access_token") else None


class Logins(B17.Logins):
    """Os Logins da hml-17 (1 login por conta por rodada, logout local no fim) — menos a w27-master: a sessão dela vem do arquivo
    (600) enquanto valer; o logout dela só com sair_master()."""

    def __init__(self, motivo: str) -> None:
        super().__init__()
        self.motivo = motivo
        self.master_usado = False

    def sessao(self, conta: str) -> dict:
        if conta != "w27-master":
            return super().sessao(conta)
        if conta in self.por_conta:
            return self.por_conta[conta]
        s = None
        if ARQ_MASTER.exists():
            try:
                s = json.loads(ARQ_MASTER.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                s = None
        if s and int(s.get("expires_at") or 0) - time.time() < 20 * 60:
            s = _refresh(s)
        if not s:
            n = len(REG_MASTER.read_text(encoding="utf-8").splitlines()) if REG_MASTER.exists() else 0
            if n >= 4:
                raise SystemExit("master: os 4 logins do contrato já foram usados — sem sessão guardada válida")
            s = B5.sessao(conta)
            REG_MASTER.parent.mkdir(parents=True, exist_ok=True)
            with REG_MASTER.open("a", encoding="utf-8") as f:
                f.write(f"master login {n + 1}/4 {time.strftime('%H:%M:%S')} ({self.motivo})\n")
        self.guardar_master(s)
        self.por_conta[conta] = s
        self.master_usado = True
        return s

    @staticmethod
    def guardar_master(s: dict) -> None:
        TMP.mkdir(parents=True, exist_ok=True)
        ARQ_MASTER.write_text(json.dumps(s), encoding="utf-8")
        ARQ_MASTER.chmod(0o600)


def sair_master(R: Rodada) -> None:
    """O logout local da sessão guardada da master (no fim do contrato) e o arquivo apagado."""
    if not ARQ_MASTER.exists():
        R.linha("   master: nenhuma sessão guardada")
        return
    try:
        s = json.loads(ARQ_MASTER.read_text(encoding="utf-8"))
        st = C.sair_local(s.get("access_token", ""), "principal")
    except Exception as e:  # noqa: BLE001
        st = type(e).__name__
    R.ok(st in (200, 204), f"logout (scope=local) da sessão guardada da w27-master ({st})")
    ARQ_MASTER.unlink(missing_ok=True)


# ───────────────────────── o navegador de celular ─────────────────────────
def _tirar_legal(obj):
    """O `legal` desligado e o aviso de mudança visto, SÓ na resposta que o navegador recebe (o mesmo da medição da spec)."""
    sit = obj.get("situacao") if isinstance(obj, dict) and isinstance(obj.get("situacao"), dict) else obj
    if isinstance(sit, dict):
        sit["legal"] = {"versao": None, "aceite_pendente": False, "saude_pendente": False, "nascimento_pendente": False, "menor": None}
        if isinstance(sit.get("aviso_mudanca"), dict):
            sit["aviso_mudanca"]["visto"] = True
    return obj


class Celular:
    """Um contexto limpo do Edge em modo celular, com a conta de TESTE entrando antes do 1º documento."""

    def __init__(self, nav, base: str, largura: int = 390, reduced_motion: str = "no-preference", guarda: B17.Guarda | None = None) -> None:
        self.base, self.largura = base, largura
        self.ctx = nav.new_context(viewport={"width": largura, "height": LARGURAS.get(largura, 844)}, is_mobile=True, has_touch=True,
                                   device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block",
                                   reduced_motion=reduced_motion)
        self.ctx.route(re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/"), self._legal)
        if guarda:
            guarda.instalar(self.ctx)  # a Guarda (registrada por último) roda antes e aborta as escritas
        self.pg = self.ctx.new_page()
        self.dialogos: list[str] = []
        self.erros: list[str] = []
        self.em_voo = 0
        self.ult_pedido = time.time()
        self.pg.on("dialog", self._dialogo)
        self.pg.on("pageerror", lambda e: self.erros.append(str(e)[:200]))
        self.pg.on("request", self._req)
        self.pg.on("requestfinished", self._fim_req)
        self.pg.on("requestfailed", self._fim_req)
        self.conta = ""
        self.uid = ""

    # rede
    def _legal(self, route, req) -> None:
        tipo, nome = B17.alvo(req.url)
        if req.method != "OPTIONS" and ((tipo == "fn" and nome == "pos-login") or (tipo == "rpc" and nome == "minha_situacao")):
            try:
                r = route.fetch()
                try:
                    corpo = json.dumps(_tirar_legal(r.json()))
                except Exception:  # noqa: BLE001
                    route.fulfill(response=r)
                    return
                route.fulfill(response=r, body=corpo, headers={**r.headers, "content-type": "application/json"})
            except Exception:  # noqa: BLE001 — a página fechou no meio
                pass
            return
        route.fallback()

    def _dialogo(self, d) -> None:
        """Diálogo nativo do navegador: o teste nunca aceita (nada grava) e conta — o app não pode ter nenhum (hml-18a, B)."""
        self.dialogos.append(f"{d.type}")
        try:
            d.dismiss()
        except Exception:  # noqa: BLE001
            pass

    def _req(self, q) -> None:
        if q.resource_type in ("fetch", "xhr"):
            self.em_voo += 1
            self.ult_pedido = time.time()

    def _fim_req(self, q) -> None:
        if q.resource_type in ("fetch", "xhr"):
            self.em_voo = max(0, self.em_voo - 1)
            self.ult_pedido = time.time()

    # entrada
    def entrar(self, logins: Logins, conta: str, rota: str) -> None:
        """A sessão ANTES do 1º documento (só se ainda não houver: depois do refresh o app guarda a nova) e a rota."""
        if B17.schema() == "staging":
            B5.zerar_limite_troca(conta)  # a troca de token tem limite de 20/h por pessoa (só no staging, só a conta de TESTE)
        s = logins.sessao(conta)
        self.conta, self.uid = conta, (s.get("user") or {}).get("id") or ""
        self.ctx.add_init_script(
            "(v => { try { if (!localStorage.getItem('physiq-principal-auth')) { localStorage.setItem('physiq-principal-auth', v);"
            " localStorage.setItem('physiqcalc-pwa-dismissed', 'true');"
            " localStorage.setItem('physiq_pendencia_avisada_em', new Date().toLocaleDateString('pt-BR'));"
            f" for (let k = 1; k <= 30; k++) localStorage.setItem('physiq_aviso_visto:{self.uid}:' + k, '1'); }} }} catch (e) {{}} }})("
            + json.dumps(json.dumps(s)) + ")")
        self.ir(rota)

    def ir(self, rota: str) -> None:
        self.pg.goto(self.base + rota, wait_until="domcontentloaded", timeout=60000)

    def esperar_quieto(self, minimo: float = 4.0, maximo: float = 30.0, quieto: float = 2.0) -> float:
        ini = time.time()
        while time.time() - ini < maximo:
            self.pg.wait_for_timeout(250)
            if time.time() - ini >= minimo and self.em_voo == 0 and time.time() - self.ult_pedido >= quieto \
                    and not self.tem("[data-carregando-tela]"):
                break
        return round(time.time() - ini, 1)

    def esperar(self, cond, timeout: float, passo: float = 0.25) -> bool:
        t0 = time.time()
        while time.time() - t0 < timeout:
            try:
                if cond():
                    return True
            except Exception:  # noqa: BLE001 — navegando
                pass
            self.pg.wait_for_timeout(int(passo * 1000))
        return False

    def tem(self, seletor: str) -> bool:
        try:
            loc = self.pg.locator(seletor)
            return loc.count() > 0 and loc.first.is_visible()
        except Exception:  # noqa: BLE001
            return False

    def caminho(self) -> str:
        try:
            return urlparse(self.pg.url).path
        except Exception:  # noqa: BLE001
            return ""

    def tamanho(self, largura: int) -> None:
        self.largura = largura
        self.pg.set_viewport_size({"width": largura, "height": LARGURAS.get(largura, 844)})

    def print(self, prefixo: str, caso: str, borrar: str | None = None) -> str:
        """O print em prints/hml18/<base>_<caso>_<largura>.png (até 3 tentativas: o "Unable to capture screenshot" do notebook)."""
        PRINTS.mkdir(parents=True, exist_ok=True)
        caminho = PRINTS / f"{prefixo}_{caso}_{self.largura}.png"
        if borrar:
            self.pg.add_style_tag(content=f"{borrar} {{ filter: blur(7px) !important; }}")
        for tentativa in range(3):
            try:
                self.pg.wait_for_timeout(500)
                self.pg.screenshot(path=str(caminho))
                return str(caminho)
            except Exception as e:  # noqa: BLE001
                if "Unable to capture screenshot" not in str(e) or tentativa == 2:
                    raise
                self.pg.wait_for_timeout(1500)
        return str(caminho)

    def sessao_atual(self) -> dict | None:
        try:
            v = self.pg.evaluate("() => localStorage.getItem('physiq-principal-auth')")
            return json.loads(v) if v else None
        except Exception:  # noqa: BLE001
            return None

    def fim(self, logins: Logins | None = None) -> None:
        """Fecha o contexto; com a master, a sessão MAIS NOVA do navegador volta para o arquivo (o app pode ter renovado)."""
        if logins is not None and self.conta == "w27-master":
            s = self.sessao_atual()
            if s and s.get("access_token"):
                Logins.guardar_master(s)
        try:
            self.ctx.close()
        except Exception:  # noqa: BLE001
            pass


def matricula(conta_aluna: str) -> str:
    """A matrícula (pacientes.id) viva da aluna de TESTE no schema da rodada — a ":aluno" das rotas (SQL só leitura)."""
    email = B5.CONTAS[conta_aluna][0].lower()
    r = B17.ler(f"select p.id::text as id from {B17.schema()}.pacientes p join auth.users u on u.id = p.user_id "
                f"where lower(u.email) = {B17.txt(email)} and p.deleted_at is null order by p.created_at limit 1")
    if not r:
        raise SystemExit(f"sem matrícula viva da {conta_aluna} no {B17.schema()}")
    return C.uuid_ok(r[0]["id"])


# ───────────────────────── as medidas (da spec: hml18/ferramentas/medir_hml18.py) ─────────────────────────
JS_LARGURA = r"""() => {
  const de = document.documentElement, cw = de.clientWidth;
  const corta = (e) => { const o = getComputedStyle(e).overflowX; return o === 'hidden' || o === 'auto' || o === 'scroll' || o === 'clip'; };
  const anc = (e) => { let p = e.parentElement; while (p && p !== document.body) { const d = [...p.attributes].map(a => a.name)
      .filter(n => n.startsWith('data-') && !['data-state','data-tema','data-orientation','data-side','data-align'].includes(n)); if (d.length) return d.slice(0,2).join(','); p = p.parentElement; } return '-'; };
  const desc = (e) => { const d = [...e.attributes].map(a => a.name).filter(n => n.startsWith('data-')).slice(0,3).join(',');
      const c = (e.getAttribute('class') || '').replace(/\s+/g, ' ').trim().slice(0, 140);
      return `${e.tagName.toLowerCase()}[${d}]{${c}}<${anc(e)}>`; };
  const passam = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (!(r.width > 0 && r.right > cw + 1)) continue;
    if (getComputedStyle(e).position === 'fixed') continue;
    let p = e.parentElement, cortado = false;
    while (p && p !== document.body) { const cs = getComputedStyle(p); if (cs.position === 'fixed') { cortado = true; break; }
      if (corta(p) && p.getBoundingClientRect().right <= cw + 1) { cortado = true; break; } p = p.parentElement; }
    if (!cortado) passam.push({ e, r });
  }
  const set = new Set(passam.map(x => x.e));
  const raizesE = passam.filter(x => !set.has(x.e.parentElement)).sort((a, b) => b.r.right - a.r.right);
  const raizes = raizesE.slice(0, 6).map(x => `${desc(x.e)}+${Math.round(x.r.right - cw)}px`);
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const b = [...document.querySelectorAll('[data-tabbar]')].find(n => n.getClientRects().length);
  let barra = null;
  if (b) { const r = b.getBoundingClientRect(); barra = { base: Math.round(r.bottom), direita: Math.round(r.right), dentro: r.bottom <= vh + 1 && r.right <= vw + 1 && r.left >= -1 }; }
  return { cw, iw: window.innerWidth, sw: de.scrollWidth, passa: de.scrollWidth - cw, vh: Math.round(vh), vw: Math.round(vw), raizes, barra,
    carregando: [...document.querySelectorAll('[data-carregando-tela]')].some(e => e.getClientRects().length) };
}"""

# tocável = o da spec (§1.1); "responde" = alguma regra :active do CSS casa com ele. A lista de seletores de cada regra é partida SÓ nas
# vírgulas de fora de ( ) e [ ] (a medição da spec partia em toda vírgula: um :where(button, a[href], …):active não contava).
# Fora da conta (não são tocáveis agora): :disabled, aria-disabled="true" e as alças de arrastar (.touch-none — §2.3 item 3).
JS_TOCAVEIS = r"""() => {
  const SEL = "button, a[href], [role=button], [role=tab], [role=menuitem], [role=option], summary, label[for]";
  const todos = [...document.querySelectorAll(SEL)].filter(e => e.getClientRects().length && !e.closest('[aria-hidden=true]'));
  const fora = (e) => e.matches(':disabled') || e.getAttribute('aria-disabled') === 'true' || e.classList.contains('touch-none');
  const t = todos.filter(e => !fora(e));
  const partir = (s) => { const out = []; let n = 0, ini = 0;
    for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(' || c === '[') n++; else if (c === ')' || c === ']') n--;
      else if (c === ',' && n === 0) { out.push(s.slice(ini, i)); ini = i + 1; } }
    out.push(s.slice(ini)); return out.map(x => x.trim()).filter(Boolean); };
  const bases = [];
  for (const folha of document.styleSheets) {
    let regras = []; try { regras = [...folha.cssRules]; } catch {}
    const andar = (lista, pai) => { for (const r of lista) {
      if (r.selectorText !== undefined) {
        const sels = partir(r.selectorText).map(s => pai && s.includes('&') ? s.replace(/&/g, pai) : (pai ? pai + ' ' + s : s));
        for (const sel of sels) if (/(?<!\\):active(?![\w-])/.test(sel)) bases.push(sel.replace(/(?<!\\):active(?![\w-])/g, '') || '*');
        if (r.cssRules && r.cssRules.length) andar([...r.cssRules], partir(r.selectorText).length === 1 ? partir(r.selectorText)[0] : ':is(' + r.selectorText + ')');
      } else if (r.cssRules) andar([...r.cssRules], pai);
    } };
    andar(regras, '');
  }
  const responde = (e) => bases.some(b => { try { return e.matches(b); } catch { return false; } });
  const sem = t.filter(e => !responde(e));
  const semAtivo = {};
  for (const e of sem) { const d = [...e.attributes].map(a => a.name).filter(n => n.startsWith('data-')).slice(0, 2).join(',');
    const k = e.tagName.toLowerCase() + (e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : '') + (d ? '{' + d + '}' : '');
    semAtivo[k] = (semAtivo[k] || 0) + 1; }
  const dur = (e) => getComputedStyle(e).transitionDuration.split(',').some(d => parseFloat(d) > 0);
  const grupos = { botao: '.pq-botao', botao_icone: '.pq-ibtn', barra: '[data-tabbar] a, [data-tabbar] button', abas: '[role=tab]' };
  const transicao = {};
  for (const [k, s] of Object.entries(grupos)) { const els = [...document.querySelectorAll(s)].filter(e => e.getClientRects().length);
    transicao[k] = { total: els.length, com: els.filter(dur).length }; }
  const cs = getComputedStyle(document.body), b0 = t.find(e => e.tagName === 'BUTTON');
  return { total: t.length, fora: todos.length - t.length, ativo: t.length - sem.length, semAtivo, regras: bases.length,
    transicao_todos: t.filter(dur).length, transicao,
    touch: b0 ? getComputedStyle(b0).touchAction : '-', tap: b0 ? getComputedStyle(b0).webkitTapHighlightColor : '-',
    overscroll: cs.overscrollBehaviorY + '/' + getComputedStyle(document.documentElement).overscrollBehaviorY };
}"""

JS_SAIDA = r"""([sel]) => new Promise((ok) => {
  const d = document.querySelector(sel); if (!d) return ok({ ms: -1, fechado: false });
  const t0 = performance.now(); let viuFechado = false;
  const olhar = () => { const vis = d.isConnected && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden';
    if (d.isConnected && d.getAttribute('data-state') === 'closed') viuFechado = true;
    if (!vis) return ok({ ms: Math.round(performance.now() - t0), fechado: viuFechado, anima: window.__anima || '-' });
    if (performance.now() - t0 > 3000) return ok({ ms: 9999, fechado: viuFechado });
    requestAnimationFrame(olhar); };
  window.__anima = getComputedStyle(d).animationName + '/' + getComputedStyle(d).animationDuration;
  document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  requestAnimationFrame(olhar);
})"""

# §2.1 item 7: +40 caracteres COM espaço (um nome comprido de verdade), uma vez só, em todo .truncate (no 1º texto não vazio de
# dentro dele) e em todo elemento com um [data-*-nome] que traz o nome no valor (no texto de dentro que MOSTRA esse nome). Um marcador
# sem valor (ex.: o botão "Salvar nome", data-conta-salvar-nome) não é um nome: o rótulo fixo de um botão nunca cresce.
EXTRA_NOME = " Nome Bem Comprido Para Testar a Largura"
assert len(EXTRA_NOME) == 40
JS_NOMES_LONGOS = r"""([extra]) => {
  const alvos = [...document.querySelectorAll('.truncate')].map(e => [e, null]);
  for (const e of document.body.querySelectorAll('*')) for (const a of e.attributes)
    if (/^data-.+-nome$/.test(a.name) && a.value.trim().length >= 2) { alvos.push([e, a.value.trim()]); break; }
  let n = 0;
  for (const [e, nome] of alvos) {
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: (t) =>
      (nome ? t.textContent.includes(nome) : t.textContent.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP });
    const t = w.nextNode();
    if (t && !t.__hml18) { t.textContent += extra; t.__hml18 = 1; n++; }
  }
  return n;
}"""
