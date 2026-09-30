// Physiq W7b — regras puras (sem Deno e sem rede) do aluno SEM profissional, usadas por _shared/app-sem-profissional.ts e
// testadas no Vitest (src/app-aluno/sozinho/regras.test.ts).

/** Assinatura que não existe no MP (simulada do staging) — cancela só no banco. */
export function assinaturaSoNoBanco(a: { mp_preapproval_id: string | null; payload: Record<string, unknown> | null }): boolean {
  return !a.mp_preapproval_id || a.mp_preapproval_id.startsWith("sim-") || a.payload?.simulada === true;
}

/** Status de assinatura que ainda pode cobrar (a que precisa ser cancelada quando a matrícula do app encerra). */
export function assinaturaViva(status: string | null | undefined): boolean {
  return status === "authorized" || status === "pending" || status === "paused";
}
