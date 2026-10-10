import { useEffect, useState } from "react";

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

/** hml-18a (H-40, D): a janela da busca sai em 200 ms (fundo e janela: `duration-200`, src/ui/premium/Busca.tsx). */
export const SAIDA_BUSCA_MS = 200;

/**
 * hml-18a (H-40, D) — o termo da paleta da busca (controlado), que espera a saída: ao fechar, o termo e a lista continuam enquanto a
 * janela esmaece e só depois (200 ms) o termo volta a "" — antes, limpar no mesmo clique fazia a lista piscar vazia saindo. Abrir de
 * novo antes disso já começa limpo.
 */
export function useTermoDaBusca(aberta: boolean): [string, (termo: string) => void] {
  const [termo, setTermo] = useState("");
  useEffect(() => {
    if (aberta) return;
    const t = window.setTimeout(() => setTermo(""), SAIDA_BUSCA_MS);
    return () => {
      window.clearTimeout(t);
      setTermo("");
    };
  }, [aberta]);
  return [termo, setTermo];
}
