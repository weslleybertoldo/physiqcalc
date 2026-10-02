import { describe, expect, it } from "vitest";
import { FORM_VAZIO, camposRepetidos, dadosDoCadastro, formatarCPF, problemaDoCadastro, validarCPF } from "./regras";

const form = (extra: Partial<typeof FORM_VAZIO> = {}) => ({ ...FORM_VAZIO, nome: "Ana Lima", ...extra });

describe("H5 — /c/ (cadastro pelo link): só o nome é obrigatório, como no Nutri (DN-6 / N-57)", () => {
  it("só o nome basta; sem nome não vai", () => {
    expect(problemaDoCadastro(form())).toBeNull();
    expect(problemaDoCadastro({ ...FORM_VAZIO })).toBe("nome_invalido");
    expect(problemaDoCadastro(form({ nome: " A " }))).toBe("nome_invalido");
  });
  it("o que for preenchido precisa estar certo", () => {
    expect(problemaDoCadastro(form({ email: "ana@" }))).toBe("email_invalido");
    expect(problemaDoCadastro(form({ telefone: "9999-000" }))).toBe("telefone_invalido");
    expect(problemaDoCadastro(form({ telefone: "(82) 99999-0000" }))).toBeNull();
    expect(problemaDoCadastro(form({ cpf: "111.111.111-11" }))).toBe("cpf_invalido");
    expect(problemaDoCadastro(form({ cpf: "529.982.247-25" }))).toBeNull();
    expect(problemaDoCadastro(form({ nascimento: "2999-01-01" }), "2026-10-02")).toBe("nascimento_invalido");
    expect(problemaDoCadastro(form({ nascimento: "1990-05-20" }), "2026-10-02")).toBeNull();
  });
  it("CPF: máscara progressiva e os dígitos verificadores", () => {
    expect(formatarCPF("5299822")).toBe("529.982.2");
    expect(formatarCPF("52998224725999")).toBe("529.982.247-25");
    expect(validarCPF("529.982.247-25")).toBe(true);
    expect(validarCPF("529.982.247-26")).toBe(false);
    expect(validarCPF("000.000.000-00")).toBe(false);
  });
  it("o que vai para o banco: aparado, telefone e CPF só com os dígitos", () => {
    expect(dadosDoCadastro(form({ nome: "  Ana   Lima ", apelido: " Aninha ", cpf: "529.982.247-25", telefone: "(82) 99999-0000", email: " a@b.com " })))
      .toMatchObject({ nome: "Ana Lima", apelido: "Aninha", cpf: "52998224725", telefone: "82999990000", email: "a@b.com" });
  });
  it("a trava de e-mail/CPF: os campos que voltaram do banco (os 2 de uma vez) ou o do código", () => {
    expect(camposRepetidos("cadastro_email_existe", ["email", "cpf"])).toEqual(["email", "cpf"]);
    expect(camposRepetidos("cadastro_cpf_existe")).toEqual(["cpf"]);
    expect(camposRepetidos("cadastro_email_existe")).toEqual(["email"]);
    expect(camposRepetidos("cadastro_repetido")).toEqual([]);
  });
});
