import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const h = vi.hoisted(() => ({ usuario: null as unknown, sessao: null as unknown, salvar: vi.fn() }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: h.usuario, sessao: h.sessao }) }));
vi.mock("@/nucleo/senha", async (orig) => ({ ...(await orig<typeof import("@/nucleo/senha")>()), salvarMinhaSenha: (s: string) => h.salvar(s) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AvisoSenhaProvisoria from "./AvisoSenhaProvisoria";

// W8b — "crie a sua senha" logo depois de entrar com a senha provisória que o profissional criou (é uma opção).
const entrar = (metodo: string, sid: string, provisoria = true) => {
  h.usuario = { id: "u1", app_metadata: { role: "paciente", senha_provisoria: provisoria }, user_metadata: { full_name: "Rafael Moura" } };
  h.sessao = { access_token: `c.${b64({ amr: [{ method: metodo, timestamp: 1 }], session_id: sid })}.a` };
};

beforeEach(() => {
  localStorage.clear();
  h.salvar.mockReset();
});

describe("tela 'crie a sua senha'", () => {
  it("aparece depois de entrar com a senha provisória, com o nome e as 2 opções", () => {
    entrar("password", "s1");
    render(<AvisoSenhaProvisoria />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Olá, Rafael")).toBeInTheDocument();
    expect(screen.getByText("Crie a sua senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar minha senha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agora não" })).toBeInTheDocument();
  });
  it("'Agora não' entra no app; o próximo login (outra sessão) mostra de novo", () => {
    entrar("password", "s1");
    const r = render(<AvisoSenhaProvisoria />);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    r.unmount();
    render(<AvisoSenhaProvisoria />);
    expect(screen.queryByRole("dialog")).toBeNull(); // mesma sessão (recarregou a página)
    entrar("password", "s2");
    render(<AvisoSenhaProvisoria />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("valida e grava a senha dela", async () => {
    entrar("password", "s1");
    h.salvar.mockResolvedValue({ ok: true });
    render(<AvisoSenhaProvisoria />);
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "curta" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha senha" }));
    expect(await screen.findByText(/pelo menos 8 caracteres/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "MinhaSenha9" } });
    fireEvent.change(screen.getByLabelText("Repita a senha"), { target: { value: "MinhaSenha9" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar minha senha" }));
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("MinhaSenha9"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("entrou com o Google ou sem senha provisória: nada", () => {
    entrar("oauth", "s1");
    const r = render(<AvisoSenhaProvisoria />);
    expect(screen.queryByRole("dialog")).toBeNull();
    r.unmount();
    entrar("password", "s1", false);
    render(<AvisoSenhaProvisoria />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
