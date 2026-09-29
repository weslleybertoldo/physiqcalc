// Código do profissional vindo do link de convite (?prof=PROF-NOME-SOBRENOME).
// Fica no localStorage até o login terminar. Physiq W3: o código vai para o `vincular-aluno` do banco principal (a
// matrícula nasce na conta do profissional — src/nucleo/sessao.tsx); a tela "Tenho um código" das Boas-vindas também
// lê daqui para já vir preenchida.
// W7 (pedido dele, 29/09): com o código guardado, o popup "confirmar o profissional" (src/ui/avisos/AvisoVinculoPendente.tsx)
// abre assim que a pessoa está logada — Cancelar descarta o código. O ?prof= sai da barra de endereço depois de guardado (um
// recarregar não traz de volta o que foi cancelado) e o APK aceita o link com.bertoldo.physiqcalc://…?prof=… (deep link).
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

const KEY = "physiq_prof_pendente";
/** O mesmo nome do src/nucleo/vinculo.ts (aqui sem importar o núcleo: este arquivo roda antes de tudo, no App.tsx). */
const EVENTO = "physiq:prof-pendente";
const ESQUEMA_APK = "com.bertoldo.physiqcalc";

function guardar(bruto: string | null | undefined): string | null {
  const c = (bruto ?? "").trim();
  if (!c) return null;
  const codigo = c.toUpperCase().slice(0, 60);
  try {
    localStorage.setItem(KEY, codigo);
  } catch { /* storage indisponível */ }
  try {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: codigo }));
  } catch { /* sem window */ }
  return codigo;
}

export function capturarProfDaUrl(): string | null {
  try {
    const url = new URL(window.location.href);
    const c = url.searchParams.get("prof");
    if (c && c.trim()) {
      const codigo = guardar(c);
      url.searchParams.delete("prof");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      return codigo;
    }
  } catch { /* storage indisponível */ }
  return null;
}

/** "com.bertoldo.physiqcalc://vincular?prof=PROF-X" → "PROF-X" (null se o link não é de código de profissional). */
export function codigoDoDeepLink(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(`${ESQUEMA_APK}:`)) return null;
  const q = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const c = new URLSearchParams(q).get("prof");
  return c && c.trim() ? c.trim().toUpperCase().slice(0, 60) : null;
}

/** APK: o link que abre o app (frio ou já aberto) com ?prof= guarda o código (o popup abre em seguida). */
export function capturarProfDoDeepLink(): void {
  if (!Capacitor.isNativePlatform()) return;
  try {
    void App.getLaunchUrl().then((r) => {
      const c = codigoDoDeepLink(r?.url);
      if (c) guardar(c);
    }).catch(() => {});
    void App.addListener("appUrlOpen", ({ url }) => {
      const c = codigoDoDeepLink(url);
      if (c) guardar(c);
    });
  } catch { /* sem o plugin */ }
}

export function lerProfPendente(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function limparProfPendente() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
