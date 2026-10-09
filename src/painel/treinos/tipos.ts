/**
 * Painel › Treinos (W23 — spec 4.4 "Treinos", C42–C45): o que vem do Banco do Treino (os modelos, as pastas, a biblioteca e os
 * grupos musculares — as MESMAS tabelas da aba "Treinos" do admin antigo) e o modelo de tela montado a partir disso (regras.ts).
 */
import type { EscopoDaBiblioteca, FiltrosDaBiblioteca, PaginaDaBiblioteca } from "@/treino/editor/api";
import type { ExercicioEditor } from "@/treino/editor/tipos";

/** Um treino-modelo (tb_grupos_treino): do profissional (professor_id) ou GLOBAL do master (professor_id null). */
export interface ModeloRow {
  id: string;
  nome: string;
  professor_id: string | null;
}

export interface PastaRow {
  id: string;
  nome: string;
  professor_id: string | null;
}

export interface VinculoPasta {
  pasta_id: string;
  grupo_id: string;
}

/** Um exercício do modelo (tb_grupos_exercicios) com a prescrição DO MODELO (W23 — opcional; vazio = como hoje). */
export interface LinhaModelo {
  grupo_id: string;
  exercicio_id: string;
  ordem: number;
  num_series: number | null;
  reps_alvo: string | null;
  descanso_segundos: number | null;
  carga_sugerida_kg: number | null;
}

/** Exercício da biblioteca (tb_exercicios): global do master (professor_id null) ou do profissional. */
export interface ExercicioCatalogo {
  id: string;
  nome: string;
  grupo_muscular: string;
  emoji: string | null;
  tipo: string | null;
  imagem_url: string | null;
  subgrupo: string | null;
  dica: string | null;
  professor_id: string | null;
  padrao_movimento: string | null;
  equipamento: string | null;
  variacao: string | null;
}

export interface GrupoMuscularRow {
  id: string;
  nome: string;
  professor_id: string | null;
}

export interface Catalogo {
  modelos: ModeloRow[];
  pastas: PastaRow[];
  vinculos: VinculoPasta[];
  linhas: LinhaModelo[];
  exercicios: ExercicioCatalogo[];
  musculos: GrupoMuscularRow[];
}

/** Quem está no painel (o usuário do Treino): o master edita o catálogo GLOBAL; o personal, o dele; o dono sem papel só lê. */
export interface QuemMexe {
  meuId: string | null;
  master: boolean;
  /** tem papel no Treino (personal ou master) — o dono sem papel de personal só lê (spec 4.1) */
  staff: boolean;
}

/** Aluno da lista "Quem recebe" (os alunos da lista do profissional — admin-list-users). */
export interface AlunoDaLista {
  id: string;
  nome: string;
  email: string;
  foto_url: string | null;
}

export interface PerfilRecebe {
  grupo_id: string;
  user_id: string;
}

// ───────────────────────── modelo de tela ─────────────────────────

export interface ModeloTela {
  id: string;
  nome: string;
  global: boolean;
  /** quem está no painel muda este modelo (o master muda os globais; o personal, os dele) */
  editavel: boolean;
  exercicios: ExercicioEditor[];
  /** as pastas em que o modelo está (só as visíveis) */
  pastas: string[];
  /** quantos dos alunos de quem está no painel recebem o modelo */
  alunos: number;
  totalSeries: number;
  minutos: number | null;
  temPrescricao: boolean;
}

export interface PastaTela {
  id: string;
  nome: string;
  global: boolean;
  editavel: boolean;
  /** quantos treinos (global ou meu) a pasta tem — o `por_pasta` do banco (hml-14d: a tela não tem mais todos os treinos) */
  total: number;
}

export type AbaTreinos = "treinos" | "biblioteca" | "historico" | "relatorio";

// ───────────────────────── hml-14d (B21 · D23–D26): as páginas que vêm do banco ─────────────────────────

/** Os filtros da lista de treinos (Meus treinos) — vão à RPC modelos_da_lista. */
export interface FiltrosModelos {
  q: string;
  /** a pasta aberta (só se ela existe na lista de pastas) */
  pasta: string | null;
}

/** As linhas, os exercícios citados e os vínculos de pasta SÓ dos treinos da página (ou do treino aberto por id). */
export interface DetalhesDosModelos {
  linhas: LinhaModelo[];
  exercicios: ExercicioCatalogo[];
  vinculos: VinculoPasta[];
}

/** Uma página de Meus treinos: os treinos (id, nome, dono), o total com os filtros, o total sem filtro, os números das pastas e
 * os detalhes dos treinos da página. */
export interface PaginaModelos {
  itens: ModeloRow[];
  total: number;
  totalGeral: number;
  porPasta: Record<string, number>;
  detalhes: DetalhesDosModelos;
}

/** O treino aberto por `?treino=` fora da página (null = não existe ou não é visível). */
export interface ModeloAberto {
  modelo: ModeloRow | null;
  detalhes: DetalhesDosModelos;
}

/** Os filtros e a página da RPC exercicios_da_lista (Biblioteca do painel e a folha do editor): o contrato mora em
 * src/treino/editor/api.ts (a folha do editor usa o mesmo). */
export type EscopoExercicios = EscopoDaBiblioteca;
export type FiltrosExercicios = FiltrosDaBiblioteca;
export type PaginaExercicios = PaginaDaBiblioteca<ExercicioCatalogo>;

/** Um aluno da lista "Quem recebe" (a ação quemRecebeLista: a página já vem marcada). */
export interface AlunoQuemRecebe extends AlunoDaLista {
  recebe: boolean;
}

export interface PaginaQuemRecebe {
  /** o modelo da resposta (a página anterior que fica à vista enquanto a nova chega pode ser de outro modelo) */
  grupo: string;
  itens: AlunoQuemRecebe[];
  /** com a busca */
  total: number;
  /** o chip "N DE M" (sem a busca) */
  totalRecebem: number;
  totalAlunos: number;
}
