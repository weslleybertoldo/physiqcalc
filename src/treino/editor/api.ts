/**
 * Editor do treino do aluno (W15): chamadas às funções do Banco do Treino (admin-semana-treinos, admin-get-workout-plan,
 * admin-relatorio — a regra de quem vê e quem muda mora lá, com a sessão do Treino do profissional) e ao principal (achar o
 * usuário do Treino de uma matrícula nova). Tudo online: o painel não tem PowerSync.
 */
import { principal } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import type { VolumeBloco } from "@/lib/volumeSemanal";
import { calcularVolumeSemanal, type GrupoVolume, type SemanaRowVolume } from "@/lib/volumeSemanal";
import type { SeriePadraoRow } from "@/lib/seriesPadrao";
import type { ConfigTreinoAluno, DadosEditor, ExercicioBiblioteca, ModeloTreino, PrescricaoEditavel, SemanaAtual } from "./tipos";

/** Erro de uma função do Treino, com o código que ela devolveu ("ja_no_treino", "forbidden", "sem_internet"…). */
export class ErroTreinoPainel extends Error {
  constructor(public codigo: string, public status = 0) {
    super(codigo);
  }
}

const online = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

async function invocar<T>(funcao: string, corpo: Record<string, unknown>): Promise<T> {
  if (!online()) throw new ErroTreinoPainel("sem_internet");
  const { data, error } = await supabase.functions.invoke(funcao, { body: corpo });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let codigo = "erro_interno";
    let status = 0;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try {
        const j = await ctx.clone().json();
        codigo = String(j?.error ?? j?.erro ?? codigo);
      } catch {
        codigo = status === 401 ? "invalid_token" : codigo;
      }
    }
    throw new ErroTreinoPainel(codigo, status);
  }
  const d = data as { error?: string } | null;
  if (d && typeof d === "object" && typeof d.error === "string") throw new ErroTreinoPainel(d.error);
  return data as T;
}

const semana = <T>(acao: string, userId: string, extra: Record<string, unknown> = {}) =>
  invocar<T>("admin-semana-treinos", { action: acao, userId, ...extra });

// ───────────────────────── de quem é o treino ─────────────────────────

/**
 * O usuário do Treino do aluno da rota: o treino_user_id da matrícula (aluno que veio do Calc) ou, para a matrícula nova
 * (entrou pelo Physiq), o vínculo de identidade (o principal devolve o login; o Treino acha o usuário e confere a regra).
 * null = o aluno ainda não entrou no app (o treino dele nasce no 1º acesso).
 */
export async function acharAlunoNoTreino(alunoIdDaRota: string, treinoUserId: string | null, temLogin: boolean): Promise<string | null> {
  if (treinoUserId) return treinoUserId;
  if (!temLogin) return null;
  if (!online()) throw new ErroTreinoPainel("sem_internet");
  const { data, error } = await principal.rpc("aluno_treino" as never, { p_aluno: alunoIdDaRota } as never);
  if (error) throw new ErroTreinoPainel(error.message || "erro_interno");
  const r = data as { user_id?: string | null; treino_user_id?: string | null } | null;
  if (r?.treino_user_id) return r.treino_user_id;
  if (!r?.user_id) return null;
  const res = await invocar<{ treino_user_id: string | null }>("admin-semana-treinos", { action: "resolverAluno", principalUserId: r.user_id });
  return res.treino_user_id ?? null;
}

// ───────────────────────── leitura ─────────────────────────

export async function carregarEditor(userId: string): Promise<DadosEditor> {
  const r = await semana<Partial<DadosEditor>>("get", userId);
  return {
    semana: r.semana ?? [],
    gruposDisponiveis: r.gruposDisponiveis ?? [],
    diasConfig: r.diasConfig ?? [],
    seriesPadrao: r.seriesPadrao ?? [],
    exerciciosPorTreino: r.exerciciosPorTreino ?? {},
    config: r.config ?? null,
    podeEditar: r.podeEditar !== false,
    professorDoAluno: r.professorDoAluno ?? null,
  };
}

export const carregarSemanaAtual = (userId: string, inicio: string, fim: string) => semana<SemanaAtual>("semanaAtual", userId, { inicio, fim });

export interface DadosVolume {
  semana: SemanaRowVolume[];
  grupos: Record<string, GrupoVolume>;
  seriesPadrao: SeriePadraoRow[];
  config: { series_padrao_qtd?: number | null } | null;
}

/** Volume PROGRAMADO por bloco muscular (a conta do "Volume Semanal" antigo — trocas definitivas do aluno aplicadas). */
export async function carregarVolume(userId: string): Promise<VolumeBloco[]> {
  const r = await semana<DadosVolume>("volume", userId);
  const padrao = Number(r.config?.series_padrao_qtd);
  return calcularVolumeSemanal(r.semana ?? [], r.grupos ?? {}, r.seriesPadrao ?? [], Number.isFinite(padrao) && padrao >= 1 ? padrao : undefined);
}

export interface ExercicioPraticadoApi {
  id: string;
  isPessoal: boolean;
  nome: string;
  grupo_muscular: string;
  tipo: string | null;
  series: number;
}

export const carregarVolumePraticado = (userId: string, inicio: string, fim: string) =>
  semana<{ exercicios: ExercicioPraticadoApi[] }>("volumePraticado", userId, { inicio, fim }).then((r) => r.exercicios ?? []);

export async function carregarModelos(userId: string): Promise<ModeloTreino[]> {
  const r = await semana<{ modelos: ModeloTreino[] }>("modelos", userId);
  return r.modelos ?? [];
}

/** A biblioteca que o aluno enxerga no app: os globais do master (81 com GIF) + os do professor dele. */
export async function carregarBiblioteca(professorDoAluno: string | null): Promise<ExercicioBiblioteca[]> {
  if (!online()) throw new ErroTreinoPainel("sem_internet");
  let q = supabase
    .from("tb_exercicios")
    .select("id, nome, grupo_muscular, subgrupo, imagem_url, tipo, professor_id, padrao_movimento, equipamento, variacao")
    .order("nome");
  q = professorDoAluno ? q.or(`professor_id.is.null,professor_id.eq.${professorDoAluno}`) : q.is("professor_id", null);
  const { data, error } = await q;
  if (error) throw new ErroTreinoPainel(error.message || "erro_interno");
  return (data ?? []) as unknown as ExercicioBiblioteca[];
}

// ───────────────────────── escrita ─────────────────────────

type AlvoTreino = { grupo_id?: string; grupo_usuario_id?: string };
type AlvoExercicio = { exercicio_id: string | null; exercicio_usuario_id: string | null };

export const salvarPrescricao = (userId: string, alvo: AlvoTreino, ex: AlvoExercicio, p: PrescricaoEditavel) =>
  semana<{ ok: true }>("setPrescricao", userId, {
    ...alvo,
    exercicio_id: ex.exercicio_id,
    exercicio_usuario_id: ex.exercicio_usuario_id,
    num_series: p.series,
    reps_alvo: p.reps,
    descanso_segundos: p.descanso,
    carga_sugerida_kg: p.carga,
  });

export const salvarObservacao = (userId: string, alvo: AlvoTreino, observacao: string | null) =>
  semana<{ ok: true; observacao: string | null }>("setObservacao", userId, { ...alvo, observacao });

export const salvarConfig = (userId: string, campos: Partial<Pick<ConfigTreinoAluno, "tempo_descanso_segundos" | "series_travadas" | "series_padrao_qtd" | "series_modo" | "proxima_troca_treino">>) =>
  semana<{ ok: true; config: ConfigTreinoAluno }>("setConfig", userId, campos);

export interface ResultadoLista {
  ok: true;
  /** o treino que ficou com o aluno (outro id quando virou cópia só dele) */
  grupo_id: string;
  personalizado: boolean;
}

export const adicionarExercicio = (userId: string, grupoId: string, exercicioId: string) =>
  semana<ResultadoLista>("adicionarExercicio", userId, { grupo_id: grupoId, exercicio_id: exercicioId });
export const removerExercicio = (userId: string, grupoId: string, exercicioId: string) =>
  semana<ResultadoLista>("removerExercicio", userId, { grupo_id: grupoId, exercicio_id: exercicioId });
export const ordenarExercicios = (userId: string, grupoId: string, ordem: string[]) =>
  semana<ResultadoLista>("ordenarExercicios", userId, { grupo_id: grupoId, ordem });

export const novoTreino = (userId: string, nome: string) => semana<{ ok: true; grupo_id: string }>("novoTreino", userId, { nome });
export const usarTreino = (userId: string, grupoId: string) => semana<{ ok: true }>("usarTreino", userId, { grupo_id: grupoId });
export const tirarTreino = (userId: string, grupoId: string) => semana<{ ok: true }>("tirarTreino", userId, { grupo_id: grupoId });

// a semana (as ações do "Treino Diário" antigo)
export const salvarDia = (userId: string, dia: string, grupos: AlvoTreino[]) => semana<{ ok: true }>("setDia", userId, { dia_semana: dia, grupos });
export const salvarAlternado = (userId: string, dia: string, alternado: boolean, inicio: string) =>
  semana<{ ok: true }>("setDiaConfig", userId, { dia_semana: dia, alternado, inicio });
export const salvarExtras = (userId: string, dia: string, extras: (AlvoTreino & { atrelado_grupo_id?: string; atrelado_grupo_usuario_id?: string })[]) =>
  semana<{ ok: true }>("setExtras", userId, { dia_semana: dia, extras });

/** Padrão N para todos os exercícios: o nº do aluno + apaga os nºs próprios (a prescrição fica — W15). */
export async function aplicarPadraoATodos(userId: string, n: number): Promise<void> {
  await salvarConfig(userId, { series_modo: "padrao", series_padrao_qtd: n });
  await semana<{ ok: true }>("limparSeriesAluno", userId);
}

// ───────────────────────── PDF do treino, histórico e relatório ─────────────────────────

export const carregarPlanoParaPdf = (userId: string) =>
  invocar<{ profile: Record<string, unknown>; dias: Record<string, unknown>[] }>("admin-get-workout-plan", { userId });

export interface ItemHistorico {
  chave: string;
  userId: string;
  pessoa: string;
  data: string;
  diaSemana: string;
  nomeTreino: string;
  duracaoSegundos: number | null;
  totalExercicios: number;
  academia: string | null;
  comCronometro: boolean;
}

export const carregarHistoricoMes = (userId: string, ano: number, mes: number) =>
  invocar<{ itens: ItemHistorico[] }>("admin-relatorio", { action: "historicoMes", userId, ano, mes }).then((r) => r.itens ?? []);

export interface TreinoDoHistorico {
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: { nome: string; academia_nome?: string | null; series?: { numero_serie: number; peso: number; reps: number }[]; series_concluidas?: number }[];
  sem_cronometro?: boolean;
}

export const carregarTreinoDoHistorico = (userId: string, chave: string) =>
  invocar<{ treino: TreinoDoHistorico | null }>("admin-relatorio", { action: "historicoTreino", userId, chave }).then((r) => r.treino);
