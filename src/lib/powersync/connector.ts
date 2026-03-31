import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/web";
import { supabase } from "@/integrations/supabase/client";

/// Connector that syncs data between PowerSync (local SQLite) and Supabase (Postgres)
export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("Não autenticado");
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
      for (const op of transaction.crud) {
        await this.applyOperation(op);
      }
      await transaction.complete();
    } catch (error: any) {
      // Se for erro de conflito, marca como completo (last write wins)
      if (error?.code === "23505") {
        await transaction.complete();
        return;
      }
      throw error;
    }
  }

  private async applyOperation(op: CrudEntry): Promise<void> {
    const table = (supabase.from as any)(op.table);

    switch (op.op) {
      case UpdateType.PUT: {
        const { id, ...data } = op.opData!;
        const { error } = await table.upsert({ id: op.id, ...data });
        if (error) throw error;
        break;
      }
      case UpdateType.PATCH: {
        const { error } = await table.update(op.opData!).eq("id", op.id);
        if (error) throw error;
        break;
      }
      case UpdateType.DELETE: {
        const { error } = await table.delete().eq("id", op.id);
        if (error) throw error;
        break;
      }
    }
  }
}
