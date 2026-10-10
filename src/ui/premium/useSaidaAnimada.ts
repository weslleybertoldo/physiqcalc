import { useLayoutEffect, useRef, useState } from "react";

/** Se o animationend da saída não vier (aba em segundo plano, nó escondido), a sobreposição sai assim mesmo depois disto. */
const SEGURANCA_MS = 1000;

/**
 * hml-18a (H-40, D) — a saída animada de uma sobreposição PRÓPRIA (fora dos primitivos do Radix: faixa, cartão flutuante, lista de
 * sugestões, tela por cima), no mesmo jeito do Presence do Radix: aberta, ela monta com data-state="open" (a classe de entrada
 * anima); ao fechar, continua montada com data-state="closed" enquanto a animação de saída (`data-[state=closed]:animate-out`) roda
 * e só sai do DOM no animationend dela. Sem animação de saída (animationName "none", como no jsdom dos testes), sai na hora. Abrir
 * de novo no meio da saída volta para "open" sem desmontar.
 *
 *   const saida = useSaidaAnimada<HTMLDivElement>(aberto);
 *   if (!saida.montado) return null;
 *   return <div ref={saida.ref} data-state={saida.estado} className="… duration-200 data-[state=open]:animate-in
 *     data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">…</div>;
 */
export function useSaidaAnimada<T extends HTMLElement = HTMLElement>(aberto: boolean) {
  const ref = useRef<T | null>(null);
  const [saindo, setSaindo] = useState(false);
  const [antes, setAntes] = useState(aberto);
  if (antes !== aberto) {
    // mudou neste render: fechou → começa a saída; abriu → a saída (se havia) acaba
    setAntes(aberto);
    setSaindo(!aberto);
  }

  useLayoutEffect(() => {
    if (!saindo) return;
    const no = ref.current;
    const animacao = no ? getComputedStyle(no).animationName : "";
    if (!no || !animacao || animacao === "none") {
      setSaindo(false);
      return;
    }
    // só a animação de SAÍDA deste nó: a de um filho (ex.: um ponto pulsando) e o cancelamento da entrada (fechou logo depois de
    // abrir) não contam — o mesmo filtro do Presence do Radix
    const saidas = animacao.split(",").map((n) => n.trim());
    const fim = (e: Event) => {
      if (e.target === no && saidas.includes((e as AnimationEvent).animationName)) setSaindo(false);
    };
    const seguranca = window.setTimeout(() => setSaindo(false), SEGURANCA_MS);
    no.addEventListener("animationend", fim);
    no.addEventListener("animationcancel", fim);
    return () => {
      window.clearTimeout(seguranca);
      no.removeEventListener("animationend", fim);
      no.removeEventListener("animationcancel", fim);
    };
  }, [saindo]);

  return { montado: aberto || saindo, estado: aberto ? ("open" as const) : ("closed" as const), ref };
}
