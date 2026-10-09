// hml-14 (H-32): tempo máximo de cada chamada para fora da função e o orçamento de um pedido inteiro.
// Cópia IGUAL em supabase-principal/functions/_shared/tempo.ts e supabase/functions/_shared/tempo.ts — o deploy_function.sh só
// leva o _shared do próprio projeto; o src/lib/tempoFuncoes.test.ts confere as 2 byte a byte. Sem import de URL e sem o global
// Deno: o Vitest importa este arquivo.

/**
 * Tempo de cada chamada (ms), escolhido ACIMA do máximo medido em 7 dias nos logs de borda (spec da hml-14, §1.1 e D3): a meta é
 * acabar com a espera sem fim, não cortar o que hoje dá certo devagar. Subir um número aqui é a volta (1 linha + republicar).
 */
export const TEMPO_MS = {
  mp: 8_000,
  email: 8_000,
  google: 8_000,
  gotruePrincipal: 5_000,
  gotrueTreino: 10_000,
  principal: 8_000,
  treino: 15_000,
  espelhoNucleo: 20_000,
  exportar: 15_000,
  exclusaoConferir: 30_000,
  exclusao: 60_000,
  telegram: 8_000,
} as const;

/**
 * Orçamento de um pedido inteiro: `usuario` quando o front espera (ele desiste antes), `servidor` quando quem espera é o MP, o
 * pg_net ou o cron, `loteEspelho` para o lote da espelho-enviar (ninguém esperando; a sobra fica para a próxima rodada).
 */
export const ORCAMENTO_MS = { usuario: 20_000, servidor: 25_000, loteEspelho: 100_000 } as const;

/** O tempo do fetch estourou (AbortSignal.timeout → "TimeoutError"; abort de fora → "AbortError"). */
export function tempoEsgotado(e: unknown): boolean {
  const nome = e && typeof e === "object" ? (e as { name?: unknown }).name : null;
  return nome === "TimeoutError" || nome === "AbortError";
}

/**
 * fetch com tempo: estourou → rejeita com o "TimeoutError" do AbortSignal.timeout (o `tempoEsgotado` reconhece). Junta o
 * signal de quem chama (AbortSignal.any). O sinal segue preso à resposta: o tempo vale até ler o corpo.
 */
export function buscarComTempo(
  entrada: string | URL | Request,
  init: RequestInit,
  ms: number,
  base: typeof fetch = fetch,
): Promise<Response> {
  const limite = AbortSignal.timeout(Math.max(1, Math.floor(ms)));
  const signal = init.signal ? AbortSignal.any([init.signal, limite]) : limite;
  return base(entrada, { ...init, signal });
}

export interface Prazo {
  /** Quanto falta do orçamento (ms, nunca negativo). */
  restante(): number;
  esgotado(): boolean;
}

/** Prazo de um pedido: quanto falta (para repetir só se der tempo). Um por pedido, criado no começo do atendimento. */
export function prazo(totalMs: number, agora: () => number = Date.now): Prazo {
  const fim = agora() + totalMs;
  return {
    restante: () => Math.max(0, fim - agora()),
    esgotado: () => agora() >= fim,
  };
}
