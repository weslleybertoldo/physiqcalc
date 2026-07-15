import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { invokeMp, MpStatus } from "@/lib/mpClient";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "physiq_pendencia_avisada_em";
const hoje = () => new Date().toLocaleDateString("pt-BR"); // 1x por dia, no fuso do aparelho

// Aviso na abertura do app quando a mensalidade está pendente (1x por dia —
// "Mais tarde" silencia até o dia seguinte).
const PendenciaAviso = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState<number | null>(null);

  useEffect(() => {
    if (!user || localStorage.getItem(STORAGE_KEY) === hoje()) return;
    let cancelled = false;
    invokeMp<MpStatus>("status")
      .then((s) => {
        if (cancelled) return;
        if (s.mensalidade && !s.emDia) {
          setValor(s.mensalidade);
          setAberto(true);
        }
      })
      .catch(() => { /* sem rede/erro: não incomoda */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!aberto) return null;

  const fechar = () => {
    localStorage.setItem(STORAGE_KEY, hoje());
    setAberto(false);
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
