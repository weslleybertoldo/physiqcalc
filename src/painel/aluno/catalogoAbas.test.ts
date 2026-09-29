import { describe, expect, it } from "vitest";
import { ABAS_ALUNO, abaAtualDaRota, estadoDaAbaAluno } from "./catalogoAbas";

const semNovas = () => false;
const comNovas = () => true;

describe("abas do perfil do aluno (spec 4.5, tela 7)", () => {
  it("as 6 abas na ordem da tela 7", () => {
    expect(ABAS_ALUNO.map((a) => a.rotulo)).toEqual(["Resumo", "Treino", "Dieta", "Avaliação", "Prontuário", "Financeiro"]);
  });

  it("antes das abas novas: Resumo, Treino, Avaliação e Financeiro pelo Configurar aluno antigo", () => {
    const visiveis = ABAS_ALUNO.filter((a) => estadoDaAbaAluno(a, ["treino"], semNovas, () => false) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["resumo", "treino", "avaliacao", "financeiro"]);
  });

  it("grupos antigos → aba (tabela do fim da 5.2)", () => {
    const cts = (id: string) => ABAS_ALUNO.find((a) => a.id === id)?.antigas?.map((s) => s.ct);
    expect(cts("resumo")).toEqual(["dados", "geral"]);
    expect(cts("treino")).toEqual(["treino", "historico", "config"]);
    expect(cts("avaliacao")).toEqual(["dobras", "evolucao", "registros"]);
    expect(cts("financeiro")).toEqual(["plano"]);
  });

  it("aba nova vence; Treino some sem o módulo; Resumo com cards é da casca", () => {
    const treino = ABAS_ALUNO.find((a) => a.id === "treino")!;
    const resumo = ABAS_ALUNO[0];
    expect(estadoDaAbaAluno(treino, ["treino"], comNovas)).toBe("nova");
    expect(estadoDaAbaAluno(treino, ["nutricao"], comNovas)).toBeNull();
    expect(estadoDaAbaAluno(resumo, ["treino"], semNovas, () => true)).toBe("nova");
    expect(estadoDaAbaAluno(resumo, ["nutricao"], semNovas, () => false)).toBe("nova");
  });

  it("aba atual pela rota", () => {
    expect(abaAtualDaRota("/painel/alunos/u1", "u1")).toBe("resumo");
    expect(abaAtualDaRota("/painel/alunos/u1/avaliacao", "u1")).toBe("avaliacao");
    expect(abaAtualDaRota("/painel/alunos/u1/xyz", "u1")).toBe("resumo");
  });
});
