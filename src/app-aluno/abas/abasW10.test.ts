import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abasVisiveis, abaDeAbertura } from "@/app-aluno/catalogoAbas";
import { existe } from "@/rotas/registro";
import { destinoDaRotaAntiga } from "@/rotas/redirecionamentos";

const raiz = resolve(__dirname, "../../..");

describe("W10 — a aba Evolução nova entra pelo registro no lugar do UserDashboard", () => {
  it("src/app-aluno/abas/Evolucao.tsx está registrada; as abas do aluno seguem (Treino abre; só Nutrição abre na Evolução)", () => {
    expect(existe("abasApp", "Evolucao")).toBe(true);
    expect(abasVisiveis(["treino"]).map((a) => a.rotulo)).toEqual(["Treino", "Evolução", "Perfil"]);
    expect(abaDeAbertura(["treino"])?.id).toBe("treino");
    expect(abasVisiveis(["nutricao"]).map((a) => a.rotulo)).toEqual(["Evolução", "Perfil"]);
  });

  it("C14: o antigo /avaliacao (ícone Avaliação do topo) cai na aba Evolução", () => {
    expect(destinoDaRotaAntiga("/avaliacao", "")).toBe("/evolucao");
  });

  it("o legado do app do aluno saiu; o que o painel ainda usa ficou (até a W17)", () => {
    for (const saiu of ["src/pages/UserDashboard.tsx", "src/components/RegistrosSection.tsx"]) expect(existsSync(resolve(raiz, saiu)), saiu).toBe(false);
    for (const ficou of [
      "src/components/EvolutionSection.tsx", // painel: Configurar aluno › Avaliação › Evolução (W17)
      "src/components/CompararRegistros.tsx", // painel: Registros do aluno (W17)
      "src/components/MedidasCorporaisDisplay.tsx", // painel: dados do aluno (W14)
      "src/lib/registrosFotos.ts",
    ]) expect(existsSync(resolve(raiz, ficou)), ficou).toBe(true);
  });

  it("a migração do principal só acrescenta funções de leitura e a política do Storage (sem observação interna, sem anon)", () => {
    const sql = readFileSync(resolve(raiz, "supabase-principal/migrations/20260930070000_w10_evolucao_aluno.sql"), "utf-8");
    const semComentarios = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(semComentarios).toContain("create or replace function {schema}.minha_evolucao()");
    expect(semComentarios).toContain("create or replace function {schema}.aluno_le_foto_evolucao(p_path text)");
    expect(semComentarios).not.toMatch(/'observacao'/);
    expect(semComentarios).toMatch(/revoke execute on function \{schema\}\.minha_evolucao\(\) from public, anon/);
    expect(semComentarios).not.toMatch(/\b(alter|drop) table\b|\b(insert|update|delete)\s+(into\s+)?\{schema\}/i);
    expect(sql.split("\n").filter((l) => l.trim() === "-- @@ compartilhado")).toHaveLength(1);
  });
});
