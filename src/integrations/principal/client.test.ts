import { describe, it, expect } from "vitest";
import { PRINCIPAL_STORAGE_KEY, principal, principalConfigurado, resolverSchemaPrincipal } from "./client";

describe("schema do banco principal", () => {
  it("VITE_PRINCIPAL_SCHEMA manda; sem ela vale o VITE_DB_SCHEMA; sem nada, public", () => {
    expect(resolverSchemaPrincipal({ VITE_PRINCIPAL_SCHEMA: "staging" })).toBe("staging");
    expect(resolverSchemaPrincipal({ VITE_PRINCIPAL_SCHEMA: "public", VITE_DB_SCHEMA: "staging" })).toBe("public");
    expect(resolverSchemaPrincipal({ VITE_DB_SCHEMA: "staging" })).toBe("staging");
    expect(resolverSchemaPrincipal({})).toBe("public");
  });
  it("valor inválido é ignorado (nunca vira um schema qualquer)", () => {
    expect(resolverSchemaPrincipal({ VITE_PRINCIPAL_SCHEMA: "auth", VITE_DB_SCHEMA: "staging" })).toBe("staging");
    expect(resolverSchemaPrincipal({ VITE_PRINCIPAL_SCHEMA: " STAGING " })).toBe("staging");
    expect(resolverSchemaPrincipal({ VITE_PRINCIPAL_SCHEMA: "x", VITE_DB_SCHEMA: "y" })).toBe("public");
  });
});

describe("cliente do principal", () => {
  it("importa sem quebrar mesmo sem as variáveis (nos testes elas não existem)", () => {
    expect(principal).toBeTruthy();
    expect(typeof principal.from).toBe("function");
    expect(principalConfigurado).toBe(false);
  });
  it("guarda a sessão numa chave própria, diferente da do Treino (sb-<host>-auth-token)", () => {
    expect(PRINCIPAL_STORAGE_KEY).toBe("physiq-principal-auth");
    expect(PRINCIPAL_STORAGE_KEY.startsWith("sb-")).toBe(false);
  });
});
