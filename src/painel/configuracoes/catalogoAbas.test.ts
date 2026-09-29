import { describe, expect, it, vi } from "vitest";

vi.mock("@/pages/admin/ConfiguracoesPage", () => ({ default: () => null }));
vi.mock("@/pages/admin/PlanosPage", () => ({ default: () => null }));

import { ABAS_CONFIG, estadoDaAbaConfig } from "./catalogoAbas";

describe("abas das Configurações (spec 4.6)", () => {
  it("as 7 abas na ordem da spec", () => {
    expect(ABAS_CONFIG.map((a) => a.rotulo)).toEqual(["Perfil", "Conta", "Equipe", "Plano", "Recebimento", "Convite", "Aplicativo"]);
  });

  it("antes das abas novas: Perfil, Plano, Recebimento e Convite pelas telas antigas", () => {
    const visiveis = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: true }, () => false) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["perfil", "plano", "recebimento", "convite"]);
  });

  it("Conta, Equipe, Plano e Recebimento só para o dono", () => {
    const visiveis = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: false }, () => true) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["perfil", "convite", "aplicativo"]);
  });
});
