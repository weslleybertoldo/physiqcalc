/**
 * Painel › Treinos (W23): leituras e escritas no Banco do Treino com a sessão do Treino de quem está no painel.
 * - Modelos, pastas, biblioteca e grupos musculares: as MESMAS tabelas e a MESMA regra de acesso (RLS) da aba "Treinos" do admin
 *   antigo (src/components/admin/AdminTreinos.tsx, que sai nesta worktree): o profissional grava só no que é dele; o master, no
 *   catálogo global.
 * - "Quem recebe": pelas ações da função admin-semana-treinos (as da W15 — usarTreino/tirarTreino — e as da W23 — quemRecebe/
 *   aplicarModelo), que conferem no servidor se quem chama vê o aluno (pode_ver_aluno_treino_por: o personal, o dono da conta, o
 *   master) e levam a prescrição do modelo para quem passa a receber.
 * - Histórico e relatório: admin-relatorio (as mesmas leituras do Histórico e do Relatório antigos).
 * Tudo online: o painel não tem PowerSync.
 * hml-21d (H-43 · jeito 2, etapa 3): as GRAVAÇÕES do cadastro (modelos, exercícios do modelo, a ordem, pastas, a biblioteca, os grupos
 * musculares e a foto do exercício) vão pela função treinos (src/treino/servidor.ts: acaoTreinos — o servidor grava como a pessoa, com o
 * dono do token; o RLS decide de novo): a mesma assinatura, o mesmo erro da tela (o ErroTreinoPainel com os códigos de hoje — repetido,
 * em_uso, sem_permissao, sem_internet —; a mensagem crua do banco não chega mais à tela). A ordem do modelo vira 1 ação (a RPC atômica
 * modelo_ordenar); a foto sobe pelo link que o servidor assina (o caminho <id>.<ext> de hoje).
 * hml-21d (as LEITURAS): Meus treinos, o treino aberto pelo id, as pastas, os grupos musculares e o catálogo da aba Treinos dos Modelos
 * também vão pela treinos (lerTreinos — o lote automático: as leituras da MESMA volta numa ida; o "global ou meu" montado no servidor com o
 * usuário do token): os detalhes da página (as linhas, os vínculos de pasta e os exercícios citados — antes 3 pedidos em série) vêm numa
 * consulta só; o `tabela()` saiu. As MESMAS linhas, a mesma ordem e o mesmo tipo de hoje.
 */
import { DB_SCHEMA, supabase } from "@/integrations/supabase/client";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { acaoTreinos, codigoDoTreino, lerTreinos, type AcaoTreinos, type ConsultaDoTreino } from "@/treino/servidor";
import { listarAlunos } from "@/lib/saasApi";
import { ErroTreinoPainel, exerciciosDaLista, invocar, tirarTreino, type ItemHistorico, type PaginaDaBiblioteca } from "@/treino/editor/api";
import type { CamposEquivalencia } from "@/treino/equivalencia";
import { LIMITE_SELETOR_TREINO, alunoDaLista } from "./regras";
import type {
  AlunoDaLista, AlunoQuemRecebe, Catalogo, DetalhesDosModelos, ExercicioCatalogo, FiltrosExercicios, FiltrosModelos, GrupoMuscularRow, LinhaModelo,
  ModeloAberto, ModeloRow, PaginaModelos, PaginaQuemRecebe, PastaRow, PerfilRecebe, QuemMexe, VinculoPasta,
} from "./tipos";

// staging tem bucket próprio de mídias — upload não polui as fotos de produção (o mesmo do admin antigo)
export const BUCKET_EXERCICIOS = DB_SCHEMA === "staging" ? "exercicios-staging" : "exercicios";

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

function exigirInternet(): void {
  if (!online()) throw new ErroTreinoPainel("sem_internet");
}

/**
 * hml-21d: o código de um erro da função treinos no código que a tela do painel já entende (o falhou() de hoje): conflito → repetido,
 * em_uso → em_uso, sem_acesso → sem_permissao, muitas_acoes → rate_limited, a rede → sem_internet; o resto, o código (nao_encontrado,
 * dados_invalidos, erro_interno… → a frase fixa do mensagemDoErro — nunca a mensagem crua do banco).
 */
export function codigoDoPainel(codigo: string): string {
  switch (codigo) {
    case "conflito":
      return "repetido";
    case "sem_acesso":
      return "sem_permissao";
    case "muitas_acoes":
      return "rate_limited";
    // a lista que passou do teto de leituras do servidor (50 × 1000) — o "lista_grande_demais" de hoje
    case "muitas_linhas":
      return "lista_grande_demais";
    default:
      return codigo;
  }
}

/** hml-21d: uma gravação pela função treinos (1 chamada, sem repetir); o erro vira o ErroTreinoPainel com o código da tela. */
async function gravar<T = Record<string, unknown>>(acao: AcaoTreinos, corpo: Record<string, unknown>): Promise<T> {
  exigirInternet();
  try {
    return await acaoTreinos<T>(acao, corpo);
  } catch (e) {
    throw new ErroTreinoPainel(codigoDoPainel(codigoDoTreino(e)));
  }
}

// ───────────────────────── leitura ─────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** hml-21d: uma leitura pela treinos (o lote da volta); o erro vira o ErroTreinoPainel com o código da tela (nunca a mensagem do banco). */
async function ler(q: ConsultaDoTreino, params?: Record<string, unknown>): Promise<{ linhas?: unknown[]; valor?: unknown; total?: number }> {
  exigirInternet();
  try {
    return await lerTreinos(q, params);
  } catch (e) {
    throw new ErroTreinoPainel(codigoDoPainel(codigoDoTreino(e)));
  }
}

type ComId = { id: string };
/** A linha do modelo como o servidor devolve (com o id dela — a ordem de hoje — e o exercício citado embutido). */
type LinhaDoServidor = LinhaModelo & ComId & { exercicio?: ExercicioCatalogo | null };
type ModeloDoServidor = ModeloRow & { linhas?: LinhaDoServidor[]; vinculos?: Array<VinculoPasta & ComId> };

/** A ordem de hoje: as linhas por (ordem, id) — o .order("ordem").order("id") —; os vínculos e os exercícios por id. */
const porOrdemEId = (a: LinhaDoServidor, b: LinhaDoServidor) => (a.ordem ?? 0) - (b.ordem ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const porId = (a: ComId, b: ComId) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** A linha no tipo de hoje (sem o id e sem o exercício embutido — as 7 colunas do COLS_LINHA). */
const linhaDeHoje = ({ grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg }: LinhaDoServidor): LinhaModelo =>
  ({ grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg });
const vinculoDeHoje = ({ pasta_id, grupo_id }: VinculoPasta): VinculoPasta => ({ pasta_id, grupo_id });

/** Os detalhes que vieram embutidos nos modelos (1 consulta no servidor), no tipo e na ordem dos 3 pedidos de hoje. */
function detalhesDoServidor(modelos: readonly ModeloDoServidor[]): DetalhesDosModelos {
  const linhas = modelos.flatMap((m) => m.linhas ?? []).sort(porOrdemEId);
  const exercicios = new Map<string, ExercicioCatalogo>();
  for (const l of linhas) if (l.exercicio && !exercicios.has(l.exercicio.id)) exercicios.set(l.exercicio.id, l.exercicio);
  return {
    linhas: linhas.map(linhaDeHoje),
    exercicios: [...exercicios.values()].sort(porId),
    vinculos: modelos.flatMap((m) => m.vinculos ?? []).sort(porId).map(vinculoDeHoje),
  };
}
const soOModelo = ({ id, nome, professor_id }: ModeloRow): ModeloRow => ({ id, nome, professor_id });

/** As pastas que a pessoa vê (as dela e as globais) — inteiras (teto natural: 2 por profissional hoje). */
export const carregarPastas = async (meuId: string | null): Promise<PastaRow[]> => ((await ler("pastas")).linhas ?? []) as PastaRow[];

/** Os grupos musculares (globais e meus) — o formulário do exercício e a folha "Grupos musculares". */
export const carregarMusculos = async (meuId: string | null): Promise<GrupoMuscularRow[]> => ((await ler("grupos_musculares")).linhas ?? []) as GrupoMuscularRow[];

/**
 * O catálogo (Ferramentas › Modelos › aba Treinos): os modelos com as linhas e as pastas com os vínculos, em páginas de 1000 no servidor
 * (as 2 na MESMA ida) — hml-21d: sem os exercícios e os grupos musculares que a aba lia e não usava (vêm vazios).
 */
export async function carregarCatalogo(meuId: string | null): Promise<Catalogo> {
  const [m, p] = await Promise.all([ler("catalogo_modelos"), ler("catalogo_pastas")]);
  const modelos = (m.linhas ?? []) as ModeloDoServidor[];
  const pastas = (p.linhas ?? []) as Array<PastaRow & { vinculos?: Array<VinculoPasta & ComId> }>;
  return {
    modelos: modelos.map(soOModelo),
    pastas: pastas.map(({ id, nome, professor_id }) => ({ id, nome, professor_id })),
    vinculos: pastas.flatMap((x) => x.vinculos ?? []).sort(porId).map(vinculoDeHoje),
    linhas: modelos.flatMap((x) => x.linhas ?? []).sort(porOrdemEId).map(linhaDeHoje),
    exercicios: [],
    musculos: [],
  };
}

const SEM_DETALHES: DetalhesDosModelos = { linhas: [], exercicios: [], vinculos: [] };

/** hml-14d (D23): as linhas, os exercícios citados (globais ou meus — o de fora do catálogo continua fora) e os vínculos de pasta
 * SÓ dos treinos pedidos (a página: até 20) — hml-21d: numa consulta só no servidor (antes 3 pedidos em série). */
async function detalhesDosModelos(ids: string[], meuId: string | null): Promise<DetalhesDosModelos> {
  if (!ids.length) return SEM_DETALHES;
  return detalhesDoServidor(((await ler("modelos_detalhes", { ids })).linhas ?? []) as ModeloDoServidor[]);
}

/**
 * hml-14d (B21 · D23): uma página de Meus treinos — a RPC modelos_da_lista (busca pelo nome do treino ou de um exercício dele,
 * sem acento; a pasta aberta; ordem e total no banco) e os detalhes SÓ dos 20 da página (hml-21d: a 2ª ida — eles dependem dos ids).
 */
export async function carregarPaginaDeModelos(meuId: string | null, filtros: FiltrosModelos, pagina: number): Promise<PaginaModelos> {
  const p_filtros: Record<string, string> = {};
  if (filtros.q.trim()) p_filtros.q = filtros.q.trim();
  if (filtros.pasta) p_filtros.pasta = filtros.pasta;
  const { valor } = await ler("modelos", { filtros: p_filtros, offset: deslocamento(pagina), limite: POR_PAGINA });
  const r = (valor ?? {}) as { total?: number; total_geral?: number; por_pasta?: Record<string, number>; itens?: ModeloRow[] };
  const itens = Array.isArray(r.itens) ? r.itens : [];
  return {
    itens,
    total: Number(r.total ?? 0) || 0,
    totalGeral: Number(r.total_geral ?? 0) || 0,
    porPasta: r.por_pasta ?? {},
    detalhes: await detalhesDosModelos(itens.map((m) => m.id), meuId),
  };
}

/** hml-14d (D23): o `?treino=<id>` que não está na página abre pelo id (global ou meu; outro id → null, como antes) — hml-21d: com os
 * detalhes na MESMA ida. */
export async function carregarModeloPorId(meuId: string | null, id: string): Promise<ModeloAberto> {
  exigirInternet();
  if (!UUID.test(id)) return { modelo: null, detalhes: SEM_DETALHES };
  const [linha] = ((await ler("modelo", { id })).linhas ?? []) as ModeloDoServidor[];
  return linha ? { modelo: soOModelo(linha), detalhes: detalhesDoServidor([linha]) } : { modelo: null, detalhes: SEM_DETALHES };
}

/** hml-14d (B21 · D24): uma página da biblioteca (painel) com as contagens do topo — a RPC exercicios_da_lista. */
export const listarExercicios = (filtros: FiltrosExercicios, pagina: number, porPagina = POR_PAGINA) =>
  porPagina === 1 ? contagemDaBiblioteca<ExercicioCatalogo>(filtros, pagina) : exerciciosDaLista<ExercicioCatalogo>(filtros, pagina, porPagina);

/**
 * hml-21d (perf — a mitigação da spec §2.6 e do risco 5: "um item lento segura o lote → as consultas pesadas vão `sozinha`"): a contagem
 * da biblioteca do Meus treinos (1 item por página: só os totais — o "com GIF" do topo) vai SOZINHA, num `ler` à parte e em paralelo — a
 * página e as pastas não esperam por ela (antes ela entrava no MESMO lote da página, que só voltava com o item mais lento). A mesma RPC,
 * os mesmos p_filtros, offset e limite e o MESMO tipo de volta do exerciciosDaLista (src/treino/editor/api.ts) — só o lote muda.
 */
async function contagemDaBiblioteca<T>(filtros: FiltrosExercicios, pagina: number): Promise<PaginaDaBiblioteca<T>> {
  if (!online()) throw new ErroTreinoPainel("sem_internet");
  const p_filtros: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    p_filtros[k] = v;
  }
  let valor: unknown;
  try {
    valor = (await lerTreinos("exercicios_lista", { filtros: p_filtros, offset: deslocamento(pagina, 1), limite: 1 }, { sozinha: true })).valor ?? null;
  } catch (e) {
    throw new ErroTreinoPainel(codigoDoTreino(e));
  }
  const r = (valor ?? {}) as Record<string, unknown>;
  const n = (k: string) => Number(r[k] ?? 0) || 0;
  return {
    itens: (Array.isArray(r.itens) ? r.itens : []) as T[],
    total: n("total"),
    totalGlobal: n("total_global"),
    totalMeu: n("total_meu"),
    totalProfessores: n("total_professores"),
    comGif: n("com_gif"),
    totalEscopo: n("total_escopo"),
    semClassificacao: n("sem_classificacao"),
  };
}

/** Quais dos meus alunos recebem cada modelo (função — a RLS só deixa ler os que têm o profissional como professor). */
export async function carregarQuemRecebe(grupos: string[]): Promise<PerfilRecebe[]> {
  if (!grupos.length) return [];
  const r = await invocar<{ perfis?: PerfilRecebe[] }>("admin-semana-treinos", { action: "quemRecebe", grupos });
  return r.perfis ?? [];
}

/**
 * hml-14d (B19/B21 · D25): o "Quem recebe" de um modelo, uma página de 20 vinda do servidor — quem recebe primeiro, depois o nome;
 * a busca sem acento (nome e e-mail); o chip "N DE M" do servidor.
 */
export async function carregarQuemRecebeLista(grupo: string, busca: string, pagina: number): Promise<PaginaQuemRecebe> {
  const corpo: Record<string, unknown> = { action: "quemRecebeLista", grupo, pagina };
  if (busca.trim()) corpo.q = busca.trim();
  const r = await invocar<{ itens?: AlunoQuemRecebe[]; total?: number; total_recebem?: number; total_alunos?: number }>("admin-semana-treinos", corpo);
  return {
    grupo,
    itens: r.itens ?? [],
    total: Number(r.total ?? 0) || 0,
    totalRecebem: Number(r.total_recebem ?? 0) || 0,
    totalAlunos: Number(r.total_alunos ?? 0) || 0,
  };
}

/**
 * hml-14d (B19 · D26): o seletor de aluno do Histórico e do Relatório — a lista de alunos do Treino (admin-list-users) buscando no
 * banco: parte do nome ou do e-mail, sem acento, 20 por vez, em ordem de nome, com o total (o "20 de N — refine a busca").
 * O master busca nos alunos dele (professorId = ele, como antes).
 */
export async function buscarAlunosDoTreino(q: QuemMexe, termo: string): Promise<{ itens: AlunoDaLista[]; total: number }> {
  exigirInternet();
  const r = await listarAlunos({ q: termo.trim() || undefined, limit: LIMITE_SELETOR_TREINO, offset: 0, ordem: "nome", professorId: q.master ? q.meuId : undefined });
  const users = (r?.users ?? []) as { id: string; nome?: string | null; email?: string | null; foto_url?: string | null }[];
  return { itens: users.map(alunoDaLista), total: Number(r?.total ?? users.length) || 0 };
}

// ───────────────────────── modelos ─────────────────────────

/** O modelo novo — o dono é o do token no servidor (o master cria no global; o personal, para ele — o donoAoCriar da tela). */
export async function criarModelo(nome: string, dono: string | null): Promise<string> {
  const r = await gravar<{ id: string }>("modelo_criar", { nome });
  return String(r.id);
}

export async function renomearModelo(id: string, nome: string): Promise<void> {
  await gravar("modelo_editar", { id, nome });
}

export async function excluirModelo(id: string): Promise<void> {
  await gravar("modelo_excluir", { id });
}

export async function adicionarAoModelo(grupoId: string, exercicioId: string, ordem: number): Promise<void> {
  await gravar("modelo_exercicio_incluir", { grupo: grupoId, exercicio: exercicioId, ordem });
}

export async function tirarDoModelo(grupoId: string, exercicioId: string): Promise<void> {
  await gravar("modelo_exercicio_tirar", { grupo: grupoId, exercicio: exercicioId });
}

/** A ordem nova do modelo (todos os exercícios dele, na ordem da tela) — hml-21d: de uma vez, numa transação (a RPC modelo_ordenar). */
export async function ordenarModelo(grupoId: string, ordem: string[]): Promise<void> {
  await gravar("modelo_ordenar", { grupo: grupoId, ids: ordem });
}

/** Séries, repetições, descanso e carga do exercício NO MODELO (W23) — a de cada aluno continua no perfil dele (W15). */
export async function prescreverModelo(
  grupoId: string,
  exercicioId: string,
  p: Partial<Pick<LinhaModelo, "num_series" | "reps_alvo" | "descanso_segundos" | "carga_sugerida_kg">>,
): Promise<void> {
  await gravar("modelo_exercicio_prescrever", { ...p, grupo: grupoId, exercicio: exercicioId });
}

// ───────────────────────── pastas ─────────────────────────

/** A pasta nova — o dono é o do token no servidor (o master cria no global; o personal, para ele). */
export async function criarPasta(nome: string, dono: string | null): Promise<string> {
  const r = await gravar<{ id: string }>("pasta_criar", { nome });
  return String(r.id);
}

export async function renomearPasta(id: string, nome: string): Promise<void> {
  await gravar("pasta_editar", { id, nome });
}

/** A pasta sai; os treinos dela ficam (voltam para a lista sem pasta) — como no admin antigo. */
export async function excluirPasta(id: string): Promise<void> {
  await gravar("pasta_excluir", { id });
}

/** Põe/tira o treino da pasta: o que já está ao pôr (o servidor responde ok) e o que já não está ao tirar = o fim de hoje (sem erro). */
export async function colocarNaPasta(pastaId: string, grupoId: string, colocar: boolean): Promise<void> {
  try {
    await gravar(colocar ? "pasta_vincular" : "pasta_desvincular", { pasta: pastaId, grupo: grupoId });
  } catch (e) {
    if (!colocar && e instanceof ErroTreinoPainel && e.codigo === "nao_encontrado") return;
    throw e;
  }
}

// ───────────────────────── quem recebe ─────────────────────────

/** O aluno passa a receber o modelo (e leva a prescrição do modelo onde não tem a dele — W23). */
export const darModelo = (aluno: string, grupoId: string) =>
  invocar<{ ok: true; prescricao_do_modelo?: number }>("admin-semana-treinos", { action: "usarTreino", userId: aluno, grupo_id: grupoId });

/** O aluno deixa de receber (sai da semana e das trocas de hoje em diante — a regra da W15). */
export const tirarModelo = (aluno: string, grupoId: string) => tirarTreino(aluno, grupoId);

/** "Aplicar a quem recebe": a prescrição do modelo neste aluno, só onde ele não tem a dele. */
export const aplicarModeloNoAluno = (aluno: string, grupoId: string) =>
  invocar<{ ok: true; preenchidos: number }>("admin-semana-treinos", { action: "aplicarModelo", userId: aluno, grupo_id: grupoId });

// ───────────────────────── biblioteca ─────────────────────────

export interface DadosExercicio extends CamposEquivalencia {
  nome: string;
  grupo_muscular: string;
  tipo: "musculacao" | "corrida";
  subgrupo: string | null;
  dica: string | null;
}

/**
 * GIF/imagem do exercício no bucket público (escrita só da staff pela política): a URL leva ?v= para o app buscar a nova na hora.
 * hml-21d (§2.5): o servidor assina o link de upload (exercicio_foto_preparar — o caminho <id>.<ext> nasce lá, a policy do bucket confere
 * que o exercício é de quem grava) e o navegador só faz o PUT do arquivo nele (uploadToSignedUrl) e monta a URL pública (getPublicUrl).
 */
export async function subirImagem(arquivo: File, exercicioId: string): Promise<string> {
  exigirInternet();
  if (!arquivo.type.startsWith("image/")) throw new ErroTreinoPainel("imagem_invalida");
  if (arquivo.size > 5 * 1024 * 1024) throw new ErroTreinoPainel("imagem_grande");
  let alvo: { bucket: string; caminho: string; token: string };
  try {
    alvo = await acaoTreinos("exercicio_foto_preparar", { exercicio: exercicioId, tipo: arquivo.type, tamanho: arquivo.size });
  } catch (e) {
    const c = codigoDoTreino(e);
    // o tipo que o bucket não aceita (SVG, HEIC…) → a frase da imagem; o Storage fora → a do upload; o resto, como as outras gravações
    throw new ErroTreinoPainel(c === "dados_invalidos" ? "imagem_invalida" : c === "storage_falhou" ? "upload_falhou" : codigoDoPainel(c));
  }
  const { error } = await supabase.storage.from(alvo.bucket).uploadToSignedUrl(alvo.caminho, alvo.token, arquivo, { upsert: true, contentType: arquivo.type, cacheControl: "31536000" });
  if (error) throw new ErroTreinoPainel("upload_falhou");
  const { data } = supabase.storage.from(alvo.bucket).getPublicUrl(alvo.caminho);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** O exercício novo — o dono é o do token no servidor (o master cria no global; o personal, para ele); o emoji de hoje nasce lá. */
export async function criarExercicio(d: DadosExercicio, dono: string | null): Promise<string> {
  const r = await gravar<{ id: string }>("exercicio_criar", { ...d });
  return String(r.id);
}

/** As colunas que vieram; a imagem_url só a da foto que subiu (o servidor confere), a que já estava ou nenhuma (tirar). */
export async function salvarExercicio(id: string, d: Partial<DadosExercicio> & { imagem_url?: string | null }): Promise<void> {
  await gravar("exercicio_editar", { ...d, id });
}

export async function excluirExercicio(id: string): Promise<void> {
  await gravar("exercicio_excluir", { id });
}

export async function criarMusculo(nome: string, dono: string | null): Promise<GrupoMuscularRow> {
  const r = await gravar<{ linha: GrupoMuscularRow }>("grupo_muscular_criar", { nome });
  return r.linha;
}

export async function excluirMusculo(id: string): Promise<void> {
  await gravar("grupo_muscular_excluir", { id });
}

// ───────────────────────── histórico ─────────────────────────

/**
 * Os treinos feitos no mês pelos meus alunos (o Histórico antigo: o professor vê os dele; o master, todos) — hml-14d (B21 · D26):
 * 20 por página com o total do mês; o aluno do seletor vai como `userId` (o filtro no servidor).
 */
export async function carregarHistoricoDoMes(ano: number, mes: number, pagina: number, userId?: string | null): Promise<{ itens: ItemHistorico[]; total: number }> {
  const corpo: Record<string, unknown> = { action: "historicoMes", ano, mes, pagina };
  if (userId) corpo.userId = userId;
  const r = await invocar<{ itens?: ItemHistorico[]; total?: number }>("admin-relatorio", corpo);
  const itens = r.itens ?? [];
  return { itens, total: Number(r.total ?? itens.length) || 0 };
}

export interface TreinoDoHistoricoCompleto {
  id: string;
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: unknown;
  sem_cronometro?: boolean;
}

/** O histórico completo de um aluno (o "Buscar" do Histórico antigo) — hml-14d (D26): 20 por página com o total (antes parava em 500). */
export async function carregarHistoricoCompleto(userId: string, pagina: number): Promise<{ itens: TreinoDoHistoricoCompleto[]; total: number }> {
  const r = await invocar<{ historico?: TreinoDoHistoricoCompleto[]; total?: number }>("admin-relatorio", { action: "historicoUsuario", userId, pagina });
  const itens = r.historico ?? [];
  return { itens, total: Number(r.total ?? itens.length) || 0 };
}
