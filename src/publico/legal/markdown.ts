/**
 * hml-11 (H-28, D3) — leitor do Markdown simples dos textos legais. É o do Nativo OS (features/legal/markdown.ts) adaptado aos
 * rascunhos do Physiq, que usam subitens: títulos `##`/`###`, parágrafos (as linhas seguidas se juntam), listas `- ` com subitens
 * pelo recuo (2 espaços por nível), linha recuada que continua o item e parágrafo recuado dentro do item, tabelas `| a | b |`,
 * `**negrito**` e `[link](/rota)`. Devolve blocos que a tela monta com React: nada de HTML cru na página. O texto é nosso
 * (src/publico/legal/*.ts); marcação fora disso fica como texto, e o teste dos textos acusa.
 */
export type Trecho = { texto: string; negrito?: true; link?: string };
/** Item de lista: o texto do item (a 1ª linha e as que a continuam) e o que vem recuado dentro dele (subitens, parágrafos). */
export type ItemLista = { trechos: Trecho[]; dentro: Bloco[] };
export type Bloco =
  | { tipo: "titulo"; nivel: 2 | 3; texto: string; id: string }
  | { tipo: "paragrafo"; trechos: Trecho[] }
  | { tipo: "lista"; itens: ItemLista[] }
  | { tipo: "tabela"; cabecalho: Trecho[][]; linhas: Trecho[][][] };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function lerTrechos(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  let desde = 0;
  for (const m of linha.matchAll(INLINE)) {
    const inicio = m.index ?? 0;
    if (inicio > desde) trechos.push({ texto: linha.slice(desde, inicio) });
    trechos.push(m[1] !== undefined ? { texto: m[1], negrito: true } : { texto: m[2], link: m[3] });
    desde = inicio + m[0].length;
  }
  if (desde < linha.length) trechos.push({ texto: linha.slice(desde) });
  return trechos;
}

/** "R$ 29,90", "CPF 123…", "§ 1º", "nº 2/2022" e "art. 11" não se separam na quebra de linha (coluna estreita, celular). */
export function semQuebra(texto: string): string {
  return texto.replace(/(R\$|CPF|§|nº|art\.) (?=\d)/g, "$1\u00a0");
}

export function slug(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface Linha {
  /** espaços no começo da linha */
  recuo: number;
  /** a linha sem o recuo e sem os espaços do fim */
  texto: string;
}

const ehTitulo = (t: string) => /^#{2,3} /.test(t);
const ehItem = (t: string) => t.startsWith("- ");
const ehLinhaDeTabela = (t: string) => t.startsWith("|");
const vazia = (l: Linha) => l.texto === "";
/** A linha continua o parágrafo (ou o texto do item) aberto: tem texto, está no recuo do bloco e não abre outro bloco. */
const continua = (l: Linha, recuoMin: number) =>
  !vazia(l) && l.recuo >= recuoMin && !ehTitulo(l.texto) && !ehItem(l.texto) && !ehLinhaDeTabela(l.texto);

function celulas(linha: string): string[] {
  return linha.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

const ehSeparador = (cels: string[]) => cels.every((c) => /^:?-{3,}:?$/.test(c));

export function lerMarkdown(md: string): Bloco[] {
  const linhas: Linha[] = md
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((bruta) => {
      const linha = bruta.replace(/\s+$/, "");
      const texto = linha.trimStart();
      return { recuo: linha.length - texto.length, texto };
    });
  return lerBlocos(linhas, { i: 0 }, 0);
}

/** Os blocos a partir de `pos.i` enquanto as linhas estiverem no recuo `recuoMin` ou mais (o que vem dentro de um item). */
function lerBlocos(linhas: Linha[], pos: { i: number }, recuoMin: number): Bloco[] {
  const blocos: Bloco[] = [];
  while (pos.i < linhas.length) {
    const linha = linhas[pos.i];
    if (vazia(linha)) {
      pos.i++;
      continue;
    }
    if (linha.recuo < recuoMin) break;
    if (ehTitulo(linha.texto)) {
      const nivel = linha.texto.startsWith("### ") ? 3 : 2;
      const texto = linha.texto.slice(nivel + 1).trim();
      blocos.push({ tipo: "titulo", nivel, texto, id: slug(texto) });
      pos.i++;
    } else if (ehItem(linha.texto)) {
      blocos.push(lerLista(linhas, pos, linha.recuo));
    } else if (ehLinhaDeTabela(linha.texto)) {
      const tabela: string[][] = [];
      while (pos.i < linhas.length && !vazia(linhas[pos.i]) && ehLinhaDeTabela(linhas[pos.i].texto)) tabela.push(celulas(linhas[pos.i++].texto));
      const [cabecalho = [], ...corpo] = tabela.filter((cels) => !ehSeparador(cels));
      blocos.push({ tipo: "tabela", cabecalho: cabecalho.map(lerTrechos), linhas: corpo.map((cels) => cels.map(lerTrechos)) });
    } else {
      const partes: string[] = [];
      while (pos.i < linhas.length && continua(linhas[pos.i], recuoMin)) partes.push(linhas[pos.i++].texto);
      blocos.push({ tipo: "paragrafo", trechos: lerTrechos(partes.join(" ")) });
    }
  }
  return blocos;
}

/**
 * Uma lista no recuo `recuo`. Como no CommonMark, linha vazia entre 2 itens do mesmo recuo não acaba a lista. Dentro do item: as
 * linhas recuadas logo abaixo continuam o texto dele; depois, subitens e parágrafos recuados (a linha vazia antes é permitida).
 */
function lerLista(linhas: Linha[], pos: { i: number }, recuo: number): Bloco {
  const itens: ItemLista[] = [];
  while (pos.i < linhas.length) {
    let j = pos.i;
    while (j < linhas.length && vazia(linhas[j])) j++;
    if (j >= linhas.length || linhas[j].recuo !== recuo || !ehItem(linhas[j].texto)) break;
    pos.i = j;
    const partes = [linhas[pos.i++].texto.slice(2).trim()];
    while (pos.i < linhas.length && continua(linhas[pos.i], recuo + 1)) partes.push(linhas[pos.i++].texto);
    const dentro = lerBlocos(linhas, pos, recuo + 1);
    itens.push({ trechos: lerTrechos(partes.join(" ")), dentro });
  }
  return { tipo: "lista", itens };
}
