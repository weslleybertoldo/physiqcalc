import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chaveRegistro } from "@/lib/rateLimitLogin";

const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.2";
  return { entrarComEmail: vi.fn(), entrarComGoogle: vi.fn(), vincularCodigo: vi.fn(), situacao: null as unknown, pendente: null as string | null };
});
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => h.pendente, limparProfPendente: () => {} }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({
    entrarComEmail: h.entrarComEmail, entrarComGoogle: h.entrarComGoogle, vincularCodigo: h.vincularCodigo, situacao: h.situacao,
    usuario: { id: "u1", email: "rafa@gmail.com" }, sair: async () => {},
  }),
}));

import Entrar from "./Entrar";
import EntrarEmail from "./EntrarEmail";
import BoasVindas from "./BoasVindas";
import TenhoCodigo from "./onboarding/TenhoCodigo";
import { textoErroEntrar } from "./pecas/textos";

const EMAIL = "conta@teste.com";
const ERRO_CREDENCIAL = { erro: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
const abrir = (el: React.ReactNode) => render(<MemoryRouter>{el}</MemoryRouter>);

function preencher(senha = "senha-errada") {
  fireEvent.change(screen.getByPlaceholderText("voce@email.com"), { target: { value: EMAIL } });
  fireEvent.change(screen.getByPlaceholderText("Sua senha"), { target: { value: senha } });
}
async function tentar(vezes: number) {
  for (let i = 1; i <= vezes; i++) {
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(h.entrarComEmail).toHaveBeenCalledTimes(i));
  }
}
const registro = () => {
  const bruto = localStorage.getItem(chaveRegistro(EMAIL));
  return bruto ? JSON.parse(bruto) : null;
};

beforeEach(() => {
  localStorage.clear();
  h.entrarComEmail.mockReset();
  h.entrarComGoogle.mockReset();
  h.vincularCodigo.mockReset();
  h.situacao = null;
  h.pendente = null;
});

describe("Entrar (tela 1)", () => {
  it("Google e e-mail e senha; o link do profissional aparece; 'Sou profissional' avisa que abre em breve", async () => {
    h.pendente = "PROF-LUCAS-FERREIRA";
    h.entrarComGoogle.mockResolvedValue({});
    abrir(<Entrar />);
    expect(screen.getByText("PROF-LUCAS-FERREIRA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Entrar com Google/ }));
    await waitFor(() => expect(h.entrarComGoogle).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: /Entrar com e-mail e senha/ })).toHaveAttribute("href", "/entrar/email");
    fireEvent.click(screen.getByRole("button", { name: /Sou profissional/ }));
    expect(screen.getByText(/O cadastro de profissional abre em breve/)).toBeInTheDocument();
  });
  it("erro do Google vira mensagem", async () => {
    h.entrarComGoogle.mockResolvedValue({ erro: "x" });
    abrir(<Entrar />);
    fireEvent.click(screen.getByRole("button", { name: /Entrar com Google/ }));
    expect(await screen.findByText("Não foi possível abrir o Google. Tente de novo.")).toBeInTheDocument();
  });
});

describe("Entrar com e-mail e senha — o limitador de tentativas de hoje", () => {
  it("3 erros seguidos bloqueiam 1 min: contador, botão travado e a 4ª nem chama o Auth", async () => {
    h.entrarComEmail.mockResolvedValue(ERRO_CREDENCIAL);
    abrir(<EntrarEmail />);
    preencher();
    await tentar(2);
    await waitFor(() => expect(screen.getByText("E-mail ou senha incorretos.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument());
    expect(h.entrarComEmail).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Muitas tentativas/).textContent).toMatch(/(1:00|0:5\d)/);
    const botao = screen.getByRole("button", { name: "Aguarde" });
    expect(botao).toBeDisabled();
    fireEvent.submit(botao.closest("form") as HTMLFormElement);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(h.entrarComEmail).toHaveBeenCalledTimes(3);
    expect(registro()).toMatchObject({ erros: 3 });
  });
  it("senha certa apaga o registro de erros", async () => {
    localStorage.setItem(chaveRegistro(EMAIL), JSON.stringify({ erros: 2, bloqueadoAte: null, ultimoErro: Date.now() }));
    h.entrarComEmail.mockResolvedValue({});
    abrir(<EntrarEmail />);
    preencher("senha-certa");
    await tentar(1);
    await waitFor(() => expect(registro()).toBeNull());
  });
  it("erro de rede não conta como tentativa", async () => {
    h.entrarComEmail.mockResolvedValue({ erro: { status: 0, message: "fetch failed" } });
    abrir(<EntrarEmail />);
    preencher();
    await tentar(1);
    await waitFor(() => expect(screen.getByText("Não foi possível entrar. Tente de novo.")).toBeInTheDocument());
    expect(registro()).toBeNull();
  });
  it("frases do Auth", () => {
    expect(textoErroEntrar({ status: 429 })).toMatch(/Muitas tentativas/);
    expect(textoErroEntrar({ code: "user_banned" })).toMatch(/desativado/);
    expect(textoErroEntrar({ code: "invalid_credentials" })).toBe("E-mail ou senha incorretos.");
    expect(textoErroEntrar(null)).toBe("");
  });
});

describe("Boas-vindas e 'Tenho um código'", () => {
  it("opção do código + 'Sou profissional' em breve (a W4 traz o cadastro)", async () => {
    h.situacao = { sem_nada: true, nome: "Rafael Moura" };
    abrir(<BoasVindas />);
    expect(screen.getByText("Rafael")).toBeInTheDocument();
    expect(await screen.findByText("Tenho um código do meu profissional")).toBeInTheDocument();
    expect(screen.getByText("EM BREVE")).toBeInTheDocument();
  });
  it("código preenchido pelo link; erro do vínculo vira a frase da spec", async () => {
    h.pendente = "PROF-X";
    h.vincularCodigo.mockResolvedValue({ ok: false, erro: "outro_profissional" });
    abrir(<TenhoCodigo />);
    expect(screen.getByDisplayValue("PROF-X")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText("Este aluno já está com outro profissional.")).toBeInTheDocument();
    expect(h.vincularCodigo).toHaveBeenCalledWith("PROF-X");
  });
  it("vínculo feito mostra a confirmação", async () => {
    h.vincularCodigo.mockResolvedValue({ ok: true, profissional: "Lucas Ferreira" });
    abrir(<TenhoCodigo />);
    fireEvent.change(screen.getByPlaceholderText("PROF-NOME-SOBRENOME"), { target: { value: "prof-lucas" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar na lista" }));
    expect(await screen.findByText(/Você entrou na lista de Lucas Ferreira/)).toBeInTheDocument();
  });
});
