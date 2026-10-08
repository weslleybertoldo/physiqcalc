// Physiq W7 — regras puras de "Exportar meus dados" e "Excluir minha conta" (falha F4 — C88, R11, P19). Sem Deno nem
// supabase-js: o vitest do app testa daqui mesmo (src/app-aluno/perfil/pecas/servidor.test.ts).

/** A palavra da confirmação digitada (P19). Aceita maiúsculas/minúsculas e espaços nas pontas (teclado do celular). */
export const PALAVRA_CONFIRMACAO = "EXCLUIR";

export function confirmacaoValida(digitado: unknown): boolean {
  return typeof digitado === "string" && digitado.trim().toUpperCase() === PALAVRA_CONFIRMACAO;
}

/** Formato do arquivo exportado (muda quando a estrutura mudar). */
export const FORMATO_EXPORTACAO = "physiq-exportacao/1";

export const EXPLICACAO_EXPORTACAO = [
  "Este arquivo tem os seus dados nos 2 bancos do Physiq: o banco principal (login, cadastro, matrícula, agenda, dieta, avaliações da nutrição, pagamentos e recibos) e o Banco do Treino (treinos, séries, cargas, academias, avaliações físicas e pagamentos antigos do PhysiqCalc).",
  "Fotos e anexos vão como referência (data, tipo, tamanho), não o arquivo. Anotações internas do profissional (prontuário e resumo) e a contabilidade dele não entram.",
  "Os ids ligam as linhas entre si (ex.: paciente_id = a sua matrícula; exercicio_id = o nome em referencias.exercicios).",
];

export interface PartesExportacao {
  ambiente: string;
  geradoEm: string;
  principal: unknown;
  treino: unknown | null;
}

/** O JSON que a pessoa baixa (a mesma forma no site e no APK). */
export function montarExportacao(p: PartesExportacao): Record<string, unknown> {
  return {
    formato: FORMATO_EXPORTACAO,
    gerado_em: p.geradoEm,
    ambiente: p.ambiente,
    explicacao: EXPLICACAO_EXPORTACAO,
    banco_principal: p.principal ?? null,
    banco_do_treino: p.treino ?? null,
  };
}

/**
 * Resposta da delete-my-account (Treino, modo servidor) → o que a borda do principal faz com ela. hml-09 (H-23): "conta_real" =
 * pelo staging, a pessoa tem dado em produção no Treino (403 conta_real_no_staging) — nada foi apagado lá.
 */
export type PassoTreino = "ok" | "sem_vinculo" | "profissional" | "conta_real" | "indisponivel";

export function lerRespostaTreino(status: number, corpo: unknown): PassoTreino {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  if (status === 403 && c.erro === "profissional") return "profissional";
  if (status === 403 && c.erro === "conta_real_no_staging") return "conta_real";
  if (status !== 200 || c.ok !== true) return "indisponivel";
  return c.sem_vinculo === true ? "sem_vinculo" : "ok";
}

/**
 * hml-09 (H-23) — o Auth é o mesmo no staging e na produção: excluir pelo staging uma conta de teste que também tem dado em produção
 * tiraria o login de lá. Resposta de staging.pegada_em_producao (principal) / staging.physiq_pegada_em_producao (Treino), no formato
 * { em_producao, colunas } → a exclusão pelo staging para? SÓ em_producao = false (booleano) deixa seguir; qualquer outra forma
 * bloqueia (falha fechada) — inclusive a incoerente, que diz "não" e lista coluna. A delete-my-account do Treino tem a mesma regra.
 */
export function pegadaBloqueia(resposta: unknown): boolean {
  if (!resposta || typeof resposta !== "object" || Array.isArray(resposta)) return true;
  const r = resposta as Record<string, unknown>;
  if (r.em_producao !== false) return true;
  return r.colunas != null && !(Array.isArray(r.colunas) && r.colunas.length === 0);
}

/** Motivo da recusa → HTTP (a tela traduz o código). */
export const STATUS_DA_RECUSA: Record<string, number> = {
  confirmacao_invalida: 400,
  profissional: 403,
  assinatura_ativa: 409,
  treino_indisponivel: 502,
};

/** "Nome Sobrenome" + data → "physiq-meus-dados-2026-09-29.json" (sem nada do e-mail no nome do arquivo). */
export function nomeDoArquivo(dia: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : new Date().toISOString().slice(0, 10);
  return `physiq-meus-dados-${d}.json`;
}
