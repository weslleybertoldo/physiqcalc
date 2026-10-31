import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Alertas do Dependabot (31/10/2026): zod 3.25 → 4.6.6 (GHSA-mrhx-c7xc-m3w5) e @hookform/resolvers 3.10 → 5.9.2. O formulário da
// movimentação valida pelo zodResolver: o inválido é barrado com a mensagem no campo e não grava; o válido grava com o tipo e a forma
// escolhidos (o refine do tipo e da forma deixou de ser type predicate: o resolver 5 tipa a entrada e a saída separadas).
const h = vi.hoisted(() => ({ criarTransacao: vi.fn(), buscar: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ PRINCIPAL_SCHEMA: "staging", principal: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock("@/painel/alunos/api", async (orig) => ({ ...(await orig<typeof import("@/painel/alunos/api")>()), buscarAlunosDoSeletor: h.buscar }));
vi.mock("@/painel/financeiro/dados", async (orig) => ({ ...(await orig<typeof import("@/painel/financeiro/dados")>()), criarTransacao: h.criarTransacao }));

import MovimentacaoDialog from "./MovimentacaoDialog";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false}>
        <MovimentacaoDialog open onOpenChange={vi.fn()} transacao={null} uid="u1" contaId="c1" categorias={[]} onSalvo={vi.fn()} onGerenciarCategorias={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const campo = (nome: string) => document.querySelector(`[data-campo-${nome}]`)!;
const enviar = () => fireEvent.submit(document.querySelector("[data-form-movimentacao]")!);

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.buscar.mockResolvedValue({ itens: [], total: 0 });
  h.criarTransacao.mockImplementation(async (_u: string, _c: string, reg: Record<string, unknown>) => ({ id: "t1", ...reg }));
});

describe("Movimentação — a validação do zod 4 pelo zodResolver 5", () => {
  it("sem descrição e sem valor: as 2 mensagens nos campos e nada grava", async () => {
    montar();
    enviar();
    expect(await screen.findByText("Informe a descrição")).toBeTruthy();
    expect(screen.getByText("Informe um valor maior que zero (ex.: 150,00)")).toBeTruthy();
    expect(h.criarTransacao).not.toHaveBeenCalled();
  });

  it("descrição de 1 letra e valor zero: barrado do mesmo jeito", async () => {
    montar();
    fireEvent.change(campo("descricao"), { target: { value: "a" } });
    fireEvent.change(campo("valor"), { target: { value: "0" } });
    enviar();
    expect(await screen.findByText("Informe a descrição")).toBeTruthy();
    expect(screen.getByText("Informe um valor maior que zero (ex.: 150,00)")).toBeTruthy();
    expect(h.criarTransacao).not.toHaveBeenCalled();
  });

  it("válido: a saída em dinheiro grava com o tipo e a forma escolhidos, sem mensagem de erro", async () => {
    montar();
    fireEvent.click(document.querySelector('[data-tipo-btn="saida"]')!);
    fireEvent.change(campo("metodo"), { target: { value: "dinheiro" } });
    fireEvent.change(campo("descricao"), { target: { value: "Aluguel da sala" } });
    fireEvent.change(campo("valor"), { target: { value: "150" } });
    enviar();
    await waitFor(() => expect(h.criarTransacao).toHaveBeenCalledTimes(1));
    expect(h.criarTransacao.mock.calls[0][2]).toMatchObject({ tipo: "saida", metodo: "dinheiro", descricao: "Aluguel da sala", valor: 150 });
    expect(document.querySelectorAll('[role="alert"]').length).toBe(0);
  });
});
