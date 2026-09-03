import { lazy, Suspense, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PWAInstallProvider } from "@/hooks/usePWAInstall";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PowerSyncProvider } from "@/lib/powersync/PowerSyncProvider";
// @powersync/tanstack-react-query instalado — hooks (useQuery, useSuspenseQuery)
// ficam disponíveis sem provider adicional (v1.x expõe só hooks)
import { isAdminAuthenticated } from "@/components/AdminLoginDialog";
import { setupDeepLinkListener } from "@/lib/capacitorAuth";
import AuthPage from "./pages/AuthPage";
import TreinosPage from "./pages/TreinosPage";
import StagingGate from "@/components/StagingGate";

// Code-splitting por rota: só a abertura (TreinosPage/AuthPage) entra no JS inicial.
// As demais rotas — e com elas jspdf/autotable (PDF), recharts (gráficos) e o SDK do
// Mercado Pago — carregam sob demanda na 1ª visita; o Service Worker guarda os chunks
// pras próximas. Na 1ª entrada aparece o mesmo "Carregando..." da abertura por um instante.
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Index = lazy(() => import("./pages/Index"));
const PagamentosPage = lazy(() => import("./pages/PagamentosPage"));
const PrivacidadePage = lazy(() => import("./pages/PrivacidadePage"));
const NotFound = lazy(() => import("./pages/NotFound"));

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

// Inicializa deep link listener para OAuth no APK
setupDeepLinkListener();

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const [adminMode] = useState(() => isAdminAuthenticated());
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
        <Route path="/admin" element={<AdminPanel />} />
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
