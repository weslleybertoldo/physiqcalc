import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMensalidadeStatus } from "@/hooks/useMensalidadeStatus";

const STORAGE_KEY = "physiq_pendencia_avisada_em";
const hoje = () => new Date().toLocaleDateString("pt-BR"); // 1x por dia, no fuso do aparelho

function jaAvisadoHoje(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === hoje();
  } catch {
    return false;
  }
}

// Aviso na abertura do app quando a mensalidade está pendente (1x por dia —
// "Mais tarde" silencia até o dia seguinte). O status vem do cache leve compartilhado
// com o header (0 chamadas quando o cache vale; 1 chamada `status-lite` fora do caminho crítico).
const PendenciaAviso = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status, pendente } = useMensalidadeStatus(user?.id);
  const [dispensado, setDispensado] = useState(jaAvisadoHoje);

  if (!pendente || dispensado) return null;
  const valor = status?.mensalidade ?? null;

  const fechar = () => {
    try {
      localStorage.setItem(STORAGE_KEY, hoje());
    } catch {
      /* storage indisponível */
    }
    setDispensado(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full space-y-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/15 flex items-center justify-center">
          <CreditCard size={22} className="text-destructive" />
        </div>
        <h3 className="font-heading text-base text-foreground uppercase tracking-wider">Parcela pendente</h3>
        <p className="text-sm text-muted-foreground font-body">
          Você possui uma parcela{valor ? ` de ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""} pendente.
          Regularize pra manter seu acompanhamento em dia.
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={fechar}
            className="flex-1 py-2.5 border border-border text-muted-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:text-foreground transition-colors">
            Mais tarde
          </button>
          <button type="button" onClick={() => { fechar(); navigate("/pagamentos"); }}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors">
            Regularizar agora
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendenciaAviso;
