// Physiq hml-19a (H-41 · H-81 · jeito 2, 11/10/2026) — regras PURAS da função nutricao (banco principal). Sem Deno e sem rede:
// usadas pela função (supabase-principal/functions/nutricao/) e testadas no Vitest (src/nutricao/nutricaoServidor.test.ts).
//
// O desenho (spec hml-19 §2.1–§2.2): a tela chama UMA ação; a função grava com a SESSÃO de quem chama (o RLS de hoje decide quem
// pode — 2ª camada) e aqui fica a FORMA, declarada por ação:
//   · a lista fechada de ações (ACOES): cada uma diz a tabela, a operação (inserir · inserir_lote · editar · excluir_suave ·
//     especial) e as colunas que aceita do corpo, com o tipo e o tamanho de cada uma — coluna fora da lista CAI (nutricionista_id,
//     deleted_at, id, conta_id… nunca vêm do corpo);
//   · o dono: no inserir, nutricionista_id = quem chama (o user do token), sempre;
//   · o que o servidor põe (fixos): a origem "manual" da consulta, o "agora" da avaliação 360, da análise e do encerramento;
//   · o anexo: os tipos do bucket, 20 MB e o caminho <quem chama>/<aluno>/<uuid>-<nome seguro>, montado AQUI;
//   · a tradução do erro do banco: 0 linha → 404 nao_encontrado; 42501 → 403 sem_acesso; 23505 → 409 conflito; dado ruim
//     (classe 22 e 23502/23503/23514) → 400 dados_invalidos; o resto → 500 erro_interno (a função avisa: log.excecao).
// Os valores calculados no navegador (pontuação, síntese da 360, DPP, texto final do documento) seguem calculados lá: aqui só se
// confere a forma e o tamanho (decisão 12). Os tetos de tamanho ficam ACIMA do que as telas aceitam (o limite fino é o check do
// banco): a função barra o abuso, não muda a regra da tela.

// ───────────────────────── formatos ─────────────────────────
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const INSTANTE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** O maior corpo de pedido aceito (caracteres do JSON): acima disso, 413 corpo_grande sem ler o resto. */
export const LIMITE_CORPO = 2_000_000;

// tetos (caracteres): título/nome · texto curto · texto médio · texto longo · JSON de 1 campo
const TITULO = 500;
const CURTO = 2_000;
const MEDIO = 20_000;
const LONGO = 50_000;
const JSON_MAX = 1_000_000;

export type Campo =
  | { tipo: "uuid"; nulo?: boolean }
  | { tipo: "texto"; max: number; nulo?: boolean }
  | { tipo: "data"; nulo?: boolean }
  | { tipo: "instante" }
  | { tipo: "numero"; nulo?: boolean; inteiro?: boolean; min?: number; max?: number }
  | { tipo: "booleano" }
  /** hml-19c: `nulo` = a coluna aceita null (o sexo da antropometria); sem ele, como antes */
  | { tipo: "opcao"; valores: readonly string[]; nulo?: boolean }
  | { tipo: "textos"; maxItens: number; maxItem: number }
  | { tipo: "json"; forma: "lista" | "objeto"; maxBytes: number }
  /** hml-19b: lista de inteiros entre min e max (os dias da semana, smallint[]) */
  | { tipo: "inteiros"; maxItens: number; min: number; max: number };
export type Campos = Readonly<Record<string, Campo>>;

const uuid: Campo = { tipo: "uuid" };
const uuidNulo: Campo = { tipo: "uuid", nulo: true };
const texto = (max: number, nulo = false): Campo => ({ tipo: "texto", max, nulo });
const data: Campo = { tipo: "data" };
const dataNula: Campo = { tipo: "data", nulo: true };
const instante: Campo = { tipo: "instante" };
const numero: Campo = { tipo: "numero" };
const numeroNulo: Campo = { tipo: "numero", nulo: true };
const inteiroNulo: Campo = { tipo: "numero", nulo: true, inteiro: true };
const booleano: Campo = { tipo: "booleano" };
const opcao = (valores: readonly string[]): Campo => ({ tipo: "opcao", valores });
const lista: Campo = { tipo: "json", forma: "lista", maxBytes: JSON_MAX };
const objeto: Campo = { tipo: "json", forma: "objeto", maxBytes: JSON_MAX };

export const VISIBILIDADES = ["equipe", "nutricionistas"] as const;
export const PAPEIS_AUTOR = ["master", "nutricionista", "personal", "dono"] as const;
export const TIPOS_DOCUMENTO = ["atestado", "receituario", "declaracao"] as const;
export const GRAVIDADES = ["baixa", "moderada", "alta"] as const;
export const NIVEIS = ["baixo", "moderado", "alto", ""] as const;

/** O valor do campo, se está na forma (null só onde o campo aceita); senão, fora. */
export function valorDoCampo(campo: Campo, v: unknown): { ok: true; valor: unknown } | { ok: false } {
  const ok = (valor: unknown) => ({ ok: true as const, valor });
  const fora = { ok: false as const };
  if (v === null) return "nulo" in campo && campo.nulo ? ok(null) : fora;
  switch (campo.tipo) {
    case "uuid":
      return ehUuid(v) ? ok(v.toLowerCase()) : fora;
    case "texto":
      return typeof v === "string" && v.length <= campo.max ? ok(v) : fora;
    case "data":
      return typeof v === "string" && DATA.test(v) && !Number.isNaN(Date.parse(v)) ? ok(v) : fora;
    case "instante":
      return typeof v === "string" && v.length <= 40 && INSTANTE.test(v) && !Number.isNaN(Date.parse(v)) ? ok(v) : fora;
    case "numero": {
      if (typeof v !== "number" || !Number.isFinite(v)) return fora;
      if (campo.inteiro && !Number.isInteger(v)) return fora;
      if ((campo.min !== undefined && v < campo.min) || (campo.max !== undefined && v > campo.max)) return fora;
      return ok(v);
    }
    case "booleano":
      return typeof v === "boolean" ? ok(v) : fora;
    case "opcao":
      return typeof v === "string" && campo.valores.includes(v) ? ok(v) : fora;
    case "textos":
      return Array.isArray(v) && v.length <= campo.maxItens && v.every((x) => typeof x === "string" && x.length <= campo.maxItem) ? ok([...v]) : fora;
    case "json": {
      const forma = Array.isArray(v) ? "lista" : typeof v === "object" ? "objeto" : null;
      if (forma !== campo.forma) return fora;
      let tamanho = Infinity;
      try {
        tamanho = JSON.stringify(v).length;
      } catch {
        return fora;
      }
      return tamanho <= campo.maxBytes ? ok(v) : fora;
    }
    case "inteiros":
      return Array.isArray(v) && v.length <= campo.maxItens && v.every((x) => Number.isInteger(x) && x >= campo.min && x <= campo.max) ? ok([...v]) : fora;
  }
}

/**
 * As colunas do corpo que a ação aceita, conferidas (as de fora caem). `obrigatorios`: precisam vir (e não nulas). Uma coluna fora
 * da forma → dados_invalidos (o nome dela vai no `campo`, para o log; a tela recebe só o código).
 */
export function lerCampos(
  corpo: Record<string, unknown>,
  campos: Campos,
  obrigatorios: readonly string[] = [],
): { ok: true; valores: Record<string, unknown> } | { ok: false; erro: "dados_invalidos"; campo: string } {
  const valores: Record<string, unknown> = {};
  for (const [nome, campo] of Object.entries(campos)) {
    if (!Object.prototype.hasOwnProperty.call(corpo, nome) || corpo[nome] === undefined) continue;
    const r = valorDoCampo(campo, corpo[nome]);
    if (r.ok === false) return { ok: false, erro: "dados_invalidos", campo: nome };
    valores[nome] = r.valor;
  }
  for (const nome of obrigatorios) {
    if (valores[nome] === undefined || valores[nome] === null) return { ok: false, erro: "dados_invalidos", campo: nome };
  }
  return { ok: true, valores };
}

// ───────────────────────── as tabelas e as ações ─────────────────────────
/** As 18 tabelas do Prontuário (spec §1.2). Todas têm nutricionista_id (o dono) e deleted_at (Lixeira, W32). */
export const TABELAS_PRONTUARIO = [
  "registros_prontuario", "consultas", "anamneses", "modelos_anamnese", "respostas_questionario", "questionarios", "pedidos_exame",
  "resultados_exame", "exames_catalogo", "avaliacoes_integradas", "gestacoes", "registros_gestacionais", "medicamentos_paciente",
  "analises_farmaco", "interacoes_farmaco_nutriente", "documentos", "modelos_documento", "anexos",
] as const;
export type TabelaProntuario = (typeof TABELAS_PRONTUARIO)[number];

type Fixos = (agora: Date) => Record<string, unknown>;
interface AcaoInserir { tabela: TabelaProntuario; operacao: "inserir"; campos: Campos; obrigatorios: readonly string[]; fixos?: Fixos }
interface AcaoEditar { tabela: TabelaProntuario; operacao: "editar"; campos: Campos; fixos?: Fixos }
interface AcaoExcluir { tabela: TabelaProntuario; operacao: "excluir_suave" }
interface AcaoLote {
  tabela: TabelaProntuario;
  operacao: "inserir_lote";
  comuns: Campos;
  obrigatoriosComuns: readonly string[];
  campos: Campos;
  obrigatorios: readonly string[];
  maxLinhas: number;
}
interface AcaoEspecial { tabela: TabelaProntuario | null; operacao: "especial" }
export type DefinicaoAcao = AcaoInserir | AcaoEditar | AcaoExcluir | AcaoLote | AcaoEspecial;

const agoraISO: Fixos = (agora) => ({ data: agora.toISOString() });

// as colunas de cada entidade (o editar aceita as mesmas, menos o paciente — o aluno de um registro não muda)
const C_ANOTACAO: Campos = { data: instante, texto: texto(LONGO), visibilidade: opcao(VISIBILIDADES), autor_papel: opcao(PAPEIS_AUTOR) };
const C_CONSULTA: Campos = { data: instante, observacao: texto(MEDIO, true) };
const C_ANAMNESE: Campos = { titulo: texto(TITULO), data: instante, conteudo: lista, texto_livre: texto(MEDIO, true) };
const C_MODELO_ANAMNESE: Campos = { titulo: texto(TITULO), perguntas: lista, favorito: booleano };
const C_QUESTIONARIO: Campos = { titulo: texto(TITULO), descricao: texto(CURTO), perguntas: lista, faixas: lista, favorito: booleano };
const C_APLICACAO_EDITAR: Campos = {
  respostas: objeto, pontuacao: numero, faixa: texto(TITULO), nivel: opcao(NIVEIS), data, observacao: texto(CURTO),
};
const C_EXAME_CATALOGO: Campos = {
  nome: texto(TITULO), unidade: texto(TITULO), ref_min: numeroNulo, ref_max: numeroNulo, referencia_texto: texto(TITULO), favorito: booleano,
};
const C_PEDIDO: Campos = { data, exames: { tipo: "textos", maxItens: 200, maxItem: TITULO }, observacao: texto(CURTO) };
const C_RESULTADO_LINHA: Campos = {
  exame: texto(TITULO), valor: numeroNulo, valor_texto: texto(TITULO), unidade: texto(TITULO), ref_min: numeroNulo, ref_max: numeroNulo,
  referencia_texto: texto(TITULO),
};
const C_GESTACAO: Campos = {
  dum: data, dpp: data, peso_pre: numero, altura: numero, imc_pre: numero, gemelar: booleano, observacao: texto(CURTO, true),
};
export const C_REGISTRO_GESTACIONAL: Campos = {
  data, peso: numero, pa_sistolica: inteiroNulo, pa_diastolica: inteiroNulo, observacao: texto(CURTO, true),
};
const C_INTERACAO: Campos = {
  medicamento: texto(TITULO), sinonimos: { tipo: "textos", maxItens: 100, maxItem: TITULO }, classe: texto(TITULO), nutriente: texto(TITULO),
  efeito: texto(CURTO), gravidade: opcao(GRAVIDADES), conduta: texto(CURTO), fonte: texto(CURTO),
};
const C_MEDICAMENTO: Campos = {
  medicamento: texto(TITULO), interacao_id: uuidNulo, dose: texto(CURTO), posologia: texto(CURTO), inicio: dataNula, observacao: texto(CURTO),
  ativo: booleano,
};
const C_MODELO_DOCUMENTO: Campos = { tipo: opcao(TIPOS_DOCUMENTO), titulo: texto(TITULO), conteudo: texto(MEDIO), favorito: booleano };
const comAluno = (c: Campos): Campos => ({ paciente_id: uuid, ...c });

/** As ações da nutricao nesta W (Prontuário): a lista fechada. A 19b/19c acrescentam as da Dieta, do app do aluno e da Avaliação. */
export const ACOES = {
  // Anotações da equipe (registros_prontuario) — o papel vai junto e o banco confere (restritiva da W18)
  anotacao_criar: { tabela: "registros_prontuario", operacao: "inserir", campos: comAluno(C_ANOTACAO), obrigatorios: ["paciente_id", "data", "texto", "visibilidade", "autor_papel"] },
  anotacao_editar: { tabela: "registros_prontuario", operacao: "editar", campos: C_ANOTACAO },
  anotacao_excluir: { tabela: "registros_prontuario", operacao: "excluir_suave" },
  // Consultas
  consulta_criar: { tabela: "consultas", operacao: "inserir", campos: comAluno(C_CONSULTA), obrigatorios: ["paciente_id", "data"], fixos: () => ({ origem: "manual" }) },
  consulta_editar: { tabela: "consultas", operacao: "editar", campos: C_CONSULTA },
  consulta_excluir: { tabela: "consultas", operacao: "excluir_suave" },
  // Anamnese
  anamnese_criar: { tabela: "anamneses", operacao: "inserir", campos: comAluno({ modelo_id: uuidNulo, ...C_ANAMNESE }), obrigatorios: ["paciente_id", "titulo", "data", "conteudo"] },
  anamnese_editar: { tabela: "anamneses", operacao: "editar", campos: C_ANAMNESE },
  anamnese_excluir: { tabela: "anamneses", operacao: "excluir_suave" },
  modelo_anamnese_criar: { tabela: "modelos_anamnese", operacao: "inserir", campos: C_MODELO_ANAMNESE, obrigatorios: ["titulo", "perguntas"] },
  modelo_anamnese_editar: { tabela: "modelos_anamnese", operacao: "editar", campos: C_MODELO_ANAMNESE },
  modelo_anamnese_excluir: { tabela: "modelos_anamnese", operacao: "excluir_suave" },
  // Questionários (o catálogo) e as aplicações (respostas_questionario: título, perguntas e faixas COPIADOS na hora)
  questionario_criar: { tabela: "questionarios", operacao: "inserir", campos: C_QUESTIONARIO, obrigatorios: ["titulo", "perguntas", "faixas"] },
  questionario_editar: { tabela: "questionarios", operacao: "editar", campos: C_QUESTIONARIO },
  questionario_excluir: { tabela: "questionarios", operacao: "excluir_suave" },
  aplicacao_criar: {
    tabela: "respostas_questionario", operacao: "inserir",
    campos: comAluno({ questionario_id: uuidNulo, titulo: texto(TITULO), perguntas: lista, faixas: lista, ...C_APLICACAO_EDITAR }),
    obrigatorios: ["paciente_id", "titulo", "perguntas", "faixas", "respostas", "data"],
  },
  aplicacao_editar: { tabela: "respostas_questionario", operacao: "editar", campos: C_APLICACAO_EDITAR },
  aplicacao_excluir: { tabela: "respostas_questionario", operacao: "excluir_suave" },
  // Exames: o catálogo, os pedidos e os resultados (lançados em LOTE na mesma data)
  exame_catalogo_criar: { tabela: "exames_catalogo", operacao: "inserir", campos: C_EXAME_CATALOGO, obrigatorios: ["nome"] },
  exame_catalogo_editar: { tabela: "exames_catalogo", operacao: "editar", campos: C_EXAME_CATALOGO },
  exame_catalogo_excluir: { tabela: "exames_catalogo", operacao: "excluir_suave" },
  pedido_exame_criar: { tabela: "pedidos_exame", operacao: "inserir", campos: comAluno(C_PEDIDO), obrigatorios: ["paciente_id", "data", "exames"] },
  pedido_exame_editar: { tabela: "pedidos_exame", operacao: "editar", campos: C_PEDIDO },
  pedido_exame_excluir: { tabela: "pedidos_exame", operacao: "excluir_suave" },
  resultados_exame_criar: {
    tabela: "resultados_exame", operacao: "inserir_lote", comuns: { paciente_id: uuid, data }, obrigatoriosComuns: ["paciente_id", "data"],
    campos: C_RESULTADO_LINHA, obrigatorios: ["exame"], maxLinhas: 120,
  },
  resultado_exame_editar: { tabela: "resultados_exame", operacao: "editar", campos: { ...C_RESULTADO_LINHA, data, observacao: texto(CURTO) } },
  resultado_exame_excluir: { tabela: "resultados_exame", operacao: "excluir_suave" },
  // Avaliação 360 (síntese e fontes CONGELADAS em jsonb; editar só mexe em título e parecer; regerar troca os 2 jsonb)
  avaliacao_integrada_criar: {
    tabela: "avaliacoes_integradas", operacao: "inserir",
    campos: comAluno({ titulo: texto(TITULO), texto: texto(MEDIO, true), sintese: objeto, fontes: objeto }),
    obrigatorios: ["paciente_id", "titulo", "sintese", "fontes"], fixos: agoraISO,
  },
  avaliacao_integrada_editar: { tabela: "avaliacoes_integradas", operacao: "editar", campos: { titulo: texto(TITULO), texto: texto(MEDIO, true) } },
  avaliacao_integrada_regerar: { tabela: "avaliacoes_integradas", operacao: "editar", campos: { sintese: objeto, fontes: objeto } },
  avaliacao_integrada_excluir: { tabela: "avaliacoes_integradas", operacao: "excluir_suave" },
  // Gestacional (1 gestação ATIVA por aluna: 23505 → conflito; 1 registro vivo por gestação/dia: salvar = editar o do dia ou inserir)
  gestacao_criar: { tabela: "gestacoes", operacao: "inserir", campos: comAluno(C_GESTACAO), obrigatorios: ["paciente_id", "dum", "dpp", "peso_pre", "altura", "imc_pre"] },
  gestacao_editar: { tabela: "gestacoes", operacao: "editar", campos: C_GESTACAO },
  gestacao_encerrar: { tabela: "gestacoes", operacao: "editar", campos: {}, fixos: (agora) => ({ encerrada_em: agora.toISOString() }) },
  gestacao_excluir: { tabela: "gestacoes", operacao: "excluir_suave" },
  registro_gestacional_salvar: { tabela: "registros_gestacionais", operacao: "especial" },
  registro_gestacional_editar: { tabela: "registros_gestacionais", operacao: "editar", campos: C_REGISTRO_GESTACIONAL },
  registro_gestacional_excluir: { tabela: "registros_gestacionais", operacao: "excluir_suave" },
  // Fármaco-nutrientes: a base de interações (as do sistema são só leitura: o RLS dá 0 linha → 404), os medicamentos e as análises
  interacao_criar: { tabela: "interacoes_farmaco_nutriente", operacao: "inserir", campos: C_INTERACAO, obrigatorios: ["medicamento", "nutriente", "efeito", "conduta"] },
  interacao_editar: { tabela: "interacoes_farmaco_nutriente", operacao: "editar", campos: C_INTERACAO },
  interacao_excluir: { tabela: "interacoes_farmaco_nutriente", operacao: "excluir_suave" },
  medicamento_criar: { tabela: "medicamentos_paciente", operacao: "inserir", campos: comAluno(C_MEDICAMENTO), obrigatorios: ["paciente_id", "medicamento"] },
  medicamento_editar: { tabela: "medicamentos_paciente", operacao: "editar", campos: C_MEDICAMENTO },
  medicamento_excluir: { tabela: "medicamentos_paciente", operacao: "excluir_suave" },
  analise_farmaco_criar: {
    tabela: "analises_farmaco", operacao: "inserir",
    campos: comAluno({ titulo: texto(TITULO), parecer: texto(MEDIO), medicamentos: lista, interacoes: lista }),
    obrigatorios: ["paciente_id", "titulo"], fixos: agoraISO,
  },
  analise_farmaco_editar: { tabela: "analises_farmaco", operacao: "editar", campos: { titulo: texto(TITULO), parecer: texto(MEDIO) } },
  analise_farmaco_excluir: { tabela: "analises_farmaco", operacao: "excluir_suave" },
  // Documentos (o TEXTO final, com as tags já trocadas na tela) e os modelos
  modelo_documento_criar: { tabela: "modelos_documento", operacao: "inserir", campos: C_MODELO_DOCUMENTO, obrigatorios: ["tipo", "titulo", "conteudo"] },
  modelo_documento_editar: { tabela: "modelos_documento", operacao: "editar", campos: C_MODELO_DOCUMENTO },
  modelo_documento_excluir: { tabela: "modelos_documento", operacao: "excluir_suave" },
  documento_criar: {
    tabela: "documentos", operacao: "inserir",
    campos: comAluno({ modelo_id: uuidNulo, tipo: opcao(TIPOS_DOCUMENTO), titulo: texto(TITULO), texto: texto(MEDIO), dados: objeto, data }),
    obrigatorios: ["paciente_id", "tipo", "titulo", "texto"],
  },
  documento_editar: { tabela: "documentos", operacao: "editar", campos: { texto: texto(MEDIO) } },
  documento_excluir: { tabela: "documentos", operacao: "excluir_suave" },
  // Anexos: o arquivo sobe pelo link assinado que o servidor dá (preparar → o navegador sobe → registrar); excluir = soft + remove
  anexo_preparar: { tabela: "anexos", operacao: "especial" },
  anexo_registrar: { tabela: "anexos", operacao: "especial" },
  anexo_editar: { tabela: "anexos", operacao: "editar", campos: { descricao: texto(CURTO, true) } },
  anexo_excluir: { tabela: "anexos", operacao: "especial" },
  // Os padrões do 1º acesso (H-81): 1 chamada por abertura, a RPC grava só se a pessoa não tem nenhum próprio vivo
  padroes_garantir: { tabela: null, operacao: "especial" },
} as const satisfies Record<string, DefinicaoAcao>;

export type AcaoNutricao = keyof typeof ACOES;
export const ACOES_NUTRICAO = Object.keys(ACOES) as AcaoNutricao[];

/** A ação do pedido, se está na lista fechada; senão null (a função responde 400 acao_invalida). */
export function acaoDoPedido(v: unknown): AcaoNutricao | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACOES, v) ? (v as AcaoNutricao) : null;
}

// ───────────────────────── a gravação de 1 ação (CRUD declarativo) ─────────────────────────
export type Gravacao =
  | { ok: true; tabela: TabelaProntuario; operacao: "inserir"; valores: Record<string, unknown> }
  | { ok: true; tabela: TabelaProntuario; operacao: "inserir_lote"; linhas: Array<Record<string, unknown>> }
  | { ok: true; tabela: TabelaProntuario; operacao: "editar"; id: string; valores: Record<string, unknown> }
  | { ok: true; tabela: TabelaProntuario; operacao: "excluir_suave"; id: string; valores: { deleted_at: string } }
  | { ok: false; erro: "acao_invalida" | "dados_invalidos"; campo?: string };

/**
 * Monta a gravação de uma ação declarativa: confere o corpo pela lista da ação e põe o dono (nutricionista_id = `userId`) no
 * inserir. Ação especial (anexo_*, padroes_garantir, registro_gestacional_salvar) não passa por aqui → acao_invalida.
 */
export function montarGravacao(acao: string, corpo: Record<string, unknown>, userId: string, agora: Date = new Date()): Gravacao {
  const nome = acaoDoPedido(acao);
  if (!nome) return { ok: false, erro: "acao_invalida" };
  const def: DefinicaoAcao = ACOES[nome];
  if (!ehUuid(userId)) return { ok: false, erro: "dados_invalidos", campo: "user" };
  switch (def.operacao) {
    case "inserir": {
      const r = lerCampos(corpo, def.campos, def.obrigatorios);
      if (r.ok === false) return r;
      return { ok: true, tabela: def.tabela, operacao: "inserir", valores: { ...r.valores, ...(def.fixos?.(agora) ?? {}), nutricionista_id: userId } };
    }
    case "inserir_lote": {
      const comuns = lerCampos(corpo, def.comuns, def.obrigatoriosComuns);
      if (comuns.ok === false) return comuns;
      const brutas = corpo.linhas;
      if (!Array.isArray(brutas) || brutas.length < 1 || brutas.length > def.maxLinhas) return { ok: false, erro: "dados_invalidos", campo: "linhas" };
      const linhas: Array<Record<string, unknown>> = [];
      for (const bruta of brutas) {
        if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) return { ok: false, erro: "dados_invalidos", campo: "linhas" };
        const l = lerCampos(bruta as Record<string, unknown>, def.campos, def.obrigatorios);
        if (l.ok === false) return l;
        linhas.push({ ...l.valores, ...comuns.valores, nutricionista_id: userId });
      }
      return { ok: true, tabela: def.tabela, operacao: "inserir_lote", linhas };
    }
    case "editar": {
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      const r = lerCampos(corpo, def.campos);
      if (r.ok === false) return r;
      const valores = { ...r.valores, ...(def.fixos?.(agora) ?? {}) };
      if (Object.keys(valores).length === 0) return { ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" };
      return { ok: true, tabela: def.tabela, operacao: "editar", id: corpo.id.toLowerCase(), valores };
    }
    case "excluir_suave":
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      return { ok: true, tabela: def.tabela, operacao: "excluir_suave", id: corpo.id.toLowerCase(), valores: { deleted_at: agora.toISOString() } };
    case "especial":
      return { ok: false, erro: "acao_invalida" };
  }
}

/** O registro gestacional de "salvar" (o do dia vira edição; sem ele, insere): as colunas conferidas e o dono. */
export function lerRegistroGestacional(corpo: Record<string, unknown>, userId: string):
  | { ok: true; gestacaoId: string; pacienteId: string; dia: string; valores: Record<string, unknown> }
  | { ok: false; erro: "dados_invalidos"; campo: string } {
  const r = lerCampos(corpo, { gestacao_id: uuid, paciente_id: uuid, ...C_REGISTRO_GESTACIONAL }, ["gestacao_id", "paciente_id", "data", "peso"]);
  if (r.ok === false) return r;
  if (!ehUuid(userId)) return { ok: false, erro: "dados_invalidos", campo: "user" };
  const { gestacao_id, paciente_id, ...resto } = r.valores;
  return { ok: true, gestacaoId: String(gestacao_id), pacienteId: String(paciente_id), dia: String(resto.data), valores: resto };
}

// ───────────────────────── anexos (bucket privado, um por ambiente) ─────────────────────────
/** 20 MB — o file_size_limit do bucket (20971520) e o TAMANHO_MAX da tela. */
export const ANEXO_MAX_BYTES = 20 * 1024 * 1024;
export const ANEXO_NOME_MAX = 200;
export const ANEXO_DESCRICAO_MAX = 200;
/** Os MIME do bucket `anexos` (allowed_mime_types; o mesmo MIMES_PERMITIDOS da tela). */
export const ANEXO_MIMES = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
] as const;

/** O bucket do ambiente: no staging, o "-staging" (hml-02b — teste nunca cai no bucket da produção). */
export function bucketDosAnexos(schema: "public" | "staging"): string {
  return schema === "staging" ? "anexos-staging" : "anexos";
}

function extensaoDe(nome: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** "Exame de Sangue (Setembro).PDF" → "exame-de-sangue-setembro.pdf" (o mesmo nomeSeguro da tela: sem acento/espaço, minúsculo). */
export function nomeSeguro(nome: string): string {
  const limpo = (nome ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const ext = extensaoDe(limpo);
  const semExt = ext ? limpo.slice(0, -(ext.length + 1)) : limpo;
  const base = semExt.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "arquivo";
  return ext ? `${base}.${ext}` : base;
}

/** O caminho do objeto, montado NO SERVIDOR: <quem chama>/<aluno>/<uuid>-<nome seguro> (a 1ª pasta é a dona — policies do Storage). */
export function caminhoDoAnexo(userId: string, pacienteId: string, nome: string, id: string): string {
  return `${userId.toLowerCase()}/${pacienteId.toLowerCase()}/${id.toLowerCase()}-${nomeSeguro(nome)}`;
}

const ARQUIVO_DO_CAMINHO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9.-]{1,80}$/;

/** O caminho é de um anexo de quem chama, daquele aluno, no formato do caminhoDoAnexo? (N9: outra pasta → recusa) */
export function caminhoDeQuemChama(caminho: unknown, userId: string, pacienteId: string): caminho is string {
  if (typeof caminho !== "string" || caminho.length > 300) return false;
  const partes = caminho.split("/");
  return partes.length === 3 && partes[0] === userId.toLowerCase() && partes[1] === pacienteId.toLowerCase() && ARQUIVO_DO_CAMINHO.test(partes[2]);
}

/** anexo_preparar { paciente_id, nome, tipo, tamanho }: o pedido conferido (o tipo na lista do bucket; até 20 MB). */
export function lerPedidoDeAnexo(corpo: Record<string, unknown>):
  | { ok: true; pacienteId: string; nome: string; mime: string; tamanho: number }
  | { ok: false; erro: "dados_invalidos" | "tipo_invalido" | "arquivo_grande"; campo?: string } {
  if (!ehUuid(corpo.paciente_id)) return { ok: false, erro: "dados_invalidos", campo: "paciente_id" };
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  if (!nome || nome.length > ANEXO_NOME_MAX) return { ok: false, erro: "dados_invalidos", campo: "nome" };
  const mime = typeof corpo.tipo === "string" ? corpo.tipo.trim().toLowerCase() : "";
  if (!(ANEXO_MIMES as readonly string[]).includes(mime)) return { ok: false, erro: "tipo_invalido" };
  const tamanho = corpo.tamanho;
  if (typeof tamanho !== "number" || !Number.isInteger(tamanho) || tamanho <= 0) return { ok: false, erro: "dados_invalidos", campo: "tamanho" };
  if (tamanho > ANEXO_MAX_BYTES) return { ok: false, erro: "arquivo_grande" };
  return { ok: true, pacienteId: corpo.paciente_id.toLowerCase(), nome, mime, tamanho };
}

/** anexo_registrar { paciente_id, caminho, nome, tipo, tamanho, descricao }: o pedido conferido e o caminho de quem chama. */
export function lerRegistroDeAnexo(corpo: Record<string, unknown>, userId: string):
  | { ok: true; pacienteId: string; caminho: string; nome: string; mime: string; tamanho: number; descricao: string | null }
  | { ok: false; erro: "dados_invalidos" | "tipo_invalido" | "arquivo_grande" | "fora_da_pasta"; campo?: string } {
  const p = lerPedidoDeAnexo(corpo);
  if (p.ok === false) return p;
  if (!caminhoDeQuemChama(corpo.caminho, userId, p.pacienteId)) return { ok: false, erro: "fora_da_pasta" };
  const d = corpo.descricao;
  if (d !== undefined && d !== null && (typeof d !== "string" || d.length > ANEXO_DESCRICAO_MAX * 2)) return { ok: false, erro: "dados_invalidos", campo: "descricao" };
  const descricao = typeof d === "string" ? d.trim().replace(/\s+/g, " ").slice(0, ANEXO_DESCRICAO_MAX) || null : null;
  return { ok: true, pacienteId: p.pacienteId, caminho: corpo.caminho as string, nome: p.nome, mime: p.mime, tamanho: p.tamanho, descricao };
}

// ───────────────────────── os padrões (H-81) ─────────────────────────
/** As seções que a função semeia nesta W, a tabela de cada uma e a coluna da ordem da lista (a mesma das libs da tela). */
export const PADROES: Record<"anamnese" | "documento" | "exame", { tabela: TabelaProntuario; ordem: string }> = {
  anamnese: { tabela: "modelos_anamnese", ordem: "titulo" },
  documento: { tabela: "modelos_documento", ordem: "titulo" },
  exame: { tabela: "exames_catalogo", ordem: "nome" },
};
export type SecaoDoPadrao = keyof typeof PADROES;
export function secaoDoPadrao(v: unknown): SecaoDoPadrao | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PADROES, v) ? (v as SecaoDoPadrao) : null;
}

// ───────────────────────── erros ─────────────────────────
/** Status HTTP de cada erro (o corpo leva { ok: false, erro } e a tela escreve a frase — src/nutricao/servidor.ts). */
export const STATUS_DO_ERRO: Record<string, number> = {
  sem_login: 401,
  sem_acesso: 403, fora_da_pasta: 403,
  nao_encontrado: 404,
  metodo: 405,
  conflito: 409,
  corpo_grande: 413,
  muitas_acoes: 429,
  erro_interno: 500,
  storage_falhou: 502,
  tempo_esgotado: 504,
  // 400: acao_invalida, dados_invalidos, schema_invalido, secao_invalida, tipo_invalido, arquivo_grande, anexo_nao_enviado
  // hml-19b — os códigos das RPCs do app do aluno que a tela já traduz (ERROS_DA_MARCACAO, ERROS_DO_DIARIO): os de fora daqui são 400
  codigo_invalido: 403, diario_desligado: 403, link_desligado: 403,
  muitos_envios: 429,
  // hml-19c — o aviso "avaliação nova" (ERROS_DO_AVISO): o aluno da rota que não existe (a w14_matricula_da_rota)
  aluno_inexistente: 404,
};

export function statusDoErro(erro: unknown): number {
  return STATUS_DO_ERRO[String(erro ?? "")] ?? 400;
}

/**
 * O erro do banco (PostgREST/Postgres) como o código da resposta. `inesperado` = a função avisa (log.excecao): é defeito ou
 * falha do servidor, não dado ruim nem falta de permissão. A mensagem do banco nunca vai à tela (só ao log, limpa).
 */
export function erroDoBanco(e: { code?: unknown; message?: unknown } | null | undefined): { erro: string; inesperado: boolean } {
  const code = typeof e?.code === "string" ? e.code : "";
  const msg = typeof e?.message === "string" ? e.message : "";
  if (code === "42501") return { erro: "sem_acesso", inesperado: false };
  if (code === "23505") return { erro: "conflito", inesperado: false };
  if (code.startsWith("22") || code === "23502" || code === "23503" || code === "23514") return { erro: "dados_invalidos", inesperado: false };
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303") return { erro: "sem_login", inesperado: false };
  if (/^(TimeoutError|AbortError)\b/.test(msg)) return { erro: "tempo_esgotado", inesperado: true };
  return { erro: "erro_interno", inesperado: true };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// hml-19b (H-41 · jeito 2, 11/10/2026) — a Dieta (Painel › Aluno › Dieta), as Dietas (Painel › Dietas) e o app do aluno (spec hml-19
// §1.3, §2.3). O MESMO desenho do Prontuário, em listas à parte (as do Prontuário não mudam):
//   · ACOES_DIETA: o CRUD declarativo das 19 tabelas (inserir · inserir_lote · editar · excluir_suave · excluir — o DELETE físico de
//     refeição e item, como hoje) com as colunas de cada ação; o dono (nutricionista_id = quem chama) nas 15 tabelas que têm dono;
//     `vivos` = a ação só mexe no que está fora da Lixeira (o filtro que a lib de hoje já fazia); `volta` = o select que a tela recebe;
//   · o que precisa ser TUDO OU NADA vai pelas RPCs INVOKER da migration 20261011110000_hml19b_dieta_atomicas.sql (RPCS_DA_DIETA);
//     o registro do dia (registros_diarios: o índice único é PARCIAL) é um upsert à mão no servidor, como o gestacional da 19a;
//   · os padrões de Manipulados, Metas e Orientações: padroes_garantir { secao: formula | meta | orientacao } — a RPC da 19a (já aceita
//     as 6 seções), pelo módulo da Dieta (as 3 seções do Prontuário seguem no prontuario.ts, sem mudança);
//   · ACOES_ALUNO: o app do aluno chama as MESMAS RPCs de hoje (paciente_marcar_refeicao, aluno_marcar_meta, diario_enviar) como a
//     pessoa; a foto do diário sobe pelo link assinado (caminho montado aqui) e o registro confere o arquivo naquele caminho.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** As 19 tabelas da Dieta, das Dietas e do diário (spec §1.3). */
export const TABELAS_DIETA = [
  "planos_alimentares", "refeicoes", "itens_refeicao", "registros_diarios", "calculos_energeticos", "produtos", "indicacoes_produto",
  "formulas_manipuladas", "modelos_formula", "metas", "modelos_meta", "orientacoes", "modelos_orientacao", "alimentos", "medidas_caseiras",
  "receitas", "ingredientes_receita", "grupos_receita", "diario_alimentar",
] as const;
export type TabelaDieta = (typeof TABELAS_DIETA)[number];
/** As 4 "filhas": sem dono e sem Lixeira (seguem o pai pelo RLS). Nas outras 15, o inserir põe nutricionista_id = quem chama. */
export const TABELAS_DIETA_SEM_DONO: readonly TabelaDieta[] = ["refeicoes", "itens_refeicao", "medidas_caseiras", "ingredientes_receita"];
export const temDono = (t: TabelaDieta): boolean => !TABELAS_DIETA_SEM_DONO.includes(t);

/** O que a gravação devolve (o MESMO select das libs de hoje): o alimento com as medidas; o item com o alimento e a receita; a receita
 *  com os ingredientes (e o alimento de cada um). O embed segue o RLS de quem grava, como hoje. */
export const VOLTA_ALIMENTO = "*, medidas_caseiras(*)";
const ALIMENTO_EMBUTIDO = "alimento:alimentos(id, nome, fonte, grupo, energia_kcal, proteina_g, carboidrato_g, lipidio_g, fibra_g, sodio_mg, medidas_caseiras(*))";
export const VOLTA_ITEM = `*, ${ALIMENTO_EMBUTIDO}, receita:receitas(id, nome)`;
export const VOLTA_RECEITA = `*, ingredientes:ingredientes_receita(*, ${ALIMENTO_EMBUTIDO})`;

/** As RPCs da Dieta (INVOKER, migration 20261011110000_hml19b_dieta_atomicas.sql): só o que é tudo ou nada. */
export const RPCS_DA_DIETA = [
  "dieta_criar_plano", "dieta_duplicar_plano", "dieta_salvar_receita", "dieta_salvar_alimento", "dieta_ordenar", "dieta_excluir_grupo_receita",
  "dieta_copiar_semana",
] as const;
export type RpcDaDieta = (typeof RPCS_DA_DIETA)[number];

interface DietaInserir { tabela: TabelaDieta; operacao: "inserir"; campos: Campos; obrigatorios: readonly string[]; fixos?: Fixos; volta?: string }
interface DietaLote { tabela: TabelaDieta; operacao: "inserir_lote"; campos: Campos; obrigatorios: readonly string[]; maxLinhas: number; volta?: string }
interface DietaEditar { tabela: TabelaDieta; operacao: "editar"; campos: Campos; vivos?: boolean; volta?: string }
interface DietaExcluirSuave { tabela: TabelaDieta; operacao: "excluir_suave"; vivos?: boolean }
interface DietaExcluir { tabela: TabelaDieta; operacao: "excluir" }
interface DietaEspecial { tabela: TabelaDieta | null; operacao: "especial"; rpc?: RpcDaDieta; tambem?: readonly TabelaDieta[] }
export type DefinicaoAcaoDieta = DietaInserir | DietaLote | DietaEditar | DietaExcluirSuave | DietaExcluir | DietaEspecial;

// as colunas de cada entidade da Dieta (os tetos ficam ACIMA dos da tela; o limite fino é o check do banco)
const DIAS_SEMANA: Campo = { tipo: "inteiros", maxItens: 7, min: 1, max: 7 };
const ORDEM: Campo = { tipo: "numero", inteiro: true, min: 0, max: 100_000 };
const HORA: Campo = texto(20, true); // refeicoes.horario (time): "07:00" ou nulo — o banco confere o formato
const LISTA_PEQUENA: Campo = { tipo: "json", forma: "lista", maxBytes: 100_000 }; // ativos da fórmula, substitutos do item

const C_PLANO: Campos = { titulo: texto(TITULO), kcal_alvo: numeroNulo, observacao: texto(MEDIO, true), favorito: booleano };
const C_REFEICAO: Campos = { nome: texto(TITULO), horario: HORA, observacao: texto(CURTO, true), dias_semana: DIAS_SEMANA };
const C_ITEM: Campos = { quantidade_g: numero, medida_caseira_id: uuidNulo, quantidade_medida: numeroNulo, observacao: texto(CURTO, true) };
const C_ITEM_NOVO: Campos = { refeicao_id: uuid, alimento_id: uuid, receita_id: uuidNulo, ordem: ORDEM, ...C_ITEM };
const OBRIGATORIOS_ITEM = ["refeicao_id", "alimento_id", "quantidade_g", "ordem"] as const;
export const C_REGISTRO_DIARIO: Campos = {
  data, agua_ml: { tipo: "numero", inteiro: true, min: 0, max: 100_000 }, sintomas: lista, observacao: texto(CURTO, true),
};
const C_CALCULO: Campos = {
  data: instante, formula: texto(TITULO), peso: numeroNulo, altura: numeroNulo, idade: inteiroNulo, sexo: texto(TITULO, true), massa_magra: numeroNulo,
  fator_atividade: numero, atividades: lista, tmb: numeroNulo, get: numeroNulo, ajuste_kcal: numero, vet: numeroNulo, objetivo: texto(TITULO),
  observacao: texto(MEDIO, true),
};
const C_PRODUTO: Campos = {
  nome: texto(TITULO), marca: texto(TITULO), categoria: texto(TITULO), apresentacao: texto(TITULO), dose_padrao: texto(TITULO), modo_uso: texto(CURTO),
  link: texto(CURTO), observacao: texto(CURTO), favorito: booleano,
};
const C_INDICACAO: Campos = {
  dose: texto(TITULO), horario: texto(CURTO), duracao: texto(CURTO), inicio: data, observacao: texto(CURTO), ativa: booleano, ordem: ORDEM,
};
const C_INDICACAO_NOVA: Campos = {
  paciente_id: uuid, produto_id: uuidNulo, produto_nome: texto(TITULO), produto_marca: texto(CURTO), produto_apresentacao: texto(CURTO),
  produto_categoria: texto(TITULO), dose: texto(TITULO), horario: texto(CURTO), duracao: texto(CURTO), inicio: data, observacao: texto(CURTO), ordem: ORDEM,
};
const C_MODELO_FORMULA: Campos = {
  titulo: texto(TITULO), ativos: LISTA_PEQUENA, posologia: texto(CURTO), quantidade: texto(TITULO), observacao: texto(CURTO), favorito: booleano,
};
const C_FORMULA: Campos = { titulo: texto(TITULO), ativos: LISTA_PEQUENA, posologia: texto(CURTO), quantidade: texto(TITULO), observacao: texto(CURTO) };
const C_MODELO_META: Campos = { titulo: texto(TITULO), descricao: texto(CURTO), dias_semana: DIAS_SEMANA, favorito: booleano };
const C_META: Campos = { titulo: texto(TITULO), descricao: texto(CURTO), dias_semana: DIAS_SEMANA, ativa: booleano };
const C_MODELO_ORIENTACAO: Campos = { titulo: texto(TITULO), conteudo: texto(LONGO), favorito: booleano };
const C_ORIENTACAO: Campos = { titulo: texto(TITULO), conteudo: texto(LONGO) };
/** O alimento próprio e as medidas caseiras (a RPC dieta_salvar_alimento). */
export const C_ALIMENTO: Campos = {
  nome: texto(TITULO), grupo: texto(TITULO, true), porcao_g: numero, energia_kcal: numeroNulo, proteina_g: numeroNulo, carboidrato_g: numeroNulo,
  lipidio_g: numeroNulo, fibra_g: numeroNulo, sodio_mg: numeroNulo, marca: texto(TITULO, true), nutrientes: objeto,
};
export const C_MEDIDA: Campos = { descricao: texto(TITULO), gramas: numero, ordem: ORDEM };
/** A receita e os ingredientes (a RPC dieta_salvar_receita; a ordem do ingrediente é a posição na lista, como hoje). */
export const C_RECEITA: Campos = {
  nome: texto(TITULO), grupo_id: uuidNulo, porcoes: numero, rendimento_g: numeroNulo, tempo_preparo_min: inteiroNulo, modo_preparo: texto(MEDIO),
  observacao: texto(CURTO), favorita: booleano,
};
export const C_INGREDIENTE: Campos = {
  alimento_id: uuid, quantidade_g: numero, medida_caseira_id: uuidNulo, quantidade_medida: numeroNulo, ordem: ORDEM, observacao: texto(CURTO),
};

/** As ações da Dieta e das Dietas: a lista fechada (as do Prontuário ficam em ACOES; as do app do aluno, em ACOES_ALUNO). */
export const ACOES_DIETA = {
  // Plano: criar (o plano + as refeições padrão) e duplicar/usar modelo ★ numa chamada só (RPC); título/meta/★/excluir pela tabela
  plano_criar: { tabela: "planos_alimentares", operacao: "especial", rpc: "dieta_criar_plano", tambem: ["refeicoes"] },
  plano_editar: { tabela: "planos_alimentares", operacao: "editar", campos: C_PLANO },
  plano_excluir: { tabela: "planos_alimentares", operacao: "excluir_suave" },
  plano_duplicar: { tabela: "planos_alimentares", operacao: "especial", rpc: "dieta_duplicar_plano", tambem: ["refeicoes", "itens_refeicao"] },
  plano_copiar_semana: { tabela: "refeicoes", operacao: "especial", rpc: "dieta_copiar_semana" },
  // Subir/descer (refeições do plano, indicações do aluno): 1 chamada no lugar de N em paralelo
  dieta_ordenar: { tabela: null, operacao: "especial", rpc: "dieta_ordenar", tambem: ["refeicoes", "indicacoes_produto"] },
  // Refeições e itens (o excluir é físico, como hoje: a refeição leva os itens e as marcações do aluno em cascata)
  refeicao_criar: { tabela: "refeicoes", operacao: "inserir", campos: { plano_id: uuid, ordem: ORDEM, ...C_REFEICAO }, obrigatorios: ["plano_id", "nome", "ordem"] },
  refeicao_editar: { tabela: "refeicoes", operacao: "editar", campos: C_REFEICAO },
  refeicao_excluir: { tabela: "refeicoes", operacao: "excluir" },
  item_criar: { tabela: "itens_refeicao", operacao: "inserir", campos: C_ITEM_NOVO, obrigatorios: OBRIGATORIOS_ITEM, volta: VOLTA_ITEM },
  itens_criar: { tabela: "itens_refeicao", operacao: "inserir_lote", campos: C_ITEM_NOVO, obrigatorios: OBRIGATORIOS_ITEM, maxLinhas: 200, volta: VOLTA_ITEM },
  item_editar: { tabela: "itens_refeicao", operacao: "editar", campos: { ...C_ITEM, substitutos: LISTA_PEQUENA }, volta: VOLTA_ITEM },
  item_excluir: { tabela: "itens_refeicao", operacao: "excluir" },
  // Acompanhamento (1 registro vivo por aluno/dia: salvar = editar o do dia ou inserir — o índice único é parcial)
  registro_diario_salvar: { tabela: "registros_diarios", operacao: "especial" },
  registro_diario_editar: { tabela: "registros_diarios", operacao: "editar", campos: C_REGISTRO_DIARIO },
  registro_diario_excluir: { tabela: "registros_diarios", operacao: "excluir_suave" },
  // Cálculo energético (os valores calculados na tela; aqui a forma)
  calculo_energetico_criar: { tabela: "calculos_energeticos", operacao: "inserir", campos: { paciente_id: uuid, ...C_CALCULO }, obrigatorios: ["paciente_id"] },
  calculo_energetico_editar: { tabela: "calculos_energeticos", operacao: "editar", campos: C_CALCULO },
  calculo_energetico_excluir: { tabela: "calculos_energeticos", operacao: "excluir_suave" },
  // Suplementos: o catálogo (produtos) e as indicações do aluno (a CÓPIA do produto; nasce ativa)
  produto_criar: { tabela: "produtos", operacao: "inserir", campos: C_PRODUTO, obrigatorios: ["nome"] },
  produto_editar: { tabela: "produtos", operacao: "editar", campos: C_PRODUTO },
  produto_excluir: { tabela: "produtos", operacao: "excluir_suave" },
  indicacao_criar: {
    tabela: "indicacoes_produto", operacao: "inserir", campos: C_INDICACAO_NOVA, obrigatorios: ["paciente_id", "produto_nome", "dose"],
    fixos: () => ({ ativa: true }),
  },
  indicacao_editar: { tabela: "indicacoes_produto", operacao: "editar", campos: C_INDICACAO },
  indicacao_excluir: { tabela: "indicacoes_produto", operacao: "excluir_suave" },
  // Manipulados: os modelos e as fórmulas do aluno (a fórmula guarda a PRÓPRIA cópia do modelo)
  modelo_formula_criar: { tabela: "modelos_formula", operacao: "inserir", campos: C_MODELO_FORMULA, obrigatorios: ["titulo"] },
  modelo_formula_editar: { tabela: "modelos_formula", operacao: "editar", campos: C_MODELO_FORMULA },
  modelo_formula_excluir: { tabela: "modelos_formula", operacao: "excluir_suave" },
  formula_criar: { tabela: "formulas_manipuladas", operacao: "inserir", campos: { paciente_id: uuid, modelo_id: uuidNulo, ...C_FORMULA }, obrigatorios: ["paciente_id", "titulo"] },
  formula_editar: { tabela: "formulas_manipuladas", operacao: "editar", campos: C_FORMULA },
  formula_excluir: { tabela: "formulas_manipuladas", operacao: "excluir_suave" },
  // Metas
  modelo_meta_criar: { tabela: "modelos_meta", operacao: "inserir", campos: C_MODELO_META, obrigatorios: ["titulo"] },
  modelo_meta_editar: { tabela: "modelos_meta", operacao: "editar", campos: C_MODELO_META },
  modelo_meta_excluir: { tabela: "modelos_meta", operacao: "excluir_suave" },
  meta_criar: { tabela: "metas", operacao: "inserir", campos: { paciente_id: uuid, modelo_id: uuidNulo, ...C_META }, obrigatorios: ["paciente_id", "titulo", "dias_semana"] },
  meta_editar: { tabela: "metas", operacao: "editar", campos: C_META },
  meta_excluir: { tabela: "metas", operacao: "excluir_suave" },
  // Orientações
  modelo_orientacao_criar: { tabela: "modelos_orientacao", operacao: "inserir", campos: C_MODELO_ORIENTACAO, obrigatorios: ["titulo"] },
  modelo_orientacao_editar: { tabela: "modelos_orientacao", operacao: "editar", campos: C_MODELO_ORIENTACAO },
  modelo_orientacao_excluir: { tabela: "modelos_orientacao", operacao: "excluir_suave" },
  orientacao_criar: { tabela: "orientacoes", operacao: "inserir", campos: { paciente_id: uuid, modelo_id: uuidNulo, ...C_ORIENTACAO }, obrigatorios: ["paciente_id", "titulo"] },
  orientacao_editar: { tabela: "orientacoes", operacao: "editar", campos: C_ORIENTACAO },
  orientacao_excluir: { tabela: "orientacoes", operacao: "excluir_suave" },
  // Dietas › Alimentos: o alimento e as medidas numa chamada só (editar TROCA as medidas — o mesmo efeito de hoje)
  alimento_salvar: { tabela: "alimentos", operacao: "especial", rpc: "dieta_salvar_alimento", tambem: ["medidas_caseiras"] },
  alimento_excluir: { tabela: "alimentos", operacao: "excluir_suave", vivos: true },
  // Dietas › Receitas e grupos
  receita_salvar: { tabela: "receitas", operacao: "especial", rpc: "dieta_salvar_receita", tambem: ["ingredientes_receita"] },
  receita_editar: { tabela: "receitas", operacao: "editar", campos: { favorita: booleano }, vivos: true, volta: VOLTA_RECEITA },
  receita_excluir: { tabela: "receitas", operacao: "excluir_suave", vivos: true },
  grupo_receita_criar: { tabela: "grupos_receita", operacao: "inserir", campos: { nome: texto(TITULO) }, obrigatorios: ["nome"] },
  grupo_receita_editar: { tabela: "grupos_receita", operacao: "editar", campos: { nome: texto(TITULO) }, vivos: true },
  grupo_receita_excluir: { tabela: "grupos_receita", operacao: "especial", rpc: "dieta_excluir_grupo_receita", tambem: ["receitas"] },
  // Dietas › Diário: a reação da nutri (o "agora" é do servidor) e o excluir (a linha à Lixeira e DEPOIS a foto, como os anexos)
  diario_reagir: { tabela: "diario_alimentar", operacao: "especial" },
  diario_excluir: { tabela: "diario_alimentar", operacao: "especial" },
} as const satisfies Record<string, DefinicaoAcaoDieta>;

export type AcaoDieta = keyof typeof ACOES_DIETA;
export const ACOES_DA_DIETA = Object.keys(ACOES_DIETA) as AcaoDieta[];

/** A ação da Dieta, se está na lista fechada; senão null. */
export function acaoDaDieta(v: unknown): AcaoDieta | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACOES_DIETA, v) ? (v as AcaoDieta) : null;
}

export type GravacaoDieta =
  | { ok: true; tabela: TabelaDieta; operacao: "inserir"; valores: Record<string, unknown>; volta: string }
  | { ok: true; tabela: TabelaDieta; operacao: "inserir_lote"; linhas: Array<Record<string, unknown>>; volta: string }
  | { ok: true; tabela: TabelaDieta; operacao: "editar"; id: string; valores: Record<string, unknown>; vivos: boolean; volta: string }
  | { ok: true; tabela: TabelaDieta; operacao: "excluir_suave"; id: string; valores: { deleted_at: string }; vivos: boolean }
  | { ok: true; tabela: TabelaDieta; operacao: "excluir"; id: string }
  | { ok: false; erro: "acao_invalida" | "dados_invalidos"; campo?: string };

/**
 * Monta a gravação de uma ação declarativa da Dieta: confere o corpo pela lista da ação e põe o dono (nutricionista_id = `userId`) no
 * inserir das tabelas que têm dono. Ação especial (RPC, registro do dia, diário) não passa por aqui → acao_invalida.
 */
export function montarGravacaoDieta(acao: string, corpo: Record<string, unknown>, userId: string, agora: Date = new Date()): GravacaoDieta {
  const nome = acaoDaDieta(acao);
  if (!nome) return { ok: false, erro: "acao_invalida" };
  const def: DefinicaoAcaoDieta = ACOES_DIETA[nome];
  if (!ehUuid(userId)) return { ok: false, erro: "dados_invalidos", campo: "user" };
  switch (def.operacao) {
    case "inserir": {
      const r = lerCampos(corpo, def.campos, def.obrigatorios);
      if (r.ok === false) return r;
      const dono = temDono(def.tabela) ? { nutricionista_id: userId } : {};
      return { ok: true, tabela: def.tabela, operacao: "inserir", valores: { ...r.valores, ...(def.fixos?.(agora) ?? {}), ...dono }, volta: def.volta ?? "*" };
    }
    case "inserir_lote": {
      const brutas = corpo.linhas;
      if (!Array.isArray(brutas) || brutas.length < 1 || brutas.length > def.maxLinhas) return { ok: false, erro: "dados_invalidos", campo: "linhas" };
      const dono = temDono(def.tabela) ? { nutricionista_id: userId } : {};
      const linhas: Array<Record<string, unknown>> = [];
      for (const bruta of brutas) {
        if (!bruta || typeof bruta !== "object" || Array.isArray(bruta)) return { ok: false, erro: "dados_invalidos", campo: "linhas" };
        const l = lerCampos(bruta as Record<string, unknown>, def.campos, def.obrigatorios);
        if (l.ok === false) return l;
        linhas.push({ ...l.valores, ...dono });
      }
      return { ok: true, tabela: def.tabela, operacao: "inserir_lote", linhas, volta: def.volta ?? "*" };
    }
    case "editar": {
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      const r = lerCampos(corpo, def.campos);
      if (r.ok === false) return r;
      if (Object.keys(r.valores).length === 0) return { ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" };
      return { ok: true, tabela: def.tabela, operacao: "editar", id: corpo.id.toLowerCase(), valores: r.valores, vivos: def.vivos === true, volta: def.volta ?? "*" };
    }
    case "excluir_suave":
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      return {
        ok: true, tabela: def.tabela, operacao: "excluir_suave", id: corpo.id.toLowerCase(), valores: { deleted_at: agora.toISOString() }, vivos: def.vivos === true,
      };
    case "excluir":
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      return { ok: true, tabela: def.tabela, operacao: "excluir", id: corpo.id.toLowerCase() };
    case "especial":
      return { ok: false, erro: "acao_invalida" };
  }
}

type Recusa<E extends string = "dados_invalidos"> = { ok: false; erro: E; campo?: string };
const recusada = (campo: string): Recusa => ({ ok: false, erro: "dados_invalidos", campo });
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Uma lista de objetos, cada um conferido pelos campos (null = a lista ou um item fora da forma; o nome do campo vai no erro). */
function lerLista(v: unknown, max: number, campos: Campos, obrigatorios: readonly string[], nome: string):
  | { ok: true; linhas: Array<Record<string, unknown>> }
  | Recusa {
  if (!Array.isArray(v) || v.length > max) return recusada(nome);
  const linhas: Array<Record<string, unknown>> = [];
  for (const bruta of v) {
    if (!ehObjeto(bruta)) return recusada(nome);
    const l = lerCampos(bruta, campos, obrigatorios);
    if (l.ok === false) return l;
    linhas.push(l.valores);
  }
  return { ok: true, linhas };
}

/** Uma lista de uuids sem repetição (até `max`); ausente = vazia. */
function lerIds(v: unknown, max: number): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max || !v.every(ehUuid)) return null;
  const ids = v.map((x) => x.toLowerCase());
  return new Set(ids).size === ids.length ? ids : null;
}

/** plano_criar { paciente_id, titulo, kcal_alvo, observacao, calculo_energetico_id, refeicoes: [{ nome, horario, ordem }] } (até 30). */
export function lerPlanoNovo(corpo: Record<string, unknown>):
  | { ok: true; pacienteId: string; plano: Record<string, unknown>; refeicoes: Array<Record<string, unknown>> }
  | Recusa {
  const r = lerCampos(corpo, { paciente_id: uuid, calculo_energetico_id: uuidNulo, titulo: texto(TITULO), kcal_alvo: numeroNulo, observacao: texto(MEDIO, true) },
    ["paciente_id", "titulo"]);
  if (r.ok === false) return r;
  const refs = lerLista(corpo.refeicoes, 30, { nome: texto(TITULO), horario: HORA, ordem: ORDEM }, ["nome", "ordem"], "refeicoes");
  if (refs.ok === false) return refs;
  const { paciente_id, ...plano } = r.valores;
  return { ok: true, pacienteId: String(paciente_id), plano, refeicoes: refs.linhas };
}

/** plano_duplicar { plano_id, titulo, paciente_id? } — sem paciente: "Duplicar" (o mesmo aluno); com: "Usar modelo ★". */
export function lerDuplicarPlano(corpo: Record<string, unknown>): { ok: true; planoId: string; pacienteId: string | null; titulo: string } | Recusa {
  const r = lerCampos(corpo, { plano_id: uuid, paciente_id: uuidNulo, titulo: texto(TITULO) }, ["plano_id", "titulo"]);
  if (r.ok === false) return r;
  const titulo = String(r.valores.titulo);
  if (!titulo.trim()) return recusada("titulo");
  return { ok: true, planoId: String(r.valores.plano_id), pacienteId: typeof r.valores.paciente_id === "string" ? r.valores.paciente_id : null, titulo };
}

/** plano_copiar_semana { para_todos, para_apagar } — ids de refeições (até 200 cada), sem repetição e sem o mesmo id nas 2. */
export function lerCopiarSemana(corpo: Record<string, unknown>): { ok: true; paraTodos: string[]; paraApagar: string[] } | Recusa {
  const paraTodos = lerIds(corpo.para_todos, 200);
  if (!paraTodos) return recusada("para_todos");
  const paraApagar = lerIds(corpo.para_apagar, 200);
  if (!paraApagar) return recusada("para_apagar");
  if (!paraTodos.length && !paraApagar.length) return recusada("nada_a_mudar");
  if (paraTodos.some((id) => paraApagar.includes(id))) return recusada("para_apagar");
  return { ok: true, paraTodos, paraApagar };
}

/** As tabelas que o dieta_ordenar aceita (a mesma lista fechada da RPC). */
export const TABELAS_QUE_ORDENAM = ["refeicoes", "indicacoes_produto"] as const;
/** dieta_ordenar { tabela, ordens: [{ id, ordem }] } (1 a 200, sem id repetido): só as que mudaram, como a tela manda hoje. */
export function lerOrdenar(corpo: Record<string, unknown>):
  | { ok: true; tabela: (typeof TABELAS_QUE_ORDENAM)[number]; ids: string[]; ordens: number[] }
  | Recusa {
  const tabela = corpo.tabela;
  if (typeof tabela !== "string" || !(TABELAS_QUE_ORDENAM as readonly string[]).includes(tabela)) return recusada("tabela");
  const l = lerLista(corpo.ordens, 200, { id: uuid, ordem: ORDEM }, ["id", "ordem"], "ordens");
  if (l.ok === false) return l;
  if (!l.linhas.length) return recusada("ordens");
  const ids = l.linhas.map((x) => String(x.id));
  if (new Set(ids).size !== ids.length) return recusada("ordens");
  return { ok: true, tabela: tabela as (typeof TABELAS_QUE_ORDENAM)[number], ids, ordens: l.linhas.map((x) => Number(x.ordem)) };
}

/** receita_salvar { id?, receita: {…}, ingredientes: [...] } (até 100): sem id cria; com id edita a viva e TROCA os ingredientes. */
export function lerReceita(corpo: Record<string, unknown>):
  | { ok: true; id: string | null; receita: Record<string, unknown>; ingredientes: Array<Record<string, unknown>> }
  | Recusa {
  const id = corpo.id === undefined || corpo.id === null ? null : ehUuid(corpo.id) ? corpo.id.toLowerCase() : undefined;
  if (id === undefined) return recusada("id");
  if (!ehObjeto(corpo.receita)) return recusada("receita");
  const r = lerCampos(corpo.receita, C_RECEITA, id ? [] : ["nome"]);
  if (r.ok === false) return r;
  const ing = lerLista(corpo.ingredientes, 100, C_INGREDIENTE, ["alimento_id", "quantidade_g"], "ingredientes");
  if (ing.ok === false) return ing;
  return { ok: true, id, receita: r.valores, ingredientes: ing.linhas };
}

/** alimento_salvar { id?, alimento: {…}, medidas: [...] } (até 50): sem id cria o próprio; com id edita e TROCA as medidas. */
export function lerAlimento(corpo: Record<string, unknown>):
  | { ok: true; id: string | null; alimento: Record<string, unknown>; medidas: Array<Record<string, unknown>> }
  | Recusa {
  const id = corpo.id === undefined || corpo.id === null ? null : ehUuid(corpo.id) ? corpo.id.toLowerCase() : undefined;
  if (id === undefined) return recusada("id");
  if (!ehObjeto(corpo.alimento)) return recusada("alimento");
  const a = lerCampos(corpo.alimento, C_ALIMENTO, id ? [] : ["nome"]);
  if (a.ok === false) return a;
  const m = lerLista(corpo.medidas, 50, C_MEDIDA, ["descricao", "gramas", "ordem"], "medidas");
  if (m.ok === false) return m;
  return { ok: true, id, alimento: a.valores, medidas: m.linhas };
}

/** registro_diario_salvar { paciente_id, data, agua_ml, sintomas, observacao }: o do dia vira edição; sem ele, insere. */
export function lerRegistroDiario(corpo: Record<string, unknown>, userId: string):
  | { ok: true; pacienteId: string; dia: string; valores: Record<string, unknown> }
  | Recusa {
  const r = lerCampos(corpo, { paciente_id: uuid, ...C_REGISTRO_DIARIO }, ["paciente_id", "data"]);
  if (r.ok === false) return r;
  if (!ehUuid(userId)) return recusada("user");
  const { paciente_id, ...valores } = r.valores;
  return { ok: true, pacienteId: String(paciente_id), dia: String(valores.data), valores };
}

/** As reações da nutri ao diário (o check do banco) e o teto do comentário dela (o COMENTARIO_NUTRI_MAX da tela). */
export const REACOES_DIARIO = ["otimo", "bom", "atencao", "evitar"] as const;
export const COMENTARIO_NUTRI_MAX = 300;
/** diario_reagir { id, reacao, comentario }: reação → a reação, o comentário (aparado, até 300) e o agora do SERVIDOR; null → tira tudo. */
export function lerReacao(corpo: Record<string, unknown>, agora: Date = new Date()): { ok: true; id: string; valores: Record<string, unknown> } | Recusa {
  if (!ehUuid(corpo.id)) return recusada("id");
  const reacao = corpo.reacao;
  if (reacao !== null && reacao !== undefined && !(typeof reacao === "string" && (REACOES_DIARIO as readonly string[]).includes(reacao))) return recusada("reacao");
  const comentario = corpo.comentario;
  if (comentario !== undefined && comentario !== null && (typeof comentario !== "string" || comentario.length > CURTO)) return recusada("comentario");
  const valores = typeof reacao === "string"
    ? { reacao_nutri: reacao, comentario_nutri: (typeof comentario === "string" ? comentario : "").trim().slice(0, COMENTARIO_NUTRI_MAX), reagido_em: agora.toISOString() }
    : { reacao_nutri: null, comentario_nutri: "", reagido_em: null };
  return { ok: true, id: corpo.id.toLowerCase(), valores };
}

// ───────────────────────── os padrões da Dieta (H-81, decisão C da hml-19b) ─────────────────────────
/** As 3 seções da Dieta que a função semeia (a RPC da 19a já aceita), a tabela e a ordem da lista (a mesma das libs da tela). */
export const PADROES_DIETA: Record<"formula" | "meta" | "orientacao", { tabela: TabelaDieta; ordem: string }> = {
  formula: { tabela: "modelos_formula", ordem: "titulo" },
  meta: { tabela: "modelos_meta", ordem: "titulo" },
  orientacao: { tabela: "modelos_orientacao", ordem: "titulo" },
};
export type SecaoDoPadraoDaDieta = keyof typeof PADROES_DIETA;
export function secaoDoPadraoDaDieta(v: unknown): SecaoDoPadraoDaDieta | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PADROES_DIETA, v) ? (v as SecaoDoPadraoDaDieta) : null;
}

// ───────────────────────── o app do aluno (decisão 14): as MESMAS RPCs de hoje, como a pessoa ─────────────────────────
export const ACOES_ALUNO = {
  aluno_marcar_refeicao: { rpc: "paciente_marcar_refeicao", id: "refeicao_id" },
  aluno_marcar_meta: { rpc: "aluno_marcar_meta", id: "meta_id" },
  aluno_diario_preparar: { rpc: null, id: null },
  aluno_diario_enviar: { rpc: "diario_enviar", id: null },
} as const;
export type AcaoAluno = keyof typeof ACOES_ALUNO;
export const ACOES_DO_ALUNO = Object.keys(ACOES_ALUNO) as AcaoAluno[];
export function acaoDoAluno(v: unknown): AcaoAluno | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACOES_ALUNO, v) ? (v as AcaoAluno) : null;
}

/** Os códigos que as RPCs do app devolvem (raise exception '<código>') e a tela do app já traduz — vão à tela como o código. */
export const ERROS_DA_MARCACAO = ["data_invalida", "sem_alimentos", "meta_pausada", "fora_do_dia"] as const;
export const ERROS_DO_DIARIO = [
  "codigo_invalido", "diario_desligado", "link_desligado", "refeicao_invalida", "path_invalido", "arquivo_nao_encontrado", "arquivo_invalido",
  "data_invalida", "muitos_envios",
] as const;
/** O código das RPCs da Dieta que não é erro do banco (raise exception 'nao_encontrado' using errcode 'P0002'). */
export const ERROS_DAS_RPCS_DA_DIETA = ["nao_encontrado"] as const;

/** O erro de uma RPC: a mensagem é um dos `conhecidos` (raise exception '<código>') → ele, sem aviso; senão, a tradução do banco. */
export function erroDaRpc(e: { code?: unknown; message?: unknown } | null | undefined, conhecidos: readonly string[]): { erro: string; inesperado: boolean } {
  const msg = typeof e?.message === "string" ? e.message.trim() : "";
  if (msg && conhecidos.includes(msg)) return { erro: msg, inesperado: false };
  return erroDoBanco(e);
}

/** aluno_marcar_refeicao { refeicao_id, data, concluida } · aluno_marcar_meta { meta_id, data, concluida }. */
export function lerMarcacao(corpo: Record<string, unknown>, campoId: "refeicao_id" | "meta_id"): { ok: true; id: string; dia: string; concluida: boolean } | Recusa {
  const r = lerCampos(corpo, { [campoId]: uuid, data, concluida: booleano }, [campoId, "data", "concluida"]);
  if (r.ok === false) return r;
  return { ok: true, id: String(r.valores[campoId]), dia: String(r.valores.data), concluida: r.valores.concluida === true };
}

/** As fotos do diário (o allowed_mime_types do bucket e o FOTO_TAMANHO_MAX da tela): tipo → extensão do arquivo. */
export const DIARIO_MIMES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};
export const DIARIO_MAX_BYTES = 10 * 1024 * 1024;
/** O bucket do ambiente (hml-02b: no staging, o "-staging"). */
export function bucketDoDiario(schema: "public" | "staging"): string {
  return schema === "staging" ? "diario-staging" : "diario";
}
/** O caminho da foto, montado NO SERVIDOR: <nutricionista>/<aluno>/<uuid>.<ext> — o formato que a policy do Storage e a diario_enviar exigem. */
export function caminhoDoDiario(nutriId: string, pacienteId: string, mime: string, id: string): string {
  return `${nutriId.toLowerCase()}/${pacienteId.toLowerCase()}/${id.toLowerCase()}.${DIARIO_MIMES[mime] ?? "jpg"}`;
}
const ARQUIVO_DO_DIARIO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif)$/;
/** O caminho é de uma foto daquele aluno, na pasta da nutri dele, no formato do caminhoDoDiario? (N9: outra pasta → recusa) */
export function caminhoDoDiarioValido(caminho: unknown, nutriId: string, pacienteId: string): caminho is string {
  if (typeof caminho !== "string" || caminho.length > 200) return false;
  const partes = caminho.split("/");
  return partes.length === 3 && partes[0] === nutriId.toLowerCase() && partes[1] === pacienteId.toLowerCase() && ARQUIVO_DO_DIARIO.test(partes[2]);
}

/** aluno_diario_preparar { paciente_id, nutricionista_id, tipo, tamanho }: a matrícula (o aluno e a nutri dele), o tipo e até 10 MB. */
export function lerPedidoDeFotoDoDiario(corpo: Record<string, unknown>):
  | { ok: true; pacienteId: string; nutriId: string; mime: string; tamanho: number }
  | Recusa<"dados_invalidos" | "tipo_invalido" | "arquivo_grande"> {
  if (!ehUuid(corpo.paciente_id)) return recusada("paciente_id");
  if (!ehUuid(corpo.nutricionista_id)) return recusada("nutricionista_id");
  const mime = typeof corpo.tipo === "string" ? corpo.tipo.trim().toLowerCase() : "";
  if (!Object.prototype.hasOwnProperty.call(DIARIO_MIMES, mime)) return { ok: false, erro: "tipo_invalido" };
  const tamanho = corpo.tamanho;
  if (typeof tamanho !== "number" || !Number.isInteger(tamanho) || tamanho <= 0) return recusada("tamanho");
  if (tamanho > DIARIO_MAX_BYTES) return { ok: false, erro: "arquivo_grande" };
  return { ok: true, pacienteId: corpo.paciente_id.toLowerCase(), nutriId: corpo.nutricionista_id.toLowerCase(), mime, tamanho };
}

/** aluno_diario_enviar { …o pedido, caminho, codigo, refeicao, comentario, data_hora }: o caminho tem de ser da pasta daquela matrícula. */
export function lerEnvioDoDiario(corpo: Record<string, unknown>):
  | { ok: true; pacienteId: string; nutriId: string; mime: string; tamanho: number; caminho: string; codigo: string; refeicao: string; comentario: string; dataHora: string }
  | Recusa<"dados_invalidos" | "tipo_invalido" | "arquivo_grande" | "fora_da_pasta"> {
  const p = lerPedidoDeFotoDoDiario(corpo);
  if (p.ok === false) return p;
  if (!caminhoDoDiarioValido(corpo.caminho, p.nutriId, p.pacienteId)) return { ok: false, erro: "fora_da_pasta" };
  const r = lerCampos(corpo, { codigo: texto(100), refeicao: texto(40), comentario: texto(CURTO), data_hora: instante }, ["codigo", "refeicao", "data_hora"]);
  if (r.ok === false) return r;
  const codigo = String(r.valores.codigo).trim().toLowerCase();
  if (!codigo) return recusada("codigo");
  return {
    ok: true, pacienteId: p.pacienteId, nutriId: p.nutriId, mime: p.mime, tamanho: p.tamanho, caminho: corpo.caminho as string, codigo,
    refeicao: String(r.valores.refeicao), comentario: typeof r.valores.comentario === "string" ? r.valores.comentario.trim() : "", dataHora: String(r.valores.data_hora),
  };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// hml-19c (H-41 · jeito 2, 11/10/2026) — a Avaliação (Perfil do aluno › Avaliação), a parte do banco principal (spec hml-19 §1.4,
// §2.4 item 2). O MESMO desenho, em listas à parte (as do Prontuário, da Dieta e do app do aluno não mudam):
//   · antropometria_criar | _editar | _excluir: o CRUD declarativo de `antropometrias` com as colunas que a tela grava hoje (o colunas(r)
//     de src/nutricao/editor/lib/antropometrias.ts), com tipo e tamanho; o dono (nutricionista_id) = quem chama; excluir = a Lixeira;
//   · as fotos de evolução: foto_evolucao_preparar (o caminho <quem chama>/<aluno>/<uuid>-<nome seguro> — o montarPath de hoje = o
//     caminhoDoAnexo —, o tipo e o tamanho com os limites da tela e do bucket) → o navegador sobe no link assinado →
//     foto_evolucao_registrar (o caminho de quem chama + posição, data e observação) · _editar (posição, data, observação) · _excluir;
//   · avaliacao_avisar { alunoId }: a RPC aluno_avisar_avaliacao de hoje (definer), como a pessoa.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** As 2 tabelas da Avaliação no principal (spec §1.4): a antropometria e as fotos de evolução (o arquivo fica no bucket evolucao). */
export const TABELAS_AVALIACAO = ["antropometrias", "fotos_evolucao"] as const;
export type TabelaAvaliacao = (typeof TABELAS_AVALIACAO)[number];

/** Os protocolos de % de gordura e os sexos (os checks de `antropometrias` e o PROTOCOLOS/SEXOS da tela). */
export const PROTOCOLOS_ANTROPOMETRIA = ["nenhum", "pollock3", "pollock7", "faulkner", "guedes"] as const;
export const SEXOS_ANTROPOMETRIA = ["masculino", "feminino"] as const;
/** As 4 posições da foto de evolução (o check de `fotos_evolucao` e o POSICOES da tela). */
export const POSICOES_FOTO_EVOLUCAO = ["frente", "costas", "lado_d", "lado_e"] as const;

/** Medidas e resultados da antropometria (jsonb objeto: {"cintura": 80.5, …}). */
const MEDIDAS: Campo = { tipo: "json", forma: "objeto", maxBytes: 100_000 };
/**
 * As colunas que a tela grava hoje (o colunas(r) de antropometrias.ts: data, peso, altura, sexo, idade, protocolo, circunferências,
 * dobras, resultados e observação), com tipo e tamanho. Os números ficam sem teto aqui: o limite fino é o check do banco (peso e altura
 * entre 0 e 1000, idade entre 0 e 130 → dados_invalidos).
 */
export const C_ANTROPOMETRIA: Campos = {
  data: instante, peso: numeroNulo, altura: numeroNulo, sexo: { tipo: "opcao", valores: SEXOS_ANTROPOMETRIA, nulo: true }, idade: inteiroNulo,
  protocolo: opcao(PROTOCOLOS_ANTROPOMETRIA), circunferencias: MEDIDAS, dobras: MEDIDAS, resultados: MEDIDAS, observacao: texto(MEDIO, true),
};
/** Posição, data e observação da foto de evolução (a imagem não muda: para trocar, exclui e envia outra — a regra de hoje). */
export const C_FOTO_EVOLUCAO: Campos = { posicao: opcao(POSICOES_FOTO_EVOLUCAO), data, observacao: texto(CURTO, true) };

interface AvaliacaoInserir { tabela: TabelaAvaliacao; operacao: "inserir"; campos: Campos; obrigatorios: readonly string[] }
interface AvaliacaoEditar { tabela: TabelaAvaliacao; operacao: "editar"; campos: Campos }
interface AvaliacaoExcluirSuave { tabela: TabelaAvaliacao; operacao: "excluir_suave" }
interface AvaliacaoEspecial { tabela: TabelaAvaliacao | null; operacao: "especial"; rpc?: "aluno_avisar_avaliacao" }
export type DefinicaoAcaoAvaliacao = AvaliacaoInserir | AvaliacaoEditar | AvaliacaoExcluirSuave | AvaliacaoEspecial;

/** As ações da Avaliação (as do Prontuário ficam em ACOES; as da Dieta em ACOES_DIETA; as do app do aluno em ACOES_ALUNO). */
export const ACOES_AVALIACAO = {
  // Antropometria (o excluir é a Lixeira — deleted_at —, como hoje)
  antropometria_criar: { tabela: "antropometrias", operacao: "inserir", campos: { paciente_id: uuid, ...C_ANTROPOMETRIA }, obrigatorios: ["paciente_id", "data"] },
  antropometria_editar: { tabela: "antropometrias", operacao: "editar", campos: C_ANTROPOMETRIA },
  antropometria_excluir: { tabela: "antropometrias", operacao: "excluir_suave" },
  // Fotos de evolução: o arquivo pelo link assinado (preparar → o navegador sobe → registrar); excluir = a linha à Lixeira e DEPOIS o arquivo
  foto_evolucao_preparar: { tabela: "fotos_evolucao", operacao: "especial" },
  foto_evolucao_registrar: { tabela: "fotos_evolucao", operacao: "especial" },
  foto_evolucao_editar: { tabela: "fotos_evolucao", operacao: "editar", campos: C_FOTO_EVOLUCAO },
  foto_evolucao_excluir: { tabela: "fotos_evolucao", operacao: "especial" },
  // O aviso "avaliação nova" no sino do aluno (NF9): a RPC de hoje, como a pessoa
  avaliacao_avisar: { tabela: null, operacao: "especial", rpc: "aluno_avisar_avaliacao" },
} as const satisfies Record<string, DefinicaoAcaoAvaliacao>;

export type AcaoAvaliacao = keyof typeof ACOES_AVALIACAO;
export const ACOES_DA_AVALIACAO = Object.keys(ACOES_AVALIACAO) as AcaoAvaliacao[];

/** A ação da Avaliação, se está na lista fechada; senão null. */
export function acaoDaAvaliacao(v: unknown): AcaoAvaliacao | null {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACOES_AVALIACAO, v) ? (v as AcaoAvaliacao) : null;
}

export type GravacaoAvaliacao =
  | { ok: true; tabela: TabelaAvaliacao; operacao: "inserir"; valores: Record<string, unknown> }
  | { ok: true; tabela: TabelaAvaliacao; operacao: "editar"; id: string; valores: Record<string, unknown> }
  | { ok: true; tabela: TabelaAvaliacao; operacao: "excluir_suave"; id: string; valores: { deleted_at: string } }
  | { ok: false; erro: "acao_invalida" | "dados_invalidos"; campo?: string };

/**
 * Monta a gravação de uma ação declarativa da Avaliação: confere o corpo pela lista da ação e põe o dono (nutricionista_id = `userId`)
 * no inserir. Ação especial (foto_evolucao_preparar/registrar/excluir, avaliacao_avisar) não passa por aqui → acao_invalida.
 */
export function montarGravacaoAvaliacao(acao: string, corpo: Record<string, unknown>, userId: string, agora: Date = new Date()): GravacaoAvaliacao {
  const nome = acaoDaAvaliacao(acao);
  if (!nome) return { ok: false, erro: "acao_invalida" };
  const def: DefinicaoAcaoAvaliacao = ACOES_AVALIACAO[nome];
  if (!ehUuid(userId)) return { ok: false, erro: "dados_invalidos", campo: "user" };
  switch (def.operacao) {
    case "inserir": {
      const r = lerCampos(corpo, def.campos, def.obrigatorios);
      if (r.ok === false) return r;
      return { ok: true, tabela: def.tabela, operacao: "inserir", valores: { ...r.valores, nutricionista_id: userId } };
    }
    case "editar": {
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      const r = lerCampos(corpo, def.campos);
      if (r.ok === false) return r;
      if (Object.keys(r.valores).length === 0) return { ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" };
      return { ok: true, tabela: def.tabela, operacao: "editar", id: corpo.id.toLowerCase(), valores: r.valores };
    }
    case "excluir_suave":
      if (!ehUuid(corpo.id)) return { ok: false, erro: "dados_invalidos", campo: "id" };
      return { ok: true, tabela: def.tabela, operacao: "excluir_suave", id: corpo.id.toLowerCase(), valores: { deleted_at: agora.toISOString() } };
    case "especial":
      return { ok: false, erro: "acao_invalida" };
  }
}

/** As fotos de evolução: 10 MB e JPEG/PNG/WebP — o bucket evolucao (file_size_limit, allowed_mime_types) e o validarImagem da tela. */
export const FOTO_EVOLUCAO_MAX_BYTES = 10 * 1024 * 1024;
export const FOTO_EVOLUCAO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
/** O bucket do ambiente (hml-02b: no staging, o "-staging" — teste nunca cai no bucket da produção). */
export function bucketDaEvolucao(schema: "public" | "staging"): string {
  return schema === "staging" ? "evolucao-staging" : "evolucao";
}

/** foto_evolucao_preparar { paciente_id, nome, tipo, tamanho }: o aluno, o nome (para o caminho), o tipo (só imagem do bucket) e até 10 MB. */
export function lerPedidoDeFotoEvolucao(corpo: Record<string, unknown>):
  | { ok: true; pacienteId: string; nome: string; mime: string; tamanho: number }
  | Recusa<"dados_invalidos" | "tipo_invalido" | "arquivo_grande"> {
  if (!ehUuid(corpo.paciente_id)) return recusada("paciente_id");
  const nome = typeof corpo.nome === "string" ? corpo.nome.trim() : "";
  if (!nome || nome.length > ANEXO_NOME_MAX) return recusada("nome");
  const mime = typeof corpo.tipo === "string" ? corpo.tipo.trim().toLowerCase() : "";
  if (!(FOTO_EVOLUCAO_MIMES as readonly string[]).includes(mime)) return { ok: false, erro: "tipo_invalido" };
  const tamanho = corpo.tamanho;
  if (typeof tamanho !== "number" || !Number.isInteger(tamanho) || tamanho <= 0) return recusada("tamanho");
  if (tamanho > FOTO_EVOLUCAO_MAX_BYTES) return { ok: false, erro: "arquivo_grande" };
  return { ok: true, pacienteId: corpo.paciente_id.toLowerCase(), nome, mime, tamanho };
}

/**
 * foto_evolucao_registrar { …o pedido, caminho, posicao, data, observacao }: o caminho tem de ser de quem chama, daquele aluno, no formato
 * do caminhoDoAnexo (N9: outra pasta → fora_da_pasta); posição e data obrigatórias; observação até o teto. O dono e o caminho são do
 * servidor; o tamanho que vale é o do arquivo que chegou (a função lê no Storage).
 */
export function lerRegistroDeFotoEvolucao(corpo: Record<string, unknown>, userId: string):
  | { ok: true; pacienteId: string; caminho: string; mime: string; tamanho: number; valores: Record<string, unknown> }
  | Recusa<"dados_invalidos" | "tipo_invalido" | "arquivo_grande" | "fora_da_pasta"> {
  const p = lerPedidoDeFotoEvolucao(corpo);
  if (p.ok === false) return p;
  if (!ehUuid(userId) || !caminhoDeQuemChama(corpo.caminho, userId, p.pacienteId)) return { ok: false, erro: "fora_da_pasta" };
  const r = lerCampos(corpo, C_FOTO_EVOLUCAO, ["posicao", "data"]);
  if (r.ok === false) return r;
  return { ok: true, pacienteId: p.pacienteId, caminho: corpo.caminho as string, mime: p.mime, tamanho: p.tamanho, valores: r.valores };
}

/** Os códigos que a w14_matricula_da_rota (dentro da aluno_avisar_avaliacao) devolve de propósito (raise exception '<código>'). */
export const ERROS_DO_AVISO = ["sem_login", "sem_acesso", "aluno_inexistente"] as const;

// ───────────────────────── o despacho: qual módulo da função atende o pedido ─────────────────────────
export type PedidoNutricao =
  | { modulo: "prontuario"; acao: AcaoNutricao }
  | { modulo: "dieta"; acao: AcaoDieta | "padroes_garantir" }
  | { modulo: "aluno"; acao: AcaoAluno }
  | { modulo: "avaliacao"; acao: AcaoAvaliacao };

/**
 * O módulo e a ação do pedido (null = acao_invalida). Os padrões das 3 seções da Dieta (fórmula, meta, orientação) vão ao módulo da
 * Dieta; os do Prontuário — e qualquer outra seção, que lá vira secao_invalida como antes — seguem no prontuario.ts, sem mudança.
 * hml-19c: as da Avaliação vão ao avaliacao.ts (as 4 listas não se cruzam — o nutricaoServidor.test.ts confere).
 */
export function moduloDoPedido(corpo: Record<string, unknown>): PedidoNutricao | null {
  const v = corpo.acao;
  if (v === "padroes_garantir" && secaoDoPadraoDaDieta(corpo.secao)) return { modulo: "dieta", acao: "padroes_garantir" };
  const prontuario = acaoDoPedido(v);
  if (prontuario) return { modulo: "prontuario", acao: prontuario };
  const dieta = acaoDaDieta(v);
  if (dieta) return { modulo: "dieta", acao: dieta };
  const aluno = acaoDoAluno(v);
  if (aluno) return { modulo: "aluno", acao: aluno };
  const avaliacao = acaoDaAvaliacao(v);
  if (avaliacao) return { modulo: "avaliacao", acao: avaliacao };
  return null;
}
