import { describe, expect, it, vi } from "vitest";

// a tela antiga do Treino é pesada (PowerSync, PDFs): aqui só importa que ela é o fallback
vi.mock("@/pages/TreinosPage", () => ({ default: () => null }));

import { ABAS_APP, abaDaRota, abaDeAbertura, abasVisiveis, estadoDaAba } from "./catalogoAbas";

const nenhumaNova = () => false;
const todasNovas = () => true;

describe("abas do app do aluno (spec 4.3 e 11.1)", () => {
  it("as 5 abas na ordem da tela 1", () => {
    expect(ABAS_APP.map((a) => a.rotulo)).toEqual(["Início", "Treino", "Dieta", "Evolução", "Perfil"]);
    expect(ABAS_APP.map((a) => a.rota)).toEqual(["/", "/treino", "/dieta", "/evolucao", "/perfil"]);
  });

  it("antes das telas novas: só as que têm tela antiga (Treino e Evolução)", () => {
    expect(abasVisiveis(["treino"], nenhumaNova).map((a) => a.id)).toEqual(["treino", "evolucao"]);
    expect(abaDeAbertura(["treino"], nenhumaNova)?.id).toBe("treino");
  });

  it("com todas as telas novas: só Treino → sem Dieta; só Nutrição → sem Treino", () => {
    expect(abasVisiveis(["treino"], todasNovas).map((a) => a.rotulo)).toEqual(["Início", "Treino", "Evolução", "Perfil"]);
    expect(abasVisiveis(["nutricao"], todasNovas).map((a) => a.rotulo)).toEqual(["Início", "Dieta", "Evolução", "Perfil"]);
    expect(abasVisiveis(["treino", "nutricao"], todasNovas)).toHaveLength(5);
    expect(abaDeAbertura(["treino", "nutricao"], todasNovas)?.id).toBe("inicio");
  });

  it("aba nova vence a antiga; sem o módulo, some mesmo com tela", () => {
    const treino = ABAS_APP.find((a) => a.id === "treino")!;
    expect(estadoDaAba(treino, ["treino"], nenhumaNova)).toBe("antiga");
    expect(estadoDaAba(treino, ["treino"], todasNovas)).toBe("nova");
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
