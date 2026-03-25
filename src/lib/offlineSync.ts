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
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Validação: garante que é array e filtra entradas corrompidas
    if (!Array.isArray(parsed)) {
      console.warn("[Sync] Fila corrompida (não é array). Resetando.");
      localStorage.removeItem(PENDING_KEY);
      return [];
    }
    return parsed.filter(
      (op: any) =>
        op &&
        typeof op.table === "string" &&
        typeof op.type === "string" &&
        typeof op.createdAt === "number"
    );
  } catch {
    console.warn("[Sync] Fila corrompida (JSON inválido). Resetando.");
    localStorage.removeItem(PENDING_KEY);
    return [];
  }
}

function savePending(ops: PendingOperation[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      // Libera espaço: limpa cache de leitura primeiro
      localStorage.removeItem(CACHE_KEY);
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(ops));
        return;
      } catch {
        // Último recurso: manter apenas operações das últimas 24h
        const recent = ops.filter(
          (op) => Date.now() - op.createdAt < 24 * 60 * 60 * 1000
        );
        try {
          localStorage.setItem(PENDING_KEY, JSON.stringify(recent));
        } catch {
          console.error("[Sync] localStorage cheio. Não foi possível salvar fila.");
        }
      }
    }
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

// ── Compactação de fila ─────────────────────────────────────────────────────
// Remove operações redundantes (ex: 5 upserts na mesma série → mantém só o último)

function compactQueue(ops: PendingOperation[]): PendingOperation[] {
  const map = new Map<string, PendingOperation>();

  for (const op of ops) {
    // Chave única: tabela + tipo + identificação dos dados
    const identity =
      op.type === "delete" || op.type === "update"
        ? JSON.stringify(op.match)
        : op.onConflict
          ? op.onConflict
              .split(",")
              .map((k) => op.data?.[k.trim()])
              .join("|")
          : op.data?.id || op.id;

    const key = `${op.table}:${identity}`;

    if (op.type === "delete") {
      // delete substitui qualquer operação anterior no mesmo registro
      map.set(key, op);
    } else {
      const existing = map.get(key);
      if (!existing || existing.type !== "delete") {
        // Mantém a operação mais recente
        map.set(key, op);
      }
    }
  }

  return [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
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
    const conflict = op.onConflict || TABLE_CONFLICT_KEYS[op.table];

    switch (op.type) {
      case "upsert":
      case "insert":
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

    console.warn(`[Sync] Erro na op ${op.type} ${op.table}:`, result.error.message);
    if (isPermanentError(result.error.message)) {
      console.warn(`[Sync] Descartando operação irrecuperável:`, op);
      return "discard";
    }
    return "retry";
  } catch {
    return "retry";
  }
}

// ── Exponential backoff ─────────────────────────────────────────────────────

let retryAttempt = 0;

export function getRetryDelay(): number {
  const baseMs = 2000;
  const maxMs = 30000;
  const exponential = baseMs * Math.pow(2, retryAttempt);
  const jitter = Math.random() * 1000;
  return Math.min(exponential + jitter, maxMs);
}

export function resetRetry() {
  retryAttempt = 0;
}

export function incrementRetry() {
  retryAttempt++;
}

// ── Sync principal ──────────────────────────────────────────────────────────

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

  // Compacta fila antes de enviar (remove operações redundantes)
  const compacted = compactQueue(ops);
  const failures: PendingOperation[] = [];
  let synced = 0;

  for (const op of compacted) {
    const outcome = await executePendingOp(op);
    if (outcome === "ok") {
      synced++;
    } else if (outcome === "discard") {
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

// ── Sync ao re-logar ────────────────────────────────────────────────────────
// Escuta eventos de autenticação para sincronizar automaticamente ao logar

let authSyncRegistered = false;

export function registerAuthSync() {
  if (authSyncRegistered) return;
  authSyncRegistered = true;

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" && navigator.onLine) {
      const pending = getPendingCount();
      if (pending > 0) {
        // Delay curto para a sessão estabilizar
        setTimeout(() => syncPendingOperations(), 2000);
      }
    }
  });
}

// ── Aviso de dados pendentes antes de sair ──────────────────────────────────

export function hasPendingData(): boolean {
  return getPendingCount() > 0;
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
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      // Sem espaço mesmo — ignora
    }
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
