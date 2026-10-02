/**
 * O contato do suporte do Physiq — UM lugar só (H4). Leem daqui a página de privacidade (src/publico/Privacidade.tsx) e as telas
 * que mandam "falar com o suporte": o "Excluir minha conta" do profissional (que não se exclui pelo app — W7), a conta suspensa
 * pelo master (o painel trava — W27) e o Plano da conta suspensa.
 *
 * O valor é o contato que o Weslley escolheu em 02/10/2026 para o suporte e para a página de privacidade (antes, o e-mail que veio do
 * Calc antigo). Mudou de novo? Muda só esta linha.
 */
export const CONTATO_SUPORTE = "bertoldo.code@gmail.com";

/** O link que abre o e-mail para o suporte (com o assunto, para a mensagem chegar já dizendo do que se trata). */
export function linkDoSuporte(assunto = "Suporte do Physiq"): string {
  return `mailto:${CONTATO_SUPORTE}?subject=${encodeURIComponent(assunto)}`;
}
