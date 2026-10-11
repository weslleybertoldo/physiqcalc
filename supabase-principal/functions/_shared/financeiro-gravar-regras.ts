// Physiq hml-19d (H-41 · jeito 2, 11/10/2026) — regras PURAS da função financeiro (banco principal): as GRAVAÇÕES do Financeiro (Painel ›
// Financeiro e o Financeiro do aluno) saem do navegador. Sem Deno e sem rede: usadas pela função (supabase-principal/functions/financeiro/)
// e testadas no Vitest (src/financeiro/financeiroGravar.test.ts). O nome evita o _shared/financeiro-regras.ts (da cobrança, LINUX 3).
//
// O desenho (spec hml-19 §2.1 e §2.5, o mesmo da nutricao): a tela chama UMA ação; a função grava com a SESSÃO de quem chama (o RLS de
// hoje decide quem pode — 2ª camada) e aqui fica a FORMA:
//   · a lista fechada de ações (ACOES_FINANCEIRO): o CRUD declarativo de transacoes, categorias_financeiras e modelos_recibo (a tabela, a
//     operação e as colunas que cada ação aceita do corpo, com o tipo e o tamanho — os limites de HOJE das telas; coluna fora da lista
//     CAI: nutricionista_id, deleted_at, estornada no criar, recibo_id…); o dono: no inserir, nutricionista_id = quem chama, sempre;
//     o que volta é o MESMO select das libs de hoje (VOLTA_*: as telas não mudam);
//   · o que é tudo ou nada / 1 vez só vai pelas RPCs INVOKER da migration 20261011120000_hml19d_financeiro_atomicas.sql: as sementes do
//     1º acesso (padroes_garantir), emitir e excluir o recibo; as tags do aluno (tags_salvar) gravam só pacientes.tags;
//   · os TEXTOS padrão da semente (as 6 categorias, o "Recibo padrão" do Physiq e o do Nutri) moram aqui — a tela reexporta (uma fonte só);
//   · a tradução do erro do banco: a de _shared/nutricao-regras.ts (0 linha → 404 nao_encontrado; 42501 → 403 sem_acesso; dado ruim →
//     400 dados_invalidos; o resto → 500 erro_interno), com o 23505 das categorias como nome_repetido (409) — a tela segue com "Já
//     existe uma categoria com esse nome".
import { ehUuid, erroDaRpc, lerCampos, type Campo, type Campos } from "./nutricao-regras.ts";

// ───────────────────────── os textos padrão (a semente do 1º acesso; byte a byte os de hoje) ─────────────────────────
/** As 6 categorias que nascem no 1º acesso do profissional (as do Nutri) — eram src/painel/financeiro/financeiroUtil.ts e
 *  src/financeiro/lancamentos.ts (a mesma lista, nas 2). */
export const CATEGORIAS_PADRAO = ["Consulta", "Retorno", "Plano alimentar", "Aluguel", "Material", "Outros"];
/** O título do modelo que nasce favorito no 1º acesso (era src/financeiro/recibos.ts). */
export const TITULO_MODELO_PADRAO = "Recibo padrão";
/** Texto próprio do Physiq (o do Nutri, sem "nutricional": vale para os 2 módulos) — era src/financeiro/recibos.ts. */
export const CONTEUDO_MODELO_PADRAO = [
  "Recebi de *|NOME_PACIENTE|*, CPF *|NUMERO_DOCUMENTO_PACIENTE|*, a quantia de *|VALOR_CONSULTA|* (*|VALOR_POR_EXTENSO|*), referente a atendimento.",
  "",
  "Para maior clareza, firmo o presente recibo.",
  "",
  "*|DATA_HOJE|*",
  "",
  "*|NOME_NUTRICIONISTA|*",
  "*|CARIMBO|*",
].join("\n");
/** O texto do modelo padrão do site antigo do Nutri (o mesmo de hoje para a nutricionista) — era src/painel/financeiro/recibosUtil.ts. */
export const CONTEUDO_MODELO_PADRAO_NUTRI = [
  "Recebi de *|NOME_PACIENTE|*, CPF *|NUMERO_DOCUMENTO_PACIENTE|*, a quantia de *|VALOR_CONSULTA|* (*|VALOR_POR_EXTENSO|*), referente a atendimento nutricional.",
  "",
  "Para maior clareza, firmo o presente recibo.",
  "",
  "*|DATA_HOJE|*",
  "",
  "*|NOME_NUTRICIONISTA|*",
  "*|CARIMBO|*",
].join("\n");

/** Só nutricionista na conta (sem o papel de personal)? A regra do padraoDoRecibo da tela (src/painel/financeiro/recibosUtil.ts). */
export function ehSoNutricionista(papeis: readonly string[] | null | undefined): boolean {
  const p = papeis ?? [];
  return p.includes("nutricionista") && !p.includes("personal");
}

/** O modelo que a semente grava, pelo papel da pessoa NA conta (decisão C da hml-19d): a nutricionista recebe o do Nutri; o resto, o do Physiq. */
export function modeloPadraoDoRecibo(papeis: readonly string[] | null | undefined): { titulo: string; conteudo: string; favorito: true } {
  return { titulo: TITULO_MODELO_PADRAO, conteudo: ehSoNutricionista(papeis) ? CONTEUDO_MODELO_PADRAO_NUTRI : CONTEUDO_MODELO_PADRAO, favorito: true };
}

// ───────────────────────── o número do recibo ─────────────────────────
/**
 * A MARCA que a tela põe no lugar do valor da tag *|NUMERO_RECIBO|* (o resto das tags ela aplica como hoje): a RPC financeiro_emitir_recibo
 * troca pelo número REAL que o gatilho deu, formatado como o formatarNumeroRecibo da tela. Não dá para digitar (chr(1)) e nem o
 * aplicarTags nem o normalizarConteudo mexem nela — o texto final sai byte a byte igual ao de hoje.
 */
export const MARCA_NUMERO_RECIBO = "\u0001NUMERO_RECIBO\u0001";
/** O número como a RPC escreve (o formatarNumeroRecibo da tela: String(n).padStart(4, "0") — acima de 4 dígitos, inteiro). */
export const numeroDoRecibo = (n: number): string => String(Math.max(0, Math.trunc(Number(n) || 0))).padStart(4, "0");

// ───────────────────────── os limites (os de hoje das telas) ─────────────────────────
/** A descrição da movimentação (financeiroUtil DESCRICAO_MAX; o diálogo do aluno também corta em 160). */
export const DESCRICAO_MAX = 160;
/** A observação da movimentação (financeiroUtil OBSERVACAO_MAX — o diálogo do aluno aceita 500). */
export const OBSERVACAO_MAX = 2000;
export const CATEGORIA_NOME_MAX = 60;
export const TITULO_MODELO_MAX = 120;
export const CONTEUDO_MODELO_MAX = 8000;
export const DESCRICAO_RECIBO_MAX = 160;
/** O texto FINAL do recibo (o modelo, até 8000, com as tags trocadas): a tela não tem teto — aqui só o freio de abuso. */
export const TEXTO_RECIBO_MAX = 50_000;
/** numeric(12,2): até 10 dígitos antes da vírgula (financeiroUtil VALOR_MAX); o banco confere valor > 0. */
export const VALOR_MAX = 9_999_999_999.99;
/** As tags do aluno: a tela corta a nova em 40, mas as do catálogo do Treino não têm teto — aqui o freio, acima das 2. */
export const TAG_MAX = 200;
export const TAGS_MAX = 100;
export const TIPOS_MOVIMENTACAO = ["entrada", "saida"] as const;
export const METODOS_MOVIMENTACAO = ["pix", "dinheiro", "cartao_credito", "cartao_debito", "transferencia", "boleto", "outro"] as const;

// ───────────────────────── o que volta (o MESMO select das libs de hoje — src/painel/financeiro/dados.ts no 87205e1) ─────────────────────────
export const VOLTA_TRANSACAO =
  "id, nutricionista_id, conta_id, paciente_id, tipo, descricao, valor, data, metodo, observacao, estornada, recibo_id, categoria_id, created_at, " +
  "categoria:categorias_financeiras(nome), paciente:pacientes(nome, cpf)";
export const VOLTA_CATEGORIA = "id, nome, nutricionista_id";
export const VOLTA_MODELO_RECIBO = "id, nutricionista_id, titulo, conteudo, favorito";
// duas FKs ligam recibos ↔ transacoes (recibos.transacao_id e transacoes.recibo_id): o `!recibos_transacao_id_fkey` escolhe a certa
export const VOLTA_RECIBO = "id, nutricionista_id, paciente_id, transacao_id, modelo_id, numero, valor, data, descricao, texto, created_at, " +
  "paciente:pacientes(nome, cpf), transacao:transacoes!recibos_transacao_id_fkey(descricao, data)";

// ───────────────────────── as ações ─────────────────────────
/** As tabelas que a função grava (pacientes: só as tags). */
export const TABELAS_FINANCEIRO = ["transacoes", "categorias_financeiras", "modelos_recibo", "recibos", "pacientes"] as const;
export type TabelaFinanceiro = (typeof TABELAS_FINANCEIRO)[number];
/** As RPCs (INVOKER, migration 20261011120000_hml19d_financeiro_atomicas.sql). */
export const RPCS_DO_FINANCEIRO = ["financeiro_garantir_padroes", "financeiro_emitir_recibo", "financeiro_excluir_recibo"] as const;
export type RpcDoFinanceiro = (typeof RPCS_DO_FINANCEIRO)[number];

const uuidNulo: Campo = { tipo: "uuid", nulo: true };
const texto = (max: number, nulo = false): Campo => ({ tipo: "texto", max, nulo });
const booleano: Campo = { tipo: "booleano" };
const data: Campo = { tipo: "data" };
const VALOR: Campo = { tipo: "numero", min: 0.01, max: VALOR_MAX };

/** As colunas da movimentação que o formulário controla (o colunas(r) de dados.ts e o criarLancamento do aluno): o dono, a conta no
 *  editar, o estorno, o recibo e a Lixeira ficam fora. */
export const C_TRANSACAO: Campos = {
  tipo: { tipo: "opcao", valores: TIPOS_MOVIMENTACAO }, descricao: texto(DESCRICAO_MAX), valor: VALOR, data,
  categoria_id: uuidNulo, metodo: { tipo: "opcao", valores: METODOS_MOVIMENTACAO }, paciente_id: uuidNulo, observacao: texto(OBSERVACAO_MAX, true),
};
export const C_MODELO_RECIBO: Campos = { titulo: texto(TITULO_MODELO_MAX), conteudo: texto(CONTEUDO_MODELO_MAX), favorito: booleano };
/** O recibo emitido (a RPC financeiro_emitir_recibo): o texto FINAL, com a marca no lugar do número quando o modelo tem a tag. */
export const C_RECIBO: Campos = {
  conta_id: uuidNulo, paciente_id: { tipo: "uuid" }, transacao_id: uuidNulo, modelo_id: uuidNulo, valor: VALOR, data,
  descricao: texto(DESCRICAO_RECIBO_MAX), texto: texto(TEXTO_RECIBO_MAX),
};

interface FinInserir { tabela: TabelaFinanceiro; operacao: "inserir"; campos: Campos; obrigatorios: readonly string[]; volta: string }
interface FinEditar { tabela: TabelaFinanceiro; operacao: "editar"; campos: Campos; obrigatorios?: readonly string[]; volta: string }
interface FinExcluirSuave { tabela: TabelaFinanceiro; operacao: "excluir_suave" }
interface FinEspecial { tabela: TabelaFinanceiro | null; operacao: "especial"; rpc?: RpcDoFinanceiro }
export type DefinicaoAcaoFinanceiro = FinInserir | FinEditar | FinExcluirSuave | FinEspecial;

/** A lista fechada de ações da função financeiro. */
export const ACOES_FINANCEIRO = {
  // as sementes do 1º acesso (as 6 categorias e o "Recibo padrão"): 1 chamada, a RPC grava cada conjunto só se a pessoa não tem nenhum vivo
  padroes_garantir: { tabela: null, operacao: "especial", rpc: "financeiro_garantir_padroes" },
  // movimentações (Lançamentos e o Financeiro do aluno); excluir = a Lixeira
  transacao_criar: {
    tabela: "transacoes", operacao: "inserir", campos: { conta_id: uuidNulo, ...C_TRANSACAO }, obrigatorios: ["tipo", "descricao", "valor", "data", "metodo"],
    volta: VOLTA_TRANSACAO,
  },
  transacao_editar: { tabela: "transacoes", operacao: "editar", campos: C_TRANSACAO, volta: VOLTA_TRANSACAO },
  transacao_estornar: { tabela: "transacoes", operacao: "editar", campos: { estornada: booleano }, obrigatorios: ["estornada"], volta: VOLTA_TRANSACAO },
  transacao_excluir: { tabela: "transacoes", operacao: "excluir_suave" },
  // categorias (de cada profissional; o nome repetido entre as vivas → nome_repetido)
  categoria_criar: {
    tabela: "categorias_financeiras", operacao: "inserir", campos: { conta_id: uuidNulo, nome: texto(CATEGORIA_NOME_MAX) }, obrigatorios: ["nome"],
    volta: VOLTA_CATEGORIA,
  },
  categoria_renomear: { tabela: "categorias_financeiras", operacao: "editar", campos: { nome: texto(CATEGORIA_NOME_MAX) }, obrigatorios: ["nome"], volta: VOLTA_CATEGORIA },
  categoria_excluir: { tabela: "categorias_financeiras", operacao: "excluir_suave" },
  // modelos de recibo (o recibo emitido guarda o texto final: não depende do modelo)
  modelo_recibo_criar: {
    tabela: "modelos_recibo", operacao: "inserir", campos: { conta_id: uuidNulo, ...C_MODELO_RECIBO }, obrigatorios: ["titulo", "conteudo"],
    volta: VOLTA_MODELO_RECIBO,
  },
  modelo_recibo_editar: { tabela: "modelos_recibo", operacao: "editar", campos: C_MODELO_RECIBO, volta: VOLTA_MODELO_RECIBO },
  modelo_recibo_excluir: { tabela: "modelos_recibo", operacao: "excluir_suave" },
  // recibos: emitir (o recibo + a movimentação + o texto com o número real) e excluir (a Lixeira + a movimentação solta), tudo ou nada
  recibo_emitir: { tabela: "recibos", operacao: "especial", rpc: "financeiro_emitir_recibo" },
  recibo_excluir: { tabela: "recibos", operacao: "especial", rpc: "financeiro_excluir_recibo" },
  // as tags do aluno: só pacientes.tags (a admin-tags do Treino segue chamada pela tela)
  tags_salvar: { tabela: "pacientes", operacao: "especial" },
} as const satisfies Record<string, DefinicaoAcaoFinanceiro>;

export type AcaoFinanceiroGravar = keyof typeof ACOES_FINANCEIRO;
export const ACOES_DO_FINANCEIRO = Object.keys(ACOES_FINANCEIRO) as AcaoFinanceiroGravar[];

/** A ação do pedido, se está na lista fechada; senão null (a função responde 400 acao_invalida). */
export function acaoDoFinanceiro(v: unknown): AcaoFinanceiroGravar | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACOES_FINANCEIRO, v) ? (v as AcaoFinanceiroGravar) : null;
}

type Recusa<E extends string = "dados_invalidos"> = { ok: false; erro: E; campo?: string };
const recusada = (campo: string): Recusa => ({ ok: false, erro: "dados_invalidos", campo });

export type GravacaoFinanceiro =
  | { ok: true; tabela: TabelaFinanceiro; operacao: "inserir"; valores: Record<string, unknown>; volta: string }
  | { ok: true; tabela: TabelaFinanceiro; operacao: "editar"; id: string; valores: Record<string, unknown>; volta: string }
  | { ok: true; tabela: TabelaFinanceiro; operacao: "excluir_suave"; id: string; valores: { deleted_at: string } }
  | { ok: false; erro: "acao_invalida" | "dados_invalidos"; campo?: string };

/**
 * Monta a gravação de uma ação declarativa: confere o corpo pela lista da ação e põe o dono (nutricionista_id = `userId`) no inserir.
 * Ação especial (padroes_garantir, recibo_*, tags_salvar) não passa por aqui → acao_invalida.
 */
export function montarGravacaoFinanceiro(acao: string, corpo: Record<string, unknown>, userId: string, agora: Date = new Date()): GravacaoFinanceiro {
  const nome = acaoDoFinanceiro(acao);
  if (!nome) return { ok: false, erro: "acao_invalida" };
  const def: DefinicaoAcaoFinanceiro = ACOES_FINANCEIRO[nome];
  if (!ehUuid(userId)) return recusada("user");
  switch (def.operacao) {
    case "inserir": {
      const r = lerCampos(corpo, def.campos, def.obrigatorios);
      if (r.ok === false) return r;
      return { ok: true, tabela: def.tabela, operacao: "inserir", valores: { ...r.valores, nutricionista_id: userId.toLowerCase() }, volta: def.volta };
    }
    case "editar": {
      if (!ehUuid(corpo.id)) return recusada("id");
      const r = lerCampos(corpo, def.campos, def.obrigatorios ?? []);
      if (r.ok === false) return r;
      if (Object.keys(r.valores).length === 0) return recusada("nada_a_mudar");
      return { ok: true, tabela: def.tabela, operacao: "editar", id: corpo.id.toLowerCase(), valores: r.valores, volta: def.volta };
    }
    case "excluir_suave":
      if (!ehUuid(corpo.id)) return recusada("id");
      return { ok: true, tabela: def.tabela, operacao: "excluir_suave", id: corpo.id.toLowerCase(), valores: { deleted_at: agora.toISOString() } };
    case "especial":
      return { ok: false, erro: "acao_invalida" };
  }
}

/** padroes_garantir { conta_id }: a conta das sementes (a RPC confere que quem chama trabalha nela). */
export function lerPadroes(corpo: Record<string, unknown>): { ok: true; contaId: string } | Recusa {
  return ehUuid(corpo.conta_id) ? { ok: true, contaId: corpo.conta_id.toLowerCase() } : recusada("conta_id");
}

/** recibo_emitir { conta_id, paciente_id, transacao_id, modelo_id, valor, data, descricao, texto }: o p_recibo da RPC (o dono é dela). */
export function lerReciboEmitir(corpo: Record<string, unknown>): { ok: true; recibo: Record<string, unknown> } | Recusa {
  const r = lerCampos(corpo, C_RECIBO, ["paciente_id", "valor", "data", "descricao", "texto"]);
  if (r.ok === false) return r;
  return { ok: true, recibo: r.valores };
}

/** recibo_excluir { id }. */
export function lerReciboExcluir(corpo: Record<string, unknown>): { ok: true; id: string } | Recusa {
  return ehUuid(corpo.id) ? { ok: true, id: corpo.id.toLowerCase() } : recusada("id");
}

/** tags_salvar { paciente_id, tags }: a lista como a tela marcou (hoje ela grava exatamente o que manda; aqui só tipo e tamanho). */
export function lerTags(corpo: Record<string, unknown>): { ok: true; pacienteId: string; tags: string[] } | Recusa {
  const r = lerCampos(corpo, { paciente_id: { tipo: "uuid" }, tags: { tipo: "textos", maxItens: TAGS_MAX, maxItem: TAG_MAX } }, ["paciente_id", "tags"]);
  if (r.ok === false) return r;
  return { ok: true, pacienteId: String(r.valores.paciente_id), tags: r.valores.tags as string[] };
}

// ───────────────────────── erros ─────────────────────────
/** Status HTTP de cada erro (o corpo leva { ok: false, erro } e a tela escreve a frase — src/financeiro/gravar.ts). */
export const STATUS_DO_ERRO_FINANCEIRO: Record<string, number> = {
  sem_login: 401,
  sem_acesso: 403,
  nao_encontrado: 404,
  metodo: 405,
  nome_repetido: 409, conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  tempo_esgotado: 504,
  // 400: acao_invalida, dados_invalidos, schema_invalido
};

export function statusDoErroFinanceiro(erro: unknown): number {
  return STATUS_DO_ERRO_FINANCEIRO[String(erro ?? "")] ?? 400;
}

/** Os códigos que as RPCs devolvem de propósito (raise exception '<código>') e vão à tela como estão. */
export const ERROS_DAS_RPCS_DO_FINANCEIRO = ["sem_login", "sem_acesso", "dados_invalidos", "nao_encontrado"] as const;

/**
 * O erro do banco (ou de uma RPC) como o código da resposta: os raise das RPCs passam como estão; nas categorias, o 23505 (o nome único
 * entre as vivas) vira nome_repetido; o resto, a tradução da nutricao. `inesperado` = a função avisa (log.excecao).
 */
export function erroDoFinanceiro(acao: string, e: { code?: unknown; message?: unknown } | null | undefined): { erro: string; inesperado: boolean } {
  const t = erroDaRpc(e, ERROS_DAS_RPCS_DO_FINANCEIRO);
  if (t.erro === "conflito" && acao.startsWith("categoria_")) return { erro: "nome_repetido", inesperado: false };
  return t;
}
