/**
 * Cobrança das contas (W4) — regras PURAS da spec 6.2/6.4 (testadas em regras.test.ts; as mesmas do SQL da migração
 * 20260929090000_w04_cobranca.sql e das edge functions, conferidas em servidor.test.ts):
 *   · teste de 14 dias no Treino + Nutrição, até 10 alunos (5A, P10);
 *   · paga antes de usar; o acesso vai até o vencimento INCLUSIVE e o painel trava no dia seguinte (tolerância 0 nas contas
 *     novas; 7 dias no legado Calc);
 *   · Pix/cartão à vista: +1 mês a partir do maior entre o vencimento, o fim do teste e hoje (ninguém perde dia); anual =
 *     10 mensalidades por 12 meses; legado Nutri: +30 dias (P27);
 *   · faixa de aviso nos dias −7, −2, −1 e 0 (recorrente não avisa) com o X guardando aviso-plano:<conta>:<vence>:<marco>;
 *   · faixa de alunos: "Seu plano permite N alunos ativos. Mude de faixa em Configurações › Plano."
 * Datas em "AAAA-MM-DD" no relógio de São Paulo (sem `Date` na conta de dias, para não trocar de dia com o fuso).
 */
export type PlanoConta = "treino" | "nutricao" | "treino_nutricao";
export type Faixa = "f10" | "f30" | "f100" | "livre";
export type SituacaoConta = "teste" | "ativa" | "vencida" | "isenta" | "suspensa" | "cancelada";
export type Meses = 1 | 12;

export const PLANOS: PlanoConta[] = ["treino", "nutricao", "treino_nutricao"];
export const FAIXAS: Faixa[] = ["f10", "f30", "f100", "livre"];

export const NOME_PLANO: Record<PlanoConta, string> = {
  treino: "Só Treino",
  nutricao: "Só Nutrição",
  treino_nutricao: "Treino + Nutrição",
};

/** Nome do plano no card do menu (tela 6: "Plano Treino + Nutrição"). */
export const NOME_PLANO_CARTAO: Record<PlanoConta, string> = {
  treino: "Plano Treino",
  nutricao: "Plano Nutrição",
  treino_nutricao: "Plano Treino + Nutrição",
};

export const NOME_FAIXA: Record<Faixa, string> = {
  f10: "1–10 alunos",
  f30: "11–30 alunos",
  f100: "31–100 alunos",
  livre: "Sem limite",
};

export const MODULOS_DO_PLANO: Record<PlanoConta, Array<"treino" | "nutricao">> = {
  treino: ["treino"],
  nutricao: ["nutricao"],
  treino_nutricao: ["treino", "nutricao"],
};

/** Teste grátis (5A, P10): o padrão da spec; o valor que vale vem da app_config (teste_dias, teste_max_alunos). */
export const TESTE_DIAS = 14;
export const TESTE_MAX_ALUNOS = 10;

// ───────────────────────── tabela de preços (6.1, 3A) ─────────────────────────

export interface LinhaPreco {
  plano: PlanoConta;
  faixa: Faixa;
  min_alunos: number;
  max_alunos: number | null;
  valor_mensal: number;
  valor_anual: number | null;
  ordem: number;
}

const MENSAL: Record<PlanoConta, Record<Faixa, number>> = {
  treino: { f10: 39.9, f30: 79.9, f100: 149.9, livre: 300 },
  nutricao: { f10: 39.9, f30: 79.9, f100: 149.9, livre: 300 },
  treino_nutricao: { f10: 59.9, f30: 119.9, f100: 224.9, livre: 450 },
};
const LIMITES: Record<Faixa, [number, number | null]> = { f10: [1, 10], f30: [11, 30], f100: [31, 100], livre: [101, null] };

/** A tabela 6.1 (a que a migração carrega; o master pode mudar a do banco depois). */
export const PRECOS_PADRAO: LinhaPreco[] = PLANOS.flatMap((plano) =>
  FAIXAS.map((faixa, i) => ({
    plano,
    faixa,
    min_alunos: LIMITES[faixa][0],
    max_alunos: LIMITES[faixa][1],
    valor_mensal: MENSAL[plano][faixa],
    valor_anual: Math.round(MENSAL[plano][faixa] * 10 * 100) / 100,
    ordem: i + 1,
  })),
);

export function ehPlano(v: unknown): v is PlanoConta {
  return typeof v === "string" && (PLANOS as string[]).includes(v);
}
export function ehFaixa(v: unknown): v is Faixa {
  return typeof v === "string" && (FAIXAS as string[]).includes(v);
}

/** Preço: o valor travado (preço especial do master; nos legados, o de hoje — 6A) ou a tabela; anual = 10 mensalidades. */
export function precoDoPlano(tabela: LinhaPreco[], plano: PlanoConta, faixa: Faixa, meses: Meses, valorTravado?: number | null): number | null {
  if (valorTravado !== null && valorTravado !== undefined) return arred(valorTravado * (meses === 12 ? 10 : 1));
  const linha = tabela.find((l) => l.plano === plano && l.faixa === faixa);
  if (!linha) return null;
  if (meses === 12) return linha.valor_anual ?? arred(linha.valor_mensal * 10);
  return linha.valor_mensal;
}

/** Quantos alunos ativos a faixa permite (null = sem limite). */
export function maxAlunosDaFaixa(tabela: LinhaPreco[], plano: PlanoConta, faixa: Faixa): number | null {
  if (faixa === "livre") return null;
  const linha = tabela.find((l) => l.plano === plano && l.faixa === faixa);
  if (linha && linha.max_alunos !== null) return linha.max_alunos;
  return LIMITES[faixa][1];
}

/** A menor faixa em que os alunos ativos cabem (para sugerir ao mudar de plano). */
export function faixaMinimaPara(alunosAtivos: number): Faixa {
  return FAIXAS.find((f) => LIMITES[f][1] === null || alunosAtivos <= (LIMITES[f][1] as number)) ?? "livre";
}

function arred(v: number): number {
  return Math.round(v * 100) / 100;
}

/** "R$ 59,90" */
export function reais(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ───────────────────────── datas ─────────────────────────

export function hojeSP(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** +N meses com o dia travado no fim do mês (31/01 + 1 mês = 28/02), como o Postgres. */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.slice(0, 10).split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** "AAAA-MM-DD" → "DD/MM" (curta) ou "DD/MM/AAAA". */
export function dataBR(iso: string | null | undefined, curta = true): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return curta ? `${d}/${m}` : `${d}/${m}/${a}`;
}

function maior(...datas: Array<string | null | undefined>): string | null {
  const validas = datas.filter((x): x is string => !!x).map((x) => x.slice(0, 10)).sort();
  return validas.length ? validas[validas.length - 1] : null;
}

// ───────────────────────── situação da conta (6.2) ─────────────────────────

export interface DatasConta {
  situacao: SituacaoConta;
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number | null;
  regra_pix?: string | null;
}

/**
 * Situação num dia (a mesma régua do `situacao_da_conta_em` do SQL e da tarefa das 03:40): isenta/suspensa/cancelada ficam;
 * pago e no prazo (vencimento + tolerância) = ativa; no teste = teste; senão vencida — o painel trava no dia seguinte.
 */
export function situacaoEfetiva(c: DatasConta, hoje: string): SituacaoConta {
  if (c.situacao === "isenta" || c.situacao === "suspensa" || c.situacao === "cancelada") return c.situacao;
  if (c.vence_em && somarDias(c.vence_em, Math.max(0, c.tolerancia_dias ?? 0)) >= hoje) return "ativa";
  if (c.teste_ate && c.teste_ate.slice(0, 10) >= hoje) return "teste";
  return "vencida";
}

/** Último dia com acesso (inclusive): o vencimento + tolerância, ou o fim do teste. null = isenta (sem fim). */
export function fimDoAcesso(c: DatasConta): string | null {
  if (c.situacao === "isenta") return null;
  const pago = c.vence_em ? somarDias(c.vence_em, Math.max(0, c.tolerancia_dias ?? 0)) : null;
  return maior(pago, c.teste_ate);
}

/** O que o pagamento aprovado faz (aplicar_pagamento_conta): +N meses a partir do maior entre vencimento, fim do teste e hoje. */
export function vencimentoDepoisDoPagamento(c: DatasConta, meses: Meses, hoje: string): { base: string; vence: string } {
  const base = maior(c.vence_em, c.teste_ate, hoje) as string;
  const vence = c.regra_pix === "30dias" && meses === 1 ? somarDias(base, 30) : somarMeses(base, meses);
  return { base, vence };
}

/** 1ª cobrança da assinatura: no último dia coberto (teste ou mês pago) se ele passa de hoje; senão na hora (null). */
export function primeiraCobrancaDaAssinatura(c: Pick<DatasConta, "teste_ate" | "vence_em">, hoje: string): string | null {
  const fim = maior(c.vence_em, c.teste_ate, hoje) as string;
  return fim > hoje ? fim : null;
}

// ───────────────────────── trava do painel e faixa de aviso ─────────────────────────

export type MotivoTrava = "vencida" | "suspensa" | "cancelada";

/** O painel trava? (6.2: vencida a partir do dia seguinte; suspensa/cancelada sempre; o master nunca). */
export function travaDoPainel(c: DatasConta, hoje: string, master = false): { travado: boolean; motivo: MotivoTrava | null; desde: string | null } {
  if (master) return { travado: false, motivo: null, desde: null };
  const s = situacaoEfetiva(c, hoje);
  if (s === "suspensa" || s === "cancelada") return { travado: true, motivo: s, desde: null };
  if (s === "vencida") {
    const fim = fimDoAcesso(c);
    return { travado: true, motivo: "vencida", desde: fim ? somarDias(fim, 1) : null };
  }
  return { travado: false, motivo: null, desde: null };
}

export type Marco = 7 | 2 | 1 | 0;

/** Qual aviso vale com N dias para o vencimento: 7 (de 7 a 3 dias), 2, 1 e 0 (no dia). */
export function marcoDoAviso(dias: number): Marco | null {
  if (dias < 0) return null;
  if (dias === 0) return 0;
  if (dias === 1) return 1;
  if (dias === 2) return 2;
  if (dias <= 7) return 7;
  return null;
}

export interface Aviso {
  marco: Marco;
  dias: number;
  vence: string;
  teste: boolean;
}

/** Faixa de aviso do topo do painel (Pix/cartão à vista e teste; quem tem cartão recorrente não recebe). */
export function avisoDoPlano(c: DatasConta, hoje: string, recorrente: boolean): Aviso | null {
  if (recorrente) return null;
  const s = situacaoEfetiva(c, hoje);
  if (s !== "ativa" && s !== "teste") return null;
  const fim = fimDoAcesso(c);
  if (!fim) return null;
  const dias = diasEntre(hoje, fim);
  const marco = marcoDoAviso(dias);
  return marco === null ? null : { marco, dias, vence: fim, teste: s === "teste" };
}

/** Chave do X da faixa: fechar esconde só aquele marco daquele vencimento (spec 6.2). */
export function chaveDoAviso(contaId: string, vence: string, marco: Marco): string {
  return `aviso-plano:${contaId}:${vence}:${marco}`;
}

export function textoDoAviso(a: Aviso, valor?: number | null): string {
  const quando = dataBR(a.vence);
  if (a.teste) {
    if (a.dias <= 0) return "Seu teste grátis termina hoje. Escolha um plano para não ficar sem acesso ao painel.";
    if (a.dias === 1) return `Seu teste grátis termina amanhã (${quando}). Escolha um plano para continuar.`;
    return `Seu teste grátis termina em ${a.dias} dias (${quando}).`;
  }
  const v = valor ? ` de ${reais(valor)}` : "";
  if (a.dias <= 0) return `Seu plano${v} vence hoje. Pague para não ficar sem acesso ao painel amanhã.`;
  if (a.dias === 1) return `Seu plano${v} vence amanhã (${quando}).`;
  return `Seu plano${v} vence em ${a.dias} dias (${quando}).`;
}

// ───────────────────────── faixa de alunos (6.4) ─────────────────────────

export interface MatriculaContagem {
  ativo: boolean;
  deleted_at?: string | null;
  acesso_bloqueado_em?: string | null;
}

/** Aluno ativo = matrícula ativa, sem exclusão e sem bloqueio individual (bloqueado e desativado liberam a vaga — 6.1). */
export function contarAlunosAtivos(ms: MatriculaContagem[]): number {
  return ms.filter((m) => m.ativo && !m.deleted_at && !m.acesso_bloqueado_em).length;
}

/** Limite da conta: legado Nutri sem limite; teste = teste_max_alunos; senão a faixa (legado Calc: a faixa do plano dele). */
export function limiteDaConta(
  c: { origem: string; situacao: SituacaoConta; plano: PlanoConta; faixa: Faixa },
  tabela: LinhaPreco[] = PRECOS_PADRAO,
  testeMax = TESTE_MAX_ALUNOS,
): number | null {
  if (c.origem === "legado_nutri") return null;
  if (c.situacao === "teste") return testeMax;
  return maxAlunosDaFaixa(tabela, c.plano, c.faixa);
}

export function podeAdicionarAluno(alunosAtivos: number, limite: number | null): boolean {
  return limite === null || alunosAtivos < limite;
}

export function mensagemLimite(limite: number, dono: boolean, nomeDono?: string | null): string {
  return dono
    ? `Seu plano permite ${limite} alunos ativos. Mude de faixa em Configurações › Plano.`
    : `O plano da conta permite ${limite} alunos ativos. Fale com ${nomeDono || "o dono da conta"}.`;
}

// ───────────────────────── mudar de plano (regra do Calc — 6.2) ─────────────────────────

export type ErroMudanca = "mesmo_plano" | "alunos_acima_do_limite" | "plano_invalido";

/** Subir vale na hora; descer só se os alunos ativos couberem; o preço novo vale a partir do próximo pagamento. */
export function avaliarMudanca(
  atual: { plano: PlanoConta; faixa: Faixa },
  novo: { plano: PlanoConta; faixa: Faixa },
  alunosAtivos: number,
  tabela: LinhaPreco[] = PRECOS_PADRAO,
): { ok: true; sobe: boolean; perdeModulo: boolean } | { ok: false; erro: ErroMudanca; limite?: number } {
  if (!ehPlano(novo.plano) || !ehFaixa(novo.faixa) || precoDoPlano(tabela, novo.plano, novo.faixa, 1) === null) return { ok: false, erro: "plano_invalido" };
  if (atual.plano === novo.plano && atual.faixa === novo.faixa) return { ok: false, erro: "mesmo_plano" };
  const max = maxAlunosDaFaixa(tabela, novo.plano, novo.faixa);
  if (max !== null && alunosAtivos > max) return { ok: false, erro: "alunos_acima_do_limite", limite: max };
  const antes = precoDoPlano(tabela, atual.plano, atual.faixa, 1) ?? 0;
  const depois = precoDoPlano(tabela, novo.plano, novo.faixa, 1) ?? 0;
  const perdeModulo = MODULOS_DO_PLANO[atual.plano].some((m) => !MODULOS_DO_PLANO[novo.plano].includes(m));
  return { ok: true, sobe: depois > antes, perdeModulo };
}

// ───────────────────────── textos ─────────────────────────

export const MENSAGEM_ERRO_COBRANCA: Record<string, string> = {
  sem_conta: "Não achamos a sua conta. Recarregue a página.",
  so_o_dono: "Só o dono da conta cuida do plano.",
  conta_legada: "O plano desta conta continua na tela de hoje até a mudança completa.",
  isenta: "Sua conta está isenta: não precisa pagar.",
  conta_suspensa: "Conta suspensa. Fale com o suporte.",
  use_mudar_plano: "Para trocar de plano, use \"Mudar plano\" antes de pagar.",
  alunos_acima_do_limite: "Os alunos ativos não cabem nessa faixa. Escolha uma faixa maior ou desative alunos.",
  plano_invalido: "Esse plano não está disponível.",
  cartao_ativo: "Você já paga no cartão todo mês. Para pagar por Pix, cancele a cobrança automática antes.",
  pix_indisponivel: "O Mercado Pago não gerou o Pix agora. Tente de novo em instantes.",
  missing_card_token: "Confira os dados do cartão.",
  cartao_recusado: "Pagamento recusado pelo cartão. Confira os dados ou use outro cartão.",
  mp_error: "O Mercado Pago não respondeu. Tente de novo em instantes.",
  assinatura_ja_ativa: "A cobrança automática já está ligada.",
  sem_assinatura: "Não há cobrança automática ligada.",
  anual_sem_assinatura: "O plano anual é pago por Pix ou cartão à vista.",
  escolha_ao_pagar: "No teste ou com o plano vencido, você escolhe o plano na hora de pagar.",
  mesmo_plano: "Esse já é o seu plano.",
  rate_limited: "Muitas tentativas. Tente em alguns minutos.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste entram.",
  so_staging: "Só no ambiente de teste.",
  erro_interno: "Não foi possível concluir agora. Tente de novo.",
};

export function mensagemErroCobranca(codigo: string | null | undefined): string {
  return (codigo && MENSAGEM_ERRO_COBRANCA[codigo]) || MENSAGEM_ERRO_COBRANCA.erro_interno;
}

export const ROTULO_STATUS_FATURA: Record<string, { rotulo: string; tom: "n" | "a" | "r" | "g" | "c" }> = {
  approved: { rotulo: "PAGO", tom: "n" },
  pending: { rotulo: "AGUARDANDO", tom: "a" },
  in_process: { rotulo: "EM ANÁLISE", tom: "a" },
  rejected: { rotulo: "RECUSADO", tom: "r" },
  cancelled: { rotulo: "CANCELADO", tom: "g" },
  expired: { rotulo: "VENCIDO", tom: "g" },
  refunded: { rotulo: "ESTORNADO", tom: "c" },
  charged_back: { rotulo: "CONTESTADO", tom: "r" },
};
