import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): Configurações › Recebimento — com a leitura dos comprovantes falhando, a tela dizia "0" e "Nenhum comprovante
// aguardando." com Pix esperando a confirmação. Agora: o aviso com "Tentar de novo" e o contador "—".
const h = vi.hoisted(() => ({ resumo: vi.fn() }));
vi.mock("@/nucleo/conta", () => ({
  useConta: () => ({ conta: { id: "c1", nome: "Consultoria Teste", membro_id: "m1" }, situacao: { master: false } }),
}));
vi.mock("@/financeiro/api", async (orig) => ({ ...(await orig<typeof import("@/financeiro/api")>()), buscarResumoDaConta: (c: string) => h.resumo(c) }));
vi.mock("@/components/admin/RecebimentosLista", () => ({ default: () => <div data-testid="chaves-pix" /> }));
vi.mock("@/components/admin/ComprovantePixCard", () => ({ default: ({ item }: { item: { id: string } }) => <div data-comprovante={item.id}>comprovante {item.id}</div> }));
vi.mock("@/integrations/principal/client", () => {
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update"]) cadeia[m] = () => cadeia;
  cadeia.single = async () => ({ data: { id: "c1", nome: "Consultoria Teste", origem: "nova", recebimento_modo: "pix_manual", bloquear_app_inadimplente: false }, error: null });
  return { PRINCIPAL_SCHEMA: "staging", principal: { from: () => cadeia } };
});

import Recebimento from "./Recebimento";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false}>
        <Recebimento />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const contador = () => document.querySelector("[data-recebimento-pendentes-contador]")?.textContent;
const PENDENTE = { id: "p1", aluno: { nome: "Aluno Teste", paciente_id: "a1", treino_user_id: null } };

beforeEach(() => {
  h.resumo.mockReset();
});

describe("Configurações › Recebimento — os comprovantes aguardando (hml-17)", () => {
  it("a leitura falha → o aviso com Tentar de novo e o contador \"—\" (nunca \"Nenhum comprovante aguardando.\"); tocar refaz", async () => {
    h.resumo.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar();
    await waitFor(() => expect(document.querySelector("[data-recebimento-pendentes-erro]")).not.toBeNull());
    expect(screen.getByText("Não deu para carregar os comprovantes")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum comprovante aguardando.")).toBeNull();
    expect(contador()).toBe("—");
    h.resumo.mockResolvedValueOnce({ pendentes: [PENDENTE] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("comprovante p1")).toBeInTheDocument();
    expect(contador()).toBe("1");
    expect(document.querySelector("[data-recebimento-pendentes-erro]")).toBeNull();
  });

  it("controle: nenhum comprovante de verdade → \"Nenhum comprovante aguardando.\" e o contador 0, sem aviso", async () => {
    h.resumo.mockResolvedValueOnce({ pendentes: [] });
    montar();
    expect(await screen.findByText("Nenhum comprovante aguardando.")).toBeInTheDocument();
    expect(contador()).toBe("0");
    expect(document.querySelector("[data-recebimento-pendentes-erro]")).toBeNull();
  });
});
