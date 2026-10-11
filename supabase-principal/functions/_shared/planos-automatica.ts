// supabase-principal/functions/_shared/planos-automatica.ts
// Physiq W-P (§7 I1) — o valor da cobrança automática no cartão (assinatura do MP) acompanha o "valor do próximo pagamento": o PUT
// /preapproval do aluno_app_plano (W7b), agora para toda troca de plano, modalidade ou valor. Sem Deno e sem rede: o PUT entra por
// parâmetro (o _shared/planos-automatica-mp.ts passa o mpFetch; o Vitest, um falso). Quem chama grava o espelho; a falha vai para a
// fila (Task 8b) ou, no schema sem a fila, vira o aviso ao dono.

export type ResultadoValor = "sem_automatica" | "igual" | "atualizada" | "falhou";

export interface AssinaturaParaValor {
  mp_preapproval_id: string | null;
  status: string;
  valor: number | null;
  payload: Record<string, unknown> | null;
}

export type PutAssinatura = (id: string, corpo: { auto_recurring: { transaction_amount: number; currency_id: "BRL" } }) =>
  Promise<{ status: number; body: { id?: unknown } | null }>;

export async function novoValorDaAutomatica(a: AssinaturaParaValor | null, valor: number, put: PutAssinatura): Promise<ResultadoValor> {
  if (!a || a.status !== "authorized" || !a.mp_preapproval_id || a.mp_preapproval_id.startsWith("sim-") || a.payload?.simulada === true) return "sem_automatica";
  if (!(valor > 0)) return "sem_automatica";
  if (Number(a.valor) === valor) return "igual";
  try {
    const r = await put(a.mp_preapproval_id, { auto_recurring: { transaction_amount: valor, currency_id: "BRL" } });
    return r.status < 300 && r.body?.id ? "atualizada" : "falhou";
  } catch {
    return "falhou";
  }
}

// ───────────────────────── Task 8b — a fila das automáticas (decisão do Weslley 10/10/2026, ponto 2) ─────────────────────────
// A troca em lote (o dono mudou o valor, os meses ou a parcela de um plano) e a de 1 aluno que falhou vão para a fila
// {schema}.automaticas_fila; a função automaticas-fila tenta de hora em hora com o valor ATUAL do aluno (o último ganha) e, na 24ª
// falha seguida (1 dia), desiste e avisa o dono — 1 aviso por conta, com os nomes juntos. O SQL usa o mesmo teto (tentativas < 24:
// supabase-principal/migrations/20261011030000_wp_fila_automaticas.sql — o planosAutomatica.test.ts confere).

/** Quantas vezes a fila tenta (de hora em hora = 1 dia). */
export const MAX_TENTATIVAS = 24;
/** A espera entre as tentativas: sempre 1 hora. */
export const ESPERA_DA_FILA_MS = 3_600_000;

/** Quando a pendência que falhou volta (ISO): agora + 1 hora. */
export function proximaTentativaEm(agora: number | Date): string {
  return new Date(new Date(agora).getTime() + ESPERA_DA_FILA_MS).toISOString();
}

/** feito: fecha a pendência · de_novo: volta em 1 hora · desistiu: fecha e avisa o dono. */
export type DestinoDaFila = "feito" | "de_novo" | "desistiu";

/** O que fazer com a pendência depois da tentativa. `tentativas` = quantas já tinham falhado ANTES desta (a coluna). */
export function destinoDoResultado(resultado: ResultadoValor, tentativas: number): DestinoDaFila {
  if (resultado !== "falhou") return "feito";
  const antes = Number.isFinite(tentativas) && tentativas > 0 ? Math.floor(tentativas) : 0;
  return antes + 1 >= MAX_TENTATIVAS ? "desistiu" : "de_novo";
}

/** O título do aviso no sino tem até 160 caracteres (o avisar do financeiro-mp.ts corta ali). */
const LIMITE_DO_AVISO = 160;
/** Quantos nomes o aviso mostra, no máximo (o resto vira "e mais N"). */
const NOMES_NO_AVISO = 5;

const cortar = (texto: string, max: number) => (texto.length <= max ? texto : `${texto.slice(0, Math.max(1, max - 1)).trimEnd()}…`);

/**
 * O aviso ao dono com os alunos cuja troca a fila desistiu de fazer: até 5 nomes + "e mais N", sempre dentro dos 160 caracteres (com
 * nome comprido saem menos nomes). 1 aluno: a frase do aviso de 1 aluno da pagamentos-aluno.
 */
export function textoDoAvisoDaFila(nomes: readonly string[]): string {
  const lista = nomes.map((n) => String(n ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lista.length) return "Não deu para mudar o valor da cobrança automática de alguns alunos. Confira no financeiro de cada aluno.";
  if (lista.length === 1) {
    const inicio = "Não deu para mudar o valor da cobrança automática de ";
    const fim = ". Confira no financeiro do aluno.";
    return inicio + cortar(lista[0], LIMITE_DO_AVISO - inicio.length - fim.length) + fim;
  }
  const inicio = "Não deu para mudar o valor da cobrança automática de: ";
  const fim = ". Confira no financeiro de cada aluno.";
  for (let k = Math.min(NOMES_NO_AVISO, lista.length); k >= 1; k--) {
    const resto = lista.length - k;
    const texto = inicio + lista.slice(0, k).join(", ") + (resto ? ` e mais ${resto}` : "") + fim;
    if (texto.length <= LIMITE_DO_AVISO) return texto;
  }
  // nem 1 nome cabe inteiro: o 1º cortado + "e mais N"
  const resto = ` e mais ${lista.length - 1}`;
  return inicio + cortar(lista[0], LIMITE_DO_AVISO - inicio.length - fim.length - resto.length) + resto + fim;
}

/** O valor do aluno é o mesmo (em centavos)? Vazio, 0 e o que não é número contam igual ("sem valor") — nunca "mudou" por NaN. */
export function mesmoValor(a: unknown, b: unknown): boolean {
  const centavos = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
  };
  return centavos(a) === centavos(b);
}
