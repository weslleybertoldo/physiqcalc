// Physiq W-A P2 (spec §5.6) — a guarda do FRONT da W-A: nas pastas e nos arquivos da W-A (os desta parte e os que as partes P3–P6 vão criar — o
// que ainda não existe fica de fora até nascer), nenhum acesso direto ao banco: `.from(` de tabela, `.rpc(` e `.storage`. Tudo passa pelas
// funções (acessos, aluno-dia, treino-acessos). O leitor sem comentários é o da guarda de CI (scripts/ci/checar-funcoes.mjs) e o detector de
// tabela é o da hml-20 (src/nutricao/semLeituraDireta.test.ts): o `Array.from(` não conta. Os testes ficam de fora. A guarda da hml-21a
// (src/integrations/semBancoNoNavegador.test.ts, da LINUX 1) cobre o src/ inteiro; esta é a da W-A, por pasta, com as partes que vêm.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// o mesmo leitor sem comentários da guarda de CI
import { semComentarios } from "../../scripts/ci/checar-funcoes.mjs";

const RAIZ = resolve(__dirname, "../..");
/** As pastas e os arquivos do front da W-A (spec §5.3 e §6), por parte. */
export const DA_W_A: Readonly<Record<string, readonly string[]>> = {
  P2: ["src/acessos", "src/aluno-dia"],
  P3: ["src/rotinas", "src/app-aluno/inicio/CardRotinasHoje.tsx", "src/app-aluno/perfil/Rotinas.tsx", "src/ui/avisos/LembreteDasRotinas.tsx"],
  P4: ["src/painel/aluno/abas/Acessos.tsx", "src/painel/aluno/acessos"],
  P5: ["src/dieta-livre"],
  P6: ["src/painel/aluno/resumo/CardRotinas.tsx", "src/painel/aluno/rotinas", "src/painel/aluno/diaADia"],
};
/** Os arquivos da P2 (fora os testes): a guarda não passa por não achar arquivo. */
const DA_P2 = ["src/acessos/api.ts", "src/acessos/tipos.ts", "src/aluno-dia/api.ts", "src/aluno-dia/regras.ts", "src/aluno-dia/tipos.ts"];

const FROM_DE_TABELA = /(?<!\bArray)(?<!storage\s*)\.from\s*\(/g;
const QUALQUER_RPC = /\.rpc\s*(?:<[^()]*?>)?\s*\(/g;
const STORAGE = /\.storage\b/g;
const ehTeste = (f: string) => /\.(test|spec)\.(ts|tsx)$/.test(f);

/** Os .ts/.tsx (fora os testes) de uma pasta, ou o próprio arquivo; [] se ainda não existe. */
function arquivos(alvo: string): string[] {
  const abs = resolve(RAIZ, alvo);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return /\.(ts|tsx)$/.test(alvo) && !ehTeste(alvo) ? [alvo] : [];
  return (readdirSync(abs, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !ehTeste(f))
    .map((f) => relative(RAIZ, join(abs, f)).replace(/\\/g, "/"))
    .sort();
}

/** Cada acesso direto ao banco no texto sem comentários: "<linha>: from|rpc|storage". */
export function acessosDiretos(fonte: string): string[] {
  const t = semComentarios(fonte);
  const linha = (i: number) => t.slice(0, i).split("\n").length;
  return [
    ...[...t.matchAll(FROM_DE_TABELA)].map((m) => `${linha(m.index ?? 0)}: from`),
    ...[...t.matchAll(QUALQUER_RPC)].map((m) => `${linha(m.index ?? 0)}: rpc`),
    ...[...t.matchAll(STORAGE)].map((m) => `${linha(m.index ?? 0)}: storage`),
  ].sort();
}

const TODOS = [...new Set(Object.values(DA_W_A).flat().flatMap(arquivos))].sort();

describe("W-A P2: a guarda do front da W-A — só as funções, nunca o banco direto", () => {
  it("o detector acha o que procura (controle positivo) e não acha o que não é banco", () => {
    expect(acessosDiretos('const { data, error } = await principal.from("rotinas").select("*");')).toEqual(["1: from"]);
    expect(acessosDiretos('await principal.rpc("minhas_rotinas" as never);')).toEqual(["1: rpc"]);
    expect(acessosDiretos('await supabase.rpc<Json>("x", {});')).toEqual(["1: rpc"]);
    expect(acessosDiretos("await principal.storage.from(B).upload(p, f);")).toEqual(["1: storage"]);
    expect(acessosDiretos('const x = Array.from(new Set(ids));\nawait principal.functions.invoke("aluno-dia", { body });')).toEqual([]);
    expect(acessosDiretos('// await principal.from("rotinas").select()\nconst a = 1;')).toEqual([]);
  });

  it("os arquivos da P2 existem e entram na guarda", () => {
    for (const f of DA_P2) expect(TODOS, f).toContain(f);
  });

  it("nenhum .from( de tabela, .rpc( nem .storage em nenhum arquivo da W-A", () => {
    const achados = TODOS.flatMap((f) => acessosDiretos(readFileSync(resolve(RAIZ, f), "utf-8")).map((a) => `${f}:${a}`));
    expect(achados).toEqual([]);
  });

  it("as funções que os clientes da P2 chamam são só as da W-A (acessos, aluno-dia e — pelo fetch do Treino — treino-acessos)", () => {
    const fontes = TODOS.filter((f) => f.startsWith("src/acessos/") || f.startsWith("src/aluno-dia/"))
      .map((f) => readFileSync(resolve(RAIZ, f), "utf-8")).join("\n");
    expect([...new Set([...fontes.matchAll(/functions\.invoke\(\s*["'`]([a-z0-9-]+)["'`]/g)].map((m) => m[1]))].sort()).toEqual(["acessos", "aluno-dia"]);
    expect(fontes).toContain("/functions/v1/treino-acessos");
  });
});
