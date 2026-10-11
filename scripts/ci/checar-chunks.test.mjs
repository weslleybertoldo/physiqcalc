// hml-18b (H-54, F): a guarda de chunks (scripts/ci/checar-chunks.mjs). Rodar: npm run test:node (ou node --test
// scripts/ci/checar-chunks.test.mjs). Os manifests são de exemplo, no formato do dist/.vite/manifest.json do Vite; com o build feito
// (o passo "Build e chunks" do CI, ou o vite build local), o manifest de verdade também é conferido.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { analisar, PADRAO_TELA } from "./checar-chunks.mjs";

const KB = 1024;
/** Um manifest mínimo: a entrada, um pedaço comum, os pesados (chunks manuais) e as telas do registro. */
function exemplo(extras = {}) {
  return {
    "index.html": { file: "assets/index-AAAAAAAA.js", src: "index.html", isEntry: true, imports: ["_react-vendor-AAAAAAAA.js"], dynamicImports: ["src/painel/paginas/Alunos.tsx", "src/app-aluno/abas/Treino.tsx"] },
    "_react-vendor-AAAAAAAA.js": { file: "assets/react-vendor-AAAAAAAA.js", name: "react-vendor" },
    "_comum-AAAAAAAA.js": { file: "assets/comum-AAAAAAAA.js", name: "comum", imports: ["index.html"] },
    "_pdf-AAAAAAAA.js": { file: "assets/pdf-AAAAAAAA.js", name: "pdf" },
    "_pdf-BBBBBBBB.js": { file: "assets/pdf-BBBBBBBB.js", name: "pdf", dynamicImports: ["src/lib/generateAdminPDF.ts"] },
    "_powersync-AAAAAAAA.js": { file: "assets/powersync-AAAAAAAA.js", name: "powersync" },
    "_charts-AAAAAAAA.js": { file: "assets/charts-AAAAAAAA.js", name: "charts" },
    "src/lib/generateAdminPDF.ts": { file: "assets/generateAdminPDF-AAAAAAAA.js", src: "src/lib/generateAdminPDF.ts", isDynamicEntry: true, imports: ["_pdf-AAAAAAAA.js"] },
    "src/painel/paginas/Alunos.tsx": { file: "assets/Alunos-AAAAAAAA.js", src: "src/painel/paginas/Alunos.tsx", isDynamicEntry: true, imports: ["_comum-AAAAAAAA.js", "_pdf-BBBBBBBB.js"], dynamicImports: ["src/lib/generateAdminPDF.ts"] },
    "src/app-aluno/abas/Treino.tsx": { file: "assets/Treino-AAAAAAAA.js", src: "src/app-aluno/abas/Treino.tsx", isDynamicEntry: true, imports: ["index.html", "_powersync-AAAAAAAA.js"] },
    ...extras,
  };
}
/** Os tamanhos: os pesados de verdade (centenas de KB) e o resto pequeno — o pdf-BBBBBBBB é o módulo pequeno chamado "pdf" (3 KB). */
const TAMANHOS = { "assets/pdf-AAAAAAAA.js": 650 * KB, "assets/powersync-AAAAAAAA.js": 280 * KB, "assets/charts-AAAAAAAA.js": 390 * KB, "assets/pdf-BBBBBBBB.js": 3 * KB };
const tamanho = (f) => TAMANHOS[f] ?? 20 * KB;

test("o build de hoje (depois da 18b) passa: o pdf só por import() na ação, o 'pdf' pequeno não conta, o powersync só no app do aluno", () => {
  const r = analisar(exemplo(), tamanho);
  assert.deepEqual(r.problemas, []);
  assert.deepEqual(r.telas.map((t) => t.tela), ["index.html", "src/app-aluno/abas/Treino.tsx", "src/painel/paginas/Alunos.tsx"]);
  assert.deepEqual(r.telas.find((t) => t.tela === "src/app-aluno/abas/Treino.tsx").pesados, ["powersync"]);
  assert.deepEqual(r.telas.find((t) => t.tela === "src/painel/paginas/Alunos.tsx").pesados, []);
});

test("o pdf ESTÁTICO numa tela (por um pedaço comum) é pego", () => {
  const m = exemplo({ "_comum-AAAAAAAA.js": { file: "assets/comum-AAAAAAAA.js", name: "comum", imports: ["index.html", "_pdf-AAAAAAAA.js"] } });
  assert.deepEqual(analisar(m, tamanho).problemas, [{ tela: "src/painel/paginas/Alunos.tsx", pedaco: "pdf" }]);
});

test("o powersync na ENTRADA (toda página) é pego — e numa página do painel também", () => {
  const m = exemplo({ "index.html": { ...exemplo()["index.html"], imports: ["_react-vendor-AAAAAAAA.js", "_powersync-AAAAAAAA.js"] } });
  const problemas = analisar(m, tamanho).problemas.map((p) => `${p.tela}>${p.pedaco}`);
  assert.ok(problemas.includes("index.html>powersync"));
  assert.ok(problemas.includes("src/painel/paginas/Alunos.tsx>powersync")); // o Alunos importa o comum, que importa a entrada
  assert.ok(!problemas.includes("src/app-aluno/abas/Treino.tsx>powersync")); // no app do aluno é o lugar dele
});

test("o charts fora da lista fechada (gráfico na 1ª dobra) é pego; xlsx, motor e heic2any também", () => {
  for (const nome of ["charts", "xlsx", "motor", "heic2any"]) {
    const m = exemplo({
      [`_${nome}-CCCCCCCC.js`]: { file: `assets/${nome}-CCCCCCCC.js`, name: nome },
      "src/painel/paginas/Alunos.tsx": { ...exemplo()["src/painel/paginas/Alunos.tsx"], imports: ["_comum-AAAAAAAA.js", `_${nome}-CCCCCCCC.js`] },
    });
    const grande = (f) => (f === `assets/${nome}-CCCCCCCC.js` ? 300 * KB : tamanho(f));
    assert.deepEqual(analisar(m, grande).problemas, [{ tela: "src/painel/paginas/Alunos.tsx", pedaco: nome }], nome);
  }
});

test("tela = as pastas do registro + os layouts sob demanda; um módulo de PDF carregado na ação não é tela", () => {
  for (const t of ["src/painel/paginas/Alunos.tsx", "src/app-aluno/inicio/CardPeso.tsx", "src/painel/aluno/abas/Dieta.tsx", "src/publico/Privacidade.tsx",
    "src/master/paginas/Contas.tsx", "src/painel/RotasPainel.tsx", "src/entrada/onboarding/CriarConta.tsx", "src/ui/avisos/AvisoMudanca.tsx"]) {
    assert.ok(PADRAO_TELA.test(t), t);
  }
  for (const t of ["src/lib/generateAdminPDF.ts", "src/nutricao/prontuario/secoes/Gestacional.tsx", "src/painel/aluno/abas/pecas/X.tsx"]) {
    assert.ok(!PADRAO_TELA.test(t), t);
  }
});

const MANIFEST = new URL("../../dist/.vite/manifest.json", import.meta.url);
test("o manifest de verdade (se o build já rodou) passa", { skip: !existsSync(MANIFEST) && "sem o dist/ (o passo 'Build e chunks' do CI confere)" }, () => {
  const dist = new URL("../../dist/", import.meta.url);
  const r = analisar(JSON.parse(readFileSync(MANIFEST, "utf8")), (f) => statSync(new URL(f, dist)).size);
  assert.deepEqual(r.problemas, []);
  assert.ok(r.telas.length > 50, `${r.telas.length} telas`);
});
