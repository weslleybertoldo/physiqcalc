import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Alertas do Dependabot (31/10/2026): zod 3.25 → 4.6.6 (GHSA-mrhx-c7xc-m3w5) e @hookform/resolvers 3.10 → 5.9.2. O alimento próprio usa
// o superRefine (o "Alto demais" vai para o caminho do campo) e o z.record dos "Demais nutrientes": no zod 4 os 2 seguem barrando o
// inválido com a mensagem no campo certo, e o válido grava.
const h = vi.hoisted(() => ({ criar: vi.fn(), atualizar: vi.fn() }));
vi.mock("@/nutricao/editor/lib/alimentos", () => ({ criarAlimento: h.criar, atualizarAlimento: h.atualizar }));

import AlimentoDialog from "./AlimentoDialog";

const montar = () => render(<AlimentoDialog open onOpenChange={vi.fn()} uid="u1" onSalvo={vi.fn()} />);
const preencher = (seletor: string, valor: string) => fireEvent.change(document.querySelector(seletor)!, { target: { value: valor } });
const enviar = () => fireEvent.click(document.querySelector("[data-btn-salvar-alimento]")!);

beforeEach(() => {
  h.criar.mockReset();
  h.atualizar.mockReset();
  h.criar.mockImplementation(async (_u: string, reg: Record<string, unknown>) => ({ id: "al1", ...reg }));
});

describe("Alimento próprio — superRefine e z.record no zod 4", () => {
  it("porção de 1 g com 50 g de proteína: 'Alto demais' no campo da proteína (o caminho do superRefine) e nada grava", async () => {
    montar();
    preencher("[data-campo-nome-alimento]", "Pão de teste");
    preencher("[data-campo-porcao]", "1");
    preencher("[data-campo-proteina]", "50");
    enviar();
    const erro = await screen.findByText(/^Alto demais para 1 g: daria/);
    expect(erro.closest("div")?.querySelector("[data-campo-proteina]")).not.toBeNull();
    expect(h.criar).not.toHaveBeenCalled();
  });

  it("nome de 1 letra e um nutriente com texto: as 2 mensagens (o z.record dos nutrientes) e nada grava", async () => {
    montar();
    preencher("[data-campo-nome-alimento]", "P");
    fireEvent.click(document.querySelector("[data-demais-nutrientes]")!);
    preencher('[data-campo-nutriente="acucares_g"]', "abc");
    enviar();
    expect(await screen.findByText("Informe o nome do alimento")).toBeTruthy();
    const erro = screen.getByText("valor maior ou igual a zero (ex.: 1,5)");
    expect(erro.closest("div")?.querySelector('[data-campo-nutriente="acucares_g"]')).not.toBeNull();
    expect(h.criar).not.toHaveBeenCalled();
  });

  it("válido: grava por 100 g com o nome, a energia e a proteína", async () => {
    montar();
    preencher("[data-campo-nome-alimento]", "Pão caseiro de teste");
    preencher("[data-campo-kcal]", "250");
    preencher("[data-campo-proteina]", "8");
    enviar();
    await waitFor(() => expect(h.criar).toHaveBeenCalledTimes(1));
    expect(h.criar.mock.calls[0][0]).toBe("u1");
    expect(h.criar.mock.calls[0][1]).toMatchObject({ nome: "Pão caseiro de teste", porcao_g: 100, energia_kcal: 250, proteina_g: 8 });
    expect(document.querySelectorAll('[role="alert"]').length).toBe(0);
  });
});
