import { useNavigate } from "react-router-dom";
import Index from "@/pages/Index";

// /admin/calculadora — calculadora completa para uso avulso (era o card "Cálculo Manual")
const CalculadoraPage = () => {
  const navigate = useNavigate();
  return <Index onBack={() => navigate("/admin/alunos")} />;
};

export default CalculadoraPage;
