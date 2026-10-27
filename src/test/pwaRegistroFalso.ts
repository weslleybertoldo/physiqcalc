// T4 (27/10/2026): o "virtual:pwa-register" no Vitest. O módulo de verdade só existe dentro do vite-plugin-pwa (o vite.config.ts), que o
// vitest.config.ts não carrega; o alias de lá aponta para cá. Não registra nada: os testes do registro (src/lib/registroDoServiceWorker.test.ts)
// passam o carregador deles.
import type { RegisterSWOptions } from "vite-plugin-pwa/types";

export type { RegisterSWOptions };

export function registerSW(_opcoes?: RegisterSWOptions): (recarregar?: boolean) => Promise<void> {
  return async () => undefined;
}
