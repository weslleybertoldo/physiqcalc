import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Exercicio } from "../tipos";

vi.mock("@/lib/visualizador3d/motor", () => ({
  criarMotor: vi.fn(() => ({
    carregar: vi.fn(() => new Promise<void>(() => {})),
    destruir: vi.fn(), vista: vi.fn(), camera: vi.fn(), tocar: vi.fn(), fundo: vi.fn(), quadroFixo: vi.fn(), encaixar: vi.fn(),
  })),
}));

import { SheetFicha } from "./SheetFicha";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const exercicio = (extra: Partial<Exercicio>): Exercicio => ({
  id: "sem-3d", nome: "Supino Reto com Barra", grupo_muscular: "Peito", emoji: "", imagem_url: "https://exemplo.com/supino.gif",
  ...extra,
});

// A ficha abre no painel (portal no body).
const na = (seletor: string) => document.body.querySelector(seletor);

describe("SheetFicha", () => {
  it("exercício com 3D abre no boneco 3D, no lugar do GIF", () => {
    // o agachamento é o 1º exercício do manifesto do 3D
    render(<SheetFicha exercicio={exercicio({ id: "f06e45bc-a6c7-4939-92d1-3d6fafa4a534", nome: "Agachamento Livre com Barra" })}
      aoFechar={() => {}} />);
    expect(na("[data-ficha-3d]")).not.toBeNull();
    expect(na("[data-ficha-gif]")).toBeNull();
  });

  it("exercício sem 3D continua com o GIF de hoje", () => {
    render(<SheetFicha exercicio={exercicio({})} aoFechar={() => {}} />);
    expect(na("[data-ficha-gif] img")).toHaveAttribute("src", "https://exemplo.com/supino.gif");
    expect(na("[data-ficha-3d]")).toBeNull();
  });
});
