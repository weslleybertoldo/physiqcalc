import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Ajuda das guardas que leem a fonte (hml-18a): o src/ do app sem os testes, e o texto sem os comentários.

export const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Os arquivos do app (relativos ao src/) com essas extensões — sem os testes nem a pasta src/test. */
export function arquivosDoApp(extensoes: RegExp = /\.tsx?$/): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((c) => extensoes.test(c) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(c) && !c.split(/[\\/]/).includes("test"))
    .sort();
}

export function lerDoApp(caminho: string): string {
  return readFileSync(join(SRC, caminho), "utf8");
}

/**
 * O texto com os comentários (de linha e de bloco) trocados por espaço, nas mesmas posições; os literais ('…', "…", `…`) ficam.
 * css = true: só o comentário de bloco (no CSS, "//" faz parte de URL).
 */
export function semComentarios(fonte: string, css = false): string {
  let saida = "";
  let i = 0;
  const branco = (trecho: string) => trecho.replace(/[^\n]/g, " ");
  while (i < fonte.length) {
    const c = fonte[i];
    if (!css && c === "/" && fonte[i + 1] === "/") {
      const k = fonte.indexOf("\n", i);
      const fim = k < 0 ? fonte.length : k;
      saida += branco(fonte.slice(i, fim));
      i = fim;
    } else if (c === "/" && fonte[i + 1] === "*") {
      const k = fonte.indexOf("*/", i + 2);
      const fim = k < 0 ? fonte.length : k + 2;
      saida += branco(fonte.slice(i, fim));
      i = fim;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < fonte.length && fonte[j] !== c && (c === "`" || fonte[j] !== "\n")) j += fonte[j] === "\\" ? 2 : 1;
      saida += fonte.slice(i, j + 1);
      i = j + 1;
    } else {
      saida += c;
      i += 1;
    }
  }
  return saida;
}
