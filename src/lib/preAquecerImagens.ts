// Pré-aquecimento das imagens (GIF/WebP) dos exercícios: dispara o download em background
// pra o modal "info" abrir na hora e o cache (Service Worker / HTTP) guardar pra próxima abertura.
// Nunca repete a mesma URL na sessão e respeita um teto por chamada (dados móveis).

interface ImagemAquecivel {
  src: string;
  decoding: string;
  crossOrigin: string | null;
}

export interface OpcoesPreAquecer {
  /** máximo de URLs novas por chamada */
  max?: number;
  /** injetável pros testes (padrão: `new Image()`) */
  criarImagem?: () => ImagemAquecivel;
}

const aquecidas = new Set<string>();

export function preAquecerImagens(urls: Array<string | null | undefined>, opts: OpcoesPreAquecer = {}): string[] {
  const max = opts.max ?? 10;
  const criar = opts.criarImagem ?? (() => new Image() as ImagemAquecivel);
  const novas: string[] = [];
  for (const u of urls) {
    if (novas.length >= max) break;
    if (!u || aquecidas.has(u)) continue;
    aquecidas.add(u);
    const img = criar();
    img.decoding = "async";
    img.crossOrigin = "anonymous"; // mesmo modo do <img> do modal → mesma entrada de cache
    img.src = u;
    novas.push(u);
  }
  return novas;
}

/** só pros testes */
export function limparAquecidas(): void {
  aquecidas.clear();
}
