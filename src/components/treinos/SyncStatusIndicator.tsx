import { useStatus } from "@powersync/react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

export function SyncStatusIndicator() {
  const status = useStatus();

  if (!status.connected && !status.hasSynced) {
    return (
      <span className="text-yellow-500 flex items-center gap-1 text-[10px]">
        <RefreshCw size={10} className="animate-spin" /> Sincronizando...
      </span>
    );
  }

  if (!status.connected) {
    return (
      <span className="text-red-400 flex items-center gap-1 text-[10px]">
        <WifiOff size={10} /> Offline
      </span>
    );
  }

  return (
    <span className="text-green-500 flex items-center gap-1 text-[10px]">
      <Wifi size={10} /> Sincronizado
    </span>
  );
}
