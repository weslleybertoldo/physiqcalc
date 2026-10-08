import { describe, expect, it } from "vitest";
import { emailValido } from "./email";

describe("emailValido (H-47)", () => {
  it("aceita e-mail com ponto no domínio", () => {
    for (const v of ["ana@gmail.com", "a.b+c@sub.dominio.com.br", "  ana@x.io  "]) expect(emailValido(v)).toBe(true);
  });
  it("recusa sem ponto no domínio, sem @, com espaço ou vazio", () => {
    for (const v of ["teste@sem-ponto", "semarroba.com", "a b@x.com", "ana@", "@x.com", "", null, undefined]) expect(emailValido(v)).toBe(false);
  });
});
