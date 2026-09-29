import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PWAInstallProvider } from "@/hooks/usePWAInstall";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { BrowserRouter } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { useAppLifecycle } from "@/hooks/useAppLifecycle";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PowerSyncProvider } from "@/lib/powersync/PowerSyncProvider";
// @powersync/tanstack-react-query instalado — hooks (useQuery, useSuspenseQuery)
// ficam disponíveis sem provider adicional (v1.x expõe só hooks)
import { setupDeepLinkListener } from "@/lib/capacitorAuth";
import { capturarProfDaUrl, capturarProfDoDeepLink } from "@/lib/profPendente";
import StagingGate from "@/components/StagingGate";
import { Rotas } from "@/rotas/Rotas";
import { AvisosGlobais } from "@/ui/casca/AvisosGlobais";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";

// W1 (Physiq): as rotas agora são montadas pelas cascas novas (src/rotas/Rotas.tsx) — app do aluno
// com 5 abas, site do profissional, master, entrada e páginas públicas — com as telas antigas como
// fallback (spec 11.1) e os redirecionamentos das rotas antigas dos 2 apps (spec 4.8). Code-splitting:
// a abertura do app (TreinosPage e a entrada) segue no JS inicial; painel, master, PDF, gráficos e o SDK
// do Mercado Pago carregam sob demanda.

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

// Link do profissional (?prof=PROF-NOME-SOBRENOME): guarda ANTES do login; depois do login o popup "confirmar o profissional"
// (W7 — src/ui/avisos/AvisoVinculoPendente.tsx) mostra quem é e só então manda o código para o vincular-aluno. No APK, o link
// com.bertoldo.physiqcalc://…?prof= faz o mesmo.
capturarProfDaUrl();
capturarProfDoDeepLink();
// Inicializa deep link listener para OAuth no APK
setupDeepLinkListener();

const AppRoutes = () => {
  const { loading } = useAuth();
  // W3: o login é o do banco principal — os avisos globais ("o Physiq mudou") valem para quem entrou, com ou sem Treino
  const { usuario } = useSessao();
  // Capacitor: refresh sessão ao voltar do background
  useAppLifecycle();

  if (loading) {
    return <CarregandoTela />;
  }

  return (
    <BrowserRouter>
      <StagingGate>
        <Suspense fallback={<CarregandoTela />}>
          <Rotas />
        </Suspense>
        {/* janelas globais registradas em src/ui/avisos (ex.: "o Physiq mudou", W3) */}
        {usuario && <AvisosGlobais />}
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
