import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { ArrowLeftRight, Building2, Gem, LayoutGrid, Library, Settings, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Menu do painel master (spec 4.7). Página nova = src/master/paginas/<arquivo>.tsx (W27); enquanto não
 * existe, vale a página antiga do Calc (`antiga`).
 */
export interface ItemMenuMaster {
  id: string;
  arquivo: string;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  antiga: LazyExoticComponent<ComponentType>;
  noCelular?: boolean;
}

export const MENU_MASTER: ItemMenuMaster[] = [
  { id: "visao-geral", arquivo: "VisaoGeral", rotulo: "Visão geral", icone: LayoutGrid, rota: "/master", antiga: lazy(() => import("@/pages/master/VisaoGeralPage")), noCelular: true },
  { id: "contas", arquivo: "Contas", rotulo: "Contas", icone: Building2, rota: "/master/contas", antiga: lazy(() => import("@/pages/master/ProfessoresPage")), noCelular: true },
  { id: "alunos", arquivo: "Alunos", rotulo: "Alunos", icone: Users, rota: "/master/alunos", antiga: lazy(() => import("@/pages/master/AlunosMasterPage")), noCelular: true },
  { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "/master/financeiro", antiga: lazy(() => import("@/pages/master/FinanceiroPage")), noCelular: true },
  { id: "planos", arquivo: "Planos", rotulo: "Planos", icone: Gem, rota: "/master/planos", antiga: lazy(() => import("@/pages/master/PlanosMasterPage")) },
  { id: "integracoes", arquivo: "Integracoes", rotulo: "Integrações", icone: ArrowLeftRight, rota: "/master/integracoes", antiga: lazy(() => import("@/pages/master/IntegracoesPage")) },
  { id: "biblioteca", arquivo: "Biblioteca", rotulo: "Biblioteca global", icone: Library, rota: "/master/biblioteca", antiga: lazy(() => import("@/pages/master/BibliotecaPage")) },
  { id: "configuracoes", arquivo: "Configuracoes", rotulo: "Configurações", icone: Settings, rota: "/master/configuracoes", antiga: lazy(() => import("@/pages/master/ConfiguracoesMasterPage")) },
];

export function itemMasterAtivo(item: ItemMenuMaster, pathname: string): boolean {
  if (item.rota === "/master") return pathname === "/master" || pathname === "/master/";
  return pathname === item.rota || pathname.startsWith(`${item.rota}/`);
}
