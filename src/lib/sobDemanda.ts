import { useCallback, useRef, useState } from "react";

/**
 * hml-18b (H-54, F) — o módulo pesado só na AÇÃO (o molde do dietaPdf): o PDF (jsPDF + autotable + html2canvas, ~636 KB) entra por
 * `import()` no clique, nunca no topo da tela — antes 22 aberturas do painel baixavam o pedaço do PDF só por abrir.
 *
 *   const PDF = sobDemanda(() => import("@/lib/generateAdminPDF"));   // o caminho LITERAL no import(): o Vite separa o pedaço
 *   const { generateAdminPDF } = await PDF.obter();                     // no clique
 *   PDF.aquecer();                                                      // ao abrir o menu do PDF (risco 9 da spec: o 1º clique
 *                                                                       // não espera o pedaço inteiro)
 *
 * `obter()` baixa uma vez (quem pedir junto recebe a mesma promessa); erro de rede → a próxima chamada tenta de novo. `aquecer()`
 * começa sem esperar e sem erro na tela (o clique de verdade mostra o erro, se houver).
 */
export interface SobDemanda<T> {
  obter: () => Promise<T>;
  aquecer: () => void;
}

export function sobDemanda<T>(carregar: () => Promise<T>): SobDemanda<T> {
  let promessa: Promise<T> | null = null;
  const obter = () => {
    if (!promessa) {
      promessa = carregar().catch((e: unknown) => {
        promessa = null;
        throw e;
      });
    }
    return promessa;
  };
  return {
    obter,
    aquecer: () => {
      obter().catch(() => undefined);
    },
  };
}

/**
 * O "ocupado" dos botões de uma ação sob demanda (princípio 8 da Skill-wbs-navegacao: o botão responde na hora): `rodar(chave, acao)`
 * liga o spinner da chave até a ação terminar — o pedaço chegar e o arquivo sair. Uma por vez: outro toque enquanto roda não faz
 * nada (devolve false). O `await` de um tique antes da ação deixa o spinner pintar antes do trabalho síncrono do jsPDF.
 */
export function useAcaoSobDemanda<K extends string = string>(): {
  ocupado: K | null;
  rodar: (chave: K, acao: () => Promise<unknown> | unknown) => Promise<boolean>;
} {
  const [ocupado, setOcupado] = useState<K | null>(null);
  const rodando = useRef(false);
  const rodar = useCallback(async (chave: K, acao: () => Promise<unknown> | unknown) => {
    if (rodando.current) return false;
    rodando.current = true;
    setOcupado(chave);
    try {
      await new Promise((r) => setTimeout(r, 0));
      await acao();
      return true;
    } finally {
      rodando.current = false;
      setOcupado(null);
    }
  }, []);
  return { ocupado, rodar };
}
