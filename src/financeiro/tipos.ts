// Physiq W6 — tipos da cobrança aluno → profissional (respostas da função pagamentos-aluno e do financeiro_do_aluno() do banco
// principal — supabase-principal/functions/pagamentos-aluno e a migração 20260929150000_w06_financeiro_aluno.sql).

export type StatusCobranca = "aberta" | "paga" | "cancelada" | "aguardando_confirmacao";
export type TipoCobranca = "mensalidade" | "avulsa";
export type FormaCobranca = "pix_manual" | "mp" | "manual";
export type ModoRecebimento = "pix_manual" | "nenhum" | "mercadopago";

export interface CobrancaVista {
  id: string;
  paciente_id: string;
  tipo: TipoCobranca;
  descricao: string;
  valor: number;
  vencimento: string;
  status: StatusCobranca;
  forma: FormaCobranca | null;
  metodo: string | null;
  mes_ref: string | null;
  pago_em: string | null;
  enviado_em: string | null;
  cobre_de: string | null;
  cobre_ate: string | null;
  comprovante: boolean;
  comprovante_pdf: boolean;
  recusado_motivo: string | null;
  recusado_em: string | null;
  reembolsado_em: string | null;
  mp_status: string | null;
  mp: boolean;
  mp_simulado: boolean;
  transacao_id: string | null;
  pix_qr: string | null;
  pix_copia_cola: string | null;
  pix_expira_em: string | null;
  criado_por: string | null;
  confirmado_em: string | null;
  created_at: string;
}

export interface MensalidadeVista {
  valor: number;
  plano_id: string | null;
  plano: string | null;
  pausada: boolean;
  pago_ate: string | null;
  desde: string | null;
  coberta: boolean;
  /** W7b — aluno sem profissional (conta do app): fim do teste grátis e o código do plano (app_treino · app_treino_alimentacao) */
  teste_ate?: string | null;
  plano_codigo?: string | null;
}

export interface AssinaturaVista {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  valor: number | null;
  proximo_vencimento: string | null;
  sandbox: boolean;
  simulada: boolean;
  init_point: string | null;
}

export interface ChavePix {
  tipo: string;
  chave: string;
  favorecido: string | null;
  banco: string | null;
}

export interface ReciboVista {
  id: string;
  numero: number;
  data: string;
  valor: number | string;
  descricao: string;
  texto: string;
  nutricionista_id: string;
  created_at: string;
}

/** Uma matrícula do aluno em Perfil › Pagamentos (aluno_status). */
export interface MatriculaPagamentos {
  paciente_id: string;
  nome: string;
  conta: { id: string | null; nome: string | null; modo: ModoRecebimento; bloquear: boolean; profissional: string | null; app?: boolean };
  chave: ChavePix | null;
  mensalidade: MensalidadeVista | null;
  assinatura: AssinaturaVista | null;
  cobrancas: CobrancaVista[];
  recibos: ReciboVista[];
}

export interface StatusAluno {
  ok: true;
  ambiente: "public" | "staging";
  simulacao: boolean;
  hoje: string;
  agora: string;
  matriculas: MatriculaPagamentos[];
}

/** O Financeiro de um aluno no painel (prof_aluno). */
export interface FinanceiroProfissional {
  ok: true;
  ambiente: "public" | "staging";
  simulacao: boolean;
  hoje: string;
  agora: string;
  aluno: {
    paciente_id: string;
    treino_user_id: string | null;
    nome: string;
    email: string | null;
    cpf: string | null;
    foto_url: string | null;
    ativo: boolean;
    tags: string[];
    conta_id: string | null;
    conta_nome: string | null;
    tem_login: boolean;
  };
  permissoes: { master: boolean; dono: boolean; responsavel: boolean; mensalidade: boolean };
  conta: { id: string | null; nome: string | null; modo: ModoRecebimento; bloquear: boolean; origem: string | null; chave: ChavePix | null };
  planos: Array<{ id: string; nome: string; valor: number | null; ativo: boolean }>;
  mensalidade: MensalidadeVista | null;
  assinatura: AssinaturaVista | null;
  cobrancas: CobrancaVista[];
}

export interface AlunoResumo {
  paciente_id: string;
  treino_user_id: string | null;
  nome: string;
  email: string | null;
  ativo: boolean;
  mensalidade_valor: number | null;
  plano: string | null;
  pausada: boolean;
  pago_ate: string | null;
  desde: string | null;
  aguardando: string | null;
  abertas: number;
}

export type PendenteResumo = CobrancaVista & { aluno: { paciente_id: string; treino_user_id: string | null; nome: string | null; email: string | null } };

/** Alunos da conta com a mensalidade e os comprovantes aguardando (prof_resumo). */
export interface ResumoConta {
  ok: true;
  hoje: string;
  agora: string;
  dono: boolean;
  alunos: AlunoResumo[];
  pendentes: PendenteResumo[];
}

/**
 * hml-14b (B21) — prof_resumo com `pagina` (a tela Mensalidades): `alunos` = a página dos COM mensalidade (comprovante para
 * conferir, pendentes, em dia, cobrança parada; dentro, por nome), `total` = quantos com a busca; `sem` = a página dos SEM
 * mensalidade (por nome); `contagens` = os números da conta inteira (sem a busca); `pendentes` = os comprovantes aguardando.
 */
export interface MensalidadesDaConta extends ResumoConta {
  pagina: number;
  por_pagina: number;
  total: number;
  sem: { pagina: number; total: number; alunos: AlunoResumo[] };
  contagens: { alunos: number; com_mensalidade: number; em_dia: number; pendentes: number; sem_mensalidade: number };
}

/** O resumo leve do app do aluno (financeiro_do_aluno() — faixa do Início, trava do inadimplente, chip do Perfil). */
export interface ResumoMatricula {
  paciente_id: string;
  conta_id: string | null;
  conta_nome: string | null;
  recebimento_modo: ModoRecebimento;
  bloquear_inadimplente: boolean;
  tem_chave: boolean;
  profissional: string | null;
  mensalidade_valor: number | string | null;
  plano_nome: string | null;
  pausada: boolean;
  pago_ate: string | null;
  desde: string | null;
  aguardando: boolean;
  assinatura_ativa: boolean;
  abertas: Array<{ id: string; descricao: string; valor: number | string; vencimento: string }>;
  aguardando_avulsas: number;
  /** W7b — matrícula da conta do app (aluno sem profissional): o teste grátis e o plano */
  app?: boolean;
  teste_ate?: string | null;
  plano_codigo?: string | null;
}
