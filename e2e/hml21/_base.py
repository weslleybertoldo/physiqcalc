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
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml21" / "a"
MARCA = "hml21 e2e"
AREA_ESTADO = "hml21a"  # a área no Estado (o --limpar desta W só desfaz a rodada dela)
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


def sair_do_treino(o, pg, rotulo: str, t=None, espera_s: float = 40.0) -> None:
    """O logout (scope=local) da sessão do Treino que a troca do app abriu (decisão 23 da hml-20) — ESPERANDO a troca terminar quando a
    tela pediu a trocar-token (até 40 s, o teto do app: na etapa 2, o contexto do w7b-sozinho fechou antes de a sessão chegar ao
    localStorage e 2 sessões do Treino dele ficaram abertas). `t` = a Tela (os pedidos anotados)."""
    if t is not None and any(p.get("tipo") == "fn" and p.get("nome") == "trocar-token" for p in getattr(t, "pedidos", [])):
        fim = time.time() + espera_s
        while time.time() < fim and not B20.token_do_treino_no_navegador(pg):
            try:
                pg.wait_for_timeout(500)
            except Exception:  # noqa: BLE001 — a página fechou
                break
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
const consultas = Object.fromEntries(cat.CONSULTAS_DA_CONTA.map((q) => {
  const c = cat.CONSULTAS_CONTA[q];
  const f = c.fonte;
  return [q, { params: c.params, rpc: f.rpc ?? null, args: f.args ?? null, tabela: f.tabela ?? null, colunas: f.colunas ?? null, teto: f.teto ?? null,
    filtros: f.filtros ?? null, nulos: f.nulos ?? null, ordem: f.ordem ?? null, dono: c.dono ?? null }];
}));
console.log(JSON.stringify({
  consultas, lote_max: motor.LOTE_MAX, avisos_max: cat.AVISOS_MAX, tipo_membro: cat.TIPO_MEMBRO_REMOVIDO,
  casca: [...reg.ACOES_DA_CASCA], app: [...reg.ACOES_DO_APP], corpos: reg.CORPOS_DAS_ACOES, status: reg.STATUS_DO_ERRO_CONTA,
  foto: { max: reg.FOTO_MAX_BYTES, tipos: reg.TIPOS_DE_FOTO, url_propria: reg.URL_API_PROPRIA,
          buckets: { public: reg.bucketDasFotos("public"), staging: reg.bucketDasFotos("staging") } },
  pedidos: (e.pedidos ?? []).map((corpo) => {
    const p = reg.moduloDoPedido(corpo);
    if (!p) return { modulo: null };
    if (p.modulo === "leitura") {
      const r = motor.lerPedidoDeLeitura(corpo, cat.CONSULTAS_CONTA);
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
LISTAS_DA_LIB = ("avisos", "aviso_membro_removido", "perfil_foto")
# as chaves que a RPC devolve com o relógio do banco (comparar fora delas: o 20b PADRÃO do 'agora'; a minha_situacao devolve o gerado_em)
CHAVES_DO_RELOGIO = {"agora", "agora_em", "servidor_agora", "hoje", "gerado_em"}


def sql_da_lib(q: str, s: str, **valores) -> str:
    """O SQL FIXO da lib (o SQL_DA_LIB) com o schema e os valores conferidos (uuid e instante; nada do corpo de ninguém)."""
    _origem, sql = SQL_DA_LIB[q]
    v: dict[str, str] = {"s": s}
    for k, x in valores.items():
        if k == "uid":
            v[k] = C.txt(C.uuid_ok(str(x)))
        elif k == "desde":
            if not (isinstance(x, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z", x)):
                raise SystemExit("instante fora do formato no SQL da lib")
            v[k] = C.txt(x)
    texto = sql.format(**v)
    return _ag.format(texto) if q in LISTAS_DA_LIB else texto


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
# FORA DA ÁREA (de outra W ou de outra sub-W da hml-21: lido direto, listado à parte — não é falha): a Agenda do aluno (as regras e os
# horários — 21b), os treinos prontos (Treino — 21d), o desvio 23 (o Treino da Evolução no Início), a casca do painel (21b/21c)
FORA_RPCS = {"minhas_regras_agenda", "aluno_agenda_horarios", "alunos_da_conta", "whatsapp_resumo", "mensagens_desligadas", "equipe_da_conta"}
FORA_TABELAS = {"physiq_treinos_prontos", "physiq_profiles", "physiq_avaliacoes", "physiq_registros_fotos", "pacientes", "agendamentos"}
# as 6 RPCs de LEITURA que saíram do front na 21a (src/integrations/repeticao.ts: saíram do RPC_SO_LEITURA — a conta as chama no servidor).
# O front ANTIGO (o "antes", e a produção até a release da 21a) ainda as chama direto: a Guarda da produção as deixa passar (só leem).
RPCS_DE_LEITURA_DA_21A = frozenset({"meu_perfil_aluno", "meu_plano_app", "minha_agenda", "minha_agenda_lista", "minha_situacao",
                                    "pratos_prontos_do_app"})


def guarda_da_w():
    """A Guarda da produção (e2e/hml17: toda escrita barrada; a conta: só o `ler` passa) + as 6 RPCs de leitura da 21a (o front antigo)."""
    g = Guarda()
    g.leitura = set(g.leitura) | set(RPCS_DE_LEITURA_DA_21A)
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


def fora_da_area(p: dict) -> str | None:
    metodo, tipo, nome = p.get("metodo"), p.get("tipo"), p.get("nome")
    if tipo == "rpc" and metodo == "POST" and nome in FORA_RPCS:
        return f"rpc:{nome}"
    if tipo == "tab" and metodo in ("GET", "HEAD") and nome in FORA_TABELAS:
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
    outra = {"casca": "app", "app": "casca"}.get(area)
    da_outra = Counter(x for x in (direta(p, outra) for p in pedidos) if x) if outra else Counter()
    chamadas = Counter(x for x in (chamada_da_conta(p) for p in pedidos) if x)
    consultas = Counter(q for p in pedidos if chamada_da_conta(p) == "ler" for q in B20.consultas_do_corpo(p.get("corpo")))
    fora = Counter(x for x in (fora_da_area(p) for p in pedidos) if x)
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
def abrir_rodada(o, s: str):
    """A rodada nova: recusa se há outra pendente (de qualquer W: o vazio() da hml-19 + a foto desta) e grava o Estado com a área desta W."""
    pendente = Estado.ler()
    if not pendente.vazio() or pendente.d.get("hml21_foto") or pendente.d.get("hml21_destino"):
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
    if estado.vazio() and not estado.d.get("hml21_foto") and not estado.d.get("hml21_push"):
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
    se ela não tinha, perfil_foto_tirar (o arquivo de teste sai do bucket). Confere pela URL gravada (SQL só leitura) e pelo arquivo."""
    info = estado.d.get("hml21_foto")
    if not isinstance(info, dict):
        return
    arq = Path(info["arquivo"]) if info.get("arquivo") else None
    if foto_da_conta(s, uid) == info.get("url"):
        volta_ok = True  # a foto não chegou a mudar (a rodada caiu antes de salvar a de teste): nada a devolver
        o.linha("   (a foto da aluna não mudou: nada a devolver)")
    elif arq and arq.exists():
        conteudo, tipo = arq.read_bytes(), info.get("tipo") or "image/jpeg"
        st, p, _h, _ms = conta(tok, "perfil_foto_preparar", {"tipo": tipo, "tamanho": len(conteudo)})
        put = subir_no_link(p["bucket"], p["caminho"], p["token"], conteudo, tipo, tok) if st == 200 else 0
        st2, r, _h, _ms = conta(tok, "perfil_foto_salvar", {"caminho": p.get("caminho")}) if put in (200, 201) else (0, {}, {}, 0)
        url = r.get("url") if isinstance(r, dict) else None
        volta_ok = bool(url) and foto_da_conta(s, uid) == url and baixar_bytes(url)[1] == conteudo
        o.ok(volta_ok, f"a foto de antes devolvida (o mesmo arquivo, pelo caminho novo — o nome mudou: {str(p.get('caminho', '?')).split('/')[-1]}) "
                       f"({st}, PUT {put}, salvar {st2})", parar=False)
    elif info.get("url"):
        o.ok(False, "a foto de antes não tem cópia guardada (o arquivo do TMPDIR sumiu): devolva à mão pela tela da Conta", parar=False)
        return
    else:
        st, _r, _h, _ms = conta(tok, "perfil_foto_tirar")
        volta_ok = st == 200 and foto_da_conta(s, uid) is None
        o.ok(volta_ok, f"perfil_foto_tirar → a aluna sem foto, como antes ({st})", parar=False)
    if volta_ok:
        if arq and arq.exists():
            arq.unlink()
        estado.d["hml21_foto"] = None
        estado.salvar()


def limpar_foto(o, estado, s: str, L) -> None:
    """A foto no fim da rodada (ou no --limpar): a de antes volta (devolver_foto) e os arquivos de TESTE que a rodada subiu (a chave
    "storage" do Estado, anotados logo depois do PUT) não ficam no bucket — o que ainda existir e não for a foto de agora sai como a
    aluna (a pasta é dela: a policy de apagar da pasta própria); conferido por SQL só leitura, só contagem."""
    fotos = [[b, c] for b, c in (estado.d.get("storage") or []) if b in ("fotos-perfil", "fotos-perfil-staging")]
    if not (isinstance(estado.d.get("hml21_foto"), dict) or fotos):
        return
    tok, uid = L.token(ALUNA), L.uid(ALUNA)
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
    """O print <prefixo>_<caso>.png em prints/hml21/a e a cópia de 900 px."""
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
