import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abasVisiveis, abaDeAbertura } from "@/app-aluno/catalogoAbas";
import { existe } from "@/rotas/registro";
import { destinoDaRotaAntiga } from "@/rotas/redirecionamentos";

const raiz = resolve(__dirname, "../../..");

describe("W11 — a aba Dieta nova entra pelo registro (tela 3)", () => {
  it("src/app-aluno/abas/Dieta.tsx está registrada; só Nutrição entra no app com Início · Dieta · Evolução · Perfil (W12: abre no Início)", () => {
    expect(existe("abasApp", "Dieta")).toBe(true);
    expect(abasVisiveis(["nutricao"]).map((a) => a.rotulo)).toEqual(["Início", "Dieta", "Evolução", "Perfil"]);
    expect(abaDeAbertura(["nutricao"])?.id).toBe("inicio");
    expect(abasVisiveis(["treino", "nutricao"]).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Dieta", "Evolução", "Perfil"]);
    expect(abaDeAbertura(["treino", "nutricao"])?.id).toBe("inicio");
    expect(abasVisiveis(["treino"]).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Evolução", "Perfil"]);
  });

  it("a faixa 'Sua dieta continua no PhysiqNutri' saiu (a Dieta chegou); o Perfil › Alimentação ficou como atalho", () => {
    expect(existe("avisosApp", "AvisoDietaNoNutri")).toBe(false);
    expect(existsSync(resolve(raiz, "src/app-aluno/avisos/AvisoDietaNoNutri.tsx"))).toBe(false);
    expect(existe("perfilApp", "Alimentacao")).toBe(true);
    const gate = readFileSync(resolve(raiz, "src/app-aluno/gates/GateSemModulo.tsx"), "utf-8");
    expect(gate).not.toMatch(/Sua dieta continua no PhysiqNutri/);
  });

  it("os links antigos da área do paciente do Nutri caem na aba Dieta (spec 4.8)", () => {
    expect(destinoDaRotaAntiga("/app/plano", "")).toBe("/dieta");
    expect(destinoDaRotaAntiga("/app/orientacoes", "")).toBe("/dieta?ver=orientacoes");
    expect(destinoDaRotaAntiga("/app/metas", "")).toBe("/dieta?ver=metas");
    expect(destinoDaRotaAntiga("/app/diario", "")).toBe("/dieta?ver=diario");
  });

  it("a migração do principal só troca/acrescenta funções e 1 política do Storage (sem tabela, sem dado, sem anon)", () => {
    const sql = readFileSync(resolve(raiz, "supabase-principal/migrations/20260930090000_w11_metas_do_dia.sql"), "utf-8");
    const semComentarios = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    for (const f of ["minha_dieta(p_dia date default null)", "aluno_marcar_meta(p_meta_id uuid, p_data date, p_concluida boolean)",
      "paciente_marcar_refeicao(p_refeicao_id uuid, p_data date, p_concluida boolean)", "aluno_le_foto_diario(p_path text)"]) {
      expect(semComentarios).toContain(`create or replace function {schema}.${f}`);
    }
    expect(semComentarios).toMatch(/revoke execute on function \{schema\}\.minha_dieta\(date\) from public, anon/);
    expect(semComentarios).toMatch(/revoke execute on function \{schema\}\.aluno_marcar_meta\(uuid, date, boolean\) from public, anon/);
    expect(semComentarios).toMatch(/revoke all on function \{schema\}\.paciente_marcar_refeicao\(uuid, date, boolean\) from anon/);
    expect(semComentarios).not.toMatch(/\b(alter|drop|create) table\b/i);
    expect(semComentarios).not.toMatch(/\bupdate\s+\{schema\}|\binsert\s+into\s+\{schema\}\.(?!metas_concluidas)/i);
    // a MESMA função do site antigo: os mesmos erros e a mesma tabela
    for (const e of ["'sem_acesso'", "'data_invalida'", "'sem_alimentos'"]) expect(semComentarios).toContain(e);
    expect(semComentarios).toContain("insert into refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data)");
    expect(sql.split("\n").filter((l) => l.trim() === "-- @@ compartilhado")).toHaveLength(1);
  });
});
