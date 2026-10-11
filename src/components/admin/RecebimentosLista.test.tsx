// Physiq W1 (jeito 2): as chaves Pix pela função — salvar (normalizada pela tela e pelo servidor), ligar (1 só), excluir com a confirmação
// do app. A função é falsa; o cliente do banco explode se for usado.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { ChaveRecebimento } from "@/financeiro/tipos";

const h = vi.hoisted(() => ({ salvar: vi.fn(), ligar: vi.fn(), excluir: vi.fn(), mudou: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  salvarChavePix: (...a: unknown[]) => h.salvar(...a), ligarChavePix: (...a: unknown[]) => h.ligar(...a), excluirChavePix: (...a: unknown[]) => h.excluir(...a),
}));
vi.mock("@/integrations/principal/client", () => ({ principal: { from: () => { throw new Error("jeito 2: nada de banco na tela"); } } }));

import RecebimentosLista from "./RecebimentosLista";

const K1: ChaveRecebimento = { id: "k1", conta_id: "c1", membro_id: "m1", tipo: "email", chave: "ana@teste.com", favorecido: "Ana", banco: null, ativa: false, criado_em: "2026-10-01T00:00:00Z" };
const montar = (chaves: ChaveRecebimento[] = [K1]) =>
  render(<ProvedorConfirmar><RecebimentosLista contaId="c1" chaves={chaves} podeEditar aoMudar={h.mudou} /></ProvedorConfirmar>);

beforeEach(() => {
  for (const f of [h.salvar, h.ligar, h.excluir, h.mudou]) f.mockReset().mockResolvedValue({ ok: true, chave: { ...K1, id: "k2", ativa: true } });
});

describe("chaves Pix pela função (W1)", () => {
  it("adicionar: valida na tela, manda normalizada e avisa a tela para reler", async () => {
    montar([]);
    fireEvent.click(document.querySelector("[data-btn-adicionar-recebimento]")!);
    await waitFor(() => expect(document.querySelector("[data-pix-tipo]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-pix-tipo]")!, { target: { value: "email" } });
    fireEvent.change(document.querySelector("[data-pix-chave]")!, { target: { value: " Bia@Teste.com " } });
    fireEvent.click(document.querySelector("[data-btn-salvar-pix]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { tipo: "email", chave: "bia@teste.com", favorecido: null, banco: null }));
    await waitFor(() => expect(h.mudou).toHaveBeenCalled());
  });
  it("ligar pela função (o servidor desliga as outras)", async () => {
    montar();
    fireEvent.click(document.querySelector("[data-recebimento-switch]")!);
    await waitFor(() => expect(h.ligar).toHaveBeenCalledWith("c1", "k1", true));
  });
  it("excluir pede a confirmação do app e só então grava", async () => {
    montar();
    fireEvent.click(document.querySelector("[data-btn-excluir-recebimento]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.excluir).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.excluir).toHaveBeenCalledWith("c1", "k1"));
  });
});
