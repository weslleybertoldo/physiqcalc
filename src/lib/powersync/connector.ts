import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/web";
import { supabase, DB_SCHEMA } from "@/integrations/supabase/client";
import { avisarErro } from "@/lib/avisoDeErro";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { instanciaPowerSync } from "./instancia";

// Instância PowerSync por ambiente (instancia.ts): produção (public) = instância default; o build de staging sem
// VITE_POWERSYNC_URL própria fica sem PowerSync (POWERSYNC_LIGADO falso — o provider não conecta).
// Escritas (uploadData) usam supabase.from → já respeitam db.schema (não vazam para prod).
const POWERSYNC_URL = instanciaPowerSync(import.meta.env, DB_SCHEMA);
export const POWERSYNC_LIGADO = POWERSYNC_URL !== "";

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
function prepareForSupabase(data: Record<string, unknown>): Record<string, unknown> {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- nome da tabela vem do PowerSync (string), fora do tipo Database
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
    } catch (ex) {
      const code = typeof ex?.code === "string" ? ex.code : "";
      console.warn("[PowerSync] Upload exception:", code, ex?.message, "op:", lastOp?.table, lastOp?.op);

      if (RETRYABLE_INTEGRITY_CODES.includes(code)) {
        // Unique violation — provavelmente sync race. Descarta sem alarme, dado já existe no servidor.
        console.warn(`[PowerSync] Unique violation em ${lastOp?.table} — dado já existe, descartando op local`);
        await transaction.complete();
      } else if (FATAL_RESPONSE_CODES.some((regex) => regex.test(code))) {
        // Erro fatal irrecuperável — descarta para destravar a fila
        console.error(`[PowerSync] FATAL: descartando op ${lastOp?.op} em ${lastOp?.table} (code: ${code})`);
        // hml-10 (H-26, D5): o dado do aparelho foi jogado fora — avisa o Weslley só com a tabela, a op e o código (nunca a linha
        // nem a mensagem do banco, que ecoa o valor: "Key (aluno_id)=(…)")
        avisarErro({ origem: "sync", mensagem: `op ${lastOp?.op} descartada · código ${code}`, lugar: `tabela ${lastOp?.table}` });
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
