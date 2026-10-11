// src/financeiro/recebimentoJeito2.test.ts
// Physiq W1 (jeito 2 — combinado com a hml-19, para_linux3.md (b)): Configurações › Recebimento não fala mais com o banco pelo navegador;
// ninguém em src/ grava recebimento_chaves direto. A guarda lê a fonte (o mesmo jeito dos outros testes de fonte do repo).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TELAS = ["painel/configuracoes/Recebimento.tsx", "components/admin/RecebimentosLista.tsx", "components/admin/RecebimentoPixDialog.tsx"];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    if (statSync(c).isDirectory()) return arquivos(c);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n) ? [c] : [];
  });
}

describe("W1 — jeito 2 em Configurações › Recebimento", () => {
  it.each(TELAS)("%s: sem o cliente do banco (principal.from / .rpc / .storage)", (rel) => {
    const f = readFileSync(resolve(SRC, rel), "utf8");
    expect(f).not.toMatch(/principal\s*\.\s*(from|rpc|storage)\b/);
    expect(f).not.toContain("@/integrations/principal/client");
  });
  it("ninguém em src/ grava recebimento_chaves direto", () => {
    const achados = arquivos(SRC).filter((a) => /\.from\(\s*["']recebimento_chaves["']\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(readFileSync(a, "utf8")));
    expect(achados).toEqual([]);
  });
});
