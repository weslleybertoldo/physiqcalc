import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PWAInstallProvider } from "@/hooks/usePWAInstall";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PowerSyncProvider } from "@/lib/powersync/PowerSyncProvider";
// @powersync/tanstack-react-query instalado — hooks (useQuery, useSuspenseQuery)
// ficam disponíveis sem provider adicional (v1.x expõe só hooks)
import { setupDeepLinkListener } from "@/lib/capacitorAuth";
import { capturarProfDaUrl } from "@/lib/profPendente";
import AuthPage from "./pages/AuthPage";
import TreinosPage from "./pages/TreinosPage";
import StagingGate from "@/components/StagingGate";

// Code-splitting por rota: só a abertura (TreinosPage/AuthPage) entra no JS inicial.
// As demais rotas — e com elas jspdf/autotable (PDF), recharts (gráficos) e o SDK do
// Mercado Pago — carregam sob demanda na 1ª visita; o Service Worker guarda os chunks
// pras próximas. Na 1ª entrada aparece o mesmo "Carregando..." da abertura por um instante.
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const Index = lazy(() => import("./pages/Index"));
const PagamentosPage = lazy(() => import("./pages/PagamentosPage"));
const PrivacidadePage = lazy(() => import("./pages/PrivacidadePage"));
const NotFound = lazy(() => import("./pages/NotFound"));
// SaaS (12/09/2026): Admin do professor (sidebar) e Master do Weslley
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const MasterLayout = lazy(() => import("./layouts/MasterLayout"));
const AdminRedirect = lazy(() => import("./pages/admin/AdminRedirect"));
const AlunosPage = lazy(() => import("./pages/admin/AlunosPage"));
const AlunoConfigPage = lazy(() => import("./pages/admin/AlunoConfigPage"));
const AlunoViewPage = lazy(() => import("./pages/admin/AlunoViewPage"));
const TreinosAdminPage = lazy(() => import("./pages/admin/TreinosAdminPage"));
const CobrancaPage = lazy(() => import("./pages/admin/CobrancaPage"));
const PlanosPage = lazy(() => import("./pages/admin/PlanosPage"));
const ConfiguracoesPage = lazy(() => import("./pages/admin/ConfiguracoesPage"));
const CalculadoraPage = lazy(() => import("./pages/admin/CalculadoraPage"));
const VisaoGeralPage = lazy(() => import("./pages/master/VisaoGeralPage"));
const ProfessoresPage = lazy(() => import("./pages/master/ProfessoresPage"));
const AlunosMasterPage = lazy(() => import("./pages/master/AlunosMasterPage"));
const FinanceiroPage = lazy(() => import("./pages/master/FinanceiroPage"));
const PlanosMasterPage = lazy(() => import("./pages/master/PlanosMasterPage"));
const IntegracoesPage = lazy(() => import("./pages/master/IntegracoesPage"));
const BibliotecaPage = lazy(() => import("./pages/master/BibliotecaPage"));
const ConfiguracoesMasterPage = lazy(() => import("./pages/master/ConfiguracoesMasterPage"));

const Carregando = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <p className="text-muted-foreground font-body">Carregando...</p>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min — evita refetch desnecessário
      gcTime: 1000 * 60 * 60 * 24, // 24h — cache offline
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false,
      networkMode: "offlineFirst",
    },
    mutations: {
      retry: 1,
      networkMode: "offlineFirst",
    },
  },
});

// Link do professor (?prof=PROF-NOME-SOBRENOME): guarda ANTES do login com Google;
// o useAuth vincula no SIGNED_IN (edge vincular-professor).
capturarProfDaUrl();
// Inicializa deep link listener para OAuth no APK
setupDeepLinkListener();

const AppRoutes = () => {
  const { user, loading } = useAuth();
  // Capacitor: refresh sessão ao voltar do background
  useAppLifecycle();

  if (loading) {
    return <Carregando />;
  }

  return (
    <BrowserRouter>
      <StagingGate>
      <Suspense fallback={<Carregando />}>
      <Routes>
        {/* Admin do PROFESSOR (o master também tem o dele) — guarda por papel no layout */}
        <Route path="/admin" element={<AdminRedirect />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/alunos" element={<AlunosPage />} />
          <Route path="/admin/alunos/:id" element={<AlunoConfigPage />} />
          <Route path="/admin/alunos/:id/ver" element={<AlunoViewPage />} />
          <Route path="/admin/treinos" element={<TreinosAdminPage />} />
          <Route path="/admin/cobranca" element={<CobrancaPage />} />
          <Route path="/admin/planos" element={<PlanosPage />} />
          <Route path="/admin/configuracoes" element={<ConfiguracoesPage />} />
          <Route path="/admin/calculadora" element={<CalculadoraPage />} />
        </Route>
        {/* Master (só o Weslley) */}
        <Route element={<MasterLayout />}>
          <Route path="/master" element={<VisaoGeralPage />} />
          <Route path="/master/professores" element={<ProfessoresPage />} />
          <Route path="/master/alunos" element={<AlunosMasterPage />} />
          <Route path="/master/financeiro" element={<FinanceiroPage />} />
          <Route path="/master/planos" element={<PlanosMasterPage />} />
          <Route path="/master/integracoes" element={<IntegracoesPage />} />
          <Route path="/master/biblioteca" element={<BibliotecaPage />} />
          <Route path="/master/configuracoes" element={<ConfiguracoesMasterPage />} />
        </Route>
        <Route path="/calculator" element={<Index />} />
        <Route path="/treinos" element={user ? <TreinosPage /> : <AuthPage />} />
        <Route
          path="/"
          element={user ? <TreinosPage /> : <AuthPage />}
        />
        <Route path="/avaliacao" element={user ? <UserDashboard /> : <AuthPage />} />
        <Route path="/pagamentos" element={user ? <PagamentosPage /> : <AuthPage />} />
        <Route path="/privacidade" element={<PrivacidadePage />} />
        <Route path="/termos" element={<PrivacidadePage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </StagingGate>
    </BrowserRouter>
  );
};

const App = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PowerSyncProvider>
          <PWAInstallProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
              <PWAInstallBanner />
            </TooltipProvider>
          </PWAInstallProvider>
          </PowerSyncProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
