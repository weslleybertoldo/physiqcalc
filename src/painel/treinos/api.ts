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
import { listarAlunos } from "@/lib/saasApi";
import { ErroTreinoPainel, invocar, tirarTreino, type ItemHistorico } from "@/treino/editor/api";
import type { CamposEquivalencia } from "@/treino/equivalencia";
import type { AlunoDaLista, Catalogo, ExercicioCatalogo, GrupoMuscularRow, LinhaModelo, ModeloRow, PastaRow, PerfilRecebe, VinculoPasta } from "./tipos";

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

export async function carregarCatalogo(meuId: string | null): Promise<Catalogo> {
  exigirInternet();
  const [mo, pa, ex, mu] = await Promise.all([
    doEscopo(tabela("tb_grupos_treino").select("id, nome, professor_id"), meuId).order("nome").limit(2000),
    doEscopo(tabela("tb_pastas_treino").select("id, nome, professor_id"), meuId).order("nome").limit(1000),
    doEscopo(tabela("tb_exercicios").select(COLS_EXERCICIO), meuId).order("nome").limit(3000),
    doEscopo(tabela("grupos_musculares").select("id, nome, professor_id"), meuId).order("nome").limit(1000),
  ]);
  for (const r of [mo, pa, ex, mu]) if (r.error) falhou(r.error);
  const modelos = (mo.data ?? []) as ModeloRow[];
  const pastas = (pa.data ?? []) as PastaRow[];
  const [linhas, vinculos] = await Promise.all([
    emLotes(modelos.map((m) => m.id), async (lote) => {
      const r = await tabela("tb_grupos_exercicios").select(COLS_LINHA).in("grupo_id", lote).order("ordem");
      if (r.error) falhou(r.error);
      return (r.data ?? []) as LinhaModelo[];
    }),
    emLotes(pastas.map((p) => p.id), async (lote) => {
      const r = await tabela("tb_pastas_treino_grupos").select("pasta_id, grupo_id").in("pasta_id", lote);
      if (r.error) falhou(r.error);
      return (r.data ?? []) as VinculoPasta[];
    }),
  ]);
  return { modelos, pastas, vinculos, linhas, exercicios: (ex.data ?? []) as ExercicioCatalogo[], musculos: (mu.data ?? []) as GrupoMuscularRow[] };
}

/** Os alunos da lista do profissional (os dele, ele mesmo e os das contas de que é dono; o master, os dele — como no admin antigo). */
export async function carregarAlunos(master: boolean, meuId: string | null): Promise<AlunoDaLista[]> {
  exigirInternet();
  const todos: AlunoDaLista[] = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    const r = await listarAlunos({ limit: 100, offset: pagina * 100, professorId: master ? meuId : undefined });
    const lista = (r?.users ?? []) as { id: string; nome?: string | null; email?: string | null; foto_url?: string | null }[];
    for (const u of lista) todos.push({ id: u.id, nome: (u.nome || u.email || "").trim() || "Aluno", email: u.email || "", foto_url: u.foto_url ?? null });
    const total = Number((r as { total?: number })?.total ?? lista.length);
    if (lista.length < 100 || todos.length >= total) break;
  }
  const vistos = new Set<string>();
  return todos.filter((a) => (vistos.has(a.id) ? false : (vistos.add(a.id), true))).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Quais dos meus alunos recebem cada modelo (função — a RLS só deixa ler os que têm o profissional como professor). */
export async function carregarQuemRecebe(grupos: string[]): Promise<PerfilRecebe[]> {
  if (!grupos.length) return [];
  const r = await invocar<{ perfis?: PerfilRecebe[] }>("admin-semana-treinos", { action: "quemRecebe", grupos });
  return r.perfis ?? [];
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

/** Os treinos feitos no mês por TODOS os meus alunos (o Histórico antigo: o professor vê os dele; o master, todos). */
export const carregarHistoricoDoMes = (ano: number, mes: number) =>
  invocar<{ itens: ItemHistorico[] }>("admin-relatorio", { action: "historicoMes", ano, mes }).then((r) => r.itens ?? []);

export interface TreinoDoHistoricoCompleto {
  id: string;
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: unknown;
  sem_cronometro?: boolean;
}

/** O histórico completo de um aluno (o "Buscar" do Histórico antigo). */
export const carregarHistoricoCompleto = (userId: string) =>
  invocar<{ historico: TreinoDoHistoricoCompleto[] }>("admin-relatorio", { action: "historicoUsuario", userId }).then((r) => r.historico ?? []);
