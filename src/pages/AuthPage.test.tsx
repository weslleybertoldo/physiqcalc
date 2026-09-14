import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveRegistro } from "@/lib/rateLimitLogin";

const { signInMock } = vi.hoisted(() => {
  // `__APP_VERSION__` é injetado pelo Vite (define) — no vitest não existe; tem que existir ANTES do import da tela
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "2.127";
  return { signInMock: vi.fn() };
});
// Mock COMPLETO do client (o real exige VITE_SUPABASE_URL e a CI roda sem .env).
// DB_SCHEMA "staging" = a tela mostra o formulário e-mail/senha (em produção é só Google).
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { auth: { signInWithPassword: signInMock } } }));
vi.mock("@/lib/capacitorAuth", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null }));

import AuthPage from "./AuthPage";

const EMAIL = "conta@teste.com";
const ERRO_CREDENCIAL = { error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };

function preencher(senha = "senha-errada") {
  fireEvent.change(screen.getByPlaceholderText("seu@email.com"), { target: { value: EMAIL } });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: senha } });
}

async function tentar(vezes: number) {
  for (let i = 1; i <= vezes; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(i));
  }
}

const registro = () => {
  const bruto = localStorage.getItem(chaveRegistro(EMAIL));
  return bruto ? JSON.parse(bruto) : null;
};

beforeEach(() => {
  localStorage.clear();
  signInMock.mockReset();
});

describe("AuthPage (staging) — rate limit do login e-mail/senha", () => {
  it("3 erros seguidos bloqueiam 1 min: aviso com contador, botão travado e a 4ª tentativa nem chama o Auth", async () => {
    signInMock.mockResolvedValue(ERRO_CREDENCIAL);
    render(<AuthPage />);
    preencher();
    await tentar(2);
    await waitFor(() => expect(screen.getByText("Email ou senha incorretos.")).toBeInTheDocument());
    expect(screen.queryByText(/Muitas tentativas/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument());
    expect(signInMock).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Muitas tentativas/).textContent).toMatch(/(1:00|0:5\d)/);
    expect(screen.queryByText("Email ou senha incorretos.")).toBeNull();

    const botao = screen.getByRole("button", { name: "Aguarde" });
    expect(botao).toBeDisabled();
    fireEvent.submit(botao.closest("form") as HTMLFormElement);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(signInMock).toHaveBeenCalledTimes(3);
    expect(registro()).toMatchObject({ erros: 3 });
    expect(registro().bloqueadoAte).toBeGreaterThan(Date.now());
  });

  it("senha certa apaga o registro de erros do e-mail", async () => {
    localStorage.setItem(chaveRegistro(EMAIL), JSON.stringify({ erros: 2, bloqueadoAte: null, ultimoErro: Date.now() }));
    signInMock.mockResolvedValue({ error: null });
    render(<AuthPage />);
    preencher("senha-certa");
    await tentar(1);
    await waitFor(() => expect(registro()).toBeNull());
  });

  it("bloqueio já gravado aparece ao digitar o e-mail e some sozinho quando o tempo acaba", async () => {
    localStorage.setItem(chaveRegistro(EMAIL), JSON.stringify({ erros: 3, bloqueadoAte: Date.now() + 1200, ultimoErro: Date.now() }));
    render(<AuthPage />);
    preencher();
    expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aguarde" })).toBeDisabled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2300));
    });
    expect(screen.queryByText(/Muitas tentativas/)).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  }, 10000);

  it("erro de rede/servidor mostra aviso genérico e NÃO conta como tentativa", async () => {
    signInMock.mockResolvedValue({ error: { status: 0, name: "AuthRetryableFetchError", message: "fetch failed" } });
    render(<AuthPage />);
    preencher();
    await tentar(1);
    await waitFor(() => expect(screen.getByText("Erro ao processar. Tente novamente.")).toBeInTheDocument());
    expect(registro()).toBeNull();
  });
});
