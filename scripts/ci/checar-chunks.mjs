#!/usr/bin/env node
// hml-18b (H-54, F — §2.6 item 5 da spec): a GUARDA DE CHUNKS. Depois do `vite build` (com `build.manifest: true` no vite.config.ts),
// nenhuma tela do registro (src/rotas/registro.ts) nem a entrada (index.html) pode trazer no fecho ESTÁTICO (os `imports` do manifest,
// não os `dynamicImports`) um pedaço pesado que só deve chegar na ação: pdf (jsPDF + autotable + html2canvas), xlsx, motor (three.js),
// heic2any e powersync (o banco local do app do aluno, que vem por import() no AppAlunoLayout — permitido só nas telas do app do aluno,
// que montam DENTRO do provedor). O `charts` (recharts) só nas telas que desenham gráfico na 1ª dobra — a lista fechada
// CHARTS_NA_1A_DOBRA (hoje vazia: o gráfico da Gestacional e o do Acompanhamento estão em seções que carregam sob demanda). Antes da 18b,
// 22 aberturas do painel baixavam o pdf só por abrir, e TODA página (inclusive as públicas) baixava o powersync.
//
// Pedaço pesado = o NOME do chunk manual (vite.config.ts, manualChunks; o motor e o heic2any vêm do import()) E pelo menos 50 KB: há
// módulos do app com o mesmo nome (ex.: o src/painel/aluno/dados/pdf.ts, 3 KB, que já faz o import() do gerador).
// Tela = o arquivo de uma pasta do registro (as mesmas do import.meta.glob) + os layouts que carregam sob demanda (RotasPainel,
// RotasMaster) + o cabeçalho e os editores do aluno + a entrada.
// Exceção só para o que a guarda acusar de verdade, com o motivo: EXCECOES (hoje nenhuma).
// Saída: o relatório por tela (o "f_chunks" da spec, §5): KB do fecho estático e os pesados; sai 1 se alguma tela quebrar a regra.
// Uso: node scripts/ci/checar-chunks.mjs [pasta do build = dist]   (no CI: o passo "Build e chunks" do .github/workflows/ci-pr.yml)
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Nunca no fecho estático de uma tela (só por import() na ação). */
export const PESADOS = ["pdf", "xlsx", "motor", "heic2any", "powersync"];
/**
 * O banco local (PowerSync) só nas telas do APP DO ALUNO: elas montam DENTRO do provedor que o AppAlunoLayout carrega por import() (as
 * abas Treino e Início e os itens do Perfil usam os hooks dele). Na entrada, nas públicas, no painel e no master, nunca.
 */
export const POWERSYNC_SO_NO_APP = /^src\/app-aluno\//;
/** O gráfico: só nas telas que desenham na 1ª dobra (lista fechada). */
export const GRAFICO = "charts";
export const CHARTS_NA_1A_DOBRA = new Set([]);
/** Abaixo disto não é a lib pesada (é um módulo do app com o mesmo nome). */
export const TAMANHO_MINIMO = 50 * 1024;
/** { tela, pedaco, motivo } — só para o que a guarda acusar de verdade. */
export const EXCECOES = [];

/** As telas do registro (as pastas do import.meta.glob de src/rotas/registro.ts) e os layouts/peças que carregam sob demanda. */
export const PADRAO_TELA = new RegExp(
  "^src/(" +
    [
      "entrada/[^/]+\\.tsx",
      "entrada/onboarding/[^/]+\\.tsx",
      "ui/avisos/[^/]+\\.tsx",
      "app-aluno/(abas|perfil|inicio|avisos|gates)/[^/]+\\.tsx",
      "painel/(paginas|configuracoes|gates)/[^/]+\\.tsx",
      "painel/aluno/(abas|resumo|kpis)/[^/]+\\.tsx",
      "painel/aluno/(Cabecalho|Editores)\\.tsx",
      "painel/RotasPainel\\.tsx",
      "master/paginas/[^/]+\\.tsx",
      "master/RotasMaster\\.tsx",
      "publico/.+\\.tsx",
    ].join("|") +
    ")$",
);

/** O nome do pedaço: o `name` do manifest (chunk manual) ou o arquivo sem o hash. */
export const nomeDoPedaco = (item) => item.name || item.file.split("/").pop().replace(/-[A-Za-z0-9_-]{8}\.m?js$/, "");

/**
 * Analisa o manifest. `tamanho(arquivo)` devolve os bytes de um arquivo do build. Devolve as telas (com o fecho estático em KB e os
 * pesados) e os problemas.
 */
export function analisar(manifest, tamanho) {
  const chaves = Object.keys(manifest);
  const telas = chaves.filter((k) => manifest[k].isEntry || (manifest[k].isDynamicEntry && PADRAO_TELA.test(manifest[k].src || "")));
  const fecho = (k, vistos = new Set()) => {
    if (vistos.has(k) || !manifest[k]) return vistos;
    vistos.add(k);
    for (const i of manifest[k].imports || []) fecho(i, vistos);
    return vistos;
  };
  const resultado = [];
  const problemas = [];
  const excecoesUsadas = new Set();
  for (const k of telas.sort()) {
    const item = manifest[k];
    const tela = item.src || k;
    const estatico = [...fecho(k)];
    const bytes = estatico.reduce((s, x) => s + tamanho(manifest[x].file), 0);
    const pesados = [...new Set(estatico.filter((x) => [...PESADOS, GRAFICO].includes(nomeDoPedaco(manifest[x])) && tamanho(manifest[x].file) >= TAMANHO_MINIMO).map((x) => nomeDoPedaco(manifest[x])))].sort();
    resultado.push({ tela, kb: Math.round(bytes / 1024), pesados });
    for (const p of pesados) {
      const permitido = p === GRAFICO ? CHARTS_NA_1A_DOBRA.has(tela) : p === "powersync" ? POWERSYNC_SO_NO_APP.test(tela) : false;
      const excecao = EXCECOES.find((e) => e.tela === tela && e.pedaco === p);
      if (excecao) excecoesUsadas.add(excecao);
      if (!permitido && !excecao) problemas.push({ tela, pedaco: p });
    }
  }
  const sobrando = EXCECOES.filter((e) => !excecoesUsadas.has(e));
  return { telas: resultado, problemas, excecoesSemUso: sobrando };
}

function main() {
  const dist = process.argv[2] || "dist";
  const arquivo = join(dist, ".vite", "manifest.json");
  if (!existsSync(arquivo)) {
    console.error(`sem ${arquivo}: rode o vite build (o vite.config.ts liga o build.manifest)`);
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(arquivo, "utf8"));
  const { telas, problemas, excecoesSemUso } = analisar(manifest, (f) => statSync(join(dist, f)).size);
  console.log(`# guarda de chunks (hml-18b) · ${telas.length} telas · fecho estático (KB minificado) e os pesados`);
  for (const t of telas) console.log(`${String(t.kb).padStart(6)} KB  ${t.tela}${t.pesados.length ? "  ← " + t.pesados.join(", ") : ""}`);
  for (const e of excecoesSemUso) console.log(`aviso: a exceção ${e.tela} › ${e.pedaco} não é mais usada — tire da lista (${e.motivo})`);
  if (problemas.length) {
    console.error(`\n✖ ${problemas.length} tela(s) com pedaço pesado no fecho estático (use import() na ação — o molde do src/lib/sobDemanda.ts):`);
    for (const p of problemas) console.error(`  ${p.tela} → ${p.pedaco}`);
    process.exit(1);
  }
  console.log(`\n✔ nenhuma tela com ${PESADOS.join(", ")} no fecho estático (o powersync só no app do aluno); ${GRAFICO} só em ${CHARTS_NA_1A_DOBRA.size} tela(s) da lista fechada`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main();
