/** Frase curta de instalação manual do app web quando o navegador não tem o prompt nativo
 *  (iPhone, Firefox, navegador embutido…) — a mesma que o PWAInstallButton já mostra. */
export function instrucaoCurta(ua: string = navigator.userAgent): string {
  return /iPad|iPhone|iPod/.test(ua)
    ? 'Toque em "Compartilhar" → "Adicionar à Tela de Início"'
    : 'Toque no menu ⋮ → "Adicionar à tela inicial"';
}
