import { ChartLine, Dumbbell, House, Salad, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe } from "@/rotas/registro";
import type { Modulo } from "@/ui/casca/dadosCasca";

/**
 * As 5 abas do app do aluno (spec 4.3, tela 1). A aba é `src/app-aluno/abas/<arquivo>.tsx` (registro por convenção); sem ela, a
 * aba some — o Treino antigo saiu na W8, o UserDashboard (Evolução) na W10 e o fallback das telas antigas (`antiga`) na W28.
 * Aba sem o módulo do aluno também some (só Treino → sem Dieta; só Nutrição → sem Treino).
 */
export interface AbaApp {
  id: "inicio" | "treino" | "dieta" | "evolucao" | "perfil";
  arquivo: string;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  modulo: Modulo | "ambos";
}

export const ABAS_APP: AbaApp[] = [
  { id: "inicio", arquivo: "Inicio", rotulo: "Início", icone: House, rota: "/", modulo: "ambos" },
  // W8: a aba nova (src/app-aluno/abas/Treino.tsx) substituiu a TreinosPage — o service worker guarda o chunk dela (sem internet)
  { id: "treino", arquivo: "Treino", rotulo: "Treino", icone: Dumbbell, rota: "/treino", modulo: "treino" },
  { id: "dieta", arquivo: "Dieta", rotulo: "Dieta", icone: Salad, rota: "/dieta", modulo: "nutricao" },
  // W10: a aba nova (src/app-aluno/abas/Evolucao.tsx) substituiu o UserDashboard (Composição, Evolução e Registros)
  { id: "evolucao", arquivo: "Evolucao", rotulo: "Evolução", icone: ChartLine, rota: "/evolucao", modulo: "ambos" },
  { id: "perfil", arquivo: "Perfil", rotulo: "Perfil", icone: User, rota: "/perfil", modulo: "ambos" },
];

export type EstadoAba = "nova" | null;

export function estadoDaAba(aba: AbaApp, modulos: readonly Modulo[], temNova: (arquivo: string) => boolean = (a) => existe("abasApp", a)): EstadoAba {
  if (aba.modulo !== "ambos" && !modulos.includes(aba.modulo)) return null;
  return temNova(aba.arquivo) ? "nova" : null;
}

export function abasVisiveis(modulos: readonly Modulo[], temNova?: (arquivo: string) => boolean): AbaApp[] {
  return ABAS_APP.filter((a) => estadoDaAba(a, modulos, temNova) !== null);
}

/** Aba de abertura: o Início (W12) ou, antes dele, a primeira aba disponível (o Treino, para o aluno do Calc). */
export function abaDeAbertura(modulos: readonly Modulo[], temNova?: (arquivo: string) => boolean): AbaApp | null {
  return abasVisiveis(modulos, temNova)[0] ?? null;
}

export function abaDaRota(pathname: string): AbaApp["id"] | null {
  if (pathname === "/" || pathname === "") return "inicio";
  const achada = ABAS_APP.find((a) => a.rota !== "/" && (pathname === a.rota || pathname.startsWith(`${a.rota}/`)));
  return achada?.id ?? null;
}
