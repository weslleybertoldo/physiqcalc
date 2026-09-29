import { useCallback, useSyncExternalStore } from "react";

/**
 * Tema do Physiq (P21): escuro é o padrão; o claro vale só para quem escolher em Aparência
 * (Perfil do app — W7 — e Configurações › Perfil do painel — W5). A escolha fica no aparelho,
 * como o lembrete e o som do descanso.
 *
 * Quem aplica é o atributo `data-tema` do <html> (tokens em src/ui/tema/tokens.css). O index.html
 * repete a leitura num script inline, antes do primeiro quadro, pra não piscar o tema errado.
 */
export type Tema = "escuro" | "claro";

export const CHAVE_TEMA = "physiq_tema";

const COR_BARRA: Record<Tema, string> = { escuro: "#09090B", claro: "#FAFAFA" };

const ouvintes = new Set<() => void>();

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === "claro" ? "claro" : "escuro";
  } catch {
    return "escuro";
  }
}

/** Aplica o tema no documento (atributo + cor da barra do navegador/PWA). */
export function aplicarTema(tema: Tema): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-tema", tema);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COR_BARRA[tema]);
}

/** Grava a escolha, aplica e avisa quem usa o hook. */
export function definirTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    /* sem armazenamento (modo privado): vale só nesta abertura */
  }
  aplicarTema(tema);
  ouvintes.forEach((avisar) => avisar());
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  // outra aba do mesmo site mudou o tema
  const aoMudarArmazenamento = (e: StorageEvent) => {
    if (e.key === CHAVE_TEMA) {
      aplicarTema(lerTema());
      avisar();
    }
  };
  window.addEventListener("storage", aoMudarArmazenamento);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", aoMudarArmazenamento);
  };
}

export function useTema() {
  const tema = useSyncExternalStore(assinar, lerTema, () => "escuro" as Tema);
  const alternar = useCallback(() => definirTema(lerTema() === "claro" ? "escuro" : "claro"), []);
  return { tema, definirTema, alternar };
}
