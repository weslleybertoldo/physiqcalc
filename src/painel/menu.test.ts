import { describe, expect, it } from "vitest";
import { MENU_PAINEL, estadoDoItem, itemAtivo } from "./menu";

const semNovas = () => false;
const comNovas = () => true;
const visiveis = (modulos: ("treino" | "nutricao")[], temNova: (a: string) => boolean) =>
  MENU_PAINEL.filter((i) => estadoDoItem(i, modulos, temNova) !== null).map((i) => i.rotulo);

describe("menu do site do profissional (spec 4.4, tela 6)", () => {
  it("itens na ordem da tela 6 (+ grupo Ferramentas)", () => {
    expect(MENU_PAINEL.filter((i) => i.grupo === "principal").map((i) => i.rotulo)).toEqual([
      "Dashboard", "Alunos", "Treinos", "Dietas", "Pré-consulta", "Agenda", "Mensagens", "Financeiro", "Configurações",
    ]);
    expect(MENU_PAINEL.filter((i) => i.grupo === "ferramentas").map((i) => i.rotulo)).toEqual(["Modelos", "Impressos", "Calculadora", "Lixeira"]);
  });

  it("antes das páginas novas (W1), professor do Calc vê as antigas: Alunos, Treinos, Financeiro, Configurações e Calculadora", () => {
    expect(visiveis(["treino"], semNovas)).toEqual(["Alunos", "Treinos", "Financeiro", "Configurações", "Calculadora"]);
  });

  it("módulos: Treinos só com Treino; Dietas e Impressos só com Nutrição (4.4)", () => {
    expect(visiveis(["treino"], comNovas)).not.toContain("Dietas");
    expect(visiveis(["treino"], comNovas)).not.toContain("Impressos");
    expect(visiveis(["nutricao"], comNovas)).not.toContain("Treinos");
    expect(visiveis(["treino", "nutricao"], comNovas)).toHaveLength(MENU_PAINEL.length);
  });

  it("só Nutrição e sem página nova: a antiga vira o aviso do site do Nutri", () => {
    const alunos = MENU_PAINEL.find((i) => i.id === "alunos")!;
    expect(estadoDoItem(alunos, ["treino"], semNovas)).toBe("antiga");
    expect(estadoDoItem(alunos, ["nutricao"], semNovas)).toBe("nutri");
    expect(estadoDoItem(alunos, ["nutricao"], comNovas)).toBe("nova");
  });

  it("item ativo pela rota (Dashboard só na raiz)", () => {
    const dash = MENU_PAINEL[0];
    const alunos = MENU_PAINEL[1];
    expect(itemAtivo(dash, "/painel")).toBe(true);
    expect(itemAtivo(dash, "/painel/alunos")).toBe(false);
    expect(itemAtivo(alunos, "/painel/alunos/u1/treino")).toBe(true);
    expect(itemAtivo(alunos, "/painel/alunosx")).toBe(false);
  });
});
