import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Physiq hml-10 (H-26, D5) — o erro e a promessa que ninguém pegou viram aviso (src/lib/avisoDeErro.ts — aqui um falso), depois
// dos filtros de hoje (rede e abort ficam quietos). O que o avisoDeErro descarta (Script error., ResizeObserver, chunk velho) e a
// trava do carregamento são testados lá.
const h = vi.hoisted(() => ({ avisar: vi.fn((_aviso: unknown) => "a1b2c3d4") }));
vi.mock("./avisoDeErro", () => ({ avisarErro: h.avisar }));

import { setupGlobalErrorHandlers } from "./globalErrorHandler";

/** O evento que o navegador dispara para a promessa rejeitada sem catch (o jsdom não tem o PromiseRejectionEvent). */
function rejeitar(motivo: unknown): Event {
  const evento = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(evento, "reason", { value: motivo });
  window.dispatchEvent(evento);
  return evento;
}

function erroSolto(error: unknown, message: string) {
  window.dispatchEvent(new ErrorEvent("error", { error, message }));
}

beforeAll(() => {
  setupGlobalErrorHandlers();
});

beforeEach(() => {
  h.avisar.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("globalErrorHandler → aviso", () => {
  it("erro solto (evento error): 1 aviso de origem tela com o próprio erro", () => {
    const erro = new TypeError("x is undefined");
    erroSolto(erro, "Uncaught TypeError: x is undefined");
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar).toHaveBeenCalledWith({ origem: "tela", mensagem: erro });
  });

  it("erro sem o objeto (o 'Script error.' de script de outra origem): vai a message, e o avisoDeErro descarta", () => {
    erroSolto(null, "Script error.");
    expect(h.avisar).toHaveBeenCalledWith({ origem: "tela", mensagem: "Script error." });
  });

  it("promessa sem catch: 1 aviso de origem promessa com o motivo", () => {
    const motivo = new Error("falhou ao salvar");
    rejeitar(motivo);
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar).toHaveBeenCalledWith({ origem: "promessa", mensagem: motivo });
  });

  it("rede e abort continuam quietos (filtros de hoje): nenhum aviso e o evento é cancelado", () => {
    for (const motivo of [new TypeError("Failed to fetch"), new TypeError("NetworkError when attempting to fetch resource."), new DOMException("The operation was aborted.", "AbortError")]) {
      expect(rejeitar(motivo).defaultPrevented, motivo.message).toBe(true);
    }
    expect(h.avisar).not.toHaveBeenCalled();
  });

  it("o aviso não espera o limite de 1 log a cada 5 s (a trava do aviso é a do avisoDeErro)", () => {
    rejeitar(new Error("primeira"));
    rejeitar(new Error("segunda"));
    expect(h.avisar).toHaveBeenCalledTimes(2);
  });
});
