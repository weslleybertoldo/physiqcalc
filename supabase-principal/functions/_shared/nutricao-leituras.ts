// Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — o CATÁLOGO das leituras da função nutricao (ação `ler`), PURO: sem Deno, sem
// rede e sem banco. O motor (_shared/leitura-lote.ts) lê o pedido por este catálogo e o módulo functions/nutricao/leituras.ts roda cada
// consulta COMO A PESSOA (o RLS de hoje decide quem vê). Cada entrada declara: os params (tipo e teto; o resto do corpo cai), a fonte
// (a RPC de leitura de hoje com os args montados no servidor, ou a tabela com as colunas em lista fechada, os filtros e o teto), o dono
// (consulta "minha": a coluna = quem chama) e o que assinar (o servidor só assina caminho que a própria consulta leu).
// hml-20a — o app do aluno (spec hml-20 §2.5.1); o aluno não manda id nenhum de quem ele é: as RPCs usam o auth.uid() lá dentro.
//   aluno_dieta { dia }          a minha_dieta(p_dia) de hoje (planos, refeições, metas, os ✓ do dia e o diário dos 7 dias)
//   aluno_diario_urls { ids }    as fotos do próprio diário: relê id e path dos ids (≤ 60) como o aluno ("paciente: ler o proprio
//                                diario") e assina no bucket diario do ambiente (1 h) → linhas [{ id, path, url }]
//   aluno_evolucao               a minha_evolucao() de hoje (antropometrias e fotos de evolução de todas as matrículas) + a URL das
//                                fotos (bucket evolucao, 1 h) na MESMA ida — a PartePrincipal da Evolução
// hml-20b — o Painel › Aluno (spec hml-20 §2.5.2): a casca (aluno_perfil, aluno_evolucao_painel), o Resumo e o Prontuário ×10, a
// Avaliação e o PDF — as MESMAS leituras que as libs faziam no navegador (as mesmas linhas: "minha" só o que a lib já filtrava por quem
// está logado — o profissional; os modelos e catálogos o RLS decide, como hoje), agora COMO A PESSOA no servidor:
//   · tabela: as colunas do tipo que a lib devolve (o Row de hoje, escrito coluna a coluna — nenhum "*"), os filtros e a ordem da lib,
//     as vivas (deleted_at is null) onde a lib filtrava, teto 1000 (o max_rows que já cortava a leitura direta);
//   · RPC: os args montados aqui; os códigos que a w14_matricula_da_rota levanta de propósito (sem_login, sem_acesso, aluno_inexistente —
//     a tela de hoje recebia o código na mensagem) voltam como o erro do item (FonteRpc.erros), sem o log.excecao;
//   · Storage: as fotos de evolução da casca/Avaliação na MESMA ida da aluno_evolucao (1 h, como hoje) e o anexo por clique
//     (anexo_url: relê a linha pelo id como a pessoa e assina com o prazo de hoje — 60 s para baixar com o nome, 120 s para ver).
// As sub-worktrees seguintes (20c Dieta/Dietas/Pré-consulta/Dashboard) só ACRESCENTAM entradas aqui.
import type { ConsultaLeitura } from "./leitura-lote.ts";
import { ERROS_DO_AVISO, bucketDaEvolucao, bucketDoDiario, bucketDosAnexos } from "./nutricao-regras.ts";

/** A validade das URLs assinadas de leitura do app do aluno (a mesma de hoje: 1 h). */
export const VALIDADE_URL_LEITURA_S = 3600;
/** Quantos registros do diário por item (a tela divide acima disso; o diário mostra 7 dias). */
export const DIARIO_IDS_MAX = 60;

/** Os buckets do principal que a leitura assina (o nome de produção; bucketDaLeitura dá o do ambiente). hml-20b: + anexos. */
export type BucketDeLeitura = "diario" | "evolucao" | "anexos";
/** A lista fechada dos buckets que uma consulta pode assinar (o teste do catálogo confere cada `assinar`). */
export const BUCKETS_DE_LEITURA: readonly BucketDeLeitura[] = ["diario", "evolucao", "anexos"];

// ───── hml-20b: as constantes do Painel › Aluno ─────
/** O teto de linhas de uma lista do Prontuário (o max_rows do PostgREST, que já cortava a leitura direta sem range). */
export const TETO_LISTA = 1000;
/** O maior inteiro do Postgres (os p_offset das RPCs são integer: acima disso o banco recusa, como hoje). */
export const INT4_MAX = 2_147_483_647;
/** As páginas da tela (POR_PAGINA, src/lib/paginacao.ts): 20 por página. */
export const POR_PAGINA_LEITURA = 20;
/** O teto do p_limite da aluno_anotacoes sem página (a RPC corta em 500) e com página (100); o da exames_do_aluno (100). */
export const ANOTACOES_LIMITE_MAX = 500;
export const EXAMES_LIMITE_MAX = 100;
/** O filtro "Ver evolução de" da exames_do_aluno: o nome de um exame (o TITULO das gravações: 500). */
export const EXAME_NOME_MAX = 500;
/** Os resultados de exame de um aluno: leituras de 1000 até 50 (a lib de hoje: listarResultadosDoPaciente). */
export const RESULTADOS_POR_LEITURA = 1000;
export const MAX_LEITURAS_RESULTADOS = 50;
/** O prazo das URLs do anexo (os de hoje: anexos.ts urlAssinada — 60 s para baixar, 120 s para ver no modal). */
export const VALIDADE_ANEXO_BAIXAR_S = 60;
export const VALIDADE_ANEXO_VER_S = 120;
/** Os códigos que a w14_matricula_da_rota levanta de propósito (aluno_perfil, aluno_evolucao e aluno_anotacoes passam por ela). */
export const ERROS_DA_ROTA = ERROS_DO_AVISO;

/** As colunas do tipo (o Row de hoje — src/integrations/principal/types.ts) de cada tabela que o Painel › Aluno lê (nenhum "*"). */
export const COLUNAS_DO_PAINEL = {
  consultas: ["id", "paciente_id", "nutricionista_id", "data", "observacao", "origem", "created_at", "updated_at", "deleted_at"],
  anamneses: ["id", "paciente_id", "nutricionista_id", "modelo_id", "titulo", "data", "conteudo", "texto_livre", "created_at", "updated_at", "deleted_at"],
  modelos_anamnese: ["id", "nutricionista_id", "codigo", "titulo", "perguntas", "favorito", "created_at", "updated_at", "deleted_at"],
  questionarios: ["id", "nutricionista_id", "codigo", "titulo", "descricao", "perguntas", "faixas", "favorito", "created_at", "updated_at", "deleted_at"],
  respostas_questionario: [
    "id", "paciente_id", "nutricionista_id", "questionario_id", "titulo", "perguntas", "faixas", "respostas", "pontuacao", "faixa", "nivel", "data",
    "observacao", "created_at", "updated_at", "deleted_at",
  ],
  pedidos_exame: ["id", "paciente_id", "nutricionista_id", "data", "exames", "observacao", "created_at", "updated_at", "deleted_at"],
  exames_catalogo: ["id", "nutricionista_id", "nome", "unidade", "ref_min", "ref_max", "referencia_texto", "favorito", "created_at", "updated_at", "deleted_at"],
  resultados_exame: [
    "id", "paciente_id", "nutricionista_id", "data", "exame", "valor", "valor_texto", "unidade", "ref_min", "ref_max", "referencia_texto", "observacao",
    "created_at", "updated_at", "deleted_at",
  ],
  avaliacoes_integradas: ["id", "paciente_id", "nutricionista_id", "data", "titulo", "texto", "sintese", "fontes", "created_at", "updated_at", "deleted_at"],
  gestacoes: [
    "id", "paciente_id", "nutricionista_id", "dum", "dpp", "peso_pre", "altura", "imc_pre", "gemelar", "observacao", "encerrada_em", "created_at", "updated_at",
    "deleted_at",
  ],
  registros_gestacionais: [
    "id", "gestacao_id", "paciente_id", "nutricionista_id", "data", "peso", "pa_sistolica", "pa_diastolica", "observacao", "created_at", "updated_at",
    "deleted_at",
  ],
  interacoes_farmaco_nutriente: [
    "id", "nutricionista_id", "codigo", "medicamento", "sinonimos", "classe", "nutriente", "efeito", "gravidade", "conduta", "fonte", "created_at", "updated_at",
    "deleted_at",
  ],
  medicamentos_paciente: [
    "id", "paciente_id", "nutricionista_id", "interacao_id", "medicamento", "dose", "posologia", "inicio", "ativo", "observacao", "created_at", "updated_at",
    "deleted_at",
  ],
  analises_farmaco: ["id", "paciente_id", "nutricionista_id", "data", "titulo", "medicamentos", "interacoes", "parecer", "created_at", "updated_at", "deleted_at"],
  documentos: ["id", "paciente_id", "nutricionista_id", "modelo_id", "tipo", "titulo", "texto", "dados", "data", "created_at", "updated_at", "deleted_at"],
  modelos_documento: ["id", "nutricionista_id", "tipo", "titulo", "conteudo", "favorito", "created_at", "updated_at", "deleted_at"],
  anexos: ["id", "paciente_id", "nutricionista_id", "conta_id", "nome", "path", "mime", "tamanho", "descricao", "created_at", "updated_at", "deleted_at"],
  antropometrias: [
    "id", "paciente_id", "nutricionista_id", "data", "peso", "altura", "sexo", "idade", "protocolo", "circunferencias", "dobras", "resultados", "observacao",
    "created_at", "updated_at", "deleted_at",
  ],
  /** o PDF "Dados & Evolução" (painel/aluno/dados/pdf.ts): as 12 que ele lia */
  antropometrias_pdf: ["id", "data", "peso", "altura", "sexo", "idade", "circunferencias", "dobras", "protocolo", "resultados", "nutricionista_id", "created_at"],
  /** o profissional logado (nome e dados profissionais dos PDFs) */
  profiles: ["nome", "dados_profissionais"],
} as const;

const aluno = { tipo: "uuid", obrigatorio: true } as const;
/** as tabelas de verdade (as 2 últimas chaves de COLUNAS_DO_PAINEL são recortes: o PDF e o profiles) */
type TabelaDoPainel = Exclude<keyof typeof COLUNAS_DO_PAINEL, "antropometrias_pdf" | "profiles">;
/** a lista do aluno: as colunas do tipo, o paciente_id = o aluno do corpo (o RLS decide se a pessoa vê), as vivas, a ordem da lib */
const doAluno = (tabela: TabelaDoPainel, ordem: readonly { coluna: string; asc: boolean }[]) => ({
  params: { aluno },
  fonte: { tabela, colunas: COLUNAS_DO_PAINEL[tabela], teto: TETO_LISTA, filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], vivas: true, ordem },
}) as const;
/** a lista que o RLS decide (modelos e catálogos: os do sistema + os próprios — a lib não filtrava por dono, nem o servidor) */
const daConta = (tabela: TabelaDoPainel, ordem: readonly { coluna: string; asc: boolean }[]) => ({
  params: {},
  fonte: { tabela, colunas: COLUNAS_DO_PAINEL[tabela], teto: TETO_LISTA, vivas: true, ordem },
}) as const;
const desc = (coluna: string) => ({ coluna, asc: false }) as const;
const asc = (coluna: string) => ({ coluna, asc: true }) as const;

export const CONSULTAS_NUTRICAO = {
  // ───── hml-20a — o app do aluno ─────
  aluno_dieta: {
    params: { dia: { tipo: "data", obrigatorio: true } },
    fonte: { rpc: "minha_dieta", args: { p_dia: "dia" } },
  },
  aluno_diario_urls: {
    params: { ids: { tipo: "uuids", max: DIARIO_IDS_MAX, obrigatorio: true } },
    fonte: { tabela: "diario_alimentar", colunas: ["id", "path"], teto: DIARIO_IDS_MAX, filtros: [{ param: "ids", coluna: "id", op: "in" }], vivas: true },
    assinar: { bucket: "diario", coluna: "path", validade: VALIDADE_URL_LEITURA_S },
  },
  aluno_evolucao: {
    params: {},
    fonte: { rpc: "minha_evolucao" },
    assinar: { bucket: "evolucao", coluna: "path", lista: "fotos", validade: VALIDADE_URL_LEITURA_S },
  },

  // ───── hml-20b — Painel › Aluno ─────
  // a casca (o cabeçalho, os KPIs e as abas): o perfil e a série do principal (as fotos assinadas na mesma ida, 1 h)
  aluno_perfil: {
    params: { aluno },
    fonte: { rpc: "aluno_perfil", args: { p_aluno: "aluno" }, erros: ERROS_DA_ROTA },
  },
  aluno_evolucao_painel: {
    params: { aluno },
    fonte: { rpc: "aluno_evolucao", args: { p_aluno: "aluno" }, erros: ERROS_DA_ROTA },
    assinar: { bucket: "evolucao", coluna: "path", lista: "fotos", validade: VALIDADE_URL_LEITURA_S },
  },
  // o profissional logado: nome e dados profissionais (cabeçalho e assinatura dos PDFs) — "minha": o id = quem chama
  profissional: {
    params: {},
    fonte: { tabela: "profiles", colunas: COLUNAS_DO_PAINEL.profiles, teto: 1 },
    dono: "id",
  },
  // Prontuário › Anotações (e o card do Resumo): a aluno_anotacoes — as últimas N (limite), uma página (limite + offset) ou todas (PDF)
  anotacoes: {
    params: { aluno, limite: { tipo: "inteiro", min: 1, max: ANOTACOES_LIMITE_MAX, obrigatorio: true }, offset: { tipo: "inteiro", min: 0, max: INT4_MAX } },
    fonte: { rpc: "aluno_anotacoes", args: { p_aluno: "aluno", p_limite: "limite", p_offset: "offset" }, erros: ERROS_DA_ROTA },
  },
  anotacoes_todas: {
    params: { aluno },
    fonte: { rpc: "aluno_anotacoes", args: { p_aluno: "aluno" }, erros: ERROS_DA_ROTA },
  },
  // Prontuário › Consultas, Anamnese, Questionários
  consultas_do_aluno: doAluno("consultas", [desc("data"), desc("created_at")]),
  anamneses_do_aluno: doAluno("anamneses", [desc("data"), desc("created_at")]),
  modelos_anamnese: daConta("modelos_anamnese", [desc("favorito"), asc("titulo")]),
  questionarios: daConta("questionarios", [asc("titulo")]),
  respostas_questionario_do_aluno: doAluno("respostas_questionario", [desc("data"), desc("created_at")]),
  // Prontuário › Exames (e a Avaliação 360, que cruza todos os resultados)
  pedidos_exame_do_aluno: {
    params: { aluno, pagina: { tipo: "inteiro", min: 1, max: INT4_MAX, obrigatorio: true } },
    fonte: {
      tabela: "pedidos_exame", colunas: COLUNAS_DO_PAINEL.pedidos_exame, teto: POR_PAGINA_LEITURA,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], vivas: true, ordem: [desc("data"), desc("created_at"), desc("id")],
      pagina: { param: "pagina", tamanho: POR_PAGINA_LEITURA }, contar: true,
    },
  },
  exames_do_aluno: {
    params: {
      aluno, exame: { tipo: "texto", max: EXAME_NOME_MAX }, offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true },
      limite: { tipo: "inteiro", min: 1, max: EXAMES_LIMITE_MAX, obrigatorio: true },
    },
    fonte: { rpc: "exames_do_aluno", args: { p_aluno: "aluno", p_exame: "exame", p_offset: "offset", p_limite: "limite" } },
  },
  exames_catalogo: daConta("exames_catalogo", [desc("favorito"), asc("nome")]),
  resultados_exame_do_aluno: {
    params: { aluno },
    fonte: {
      tabela: "resultados_exame", colunas: COLUNAS_DO_PAINEL.resultados_exame, teto: RESULTADOS_POR_LEITURA,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], vivas: true, ordem: [desc("data"), asc("exame"), asc("id")],
      laco: { tamanho: RESULTADOS_POR_LEITURA, leituras: MAX_LEITURAS_RESULTADOS },
    },
    sozinha: true,
  },
  // Prontuário › Avaliação 360 (as outras fontes dela são as consultas das seções donas), Gestacional, Fármaco-nutrientes, Documentos
  avaliacoes_integradas_do_aluno: doAluno("avaliacoes_integradas", [desc("data"), desc("created_at")]),
  gestacoes_do_aluno: doAluno("gestacoes", [desc("created_at")]),
  registros_gestacionais: doAluno("registros_gestacionais", [desc("data"), desc("created_at")]),
  interacoes_farmaco: daConta("interacoes_farmaco_nutriente", [asc("medicamento"), asc("nutriente")]),
  medicamentos_do_aluno: doAluno("medicamentos_paciente", [desc("ativo"), asc("created_at")]),
  analises_farmaco_do_aluno: doAluno("analises_farmaco", [desc("data"), desc("created_at")]),
  documentos_do_aluno: doAluno("documentos", [desc("created_at")]),
  modelos_documento: daConta("modelos_documento", [desc("favorito"), asc("titulo")]),
  // Prontuário › Anexos: a lista e a URL de 1 anexo por clique (relida pelo id como a pessoa — nunca um caminho do corpo)
  anexos_do_aluno: doAluno("anexos", [desc("created_at")]),
  anexo_url: {
    params: { id: { tipo: "uuid", obrigatorio: true }, download: { tipo: "booleano" } },
    fonte: { tabela: "anexos", colunas: ["id", "path", "nome"], teto: 1, filtros: [{ param: "id", coluna: "id", op: "eq" }], vivas: true, uma: true },
    assinar: { bucket: "anexos", coluna: "path", validade: VALIDADE_ANEXO_VER_S, download: { param: "download", nome: "nome", validade: VALIDADE_ANEXO_BAIXAR_S } },
    sozinha: true,
  },
  // Avaliação (e a Dieta, que usa a mesma lib): as antropometrias do aluno; o "Editar" (1 pelo id, como a tela lia: sem o filtro das
  // vivas); o PDF "Dados & Evolução" (as 12 colunas dele, da mais antiga para a mais nova)
  antropometrias_do_aluno: doAluno("antropometrias", [desc("data"), desc("created_at")]),
  antropometria: {
    params: { id: { tipo: "uuid", obrigatorio: true } },
    fonte: { tabela: "antropometrias", colunas: COLUNAS_DO_PAINEL.antropometrias, teto: 1, filtros: [{ param: "id", coluna: "id", op: "eq" }], uma: true },
  },
  antropometrias_pdf: {
    params: { paciente: { tipo: "uuid", obrigatorio: true } },
    fonte: {
      tabela: "antropometrias", colunas: COLUNAS_DO_PAINEL.antropometrias_pdf, teto: TETO_LISTA,
      filtros: [{ param: "paciente", coluna: "paciente_id", op: "eq" }], vivas: true, ordem: [asc("data")],
    },
  },
} as const satisfies Record<string, ConsultaLeitura>;

export type ConsultaDaNutricao = keyof typeof CONSULTAS_NUTRICAO;
export const CONSULTAS_DA_NUTRICAO = Object.keys(CONSULTAS_NUTRICAO) as ConsultaDaNutricao[];

/** A consulta, se está no catálogo; senão null. */
export function consultaDaNutricao(q: unknown): ConsultaLeitura | null {
  return typeof q === "string" && Object.prototype.hasOwnProperty.call(CONSULTAS_NUTRICAO, q) ? CONSULTAS_NUTRICAO[q as ConsultaDaNutricao] : null;
}

/** O bucket do ambiente (hml-02b: no staging, o "-staging" — o teste nunca lê do bucket da produção). */
export function bucketDaLeitura(bucket: string, schema: "public" | "staging"): string {
  if (bucket === "diario") return bucketDoDiario(schema);
  if (bucket === "evolucao") return bucketDaEvolucao(schema);
  if (bucket === "anexos") return bucketDosAnexos(schema);
  return schema === "staging" ? `${bucket}-staging` : bucket;
}
