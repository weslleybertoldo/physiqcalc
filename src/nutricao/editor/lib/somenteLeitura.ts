// Physiq H5 (achado 1 do FIM-1b) — as regras do modo só leitura (o componente está em ../ui/SomenteLeitura.tsx): o que trava e o que
// passa. Trava todo controle de formulário da área, menos os marcados com `data-leitura` (PDF, Ver, Baixar, filtros e período).
const CONTROLES = "button, input, select, textarea";
const ACIONAVEIS = "button, input, select, textarea, [role=button], [role=checkbox], [role=switch], [role=menuitem], [contenteditable=true]";
export const LIBERADO_NA_LEITURA = "[data-leitura]";

type Controle = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Desliga os controles da área que não são de leitura (devolve quantos desligou agora). Os marcados com data-leitura ficam como estão. */
export function travarControles(raiz: HTMLElement): number {
  let n = 0;
  raiz.querySelectorAll<Controle>(CONTROLES).forEach((c) => {
    if (c.closest(LIBERADO_NA_LEITURA)) return;
    if (!c.hasAttribute("data-travado-leitura")) c.setAttribute("data-travado-leitura", "");
    if (!c.disabled) {
      c.disabled = true;
      n++;
    }
  });
  return n;
}

/** Clique num controle que não é de leitura não passa (a reserva do `disabled`: role=button, menus, o que nascer depois). */
export function cliqueBarrado(alvo: EventTarget | null): boolean {
  const el = alvo instanceof Element ? alvo : null;
  const c = el?.closest(ACIONAVEIS);
  return !!c && !c.closest(LIBERADO_NA_LEITURA);
}
