import { X, Download } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const PWAInstallBanner = () => {
  const { canInstall, dismissed, promptInstall, dismiss } = usePWAInstall();

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-muted-foreground/30 px-5 py-3 flex items-center justify-between gap-4 animate-slide-up">
      <div className="flex items-center gap-3 min-w-0">
        <Download size={18} className="text-primary shrink-0" />
        <p className="text-sm text-foreground font-body truncate">
          Instale o PhysiqCalc na sua tela inicial!
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={promptInstall}
          className="px-4 py-1.5 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest hover:bg-primary/90 transition-colors"
        >
          Instalar
        </button>
        <button
          onClick={dismiss}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          title="Agora não"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default PWAInstallBanner;
