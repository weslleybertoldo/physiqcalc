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

  it("sem página nova, professor do Calc só vê Configurações (Alunos saiu na W13, Financeiro na W19, Treinos na W23, Calculadora na W26)", () => {
    expect(visiveis(["treino"], semNovas)).toEqual(["Configurações"]);
  });

  it("módulos: Treinos só com Treino; Dietas e Impressos só com Nutrição (4.4)", () => {
    expect(visiveis(["treino"], comNovas)).not.toContain("Dietas");
    expect(visiveis(["treino"], comNovas)).not.toContain("Impressos");
    expect(visiveis(["nutricao"], comNovas)).not.toContain("Treinos");
    expect(visiveis(["treino", "nutricao"], comNovas)).toHaveLength(MENU_PAINEL.length);
  });

  it("W26: as 4 Ferramentas não têm mais página antiga (a CalculadoraPage do Calc saiu) — são as novas; Impressos só com Nutrição", () => {
    for (const id of ["modelos", "impressos", "calculadora", "lixeira"]) {
      const item = MENU_PAINEL.find((i) => i.id === id)!;
      expect(estadoDoItem(item, ["treino", "nutricao"]), id).toBe("nova");
      expect(estadoDoItem(item, ["treino", "nutricao"], semNovas), id).toBeNull();
    }
    const impressos = MENU_PAINEL.find((i) => i.id === "impressos")!;
    expect(estadoDoItem(impressos, ["treino"])).toBeNull();
    expect(estadoDoItem(MENU_PAINEL.find((i) => i.id === "calculadora")!, ["treino"])).toBe("nova");
    expect(estadoDoItem(MENU_PAINEL.find((i) => i.id === "lixeira")!, ["nutricao"])).toBe("nova");
  });

  it("W19: Financeiro não tem mais a página antiga (a Cobrança do Calc saiu) — é a nova (src/painel/paginas/Financeiro.tsx) para os 2 módulos", () => {
    const financeiro = MENU_PAINEL.find((i) => i.id === "financeiro")!;
    expect(estadoDoItem(financeiro, ["treino"])).toBe("nova");
    expect(estadoDoItem(financeiro, ["nutricao"])).toBe("nova");
    expect(estadoDoItem(financeiro, ["treino"], semNovas)).toBeNull();
  });

  it("W23: Treinos não tem mais a página antiga (a TreinosAdminPage/AdminTreinos do Calc saiu) — é a nova (src/painel/paginas/Treinos.tsx), só com Treino", () => {
    const treinos = MENU_PAINEL.find((i) => i.id === "treinos")!;
    expect(estadoDoItem(treinos, ["treino"])).toBe("nova");
    expect(estadoDoItem(treinos, ["nutricao"])).toBeNull();
    expect(estadoDoItem(treinos, ["treino"], semNovas)).toBeNull();
  });

  it("W13: Alunos não tem mais a página antiga — é a nova (src/painel/paginas/Alunos.tsx) para os 2 módulos", () => {
    const alunos = MENU_PAINEL.find((i) => i.id === "alunos")!;
    expect(estadoDoItem(alunos, ["treino"])).toBe("nova");
    expect(estadoDoItem(alunos, ["nutricao"])).toBe("nova");
    expect(estadoDoItem(alunos, ["treino"], semNovas)).toBeNull();
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
