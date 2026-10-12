import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

// 12/10/2026 — "Montar o meu" (app do aluno) com a categoria "Alongamento e mobilidade": os 9 globais novos (grupo "Alongamento" ou
// "Mobilidade") aparecem num bloco próprio (antes cairiam em "Outros") e o aluno cria um exercício dele nesse bloco com o grupo certo.
// No local e no staging o treino do aluno não abre (o build não tem PowerSync): este é o caso que o E2E não alcança lá.

const GLOBAIS = [
  { id: "g1", nome: "Alongamento Borboleta", grupo_muscular: "Alongamento", emoji: "🏋️", imagem_url: null },
  { id: "g2", nome: "Mobilidade Cervical", grupo_muscular: "Mobilidade", emoji: "🏋️", imagem_url: null },
  { id: "g3", nome: "Supino Reto com Barra", grupo_muscular: "Peitoral", emoji: "🏋️", imagem_url: null },
];

const h = vi.hoisted(() => ({
  execute: vi.fn(async (..._args: unknown[]) => undefined),
  getAll: vi.fn(async (_sql: string): Promise<unknown[]> => []),
}));
vi.mock("@powersync/react", () => ({ usePowerSync: () => ({ execute: h.execute, getAll: h.getAll }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { SheetMeuTreino } from "./SheetMeuTreino";

function montar() {
  return render(
    <ProvedorConfirmar>
      <SheetMeuTreino aberto userId="u1" editar={null} aoFechar={() => {}} />
    </ProvedorConfirmar>,
  );
}

beforeEach(() => {
  h.execute.mockClear();
  h.getAll.mockReset();
  h.getAll.mockImplementation(async (sql: string) => (String(sql).includes("FROM tb_exercicios_usuario") ? [] : GLOBAIS));
});

describe("Montar o meu › Alongamento e mobilidade (12/10/2026)", () => {
  it("os 2 grupos ('Alongamento' e 'Mobilidade') viram um bloco só, 'Alongamento e mobilidade', e nada cai em 'Outros'", async () => {
    montar();
    const bloco = await waitFor(() => {
      const b = document.querySelector<HTMLElement>('[data-bloco="alongamento"]');
      if (!b) throw new Error("sem o bloco");
      return b;
    });
    expect(bloco).toHaveTextContent("Alongamento e mobilidade");
    expect(bloco).toHaveTextContent("2 ex.");
    expect(document.querySelector('[data-bloco="outros"]')).toBeNull();
    expect([...document.querySelectorAll("[data-bloco]")].map((b) => b.getAttribute("data-bloco"))).toEqual(["peito", "alongamento"]);
  });

  it("criar um exercício meu dentro do bloco já vem com o grupo 'Alongamento' (na lista do seletor) e grava com ele", async () => {
    montar();
    fireEvent.click(await screen.findByText("Alongamento e mobilidade"));
    expect(await screen.findByText("Mobilidade Cervical")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Criar exercício em Alongamento e mobilidade/ }));
    const form = document.querySelector<HTMLElement>("[data-novo-exercicio]")!;
    const seletor = within(form).getByRole("combobox", { name: "Grupo muscular" }) as HTMLSelectElement;
    expect(seletor.value).toBe("Alongamento");
    expect([...seletor.options].map((o) => o.value)).toEqual(expect.arrayContaining(["Alongamento", "Mobilidade"]));
    fireEvent.change(within(form).getByRole("textbox", { name: "Nome do exercício novo" }), { target: { value: "Alongamento de panturrilha na parede" } });
    fireEvent.click(within(form).getByRole("button", { name: "Criar" }));
    await waitFor(() => expect(h.execute).toHaveBeenCalled());
    const [sql, params] = h.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO tb_exercicios_usuario");
    expect(params[1]).toBe("Alongamento de panturrilha na parede");
    expect(params[2]).toBe("Alongamento");
  });
});
