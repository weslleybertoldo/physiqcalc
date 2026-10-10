import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): com a API caindo, a folha "Cadastros pendentes" ficava ~21 s em "Carregando…" e depois dizia "Nada esperando".
// Agora a falha vira o aviso com "Tentar de novo"; o vazio de verdade continua "Nada esperando".
const h = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), listarPendentes: (c: string) => h.listar(c) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { Pendentes } from "./Pendentes";
import type { ListaAlunos } from "./regras";

const LISTA = { conta: { id: "conta-1" } } as unknown as ListaAlunos;
const PENDENTE = { id: "p1", nome: "Ana Teste", email: "ana@teste.com", telefone: null, nascimento: null, observacoes: null, criado_em: "2026-10-01",
  profissional: { nome: "Lucas" } };

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Pendentes aberto aoMudar={() => {}} lista={LISTA} aoMudou={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.listar.mockReset();
});

describe("Pendentes (hml-17)", () => {
  it("a leitura falha → o aviso com Tentar de novo (nunca \"Nada esperando\"); tocar refaz e mostra a lista", async () => {
    h.listar.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pendentes-erro]")).not.toBeNull());
    expect(screen.getByText("Não deu para carregar os cadastros pendentes")).toBeInTheDocument();
    expect(screen.queryByText("Nada esperando")).toBeNull();
    expect(document.querySelector("[data-pendentes]")?.getAttribute("data-pendentes")).toBe("erro");
    h.listar.mockResolvedValueOnce([PENDENTE]);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Ana Teste")).toBeInTheDocument();
    expect(h.listar).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-pendentes-erro]")).toBeNull();
  });

  it("controle: a lista vazia de verdade → \"Nada esperando\", sem aviso", async () => {
    h.listar.mockResolvedValueOnce([]);
    montar();
    expect(await screen.findByText("Nada esperando")).toBeInTheDocument();
    expect(document.querySelector("[data-pendentes-erro]")).toBeNull();
  });
});
