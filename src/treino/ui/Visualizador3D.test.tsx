import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entrada3D } from "@/lib/visualizador3d/tipos";

const carregar = vi.fn();
const destruir = vi.fn();
vi.mock("@/lib/visualizador3d/motor", () => ({
  criarMotor: vi.fn(() => ({
    carregar, destruir, vista: vi.fn(), camera: vi.fn(), tocar: vi.fn(), fundo: vi.fn(), quadroFixo: vi.fn(), encaixar: vi.fn(),
  })),
}));

import { Visualizador3D } from "./Visualizador3D";

const ENTRADA: Entrada3D = {
  v: "7", movimento: "/exercicios3d/x-7.glb", foto: "/exercicios3d/x-7.webp", bytes: 1, alvos: [15], auxiliares: [2],
  camera: { az: 54, el: 8 }, ida_s: 1.5,
};

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  carregar.mockReset();
  destruir.mockReset();
});

const caixa = (c: HTMLElement) => c.querySelector("[data-ficha-3d]") as HTMLElement;

describe("Visualizador3D", () => {
  it("mostra a foto parada até o 3D ficar pronto", async () => {
    let terminar = () => {};
    carregar.mockImplementation(() => new Promise<void>((ok) => (terminar = ok)));
    const { container } = render(<Visualizador3D entrada={ENTRADA} nome="Agachamento" />);
    expect(screen.getByAltText("Agachamento")).toHaveAttribute("src", ENTRADA.foto);
    await waitFor(() => expect(carregar).toHaveBeenCalled());
    terminar();
    await waitFor(() => expect(caixa(container).dataset["3d"]).toBe("pronto"));
    expect(screen.queryByAltText("Agachamento")).toBeNull();
    expect(screen.getByText("músculo alvo")).toBeInTheDocument();
  });

  it("aparelho sem 3D fica na foto com o aviso", async () => {
    carregar.mockRejectedValue(new Error("sem WebGL"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<Visualizador3D entrada={ENTRADA} nome="Agachamento" />);
    await waitFor(() => expect(caixa(container).dataset["3d"]).toBe("indisponivel"));
    expect(screen.getByText("3D indisponível neste aparelho")).toBeInTheDocument();
    expect(screen.getByAltText("Agachamento")).toBeInTheDocument();
  });

  it("libera o 3D quando a ficha fecha", async () => {
    carregar.mockResolvedValue(undefined);
    const { unmount } = render(<Visualizador3D entrada={ENTRADA} nome="Agachamento" />);
    await waitFor(() => expect(carregar).toHaveBeenCalled());
    unmount();
    expect(destruir).toHaveBeenCalled();
  });
});
