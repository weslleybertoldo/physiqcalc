// Qual instância do PowerSync este build usa (homologação, H-14 — 07/10/2026).
export const INSTANCIA_PRODUCAO = "https://69cc4d1df69619e9d4834456.powersync.journeyapps.com";

type Env = { VITE_POWERSYNC_URL?: string; PROD?: boolean };

/**
 * VITE_POWERSYNC_URL manda. Sem ela, a instância de produção — menos no build de staging (`vite build` com schema
 * diferente de "public"), que fica SEM PowerSync: a instância de produção lê o schema public e o staging não recebe dado
 * da produção (o treino do aluno não abre no staging). O `vite dev` local continua como antes. "" = desligado.
 */
export function instanciaPowerSync(env: Env, schema: string): string {
  const propria = (env.VITE_POWERSYNC_URL || "").trim();
  if (propria) return propria;
  if (env.PROD && schema !== "public") return "";
  return INSTANCIA_PRODUCAO;
}
