import { Navigate, Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar, MASTER_ITEMS, MobileNavBar } from "@/components/AppSidebar";

const Carregando = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <p className="text-muted-foreground font-body">Carregando...</p>
  </div>
);

// Layout do MASTER (só o Weslley): gestão dos professores.
const MasterLayout = () => {
  const { user, loading, isMaster, isStaff } = useAuth();
  const isMobile = useIsMobile();
  const location = useLocation();

  if (loading) return <Carregando />;
  if (!user) return <Navigate to="/" replace />;
  if (!isMaster) return <Navigate to={isStaff ? "/admin/alunos" : "/treinos"} replace />;

  return (
    <SidebarProvider defaultOpen={!isMobile}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar items={MASTER_ITEMS} modo="master" />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-muted-foreground/20 px-3 gap-3">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <span className="font-heading text-xs uppercase tracking-widest text-muted-foreground">
              Master · {MASTER_ITEMS.find((i) => (i.url === "/master" ? location.pathname === "/master" : location.pathname.startsWith(i.url)))?.title ?? ""}
            </span>
          </header>
          <main className="flex-1 min-w-0 p-4 sm:p-6 pb-24 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileNavBar items={MASTER_ITEMS} modo="master" />
    </SidebarProvider>
  );
};

export default MasterLayout;
