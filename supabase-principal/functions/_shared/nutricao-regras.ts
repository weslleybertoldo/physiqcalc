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
  | { tipo: "opcao"; valores: readonly string[] }
  | { tipo: "textos"; maxItens: number; maxItem: number }
  | { tipo: "json"; forma: "lista" | "objeto"; maxBytes: number };
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
