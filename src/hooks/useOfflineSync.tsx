import { useState, useEffect, useCallback } from "react";
import { syncPendingOperations, getPendingCount } from "@/lib/offlineSync";
import { toast } from "sonner";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getPendingCount);
  const [syncing, setSyncing] = useState(false);

  const doSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    const count = getPendingCount();
    if (count === 0) return;

    setSyncing(true);
    try {
      const { synced, failed } = await syncPendingOperations();
      if (synced > 0) {
        toast.success(`${synced} dado(s) sincronizado(s) com sucesso!`);
      }
      if (failed > 0) {
        toast.error(`${failed} dado(s) não puderam ser sincronizados. Tentaremos novamente.`);
      }
    } catch {
      // Silencioso — tentará novamente na próxima vez
    } finally {
      setSyncing(false);
      setPendingCount(getPendingCount());
    }
  }, [syncing]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Conexão restaurada! Sincronizando dados...");
      // Pequeno delay para garantir que a conexão estabilizou
      setTimeout(doSync, 1500);
    };

    const handleOffline = () => {
      setIsOnline(false);
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
