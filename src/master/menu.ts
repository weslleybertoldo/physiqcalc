import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { ArrowLeftRight, Building2, Gem, LayoutGrid, Library, Settings, Smartphone, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Menu do painel master (spec 4.7). Página nova = src/master/paginas/<arquivo>.tsx (W27). As páginas antigas do Calc saíram na
 * W27; só a Biblioteca global (W9/W23) continua sendo a do Calc (`antiga`, com a sessão do Banco do Treino).
 */
export interface ItemMenuMaster {
  id: string;
  arquivo: string;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  antiga?: LazyExoticComponent<ComponentType>;
  noCelular?: boolean;
}

export const MENU_MASTER: ItemMenuMaster[] = [
  { id: "visao-geral", arquivo: "VisaoGeral", rotulo: "Visão geral", icone: LayoutGrid, rota: "/master", noCelular: true },
  { id: "contas", arquivo: "Contas", rotulo: "Contas", icone: Building2, rota: "/master/contas", noCelular: true },
  { id: "alunos", arquivo: "Alunos", rotulo: "Alunos", icone: Users, rota: "/master/alunos", noCelular: true },
  { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "/master/financeiro", noCelular: true },
  { id: "planos", arquivo: "Planos", rotulo: "Planos", icone: Gem, rota: "/master/planos" },
  { id: "integracoes", arquivo: "Integracoes", rotulo: "Integrações", icone: ArrowLeftRight, rota: "/master/integracoes" },
  // W27 (herdados W7b/W8b): os alunos do app sem profissional, os treinos prontos e os pratos prontos
  { id: "app-aluno", arquivo: "AppAluno", rotulo: "App do aluno", icone: Smartphone, rota: "/master/app-do-aluno" },
  { id: "biblioteca", arquivo: "Biblioteca", rotulo: "Biblioteca global", icone: Library, rota: "/master/biblioteca", antiga: lazy(() => import("@/pages/master/BibliotecaPage")) },
  { id: "configuracoes", arquivo: "Configuracoes", rotulo: "Configurações", icone: Settings, rota: "/master/configuracoes" },
];

export function itemMasterAtivo(item: ItemMenuMaster, pathname: string): boolean {
  if (item.rota === "/master") return pathname === "/master" || pathname === "/master/";
  return pathname === item.rota || pathname.startsWith(`${item.rota}/`);
}
