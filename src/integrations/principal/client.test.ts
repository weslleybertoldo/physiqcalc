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
  it("importa sem quebrar, com ou sem as variáveis (no CI o npm test roda sem elas; no local o .env.local pode ter)", () => {
    expect(principal).toBeTruthy();
    expect(typeof principal.from).toBe("function");
    const env = import.meta.env as Record<string, string | undefined>;
    expect(principalConfigurado).toBe(Boolean(env.VITE_PRINCIPAL_URL?.trim() && env.VITE_PRINCIPAL_ANON_KEY?.trim()));
  });
  it("guarda a sessão numa chave própria, diferente da do Treino (sb-<host>-auth-token)", () => {
    expect(PRINCIPAL_STORAGE_KEY).toBe("physiq-principal-auth");
    expect(PRINCIPAL_STORAGE_KEY.startsWith("sb-")).toBe(false);
  });
});
