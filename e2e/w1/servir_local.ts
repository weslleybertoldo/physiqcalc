// e2e/w1/servir_local.ts — Physiq W1: sobe UMA função do principal no Deno local (só para o e2e/w1/api.py --local), trocando a porta do
// Deno.serve antes de importar a função. As chaves vêm do ambiente do processo (o api.py põe; nada é impresso).
// Uso: DENO_NO_PACKAGE_JSON=1 ~/.deno/bin/deno run --allow-net --allow-env --allow-read e2e/w1/servir_local.ts <index.ts> <porta>
const [arquivo, porta] = Deno.args;
if (!arquivo || !/^\d{4,5}$/.test(porta ?? "")) throw new Error("uso: servir_local.ts <caminho do index.ts> <porta>");
const original = Deno.serve.bind(Deno) as unknown as (o: { port: number; hostname: string }, h: unknown) => unknown;
(Deno as unknown as { serve: (h: unknown) => unknown }).serve = (h: unknown) => original({ port: Number(porta), hostname: "127.0.0.1" }, h);
await import(new URL(arquivo, `file://${Deno.cwd()}/`).href);
