import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// W1 da loja — a entrada na versão da Google Play: sem "Sou profissional — criar conta" (o cadastro termina em pagar o plano, pelo
// site), sem "Treinar sem profissional" (Play Billing na W6) e sem o "Verificar atualizações" do APK. Sem a flag: igual a hoje.
const h = vi.hoisted(() => {
  (globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "3.53";
  return { loja: false, nativo: true, situacao: { sem_nada: true, nome: "Ana Souza" } as unknown, plano: vi.fn() };
});
vi.mock("@/lib/distribuicao", () => ({
  get ehLoja() {
    return h.loja;
  },
  get DISTRIBUICAO() {
    return h.loja ? "play" : "site";
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") }, registerPlugin: () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "public", supabase: {} }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: vi.fn() } }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));
vi.mock("@/nucleo/sessao", () => ({
  useSessao: () => ({ situacao: h.situacao, usuario: { id: "u1", email: "ana@gmail.com" }, sair: async () => {}, recarregarSituacao: async () => null, entrarComGoogle: async () => ({}) }),
}));
vi.mock("@/app-aluno/sozinho/api", async (orig) => ({ ...(await orig<typeof import("@/app-aluno/sozinho/api")>()), buscarMeuPlano: () => h.plano() }));

import Entrar from "./Entrar";
import BoasVindas from "./BoasVindas";

const abrir = (el: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>,
  );
const cartoes = () => [...document.querySelectorAll("[data-onboarding]")].map((e) => e.getAttribute("data-onboarding"));

beforeEach(() => {
  h.loja = false;
  h.nativo = true;
  h.situacao = { sem_nada: true, nome: "Ana Souza" };
  h.plano.mockReset();
  h.plano.mockResolvedValue({ teste_dias: 7, planos: [{ codigo: "app_treino", nome: "Treino", valor: 29.9, modulos: ["treino"], descricao: null }], matricula: null, com_profissional: false });
});

describe("Entrar — W1 da loja", () => {
  it("na loja (no app): Google e e-mail, sem 'Sou profissional — criar conta' e sem 'Verificar atualizações'", () => {
    h.loja = true;
    abrir(<Entrar />);
    expect(screen.getByRole("button", { name: /Entrar com Google/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Entrar com e-mail e senha/ })).toBeInTheDocument();
    expect(screen.queryByText(/Sou profissional/)).toBeNull();
    expect(document.querySelector("[data-sou-profissional]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Verificar atualizações/ })).toBeNull();
    expect(screen.queryByText(/Baixar a versão/)).toBeNull();
  });

  it("no APK do site: igual a hoje — 'Sou profissional — criar conta' e 'Verificar atualizações'", () => {
    abrir(<Entrar />);
    expect(screen.getByRole("button", { name: /Sou profissional — criar conta/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Verificar atualizações/ })).toBeInTheDocument();
  });
});

describe("Boas-vindas — W1 da loja", () => {
  it("na loja: só 'Tenho um código do meu profissional' (sem 'Treinar sem profissional', sem 'Sou profissional' e sem o 'em breve')", async () => {
    h.loja = true;
    abrir(<BoasVindas />);
    expect(await screen.findByText("Tenho um código do meu profissional")).toBeInTheDocument();
    expect(cartoes()).toEqual(["TenhoCodigo"]);
    expect(screen.queryByText("Treinar sem profissional")).toBeNull();
    expect(screen.queryByText("Sou profissional")).toBeNull();
    expect(screen.queryByText(/DIAS GRÁTIS/)).toBeNull();
    expect(screen.getByText("Sem código? Peça ao seu profissional ou saia e volte depois — a sua conta fica guardada.")).toBeInTheDocument();
    expect(screen.queryByText(/Treine sozinho/)).toBeNull();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });

  it("no site: as 3 opções de hoje, na ordem", async () => {
    abrir(<BoasVindas />);
    expect(await screen.findByText("Treinar sem profissional")).toBeInTheDocument();
    expect(await screen.findByText("Sou profissional")).toBeInTheDocument();
    expect(cartoes()).toEqual(["TenhoCodigo", "TreinarSemProfissional", "CriarConta"]);
    expect(screen.getByText(/Treine sozinho com os dias grátis/)).toBeInTheDocument();
  });
});
