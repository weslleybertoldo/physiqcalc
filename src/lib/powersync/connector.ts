import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/web";
import { supabase } from "@/integrations/supabase/client";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

const POWERSYNC_URL = "https://69cc4d1df69619e9d4834456.powersync.journeyapps.com";

/// Postgres Response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  new RegExp("^22...$"),  // Data Exception
  new RegExp("^23...$"),  // Integrity Constraint Violation
  new RegExp("^42501$"),  // Insufficient Privilege (RLS)
];

class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (!session || error) {
      throw new Error(`Could not fetch credentials: ${error?.message || "No session"}`);
    }

    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;
    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = (supabase.from as any)(op.table);
        let result: PostgrestSingleResponse<null>;

        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }

        if (result!.error) {
          console.error("[PowerSync] Upload error:", result!.error);
          throw result!.error;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.warn("[PowerSync] Upload exception:", ex?.code, ex?.message, "op:", lastOp?.table, lastOp?.op);
      if (
        typeof ex?.code === "string" &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
      ) {
        // Fatal error — discard transaction to unblock queue
        console.error(`[PowerSync] FATAL: descartando op ${lastOp?.op} em ${lastOp?.table} (code: ${ex.code})`, lastOp?.opData);
        await transaction.complete();
      } else {
        // Retryable error — PowerSync will retry after delay
        throw ex;
      }
    }
  }
}

// Singleton — criado uma vez, não dentro de componente React
export const connector = new SupabaseConnector();
