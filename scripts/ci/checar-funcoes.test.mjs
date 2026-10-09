// hml-14 (D8): testes do scripts/ci/checar-funcoes.mjs — cada regra pega o caso ruim e deixa passar o bom, o escape cala, a base só
// diminui — e a checagem do repo de verdade contra a base. Rodar: npm run test:node (ou node --test scripts/ci/checar-funcoes.test.mjs)
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { acharNoArquivo, ARQUIVO_BASE, checar, checarArquivos, descrever, montarBase } from "./checar-funcoes.mjs";

const F = "supabase/functions/x/index.ts";
const S = "src/painel/x/dados.ts";
/** Os achados de um texto, como [regra, linha, trecho]. */
const achar = (arquivo, texto) => acharNoArquivo(arquivo, texto).map((a) => [a.regra, a.linha, a.trecho]);

test("R1: { data… } sem error acusa (from e rpc, inteiro e em várias linhas, com count); com error ou o resto (...r) passa", () => {
  const texto = [
    'const { data } = await admin.from("physiq_profiles").select("id");',
    "const { data: perfil } = await db",
    '  .rpc("aluno_treino", { p: 1 });',
    'const { data, error } = await admin.from("t").select("*");',
    'const { error } = await admin.from("t").delete().eq("id", 1);',
    'const { data: x, error: e2 } = await db.rpc("y");',
    'let { data: linhas = [], count } = await db.from("t").select("*", { count: "exact" });',
    'const { data: d, ...resto } = await db.from("t").select("*");',
    'const { count } = await db.from("t").select("*", { count: "exact", head: true });',
  ].join("\n");
  assert.deepEqual(achar(F, texto), [
    ["R1", 1, 'const { data } = await admin.from("physiq_profiles").select("id");'],
    ["R1", 2, "const { data: perfil } = await db .rpc(\"aluno_treino\", { p: 1 });"],
    ["R1", 7, 'let { data: linhas = [], count } = await db.from("t").select("*", { count: "exact" });'],
  ]);
  assert.equal(achar(S, texto).length, 3, "no src/ também");
});

test("R2: gravação solta acusa (insert, update, upsert, delete e rpc); resultado guardado, select e Storage passam", () => {
  const texto = [
    'await admin.from("t").update({ a: 1 }).eq("id", 1);',
    "  await db",
    '    .from("t")',
    "    .delete()",
    '    .eq("id", 1);',
    'await supabase.rpc("marcar_aviso_mudanca", { p: 1 });',
    'void await admin.from("t").upsert({ id: 1 });',
    'const { error } = await admin.from("t").insert({ a: 1 });',
    'await admin.from("t").select("*");',
    'await admin.storage.from("fotos").remove(["a.jpg"]);',
  ].join("\n");
  assert.deepEqual(achar(F, texto), [
    ["R2", 1, 'await admin.from("t").update({ a: 1 }).eq("id", 1);'],
    ["R2", 2, 'await db .from("t") .delete()'],
    ["R2", 6, 'await supabase.rpc("marcar_aviso_mudanca", { p: 1 });'],
    ["R2", 7, 'void await admin.from("t").upsert({ id: 1 });'],
  ]);
});

test("R3: fetch sem signal acusa só nas funções; com signal, o buscarComTempo e o fetch de dentro do próprio ajudante passam", () => {
  const texto = [
    'const r = await fetch(`${MP_API}${caminho}`, { method: "POST", body });',
    "const g = await fetch(url, {",
    '  method: "POST",',
    "  signal: AbortSignal.timeout(TEMPO_MS.google),",
    "});",
    "const v = await buscarComTempo(url, { method: \"POST\" }, Math.min(TEMPO_MS.gotrueTreino, p.restante()));",
    "export function buscarComTempo(entrada, init, ms, base = fetch) {",
    "  return fetch(entrada, { ...init });",
    "}",
  ].join("\n");
  assert.deepEqual(achar(F, texto), [["R3", 1, 'const r = await fetch(`${MP_API}${caminho}`, { method: "POST", body });']]);
  assert.deepEqual(achar("supabase-principal/functions/_shared/x.ts", texto).map((a) => a[0]), ["R3"], "nas funções do principal também");
  assert.deepEqual(achar(S, texto), [], "o front não entra no R3 (lá o tempo é o criarFetchResiliente)");
});

test("R4: .limit(N) acima de 1000 acusa (escrito ou const do arquivo) nas funções e no src/; 1000, outra variável e comentário passam", () => {
  const texto = [
    'q.from("t").select("id").limit(2000);',
    '  .order("nome").limit(5_000),',
    'q.from("t").select("id").limit(1000);',
    "q.limit(LIMITE_FILA);",
    "// o .limit(5000) de antes virava 1000",
    "/**",
    " * o `.limit(3000)` também",
    " */",
    "const LIMITE_PERIODO = 2000;",
    "export const LIMITE_JANELA: number = 1_000;",
    'q.order("data").limit(LIMITE_PERIODO);',
    "q.limit(LIMITE_JANELA).range(0, 9);",
    "q.limit(limite);",
  ].join("\n");
  const esperado = [
    ["R4", 1, 'q.from("t").select("id").limit(2000);'],
    ["R4", 2, '.order("nome").limit(5_000),'],
    ["R4", 11, 'q.order("data").limit(LIMITE_PERIODO);'],
  ];
  assert.deepEqual(achar(F, texto), esperado);
  assert.deepEqual(achar(S, texto), esperado);
});

test("fora: testes, Deno test, pastas de teste e o que não é src/ nem função", () => {
  const ruim = 'const { data } = await admin.from("t").select("*");\nawait admin.from("t").delete().eq("id", 1);';
  for (const arquivo of ["src/a.test.ts", "src/b.spec.tsx", "supabase/functions/x/index_test.ts", "src/test/setup.ts", "scripts/ci/x.ts", "e2e/w1/x.ts", "supabase/migrations/x.ts", "src/a.js"]) {
    assert.deepEqual(achar(arquivo, ruim), [], arquivo);
  }
  assert.equal(achar("src/a.tsx", ruim).length, 2);
});

test("comentários não contam; o \"image/*\" de uma string não engole o resto do arquivo", () => {
  const texto = [
    '// const { data } = await admin.from("t").select("*");',
    "/*",
    'await admin.from("t").delete().eq("id", 1);',
    "*/",
    'const aceita = "image/*";',
    'const { data } = await admin.from("t").select("*"); /* e um comentário no fim */',
    'const url = "https://x.supabase.co/functions/v1/a"; const { data: b } = await db.rpc("c");',
  ].join("\n");
  assert.deepEqual(achar(F, texto), [
    ["R1", 6, 'const { data } = await admin.from("t").select("*");'],
    ["R1", 7, 'const url = "https://x.supabase.co/functions/v1/a"; const { data: b } = await db.rpc("c");'],
  ]);
});

test("escape `// hml-14: ok <motivo>` numa das linhas do achado cala; sem motivo, não", () => {
  const texto = [
    'const { data } = await admin.from("t").select("*"); // hml-14: ok falha fechada: sem linha, nega',
    "await db",
    '  .from("t") // hml-14: ok melhor esforço: o visto_em só ajuda a limpeza',
    '  .update({ visto_em: "agora" });',
    "const r = await fetch(url, init); // hml-14: ok o signal vem no init",
    'const { data: x } = await admin.from("t").select("*"); // hml-14: ok',
  ].join("\n");
  assert.deepEqual(achar(F, texto), [["R1", 6, 'const { data: x } = await admin.from("t").select("*");']]);
});

test("a base: o que está nela passa; o novo falha; o item que já não existe falha (a base só diminui); a linha andar não muda nada", () => {
  const ruim = 'const { data } = await admin.from("t").select("*");';
  const item = { arquivo: F, regra: "R1", trecho: ruim, motivo: "falha fechada" };
  const ok = checarArquivos([{ arquivo: F, texto: `${ruim}\n` }], [item]);
  assert.deepEqual([ok.novos, ok.sumidos], [[], []]);

  const andou = checarArquivos([{ arquivo: F, texto: `// cabeçalho novo\n\nfunction a() {}\n${ruim}\n` }], [item]);
  assert.deepEqual([andou.novos, andou.sumidos], [[], []], "sem número de linha na base");

  const outro = checarArquivos([{ arquivo: F, texto: `${ruim}\n${ruim}\nawait admin.from("t").delete().eq("id", 1);\n` }], [item]);
  assert.deepEqual(outro.novos.map((a) => [a.regra, a.linha]), [["R1", 2], ["R2", 3]], "o 2º igual e o R2 são novos");
  assert.match(descrever(outro).join("\n"), /novo R1 supabase\/functions\/x\/index\.ts:2[\s\S]*novo R2 supabase\/functions\/x\/index\.ts:3/);

  const corrigido = checarArquivos([{ arquivo: F, texto: 'const { data, error } = await admin.from("t").select("*");\n' }], [item]);
  assert.deepEqual([corrigido.novos, corrigido.sumidos], [[], [item]]);
  assert.match(descrever(corrigido)[0], new RegExp(`a base tem item que já não existe \\(tire de ${ARQUIVO_BASE.replace(/\./g, "\\.")}\\)`));

  const noOutroArquivo = checarArquivos([{ arquivo: "supabase/functions/y/index.ts", texto: `${ruim}\n` }], [item]);
  assert.equal(noOutroArquivo.novos.length, 1, "a base vale por arquivo");
  assert.equal(noOutroArquivo.sumidos.length, 1);
});

test("montarBase: 1 item por linha, em ordem, mantendo o motivo de quem continua; o JSON volta igual na checagem", () => {
  const texto = 'await db.rpc("b");\nconst { data } = await admin.from("t").select("*");\nconst { data } = await admin.from("t").select("*");\n';
  const { achados } = checarArquivos([{ arquivo: F, texto }], []);
  const antigo = [{ arquivo: F, regra: "R1", trecho: 'const { data } = await admin.from("t").select("*");', motivo: "falha fechada" }];
  const json = montarBase(achados, antigo);
  const { itens, sobre } = JSON.parse(json);
  assert.match(sobre, /--gerar-base/);
  assert.deepEqual(itens.map((i) => [i.regra, i.motivo]), [["R1", "falha fechada"], ["R1", ""], ["R2", ""]]);
  assert.equal(json.split("\n").filter((l) => l.trim().startsWith('{"arquivo"')).length, 3);
  const deNovo = checarArquivos([{ arquivo: F, texto }], itens);
  assert.deepEqual([deNovo.novos, deNovo.sumidos], [[], []]);
});

test("o repo de verdade: nada novo e nada sobrando na base", () => {
  const raiz = fileURLToPath(new URL("../..", import.meta.url));
  const resultado = checar(raiz);
  assert.ok(resultado.achados.length > 0, "a leitura dos arquivos achou alguma coisa (o padrão de busca ainda pega o código)");
  const problemas = descrever(resultado);
  assert.deepEqual(problemas, [], `\n${problemas.join("\n")}\n\nCorrija; ou, se é de propósito, ponha "// hml-14: ok <motivo>" na linha; ou (dívida aceita, no PR) gere a base de novo: node scripts/ci/checar-funcoes.mjs --gerar-base\n`);
});
