import { useNavigate } from "react-router-dom";
import AdminTreinos from "@/components/admin/AdminTreinos";

// /admin/treinos?t=grupos|biblioteca|historico|relatorio (&pasta=<id>)
const TreinosAdminPage = () => {
  const navigate = useNavigate();
  return <AdminTreinos onBack={() => navigate("/admin/alunos")} />;
};

export default TreinosAdminPage;
