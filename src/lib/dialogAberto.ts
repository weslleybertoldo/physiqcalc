/**
 * Fecha o modal (Radix Dialog/AlertDialog) que estiver aberto no topo, disparando
 * um `Escape` no document — é o mesmo caminho que o teclado usa, então o Radix
 * fecha só a camada mais alta e respeita `onEscapeKeyDown` dos dialogs que
 * bloqueiam o fechamento.
 *
 * Usado pelo botão "voltar" do Android: com um modal aberto, voltar tem que fechar
 * o modal, não navegar pra rota anterior (bug 03/09/2026: o modal "Alterar Grupo"
 * ficava preso e o voltar abria a tela do admin).
 *
 * @returns true se havia um modal aberto (e o Escape foi disparado).
 */
export function fecharDialogAberto(doc: Document = document): boolean {
  const aberto = doc.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
  if (!aberto) return false;
  doc.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
  );
  return true;
}
