import { X, Download } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useSaidaAnimada } from "@/ui/premium/useSaidaAnimada";

const PWAInstallBanner = () => {
  const { canInstall, dismissed, promptInstall, dismiss } = usePWAInstall();
  // hml-18a (H-40, D): a faixa sobe (300 ms, ease-out) e DESCE ao sair (200 ms, ease-in) — antes sumia seca no X e no Instalar
  const saida = useSaidaAnimada<HTMLDivElement>(canInstall && !dismissed);

  if (!saida.montado) return null;

  return (
    <div ref={saida.ref} data-state={saida.estado} data-faixa-instalar
      className="fixed bottom-0 left-0 right-0 z-50 bg-secondary border-t border-muted-foreground/30 px-5 py-3 flex items-center justify-between gap-4 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-300 data-[state=open]:ease-out data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-200 data-[state=closed]:ease-in data-[state=closed]:fill-mode-forwards">
      <div className="flex items-center gap-3 min-w-0">
        <Download size={18} className="text-primary shrink-0" />
        <p className="text-sm text-foreground font-body truncate">
          Instale o Physiq na sua tela inicial!
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
