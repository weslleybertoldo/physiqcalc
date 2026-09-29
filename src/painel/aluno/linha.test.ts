import { describe, expect, it } from "vitest";

import { linhaDoAluno } from "./linha";

describe("linha do cabeçalho do aluno (tela 7)", () => {
  it("idade · altura · aluno desde", () => {
    expect(linhaDoAluno({ idade: 28, altura: 178, created_at: "2026-03-10T12:00:00Z" })).toBe("28 anos · 1,78 m · aluno desde mar/2026");
  });
  it("só o que existe", () => {
    expect(linhaDoAluno({ idade: null, altura: null, created_at: "2026-07-01T12:00:00Z" })).toBe("aluno desde jul/2026");
    expect(linhaDoAluno({ idade: null, altura: null, created_at: null })).toBe("");
  });
});
