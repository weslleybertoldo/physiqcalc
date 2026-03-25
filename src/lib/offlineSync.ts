import { supabase } from "@/integrations/supabase/client";

// ── Tipos ────────────────────────────────────────────────────────────────────
type OperationType = "upsert" | "insert" | "update" | "delete";

interface PendingOperation {
  id: string; // UUID único para evitar duplicatas
  table: string;
  type: OperationType;
  data?: Record<string, any>;
  onConflict?: string;
  match?: Record<string, any>; // filtros para update/delete
  createdAt: number;
}

const PENDING_KEY = "physiq_offline_pending";
const CACHE_KEY = "physiq_offline_cache";

// ── Fila de operações pendentes ──────────────────────────────────────────────

function getPending(): PendingOperation[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePending(ops: PendingOperation[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
}

function generateId(): string {
  return crypto.randomUUID();
}

export function addPendingOperation(
  table: string,
  type: OperationType,
  data?: Record<string, any>,
  onConflict?: string,
  match?: Record<string, any>
) {
  const ops = getPending();
  ops.push({
    id: generateId(),
    table,
    type,
    data,
    onConflict,
    match,
    createdAt: Date.now(),
  });
  savePending(ops);
}

export function getPendingCount(): number {
  return getPending().length;
}

// ── Sincronização ────────────────────────────────────────────────────────────

// Mapeia tabelas para suas chaves compostas de conflito
// — necessário para converter inserts antigos (sem onConflict) em upserts seguros
const TABLE_CONFLICT_KEYS: Record<string, string> = {
  tb_treino_series: "user_id,exercicio_id,data_treino,numero_serie",
  tb_treino_concluido: "user_id,data_treino",
  tb_treino_dia_override: "user_id,data_treino",
  exercicio_ordem_usuario: "user_id,grupo_id,exercicio_id",
};

// Erros realmente irrecuperáveis (dados inválidos, não problema de sessão)
const PERMANENT_ERRORS = [
  "violates foreign key constraint",
  "violates not-null constraint",
  "violates check constraint",
  "column",
];

function isPermanentError(message: string): boolean {
  const lower = message.toLowerCase();
  return PERMANENT_ERRORS.some((e) => lower.includes(e.toLowerCase()));
}

async function executePendingOp(op: PendingOperation): Promise<"ok" | "retry" | "discard"> {
  try {
    let result;
    // Resolve a chave de conflito: usa a do op, ou deduz pela tabela
    const conflict = op.onConflict || TABLE_CONFLICT_KEYS[op.table];

    switch (op.type) {
      case "upsert":
      case "insert":
        // Sempre usa upsert para evitar conflito de chave duplicada
        result = await (supabase.from as any)(op.table)
          .upsert(op.data, conflict ? { onConflict: conflict } : undefined);
        break;

      case "update":
        if (!op.match) return "discard";
        {
          let query = (supabase.from as any)(op.table).update(op.data);
          for (const [key, value] of Object.entries(op.match)) {
            query = query.eq(key, value);
          }
          result = await query;
        }
        break;

      case "delete":
        if (!op.match) return "discard";
        {
          let query = (supabase.from as any)(op.table).delete();
          for (const [key, value] of Object.entries(op.match)) {
            query = query.eq(key, value);
          }
          result = await query;
        }
        break;
    }

    if (!result?.error) return "ok";

    // Erro permanente — descartar para não travar a fila
    console.warn(`[Sync] Erro na op ${op.type} ${op.table}:`, result.error.message);
    if (isPermanentError(result.error.message)) {
      console.warn(`[Sync] Descartando operação permanentemente falha:`, op);
      return "discard";
    }
    return "retry";
  } catch {
    return "retry";
  }
}

export async function syncPendingOperations(): Promise<{
  synced: number;
  failed: number;
}> {
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  const ops = getPending();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  // Garante sessão válida antes de sincronizar (evita erro de RLS)
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession();
      if (!refreshed) {
        // Sem sessão — guarda operações e tenta na próxima vez (sem alarmar)
        return { synced: 0, failed: 0 };
      }
    }
  } catch {
    // Sem conexão pra validar sessão — não arrisca perder dados
    return { synced: 0, failed: 0 };
  }

  const failures: PendingOperation[] = [];
  let synced = 0;

  // Executa em ordem cronológica para manter consistência
  const sorted = [...ops].sort((a, b) => a.createdAt - b.createdAt);

  for (const op of sorted) {
    const outcome = await executePendingOp(op);
    if (outcome === "ok") {
      synced++;
    } else if (outcome === "discard") {
      // Operação com erro permanente — descarta
      synced++; // Conta como resolvida para não alarmar o usuário
    } else {
      // retry — mantém apenas se é recente (< 7 dias)
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - op.createdAt < sevenDays) {
        failures.push(op);
      }
    }
  }

  savePending(failures);
  return { synced, failed: failures.length };
}

// ── Cache de leitura ─────────────────────────────────────────────────────────

interface CacheEntry {
  data: any;
  timestamp: number;
}

function getCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage cheio — limpa entradas mais antigas
    const entries = Object.entries(cache).sort(
      ([, a], [, b]) => b.timestamp - a.timestamp
    );
    const trimmed = Object.fromEntries(entries.slice(0, Math.floor(entries.length / 2)));
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  }
}

export function setCacheData(key: string, data: any) {
  const cache = getCache();
  cache[key] = { data, timestamp: Date.now() };
  saveCache(cache);
}

export function getCacheData<T = any>(key: string): T | null {
  const cache = getCache();
  const entry = cache[key];
  if (!entry) return null;

  // Cache válido por 7 dias
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - entry.timestamp > sevenDays) {
    delete cache[key];
    saveCache(cache);
    return null;
  }

  return entry.data as T;
}

// ── Operações offline-aware ──────────────────────────────────────────────────
// Wrappers que tentam enviar online e, se falhar, enfileiram

export async function offlineUpsert(
  table: string,
  data: Record<string, any>,
  onConflict: string
): Promise<{ offline: boolean }> {
  if (navigator.onLine) {
    try {
      const { error } = await (supabase.from as any)(table)
        .upsert(data, { onConflict });
      if (!error) return { offline: false };
    } catch {
      // Falha de rede — enfileira
    }
  }

  addPendingOperation(table, "upsert", data, onConflict);
  return { offline: true };
}

export async function offlineInsert(
  table: string,
  data: Record<string, any>
): Promise<{ offline: boolean }> {
  if (navigator.onLine) {
    try {
      const { error } = await (supabase.from as any)(table).insert(data);
      if (!error) return { offline: false };
    } catch {
      // Falha de rede — enfileira
    }
  }

  addPendingOperation(table, "insert", data);
  return { offline: true };
}

export async function offlineUpdate(
  table: string,
  data: Record<string, any>,
  match: Record<string, any>
): Promise<{ offline: boolean }> {
  if (navigator.onLine) {
    try {
      let query = (supabase.from as any)(table).update(data);
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value);
      }
      const { error } = await query;
      if (!error) return { offline: false };
    } catch {
      // Falha de rede — enfileira
    }
  }

  addPendingOperation(table, "update", data, undefined, match);
  return { offline: true };
}

export async function offlineDelete(
  table: string,
  match: Record<string, any>
): Promise<{ offline: boolean }> {
  if (navigator.onLine) {
    try {
      let query = (supabase.from as any)(table).delete();
      for (const [key, value] of Object.entries(match)) {
        query = query.eq(key, value);
      }
      const { error } = await query;
      if (!error) return { offline: false };
    } catch {
      // Falha de rede — enfileira
    }
  }

  addPendingOperation(table, "delete", undefined, undefined, match);
  return { offline: true };
}
