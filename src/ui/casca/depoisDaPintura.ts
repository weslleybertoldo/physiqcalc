/**
 * hml-18a (H-40, E) — roda `fn` só DEPOIS da próxima pintura da tela.
 *
 * Com `useTransitions={false}` (fica — spec §2.5), a troca de página renderiza a página nova inteira no mesmo toque, antes de o navegador
 * pintar qualquer coisa: o toque num item da folha "Mais" só mostrava a folha fechando quando a página nova (ex.: a Agenda, ~100 ms de
 * render) terminava. Fechando a folha no toque e trocando de página aqui, a 1ª mudança aparece no quadro seguinte ao toque.
 *
 * O `requestAnimationFrame` roda logo ANTES da pintura; o `setTimeout` agendado dentro dele, logo DEPOIS. Com a aba escondida o rAF não
 * roda: a reserva de 100 ms garante a troca (e `fn` roda uma vez só).
 */
export function depoisDaPintura(fn: () => void): void {
  let feito = false;
  const uma = () => {
    if (feito) return;
    feito = true;
    fn();
  };
  const reserva = window.setTimeout(uma, 100);
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      window.clearTimeout(reserva);
      uma();
    }, 0);
  });
}
