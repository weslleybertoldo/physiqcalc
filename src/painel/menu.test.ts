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

  it("sem página nova, professor do Calc vê as antigas que ainda existem: Configurações e Calculadora (Alunos saiu na W13, Financeiro na W19, Treinos na W23)", () => {
    expect(visiveis(["treino"], semNovas)).toEqual(["Configurações", "Calculadora"]);
  });

  it("módulos: Treinos só com Treino; Dietas e Impressos só com Nutrição (4.4)", () => {
    expect(visiveis(["treino"], comNovas)).not.toContain("Dietas");
    expect(visiveis(["treino"], comNovas)).not.toContain("Impressos");
    expect(visiveis(["nutricao"], comNovas)).not.toContain("Treinos");
    expect(visiveis(["treino", "nutricao"], comNovas)).toHaveLength(MENU_PAINEL.length);
  });

  it("só Nutrição e sem página nova: a antiga vira o aviso do site do Nutri", () => {
    const calculadora = MENU_PAINEL.find((i) => i.id === "calculadora")!;
    expect(estadoDoItem(calculadora, ["treino"], semNovas)).toBe("antiga");
    expect(estadoDoItem(calculadora, ["nutricao"], semNovas)).toBe("nutri");
    expect(estadoDoItem(calculadora, ["nutricao"], comNovas)).toBe("nova");
  });

  it("W19: Financeiro não tem mais a página antiga (a Cobrança do Calc saiu) — é a nova (src/painel/paginas/Financeiro.tsx) para os 2 módulos", () => {
    const financeiro = MENU_PAINEL.find((i) => i.id === "financeiro")!;
    expect(financeiro.antiga).toBeUndefined();
    expect(estadoDoItem(financeiro, ["treino"])).toBe("nova");
    expect(estadoDoItem(financeiro, ["nutricao"])).toBe("nova");
    expect(estadoDoItem(financeiro, ["treino"], semNovas)).toBeNull();
  });

  it("W23: Treinos não tem mais a página antiga (a TreinosAdminPage/AdminTreinos do Calc saiu) — é a nova (src/painel/paginas/Treinos.tsx), só com Treino", () => {
    const treinos = MENU_PAINEL.find((i) => i.id === "treinos")!;
    expect(treinos.antiga).toBeUndefined();
    expect(estadoDoItem(treinos, ["treino"])).toBe("nova");
    expect(estadoDoItem(treinos, ["nutricao"])).toBeNull();
    expect(estadoDoItem(treinos, ["treino"], semNovas)).toBeNull();
  });

  it("W13: Alunos não tem mais a página antiga — é a nova (src/painel/paginas/Alunos.tsx) para os 2 módulos", () => {
    const alunos = MENU_PAINEL.find((i) => i.id === "alunos")!;
    expect(alunos.antiga).toBeUndefined();
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
