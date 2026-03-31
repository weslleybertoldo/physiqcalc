import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PWAInstallProvider } from "@/hooks/usePWAInstall";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PowerSyncProvider } from "@/lib/powersync/PowerSyncProvider";
import { isAdminAuthenticated } from "@/components/AdminLoginDialog";
import { setupDeepLinkListener } from "@/lib/capacitorAuth";
import AuthPage from "./pages/AuthPage";
import UserDashboard from "./pages/UserDashboard";
import AdminPanel from "./pages/AdminPanel";
import Index from "./pages/Index";
import TreinosPage from "./pages/TreinosPage";
import NotFound from "./pages/NotFound";

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
  const { triggerSync } = useOfflineSync();

  // Capacitor: refresh sessão + re-sync ao voltar do background
  useAppLifecycle(triggerSync);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/calculator" element={<Index />} />
        <Route path="/treinos" element={user ? <TreinosPage /> : <AuthPage />} />
        <Route
          path="/"
          element={user ? <TreinosPage /> : <AuthPage />}
        />
        <Route path="/avaliacao" element={user ? <UserDashboard /> : <AuthPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
