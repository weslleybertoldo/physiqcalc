import { describe, expect, it } from "vitest";
import { ABAS_CONFIG, estadoDaAbaConfig } from "./catalogoAbas";

describe("abas das Configurações (spec 4.6)", () => {
  it("as 7 abas na ordem da spec", () => {
    expect(ABAS_CONFIG.map((a) => a.rotulo)).toEqual(["Perfil", "Conta", "Equipe", "Plano", "Recebimento", "Convite", "Aplicativo"]);
  });

  it("sem as abas registradas, nenhuma aparece (a Configurações antiga do Calc saiu na W6 e a Planos, o fallback do Plano, na W28)", () => {
    const visiveis = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: true }, () => false) !== null).map((a) => a.id);
    expect(visiveis).toEqual([]);
    expect(ABAS_CONFIG.map((a) => estadoDaAbaConfig(a, { ehDono: true }))).toEqual(["nova", "nova", "nova", "nova", "nova", "nova", "nova"]);
  });

  it("Conta, Equipe, Plano e Recebimento só para o dono", () => {
    const visiveis = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: false }, () => true) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["perfil", "convite", "aplicativo"]);
  });
});
