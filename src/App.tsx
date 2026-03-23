import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PWAInstallProvider } from "@/hooks/usePWAInstall";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { isAdminAuthenticated } from "@/components/AdminLoginDialog";
import { setupDeepLinkListener } from "@/lib/capacitorAuth";
import AuthPage from "./pages/AuthPage";
import UserDashboard from "./pages/UserDashboard";
import AdminPanel from "./pages/AdminPanel";
import Index from "./pages/Index";
import TreinosPage from "./pages/TreinosPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Inicializa deep link listener para OAuth no APK
setupDeepLinkListener();

const AppRoutes = () => {
  const { user, loading } = useAuth();
  const [adminMode] = useState(() => isAdminAuthenticated());

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
        {/* Admin panel - password protected */}
        <Route path="/admin" element={<AdminPanel />} />

        {/* Old admin calculator - keep intact, accessible from admin */}
        <Route path="/calculator" element={<Index />} />
        <Route path="/treinos" element={user ? <TreinosPage /> : <AuthPage />} />

        {/* Main routes */}
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
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PWAInstallProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AppRoutes />
            <PWAInstallBanner />
          </TooltipProvider>
        </PWAInstallProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
