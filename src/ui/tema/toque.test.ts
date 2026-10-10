import { describe, expect, it } from "vitest";
import { arquivosDoApp, lerDoApp, semComentarios } from "@/test/fonte";

// hml-18a (H-40, C) — guarda do toque no celular (lê o CSS): a base em index.css (@layer base) com o touch-action (sem o atraso do
// duplo toque), o overscroll contido no html e no body e a resposta no :active de TODO tocável; os compactos com escala (pq-botao,
// pq-ibtn, itens da barra, abas e chips). E o que NÃO pode voltar: nenhum @media (prefers-reduced-motion: reduce) nem motion-reduce:
// zerando o movimento (Skill-wbs-navegacao, princípio 6 — no PC do Weslley o navegador pede "reduce" e o app inteiro abria seco).

const css = (caminho: string) => semComentarios(lerDoApp(caminho), true).replace(/\s+/g, " ");

/** O conteúdo do bloco que abre em `inicio` (chaves balanceadas). */
function bloco(texto: string, inicio: string): string {
  const i = texto.indexOf(inicio);
  if (i < 0) return "";
  let nivel = 0;
  for (let j = texto.indexOf("{", i); j < texto.length; j++) {
    if (texto[j] === "{") nivel += 1;
    if (texto[j] === "}" && --nivel === 0) return texto.slice(i, j + 1);
  }
  return "";
}

const TOCAVEIS = ':where(button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, label[for])';

function reduzMovimento(texto: string, tipo: "css" | "tsx"): string[] {
  const limpo = semComentarios(texto, tipo === "css");
  const re = tipo === "css" ? /prefers-reduced-motion\s*:\s*reduce/g : /(?<![\w-])motion-reduce:/g;
  return [...limpo.matchAll(re)].map((m) => `${limpo.slice(0, m.index).split("\n").length}: ${m[0]}`);
}

describe("toque no celular (hml-18a, H-40): a base", () => {
  const index = css("index.css");
  const base = bloco(index, "@layer base {");

  it("index.css @layer base: html e body com overscroll-behavior-y: contain", () => {
    expect(base).toMatch(/html, body \{ overscroll-behavior-y: contain; \}/);
  });

  it("index.css @layer base: todo tocável com touch-action: manipulation e sem o tap-highlight (o touch-none das alças continua mandando)", () => {
    expect(base).toContain(`${TOCAVEIS} { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }`);
  });

  it("index.css @layer base: o :active de todo tocável (fora o desabilitado e as alças de arrastar) com resposta visível", () => {
    expect(base).toContain(`${TOCAVEIS}:not(:disabled):not([aria-disabled="true"]):not(.touch-none):active { opacity: 0.72; }`);
  });

  it("tokens.css: o pq-botao e o pq-ibtn respondem ao toque com escala e transição do transform", () => {
    const tokens = css("ui/tema/tokens.css");
    const botao = bloco(tokens, "@utility pq-botao {");
    expect(botao).toMatch(/transform 0\.15s ease-out/);
    expect(botao).toMatch(/&:active:not\(:disabled\) \{ transform: translateY\(1px\) scale\(0\.98\); \}/);
    const ibtn = bloco(tokens, "@utility pq-ibtn {");
    expect(ibtn).toMatch(/transform 0\.15s ease-out/);
    expect(ibtn).toMatch(/&:active:not\(:disabled\) \{ transform: scale\(0\.94\); \}/);
    expect(bloco(tokens, "@utility pq-sem-barra {")).toMatch(/& > :is\(a\[href\], button\):not\(:disabled\):active \{ transform: scale\(0\.97\); \}/);
    expect(bloco(tokens, "@utility pq-chip {")).toMatch(/&:is\(button, a\[href\]\):not\(:disabled\):active \{ transform: scale\(0\.97\); \}/);
  });

  it("os itens da barra de baixo encolhem no toque, com a transição da cor e da escala (no Tailwind 4, active:scale-* é a propriedade scale)", () => {
    expect(lerDoApp("ui/premium/TabBar.tsx")).toContain("transition-[color,scale] duration-150 active:scale-[0.94]");
  });
});

describe("toque no celular — o que não pode voltar", () => {
  it("nenhum prefers-reduced-motion: reduce no CSS do src/ (o 'reduzir movimento' do sistema não pode zerar o app)", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp(/\.css$/)) for (const a of reduzMovimento(lerDoApp(c), "css")) achados.push(`${c}:${a}`);
    expect(achados).toEqual([]);
  });

  it("nenhum motion-reduce: nas telas (.tsx/.ts)", () => {
    const achados: string[] = [];
    for (const c of arquivosDoApp()) for (const a of reduzMovimento(lerDoApp(c), "tsx")) achados.push(`${c}:${a}`);
    expect(achados).toEqual([]);
  });

  it("a guarda lê de verdade: pega o bloco reduce e o motion-reduce de exemplo; não pega o no-preference nem o comentário", () => {
    expect(reduzMovimento("@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }", "css")).toHaveLength(1);
    expect(reduzMovimento('<div className="transition motion-reduce:transition-none" />', "tsx")).toHaveLength(1);
    expect(reduzMovimento("@media (prefers-reduced-motion: no-preference) { .a { animation: girar 1s; } }", "css")).toEqual([]);
    expect(reduzMovimento("/* nada de @media (prefers-reduced-motion: reduce) aqui */", "css")).toEqual([]);
    expect(arquivosDoApp(/\.css$/)).toEqual(expect.arrayContaining(["index.css", "ui/tema/tokens.css"]));
  });
});
