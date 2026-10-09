#!/usr/bin/env node
// hml-14 (H-32, D8): a guarda contra a volta do erro de banco ignorado, da gravação às cegas, do fetch sem tempo e do limite "de
// mentira". Roda no check "checar-pr" de todo PR pelo `npm run test:node`: o scripts/ci/checar-funcoes.test.mjs roda esta checagem
// no repo inteiro contra a base (sem mexer no workflow nem no ruleset).
//
// Regras — as heurísticas que mediram a hml-14 (para os números baterem com o front.py da skill e os scripts da spec):
//   R1  `{ data… } = await X.from(` / `.rpc(` sem `error` na desestruturação: o erro do banco vira lista vazia ou "não encontrado"
//       (o SO_DATA do front.py, regras B8/B14, aberto a `{ data, count }`). Funções e src/.
//   R2  `await X.from(…).insert|update|upsert|delete(…)` ou `await X.rpc(…)` como instrução solta, com o resultado jogado fora
//       (o gravacao_descartada.py). Funções e src/.
//   R3  `fetch(` sem `signal` na chamada, fora do próprio buscarComTempo (o fetch_sinal.py). Só nas funções (supabase*/functions).
//   R4  `.limit(N)` com N > 1000 — o número escrito ou uma `const` numérica do mesmo arquivo (o LIMITE_PERIODO = 2000 do Financeiro
//       se escondia assim): o PostgREST devolve no máximo 1000 sem avisar (max_rows nos 2 projetos). Funções e src/.
// O texto é lido sem os comentários. Testes (*.test.*, *.spec.*, *_test.ts, pastas tests/ e __tests__/) ficam de fora.
// Conferido no commit medido pela spec (178f5d6): R1 168 (= front.py B8 166 + B14 2), R2 85, R3 23 e R4 13 (os 12 da spec + o
// .limit(5000) do Financeiro que a lista dela não tinha).
//
// Dívida aceita: scripts/ci/checar-funcoes.base.json — cada item é arquivo + regra + trecho (as linhas do achado sem comentário e com
// os espaços normalizados; SEM número de linha, para a base não quebrar quando o arquivo anda). O que está na base passa; o que é
// novo falha; item da base que já não existe também falha (a base só diminui: corrigiu, tira da base).
// Escape pontual: `// hml-14: ok <motivo>` numa das linhas do achado.
// Por que base e não `git diff`: o checkout do CI é raso (fetch-depth 1) e não tem a main para comparar.
// Limite conhecido: lê o que está escrito — `.limit(x)` com constante de outro arquivo ou variável, `fetch(url, init)` com o signal
// dentro do `init` e gravação dentro de expressão (`if (x) await …`, `return await …`) não entram (o `fetch(url, init)` acusa:
// confira e use o escape).
//
// Gerar a base de novo (depois de corrigir o que dá; o `motivo` dos itens que continuam é mantido):
//   node scripts/ci/checar-funcoes.mjs --gerar-base
// Uso: node scripts/ci/checar-funcoes.mjs [raiz] [--gerar-base]   (sai 1 se achar problema)
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ARQUIVO_BASE = "scripts/ci/checar-funcoes.base.json";
/** O max_rows do PostgREST nos 2 projetos (medido na hml-14). */
export const MAX_ROWS = 1000;

export const DESCRICAO = {
  R1: "erro do banco ignorado ({ data } sem error) — const { data, error } = await …; if (error) throw error;",
  R2: "gravação com o resultado jogado fora — const { error } = await …; if (error) throw error;",
  R3: "fetch sem tempo — buscarComTempo(url, init, TEMPO_MS.<destino>) do _shared/tempo.ts",
  R4: `.limit(N) acima de ${MAX_ROWS} vira ${MAX_ROWS} calado — todasAsPaginas (funções) ou página (tela)`,
};

const FUNCOES = /^supabase[^/]*\/functions\//;
const FONTE = /\.(ts|tsx)$/;
const TESTE = /\.(test|spec)\.|_test\.(ts|tsx)$|(^|\/)(tests?|__tests__)\//;
const ESCAPE = /\/\/\s*hml-14:\s*ok\s+\S/;
// R1: o SO_DATA do front.py (`{ data } = await X.from(`), aberto a qualquer desestruturação que pega o `data` e não o `error`
const DESESTRUTURA = /\{([^{}]*)\}\s*=\s*await\s+[\w.()]+?\s*\.\s*(?:from|rpc)\(/g;
const pegaDataSemErro = (dentro) => {
  const chaves = dentro.split(",").map((p) => p.split(/[:=]/)[0].trim());
  return chaves.includes("data") && !chaves.includes("error") && !chaves.some((c) => c.startsWith("..."));
};
// R2: o gravacao_descartada.py (instrução que começa em `await X.from(`/`.rpc(`; no from, só se grava)
const SOLTA = /^[ \t]*(?:void\s+)?await\s+[\w.]+(?:\(\))?\s*\.\s*(from|rpc)\(/gm;
const GRAVA = /\.(?:insert|update|upsert|delete)\(/;
const FETCH = /\bfetch\(/g;
const LIMITE = /\.limit\(\s*(\d[\d_]*|[A-Za-z_$][\w$]*)\s*[,)]/g;
const CONSTANTE = /\b(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*(\d[\d_]*)\s*(?:as\s+const\s*)?;/g;
const numero = (s) => Number(s.replace(/_/g, ""));

/** Que regras valem para o arquivo (caminho relativo à raiz, com "/"); [] = fora. */
export function regrasDoArquivo(arquivo) {
  if (!FONTE.test(arquivo) || TESTE.test(arquivo)) return [];
  if (FUNCOES.test(arquivo)) return ["R1", "R2", "R3", "R4"];
  if (arquivo.startsWith("src/")) return ["R1", "R2", "R4"];
  return [];
}

/**
 * O texto sem comentários, com as quebras de linha no lugar (o número da linha não muda). `//` só fora de URL (o mesmo cuidado do
 * front.py); bloco `/* … *\/` só quando abre no começo da linha ou fecha na mesma linha — assim o "image/*" de uma string não
 * engole o arquivo.
 */
export function semComentarios(texto) {
  let emBloco = false;
  return texto
    .split("\n")
    .map((linha) => {
      let l = linha;
      if (emBloco) {
        const fim = l.indexOf("*/");
        if (fim === -1) return "";
        emBloco = false;
        l = " ".repeat(fim + 2) + l.slice(fim + 2);
      }
      const abre = /^(\s*\{?)\/\*/.exec(l);
      if (abre) {
        const ini = abre[1].length;
        const fim = l.indexOf("*/", ini + 2);
        if (fim === -1) {
          emBloco = true;
          return l.slice(0, ini);
        }
        l = l.slice(0, ini) + " ".repeat(fim + 2 - ini) + l.slice(fim + 2);
      }
      l = l.replace(/\/\*.*?\*\//g, (m) => " ".repeat(m.length));
      return l.replace(/(?<![:\\])\/\/.*$/, "");
    })
    .join("\n");
}

/** Posição → número da linha (1…). */
function contadorDeLinhas(texto) {
  const inicios = [0];
  for (let i = 0; i < texto.length; i++) if (texto[i] === "\n") inicios.push(i + 1);
  return (pos) => {
    let lo = 0, hi = inicios.length - 1;
    while (lo < hi) {
      const meio = (lo + hi + 1) >> 1;
      if (inicios[meio] <= pos) lo = meio;
      else hi = meio - 1;
    }
    return lo + 1;
  };
}

/** Do "(" em `ini` até o ")" que fecha (contagem simples, como o fetch_sinal.py); no máx. 3000 caracteres. */
function fimDoParentese(texto, ini) {
  let nivel = 0;
  for (let i = ini; i < texto.length && i < ini + 3000; i++) {
    if (texto[i] === "(") nivel++;
    else if (texto[i] === ")" && --nivel === 0) return i;
  }
  return Math.min(texto.length, ini + 3000);
}

/** Faixas [ini, fim] do corpo de `function buscarComTempo(…) { … }` (o fetch de dentro dele é o próprio ajudante). */
function corposDoAjudante(texto) {
  const faixas = [];
  for (const m of texto.matchAll(/function\s+buscarComTempo\s*\(/g)) {
    const abre = texto.indexOf("{", fimDoParentese(texto, m.index + m[0].length - 1));
    if (abre === -1) continue;
    let nivel = 0;
    for (let i = abre; i < texto.length; i++) {
      if (texto[i] === "{") nivel++;
      else if (texto[i] === "}" && --nivel === 0) {
        faixas.push([abre, i]);
        break;
      }
    }
  }
  return faixas;
}

/** Os achados de 1 arquivo: { arquivo, regra, linha, trecho }. `texto` = o conteúdo como está no disco. */
export function acharNoArquivo(arquivo, texto) {
  const regras = regrasDoArquivo(arquivo);
  if (!regras.length) return [];
  const cru = texto.replace(/\r\n?/g, "\n");
  const limpo = semComentarios(cru);
  const linhasCruas = cru.split("\n");
  const linhasLimpas = limpo.split("\n");
  const linhaDe = contadorDeLinhas(limpo);
  const achados = [];
  const anotar = (regra, ini, fim) => {
    const [a, b] = [linhaDe(ini), linhaDe(fim)];
    if (linhasCruas.slice(a - 1, b).some((l) => ESCAPE.test(l))) return;
    const trecho = linhasLimpas.slice(a - 1, b).join(" ").replace(/\s+/g, " ").trim();
    achados.push({ arquivo, regra, linha: a, trecho });
  };
  if (regras.includes("R1")) {
    for (const m of limpo.matchAll(DESESTRUTURA)) if (pegaDataSemErro(m[1])) anotar("R1", m.index, m.index + m[0].length - 1);
  }
  if (regras.includes("R2")) {
    for (const m of limpo.matchAll(SOLTA)) {
      const pv = limpo.indexOf(";", m.index + m[0].length);
      const instrucao = limpo.slice(m.index, pv === -1 ? m.index + m[0].length + 600 : pv);
      const verbo = GRAVA.exec(instrucao);
      if (m[1] === "from" && !verbo) continue;
      anotar("R2", m.index + m[0].search(/\S/), m[1] === "from" ? m.index + verbo.index : m.index + m[0].length - 1);
    }
  }
  if (regras.includes("R3")) {
    const ajudante = corposDoAjudante(limpo);
    for (const m of limpo.matchAll(FETCH)) {
      if (ajudante.some(([a, b]) => m.index > a && m.index < b)) continue;
      const chamada = limpo.slice(m.index, fimDoParentese(limpo, m.index + m[0].length - 1) + 1);
      if (/\bsignal\b/.test(chamada)) continue;
      anotar("R3", m.index, m.index);
    }
  }
  if (regras.includes("R4")) {
    const constantes = new Map([...limpo.matchAll(CONSTANTE)].map((c) => [c[1], numero(c[2])]));
    for (const m of limpo.matchAll(LIMITE)) {
      const n = /^\d/.test(m[1]) ? numero(m[1]) : constantes.get(m[1]);
      if (n > MAX_ROWS) anotar("R4", m.index, m.index);
    }
  }
  return achados.sort((x, y) => x.linha - y.linha || x.regra.localeCompare(y.regra));
}

const chave = (x) => `${x.arquivo}\u0000${x.regra}\u0000${x.trecho}`;

/**
 * Achados × base (as 2 como listas; o mesmo trecho pode aparecer mais de 1 vez no arquivo). `novos` = achados além do que a base
 * tem; `sumidos` = itens da base que o código já não tem.
 */
export function comparar(achados, itensDaBase) {
  const restam = new Map();
  for (const i of itensDaBase) restam.set(chave(i), (restam.get(chave(i)) ?? 0) + 1);
  const novos = [];
  for (const a of achados) {
    const n = restam.get(chave(a)) ?? 0;
    if (n > 0) restam.set(chave(a), n - 1);
    else novos.push(a);
  }
  const sumidos = [];
  for (const i of itensDaBase) {
    const n = restam.get(chave(i)) ?? 0;
    if (n > 0) {
      sumidos.push(i);
      restam.set(chave(i), n - 1);
    }
  }
  return { novos, sumidos };
}

/** arquivos = [{ arquivo, texto }] (o teste passa o texto direto; a linha de comando lê do disco). */
export function checarArquivos(arquivos, itensDaBase) {
  const achados = arquivos.flatMap(({ arquivo, texto }) => acharNoArquivo(arquivo, texto));
  return { achados, ...comparar(achados, itensDaBase) };
}

/** Os .ts/.tsx de src/ e de supabase*\/functions/ (sem node_modules), com o caminho relativo à raiz. */
export function lerArquivos(raiz) {
  const pastas = ["src", ...readdirSync(raiz).filter((d) => /^supabase[^/]*$/.test(d)).map((d) => `${d}/functions`)];
  const saida = [];
  const andar = (rel) => {
    for (const e of readdirSync(join(raiz, rel), { withFileTypes: true })) {
      const caminho = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name !== "node_modules") andar(caminho);
      } else if (e.isFile() && regrasDoArquivo(caminho).length) {
        saida.push({ arquivo: caminho, texto: readFileSync(join(raiz, caminho), "utf8") });
      }
    }
  };
  for (const p of pastas) if (existsSync(join(raiz, p))) andar(p);
  return saida.sort((a, b) => (a.arquivo < b.arquivo ? -1 : 1));
}

export function lerBase(raiz) {
  const caminho = join(raiz, ARQUIVO_BASE);
  if (!existsSync(caminho)) return [];
  return JSON.parse(readFileSync(caminho, "utf8")).itens ?? [];
}

/** A base nova a partir dos achados de hoje, mantendo o `motivo` dos itens que já estavam nela. */
export function montarBase(achados, itensAntigos = []) {
  const motivos = new Map();
  for (const i of itensAntigos) if (i.motivo) motivos.set(chave(i), [...(motivos.get(chave(i)) ?? []), i.motivo]);
  const itens = achados
    .map(({ arquivo, regra, trecho }) => ({ arquivo, regra, trecho, motivo: motivos.get(chave({ arquivo, regra, trecho }))?.shift() ?? "" }))
    .sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.regra.localeCompare(b.regra) || a.trecho.localeCompare(b.trecho));
  const linhas = itens.map((i) => `    ${JSON.stringify(i)}`);
  return `{\n  "sobre": "hml-14 (D8): dívida aceita do scripts/ci/checar-funcoes.mjs (só diminui). Gerar: node scripts/ci/checar-funcoes.mjs --gerar-base",\n  "itens": [\n${linhas.join(",\n")}\n  ]\n}\n`;
}

export function checar(raiz) {
  return checarArquivos(lerArquivos(raiz), lerBase(raiz));
}

/** O texto do problema para quem lê o log do CI. */
export function descrever({ novos, sumidos }) {
  return [
    ...novos.map((a) => `novo ${a.regra} ${a.arquivo}:${a.linha} — ${DESCRICAO[a.regra]}\n    ${a.trecho}`),
    ...sumidos.map((i) => `a base tem item que já não existe (tire de ${ARQUIVO_BASE}): ${i.regra} ${i.arquivo}\n    ${i.trecho}`),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const raiz = args.find((a) => !a.startsWith("--")) || ".";
  if (args.includes("--gerar-base")) {
    const achados = lerArquivos(raiz).flatMap(({ arquivo, texto }) => acharNoArquivo(arquivo, texto));
    writeFileSync(join(raiz, ARQUIVO_BASE), montarBase(achados, lerBase(raiz)));
    const porRegra = Object.keys(DESCRICAO).map((r) => `${r} ${achados.filter((a) => a.regra === r).length}`).join(", ");
    console.log(`checar-funcoes: base gerada com ${achados.length} item(ns) (${porRegra}) em ${ARQUIVO_BASE}`);
    process.exit(0);
  }
  const resultado = checar(raiz);
  for (const p of descrever(resultado)) console.error(`ERRO ${p}`);
  console.log(`checar-funcoes: ${resultado.achados.length} achado(s); ${resultado.novos.length} novo(s); ${resultado.sumidos.length} item(ns) da base que já não existe(m)`);
  process.exit(resultado.novos.length || resultado.sumidos.length ? 1 : 0);
}
