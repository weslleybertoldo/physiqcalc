#!/usr/bin/env node
// hml-13 (H-31 + o ⚪ da hml-01): roda no check "checar-pr" de todo PR (.github/workflows/ci-pr.yml).
// Pega função SECURITY DEFINER "aberta" em migration NOVA dos 2 bancos, sem dependência nenhuma.
//
// Por quê: os default privileges do Supabase dão EXECUTE a PUBLIC, anon e authenticated em toda função NOVA. Definer nova sem
// "revoke ... from public, anon" fica chamável pelo visitante (docs/banco-permissoes.md). CREATE OR REPLACE de uma função que já
// existe (mesmo nome e mesma quantidade de argumentos) NÃO mexe nos grants — por isso o checador separa "nova" de "troca".
//
// Regras (só nos arquivos com nome > ANCORA; os anteriores são conferidos no banco vivo por e2e/hml01/banco.py):
//   R1  toda SECURITY DEFINER (nova ou troca, inclusive de gatilho) tem SET search_path;
//   R2  definer NOVA (não gatilho) tem, no MESMO arquivo, revoke ... on function <nome> ... from ... public;
//   R3  definer NOVA (não gatilho) tem revoke ... from ... anon — salvo se está em ANONIMAS_DE_PROPOSITO;
//   R3b definer NOVA (não gatilho) diz o que faz com o logado: revoke ... from authenticated (só o servidor) OU
//       grant execute ... to authenticated (o app chama; a função confere quem chama) — os 2 jeitos de docs/banco-permissoes.md;
//   R4  grant ... on function <nome> ... to anon/public numa DEFINER só para as de ANONIMAS_DE_PROPOSITO;
//   R5  alter function <nome> ... security definer conta como definer NOVA (R1–R3).
// Limite conhecido: lê o nome escrito por extenso. Revoke em laço com o nome numa variável (format('%s', ...)) não conta.
// Uso: node scripts/ci/checar-definer.mjs [raiz]   (sai 1 se achar problema)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const ANCORA = "20261007195959"; // da hml-01 em diante (07/10/2026 20h): as migrations escritas sob docs/banco-permissoes.md
export const PASTAS = ["supabase-principal/migrations", "supabase/migrations"];
// Definer que o VISITANTE chama de propósito (levantado no código em 08/10/2026). Entrar aqui = decisão escrita no PR.
export const ANONIMAS_DE_PROPOSITO = new Set([
  // as 9 RPCs públicas do link (infra/cloudflare/physiq-principal-api/worker.js RPCS_COM_LIMITE, hml-05c)
  "diario_link", "diario_listar", "diario_enviar", "diario_paciente",
  "preconsulta_formulario", "preconsulta_responder",
  "cadastro_link_info", "cadastro_publico_info", "cadastro_publico_enviar",
  // policy de INSERT do Storage do diário (o visitante sobe a foto): supabase-principal/migrations/20260920040000_diario.sql:221
  "diario_pasta_valida",
  // usada nas policies; devolve false para o visitante (aberta desde a base, mantida pela hml-01)
  "eh_master",
]);

const NOME = String.raw`(?:(?:\{schema\}|%i|"?[a-z_][a-z0-9_]*"?)\s*\.\s*)?"?([a-z_][a-z0-9_]*)"?\s*\(`;

export function limpar(sql) {
  return sql.toLowerCase().replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

// quantidade de argumentos a partir do "(" em `ini`; devolve [n, posição depois do ")"]
function contarArgs(txt, ini) {
  let nivel = 0, virgulas = 0, vazio = true;
  for (let i = ini; i < txt.length; i++) {
    const c = txt[i];
    if (c === "(") nivel++;
    else if (c === ")") { nivel--; if (nivel === 0) return [vazio ? 0 : virgulas + 1, i + 1]; }
    else if (c === "," && nivel === 1) virgulas++;
    else if (nivel >= 1 && !/\s/.test(c)) vazio = false;
  }
  return [0, txt.length];
}

function papeis(trecho) {
  return new Set(["public", "anon", "authenticated", "service_role"].filter((p) => new RegExp(`\\b${p}\\b`).test(trecho)));
}

// nomes (com nº de args) citados numa lista "f(a, b), g()" de revoke/grant/drop
function nomesDaLista(lista) {
  const re = new RegExp(NOME, "g");
  const saida = [];
  let m;
  while ((m = re.exec(lista))) {
    const [n, fim] = contarArgs(lista, m.index + m[0].length - 1);
    saida.push({ nome: m[1], n });
    re.lastIndex = fim;
  }
  return saida;
}

export function eventos(sqlBruto) {
  const sql = limpar(sqlBruto);
  const ev = [];
  const reCreate = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+` + NOME, "g");
  let m;
  while ((m = reCreate.exec(sql))) {
    const [n, fimArgs] = contarArgs(sql, m.index + m[0].length - 1);
    const resto = sql.slice(fimArgs);
    const corpo = /\bas\s+(\$[a-z0-9_]*\$)/.exec(resto);
    let meta = resto.slice(0, 600);
    if (corpo) {
      const fimCorpo = resto.indexOf(corpo[1], corpo.index + corpo[0].length);
      const depois = fimCorpo >= 0 ? fimCorpo + corpo[1].length : corpo.index + corpo[0].length;
      const pv = resto.indexOf(";", depois);
      meta = resto.slice(0, corpo.index) + " " + resto.slice(depois, pv >= 0 ? pv : depois + 300);
    }
    ev.push({
      tipo: "create", pos: m.index, nome: m[1], n,
      definer: /security\s+definer/.test(meta), searchPath: /set\s+search_path/.test(meta),
      gatilho: /returns\s+trigger/.test(resto.slice(0, corpo ? corpo.index : 300)),
    });
  }
  const reAlter = new RegExp(String.raw`alter\s+function\s+` + NOME, "g");
  while ((m = reAlter.exec(sql))) {
    const [n, fim] = contarArgs(sql, m.index + m[0].length - 1);
    const pv = sql.indexOf(";", fim);
    const meta = sql.slice(fim, pv >= 0 ? pv : fim + 300);
    if (/security\s+definer/.test(meta)) {
      ev.push({ tipo: "create", alter: true, pos: m.index, nome: m[1], n, definer: true, searchPath: /search_path/.test(meta), gatilho: false });
    }
  }
  const reDrop = /drop\s+function\s+(?:if\s+exists\s+)?([\s\S]*?)(?:;|'\s*[,)])/g;
  while ((m = reDrop.exec(sql))) {
    const lista = nomesDaLista(m[1]);
    const semParen = lista.length ? [] : [...m[1].matchAll(/(?:[a-z_{}%]+\.)?([a-z_][a-z0-9_]*)/g)].map((x) => ({ nome: x[1], n: null }));
    for (const f of [...lista, ...semParen]) ev.push({ tipo: "drop", pos: m.index, ...f });
  }
  const rePriv = /(revoke|grant)\s+(?:all|execute)(?:\s+privileges)?\s+on\s+function\s+([\s\S]*?)\s+(from|to)\s+([\s\S]*?)(?:;|'\s*[,)])/g;
  while ((m = rePriv.exec(sql))) {
    for (const f of nomesDaLista(m[2])) ev.push({ tipo: m[1], pos: m.index, nome: f.nome, n: f.n, papeis: papeis(m[4]) });
  }
  return ev.sort((a, b) => a.pos - b.pos);
}

// pastas = { "<pasta>": [{ arquivo, sql }, ...] } (os testes passam o SQL direto; a linha de comando lê do disco)
export function checarPastas(pastas, ancora = ANCORA) {
  const problemas = [];
  let checadas = 0;
  for (const [pasta, lista] of Object.entries(pastas)) {
    const conhecidas = new Set(); // "nome/n" de toda função criada antes (em qualquer schema)
    const definers = new Set(); // nomes que já foram SECURITY DEFINER
    for (const { arquivo: arq, sql } of [...lista].sort((a, b) => (a.arquivo < b.arquivo ? -1 : 1))) {
      const ev = eventos(sql);
      const nova = arq > ancora;
      const revogado = (nome, papel) => ev.some((e) => e.tipo === "revoke" && e.nome === nome && e.papeis.has(papel));
      const concedido = (nome, papel) => ev.some((e) => e.tipo === "grant" && e.nome === nome && e.papeis.has(papel));
      const definerAqui = new Set(ev.filter((e) => e.tipo === "create" && e.definer).map((e) => e.nome));
      for (const e of ev) {
        const chave = `${e.nome}/${e.n}`;
        if (e.tipo === "drop") {
          for (const k of [...conhecidas]) if (k === chave || (e.n === null && k.startsWith(`${e.nome}/`))) conhecidas.delete(k);
          continue;
        }
        if (e.tipo === "grant" && nova && (definers.has(e.nome) || definerAqui.has(e.nome)) && !ANONIMAS_DE_PROPOSITO.has(e.nome)
            && (e.papeis.has("anon") || e.papeis.has("public"))) {
          problemas.push(`${pasta}/${arq}: ${e.nome} — grant a anon/public (R4); se é de propósito, entra em ANONIMAS_DE_PROPOSITO`);
        }
        if (e.tipo !== "create") continue;
        const ehNova = e.alter || !conhecidas.has(chave);
        conhecidas.add(chave);
        if (e.definer) definers.add(e.nome);
        if (!nova || !e.definer) continue;
        checadas++;
        if (!e.searchPath) problemas.push(`${pasta}/${arq}: ${e.nome} — SECURITY DEFINER sem SET search_path (R1)`);
        if (!ehNova || e.gatilho) continue;
        if (!revogado(e.nome, "public")) problemas.push(`${pasta}/${arq}: ${e.nome} — definer nova sem "revoke ... from public" (R2)`);
        if (!ANONIMAS_DE_PROPOSITO.has(e.nome) && !revogado(e.nome, "anon")) {
          problemas.push(`${pasta}/${arq}: ${e.nome} — definer nova sem "revoke ... from anon" (R3)`);
        }
        if (!revogado(e.nome, "authenticated") && !concedido(e.nome, "authenticated")) {
          problemas.push(`${pasta}/${arq}: ${e.nome} — definer nova sem a escolha do logado: "revoke ... from authenticated" (só servidor) ou "grant execute ... to authenticated" (app) (R3b)`);
        }
      }
    }
  }
  return { problemas, checadas };
}

export function checar(raiz, ancora = ANCORA) {
  const pastas = {};
  for (const pasta of PASTAS) {
    pastas[pasta] = readdirSync(join(raiz, pasta)).filter((f) => f.endsWith(".sql"))
      .map((arquivo) => ({ arquivo, sql: readFileSync(join(raiz, pasta, arquivo), "utf8") }));
  }
  return checarPastas(pastas, ancora);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raiz = process.argv[2] || ".";
  const ancora = process.env.ANCORA_DEFINER || ANCORA;
  const { problemas, checadas } = checar(raiz, ancora);
  for (const p of problemas) console.error(`ERRO ${p}`);
  console.log(`checar-definer: âncora ${ancora}; ${checadas} definições SECURITY DEFINER checadas; ${problemas.length} problema(s)`);
  process.exit(problemas.length ? 1 : 0);
}
