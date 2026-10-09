/** Tipos das respostas das funções do painel master (W27) — o formato das funções master_* do banco principal. */
export type Situacao = "teste" | "ativa" | "vencida" | "isenta" | "suspensa" | "cancelada";
export type Origem = "nova" | "legado_calc" | "legado_nutri" | "app";
export type PlanoConta = "treino" | "nutricao" | "treino_nutricao";
export type Faixa = "f10" | "f30" | "f100" | "livre";
export type ModuloConta = "treino" | "nutricao";

export interface ContaLinha {
  id: string;
  nome: string;
  origem: Origem;
  plano: PlanoConta;
  modulos: ModuloConta[];
  faixa: Faixa;
  periodicidade: "mensal" | "anual";
  situacao: Situacao;
  situacao_efetiva: Situacao;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number;
  valor_travado: number | null;
  valor_mensal: number | null;
  regra_pix: string;
  cobranca_legada: boolean;
  /**
   * W28: a conta legada segue o preço (valor_travado) e as regras de hoje até trocar de plano — a ação "Plano" avisa que ela sai do
   * legado (o servidor tira o preço travado). Pode não vir (servidor antigo).
   */
  regras_legadas?: boolean;
  isenta_motivo: string | null;
  recebimento_modo: "pix_manual" | "nenhum" | "mercadopago";
  bloquear_app_inadimplente: boolean;
  alunos_bloqueados_em: string | null;
  alunos_bloqueados_msg: string | null;
  criado_em: string;
  eh_app: boolean;
  dono: { id: string; nome: string | null; email: string | null; master: boolean } | null;
  membros: number;
  convidados: number;
  alunos_ativos: number;
  alunos_total: number;
  limite_alunos: number | null;
  assinatura: { status: string; valor: number | null; proximo_vencimento: string | null } | null;
  legado_nutri: { teste_ate: string | null; pago_ate: string | null; isento: boolean } | null;
  ultima_fatura: { id: string; valor: number; status: string; forma: string | null; tipo: string; criado_em: string; pago_em: string | null; cobre_ate: string | null } | null;
  chave_pix: { tipo: string; chave: string; favorecido: string | null; banco: string | null } | null;
}

export interface Membro {
  id: string;
  user_id: string | null;
  nome: string | null;
  email: string | null;
  papeis: Array<"dono" | "personal" | "nutricionista">;
  status: "convidado" | "ativo" | "removido";
  codigo_convite: string | null;
  master: boolean;
  alunos: number;
  ultimo_acesso: string | null;
}

export interface Fatura {
  id: string;
  conta_id?: string;
  conta_nome?: string;
  tipo: string;
  valor: number;
  status: string;
  forma: string | null;
  cobre_de: string | null;
  cobre_ate: string | null;
  pago_em: string | null;
  criado_em: string;
  descricao: string | null;
  registrado_por: string | null;
}

export interface EventoConta {
  id: number;
  tipo: string;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  em: string;
  por: string | null;
}

export interface DetalheConta {
  conta: ContaLinha;
  membros: Membro[];
  alunos: { ativos: number; inativos: number; bloqueados: number; lixeira: number; sem_responsavel: number };
  faturas: Fatura[];
  eventos: EventoConta[];
  hoje: string;
}

export interface VisaoGeral {
  hoje: string;
  contas: { total: number; teste: number; ativas: number; vencidas: number; isentas: number; suspensas: number; novas: number; legado_calc: number; legado_nutri: number };
  profissionais: number;
  alunos: { ativos: number; app: number; bloqueados: number; em_2_contas: number };
  receita: {
    mes: number;
    /** o mês anterior INTEIRO (fica para os APKs antigos) */
    mes_anterior: number;
    app_mes: number;
    /**
     * W28: o que as contas pagaram por dia (faturas aprovadas) do 1º do mês anterior até hoje — a tela compara o mês com o MESMO
     * período do mês anterior (comparacaoDoMes). Pode não vir (servidor antigo).
     */
    recebimentos?: Array<{ dia: string; valor: number | string; origem: "conta" }>;
  };
  atencao: {
    vencidas: ContaLinha[];
    teste_acabando: ContaLinha[];
    suspensas: ContaLinha[];
    alunos_bloqueados: ContaLinha[];
    pagamentos_recusados: number;
    espelho_falhas: number;
    espelho_parado: number;
  };
}

export interface Aluno {
  paciente_id: string;
  nome: string | null;
  email: string | null;
  user_id: string | null;
  tem_login: boolean;
  ativo: boolean;
  criado_em: string;
  conta: { id: string; nome: string; origem: Origem; eh_app: boolean } | null;
  personal: { id: string; nome: string | null } | null;
  nutricionista: { id: string; nome: string | null } | null;
  modulos: ModuloConta[];
  bloqueado: boolean;
  conta_bloqueada: boolean;
  p7: boolean;
  app: { plano: string | null; valor: number | null; teste_ate: string | null; pago_ate: string | null; encerrada_em: string | null; objetivo: string | null } | null;
}

export interface ListaAlunos {
  modo: string;
  total: number;
  offset: number;
  limite: number;
  alunos: Aluno[];
  contas: Array<{ id: string; nome: string; origem: Origem; plano: PlanoConta; modulos: ModuloConta[] }>;
  contagens: { ativos: number; app: number; p7: number; sem_conta: number };
}

export interface PessoaSemConta {
  user_id: string;
  nome: string | null;
  email: string | null;
  papel: string | null;
  criado_em: string;
  ultimo_acesso: string | null;
}

export interface PrecoPlano {
  id: string;
  plano: PlanoConta;
  faixa: Faixa;
  min_alunos: number;
  max_alunos: number | null;
  valor_mensal: number;
  valor_anual: number | null;
  ativo: boolean;
  ordem: number;
  contas: number;
}

export interface AvisoMudanca {
  ativo?: boolean;
  versao?: string;
  calc?: { ativo?: boolean; titulo?: string; texto?: string };
  nutri?: { ativo?: boolean; titulo?: string; texto?: string };
}

export interface PlanosMaster {
  precos: PrecoPlano[];
  historico: Array<{ id: number; em: string; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null; por: string | null }>;
  config: {
    teste_dias: number | null;
    teste_max_alunos: number | null;
    aluno_do_app: { teste_dias?: number } | null;
    aviso_mudanca: AvisoMudanca | null;
    aviso_mudanca_em: string | null;
    login_limite: Record<string, unknown> | null;
  };
  tolerancia_legado_calc: number;
}

export interface ItemPrato {
  id?: string;
  alimento_id: string;
  alimento?: string;
  nome: string | null;
  quantidade_g: number;
  medida: string | null;
  kcal?: number;
  proteina_g?: number;
  carboidrato_g?: number;
  lipidio_g?: number;
}

export interface Prato {
  id: string;
  codigo: string;
  nome: string;
  refeicao: "cafe_da_manha" | "almoco" | "lanche" | "jantar" | "ceia";
  objetivos: Array<"emagrecer" | "manter" | "ganhar_massa">;
  descricao: string | null;
  modo_preparo: string | null;
  ordem: number;
  ativo: boolean;
  itens: ItemPrato[];
}

/**
 * hml-14d (B21 · D28): uma PÁGINA de uma lista do master — as chaves de hoje das RPCs master_* + `total` (a lista inteira com o
 * filtro e a busca; a página vem do banco, 20 por vez).
 */
export interface PaginaContas {
  contas: ContaLinha[];
  resumo: Record<string, number>;
  hoje: string;
  total: number;
}
export interface PaginaFinanceiro extends PaginaContas {
  /** as 40 faturas mais novas (o cartão "Faturas recentes" mostra 10) */
  faturas: Fatura[];
  /** todas as faturas do banco (o chip do cartão — P6) */
  faturas_total: number;
}
export interface PaginaIntegracoes {
  contas: ContaLinha[];
  resumo: Record<string, number>;
  total: number;
}
export interface PaginaAlunosDoApp {
  alunos: AlunoDoApp[];
  conta_id: string | null;
  total: number;
}
export interface PaginaSemConta {
  pessoas: PessoaSemConta[];
  total: number;
}

export interface AlunoDoApp {
  paciente_id: string;
  user_id: string | null;
  nome: string | null;
  email: string | null;
  ativo: boolean;
  plano: string | null;
  plano_nome: string | null;
  valor: number | null;
  objetivo: string | null;
  teste_ate: string | null;
  pago_ate: string | null;
  pausada: boolean | null;
  assinatura: string | null;
  encerrada_em: string | null;
  encerrada_motivo: string | null;
  criado_em: string;
}
