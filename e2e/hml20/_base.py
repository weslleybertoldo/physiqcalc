"""Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — base dos E2E da hml-20 (api.py, rede.py, telas.py): as LEITURAS de saúde
pelo servidor (a ação `ler` da nutricao e a `minha_evolucao` da admin-avaliacoes).

Reaproveita a base da hml-19 (e2e/hml19/_base.py: as sessões de TESTE guardadas entre os scripts, com o teto de logins e a sessão do
Treino pela MESMA troca do app; a nutricao e a admin-avaliacoes como a tela chama; o Storage pelo link assinado; o /health dos 2 projetos;
o Estado da rodada e o --limpar; o SIGTERM que vira SystemExit) — que por sua vez usa a da hml-17 (as contas de TESTE, a Guarda da
produção, a Tela com a sessão antes do 1º documento e os pedidos anotados por alvo, o SQL só leitura). Junta:
  · ler()/minha_evolucao()  a ação `ler` da nutricao ({ acao: "ler", itens }) e a `minha_evolucao` da admin-avaliacoes, como a tela chama;
  · regras_leitura()        o catálogo e o motor do SERVIDOR lidos do próprio TS (node, sem rede): as consultas, os params, o leitor do
                            pedido (lerPedidoDeLeitura) e, do Treino, a ACOES_DE_LEITURA e as colunas — o --seco confere cada pedido;
  · ler_como()              SQL SÓ LEITURA "como a pessoa" (set transaction read only + o papel authenticated + o sub nas claims, igual ao
                            PostgREST): o P compara a função com a MESMA RPC/consulta rodada no banco como aquela pessoa;
  · a guarda que CONTA      por tela: as leituras DIRETAS da área (GET das tabelas, POST das RPCs de leitura e o "sign" dos buckets da
                            área), as leituras pela função (o `ler`, com as consultas, e a `minha_evolucao`) e as gravações ao abrir;
  · sair_do_treino()        o logout (scope=local) da sessão do TREINO que o app abriu no navegador (decisão 23: a troca do app cria 1
                            sessão no Auth do Treino a cada abertura — o E2E sai dela no fim);
  · a massa                 "hml20 e2e <rodada>" SÓ no schema staging e nos buckets *-staging, SÓ nas contas de TESTE, pelos caminhos que
                            já existem (o diário pela nutricao, a foto de evolução pela nutricao, a foto mensal pela admin-avaliacoes no mês
                            sentinela 2000-01); os ids no Estado (hml19/agente/e2e_estado.json) e o --limpar desfaz.
Antes de CADA execução que toca o staging: a PAUSA (~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>") e
o /health (exigir_saude, dentro dos scripts). O registro de logins é o da W (hml-20b: hml20/agente/logins_etapa2_20b.txt — o da 20a
fica; hml-20c: logins_etapa2_20c.txt — o da 20b fica; hml-20d: logins_etapa2_20d.txt — o da 20c fica; teto 10 da W, no máximo 6 na etapa 2).
hml-20b: o `--area painel-aluno` (o Painel › Aluno: casca, Resumo, Prontuário ×10, Avaliação, PDF) mora em painel.py (as definições),
painel_api.py (os casos de servidor) e painel_tela.py (a rede e as telas); daqui ele usa a guarda que conta (AREAS["painel-aluno"], posta
pelo painel.py), o regras_leitura (o catálogo inteiro, com os campos da 20b) e o print_reduzido (a pasta prints/hml20/b).
hml-20c: o `--area dieta` (a Dieta do aluno ×8, as Dietas ×3, a Pré-consulta ×2 e o Dashboard de saúde; as 5 gravações da Pré-consulta
pela função) mora em dieta.py, dieta_api.py e dieta_tela.py, do mesmo jeito (AREAS["dieta"]; o regras_leitura com os campos da 20c —
recorte, embutidos, HEAD, total por dia, faixa, os ★ do dono, a releitura pelos ids; os prints em prints/hml20/c).
Sem segredo nem dado pessoal na saída: chaves pela Management API, senhas em ~/.physiq-teste-<nome> (600); das respostas só saem status,
códigos, contagens e tempos.
"""
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]

_ESPEC = importlib.util.spec_from_file_location("_base_hml19", REPO / "e2e" / "hml19" / "_base.py")
B19 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_hml19"] = B19
_ESPEC.loader.exec_module(B19)  # type: ignore[union-attr]
B17, C, B5 = B19.B17, B19.C, B19.B5

SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml20"
C.SAIDA = SCRATCH / "agente"
MEDICAO = SCRATCH / "medicao"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml20" / "a"
MARCA = "hml20 e2e"
ARQUIVO_MARCA = "hml20-e2e"  # no nome do arquivo da foto de evolução (o caminho é <nutri>/<aluno>/<uuid>-<nome seguro>)
BASES = B19.BASES
SCHEMA_DA_BASE = B19.SCHEMA_DA_BASE
ORIGEM_FORA, ORIGEM_PADRAO, ORIGEM_PADRAO_TREINO = B19.ORIGEM_FORA, B19.ORIGEM_PADRAO, B19.ORIGEM_PADRAO_TREINO
MES_SENTINELA = B19.MES_SENTINELA
PRINCIPAL_REF, TREINO_REF = B19.PRINCIPAL_REF, B19.TREINO_REF
API_P, API_T = B19.API_P, B19.API_T
API_P_HOST, API_T_HOST = B19.API_P_HOST, B19.API_T_HOST

A_CONTA = "w5p-aluna"         # a aluna de TESTE (P: o app — Início, Evolução, Dieta/Diário)
P_CONTA = "w5p-nutri"         # a nutri de TESTE da aluna (a foto de evolução da massa; N10)
PERSONAL_CONTA = "w5p-personal"  # a personal de TESTE da aluna (a foto mensal da massa, no Treino; N10)
N1_CONTA = "w13-dono"         # o profissional de OUTRA conta (N1)
PROD_CONTA = "nutri-legado"   # produção, SÓ LEITURA

REG_LOGINS = B19.REG_LOGINS
LEITURAS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "nutricao-leituras.ts"
MOTOR_TS = REPO / "supabase-principal" / "functions" / "_shared" / "leitura-lote.ts"
REGRAS_TREINO_TS = B19.REGRAS_TREINO_TS

corte_vira_saida = B19.corte_vira_saida
exigir_saude = B19.exigir_saude
saude = B19.saude
Sessoes = B19.Sessoes
Estado = B19.Estado
ESTADO_ARQ = B19.ESTADO_ARQ
nova_rodada = B19.nova_rodada
schema = B19.schema
cors = B19.cors
preflight, preflight_treino = B19.preflight, B19.preflight_treino
subir_no_link, subir_no_link_treino = B19.subir_no_link, B19.subir_no_link_treino
remover_do_storage, remover_do_storage_treino = B19.remover_do_storage, B19.remover_do_storage_treino
bucket_do_diario, bucket_da_evolucao, bucket_dos_registros = B19.bucket_do_diario, B19.bucket_da_evolucao, B19.bucket_dos_registros
ler_treino = B19.ler_treino
jpeg_sintetico = B19.jpeg_sintetico
LegalDesligado = B19.LegalDesligado
Guarda = B17.Guarda
Tela = B17.Tela


def usar_base(base: str) -> str:
    """local e staging = schema staging (as funções publicadas atendem os 2 schemas pelo x-schema); prod = public."""
    return B19.usar_base(base)


# ───────────────────────── as funções como a tela chama ─────────────────────────
def ler(token: str | None, itens: list[dict] | None, *, corpo: dict | None = None, origem: str | None = None, schema_: str | None = None,
        sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na nutricao com a ação `ler` (o lote: { acao: "ler", itens }) → (status, corpo JSON, cabeçalhos, ms). itens None = sem a
    chave (o pedido torto do N); `corpo` = chaves a mais no corpo (o que o servidor tem de ignorar)."""
    c = dict(corpo or {})
    if itens is not None:
        c["itens"] = itens
    return B19.funcao(token, "ler", c, origem=origem, schema_=schema_, sem_auth=sem_auth, timeout=timeout)


def minha_evolucao(token: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
                   sem_auth: bool = False) -> tuple[int, dict, dict, float]:
    """POST na admin-avaliacoes com a ação minha_evolucao (o carregarTreino da tela) → (status, corpo JSON, cabeçalhos, ms)."""
    return B19.funcao_treino(token, "minha_evolucao", corpo, origem=origem, schema_=schema_, sem_auth=sem_auth)


def item(q: str, **params) -> dict:
    """Um item do lote como a tela manda ({ ...params, q } — a q por último: nenhum param troca a consulta)."""
    return {**params, "q": q}


PREFIXO_ASSINADA = "/storage/v1/object/sign/"


def url_da_tela(base_api: str, relativa: object) -> str | None:
    """A URL assinada relativa que o servidor devolve, montada com o domínio do cliente (o urlDoServidor da tela)."""
    if not isinstance(relativa, str) or not relativa.startswith(PREFIXO_ASSINADA):
        return None
    return base_api.rstrip("/") + relativa


def baixar(url: str) -> tuple[int, int, str]:
    """GET da imagem pela URL assinada (o <img> da tela, sem login: a URL é a capacidade) → (status, bytes, content-type)."""
    import urllib.error  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415
    req = urllib.request.Request(url, headers={"User-Agent": "physiq-hml20-e2e/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            corpo = r.read()
            return r.status, len(corpo), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        return e.code, 0, ""


# ───────────────────────── as regras do SERVIDOR, lidas do TS (sem rede) ─────────────────────────
_JS_LEITURA = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const motor = await import(pathToFileURL(process.argv[1]).href);
const cat = await import(pathToFileURL(process.argv[2]).href);
const treino = await import(pathToFileURL(process.argv[3]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const consultas = Object.fromEntries(cat.CONSULTAS_DA_NUTRICAO.map((q) => {
  const c = cat.CONSULTAS_NUTRICAO[q];
  const f = c.fonte;
  return [q, { params: c.params, rpc: f.rpc ?? null, args: f.args ?? null, tabela: f.tabela ?? null, colunas: f.colunas ?? null, teto: f.teto ?? null,
    filtros: f.filtros ?? null, vivas: f.vivas ?? false, dono: c.dono ?? null, assinar: c.assinar ?? null, sozinha: c.sozinha ?? false,
    ordem: f.ordem ?? null, erros: f.erros ? [...f.erros] : null, pagina: f.pagina ?? null, contar: f.contar ?? false, laco: f.laco ?? null, uma: f.uma ?? false,
    // hml-20c: o recorte da conta, os embutidos, o HEAD, o total de cada dia, a faixa, os ★ do dono, a releitura pelos ids, os nulos e o "meus"
    recorte: f.recorte ?? null, embutidos: f.embutidos ?? null, soContar: f.soContar ?? false, porDia: f.porDia ?? null, faixa: f.faixa ?? null,
    filtrarLista: f.filtrarLista ?? null, linhasDosIds: f.linhasDosIds ?? null, nulos: f.nulos ?? null, donoSe: c.donoSe ?? null }];
}));
const saida = {
  consultas, lote_max: motor.LOTE_MAX, paralelo: motor.LOTE_PARALELO, q_max: motor.Q_MAX, teto_max: motor.TETO_MAX, validade_max: motor.VALIDADE_MAX_S,
  diario_ids_max: cat.DIARIO_IDS_MAX, validade: cat.VALIDADE_URL_LEITURA_S,
  buckets: Object.fromEntries(["diario", "evolucao"].flatMap((b) => ["public", "staging"].map((s) => [`${b}:${s}`, cat.bucketDaLeitura(b, s)]))),
  buckets_todos: Object.fromEntries([...cat.BUCKETS_DE_LEITURA].flatMap((b) => ["public", "staging"].map((s) => [`${b}:${s}`, cat.bucketDaLeitura(b, s)]))),
  limites: { lote_paralelo: motor.LOTE_PARALELO, laco_max: motor.LACO_LEITURAS_MAX, erro_laco: motor.ERRO_MUITAS_LINHAS },
  treino: { acoes_de_leitura: [...treino.ACOES_DE_LEITURA], acoes_que_gravam: [...treino.ACOES_QUE_GRAVAM], perfil: [...treino.COLUNAS_PERFIL_EVOLUCAO],
    avaliacoes: [...treino.COLUNAS_AVALIACOES_EVOLUCAO], fotos: [...treino.COLUNAS_FOTOS_EVOLUCAO], max_avaliacoes: treino.MAX_AVALIACOES_EVOLUCAO,
    max_fotos: treino.MAX_FOTOS_EVOLUCAO, validade: treino.VALIDADE_URL_EVOLUCAO_S, freio: treino.FREIO_EVOLUCAO_POR_MINUTO,
    buckets: { public: treino.bucketDosRegistros("public"), staging: treino.bucketDosRegistros("staging") } },
  pedidos: (e.pedidos ?? []).map((corpo) => {
    const r = motor.lerPedidoDeLeitura(corpo, cat.CONSULTAS_NUTRICAO);
    return r.ok === false ? { ok: false, erro: r.erro } : { ok: true, itens: r.itens };
  }),
  acoes: (e.acoes ?? []).map((a) => ({ action: a, leitura: treino.ehAcaoDeLeitura(a), grava: treino.ACOES_QUE_GRAVAM.has(a) })),
  erros: (e.erros ?? []).map((x) => motor.erroDaLeitura(x)),
  erros_rota: (e.erros ?? []).map((x) => motor.erroDaLeitura(x, cat.ERROS_DA_ROTA)),
};
console.log(JSON.stringify(saida));
"""


def regras_leitura(pedidos: list[dict] | None = None, acoes: list[str] | None = None, erros: list[dict] | None = None) -> dict:
    """O catálogo e o motor da `ler` (nutricao) e as regras da minha_evolucao (Treino), do próprio TS; para cada corpo em `pedidos`, o que o
    lerPedidoDeLeitura do servidor faz (os itens lidos ou a recusa do pedido); para cada ação em `acoes`, se o Treino a trata como leitura."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_LEITURA,
                        str(MOTOR_TS), str(LEITURAS_TS), str(REGRAS_TREINO_TS)],
                       input=json.dumps({"pedidos": pedidos or [], "acoes": acoes or [], "erros": erros or []}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras da leitura): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# ───────────────────────── SQL só leitura "como a pessoa" (o P) ─────────────────────────
def sql_como(user_id: str, consulta: str, email: str | None = None) -> str:
    """A consulta numa transação SÓ LEITURA com o papel authenticated e o sub nas claims (o que o PostgREST faz com o token da pessoa):
    o RLS e o auth.uid() de dentro das RPCs valem como na função. Nada grava (set transaction read only na frente)."""
    C.uuid_ok(user_id)
    claims = {"sub": user_id, "role": "authenticated", "aud": "authenticated"}
    if email:
        claims["email"] = email
    return ("set transaction read only;\n"
            f"select set_config('request.jwt.claims', {C.txt(json.dumps(claims))}, true), set_config('request.jwt.claim.sub', {C.txt(user_id)}, true), "
            "set_config('role', 'authenticated', true);\n" + consulta)


def ler_como(ref: str, user_id: str, consulta: str, email: str | None = None) -> list[dict]:
    """A consulta como a pessoa (sql_como), pela Management API, SÓ LEITURA; devolve as linhas da última instrução."""
    sql = sql_como(user_id, consulta, email)
    if re.search(r"(?i)\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|call|vacuum|refresh)\b\s", re.sub(r"'[^']*'", "''", consulta)):
        raise SystemExit("palavra de escrita na consulta do P — recusado")
    st, r, _ = B5.http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query", {"query": sql},
                       {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=180)
    if st not in (200, 201):
        raise RuntimeError(f"SQL só leitura (como a pessoa) em {ref[:6]}… → HTTP {st}: {str(r)[:200]}")
    return r if isinstance(r, list) else []


def ler_principal(sql: str) -> list[dict]:
    """SQL SÓ LEITURA no principal (read_only)."""
    return B17.ler(sql)


# ───────────────────────── a área do app do aluno (o que saiu do navegador) ─────────────────────────
AREAS = {
    "aluno": {
        # Treino (a Evolução: carregarTreino) e principal (o que o app relê/assina)
        "tabelas": {"physiq_profiles", "physiq_avaliacoes", "physiq_registros_fotos", "diario_alimentar", "fotos_evolucao", "antropometrias"},
        "rpcs": {"minha_dieta", "minha_evolucao"},
        "buckets": {"diario", "diario-staging", "evolucao", "evolucao-staging", "registros", "registros-staging"},
        # o DESVIO do gate J (decisão da sessão principal, 12/10/2026; docs/desvios.md): a parte do TREINO da Evolução/Início segue no
        # navegador, igual ao 637363f — as 3 GET physiq_* e o sign do registros. Contado à parte: aceito só no Início e na Evolução; as
        # leituras diretas do PRINCIPAL da área (as 2 RPCs, as tabelas e os buckets diario/evolucao) têm de ser 0 depois
        "desvio": {"tab:physiq_profiles", "tab:physiq_avaliacoes", "tab:physiq_registros_fotos", "sign:registros", "sign:registros-staging"},
    },
}


def _bucket_do_sign(url: str) -> str | None:
    caminho = urlparse(url).path
    m = re.match(r"^/storage/v1/object/sign/([A-Za-z0-9_\-]+)", caminho)
    return m.group(1) if m else None


def leitura_direta(p: dict, area: str = "aluno") -> str | None:
    """Um pedido anotado pela Tela (hml17 _anotar) → a leitura DIRETA da área (tab:<t> · rpc:<f> · sign:<bucket>) ou None."""
    a = AREAS[area]
    metodo, tipo, nome, url = p.get("metodo"), p.get("tipo"), p.get("nome"), p.get("url", "")
    if tipo == "tab" and metodo in ("GET", "HEAD") and nome in a["tabelas"]:
        return f"tab:{nome}"
    if tipo == "rpc" and metodo == "POST" and nome in a["rpcs"]:
        return f"rpc:{nome}"
    if tipo == "storage" and metodo == "POST":
        b = _bucket_do_sign(url)
        if b and b in a["buckets"]:
            return f"sign:{b}"
    return None


def consultas_do_corpo(corpo: str | None) -> list[str]:
    """As consultas (q) de um corpo `ler` (na ordem); corpo ilegível → []."""
    try:
        b = json.loads(corpo or "")
    except Exception:  # noqa: BLE001
        return []
    itens = b.get("itens") if isinstance(b, dict) else None
    return [str(i.get("q")) for i in itens if isinstance(i, dict)] if isinstance(itens, list) else []


def leitura_pela_funcao(p: dict) -> str | None:
    """Um pedido de LEITURA pela função (o corpo de leitura do jeito 2: nutricao/financeiro `ler`, admin-avaliacoes minha_evolucao)."""
    if p.get("tipo") != "fn" or p.get("metodo") != "POST":
        return None
    nome = p.get("nome")
    if not B17.corpo_de_leitura(nome, p.get("corpo")):
        return None
    return f"fn:{nome}(ler)" if nome in ("nutricao", "financeiro") else f"fn:{nome}(minha_evolucao)"


def gravacao(p: dict) -> str | None:
    """O pedido GRAVA? (a regra da Guarda dos E2E — com o corpo — e a classificação da hml-19 para rest, RPC e Storage). None = leitura."""
    if p.get("metodo") in ("OPTIONS", "HEAD", "GET"):
        return None
    tipo, nome = p.get("tipo"), p.get("nome")
    if tipo == "fn":
        if nome in ("pos-login", "trocar-token"):  # a sessão do app (não é gravação da tela)
            return None
        return f"fn:{nome}({p.get('acao') or '?'})" if B17.funcao_grava(nome, p.get("acao"), p.get("corpo")) else None
    c = B19.classificar(p)
    return c if c and c != "get_profiles" and not c.startswith("fn:") else None


def contar_tela(pedidos: list[dict], area: str = "aluno") -> dict:
    """O que a guarda CONTA numa tela: as leituras diretas da área (todas; e separadas em `desvio` — a parte do Treino que ficou no
    navegador — e `diretas_principal` — o resto, que tem de ser 0 depois), as leituras pela função (e as consultas de cada `ler`) e as
    gravações (que têm de ser 0 ao abrir)."""
    diretas = Counter(x for x in (leitura_direta(p, area) for p in pedidos) if x)
    desvio = AREAS[area].get("desvio", set())
    funcao = Counter(x for x in (leitura_pela_funcao(p) for p in pedidos) if x)
    gravacoes = Counter(x for x in (gravacao(p) for p in pedidos) if x)
    qs = Counter(q for p in pedidos if leitura_pela_funcao(p) == "fn:nutricao(ler)" for q in consultas_do_corpo(p.get("corpo")))
    return {"diretas": dict(diretas), "desvio": {k: v for k, v in diretas.items() if k in desvio},
            "diretas_principal": {k: v for k, v in diretas.items() if k not in desvio}, "funcao": dict(funcao), "consultas": dict(qs),
            "gravacoes": dict(gravacoes)}


# ───────────────────────── a sessão do Treino que o app abriu no navegador (decisão 23) ─────────────────────────
def token_do_treino_no_navegador(pg) -> str | None:
    """O access token da sessão do TREINO guardada pelo app (a chave padrão do supabase-js: sb-<host>-auth-token)."""
    try:
        bruto = pg.evaluate("""() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
            if (/^sb-.*-auth-token$/.test(k)) return localStorage.getItem(k); } return null; }""")
    except Exception:  # noqa: BLE001 — a página fechou
        return None
    try:
        s = json.loads(bruto) if bruto else None
    except json.JSONDecodeError:
        return None
    if isinstance(s, dict):
        s = s.get("currentSession") or s
        tok = s.get("access_token") if isinstance(s, dict) else None
        return tok if isinstance(tok, str) and tok else None
    return None


def sair_do_treino(o, pg, rotulo: str) -> None:
    """O logout (scope=local) da sessão do Treino que a troca do app abriu neste navegador — o E2E não deixa sessão do Treino aberta."""
    tok = token_do_treino_no_navegador(pg)
    if not tok:
        o.linha(f"   ({rotulo}: nenhuma sessão do Treino no navegador para fechar)")
        return
    try:
        st: object = C.sair_local(tok, "treino")
    except Exception as e:  # noqa: BLE001
        st = type(e).__name__
    o.ok(st in (200, 204), f"{rotulo}: logout (scope=local) da sessão do Treino que o app abriu ({st})", parar=False)


# ───────────────────────── a massa e a limpeza (só contagem na conferência) ─────────────────────────
def sql_contar_marca(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da hml-20 no diário e nas fotos de evolução (vivas e na Lixeira)."""
    marca = f"%{MARCA}%{rodada}%" if rodada else f"%{MARCA}%"
    return (f"select (select count(*) from {s}.diario_alimentar where comentario like {C.txt(marca)})::int as diario_alimentar, "
            f"(select count(*) from {s}.fotos_evolucao where observacao like {C.txt(marca)})::int as fotos_evolucao")


def sql_contar_objetos(s: str, rodada: str | None, caminhos: list[str]) -> str:
    """Só contagem: os arquivos da rodada nos buckets do principal (o nome com a marca, ou os caminhos anotados no Estado)."""
    marca = f"%{ARQUIVO_MARCA}-{rodada}%" if rodada else f"%{ARQUIVO_MARCA}-%"
    nomes = ", ".join(C.txt(c) for c in caminhos) or "''"
    return (f"select count(*)::int as n from storage.objects where bucket_id in ({C.txt(bucket_do_diario(s))}, {C.txt(bucket_da_evolucao(s))}) "
            f"and (name like {C.txt(marca)} or name = any(array[{nomes}]::text[]))")


def sql_apagar_diario(s: str, paciente: str, ids: list[str]) -> str:
    """O DELETE das linhas do diário da rodada (só no staging, só a matrícula da aluna de TESTE, só os ids anotados)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para apagar")
    return (f"delete from {s}.diario_alimentar where paciente_id = {C.txt(C.uuid_ok(paciente))} "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[])")


def sql_apagar_fotos_evolucao(s: str, dono: str, ids: list[str]) -> str:
    """O DELETE das fotos de evolução da rodada (só no staging, só da nutri de TESTE, só os ids anotados)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para apagar")
    return (f"delete from {s}.fotos_evolucao where nutricionista_id = {C.txt(C.uuid_ok(dono))} "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[])")


sql_contar_sentinela = B19.sql_contar_sentinela
sql_apagar_fotos_treino = B19.sql_apagar_fotos_treino


def png_sintetico(lado: int = 8) -> bytes:
    """Uma imagem PNG pequena gerada aqui (nunca foto real) — a foto do diário de teste."""
    import io  # noqa: PLC0415
    from PIL import Image  # noqa: PLC0415
    buf = io.BytesIO()
    Image.new("RGB", (lado, lado), (90, 140, 90)).save(buf, "PNG")
    return buf.getvalue()


# ───────────────────────── a planilha (antes × depois, na MESMA) ─────────────────────────
def commit_medido(base: str) -> str:
    """O código medido: o HEAD da worktree no local; o commit do /health.json do site no staging e na produção."""
    if base == "local":
        r = subprocess.run(["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=10)
        return r.stdout.strip() or "?"
    st, r, _h = B5.http("GET", f"{BASES[base]}/health.json", None, {}, timeout=30)
    return str(r.get("commit")) if st == 200 and isinstance(r, dict) else "?"


def fase_do_codigo(base: str, commit: str) -> str:
    """depois = o commit medido tem a porta das leituras (src/nutricao/leitura.ts); antes = o código antigo (lia direto)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(REPO), "cat-file", "-e", f"{commit}:src/nutricao/leitura.ts"], capture_output=True, timeout=10)
    return "depois" if r.returncode == 0 else "antes"


def anotar_planilha(arquivo: Path, cabecalho: list[str], valores: list[object]) -> None:
    MEDICAO.mkdir(parents=True, exist_ok=True)
    novo = not arquivo.exists()
    with arquivo.open("a", encoding="utf-8") as f:
        if novo:
            f.write("\t".join(cabecalho) + "\n")
        f.write("\t".join(str(v) for v in valores) + "\n")


def print_reduzido(pg, prefixo: str, caso: str, o, pasta: Path | None = None) -> Path:
    """O print <prefixo>_<caso>.png em prints/hml20/a (hml-20b: `pasta` = prints/hml20/b) e a cópia de 900 px (para conferir: tela certa,
    sem login nem "carregando")."""
    destino = pasta or PRINTS
    destino.mkdir(parents=True, exist_ok=True)
    caminho = destino / f"{prefixo}_{caso}.png"
    for tentativa in range(3):
        try:
            pg.wait_for_timeout(700)
            pg.screenshot(path=str(caminho))
            break
        except Exception as e:  # noqa: BLE001 — o "Unable to capture screenshot" do notebook
            if tentativa == 2:
                raise
            o.linha(f"   (print: {type(e).__name__}; de novo)")
            pg.wait_for_timeout(1500)
    try:
        from PIL import Image  # noqa: PLC0415
        im = Image.open(caminho)
        im.thumbnail((900, 900))
        im.save(caminho.with_name(f"{caminho.stem}_900.png"))
    except Exception as e:  # noqa: BLE001
        o.linha(f"   (cópia de 900 px não saiu: {type(e).__name__})")
    o.linha(f"   print: {caminho}")
    return caminho


# ───────────────────────── a navegação e o "pronto" (a regra do hml20/ferramentas/medir_leituras20.py da spec) ─────────────────────────
# pronto = o instante a partir do qual a tela fica SEM esqueleto/"carregando" visível e SEM pedido pendente aos 2 domínios da API, até o fim
# da espera (quieto por QUIETO_S, no mínimo MIN_S e no máximo MAX_S). A 1ª rota abre com goto (carga fria); as outras pela navegação do
# próprio app (history.pushState + popstate, como um clique no menu).
QUIETO_S = 3.0
MIN_S = 5.0
MAX_S = 30.0
MARCAS_CARREGANDO = ('[data-estado="carregando"]', '[aria-busy="true"]', '[data-carregando-tela]', '[data-estado-aba="carregando"]',
                     '[data-carregando="1"]', '[data-carregando="true"]', '[data-carregando-categorias]')
JS_CARREGANDO = "() => [" + ",".join(json.dumps(m) for m in MARCAS_CARREGANDO) + \
    "].reduce((n, s) => n + [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null || e.getClientRects().length).length, 0)"
JS_NAVEGAR = "(r) => { history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); }"


class Pendentes:
    """Conta os pedidos em voo aos 2 domínios da API (o OPTIONS fora), pelos eventos da página."""

    def __init__(self, pg) -> None:
        self.n = 0
        pg.on("request", self._abriu)
        pg.on("requestfinished", self._fechou)
        pg.on("requestfailed", self._fechou)

    @staticmethod
    def _da_api(req) -> bool:
        return urlparse(req.url).hostname in (API_P_HOST, API_T_HOST) and req.method != "OPTIONS"

    def _abriu(self, req) -> None:
        if self._da_api(req):
            self.n += 1

    def _fechou(self, req) -> None:
        if self._da_api(req):
            self.n = max(0, self.n - 1)


def navegar(t, rota: str, primeira: bool = False) -> None:
    """A 1ª rota com goto (carga fria: o app e a sessão); as outras pela navegação do app (sem recarregar)."""
    t.zerar_pedidos()
    if primeira:
        t.pg.goto(t.base + rota, wait_until="domcontentloaded")
    else:
        t.pg.evaluate(JS_NAVEGAR, rota)


def esperar_pronto(t, pend: Pendentes, min_s: float = MIN_S, max_s: float = MAX_S, quieto_s: float = QUIETO_S,
                   marca: str | None = None) -> dict:
    """Espera a tela ficar pronta pela regra da spec e devolve {t_pronto_s, t_marca_s, pedidos}. `marca` = um seletor que diz que o dado
    chegou (o 1º instante em que ele aparece vai em t_marca_s)."""
    inicio = time.time()
    amostras: list[tuple[float, int, int]] = []
    quieto_desde = time.time()
    ultimo = len(t.pedidos)
    t_marca = None
    while time.time() - inicio < max_s:
        t.pg.wait_for_timeout(100)
        n = len(t.pedidos)
        if n != ultimo:
            ultimo, quieto_desde = n, time.time()
        try:
            carregando = int(t.pg.evaluate(JS_CARREGANDO))
        except Exception:  # noqa: BLE001 — a página trocou no meio
            carregando = 1
        agora_s = round(time.time() - inicio, 2)
        if marca and t_marca is None and t.n(marca) > 0:
            t_marca = agora_s
        amostras.append((agora_s, carregando, pend.n))
        if carregando == 0 and pend.n == 0 and time.time() - quieto_desde >= quieto_s and time.time() - inicio >= min_s:
            break
    sujos = [i for i, (_t, c, p) in enumerate(amostras) if c > 0 or p > 0]
    if not amostras:
        t_pronto = None
    elif not sujos:
        t_pronto = amostras[0][0]
    elif sujos[-1] + 1 < len(amostras):
        t_pronto = amostras[sujos[-1] + 1][0]
    else:
        t_pronto = None  # não ficou pronta em max_s
    return {"t_pronto_s": t_pronto, "t_marca_s": t_marca, "pedidos": list(t.pedidos)}


def mediana(v: list[float]) -> float | None:
    v = sorted(x for x in v if x is not None)
    if not v:
        return None
    m = len(v) // 2
    return v[m] if len(v) % 2 else round((v[m - 1] + v[m]) / 2, 2)


def antes_da_spec() -> dict[str, float | None]:
    """O "antes" medido pela spec (hml20/medicao/rede_por_tela.tsv, a aluna, aquecido pela navegação do app): t_pronto por rota."""
    arq = MEDICAO / "rede_por_tela.tsv"
    saida: dict[str, float | None] = {}
    if not arq.exists():
        return saida
    linhas = arq.read_text(encoding="utf-8").splitlines()
    cab = linhas[0].split("\t") if linhas else []
    for l in linhas[1:]:
        c = dict(zip(cab, l.split("\t")))
        if c.get("conta") == A_CONTA:
            try:
                saida[c.get("rota", "")] = float(c.get("t_pronto_s", ""))
            except ValueError:
                saida[c.get("rota", "")] = None
    return saida
