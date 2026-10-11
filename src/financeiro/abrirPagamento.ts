// Physiq W1 — abrir a página de pagamento da InfinitePay (e o recibo dela). APK: por cima do app (@capacitor/browser — o Custom Tab; a volta
// é o App Link /perfil da produção ou o "fechou a página"). Site: uma aba nova RESERVADA NO TOQUE (o navegador bloqueia janela aberta
// depois de um await) e levada ao link quando ele chega; bloqueada → a mesma aba (a volta traz o aluno a Pagamentos com a conferência).
// Só abre endereço da InfinitePay (urlDaInfinitePay — o mesmo filtro do servidor).
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { urlDaInfinitePay } from "./infinitepay";

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
