import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { capturarDestinoDaUrl, capturarLinkDoApp } from "@/lib/linksDoApp";
import StagingGate from "@/components/StagingGate";
import { Rotas } from "@/rotas/Rotas";
import { AbrirLinkDoApp } from "@/ui/casca/AbrirLinkDoApp";
import { AvisosGlobais } from "@/ui/casca/AvisosGlobais";
import { BoasVindasNutri } from "@/ui/casca/BoasVindasNutri";
import { CarregandoTela } from "@/ui/casca/CarregandoTela";
import { FaixaAbrirNoApp } from "@/ui/casca/FaixaAbrirNoApp";
import { MasterSoNoSite } from "@/ui/casca/MasterSoNoSite";
import { criarClienteDeConsultas } from "@/integrations/consultas";

// W1 (Physiq): as rotas agora são montadas pelas cascas novas (src/rotas/Rotas.tsx) — app do aluno
// com 5 abas, site do profissional, master, entrada e páginas públicas — com as telas antigas como
// fallback (spec 11.1) e os redirecionamentos das rotas antigas dos 2 apps (spec 4.8). Code-splitting:
// a abertura do app (TreinosPage e a entrada) segue no JS inicial; painel, master, PDF, gráficos e o SDK
// do Mercado Pago carregam sob demanda.

// hml-12 (H-30, D6): a porta do aceite (os Termos de Uso e a Política, o consentimento de saúde e a trava de idade) — SÓ no build de
// staging até a virada. Na produção o Rollup corta o import() (a porta nem entra no bundle; scripts/ci/sem-texto-legal-novo.sh
// confere). A expressão fica AQUI, direto na condição, sem função no meio (src/publico/legal/guarda.test.ts confere).
const PortaDoAceite = import.meta.env.VITE_DB_SCHEMA === "staging" ? lazy(() => import("@/publico/legal/aceite/PortaDoAceite")) : null;

// hml-17 (H-53): a configuração mora em src/integrations/consultas.ts (o Vitest confere): retry 1 com 1 s (eram 3, até 4 s)
const queryClient = criarClienteDeConsultas();

// Link do profissional (?prof=PROF-NOME-SOBRENOME): guarda ANTES do login; depois do login o popup "confirmar o profissional"
// (W7 — src/ui/avisos/AvisoVinculoPendente.tsx) mostra quem é e só então manda o código para o vincular-aluno. No APK, o link
// com.bertoldo.physiqcalc://…?prof= faz o mesmo.
capturarProfDaUrl();
capturarProfDoDeepLink();
// Inicializa deep link listener para OAuth no APK
setupDeepLinkListener();
// H2: o link do site das páginas do aluno (e-mail, aviso, link colado) — no APK abre o app NA tela do link (App Links; frio ou
// já aberto); no site, quem está sem login entra e volta para a página do link (src/lib/linksDoApp.ts)
capturarLinkDoApp();
capturarDestinoDaUrl();

const AppRoutes = () => {
  const { loading } = useAuth();
  // W3: o login é o do banco principal — os avisos globais ("o Physiq mudou") valem para quem entrou, com ou sem Treino
  const { usuario } = useSessao();
  // Capacitor: refresh sessão ao voltar do background
  useAppLifecycle();

  if (loading) {
    return <CarregandoTela />;
  }

  const rotas = (
    <Suspense fallback={<CarregandoTela />}>
      <Rotas />
    </Suspense>
  );
  const avisos = (
    <>
      {/* janelas globais registradas em src/ui/avisos (ex.: "o Physiq mudou", W3) */}
      {usuario && <AvisosGlobais />}
      {/* H2: no APK, o link do site que abriu o app leva à tela dele */}
      <AbrirLinkDoApp />
    </>
  );

  return (
    // hml-16d: a 7 do React Router grava o endereço dentro de startTransition; o usePaginaNaUrl e as telas de lista contam
    // com a gravação na hora (a busca volta à página 1), como na 6 — por isso sem transição
    <BrowserRouter useTransitions={false}>
      <StagingGate>
        {/* H2: no navegador do Android, "Abrir no app Physiq" no alto das páginas do aluno (e da entrada, se veio de um link delas) */}
        <FaixaAbrirNoApp />
        {/* W28: quem chegou do site antigo do Nutri (logado ou não) — "O PhysiqNutri agora é o Physiq" por cima */}
        <BoasVindasNutri />
        {/* hml-08 (H-22): o painel master é só do site — no app, a conta master sai deste aparelho e vê "Conta master: use o site" */}
        <MasterSoNoSite>
          {/* hml-12 (H-30): quem não aceitou a versão vigente dos textos vê o aceite antes das rotas; os avisos vão à parte e só
              montam sem nada pendente (numa rota livre com pendência, só as rotas) — só no staging */}
          {PortaDoAceite ? (
            <Suspense fallback={<CarregandoTela />}>
              <PortaDoAceite avisos={avisos}>{rotas}</PortaDoAceite>
            </Suspense>
          ) : (
            <>
              {rotas}
              {avisos}
            </>
          )}
        </MasterSoNoSite>
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
