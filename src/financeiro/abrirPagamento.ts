// Physiq W1 — abrir a página de pagamento da InfinitePay (e o recibo dela). APK: por cima do app (@capacitor/browser — o Custom Tab; a volta
// é o App Link /perfil da produção ou o "fechou a página"). Site: uma aba nova RESERVADA NO TOQUE (o navegador bloqueia janela aberta
// depois de um await) e levada ao link quando ele chega; bloqueada → a mesma aba (a volta traz o aluno a Pagamentos com a conferência).
// Só abre endereço da InfinitePay (urlDaInfinitePay — o mesmo filtro do servidor).
// W2 (MENOR 9) — o Conectar do Mercado Pago do personal: no site, só a autorização do MP (ehUrlDeAutorizacaoMp: https, host exato e
// /authorization), na MESMA aba (a volta traz de novo para Configurações › Recebimento); no APK, só o SITE do Physiq (host exato) por cima do
// app — o fluxo inteiro (começar, autorizar, confirmar) acontece no navegador, com a sessão do site (decisão 6, revisão I8).
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { urlDaInfinitePay } from "./infinitepay";
import { ehUrlDeAutorizacaoMp } from "./mpConta";

export interface Aba {
  ir(url: string): void;
  fechar(): void;
}

export function reservarAba(): Aba | null {
  if (Capacitor.isNativePlatform()) return null;
  const w = window.open("about:blank", "_blank");
  if (!w) return null;
  try {
    w.opener = null;
  } catch {
    /* noop */
  }
  return {
    ir: (url) => {
      w.location.href = url;
    },
    fechar: () => {
      try {
        w.close();
      } catch {
        /* noop */
      }
    },
  };
}

export async function abrirPagina(url: string, aba: Aba | null, irNaMesmaAba: (u: string) => void = (u) => window.location.assign(u)):
  Promise<"app" | "aba" | "mesma_aba" | "recusado"> {
  const seguro = urlDaInfinitePay(url);
  if (!seguro) {
    aba?.fechar();
    return "recusado";
  }
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: seguro });
    return "app";
  }
  if (aba) {
    aba.ir(seguro);
    return "aba";
  }
  irNaMesmaAba(seguro);
  return "mesma_aba";
}

/** A volta chegou (App Link): fecha a página por cima do app, se ainda estiver aberta. */
export async function fecharPagina(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Browser.close();
  } catch {
    /* já fechada */
  }
}

export async function abrirLinkExterno(url: string | null | undefined): Promise<void> {
  const seguro = urlDaInfinitePay(url);
  if (!seguro) return;
  if (Capacitor.isNativePlatform()) await Browser.open({ url: seguro });
  else window.open(seguro, "_blank", "noopener,noreferrer");
}

// ───────────────────────── W2 — o Conectar do Mercado Pago do personal ─────────────────────────

/** Os sites do Physiq que o APK abre por cima do app (o SITE[schema] da pagamentos-aluno). */
const SITES_DO_PHYSIQ = new Set(["physiqcalc.com.br", "physiqcalc-staging.vercel.app"]);

/** Um endereço do site do Physiq: https, o host EXATO (sem porta, sem outro subdomínio) e sem usuário/senha na URL; senão null. */
export function urlDoSitePhysiq(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 2048) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && SITES_DO_PHYSIQ.has(u.host) && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A navegação da própria aba, num objeto: o teste troca (o jsdom não deixa espiar o window.location). */
export const navegacao = { ir: (url: string): void => window.location.assign(url) };

/** O Conectar no SITE: a autorização do Mercado Pago na mesma aba. No APK, nunca (I8: o APK abre o site — abrirSiteNoApp). */
export function abrirConexaoMp(url: unknown): "site" | "recusado" {
  if (Capacitor.isNativePlatform() || !ehUrlDeAutorizacaoMp(url)) return "recusado";
  navegacao.ir(url);
  return "site";
}

/** O Conectar no APK: o SITE (Configurações › Recebimento ?mp=conectar) no navegador por cima do app. Fora do APK, nada. */
export async function abrirSiteNoApp(url: unknown): Promise<"app" | "recusado"> {
  const seguro = urlDoSitePhysiq(url);
  if (!seguro || !Capacitor.isNativePlatform()) return "recusado";
  await Browser.open({ url: seguro });
  return "app";
}

/** APK: a pessoa fechou o navegador por cima do app (voltou do site) → `f`. Devolve o "parar de ouvir"; fora do APK, nada. */
export function aoFecharONavegador(f: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const ouvinte = Browser.addListener("browserFinished", f).catch(() => null);
  return () => {
    void ouvinte.then((o) => o?.remove()).catch(() => undefined);
  };
}
