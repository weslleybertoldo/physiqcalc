let lastErrorTime = 0;
const ERROR_THROTTLE_MS = 5000;

export function setupGlobalErrorHandlers() {
  // Erros síncronos não capturados
  window.addEventListener("error", (event) => {
    console.error("[Global Error]", event.error || event.message);
  });

  // Promises rejeitadas sem catch
  window.addEventListener("unhandledrejection", (event) => {
    const msg = String(event.reason?.message || event.reason || "");

    // Erros de rede — silencioso (offlineSync já trata)
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
      event.preventDefault();
      return;
    }

    // Erros de abort (timeout) — silencioso
    if (msg.includes("AbortError") || msg.includes("aborted")) {
      event.preventDefault();
      return;
    }

    const now = Date.now();
    if (now - lastErrorTime > ERROR_THROTTLE_MS) {
      lastErrorTime = now;
      console.error("[Unhandled Rejection]", event.reason);
    }
  });
}
