import { Navigate, useNavigate, useParams } from "react-router-dom";
import AdminUserView from "@/components/AdminUserView";

// /admin/alunos/:id/ver — visão de leitura do aluno (dados + evolução + PDFs)
const AlunoViewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/admin/alunos" replace />;
  return <AdminUserView userId={id} onBack={() => navigate("/admin/alunos")} />;
};

export default AlunoViewPage;
