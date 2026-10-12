// Physiq W6 — tipos da cobrança aluno → profissional (respostas da função pagamentos-aluno e do financeiro_do_aluno() do banco
// principal — supabase-principal/functions/pagamentos-aluno e a migração 20260929150000_w06_financeiro_aluno.sql).
import type { PixTipo } from "@/lib/pixChave";
import type { Modalidade, Parcela, PlanoDoAluno } from "./planos";

export type StatusCobranca = "aberta" | "paga" | "cancelada" | "aguardando_confirmacao";
export type TipoCobranca = "mensalidade" | "avulsa";
export type FormaCobranca = "pix_manual" | "mp" | "manual" | "infinitepay";
/** W2: 'mercadopago' = o Mercado Pago do Physiq (só o master liga); 'mercadopago_conta' = o Mercado Pago DO PERSONAL (o dono conecta o dele). */
export type ModoRecebimento = "pix_manual" | "nenhum" | "mercadopago" | "infinitepay" | "mercadopago_conta";

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
  /** W1 — a InfinitePay: o link da tentativa viva (só aguardando), o prazo (72 h), o recibo, as parcelas e o meio (ausentes na função de antes) */
  ip_link?: string | null;
  ip_expira_em?: string | null;
  ip_recibo_url?: string | null;
  ip_parcelas?: number | null;
  ip_meio?: "pix" | "credit_card" | null;
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
  /** W-P — plano com período (nulo = modo de hoje) */
  modalidade?: Modalidade | null;
  meses?: number;
  negociado?: number | null;
  max_parcelas?: number;
  automatica?: boolean;
  parcela?: Parcela | null;
}

/** W-P — um plano na aba Planos (prof_planos). */
export type PlanoNaLista = PlanoDoAluno & { completo: boolean; parcela: number | null; alunos: number };

export interface PlanosDaConta {
  ok: true;
  modo: ModoRecebimento;
  app: boolean;
  pode_editar: boolean;
  modalidades_da_conta: Modalidade[];
  planos: PlanoNaLista[];
}

/**
 * W-P — a resposta do prof_plano_salvar: o plano gravado e o que houve com as cobranças automáticas de quem segue o plano. Task 8b
 * (decisão do Weslley 10/10, ponto 2): elas vão para uma fila (`{ enfileiradas }`); a função de antes (ainda publicada por um tempo,
 * e o schema sem a fila) troca na hora (`{ atualizadas, falharam }`). A tela aceita os 2 (avisoDasAutomaticas, regras.ts).
 */
export interface PlanoSalvo {
  ok: true;
  plano?: PlanoDoAluno;
  automaticas?: { enfileiradas?: number; atualizadas?: number; falharam?: number } | null;
  enfileiradas?: number;
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
  /** W2 — no modo 'mercadopago_conta': o MP do personal está conectado (disponivel) e a chave pública dele para o cartão (conectado com a
   *  chave null = sem a chave: só o Pix — decisão 14). A conexão caída vem com disponivel false (e a chave null): nada pelo app — a folha
   *  só avisa e a linha da mensalidade não promete Pix nem cartão. Nos outros modos, null; ausente na função de antes da W2. */
  mp?: { disponivel: boolean; chave_publica: string | null } | null;
  /** hml-14d (B21 · D31): quantas cobranças e recibos vivos a matrícula tem — o "Ver todos (N)" (as listas acima param em 48/24).
   *  Ausentes na função de antes de publicar a 14d. */
  total_cobrancas?: number;
  total_recibos?: number;
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
  conta: { id: string | null; nome: string | null; modo: ModoRecebimento; bloquear: boolean; origem: string | null; chave: ChavePix | null; modalidades?: Modalidade[] };
  planos: Array<{ id: string; nome: string; valor: number | null; ativo: boolean } & Partial<Omit<PlanoDoAluno, "id" | "nome" | "valor" | "ativo">>>;
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
  /** W-P — plano com período (só o dono e o master veem; nulo = modo de hoje) */
  modalidade?: Modalidade | null;
  meses?: number;
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
  /** W-P — plano com período (nulo = modo de hoje) */
  modalidade?: Modalidade | null;
  plano_meses?: number | null;
}

/** hml-14d (B21 · D31): "Recebido" e "Gasto com o aluno" somados no banco (financeiro_totais_do_aluno), quantos lançamentos o aluno
 *  tem (estornados inclusive) e o período deles (a 1ª e a última data — o link "Editar … no Financeiro"). */
export interface TotaisDoAluno {
  recebido: number;
  gasto: number;
  total: number;
  primeira: string | null;
  ultima: string | null;
}

/** W1 — uma chave Pix da conta (prof_recebimento, prof_chave_salvar). */
export interface ChaveRecebimento {
  id: string;
  conta_id: string;
  membro_id: string | null;
  tipo: PixTipo;
  chave: string;
  favorecido: string | null;
  banco: string | null;
  ativa: boolean;
  criado_em: string;
}

/** W2 — o Mercado Pago DA CONTA em Configurações › Recebimento: a situação da conexão (nenhum token sai do servidor — integracaoMp). */
export interface MpDaConta {
  /** a opção aparece: a W2 no schema, a flag ligada (o master sempre) e não é a conta do app */
  disponivel: boolean;
  status: "ativa" | "erro" | "desconectada" | null;
  /** o apelido da conta no Mercado Pago (pode faltar: o servidor pergunta por melhor esforço) */
  apelido: string | null;
  expira_em: string | null;
  /** renovacao_recusada · sem_renovacao (o acesso vale, mas o Mercado Pago não renova sozinho) · … */
  erro: string | null;
  conectado_em: string | null;
  /** a conexão trouxe a chave do cartão (sem ela, o aluno paga só por Pix — decisão 14) */
  chave_publica: boolean;
  /** conta de teste do Mercado Pago (o staging) */
  teste: boolean | null;
}

/** W1 — Configurações › Recebimento numa chamada (prof_recebimento / prof_recebimento_salvar). */
export interface RecebimentoDaConta {
  ok: true;
  master: boolean;
  pode_editar: boolean;
  conta: { id: string; nome: string; origem: string; modo: ModoRecebimento; bloquear: boolean };
  chaves: ChaveRecebimento[];
  mp_liberado: boolean;
  infinitepay: { disponivel: boolean; handle: string | null; status: "ativa" | "erro" | null; testado_em: string | null };
  /** W2 — o Mercado Pago da conta (ausente na função de antes da W2) */
  mercadopago_conta?: MpDaConta;
  /** só no salvar (e no desconectar): o link de R$ 1,00 da InfiniteTag nova e quantas automáticas do MP foram desligadas. W2 (MENOR 11): o
   *  automaticas_falhas da W1 vem sempre 0 (fica para o APK antigo) — a recusa agora é o 409 mp_sem_acesso / 502 automaticas_nao_canceladas */
  link_teste?: string | null;
  automaticas_canceladas?: number;
}

/** W2 — prof_mp_conectar: a autorização do Mercado Pago (site) ou, no APK, o SITE (`no_site`: o fluxo inteiro acontece no navegador — I8). */
export interface ConexaoMpIniciada {
  ok: true;
  url: string;
  no_site?: boolean;
  expira_em?: string;
}

/** W2 — prof_mp_confirmar sem `confirmar`: a pergunta da tela, só para quem começou a conexão. */
export interface PerguntaDaConexaoMp {
  ok: true;
  apelido: string | null;
  teste: boolean;
}

/** W2 — prof_mp_confirmar com `confirmar`: conectou (`ok`) ou conectou sem trocar a forma (havia automática viva no MP de antes). */
export interface ConexaoMpConfirmada {
  ok: true;
  resultado: "ok" | "conectado_sem_trocar";
  apelido: string | null;
  recebimento: RecebimentoDaConta;
}

/** W2 — detalhe_mp (o comprovante do aluno): os dados do Mercado Pago de uma cobrança paga. `mp` null = sem os dados (o comprovante sai sem
 *  o bloco do MP): pagamento simulado, a conexão do profissional caída ou o MP fora (I3) — e, com `motivo: "outra_conta_mp"`, o pagamento
 *  foi para OUTRA conta do Mercado Pago (ou uma sem acesso guardado), que o Physiq não alcança. */
export interface DetalheDoPagamentoMp {
  ok: true;
  mp: import("./pdf").DetalheMp | null;
  motivo?: "outra_conta_mp";
}
