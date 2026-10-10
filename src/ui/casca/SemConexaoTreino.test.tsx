import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  auth: { user: null as null | { id: string }, loading: false, isStaff: false, isMaster: false },
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));
// a Biblioteca global (a página antiga do master que ficou, W27) — a que ainda espera a sessão do Treino
vi.mock("@/pages/master/BibliotecaPage", () => ({ default: () => <div>página antiga do Treino</div> }));

import { PaginaMaster } from "@/master/MasterLayout";
import { treinoDaPagina } from "./treinoDaPagina";

const tentar = vi.fn();

function montarBiblioteca() {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={["/master/biblioteca"]}>
      <PaginaMaster id="biblioteca" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tentar.mockClear();
  h.auth = { user: null, loading: false, isStaff: false, isMaster: false };
  h.sessao = { situacao: situacao({ precisa_treino: true, contas: [] }), treino: { estado: "erro", erro: "limite" }, tentarTreinoDeNovo: tentar };
});

describe("treinoDaPagina (W5 — só as páginas do Treino esperam a troca)", () => {
  const base = { temUsuarioTreino: false, temSituacao: true, precisaTreino: true, estado: "aguardando", erro: null };
  it("com a sessão do Treino abre; sem situação vale o Treino (como antes)", () => {
    expect(treinoDaPagina({ ...base, temUsuarioTreino: true })).toEqual({ tipo: "ok" });
    expect(treinoDaPagina({ ...base, temSituacao: false })).toEqual({ tipo: "ok" });
  });
  it("esperando a troca → carregando; falhou → erro; quem não usa o Treino → sem papel", () => {
    expect(treinoDaPagina(base)).toEqual({ tipo: "carregando" });
    expect(treinoDaPagina({ ...base, estado: "trocando" })).toEqual({ tipo: "carregando" });
    expect(treinoDaPagina({ ...base, estado: "erro", erro: "indisponivel" })).toEqual({ tipo: "erro", erro: "indisponivel" });
    expect(treinoDaPagina({ ...base, precisaTreino: false, estado: "desnecessario" })).toEqual({ tipo: "sem-papel" });
  });
});

describe("Biblioteca global (a página do master que usa o Treino) sem o Treino — W28: o AdminLayout antigo saiu", () => {
  it("troca em 429: a página antiga dá lugar a 'Sem conexão com o Treino' com 'Tentar de novo' (1 toque = 1 troca)", () => {
    montarBiblioteca();
    expect(screen.getByText("Sem conexão com o Treino")).toBeInTheDocument();
    expect(screen.getByText(/Muitas tentativas/)).toBeInTheDocument();
    expect(screen.queryByText("página antiga do Treino")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(tentar).toHaveBeenCalledTimes(1);
  });
  it("conflito de conta: conferência do suporte, sem 'Tentar de novo'", () => {
    h.sessao = { ...h.sessao, treino: { estado: "erro", erro: "conflito" } };
    montarBiblioteca();
    expect(screen.getByText("Sua conta precisa de uma conferência")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Tentar de novo/ })).toBeNull();
  });
  it("troca a caminho: esqueleto no lugar da página (nada de tela inteira)", () => {
    h.sessao = { ...h.sessao, treino: { estado: "trocando", erro: null } };
    const { container } = montarBiblioteca();
    expect(container.querySelector("[data-sem-treino='carregando']")).not.toBeNull();
    expect(container.querySelector("[data-carregando-tela]")).toBeNull();
  });
  it("quem não usa o Treino: 'Esta página é do módulo Treino'", () => {
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: false }), treino: { estado: "desnecessario", erro: null } };
    montarBiblioteca();
    expect(screen.getByText("Esta página é do módulo Treino")).toBeInTheDocument();
  });
  it("com a sessão do Treino: a página antiga abre como sempre", async () => {
    h.auth = { user: { id: "t1" }, loading: false, isStaff: true, isMaster: true };
    montarBiblioteca();
    expect(await screen.findByText("página antiga do Treino")).toBeInTheDocument();
  });
});
