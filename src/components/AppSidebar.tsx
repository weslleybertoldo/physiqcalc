import type { ComponentType } from "react";
import { Users, Dumbbell, DollarSign, Gem, Settings, Calculator, LogOut, LayoutGrid, UserCog, ArrowLeftRight, Library, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

export type NavItem = { title: string; url: string; icon: ComponentType<{ className?: string }>; badge?: number | string };

// Admin = painel do PROFESSOR (o master também tem o dele: seus alunos, como sempre foi)
export const ADMIN_ITEMS: NavItem[] = [
  { title: "Alunos", url: "/admin/alunos", icon: Users },
  { title: "Treinos", url: "/admin/treinos", icon: Dumbbell },
  { title: "Cobrança", url: "/admin/cobranca", icon: DollarSign },
  { title: "Planos", url: "/admin/planos", icon: Gem },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
];

// Master = gestão dos professores (só o Weslley)
export const MASTER_ITEMS: NavItem[] = [
  { title: "Visão geral", url: "/master", icon: LayoutGrid },
  { title: "Professores", url: "/master/professores", icon: UserCog },
  { title: "Alunos", url: "/master/alunos", icon: Users },
  { title: "Financeiro", url: "/master/financeiro", icon: DollarSign },
  { title: "Planos", url: "/master/planos", icon: Gem },
  { title: "Integrações", url: "/master/integracoes", icon: ArrowLeftRight },
  { title: "Biblioteca global", url: "/master/biblioteca", icon: Library },
  { title: "Configurações", url: "/master/configuracoes", icon: Settings },
];

const btnBase = "font-heading uppercase tracking-wider text-xs rounded-none border-l-2 h-10";

// Celular: trilho de ícones fixo embaixo (decisão do Weslley: "navegação lateral… no celular vira trilho de ícones").
// A sidebar do shadcn no mobile é um drawer (hambúrguer); este trilho é o atalho de 1 toque.
export function MobileNavBar({ items, modo }: { items: NavItem[]; modo: "admin" | "master" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (url: string) => (url === "/master" ? location.pathname === "/master" : location.pathname.startsWith(url));
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-muted-foreground/20 bg-background/95 backdrop-blur md:hidden" data-mobile-nav>
      <div className="flex overflow-x-auto no-scrollbar">
        {items.map((it) => {
          const ativo = isActive(it.url);
          return (
            <button key={it.url} type="button" onClick={() => navigate(it.url)} title={it.title}
              data-nav={it.url}
              className={`flex-1 min-w-[64px] flex flex-col items-center gap-0.5 py-2 text-[9px] font-heading uppercase tracking-wider border-t-2 transition-colors ${
                ativo ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}>
              <it.icon className="h-4 w-4" />
              <span className="truncate max-w-[60px]">{it.title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function AppSidebar({ items, modo, badges }: { items: NavItem[]; modo: "admin" | "master"; badges?: Record<string, number | string | undefined> }) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  // No celular a sidebar é um drawer (Sheet) e o `state` do provider fica "collapsed" (defaultOpen={!isMobile}):
  // sem o `!isMobile` o drawer abria só com ícones, sem os nomes (pedido do Weslley 18/09/2026).
  const collapsed = state === "collapsed" && !isMobile;
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const go = (url: string) => {
    navigate(url);
    if (isMobile) setOpenMobile(false);
  };
  const isActive = (url: string) => (url === "/master" ? location.pathname === "/master" : location.pathname.startsWith(url));
  const nome = (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name
    || (user?.user_metadata as { name?: string } | undefined)?.name || user?.email || "";

  return (
    <Sidebar collapsible="icon" className="border-r border-muted-foreground/20">
      <SidebarContent className="flex flex-col h-full bg-sidebar">
        <div className="p-4">
          <span className="font-heading text-lg text-foreground tracking-tight">
            {collapsed ? <>P<span className="text-primary">C</span></> : <>PHYSIQ<span className="text-primary">CALC</span></>}
          </span>
          {!collapsed && (
            <p className="text-[10px] text-muted-foreground font-body mt-1 uppercase tracking-wider truncate" title={nome}>
              {modo === "master" ? "Master" : "Professor"} · {nome}
            </p>
          )}
        </div>
        <SidebarGroup className="flex-1">
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const badge = badges?.[it.url] ?? it.badge;
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton
                      onClick={() => go(it.url)}
                      tooltip={it.title}
                      isActive={isActive(it.url)}
                      data-nav={it.url}
                      className={`${btnBase} ${isActive(it.url) ? "border-primary text-primary bg-primary/10 data-[active=true]:bg-primary/10 data-[active=true]:text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      <it.icon className="h-4 w-4" />
                      {!collapsed && <span>{it.title}</span>}
                      {!collapsed && badge !== undefined && badge !== 0 && (
                        <span className="ml-auto text-[10px] font-body px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">{badge}</span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="p-2 border-t border-muted-foreground/20">
          <SidebarMenu>
            {modo === "admin" && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => go("/admin/calculadora")} tooltip="Cálculo manual" className={`${btnBase} border-transparent text-muted-foreground text-[11px]`}>
                  <Calculator className="h-4 w-4" />
                  {!collapsed && <span>Cálculo manual</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => go("/treinos")} tooltip="Meu treino" className={`${btnBase} border-transparent text-muted-foreground text-[11px]`}>
                <Home className="h-4 w-4" />
                {!collapsed && <span>Meu treino</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut} tooltip="Sair" className={`${btnBase} border-transparent text-muted-foreground hover:text-destructive text-[11px]`}>
                <LogOut className="h-4 w-4" />
                {!collapsed && <span>Sair</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
