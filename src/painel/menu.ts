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
 * Menu do site do profissional (spec 4.4 e tela 6). A página de cada item é o arquivo `src/painel/paginas/<arquivo>.tsx`
 * (registro por convenção); item sem a página fica escondido (spec 11.1, regra 3). W28: o fallback das páginas antigas do Calc
 * (`antiga`) e o aviso "Use o site do PhysiqNutri" saíram com o legado — todas as páginas do menu são as novas.
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
  /** Candidato à barra de baixo do celular (as 4 primeiras disponíveis). */
  noCelular?: boolean;
  contadorTom?: "neutro" | "destaque";
}

export const MENU_PAINEL: ItemMenuPainel[] = [
  { id: "dashboard", arquivo: "Dashboard", rotulo: "Dashboard", icone: LayoutDashboard, rota: "/painel", modulo: "ambos", grupo: "principal", noCelular: true },
  { id: "alunos", arquivo: "Alunos", rotulo: "Alunos", icone: Users, rota: "/painel/alunos", modulo: "ambos", grupo: "principal", noCelular: true },
  // W23: Treinos é a página nova (src/painel/paginas/Treinos.tsx) — a TreinosAdminPage/AdminTreinos do Calc saiu
  { id: "treinos", arquivo: "Treinos", rotulo: "Treinos", icone: Dumbbell, rota: "/painel/treinos", modulo: "treino", grupo: "principal", noCelular: true },
  { id: "dietas", arquivo: "Dietas", rotulo: "Dietas", icone: Salad, rota: "/painel/dietas", modulo: "nutricao", grupo: "principal", noCelular: true },
  { id: "pre-consulta", arquivo: "PreConsulta", rotulo: "Pré-consulta", icone: ClipboardList, rota: "/painel/pre-consulta", modulo: "ambos", grupo: "principal" },
  { id: "agenda", arquivo: "Agenda", rotulo: "Agenda", icone: CalendarDays, rota: "/painel/agenda", modulo: "ambos", grupo: "principal", noCelular: true },
  { id: "mensagens", arquivo: "Mensagens", rotulo: "Mensagens", icone: MessageCircle, rota: "/painel/mensagens", modulo: "ambos", grupo: "principal", contadorTom: "destaque" },
  { id: "financeiro", arquivo: "Financeiro", rotulo: "Financeiro", icone: Wallet, rota: "/painel/financeiro", modulo: "ambos", grupo: "principal", noCelular: true },
  { id: "configuracoes", arquivo: null, rotulo: "Configurações", icone: Settings, rota: "/painel/configuracoes", modulo: "ambos", grupo: "principal" },
  { id: "modelos", arquivo: "Modelos", rotulo: "Modelos", icone: Bookmark, rota: "/painel/modelos", modulo: "ambos", grupo: "ferramentas" },
  { id: "impressos", arquivo: "Impressos", rotulo: "Impressos", icone: Printer, rota: "/painel/impressos", modulo: "nutricao", grupo: "ferramentas" },
  // W26: as 4 Ferramentas são páginas novas (src/painel/paginas/{Modelos,Impressos,Calculadora,Lixeira}.tsx) — a CalculadoraPage do Calc saiu
  { id: "calculadora", arquivo: "Calculadora", rotulo: "Calculadora", icone: Calculator, rota: "/painel/calculadora", modulo: "ambos", grupo: "ferramentas" },
  { id: "lixeira", arquivo: "Lixeira", rotulo: "Lixeira", icone: Trash2, rota: "/painel/lixeira", modulo: "ambos", grupo: "ferramentas" },
];

/** nova = página registrada (ou montada pela casca, como Configurações) · null = escondido */
export type EstadoItem = "nova" | null;

export function estadoDoItem(item: ItemMenuPainel, modulosConta: readonly Modulo[], temPaginaNova: (arquivo: string) => boolean = (a) => existe("paginasPainel", a)): EstadoItem {
  if (item.modulo !== "ambos" && !modulosConta.includes(item.modulo)) return null;
  if (item.arquivo === null) return "nova";
  return temPaginaNova(item.arquivo) ? "nova" : null;
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
