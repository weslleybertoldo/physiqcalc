import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { ChartLine, Dumbbell, House, Salad, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe } from "@/rotas/registro";
import type { Modulo } from "@/ui/casca/dadosCasca";

/**
 * As 5 abas do app do aluno (spec 4.3, tela 1). A aba nova é `src/app-aluno/abas/<arquivo>.tsx`
 * (registro por convenção); enquanto ela não existe, vale a tela antiga (`antiga`): Evolução → UserDashboard
 * (spec 11.1, regra 3; o Treino antigo saiu na W8). Sem nova e sem antiga, a aba some.
 * Aba sem o módulo do aluno também some (só Treino → sem Dieta; só Nutrição → sem Treino).
 */
export interface AbaApp {
  id: "inicio" | "treino" | "dieta" | "evolucao" | "perfil";
  arquivo: string;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  modulo: Modulo | "ambos";
  antiga?: ComponentType | LazyExoticComponent<ComponentType>;
}

export const ABAS_APP: AbaApp[] = [
  { id: "inicio", arquivo: "Inicio", rotulo: "Início", icone: House, rota: "/", modulo: "ambos" },
  // W8: a aba nova (src/app-aluno/abas/Treino.tsx) substituiu a TreinosPage — o service worker guarda o chunk dela (sem internet)
  { id: "treino", arquivo: "Treino", rotulo: "Treino", icone: Dumbbell, rota: "/treino", modulo: "treino" },
  { id: "dieta", arquivo: "Dieta", rotulo: "Dieta", icone: Salad, rota: "/dieta", modulo: "nutricao" },
  { id: "evolucao", arquivo: "Evolucao", rotulo: "Evolução", icone: ChartLine, rota: "/evolucao", modulo: "ambos", antiga: lazy(() => import("@/pages/UserDashboard")) },
  { id: "perfil", arquivo: "Perfil", rotulo: "Perfil", icone: User, rota: "/perfil", modulo: "ambos" },
];

export type EstadoAba = "nova" | "antiga" | null;

export function estadoDaAba(aba: AbaApp, modulos: readonly Modulo[], temNova: (arquivo: string) => boolean = (a) => existe("abasApp", a)): EstadoAba {
  if (aba.modulo !== "ambos" && !modulos.includes(aba.modulo)) return null;
  if (temNova(aba.arquivo)) return "nova";
  return aba.antiga ? "antiga" : null;
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
