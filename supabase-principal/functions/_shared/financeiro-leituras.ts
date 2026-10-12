// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4, 12/10/2026) — o CATÁLOGO das leituras da função financeiro (ação `ler`), PURO: sem
// Deno, sem rede e sem banco. O motor (_shared/leitura-lote.ts, o MESMO da nutricao — nada mudou nele) lê o pedido por este catálogo e o
// módulo functions/financeiro/leituras.ts roda cada consulta COMO A PESSOA (o RLS e as RPCs de hoje decidem quem vê). Cada entrada declara
// os params (tipo e teto; o resto do corpo cai), a fonte (a RPC de leitura de hoje com os args montados no servidor, ou a tabela com as
// colunas em lista fechada, os filtros, a ordem e o teto) e o dono (consulta "minha": a coluna = quem chama, nunca um id do corpo).
// As MESMAS leituras que as libs faziam no navegador no ed0d72e (src/painel/financeiro/dados.ts, src/financeiro/{lancamentos,recibos,api}.ts),
// com as mesmas linhas:
//   · "minha" só onde a lib filtrava pelo id de quem está logado: as categorias, os modelos de recibo, o último nº e o nome do
//     profissional (o recorte das cobranças também usa o user do token, no .or() da conta ativa);
//   · o aluno e a conta vêm do corpo e o RLS/a RPC decide (outra conta → lista vazia / o código da RPC, como hoje — decisão 6);
//   · as RPCs (hml-14b/14d, W6) devolvem o que já devolvem; os códigos { ok: false, erro } das 3 da conta (sem_login, sem_acesso,
//     conta_inexistente, periodo_invalido) voltam como o erro do item (FonteRpc.erros — o módulo confere o valor e o raise);
//   · o último nº do recibo conta os da Lixeira (o número não volta): SEM o filtro das vivas, como a lib;
//   · as cobranças do Resumo/Dashboard: o recorte da conta ativa (o RecorteLeitura "conta" do motor) + o .or() do "em aberto OU vence
//     no mês" (COBRANCAS_EM_ABERTO_OU_NO_MES, montado no módulo com as 2 datas do corpo, já validadas) e as leituras de 1000 até 20 —
//     o laço que a lib fazia no navegador, agora NO SERVIDOR, num item só; passou de 20 → muitas_linhas (a lib diz a frase de hoje).
// Sem Storage (as leituras do Financeiro não assinam URL). O que este catálogo repete do da nutricao (as constantes de página e o INT4)
// fica repetido nesta W (o da nutricao não pode mudar: a nutricao publicada é a da main).
import type { ConsultaLeitura, EmbutidoLeitura } from "./leitura-lote.ts";

/** O teto de linhas de uma lista (o max_rows do PostgREST: acima, ele cortava calado a leitura direta). */
export const TETO_LISTA = 1000;
/** As páginas da tela (POR_PAGINA, src/lib/paginacao.ts): 20 por página. */
export const POR_PAGINA_LEITURA = 20;
/** O maior inteiro do Postgres (os p_offset das RPCs são integer). */
export const INT4_MAX = 2_147_483_647;
/** As RPCs paginadas do Financeiro cortam o limite em 100 (financeiro_lancamentos, financeiro_recibos: least(…, 100)); 0 = só o total. */
export const LIMITE_RPC_MAX = 100;
/** O teto de um texto de filtro (a busca de Lançamentos/Recibos e os filtros da URL: a tela corta antes de mandar). */
export const TEXTO_FILTRO_MAX = 500;
/** O período opcional do financeiro_recibos (o "Recibos no mês" do Dashboard): AAAA-MM-DD (a RPC ignora a data inválida, como hoje). */
export const DATA_TEXTO_MAX = 10;
/** As cobranças do Resumo: leituras de 1000 (o max_rows) com a ordem estável, até 20 (a lib de hoje: listarCobrancasDoResumo). */
export const COBRANCAS_POR_LEITURA = 1000;
export const MAX_LEITURAS_COBRANCAS = 20;
/** Os códigos que as 3 RPCs da conta devolvem de propósito ({ ok: false, erro }) — a tela tem a frase de cada um (ERROS_RPC). */
export const ERROS_DAS_RPCS_DO_FINANCEIRO = ["sem_login", "sem_acesso", "conta_inexistente", "periodo_invalido"] as const;
/** As situações "em aberto" das cobranças do Resumo (o "a receber"). */
export const STATUS_EM_ABERTO = ["aberta", "aguardando_confirmacao"] as const;

/** As colunas de cada leitura de tabela = as que a lib/o tipo usam hoje (nenhum "*"). */
export const COLUNAS_DO_FINANCEIRO = {
  /** CategoriaFinanceira (dados.ts); o lerCategorias do Financeiro do aluno usa só id e nome */
  categorias_financeiras: ["id", "nome", "nutricionista_id"],
  /** ModeloRecibo (dados.ts) */
  modelos_recibo: ["id", "nutricionista_id", "titulo", "conteudo", "favorito"],
  /** o último nº (ultimoNumeroRecibo) */
  ultimo_recibo: ["numero"],
  /** o nome do profissional (nomeDoProfissional) */
  profiles: ["nome"],
  /** CobrancaResumo (dados.ts), sem o paciente embutido */
  cobrancas: [
    "id", "paciente_id", "nutricionista_id", "tipo", "descricao", "valor", "vencimento", "status", "forma", "pago_em", "transacao_id", "reembolsado_em",
    "enviado_em", "created_at",
  ],
  /** Lancamento (lancamentos.ts), sem a categoria embutida */
  transacoes_do_aluno: [
    "id", "nutricionista_id", "paciente_id", "tipo", "descricao", "valor", "data", "metodo", "observacao", "estornada", "recibo_id", "categoria_id",
    "created_at",
  ],
  /** Recibo (recibos.ts) */
  recibos_do_aluno: ["id", "nutricionista_id", "paciente_id", "transacao_id", "modelo_id", "numero", "valor", "data", "descricao", "texto", "created_at"],
} as const;

/** O .or() do "em aberto (qualquer data) OU vence no mês (qualquer situação)" das cobranças do Resumo — as 2 datas do corpo, validadas. */
export interface OuEmAbertoOuNoPeriodo {
  status: { coluna: string; valores: readonly string[] };
  periodo: { coluna: string; de: string; ate: string };
}
/** A consulta do Financeiro: a do motor + o .or() do "em aberto OU no período" (só as cobranças do Resumo declaram). */
export interface ConsultaFinanceiro extends ConsultaLeitura {
  emAbertoOuNoPeriodo?: OuEmAbertoOuNoPeriodo;
}

const COBRANCAS_EM_ABERTO_OU_NO_MES: OuEmAbertoOuNoPeriodo = {
  status: { coluna: "status", valores: STATUS_EM_ABERTO },
  periodo: { coluna: "vencimento", de: "de", ate: "ate" },
};

/**
 * O filtro do .or() montado com os params já lidos (as 2 datas no formato AAAA-MM-DD — o tipo "data" do motor: nada do PostgREST passa
 * por elas); sem uma das 2, null (a consulta não roda sem elas: as 2 são obrigatórias). É o MESMO texto que a lib montava.
 */
export function filtroEmAbertoOuNoPeriodo(o: OuEmAbertoOuNoPeriodo, params: Record<string, unknown>): string | null {
  const de = params[o.periodo.de];
  const ate = params[o.periodo.ate];
  if (typeof de !== "string" || typeof ate !== "string") return null;
  return `${o.status.coluna}.in.(${o.status.valores.join(",")}),and(${o.periodo.coluna}.gte.${de},${o.periodo.coluna}.lte.${ate})`;
}

const aluno = { tipo: "uuid", obrigatorio: true } as const;
const conta = { tipo: "uuid", obrigatorio: true } as const;
const dataObrigatoria = { tipo: "data", obrigatorio: true } as const;
const pagina = { tipo: "inteiro", min: 1, max: INT4_MAX, obrigatorio: true } as const;
const offset = { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true } as const;
const limite = { tipo: "inteiro", min: 0, max: LIMITE_RPC_MAX, obrigatorio: true } as const;
const textoDoFiltro = { tipo: "texto", max: TEXTO_FILTRO_MAX } as const;
/**
 * Os filtros dos Lançamentos (e o { resumo: true } do Resumo/Dashboard): as chaves que a tela manda (filtrosParaBanco) — em texto, como
 * hoje (a RPC ignora o tipo/método desconhecido e a categoria vazia: o valor estranho da URL segue "sem filtro", não vira erro).
 */
const filtrosDosLancamentos = {
  tipo: "objeto",
  campos: { tipo: textoDoFiltro, categoria: textoDoFiltro, metodo: textoDoFiltro, q: textoDoFiltro, resumo: { tipo: "booleano" } },
} as const;
/** Os filtros dos Recibos: a busca (q) e o período opcional do "Recibos no mês" (de/ate — a RPC ignora a data inválida, como hoje). */
const filtrosDosRecibos = {
  tipo: "objeto",
  campos: { q: textoDoFiltro, de: { tipo: "texto", max: DATA_TEXTO_MAX }, ate: { tipo: "texto", max: DATA_TEXTO_MAX } },
} as const;
const desc = (coluna: string) => ({ coluna, asc: false }) as const;
const asc = (coluna: string) => ({ coluna, asc: true }) as const;
const PACIENTE_NOME: EmbutidoLeitura = { nome: "paciente", tabela: "pacientes", colunas: ["nome"] };
const CATEGORIA_NOME: EmbutidoLeitura = { nome: "categoria", tabela: "categorias_financeiras", colunas: ["nome"] };
const RECORTE_DA_CONTA = { modelo: "conta", param: "conta" } as const;

export const CONSULTAS_FINANCEIRO = {
  // ───── as comuns do Painel › Financeiro (todas as abas) e do Financeiro do aluno — "minhas" (o dono = quem chama) ─────
  // as categorias (listarCategorias e o lerCategorias do Financeiro do aluno): as vivas, pelo nome (a tela reordena — "Outros" no fim)
  fin_categorias: {
    params: {},
    fonte: { tabela: "categorias_financeiras", colunas: COLUNAS_DO_FINANCEIRO.categorias_financeiras, teto: TETO_LISTA, vivas: true, ordem: [asc("nome")] },
    dono: "nutricionista_id",
  },
  // os modelos de recibo (listarModelosRecibo): os vivos, sem ordem (a tela ordena: o favorito primeiro, depois o título)
  fin_modelos_recibo: {
    params: {},
    fonte: { tabela: "modelos_recibo", colunas: COLUNAS_DO_FINANCEIRO.modelos_recibo, teto: TETO_LISTA, vivas: true },
    dono: "nutricionista_id",
  },
  // o maior nº já emitido (ultimoNumeroRecibo): SEM o filtro das vivas — os da Lixeira contam, o número não volta; 0 linha → a tela usa 0
  fin_ultimo_recibo: {
    params: {},
    fonte: { tabela: "recibos", colunas: COLUNAS_DO_FINANCEIRO.ultimo_recibo, teto: 1, ordem: [desc("numero")] },
    dono: "nutricionista_id",
  },
  // o nome do profissional que assina o recibo (nomeDoProfissional): o profiles de quem chama (id = o user do token)
  fin_profissional: {
    params: {},
    fonte: { tabela: "profiles", colunas: COLUNAS_DO_FINANCEIRO.profiles, teto: 1 },
    dono: "id",
  },

  // ───── as RPCs da conta (hml-14b): o Resumo, os Lançamentos, os Recibos e o Dashboard — a conta do corpo, a RPC decide ─────
  // os totais do período com os filtros da lista OU o { resumo: true } do Resumo/Dashboard (+ o recebido por dia)
  fin_resumo_periodo: {
    params: { conta, de: dataObrigatoria, ate: dataObrigatoria, filtros: filtrosDosLancamentos },
    fonte: { rpc: "financeiro_resumo_periodo", args: { p_conta: "conta", p_de: "de", p_ate: "ate", p_filtros: "filtros" }, erros: ERROS_DAS_RPCS_DO_FINANCEIRO },
  },
  // a página dos Lançamentos (e as 6 recentes do Resumo)
  fin_lancamentos: {
    params: { conta, de: dataObrigatoria, ate: dataObrigatoria, filtros: filtrosDosLancamentos, offset, limite },
    fonte: {
      rpc: "financeiro_lancamentos", args: { p_conta: "conta", p_de: "de", p_ate: "ate", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" },
      erros: ERROS_DAS_RPCS_DO_FINANCEIRO,
    },
  },
  // a página dos Recibos (com a busca) e o "Recibos no mês" do Dashboard (o período, limite 0: só o total)
  fin_recibos: {
    params: { conta, filtros: filtrosDosRecibos, offset, limite },
    fonte: { rpc: "financeiro_recibos", args: { p_conta: "conta", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" }, erros: ERROS_DAS_RPCS_DO_FINANCEIRO },
  },
  // as cobranças do Resumo/Dashboard: o recorte da conta ativa (a conta do corpo OU sem conta e minhas — o user do TOKEN) + o "em aberto
  // OU vence no mês", as vivas, com o nome do aluno, pela ordem do id — TODAS, em leituras de 1000 até 20 no servidor (1 item)
  fin_cobrancas_resumo: {
    params: { conta, de: dataObrigatoria, ate: dataObrigatoria },
    fonte: {
      tabela: "cobrancas", colunas: COLUNAS_DO_FINANCEIRO.cobrancas, embutidos: [PACIENTE_NOME], teto: COBRANCAS_POR_LEITURA, vivas: true,
      recorte: RECORTE_DA_CONTA, ordem: [asc("id")], laco: { tamanho: COBRANCAS_POR_LEITURA, leituras: MAX_LEITURAS_COBRANCAS },
    },
    emAbertoOuNoPeriodo: COBRANCAS_EM_ABERTO_OU_NO_MES,
  },

  // ───── o Financeiro do aluno (Painel › Aluno › Financeiro) — o aluno do corpo, o RLS decide ─────
  // a página (20) dos lançamentos do aluno com o total, a data mais recente primeiro (desempate: criado por último, id), com a categoria
  fin_transacoes_do_aluno: {
    params: { aluno, pagina },
    fonte: {
      tabela: "transacoes", colunas: COLUNAS_DO_FINANCEIRO.transacoes_do_aluno, embutidos: [CATEGORIA_NOME], teto: POR_PAGINA_LEITURA,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], vivas: true, ordem: [desc("data"), desc("created_at"), desc("id")],
      pagina: { param: "pagina", tamanho: POR_PAGINA_LEITURA }, contar: true,
    },
  },
  // a página (20) dos recibos do aluno com o total, o número mais alto primeiro (desempate pelo id)
  fin_recibos_do_aluno: {
    params: { aluno, pagina },
    fonte: {
      tabela: "recibos", colunas: COLUNAS_DO_FINANCEIRO.recibos_do_aluno, teto: POR_PAGINA_LEITURA, filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }],
      vivas: true, ordem: [desc("numero"), asc("id")], pagina: { param: "pagina", tamanho: POR_PAGINA_LEITURA }, contar: true,
    },
  },
  // os totais dos lançamentos do aluno (hml-14d: "Recebido" e "Gasto com o aluno" somados no banco — INVOKER: o RLS decide)
  fin_totais_do_aluno: {
    params: { aluno },
    fonte: { rpc: "financeiro_totais_do_aluno", args: { p_aluno: "aluno" } },
  },

  // ───── o app do aluno: o resumo leve da cobrança (a faixa do Início, a trava do inadimplente, o Perfil › Pagamentos) ─────
  // financeiro_do_aluno(): o aluno não manda id nenhum (a RPC usa o auth.uid() lá dentro)
  fin_do_aluno: {
    params: {},
    fonte: { rpc: "financeiro_do_aluno" },
  },
} as const satisfies Record<string, ConsultaFinanceiro>;

export type ConsultaDoFinanceiro = keyof typeof CONSULTAS_FINANCEIRO;
export const CONSULTAS_DO_FINANCEIRO = Object.keys(CONSULTAS_FINANCEIRO) as ConsultaDoFinanceiro[];

/** A consulta, se está no catálogo; senão null. */
export function consultaDoFinanceiro(q: unknown): ConsultaFinanceiro | null {
  return typeof q === "string" && Object.prototype.hasOwnProperty.call(CONSULTAS_FINANCEIRO, q) ? CONSULTAS_FINANCEIRO[q as ConsultaDoFinanceiro] : null;
}

