import { useAuth } from "@/hooks/useAuth";
import { useMensalidadeStatus } from "@/hooks/useMensalidadeStatus";
import AlunoBloqueado from "@/components/AlunoBloqueado";

// Cobre a home do aluno quando o master bloqueou os alunos do professor dele (status-lite.bloqueadoPeloMaster).
// Renderizado ao lado do PendenciaAviso pra não mexer na ordem dos hooks da TreinosPage (home intacta — decisão 17).
const BloqueioMasterGate = () => {
  const { user, isStaff } = useAuth();
  const { status } = useMensalidadeStatus(user?.id);
  if (isStaff || !status?.bloqueadoPeloMaster) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-background">
      <AlunoBloqueado />
    </div>
  );
};

export default BloqueioMasterGate;
