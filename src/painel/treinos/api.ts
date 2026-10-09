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
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os tipos gerados do supabase não conhecem professor_id/colunas novas (como no admin antigo) */
import { DB_SCHEMA, supabase } from "@/integrations/supabase/client";
import { POR_PAGINA, deslocamento } from "@/lib/paginacao";
import { listarAlunos } from "@/lib/saasApi";
import { ErroTreinoPainel, exerciciosDaLista, invocar, tirarTreino, type ItemHistorico } from "@/treino/editor/api";
import type { CamposEquivalencia } from "@/treino/equivalencia";
import { LIMITE_SELETOR_TREINO, alunoDaLista } from "./regras";
import type {
  AlunoDaLista, AlunoQuemRecebe, Catalogo, DetalhesDosModelos, ExercicioCatalogo, FiltrosExercicios, FiltrosModelos, GrupoMuscularRow, LinhaModelo,
  ModeloAberto, ModeloRow, PaginaModelos, PaginaQuemRecebe, PastaRow, PerfilRecebe, QuemMexe, VinculoPasta,
} from "./tipos";

// staging tem bucket próprio de mídias — upload não polui as fotos de produção (o mesmo do admin antigo)
export const BUCKET_EXERCICIOS = DB_SCHEMA === "staging" ? "exercicios-staging" : "exercicios";

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const tabela = (nome: string) => (supabase.from as any)(nome);

function falhou(error: { message?: string; code?: string } | null | undefined): never {
  if (!online()) throw new ErroTreinoPainel("sem_internet");
  const codigo = error?.code === "23505" ? "repetido" : error?.code === "23503" ? "em_uso" : error?.code === "42501" ? "sem_permissao" : error?.message || "erro_interno";
  throw new ErroTreinoPainel(codigo);
}

function exigirInternet(): void {
  if (!online()) throw new ErroTreinoPainel("sem_internet");
}

async function emLotes<T>(ids: string[], ler: (lote: string[]) => Promise<T[]>, tamanho = 150): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; i < ids.length; i += tamanho) saida.push(...(await ler(ids.slice(i, i + tamanho))));
  return saida;
}

/** O filtro "global ou meu" no servidor (o de outros profissionais não precisa nem descer). */
const doEscopo = (q: any, meuId: string | null) => (meuId ? q.or(`professor_id.is.null,professor_id.eq.${meuId}`) : q.is("professor_id", null));

// ───────────────────────── leitura ─────────────────────────

const COLS_LINHA = "grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg";
const COLS_EXERCICIO = "id, nome, grupo_muscular, emoji, tipo, imagem_url, subgrupo, dica, professor_id, padrao_movimento, equipamento, variacao";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O max_rows do PostgREST no Treino: uma leitura nunca traz mais que isso. */
const POR_LEITURA = 1000;

/**
 * hml-14d (B21 · D18/D23): todas as páginas de 1000 de uma leitura (a consulta com ordem ESTÁVEL — desempate pelo id — e
 * `.range(de, ate)`), sem o corte calado do PostgREST (antes: `.limit(2000/3000)`, que valiam 1000). Erro do banco → lança.
 */
async function todasAsPaginas<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; de < 100 * POR_LEITURA; de += POR_LEITURA) {
    const r = await montar(de, de + POR_LEITURA - 1);
    if (r.error) falhou(r.error);
    const linhas = (r.data ?? []) as T[];
    saida.push(...linhas);
    if (linhas.length < POR_LEITURA) return saida;
  }
  throw new ErroTreinoPainel("lista_grande_demais");
}

const linhasDosModelos = (ids: string[]) =>
  emLotes(ids, (lote) => todasAsPaginas<LinhaModelo>((de, ate) => tabela("tb_grupos_exercicios").select(COLS_LINHA).in("grupo_id", lote).order("ordem").order("id").range(de, ate)));

const vinculosDasPastas = (ids: string[]) =>
  emLotes(ids, (lote) => todasAsPaginas<VinculoPasta>((de, ate) => tabela("tb_pastas_treino_grupos").select("pasta_id, grupo_id").in("pasta_id", lote).order("id").range(de, ate)));

const vinculosDosModelos = (ids: string[]) =>
  emLotes(ids, (lote) => todasAsPaginas<VinculoPasta>((de, ate) => tabela("tb_pastas_treino_grupos").select("pasta_id, grupo_id").in("grupo_id", lote).order("id").range(de, ate)));

/** As pastas que a pessoa vê (as dela e as globais) — inteiras (teto natural: 2 por profissional hoje). */
export const carregarPastas = (meuId: string | null) => {
  exigirInternet();
  return todasAsPaginas<PastaRow>((de, ate) => doEscopo(tabela("tb_pastas_treino").select("id, nome, professor_id"), meuId).order("nome").order("id").range(de, ate));
};

/** Os grupos musculares (globais e meus) — o formulário do exercício e a folha "Grupos musculares". */
export const carregarMusculos = (meuId: string | null) => {
  exigirInternet();
  return todasAsPaginas<GrupoMuscularRow>((de, ate) => doEscopo(tabela("grupos_musculares").select("id, nome, professor_id"), meuId).order("nome").order("id").range(de, ate));
};

/**
 * O catálogo inteiro (Ferramentas › Modelos): tudo em páginas de 1000 com `order(nome, id)` — antes `.limit(2000/3000)` (= 1000,
 * calado: o exercício fora dos 1000 sumia do modelo sem aviso).
 */
export async function carregarCatalogo(meuId: string | null): Promise<Catalogo> {
  exigirInternet();
  const [modelos, pastas, exercicios, musculos] = await Promise.all([
    todasAsPaginas<ModeloRow>((de, ate) => doEscopo(tabela("tb_grupos_treino").select("id, nome, professor_id"), meuId).order("nome").order("id").range(de, ate)),
    carregarPastas(meuId),
    todasAsPaginas<ExercicioCatalogo>((de, ate) => doEscopo(tabela("tb_exercicios").select(COLS_EXERCICIO), meuId).order("nome").order("id").range(de, ate)),
    carregarMusculos(meuId),
  ]);
  const [linhas, vinculos] = await Promise.all([linhasDosModelos(modelos.map((m) => m.id)), vinculosDasPastas(pastas.map((p) => p.id))]);
  return { modelos, pastas, vinculos, linhas, exercicios, musculos };
}

const SEM_DETALHES: DetalhesDosModelos = { linhas: [], exercicios: [], vinculos: [] };

/** hml-14d (D23): as linhas, os exercícios citados (globais ou meus — o de fora do catálogo continua fora) e os vínculos de pasta
 * SÓ dos treinos pedidos (a página: até 20). */
async function detalhesDosModelos(ids: string[], meuId: string | null): Promise<DetalhesDosModelos> {
  if (!ids.length) return SEM_DETALHES;
  const [linhas, vinculos] = await Promise.all([linhasDosModelos(ids), vinculosDosModelos(ids)]);
  const citados = [...new Set(linhas.map((l) => l.exercicio_id))];
  const exercicios = await emLotes(citados, (lote) =>
    todasAsPaginas<ExercicioCatalogo>((de, ate) => doEscopo(tabela("tb_exercicios").select(COLS_EXERCICIO), meuId).in("id", lote).order("id").range(de, ate)));
  return { linhas, exercicios, vinculos };
}

const rpc = (nome: string, args: Record<string, unknown>) => (supabase.rpc as any)(nome, args) as PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;

/**
 * hml-14d (B21 · D23): uma página de Meus treinos — a RPC modelos_da_lista (busca pelo nome do treino ou de um exercício dele,
 * sem acento; a pasta aberta; ordem e total no banco) e os detalhes SÓ dos 20 da página.
 */
export async function carregarPaginaDeModelos(meuId: string | null, filtros: FiltrosModelos, pagina: number): Promise<PaginaModelos> {
  exigirInternet();
  const p_filtros: Record<string, string> = {};
  if (filtros.q.trim()) p_filtros.q = filtros.q.trim();
  if (filtros.pasta) p_filtros.pasta = filtros.pasta;
  const { data, error } = await rpc("modelos_da_lista", { p_filtros, p_offset: deslocamento(pagina), p_limite: POR_PAGINA });
  if (error) falhou(error);
  const r = (data ?? {}) as { total?: number; total_geral?: number; por_pasta?: Record<string, number>; itens?: ModeloRow[] };
  const itens = Array.isArray(r.itens) ? r.itens : [];
  return {
    itens,
    total: Number(r.total ?? 0) || 0,
    totalGeral: Number(r.total_geral ?? 0) || 0,
    porPasta: r.por_pasta ?? {},
    detalhes: await detalhesDosModelos(itens.map((m) => m.id), meuId),
  };
}

/** hml-14d (D23): o `?treino=<id>` que não está na página abre pelo id (global ou meu; outro id → null, como antes). */
export async function carregarModeloPorId(meuId: string | null, id: string): Promise<ModeloAberto> {
  exigirInternet();
  if (!UUID.test(id)) return { modelo: null, detalhes: SEM_DETALHES };
  const { data, error } = await doEscopo(tabela("tb_grupos_treino").select("id, nome, professor_id"), meuId).eq("id", id).maybeSingle();
  if (error) falhou(error);
  const modelo = (data as ModeloRow | null) ?? null;
  return { modelo, detalhes: modelo ? await detalhesDosModelos([modelo.id], meuId) : SEM_DETALHES };
}

/** hml-14d (B21 · D24): uma página da biblioteca (painel) com as contagens do topo — a RPC exercicios_da_lista. */
export const listarExercicios = (filtros: FiltrosExercicios, pagina: number, porPagina = POR_PAGINA) =>
  exerciciosDaLista<ExercicioCatalogo>(filtros, pagina, porPagina);

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

export async function criarModelo(nome: string, dono: string | null): Promise<string> {
  exigirInternet();
  const { data, error } = await tabela("tb_grupos_treino").insert({ nome, professor_id: dono }).select("id").single();
  if (error) falhou(error);
  return String((data as { id: string }).id);
}

export async function renomearModelo(id: string, nome: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_grupos_treino").update({ nome }).eq("id", id);
  if (error) falhou(error);
}

export async function excluirModelo(id: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_grupos_treino").delete().eq("id", id);
  if (error) falhou(error);
}

export async function adicionarAoModelo(grupoId: string, exercicioId: string, ordem: number): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_grupos_exercicios").insert({ grupo_id: grupoId, exercicio_id: exercicioId, ordem });
  if (error) falhou(error);
}

export async function tirarDoModelo(grupoId: string, exercicioId: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_grupos_exercicios").delete().eq("grupo_id", grupoId).eq("exercicio_id", exercicioId);
  if (error) falhou(error);
}

/** A ordem nova do modelo (todos os exercícios dele, na ordem da tela). */
export async function ordenarModelo(grupoId: string, ordem: string[]): Promise<void> {
  exigirInternet();
  for (let i = 0; i < ordem.length; i++) {
    const { error } = await tabela("tb_grupos_exercicios").update({ ordem: i }).eq("grupo_id", grupoId).eq("exercicio_id", ordem[i]);
    if (error) falhou(error);
  }
}

/** Séries, repetições, descanso e carga do exercício NO MODELO (W23) — a de cada aluno continua no perfil dele (W15). */
export async function prescreverModelo(
  grupoId: string,
  exercicioId: string,
  p: Partial<Pick<LinhaModelo, "num_series" | "reps_alvo" | "descanso_segundos" | "carga_sugerida_kg">>,
): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_grupos_exercicios").update(p).eq("grupo_id", grupoId).eq("exercicio_id", exercicioId);
  if (error) falhou(error);
}

// ───────────────────────── pastas ─────────────────────────

export async function criarPasta(nome: string, dono: string | null): Promise<string> {
  exigirInternet();
  const { data, error } = await tabela("tb_pastas_treino").insert({ nome, professor_id: dono }).select("id").single();
  if (error) falhou(error);
  return String((data as { id: string }).id);
}

export async function renomearPasta(id: string, nome: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_pastas_treino").update({ nome }).eq("id", id);
  if (error) falhou(error);
}

/** A pasta sai; os treinos dela ficam (voltam para a lista sem pasta) — como no admin antigo. */
export async function excluirPasta(id: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_pastas_treino").delete().eq("id", id);
  if (error) falhou(error);
}

export async function colocarNaPasta(pastaId: string, grupoId: string, colocar: boolean): Promise<void> {
  exigirInternet();
  const { error } = colocar
    ? await tabela("tb_pastas_treino_grupos").insert({ pasta_id: pastaId, grupo_id: grupoId })
    : await tabela("tb_pastas_treino_grupos").delete().eq("pasta_id", pastaId).eq("grupo_id", grupoId);
  if (error && !(colocar && error.code === "23505")) falhou(error);
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

/** GIF/imagem do exercício no bucket público (escrita só da staff pela política): a URL leva ?v= para o app buscar a nova na hora. */
export async function subirImagem(arquivo: File, exercicioId: string): Promise<string> {
  exigirInternet();
  if (!arquivo.type.startsWith("image/")) throw new ErroTreinoPainel("imagem_invalida");
  if (arquivo.size > 5 * 1024 * 1024) throw new ErroTreinoPainel("imagem_grande");
  const ext = (arquivo.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const caminho = `${exercicioId}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_EXERCICIOS).upload(caminho, arquivo, { upsert: true, contentType: arquivo.type, cacheControl: "31536000" });
  if (error) throw new ErroTreinoPainel(error.message || "upload_falhou");
  const { data } = supabase.storage.from(BUCKET_EXERCICIOS).getPublicUrl(caminho);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function criarExercicio(d: DadosExercicio, dono: string | null): Promise<string> {
  exigirInternet();
  const { data, error } = await tabela("tb_exercicios")
    .insert({ ...d, emoji: "🏋️", professor_id: dono })
    .select("id")
    .single();
  if (error) falhou(error);
  return String((data as { id: string }).id);
}

export async function salvarExercicio(id: string, d: Partial<DadosExercicio> & { imagem_url?: string | null }): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_exercicios").update(d).eq("id", id);
  if (error) falhou(error);
}

export async function excluirExercicio(id: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("tb_exercicios").delete().eq("id", id);
  if (error) falhou(error);
}

export async function criarMusculo(nome: string, dono: string | null): Promise<GrupoMuscularRow> {
  exigirInternet();
  const { data, error } = await tabela("grupos_musculares").insert({ nome, professor_id: dono }).select("id, nome, professor_id").single();
  if (error) falhou(error);
  return data as GrupoMuscularRow;
}

export async function excluirMusculo(id: string): Promise<void> {
  exigirInternet();
  const { error } = await tabela("grupos_musculares").delete().eq("id", id);
  if (error) falhou(error);
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
