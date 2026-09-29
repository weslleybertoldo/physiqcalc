import { useEffect } from "react";

/** "Ctrl K" no Windows/Linux e "⌘ K" no Mac — só o texto da tecla. */
export function teclaAtalho(): string {
  if (typeof navigator === "undefined") return "Ctrl K";
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘ K" : "Ctrl K";
}

/** Abre a busca com Ctrl+K / ⌘+K em qualquer lugar da página. */
export function useAtalhoBusca(abrir: () => void) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        abrir();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [abrir]);
}
