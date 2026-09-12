import { createContext, useContext } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar, ADMIN_ITEMS, MobileNavBar } from "@/components/AppSidebar";
import PlanoBloqueado from "@/components/PlanoBloqueado";
import { invokeMp } from "@/lib/mpClient";
import { fmtBRL, fmtData, type PlanoStatus } from "@/lib/saasApi";

// Status do plano do professor (isento pro master). Compartilhado com as páginas do Admin via contexto.
const PlanoCtx = createContext<{ status: PlanoStatus | null; recarregar: () => void }>({ status: null, recarregar: () => {} });
export const usePlanoStatus = () => useContext(PlanoCtx);

const Carregando = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <p className="text-muted-foreground font-body">Carregando...</p>
  </div>
);

// Layout do painel do PROFESSOR (e do Admin do master): sidebar + banner de tolerância + trava.
const AdminLayout = () => {
  const { user, loading, isStaff } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();

  const plano = useQuery({
    queryKey: ["plano-status", user?.id],
    queryFn: () => invokeMp<PlanoStatus>("plano-status"),
    enabled: !!user && isStaff,
    staleTime: 60_000,
    retry: 1,
  });

  if (loading) return <Carregando />;
  if (!user) return <Navigate to="/" replace />;
  if (!isStaff) return <Navigate to="/treinos" replace />;

  const status = plano.data ?? null;
  const naAbaPlanos = location.pathname.startsWith("/admin/planos");
  const travado = !!status && !status.isento && status.travado;
  const emTolerancia = !!status && !status.isento && !status.travado && status.diasAtraso !== null && status.diasAtraso >= 0
    && !status.professor.cobranca_pausada && !(status.professor.acesso_liberado_ate && status.professor.acesso_liberado_ate >= status.hoje);
  const valorCiclo = status?.professor.ciclo_valor ?? status?.plano?.valor_mensal ?? null;
  const limite = status?.professor.ciclo_vence_em ? (() => { const d = new Date(`${status.professor.ciclo_vence_em}T00:00:00`); d.setDate(d.getDate() + status.tolerancia); return d.toLocaleDateString("pt-BR"); })() : "";

  return (
    <PlanoCtx.Provider value={{ status, recarregar: () => { void plano.refetch(); } }}>
      <SidebarProvider defaultOpen={!isMobile}>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar items={ADMIN_ITEMS} modo="admin" />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="h-12 flex items-center border-b border-muted-foreground/20 px-3 gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <span className="font-heading text-xs uppercase tracking-widest text-muted-foreground">
                {ADMIN_ITEMS.find((i) => location.pathname.startsWith(i.url))?.title ?? "Admin"}
              </span>
            </header>
            {emTolerancia && (
              <div className="mx-4 mt-4 border border-primary/50 bg-primary/10 p-3 flex flex-wrap items-center gap-3 text-xs font-body text-foreground" data-banner-tolerancia>
                <AlertTriangle size={14} className="text-primary shrink-0" />
                <span className="flex-1 min-w-[200px]">
                  Mensalidade{valorCiclo ? ` de ${fmtBRL(valorCiclo)}` : ""} venceu em {fmtData(status!.professor.ciclo_vence_em)}. Pague até {limite} para não perder o acesso.
                </span>
                {!naAbaPlanos && (
                  <button type="button" onClick={() => navigate("/admin/planos")}
                    className="font-heading uppercase tracking-widest text-[10px] bg-primary text-primary-foreground px-3 py-1.5 hover:bg-primary/90 transition-colors">
                    Pagar
                  </button>
                )}
              </div>
            )}
            <main className="flex-1 min-w-0 p-4 sm:p-6 pb-24 md:pb-6">
              {travado && !naAbaPlanos ? <PlanoBloqueado status={status!} /> : <Outlet />}
            </main>
          </div>
        </div>
        <MobileNavBar items={ADMIN_ITEMS} modo="admin" />
      </SidebarProvider>
    </PlanoCtx.Provider>
  );
};

export default AdminLayout;
