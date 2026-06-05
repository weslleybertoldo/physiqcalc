import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { downloadAndInstall } from "@/lib/apkUpdater";

const CURRENT_VERSION = __APP_VERSION__;
// Busca a última release via GitHub API (funciona em repos privados e públicos)
const RELEASES_URL = "https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest";

interface VersionInfo {
  version: string;
  message: string;
  download_url: string;
}

const UpdateChecker = () => {
  const [update, setUpdate] = useState<VersionInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [needsPerm, setNeedsPerm] = useState(false);

  const handleDownload = async () => {
    if (!update) return;
    setNeedsPerm(false);
    setProgress(0);
    try {
      const res = await downloadAndInstall(update.download_url, (p) => setProgress(p));
      if (res === "permission") {
        setNeedsPerm(true);
        setProgress(null);
      } else if (res === "fallback") {
        // web/iOS: abriu no navegador, sem barra
        setProgress(null);
      }
      // "installed": instalador do sistema abriu; mantém 100% até o usuário agir
    } catch {
      setProgress(null);
    }
  };

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await fetch(RELEASES_URL, { cache: "no-store" });
        if (!res.ok) return;
        const release = await res.json();

        // tag_name vem como "v1.0.1" — remove o "v"
        const remoteVersion = (release.tag_name || "").replace(/^v/, "");
        if (!remoteVersion) return;

        // Compara versões
        const remote = remoteVersion.split(".").map(Number);
        const local = CURRENT_VERSION.split(".").map(Number);
        const isNewer =
          remote[0] > local[0] ||
          (remote[0] === local[0] && remote[1] > local[1]) ||
          (remote[0] === local[0] && remote[1] === local[1] && remote[2] > local[2]);

        if (isNewer) {
          // Busca o link do APK nos assets da release
          const apkAsset = (release.assets || []).find(
            (a: any) => a.name.endsWith(".apk")
          );
          setUpdate({
            version: remoteVersion,
            message: "Nova versão disponível!",
            download_url: apkAsset
              ? apkAsset.browser_download_url
              : release.html_url,
          });
        }
      } catch {
        // Sem internet ou erro — ignora silenciosamente
      }
    };

    checkUpdate();
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md">
      <div className="bg-card border border-primary/50 rounded-xl p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="font-heading text-sm text-foreground">
              {update.message || "Nova versao disponivel!"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              v{CURRENT_VERSION} → v{update.version}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {progress !== null ? (
          <div className="mt-3">
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1 text-center font-body">
              {progress < 100 ? `Baixando ${progress}%` : "Abrindo instalador..."}
            </p>
          </div>
        ) : (
          <>
            {needsPerm && (
              <p className="mt-2 text-xs text-muted-foreground font-body">
                Permita "instalar apps desconhecidos" para o PhysiqCalc nas
                configurações que abriram, depois toque em baixar novamente.
              </p>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-lg font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors"
            >
              <Download size={14} />
              {needsPerm ? "Tentar novamente" : "Baixar atualização"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export { CURRENT_VERSION };
export default UpdateChecker;
