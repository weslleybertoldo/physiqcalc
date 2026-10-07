import { describe, expect, it } from "vitest";
import { ABAS_CONFIG, estadoDaAbaConfig } from "./catalogoAbas";

describe("abas das Configurações (spec 4.6)", () => {
  it("as 8 abas na ordem da spec (W2 da loja: + Excluir minha conta, a última)", () => {
    expect(ABAS_CONFIG.map((a) => a.rotulo)).toEqual(["Perfil", "Conta", "Equipe", "Plano", "Recebimento", "Convite", "Aplicativo", "Excluir minha conta"]);
  });

  it("sem as abas registradas, nenhuma aparece (a Configurações antiga do Calc saiu na W6 e a Planos, o fallback do Plano, na W28)", () => {
    const visiveis = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: true }, () => false) !== null).map((a) => a.id);
    expect(visiveis).toEqual([]);
    expect(ABAS_CONFIG.map((a) => estadoDaAbaConfig(a, { ehDono: true }))).toEqual(["nova", "nova", "nova", "nova", "nova", "nova", "nova", "nova"]);
  });

  it("Conta, Equipe, Plano e Recebimento só para o dono; Excluir minha conta para todos", () => {
    const visiveis = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: false }, () => true) !== null).map((a) => a.id);
    expect(visiveis).toEqual(["perfil", "convite", "aplicativo", "excluir-conta"]);
  });

  it("W2 da loja: Excluir minha conta também na versão da Google Play (só o Aplicativo some)", () => {
    const naLoja = ABAS_CONFIG.filter((a) => estadoDaAbaConfig(a, { ehDono: false }, () => true, true) !== null).map((a) => a.id);
    expect(naLoja).toEqual(["perfil", "convite", "excluir-conta"]);
  });
});
