import { useState, useEffect, createContext, useContext } from "react";

interface PWAInstallContextType {
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
  dismissed: boolean;
  dismiss: () => void;
}

const PWAInstallContext = createContext<PWAInstallContextType>({
  canInstall: false,
  isInstalled: false,
  promptInstall: async () => {},
  dismissed: false,
  dismiss: () => {},
});

export const usePWAInstall = () => useContext(PWAInstallContext);

export const PWAInstallProvider = ({ children }: { children: React.ReactNode }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("physiqcalc-pwa-dismissed") === "true";
  });

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const installedHandler = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem("physiqcalc-pwa-dismissed", "true");
  };

  return (
    <PWAInstallContext.Provider
      value={{
        canInstall: !!deferredPrompt && !isInstalled,
        isInstalled,
        promptInstall,
        dismissed,
        dismiss,
      }}
    >
      {children}
    </PWAInstallContext.Provider>
  );
};
