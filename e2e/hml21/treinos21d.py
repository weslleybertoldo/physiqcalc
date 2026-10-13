"""Physiq hml-21d (H-43 parte 3 · jeito 2, etapa 3, 13/10/2026) — a base dos E2E do Treino pela função NOVA `treinos` (o Banco do Treino) e do
editor (Aluno › Treino) pela `conta` (q=aluno_treino): api.py, rede.py e telas.py --area treinos e o sql_treinos.py. Usa o e2e/hml21/_base.py
(B) e acrescenta:
  · as contas (decisão I do contrato da 21d): PERSONAL = w5p-personal (o painel: Meus treinos, o Detalhe, a Biblioteca, a Folha do
    exercício, os Modelos › Treinos, a Busca e o Aluno › Treino com a w5p-aluna — a matrícula da conta dele; e o não master do N10: nenhuma
    conta de teste é master — decisão 19), SOZINHO = w7b-sozinho (os Treinos prontos do app sem profissional), OUTRA = w13-dono (o outro
    profissional que a hml-21 já usa: N1 e N12). Nenhuma conta nova no Auth. Na produção (decisão N, SÓ LEITURA): a nutri-legado no painel
    (a área Treino só se a conta ativa dela tem o módulo treino e o papel personal — senão PULA com o motivo) e a aluno-calc no app (os
    Treinos prontos só se ela NÃO tem profissional — senão PULA com o motivo);
  · a função como a tela chama (a chave anon do Treino, o Bearer do TREINO — a sessão da troca, a mesma do app —, o x-schema e a Origin) e
    as regras do SERVIDOR lidas do próprio TS (node, sem rede): o catálogo, as ações, os corpos e o leitor do pedido (o --seco confere cada
    corpo dos E2E nele);
  · o SQL FIXO do que as libs do 7c1a637 liam (com a origem arquivo:linha — nunca montado do catálogo) rodado COMO A PESSOA: no Treino com
    as claims do PRÓPRIO token do Treino dela (o sub e o app_metadata.role — o RLS do Treino lê o papel: physiq_papel()), e o aluno_treino
    no principal (B20.ler_como);
  · as telas do rede.py/telas.py (a rota ou o clique, o seletor do "pronto", o teto de `ler`) — nenhuma grava ao abrir (o --seco confere
    no código: as telas não chamam ação nenhuma num efeito); a produção com a MESMA trava da 21b (a Guarda + as 3 RPCs de leitura que saíram
    do front na 21d, o JS_SEM_AVISO_VISTO, o LegalDesligado);
  · a massa (decisão I): pasta, modelo (com 3 exercícios), exercício (com uma imagem PNG pequena DE TESTE pelo link que o servidor assina —
    o caminho <id do exercício>.png no exercicios-staging: a policy do bucket exige esse nome, sem a pasta do user — o ## ACHADO ⚪ da 21d) e
    grupo muscular DE TESTE pelas AÇÕES da `treinos` (os caminhos do app), SÓ na conta de teste, com a marca "hml21 e2e <rodada>" no nome; os
    ids no Estado (a chave "hml21d") NA HORA; a limpeza pelas ações (o arquivo do Storage ANTES do exercício: a policy confere que o
    exercício é de quem apaga) e, no fim, por SQL SÓ no schema staging do Treino, SÓ dos donos de teste, SÓ a marca — conferida por SQL só
    leitura, só contagem. O professor_perfil: só o MESMO valor de hoje (nada muda; o N12 da OUTRA também com o valor dela).
Sem segredo nem dado pessoal na saída: só códigos, contagens, booleanos e tempos (os nomes das contas de teste não saem).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import time

import _base as B
import painel21b as P21

C = B.C
B5, B19, B20 = B.B5, B.B19, B.B20

PERSONAL = "w5p-personal"  # P (o painel do Treino) e o não master do N10
ALUNA = B.ALUNA            # w5p-aluna: o aluno do editor (a matrícula na conta do personal)
NUTRI = P21.NUTRI          # w5p-nutri: só o uid (a matrícula da aluna é a da conta da nutri — o personal é o dono da conta)
SOZINHO = "w7b-sozinho"    # P dos Treinos prontos do app (o aluno sem profissional)
OUTRA = B.OUTRA            # w13-dono: N1 (não lê nem grava o que é do personal) e N12 (não grava o physiq_professores de outro)
PROD_PAINEL = "nutri-legado"  # produção, SÓ LEITURA: o painel (e2e/hml19/_base.py:85 · e2e/hml20/_base.py:72 · e2e/w26/prod.py:166)
PROD_ALUNO = B.PROD_CONTA      # produção, SÓ LEITURA: o app (aluno-calc)

TREINO_REF = B19.TREINO_REF
FUNCAO_TREINOS = f"{B.API_T}/functions/v1/treinos"
TREINOS_TS = B.REPO / "supabase" / "functions" / "_shared"
MOTOR_TREINO_TS = TREINOS_TS / "leitura-lote.ts"
LEITURAS_TS = TREINOS_TS / "treinos-leituras.ts"
REGRAS_TS = TREINOS_TS / "treinos-regras.ts"
MARCA = B.MARCA
PLANILHA_REDE = B.MEDICAO / "rede_hml21d.tsv"
PLANILHA_TELAS = B.MEDICAO / "telas_hml21d.tsv"
PLANILHA_GATE = B.MEDICAO / "gate_hml21d.tsv"


# ───────────────────────── a função treinos como a tela chama ─────────────────────────
def treinos(token: str | None, acao: str | None, corpo: dict | None = None, *, origem: str | None = None, schema_: str | None = None,
            sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na treinos como a tela chama (o acaoTreinos/lerTreinos de src/treino/servidor.ts: a chave anon do Treino, o Bearer do TREINO, o
    x-schema e a Origin) → (status, corpo JSON, cabeçalhos, ms). acao None = sem a chave; a ação vai por ÚLTIMO (nenhum campo troca a ação);
    schema_="" = sem o cabeçalho x-schema."""
    c = dict(corpo or {})
    if acao is not None:
        c.pop("acao", None)
        c["acao"] = acao
    cab = {"apikey": B5.anon(TREINO_REF), "Origin": origem or B.BASES["staging"]}
    x = B.schema() if schema_ is None else schema_
    if x:
        cab["x-schema"] = x
    if not sem_auth:
        cab["Authorization"] = f"Bearer {token}"
    t0 = time.time()
    st, r, h = B5.http("POST", FUNCAO_TREINOS, c, cab, timeout=timeout)
    return st, (r if isinstance(r, dict) else {}), h or {}, round((time.time() - t0) * 1000)


def ler(token: str | None, itens: list[dict] | None, *, corpo: dict | None = None, **kw) -> tuple[int, dict, dict, float]:
    """O `ler` da treinos ({ acao: "ler", itens }); itens None = sem a chave."""
    c = dict(corpo or {})
    if itens is not None:
        c["itens"] = itens
    return treinos(token, "ler", c, **kw)


item = B.item
itens_de = B.itens_de


def preflight(origem: str) -> tuple[int, dict]:
    """O OPTIONS da treinos (o CORS da porta-treino: fora da lista → o padrão https://physiqcalc.com.br)."""
    cab = {"Origin": origem, "Access-Control-Request-Method": "POST",
           "Access-Control-Request-Headers": "authorization, apikey, content-type, x-schema, x-client-info"}
    st, _r, h = B5.http("OPTIONS", FUNCAO_TREINOS, None, cab, timeout=60)
    return st, h or {}


def papel_do_token(token: str) -> str | None:
    """O app_metadata.role do token do Treino (o que o physiq_papel() do banco lê) — decodificado aqui, sem rede, nada impresso."""
    papel = ((C.claims(token) or {}).get("app_metadata") or {}).get("role")
    return papel if isinstance(papel, str) else None


# ───────────────────────── as regras do SERVIDOR, lidas do TS (sem rede) ─────────────────────────
_JS_TREINOS = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const motor = await import(pathToFileURL(process.argv[1]).href);
const cat = await import(pathToFileURL(process.argv[2]).href);
const reg = await import(pathToFileURL(process.argv[3]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const consultas = Object.fromEntries(cat.TODAS_AS_CONSULTAS.filter((q) => cat.consultaDoTreino(q)).map((q) => {
  const c = cat.consultaDoTreino(q);
  const f = c.fonte;
  return [q, { params: c.params, rpc: f.rpc ?? null, args: f.args ?? null, tabela: f.tabela ?? null, colunas: f.colunas ?? null, teto: f.teto ?? null,
    ordem: f.ordem ?? null, nulos: f.nulos ?? null, fixos: f.fixos ?? null, recorte: c.globalOuMeu ?? null, laco: f.laco ?? null,
    embutidos: (f.embutidos ?? []).map((x) => ({ nome: x.nome, tabela: x.tabela, colunas: x.colunas, embutidos: (x.embutidos ?? []).map((y) => y.nome) })) }];
}));
const consultasDoServidor = cat.CATALOGO_TREINOS.consultas;
const lerUm = (it) => (it && typeof it === "object" && !Array.isArray(it) && it.q === "exercicios_lista")
  ? cat.lerExerciciosLista(it) : motor.lerPedidoDeLeitura({ acao: "ler", itens: [it] }, consultasDoServidor).itens?.[0];
console.log(JSON.stringify({
  consultas, todas: [...cat.TODAS_AS_CONSULTAS], especiais: [...cat.CONSULTAS_ESPECIAIS], master: [...cat.NOMES_DO_MASTER],
  lote_max: motor.LOTE_MAX, modelos: [...reg.ACOES_DOS_MODELOS], biblioteca: [...reg.ACOES_DA_BIBLIOTECA], acoes_master: [...reg.ACOES_DO_MASTER],
  corpos: reg.CORPOS_DAS_ACOES, status: reg.STATUS_DO_ERRO_TREINO, url_api: reg.URL_API_TREINO, imagem_max: reg.IMAGEM_MAX_BYTES,
  tipos_imagem: reg.TIPOS_DE_IMAGEM, buckets: { public: reg.bucketDosExercicios("public"), staging: reg.bucketDosExercicios("staging") },
  colunas: cat.COLUNAS_DO_TREINO,
  pedidos: (e.pedidos ?? []).map((corpo) => {
    const p = reg.moduloDoPedido(corpo);
    if (!p) return { modulo: null };
    if (p.modulo === "leitura") {
      const forma = motor.lerPedidoDeLeitura(corpo, consultasDoServidor);
      if (forma.ok === false) return { modulo: "leitura", ok: false, erro: forma.erro };
      return { modulo: "leitura", ok: true, master: cat.pedeConsultaDoMaster(corpo), itens: corpo.itens.map(lerUm) };
    }
    if (p.acao === "treino_pronto_salvar") return { modulo: p.modulo, acao: p.acao, ...reg.lerTreinoPronto(corpo) };
    return { modulo: p.modulo, acao: p.acao, ...reg.lerCorpoDaAcao(p.acao, corpo) };
  }),
  caminhos: (e.caminhos ?? []).map(([ex, tipo]) => reg.caminhoDaFotoDoExercicio(ex, tipo)),
  urls: (e.urls ?? []).map(([url, bucket, ex, hosts]) => reg.caminhoDaUrlDaFoto(url, bucket, ex, hosts)),
  papeis: (e.papeis ?? []).map((x) => reg.ehMaster(x)),
}));
"""


def regras_treinos(pedidos: list[dict] | None = None, caminhos: list[list[str]] | None = None, urls: list[list] | None = None,
                   papeis: list[str | None] | None = None) -> dict:
    """O catálogo, as ações e as regras da treinos (do próprio TS); para cada corpo em `pedidos`, o que o servidor faz com ele (o módulo, os
    itens lidos ou a recusa — a especial exercicios_lista pelo leitor dela —; numa ação, os valores aceitos ou o campo recusado);
    `caminhos` = [exercício, tipo] → o caminhoDaFotoDoExercicio; `urls` = [url, bucket, exercício, hosts] → o caminhoDaUrlDaFoto;
    `papeis` = o app_metadata.role → o ehMaster."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_TREINOS,
                        str(MOTOR_TREINO_TS), str(LEITURAS_TS), str(REGRAS_TS)],
                       input=json.dumps({"pedidos": pedidos or [], "caminhos": caminhos or [], "urls": urls or [], "papeis": papeis or []}),
                       capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras da treinos): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# ───────────────────────── o SQL "como a pessoa" no Treino (as claims do token dela) ─────────────────────────
_ESCRITA = re.compile(r"(?i)\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|call|vacuum|refresh)\b\s")


def sql_como_treino(token_treino: str, consulta: str) -> str:
    """A consulta COMO A PESSOA no Treino: read only, o papel authenticated e as claims do PRÓPRIO token do Treino dela (o sub e o
    app_metadata.role — o physiq_papel()/physiq_is_staff() do RLS leem o papel do JWT; sem ele, a pessoa viraria "aluno")."""
    cl = C.claims(token_treino) or {}
    sub = cl.get("sub")
    if not C.eh_uuid(sub):
        raise SystemExit("o token do Treino sem o sub (uuid)")
    claims = {"sub": sub, "role": "authenticated", "aud": "authenticated", "app_metadata": {"role": papel_do_token(token_treino)}}
    return ("set transaction read only;\n"
            f"select set_config('request.jwt.claims', {C.txt(json.dumps(claims))}, true), set_config('request.jwt.claim.sub', {C.txt(sub)}, true), "
            "set_config('role', 'authenticated', true);\n" + consulta)


def ler_como_treino(token_treino: str, consulta: str) -> list[dict]:
    """A consulta como a pessoa no Treino (sql_como_treino), pela Management API, SÓ LEITURA; devolve as linhas da última instrução."""
    if _ESCRITA.search(re.sub(r"'[^']*'", "''", consulta)):
        raise SystemExit("palavra de escrita na consulta do P — recusado")
    st, r, _ = B5.http("POST", f"https://api.supabase.com/v1/projects/{TREINO_REF}/database/query", {"query": sql_como_treino(token_treino, consulta)},
                       {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=180)
    if st not in (200, 201):
        raise RuntimeError(f"SQL só leitura (como a pessoa) no Treino → HTTP {st}: {str(r)[:200]}")
    return r if isinstance(r, list) else []


def ler_treino(sql: str) -> list[dict]:
    """SQL SÓ LEITURA no Treino (read_only), como o postgres — as contagens e as conferências da massa."""
    return B19.ler_treino(sql)


def uid_treino(s: str, uid_principal: str | None) -> str | None:
    """O id do Treino de uma conta de TESTE (physiq_identidades: principal → treino) — SQL só leitura, nada impresso."""
    if not C.eh_uuid(uid_principal):
        return None
    linhas = ler_treino(f"select treino_user_id::text as id from {s}.physiq_identidades where principal_user_id = {C.txt(uid_principal)}")
    v = linhas[0].get("id") if linhas else None
    return v if C.eh_uuid(v) else None


# ───────────────────────── ⚪10 da revisão: a conta de TESTE já existe no Treino (a troca não cria conta nova) ─────────────────────────
def identidades_no_treino(s: str, conta: str) -> int:
    """Quantas identidades do Treino a conta de TESTE tem (physiq_identidades: o id do principal → o do Treino) — SQL só leitura, só
    contagem (o id do principal pelo auth.users do principal, também só leitura)."""
    uid = B.uid_da_conta(conta)
    if not C.eh_uuid(uid):
        return 0
    linhas = ler_treino(f"select count(*)::int as n from {s}.physiq_identidades where principal_user_id = {C.txt(uid)}")
    return int((linhas[0] if linhas else {}).get("n") or 0)


def exige_identidade(o, s: str, conta: str) -> None:
    """ANTES da troca de token (a do script — L.token_treino — ou a do app no navegador): a conta de TESTE já tem a identidade dela no
    Treino; sem ela, a troca criaria uma conta nova no Treino → para aqui (nada de troca, nenhum login)."""
    n = identidades_no_treino(s, conta)
    o.ok(n == 1, f"a conta de teste {conta} já existe no Treino (physiq_identidades: {n}; SQL só leitura) — a troca de token não cria conta nova",
         parar=True)


# ───────────────────────── o último pedido à treinos na BORDA (qualquer quem chama — o gate da ociosa) ─────────────────────────
SQL_BORDA = ("SELECT timestamp AS t FROM logs WHERE source = 'function_edge_logs' AND log_attributes['request.method'] = 'POST' "
             "AND extract(event_message, 'functions/v1/([a-z0-9-]+)') = 'treinos' ORDER BY t DESC LIMIT 1")


def ultimo_pedido_na_borda(janela_min: int = 40) -> tuple[float | None, str | None]:
    """O instante (epoch, s) do último POST na treinos nos logs de BORDA do Treino (a Management API, function_edge_logs — o MESMO jeito
    da medição hml21/medicao/logs_borda_* — de QUALQUER quem chama, inclusive outro processo) nos últimos `janela_min` min → (instante ou
    None se nenhum, o erro ou None). Só o instante sai (nenhum cabeçalho, corpo ou caminho)."""
    import datetime as dt  # noqa: PLC0415
    from urllib.parse import urlencode  # noqa: PLC0415
    fim = dt.datetime.now(dt.timezone.utc)
    q = urlencode({"sql": SQL_BORDA, "iso_timestamp_start": (fim - dt.timedelta(minutes=janela_min)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "iso_timestamp_end": (fim + dt.timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")})
    try:
        st, r, _h = B5.http("GET", f"https://api.supabase.com/v1/projects/{TREINO_REF}/analytics/endpoints/logs?{q}", None,
                            {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=60)
    except Exception as e:  # noqa: BLE001
        return None, type(e).__name__
    if st != 200 or not isinstance(r, dict) or r.get("error"):
        return None, f"HTTP {st}"
    linhas = r.get("result") or []
    if not linhas:
        return None, None
    return instante_da_borda(linhas[0].get("t"))


def instante_da_borda(v: object) -> tuple[float | None, str | None]:
    """O instante de uma linha dos logs da borda → epoch (s): em microssegundos (número) ou o texto ISO — que vem SEM o fuso e é UTC (o
    fromisoformat sem fuso tomaria a hora local: 3 h no futuro, e a espera da ociosa nunca acabaria — o defeito das 14:48)."""
    import datetime as dt  # noqa: PLC0415
    if isinstance(v, (int, float)):
        return v / 1e6, None
    try:
        d = dt.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except ValueError:
        return None, "instante ilegível"
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.timestamp(), None


def antes_do_gate_vale(quando_antes: str | None, inicio_depois: float, max_min: int = 30) -> tuple[bool, int | None]:
    """🟡2 da revisão: o "antes" do gate só vale se foi medido ATÉ `max_min` minutos antes do "depois" (o "quando" da planilha, horário local
    "%Y-%m-%d %H:%M") → (vale?, o intervalo em minutos — None sem o antes)."""
    if not quando_antes:
        return False, None
    try:
        t_antes = time.mktime(time.strptime(quando_antes, "%Y-%m-%d %H:%M"))
    except ValueError:
        return False, None
    intervalo = round((inicio_depois - t_antes) / 60)
    return 0 <= intervalo <= max_min, intervalo


# ───────────────────────── o SQL FIXO das libs do 7c1a637 (o P) ─────────────────────────
COLS_LINHA = ("grupo_id", "exercicio_id", "ordem", "num_series", "reps_alvo", "descanso_segundos", "carga_sugerida_kg")
COLS_EXERCICIO = ("id", "nome", "grupo_muscular", "emoji", "tipo", "imagem_url", "subgrupo", "dica", "professor_id", "padrao_movimento",
                  "equipamento", "variacao")
_LINHA, _EXERCICIO = ", ".join(COLS_LINHA), ", ".join(COLS_EXERCICIO)
_ESCOPO = "(professor_id is null or professor_id = {uid})"
_PRONTOS = (
    "select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'codigo', t.codigo, 'nome', t.nome, 'objetivo', t.objetivo, 'nivel', t.nivel, "
    "'dias_por_semana', t.dias_por_semana, 'divisao', t.divisao, 'descricao', t.descricao, 'ordem', t.ordem, 'grupos', coalesce((select "
    "jsonb_agg(jsonb_build_object('id', g.id, 'letra', g.letra, 'nome', g.nome, 'dias', g.dias, 'ordem', g.ordem, 'exercicios', coalesce((select "
    "jsonb_agg(jsonb_build_object('exercicio_id', e.exercicio_id, 'ordem', e.ordem, 'series', e.series, 'reps', e.reps, 'descanso_segundos', "
    "e.descanso_segundos, 'observacao', e.observacao, 'exercicio', (select jsonb_build_object('id', x.id, 'nome', x.nome, 'grupo_muscular', "
    "x.grupo_muscular, 'imagem_url', x.imagem_url, 'tipo', x.tipo) from {s}.tb_exercicios x where x.id = e.exercicio_id))) from "
    "{s}.physiq_treinos_prontos_exercicios e where e.grupo_id = g.id), '[]'::jsonb))) from {s}.physiq_treinos_prontos_grupos g "
    "where g.treino_id = t.id), '[]'::jsonb)) order by t.ordem), '[]'::jsonb) as v from {s}.physiq_treinos_prontos t where t.ativo")
# (a origem arquivo:linha no 7c1a637, o SQL com {s} e os params). As listas voltam como 1 jsonb (a ordem da lib); as RPCs, o valor.
SQL_DA_LIB_21D: dict[str, tuple[str, str]] = {
    "modelos": ("src/painel/treinos/api.ts:135 carregarPaginaDeModelos (7c1a637: a RPC modelos_da_lista — a página)",
                "select to_jsonb({s}.modelos_da_lista({filtros}::jsonb, {offset}::integer, {limite}::integer)) as v"),
    "linhas": ("src/painel/treinos/api.ts:75 linhasDosModelos (7c1a637: COLS_LINHA, in grupo_id, order ordem, id)",
               f"select {_LINHA}, row_number() over (order by ordem, id) as ordem_da_lib from {{s}}.tb_grupos_exercicios "
               "where grupo_id = any({ids}) order by ordem, id"),
    "vinculos_dos_modelos": ("src/painel/treinos/api.ts:81 vinculosDosModelos (7c1a637: pasta_id, grupo_id — in grupo_id, order id)",
                             "select pasta_id, grupo_id, row_number() over (order by id) as ordem_da_lib from {s}.tb_pastas_treino_grupos "
                             "where grupo_id = any({ids}) order by id"),
    "vinculos_das_pastas": ("src/painel/treinos/api.ts:78 vinculosDasPastas (7c1a637: pasta_id, grupo_id — in pasta_id, order id)",
                            "select pasta_id, grupo_id, row_number() over (order by id) as ordem_da_lib from {s}.tb_pastas_treino_grupos "
                            "where pasta_id = any({ids}) order by id"),
    "exercicios_citados": ("src/painel/treinos/api.ts:120 detalhesDosModelos (7c1a637: COLS_EXERCICIO, o doEscopo, in id, order id)",
                           f"select {_EXERCICIO}, row_number() over (order by id) as ordem_da_lib from {{s}}.tb_exercicios "
                           f"where id = any({{ids}}) and {_ESCOPO} order by id"),
    "modelo": ("src/painel/treinos/api.ts:152 carregarModeloPorId (7c1a637: o doEscopo, eq id, maybeSingle)",
               f"select id, nome, professor_id, 1 as ordem_da_lib from {{s}}.tb_grupos_treino where id = {{id}} and {_ESCOPO}"),
    "pastas": ("src/painel/treinos/api.ts:86 carregarPastas (7c1a637: id, nome, professor_id — o doEscopo, order nome, id)",
               f"select id, nome, professor_id, row_number() over (order by nome, id) as ordem_da_lib from {{s}}.tb_pastas_treino "
               f"where {_ESCOPO} order by nome, id"),
    "grupos_musculares": ("src/painel/treinos/api.ts:92 carregarMusculos (7c1a637: id, nome, professor_id — o doEscopo, order nome, id)",
                          f"select id, nome, professor_id, row_number() over (order by nome, id) as ordem_da_lib from {{s}}.grupos_musculares "
                          f"where {_ESCOPO} order by nome, id"),
    "catalogo_modelos": ("src/painel/treinos/api.ts:102 carregarCatalogo — os modelos (7c1a637: o doEscopo, order nome, id)",
                         f"select id, nome, professor_id, row_number() over (order by nome, id) as ordem_da_lib from {{s}}.tb_grupos_treino "
                         f"where {_ESCOPO} order by nome, id"),
    "busca_treinos": ("src/painel/busca/Treinos.tsx:36-41 (7c1a637: o doEscopo, ilike nome '%termo%', order nome, limit 6)",
                      f"select id, nome, professor_id, row_number() over (order by nome) as ordem_da_lib from {{s}}.tb_grupos_treino "
                      f"where {_ESCOPO} and nome ilike {{padrao}} order by nome limit 6"),
    "treinos_prontos": ("src/app-aluno/sozinho/api.ts:131 buscarTreinosProntos (7c1a637: ativo, order ordem; as divisões e os exercícios "
                        "embutidos)", _PRONTOS),
    "exercicios_lista": ("src/treino/editor/api.ts:171 exerciciosDaLista (7c1a637: a RPC exercicios_da_lista — a biblioteca e a folha)",
                         "select to_jsonb({s}.exercicios_da_lista({filtros}::jsonb, {offset}::integer, {limite}::integer)) as v"),
    "aluno_treino": ("src/treino/editor/api.ts:62 acharAlunoNoTreino (7c1a637: a RPC aluno_treino do PRINCIPAL)",
                     "select to_jsonb({s}.aluno_treino({aluno}::uuid)) as v"),
}
LISTAS_DA_LIB_21D = ("linhas", "vinculos_dos_modelos", "vinculos_das_pastas", "exercicios_citados", "modelo", "pastas", "grupos_musculares",
                     "catalogo_modelos", "busca_treinos")
_V_UUID = frozenset({"uid", "id", "aluno"})
_V_INTEIRO = frozenset({"offset", "limite"})


def _valor_sql(k: str, x: object) -> str:
    if k in _V_UUID:
        return C.txt(C.uuid_ok(str(x)))
    if k in _V_INTEIRO:
        if isinstance(x, bool) or not isinstance(x, int):
            raise SystemExit("inteiro fora do formato no SQL da lib")
        return str(int(x))
    if k == "ids":
        ids = [C.uuid_ok(str(i)) for i in (x or [])]
        return f"array[{', '.join(C.txt(i) for i in ids)}]::uuid[]" if ids else "array[]::uuid[]"
    if k == "filtros":
        if not isinstance(x, dict):
            raise SystemExit("filtros fora do formato no SQL da lib")
        for a, b in x.items():
            if not re.fullmatch(r"[a-z_]{1,20}", a) or not (isinstance(b, str) or (isinstance(b, list) and all(isinstance(i, str) for i in b))):
                raise SystemExit("filtros fora do formato no SQL da lib")
        return C.txt(json.dumps(x, ensure_ascii=False))
    if k == "padrao":
        if not isinstance(x, str) or len(x) > 210:
            raise SystemExit("termo fora do formato no SQL da lib")
        return C.txt(x)
    raise SystemExit(f"valor desconhecido no SQL da lib: {k}")


def sql_da_lib_21d(q: str, s: str, **valores) -> str:
    """O SQL FIXO da lib (SQL_DA_LIB_21D) com o schema e os valores conferidos (uuid, a lista de uuids, inteiro, os filtros das RPCs e o
    padrão do ilike — nada do corpo de ninguém)."""
    if s not in ("staging", "public"):
        raise SystemExit("schema fora do formato no SQL da lib")
    _origem, sql = SQL_DA_LIB_21D[q]
    v: dict[str, str] = {"s": s}
    for k, x in valores.items():
        v[k] = _valor_sql(k, x)
    texto = sql.format(**v)
    return B._ag.format(texto) if q in LISTAS_DA_LIB_21D else texto


def padrao_da_busca(termo: str) -> str:
    """O ilike da Busca de hoje: '%' + o termo literal (a tela já escapou \\ % _) + '%'."""
    return f"%{termo}%"


# ───────────────────────── a resposta da função na forma da lib (o P compara com o SQL) ─────────────────────────
def detalhes_da_funcao(linhas: list[dict]) -> dict[str, list]:
    """As linhas da consulta modelos_detalhes/modelo/catalogo_* na forma da lib de hoje (o detalhesDoServidor de src/painel/treinos/api.ts):
    as linhas dos modelos (COLS_LINHA, na ordem ordem + id), os exercícios citados (sem repetir, na ordem do id; o de fora do recorte é
    null e não entra) e os vínculos de pasta (pasta_id e grupo_id, na ordem do id)."""
    ls = [x for m in linhas for x in (m.get("linhas") or []) if isinstance(x, dict)]
    ls.sort(key=lambda x: (x.get("ordem") if isinstance(x.get("ordem"), int) else 0, str(x.get("id"))))
    exs: dict[str, dict] = {}
    for x in ls:
        e = x.get("exercicio")
        if isinstance(e, dict) and C.eh_uuid(e.get("id")):
            exs[e["id"]] = {k: e.get(k) for k in COLS_EXERCICIO}
    vs = [x for m in linhas for x in (m.get("vinculos") or []) if isinstance(x, dict)]
    vs.sort(key=lambda x: str(x.get("id")))
    return {"linhas": [{k: x.get(k) for k in COLS_LINHA} for x in ls], "exercicios": [exs[k] for k in sorted(exs)],
            "vinculos": [{"pasta_id": x.get("pasta_id"), "grupo_id": x.get("grupo_id")} for x in vs]}


def sem_embutidos(linhas: list[dict], *nomes: str) -> list[dict]:
    """As linhas sem os recursos embutidos (a lista de cima, como a lib lia)."""
    return [{k: v for k, v in x.items() if k not in nomes} for x in linhas if isinstance(x, dict)]


def prontos_canonicos(v: object) -> object:
    """Os treinos prontos na forma canônica (o PostgREST não ordena os embutidos — nem a lib de hoje): cada lista embutida como conjunto."""
    if not isinstance(v, list):
        return v
    saida = []
    for t in v:
        if not isinstance(t, dict):
            continue
        gs = []
        for g in t.get("grupos") or []:
            if isinstance(g, dict):
                gs.append({**g, "exercicios": B.como_conjunto(g.get("exercicios") or [])})
        saida.append({**t, "grupos": B.como_conjunto(gs)})
    return B.como_conjunto(saida)


# ───────────────────────── a área que a guarda CONTA (o que saiu do navegador na 21d) ─────────────────────────
def fora_da_area_21d(p: dict) -> str | None:
    """A chamada DIRETA de fora da área (de outra W ou de um desvio: o PowerSync, o desvio 23, a casca) — listada à parte, não é falha."""
    metodo, tipo, nome = p.get("metodo"), p.get("tipo"), p.get("nome")
    if B.direta(p, "treinos"):
        return None
    if tipo == "rpc" and metodo == "POST":
        return f"rpc:{nome}"
    if tipo == "tab" and metodo in ("GET", "HEAD"):
        return f"tab:{nome}"
    return None


def chamada_de(p: dict, funcao: str) -> str | None:
    """A chamada à função (treinos ou conta): "ler" ou o nome da ação (o campo que ela lê é o `acao`; o OPTIONS fora)."""
    if p.get("tipo") != "fn" or p.get("nome") != funcao or p.get("metodo") != "POST":
        return None
    acao = B._corpo(p).get("acao")
    return str(acao) if isinstance(acao, str) else "?"


def contar_tela(pedidos: list[dict]) -> dict:
    """O que a guarda CONTA numa tela da 21d: as diretas da área (têm de ser 0 depois — as tabelas, as RPCs e o bucket do Treino que saíram
    do navegador e a aluno_treino do principal), o `ler` da treinos (e as consultas), o `ler` da conta (o editor: aluno_treino), as ações
    das 2, as de fora da área (à parte) e as gravações ao abrir (a regra da Guarda dos E2E, com o corpo)."""
    from collections import Counter  # noqa: PLC0415
    diretas = Counter(x for x in (B.direta(p, "treinos") for p in pedidos) if x)
    da_treinos = Counter(x for x in (chamada_de(p, "treinos") for p in pedidos) if x)
    da_conta = Counter(x for x in (chamada_de(p, "conta") for p in pedidos) if x)
    consultas = Counter(q for p in pedidos if chamada_de(p, "treinos") == "ler" for q in B20.consultas_do_corpo(p.get("corpo")))
    consultas_conta = Counter(q for p in pedidos if chamada_de(p, "conta") == "ler" for q in B20.consultas_do_corpo(p.get("corpo")))
    fora = Counter(x for x in (fora_da_area_21d(p) for p in pedidos) if x)
    gravacoes = Counter(x for x in (B20.gravacao(p) for p in pedidos) if x)
    acoes = {f"treinos:{k}": v for k, v in da_treinos.items() if k != "ler"} | {f"conta:{k}": v for k, v in da_conta.items() if k != "ler"}
    return {"diretas": dict(diretas), "ler": da_treinos.get("ler", 0), "ler_conta": da_conta.get("ler", 0), "acoes": acoes,
            "consultas": dict(consultas), "consultas_conta": dict(consultas_conta), "fora": dict(fora), "gravacoes": dict(gravacoes)}


# ───────────────────────── as telas (rede.py e telas.py) ─────────────────────────
ENTRADA_PAINEL = P21.ENTRADA_PAINEL  # /painel/configuracoes/perfil — de fora da 21d e não grava ao abrir (o espelho do Treino só no salvar)
ENTRADA_APP = P21.ENTRADA_APP        # /perfil
TERMO_BUSCA = "treino"  # a Busca (Ctrl K): um termo comum nos nomes dos treinos (o resultado não importa: a rede da busca de treinos)
# (tela, como abrir, o seletor do "pronto", o teto de `ler` da treinos no depois). Como abrir: ("rota", r) pela navegação do app; ("clique", s)
# na tela de cima já aberta (o Detalhe: o 1º treino da lista; a Folha: o 1º exercício da Biblioteca); ("busca", termo) o Ctrl K; ("editor",
# None) a aba Treino do aluno de TESTE (a rota com a matrícula). A série aceita (## TEMPO treinos série, DECISÃO 12:1x): Meus treinos com 2.
# hml-21d F7: Meus treinos = 3 `ler` — os 2 em série + a contagem com GIF SOZINHA, em paralelo (perf 89d8e30, DECISÃO 15:06; FICA 15:30).
MEUS_TREINOS = ("meus_treinos", ("rota", "/painel/treinos?aba=treinos"),
                '[data-pagina-treinos-painel][data-aba-treinos="treinos"] [data-lista-modelos] [data-lista="modelos"], '
                '[data-pagina-treinos-painel][data-aba-treinos="treinos"] [data-sem-modelos]', 3)
DETALHE = ("detalhe", ("clique", '[data-lista="modelos"] [data-modelo]'), "[data-modelo-detalhe] [data-modelo-exercicios], "
           "[data-modelo-detalhe] [data-modelo-sem-exercicios]", 1)
BIBLIOTECA = ("biblioteca", ("rota", "/painel/treinos?aba=biblioteca"), "[data-biblioteca-lista-painel]", 1)
FOLHA = ("folha", ("clique", "[data-exercicio-abrir]"), "[data-folha-exercicio]", 1)
MODELOS_TREINOS = ("modelos_treinos", ("rota", "/painel/modelos?tipo=treino"), '[data-pagina-modelos][data-carregando="0"]', 1)
BUSCA = ("busca", ("busca", TERMO_BUSCA), "[data-paleta-busca] [cmdk-item], [data-paleta-busca] [cmdk-empty]", 1)
EDITOR = ("editor", ("editor", None), '[data-editor-treino]:not([data-editor-treino="carregando"])', 1)
PRONTOS = ("treinos_prontos_aluno", ("rota", "/perfil/treinos-prontos"),
           '[data-pagina-treinos-prontos="lista"] [data-lista-treinos-prontos], [data-pagina-treinos-prontos="lista"] [data-estado="vazio"]', 1)
TELAS_DO_PAINEL = (MEUS_TREINOS, DETALHE, BIBLIOTECA, FOLHA, MODELOS_TREINOS, BUSCA, EDITOR)
SELETORES = {
    "src/painel/paginas/Treinos.tsx": ["data-pagina-treinos-painel", "data-aba-treinos={aba}", "data-aba-treinos-botao={a.id}"],
    "src/painel/treinos/regras.ts": ['sp.get("aba")'],
    "src/painel/treinos/MeusTreinos.tsx": ["data-lista-modelos", 'data-lista="modelos"', "data-modelo={m.id}", "data-sem-modelos", 'params.get("treino")'],
    "src/painel/treinos/DetalheModelo.tsx": ["data-modelo-detalhe={modelo.id}", "data-modelo-exercicios", "data-modelo-sem-exercicios"],
    "src/painel/treinos/Biblioteca.tsx": ["data-biblioteca-lista-painel={itens.length}", "data-exercicio-abrir", 'params.get("b")'],
    "src/painel/treinos/FolhaExercicio.tsx": ['data-folha-exercicio={exercicio?.id ?? "novo"}'],
    "src/painel/paginas/Modelos.tsx": ["data-pagina-modelos", 'data-carregando={consulta.isLoading || !pronto ? "1" : "0"}', 'sp.get("tipo")'],
    "src/ferramentas/modelos/regras.ts": ['chave: "treino"'],
    "src/painel/busca/Treinos.tsx": ['titulo="Treinos"'],
    "src/ui/premium/Busca.tsx": ["data-busca-gatilho", "data-paleta-busca"],
    "src/treino/editor/EditorTreino.tsx": ['data-editor-treino="carregando"', 'data-editor-treino={treino?.chave ?? "vazio"}'],
    "src/painel/RotasPainel.tsx": ['path="alunos/:id"', 'path=":aba"'],
    "src/app-aluno/perfil/TreinosProntos.tsx": ['data-pagina-treinos-prontos="lista"', "data-lista-treinos-prontos={lista.length}",
                                                'titulo="Nenhum treino neste filtro"'],
    "src/ui/premium/Estados.tsx": ["data-estado={estado}", 'estado="vazio"'],
    "src/app-aluno/sozinho/pecas/GrupoDoApp.tsx": ['"/perfil/treinos-prontos"'],
}
# os arquivos das telas: nenhum chama uma AÇÃO da treinos/conta (nem a lib dela) dentro de um efeito ao abrir — o --seco confere
TELAS_SEM_GRAVAR_AO_ABRIR = ("src/painel/paginas/Treinos.tsx", "src/painel/treinos/MeusTreinos.tsx", "src/painel/treinos/DetalheModelo.tsx",
                             "src/painel/treinos/Biblioteca.tsx", "src/painel/treinos/FolhaExercicio.tsx", "src/app-aluno/perfil/TreinosProntos.tsx",
                             "src/treino/editor/EditorTreino.tsx")
GRAVACOES_DA_LIB = re.compile(r"\b(criarModelo|renomearModelo|excluirModelo|adicionarAoModelo|tirarDoModelo|ordenarModelo|prescreverModelo|"
                              r"criarPasta|renomearPasta|excluirPasta|colocarNaPasta|subirImagem|criarExercicio|salvarExercicio|"
                              r"excluirExercicio|criarMusculo|excluirMusculo|acaoTreinos|aplicarTreino|usarTreinoPronto)\s*\(")
ROTA_DA_SPEC = {"meus_treinos": "/painel/treinos", "editor": "/painel/alunos/:id/treino", "modelos_treinos": "/painel/modelos"}


def gravacoes_em_efeitos(fonte: str) -> list[str]:
    """As gravações chamadas DENTRO de um useEffect (o corpo do efeito até o fechamento dele, contando as chaves)."""
    achados = []
    for m in re.finditer(r"useEffect\(\s*\(\)\s*=>\s*\{", fonte):
        nivel, i = 1, m.end()
        while i < len(fonte) and nivel:
            nivel += {"{": 1, "}": -1}.get(fonte[i], 0)
            i += 1
        achados += [g.group(1) for g in GRAVACOES_DA_LIB.finditer(fonte[m.end():i])]
    return achados


def efeitos_que_gravam(arquivo: str) -> list[str]:
    """As gravações num useEffect de um arquivo de tela — o --seco exige nenhuma nas telas da área (abrir não grava)."""
    return gravacoes_em_efeitos((B.REPO / arquivo).read_text(encoding="utf-8"))


def contas_da_area(base: str) -> list[str]:
    """As contas (a produção, decisão N: a nutri-legado no painel e a aluno-calc no app — NUNCA as do staging)."""
    return [PROD_PAINEL, PROD_ALUNO] if base == "prod" else [PERSONAL, SOZINHO]


def eh_do_app(conta: str) -> bool:
    return conta in (SOZINHO, PROD_ALUNO)


def telas_da_conta(conta: str, base: str) -> list[tuple]:
    """As telas de cada conta, NA ORDEM (o Detalhe logo depois de Meus treinos; a Folha logo depois da Biblioteca — os 2 pelo clique na tela
    de cima): o painel do personal (a produção sem o editor: não há aluno de TESTE da conta lá) e os Treinos prontos do aluno."""
    if eh_do_app(conta):
        return [PRONTOS]
    return [x for x in TELAS_DO_PAINEL if not (base == "prod" and x[0] == "editor")]


def painel_tem_treino(s: str, conta: str) -> tuple[bool, str]:
    """A conta ativa (a 1ª da minha_situacao, como o app escolhe — SQL só leitura como a pessoa) tem o módulo treino e o papel personal?
    Sem eles o painel não mostra o Treino (decisão N: sem personal de teste na produção → a área PULA com o motivo)."""
    uid = B.uid_da_conta(conta)
    if not uid:
        return False, "a conta não existe nesta base"
    c = P21.conta_ativa(P21.situacao_como(s, uid, conta))
    if c is None:
        return False, "sem conta ativa"
    if "treino" not in c["modulos"] or "personal" not in c["papeis"]:
        return False, f"a conta ativa sem o Treino (módulos {c['modulos']}, papéis {c['papeis']})"
    return True, "a conta ativa com o módulo treino e o papel personal"


def aluno_sem_profissional(s: str, conta: str) -> tuple[bool, str]:
    """O aluno NÃO tem profissional (nenhuma matrícula viva)? (decisão N: a aluno-calc só abre os Treinos prontos assim — senão PULA)."""
    uid = B.uid_da_conta(conta)
    if not uid:
        return False, "a conta não existe nesta base"
    n = int((B.ler_principal(f"select count(*)::int as n from {s}.pacientes where user_id = {C.txt(C.uuid_ok(uid))} and deleted_at is null")
             or [{}])[0].get("n") or 0)
    return (n == 0, "sem matrícula viva (o app sem profissional)" if n == 0 else f"{n} matrícula(s) viva(s) — tem profissional")


def matricula_do_aluno(s: str) -> str | None:
    """A matrícula VIVA da aluna de TESTE na conta do personal de TESTE (o personal_id = ele, senão a da nutri da conta — ele é o dono) —
    SQL só leitura, só o id (a rota do editor: /painel/alunos/<id>/treino)."""
    uid_a, uid_p = B.uid_da_conta(ALUNA), B.uid_da_conta(PERSONAL)
    if not (uid_a and uid_p):
        return None
    linhas = B.ler_principal(f"select p.id::text as id from {s}.pacientes p where p.user_id = {C.txt(C.uuid_ok(uid_a))} and p.deleted_at is null "
                             f"and p.personal_id = {C.txt(C.uuid_ok(uid_p))} order by p.created_at limit 1")
    v = (linhas[0] if linhas else {}).get("id")
    if C.eh_uuid(v):
        return v
    uid_n = B.uid_da_conta(NUTRI)
    return P21.matricula_da_aluna(s, uid_a, uid_n) if uid_n else None


def telas_que_abrem(o, s: str, base: str, conta: str) -> list[tuple]:
    """As telas da conta que abrem (decisão N): na produção, o painel só com o Treino na conta ativa e o app só sem profissional; o editor
    só com a matrícula de TESTE. SQL só leitura; sem a pré-condição, PULADA com o motivo (nada aberto)."""
    telas = telas_da_conta(conta, base)
    if base != "prod":
        exige_identidade(o, s, conta)  # ⚪10: a troca que o app faz no navegador não cria conta nova no Treino
    if base == "prod":
        abre, motivo = aluno_sem_profissional(s, conta) if eh_do_app(conta) else painel_tem_treino(s, conta)
        if not abre:
            o.ok(True, f"[{base}] {conta}: {'os Treinos prontos' if eh_do_app(conta) else 'a área Treino do painel'} PULADA — {motivo} "
                       "(SQL só leitura; nada aberto)")
            return []
        o.linha(f"   [{base}] {conta}: abre ({motivo})")
    if any(x[0] == "editor" for x in telas) and not matricula_do_aluno(s):
        o.ok(True, f"[{base}] {conta}: o editor PULADO — sem a matrícula de TESTE da aluna na conta (SQL só leitura)")
        telas = [x for x in telas if x[0] != "editor"]
    return telas


def abrir_tela(t, pend, tela: tuple, s: str | None = None) -> dict:
    """Abre a tela como a pessoa: a rota pela navegação do app; o clique na tela de cima (o 1º item); a Busca pelo gatilho com o termo; o
    editor pela rota da aba Treino do aluno de TESTE — e espera o "pronto" (a regra da hml-20) com o seletor da tela."""
    _nome, (como, alvo), marca, _teto = tela
    P21.fechar_janelas(t)
    if como == "rota":
        B.navegar(t, alvo)
    elif como == "editor":
        pac = matricula_do_aluno(s or B.schema())
        if not pac:
            raise SystemExit("o editor sem a matrícula de TESTE")
        B.navegar(t, f"/painel/alunos/{pac}/treino")
    elif como == "clique":
        t.zerar_pedidos()
        t.esperar(lambda: t.n(alvo) > 0, 30)
        t.clicar(alvo)
    else:
        t.zerar_pedidos()
        t.clicar("[data-busca-gatilho]")
        t.esperar(lambda: t.n("[data-paleta-busca]") > 0, 10)
        t.pg.locator("[data-paleta-busca] input").first.fill(alvo)
    return B.esperar_pronto(t, pend, marca=marca)


def fase_do_codigo_21d(base: str, commit: str) -> str:
    """depois = o commit medido lê o Treino pela treinos (a lib src/painel/treinos/api.ts chama o lerTreinos); antes = lê direto — o código
    antigo e, desde o F7, o HEAD da 21d (o gate de latência reprovou as leituras pela treinos: o desvio; as gravações seguem pela treinos e o
    src/treino/servidor.ts com o lerTreinos fica, é do F3a). No local, a árvore da worktree. Um commit que este repo não tem (a branch de
    outra W no staging) é ANTES (o mesmo critério da 21a/21b)."""
    if base == "local":
        arq = B.REPO / "src" / "painel" / "treinos" / "api.ts"
        return "depois" if arq.exists() and "lerTreinos(" in arq.read_text(encoding="utf-8") else "antes"
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:src/painel/treinos/api.ts"], capture_output=True, text=True, timeout=20)
    return "depois" if r.returncode == 0 and "lerTreinos(" in r.stdout else "antes"


def conferir_tela(o, base: str, fase: str, conta: str, tela: str, teto: int, cont: dict, pronta: dict) -> None:
    """A guarda de cada tela: 0 gravação ao abrir (sempre); antes — a leitura do Treino ia direto (as telas que liam); depois — 0 chamada
    direta da área, o `ler` da treinos ≤ o teto (a série aceita: a linha SÉRIE com os instantes), nenhuma ação ao abrir."""
    grav, acoes = cont["gravacoes"], cont["acoes"]
    diretas = sum(cont["diretas"].values())
    o.ok(not grav, f"[{base}] {conta} · {tela}: 0 gravação ao abrir ({grav or '—'})")
    if fase == "antes":
        if tela in ANTES_DIRETO:
            o.ok(diretas >= 1, f"[antes] {conta} · {tela}: a leitura do Treino ia direto do navegador ({cont['diretas']})")
        return
    o.ok(diretas == 0, f"[depois] {conta} · {tela}: 0 chamada direta da área treinos ({cont['diretas'] or '—'})")
    o.ok(cont["ler"] <= teto, f"[depois] {conta} · {tela}: {cont['ler']} `ler` da treinos (≤ {teto}; consultas {cont['consultas'] or '—'}; "
         f"`ler` da conta {cont['ler_conta']} {cont['consultas_conta'] or ''}) — t_pronto {pronta['t_pronto_s']} s")
    if cont["ler"] > 1:
        instantes = [(p.get("t"), ",".join(B20.consultas_do_corpo(p.get("corpo")))) for p in pronta["pedidos"] if chamada_de(p, "treinos") == "ler"]
        o.linha(f"SÉRIE {tela}: {cont['ler']} `ler` na mesma tela — os instantes (s desde a navegação) e as consultas: {instantes} (a série aceita: "
                "## TEMPO treinos série, DECISÃO 12:1x)")
    if acoes:
        o.ok(False, f"[depois] {conta} · {tela}: nenhuma ação ao abrir ({acoes})")
    if cont["fora"]:
        o.linha(f"   [{base}] {conta} · {tela}: à parte — de fora da área {cont['fora']}")


# as telas onde o ANTES (o 7c1a637) SEMPRE lê direto do Treino na 1ª abertura: a linha de base confere
ANTES_DIRETO = frozenset({"meus_treinos", "biblioteca", "modelos_treinos", "busca", "treinos_prontos_aluno", "editor"})
CAB_REDE = ["quando", "base", "commit", "fase", "conta", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "ler_conta", "acoes", "fora",
            "gravacoes", "pedidos", "t_pronto_s"]


def anotar_rede(base: str, commit: str, fase: str, conta: str, tela: str, cont: dict, pronta: dict) -> None:
    j = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA_REDE, CAB_REDE, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, tela, sum(cont["diretas"].values()), j(cont["diretas"]), cont["ler"],
        j(cont["consultas"]), cont["ler_conta"], j(cont["acoes"]), j(cont["fora"]), j(cont["gravacoes"]), len(pronta["pedidos"]), pronta["t_pronto_s"],
    ])


def abrir_conta(nav, base: str, conta: str, nome: str, guarda=None):
    """O contexto da conta (o painel 1280 × 883 ou o celular 390 × 844), como o da 21b: na produção a Guarda e sem a marca local de aviso
    visto; o LegalDesligado da 21a."""
    t = B.Tela(nav, B.BASES[base], f"hml21d_{base}", nome, desktop=not eh_do_app(conta), guarda=guarda)
    if base == "prod":
        t.ctx.add_init_script(B.JS_SEM_AVISO_VISTO)
    B.LegalDesligado().instalar(t.ctx)
    return t, B.Pendentes(t.pg)


def entrar(o, t, pend, L, base: str, conta: str) -> None:
    """A sessão antes do 1º documento (reaproveitada) e a ENTRADA de fora da 21d (a carga fria fica fora da medida)."""
    app = eh_do_app(conta)
    t.entrar(L, conta, ENTRADA_APP if app else ENTRADA_PAINEL)
    marca = "[data-aba-perfil]" if app else "[data-casca]"
    o.ok(t.esperar(lambda: t.n(marca) > 0, 60), f"[{base}] {conta}: o {'app' if app else 'painel'} abriu na entrada ({marca})", parar=True)
    B.esperar_pronto(t, pend, max_s=40)


sair_da_conta = P21.sair_da_conta
fechar_janelas = P21.fechar_janelas


def antes_da_spec(conta: str) -> dict[str, float | None]:
    """O "antes" da spec da hml-21 (hml21/medicao/rede_por_tela.tsv): o t_pronto por rota da conta (aquecido, "spa")."""
    return P21.antes_da_spec(conta)


# ───────────────────────── a massa (decisão I) ─────────────────────────
# (tabela, a coluna da marca) — NA ORDEM do DELETE (o modelo leva as linhas e os vínculos em cascata; a pasta, os vínculos; o exercício, as
# linhas que o citam; o grupo muscular não tem FK)
MASSA = (("tb_grupos_treino", "nome"), ("tb_pastas_treino", "nome"), ("tb_exercicios", "nome"), ("grupos_musculares", "nome"))
TABELAS_DA_MASSA = frozenset(t for t, _m in MASSA)
ACAO_DE_APAGAR = {"tb_grupos_treino": "modelo_excluir", "tb_pastas_treino": "pasta_excluir", "tb_exercicios": "exercicio_excluir",
                  "grupos_musculares": "grupo_muscular_excluir"}
BUCKETS_DA_MASSA = ("exercicios-staging",)
_RE_DELETE_21D = re.compile(
    r"(?is)\s*delete from staging\.(tb_grupos_treino|tb_pastas_treino|tb_exercicios|grupos_musculares) where "
    r"professor_id = any\(array\['[0-9a-f-]{36}'(?:, '[0-9a-f-]{36}')*\]::uuid\[\]\) and nome like '%hml21 e2e%';\s*")


def marca(rodada: str) -> str:
    return f"{MARCA} {rodada}"


def _massa(estado) -> dict:
    m = estado.d.get(B.CHAVE_21D)
    if not isinstance(m, dict):
        m = {"donos": [], "linhas": [], "storage": []}
        estado.d[B.CHAVE_21D] = m
    for k in ("donos", "linhas", "storage"):
        m.setdefault(k, [])
    return m


def anotar_dono(estado, dono: object) -> None:
    """O dono de teste (o id do TREINO) ANTES da 1ª ação que cria: uma rodada que cai depois do insert e antes do id ainda limpa pela marca."""
    m = _massa(estado)
    if C.eh_uuid(dono) and dono not in m["donos"]:
        m["donos"].append(dono)
        estado.salvar()


def anotar_linha(estado, tabela: str, id_: object, dono: object) -> None:
    """Uma linha DE TESTE que a rodada criou (na hora): o --limpar desfaz mesmo se a rodada cair."""
    m = _massa(estado)
    if tabela in TABELAS_DA_MASSA and C.eh_uuid(id_) and C.eh_uuid(dono):
        if dono not in m["donos"]:
            m["donos"].append(dono)
        if [tabela, id_, dono] not in m["linhas"]:
            m["linhas"].append([tabela, id_, dono])
        estado.salvar()


def anotar_objeto(estado, bucket: str, caminho: str) -> None:
    """O arquivo DE TESTE no Storage do Treino (anotado logo depois do preparar — antes do PUT: se cair no meio, o --limpar tenta)."""
    m = _massa(estado)
    if bucket in BUCKETS_DA_MASSA and re.fullmatch(r"[0-9a-f-]{36}\.(gif|webp|png|jpg)", caminho or "") and [bucket, caminho] not in m["storage"]:
        m["storage"].append([bucket, caminho])
        estado.salvar()


def sql_apagar_massa_21d(s: str, tabela: str, donos: list[str]) -> str:
    """O DELETE da massa de uma tabela do Treino: SÓ staging, SÓ os donos de teste anotados, SÓ a marca da hml-21."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    if tabela not in TABELAS_DA_MASSA:
        raise SystemExit("tabela fora da massa da 21d")
    validos = [d for d in donos if C.eh_uuid(d)]
    if not validos:
        raise SystemExit("nenhum dono de teste anotado")
    return (f"delete from {s}.{tabela} where professor_id = any(array[{', '.join(C.txt(d) for d in validos)}]::uuid[]) "
            f"and nome like {C.txt('%' + MARCA + '%')};")


def sql_contar_massa_21d(s: str, donos: list[str] | None = None) -> str:
    """Só contagem (SQL só leitura, Treino): as linhas com a marca da hml-21 em cada tabela da massa — dos donos, se vierem."""
    partes = []
    for t, m in MASSA:
        filtro = f" and professor_id = any(array[{', '.join(C.txt(C.uuid_ok(x)) for x in donos)}]::uuid[])" if donos else ""
        partes.append(f"(select count(*) from {s}.{t} where {m} like {C.txt('%' + MARCA + '%')}{filtro})::int as {t}")
    return "select " + ", ".join(partes)


def sql_contar_objetos(bucket: str, caminhos: list[str]) -> str:
    """Só contagem (SQL só leitura, Treino): quantos destes arquivos de teste existem no bucket."""
    validos = [c for c in caminhos if re.fullmatch(r"[0-9a-f-]{36}\.(gif|webp|png|jpg)", c or "")]
    if bucket not in BUCKETS_DA_MASSA or not validos:
        raise SystemExit("objeto fora da massa da 21d")
    return (f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(bucket)} "
            f"and name = any(array[{', '.join(C.txt(c) for c in validos)}]::text[])")


def sql_escrever_treino_staging(sql: str) -> None:
    """A escrita da limpeza SÓ no schema staging do TREINO (decisão I): o sqlrw.py com PERMITIR_ESCRITA=1 e o --confirmo, pelo com_pat.py
    — só o DELETE da massa (os donos de teste, a marca), 1 instrução; o resto é recusado antes de sair."""
    if re.search(r"\bpublic\.", sql) or sql.count(";") != 1 or not _RE_DELETE_21D.fullmatch(sql):
        raise SystemExit("escrita fora do combinado (só o DELETE da massa da 21d: staging do Treino, donos de teste, a marca) — recusado")
    env = dict(os.environ, PERMITIR_ESCRITA="1")
    r = subprocess.run(["python3", str(B.COM_PAT), "python3", str(B.SQLRW), TREINO_REF, "--confirmo"], input=sql, capture_output=True,
                       text=True, env=env, timeout=180)
    if r.returncode != 0 or "status 20" not in r.stdout:
        raise RuntimeError(f"sqlrw (Treino staging): {(r.stdout + r.stderr).strip()[:200]}")


def limpar_massa_21d(o, estado, s: str, tok: str | None) -> None:
    """Desfaz a massa da 21d (no fim da rodada ou no --limpar): (1) os arquivos de teste do Storage, como o personal (a policy do bucket
    confere que o exercício é dele — antes de apagar o exercício); (2) as linhas anotadas pelas AÇÕES da treinos (o modelo, a pasta, o
    exercício, o grupo; nao_encontrado = já saiu); (3) o que ainda tem a marca dos donos de teste, por SQL (SÓ staging, SÓ a marca) —
    conferido por SQL só leitura, só contagem. Só no staging."""
    m = estado.d.get(B.CHAVE_21D)
    if not isinstance(m, dict):
        return
    s = estado.d.get("schema") or s  # o schema GRAVADO no Estado (onde a rodada rodou) — o ⚪8 da 21b
    if s != "staging":
        if any(m.get(k) for k in ("linhas", "storage")):
            o.ok(False, f"limpeza (21d): massa anotada num Estado de schema {s} (a massa só nasce no staging) — nada apagado; confira à mão", parar=False)
            return
        estado.d.pop(B.CHAVE_21D, None)
        estado.salvar()
        return
    objetos = [x for x in m.get("storage") or [] if isinstance(x, list) and len(x) == 2]
    if objetos and tok:
        for bucket, caminho in objetos:
            if int((ler_treino(sql_contar_objetos(bucket, [caminho])) or [{}])[0].get("n") or 0):
                B19.remover_do_storage_treino(bucket, [caminho], tok)
    sobra_obj = sum(int((ler_treino(sql_contar_objetos(b, [c])) or [{}])[0].get("n") or 0) for b, c in objetos)
    if tok:
        for tabela, id_, _dono in sorted(m.get("linhas") or [], key=lambda x: [t for t, _m in MASSA].index(x[0]) if x[0] in TABELAS_DA_MASSA else 9):
            if tabela in ACAO_DE_APAGAR and C.eh_uuid(id_):
                treinos(tok, ACAO_DE_APAGAR[tabela], {"id": id_})
    donos = [d for d in m.get("donos") or [] if C.eh_uuid(d)]
    if donos:
        antes = ler_treino(sql_contar_massa_21d(s, donos))[0]
        for t, _m in MASSA:
            if int(antes.get(t) or 0):
                sql_escrever_treino_staging(sql_apagar_massa_21d(s, t, donos))
    sobra = ler_treino(sql_contar_massa_21d(s))[0]
    total = sum(int(v or 0) for v in sobra.values())
    if o.ok(total == 0 and sobra_obj == 0, f"limpeza (21d) conferida (SQL só leitura, Treino): {len(m.get('linhas') or [])} linha(s) e "
            f"{len(objetos)} arquivo(s) da massa; 0 linha com a marca da hml-21 nas 4 tabelas do Treino ({sobra}); arquivos de teste no "
            f"Storage: {sobra_obj}", parar=False):
        estado.d.pop(B.CHAVE_21D, None)
        estado.salvar()


def abrir_rodada_21d(o, s: str):
    """A rodada da 21d: a mesma regra da 21a/21b (recusa se há outra pendente, de qualquer W) com a área "hml21d"."""
    B.usar_area("treinos")
    estado = B.abrir_rodada(o, s)
    _massa(estado)
    estado.salvar()
    return estado


def fechar_rodada_21d(o, estado, s: str, tok: str | None) -> None:
    """O fim da rodada da 21d (no finally — o SIGTERM vira SystemExit e passa aqui): a massa; o Estado só some com tudo desfeito (senão
    fica para o api.py --area treinos --limpar)."""
    try:
        limpar_massa_21d(o, estado, s, tok)
    finally:
        if estado.vazio() and not B.tem_massa_21d(estado) and not B.tem_massa_21b(estado) and not estado.d.get("hml21_foto") \
                and not estado.d.get("hml21_push"):
            estado.apagar()
        else:
            o.ok(False, "o Estado ficou com pendência (a massa da 21d): rode o api.py --area treinos --limpar", parar=False)


# ───────────────────────── os corpos da massa (puros: o --seco confere todos no leitor do servidor) ─────────────────────────
def corpo_exercicio(rodada: str, grupo: str) -> dict:
    """O exercício de teste como a Folha manda (DadosExercicio: o emoji e o dono nascem no servidor)."""
    return {"nome": marca(rodada), "grupo_muscular": grupo, "tipo": "musculacao", "subgrupo": None, "dica": marca(rodada), "padrao_movimento": None,
            "equipamento": None, "variacao": None}


def url_publica(bucket: str, caminho: str, instante_ms: int) -> str:
    """A URL pública da foto como a tela grava (o getPublicUrl do VITE_SUPABASE_URL — o domínio próprio — + o ?v=<instante>)."""
    return f"{B.API_T}/storage/v1/object/public/{bucket}/{caminho}?v={instante_ms}"

