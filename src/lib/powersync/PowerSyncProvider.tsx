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

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const connectedRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectWithRetry = useCallback(async () => {
    if (connectedRef.current || !user) return;

    try {
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
  }, [user]);

  useEffect(() => {
    if (!user) {
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
  }, [user, connectWithRetry]);

  // Reconecta quando a rede volta (online event)
  useEffect(() => {
    if (!user) return;

    const handleOnline = () => {
      if (!connectedRef.current) {
        console.log("[PowerSync] Network back — reconnecting");
        retryCountRef.current = 0;
        connectWithRetry();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user, connectWithRetry]);

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
}

export { powerSyncDb };
