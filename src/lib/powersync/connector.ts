import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/web";
import { supabase } from "@/integrations/supabase/client";

/**
 * Connector que sincroniza PowerSync (SQLite local) ↔ Supabase (Postgres)
 *
 * Boas práticas aplicadas:
 * 1. Batch de operações por tabela (menos requests ao Supabase)
 * 2. Merge de PUTs adjacentes na mesma tabela (só envia o último valor)
 * 3. Retry em erros temporários (5xx, rate limit)
 * 4. Conflitos de unique constraint tratados como sucesso
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    // Tenta pegar sessão local primeiro
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      // Tenta refresh se não tem sessão
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (!refreshed) {
        throw new Error("Não autenticado");
      }
      return {
        endpoint: "https://69cc4d1df69619e9d4834456.powersync.journeyapps.com",
        token: refreshed.access_token,
        expiresAt: refreshed.expires_at
          ? new Date(refreshed.expires_at * 1000)
          : undefined,
      };
    }

    return {
      endpoint: "https://69cc4d1df69619e9d4834456.powersync.journeyapps.com",
      token: session.access_token,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : undefined,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      // Agrupa operações por tabela para batch
      const batches = this.groupOperations(transaction.crud);

      for (const [table, ops] of Object.entries(batches)) {
        await this.processBatch(table, ops);
      }

      await transaction.complete();
    } catch (error: any) {
      // Conflito de unique constraint → marca como completo (last write wins)
      if (error?.code === "23505") {
        await transaction.complete();
        return;
      }

      // Erro de permissão → marca como completo (evita retry infinito)
      if (error?.code === "42501" || error?.code === "PGRST301") {
        console.warn("[PowerSync] Permissão negada, descartando operação:", error.message);
        await transaction.complete();
        return;
      }

      throw error;
    }
  }

  /**
   * Agrupa operações por tabela e merge PUTs adjacentes no mesmo registro
   */
  private groupOperations(ops: CrudEntry[]): Record<string, CrudEntry[]> {
    const groups: Record<string, CrudEntry[]> = {};

    for (const op of ops) {
      if (!groups[op.table]) groups[op.table] = [];

      // Merge: se já tem PUT para o mesmo id, substitui (last write wins)
      if (op.op === UpdateType.PUT) {
        const existing = groups[op.table].findIndex(
          (o) => o.id === op.id && o.op === UpdateType.PUT
        );
        if (existing !== -1) {
          groups[op.table][existing] = op; // Substitui pelo mais recente
          continue;
        }
      }

      groups[op.table].push(op);
    }

    return groups;
  }

  /**
   * Processa batch de operações para uma tabela
   * PUTs são agrupados em upsert batch, DELETEs são individuais
   */
  private async processBatch(tableName: string, ops: CrudEntry[]): Promise<void> {
    const table = (supabase.from as any)(tableName);

    // Agrupa PUTs para batch upsert
    const puts = ops.filter((o) => o.op === UpdateType.PUT);
    const patches = ops.filter((o) => o.op === UpdateType.PATCH);
    const deletes = ops.filter((o) => o.op === UpdateType.DELETE);

    // Batch upsert para PUTs (muito mais rápido que individual)
    if (puts.length > 0) {
      const rows = puts.map((op) => {
        const { id, ...data } = op.opData || {};
        return { id: op.id, ...data };
      });

      // Envia em batches de 50 para evitar payload muito grande
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        const { error } = await table.upsert(batch);
        if (error) throw error;
      }
    }

    // PATCHes são individuais (precisam de WHERE clause)
    for (const op of patches) {
      const { error } = await table.update(op.opData!).eq("id", op.id);
      if (error) throw error;
    }

    // DELETEs são individuais
    for (const op of deletes) {
      const { error } = await table.delete().eq("id", op.id);
      // Ignora "not found" em deletes (registro pode já ter sido deletado)
      if (error && !error.message?.includes("not found") && error.code !== "PGRST116") {
        throw error;
      }
    }
  }
}
