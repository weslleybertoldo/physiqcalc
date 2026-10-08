import { avisarErro } from "./avisoDeErro";

let lastErrorTime = 0;
const ERROR_THROTTLE_MS = 5000;

// hml-10 (H-26, D5): o erro e a promessa que ninguém pegou viram aviso ao Weslley (src/lib/avisoDeErro.ts), depois dos filtros de
// hoje. O avisoDeErro descarta o resto do ruído ("Script error.", ResizeObserver, chunk velho, rede) e segura os repetidos (1 por
// código e no máximo 5 por carregamento) — por isso o aviso não passa pelo limite de 1 log a cada 5 s, que é só do console.
export function setupGlobalErrorHandlers() {
  // Erros síncronos não capturados
  window.addEventListener("error", (event) => {
    console.error("[Global Error]", event.error || event.message);
    avisarErro({ origem: "tela", mensagem: event.error ?? event.message });
  });

  // Promises rejeitadas sem catch
  window.addEventListener("unhandledrejection", (event) => {
    const msg = String(event.reason?.message || event.reason || "");

    // Erros de rede — log leve e suprime (PowerSync/offlineSync já tratam retry)
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
      console.debug("[Network]", msg.slice(0, 120));
      event.preventDefault();
      return;
    }

    // Erros de abort (timeout) — log leve e suprime
    if (msg.includes("AbortError") || msg.includes("aborted")) {
      console.debug("[Abort]", msg.slice(0, 120));
      event.preventDefault();
      return;
    }

    const now = Date.now();
    if (now - lastErrorTime > ERROR_THROTTLE_MS) {
      lastErrorTime = now;
      console.error("[Unhandled Rejection]", event.reason);
    }
    avisarErro({ origem: "promessa", mensagem: event.reason });
  });
}
