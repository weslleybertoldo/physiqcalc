import { useEffect, useState } from "react";
import { usePowerSync, useStatus } from "@powersync/react";
import { CloudUpload, RefreshCw, WifiOff } from "lucide-react";
import { useOnline } from "@/ui/premium/useOnline";

/**
 * Indicador de sincronização (spec 9: "treino gravado sem internet fica na fila do PowerSync"): sem internet avisa que o
 * treino fica salvo no aparelho (com quantas mudanças esperam); com a fila subindo, "Sincronizando". Tudo em dia = nada
 * (a tela fica igual à tela 2).
 */
export function IndicadorSync() {
  const db = usePowerSync();
  const status = useStatus();
  const online = useOnline();
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    let vivo = true;
    const ler = async () => {
      try {
        const s = await db.getUploadQueueStats();
        if (vivo) setPendentes(s.count);
      } catch {
        /* sem banco local ainda */
      }
    };
    void ler();
    const id = setInterval(ler, 3000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [db]);

  const semRede = !online;
  const subindo = !semRede && (status.dataFlowStatus?.uploading || (pendentes > 0 && status.connected));
  const primeiraVez = !semRede && !status.hasSynced;
  if (!semRede && !subindo && !primeiraVez) return null;

  return (
    <div role="status" data-sync={semRede ? "offline" : primeiraVez ? "primeira" : "subindo"} data-sync-pendentes={pendentes}
      className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-[12.5px] font-medium"
      style={semRede
        ? { background: "rgba(245,158,11,.10)", borderColor: "rgba(245,158,11,.28)", color: "var(--p-ambar-3)" }
        : { background: "rgba(139,92,246,.10)", borderColor: "rgba(139,92,246,.28)", color: "var(--p-violeta-3)" }}>
      {semRede ? <WifiOff aria-hidden className="h-4 w-4 flex-none" /> : primeiraVez ? <RefreshCw aria-hidden className="h-4 w-4 flex-none animate-spin" /> : <CloudUpload aria-hidden className="h-4 w-4 flex-none" />}
      <span className="min-w-0 flex-1">
        {semRede
          ? `Sem internet · o treino fica salvo no aparelho${pendentes ? ` (${pendentes} ${pendentes === 1 ? "mudança" : "mudanças"} para enviar)` : ""}`
          : primeiraVez
            ? "Baixando o seu treino…"
            : `Sincronizando${pendentes ? ` ${pendentes} ${pendentes === 1 ? "mudança" : "mudanças"}` : ""}…`}
      </span>
    </div>
  );
}
