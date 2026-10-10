import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// hml-18a (H-40, A) — guarda da largura no celular. Uma grade que só ganha coluna a partir de um tamanho (`grid … xl:grid-cols-3`)
// fica, no celular, com UMA coluna `auto`: ela cresce até o maior conteúdo mínimo de qualquer item (um nome com `truncate` basta) e a
// página passa da tela — e a barra de baixo vai junto para fora (medido na spec: Agenda +236 px, Dashboard +162, Biblioteca +109).
// O certo é a coluna base no celular: `grid grid-cols-1 xl:grid-cols-3` (no Tailwind 4, `repeat(1, minmax(0, 1fr))`).
// A guarda lê a fonte: o className (string, template ou cn/clsx/cva) com a classe `grid` sozinha (não `lg:grid`) e um
// `sm:|md:|lg:|xl:|2xl:grid-cols-` precisa de um `grid-cols-` base no mesmo className. Base = 0.

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface Trecho {
  texto: string;
  inicio: number;
}

/** Fim do literal que começa em `i` (aspas simples/duplas: até a aspa ou o fim da linha; template: até a crase, com `${…}` dentro). */
function fimDoLiteral(fonte: string, i: number): number {
  const aspa = fonte[i];
  let j = i + 1;
  if (aspa !== "`") {
    while (j < fonte.length && fonte[j] !== aspa && fonte[j] !== "\n") j += fonte[j] === "\\" ? 2 : 1;
    return Math.min(j + 1, fonte.length);
  }
  while (j < fonte.length && fonte[j] !== "`") {
    if (fonte[j] === "\\") j += 2;
    else if (fonte[j] === "$" && fonte[j + 1] === "{") j = fimDoBloco(fonte, j + 1, "{", "}");
    else j += 1;
  }
  return Math.min(j + 1, fonte.length);
}

/** Fim do bloco balanceado que abre em `i` (pula strings, templates e comentários). */
function fimDoBloco(fonte: string, i: number, abre: string, fecha: string): number {
  let nivel = 0;
  let j = i;
  while (j < fonte.length) {
    const c = fonte[j];
    if (c === '"' || c === "'" || c === "`") {
      j = fimDoLiteral(fonte, j);
      continue;
    }
    if (c === "/" && fonte[j + 1] === "/") {
      j = fonte.indexOf("\n", j);
      if (j < 0) return fonte.length;
      continue;
    }
    if (c === "/" && fonte[j + 1] === "*") {
      const k = fonte.indexOf("*/", j + 2);
      j = k < 0 ? fonte.length : k + 2;
      continue;
    }
    if (c === abre) nivel += 1;
    if (c === fecha) {
      nivel -= 1;
      if (nivel === 0) return j + 1;
    }
    j += 1;
  }
  return fonte.length;
}

/** A fonte com os comentários trocados por espaço (mesmas posições e quebras de linha); os literais ficam como estão. */
function semComentarios(fonte: string): string {
  let saida = "";
  let i = 0;
  const branco = (trecho: string) => trecho.replace(/[^\n]/g, " ");
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === "/" && fonte[i + 1] === "/") {
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
      const fim = fimDoLiteral(fonte, i);
      saida += fonte.slice(i, fim);
      i = fim;
    } else {
      saida += c;
      i += 1;
    }
  }
  return saida;
}

/** Os literais de texto da fonte (já sem comentários), cada um com a posição. */
function literais(fonte: string): Trecho[] {
  const saida: Trecho[] = [];
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i];
    if (c === '"' || c === "'" || c === "`") {
      const fim = fimDoLiteral(fonte, i);
      saida.push({ texto: fonte.slice(i, fim), inicio: i });
      i = fim;
    } else {
      i += 1;
    }
  }
  return saida;
}

/** Cada className inteiro (`className="…"` ou `className={…}`) e cada chamada cn(…)/clsx(…)/cva(…)/twMerge(…). */
function classNames(fonte: string): Trecho[] {
  const saida: Trecho[] = [];
  for (const m of fonte.matchAll(/\bclassName\s*=\s*(["'{])/g)) {
    const i = (m.index ?? 0) + m[0].length - 1;
    const fim = m[1] === "{" ? fimDoBloco(fonte, i, "{", "}") : fimDoLiteral(fonte, i);
    saida.push({ texto: fonte.slice(i, fim), inicio: m.index ?? 0 });
  }
  for (const m of fonte.matchAll(/\b(?:cn|clsx|cva|twMerge)\s*\(/g)) {
    const i = (m.index ?? 0) + m[0].length - 1;
    saida.push({ texto: fonte.slice(i, fimDoBloco(fonte, i, "(", ")")), inicio: m.index ?? 0 });
  }
  return saida;
}

const fichas = (texto: string) => texto.split(/[\s"'`{}$()?,;]+/).filter(Boolean);
const GRADE = /^(?:inline-)?grid$/;
const RESPONSIVA = /^(?:sm|md|lg|xl|2xl|min-\[[^\]]+\]):grid-cols-/;
const BASE = /^(?:max-(?:sm|md|lg|xl|2xl):)?grid-cols-/;

/** O texto é uma grade sem coluna no celular? (`grid` sozinho + coluna só num tamanho + nenhuma coluna base) */
function semColunaNoCelular(texto: string): boolean {
  // as fichas de arbitrário (`grid-cols-[minmax(0,1fr)_…]`) se partem nos parênteses: o começo (`xl:grid-cols-[minmax`) basta
  const f = fichas(texto);
  return f.some((x) => GRADE.test(x)) && f.some((x) => RESPONSIVA.test(x)) && !f.some((x) => BASE.test(x));
}

/** As grades sem coluna no celular de um arquivo: "linha: trecho" (o className inteiro e cada literal sozinho). */
function gradesSemColunaNoCelular(original: string): string[] {
  const fonte = semComentarios(original);
  const achados = new Map<number, string>();
  const linha = (pos: number) => fonte.slice(0, pos).split("\n").length;
  for (const t of [...classNames(fonte), ...literais(fonte)]) {
    if (!semColunaNoCelular(t.texto)) continue;
    const n = linha(t.inicio);
    if (!achados.has(n)) achados.set(n, `${n}: ${t.texto.replace(/\s+/g, " ").slice(0, 120)}`);
  }
  return [...achados.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

function arquivosDoApp(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((c) => /\.tsx?$/.test(c) && !/\.(test|spec)\.tsx?$/.test(c) && !c.split(/[\\/]/).includes("test"))
    .sort();
}

describe("largura no celular (hml-18a, H-40): grade com coluna base", () => {
  it("nenhuma grade do src/ só ganha coluna num tamanho (string, template ou cn) — base = 0", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp()) {
      for (const a of gradesSemColunaNoCelular(readFileSync(join(SRC, c), "utf8"))) achados.push(`${c}:${a}`);
    }
    expect(achados).toEqual([]);
  });

  it("a guarda lê de verdade: os arquivos da spec existem e têm grade com coluna base", () => {
    const arquivos = arquivosDoApp();
    expect(arquivos.length).toBeGreaterThan(500);
    const dashboard = readFileSync(join(SRC, "painel/paginas/Dashboard.tsx"), "utf8");
    expect(dashboard).toMatch(/grid grid-cols-1 gap-3\.5/);
  });

  describe("pega", () => {
    it.each([
      ['<div className="grid lg:grid-cols-2" />', "string"],
      ['<div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" />', "coluna arbitrária"],
      ["<div className={`grid gap-3.5 ${largo ? \"xl:grid-cols-3\" : \"xl:grid-cols-2\"}`} />", "template"],
      ['<div className={cn("grid gap-3", largo && "md:grid-cols-2")} />', "cn com a coluna noutro texto"],
      ['const GRADE = "inline-grid gap-2 sm:grid-cols-3";', "texto solto (constante)"],
      ['<div className="grid grid-cols-1 lg:grid-cols-2" /><div className="grid sm:grid-cols-2" />', "a 2ª de 2 na mesma linha"],
    ])("%s (%s)", (fonte) => {
      expect(gradesSemColunaNoCelular(fonte)).toHaveLength(1);
    });
  });

  describe("não pega", () => {
    it.each([
      ['<div className="lg:grid lg:grid-cols-[262px_minmax(0,1fr)]" />', "grade só a partir do lg (no celular não é grade)"],
      ['<div className="grid grid-cols-1 gap-3 lg:grid-cols-2" />', "com a coluna base"],
      ['<div className="grid grid-cols-2 sm:grid-cols-4" />', "com 2 colunas no celular"],
      ['<div className="grid max-lg:grid-cols-1 lg:grid-cols-2" />', "base pelo max-lg"],
      ["<div className={`grid grid-cols-1 gap-3.5 ${largo ? \"xl:grid-cols-3\" : \"\"}`} />", "template com base"],
      ['<div className={cn("grid grid-cols-1", "md:grid-cols-2")} />', "cn com a base noutro texto"],
      ['<div className="grid gap-2" />', "grade de 1 coluna sem tamanho (fora da guarda)"],
      ['// <div className="grid lg:grid-cols-2" />', "comentário"],
      ['<div className="flex lg:grid-cols-2" />', "sem a classe grid"],
    ])("%s (%s)", (fonte) => {
      expect(gradesSemColunaNoCelular(fonte)).toEqual([]);
    });
  });
});
