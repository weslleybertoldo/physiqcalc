// Physiq H5 (achado 1 do FIM-1b) — o "modo só leitura" das seções da Dieta (dono sem papel de nutricionista — W16) e das seções
// clínicas do Prontuário (nutricionista da conta que não é a responsável — W18). Era um <fieldset disabled>, que desligava TUDO,
// inclusive PDF, Ver e Baixar: o dono não gerava o PDF das metas/orientações e a nutri só-leitura não abria nem baixava os anexos.
// Agora: tudo continua travado (gravar é do banco, que também confere — RLS da W3/W18), MENOS os controles marcados com
// `data-leitura` (PDF, Ver, Baixar, os filtros e o período) — quem pode LER pela regra continua lendo, gerando o PDF e baixando.
import { useLayoutEffect, useRef, type DragEvent, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { cliqueBarrado, travarControles } from "@/nutricao/editor/lib/somenteLeitura";

export function SomenteLeitura({ children, className, ...resto }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const raiz = ref.current;
    if (!raiz) return;
    travarControles(raiz);
    // o que a seção desenhar depois (lista que chega, botão que o React religa) volta a ficar travado
    const mo = new MutationObserver(() => travarControles(raiz));
    mo.observe(raiz, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => mo.disconnect();
  }, []);
  const barrarClique = (e: MouseEvent<HTMLDivElement>) => {
    if (!cliqueBarrado(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  // arrastar e soltar um arquivo (a área dos Anexos) também não grava nada aqui
  const barrarArrasto = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div ref={ref} className={cn("min-w-0", className)} data-somente-leitura onClickCapture={barrarClique} onDragEnterCapture={barrarArrasto}
      onDragOverCapture={barrarArrasto} onDropCapture={barrarArrasto} {...resto}>
      {children}
    </div>
  );
}
