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

  it("sem página nova, professor do Calc vê as antigas que ainda existem: Treinos, Financeiro, Configurações e Calculadora (Alunos saiu na W13)", () => {
    expect(visiveis(["treino"], semNovas)).toEqual(["Treinos", "Financeiro", "Configurações", "Calculadora"]);
  });

  it("módulos: Treinos só com Treino; Dietas e Impressos só com Nutrição (4.4)", () => {
    expect(visiveis(["treino"], comNovas)).not.toContain("Dietas");
    expect(visiveis(["treino"], comNovas)).not.toContain("Impressos");
    expect(visiveis(["nutricao"], comNovas)).not.toContain("Treinos");
    expect(visiveis(["treino", "nutricao"], comNovas)).toHaveLength(MENU_PAINEL.length);
  });

  it("só Nutrição e sem página nova: a antiga vira o aviso do site do Nutri", () => {
    const treinos = MENU_PAINEL.find((i) => i.id === "financeiro")!;
    expect(estadoDoItem(treinos, ["treino"], semNovas)).toBe("antiga");
    expect(estadoDoItem(treinos, ["nutricao"], semNovas)).toBe("nutri");
    expect(estadoDoItem(treinos, ["nutricao"], comNovas)).toBe("nova");
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
