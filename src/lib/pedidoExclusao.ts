// Physiq W2 da loja — a página pública /excluir-conta (a URL que vai no formulário "Segurança dos dados" da Google Play) tem o botão
// "Entrar para excluir": a pessoa entra e cai direto na tela de exclusão certa (src/publico/ExcluirConta.tsx decide qual). O pedido
// fica guardado no navegador por 30 min porque a volta do login do Google recarrega a página e o `state` do router se perde (o mesmo
// motivo do destino dos links — src/lib/linksDoApp.ts, que só guarda rotas do app do aluno). A entrada (destinoDaEntrada) e o destino
// depois do login (destinoDepoisDoLogin — até para quem entra sem nada, que iria para as Boas-vindas) levam de volta à página.

export const ROTA_EXCLUIR_CONTA = "/excluir-conta";
export const VALIDADE_PEDIDO_MS = 30 * 60_000;
const CHAVE = "physiq_pedido_excluir_conta";

export function guardarPedidoExclusao(agora: number = Date.now()): void {
  try {
    localStorage.setItem(CHAVE, String(agora));
  } catch {
    /* sem armazenamento: o `state` do router ainda leva (e-mail e senha) */
  }
}

/** Há um pedido de exclusão recente (feito nesta página, há menos de 30 min)? */
export function pedidoExclusaoPendente(agora: number = Date.now()): boolean {
  try {
    const em = Number(localStorage.getItem(CHAVE));
    if (!Number.isFinite(em) || em <= 0) return false;
    if (agora - em < 0 || agora - em > VALIDADE_PEDIDO_MS) {
      localStorage.removeItem(CHAVE);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function esquecerPedidoExclusao(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* noop */
  }
}

/** O caminho é o da página de exclusão (com ou sem busca)? */
export function ehRotaDeExclusao(caminho: string | null | undefined): boolean {
  return typeof caminho === "string" && (caminho === ROTA_EXCLUIR_CONTA || caminho.startsWith(`${ROTA_EXCLUIR_CONTA}?`));
}
