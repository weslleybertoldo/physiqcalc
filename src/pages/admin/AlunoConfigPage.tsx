import { Navigate, useNavigate, useParams } from "react-router-dom";
import AdminUserConfig from "@/components/AdminUserConfig";

// /admin/alunos/:id?ct=dados|geral|dobras|evolucao|registros|plano|treino|historico (&wt=semana|volume) — sem ?ct= abre em Dados
const AlunoConfigPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/admin/alunos" replace />;
  return <AdminUserConfig userId={id} onBack={() => navigate("/admin/alunos")} />;
};

export default AlunoConfigPage;
