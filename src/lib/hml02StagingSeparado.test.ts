import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Homologação hml-02 — travas de fonte (as Edge Functions rodam no Deno; aqui só se confere o código delas).
const raiz = resolve(__dirname, "../..");
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf-8");

describe("hml-02 (H-13): convite e código de matrícula sem curinga do ILIKE", () => {
  it.each([
    "supabase/functions/vincular-professor/index.ts",
    "supabase/functions/master-professores/index.ts",
    "supabase-principal/functions/pos-login/index.ts",
  ])("%s compara e-mail e código com igualdade", (arquivo) => {
    const fonte = ler(arquivo);
    expect(fonte).not.toMatch(/\.ilike\(\s*["'](email|codigo_convite)["']/);
  });
});

describe("hml-02 (H-05): convites do staging vão para a caixa de teste", () => {
  it.each(["supabase-principal/functions/convites/index.ts", "supabase-principal/functions/alunos/index.ts"])(
    "%s usa destinoDoEnvio(schema, …)",
    (arquivo) => {
      const fonte = ler(arquivo);
      expect(fonte).toMatch(/destinoDoEnvio\(schema,/);
      expect(fonte).not.toMatch(/destinoDoEmail\(/);
    },
  );
});

describe("hml-02 (H-04): o espelho do Treino recebe o schema", () => {
  it("trocar-token e espelho-nucleo passam o schema para o aplicarResumo", () => {
    for (const arquivo of ["supabase/functions/trocar-token/index.ts", "supabase/functions/espelho-nucleo/index.ts"]) {
      expect(ler(arquivo)).toMatch(/aplicarResumo\([^)]*schema === "staging" \? "staging" : "public"\)/);
    }
    expect(ler("supabase/functions/_shared/espelho/aplicar.ts")).toMatch(/papelTreino\(resumo, papelAtual, schema\)/);
  });
});
