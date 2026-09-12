import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { fmtBRL, fmtData, type PlanoStatus } from "@/lib/saasApi";

// Tela da trava do PROFESSOR (ciclo vencido além da tolerância): só a aba Planos abre.
// Os alunos dele continuam treinando (a dívida é do professor) — decisão 9.
const PlanoBloqueado = ({ status }: { status: PlanoStatus }) => {
  const navigate = useNavigate();
  const valor = status.professor.ciclo_valor ?? status.plano?.valor_mensal ?? null;
  return (
    <div className="max-w-lg mx-auto py-10 px-4 space-y-6 text-center" data-plano-bloqueado>
      <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center">
        <Lock size={24} className="text-destructive" />
      </div>
      <div>
        <h1 className="font-heading text-xl text-foreground uppercase tracking-wider">Acesso suspenso</h1>
        <p className="text-sm text-muted-foreground font-body mt-2">
          Sua mensalidade{valor ? ` de ${fmtBRL(valor)}` : ""} venceu em <span className="text-destructive">{fmtData(status.professor.ciclo_vence_em)}</span> e
          passou dos {status.tolerancia} dias de tolerância. Regularize para voltar ao painel.
        </p>
        <p className="text-xs text-muted-foreground font-body mt-2">Seus alunos continuam treinando normalmente.</p>
      </div>
      <button type="button" onClick={() => navigate("/admin/planos")}
        className="w-full h-12 bg-primary text-primary-foreground font-heading text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors">
        Pagar agora
      </button>
      {status.avisos.length > 0 && (
        <div className="text-left result-card border-muted-foreground/20">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-2">Avisos recebidos</p>
          <ul className="space-y-1">
            {status.avisos.slice(0, 5).map((a) => (
              <li key={a.id} className="text-xs font-body text-foreground/80">
                {new Date(a.enviado_em).toLocaleDateString("pt-BR")} — {a.mensagem || `Vencimento em ${fmtData(a.ciclo_vence_em)} (${a.dia === 0 ? "no dia" : `${a.dia} dia(s) depois`})`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PlanoBloqueado;
