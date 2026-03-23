import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";

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
        <a
          href={update.download_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary text-primary-foreground rounded-lg font-heading text-xs uppercase tracking-wider hover:bg-primary/90 transition-colors"
        >
          <Download size={14} />
          Baixar atualização
        </a>
      </div>
    </div>
  );
};

export { CURRENT_VERSION };
export default UpdateChecker;
