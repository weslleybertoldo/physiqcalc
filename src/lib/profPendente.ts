// Código do professor vindo do link de convite (?prof=PROF-NOME-SOBRENOME).
// Fica no localStorage até o login com Google terminar; o useAuth chama vincular-professor no SIGNED_IN.
const KEY = "physiq_prof_pendente";

export function capturarProfDaUrl(): string | null {
  try {
    const c = new URLSearchParams(window.location.search).get("prof");
    if (c && c.trim()) {
      const codigo = c.trim().toUpperCase().slice(0, 60);
      localStorage.setItem(KEY, codigo);
      return codigo;
    }
  } catch { /* storage indisponível */ }
  return null;
}

export function lerProfPendente(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function limparProfPendente() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
