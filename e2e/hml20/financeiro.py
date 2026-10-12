"""Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4, 12/10/2026) — o que os E2E da hml-20 sabem do FINANCEIRO (`--area financeiro` do api.py,
do rede.py e do telas.py): as contas, as telas (as 6 abas, o Financeiro do aluno, a parte do Financeiro do Dashboard e o gate do app do
aluno), a área que a guarda CONTA (as tabelas e as RPCs que saíram do navegador), o que fica "fora da área" (de OUTRA W — lido direto,
listado à parte, não é falha), o SQL só leitura "como a pessoa" do P de cada consulta (o SQL FIXO do que a lib do ed0d72e lia, com a origem
arquivo:linha — nunca montado do catálogo do servidor: a lição 🟡3 da revisão da 20b) e a massa da rodada.

A massa (decisão J do contrato da 20d): para o P ter ao menos 1 linha em cada lista, a rodada cria PELOS CAMINHOS QUE JÁ EXISTEM — as ações
da financeiro, como a w5p-personal: 1 movimentação da w5p-aluna (transacao_criar), 1 recibo dela emitido dessa movimentação
(recibo_emitir — o número do recibo da conta de teste sobe e não volta: é o staging), 1 categoria (categoria_criar) e 1 modelo de recibo
(modelo_recibo_criar), SÓ no schema staging, SÓ nas contas de teste, com a marca "hml20 e2e <rodada>"; cobrança nenhuma (o P das cobranças
compara a função com a lib no que a conta de teste já tem — vazio também vale). Os ids vão ao Estado (hml19/agente/e2e_estado.json, com o
dono) e saem no fim (ou no --limpar): o DELETE das linhas da rodada (staging, só os ids, por dono — o sql_apagar_linhas_fin da hml-19d) e a
conferência por SQL só leitura, só contagem (0 linha com a marca da rodada nas 4 tabelas). Sem Storage (decisão H: as leituras do Financeiro
não assinam URL — o N8 não se aplica).
Sem segredo nem dado pessoal na saída: só status, códigos, contagens e tempos.
"""
from __future__ import annotations

import json
import subprocess
from collections import Counter

import _base as B
import dieta as D  # a guarda da 20c (a saúde do Dashboard) e, por ela, a da casca do aluno (20b) — o que já saiu não volta

C = B.C

# ───────────────────────── as contas (staging, só de TESTE) ─────────────────────────
PERSONAL = B.PERSONAL_CONTA  # w5p-personal: a dona da conta da w5p-aluna (P: as 6 abas, o Financeiro da aluna, o Dashboard; a massa)
ALUNA = B.A_CONTA            # w5p-aluna: o gate do app (o Início e o Perfil › Pagamentos; o fin_do_aluno só com as dela)
OUTRA = B.N1_CONTA           # w13-dono: o profissional de OUTRA conta (N1)
AREA_ESTADO = "financeiro20d"  # a área no Estado (o --limpar desta W só desfaz a rodada dela)
LEITURAS_FIN_TS = B.REPO / "supabase-principal" / "functions" / "_shared" / "financeiro-leituras.ts"
FIN_MODULO_TS = B.REPO / "supabase-principal" / "functions" / "financeiro" / "leituras.ts"

# ───────────────────────── as consultas da 20d (o conjunto do contrato, decisão B) ─────────────────────────
CONSULTAS_20D = (
    "fin_categorias", "fin_modelos_recibo", "fin_ultimo_recibo", "fin_profissional", "fin_resumo_periodo", "fin_lancamentos", "fin_recibos",
    "fin_cobrancas_resumo", "fin_transacoes_do_aluno", "fin_recibos_do_aluno", "fin_totais_do_aluno", "fin_do_aluno",
)
# "minhas" (o dono = quem chama — a lib filtrava pelo id de quem está logado)
MINHAS = ("fin_categorias", "fin_modelos_recibo", "fin_ultimo_recibo", "fin_profissional")
# sem param obrigatório (o --so-leitura não as chama: sem param, elas vão ao banco)
SEM_PARAM_OBRIGATORIO = ("fin_categorias", "fin_modelos_recibo", "fin_ultimo_recibo", "fin_profissional", "fin_do_aluno")
COM_PARAM_OBRIGATORIO = tuple(q for q in CONSULTAS_20D if q not in SEM_PARAM_OBRIGATORIO)
# os 4 códigos que as 3 RPCs da conta devolvem de propósito ({ ok: false, erro } → o erro do item)
ERROS_DAS_RPCS = ("sem_login", "sem_acesso", "conta_inexistente", "periodo_invalido")

# ───────────────────────── a área que a guarda CONTA (o que saiu do navegador) ─────────────────────────
TABELAS_DA_AREA = {"categorias_financeiras", "modelos_recibo", "recibos", "profiles", "cobrancas", "transacoes"}
RPCS_DA_AREA = {"financeiro_resumo_periodo", "financeiro_lancamentos", "financeiro_recibos", "financeiro_totais_do_aluno", "financeiro_do_aluno"}
# as telas do painel: o Financeiro do aluno passa pela casca do aluno (20b) e o Dashboard lê a saúde da 20c — o que elas levaram ao servidor
# também NÃO pode voltar a ser lido direto aqui (a guarda da dieta já soma a da casca)
TABELAS_DA_GUARDA = TABELAS_DA_AREA | D.TABELAS_DA_GUARDA
RPCS_DA_GUARDA = RPCS_DA_AREA | D.RPCS_DA_GUARDA
BUCKETS_DA_GUARDA = set(D.BUCKETS_DA_GUARDA)
# o app do aluno: só o gate (a RPC do resumo leve); o resto do app é da 20a (rede.py --area aluno — o desvio 23 lá)
TABELAS_DO_APP = TABELAS_DA_AREA - {"profiles"}
# FORA DA ÁREA (de outra W, lido direto, listado à parte — não é falha): o H-43 — a equipe das telas do Financeiro (equipe_da_conta), o
# Dashboard (alunos, agenda), a casca do aluno (o acesso, os compromissos, o responsável, os dados livres, as mensagens desligadas) e o app
# do aluno (o perfil, a agenda e os avisos)
FORA_RPCS = {"equipe_da_conta", "alunos_da_conta", "alunos_novos_por_mes", "aluno_compromissos", "aluno_responsavel", "aluno_acesso",
             "paciente_dado_livre", "mensagens_desligadas", "meu_perfil_aluno", "minha_agenda", "minha_agenda_lista"}
FORA_TABELAS = {"pacientes", "agendamentos", "agenda_tags", "avisos", "conta_membros"}
# as gravações que já existem ao abrir (não são desta W): as sementes do 1º acesso do Financeiro (hml-19d: só com a lista vazia) e da
# nutricao (hml-19a/19b) e o aluno_acesso da casca do aluno (H-43). E a leitura dos planos da aba Planos (W-P, já pelo servidor:
# pagamentos-aluno › prof_planos — o prof_plano_salvar/_ativo é que gravam): a regra da Guarda dos E2E (e2e/hml17/_base.py
# LEITURAS_PAGAMENTOS, ponto de encontro com a LINUX 3) não a tem entre as leituras da pagamentos-aluno e a conta como gravação — listada à
# parte aqui (etapa 2 da 20d, a rede do antes no staging); a Guarda não muda nesta W
GRAVACOES_ACEITAS = {"fn:financeiro(padroes_garantir)", "fn:nutricao(padroes_garantir)", "rpc:aluno_acesso", "fn:pagamentos-aluno(prof_planos)"}

B.AREAS["financeiro"] = {"tabelas": TABELAS_DA_GUARDA, "rpcs": RPCS_DA_GUARDA, "buckets": BUCKETS_DA_GUARDA, "desvio": set()}
B.AREAS["financeiro-app"] = {"tabelas": TABELAS_DO_APP, "rpcs": RPCS_DA_AREA, "buckets": set(), "desvio": set()}


def fora_da_area(p: dict) -> str | None:
    """A leitura direta de OUTRA W (H-43: a equipe, o Dashboard, a casca do aluno, o app) — listada à parte."""
    metodo, tipo, nome = p.get("metodo"), p.get("tipo"), p.get("nome")
    if tipo == "rpc" and metodo == "POST" and nome in FORA_RPCS:
        return f"rpc:{nome}"
    if tipo == "tab" and metodo in ("GET", "HEAD") and nome in FORA_TABELAS:
        return f"tab:{nome}"
    return None


def gravacao_nomeada(p: dict) -> str | None:
    """A gravação de um pedido com o NOME da ação (fn:<função>(<ação do corpo>)) — o padroes_garantir da financeiro e da nutricao à parte."""
    g = B.gravacao(p)
    if not g or not g.startswith("fn:"):
        return g
    try:
        acao = (json.loads(p.get("corpo") or "{}") or {}).get("acao")
    except Exception:  # noqa: BLE001
        acao = None
    return f"fn:{p.get('nome')}({acao or p.get('acao') or '?'})"


def contar_financeiro(pedidos: list[dict], area: str = "financeiro") -> dict:
    """A guarda da área (o contar_tela da 20a, com as tabelas/RPCs da 20d — e as da 20b/20c nas telas do painel) + o `ler` da financeiro e as
    consultas dele (o contar_tela só lista as da nutricao: ficam em consultas_nutricao), as de fora da área e as gravações que já existem
    (os garantir e o aluno_acesso) separadas das novas (que têm de ser 0 ao abrir)."""
    c = B.contar_tela(pedidos, area)
    c["consultas_nutricao"] = c.pop("consultas")
    c["consultas"] = dict(Counter(q for p in pedidos if B.leitura_pela_funcao(p) == "fn:financeiro(ler)" for q in B.consultas_do_corpo(p.get("corpo"))))
    fora: dict[str, int] = {}
    aceitas: dict[str, int] = {}
    novas: dict[str, int] = {}
    for p in pedidos:
        f = fora_da_area(p)
        if f:
            fora[f] = fora.get(f, 0) + 1
        g = gravacao_nomeada(p)
        if g:
            alvo = aceitas if g in GRAVACOES_ACEITAS else novas
            alvo[g] = alvo.get(g, 0) + 1
    c["fora"] = fora
    c["gravacoes_aceitas"] = aceitas
    c["gravacoes_novas"] = novas
    return c


# ───────────────────────── as telas ─────────────────────────
# (nome, rota (com {pac} = a matrícula), a marca de que a tela abriu, (mín, máx) de chamadas `ler` da financeiro ao abrir — HIPÓTESE da
# etapa 1, a etapa 2 mede e ajusta com o porquê). A personal entra pela lista de alunos (fora da área) e abre: o Dashboard (sem cache; a parte
# do Financeiro: o resumo do mês, as cobranças e o "Recibos no mês" num lote), as 6 abas do Financeiro pela navegação do app (a 1ª, o
# Resumo, paga as comuns — o nome, as categorias, os modelos e o último nº — no MESMO lote dela; as outras abas reaproveitam o cache das
# comuns: Mensalidades e Planos leem pela pagamentos-aluno e Categorias só o cache → 0 ou 1 `ler`) e o Financeiro da aluna (as 2 páginas, os
# totais e as categorias num lote; a casca do aluno pela nutricao — a 20b). A aluna (celular) abre o Início (o gate lê 1,5 s depois) e o
# Perfil (o chip de Pagamentos, 200 ms depois) — o resumo guardado no aparelho é apagado antes de cada tela para a leitura acontecer.
ENTRADA = D.ENTRADA
DASHBOARD = ("dashboard_personal", "/painel", "[data-pagina-dashboard][data-modulos] [data-kpi-receita]", (1, 1))
ABAS = (
    ("financeiro_resumo", "/painel/financeiro?aba=resumo", '[data-aba-financeiro-conteudo="resumo"] [data-kpis-financeiro]', (1, 1)),
    ("financeiro_mensalidades", "/painel/financeiro?aba=mensalidades", '[data-aba-financeiro-conteudo="mensalidades"]', (0, 1)),
    ("financeiro_planos", "/painel/financeiro?aba=planos", '[data-aba-financeiro-conteudo="planos"]', (0, 1)),
    ("financeiro_lancamentos", "/painel/financeiro?aba=lancamentos", '[data-aba-financeiro-conteudo="lancamentos"]', (1, 1)),
    ("financeiro_recibos", "/painel/financeiro?aba=recibos", '[data-aba-financeiro-conteudo="recibos"]', (1, 1)),
    ("financeiro_categorias", "/painel/financeiro?aba=categorias", '[data-aba-financeiro-conteudo="categorias"]', (0, 1)),
)
ALUNO = ("financeiro_aluno", "/painel/alunos/{pac}/financeiro", "[data-cartao-lancamentos] [data-totais-aluno]", (1, 1))
APP = (
    ("aluno_inicio", "/", "[data-aba-inicio]", (1, 1)),
    ("aluno_pagamentos", "/perfil", '[data-aba-perfil="completo"]', (1, 1)),
)
CHAVE_RESUMO_APP = "physiq_financeiro_resumo"  # o resumo leve guardado no aparelho (src/financeiro/api.ts) — apagado antes de cada tela do app
# os prints da §5 (d_*): as 6 abas, o Financeiro do aluno, o Dashboard da personal, o Perfil › Pagamentos da aluna e o erro
PRINTS_D = [f"d_{t[0]}" for t in ABAS] + ["d_financeiro_aluno", "d_dashboard_personal", "d_aluno_pagamentos", "d_financeiro_erro"]
# os seletores que as telas usam (o --seco confere no código)
SELETORES = {
    "src/painel/financeiro/Resumo.tsx": ['data-aba-financeiro-conteudo="resumo"', "data-kpis-financeiro"],
    "src/painel/financeiro/Mensalidades.tsx": ['data-aba-financeiro-conteudo="mensalidades"'],
    "src/painel/financeiro/Planos.tsx": ['data-aba-financeiro-conteudo="planos"'],
    "src/painel/financeiro/Lancamentos.tsx": ['data-aba-financeiro-conteudo="lancamentos"'],
    "src/painel/financeiro/Recibos.tsx": ['data-aba-financeiro-conteudo="recibos"'],
    "src/painel/financeiro/Categorias.tsx": ['data-aba-financeiro-conteudo="categorias"'],
    "src/financeiro/ui/FinanceiroDoAluno.tsx": ["data-cartao-lancamentos", "data-totais-aluno"],
    "src/painel/paginas/Dashboard.tsx": ["data-pagina-dashboard", "data-modulos="],
    "src/painel/dashboard/Blocos.tsx": ["data-kpi-receita"],
    "src/app-aluno/abas/Inicio.tsx": ["data-aba-inicio"],
    "src/app-aluno/abas/Perfil.tsx": ["data-aba-perfil", "data-perfil-pagamentos-chip"],
    "src/financeiro/api.ts": [CHAVE_RESUMO_APP],
}


def telas_da_personal() -> list[tuple[str, str, str, tuple[int, int]]]:
    """As telas da personal, NA ORDEM (depois da ENTRADA): o Dashboard, as 6 abas e o Financeiro da aluna."""
    return [DASHBOARD, *ABAS, ALUNO]


def rota(tela_rota: str, pac: str) -> str:
    return tela_rota.replace("{pac}", pac)


# ───────────────────────── o catálogo e o motor, do próprio TS (node, sem rede) ─────────────────────────
_JS_FIN = r"""
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const motor = await import(pathToFileURL(process.argv[1]).href);
const cat = await import(pathToFileURL(process.argv[2]).href);
const e = JSON.parse(readFileSync(0, "utf8"));
const consultas = Object.fromEntries(cat.CONSULTAS_DO_FINANCEIRO.map((q) => {
  const c = cat.CONSULTAS_FINANCEIRO[q];
  const f = c.fonte;
  return [q, { params: c.params, rpc: f.rpc ?? null, args: f.args ?? null, erros: f.erros ? [...f.erros] : null, tabela: f.tabela ?? null,
    colunas: f.colunas ?? null, embutidos: f.embutidos ?? null, teto: f.teto ?? null, filtros: f.filtros ?? null, vivas: f.vivas ?? false,
    ordem: f.ordem ?? null, dono: c.dono ?? null, recorte: f.recorte ?? null, pagina: f.pagina ?? null, contar: f.contar ?? false, laco: f.laco ?? null,
    emAbertoOuNoPeriodo: c.emAbertoOuNoPeriodo ?? null, assinar: c.assinar ?? null, sozinha: c.sozinha ?? false }];
}));
console.log(JSON.stringify({
  consultas, lote_max: motor.LOTE_MAX, paralelo: motor.LOTE_PARALELO, erro_laco: motor.ERRO_MUITAS_LINHAS,
  limites: { por_pagina: cat.POR_PAGINA_LEITURA, limite_rpc: cat.LIMITE_RPC_MAX, texto: cat.TEXTO_FILTRO_MAX, cobrancas: cat.COBRANCAS_POR_LEITURA,
    leituras: cat.MAX_LEITURAS_COBRANCAS },
  ou: cat.filtroEmAbertoOuNoPeriodo(cat.CONSULTAS_FINANCEIRO.fin_cobrancas_resumo.emAbertoOuNoPeriodo, { de: "2026-10-01", ate: "2026-10-31" }),
  pedidos: (e.pedidos ?? []).map((corpo) => {
    const r = motor.lerPedidoDeLeitura(corpo, cat.CONSULTAS_FINANCEIRO);
    return r.ok === false ? { ok: false, erro: r.erro } : { ok: true, itens: r.itens };
  }),
}));
"""


def regras_leitura_fin(pedidos: list[dict] | None = None) -> dict:
    """O catálogo da `ler` da financeiro e o motor (do próprio TS); para cada corpo em `pedidos`, o que o lerPedidoDeLeitura do servidor faz."""
    r = subprocess.run(["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", _JS_FIN, str(B.MOTOR_TS), str(LEITURAS_FIN_TS)],
                       input=json.dumps({"pedidos": pedidos or []}), capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"node (regras da leitura do financeiro): {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


# ───────────────────────── a função como a tela chama ─────────────────────────
def ler(token: str | None, itens: list[dict] | None, *, corpo: dict | None = None, origem: str | None = None, schema_: str | None = None,
        sem_auth: bool = False, timeout: int = 60) -> tuple[int, dict, dict, float]:
    """POST na financeiro com a ação `ler` (o lote: { acao: "ler", itens }) → (status, corpo JSON, cabeçalhos, ms). itens None = sem a chave;
    `corpo` = chaves a mais no corpo (o que o servidor tem de ignorar)."""
    c = dict(corpo or {})
    if itens is not None:
        c["itens"] = itens
    return B.B19.funcao_fin(token, "ler", c, origem=origem, schema_=schema_, sem_auth=sem_auth, timeout=timeout)


# ───────────────────────── o SQL FIXO da lib do ed0d72e (o P) — rodado COMO A PESSOA ─────────────────────────
# Cada entrada: (a origem arquivo:linha no ed0d72e, o SQL com {s} e os params). As listas voltam como 1 jsonb (a ordem da lib dentro do
# jsonb_agg); as RPCs, o valor; os totais, o count com os MESMOS filtros da página. Os embutidos de hoje (paciente:pacientes(nome),
# categoria:categorias_financeiras(nome)) viram o subselect com o RLS de quem lê (como o PostgREST).
COLUNAS_COBRANCA = ("id", "paciente_id", "nutricionista_id", "tipo", "descricao", "valor", "vencimento", "status", "forma", "pago_em", "transacao_id",
                    "reembolsado_em", "enviado_em", "created_at")
COLUNAS_TRANSACAO = ("id", "nutricionista_id", "paciente_id", "tipo", "descricao", "valor", "data", "metodo", "observacao", "estornada", "recibo_id",
                     "categoria_id", "created_at")
COLUNAS_RECIBO = ("id", "nutricionista_id", "paciente_id", "transacao_id", "modelo_id", "numero", "valor", "data", "descricao", "texto", "created_at")
_ag = "select coalesce(jsonb_agg(to_jsonb(x) order by x.ordem_da_lib), '[]'::jsonb) as v from ({}) x"
SQL_DA_LIB: dict[str, tuple[str, str]] = {
    "fin_categorias": ("src/painel/financeiro/dados.ts:176 listarCategorias",
                       "select id, nome, nutricionista_id, row_number() over (order by nome) as ordem_da_lib from {s}.categorias_financeiras "
                       "where nutricionista_id = {uid} and deleted_at is null"),
    "fin_modelos_recibo": ("src/painel/financeiro/dados.ts:269 listarModelosRecibo (sem ordem: a tela ordena)",
                           "select id, nutricionista_id, titulo, conteudo, favorito, row_number() over (order by id) as ordem_da_lib from {s}.modelos_recibo "
                           "where nutricionista_id = {uid} and deleted_at is null"),
    "fin_ultimo_recibo": ("src/painel/financeiro/dados.ts:263 ultimoNumeroRecibo (sem o filtro das vivas)",
                          "select numero, 1 as ordem_da_lib from {s}.recibos where nutricionista_id = {uid} order by numero desc limit 1"),
    "fin_profissional": ("src/painel/financeiro/dados.ts:352 nomeDoProfissional", "select nome, 1 as ordem_da_lib from {s}.profiles where id = {uid}"),
    "fin_cobrancas_resumo": ("src/painel/financeiro/dados.ts:387-390 listarCobrancasDoResumo",
                             "select " + ", ".join(f"c.{c}" for c in COLUNAS_COBRANCA)
                             + ", (select jsonb_build_object('nome', p.nome) from {s}.pacientes p where p.id = c.paciente_id) as paciente, "
                             "row_number() over (order by c.id) as ordem_da_lib from {s}.cobrancas c "
                             "where (c.conta_id = {conta} or (c.conta_id is null and c.nutricionista_id = {uid})) "
                             "and (c.status in ('aberta', 'aguardando_confirmacao') or (c.vencimento >= {de} and c.vencimento <= {ate})) and c.deleted_at is null"),
    "fin_transacoes_do_aluno": ("src/financeiro/lancamentos.ts:72-75 paginaLancamentosDoAluno (a 1ª página de 20)",
                                "select " + ", ".join(f"t.{c}" for c in COLUNAS_TRANSACAO)
                                + ", (select jsonb_build_object('nome', k.nome) from {s}.categorias_financeiras k where k.id = t.categoria_id) as categoria, "
                                "row_number() over (order by t.data desc, t.created_at desc, t.id desc) as ordem_da_lib from {s}.transacoes t "
                                "where t.paciente_id = {pac} and t.deleted_at is null order by t.data desc, t.created_at desc, t.id desc limit 20"),
    "fin_transacoes_do_aluno:total": ("src/financeiro/lancamentos.ts:72-75 (o count exato)",
                                      "select count(*)::int as v from {s}.transacoes t where t.paciente_id = {pac} and t.deleted_at is null"),
    "fin_recibos_do_aluno": ("src/financeiro/recibos.ts:176-178 paginaRecibosDoAluno (a 1ª página de 20)",
                             "select " + ", ".join(COLUNAS_RECIBO) + ", row_number() over (order by numero desc, id asc) as ordem_da_lib from {s}.recibos "
                             "where paciente_id = {pac} and deleted_at is null order by numero desc, id asc limit 20"),
    "fin_recibos_do_aluno:total": ("src/financeiro/recibos.ts:176-178 (o count exato)",
                                   "select count(*)::int as v from {s}.recibos where paciente_id = {pac} and deleted_at is null"),
    # as RPCs com os args DA LIB (dados.ts:96/:129/:136/:249/:257, api.ts:67/:148)
    "fin_resumo_periodo:resumo": ("src/painel/financeiro/dados.ts:136 resumoDoPeriodo",
                                  "select to_jsonb({s}.financeiro_resumo_periodo({conta}::uuid, {de}::date, {ate}::date, '{{\"resumo\": true}}'::jsonb)) as v"),
    "fin_resumo_periodo:lista": ("src/painel/financeiro/dados.ts:129 totaisDoPeriodo (sem filtro)",
                                 "select to_jsonb({s}.financeiro_resumo_periodo({conta}::uuid, {de}::date, {ate}::date, '{{}}'::jsonb)) as v"),
    "fin_lancamentos": ("src/painel/financeiro/dados.ts:96 listarLancamentos (a 1ª página de 20, sem filtro)",
                        "select to_jsonb({s}.financeiro_lancamentos({conta}::uuid, {de}::date, {ate}::date, '{{}}'::jsonb, 0, 20)) as v"),
    "fin_recibos": ("src/painel/financeiro/dados.ts:249 listarRecibos (a 1ª página de 20, sem busca)",
                    "select to_jsonb({s}.financeiro_recibos({conta}::uuid, '{{}}'::jsonb, 0, 20)) as v"),
    "fin_recibos:contar": ("src/painel/financeiro/dados.ts:257 contarRecibos (o período, limite 0)",
                           "select to_jsonb({s}.financeiro_recibos({conta}::uuid, jsonb_build_object('de', {de}::text, 'ate', {ate}::text), 0, 0)) as v"),
    "fin_totais_do_aluno": ("src/financeiro/api.ts:67 buscarTotaisDoAluno", "select to_jsonb({s}.financeiro_totais_do_aluno({pac}::uuid)) as v"),
    "fin_do_aluno": ("src/financeiro/api.ts:148 buscarResumo (como a ALUNA)", "select to_jsonb({s}.financeiro_do_aluno()) as v"),
}
# as listas: o SQL vira 1 jsonb (a ordem da lib); as outras entradas já devolvem o v
LISTAS_DA_LIB = ("fin_categorias", "fin_modelos_recibo", "fin_ultimo_recibo", "fin_profissional", "fin_cobrancas_resumo", "fin_transacoes_do_aluno",
                 "fin_recibos_do_aluno")


def sql_da_lib(chave: str, s: str, **valores) -> str:
    """O SQL FIXO da lib (a chave do SQL_DA_LIB) com o schema e os valores (uuid e data conferidos; nada do corpo de ninguém)."""
    _origem, sql = SQL_DA_LIB[chave]
    v: dict[str, str] = {"s": s}
    for k, x in valores.items():
        if k in ("uid", "pac", "conta"):
            v[k] = C.txt(C.uuid_ok(str(x)))
        elif k in ("de", "ate"):
            if not (isinstance(x, str) and len(x) == 10 and x[4] == "-" and x[7] == "-" and x.replace("-", "").isdigit()):
                raise SystemExit(f"data fora do formato no SQL da lib: {k}")
            v[k] = C.txt(x)
    texto = sql.format(**v)
    return _ag.format(texto) if chave in LISTAS_DA_LIB else texto


def sem_ordem(linhas: list[dict]) -> list[dict]:
    """A linha da lib sem a coluna auxiliar da ordem (a função não a tem)."""
    return [{k: x for k, x in l.items() if k != "ordem_da_lib"} for l in linhas]


# ───────────────────────── a massa (pelas ações da financeiro, como a personal) ─────────────────────────
COLUNAS_MARCA = {"transacoes": "descricao", "recibos": "descricao", "categorias_financeiras": "nome", "modelos_recibo": "titulo"}


def marca(rodada: str) -> str:
    return f"{B.MARCA} {rodada}"


def corpos_da_massa(rodada: str, pac: str, conta: str, hoje: str) -> list[tuple[str, dict]]:
    """Os corpos das 4 ações da massa (o recibo nasce da movimentação: o transacao_id entra na hora)."""
    m = marca(rodada)
    return [
        ("transacao_criar", {"conta_id": conta, "tipo": "entrada", "descricao": f"{m} movimentação", "valor": 123.45, "data": hoje, "categoria_id": None,
                             "metodo": "pix", "paciente_id": pac, "observacao": None}),
        ("recibo_emitir", {"conta_id": conta, "paciente_id": pac, "transacao_id": None, "modelo_id": None, "valor": 123.45, "data": hoje,
                           "descricao": f"{m} recibo", "texto": f"Recibo nº {B.B19.MARCA_NUMERO_RECIBO} — {m}"}),
        ("categoria_criar", {"conta_id": conta, "nome": f"{m} cat"[:60]}),
        ("modelo_recibo_criar", {"conta_id": conta, "titulo": f"{m} modelo", "conteudo": "Recibo de *|NOME_PACIENTE|*", "favorito": False}),
    ]


def criar_massa(o, estado, token: str, dono: str, pac: str, conta: str, rodada: str, hoje: str) -> dict:
    """As 4 linhas da massa pelas ações da financeiro (como a personal); os ids (com o dono) vão ao Estado na hora."""
    criados: dict[str, str] = {}
    tabela_da_acao = {"transacao_criar": "transacoes", "recibo_emitir": "recibos", "categoria_criar": "categorias_financeiras",
                      "modelo_recibo_criar": "modelos_recibo"}
    for acao, corpo in corpos_da_massa(rodada, pac, conta, hoje):
        if acao == "recibo_emitir":
            corpo = {**corpo, "transacao_id": criados.get("transacoes")}
        st, r, _h, _ms = B.B19.funcao_fin(token, acao, corpo)
        id_ = (r.get("linha") or {}).get("id")
        if C.eh_uuid(id_):
            criados[tabela_da_acao[acao]] = id_
            estado.linha_fin(tabela_da_acao[acao], id_, dono)
        o.ok(st == 200 and C.eh_uuid(id_), f"massa: {acao} pela função, como a personal ({st} {r.get('erro') or ''})")
    return criados


def sql_contar_marca(s: str, rodada: str) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da rodada em cada tabela da massa (vivas e na Lixeira)."""
    m = C.txt("%" + marca(rodada).replace(" ", "%") + "%")
    return "select " + ", ".join(f"(select count(*) from {s}.{t} where {c} like {m})::int as {t}" for t, c in sorted(COLUNAS_MARCA.items()))


def limpar_massa(o, estado, s: str) -> None:
    """Desfaz a massa da rodada e confere por SQL só leitura (só contagem): o DELETE das linhas da rodada (staging, só os ids, por dono — o
    sql_apagar_linhas_fin da hml-19d, na ordem das FKs) e a conferência (0 linha com a marca da rodada nas 4 tabelas)."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    if (estado.d.get("area") or "") != AREA_ESTADO:
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    for sql in B.B19.sql_apagar_linhas_fin(s, estado.d.get("fin") or []):
        C.C2.sql_principal(sql)
    estado.d["fin"] = []
    estado.salvar()
    rodada = estado.d.get("rodada")
    sobra = B.ler_principal(sql_contar_marca(s, rodada))[0] if rodada else {}
    o.ok(bool(rodada) and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada nas 4 tabelas do Financeiro ({sobra})")
    estado.apagar()
