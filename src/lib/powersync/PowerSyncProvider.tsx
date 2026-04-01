import { PowerSyncContext } from "@powersync/react";
import { PowerSyncDatabase, WASQLiteOpenFactory, WASQLiteVFS } from "@powersync/web";
import { ReactNode, useEffect, useRef } from "react";
import { AppSchema } from "./schema";
import { connector } from "./connector";
import { useAuth } from "@/hooks/useAuth";

// Cria o banco SQLite local — singleton, criado uma vez
// Baseado no projeto de referência oficial: powersync-community/vite-react-ts-powersync-supabase
const powerSyncDb = new PowerSyncDatabase({
  database: new WASQLiteOpenFactory({
    dbFilename: "physiqcalc.db",
    vfs: WASQLiteVFS.OPFSCoopSyncVFS,
    flags: {
      enableMultiTabs: typeof SharedWorker !== "undefined",
    },
  }),
  schema: AppSchema,
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
        await powerSyncDb.connect(connector, {
          crudUploadThrottleMs: 1000,
        });
        connectedRef.current = true;
        console.log("[PowerSync] Connected");
      } catch (e) {
        console.warn("[PowerSync] Connect error:", e);
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
