import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/fonte";

// bcode-0021 (item 8) — o contrato das funções com freio por IP em memória: a chave do Map do freio sempre passa pela chaveDoFreio
// (um código feito a partir do IP, com o sal da instância — nunca o IP); nenhum `ip ?? "sem-ip"` (o balde "sem-ip" só nasce dentro
// da chaveDoFreio); e só o _shared que faz a chave lê cabeçalho de IP. As funções rodam no Deno: aqui se lê o código, sem os
// comentários. O comportamento da chave: src/nucleo/entrarSenhaRegras.test.ts; o freio que conta igual, com a função rodando:
// src/nucleo/restaurarLoginFuncoes.test.ts.
const raiz = resolve(__dirname, "../..");
const codigoDe = (arquivo: string) => semComentarios(readFileSync(resolve(raiz, arquivo), "utf-8"));

/** Os .ts de uma pasta (com as subpastas, sem os testes), relativos à raiz. */
function arquivosDe(pasta: string): string[] {
  return (readdirSync(resolve(raiz, pasta), { recursive: true }) as string[])
    .map((c) => c.split("\\").join("/"))
    .filter((c) => c.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(c))
    .map((c) => `${pasta}/${c}`)
    .sort();
}

/** Cada banco publica só o _shared dele: o arquivo que lê o IP e faz a chave, e as funções que freiam por IP. */
const ARVORES = [
  {
    pasta: "supabase-principal/functions",
    ajuda: "supabase-principal/functions/_shared/entrar-senha-regras.ts",
    funcoes: ["entrar-senha", "restaurar-login", "alunos", "mp-conectar-retorno", "infinitepay-webhook-aluno", "mp-webhook-aluno"],
  },
];
const FUNCOES = ARVORES.flatMap((a) => a.funcoes.map((slug) => [slug, `${a.pasta}/${slug}`] as const));

// ───────────────────────── o detector ─────────────────────────

/** Ler o IP: o ipDoPedido ou um cabeçalho de IP (o do Worker, o da Cloudflare, o de encaminhamento). */
const LE_IP = /\bipDoPedido\(|x-forwarded-for|cf-connecting-ip|x-real-ip|x-physiq-ip/i;
/** As funções de freio das 10 (o Map em memória de cada uma). */
const FREIOS = /\b(?:permitido|permitidoIp|freio|freioPorIp)\s*\(/g;
/** O balde de quem não tem IP conhecido, entre aspas de qualquer tipo. */
const SEM_IP = /["'`]sem-ip["'`]/;

/** O fim (exclusivo) do (…) que abre na posição `abre` — parêntese dentro de texto entre aspas não conta. */
function fimDoParentese(codigo: string, abre: number): number {
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === '"' || c === "'") {
      const fecha = codigo.indexOf(c, i + 1);
      if (fecha < 0) break;
      i = fecha;
    } else if (c === "(") nivel++;
    else if (c === ")" && --nivel === 0) return i + 1;
  }
  throw new Error(`sem fechamento na posição ${abre}`);
}

/** O trecho com cada chaveDoFreio(…) inteira trocada por CHAVE: o que sobra não pode tocar no IP. */
function semAChave(trecho: string): string {
  let t = trecho;
  for (let i = t.indexOf("chaveDoFreio("); i >= 0; i = t.indexOf("chaveDoFreio(")) {
    t = `${t.slice(0, i)}CHAVE${t.slice(fimDoParentese(t, i + "chaveDoFreio".length))}`;
  }
  return t;
}

/**
 * As chamadas de freio que tocam no IP (citam o ipDoPedido, um cabeçalho de IP, o "sem-ip", a chaveDoFreio ou uma variável que guarda
 * o IP ou a chave). `cru` = o IP chega à chave do Map sem passar pela chaveDoFreio.
 */
function freiosPorIp(codigo: string): Array<{ chamada: string; cru: boolean }> {
  const declaracoes = [...codigo.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*);/g)];
  const guardamOIp = declaracoes.filter((d) => LE_IP.test(d[2]) && !d[2].includes("chaveDoFreio(")).map((d) => d[1]);
  const guardamAChave = declaracoes.filter((d) => /^await chaveDoFreio\(/.test(d[2].trim())).map((d) => d[1]);
  const cita = (texto: string, nomes: string[]) => nomes.some((n) => new RegExp(`(?<![\\w$.])${n.replace(/\$/g, "\\$")}(?![\\w$])`).test(texto));
  const tocaNoIp = (texto: string) => LE_IP.test(texto) || SEM_IP.test(texto) || cita(texto, guardamOIp);
  const saida: Array<{ chamada: string; cru: boolean }> = [];
  for (const m of codigo.matchAll(FREIOS)) {
    const inicio = m.index ?? 0;
    if (/\bfunction\s+$/.test(codigo.slice(Math.max(0, inicio - 20), inicio))) continue; // a declaração, não uma chamada
    const chamada = codigo.slice(inicio, fimDoParentese(codigo, inicio + m[0].length - 1));
    if (!tocaNoIp(chamada) && !chamada.includes("chaveDoFreio(") && !cita(chamada, guardamAChave)) continue; // o freio por pessoa
    saida.push({ chamada, cru: tocaNoIp(semAChave(chamada)) });
  }
  return saida;
}

// ───────────────────────── os testes ─────────────────────────

describe("bcode-0021 (item 8): a chave do freio por IP sempre passa pela chaveDoFreio (nunca o IP puro, nunca `ip ?? \"sem-ip\"`)", () => {
  it.each(FUNCOES)("%s: 1 freio por IP, e o IP só chega à chave dele pela chaveDoFreio", (_slug, pasta) => {
    const freios = arquivosDe(pasta).flatMap((a) => freiosPorIp(codigoDe(a)));
    expect(freios.map((f) => f.cru), freios.map((f) => f.chamada).join("\n")).toEqual([false]);
  });

  it.each(ARVORES.map((a) => [a.pasta, a] as const))("%s: só o _shared da chave lê cabeçalho de IP e escreve o \"sem-ip\"", (_pasta, arvore) => {
    const outros = arquivosDe(arvore.pasta).filter((a) => a !== arvore.ajuda);
    expect(outros.length).toBeGreaterThan(arvore.funcoes.length);
    const cabecalhoDeIp = /["'`](?:x-forwarded-for|cf-connecting-ip|x-real-ip|x-physiq-ip)["'`]/i;
    expect(outros.filter((a) => cabecalhoDeIp.test(codigoDe(a)))).toEqual([]);
    expect(outros.filter((a) => SEM_IP.test(codigoDe(a)))).toEqual([]);
    // controle positivo: o _shared tem os 2 (senão a busca acima estaria oca)
    expect(codigoDe(arvore.ajuda)).toMatch(cabecalhoDeIp);
    expect(codigoDe(arvore.ajuda)).toMatch(SEM_IP);
  });

  it("principal: quem lê o IP (o ipDoPedido) são exatamente as 6, e as 6 fazem a chave pela chaveDoFreio", () => {
    const arvore = ARVORES[0];
    const outros = arquivosDe(arvore.pasta).filter((a) => a !== arvore.ajuda);
    const esperado = arvore.funcoes.map((slug) => `${arvore.pasta}/${slug}/index.ts`).sort();
    expect(outros.filter((a) => /\bipDoPedido\(/.test(codigoDe(a)))).toEqual(esperado);
    expect(outros.filter((a) => /\bchaveDoFreio\(/.test(codigoDe(a)))).toEqual(esperado);
  });
});

describe("bcode-0021 (item 8): controle do detector (ele acha o IP cru na chave — senão o contrato passaria sempre)", () => {
  const crus = (codigo: string) => freiosPorIp(codigo).map((f) => f.cru);

  it("as formas de antes (o IP ou o \"sem-ip\" direto na chave) são achadas", () => {
    expect(crus('const ip = ipDoPedido(req.headers, PROXY_SEGREDO);\nif (!permitido(`${schema}:${ip ?? "sem-ip"}`)) {}')).toEqual([true]);
    expect(crus('if (!permitido(ipDoPedido(req.headers, null) ?? "sem-ip")) return r;')).toEqual([true]);
    expect(crus('const ip = ipDoPedido(req.headers, PROXY_SEGREDO) ?? "sem-ip";\nif (u === null && !permitidoIp(ip)) return r;')).toEqual([true]);
    expect(crus('const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";\nif (!freio(`ip:${ip}`, 120)) return r;'))
      .toEqual([true]);
    expect(crus('const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "sem-ip";\nif (!freioPorIp(ip)) return r;'))
      .toEqual([true]);
    // o IP cru ao lado da chave também é achado
    expect(crus("const ip = ipDoPedido(h, s);\nif (!permitido(`${await chaveDoFreio(ip)}:${ip}`)) {}")).toEqual([true]);
  });

  it("as formas novas passam; o freio por pessoa e a declaração não contam; comentário não conta", () => {
    expect(crus("const ip = ipDoPedido(req.headers, PROXY_SEGREDO);\nif (!permitido(`${schema}:${await chaveDoFreio(ip)}`)) {}")).toEqual([false]);
    expect(crus("if (!permitido(await chaveDoFreio(ipDoPedido(req.headers, null)))) return r;")).toEqual([false]);
    expect(crus("const ip = await chaveDoFreio(ipDoPedido(req.headers, PROXY_SEGREDO));\nif (!permitidoIp(ip)) return r;")).toEqual([false]);
    expect(crus("if (!freio(`ip:${await chaveDoFreio(req.headers)}`, 120)) return r;")).toEqual([false]);
    expect(crus("if (!freioPorIp(await chaveDoFreio(req.headers))) return r;")).toEqual([false]);
    expect(crus("if (!permitido(`rep:${schema}:${quem}`, 60, 60_000)) return r;")).toEqual([]);
    expect(crus("function permitido(chave: string, max = 40): boolean {\n  return true;\n}")).toEqual([]);
    expect(crus(semComentarios('// if (!permitido(`${schema}:${ip ?? "sem-ip"}`)) {}\nconst a = 1;'))).toEqual([]);
  });
});
