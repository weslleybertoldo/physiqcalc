import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq hml-10 (H-26 e H-48, D5) — /erro-teste, só no build de staging: os botões quebram uma parte (S2, o LimiteDeErro da parte)
// ou a tela inteira (S1, o ErrorBoundary: a rota não usa Carregavel). As mensagens levam dado pessoal FALSO: a tela nunca mostra e
// o aviso (src/lib/avisoDeErro.ts — aqui um falso) é quem limpa.
const h = vi.hoisted(() => ({ avisar: vi.fn((_aviso: unknown) => "a1b2c3d4") }));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: h.avisar }));

import { ErrorBoundary } from "@/components/ErrorBoundary";
import ErroDeTeste from "./ErroDeTeste";

function abrir() {
  return render(
    <MemoryRouter useTransitions={false} initialEntries={["/erro-teste"]}>
      <ErrorBoundary>
        <ErroDeTeste />
      </ErrorBoundary>
    </MemoryRouter>,
  );
}

const mensagemDoAviso = (i = 0) => ((h.avisar.mock.calls[i][0] as { mensagem: Error }).mensagem as Error).message;

beforeEach(() => {
  h.avisar.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/erro-teste — a página que força as telas de erro (staging)", () => {
  it("os 3 botões da prova", () => {
    abrir();
    for (const nome of ["quebrar esta parte", "quebrar a tela", "promessa sem catch"]) {
      expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
    }
  });

  it("'quebrar esta parte': o LimiteDeErro da parte mostra a S2 com o código, o resto da página continua e a message não aparece", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "quebrar esta parte" }));
    expect(screen.getByText("Não deu para abrir esta parte")).toBeInTheDocument();
    expect(document.querySelector("[data-codigo-erro]")?.getAttribute("data-codigo-erro")).toBe("a1b2c3d4");
    expect(screen.getByRole("button", { name: "quebrar a tela" })).toBeInTheDocument();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0][0]).toMatchObject({ origem: "tela", lugar: "erro de teste" });
    // a mensagem leva dado pessoal falso de propósito (quem limpa é o avisoDeErro); a tela não mostra nada dela
    expect(mensagemDoAviso()).toMatch(/@exemplo\.com/);
    expect(document.body.textContent).not.toContain(mensagemDoAviso());
    expect(document.body.textContent).not.toContain("@exemplo.com");
  });

  it("'consertar esta parte' desarma a parte e ela volta", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "quebrar esta parte" }));
    fireEvent.click(screen.getByRole("button", { name: "consertar esta parte" }));
    expect(screen.queryByText("Não deu para abrir esta parte")).toBeNull();
    expect(document.querySelector("[data-parte-de-teste]")).not.toBeNull();
  });

  it("'quebrar a tela': nada pega antes do ErrorBoundary — a S1 toma a tela inteira", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "quebrar a tela" }));
    expect(screen.getByRole("heading", { name: "Algo deu errado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "quebrar esta parte" })).toBeNull();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0][0]).toMatchObject({ origem: "tela", lugar: "tela inteira" });
    expect(mensagemDoAviso()).toMatch(/@exemplo\.com/);
    expect(document.body.textContent).not.toContain("@exemplo.com");
  });
});
