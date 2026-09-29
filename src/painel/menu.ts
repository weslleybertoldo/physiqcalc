import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  Bookmark,
  Calculator,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  LayoutDashboard,
  MessageCircle,
  Printer,
  Salad,
  Settings,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { existe } from "@/rotas/registro";
import type { Modulo } from "@/ui/casca/dadosCasca";

/**
 * Menu do site do profissional (spec 4.4 e tela 6). A página nova de cada item é o arquivo
 * `src/painel/paginas/<arquivo>.tsx` (registro por convenção); enquanto ela não existe, vale a página
 * antiga do Calc (`antiga`) para quem tem Treino, ou o aviso "Use o site do PhysiqNutri por enquanto"
 * para quem só tem Nutrição. Item sem página nova e sem antiga fica escondido (spec 11.1, regra 3).
 */
export type ModuloItem = Modulo | "ambos";

export interface ItemMenuPainel {
  id: string;
  /** Arquivo da página nova em src/painel/paginas (null = a casca monta, como Configurações). */
  arquivo: string | null;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  modulo: ModuloItem;
  grupo: "principal" | "ferramentas";
  antiga?: LazyExoticComponent<ComponentType>;
  /** Candidato à barra de baixo do celular (as 4 primeiras disponíveis). */
  noCelular?: boolean;
  contadorTom?: "neutro" | "destaque";
}

const AlunosPage = lazy(() => import("@/pages/admin/AlunosPage"));
const TreinosAdminPage = lazy(() => import("@/pages/admin/TreinosAdminPage"));
const CobrancaPage = lazy(() => import("@/pages/admin/CobrancaPage"));
const CalculadoraPage = lazy(() => import("@/pages/admin/CalculadoraPage"));

export const MENU_PAINEL: ItemMenuPainel[] = [
  { id: "dashboard", arquivo: "Dashboard", rotulo: "Dashboard", icone: LayoutDashboard, rota: "/painel", modulo: "ambos", grupo: "principal", noCelular: true },
  { id: "alunos", arquivo: "Alunos", rotulo: "Alunos", icone: Users, rota: "/painel/alunos", modulo: "ambos", grupo: "principal", antiga: AlunosPage, noCelular: true },
  { id: "treinos", arquivo: "Treinos", rotulo: "Treinos", icone: Dumbbell, rota: "/painel/treinos", modulo: "treino", grupo: "principal", antiga: TreinosAdminPage, noCelular: true },
  { id: "dietas", arquivo: "Dietas", rotulo: "Dietas", icone: Salad, rota: "/painel/dietas", modulo: "nutricao", grupo: "principal", noCelular: true },
  { id: "pre-consulta", arquivo: "PreConsulta", rotulo: "Pré-consulta", icone: ClipboardList, rota: "/painel/pre-consulta", modulo: "ambos", grupo: "principal" },
  { id: "agenda", arquivo: "Agenda", rotulo: "Agenda", icone: CalendarDays, rota: "/painel/agenda", modulo: "ambos", grupo: "principal", noCelular: true },
  { id: "mensagens", arquivo: "Mensagens", rotulo: "Mensagens", icone: MessageCircle, rota: "/painel/mensagens", modulo: "ambos", grupo: "principal", contadorTom: "destaque" },
  { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "/painel/financeiro", modulo: "ambos", grupo: "principal", antiga: CobrancaPage, noCelular: true },
  { id: "configuracoes", arquivo: null, rotulo: "Configurações", icone: Settings, rota: "/painel/configuracoes", modulo: "ambos", grupo: "principal" },
  { id: "modelos", arquivo: "Modelos", rotulo: "Modelos", icone: Bookmark, rota: "/painel/modelos", modulo: "ambos", grupo: "ferramentas" },
  { id: "impressos", arquivo: "Impressos", rotulo: "Impressos", icone: Printer, rota: "/painel/impressos", modulo: "nutricao", grupo: "ferramentas" },
  { id: "calculadora", arquivo: "Calculadora", rotulo: "Calculadora", icone: Calculator, rota: "/painel/calculadora", modulo: "ambos", grupo: "ferramentas", antiga: CalculadoraPage },
  { id: "lixeira", arquivo: "Lixeira", rotulo: "Lixeira", icone: Trash2, rota: "/painel/lixeira", modulo: "ambos", grupo: "ferramentas" },
];

/** nova = página nova registrada · antiga = página do Calc · nutri = aviso do site do Nutri · null = escondido */
export type EstadoItem = "nova" | "antiga" | "nutri" | null;

export function estadoDoItem(item: ItemMenuPainel, modulosConta: readonly Modulo[], temPaginaNova: (arquivo: string) => boolean = (a) => existe("paginasPainel", a)): EstadoItem {
  if (item.modulo !== "ambos" && !modulosConta.includes(item.modulo)) return null;
  if (item.arquivo === null) return "nova";
  if (temPaginaNova(item.arquivo)) return "nova";
  if (item.antiga) return modulosConta.includes("treino") ? "antiga" : "nutri";
  return null;
}

export function itemAtivo(item: ItemMenuPainel, pathname: string): boolean {
  if (item.rota === "/painel") return pathname === "/painel" || pathname === "/painel/";
  return pathname === item.rota || pathname.startsWith(`${item.rota}/`);
}

export function itemPorId(id: string): ItemMenuPainel | undefined {
  return MENU_PAINEL.find((i) => i.id === id);
}

/** Módulos da conta ativa (sem conta ainda = Treino, como todo profissional do Calc hoje). */
export function modulosDaConta(modulos: Modulo[] | undefined): Modulo[] {
  return modulos && modulos.length ? modulos : ["treino"];
}
