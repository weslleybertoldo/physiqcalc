import { useState, useEffect, useCallback, useRef } from "react";
import {
  syncPendingOperations,
  getPendingCount,
  registerAuthSync,
  getRetryDelay,
  resetRetry,
  incrementRetry,
} from "@/lib/offlineSync";
import { toast } from "sonner";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getPendingCount);
  const [syncing, setSyncing] = useState(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    const count = getPendingCount();
    if (count === 0) return;

    setSyncing(true);
    try {
      const { synced, failed } = await syncPendingOperations();

      if (synced > 0 && failed === 0) {
        toast.success(`${synced} dado(s) sincronizado(s) com sucesso!`);
        resetRetry();
      } else if (synced > 0 && failed > 0) {
        toast.success(`${synced} sincronizado(s). ${failed} pendente(s).`);
        resetRetry();
      }

      // Retry com backoff se há operações pendentes
      if (failed > 0) {
        incrementRetry();
        const delay = getRetryDelay();
        console.log(`[Sync] Retry em ${Math.round(delay / 1000)}s`);
        retryTimerRef.current = setTimeout(doSync, delay);
      }

      // Silencioso quando synced=0 e failed=0 (sem sessão — não alarma)
    } catch {
      // Silencioso — tentará novamente na próxima vez
    } finally {
      setSyncing(false);
      setPendingCount(getPendingCount());
    }
  }, [syncing]);

  useEffect(() => {
    // Registra sync automático ao re-logar
    registerAuthSync();

    const handleOnline = () => {
      setIsOnline(true);
      resetRetry();
      toast.success("Conexão restaurada! Sincronizando dados...");
      setTimeout(doSync, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Cancela retry pendente
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      toast.warning("Sem internet. Seus dados serão salvos localmente.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Tenta sincronizar ao montar (caso tenha dados pendentes de sessão anterior)
    if (navigator.onLine) {
      doSync();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [doSync]);

  // Atualiza contagem periodicamente
  useEffect(() => {
    const interval = setInterval(() => {
      setPendingCount(getPendingCount());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return {
    isOnline,
    pendingCount,
    syncing,
    triggerSync: doSync,
  };
}
