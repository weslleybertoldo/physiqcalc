import { describe, expect, it } from "vitest";
import { ABAS_ALUNO, abaAtualDaRota, estadoDaAbaAluno } from "./catalogoAbas";

const semNovas = () => false;
const comNovas = () => true;

describe("abas do perfil do aluno (spec 4.5, tela 7)", () => {
  it("as 6 abas na ordem da tela 7", () => {
    expect(ABAS_ALUNO.map((a) => a.rotulo)).toEqual(["Resumo", "Treino", "Dieta", "Avaliação", "Prontuário", "Financeiro"]);
  });

  it("sem as abas registradas, só o Resumo (da casca) — o Configurar aluno antigo (fallback) saiu na W28", () => {
    const visiveis = ABAS_ALUNO.filter((a) => estadoDaAbaAluno(a, ["treino"], semNovas) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["resumo"]);
    expect(ABAS_ALUNO.map((a) => estadoDaAbaAluno(a, ["treino", "nutricao"]))).toEqual(["nova", "nova", "nova", "nova", "nova", "nova"]);
  });

  it("aba registrada aparece; Treino some sem o módulo; o Resumo é sempre da casca", () => {
    const treino = ABAS_ALUNO.find((a) => a.id === "treino")!;
    const resumo = ABAS_ALUNO[0];
    expect(estadoDaAbaAluno(treino, ["treino"], comNovas)).toBe("nova");
    expect(estadoDaAbaAluno(treino, ["nutricao"], comNovas)).toBeNull();
    expect(estadoDaAbaAluno(resumo, ["treino"], semNovas)).toBe("nova");
    expect(estadoDaAbaAluno(resumo, ["nutricao"], semNovas)).toBe("nova");
  });

  it("aba atual pela rota", () => {
    expect(abaAtualDaRota("/painel/alunos/u1", "u1")).toBe("resumo");
    expect(abaAtualDaRota("/painel/alunos/u1/avaliacao", "u1")).toBe("avaliacao");
    expect(abaAtualDaRota("/painel/alunos/u1/xyz", "u1")).toBe("resumo");
  });
});
