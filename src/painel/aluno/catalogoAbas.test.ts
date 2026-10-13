import { describe, expect, it } from "vitest";
import { ABAS_ALUNO, ORDEM_RESUMO, abaAtualDaRota, estadoDaAbaAluno, rolagemParaMostrar } from "./catalogoAbas";

const semNovas = () => false;
const comNovas = () => true;

describe("abas do perfil do aluno (spec 4.5, tela 7)", () => {
  it("as 7 abas na ordem da tela 7 — W-A P4: Acessos depois de Financeiro, para todo aluno", () => {
    expect(ABAS_ALUNO.map((a) => a.rotulo)).toEqual(["Resumo", "Treino", "Dieta", "Avaliação", "Prontuário", "Financeiro", "Acessos"]);
    const acessos = ABAS_ALUNO.find((a) => a.id === "acessos")!;
    expect(acessos).toMatchObject({ arquivo: "Acessos", rota: "acessos", modulo: "ambos" });
    expect(estadoDaAbaAluno(acessos, ["treino"], comNovas)).toBe("nova");
    expect(estadoDaAbaAluno(acessos, ["nutricao"], comNovas)).toBe("nova");
  });

  it("sem as abas registradas, só o Resumo (da casca) — o Configurar aluno antigo (fallback) saiu na W28", () => {
    const visiveis = ABAS_ALUNO.filter((a) => estadoDaAbaAluno(a, ["treino"], semNovas) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["resumo"]);
    expect(ABAS_ALUNO.map((a) => estadoDaAbaAluno(a, ["treino", "nutricao"]))).toEqual(["nova", "nova", "nova", "nova", "nova", "nova", "nova"]);
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
    expect(abaAtualDaRota("/painel/alunos/u1/acessos", "u1")).toBe("acessos");
  });

  it("W-A P4: o Resumo sem o card de login (foi para a aba Acessos) e com o lugar do card Rotinas no 7º (o 1º de baixo — a P6 cria)", () => {
    expect(ORDEM_RESUMO).not.toContain("CardAcessoAluno");
    expect(ORDEM_RESUMO.indexOf("CardRotinas")).toBe(6);
    expect(ORDEM_RESUMO.slice(0, 6)).toEqual(["CardTreino", "CardDieta", "CardEvolucao", "CardProntuario", "CardFinanceiro", "CardProximosCompromissos"]);
    expect(ORDEM_RESUMO.slice(6)).toEqual(["CardRotinas", "CardDadosAluno", "CardAjustesAluno", "CardLinkDiario", "CardResumoPrivado", "CardFluxoConsulta"]);
  });

  it("W-A P4: a barra rola até a aba ativa (no celular a Acessos fica fora da tela) — e não rola quando ela já aparece", () => {
    expect(rolagemParaMostrar({ esquerda: 620, largura: 110 }, { rolagem: 0, largura: 358 })).toBe(620 + 110 - 358 + 16);
    expect(rolagemParaMostrar({ esquerda: 40, largura: 90 }, { rolagem: 300, largura: 358 })).toBe(24);
    expect(rolagemParaMostrar({ esquerda: 5, largura: 90 }, { rolagem: 300, largura: 358 })).toBe(0);
    expect(rolagemParaMostrar({ esquerda: 100, largura: 90 }, { rolagem: 0, largura: 358 })).toBeNull();
    expect(rolagemParaMostrar({ esquerda: 0, largura: 0 }, { rolagem: 0, largura: 0 })).toBeNull();
  });
});
