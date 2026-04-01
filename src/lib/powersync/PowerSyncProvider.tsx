import { PowerSyncContext } from "@powersync/react";
import { PowerSyncDatabase } from "@powersync/web";
import { ReactNode, useEffect, useRef } from "react";
import { AppSchema } from "./schema";
import { connector } from "./connector";
import { useAuth } from "@/hooks/useAuth";

// Cria o banco SQLite local — singleton, criado uma vez
// Usa config padrão (IndexedDB) que funciona em todos os ambientes:
// PWA, Capacitor Android, iOS
const powerSyncDb = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: "physiqcalc.db" },
});

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      if (connectedRef.current) {
        powerSyncDb.disconnect();
        connectedRef.current = false;
      }
      return;
    }

    if (connectedRef.current) return; // Já conectado, não reconecta

    const init = async () => {
      try {
        console.log("[PowerSync] Connecting... user:", user?.id);
        console.log("[PowerSync] DB status before connect:", powerSyncDb.connected);
        await powerSyncDb.connect(connector, {
          crudUploadThrottleMs: 1000,
        });
        connectedRef.current = true;
        console.log("[PowerSync] Connected successfully! DB connected:", powerSyncDb.connected);
      } catch (e) {
        console.error("[PowerSync] Connect FAILED:", e);
      }
    };

    init();

    return () => {
      powerSyncDb.disconnect();
      connectedRef.current = false;
    };
  }, [user]);

  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
}

export { powerSyncDb };
