import { Navigate, useParams } from "react-router-dom";

// /admin/alunos/:id/ver — a visão de leitura do aluno virou a aba "Dados" da engrenagem (pedido do Weslley
// 18/09/2026: "retira [o olho], tudo fica na engrenagem"). Links antigos (magic links, favoritos) continuam valendo.
const AlunoViewPage = () => {
  const { id } = useParams();
  return <Navigate to={id ? `/admin/alunos/${id}?ct=dados` : "/admin/alunos"} replace />;
};

export default AlunoViewPage;
