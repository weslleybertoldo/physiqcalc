import { Navigate, useSearchParams } from "react-router-dom";

// Rotas antigas do painel (/admin?v=config&u=<id>&ct=treino&wt=volume, ?v=treinos&t=biblioteca, ?v=view&u=…,
// ?v=calculator) → rotas novas com sidebar. Links salvos/magic links continuam funcionando.
const AdminRedirect = () => {
  const [sp] = useSearchParams();
  const v = sp.get("v");
  const u = sp.get("u");
  const passa = (chaves: string[]) => {
    const q = new URLSearchParams();
    chaves.forEach((k) => { const val = sp.get(k); if (val) q.set(k, val); });
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  if (v === "config" && u) return <Navigate to={`/admin/alunos/${u}${passa(["ct", "wt"])}`} replace />;
  if (v === "view" && u) return <Navigate to={`/admin/alunos/${u}?ct=dados`} replace />;
  if (v === "treinos") return <Navigate to={`/admin/treinos${passa(["t", "pasta"])}`} replace />;
  if (v === "calculator") return <Navigate to="/admin/calculadora" replace />;
  return <Navigate to="/admin/alunos" replace />;
};

export default AdminRedirect;
