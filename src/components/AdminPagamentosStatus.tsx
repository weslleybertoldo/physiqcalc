import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { invokeMp, MpPagamento, MpAssinatura } from "@/lib/mpClient";

interface AdminMpStatus {
  mensalidade: number | null;
  emDia: boolean;
  pagoAte: string | null;
  mesPago: boolean;
  assinatura: MpAssinatura | null;
  pagamentos: MpPagamento[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", in_process: "Em análise", approved: "Pago",
  rejected: "Recusado", cancelled: "Cancelado", expired: "Expirado",
  refunded: "Reembolsado", charged_back: "Estornado",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Bloco compacto de mensalidade/pagamentos do aluno no painel admin
const AdminPagamentosStatus = ({ userId }: { userId: string }) => {
  const [status, setStatus] = useState<AdminMpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelled = false;
    invokeMp<AdminMpStatus>("admin-status", { userId })
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch((e) => { console.error("[AdminPagamentos]", e); if (!cancelled) setErro(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <section className="section-divider pt-10">
      <h2 className="font-heading text-lg text-foreground mb-4">Pagamentos</h2>
      {loading ? (
        <p className="text-xs text-muted-foreground font-body">Carregando...</p>
      ) : erro ? (
        <p className="text-xs text-destructive font-body">Erro ao carregar pagamentos.</p>
      ) : !status?.mensalidade ? (
        <p className="text-xs text-muted-foreground font-body">Sem mensalidade configurada (defina em Configurar Usuário → Plano).</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground font-body">Mensalidade {fmtBRL(status.mensalidade)}</p>
            {status.emDia ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-primary/15 text-primary">
                <Check size={12} /> Em dia{status.pagoAte ? ` até ${new Date(status.pagoAte).toLocaleDateString("pt-BR")}` : ""}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-destructive/15 text-destructive">
                Pendente{status.pagoAte ? ` desde ${new Date(status.pagoAte).toLocaleDateString("pt-BR")}` : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-body">
            Assinatura no cartão: {status.assinatura ? (status.assinatura.status === "authorized" ? `ativa (${fmtBRL(status.assinatura.valor)}/mês)` : status.assinatura.status) : "não possui"}
          </p>
          {status.pagamentos.length > 0 && (
            <div className="space-y-1">
              {status.pagamentos.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs font-body text-muted-foreground">
                  <span>{p.mes_ref.slice(5, 7)}/{p.mes_ref.slice(0, 4)} · {p.tipo === "pix" ? "Pix" : "Cartão"} · {fmtBRL(Number(p.valor))}</span>
                  <span className={p.status === "approved" ? "text-primary" : ""}>{STATUS_LABEL[p.status] || p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default AdminPagamentosStatus;
