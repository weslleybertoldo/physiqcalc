import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Equipamentos da academia (W9 — NF11) sobre o SQLite falso do PowerSync: marcar grava JSON na coluna; nada marcado = NULL.
const h = vi.hoisted(() => ({ academias: [] as { id: string; nome: string; equipamentos: string | null }[], feitos: [] as { sql: string; params: unknown[] }[] }));
const db = {
  getAll: vi.fn(async () => []),
  execute: vi.fn(async (sql: string, params: unknown[] = []) => {
    h.feitos.push({ sql, params });
  }),
};
vi.mock("@powersync/react", () => ({
  usePowerSync: () => db,
  useQuery: () => ({ data: h.academias, isLoading: false }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import SeletorAcademia from "./SeletorAcademia";

const props = { userId: "u1", onTrocar: vi.fn(async () => {}), onSalvar: vi.fn(async () => {}), onCriada: vi.fn() };

beforeEach(() => {
  h.feitos = [];
  h.academias = [{ id: "a1", nome: "Smart Fit", equipamentos: '["barra","halteres"]' }];
});

describe("SeletorAcademia — equipamentos da academia", () => {
  it("mostra os 11 equipamentos com os marcados da academia atual; desmarcar e marcar gravam a lista (JSON)", () => {
    render(<SeletorAcademia {...props} academiaAtual={{ id: "a1", nome: "Smart Fit" }} />);
    expect(document.querySelectorAll("[data-equipamento]")).toHaveLength(11);
    expect(document.querySelector('[data-equipamento="barra"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('[data-equipamento="polia"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("2 de 11 marcados")).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-equipamento="polia"]')!);
    expect(h.feitos.at(-1)).toEqual({ sql: "UPDATE tb_academias SET equipamentos = ? WHERE id = ? AND user_id = ?", params: ['["barra","halteres","polia"]', "a1", "u1"] });
    // o toque seguinte parte do espelho local (não perde o anterior enquanto o SQLite responde)
    fireEvent.click(document.querySelector('[data-equipamento="barra"]')!);
    expect(h.feitos.at(-1)?.params[0]).toBe('["halteres","polia"]');
  });

  it("Limpar = sem filtro (NULL); sem academia escolhida, pede para escolher", () => {
    const { unmount } = render(<SeletorAcademia {...props} academiaAtual={{ id: "a1", nome: "Smart Fit" }} />);
    fireEvent.click(document.querySelector("[data-equipamentos-limpar]")!);
    expect(h.feitos.at(-1)?.params[0]).toBeNull();
    unmount();
    render(<SeletorAcademia {...props} academiaAtual={null} />);
    expect(document.querySelector("[data-equipamento]")).toBeNull();
    expect(screen.getByText("Escolha ou crie a academia para marcar os equipamentos dela.")).toBeInTheDocument();
  });
});
