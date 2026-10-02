// Physiq W25 — o que as fontes da busca global (Ctrl K — NF10) dividem. Arquivo com "_" no começo: o registro não o trata como fonte.
import { useEffect, useState } from "react";

/** A busca só vai ao servidor com 2 letras ou mais, 300 ms depois da última tecla (como as listas de Alunos e Alimentos). */
export const MIN_BUSCA = 2;
export const ESPERA_BUSCA_MS = 300;
export const MAX_RESULTADOS = 6;

/** O termo "assentado" (sem espaços nas pontas) depois da espera; vazio enquanto tem menos de 2 letras. */
export function termoDaBusca(termo: string): string {
  const t = termo.trim().replace(/\s+/g, " ");
  return t.length >= MIN_BUSCA ? t : "";
}

export function useTermoComEspera(termo: string, ms = ESPERA_BUSCA_MS): string {
  const [valor, setValor] = useState(() => termoDaBusca(termo));
  useEffect(() => {
    const t = setTimeout(() => setValor(termoDaBusca(termo)), ms);
    return () => clearTimeout(t);
  }, [termo, ms]);
  return valor;
}
