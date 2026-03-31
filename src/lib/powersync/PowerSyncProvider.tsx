import { PowerSyncContext } from "@powersync/react";
import { WASQLitePowerSyncDatabaseOpenFactory } from "@powersync/web";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { AppSchema } from "./schema";
import { SupabaseConnector } from "./connector";
import { useAuth } from "@/hooks/useAuth";

const factory = new WASQLitePowerSyncDatabaseOpenFactory({
  schema: AppSchema,
  dbFilename: "physiqcalc.db",
});

const powerSyncDb = factory.getInstance();

export function PowerSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const connector = useMemo(() => new SupabaseConnector(), []);

  useEffect(() => {
    if (!user) {
      powerSyncDb.disconnectAndClear().catch(() => {});
      return;
    }

    const init = async () => {
      try {
        await powerSyncDb.init();
        await powerSyncDb.connect(connector);
      } catch (e) {
        console.warn("[PowerSync] init error:", e);
        // Mesmo com erro de sync, o banco local funciona
      }
    };

    init();

    return () => {
      powerSyncDb.disconnect();
    };
  }, [user, connector]);

  // NUNCA bloqueia a renderização — mostra o app imediatamente
  // O PowerSync sincroniza em background
  return (
    <PowerSyncContext.Provider value={powerSyncDb}>
      {children}
    </PowerSyncContext.Provider>
  );
}

export { powerSyncDb };
