import { useState } from "react";
import { Check, Download, Globe, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { baixarNoNavegador, RELEASES_PAGE, ultimoApk } from "@/lib/apkRelease";
import { instrucaoCurta } from "@/lib/instalacaoManual";

type Props = { variante?: "rodape" | "config" };

/**
 * SÓ NO SITE (web/PWA): "Instalar" abre um popup com dois botões — "App Web" (prompt nativo do PWA quando o
 * navegador tem; senão a frase de instalação manual) e "APK Android" (baixa o .apk da última release do GitHub).
 * No APK a TreinosPage mantém "Verificar atualizações". iPhone não tem instalação por 1 toque (app nativo iOS = plano próprio).
 */
const InstalarMenu = ({ variante = "rodape" }: Props) => {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();
  const [aberto, setAberto] = useState(false);
  const [baixandoApk, setBaixandoApk] = useState(false);

  const handleAppWeb = async () => {
    if (isInstalled) return;
    setAberto(false);
    if (canInstall) {
      await promptInstall(); // Chrome/Edge (Android e desktop): instala direto
      return;
    }
    toast.info(instrucaoCurta(), { duration: 6000 }); // iPhone, Firefox, navegador embutido…
  };

  const handleApk = async () => {
    setBaixandoApk(true);
    const rel = await ultimoApk();
    setBaixandoApk(false);
    setAberto(false);
    if (!rel) {
      toast.error("Não achei o APK agora. Abrindo a página de downloads.");
      baixarNoNavegador(RELEASES_PAGE);
      return;
    }
    toast.success(`Baixando PhysiqCalc v${rel.version} (APK)…`);
    baixarNoNavegador(rel.url);
  };

  const cfg = variante === "config";
  const btn = cfg
    ? "flex items-center justify-center gap-2 mx-auto px-4 py-2 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-primary border border-border rounded-lg transition-colors"
    : "flex items-center justify-center gap-1 mx-auto text-[10px] text-muted-foreground/50 hover:text-primary font-body transition-colors";
  const opcao = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors disabled:opacity-60";

  return (
    <div data-instalar-menu>
      <button type="button" onClick={() => setAberto(true)} className={btn}>
        <Download size={cfg ? 12 : 10} />
        Instalar
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="w-[calc(100%-4rem)] max-w-[17rem] rounded-xl p-4 gap-3" data-instalar-dialog>
          <DialogHeader className="space-y-0.5">
            <DialogTitle className="font-heading text-xs uppercase tracking-wider text-center">Instalar o PhysiqCalc</DialogTitle>
            <DialogDescription className="font-body text-[11px] text-center">Escolha como quer instalar</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleAppWeb}
              disabled={isInstalled}
              data-instalar-app-web
              className={`${opcao} bg-primary text-primary-foreground hover:bg-primary/90`}
            >
              {isInstalled ? <Check size={18} className="shrink-0" /> : <Globe size={18} className="shrink-0" />}
              <span className="flex flex-col">
                <span className="font-heading text-xs uppercase tracking-wider">{isInstalled ? "App Web · já instalado" : "App Web"}</span>
                <span className="font-body text-[10px] opacity-90">{isInstalled ? "Já está na sua tela inicial" : "Instala na tela inicial, sem loja"}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={handleApk}
              disabled={baixandoApk}
              data-instalar-apk
              className={`${opcao} border border-primary/40 bg-card text-foreground hover:bg-primary/10`}
            >
              {baixandoApk ? <Loader2 size={18} className="shrink-0 animate-spin" /> : <Smartphone size={18} className="shrink-0" />}
              <span className="flex flex-col">
                <span className="font-heading text-xs uppercase tracking-wider">APK Android</span>
                <span className="font-body text-[10px] text-muted-foreground">
                  {baixandoApk ? "Buscando a versão mais recente…" : "Baixa o instalador (.apk) da última versão"}
                </span>
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InstalarMenu;
