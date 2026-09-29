import { PowerSyncContext } from "@powersync/react";
import { PowerSyncDatabase } from "@powersync/web";
import { ReactNode, useEffect, useRef, useCallback } from "react";
import { AppSchema } from "./schema";
import { connector } from "./connector";
import { useAuth } from "@/hooks/useAuth";

// Cria o banco SQLite local — singleton, criado uma vez
const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: "physiqcalc.db" },
});

// Physiq W3 (login único): a sessão do Treino chega pela troca de token (src/nucleo/trocaToken.ts) e o PowerSync
// conecta com ela sem mudar o connector. Se a pessoa do aparelho MUDA (outro login no mesmo celular), o SQLite local da
// anterior é apagado antes de conectar — o treino de uma pessoa nunca aparece para outra. A mesma pessoa (inclusive quem
// vinha do app antigo com séries na fila sem internet) conecta por cima e a fila sobe normalmente.
const CHAVE_DONO_LOCAL = "physiq_powersync_usuario";

async function prepararBancoLocal(userId: string): Promise<void> {
  let anterior: string | null = null;
  try {
    anterior = localStorage.getItem(CHAVE_DONO_LOCAL);
  } catch {
    /* sem armazenamento */
  }
  if (anterior && anterior !== userId) {
    console.log("[PowerSync] Outra pessoa neste aparelho — limpando o banco local da anterior");
    try {
      await powerSyncDb.disconnectAndClear();
    } catch (e) {
      console.warn("[PowerSync] disconnectAndClear falhou:", e);
    }
  }
  try {
    localStorage.setItem(CHAVE_DONO_LOCAL, userId);
  } catch {
    /* noop */
  }
}

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const connectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectWithRetry = useCallback(async () => {
    if (connectedRef.current || !userId) return;

    try {
      await prepararBancoLocal(userId);
      await powerSyncDb.connect(connector, {
        crudUploadThrottleMs: 1000,
      });
      connectedRef.current = true;
      retryCountRef.current = 0;
      console.log("[PowerSync] Connected");
    } catch (e) {
      console.warn("[PowerSync] Connect error:", e);
      connectedRef.current = false;

      // Retry com exponential backoff (máximo 30s)
      if (retryCountRef.current < 10) {
        const delay = Math.min(2000 * Math.pow(2, retryCountRef.current), 30000);
        retryCountRef.current++;
        console.log(`[PowerSync] Retry #${retryCountRef.current} em ${Math.round(delay / 1000)}s`);
        retryTimerRef.current = setTimeout(connectWithRetry, delay);
      }
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      // Sem usuário — desconecta
      if (connectedRef.current) {
        powerSyncDb.disconnect();
        connectedRef.current = false;
      }
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }

    if (connectedRef.current) return;

    connectWithRetry();

    return () => {
      powerSyncDb.disconnect();
      connectedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [userId, connectWithRetry]);

  // Reconecta quando a rede volta (online event)
  useEffect(() => {
    if (!userId) return;

    const handleOnline = () => {
      if (!connectedRef.current) {
        console.log("[PowerSync] Network back — reconnecting");
        retryCountRef.current = 0;
        connectWithRetry();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [userId, connectWithRetry]);

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
}

export { powerSyncDb };
