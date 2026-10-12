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
// hml-20c — a Dieta do aluno no Painel (Plano, Acompanhamento, Cálculo energético, Suplementos, Manipulados, Orientações, Metas), as
// Dietas (Alimentos, Receitas, Diário), a Pré-consulta (Formulários, Respostas, o contador do menu) e o Dashboard de saúde (spec hml-20
// §2.5.3): as MESMAS leituras que as libs faziam no navegador, agora COMO A PESSOA no servidor —
//   · tabela: as colunas do Row de hoje escritas coluna a coluna (o select("*") — nenhum "*", nem nos embutidos), os filtros, o período
//     (gte/lte/lt), a busca por palavras (ilike), as vivas e a ordem da lib; o recorte da conta ativa (o .or() de hoje) montado AQUI com
//     o user do token; "minha" só onde a lib filtrava pelo id de quem está logado (receita_nome; grupos_receita com o "meus") — os
//     modelos, os produtos e os catálogos o RLS decide (a lib não filtrava: o master vê todos, como hoje);
//   · RPC: os args montados aqui (os filtros das paginadas numa lista fechada de chaves); o 'sem_login' de propósito das 3 do plano;
//   · as séries numa ida só: a página de receitas (a RPC → .in(ids), linhasDosIds) e a página do diário com o total de cada dia que ela
//     partiu ao meio (porDia, com os inícios de dia LOCAIS que a tela manda — o servidor não sabe o fuso do navegador);
//   · H-108: os ★ (planos_favoritos) com a conta → só os do dono (quem chama) e da conta (sem a conta, o de hoje: o Planejamento);
//   · Storage: as miniaturas do diário em lote (diario_urls, 1 h, como hoje) e a foto grande por clique (diario_foto_url, 300 s): o
//     servidor relê a linha pelo id como a pessoa e assina SÓ o caminho dela (nunca um caminho do corpo), no diario do ambiente.
// As sub-worktrees seguintes (20d Financeiro, na função financeiro) não mexem aqui.
import type { ConsultaLeitura, EmbutidoLeitura } from "./leitura-lote.ts";
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

// ───── hml-20c: as constantes da Dieta, das Dietas, da Pré-consulta e do Dashboard ─────
/** As colunas do tipo (o Row de hoje — src/integrations/principal/types.ts) de cada tabela que a 20c lê (nenhum "*"); os recortes
 *  (refeicoes_concluidas, metas_concluidas, os pacientes do filtro do diário, as respostas da Atividade recente) = as colunas da lib. */
export const COLUNAS_DA_DIETA = {
  calculos_energeticos: [
    "id", "paciente_id", "nutricionista_id", "data", "formula", "peso", "altura", "idade", "sexo", "massa_magra", "fator_atividade", "atividades", "tmb",
    "get", "ajuste_kcal", "vet", "objetivo", "observacao", "created_at", "updated_at", "deleted_at",
  ],
  registros_diarios: ["id", "paciente_id", "nutricionista_id", "data", "agua_ml", "sintomas", "observacao", "created_at", "updated_at", "deleted_at"],
  metas: ["id", "paciente_id", "nutricionista_id", "modelo_id", "titulo", "descricao", "dias_semana", "ativa", "inicio", "created_at", "updated_at", "deleted_at"],
  modelos_meta: ["id", "nutricionista_id", "titulo", "descricao", "dias_semana", "favorito", "created_at", "updated_at", "deleted_at"],
  modelos_orientacao: ["id", "nutricionista_id", "titulo", "conteudo", "favorito", "created_at", "updated_at", "deleted_at"],
  modelos_formula: ["id", "nutricionista_id", "titulo", "ativos", "posologia", "quantidade", "observacao", "favorito", "created_at", "updated_at", "deleted_at"],
  orientacoes: ["id", "paciente_id", "nutricionista_id", "modelo_id", "titulo", "conteudo", "created_at", "updated_at", "deleted_at"],
  formulas_manipuladas: [
    "id", "paciente_id", "nutricionista_id", "modelo_id", "titulo", "ativos", "posologia", "quantidade", "observacao", "prescrita_em", "created_at",
    "updated_at", "deleted_at",
  ],
  produtos: [
    "id", "nutricionista_id", "nome", "marca", "categoria", "apresentacao", "dose_padrao", "modo_uso", "link", "observacao", "favorito", "created_at",
    "updated_at", "deleted_at",
  ],
  indicacoes_produto: [
    "id", "paciente_id", "nutricionista_id", "produto_id", "produto_nome", "produto_marca", "produto_apresentacao", "produto_categoria", "dose", "horario",
    "duracao", "inicio", "observacao", "ativa", "ordem", "created_at", "updated_at", "deleted_at",
  ],
  alimentos: [
    "id", "nutricionista_id", "codigo", "nome", "marca", "grupo", "fonte", "porcao_g", "energia_kcal", "proteina_g", "carboidrato_g", "lipidio_g", "fibra_g",
    "sodio_mg", "nutrientes", "busca", "created_at", "updated_at", "deleted_at",
  ],
  medidas_caseiras: ["id", "alimento_id", "descricao", "gramas", "ordem", "created_at"],
  receitas: [
    "id", "nutricionista_id", "grupo_id", "nome", "porcoes", "rendimento_g", "tempo_preparo_min", "modo_preparo", "observacao", "favorita", "created_at",
    "updated_at", "deleted_at",
  ],
  ingredientes_receita: [
    "id", "receita_id", "alimento_id", "quantidade_g", "medida_caseira_id", "quantidade_medida", "ordem", "observacao", "created_at", "updated_at",
  ],
  grupos_receita: ["id", "nutricionista_id", "nome", "ordem", "created_at", "updated_at", "deleted_at"],
  diario_alimentar: [
    "id", "paciente_id", "nutricionista_id", "data_hora", "refeicao", "comentario", "path", "mime", "tamanho", "reacao_nutri", "comentario_nutri",
    "reagido_em", "created_at", "updated_at", "deleted_at",
  ],
  formularios_preconsulta: [
    "id", "nutricionista_id", "conta_id", "titulo", "descricao", "origem", "origem_id", "perguntas", "faixas", "slug", "ativo", "created_at", "updated_at",
    "deleted_at",
  ],
  // os recortes da lib (o select de hoje, que já era fechado)
  refeicoes_concluidas: ["refeicao_id", "data"],
  metas_concluidas: ["meta_id", "data"],
  /** o aluno do diário embutido (SELECT_NUTRI de painel/dietas/diario.ts) e as opções do filtro "Aluno" (listarAlunosDoDiario) */
  paciente_do_diario: ["id", "nome", "apelido", "link_codigo", "foto_url", "conta_id", "nutricionista_id"],
  alunos_do_diario: ["id", "nome", "apelido", "link_codigo", "foto_url"],
  /** a "Atividade recente" do Dashboard (listarRespostasRecentes) */
  respostas_recentes: ["id", "nome", "respondido_em", "paciente_id"],
  /** o alimento embutido no ingrediente (o ALIMENTO_EMBUTIDO de nutricao-regras.ts: as 10 colunas + as medidas) */
  alimento_embutido: ["id", "nome", "fonte", "grupo", "energia_kcal", "proteina_g", "carboidrato_g", "lipidio_g", "fibra_g", "sodio_mg"],
} as const;

/** O teto das palavras da busca (o palavrasBusca da tela: até 6) e de cada uma. */
export const PALAVRAS_MAX = 6;
export const PALAVRA_MAX = 100;
/** O teto de um texto de filtro (o grupo do alimento, o nome-base da cópia de receita, o título/busca dos filtros das RPCs). */
export const TEXTO_FILTRO_MAX = 500;
/** As RPCs paginadas cortam o limite em 100 (receitas_da_nutricionista, respostas_da_conta). */
export const LIMITE_RPC_MAX = 100;
/** Os ids de receita que a página relê (a RPC devolve até 100). */
export const RECEITAS_IDS_MAX = 100;
/** As páginas da tela (POR_PAGINA de src/lib/paginacao.ts): o diário lê 20 por página. */
export const DIARIO_POR_PAGINA = 20;
/** Os inícios de dia do período do diário (até 90 dias + os de depois — o teto INSTANTES_MAX do motor). */
export const DIARIO_DIAS_MAX = 100;
/** A foto grande do diário (a urlAssinada de hoje: 300 s); as miniaturas, 1 h (VALIDADE_URL_LEITURA_S). */
export const VALIDADE_DIARIO_FOTO_S = 300;
/** As respostas da "Atividade recente" do Dashboard (o limit(10) de hoje). */
export const RESPOSTAS_RECENTES_MAX = 10;
/** O código que as 3 RPCs do plano (hml-17) levantam de propósito sem login. */
export const ERROS_DO_PLANO = ["sem_login"] as const;

/** Os embutidos (o select de hoje com as colunas em lista fechada). */
const MEDIDAS: EmbutidoLeitura = { tabela: "medidas_caseiras", colunas: COLUNAS_DA_DIETA.medidas_caseiras };
const INGREDIENTES: EmbutidoLeitura = {
  nome: "ingredientes", tabela: "ingredientes_receita", colunas: COLUNAS_DA_DIETA.ingredientes_receita,
  embutidos: [{ nome: "alimento", tabela: "alimentos", colunas: COLUNAS_DA_DIETA.alimento_embutido, embutidos: [MEDIDAS] }],
};
const PACIENTE_DO_DIARIO: EmbutidoLeitura = { nome: "paciente", tabela: "pacientes", interno: true, colunas: COLUNAS_DA_DIETA.paciente_do_diario };
/** o recorte da conta ativa no aluno embutido do diário (o .or(…, { referencedTable: "paciente" }) de hoje) */
const RECORTE_DO_DIARIO = { modelo: "conta", param: "conta", tabela: "paciente" } as const;
const RECORTE_DA_CONTA = { modelo: "conta", param: "conta" } as const;

const aluno = { tipo: "uuid", obrigatorio: true } as const;
const conta = { tipo: "uuid", obrigatorio: true } as const;
const dataObrigatoria = { tipo: "data", obrigatorio: true } as const;
const instanteObrigatorio = { tipo: "instante", obrigatorio: true } as const;
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
/** hml-20c: as tabelas da Dieta com as colunas do Row (as que não são recortes) */
type TabelaDaDieta = Exclude<
  keyof typeof COLUNAS_DA_DIETA,
  "refeicoes_concluidas" | "metas_concluidas" | "paciente_do_diario" | "alunos_do_diario" | "respostas_recentes" | "alimento_embutido"
>;
/** hml-20c: a lista do aluno na Dieta (as colunas do Row, o paciente_id = o aluno do corpo — o RLS decide —, as vivas, a ordem da lib) */
const daDieta = (tabela: TabelaDaDieta, ordem: readonly { coluna: string; asc: boolean }[]) => ({
  params: { aluno },
  fonte: { tabela, colunas: COLUNAS_DA_DIETA[tabela], teto: TETO_LISTA, filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }], vivas: true, ordem },
}) as const;
/** hml-20c: os modelos e o catálogo de produtos (o RLS decide: a nutri vê os dela, o master todos — a lib não filtrava por dono) */
const daConta20c = (tabela: TabelaDaDieta, ordem: readonly { coluna: string; asc: boolean }[]) => ({
  params: {},
  fonte: { tabela, colunas: COLUNAS_DA_DIETA[tabela], teto: TETO_LISTA, vivas: true, ordem },
}) as const;

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

  // ───── hml-20c — Dieta, Dietas, Pré-consulta e Dashboard ─────
  // Dieta › Plano (e o card do Resumo, a adesão, o "Editar treino e dieta", o Acompanhamento): as RPCs da hml-17 (o banco monta o plano
  // com os alimentos de verdade). planos_favoritos: o "Usar um modelo ★" (sem a conta — o de hoje) e a Ferramentas › Modelos (com a conta:
  // só os do dono = quem chama e da conta — H-108), num lote só dela
  planos_do_aluno: { params: { aluno }, fonte: { rpc: "planos_do_aluno", args: { p_aluno: "aluno" }, erros: ERROS_DO_PLANO } },
  plano_alimentar: { params: { plano: { tipo: "uuid", obrigatorio: true } }, fonte: { rpc: "plano_alimentar", args: { p_plano: "plano" }, erros: ERROS_DO_PLANO } },
  planos_favoritos: {
    params: { conta: { tipo: "uuid" } },
    fonte: { rpc: "planos_favoritos", erros: ERROS_DO_PLANO, filtrarLista: { param: "conta", dono: "nutricionista_id", conta: ["paciente", "conta_id"] } },
    sozinha: true,
  },
  // Dieta › Cálculo energético (e o Plano e o Acompanhamento)
  calculos_do_aluno: daDieta("calculos_energeticos", [desc("data"), desc("created_at")]),
  // Dieta › Acompanhamento: os registros do período (as 2 pontas valem) e o "já existe registro neste dia" (HEAD: só o total)
  registros_diarios: {
    params: { aluno, de: dataObrigatoria, ate: dataObrigatoria },
    fonte: {
      tabela: "registros_diarios", colunas: COLUNAS_DA_DIETA.registros_diarios, teto: TETO_LISTA,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }, { param: "de", coluna: "data", op: "gte" }, { param: "ate", coluna: "data", op: "lte" }],
      vivas: true, ordem: [desc("data"), desc("created_at"), desc("id")],
    },
  },
  registros_do_dia: {
    params: { aluno, dia: dataObrigatoria },
    fonte: {
      tabela: "registros_diarios", colunas: ["id"], teto: 1, soContar: true,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }, { param: "dia", coluna: "data", op: "eq" }], vivas: true,
    },
  },
  // os ✓ das refeições e das metas do aluno entre 2 dias (as 2 pontas valem; sem Lixeira nessas tabelas)
  refeicoes_concluidas: {
    params: { aluno, de: dataObrigatoria, ate: dataObrigatoria },
    fonte: {
      tabela: "refeicoes_concluidas", colunas: COLUNAS_DA_DIETA.refeicoes_concluidas, teto: TETO_LISTA,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }, { param: "de", coluna: "data", op: "gte" }, { param: "ate", coluna: "data", op: "lte" }],
      ordem: [asc("data")],
    },
  },
  metas_concluidas: {
    params: { aluno, de: dataObrigatoria, ate: dataObrigatoria },
    fonte: {
      tabela: "metas_concluidas", colunas: COLUNAS_DA_DIETA.metas_concluidas, teto: TETO_LISTA,
      filtros: [{ param: "aluno", coluna: "paciente_id", op: "eq" }, { param: "de", coluna: "data", op: "gte" }, { param: "ate", coluna: "data", op: "lte" }],
      ordem: [asc("data")],
    },
  },
  // Dieta › Metas, Orientações, Manipulados e Suplementos: o do aluno e os modelos/o catálogo (o RLS decide: a lib não filtrava por dono)
  metas_do_aluno: daDieta("metas", [desc("created_at")]),
  modelos_meta: daConta20c("modelos_meta", [desc("favorito"), asc("titulo")]),
  modelos_orientacao: daConta20c("modelos_orientacao", [desc("favorito"), asc("titulo")]),
  modelos_formula: daConta20c("modelos_formula", [desc("favorito"), asc("titulo")]),
  orientacoes_do_aluno: daDieta("orientacoes", [desc("created_at")]),
  formulas_do_aluno: daDieta("formulas_manipuladas", [desc("prescrita_em"), desc("created_at")]),
  produtos: daConta20c("produtos", [desc("favorito"), asc("nome")]),
  indicacoes_do_aluno: daDieta("indicacoes_produto", [desc("ativa"), asc("ordem"), asc("created_at")]),
  // Dietas › Alimentos e a busca do editor/da busca global: as palavras (cada uma, um ilike na coluna busca), o grupo, a fonte, a faixa
  // (o editor pede 12, o painel 20 por página) e o total; com o "meus" (a lista do painel), o recorte "TACO ou meus" e o desempate pelo id
  alimentos_busca: {
    params: {
      palavras: { tipo: "textos", max: PALAVRAS_MAX, maxItem: PALAVRA_MAX }, grupo: { tipo: "texto", max: TEXTO_FILTRO_MAX },
      fonte: { tipo: "enum", valores: ["taco", "proprio"] }, offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true },
      limite: { tipo: "inteiro", min: 1, max: TETO_LISTA, obrigatorio: true }, meus: { tipo: "booleano" },
    },
    fonte: {
      tabela: "alimentos", colunas: COLUNAS_DA_DIETA.alimentos, embutidos: [MEDIDAS], teto: TETO_LISTA,
      filtros: [{ param: "fonte", coluna: "fonte", op: "eq" }, { param: "grupo", coluna: "grupo", op: "eq" }, { param: "palavras", coluna: "busca", op: "ilike_cada" }],
      vivas: true, recorte: { modelo: "taco_ou_meus", param: "meus" }, ordem: [asc("busca"), asc("fonte"), { coluna: "id", asc: true, se: "meus" }],
      faixa: { offset: "offset", limite: "limite" }, contar: true,
    },
  },
  grupos_alimentos: { params: {}, fonte: { rpc: "grupos_alimentos" } },
  // Dietas › Receitas: a página (a RPC hml-14b → as receitas da página relidas pelos ids, com os ingredientes, NA MESMA IDA — eram 2 idas
  // em série), todas as receitas (o "Da receita" do plano, num lote só dela), os nomes para a cópia (as minhas) e os grupos
  receitas_pagina: {
    params: {
      filtros: {
        tipo: "objeto",
        campos: { q: { tipo: "texto", max: TEXTO_FILTRO_MAX }, grupo: { tipo: "texto", max: TEXTO_FILTRO_MAX }, favoritas: { tipo: "enum", valores: ["true"] } },
      },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true }, limite: { tipo: "inteiro", min: 1, max: LIMITE_RPC_MAX, obrigatorio: true },
    },
    fonte: {
      rpc: "receitas_da_nutricionista", args: { p_filtros: "filtros", p_offset: "offset", p_limite: "limite" },
      linhasDosIds: { lista: "ids", tabela: "receitas", colunas: COLUNAS_DA_DIETA.receitas, embutidos: [INGREDIENTES], vivas: true, max: RECEITAS_IDS_MAX },
    },
  },
  receitas_todas: {
    params: {},
    fonte: { tabela: "receitas", colunas: COLUNAS_DA_DIETA.receitas, embutidos: [INGREDIENTES], teto: TETO_LISTA, vivas: true, ordem: [asc("nome")] },
    sozinha: true,
  },
  receita_nome: {
    params: { base: { tipo: "texto", max: TEXTO_FILTRO_MAX, obrigatorio: true } },
    fonte: { tabela: "receitas", colunas: ["nome"], teto: TETO_LISTA, filtros: [{ param: "base", coluna: "nome", op: "ilike_prefixo" }], vivas: true },
    dono: "nutricionista_id",
  },
  grupos_receita: {
    params: { meus: { tipo: "booleano" } },
    fonte: { tabela: "grupos_receita", colunas: COLUNAS_DA_DIETA.grupos_receita, teto: TETO_LISTA, vivas: true, ordem: [asc("ordem"), asc("nome")] },
    dono: "nutricionista_id",
    donoSe: "meus",
  },
  // Dietas › Diário (e o "Diário de hoje" do Dashboard): o recorte da conta ativa no aluno embutido; a página com o total de cada dia
  // cortado na mesma ida; a contagem (o "Só não reagidas (N)" e o número da aba — HEAD); as opções do filtro "Aluno"; a janela de hoje;
  // as miniaturas (lote, 1 h) e a foto grande (por clique, 300 s) — relidas pelo id como a pessoa
  diario_pagina: {
    params: {
      conta, de: instanteObrigatorio, dias: { tipo: "instantes", max: DIARIO_DIAS_MAX, obrigatorio: true }, aluno: { tipo: "uuid" },
      nao_reagidas: { tipo: "booleano" }, pagina: { tipo: "inteiro", min: 1, max: INT4_MAX, obrigatorio: true }, com_urls: { tipo: "booleano" },
    },
    fonte: {
      tabela: "diario_alimentar", colunas: COLUNAS_DA_DIETA.diario_alimentar, embutidos: [PACIENTE_DO_DIARIO], teto: DIARIO_POR_PAGINA,
      filtros: [
        { param: "de", coluna: "data_hora", op: "gte" }, { param: "aluno", coluna: "paciente_id", op: "eq" }, { param: "nao_reagidas", coluna: "reacao_nutri", op: "nulo" },
      ],
      vivas: true, recorte: RECORTE_DO_DIARIO, ordem: [desc("data_hora"), desc("created_at"), desc("id")],
      pagina: { param: "pagina", tamanho: DIARIO_POR_PAGINA }, contar: true, porDia: { coluna: "data_hora", de: "de", dias: "dias" },
    },
    // a decisão da sessão principal (etapa 2: a série lista → assinar custava +0,5 s): com o com_urls, as miniaturas das linhas que a
    // consulta leu NA MESMA IDA (o mesmo bucket e o mesmo prazo do diario_urls; nunca um caminho do corpo)
    assinar: { bucket: "diario", coluna: "path", validade: VALIDADE_URL_LEITURA_S, se: "com_urls" },
  },
  diario_contagem: {
    params: { conta, de: instanteObrigatorio, ate: { tipo: "instante" }, aluno: { tipo: "uuid" }, nao_reagidas: { tipo: "booleano" } },
    fonte: {
      tabela: "diario_alimentar", colunas: ["id"], embutidos: [{ nome: "paciente", tabela: "pacientes", interno: true, colunas: ["id"] }], teto: 1, soContar: true,
      filtros: [
        { param: "de", coluna: "data_hora", op: "gte" }, { param: "ate", coluna: "data_hora", op: "lt" }, { param: "aluno", coluna: "paciente_id", op: "eq" },
        { param: "nao_reagidas", coluna: "reacao_nutri", op: "nulo" },
      ],
      vivas: true, recorte: RECORTE_DO_DIARIO,
    },
  },
  diario_alunos: {
    params: { conta, de: instanteObrigatorio },
    fonte: {
      tabela: "pacientes", colunas: COLUNAS_DA_DIETA.alunos_do_diario, teto: TETO_LISTA,
      embutidos: [{ nome: "registros", tabela: "diario_alimentar", interno: true, colunas: ["id"], vivas: true, limite: 1 }],
      filtros: [{ param: "de", coluna: "registros.data_hora", op: "gte" }], recorte: RECORTE_DA_CONTA, ordem: [asc("nome"), asc("id")],
    },
  },
  diario_hoje: {
    params: { conta, de: instanteObrigatorio, com_urls: { tipo: "booleano" } },
    fonte: {
      tabela: "diario_alimentar", colunas: COLUNAS_DA_DIETA.diario_alimentar, embutidos: [PACIENTE_DO_DIARIO], teto: TETO_LISTA,
      filtros: [{ param: "de", coluna: "data_hora", op: "gte" }], vivas: true, recorte: RECORTE_DO_DIARIO, ordem: [desc("data_hora"), desc("created_at")],
    },
    assinar: { bucket: "diario", coluna: "path", validade: VALIDADE_URL_LEITURA_S, se: "com_urls" },
  },
  diario_urls: {
    params: { ids: { tipo: "uuids", max: DIARIO_IDS_MAX, obrigatorio: true } },
    fonte: { tabela: "diario_alimentar", colunas: ["id", "path"], teto: DIARIO_IDS_MAX, filtros: [{ param: "ids", coluna: "id", op: "in" }], vivas: true },
    assinar: { bucket: "diario", coluna: "path", validade: VALIDADE_URL_LEITURA_S },
  },
  diario_foto_url: {
    params: { id: { tipo: "uuid", obrigatorio: true } },
    fonte: { tabela: "diario_alimentar", colunas: ["id", "path"], teto: 1, filtros: [{ param: "id", coluna: "id", op: "eq" }], vivas: true, uma: true },
    assinar: { bucket: "diario", coluna: "path", validade: VALIDADE_DIARIO_FOTO_S },
    sozinha: true,
  },
  // Pré-consulta › Formulários e Respostas, o contador do menu (respostas novas: vivas e sem aluno — HEAD) e os números do topo
  formularios_preconsulta: {
    params: { conta },
    fonte: { tabela: "formularios_preconsulta", colunas: COLUNAS_DA_DIETA.formularios_preconsulta, teto: TETO_LISTA, vivas: true, recorte: RECORTE_DA_CONTA, ordem: [asc("titulo")] },
  },
  preconsulta_numeros: {
    params: { conta, inicio_mes: instanteObrigatorio },
    fonte: { rpc: "preconsulta_numeros", args: { p_conta: "conta", p_inicio_mes: "inicio_mes" } },
  },
  respostas_da_conta: {
    params: {
      conta,
      filtros: {
        tipo: "objeto",
        campos: {
          formulario: { tipo: "texto", max: TEXTO_FILTRO_MAX }, q: { tipo: "texto", max: TEXTO_FILTRO_MAX }, novas: { tipo: "enum", valores: ["true"] },
          aluno: { tipo: "texto", max: TEXTO_FILTRO_MAX },
        },
      },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true }, limite: { tipo: "inteiro", min: 1, max: LIMITE_RPC_MAX, obrigatorio: true },
    },
    fonte: { rpc: "respostas_da_conta", args: { p_conta: "conta", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" } },
  },
  preconsulta_novas: {
    params: { conta },
    fonte: { tabela: "respostas_preconsulta", colunas: ["id"], teto: 1, soContar: true, vivas: true, nulos: ["paciente_id"], recorte: RECORTE_DA_CONTA },
  },
  // Dashboard (a parte de saúde): o painel_resumo (definer) e as respostas da "Atividade recente" (as 10 mais novas desde o instante)
  painel_resumo: { params: { conta }, fonte: { rpc: "painel_resumo", args: { p_conta: "conta" } } },
  respostas_recentes: {
    params: { conta, desde: instanteObrigatorio },
    fonte: {
      tabela: "respostas_preconsulta", colunas: COLUNAS_DA_DIETA.respostas_recentes, teto: RESPOSTAS_RECENTES_MAX,
      filtros: [{ param: "desde", coluna: "respondido_em", op: "gte" }], vivas: true, recorte: RECORTE_DA_CONTA, ordem: [desc("respondido_em")],
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
