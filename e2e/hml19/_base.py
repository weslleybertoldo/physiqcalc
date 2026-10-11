"""Physiq hml-19a (H-41 · H-81 · jeito 2, 11/10/2026) — base dos E2E da hml-19 (api.py, rede.py, laco.py).

Reaproveita a base da hml-17 (e2e/hml17/_base.py: as contas de TESTE, os Logins com o logout LOCAL no fim, a Guarda de escrita da
produção — que desde a hml-19a trata a nutricao e qualquer função desconhecida como gravação —, a Tela com a sessão antes do 1º
documento e os pedidos anotados por alvo, o SQL só leitura) e junta:
  · funcao()/preflight()  a nutricao como a tela chama (POST no domínio próprio: apikey + Bearer + x-schema + Origin) e o OPTIONS;
  · Regras                a lista fechada da função lida do PRÓPRIO TS (node --experimental-strip-types, sem rede): ações, tabelas
                          e o montarGravacao/leitores do servidor — o --seco confere cada pedido dos E2E contra o servidor;
  · classificar/contar    a guarda que CONTA: cada pedido de gravação por tela e por ação — rest nas 18 tabelas do Prontuário (tem de
                          ser 0 depois da hml-19a), rest nas outras, RPC que grava, Storage (o PUT no link assinado à parte), cada ação
                          da nutricao e os GET profiles (o laço de leitura);
  · BarrarNutricao        a rota que BARRA a nutricao no navegador (o laco.py: o aviso "Tentar de novo" e 1 chamada só);
  · saude()               a guarda do /health dos 2 projetos (H-80) antes de cada E2E: ruim → para tudo;
  · Estado                o que a rodada criou (ids, caminhos no Storage, os modelos mexidos no N8), num arquivo: o --limpar desfaz
                          uma rodada que caiu no meio;
  · a massa               "hml19 e2e …" só nas contas de TESTE, só no schema staging.
hml-19b: as 19 tabelas da Dieta (rest_dieta na contagem), as 3 RPCs que o app do aluno chamava direto (paciente_marcar_refeicao,
aluno_marcar_meta, diario_enviar — rpc_grava, mesmo fora do RPC_QUE_GRAVAM de hoje), as regras da Dieta e do app lidas do mesmo TS
(regras(): acoes_dieta, acoes_aluno, tabelas_dieta e o servidor de cada pedido) e o bucket do diário.
Sem segredo nem dado pessoal na saída: chaves pela Management API, senhas em ~/.physiq-teste-<nome> (600); das respostas só saem
status, códigos, contagens e tempos.
"""
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import time
import uuid
from collections import Counter
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

SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml19"
C.SAIDA = SCRATCH / "agente"
MEDICAO = SCRATCH / "medicao"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml19" / "a"
PRINTS_B = PRINTS.parent / "b"  # hml-19b: b_editor, b_receita, b_alimento, b_app_marcar, b_semente_erro, b_app_erro
ESTADO_ARQ = SCRATCH / "agente" / "e2e_estado.json"
MARCA = "hml19 e2e"
PRINCIPAL_REF = B17.PRINCIPAL_REF
API_P = B17.API_P
API_P_HOST = B17.API_P_HOST
FUNCAO = f"{API_P}/functions/v1/nutricao"
BASES = {"local": "http://localhost:8080", "staging": "https://physiqcalc-staging.vercel.app", "prod": "https://physiqcalc.com.br"}
SCHEMA_DA_BASE = {"local": "staging", "staging": "staging", "prod": "public"}
ORIGEM_FORA = "https://exemplo-fora-da-lista.example"
ORIGEM_PADRAO = "https://physiqcalc.com.br"

P_CONTA = "w5p-nutri"     # a nutricionista de TESTE (P): a nutri responsável pela w5p-aluna
A_CONTA = "w5p-aluna"     # hml-19b: a aluna de TESTE (o app: marcar refeição/meta e a foto do diário)
N1_CONTA = "w13-dono"     # o profissional de OUTRA conta (N1)
PROD_CONTA = "nutri-legado"  # produção, SÓ LEITURA: nutri.teste.claude@physiqnutri.app

REGRAS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-regras.ts"
PADROES_TS = REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-padroes.ts"


_CORTADO: list[str] = []


def corte_vira_saida() -> None:
    """SIGTERM/SIGINT (o `timeout`, o Ctrl+C, o fim da sessão) viram SystemExit: os `finally` da limpeza RODAM quando o processo é
    cortado (antes, o SIGTERM matava na hora e a massa da rodada ficava no staging — o incidente de 11/10 07:50). Os sinais seguintes,
    com a limpeza já em curso, são ignorados (só o SIGKILL interrompe a limpeza)."""
    import signal  # noqa: PLC0415

    def _cortado(sinal: int, _quadro: object) -> None:
        if _CORTADO:
            print(f"(sinal {signal.Signals(sinal).name} de novo: a limpeza já está rodando — ignorado)", flush=True)
            return
        _CORTADO.append(signal.Signals(sinal).name)
        raise SystemExit(f"cortado pelo sinal {signal.Signals(sinal).name} — a limpeza roda agora (finally)")

    for sinal in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sinal, _cortado)


def usar_base(base: str) -> str:
    """local e staging = schema staging (a mesma função publicada atende os 2 schemas pelo x-schema); prod = public."""
    if base not in BASES:
        raise SystemExit(f"base desconhecida: {base} ({', '.join(BASES)})")
    B17.usar_schema(SCHEMA_DA_BASE[base])
    return SCHEMA_DA_BASE[base]


def schema() -> str:
    return B17.schema()


def nova_rodada() -> str:
    """O código da rodada (vai na marca de toda a massa: "hml19 e2e <rodada> …")."""
    return time.strftime("%m%d%H%M") + "-" + uuid.uuid4().hex[:4]


# ───────────────────────── as sessões de TESTE guardadas entre os scripts ─────────────────────────
# o contrato da etapa 2: reaproveitar a sessão entre os scripts e no máximo 10 logins (o registro de cada login de verdade fica em
# agente/logins_etapa2.txt); renovar pelo refresh token NÃO é login. O arquivo das sessões é 600 e fica no TMPDIR da W (fora do repo).
ARQ_SESSOES = SCRATCH / "tmp" / "hml19_sessoes.json"
# hml-19b: o registro da etapa 2 DESTA W (o da 19a, logins_etapa2.txt, fica como estava); começa com os 3 logins da sessão principal
# às 07:48 (o smoke da nutricao v2, já da 19b)
REG_LOGINS = SCRATCH / "agente" / "logins_etapa2_19b.txt"
MAX_LOGINS = 10
FOLGA_S = 20 * 60  # o access token reaproveitado vale ainda 20 min: o app não renova no meio de um teste


def _refresh(sessao: dict) -> dict | None:
    """Renova a sessão pelo refresh token (não é login). None = não deu (o refresh já foi usado ou venceu)."""
    st, s, _ = B5.http("POST", f"{API_P}/auth/v1/token?grant_type=refresh_token", {"refresh_token": sessao.get("refresh_token", "")},
                       B5.cab_login(API_P, B5.anon(PRINCIPAL_REF)))
    return s if st == 200 and isinstance(s, dict) and s.get("access_token") else None


class Sessoes:
    """A interface dos Logins da hml-17 (sessao/token/uid/fechar), com a sessão de cada conta de TESTE guardada entre os scripts: vale
    enquanto o access token tiver folga; perto de vencer, o refresh; sem nada, o login (contado, com teto). O fechar() NÃO sai (o próximo
    script reaproveita); o logout local de todas é o sair(), no fim da etapa 2 (api.py --sair)."""

    def __init__(self, motivo: str) -> None:
        self.motivo = motivo
        self.d: dict = {}
        if ARQ_SESSOES.exists():
            try:
                self.d = json.loads(ARQ_SESSOES.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.d = {}

    def _salvar(self) -> None:
        ARQ_SESSOES.parent.mkdir(parents=True, exist_ok=True)
        ARQ_SESSOES.write_text(json.dumps(self.d), encoding="utf-8")
        ARQ_SESSOES.chmod(0o600)

    @staticmethod
    def logins_feitos() -> int:
        return len(REG_LOGINS.read_text(encoding="utf-8").splitlines()) if REG_LOGINS.exists() else 0

    def sessao(self, conta: str) -> dict:
        email = B5.CONTAS[conta][0]
        if not (C.eh_email_de_teste(email) or B5.email_de_teste(email)) or "revisao" in email.lower():
            raise SystemExit(f"não é conta de teste: {conta}")
        s = self.d.get(conta)
        if s and int(s.get("expires_at") or 0) - time.time() < FOLGA_S:
            s = _refresh(s)
        if not s:
            n = self.logins_feitos()
            if n >= MAX_LOGINS:
                raise SystemExit(f"os {MAX_LOGINS} logins da etapa 2 já foram usados ({REG_LOGINS}) — sem sessão guardada válida de {conta}")
            s = B5.sessao(conta)
            REG_LOGINS.parent.mkdir(parents=True, exist_ok=True)
            with REG_LOGINS.open("a", encoding="utf-8") as f:
                f.write(f"login {n + 1}/{MAX_LOGINS} {conta} {time.strftime('%H:%M:%S')} ({self.motivo})\n")
        if self.d.get(conta) is not s:
            self.d[conta] = s
            self._salvar()
        return s

    def token(self, conta: str) -> str:
        return self.sessao(conta)["access_token"]

    def uid(self, conta: str) -> str:
        return (self.sessao(conta).get("user") or {}).get("id") or ""

    def fechar(self, o) -> None:
        """As sessões FICAM para o próximo script (o logout local de todas é o sair, no fim da etapa 2)."""

    def do_navegador(self, conta: str, pg) -> None:
        """Se o app renovou a sessão no meio do teste, a mais nova volta para o arquivo (o refresh token antigo já não vale)."""
        try:
            v = pg.evaluate("() => localStorage.getItem('physiq-principal-auth')")
            s = json.loads(v) if v else None
        except Exception:  # noqa: BLE001
            return
        if isinstance(s, dict) and s.get("access_token") and s.get("refresh_token") \
                and s.get("refresh_token") != (self.d.get(conta) or {}).get("refresh_token"):
            self.d[conta] = s
            self._salvar()

    def sair(self, o) -> None:
        """O logout (scope=local) de cada sessão guardada e o arquivo apagado — no fim da etapa 2."""
        for conta, s in list(self.d.items()):
            try:
                st: object = C.sair_local(s.get("access_token", ""), "principal")
            except Exception as e:  # noqa: BLE001
                st = type(e).__name__
            o.ok(st in (200, 204), f"logout (scope=local) da sessão guardada de {conta} ({st})", parar=False)
        self.d = {}
        if ARQ_SESSOES.exists():
            ARQ_SESSOES.unlink()


# ───────────────────────── a função como a tela chama ─────────────────────────
def funcao(token: str | None, acao: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
           sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na nutricao (status, corpo JSON, cabeçalhos, ms). acao None = sem a chave (o corpo vai como veio)."""
    corpo = dict(corpo or {})
    if acao is not None:
        corpo["acao"] = acao
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "x-schema": schema_ or schema(), "Origin": origem or BASES["staging"]}
    if not sem_auth:
        cab["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    st, r, h = B5.http("POST", FUNCAO, corpo, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), h or {}, round((time.time() - t0) * 1000)


def preflight(origem: str) -> tuple[int, dict]:
    """O OPTIONS que o navegador manda antes do POST (o CORS da função responde antes de tudo)."""
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = B5.http("OPTIONS", FUNCAO, None, cab, timeout=60)
    return st, h or {}


def cors(h: dict) -> str:
    return C.cabecalho(h, "access-control-allow-origin") or ""


def subir_no_link(bucket: str, caminho: str, token_link: str, conteudo: bytes, mime: str, token_pessoa: str) -> int:
    """O PUT no link assinado (o que o uploadToSignedUrl do supabase-js faz): o arquivo vai direto ao Storage."""
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token_pessoa}", "Content-Type": mime, "x-upsert": "false",
           "cache-control": "max-age=3600"}
    st, _r, _h = B5.http("PUT", f"{API_P}/storage/v1/object/upload/sign/{bucket}/{caminho}?token={token_link}", conteudo, cab, timeout=60)
    return st


def remover_do_storage(bucket: str, caminhos: list[str], token_pessoa: str) -> tuple[int, int]:
    """Remove objetos COMO A PESSOA (a dona da pasta) — o desfazer da massa de Storage (o SQL não apaga storage.objects)."""
    if not caminhos:
        return 200, 0
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "Authorization": f"Bearer {token_pessoa}"}
    st, r, _h = B5.http("DELETE", f"{API_P}/storage/v1/object/{bucket}", {"prefixes": caminhos}, cab, timeout=60)
    return st, len(r) if isinstance(r, list) else 0


def bucket_dos_anexos(s: str | None = None) -> str:
    return "anexos-staging" if (s or schema()) == "staging" else "anexos"


def bucket_do_diario(s: str | None = None) -> str:
    """hml-19b: o bucket das fotos do diário do ambiente (staging = diario-staging)."""
    return "diario-staging" if (s or schema()) == "staging" else "diario"


# ───────────────────────── as regras do servidor, lidas do TS (sem rede) ─────────────────────────
_JS_REGRAS = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(process.argv[1]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const saida = { acoes: Object.fromEntries(m.ACOES_NUTRICAO.map((a) => [a, { tabela: m.ACOES[a].tabela, operacao: m.ACOES[a].operacao }])),
  tabelas: [...m.TABELAS_PRONTUARIO], conferidos: [],
  // hml-19b: a Dieta e o app do aluno (as listas à parte; o despacho moduloDoPedido)
  acoes_dieta: Object.fromEntries((m.ACOES_DA_DIETA ?? []).map((a) => [a, { tabela: m.ACOES_DIETA[a].tabela, operacao: m.ACOES_DIETA[a].operacao }])),
  acoes_aluno: [...(m.ACOES_DO_ALUNO ?? [])], tabelas_dieta: [...(m.TABELAS_DIETA ?? [])] };
const dieta = (acao, corpo) => {
  switch (acao) {
    case "padroes_garantir": return m.secaoDoPadraoDaDieta(corpo.secao) ? { ok: true } : { ok: false, erro: "secao_invalida" };
    case "plano_criar": return m.lerPlanoNovo(corpo);
    case "plano_duplicar": return m.lerDuplicarPlano(corpo);
    case "plano_copiar_semana": return m.lerCopiarSemana(corpo);
    case "dieta_ordenar": return m.lerOrdenar(corpo);
    case "receita_salvar": return m.lerReceita(corpo);
    case "alimento_salvar": return m.lerAlimento(corpo);
    case "registro_diario_salvar": return m.lerRegistroDiario(corpo, e.userId);
    case "diario_reagir": return m.lerReacao(corpo, new Date(0));
    case "grupo_receita_excluir": case "diario_excluir": return m.ehUuid(corpo.id) ? { ok: true } : { ok: false, erro: "dados_invalidos", campo: "id" };
    default: return m.montarGravacaoDieta(acao, corpo, e.userId, new Date(0));
  }
};
const aluno = (acao, corpo) => {
  switch (acao) {
    case "aluno_marcar_refeicao": return m.lerMarcacao(corpo, "refeicao_id");
    case "aluno_marcar_meta": return m.lerMarcacao(corpo, "meta_id");
    case "aluno_diario_preparar": return m.lerPedidoDeFotoDoDiario(corpo);
    default: return m.lerEnvioDoDiario(corpo);
  }
};
for (const [acao, corpo] of e.pedidos ?? []) {
  let r;
  const mod = m.moduloDoPedido ? m.moduloDoPedido({ ...corpo, acao }) : null;
  if (mod && mod.modulo === "dieta") r = dieta(acao, corpo);
  else if (mod && mod.modulo === "aluno") r = aluno(acao, corpo);
  else if (acao === "padroes_garantir") r = m.secaoDoPadrao(corpo.secao) ? { ok: true } : { ok: false, erro: "secao_invalida" };
  else if (acao === "anexo_preparar") r = m.lerPedidoDeAnexo(corpo);
  else if (acao === "anexo_registrar") r = m.lerRegistroDeAnexo(corpo, e.userId);
  else if (acao === "anexo_excluir") r = m.ehUuid(corpo.id) ? { ok: true } : { ok: false, erro: "dados_invalidos", campo: "id" };
  else if (acao === "registro_gestacional_salvar") r = m.lerRegistroGestacional(corpo, e.userId);
  else r = m.montarGravacao(acao, corpo, e.userId, new Date(0));
  saida.conferidos.push({ acao, modulo: mod ? mod.modulo : null, ok: r.ok === true, erro: r.erro ?? null, campo: r.campo ?? null, valores: r.valores ?? null,
    linhas: r.linhas ?? null, r });
}
console.log(JSON.stringify(saida));
"""


def regras(pedidos: list[tuple[str, dict]] | None = None, user_id: str = "33333333-3333-4333-8333-333333333333") -> dict:
    """As regras da função (as ações, as tabelas) e, para cada (acao, corpo), o que o servidor faria — do próprio TS."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_REGRAS, str(REGRAS_TS)],
                       input=json.dumps({"pedidos": pedidos or [], "userId": user_id}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


def tabelas_do_prontuario() -> set[str]:
    texto = REGRAS_TS.read_text(encoding="utf-8")
    bloco = texto.split("export const TABELAS_PRONTUARIO = [", 1)[1].split("] as const;", 1)[0]
    return set(re.findall(r'"([a-z_]+)"', bloco))


def rpcs_que_gravam() -> set[str]:
    texto = (REPO / "src" / "integrations" / "repeticao.ts").read_text(encoding="utf-8")
    bloco = texto.split("export const RPC_QUE_GRAVAM", 1)[1].split("]);", 1)[0]
    return set(re.findall(r'"([a-z0-9_]+)"', bloco))


def tabelas_da_dieta() -> set[str]:
    texto = REGRAS_TS.read_text(encoding="utf-8")
    if "export const TABELAS_DIETA = [" not in texto:
        return set()
    bloco = texto.split("export const TABELAS_DIETA = [", 1)[1].split("] as const;", 1)[0]
    return set(re.findall(r'"([a-z_]+)"', bloco))


TABELAS = tabelas_do_prontuario()
TABELAS_DIETA = tabelas_da_dieta()
# hml-19b: as RPCs que o app do aluno chamava direto (o código antigo, o ANTES) — gravam, mesmo depois de saírem do RPC_QUE_GRAVAM
RPCS_DO_APP = {"paciente_marcar_refeicao", "aluno_marcar_meta", "diario_enviar"}
RPC_GRAVA = rpcs_que_gravam() | RPCS_DO_APP


# ───────────────────────── a guarda que CONTA (por tela e por ação) ─────────────────────────
def classificar(p: dict) -> str | None:
    """Um pedido anotado pela Tela (hml17 _anotar: tipo, nome, metodo, acao, url) → a classe de gravação (ou de laço); None = leitura."""
    m, tipo, nome, url = p.get("metodo"), p.get("tipo"), p.get("nome"), p.get("url", "")
    if m in ("OPTIONS", "HEAD"):
        return None
    if tipo == "tab":
        if m in ("POST", "PATCH", "PUT", "DELETE"):
            return "rest_prontuario" if nome in TABELAS else "rest_dieta" if nome in TABELAS_DIETA else "rest_outras"
        return "get_profiles" if (m == "GET" and nome == "profiles") else None
    if tipo == "rpc":
        return "rpc_grava" if nome in RPC_GRAVA else None
    if tipo == "fn":
        return f"fn:{nome}" + (f"({p.get('acao')})" if p.get("acao") else "")
    if tipo == "storage":
        caminho = urlparse(url).path
        if "/object/upload/sign/" in caminho:
            return "storage_link_assinado"
        if m == "GET" or "/object/sign/" in caminho:
            return None
        return "storage_grava"
    return None


def contar(pedidos: list[dict]) -> Counter:
    return Counter(c for c in (classificar(p) for p in pedidos) if c)


def gravacoes_rest(cont: Counter) -> int:
    return cont.get("rest_prontuario", 0)


class BarrarNutricao:
    """A rota do navegador que BARRA a nutricao (route.abort) e conta cada ação barrada — o laco.py (H-81: 1 chamada só e o aviso
    "Tentar de novo" na tela). Instale antes de abrir a tela."""

    def __init__(self) -> None:
        self.barradas: Counter = Counter()

    def instalar(self, ctx) -> None:
        def rota(route, req) -> None:
            if req.method == "POST" and urlparse(req.url).path.startswith("/functions/v1/nutricao"):
                self.barradas[B17.acao_do_corpo(req) or "?"] += 1
                route.abort()
                return
            route.fallback()
        ctx.route(re.compile(r"https://api-principal\.physiqcalc\.com\.br/functions/v1/nutricao"), rota)


def _tirar_legal(obj):
    """O `legal` desligado e o aviso de mudança visto, SÓ na resposta que o navegador recebe (o mesmo da hml-18 e da medição da spec)."""
    sit = obj.get("situacao") if isinstance(obj, dict) and isinstance(obj.get("situacao"), dict) else obj
    if isinstance(sit, dict):
        sit["legal"] = {"versao": None, "aceite_pendente": False, "saude_pendente": False, "nascimento_pendente": False, "menor": None}
        if isinstance(sit.get("aviso_mudanca"), dict):
            sit["aviso_mudanca"]["visto"] = True
    return obj


class LegalDesligado:
    """A porta do aceite (hml-12) e o aviso "o Physiq mudou" não cobrem a tela: o pos-login e a minha_situacao voltam com o `legal`
    desligado SÓ no navegador (as contas de teste não aceitaram os textos de cada ambiente, e aceitar é gravar — na produção, a Guarda
    barraria). Nada grava. Instale depois da Guarda (a última rota registrada roda primeiro)."""

    def instalar(self, ctx) -> None:
        ctx.route(re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/"), self._legal)

    @staticmethod
    def _legal(route, req) -> None:
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


# ───────────────────────── a guarda do /health (H-80) ─────────────────────────
def saude() -> tuple[bool, dict]:
    """/health dos 2 projetos (db, auth, rest) pela Management API: True só com tudo ACTIVE_HEALTHY."""
    estados: dict = {}
    for ref in ("uxwpwdbbnlticxgtzcsb", PRINCIPAL_REF):
        st, r, _h = B5.http("GET", f"https://api.supabase.com/v1/projects/{ref}/health?services=db,auth,rest", None,
                            {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=25)
        estados[ref[:6]] = {x.get("name"): x.get("status") for x in r} if st == 200 and isinstance(r, list) else {"http": st}
    ok = all(v and all(s == "ACTIVE_HEALTHY" for s in v.values()) for v in estados.values())
    return ok, estados


def exigir_saude(o, rotulo: str) -> None:
    ok, estados = saude()
    o.ok(ok, f"/health dos 2 projetos antes de {rotulo}: {estados}", parar=True)


# ───────────────────────── o estado da rodada (o --limpar) ─────────────────────────
class Estado:
    """O que a rodada criou: {"rodada", "schema", "linhas": [[tabela, id]], "storage": [[bucket, caminho]], "n8": {...}}."""

    def __init__(self, dados: dict | None = None) -> None:
        self.d = dados or {"rodada": None, "schema": None, "linhas": [], "storage": [], "n8": None}

    @classmethod
    def ler(cls) -> "Estado":
        d = C.ler_json(ESTADO_ARQ)
        return cls(d if isinstance(d, dict) else None)

    def salvar(self) -> None:
        C.json_arquivo(ESTADO_ARQ, self.d)

    def linha(self, tabela: str, id_: object) -> None:
        if tabela in (TABELAS | TABELAS_DIETA) and C.eh_uuid(id_) and [tabela, id_] not in self.d["linhas"]:
            self.d["linhas"].append([tabela, id_])
            self.salvar()

    def objeto(self, bucket: str, caminho: str) -> None:
        if [bucket, caminho] not in self.d["storage"]:
            self.d["storage"].append([bucket, caminho])
            self.salvar()

    def vazio(self) -> bool:
        return not (self.d["linhas"] or self.d["storage"] or self.d.get("n8"))

    def apagar(self) -> None:
        if ESTADO_ARQ.exists():
            ESTADO_ARQ.unlink()


# hml-19b: as filhas da Dieta não têm dono nem Lixeira — saem com o pai (o plano, o alimento, a receita) em cascata
DIETA_SEM_DONO = {"refeicoes", "itens_refeicao", "medidas_caseiras", "ingredientes_receita"}
# a ordem do DELETE da Dieta (as FKs do staging, catálogo de 11/10): quem aponta para outra sai antes — o item e o ingrediente apontam
# para o alimento SEM cascata (então o plano e a receita saem antes do alimento); o resto é cascata ou "set null"
ORDEM_LIMPEZA_DIETA = (
    "diario_alimentar", "registros_diarios", "indicacoes_produto", "formulas_manipuladas", "metas", "orientacoes", "planos_alimentares",
    "calculos_energeticos", "receitas", "grupos_receita", "alimentos", "produtos", "modelos_formula", "modelos_meta", "modelos_orientacao",
)


def _ordem_do_delete(tabela: str) -> tuple[int, str]:
    return (ORDEM_LIMPEZA_DIETA.index(tabela) if tabela in ORDEM_LIMPEZA_DIETA else -1, tabela)


def sql_apagar_linhas(s: str, linhas: list[list[str]], dono: str) -> list[str]:
    """O DELETE da massa da rodada (só no staging, só os ids da rodada E do dono de TESTE): 1 comando por tabela. hml-19b: as tabelas
    da Dieta com dono entram do mesmo jeito, na ordem das FKs (ORDEM_LIMPEZA_DIETA, depois das do Prontuário); as filhas (sem dono)
    ficam de fora — saem com o pai em cascata."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    C.uuid_ok(dono)
    por: dict[str, list[str]] = {}
    for tabela, id_ in linhas:
        if (tabela in TABELAS or (tabela in TABELAS_DIETA and tabela not in DIETA_SEM_DONO)) and C.eh_uuid(id_):
            por.setdefault(tabela, []).append(id_)
    return [f"delete from {s}.{tabela} where nutricionista_id = '{dono}' and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])"
            for tabela, ids in sorted(por.items(), key=lambda x: _ordem_do_delete(x[0]))]


def sql_contar_marca(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-19 em cada tabela do Prontuário (vivas e na Lixeira)."""
    marca = f"{MARCA} {rodada}" if rodada else MARCA
    colunas = {
        "registros_prontuario": "texto", "consultas": "observacao", "anamneses": "titulo", "modelos_anamnese": "titulo",
        "respostas_questionario": "titulo", "questionarios": "titulo", "pedidos_exame": "observacao", "resultados_exame": "exame",
        "exames_catalogo": "nome", "avaliacoes_integradas": "titulo", "gestacoes": "observacao", "registros_gestacionais": "observacao",
        "medicamentos_paciente": "medicamento", "analises_farmaco": "titulo", "interacoes_farmaco_nutriente": "medicamento",
        "documentos": "titulo", "modelos_documento": "titulo", "anexos": "nome",
    }
    assert set(colunas) == TABELAS, sorted(TABELAS ^ set(colunas))
    partes = [f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + marca.replace(' ', '%') + '%')})::int as {t}" for t, c in sorted(colunas.items())]
    return "select " + ", ".join(partes)


# ───────────────────────── hml-19b: a marca nas tabelas da Dieta (só contagem) ─────────────────────────
# a coluna de texto onde a rodada põe a marca, em cada tabela da Dieta com dono (as filhas saem com o pai)
COLUNAS_MARCA_DIETA = {
    "planos_alimentares": "titulo", "registros_diarios": "observacao", "calculos_energeticos": "observacao", "produtos": "nome",
    "indicacoes_produto": "produto_nome", "formulas_manipuladas": "titulo", "modelos_formula": "titulo", "metas": "titulo",
    "modelos_meta": "titulo", "orientacoes": "titulo", "modelos_orientacao": "titulo", "alimentos": "nome", "receitas": "nome",
    "grupos_receita": "nome", "diario_alimentar": "comentario",
}


def sql_contar_marca_dieta(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-19 em cada tabela da Dieta com dono (vivas e na Lixeira)."""
    marca = f"{MARCA} {rodada}" if rodada else MARCA
    assert set(COLUNAS_MARCA_DIETA) == TABELAS_DIETA - DIETA_SEM_DONO, sorted((TABELAS_DIETA - DIETA_SEM_DONO) ^ set(COLUNAS_MARCA_DIETA))
    partes = [f"(select count(*) from {s}.{t} where {c} like {C.txt('%' + marca.replace(' ', '%') + '%')})::int as {t}"
              for t, c in sorted(COLUNAS_MARCA_DIETA.items())]
    return "select " + ", ".join(partes)
