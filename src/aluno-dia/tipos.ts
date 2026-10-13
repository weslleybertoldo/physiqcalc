// Physiq W-A P2 — o contrato das rotinas e da dieta livre (as partes P3, P5 e P6 usam): o que a função aluno-dia devolve — o jsonb das RPCs das
// migrations 20261012210000_wa2_rotinas (wa_rotina_json, minhas_rotinas, rotinas_do_aluno) e 20261012220000_wa3_dieta_livre (meu_dia,
// wa_dia_item_json, meus_alimentos, buscar_alimentos_do_aluno, dia_do_aluno) — e os dados que as gravações aceitam.
export type TipoDeRotina = "suplemento" | "remedio" | "habito" | "outro";

export interface Rotina {
  id: string;
  origem: "aluno" | "profissional";
  /** a matrícula de onde o profissional criou (nula na do aluno) */
  paciente_id: string | null;
  nome: string;
  detalhe: string | null;
  tipo: TipoDeRotina;
  /** "HH:MM" ou null */
  horario: string | null;
  /** 1 = segunda … 7 = domingo */
  dias_semana: number[];
  lembrete: boolean;
  ordem: number;
  criada_em: string;
  alterada_em: string;
  arquivada_em: string | null;
}

export interface RotinaFeita {
  rotina_id: string;
  dia: string;
  feita_em: string;
}

export interface MinhasRotinas {
  hoje: string;
  rotinas: Rotina[];
  feitas: RotinaFeita[];
}

export interface RotinaDoProfissional extends Rotina {
  pode_editar: boolean;
  criada_por_nome: string | null;
  arquivada_pelo_aluno: boolean;
}

export interface EventoDaRotina {
  rotina_id: string;
  quem: "aluno" | "profissional";
  o_que: "criou" | "mudou" | "arquivou";
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  em: string;
  por_nome: string | null;
}

export interface RotinasDoAluno {
  paciente_id: string;
  tem_login: boolean;
  pode_criar: boolean;
  rotinas: RotinaDoProfissional[];
  feitas: RotinaFeita[];
  historico: EventoDaRotina[];
}

export interface DadosDaRotina {
  nome?: string;
  detalhe?: string | null;
  tipo?: TipoDeRotina;
  horario?: string | null;
  dias_semana?: number[];
  lembrete?: boolean;
}

/** Um item do dia (o que ele pôs ou tirou), com o RETRATO: o nome da refeição, o nome e os macros da quantidade. */
export interface ItemDoDia {
  id: string;
  paciente_id: string;
  dia: string;
  tipo: "adicionado" | "tirado";
  refeicao_id: string | null;
  extra_id: string | null;
  item_refeicao_id: string | null;
  alimento_id: string | null;
  aluno_alimento_id: string | null;
  aluno_receita_id: string | null;
  quantidade_g: number | null;
  porcoes: number | null;
  refeicao_nome: string | null;
  nome: string;
  energia_kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidio_g: number;
  fibra_g: number;
  criado_em: string;
}

export interface ExtraDoDia {
  id: string;
  paciente_id?: string;
  /** só no dia_do_aluno (o painel lê vários dias) */
  dia?: string;
  nome: string;
  horario: string | null;
  concluida_em: string | null;
}

export interface MeuDia {
  dia: string;
  hoje: string;
  pode_gravar: boolean;
  matriculas: { paciente_id: string; liberada: boolean }[];
  plano_ativo: { plano_id: string; paciente_id: string } | null;
  extras: ExtraDoDia[];
  itens: ItemDoDia[];
}

export interface MacrosDaPorcao {
  energia_kcal: number;
  proteina_g: number;
  carboidrato_g: number;
  lipidio_g: number;
  fibra_g: number;
}

export interface MeuAlimento extends MacrosDaPorcao {
  id: string;
  nome: string;
  porcao_g: number;
  criado_em: string;
  alterado_em: string;
}

export interface MinhaReceita {
  id: string;
  nome: string;
  porcoes: number;
  por_porcao: MacrosDaPorcao;
  itens: { id: string; alimento_id: string | null; aluno_alimento_id: string | null; nome: string; quantidade_g: number }[];
}

export interface MinhaBiblioteca {
  alimentos: MeuAlimento[];
  receitas: MinhaReceita[];
}

export interface ItemDaBusca extends MacrosDaPorcao {
  tipo: "receita" | "meu" | "plano" | "taco";
  id: string;
  nome: string;
  /** null na receita (os macros são de 1 porção) */
  porcao_g: number | null;
}

export interface BuscaDoAluno {
  itens: ItemDaBusca[];
  pagina: number;
  tem_mais: boolean;
}

export interface DiaDoAluno {
  paciente_id: string;
  nivel: "ver" | "mexer";
  liberada: boolean;
  extras: ExtraDoDia[];
  itens: ItemDoDia[];
}

export interface DadosDoItemDoDia {
  refeicao_id?: string;
  extra_id?: string;
  alimento_id?: string;
  aluno_alimento_id?: string;
  aluno_receita_id?: string;
  quantidade_g?: number;
  porcoes?: number;
}

export interface DadosDaExtra {
  dia?: string;
  nome?: string;
  horario?: string | null;
  ja_comi?: boolean;
}

export interface DadosDoAlimento {
  nome?: string;
  porcao_g?: number;
  energia_kcal?: number;
  proteina_g?: number;
  carboidrato_g?: number;
  lipidio_g?: number;
  fibra_g?: number;
}

export interface DadosDaReceita {
  nome?: string;
  porcoes?: number;
  itens?: ({ alimento_id: string; quantidade_g: number } | { aluno_alimento_id: string; quantidade_g: number })[];
}
