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
/// Nota: 23505 (unique violation) é recuperável e NÃO está aqui.
const FATAL_RESPONSE_CODES = [
  new RegExp("^22...$"),  // Data Exception (encoding, overflow — irrecuperável)
  new RegExp("^23503$"),  // Foreign key violation
  new RegExp("^23514$"),  // Check violation
  new RegExp("^42501$"),  // Insufficient Privilege (RLS)
];

/// Erros que podem ser resolvidos com retry (ex: unique violation por sync race)
const RETRYABLE_INTEGRITY_CODES = [
  "23505", // Unique violation — PowerSync pode resolver no próximo sync
];

/** Converte strings JSON em objetos antes de enviar ao Supabase (evita dupla codificação em colunas jsonb) */
function prepareForSupabase(data: Record<string, any>): Record<string, any> {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && (value.startsWith("[") || value.startsWith("{"))) {
      try {
        result[key] = JSON.parse(value);
      } catch {
        // não é JSON válido — mantém como string
      }
    }
  }
  return result;
}

class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (session) {
      return { endpoint: POWERSYNC_URL, token: session.access_token };
    }

    // Sessão local expirou — tenta refresh antes de desistir
    if (navigator.onLine) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (refreshed) {
        return { endpoint: POWERSYNC_URL, token: refreshed.access_token };
      }
    }

    throw new Error(`Could not fetch credentials: ${error?.message || "No session"}`);
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

        const prepared = prepareForSupabase(op.opData ?? {});

        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...prepared, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(prepared).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
          default:
            console.warn("[PowerSync] Unknown op type:", op.op);
            continue;
        }

        if (result!.error) {
          console.error("[PowerSync] Upload error:", result!.error);
          throw result!.error;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      const code = typeof ex?.code === "string" ? ex.code : "";
      console.warn("[PowerSync] Upload exception:", code, ex?.message, "op:", lastOp?.table, lastOp?.op);

      if (RETRYABLE_INTEGRITY_CODES.includes(code)) {
        // Unique violation — provavelmente sync race. Descarta sem alarme, dado já existe no servidor.
        console.warn(`[PowerSync] Unique violation em ${lastOp?.table} — dado já existe, descartando op local`);
        await transaction.complete();
      } else if (FATAL_RESPONSE_CODES.some((regex) => regex.test(code))) {
        // Erro fatal irrecuperável — descarta para destravar a fila
        console.error(`[PowerSync] FATAL: descartando op ${lastOp?.op} em ${lastOp?.table} (code: ${code})`);
        await transaction.complete();
      } else {
        // Erro retentável — PowerSync vai tentar novamente
        throw ex;
      }
    }
  }
}

// Singleton — criado uma vez, não dentro de componente React
export const connector = new SupabaseConnector();
