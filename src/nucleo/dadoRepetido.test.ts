import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
// a falha de rede vem por uma função comum (um vi.fn que lança deixa o teste vermelho no Vitest 3 mesmo com o erro tratado)
let falhar = false;
vi.mock("@/integrations/principal/client", () => ({
  principal: {
    rpc: (...a: unknown[]) => {
      if (falhar) throw new Error("rede");
      return rpc(...a);
    },
  },
}));

import { conferirDadoLivre } from "./dadoLivre";
import {
  campoDoErro,
  camposDoErro,
  DICA_REPETIDO,
  MENSAGEM_CADASTRO_EXISTE,
  MENSAGEM_REPETIDO,
  precisaConferir,
} from "./dadoRepetido";

describe("W16b — e-mail/CPF repetido: frases e códigos", () => {
  it("as frases da tela (a palavra do Weslley: mensagem vermelha embaixo do campo)", () => {
    expect(MENSAGEM_REPETIDO.email).toBe("Já existe um aluno com este e-mail.");
    expect(MENSAGEM_REPETIDO.cpf).toBe("Já existe um aluno com este CPF.");
    expect(DICA_REPETIDO).toBe("Para trazer essa pessoa, use o convite ou o seu código.");
    expect(MENSAGEM_CADASTRO_EXISTE).toBe("Já existe cadastro com este e-mail.");
  });

  it("cada código do servidor cai no campo certo", () => {
    expect(campoDoErro("email_repetido")).toBe("email");
    expect(campoDoErro("paciente_email_repetido")).toBe("email"); // o gatilho (site antigo grava direto na tabela)
    expect(campoDoErro("ja_cadastrado")).toBe("email"); // o mesmo e-mail na MESMA conta (W13)
    expect(campoDoErro("cadastro_email_existe")).toBe("email"); // /c/
    expect(campoDoErro("cpf_repetido")).toBe("cpf");
    expect(campoDoErro("paciente_cpf_repetido")).toBe("cpf");
    expect(campoDoErro("limite_plano")).toBeNull();
    expect(campoDoErro(null)).toBeNull();
  });

  it("os 2 campos de uma vez quando o banco manda `campos`", () => {
    expect(camposDoErro("email_repetido", { campos: ["cpf", "email", "cpf"] })).toEqual(["cpf", "email"]);
    expect(camposDoErro("cpf_repetido", {})).toEqual(["cpf"]);
    expect(camposDoErro("email_invalido", { campos: ["outro"] })).toEqual([]);
  });

  it("só confere quando o valor mudou e está completo", () => {
    expect(precisaConferir("email", "Ana@Mail.com ", "ana@mail.com")).toBe(false); // o mesmo (caixa/espaço)
    expect(precisaConferir("email", "ana@mail", "")).toBe(false); // incompleto
    expect(precisaConferir("email", "ana@mail.com", "")).toBe(true);
    expect(precisaConferir("cpf", "529.982.247-25", "52998224725")).toBe(false);
    expect(precisaConferir("cpf", "529.982.247", "")).toBe(false);
    expect(precisaConferir("cpf", "529.982.247-25", "")).toBe(true);
  });
});

describe("W16b — pré-checagem (paciente_dado_livre)", () => {
  beforeEach(() => {
    rpc.mockReset();
    falhar = false;
  });

  it("manda o e-mail normalizado e o CPF só com dígitos, e devolve os booleanos", async () => {
    rpc.mockResolvedValue({ data: { ok: true, email_livre: false, cpf_livre: true }, error: null });
    const r = await conferirDadoLivre({ email: "  Ana@Mail.COM ", cpf: "529.982.247-25", pacienteId: "p1" });
    expect(rpc).toHaveBeenCalledWith("paciente_dado_livre", { p_email: "ana@mail.com", p_cpf: "52998224725", p_paciente: "p1" });
    expect(r).toEqual({ email_livre: false, cpf_livre: true });
  });

  it("não trava a tela quando não deu para conferir (erro, sem permissão)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    expect(await conferirDadoLivre({ email: "a@b.co" })).toBeNull();
    rpc.mockResolvedValue({ data: { ok: false, erro: "sem_acesso" }, error: null });
    expect(await conferirDadoLivre({ email: "a@b.co" })).toBeNull();
  });

  it("sem rede (a chamada falha) também não trava", async () => {
    falhar = true;
    expect(await conferirDadoLivre({ cpf: "52998224725" })).toBeNull();
  });
});
