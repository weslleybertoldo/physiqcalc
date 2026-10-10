import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { EstadoCarregando } from "@/ui/premium/Estados";

/**
 * Fallback das páginas antigas do MASTER (W1): o menu e o topo agora são da casca nova
 * (src/master/MasterLayout.tsx); aqui ficou só a guarda de papel das páginas antigas.
 */
const MasterLayout = ({ children }: { children?: ReactNode }) => {
  const { user, loading, isMaster, isStaff } = useAuth();
  // hml-18a (H-40, E): o esqueleto enquanto a sessão do Treino chega (antes: a área vazia e a página aparecendo do nada)
  if (loading) return <EstadoCarregando rotulo="Carregando a página" />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (!isMaster) return <Navigate to={isStaff ? "/painel" : "/"} replace />;
  return <>{children ?? <Outlet />}</>;
};

export default MasterLayout;
