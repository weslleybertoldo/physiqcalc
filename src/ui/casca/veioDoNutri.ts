// Physiq W28 — as regras da tela "O PhysiqNutri agora é o Physiq" (src/ui/casca/BoasVindasNutri.tsx): onde ela fica leve, quando o
// "Instalar o app Physiq" aparece e o gancho que diz se a pessoa chegou do Nutri (a marca de src/lib/origemNutri.ts).
import { useSyncExternalStore } from "react";
import { assinarMarcaNutri, lerMarcaNutri } from "@/lib/origemNutri";

/** As páginas públicas em que quem chega é, em geral, o paciente respondendo (formulário, diário, cadastro, link antigo). */
const PUBLICAS_DO_PACIENTE = ["/f/", "/d/", "/c/", "/p/"];

/** Nelas a tela vira uma faixa no topo com "Saiba mais" — não atrapalha responder o formulário. */
export function ehPaginaDoPaciente(pathname: string): boolean {
  return PUBLICAS_DO_PACIENTE.some((p) => pathname.startsWith(p));
}

/** "Instalar o app Physiq" (o APK): no navegador do Android; dentro do APK do Physiq e fora do Android, não. */
export function mostraInstalarApp(userAgent: string | null | undefined, nativo: boolean): boolean {
  return !nativo && /Android/i.test(userAgent ?? "");
}

/** A pessoa chegou do site antigo do Nutri nesta sessão e ainda não fechou a tela (atualiza sozinho ao fechar). */
export function useVeioDoNutri(): boolean {
  return useSyncExternalStore(assinarMarcaNutri, lerMarcaNutri, () => null) !== null;
}
