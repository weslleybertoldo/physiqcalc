import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  entrar: vi.fn(),
  plano: vi.fn(),
  recarregar: vi.fn(async () => null),
  navegar: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn() } }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ situacao: { sem_nada: true, nome: "Ana Souza" }, usuario: { id: "u1", email: "ana@gmail.com" }, sair: async () => {}, recarregarSituacao: h.recarregar }),
}));
vi.mock("@/app-aluno/sozinho/api", async (orig) => ({
  ...(await orig<typeof import("@/app-aluno/sozinho/api")>()),
  buscarMeuPlano: () => h.plano(),
  entrarSemProfissional: (o: string, p: string) => h.entrar(o, p),
}));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => h.navegar }));

import TreinarSemProfissional from "./TreinarSemProfissional";
import BoasVindas from "../BoasVindas";

const PLANOS = {
  teste_dias: 7,
  planos: [
    { codigo: "app_treino", nome: "Treino", valor: 29.9, modulos: ["treino"], descricao: "Monte o seu treino ou use um treino pronto." },
    { codigo: "app_treino_alimentacao", nome: "Treino + Alimentação", valor: 49.9, modulos: ["treino", "nutricao"], descricao: "Mais os pratos prontos." },
  ],
  matricula: null,
  com_profissional: false,
};

const abrir = (el: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.entrar.mockReset();
  h.plano.mockReset();
  h.recarregar.mockClear();
  h.navegar.mockReset();
  h.plano.mockResolvedValue(PLANOS);
});

describe("Boas-vindas › Treinar sem profissional (W7b)", () => {
  it("aparece entre o código e o 'Sou profissional', com os dias grátis e o menor preço", async () => {
    abrir(<BoasVindas />);
    expect(await screen.findByText("Treinar sem profissional")).toBeInTheDocument();
    const cartoes = [...document.querySelectorAll("[data-onboarding]")].map((e) => e.getAttribute("data-onboarding"));
    expect(cartoes).toEqual(["TenhoCodigo", "TreinarSemProfissional", "CriarConta"]);
    expect(await screen.findByText(/a partir de R\$ 29,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText("7 DIAS GRÁTIS")).toBeInTheDocument();
  });

  it("objetivo + plano → entra no app com os dias grátis e abre os treinos prontos", async () => {
    h.entrar.mockResolvedValue({ paciente_id: "p1", teste_ate: "2026-10-07T02:59:59Z", ja_era: false });
    abrir(<TreinarSemProfissional />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    expect(await screen.findByText("R$ 49,90/mês")).toBeInTheDocument();
    // sem objetivo: pede
    fireEvent.click(screen.getByRole("button", { name: /Começar os 7 dias grátis/ }));
    expect(await screen.findByText("Escolha o seu objetivo.")).toBeInTheDocument();
    expect(h.entrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: /Ganhar massa/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Treino \+ Alimentação/ }));
    fireEvent.click(screen.getByRole("button", { name: /Começar os 7 dias grátis/ }));
    await waitFor(() => expect(h.entrar).toHaveBeenCalledWith("ganhar_massa", "app_treino_alimentacao"));
    expect(await screen.findByText(/Pronto! Grátis até 06\/10/)).toBeInTheDocument();
    expect(h.recarregar).toHaveBeenCalled();
    await waitFor(() => expect(h.navegar).toHaveBeenCalledWith("/perfil/treinos-prontos?inicio=1", { replace: true }), { timeout: 3000 });
  });

  it("recusa do banco vira a frase (ex.: já está com um profissional)", async () => {
    const { ErroApp } = await import("@/app-aluno/sozinho/api");
    h.entrar.mockRejectedValue(new ErroApp("com_profissional"));
    abrir(<TreinarSemProfissional />);
    fireEvent.click(screen.getByRole("button", { name: "Quero treinar sozinho" }));
    fireEvent.click(await screen.findByRole("radio", { name: /Emagrecer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Começar os 7 dias grátis/ }));
    expect(await screen.findByText("Você já está com um profissional — o seu plano é o dele.")).toBeInTheDocument();
    expect(h.navegar).not.toHaveBeenCalled();
  });
});
