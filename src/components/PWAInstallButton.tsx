import { Download, CheckCircle, Smartphone } from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

const PWAInstallButton = () => {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();

  if (isInstalled) {
    return (
      <div className="flex items-center gap-3 py-3 px-2 text-sm text-foreground font-body">
        <CheckCircle size={18} className="text-primary shrink-0" />
        <span>App já instalado</span>
      </div>
    );
  }

  if (canInstall) {
    return (
      <button
        onClick={promptInstall}
        className="flex items-center gap-3 py-3 px-2 w-full text-left text-sm text-foreground font-body hover:bg-secondary transition-colors"
      >
        <Download size={18} className="text-primary shrink-0" />
        <span>📲 Instalar PhysiqCalc</span>
      </button>
    );
  }

  // Browser doesn't support install prompt — show manual instructions
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <div className="py-3 px-2">
      <div className="flex items-center gap-3 text-sm text-foreground font-body mb-2">
        <Smartphone size={18} className="text-primary shrink-0" />
        <span>📲 Instalar PhysiqCalc</span>
      </div>
      <p className="text-xs text-muted-foreground font-body ml-8">
        {isIOS
          ? 'Toque em "Compartilhar" → "Adicionar à Tela de Início"'
          : 'Toque no menu ⋮ → "Adicionar à tela inicial"'}
      </p>
    </div>
  );
};

export default PWAInstallButton;
