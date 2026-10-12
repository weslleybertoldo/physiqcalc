// Physiq W-P — regras PURAS dos planos do aluno criados pelo profissional (desenho 2026-10-10 §3 com os ajustes do §7). Sem Deno,
// sem rede e sem banco: usadas pela pagamentos-aluno e pela mp-webhook-aluno, reexportadas para a tela (src/financeiro/planos.ts) e
// testadas no Vitest (src/financeiro/planos.test.ts). O banco tem o espelho do valor ({schema}.plano_valor_do_pagamento) — o
// e2e/wp/sql_planos.py confere os mesmos números.
import { descricaoMensalidade, mesPorExtenso, valorValido } from "./financeiro-regras.ts";

/** Como o aluno paga o plano (§7 B1: "modalidade" — "forma" já é o trilho em cobrancas.forma). */
export type Modalidade = "avista" | "cartao_parcelado" | "mensal";
export const MODALIDADES: readonly Modalidade[] = ["avista", "cartao_parcelado", "mensal"];
export const ROTULO_MODALIDADE: Record<Modalidade, string> = { avista: "À vista", cartao_parcelado: "Cartão parcelado", mensal: "Mês a mês" };

export interface PlanoDoAluno {
  id: string;
  nome: string;
  valor: number | null;
  meses: number;
  modalidades: Modalidade[];
  max_parcelas_cartao: number | null;
  valor_parcela_mensal: number | null;
  ativo: boolean;
}

/** O que basta para fazer as contas de um plano (a tela e o banco mandam números ou textos numéricos). */
export interface ValoresDoPlano {
  valor: number | string | null;
  meses: number | null | undefined;
  valor_parcela_mensal?: number | string | null;
}

export function ehModalidade(v: unknown): v is Modalidade {
  return typeof v === "string" && (MODALIDADES as readonly string[]).includes(v);
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Plano com valor e meses: só ele vai para a ficha do aluno (o "só nome" da virada do Calc aparece como "completar" — B1). */
export function planoCompleto(p: ValoresDoPlano): boolean {
  const meses = Number(p.meses);
  return Number(p.valor) > 0 && Number.isInteger(meses) && meses >= 1 && meses <= 24;
}

/** Parcela do mês a mês: a que o profissional digitou ou valor ÷ meses com 2 casas (1.000 ÷ 12 = 83,33; o total fica 999,96). */
export function parcelaMensal(p: ValoresDoPlano): number | null {
  if (Number(p.valor_parcela_mensal) > 0) return centavos(Number(p.valor_parcela_mensal));
  if (!planoCompleto(p)) return null;
  return centavos(Number(p.valor) / Number(p.meses));
}

/** Valor de CADA pagamento na modalidade (= pacientes.mensalidade_valor, "o valor do próximo pagamento"); o negociado manda. */
export function valorDoPagamento(p: ValoresDoPlano, modalidade: Modalidade, negociado: number | string | null | undefined): number | null {
  if (Number(negociado) > 0) return centavos(Number(negociado));
  if (modalidade === "mensal") return parcelaMensal(p);
  return planoCompleto(p) ? centavos(Number(p.valor)) : null;
}

/** Quantos meses o pagamento cobre: o período todo no à vista/cartão parcelado; 1 no mês a mês e no modo de hoje. */
export function mesesCobertos(modalidade: Modalidade | null | undefined, meses: number | null | undefined): number {
  const n = Number(meses) || 1;
  return modalidade && modalidade !== "mensal" ? Math.max(1, n) : 1;
}

/** O "de N" do mês a mês (retrato na cobrança); null fora dele e no plano de 1 mês. */
export function parcelasTotal(modalidade: Modalidade | null | undefined, meses: number | null | undefined): number | null {
  const n = Number(meses) || 1;
  return modalidade === "mensal" && n >= 2 ? n : null;
}

/** O que a linha da cobrança grava do plano quando nasce. Modo de hoje: nada (as colunas ficam no padrão — o schema sem a migration
 *  aceita o insert). */
export function retratoDoPlano(m: { plano_modalidade?: Modalidade | null; plano?: { meses?: number | null } | null }): { meses_cobertos?: number; parcelas_total?: number | null } {
  if (!m.plano_modalidade) return {};
  const meses = m.plano?.meses ?? 1;
  return { meses_cobertos: mesesCobertos(m.plano_modalidade, meses), parcelas_total: parcelasTotal(m.plano_modalidade, meses) };
}

/** Modalidades que a forma de receber da conta consegue cobrar (desenho 3.6). W1 (P-B "1"): na InfinitePay o período todo (Pix ou
 *  cartão — as parcelas, a página dela escolhe) e o mês a mês; o "cartão parcelado" não é oferecido (é o mesmo período todo). W2: o
 *  Mercado Pago da conta do personal cobra igual ao do Physiq (D5: Pix, cartão e a automática) — as 3. */
export function modalidadesDaConta(modo: string | null | undefined): Modalidade[] {
  if (modo === "mercadopago" || modo === "mercadopago_conta") return ["avista", "cartao_parcelado", "mensal"];
  if (modo === "pix_manual" || modo === "nenhum" || modo === "infinitepay") return ["avista", "mensal"];
  return [];
}

/** Na ficha do aluno: as modalidades do plano que a conta consegue receber (plano incompleto ou desativado: nenhuma). Na InfinitePay o
 *  "cartão parcelado" do plano vira o período todo (P-B: a mesma cobertura e o mesmo valor). */
export function modalidadesOferecidas(p: ValoresDoPlano & { modalidades: Modalidade[]; ativo: boolean }, modo: string | null | undefined): Modalidade[] {
  if (!p.ativo || !planoCompleto(p)) return [];
  const daConta = modalidadesDaConta(modo);
  const doPlano: Modalidade[] = modo === "infinitepay" ? p.modalidades.map((x) => (x === "cartao_parcelado" ? "avista" : x)) : p.modalidades;
  return MODALIDADES.filter((x) => doPlano.includes(x) && daConta.includes(x));
}

/** O que o prof_plano_salvar aceita: o que a conta recebe hoje + o que o plano JÁ tem (quem troca de forma de receber não fica travado
 *  num plano com aluno numa modalidade que a forma nova não oferece — modalidade_em_uso). Plano novo: só o que a conta recebe. */
export function modalidadesPermitidasNoPlano(modo: string | null | undefined, atuais: readonly unknown[]): Modalidade[] {
  const daConta = modalidadesDaConta(modo);
  return MODALIDADES.filter((x) => daConta.includes(x) || atuais.includes(x));
}

/** O nome da modalidade na tela: na InfinitePay, à vista e cartão parcelado são "Período todo (Pix ou cartão até 12×)" (P-B "1"). */
export function rotuloDaModalidade(m: Modalidade, modo: string | null | undefined): string {
  if (modo === "infinitepay" && (m === "avista" || m === "cartao_parcelado")) return "Período todo (Pix ou cartão até 12×)";
  return ROTULO_MODALIDADE[m];
}

/** Cobrança automática no cartão (assinatura do MP): mês a mês, plano de 1 mês (à vista = mês a mês — B2) e o modo de hoje. */
export function aceitaAutomatica(modalidade: Modalidade | null | undefined, meses: number | null | undefined): boolean {
  return !modalidade || modalidade === "mensal" || (Number(meses) || 1) === 1;
}

/** Até quantas parcelas o cartão aceita: 1 sempre; até o máximo do plano só no cartão parcelado (I6). */
export function maxParcelasDoCartao(modalidade: Modalidade | null | undefined, max: number | null | undefined): number {
  const n = Number(max);
  return modalidade === "cartao_parcelado" && Number.isInteger(n) && n >= 2 ? Math.min(12, n) : 1;
}

export function parcelasValidas(n: unknown, modalidade: Modalidade | null | undefined, max: number | null | undefined): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= maxParcelasDoCartao(modalidade, max);
}

export interface Parcela {
  num: number;
  total: number;
}

/** A próxima do mês a mês ("parcela 4 de 12"): depois da N-ésima volta a 1 (P-A "1": o plano renova); trocou de plano ou de N → 1. */
export function proximaParcela(ultima: { num: number | null; total: number | null; plano: string | null } | null, plano: string | null, total: number | null): Parcela | null {
  if (!total || total < 2) return null;
  if (!ultima || !ultima.num || ultima.plano !== plano || ultima.total !== total) return { num: 1, total };
  return { num: (ultima.num % total) + 1, total };
}

/** "Renovar plano" (§3.3 + §7): período todo já pago uma vez, vencendo (7 dias) ou vencido. */
export function precisaRenovar(modalidade: Modalidade | null | undefined, situacao: string, pagoAte: string | null | undefined): boolean {
  return (modalidade === "avista" || modalidade === "cartao_parcelado") && !!pagoAte && (situacao === "vence_em_breve" || situacao === "vencida");
}

const PERIODOS: Record<number, string> = { 1: "Mensal", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };

/** 1 → "Mensal" · 3 → "Trimestral" · 12 → "Anual" · 9 → "9 meses". */
export function nomeDoPeriodo(meses: number): string {
  return PERIODOS[meses] ?? `${meses} meses`;
}

/** O que vem depois do valor: "/mês" (modo de hoje, mês a mês, plano de 1 mês), "/ano" (12 meses) ou " por N meses". */
export function sufixoDoValor(modalidade: Modalidade | null | undefined, meses: number | null | undefined): string {
  const n = Number(meses) || 1;
  if (!modalidade || modalidade === "mensal" || n === 1) return "/mês";
  return n === 12 ? "/ano" : ` por ${n} meses`;
}

/** Descrição da linha da cobrança. Modo de hoje (e plano de 1 mês): "Mensalidade · <plano> · <Mês/Ano>", igual a sempre. */
export function descricaoDoPagamento(plano: string | null | undefined, modalidade: Modalidade | null | undefined, meses: number | null | undefined, mesRef: string, parcela: Parcela | null): string {
  const n = Number(meses) || 1;
  if (!modalidade || n === 1) return descricaoMensalidade(plano ?? null, mesRef);
  const meio = modalidade === "mensal" ? (parcela ? `parcela ${parcela.num} de ${parcela.total}` : "") : `${n} meses`;
  return ["Plano", (plano ?? "").trim(), meio, mesPorExtenso(mesRef)].filter(Boolean).join(" · ");
}

export interface PlanoSalvar {
  nome: string;
  meses: number;
  valor: number;
  modalidades: Modalidade[];
  max_parcelas_cartao: number | null;
  valor_parcela_mensal: number | null;
}

/** O que a tela manda para salvar um plano → o que vai para o banco (ou o código do erro). */
export function validarPlano(e: Record<string, unknown>, permitidas: readonly Modalidade[]): { ok: true; plano: PlanoSalvar } | { ok: false; erro: string } {
  const nome = String(e.nome ?? "").trim().replace(/\s+/g, " ");
  if (nome.length < 1 || nome.length > 80) return { ok: false, erro: "nome_invalido" };
  const meses = Number(e.meses);
  if (!Number.isInteger(meses) || meses < 1 || meses > 24) return { ok: false, erro: "meses_invalido" };
  const valor = valorValido(e.valor);
  if (valor === null) return { ok: false, erro: "valor_invalido" };
  const lista = Array.isArray(e.modalidades) ? [...new Set(e.modalidades as unknown[])] : [];
  if (!lista.length || !lista.every(ehModalidade)) return { ok: false, erro: "modalidades_invalidas" };
  if (!lista.every((x) => permitidas.includes(x as Modalidade))) return { ok: false, erro: "modalidade_da_conta" };
  const modalidades = MODALIDADES.filter((x) => lista.includes(x));
  let max: number | null = null;
  if (modalidades.includes("cartao_parcelado")) {
    max = Number(e.max_parcelas_cartao);
    if (!Number.isInteger(max) || max < 2 || max > 12) return { ok: false, erro: "parcelas_invalidas" };
  }
  let parcela: number | null = null;
  if (e.valor_parcela_mensal !== null && e.valor_parcela_mensal !== undefined && e.valor_parcela_mensal !== "") {
    if (!modalidades.includes("mensal")) return { ok: false, erro: "parcela_sem_mensal" };
    parcela = valorValido(e.valor_parcela_mensal);
    if (parcela === null) return { ok: false, erro: "parcela_invalida" };
  }
  return { ok: true, plano: { nome, meses, valor, modalidades, max_parcelas_cartao: max, valor_parcela_mensal: parcela } };
}
