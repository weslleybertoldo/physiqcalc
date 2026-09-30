import { describe, expect, it } from "vitest";
import {
  estadoDoAcesso,
  gerarSenhaProvisoria,
  textoErroAcesso,
  textoParaOAluno,
  textoUltimoAcesso,
  validarAcesso,
  type AcessoDoLogin,
} from "./regras";

// W8b — card "Acesso do aluno" (o profissional cria a senha provisória).
const acesso = (o: Partial<AcessoDoLogin> = {}): AcessoDoLogin => ({
  user_id: "u1", email: "rafa@teste.com", ativo: true, criado_em: null, ultimo_acesso: null, entra_com_google: false, tem_senha: true,
  senha_provisoria: false, bloqueio: null, ...o,
});
const AGORA = Date.parse("2026-09-30T15:00:00Z");

describe("senha provisória gerada", () => {
  it("10 caracteres, letras E números, sem os que se confundem (0 O 1 l I)", () => {
    for (let i = 0; i < 200; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toHaveLength(10);
      expect(s).toMatch(/[A-Za-z]/);
      expect(s).toMatch(/[2-9]/);
      expect(s).not.toMatch(/[0O1lI]/);
      expect(validarAcesso({ email: "", senha: s }, false)).toBeNull();
    }
  });
  it("usa a fonte aleatória que recebe (crypto)", () => {
    let n = 0;
    const fonte = (b: Uint32Array) => {
      b[0] = n++ * 7919;
      return b;
    };
    expect(gerarSenhaProvisoria(12, fonte)).toHaveLength(12);
  });
});

describe("validação e frases", () => {
  it("e-mail só ao criar; senha 8+ com letras e números", () => {
    expect(validarAcesso({ email: "x", senha: "abcd1234" }, true)).toBe("Informe um e-mail válido.");
    expect(validarAcesso({ email: "x", senha: "abcd1234" }, false)).toBeNull();
    expect(validarAcesso({ email: "a@b.co", senha: "abc12" }, true)).toMatch(/8 caracteres/);
    expect(validarAcesso({ email: "a@b.co", senha: "abcdefgh" }, true)).toMatch(/letras e números/);
  });
  it("códigos das RPCs", () => {
    expect(textoErroAcesso("sem_acesso")).toMatch(/não mexe no acesso/);
    expect(textoErroAcesso("email_em_uso")).toMatch(/Já existe uma conta/);
    expect(textoErroAcesso("ja_tem_acesso")).toMatch(/já tem acesso/);
    expect(textoErroAcesso("?", "padrão")).toBe("padrão");
  });
  it("texto para o aluno e último acesso", () => {
    const t = textoParaOAluno({ nome: "Rafael Moura", email: "rafa@teste.com", senha: "Ab3kP9xq2m" });
    expect(t).toContain("Oi, Rafael!");
    expect(t).toContain("Senha provisória: Ab3kP9xq2m");
    expect(t).toContain("No primeiro acesso você cria a sua senha");
    expect(textoUltimoAcesso(null)).toBe("Nunca entrou");
    expect(textoUltimoAcesso("2026-09-30T14:32:00Z", new Date(AGORA))).toBe("hoje, 11:32");
    expect(textoUltimoAcesso("2026-09-29T12:10:00Z", new Date(AGORA))).toBe("ontem, 09:10");
    expect(textoUltimoAcesso("2026-08-12T12:00:00Z", new Date(AGORA))).toBe("12/08/2026");
  });
});

describe("estado do acesso (o chip do card)", () => {
  it("sem login, ativo, provisória, bloqueado por tempo, de vez e desativado", () => {
    expect(estadoDoAcesso({ acesso: null, agora: "" }, AGORA)).toBe("sem");
    expect(estadoDoAcesso({ acesso: acesso(), agora: "" }, AGORA)).toBe("ativo");
    expect(estadoDoAcesso({ acesso: acesso({ senha_provisoria: true }), agora: "" }, AGORA)).toBe("provisoria");
    expect(estadoDoAcesso({ acesso: acesso({ bloqueio: { erros: 5, bloqueado_ate: "2026-09-30T15:04:00Z", bloqueado_de_vez: false } }), agora: "" }, AGORA)).toBe("bloqueado");
    expect(estadoDoAcesso({ acesso: acesso({ bloqueio: { erros: 5, bloqueado_ate: "2026-09-30T14:00:00Z", bloqueado_de_vez: false } }), agora: "" }, AGORA)).toBe("ativo");
    expect(estadoDoAcesso({ acesso: acesso({ bloqueio: { erros: 9, bloqueado_ate: null, bloqueado_de_vez: true } }), agora: "" }, AGORA)).toBe("bloqueado_de_vez");
    expect(estadoDoAcesso({ acesso: acesso({ ativo: false, bloqueio: { erros: 9, bloqueado_ate: null, bloqueado_de_vez: true } }), agora: "" }, AGORA)).toBe("desativado");
  });
});
