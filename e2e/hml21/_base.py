"""Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — base dos E2E da hml-21 (api.py, rede.py, telas.py): a casca e o app do aluno pela
função NOVA `conta` (o `ler` em lote pelo motor comum e as gravações da casca e do app).

Reaproveita a base da hml-20 (e2e/hml20/_base.py: a navegação e o "pronto", o print reduzido, o SQL só leitura "como a pessoa", o logout
da sessão do Treino que o app abriu) — que usa a da hml-19 (as sessões de TESTE com o teto de logins e a sessão do Treino pela MESMA troca
do app, o /health dos 2 projetos, o Estado da rodada, o SIGTERM que vira SystemExit) e a da hml-17 (as contas de TESTE, a Guarda da
produção, a Tela com a sessão antes do 1º documento e os pedidos anotados por alvo). Junta:
  · conta()/ler()/preflight_conta()   a função conta como a tela chama (apikey + Bearer + x-schema + Origin) e o OPTIONS;
  · regras_conta()                    o catálogo, as ações e as regras do SERVIDOR lidos do próprio TS (node, sem rede): o --seco confere
                                      cada pedido dos E2E contra o leitor do servidor (lerPedidoDeLeitura, moduloDoPedido, lerCorpoDaAcao);
  · SQL_DA_LIB                         o SQL FIXO do que a lib do 53f2583 lia (com a origem arquivo:linha — nunca montado do catálogo: a lição
                                      🟡3 da revisão da 20b), rodado COMO A PESSOA (B20.ler_como): o P compara a função com ele;
  · contar_area()                      a guarda que CONTA por tela: as chamadas DIRETAS da área (as tabelas, as RPCs e o bucket que saíram do
                                      navegador na 21a), o `ler` da conta (e as consultas), as ações da conta, as da OUTRA área da 21a e as
                                      de fora da 21a (de outra W) à parte e as gravações ao abrir;
  · guarda_da_w()                      a Guarda da produção (hml17) + as 6 RPCs de LEITURA que saíram do front na 21a (o front antigo ainda
                                      as chama; só leem) — o rede.py --base prod;
  · a massa (decisão I)                os avisos NÃO LIDOS do sino da w5p-aluna pelos CAMINHOS DO APP (a w5p-nutri, como no painel: a
                                      nutricao › avaliacao_avisar e a RPC aluno_avisar_plano ['dieta'] — a trava de 10 min por título dá 2
                                      por rodada), com a marca "hml21 e2e <rodada>" no título (o UPDATE do sqlrw.py com PERMITIR_ESCRITA=1,
                                      só no schema staging, só a conta de TESTE: o sqlrw.py não aceita insert); os ids no Estado
                                      (hml19/agente/e2e_estado.json, a chave "avisos" que o vazio() da hml-19 conhece) e o DELETE no fim ou
                                      no --limpar (os ids do Estado + os que ainda têm a marca), conferido por SQL só leitura, só contagem;
  · a foto (decisão I)                 a da w5p-aluna guardada antes (o bucket é público: uma cópia no TMPDIR da W, 600, + a URL no Estado) e
                                      devolvida no fim pelo caminho novo (ou tirada, se ela não tinha) — guardar_foto()/devolver_foto().
Antes de CADA execução que toca o staging: a PAUSA (~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>") e o
/health (exigir_saude, dentro dos scripts). O registro de logins é o da W (hml21/agente/logins_etapa2_21a.txt — o REG_LOGINS do
e2e/hml19/_base.py; teto 10 da W, no máximo 6 na etapa 2).
Sem segredo nem dado pessoal na saída: chaves pela Management API, senhas em ~/.physiq-teste-<nome> (600); das respostas só saem status,
códigos, contagens e tempos.
hml-21b (13/10/2026 — a Agenda, os Alunos e o Dashboard pela conta), só por acréscimo: usar_area() (a 21b grava os prints em prints/hml21/b
e a rodada na área "hml21b"); o regras_conta() com o catálogo INTEIRO da função (o CATALOGO_CONTA que o servidor usa) e as listas de ações da
Agenda e dos Alunos; o SQL FIXO das libs da 21b no d357719 (o SQL_DA_LIB, as listas sem ordem total comparadas como conjunto); as áreas
"agenda" e "alunos" do contar_area (a outra área e as de fora da 21b à parte); a Guarda da produção com as 9 RPCs de LEITURA que saíram do
front na 21b; o Estado com a chave "hml21b" (a massa da 21b — e2e/hml21/painel21b.py — nunca abre por cima de outra rodada).
hml-21d (13/10/2026 — o Treino pela função NOVA `treinos`), só por acréscimo: a área "treinos" (prints em prints/hml21/d, a rodada na área
"hml21d" — o usar_area); o que a guarda conta na 21d (AREAS["treinos"]: as tabelas, as RPCs e o bucket do Treino que saíram do navegador
e a aluno_treino do principal); a Guarda da produção com as 3 RPCs de LEITURA que saíram do front na 21d; o Estado com a chave "hml21d"
(a massa da 21d — e2e/hml21/treinos21d.py — nunca abre por cima de outra rodada, nem outra por cima dela).
"""
from __future__ import annotations

import importlib.util
import json
import os
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

_ESPEC = importlib.util.spec_from_file_location("_base_hml20", REPO / "e2e" / "hml20" / "_base.py")
B20 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_hml20"] = B20
_ESPEC.loader.exec_module(B20)  # type: ignore[union-attr]
B19, B17, C, B5 = B20.B19, B20.B17, B20.C, B20.B5

SCRATCH = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml21"
C.SAIDA = SCRATCH / "agente"
MEDICAO = SCRATCH / "medicao"
PRINTS_A = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "a"
PRINTS_B = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "b"
PRINTS_D = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "d"  # hml-21d
PRINTS_C = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "c"  # hml-21c
PRINTS = PRINTS_A
MARCA = "hml21 e2e"
AREA_ESTADO = "hml21a"  # a área no Estado (o --limpar desta W só desfaz a rodada dela)
# hml-21b (decisão I do contrato da 21b): as áreas da Agenda e dos Alunos gravam os prints em prints/hml21/b e a rodada na área "hml21b"
AREAS_DA_21B = ("agenda", "alunos")
CHAVE_21B = "hml21b"  # a chave da massa da 21b no Estado (o vazio() da hml-19 não a conhece: o abrir/fechar_rodada daqui conferem)
# hml-21d (decisão I do contrato da 21d): a área do Treino grava os prints em prints/hml21/d e a rodada na área "hml21d"
AREAS_DA_21D = ("treinos",)
CHAVE_21D = "hml21d"  # a chave da massa da 21d no Estado (como a da 21b: o abrir/fechar_rodada daqui conferem)
# hml-21c (decisão I do contrato da 21c): o Resumo, as Configurações, a Mensagens, a Lixeira e os Modelos gravam os prints em prints/hml21/c
# e a rodada na área "hml21c" (o --limpar desta W só desfaz a rodada dela)
AREAS_DA_21C = ("aluno", "configuracoes", "mensagens", "lixeira", "modelos")
CHAVE_21C = "hml21c"
# hml-21e (decisão C do contrato da 21e): o D3 do PowerSync (e2e/hml21/d3_powersync.py) guarda a massa das 14 tabelas da fila na chave
# "hml21e" do Estado — nenhuma rodada da 21a–21d abre por cima dela (o abrir_rodada daqui confere), nem ela por cima de outra
CHAVE_21E = "hml21e"


def usar_area(area: str) -> None:
    """A pasta dos prints e a área no Estado de cada sub-W: a 21a (casca/app) em prints/hml21/a e "hml21a"; a 21b (agenda/alunos) em
    prints/hml21/b e "hml21b" — o --limpar de cada uma só desfaz a rodada dela; sem chamar, a 21a (o --area casca|app não muda)."""
    global PRINTS, AREA_ESTADO
    if area in AREAS_DA_21D:  # hml-21d: o Treino em prints/hml21/d e "hml21d"
        PRINTS, AREA_ESTADO = PRINTS_D, CHAVE_21D
        return
    if area in AREAS_DA_21C:  # hml-21c: o Resumo, as Configurações, a Mensagens, a Lixeira e os Modelos em prints/hml21/c e "hml21c"
        PRINTS, AREA_ESTADO = PRINTS_C, CHAVE_21C
        return
    da_21b = area in AREAS_DA_21B
    PRINTS = PRINTS_B if da_21b else PRINTS_A
    AREA_ESTADO = "hml21b" if da_21b else "hml21a"
BASES, SCHEMA_DA_BASE = B19.BASES, B19.SCHEMA_DA_BASE
ORIGEM_FORA, ORIGEM_PADRAO = B19.ORIGEM_FORA, B19.ORIGEM_PADRAO
PRINCIPAL_REF, API_P, API_T = B19.PRINCIPAL_REF, B19.API_P, B19.API_T
API_P_HOST = B19.API_P_HOST
FUNCAO_CONTA = f"{API_P}/functions/v1/conta"
SQLRW = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "sqlrw.py"
COM_PAT = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "com_pat.py"

# ───────────────────────── as contas (staging, só de TESTE) ─────────────────────────
ALUNA = "w5p-aluna"      # P: o Início, o sino, o Perfil, a Conta, a Agenda (a massa: os avisos; a foto guardada e devolvida)
SOZINHO = "w7b-sozinho"  # P do Meu plano (o aluno sem profissional) — SÓ se existir no staging (SQL só leitura, só contagem); senão, Vitest
OUTRA = "w13-dono"       # N1: outra conta — e o P do criar_minha_conta (já é dona de conta: o caminho idempotente, nada criado)
PROD_CONTA = "aluno-calc"  # produção, SÓ LEITURA (o smoke do W7)
REG_LOGINS = B19.REG_LOGINS

corte_vira_saida = B19.corte_vira_saida
exigir_saude = B19.exigir_saude
saude = B19.saude
Sessoes = B19.Sessoes
Estado = B19.Estado
usar_base = B19.usar_base
schema = B19.schema
nova_rodada = B19.nova_rodada
cors = B19.cors
Guarda = B17.Guarda
Tela = B17.Tela
navegar, esperar_pronto, Pendentes, mediana = B20.navegar, B20.esperar_pronto, B20.Pendentes, B20.mediana
MAX_S, MIN_S, QUIETO_S = B20.MAX_S, B20.MIN_S, B20.QUIETO_S  # a regra do "pronto" da hml-20 (medir_leituras20.py)


def sair_do_treino(o, pg, rotulo: str, t=None, espera_s: float = 40.0, conta: str | None = None) -> None:
    """O logout (scope=local) da sessão do Treino que a troca do app abriu (decisão 23 da hml-20) — ESPERANDO a troca terminar quando a
    tela pediu a trocar-token (até 40 s, o teto do app: na etapa 2, o contexto do w7b-sozinho fechou antes de a sessão chegar ao
    localStorage e 2 sessões do Treino dele ficaram abertas). `t` = a Tela (os pedidos anotados). `conta` na lista TREINO_SAIR_OUTRAS
    (variável de ambiente, contas de teste separadas por vírgula) → antes do scope=local, o scope=others com o MESMO token fecha as
    outras sessões do Treino dessa conta (hml-21a F7: as 2 do w7b-sozinho, sem login a mais). Sem a variável, nada muda."""
    if t is not None and any(p.get("tipo") == "fn" and p.get("nome") == "trocar-token" for p in getattr(t, "pedidos", [])):
        fim = time.time() + espera_s
        while time.time() < fim and not B20.token_do_treino_no_navegador(pg):
            try:
                pg.wait_for_timeout(500)
            except Exception:  # noqa: BLE001 — a página fechou
                break
    outras = {c.strip() for c in os.environ.get("TREINO_SAIR_OUTRAS", "").split(",") if c.strip()}
    if conta and conta in outras:
        tok = B20.token_do_treino_no_navegador(pg)
        if tok:
            try:
                st: object = C.http("POST", f"{C.TREINO_URL}/auth/v1/logout?scope=others", {},
                                    {"apikey": C.anon(C.TREINO_REF), "Authorization": f"Bearer {tok}"})[0]
            except Exception as e:  # noqa: BLE001
                st = type(e).__name__
            o.ok(st in (200, 204), f"{rotulo}: logout (scope=others) das outras sessões do Treino de {conta} ({st})", parar=False)
        else:
            o.linha(f"   ({rotulo}: sem sessão do Treino no navegador — o scope=others de {conta} não rodou)")
    B20.sair_do_treino(o, pg, rotulo)


commit_medido = B20.commit_medido
anotar_planilha_hml20 = B20.anotar_planilha
ler_principal = B20.ler_principal

CONTA_LEITURAS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "conta-leituras.ts"
CONTA_REGRAS_TS = REPO / "supabase-principal" / "functions" / "_shared" / "conta-regras.ts"
MOTOR_TS = REPO / "supabase-principal" / "functions" / "_shared" / "leitura-lote.ts"


# ───────────────────────── a porta do aceite e o aviso de mudança fora da tela (o LegalDesligado da hml-19 + a conta) ─────────────────────────
def tirar_legal_do_ler(pedido: object, resposta: object) -> object:
    """A resposta do `ler` da conta com o `legal` desligado e o aviso de mudança visto no item da q "situacao" (a minha_situacao saiu do
    navegador na 21a: o recarregar da sessão — depois de salvar o nome/a foto, a volta da internet, a abertura com o pos-login feito — vem
    pelo `ler`, e o LegalDesligado da hml-19 só pegava o pos-login e a RPC). Só no que o navegador recebe; nada grava."""
    itens_pedidos = pedido.get("itens") if isinstance(pedido, dict) and pedido.get("acao") == "ler" else None
    itens = resposta.get("itens") if isinstance(resposta, dict) else None
    if not isinstance(itens_pedidos, list) or not isinstance(itens, list):
        return resposta
    for i, it in enumerate(itens_pedidos):
        if isinstance(it, dict) and it.get("q") == "situacao" and i < len(itens) and isinstance(itens[i], dict) and isinstance(itens[i].get("valor"), dict):
            B19._tirar_legal(itens[i]["valor"])
    return resposta


class LegalDesligado(B19.LegalDesligado):
    """O LegalDesligado da hml-19 (o pos-login e a RPC minha_situacao — o código antigo) + o `ler` da conta com a q "situacao" (o novo):
    a porta do aceite (hml-12) e o aviso "o Physiq mudou" não cobrem a tela em nenhum dos dois. Instale depois da Guarda."""

    def instalar(self, ctx) -> None:
        ctx.route(re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/"), self._legal21)

    @staticmethod
    def _legal21(route, req) -> None:
        tipo, nome = B17.alvo(req.url)
        if req.method == "POST" and tipo == "fn" and nome == "conta":
            try:
                pedido = json.loads(req.post_data or "{}")
            except Exception:  # noqa: BLE001
                pedido = {}
            itens = pedido.get("itens") if isinstance(pedido, dict) and pedido.get("acao") == "ler" else None
            if isinstance(itens, list) and any(isinstance(x, dict) and x.get("q") == "situacao" for x in itens):
                try:
                    r = route.fetch()
                    try:
                        corpo = json.dumps(tirar_legal_do_ler(pedido, r.json()))
                    except Exception:  # noqa: BLE001
                        route.fulfill(response=r)
                        return
                    route.fulfill(response=r, body=corpo, headers={**r.headers, "content-type": "application/json"})
                except Exception:  # noqa: BLE001 — a página fechou no meio
                    pass
                return
        B19.LegalDesligado._legal(route, req)


# a produção (decisão N + o 🟡1 da revisão): o aparelho abre SEM a marca local de "aviso visto" (physiq_aviso_visto:<uid>:<versão>) — com
# ela e o servidor dizendo "não visto", a sessão grava o aviso_mudanca_marcar sozinha (a Guarda barraria); o contexto novo já nasce sem,
# e este script garante (roda antes do app em cada documento)
JS_SEM_AVISO_VISTO = ("(() => { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); "
                      "if (k && k.startsWith('physiq_aviso_visto:')) localStorage.removeItem(k); } } catch (e) {} })()")


# ───────────────────────── a função como a tela chama ─────────────────────────
def conta(token: str | None, acao: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
          sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na conta como a tela chama (apikey + Bearer + x-schema + Origin) → (status, corpo JSON, cabeçalhos, ms). acao None = sem a
    chave (o corpo vai como veio); a ação vai por ÚLTIMO (como o acaoConta: nenhum campo do corpo troca a ação)."""
    c = dict(corpo or {})
    if acao is not None:
        c.pop("acao", None)
        c["acao"] = acao
    cab = {"apikey": B5.anon(PRINCIPAL_REF), "x-schema": schema_ or schema(), "Origin": origem or BASES["staging"]}
    if not sem_auth:
        cab["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    st, r, h = B5.http("POST", FUNCAO_CONTA, c, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), h or {}, round((time.time() - t0) * 1000)


def ler(token: str | None, itens: list[dict] | None, *, corpo: dict | None = None, **kw) -> tuple[int, dict, dict, float]:
    """O `ler` da conta (o lote: { acao: "ler", itens }); itens None = sem a chave; `corpo` = chaves a mais (o servidor ignora)."""
    c = dict(corpo or {})
    if itens is not None:
        c["itens"] = itens
    return conta(token, "ler", c, **kw)


def item(q: str, **params) -> dict:
    """Um item do lote como a tela manda ({ ...params, q } — a q por último)."""
    return {**params, "q": q}


def preflight_conta(origem: str) -> tuple[int, dict]:
    """O OPTIONS da conta (o CORS da porta-pessoa: fora da lista → o padrão https://physiqcalc.com.br)."""
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = B5.http("OPTIONS", FUNCAO_CONTA, None, cab, timeout=60)
    return st, h or {}


def itens_de(r: dict) -> list[dict]:
    v = r.get("itens") if isinstance(r, dict) else None
    return v if isinstance(v, list) else []


# ───────────────────────── as regras do SERVIDOR, lidas do TS (sem rede) ─────────────────────────
_JS_CONTA = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const motor = await import(pathToFileURL(process.argv[1]).href);
const cat = await import(pathToFileURL(process.argv[2]).href);
const reg = await import(pathToFileURL(process.argv[3]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
// hml-21b: o catálogo INTEIRO da função (a 21a + a 21b — o CATALOGO_CONTA que o servidor usa), não só o da 21a
const consultas = Object.fromEntries(cat.TODAS_AS_CONSULTAS.map((q) => {
  const c = cat.consultaDaConta(q);
  const f = c.fonte;
  return [q, { params: c.params, rpc: f.rpc ?? null, args: f.args ?? null, tabela: f.tabela ?? null, colunas: f.colunas ?? null, teto: f.teto ?? null,
    filtros: f.filtros ?? null, nulos: f.nulos ?? null, ordem: f.ordem ?? null, dono: c.dono ?? null, vivas: f.vivas ?? null,
    recorte: f.recorte ?? null, fixos: f.fixos ?? null, colunasSe: f.colunasSe ?? null, erros: f.erros ?? null }];
}));
console.log(JSON.stringify({
  consultas, consultas_21a: [...cat.CONSULTAS_DA_CONTA], consultas_21b: [...cat.CONSULTAS_DA_21B],
  lote_max: motor.LOTE_MAX, avisos_max: cat.AVISOS_MAX, tipo_membro: cat.TIPO_MEMBRO_REMOVIDO,
  casca: [...reg.ACOES_DA_CASCA], app: [...reg.ACOES_DO_APP], agenda: [...reg.ACOES_DA_AGENDA], alunos: [...reg.ACOES_DOS_ALUNOS],
  // hml-21c (por acréscimo): as consultas da 21c e as ações dos 4 módulos novos (o Resumo do aluno, as Configurações, a Mensagens, a Lixeira)
  consultas_21c: [...(cat.CONSULTAS_DA_21C ?? [])], aluno: [...(reg.ACOES_DO_ALUNO ?? [])], configuracoes: [...(reg.ACOES_DAS_CONFIGURACOES ?? [])],
  mensagens: [...(reg.ACOES_DAS_MENSAGENS ?? [])], lixeira: [...(reg.ACOES_DA_LIXEIRA ?? [])],
  corpos: reg.CORPOS_DAS_ACOES, status: reg.STATUS_DO_ERRO_CONTA,
  colunas_agenda: cat.COLUNAS_DA_AGENDA, colunas_alunos: cat.COLUNAS_DOS_ALUNOS, filtros_alunos: [...cat.FILTROS_DOS_ALUNOS],
  foto: { max: reg.FOTO_MAX_BYTES, tipos: reg.TIPOS_DE_FOTO, url_propria: reg.URL_API_PROPRIA,
          buckets: { public: reg.bucketDasFotos("public"), staging: reg.bucketDasFotos("staging") } },
  pedidos: (e.pedidos ?? []).map((corpo) => {
    const p = reg.moduloDoPedido(corpo);
    if (!p) return { modulo: null };
    if (p.modulo === "leitura") {
      const r = motor.lerPedidoDeLeitura(corpo, cat.CATALOGO_CONTA.consultas);
      return r.ok === false ? { modulo: "leitura", ok: false, erro: r.erro } : { modulo: "leitura", ok: true, itens: r.itens };
    }
    const r = reg.lerCorpoDaAcao(p.acao, corpo);
    return { modulo: p.modulo, acao: p.acao, ...r };
  }),
  caminhos: (e.caminhos ?? []).map(([c, u]) => reg.caminhoDaPropriaPasta(c, u)),
  anteriores: (e.anteriores ?? []).map(([u, b, id]) => reg.caminhoDaFotoAnterior(u, b, id)),
  urls: (e.urls ?? []).map(([b, c]) => reg.urlPublicaDaFoto(b, c)),
}));
"""


def regras_conta(pedidos: list[dict] | None = None, caminhos: list[list[str]] | None = None, anteriores: list[list[str]] | None = None,
                 urls: list[list[str]] | None = None) -> dict:
    """O catálogo, as ações e as regras da conta (do próprio TS); para cada corpo em `pedidos`, o que o servidor faz com ele (o módulo, os
    itens lidos ou a recusa; numa ação, os valores aceitos ou o campo recusado); `caminhos` = [caminho, user] → o caminhoDaPropriaPasta;
    `anteriores` = [url, bucket, user] → o caminhoDaFotoAnterior; `urls` = [bucket, caminho] → o urlPublicaDaFoto."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_CONTA,
                        str(MOTOR_TS), str(CONTA_LEITURAS_TS), str(CONTA_REGRAS_TS)],
                       input=json.dumps({"pedidos": pedidos or [], "caminhos": caminhos or [], "anteriores": anteriores or [], "urls": urls or []}),
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras da conta): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# ───────────────────────── o SQL FIXO da lib do 53f2583 (o P) — rodado COMO A PESSOA ─────────────────────────
# (a origem arquivo:linha no 53f2583, o SQL com {s} e os params). As listas voltam como 1 jsonb (a ordem da lib); as RPCs, o valor.
_ag = "select coalesce(jsonb_agg(to_jsonb(x) - 'ordem_da_lib' order by x.ordem_da_lib), '[]'::jsonb) as v from ({}) x"
SQL_DA_LIB: dict[str, tuple[str, str]] = {
    "avisos": ("src/ui/premium/useAvisos.ts:63 buscarAvisos (o RLS: os da pessoa)",
               "select id, tipo, titulo, link, lido_em, criado_em, row_number() over (order by criado_em desc) as ordem_da_lib from {s}.avisos "
               "order by criado_em desc limit 30"),
    "aviso_membro_removido": ("src/ui/avisos/AvisoMembroRemovido.tsx:36-41",
                              "select id, titulo, criado_em, 1 as ordem_da_lib from {s}.avisos where tipo = 'membro_removido' and lido_em is null "
                              "order by criado_em desc limit 1"),
    "situacao": ("src/nucleo/sessao.tsx:169 buscarSituacao", "select to_jsonb({s}.minha_situacao()) as v"),
    "meu_perfil_aluno": ("src/app-aluno/perfil/pecas/api.ts:75 meuPerfilAluno", "select to_jsonb({s}.meu_perfil_aluno()) as v"),
    "minha_agenda": ("src/app-aluno/perfil/pecas/api.ts:89 minhaAgenda", "select to_jsonb({s}.minha_agenda({desde}::timestamptz)) as v"),
    "minha_agenda_lista": ("src/app-aluno/perfil/pecas/api.ts:99 minhaAgendaLista (a 1ª página de 20 das próximas)",
                           "select to_jsonb({s}.minha_agenda_lista('proximas', 0, 20)) as v"),
    "meu_plano_app": ("src/app-aluno/sozinho/api.ts:57 buscarMeuPlano", "select to_jsonb({s}.meu_plano_app()) as v"),
    "pratos_prontos_do_app": ("src/app-aluno/sozinho/api.ts:76 buscarPratos (sem objetivo)", "select to_jsonb({s}.pratos_prontos_do_app()) as v"),
    "perfil_foto": ("src/app-aluno/perfil/Conta.tsx:23 dadosDoPerfil (a lib lia o dados_profissionais; a função, só a chave da foto)",
                    "select dados_profissionais->>'foto_url' as foto_url, 1 as ordem_da_lib from {s}.profiles where id = {uid}"),
}
# hml-21b: o SQL FIXO das libs da Agenda e dos Alunos no d357719 (o "antes" da 21b: a lib lia direto) — a MESMA forma da 21a (as listas
# com a ordem da lib; as RPCs, o valor). O "meu ou da conta" da lib (o .or() de hoje) com o uid de quem a pessoa é e a conta ativa dela.
SQL_DA_LIB.update({
    "agenda_calendarios": ("src/painel/agenda/dados.ts:95 listarCalendarios (d357719: select * vivos, o minhaOuDaConta, por created_at)",
                           "select c.*, row_number() over (order by c.created_at) as ordem_da_lib from {s}.calendarios c where c.deleted_at is null "
                           "and (c.nutricionista_id = {uid} or c.conta_id = {conta}) order by c.created_at"),
    "agenda_tags": ("src/painel/agenda/dados.ts:146 listarTags (d357719: select * vivas dos profissionais, por ordem e created_at)",
                    "select t.*, row_number() over (order by t.ordem, t.created_at) as ordem_da_lib from {s}.agenda_tags t "
                    "where t.profissional_id = any({donos}) and t.deleted_at is null order by t.ordem, t.created_at"),
    "agenda_agendamentos": ("src/painel/agenda/dados.ts:215 listarAgendamentos (d357719: a janela, os 1000 mais recentes)",
                            "select a.*, row_number() over (order by a.inicio desc, a.id desc) as ordem_da_lib from {s}.agendamentos a "
                            "where a.deleted_at is null and (a.nutricionista_id = {uid} or a.conta_id = {conta}) and a.inicio < {ate}::timestamptz "
                            "and a.fim > {de}::timestamptz order by a.inicio desc, a.id desc limit 1000"),
    "agenda_bloqueios": ("src/painel/agenda/dados.ts:244 listarBloqueios (d357719: a janela, por início)",
                         "select b.*, row_number() over (order by b.inicio) as ordem_da_lib from {s}.bloqueios_agenda b "
                         "where (b.nutricionista_id = {uid} or b.conta_id = {conta}) and b.inicio < {ate}::timestamptz and b.fim > {de}::timestamptz "
                         "order by b.inicio"),
    "agenda_bloqueios_futuros": ("src/painel/agenda/dados.ts:252 listarBloqueiosFuturos (d357719: fim ≥ agora, os 50 primeiros)",
                                 "select b.*, row_number() over (order by b.inicio) as ordem_da_lib from {s}.bloqueios_agenda b "
                                 "where (b.nutricionista_id = {uid} or b.conta_id = {conta}) and b.fim >= {agora}::timestamptz order by b.inicio limit 50"),
    "agenda_travas": ("src/painel/agenda/dados.ts:282 listarTravas (d357719: por hora de início)",
                      "select t.*, row_number() over (order by t.hora_inicio) as ordem_da_lib from {s}.agenda_travas t "
                      "where (t.profissional_id = {uid} or t.conta_id = {conta}) order by t.hora_inicio"),
    "agenda_regras": ("src/painel/agenda/dados.ts:301 lerRegras (d357719: a linha do profissional, maybeSingle)",
                      "select r.*, 1 as ordem_da_lib from {s}.agenda_config r where r.profissional_id = {profissional}"),
    "agenda_horarios": ("src/painel/agenda/dados.ts:325 horariosDoDia (d357719)",
                        "select to_jsonb({s}.agenda_horarios({calendario}::uuid, {dia}::date, {dia}::date, {duracao}::integer, {ignorar}::uuid)) as v"),
    "agenda_alunos": ("src/painel/agenda/dados.ts:334 listarAlunosDaAgenda (d357719: os ativos da conta + os meus, por nome, até 1000)",
                      "select p.id, p.nome, p.apelido, p.foto_url, p.personal_id, p.nutricionista_id, p.user_id, p.email, "
                      "row_number() over (order by p.nome) as ordem_da_lib from {s}.pacientes p where p.deleted_at is null and p.ativo "
                      "and (p.conta_id = {conta} or p.nutricionista_id = {uid}) order by p.nome limit 1000"),
    "agenda_aluno": ("src/painel/agenda/dados.ts:342 buscarAluno (d357719: pelo id, vivo)",
                     "select p.id, p.nome, p.apelido, p.foto_url, p.personal_id, p.nutricionista_id, p.user_id, p.email, 1 as ordem_da_lib "
                     "from {s}.pacientes p where p.id = {id} and p.deleted_at is null"),
    "aluno_compromissos": ("src/painel/agenda/dados.ts:386 compromissosDoAluno (d357719)", "select to_jsonb({s}.aluno_compromissos({aluno}::uuid)) as v"),
    "minhas_regras_agenda": ("src/app-aluno/perfil/agenda/api.ts:64 minhasRegrasAgenda (d357719)", "select to_jsonb({s}.minhas_regras_agenda()) as v"),
    "aluno_agenda_horarios": ("src/app-aluno/perfil/agenda/api.ts:85-89 horariosParaReagendar/horariosParaMarcar (d357719)",
                              "select to_jsonb({s}.aluno_agenda_horarios({agendamento}::uuid, {profissional}::uuid, {de_data}::date, {ate_data}::date)) as v"),
    "alunos_da_conta": ("src/painel/alunos/api.ts:58 listarAlunos (d357719; o seletor, a Busca e o número do menu: a MESMA RPC)",
                        "select to_jsonb({s}.alunos_da_conta({conta}::uuid, {filtros}::jsonb, {offset}::integer, {limite}::integer)) as v"),
    "aluno_do_seletor": ("src/painel/alunos/api.ts:107-112 alunoDoSeletorPorId (d357719; sem o CPF)",
                         "select p.id, p.nome, p.apelido, p.email, p.telefone, p.foto_url, p.ativo, p.acesso_bloqueado_em, p.user_id, p.personal_id, "
                         "p.nutricionista_id, p.config->>'conta_excluida_em' as conta_excluida_em, 1 as ordem_da_lib from {s}.pacientes p "
                         "where p.id = {id} and p.conta_id = {conta} and p.deleted_at is null"),
    "aluno_convites": ("src/painel/alunos/api.ts:129 listarConvites (d357719)", "select to_jsonb({s}.aluno_convites({conta}::uuid)) as v"),
    "alunos_pendentes": ("src/painel/alunos/api.ts:146 listarPendentes (d357719)", "select to_jsonb({s}.alunos_pendentes({conta}::uuid)) as v"),
    "alunos_novos_por_mes": ("src/painel/alunos/novosPorMes.ts:41 buscarNovosPorMes (d357719)",
                             "select to_jsonb({s}.alunos_novos_por_mes({conta}::uuid, {meses}::integer)) as v"),
    "equipe_da_conta": ("src/painel/configuracoes/equipe/api.ts:26 buscarEquipe (d357719)", "select to_jsonb({s}.equipe_da_conta({conta}::uuid)) as v"),
})
LISTAS_DA_LIB = ("avisos", "aviso_membro_removido", "perfil_foto", "agenda_calendarios", "agenda_tags", "agenda_agendamentos", "agenda_bloqueios",
                 "agenda_bloqueios_futuros", "agenda_travas", "agenda_regras", "agenda_alunos", "agenda_aluno", "aluno_do_seletor")
# as listas da lib SEM ordem total (empate na ordem: o banco pode devolver os empatados em outra ordem a cada vez) — o P compara como conjunto
SEM_ORDEM_TOTAL = frozenset({"agenda_tags", "agenda_bloqueios", "agenda_bloqueios_futuros", "agenda_travas", "agenda_alunos"})
# hml-21c: o SQL FIXO das libs da 21c no c6e795b (o "antes" da 21c: a lib lia direto) — a MESMA forma (as listas com a ordem da lib; as RPCs, o
# valor). Os ★ dos Modelos (a nutricao e a financeiro): a lib não ordenava (o .limit(500) sem .order) → SEM ordem total (conjunto); a receita
# com os ingredientes, o alimento (as 10 colunas) e as medidas — os embutidos de hoje viram o subselect com o RLS de quem lê (como o PostgREST)
_FAV = "select {cols}, 1 as ordem_da_lib from {{s}}.{tab} where {col} = true and nutricionista_id = {{uid}} and deleted_at is null limit 500"
_ORIGEM_FAV = "src/ferramentas/modelos/dados.ts:30 favoritosDe (c6e795b: .eq(★, true).eq(nutricionista_id, uid).is(deleted_at, null).limit(500), sem ordem)"
FAVORITOS_DA_21C = {
    "modelos_favoritos_anamnese": ("modelos_anamnese", "id, updated_at, titulo, perguntas", "favorito"),
    "modelos_favoritos_orientacao": ("modelos_orientacao", "id, updated_at, titulo, conteudo", "favorito"),
    "modelos_favoritos_documento": ("modelos_documento", "id, updated_at, titulo, tipo", "favorito"),
    "modelos_favoritos_meta": ("modelos_meta", "id, updated_at, titulo, dias_semana", "favorito"),
    "modelos_favoritos_manipulado": ("modelos_formula", "id, updated_at, titulo, ativos", "favorito"),
    "modelos_favoritos_exame": ("exames_catalogo", "id, updated_at, nome, unidade, ref_min, ref_max, referencia_texto", "favorito"),
    "modelos_favoritos_questionario": ("questionarios", "id, updated_at, titulo, perguntas", "favorito"),
    "modelos_favoritos_produto": ("produtos", "id, updated_at, nome, marca, categoria", "favorito"),
    "fin_modelos_recibo_favoritos": ("modelos_recibo", "id, updated_at, titulo, conteudo", "favorito"),
}
SQL_DA_LIB.update({
    "dado_livre": ("src/nucleo/dadoLivre.ts:22 dadoLivre (c6e795b)", "select to_jsonb({s}.paciente_dado_livre({email}::text, {cpf}::text, {paciente}::uuid)) as v"),
    "aluno_responsavel": ("src/publico/legal/responsavel/api.ts:30 buscarResponsavel (c6e795b)", "select to_jsonb({s}.aluno_responsavel({aluno}::uuid)) as v"),
    "perfil_profissional": ("src/painel/configuracoes/Perfil.tsx:52 buscarPerfil (c6e795b: o profiles de quem está logado, maybeSingle)",
                            "select nome, email, tipo_perfil, area_outra, dados_profissionais, 1 as ordem_da_lib from {s}.profiles where id = {uid}"),
    "perfil_mensagens": ("src/painel/mensagens/api.ts:137 lerPerfilWhatsapp (c6e795b: o profiles de quem está logado, maybeSingle)",
                         "select nome, dados_profissionais, config, 1 as ordem_da_lib from {s}.profiles where id = {uid}"),
    "whatsapp_resumo": ("src/painel/mensagens/api.ts:91 buscarResumo (c6e795b)", "select to_jsonb({s}.whatsapp_resumo({conta}::uuid)) as v"),
    "whatsapp_fila": ("src/painel/mensagens/api.ts:105-108 buscarFila (c6e795b)",
                      "select to_jsonb({s}.whatsapp_fila({conta}::uuid, {escopo}::text, {filtro}::text, {limite}::integer, {antes}::timestamptz, "
                      "{antes_id}::uuid)) as v"),
    "mensagens_desligadas": ("src/painel/aluno/dados/api.ts:78 buscarMensagensDesligadas (c6e795b)", "select to_jsonb({s}.mensagens_desligadas()) as v"),
    "lixeira": ("src/ferramentas/lixeira/dados.ts:34-40 listarLixeira (c6e795b)",
                "select to_jsonb({s}.lixeira_da_conta({conta}::uuid, {tipo}::text, {busca}::text, {offset}::integer, {limite}::integer)) as v"),
    # a AÇÃO acesso_ler (decisão 13: a aluno_acesso só lê) — o P compara o resultado com a RPC de hoje rodada como a pessoa
    "aluno_acesso": ("src/painel/aluno/resumo/acesso/api.ts aluno_acesso (c6e795b: a RPC direta)", "select to_jsonb({s}.aluno_acesso({aluno}::uuid)) as v"),
    **{q: (_ORIGEM_FAV, _FAV.format(cols=c, tab=t, col=k)) for q, (t, c, k) in FAVORITOS_DA_21C.items()},
    "modelos_favoritos_receita": (
        _ORIGEM_FAV.replace("favoritosDe", "favoritosDe da receita (:104 — favorita; os ingredientes:ingredientes_receita(…) com o alimento(10) e as "
                                           "medidas_caseiras(*))"),
        "select r.id, r.nome, r.updated_at, r.porcoes, r.rendimento_g, (select coalesce(jsonb_agg(jsonb_build_object('quantidade_g', i.quantidade_g, "
        "'medida_caseira_id', i.medida_caseira_id, 'quantidade_medida', i.quantidade_medida, 'alimento', (select to_jsonb(a) || jsonb_build_object("
        "'medidas_caseiras', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from {s}.medidas_caseiras m where m.alimento_id = a.id)) from (select "
        "al.id, al.nome, al.fonte, al.grupo, al.energia_kcal, al.proteina_g, al.carboidrato_g, al.lipidio_g, al.fibra_g, al.sodio_mg from {s}.alimentos al "
        "where al.id = i.alimento_id) a))), '[]'::jsonb) from {s}.ingredientes_receita i where i.receita_id = r.id) as ingredientes, 1 as ordem_da_lib "
        "from {s}.receitas r where r.favorita = true and r.nutricionista_id = {uid} and r.deleted_at is null limit 500"),
})
CONSULTAS_FAVORITOS_21C = (*[q for q in FAVORITOS_DA_21C if q.startswith("modelos_")], "modelos_favoritos_receita")  # as 9 da nutricao
LISTAS_DA_LIB = LISTAS_DA_LIB + ("perfil_profissional", "perfil_mensagens", *FAVORITOS_DA_21C, "modelos_favoritos_receita")
SEM_ORDEM_TOTAL = SEM_ORDEM_TOTAL | set(FAVORITOS_DA_21C) | {"modelos_favoritos_receita"}
# as chaves que a RPC devolve com o relógio do banco (comparar fora delas: o 20b PADRÃO do 'agora'; a minha_situacao devolve o gerado_em)
# hml-21c (F5): + o falhas_desde da whatsapp_resumo (o greatest(now() − 7 dias, a marca) — sem a marca, anda com o relógio) e o agente_ping
# (o max(ultimo_ping) das instâncias: o agente do celular bate a cada ~1 min) — só a whatsapp_resumo tem as 2
CHAVES_DO_RELOGIO = {"agora", "agora_em", "servidor_agora", "hoje", "gerado_em", "falhas_desde", "agente_ping"}
# os valores que o SQL da lib aceita (cada um conferido: nada do corpo de ninguém entra no SQL sem passar por aqui)
_V_UUID = frozenset({"uid", "conta", "id", "profissional", "aluno", "calendario", "agendamento", "ignorar", "paciente", "antes_id"})  # 21c: + 2
_V_INSTANTE = frozenset({"desde", "de", "ate", "agora"})
# hml-21c: o cursor da fila (pode ser null) e os textos dos params da 21c (o e-mail, o CPF, a busca da Lixeira, a aba, o escopo e o filtro da
# fila) — cada um conferido por uma forma FECHADA (nada do corpo de ninguém entra no SQL sem passar por aqui)
_V_INSTANTE_NULO = frozenset({"antes"})
_V_TEXTO = {"email": re.compile(r"[a-z0-9._+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}"), "cpf": re.compile(r"\d{11}"),
            "busca": re.compile(r"[\w .-]{1,80}"), "tipo": re.compile(r"[a-z_]{1,30}"), "escopo": re.compile(r"meus|conta"),
            "filtro": re.compile(r"todas|fila|enviadas|falhas")}
_V_DATA = frozenset({"dia", "de_data", "ate_data"})
_V_INTEIRO = frozenset({"duracao", "meses", "offset", "limite"})
_INSTANTE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z")


def _valor_sql(k: str, x: object) -> str:
    if k in _V_INSTANTE_NULO:  # hml-21c
        if x is None:
            return "null"
        if not (isinstance(x, str) and _INSTANTE.fullmatch(x)):
            raise SystemExit("instante fora do formato no SQL da lib")
        return C.txt(x)
    if k in _V_TEXTO:  # hml-21c
        if x is None:
            return "null"
        if not (isinstance(x, str) and _V_TEXTO[k].fullmatch(x)):
            raise SystemExit(f"texto fora do formato no SQL da lib ({k})")
        return C.txt(x)
    if k in _V_UUID:
        return "null" if x is None else C.txt(C.uuid_ok(str(x)))
    if k in _V_INSTANTE:
        if not (isinstance(x, str) and _INSTANTE.fullmatch(x)):
            raise SystemExit("instante fora do formato no SQL da lib")
        return C.txt(x)
    if k in _V_DATA:
        if x is None:
            return "null"
        if not (isinstance(x, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", x)):
            raise SystemExit("data fora do formato no SQL da lib")
        return C.txt(x)
    if k in _V_INTEIRO:
        if x is None:
            return "null"
        if isinstance(x, bool) or not isinstance(x, int):
            raise SystemExit("inteiro fora do formato no SQL da lib")
        return str(int(x))
    if k == "donos":
        ids = [C.uuid_ok(str(i)) for i in (x or [])]
        return f"array[{', '.join(C.txt(i) for i in ids)}]::uuid[]" if ids else "array[]::uuid[]"
    if k == "filtros":
        if not isinstance(x, dict) or not all(isinstance(a, str) and isinstance(b, str) and re.fullmatch(r"[a-z_]{1,20}", a) for a, b in x.items()):
            raise SystemExit("filtros fora do formato no SQL da lib")
        return C.txt(json.dumps(x, ensure_ascii=False))
    raise SystemExit(f"valor desconhecido no SQL da lib: {k}")


def sql_da_lib(q: str, s: str, **valores) -> str:
    """O SQL FIXO da lib (o SQL_DA_LIB) com o schema e os valores conferidos (uuid, instante, data, inteiro, a lista de donos e os filtros
    dos alunos; nada do corpo de ninguém)."""
    _origem, sql = SQL_DA_LIB[q]
    v: dict[str, str] = {"s": s}
    for k, x in valores.items():
        v[k] = _valor_sql(k, x)
    texto = sql.format(**v)
    return _ag.format(texto) if q in LISTAS_DA_LIB else texto


def como_conjunto(v: object) -> object:
    """Uma lista sem ordem total vira o conjunto (a lista ordenada pela forma canônica) — o P das listas com empate na ordem da lib."""
    return sorted((canonico(x) for x in v), key=str) if isinstance(v, list) else v


def sem_relogio(v: object) -> object:
    """O valor sem as chaves do relógio do banco (em qualquer nível)."""
    if isinstance(v, dict):
        return {k: sem_relogio(x) for k, x in v.items() if k not in CHAVES_DO_RELOGIO}
    if isinstance(v, list):
        return [sem_relogio(x) for x in v]
    return v


def canonico(v: object) -> str:
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


# ───────────────────────── a área que a guarda CONTA (o que saiu do navegador na 21a) ─────────────────────────
AREAS: dict[str, dict] = {
    # a casca: o sino (lê e marca), o aviso de membro removido, a situação, o aviso de mudança, a senha, o push, o aceite e o onboarding
    "casca": {"tabelas": {"avisos"}, "rpcs": {"minha_situacao", "marcar_aviso_mudanca", "minha_senha_definida", "push_registrar", "push_esquecer",
                                              "aceitar_no_acesso", "criar_minha_conta"}, "buckets": set()},
    # o app do aluno: o perfil/a agenda/o Meu plano/os pratos (as RPCs), o profiles (o nome e a foto) e o bucket da foto
    "app": {"tabelas": {"profiles"}, "rpcs": {"meu_perfil_aluno", "minha_agenda", "minha_agenda_lista", "meu_plano_app", "pratos_prontos_do_app",
                                              "mudar_objetivo_app", "entrar_sem_profissional"},
            "buckets": {"fotos-perfil", "fotos-perfil-staging"}},
}
AREAS["tudo"] = {k: AREAS["casca"][k] | AREAS["app"][k] for k in ("tabelas", "rpcs", "buckets")}
# hml-21b — o que sai do navegador na 21b (as leituras e as gravações da Agenda e dos Alunos; as 2 RPCs novas nunca são chamadas pelo front):
AREAS["agenda"] = {
    # a Agenda do painel (as 6 tabelas dela + os alunos do seletor da Agenda e o do ?aluno=) e a do aluno (as RPCs aluno_agenda_*)
    "tabelas": {"calendarios", "agendamentos", "agenda_tags", "bloqueios_agenda", "agenda_travas", "agenda_config", "pacientes"},
    "rpcs": {"agenda_horarios", "agenda_garantir_tags", "aluno_compromissos", "minhas_regras_agenda", "aluno_agenda_horarios", "aluno_agenda_confirmar",
             "aluno_agenda_desistir", "aluno_agenda_reagendar", "aluno_agenda_marcar", "agenda_excluir_calendario", "agenda_garantir_inicio"},
    "buckets": set(),
}
AREAS["alunos"] = {
    # os Alunos (a lista, o seletor, a Busca, o número do menu, os convites, os pendentes, os novos por mês, a equipe) e o pacote
    "tabelas": {"pacientes"},
    "rpcs": {"alunos_da_conta", "aluno_convites", "alunos_pendentes", "alunos_novos_por_mes", "equipe_da_conta", "aluno_definir_pacote"},
    "buckets": set(),
}
OUTRA_AREA = {"casca": "app", "app": "casca", "agenda": "alunos", "alunos": "agenda"}
# FORA DA ÁREA (de outra W ou de outra sub-W da hml-21: lido direto, listado à parte — não é falha): a Agenda do aluno (as regras e os
# horários — 21b), os treinos prontos (Treino — 21d), o desvio 23 (o Treino da Evolução no Início), a casca do painel (21b/21c)
FORA_RPCS = {"minhas_regras_agenda", "aluno_agenda_horarios", "alunos_da_conta", "whatsapp_resumo", "mensagens_desligadas", "equipe_da_conta"}
FORA_TABELAS = {"physiq_treinos_prontos", "physiq_profiles", "physiq_avaliacoes", "physiq_registros_fotos", "pacientes", "agendamentos"}
# hml-21b: as de fora da 21b nas telas do painel (o Treino — 21d; as mensagens e o WhatsApp — 21c; o desvio 23) — à parte, não é falha
FORA_RPCS_21B = {"whatsapp_resumo", "mensagens_desligadas"}
FORA_TABELAS_21B = {"physiq_treinos_prontos", "physiq_profiles", "physiq_avaliacoes", "physiq_registros_fotos", "physiq_treinos", "physiq_alunos"}
# as 6 RPCs de LEITURA que saíram do front na 21a (src/integrations/repeticao.ts: saíram do RPC_SO_LEITURA — a conta as chama no servidor).
# O front ANTIGO (o "antes", e a produção até a release da 21a) ainda as chama direto: a Guarda da produção as deixa passar (só leem).
RPCS_DE_LEITURA_DA_21A = frozenset({"meu_perfil_aluno", "meu_plano_app", "minha_agenda", "minha_agenda_lista", "minha_situacao",
                                    "pratos_prontos_do_app"})
# hml-21b: as 9 RPCs de LEITURA que saíram do front na 21b (o RPC_SO_LEITURA do repeticao.ts: 39 → 30) — o front ANTIGO (a produção até a
# release da 21b) ainda as chama direto: a Guarda da produção as deixa passar (só leem; STABLE no catálogo — hml21/medicao/agenda21b_rpcs.txt)
RPCS_DE_LEITURA_DA_21B = frozenset({"agenda_horarios", "aluno_agenda_horarios", "aluno_compromissos", "aluno_convites", "alunos_da_conta",
                                    "alunos_novos_por_mes", "alunos_pendentes", "equipe_da_conta", "minhas_regras_agenda"})
# hml-21d: as 3 RPCs de LEITURA que saíram do front na 21d (o RPC_SO_LEITURA do repeticao.ts: 30 → 27; STABLE no catálogo — as 2 do Treino em
# hml21/medicao/treino21d_funcoes.txt; a aluno_treino do principal é a do editor) — o front ANTIGO (a produção até a release da 21d) ainda as
# chama direto: a Guarda da produção as deixa passar (só leem)
RPCS_DE_LEITURA_DA_21D = frozenset({"modelos_da_lista", "exercicios_da_lista", "aluno_treino"})
# hml-21d — o que sai do navegador na 21d (as leituras e as gravações do Painel › Treinos, da Biblioteca, da Busca, do Master, dos Treinos
# prontos do app, do espelho do perfil e do editor; as 2 RPCs novas nunca são chamadas pelo front): as tabelas do Treino, as RPCs (as 2 de
# lista e as 2 novas no Treino; a aluno_treino no principal) e o bucket das fotos dos exercícios (menos o PUT no link assinado e a imagem)
AREAS["treinos"] = {
    "tabelas": {"tb_grupos_treino", "tb_grupos_exercicios", "tb_pastas_treino", "tb_pastas_treino_grupos", "tb_exercicios", "grupos_musculares",
                "physiq_treinos_prontos", "physiq_treinos_prontos_grupos", "physiq_treinos_prontos_exercicios", "physiq_professores"},
    "rpcs": {"modelos_da_lista", "exercicios_da_lista", "modelo_ordenar", "treino_pronto_salvar", "aluno_treino"},
    "buckets": {"exercicios", "exercicios-staging"},
}


# hml-21c (decisão F do contrato da 21c): as 7 RPCs de LEITURA que saíram do front na 21c (o RPC_SO_LEITURA do repeticao.ts: 30 → 23; STABLE no
# catálogo vivo — hml21/medicao/rpcs_21c_defs.txt) — o front ANTIGO (a produção até a release da 21c) ainda as chama direto, INCLUSIVE na casca
# de TODA página do painel (o número da Mensagens e a faixa): a Guarda da produção as deixa passar (só leem). As 18 que gravam seguem barradas.
RPCS_DE_LEITURA_DA_21C = frozenset({"aluno_responsavel", "lixeira_da_conta", "mensagens_desligadas", "paciente_dado_livre", "w2l_prontuarios_para_baixar",
                                    "whatsapp_fila", "whatsapp_resumo"})
# hml-21c — o que sai do navegador na 21c (as leituras e as gravações de cada área; a whatsapp-conectar fica — é função, gravação na Guarda):
AREAS["aluno"] = {
    # o Aluno › Resumo (o card de login — na aba Acessos —, as "Mensagens automáticas", os dados, o link, o responsável, o envio) e a pré-checagem
    "tabelas": set(),
    "rpcs": {"aluno_acesso", "paciente_criar_acesso", "paciente_redefinir_senha", "aluno_salvar_ajustes", "aluno_salvar_dados", "aluno_novo_link",
             "aluno_responsavel", "aluno_responsavel_registrar", "aluno_avisar_plano", "paciente_dado_livre"},
    "buckets": set(),
}
AREAS["configuracoes"] = {
    # o Perfil (o profiles próprio e a foto), a Conta (contas), a Equipe e o Convite (as 3 RPCs), o ZIP da exclusão
    "tabelas": {"profiles", "contas"},
    "rpcs": {"alterar_papeis_membro", "remover_membro", "garantir_meu_codigo", "w2l_prontuarios_para_baixar"},
    "buckets": {"fotos-perfil", "fotos-perfil-staging"},
}
AREAS["mensagens"] = {
    # a Mensagens (o perfil, o resumo, a fila, as gravações) e a faixa da casca
    "tabelas": {"profiles"},
    "rpcs": {"whatsapp_resumo", "whatsapp_fila", "whatsapp_salvar_config", "whatsapp_reenviar", "whatsapp_limpar_falhas", "mensagens_desligadas",
             "mensagens_ligar_para_todos", "mensagens_aviso_fechar"},
    "buckets": set(),
}
AREAS["lixeira"] = {"tabelas": set(), "rpcs": {"lixeira_da_conta", "lixeira_restaurar", "lixeira_apagar"}, "buckets": set()}
AREAS["modelos"] = {
    # os ★ das 10 tabelas da Ferramentas › Modelos (o "tirar a ★" é o PATCH nelas); os planos ★ já iam pela nutricao (a aba Treinos: o Treino
    # direto — o desvio do gate da 21d — fica de fora, listada à parte)
    "tabelas": {"modelos_anamnese", "modelos_orientacao", "modelos_recibo", "modelos_documento", "modelos_meta", "modelos_formula", "exames_catalogo",
                "questionarios", "produtos", "receitas", "planos_alimentares"},
    "rpcs": set(),
    "buckets": set(),
}


def guarda_da_w():
    """A Guarda da produção (e2e/hml17: toda escrita barrada; a conta: só o `ler` passa) + as RPCs de leitura que saíram do front na 21a e
    na 21b (o front antigo ainda as chama: só leem)."""
    g = Guarda()
    g.leitura = set(g.leitura) | set(RPCS_DE_LEITURA_DA_21A) | set(RPCS_DE_LEITURA_DA_21B) | set(RPCS_DE_LEITURA_DA_21D)  # hml-21d: + as 3
    g.leitura = set(g.leitura) | set(RPCS_DE_LEITURA_DA_21C)  # hml-21c (decisão F): + as 7 (a casca de toda página do painel antigo as chama)
    return g


def _bucket(url: str) -> str | None:
    m = re.match(r"^/storage/v1/object/(?:sign/|public/|upload/sign/|info/)?([A-Za-z0-9_\-]+)/", urlparse(url).path)
    return m.group(1) if m else None


def direta(p: dict, area: str = "tudo") -> str | None:
    """Um pedido anotado pela Tela (hml17 _anotar) → a chamada DIRETA da área (tab:<t>:<método> · rpc:<f> · storage:<bucket>) ou None. O
    PUT no link que o servidor assinou (/object/upload/sign/…) e o GET da imagem pública não contam (ficam — §2.9)."""
    a = AREAS[area]
    metodo, tipo, nome, url = p.get("metodo"), p.get("tipo"), p.get("nome"), p.get("url", "")
    if metodo == "OPTIONS":
        return None
    if tipo == "tab" and nome in a["tabelas"]:
        return f"tab:{nome}:{metodo}"
    if tipo == "rpc" and nome in a["rpcs"]:
        return f"rpc:{nome}"
    if tipo == "storage":
        caminho = urlparse(url).path
        if "/object/upload/sign/" in caminho or (metodo == "GET" and "/object/public/" in caminho):
            return None
        b = _bucket(url)
        if b in a["buckets"]:
            return f"storage:{b}"
    return None


def fora_da_area(p: dict, area: str = "tudo") -> str | None:
    """A leitura direta de FORA da sub-W (listada à parte): as da 21a (casca/app/tudo) ou as da 21b (agenda/alunos)."""
    rpcs, tabelas = (FORA_RPCS_21B, FORA_TABELAS_21B) if area in AREAS_DA_21B else (FORA_RPCS, FORA_TABELAS)
    metodo, tipo, nome = p.get("metodo"), p.get("tipo"), p.get("nome")
    if tipo == "rpc" and metodo == "POST" and nome in rpcs:
        return f"rpc:{nome}"
    if tipo == "tab" and metodo in ("GET", "HEAD") and nome in tabelas:
        return f"tab:{nome}"
    return None


def _corpo(p: dict) -> dict:
    try:
        b = json.loads(p.get("corpo") or "{}")
    except Exception:  # noqa: BLE001
        return {}
    return b if isinstance(b, dict) else {}


def chamada_da_conta(p: dict) -> str | None:
    """A chamada à conta: "ler" ou o nome da ação (o OPTIONS fora)."""
    if p.get("tipo") != "fn" or p.get("nome") != "conta" or p.get("metodo") != "POST":
        return None
    acao = _corpo(p).get("acao")
    return str(acao) if isinstance(acao, str) else "?"


def contar_area(pedidos: list[dict], area: str = "tudo") -> dict:
    """O que a guarda CONTA numa tela: as diretas da área (têm de ser 0 depois), o `ler` da conta (e as consultas), as ações da conta, as
    diretas da OUTRA área da 21a (a casca × o app: contadas no --area dela), as de fora da 21a (à parte) e as gravações (a regra da Guarda
    dos E2E, com o corpo — a ação da conta é gravação; o `ler`, não)."""
    diretas = Counter(x for x in (direta(p, area) for p in pedidos) if x)
    outra = OUTRA_AREA.get(area)
    da_outra = Counter(x for x in (direta(p, outra) for p in pedidos) if x) if outra else Counter()
    chamadas = Counter(x for x in (chamada_da_conta(p) for p in pedidos) if x)
    consultas = Counter(q for p in pedidos if chamada_da_conta(p) == "ler" for q in B20.consultas_do_corpo(p.get("corpo")))
    fora = Counter(x for x in (fora_da_area(p, area) for p in pedidos) if x)
    gravacoes = Counter(x for x in (B20.gravacao(p) for p in pedidos) if x)
    return {"diretas": dict(diretas), "ler": chamadas.get("ler", 0), "acoes": {k: v for k, v in chamadas.items() if k != "ler"},
            "consultas": dict(consultas), "outra_area": dict(da_outra), "fora": dict(fora), "gravacoes": dict(gravacoes)}


# ───────────────────────── a massa e a limpeza (os caminhos do app; a marca e o DELETE só no staging) ─────────────────────────
NUTRI = "w5p-nutri"  # a nutri de TESTE da aluna: cria os avisos da massa pelos caminhos do app (o painel faz hoje)


def marca(rodada: str) -> str:
    return f"{MARCA} {rodada}"


def criar_massa_avisos(o, estado, L, s: str, aluna_uid: str, rodada: str) -> list[str]:
    """Os avisos NÃO LIDOS do sino da w5p-aluna pelos CAMINHOS QUE JÁ EXISTEM (decisão I), como a w5p-nutri faz no painel: o "avaliação
    nova" (nutricao › avaliacao_avisar, a aluno_avisar_avaliacao) e o "Sua dieta foi atualizada" (a RPC aluno_avisar_plano ['dieta'], a
    reserva do envio). As 2 RPCs têm a trava de 10 min por título (não lido): 2 avisos por rodada. Os ids (achados por SQL só leitura:
    os da aluna criados depois do t0) vão ao Estado na hora (a chave "avisos") e ganham a marca no título (o UPDATE do sqlrw.py: o
    insert não passa nele). Só no staging, só a conta de TESTE."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging")
    t0 = (ler_principal("select now()::text as agora") or [{}])[0].get("agora")
    pac = B17.matricula_da_aluna()  # a matrícula viva da w5p-aluna (a da w5p-nutri — a mesma da massa da hml-19c), SQL só leitura
    o.ok(C.eh_uuid(pac), "massa: a matrícula da w5p-aluna (SQL só leitura)", parar=True)
    estado.d["hml21_destino"] = aluna_uid
    estado.salvar()
    tok = L.token(NUTRI)
    try:
        st1, r1, _h, _ms = B19.funcao(tok, "avaliacao_avisar", {"alunoId": pac})
        st2, r2 = B17.rpc(tok, "aluno_avisar_plano", {"p_aluno": pac, "p_modulos": ["dieta"]})
    finally:
        # os ids na hora (mesmo se o 2º caminho falhar): os da aluna criados depois do t0, ainda não lidos e sem marca
        ids = [x.get("id") for x in ler_principal(
            f"select id from {s}.avisos where destino_user_id = {C.txt(C.uuid_ok(aluna_uid))} and criado_em >= {C.txt(t0)}::timestamptz "
            f"and tipo in ('avaliacao_nova', 'plano_atualizado') and lido_em is null and titulo not like {C.txt('%' + MARCA + '%')}")
            if C.eh_uuid(x.get("id"))]
        for i in ids:
            estado.aviso(i)
        if ids:
            sql_escrever_staging(sql_marcar_avisos(s, aluna_uid, ids, rodada))
    o.ok(st1 == 200 and st2 == 200, f"massa: os 2 avisos pelos caminhos do app, como a w5p-nutri (nutricao › avaliacao_avisar {st1} "
         f"{'avisado' if r1.get('avisado') else r1.get('erro') or 'repetido'}; rpc aluno_avisar_plano {st2} "
         f"{'avisado' if isinstance(r2, dict) and r2.get('avisado') else 'repetido/erro'})")
    o.ok(len(ids) >= 1, f"massa: {len(ids)} aviso(s) não lido(s) novo(s) no sino da aluna, com a marca da rodada no título (ids no Estado)")
    return ids


def sql_marcar_avisos(s: str, destino: str, ids: list[str], rodada: str) -> str:
    """A marca da rodada no título dos avisos da massa (staging, só a conta de TESTE, só os ids da rodada)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para marcar")
    return (f"update {s}.avisos set titulo = titulo || {C.txt(' · ' + marca(rodada))} where destino_user_id = {C.txt(C.uuid_ok(destino))} "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[]) and titulo not like {C.txt('%' + MARCA + '%')};")


def sql_contar_avisos(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): os avisos com a marca (da rodada, ou de qualquer rodada da hml-21) — e os ainda não lidos."""
    m = C.txt(f"%{marca(rodada)}%" if rodada else f"%{MARCA}%")
    return f"select count(*)::int as avisos, count(*) filter (where lido_em is null)::int as nao_lidos from {s}.avisos where titulo like {m}"


def sql_apagar_avisos(s: str, destino: str, ids: list[str]) -> str:
    """O DELETE dos avisos da rodada (só no staging, só da conta de TESTE, só os ids anotados)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para apagar")
    return (f"delete from {s}.avisos where destino_user_id = {C.txt(C.uuid_ok(destino))} "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[]);")


def sql_escrever_staging(sql: str) -> None:
    """A escrita da massa/limpeza SÓ no schema staging (decisão I do contrato da 21a): o sqlrw.py com PERMITIR_ESCRITA=1 e o --confirmo,
    pelo com_pat.py. Só o UPDATE da marca, o UPDATE que devolve o não lido e o DELETE em staging.avisos passam aqui, 1 instrução (o resto
    é recusado antes de sair)."""
    if re.search(r"\bpublic\.", sql) or sql.count(";") != 1 or \
            not re.fullmatch(r"(?is)\s*(update staging\.avisos set titulo = titulo \|\| |delete from staging\.avisos where destino_user_id = "
                             r"|update staging\.avisos set lido_em = null where destino_user_id = ).*;\s*", sql):
        raise SystemExit("escrita fora do combinado (só o update da marca e o delete em staging.avisos) — recusado")
    env = dict(os.environ, PERMITIR_ESCRITA="1")
    r = subprocess.run(["python3", str(COM_PAT), "python3", str(SQLRW), PRINCIPAL_REF, "--confirmo"], input=sql, capture_output=True,
                       text=True, env=env, timeout=180)
    if r.returncode != 0 or "status 20" not in r.stdout:
        raise RuntimeError(f"sqlrw (staging): {(r.stdout + r.stderr).strip()[:200]}")


SINO_ANTES = SCRATCH / "tmp" / "hml21_sino_antes.json"


def sql_desmarcar_lidos(s: str, destino: str, ids: list[str]) -> str:
    """Devolve o "não lido" dos avisos que a aluna de TESTE tinha não lidos ANTES da etapa 2 (abrir o sino marca todos): só no staging, só
    a destino de TESTE, só os ids guardados."""
    if s != "staging":
        raise SystemExit("o sino só é devolvido no staging")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum aviso guardado para devolver")
    return (f"update {s}.avisos set lido_em = null where destino_user_id = {C.txt(C.uuid_ok(destino))} "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[]);")


def guardar_sino(o, s: str) -> None:
    """Antes da 1ª rodada que abre o sino: os ids dos avisos NÃO LIDOS da aluna de TESTE (sem a marca) num arquivo do TMPDIR da W (600) —
    o --devolver-sino do api.py devolve o lido_em nulo a eles no fim da etapa. Não sobrescreve um guardado (o 1º é o "antes")."""
    if s != "staging":
        return
    if SINO_ANTES.exists():
        o.linha(f"   (o sino de antes já está guardado: {len(json.loads(SINO_ANTES.read_text(encoding='utf-8')).get('ids', []))} aviso(s))")
        return
    uid = uid_da_conta(ALUNA)
    ids = [x.get("id") for x in ler_principal(
        f"select id from {s}.avisos where destino_user_id = {C.txt(C.uuid_ok(uid))} and lido_em is null and titulo not like {C.txt('%' + MARCA + '%')}")
        if C.eh_uuid(x.get("id"))]
    SINO_ANTES.parent.mkdir(parents=True, exist_ok=True)
    SINO_ANTES.write_text(json.dumps({"destino": uid, "ids": ids}), encoding="utf-8")
    SINO_ANTES.chmod(0o600)
    o.ok(True, f"o sino da aluna antes da etapa 2: {len(ids)} aviso(s) não lido(s) guardado(s) (os ids no TMPDIR, 600) — voltam no --devolver-sino")


def devolver_sino(o, s: str) -> None:
    """No fim da etapa 2: os avisos que estavam não lidos antes voltam a não lidos (o UPDATE do lido_em = null, só eles), conferido por SQL
    só leitura (todos não lidos de novo)."""
    if not SINO_ANTES.exists():
        o.ok(True, "devolver o sino: nada guardado")
        return
    d = json.loads(SINO_ANTES.read_text(encoding="utf-8"))
    destino, ids = d.get("destino"), [i for i in d.get("ids", []) if C.eh_uuid(i)]
    if ids and C.eh_uuid(destino):
        sql_escrever_staging(sql_desmarcar_lidos(s, destino, ids))
        n = ler_principal(f"select count(*) filter (where lido_em is null)::int as n from {s}.avisos where destino_user_id = {C.txt(destino)} "
                          f"and id = any(array[{', '.join(C.txt(i) for i in ids)}]::uuid[])")[0]["n"]
    else:
        n = 0
    if o.ok(n == len(ids), f"o sino da aluna devolvido: {n} de {len(ids)} aviso(s) não lido(s) de novo, como antes da etapa 2 (SQL só leitura)"):
        SINO_ANTES.unlink()


def ids_com_a_marca(s: str, destino: str) -> list[str]:
    """Os avisos da aluna de TESTE que ainda têm a marca da hml-21 (de qualquer rodada) — SQL só leitura (só os ids)."""
    return [x.get("id") for x in ler_principal(
        f"select id from {s}.avisos where destino_user_id = {C.txt(C.uuid_ok(destino))} and titulo like {C.txt('%' + MARCA + '%')}")
        if C.eh_uuid(x.get("id"))]


def limpar_massa(o, estado, s: str) -> None:
    """Desfaz a massa: o DELETE dos avisos anotados no Estado (a chave "avisos") + os da aluna de TESTE que ainda têm a marca (uma rodada
    que caiu antes de anotar) — só no staging, só os ids, só a destino de TESTE — e a conferência por SQL só leitura, só contagem (0 aviso
    com a marca da hml-21)."""
    if s != "staging":
        o.ok(True, "limpeza: a massa só existe no staging (nada a apagar)")
        return
    destino = estado.d.get("hml21_destino")
    ids = [i for i in (estado.d.get("avisos") or []) if C.eh_uuid(i)]
    if C.eh_uuid(destino):
        ids = sorted(set(ids) | set(ids_com_a_marca(s, destino)))
        if ids:
            sql_escrever_staging(sql_apagar_avisos(s, destino, ids))
    estado.d["avisos"] = []
    estado.salvar()
    sobra = ler_principal(sql_contar_avisos(s))[0]
    o.ok(not sobra.get("avisos"), f"limpeza conferida (SQL só leitura): {len(ids)} aviso(s) da massa apagado(s); 0 com a marca da hml-21 "
                                  f"({sobra.get('avisos')})")


# ───────────────────────── a rodada: o Estado (hml19/agente/e2e_estado.json) — abrir e fechar ─────────────────────────
def tem_massa_21b(estado) -> bool:
    """hml-21b: o Estado ainda tem massa da Agenda/dos Alunos (a chave "hml21b": os ids criados pelas ações, os avisos gerados, o pacote
    a devolver) — o vazio() da hml-19 não conhece a chave; uma rodada da 21a não abre por cima (nem a da 21b por cima da 21a)."""
    m = estado.d.get(CHAVE_21B)
    return isinstance(m, dict) and any(bool(v) for v in m.values())


def tem_massa_21d(estado) -> bool:
    """hml-21d: o Estado ainda tem massa do Treino (a chave "hml21d": os donos, as linhas criadas pelas ações, os arquivos de teste)."""
    m = estado.d.get(CHAVE_21D)
    return isinstance(m, dict) and any(bool(m.get(k)) for k in ("linhas", "storage", "donos"))


def tem_massa_21c(estado) -> bool:
    """hml-21c: o Estado ainda tem a rodada da 21c (a chave "hml21c": as linhas da massa, os avisos do plano e o que falta devolver)."""
    m = estado.d.get(CHAVE_21C)
    return isinstance(m, dict) and any(bool(m.get(k)) for k in ("linhas", "avisos", "devolver"))


def tem_massa_21e(estado) -> bool:
    """hml-21e: o Estado ainda tem a massa do D3 do PowerSync (a chave "hml21e": os 2 donos e as linhas que a fila criou — o
    --limpar do d3_powersync.py desfaz)."""
    m = estado.d.get(CHAVE_21E)
    return isinstance(m, dict) and any(bool(m.get(k)) for k in ("linhas", "donos"))


def abrir_rodada(o, s: str):
    """A rodada nova: recusa se há outra pendente (de qualquer W: o vazio() da hml-19 + a foto desta) e grava o Estado com a área desta W."""
    pendente = Estado.ler()
    if not pendente.vazio() or pendente.d.get("hml21_foto") or pendente.d.get("hml21_destino") or tem_massa_21b(pendente) or tem_massa_21d(pendente) \
            or tem_massa_21c(pendente) or tem_massa_21e(pendente):  # hml-21c · hml-21e
        o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area') or '?'}): rode o --limpar dela antes", parar=True)
    estado = Estado({"rodada": nova_rodada(), "schema": s, "area": AREA_ESTADO, "linhas": [], "storage": [], "n8": None})
    estado.salvar()
    return estado


def fechar_rodada(o, estado, s: str, L) -> None:
    """O fim da rodada (no finally — o SIGTERM vira SystemExit e passa aqui): a massa do sino (os ids do Estado + os que têm a marca) e a
    foto da aluna (a de antes volta; os arquivos de teste saem); o Estado só some com tudo desfeito (senão fica para o --limpar)."""
    try:
        if s == "staging" and (estado.d.get("avisos") or C.eh_uuid(estado.d.get("hml21_destino"))):
            limpar_massa(o, estado, s)
    finally:
        try:
            limpar_push(o, estado, s, L)
        finally:
            limpar_foto(o, estado, s, L)
    if estado.vazio() and not estado.d.get("hml21_foto") and not estado.d.get("hml21_push") and not tem_massa_21b(estado) and not tem_massa_21d(estado) \
            and not tem_massa_21c(estado) and not tem_massa_21e(estado):  # hml-21c · hml-21e
        estado.apagar()
    else:
        o.ok(False, "o Estado ficou com pendência (a massa, o push ou a foto): rode o api.py --limpar", parar=False)


def limpar_push(o, estado, s: str, L) -> None:
    """O token de push de TESTE que a rodada registrou para a aluna (anotado ANTES do push_registrar): esquecido pela conta como ela e
    conferido por SQL só leitura (0 aparelho com ele)."""
    tk = estado.d.get("hml21_push")
    if not (isinstance(tk, str) and tk.startswith("hml21-e2e-")):
        return
    tok, uid = L.token(ALUNA), L.uid(ALUNA)
    st, _r, _h, _ms = conta(tok, "push_esquecer", {"token": tk})
    n = ler_principal(f"select count(*)::int as n from {s}.push_aparelhos where token = {C.txt(tk)} and user_id = {C.txt(C.uuid_ok(uid))}")[0]["n"]
    if o.ok(n == 0, f"limpeza: o token de push de teste esquecido (push_esquecer {st}; SQL só leitura: {n})", parar=False):
        estado.d["hml21_push"] = None
        estado.salvar()


def uid_da_conta(conta: str) -> str | None:
    """O id da conta de TESTE no Auth (SQL só leitura; nada sai na tela)."""
    linhas = ler_principal(f"select id::text as id from auth.users where lower(email) = lower({C.txt(B5.CONTAS[conta][0])})")
    v = linhas[0].get("id") if linhas else None
    return v if C.eh_uuid(v) else None


SOZINHO_EMAIL_SQL = "w7b.sozinho.teste.claude@physiqnutri.app"


def sozinho_no_staging(s: str) -> int:
    """Decisão I: o w7b-sozinho existe no staging? (SQL só leitura, só contagem: o perfil dele no schema e a matrícula do app)."""
    linha = ler_principal(
        f"select (select count(*) from {s}.profiles p join auth.users u on u.id = p.id where lower(u.email) = {C.txt(SOZINHO_EMAIL_SQL)})::int "
        f"as perfis, (select count(*) from {s}.pacientes x join auth.users u on u.id = x.user_id where lower(u.email) = "
        f"{C.txt(SOZINHO_EMAIL_SQL)} and x.deleted_at is null)::int as matriculas")[0]
    return min(int(linha.get("perfis") or 0), int(linha.get("matriculas") or 0))


# ───────────────────────── a foto da aluna: guardada antes e devolvida no fim (decisão I) ─────────────────────────
TMP = SCRATCH / "tmp"


def foto_pode_trocar(s: str, uid: str) -> tuple[bool, str]:
    """⚪5 da revisão (corrigido pela sessão principal 23:53): a troca de teste roda quando a pessoa NÃO tem foto (no fim, o
    perfil_foto_tirar: sem foto de novo e 0 arquivo dela no bucket) ou quando a foto de hoje é um arquivo da pasta dela no bucket do
    ambiente (no fim, a cópia volta pelo caminho novo). Só é PULADA quando ela TEM uma foto de fora da pasta (o Google, outra
    pasta/bucket): o perfil não voltaria exatamente como estava."""
    url = foto_da_conta(s, uid)
    if not url:
        return True, "sem foto (no fim: perfil_foto_tirar)"
    caminho = caminho_da_url(url, bucket_das_fotos(s), uid)
    if caminho and objetos(bucket_das_fotos(s), [caminho]) == 1:
        return True, "foto da pasta dela (no fim: a cópia volta)"
    return False, "foto de fora da pasta dela (PULADO)"


def objetos_da_pasta(bucket: str, uid: str) -> int:
    """Quantos arquivos a pessoa tem na pasta dela no bucket das fotos (SQL só leitura, só contagem)."""
    if bucket not in ("fotos-perfil", "fotos-perfil-staging"):
        return 0
    return int(ler_principal(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(bucket)} "
                             f"and name like {C.txt(C.uuid_ok(uid) + '/%')}")[0].get("n") or 0)


def guardar_foto(o, estado, s: str, uid: str) -> None:
    """Antes de trocar a foto: anota a URL de hoje no Estado e guarda uma CÓPIA do arquivo (o bucket é público) no TMPDIR da W (600) —
    a cópia é o que volta no fim (pelo caminho novo: a foto anterior da pasta sai do bucket quando a de teste é salva — achado 2)."""
    antes = foto_da_conta(s, uid)
    info: dict = {"url": antes, "arquivo": None, "tipo": None, "pasta_antes": objetos_da_pasta(bucket_das_fotos(s), uid)}
    if antes:
        st, conteudo, tipo = baixar_bytes(antes)
        tipo = (tipo or "").split(";")[0].strip()
        if st == 200 and conteudo and tipo in ("image/jpeg", "image/png", "image/webp"):
            TMP.mkdir(parents=True, exist_ok=True)
            arq = TMP / f"hml21_foto_antes_{estado.d.get('rodada') or 'x'}.bin"
            arq.write_bytes(conteudo)
            arq.chmod(0o600)
            info.update({"arquivo": str(arq), "tipo": tipo})
        estado.d["hml21_foto"] = info
        estado.salvar()
        # sem a cópia, a foto NÃO é trocada (pararia sem como devolver): a rodada para aqui e o fechar_rodada só confere que nada mudou
        o.ok(info["arquivo"] is not None, f"a foto da aluna antes: tinha ({st}, {len(conteudo)} bytes, {tipo or '?'}) — cópia guardada no TMPDIR",
             parar=True)
        return
    o.linha("   a foto da aluna antes: não tinha (no fim: perfil_foto_tirar)")
    estado.d["hml21_foto"] = info
    estado.salvar()


def devolver_foto(o, estado, s: str, tok: str, uid: str) -> None:
    """No fim (ou no --limpar): a foto de antes volta pelo caminho novo (preparar → PUT no link → salvar; o caminho muda: anotado) ou,
    se ela não tinha, perfil_foto_tirar (o arquivo de teste sai do bucket). Confere pela URL gravada (SQL só leitura) e pelo arquivo.
    hml-21c (🟡1 da revisão): as ações com o x-schema = `s` (o schema de onde a rodada rodou), nunca o da linha de comando."""
    info = estado.d.get("hml21_foto")
    if not isinstance(info, dict):
        return
    arq = Path(info["arquivo"]) if info.get("arquivo") else None
    if foto_da_conta(s, uid) == info.get("url"):
        volta_ok = True  # a foto não chegou a mudar (a rodada caiu antes de salvar a de teste): nada a devolver
        o.linha("   (a foto da aluna não mudou: nada a devolver)")
    elif arq and arq.exists():
        conteudo, tipo = arq.read_bytes(), info.get("tipo") or "image/jpeg"
        st, p, _h, _ms = conta(tok, "perfil_foto_preparar", {"tipo": tipo, "tamanho": len(conteudo)}, schema_=s)
        put = subir_no_link(p["bucket"], p["caminho"], p["token"], conteudo, tipo, tok) if st == 200 else 0
        st2, r, _h, _ms = conta(tok, "perfil_foto_salvar", {"caminho": p.get("caminho")}, schema_=s) if put in (200, 201) else (0, {}, {}, 0)
        url = r.get("url") if isinstance(r, dict) else None
        volta_ok = bool(url) and foto_da_conta(s, uid) == url and baixar_bytes(url)[1] == conteudo
        o.ok(volta_ok, f"a foto de antes devolvida (o mesmo arquivo, pelo caminho novo — o nome mudou: {str(p.get('caminho', '?')).split('/')[-1]}) "
                       f"({st}, PUT {put}, salvar {st2})", parar=False)
    elif info.get("url"):
        o.ok(False, "a foto de antes não tem cópia guardada (o arquivo do TMPDIR sumiu): devolva à mão pela tela da Conta", parar=False)
        return
    else:
        st, _r, _h, _ms = conta(tok, "perfil_foto_tirar", schema_=s)
        volta_ok = st == 200 and foto_da_conta(s, uid) is None
        o.ok(volta_ok, f"perfil_foto_tirar → a aluna sem foto, como antes ({st})", parar=False)
    if volta_ok:
        if arq and arq.exists():
            arq.unlink()
        estado.d["hml21_foto"] = None
        estado.salvar()


def limpar_foto(o, estado, s: str, L, conta: str = ALUNA) -> None:
    """A foto no fim da rodada (ou no --limpar): a de antes volta (devolver_foto) e os arquivos de TESTE que a rodada subiu (a chave
    "storage" do Estado, anotados logo depois do PUT) não ficam no bucket — o que ainda existir e não for a foto de agora sai como a
    aluna (a pasta é dela: a policy de apagar da pasta própria); conferido por SQL só leitura, só contagem."""
    fotos = [[b, c] for b, c in (estado.d.get("storage") or []) if b in ("fotos-perfil", "fotos-perfil-staging")]
    if not (isinstance(estado.d.get("hml21_foto"), dict) or fotos):
        return
    tok, uid = L.token(conta), L.uid(conta)  # hml-21c: a foto do PROFISSIONAL (a nutri) pelo mesmo caminho — a conta vem de quem chama
    info = estado.d.get("hml21_foto") if isinstance(estado.d.get("hml21_foto"), dict) else {}
    pasta_antes = info.get("pasta_antes")
    devolver_foto(o, estado, s, tok, uid)
    agora = caminho_da_url(foto_da_conta(s, uid), bucket_das_fotos(s), uid)
    for bucket, caminho in fotos:
        if caminho != agora and objetos(bucket, [caminho]):
            B19.remover_do_storage(bucket, [caminho], tok)
    sobra = sum(objetos(b, [c]) for b, c in fotos if c != agora)
    if o.ok(sobra == 0, f"limpeza: os {len(fotos)} arquivo(s) de teste da foto fora do bucket (SQL só leitura: {sobra})", parar=False):
        estado.d["storage"] = [x for x in (estado.d.get("storage") or []) if x not in fotos]
        estado.salvar()
    if isinstance(pasta_antes, int):
        n = objetos_da_pasta(bucket_das_fotos(s), uid)
        o.ok(n == pasta_antes, f"a pasta da aluna no {bucket_das_fotos(s)} como antes: {n} arquivo(s) (antes {pasta_antes}; SQL só leitura)", parar=False)


def bucket_das_fotos(s: str) -> str:
    """O bucket das fotos do perfil no ambiente (o bucketDasFotos do servidor)."""
    return "fotos-perfil-staging" if s == "staging" else "fotos-perfil"


URL_API_PROPRIA = "https://api-principal.physiqcalc.com.br"  # o URL_API_PROPRIA do _shared/conta-regras.ts (o --seco confere)


def caminho_da_url(url: str | None, bucket: str, uid: str) -> str | None:
    """O caminho <uid>/<arquivo> de uma URL pública DESTE bucket na pasta da pessoa (o caminhoDaFotoAnterior do servidor); senão None."""
    if not url:
        return None
    from urllib.parse import unquote  # noqa: PLC0415
    caminho = unquote(urlparse(url).path)
    prefixo = f"/storage/v1/object/public/{bucket}/{uid}/"
    nome = caminho[len(prefixo):] if caminho.startswith(prefixo) else ""
    return f"{uid}/{nome}" if re.fullmatch(r"[A-Za-z0-9._-]{1,200}", nome or "") and nome not in (".", "..") else None


def objetos(bucket: str, caminhos: list[str]) -> int:
    """Quantos destes arquivos existem no bucket (SQL só leitura no storage.objects, só contagem)."""
    validos = [c for c in caminhos if isinstance(c, str) and re.fullmatch(r"[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}", c)]
    if not validos or bucket not in ("fotos-perfil", "fotos-perfil-staging"):
        return 0
    return int(ler_principal(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(bucket)} "
                             f"and name = any(array[{', '.join(C.txt(c) for c in validos)}]::text[])")[0].get("n") or 0)


def foto_da_conta(s: str, uid: str) -> str | None:
    """A foto do perfil da conta de TESTE hoje (SQL só leitura): a URL do dados_profissionais (ou None)."""
    linhas = ler_principal(f"select dados_profissionais->>'foto_url' as foto from {s}.profiles where id = {C.txt(C.uuid_ok(uid))}")
    v = (linhas[0] or {}).get("foto") if linhas else None
    return v if isinstance(v, str) and v.strip() else None


def baixar_bytes(url: str) -> tuple[int, bytes, str]:
    """GET da foto pública (o <img> da tela, sem login) → (status, bytes, content-type)."""
    import urllib.error  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415
    req = urllib.request.Request(url, headers={"User-Agent": "physiq-hml21-e2e/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read(), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        return e.code, b"", ""


def subir_no_link(bucket: str, caminho: str, token_link: str, conteudo: bytes, mime: str, token_pessoa: str) -> int:
    """O PUT no link assinado (o uploadToSignedUrl da tela) — o mesmo do e2e/hml19/_base.py."""
    return B19.subir_no_link(bucket, caminho, token_link, conteudo, mime, token_pessoa)


def png_sintetico(lado: int = 8) -> bytes:
    """Uma imagem PNG pequena gerada aqui (nunca foto real) — a foto de teste do perfil."""
    return B20.png_sintetico(lado)


# ───────────────────────── a planilha e os prints ─────────────────────────
def anotar_planilha(arquivo: Path, cabecalho: list[str], valores: list[object]) -> None:
    MEDICAO.mkdir(parents=True, exist_ok=True)
    novo = not arquivo.exists()
    with arquivo.open("a", encoding="utf-8") as f:
        if novo:
            f.write("\t".join(cabecalho) + "\n")
        f.write("\t".join(str(v) for v in valores) + "\n")


def fase_do_codigo(base: str, commit: str) -> str:
    """depois = o commit medido tem a porta da conta (src/conta/ler.ts); antes = o código antigo (a casca e o app liam direto)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(REPO), "cat-file", "-e", f"{commit}:src/conta/ler.ts"], capture_output=True, timeout=10)
    return "depois" if r.returncode == 0 else "antes"


def print_reduzido(pg, prefixo: str, caso: str, o) -> Path:
    """O print <prefixo>_<caso>.png em prints/hml21/a (a 21b: prints/hml21/b — o usar_area) e a cópia de 900 px."""
    return B20.print_reduzido(pg, prefixo, caso, o, pasta=PRINTS)


def antes_da_spec() -> dict[str, float | None]:
    """O "antes" medido pela spec da hml-21 (hml21/medicao/rede_por_tela.tsv, a w5p-aluna): t_pronto por rota."""
    arq = MEDICAO / "rede_por_tela.tsv"
    saida: dict[str, float | None] = {}
    if not arq.exists():
        return saida
    linhas = arq.read_text(encoding="utf-8").splitlines()
    cab = linhas[0].split("\t") if linhas else []
    for linha in linhas[1:]:
        c = dict(zip(cab, linha.split("\t")))
        if c.get("conta") == ALUNA:
            try:
                saida[c.get("rota", "")] = float(c.get("t_pronto_s", ""))
            except ValueError:
                saida[c.get("rota", "")] = None
    return saida
