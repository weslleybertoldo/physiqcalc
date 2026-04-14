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
  });
}
