// Physiq W11 — o que a função minha_dieta() do banco principal devolve para a aba Dieta (tela 3). Os tipos seguem as tabelas
// do PhysiqNutri (planos_alimentares, refeicoes, itens_refeicao, alimentos, medidas_caseiras, orientacoes, metas,
// diario_alimentar) — a aba lê só pela função (security definer, só o que é do próprio aluno, de todas as matrículas dele).
import type { Macros } from "./numeros";

export type MedidaDoAlimento = { id: string; descricao: string; gramas: number; ordem: number };

/** O que o cálculo precisa do alimento: macros por 100 g + a medida caseira usada no item. */
export type AlimentoDoItem = Macros & { id: string; nome: string; fonte: string; grupo?: string | null; medidas_caseiras?: MedidaDoAlimento[] | null };

export type ItemDaRefeicao = {
  id: string;
  alimento_id: string;
  quantidade_g: number;
  medida_caseira_id: string | null;
  quantidade_medida: number | null;
  ordem: number;
  substitutos: unknown;
  observacao: string | null;
  created_at: string;
  alimento: AlimentoDoItem | null;
};

export type RefeicaoDoPlano = {
  id: string;
  nome: string;
  horario: string | null;
  ordem: number;
  observacao: string | null;
  /** NF3: dias da semana (1 = segunda … 7 = domingo); vazio = todos os dias, como hoje */
  dias_semana: number[];
  itens: ItemDaRefeicao[];
};

export type PlanoAlimentar = {
  id: string;
  paciente_id: string;
  nutricionista_id: string;
  titulo: string;
  metodo: string;
  kcal_alvo: number | null;
  observacao: string | null;
  favorito: boolean;
  created_at: string;
  updated_at: string;
  refeicoes: RefeicaoDoPlano[];
};

export type Orientacao = { id: string; paciente_id: string; titulo: string; conteudo: string; created_at: string; updated_at: string };

export type Meta = {
  id: string;
  paciente_id: string;
  titulo: string;
  descricao: string | null;
  dias_semana: number[];
  ativa: boolean;
  /** yyyy-mm-dd: desde quando vale */
  inicio: string | null;
  created_at: string;
  updated_at?: string;
};

export type RegistroDiario = {
  id: string;
  paciente_id: string;
  data_hora: string;
  refeicao: string;
  comentario: string;
  reacao_nutri: string | null;
  comentario_nutri: string;
  reagido_em: string | null;
  /** o arquivo no bucket privado "diario" (o aluno lê a própria foto — P29) */
  path: string;
};

export type NutricionistaDaMatricula = { id: string; nome: string | null; foto_url: string | null };

export type MatriculaNutricao = {
  id: string;
  nome: string;
  conta_id: string | null;
  conta_nome: string | null;
  ativo: boolean;
  /** código do diário (/d/<código>) — o envio da foto usa o mesmo caminho do link público (W30 do Nutri) */
  link_codigo: string;
  nutricionista: NutricionistaDaMatricula;
};

export type DadosDieta = {
  /** yyyy-mm-dd de hoje em São Paulo, pelo relógio do servidor */
  hoje: string;
  /** o dia dos ✓ devolvidos */
  dia: string;
  matriculas: MatriculaNutricao[];
  planos: PlanoAlimentar[];
  orientacoes: Orientacao[];
  metas: Meta[];
  refeicoes_concluidas: string[];
  metas_concluidas: string[];
  diario: RegistroDiario[];
};
