import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({ situacao: null as unknown, marcar: vi.fn(async () => {}) }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: h.situacao, marcarAvisoMudanca: h.marcar }) }));

import AvisoMudanca from "./AvisoMudanca";

const aviso = (o: Record<string, unknown> = {}) => ({
  publico: "calc", ativo: true, titulo: "O PhysiqCalc agora é o Physiq", texto: "Seu treino continua aqui.", versao: "1", visto: false, ...o,
});

beforeEach(() => h.marcar.mockClear());

describe("aviso 'o Physiq mudou' (NF14)", () => {
  it("aparece uma vez para quem veio do Calc e grava o visto", () => {
    h.situacao = situacao({ aviso_mudanca: aviso() as never });
    render(<AvisoMudanca />);
    expect(screen.getByText("O PhysiqCalc agora é o Physiq")).toBeInTheDocument();
    expect(screen.getByText(/Seus treinos, séries e avaliações continuam aqui/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Entendi" }));
    expect(h.marcar).toHaveBeenCalledWith("1");
    expect(screen.queryByText("O PhysiqCalc agora é o Physiq")).toBeNull();
  });
  it("texto de quem veio do Nutri", () => {
    h.situacao = situacao({ aviso_mudanca: aviso({ publico: "nutri", titulo: "O PhysiqNutri agora faz parte do Physiq" }) as never });
    render(<AvisoMudanca />);
    expect(screen.getByText(/A dieta e o consultório continuam no site do PhysiqNutri/)).toBeInTheDocument();
  });
  it("desligado, já visto ou sem aviso: nada", () => {
    for (const a of [aviso({ ativo: false }), aviso({ visto: true }), null]) {
      h.situacao = situacao({ aviso_mudanca: a as never });
      const r = render(<AvisoMudanca />);
      expect(screen.queryByRole("button", { name: "Entendi" })).toBeNull();
      r.unmount();
    }
  });
});
