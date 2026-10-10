import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): Novo aluno › Convidar — com a leitura dos convites falhando, a tela dizia "0" e "Nenhum convite esperando.".
// Agora: o aviso com "Tentar de novo" e o contador "—"; o vazio de verdade continua "Nenhum convite esperando.".
const h = vi.hoisted(() => ({ convites: vi.fn() }));
vi.mock("./api", async (orig) => ({ ...(await orig<typeof import("./api")>()), listarConvites: (c: string) => h.convites(c) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

import { NovoAluno } from "./NovoAluno";
import type { ListaAlunos } from "./regras";

const LISTA = {
  total: 0, itens: [], contagens: { ativos: 0, bloqueados: 0, desativados: 0, excluidas: 0, todos: 0 },
  vagas: { em_uso: 1, limite: 10, origem: "nova", faixa: "f10" },
  conta: { id: "c1", nome: "Consultoria Teste", modulos: ["treino"], origem: "nova", travada: false, dono_nome: null },
  eu: { id: "u1", dono: true, personal: true, nutricionista: false },
  responsaveis: [{ id: "u1", nome: "Eu", papeis: ["personal"], eu: true }],
  tags: [], pendentes: 0, convites_pendentes: 0,
} as unknown as ListaAlunos;
const CONVITE = { id: "v1", email: "aluno@teste.com", status: "pendente", modulos: ["treino"], enviado_em: "2026-10-01T12:00:00Z", responsavel: null };

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false}>
        <NovoAluno aberto aoMudar={() => {}} lista={LISTA} abaInicial="convidar" aoMudou={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.convites.mockReset();
});

describe("Novo aluno › Convidar — os convites pendentes (hml-17)", () => {
  it("a leitura falha → o aviso com Tentar de novo e o contador \"—\" (nunca \"0\" nem \"Nenhum convite esperando.\"); tocar refaz", async () => {
    h.convites.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-convites-erro]")).not.toBeNull());
    expect(screen.getByText("Não deu para carregar os convites")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum convite esperando.")).toBeNull();
    expect(document.querySelector("[data-convites-contador]")?.textContent).toBe("—");
    h.convites.mockResolvedValueOnce([CONVITE]);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("aluno@teste.com")).toBeInTheDocument();
    expect(document.querySelector("[data-convites-contador]")?.textContent).toBe("1");
    expect(document.querySelector("[data-convites-erro]")).toBeNull();
  });

  it("controle: nenhum convite de verdade → \"Nenhum convite esperando.\" e o contador 0, sem aviso", async () => {
    h.convites.mockResolvedValueOnce([]);
    montar();
    expect(await screen.findByText("Nenhum convite esperando.")).toBeInTheDocument();
    expect(document.querySelector("[data-convites-contador]")?.textContent).toBe("0");
    expect(document.querySelector("[data-convites-erro]")).toBeNull();
  });
});
