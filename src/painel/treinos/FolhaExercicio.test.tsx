import { render } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ExercicioCatalogo } from "./tipos";

vi.mock("@/lib/visualizador3d/motor", () => ({
  criarMotor: vi.fn(() => ({
    carregar: vi.fn(() => new Promise<void>(() => {})),
    destruir: vi.fn(), vista: vi.fn(), camera: vi.fn(), tocar: vi.fn(), fundo: vi.fn(), quadroFixo: vi.fn(), encaixar: vi.fn(),
  })),
}));
vi.mock("./api", () => ({ criarExercicio: vi.fn(), criarMusculo: vi.fn(), salvarExercicio: vi.fn(), subirImagem: vi.fn() }));

import { FolhaExercicio } from "./FolhaExercicio";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const exercicio = (extra: Partial<ExercicioCatalogo>): ExercicioCatalogo => ({
  id: "sem-3d", nome: "Supino Reto com Barra", grupo_muscular: "Peito", emoji: null, tipo: "musculacao",
  imagem_url: "https://exemplo.com/supino.gif", subgrupo: null, dica: null, professor_id: null, padrao_movimento: null,
  equipamento: null, variacao: null, ...extra,
});

const abrir = (ex: ExercicioCatalogo) =>
  render(<FolhaExercicio aberto aoMudar={() => {}} exercicio={ex} somenteLeitura musculos={[]} dono={null} aoSalvo={() => {}} />);

// A folha abre no painel (portal no body).
const na = (seletor: string) => document.body.querySelector(seletor);

describe("FolhaExercicio (Biblioteca do profissional)", () => {
  it("exercício do catálogo com 3D abre no boneco, no lugar da prévia", () => {
    // o agachamento é o 1º exercício do manifesto do 3D
    abrir(exercicio({ id: "f06e45bc-a6c7-4939-92d1-3d6fafa4a534", nome: "Agachamento Livre com Barra" }));
    expect(na("[data-ficha-3d]")).not.toBeNull();
    expect(na("[data-exercicio-previa]")).toBeNull();
  });

  it("exercício sem 3D continua com a prévia da imagem", () => {
    abrir(exercicio({}));
    expect(na("[data-exercicio-previa='1'] img")).toHaveAttribute("src", "https://exemplo.com/supino.gif");
    expect(na("[data-ficha-3d]")).toBeNull();
  });
});
