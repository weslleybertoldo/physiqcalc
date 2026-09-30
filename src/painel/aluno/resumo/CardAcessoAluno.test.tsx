import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ acesso: vi.fn(), criar: vi.fn(), senha: vi.fn() }));
vi.mock("./acesso/api", () => ({ acessoDoAluno: h.acesso, criarAcessoDoAluno: h.criar, criarSenhaNovaDoAluno: h.senha }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CardAcessoAluno from "./CardAcessoAluno";

// W8b — o card "Acesso do aluno" do Resumo (tela 7): o profissional cria o acesso ou uma senha nova (provisória).
const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CardAcessoAluno alunoId="t1" />
    </QueryClientProvider>,
  );
const dados = (acesso: unknown) => ({ paciente_id: "p1", nome: "Rafael Moura", email: "rafa@teste.com", ativo: true, conta_id: "c1", acesso, agora: new Date().toISOString() });

beforeEach(() => {
  h.acesso.mockReset();
  h.criar.mockReset();
  h.senha.mockReset();
});

describe("card Acesso do aluno", () => {
  it("sem login: 'Criar acesso' com o e-mail do cadastro e a senha gerada; depois mostra o que passar ao aluno", async () => {
    h.acesso.mockResolvedValue(dados(null));
    h.criar.mockResolvedValue("u-novo");
    abrir();
    expect(await screen.findByText("SEM ACESSO")).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-acesso-criar]") as HTMLElement);
    const email = await screen.findByLabelText("E-mail (login)");
    expect(email).toHaveValue("rafa@teste.com");
    const senha = screen.getByLabelText(/^Senha provisória/) as HTMLInputElement;
    expect(senha.value).toMatch(/^[A-Za-z2-9]{10}$/);
    fireEvent.click(document.querySelector("[data-senha-aluno-salvar]") as HTMLElement);
    await waitFor(() => expect(h.criar).toHaveBeenCalledWith("p1", "rafa@teste.com", senha.value));
    expect(await screen.findByText("Acesso criado")).toBeInTheDocument();
    expect(screen.getByText(senha.value)).toBeInTheDocument();
  });
  it("com login bloqueado de vez: chip BLOQUEADO, aviso e 'Criar senha nova' destrava (RPC da senha)", async () => {
    h.acesso.mockResolvedValue(dados({
      user_id: "u1", email: "rafa@teste.com", ativo: true, criado_em: null, ultimo_acesso: null, entra_com_google: true, tem_senha: true,
      senha_provisoria: false, bloqueio: { erros: 9, bloqueado_ate: null, bloqueado_de_vez: true },
    }));
    h.senha.mockResolvedValue(undefined);
    abrir();
    expect(await screen.findByText("BLOQUEADO")).toBeInTheDocument();
    expect(screen.getByText(/Bloqueado de vez por tentativas de senha/)).toBeInTheDocument();
    expect(screen.getByText("GOOGLE")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-acesso-acao="senha"]') as HTMLElement);
    expect(await screen.findByText(/a conta estava bloqueada por tentativas, ela é destravada/)).toBeInTheDocument();
    fireEvent.click(document.querySelector("[data-senha-aluno-salvar]") as HTMLElement);
    await waitFor(() => expect(h.senha).toHaveBeenCalledWith("p1", expect.stringMatching(/^[A-Za-z2-9]{10}$/)));
    expect(await screen.findByText("Senha nova criada")).toBeInTheDocument();
  });
  it("senha provisória esperando o aluno trocar", async () => {
    h.acesso.mockResolvedValue(dados({ user_id: "u1", email: "rafa@teste.com", ativo: true, criado_em: null, ultimo_acesso: "2026-09-30T12:00:00Z", senha_provisoria: true, bloqueio: null }));
    abrir();
    expect(await screen.findByText("SENHA PROVISÓRIA")).toBeInTheDocument();
    expect(screen.getByText(/Provisória · ele cria a dele ao entrar/)).toBeInTheDocument();
  });
  it("quem não mexe no acesso vê a frase (sem botão)", async () => {
    h.acesso.mockRejectedValue(new Error("sem_acesso"));
    abrir();
    expect(await screen.findByText("Você não mexe no acesso deste aluno.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Criar/ })).toBeNull();
  });
});
