import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ updateUser: vi.fn(), rpc: vi.fn(), refresh: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({
  principal: { auth: { updateUser: h.updateUser, refreshSession: h.refresh }, rpc: h.rpc },
}));

import { adiarNestaSessao, claimsDoToken, entrouComSenha, idDaSessao, precisaCriarSenha, salvarMinhaSenha, temSenhaProvisoria, textoErroSenha } from "./senha";

// W8b: a senha provisória (criada pelo profissional) pede "crie a sua senha" no 1º login com ela — é uma opção.
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (claims: Record<string, unknown>) => `cab.${b64(claims)}.ass`;
const sessao = (metodo: string, sid = "s1") => ({ access_token: token({ amr: [{ method: metodo, timestamp: 1 }], session_id: sid }) });
const aluno = (provisoria: unknown) => ({ id: "u1", app_metadata: { role: "paciente", senha_provisoria: provisoria } });

beforeEach(() => {
  localStorage.clear();
  h.updateUser.mockReset();
  h.rpc.mockReset();
  h.refresh.mockReset();
});

describe("senha provisória — quando a tela aparece", () => {
  it("lê o JWT (amr e session_id)", () => {
    expect(claimsDoToken(sessao("password").access_token)).toMatchObject({ session_id: "s1" });
    expect(claimsDoToken("lixo")).toBeNull();
    expect(entrouComSenha(sessao("password"))).toBe(true);
    expect(entrouComSenha(sessao("oauth"))).toBe(false);
    expect(idDaSessao(sessao("password", "abc"))).toBe("abc");
    expect(temSenhaProvisoria(aluno(true))).toBe(true);
    expect(temSenhaProvisoria(aluno("true"))).toBe(false);
  });
  it("provisória + entrou com senha = aparece; Google, sem marca ou sem sessão = não", () => {
    expect(precisaCriarSenha({ usuario: aluno(true), sessao: sessao("password") })).toBe(true);
    expect(precisaCriarSenha({ usuario: aluno(true), sessao: sessao("oauth") })).toBe(false);
    expect(precisaCriarSenha({ usuario: aluno(false), sessao: sessao("password") })).toBe(false);
    expect(precisaCriarSenha({ usuario: null, sessao: sessao("password") })).toBe(false);
  });
  it("'Agora não' vale só para esta sessão: o próximo login (outra sessão) mostra de novo", () => {
    adiarNestaSessao("u1", "s1");
    expect(precisaCriarSenha({ usuario: aluno(true), sessao: sessao("password", "s1") })).toBe(false);
    expect(precisaCriarSenha({ usuario: aluno(true), sessao: sessao("password", "s2") })).toBe(true);
  });
});

describe("salvarMinhaSenha — grava e tira a marca", () => {
  it("updateUser → minha_senha_definida → sessão nova", async () => {
    h.updateUser.mockResolvedValue({ error: null });
    h.rpc.mockResolvedValue({ data: true, error: null });
    h.refresh.mockResolvedValue({ data: {}, error: null });
    await expect(salvarMinhaSenha("NovaSenha9")).resolves.toEqual({ ok: true });
    expect(h.updateUser).toHaveBeenCalledWith({ password: "NovaSenha9" });
    expect(h.rpc).toHaveBeenCalledWith("minha_senha_definida");
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });
  it("erro do Auth vira frase e não tira a marca", async () => {
    h.updateUser.mockResolvedValue({ error: { message: "New password should be different from the old password." } });
    await expect(salvarMinhaSenha("igual123")).resolves.toEqual({ ok: false, erro: "A nova senha precisa ser diferente da atual." });
    expect(h.rpc).not.toHaveBeenCalled();
    expect(textoErroSenha("boom")).toMatch(/Tente de novo/);
  });
  it("a senha gravou mas tirar a marca falhou: segue ok (a tela volta no próximo login)", async () => {
    h.updateUser.mockResolvedValue({ error: null });
    h.rpc.mockRejectedValue(new Error("rede"));
    await expect(salvarMinhaSenha("NovaSenha9")).resolves.toEqual({ ok: true });
  });
});
