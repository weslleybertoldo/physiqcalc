/**
 * Painel master (W27) — regras PURAS das telas: rótulos, tons dos chips, o que cada conta deixa fazer, datas e dinheiro, e o texto
 * de cada erro das funções. Testadas no Vitest (src/master/regras.test.ts). W28: a "Cobrança legada até a virada" saiu — as
 * contas legadas são cobradas pelo núcleo (cobranca_legada = false), com o preço e as regras de hoje até trocar de plano.
 */
import { comparacaoDoMes, variacao } from "@/painel/financeiro/resumo";
import type { TomChip } from "@/ui/premium/Chip";
import type { ContaLinha, Faixa, ModuloConta, Origem, PlanoConta, Situacao, VisaoGeral } from "./tipos";

export const ROTULO_PLANO: Record<PlanoConta, string> = { treino: "Só Treino", nutricao: "Só Nutrição", treino_nutricao: "Treino + Nutrição" };
export const ROTULO_FAIXA: Record<Faixa, string> = { f10: "1–10 alunos", f30: "11–30 alunos", f100: "31–100 alunos", livre: "Sem limite" };
export const ROTULO_ORIGEM: Record<Origem, string> = { nova: "Conta nova", legado_calc: "Legado PhysiqCalc", legado_nutri: "Legado PhysiqNutri", app: "App do aluno" };
export const ROTULO_SITUACAO: Record<Situacao, string> = {
  teste: "Em teste", ativa: "Em dia", vencida: "Vencida", isenta: "Isenta", suspensa: "Suspensa", cancelada: "Cancelada",
};
export const TOM_SITUACAO: Record<Situacao, TomChip> = { teste: "c", ativa: "n", vencida: "r", isenta: "g", suspensa: "a", cancelada: "g" };
export const ROTULO_MODULO: Record<ModuloConta, string> = { treino: "Treino", nutricao: "Nutrição" };
export const TOM_MODULO: Record<ModuloConta, TomChip> = { treino: "t", nutricao: "n" };
export const ROTULO_RECEBIMENTO: Record<string, string> = { pix_manual: "Pix manual", nenhum: "Não cobra pelo app", mercadopago: "Mercado Pago" };
export const PLANOS: PlanoConta[] = ["treino", "nutricao", "treino_nutricao"];
export const FAIXAS: Faixa[] = ["f10", "f30", "f100", "livre"];

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "—";
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export function moeda(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v === null || v === undefined || v === "" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** AAAA-MM-DD + n dias (calendário, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * "Vence em 12/11/2026", "Teste até …", "Isenta · motivo", "Venceu em …" — a linha do vencimento de uma conta, pelas datas do
 * núcleo (W28: também nas legadas; as datas do site antigo do Nutri não valem mais).
 */
export function linhaVencimento(c: Pick<ContaLinha, "situacao_efetiva" | "vence_em" | "teste_ate" | "isenta_motivo">): string {
  if (c.situacao_efetiva === "isenta") return c.isenta_motivo ? `Isenta · ${c.isenta_motivo}` : "Isenta";
  if (c.situacao_efetiva === "suspensa") return "Suspensa pelo master";
  if (c.situacao_efetiva === "teste") return `Teste até ${dataCurta(c.teste_ate)}`;
  if (c.situacao_efetiva === "vencida") return c.vence_em ? `Venceu em ${dataCurta(c.vence_em)}` : `Teste acabou em ${dataCurta(c.teste_ate)}`;
  return c.vence_em ? `Vence em ${dataCurta(c.vence_em)}` : "—";
}

export interface ReceitaDoMes {
  valor: number;
  variacao: number | null;
  /** "1–2 set" (o período do mês anterior) — null no servidor antigo (comparação com o mês anterior inteiro) */
  rotulo: string | null;
  /** "1º a 2 de setembro" (a dica do cartão) */
  rotuloLongo: string | null;
}

/**
 * KPI "Receita do mês" da Visão geral (W28 — o "−86 % sobre o mês anterior" do dia 2): com os recebimentos por dia, a regra ÚNICA
 * do painel (comparacaoDoMes — de 1º até hoje contra de 1º até o mesmo dia do mês anterior); sem eles (servidor antigo), o mês
 * contra o mês anterior inteiro, como antes.
 */
export function receitaDoMes(r: VisaoGeral["receita"], hoje: string): ReceitaDoMes {
  if (Array.isArray(r.recebimentos)) {
    const recs = r.recebimentos.map((x) => ({ dia: String(x.dia ?? "").slice(0, 10), valor: Number.isFinite(Number(x.valor)) ? Number(x.valor) : 0 }));
    const c = comparacaoDoMes(recs, hoje);
    return { valor: c.atual, variacao: c.variacao, rotulo: c.rotulo, rotuloLongo: c.rotuloLongo };
  }
  const mes = Number(r.mes) || 0;
  return { valor: mes, variacao: variacao(mes, Number(r.mes_anterior) || 0), rotulo: null, rotuloLongo: null };
}

/** "8 de 10" / "8 · sem limite" */
export function linhaAlunos(c: Pick<ContaLinha, "alunos_ativos" | "limite_alunos">): string {
  return c.limite_alunos === null || c.limite_alunos === undefined ? `${c.alunos_ativos} · sem limite` : `${c.alunos_ativos} de ${c.limite_alunos}`;
}

export type AcaoMaster =
  | "plano" | "vencimento" | "liberar" | "isentar" | "tirar_isencao" | "suspender" | "reativar" | "bloquear_alunos" | "desbloquear_alunos"
  | "registrar_pagamento" | "reenviar_aviso" | "cancelar_assinatura" | "mover_alunos" | "excluir";

/**
 * O que o master pode fazer na conta (a mesma regra do banco — master_conta_acao): conta do app só aparece; as demais (a nova e,
 * desde a virada — W28 —, a legada) têm as ações de cobrança e acesso; excluir só sem alunos.
 */
export function acoesDaConta(c: ContaLinha): AcaoMaster[] {
  if (c.eh_app) return [];
  const mover: AcaoMaster[] = ["mover_alunos"];
  const a: AcaoMaster[] = ["plano", "vencimento", "liberar", "registrar_pagamento"];
  a.push(c.situacao === "isenta" || c.isenta_motivo ? "tirar_isencao" : "isentar");
  a.push(c.situacao === "suspensa" ? "reativar" : "suspender");
  a.push(c.alunos_bloqueados_em ? "desbloquear_alunos" : "bloquear_alunos");
  a.push("reenviar_aviso");
  if (c.assinatura && ["authorized", "pending", "paused"].includes(c.assinatura.status)) a.push("cancelar_assinatura");
  a.push(...mover);
  if (c.alunos_total === 0) a.push("excluir");
  return a;
}

/** Chave Pix com o meio escondido (o master vê de quem é; a chave inteira fica nas Configurações da conta). */
export function chaveMascarada(chave: string): string {
  const c = chave.trim();
  if (c.length <= 6) return c;
  return `${c.slice(0, 3)}…${c.slice(-3)}`;
}

/** Descer de faixa só se os alunos ativos couberem (regra de hoje do Calc, W4). */
export function faixaCabe(faixa: Faixa, alunosAtivos: number): boolean {
  const max: Record<Faixa, number | null> = { f10: 10, f30: 30, f100: 100, livre: null };
  const m = max[faixa];
  return m === null || alunosAtivos <= m;
}

const ERROS: Record<string, string> = {
  so_master: "Só o master pode fazer isto.",
  sem_login: "Sua sessão acabou. Entre de novo.",
  sem_internet: "Sem internet. Tente quando a conexão voltar.",
  conta_inexistente: "Esta conta não existe mais.",
  conta_do_app: "A conta do app do aluno não muda por aqui.",
  cobranca_legada: "A cobrança desta conta ainda é a antiga: passe a conta para o núcleo (a virada) antes de mexer nela por aqui.",
  plano_invalido: "Escolha um plano e uma faixa válidos.",
  alunos_acima_do_limite: "A conta tem mais alunos ativos do que essa faixa permite.",
  data_invalida: "Escolha uma data válida.",
  ja_tem_acesso: "A conta já tem acesso até essa data (ou depois).",
  motivo_obrigatorio: "Escreva o motivo (pelo menos 3 letras).",
  nao_isenta: "A conta não está isenta.",
  tem_alunos: "Só dá para excluir uma conta sem nenhum aluno (nem na lixeira).",
  assinatura_ativa: "Cancele a cobrança automática no cartão antes de excluir.",
  modo_invalido: "Forma de recebimento inválida.",
  acao_invalida: "Ação inválida.",
  email_invalido: "E-mail inválido.",
  conta_real_no_staging: "O staging só aceita e-mails de teste.",
  nome_invalido: "Escreva o nome (pelo menos 2 letras).",
  tipo_invalido: "Escolha o tipo de profissional.",
  senha_curta: "A senha precisa de pelo menos 8 caracteres.",
  ja_tem_conta: "Esta pessoa já é profissional de uma conta.",
  plano_sem_o_modulo_do_tipo: "O plano precisa ter o módulo do tipo de profissional (personal → Treino; nutricionista → Nutrição).",
  erro_criar_login: "Não deu para criar o login. Confira o e-mail.",
  usuario_inexistente: "Pessoa não encontrada.",
  nao_pode_a_si_mesmo: "Você não pode fazer isto em você mesmo.",
  conta_suspensa: "A conta de destino está suspensa.",
  selecao_invalida: "Selecione de 1 a 200 alunos.",
  responsavel_invalido: "O responsável precisa ser da conta, com o papel do módulo.",
  sem_responsavel: "Escolha quem vai acompanhar os alunos na conta nova.",
  limite_plano: "A conta de destino chegou no limite de alunos da faixa.",
  outro_profissional: "O aluno já está ativo com outro profissional.",
  ja_esta_na_conta: "O aluno já tem matrícula na conta de destino.",
  sem_login_aluno: "Aluno sem login.",
  valor_invalido: "Valor inválido.",
  meses_invalido: "Escolha 1, 2, 3, 6 ou 12 meses.",
  sem_assinatura: "A conta não tem cobrança automática no cartão.",
  mp_error: "O Mercado Pago não respondeu. Tente de novo.",
  sem_dono: "A conta não tem dono para receber o aviso.",
  chave_invalida: "Configuração inválida.",
  preco_inexistente: "Esse preço não existe na tabela.",
  itens_invalidos: "O prato precisa de 1 a 30 itens.",
  item_invalido: "Confira os itens: alimento da TACO e gramas entre 1 e 2000.",
  refeicao_invalida: "Escolha a refeição.",
  objetivo_invalido: "Marque pelo menos um objetivo.",
  muitas_acoes: "Muitas ações seguidas. Espere um pouco.",
};

export function textoErro(codigo: string | null | undefined): string {
  return (codigo && ERROS[codigo]) || "Não deu certo agora. Tente de novo.";
}
