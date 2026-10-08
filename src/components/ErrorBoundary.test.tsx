import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTATO_SUPORTE } from "@/nucleo/suporte";

// Physiq hml-10 (H-26 e H-48, D5 · S1) — a tela de erro geral: texto fixo + o código do aviso (a message do erro não aparece mais)
// e 1 aviso por erro (src/lib/avisoDeErro.ts — aqui um falso que devolve o código).
const h = vi.hoisted(() => ({ avisar: vi.fn((_aviso: unknown) => "a1b2c3d4") }));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: h.avisar }));

import { ErrorBoundary } from "./ErrorBoundary";

const MENSAGEM = "falhou para maria.teste@exemplo.com (CPF 123.456.789-09)";

function Bomba({ armada }: { armada: { valor: boolean } }) {
  if (armada.valor) throw new Error(MENSAGEM);
  return <p>tela em pé</p>;
}

function abrir(armada = { valor: true }) {
  render(
    <ErrorBoundary>
      <Bomba armada={armada} />
    </ErrorBoundary>,
  );
  return armada;
}

beforeEach(() => {
  h.avisar.mockClear();
  // o React registra no console o erro que o limite pegou
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary — tela de erro geral (S1)", () => {
  it("texto fixo + o código; a message do erro (com o dado pessoal) não aparece", () => {
    abrir();
    expect(screen.getByRole("heading", { name: "Algo deu errado" })).toBeInTheDocument();
    expect(screen.getByText("Já recebemos o aviso. Tente de novo; se continuar, fale com o suporte.")).toBeInTheDocument();
    const codigo = document.querySelector("[data-codigo-erro]");
    expect(codigo?.getAttribute("data-codigo-erro")).toBe("a1b2c3d4");
    expect(codigo?.textContent).toBe("Código: a1b2c3d4");
    const texto = document.body.textContent ?? "";
    for (const proibido of [MENSAGEM, "maria", "123.456.789-09", "Erro inesperado"]) expect(texto, proibido).not.toContain(proibido);
  });

  it("1 aviso por erro: origem tela, o próprio erro e o lugar 'tela inteira'", () => {
    abrir();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    const aviso = h.avisar.mock.calls[0][0] as { origem: string; mensagem: Error; lugar: string };
    expect(aviso).toEqual({ origem: "tela", mensagem: expect.any(Error), lugar: "tela inteira" });
    expect(aviso.mensagem.message).toBe(MENSAGEM);
  });

  it("'Falar com o suporte' abre o e-mail do suporte com o código no assunto", () => {
    abrir();
    const link = screen.getByRole("link", { name: "Falar com o suporte" });
    expect(link.getAttribute("href")).toBe(`mailto:${CONTATO_SUPORTE}?subject=${encodeURIComponent("Erro no Physiq · código a1b2c3d4")}`);
  });

  it("os botões de hoje continuam: 'Tentar novamente' volta à tela e 'Reiniciar app' aparece a partir da 2ª volta", () => {
    const armada = abrir();
    expect(screen.queryByRole("button", { name: "Reiniciar app" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByRole("button", { name: "Reiniciar app" })).toBeInTheDocument();
    armada.valor = false;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(screen.getByText("tela em pé")).toBeInTheDocument();
    expect(document.querySelector("[data-codigo-erro]")).toBeNull();
  });
});
