import { describe, expect, it, vi } from "vitest";

import { ABAS_APP, abaDaRota, abaDeAbertura, abasVisiveis, estadoDaAba } from "./catalogoAbas";

const nenhumaNova = () => false;
const todasNovas = () => true;

describe("abas do app do aluno (spec 4.3 e 11.1)", () => {
  it("as 5 abas na ordem da tela 1", () => {
    expect(ABAS_APP.map((a) => a.rotulo)).toEqual(["Início", "Treino", "Dieta", "Evolução", "Perfil"]);
    expect(ABAS_APP.map((a) => a.rota)).toEqual(["/", "/treino", "/dieta", "/evolucao", "/perfil"]);
  });

  it("sem telas novas: nenhuma aba (o Treino antigo saiu na W8 e o UserDashboard na W10 — não há mais tela antiga)", () => {
    expect(abasVisiveis(["treino"], nenhumaNova)).toEqual([]);
    expect(abaDeAbertura(["treino"], nenhumaNova)).toBeNull();
    expect(ABAS_APP.some((a) => a.antiga)).toBe(false);
  });

  it("W8/W10: com as abas Treino e Evolução novas, o Treino é a abertura do aluno do Calc (antes do Início)", () => {
    const treinoEEvolucao = (arquivo: string) => arquivo === "Treino" || arquivo === "Evolucao";
    expect(abasVisiveis(["treino"], treinoEEvolucao).map((a) => a.id)).toEqual(["treino", "evolucao"]);
    expect(abaDeAbertura(["treino"], treinoEEvolucao)?.id).toBe("treino");
    // só Nutrição, antes da Dieta (W11) e do Início (W12): a Evolução é a abertura
    expect(abaDeAbertura(["nutricao"], treinoEEvolucao)?.id).toBe("evolucao");
  });

  it("com todas as telas novas: só Treino → sem Dieta; só Nutrição → sem Treino", () => {
    expect(abasVisiveis(["treino"], todasNovas).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Evolução", "Perfil"]);
    expect(abasVisiveis(["nutricao"], todasNovas).map((a) => a.rotulo)).toEqual(["Início", "Dieta", "Evolução", "Perfil"]);
    expect(abasVisiveis(["treino", "nutricao"], todasNovas)).toHaveLength(5);
    expect(abaDeAbertura(["treino", "nutricao"], todasNovas)?.id).toBe("inicio");
  });

  it("aba nova vence a antiga; sem o módulo, some mesmo com tela", () => {
    const treino = ABAS_APP.find((a) => a.id === "treino")!;
    // o Treino não tem mais tela antiga (W8): sem a nova, some
    expect(estadoDaAba(treino, ["treino"], nenhumaNova)).toBeNull();
    expect(estadoDaAba(treino, ["treino"], todasNovas)).toBe("nova");
    // a Evolução também não tem mais tela antiga (W10)
    const evolucao = ABAS_APP.find((a) => a.id === "evolucao")!;
    expect(estadoDaAba(evolucao, ["treino"], nenhumaNova)).toBeNull();
    expect(estadoDaAba(evolucao, ["nutricao"], todasNovas)).toBe("nova");
    expect(estadoDaAba(treino, ["nutricao"], todasNovas)).toBeNull();
  });

  it("aba ativa pela rota", () => {
    expect(abaDaRota("/")).toBe("inicio");
    expect(abaDaRota("/treino")).toBe("treino");
    expect(abaDaRota("/perfil/pagamentos")).toBe("perfil");
    expect(abaDaRota("/evolucao")).toBe("evolucao");
    expect(abaDaRota("/outra")).toBeNull();
  });
});
