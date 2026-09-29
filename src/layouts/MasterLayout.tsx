import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Fallback das páginas antigas do MASTER (W1): o menu e o topo agora são da casca nova
 * (src/master/MasterLayout.tsx); aqui ficou só a guarda de papel das páginas antigas.
 */
const MasterLayout = ({ children }: { children?: ReactNode }) => {
  const { user, loading, isMaster, isStaff } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/entrar" replace />;
  if (!isMaster) return <Navigate to={isStaff ? "/painel" : "/"} replace />;
  return <>{children ?? <Outlet />}</>;
};

export default MasterLayout;
