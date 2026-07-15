import { useCallback, useEffect, useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { invokeMp, MpPagamento, MpAssinatura } from "@/lib/mpClient";
import ComprovanteModal from "@/components/ComprovanteModal";

interface AdminMpStatus {
  mensalidade: number | null;
  emDia: boolean;
  pagoAte: string | null;
  assinatura: MpAssinatura | null;
  pagamentos: MpPagamento[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", in_process: "Em análise", approved: "Pago",
  rejected: "Recusado", cancelled: "Cancelado", expired: "Expirado",
  refunded: "Reembolsado", charged_back: "Estornado",
};
const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const mesNome = (mesRef: string) => MESES[parseInt(mesRef.split("-")[1], 10) - 1] || mesRef;

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Painel de pagamentos do aluno no admin (aba Plano + visão do aluno):
// situação, assinatura (próxima cobrança + cancelar), histórico com comprovante e reembolso
const AdminPagamentosStatus = ({ userId }: { userId: string }) => {
  const [status, setStatus] = useState<AdminMpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comprovante, setComprovante] = useState<MpPagamento | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setErro(false);
    invokeMp<AdminMpStatus>("admin-status", { userId })
      .then((s) => setStatus(s))
      .catch((e) => { console.error("[AdminPagamentos]", e); setErro(true); })
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const assinaturaAtiva = status?.assinatura && ["authorized", "pending"].includes(status.assinatura.status);

  const handleCancelar = async () => {
    if (!window.confirm("Cancelar a assinatura deste aluno? A cobrança automática para imediatamente.")) return;
    setBusy(true);
    try {
      await invokeMp("admin-cancel-subscription", { userId });
      toast.success("Assinatura cancelada.");
      load();
    } catch {
      toast.error("Erro ao cancelar a assinatura.");
    } finally {
      setBusy(false);
    }
  };

  const handleReembolso = async (p: MpPagamento) => {
    if (!window.confirm(`Realmente vai seguir com o reembolso de ${fmtBRL(Number(p.valor))}?`)) return;
    setBusy(true);
    try {
      await invokeMp("admin-refund", { pagamentoId: p.id });
      toast.success(`Reembolso de ${fmtBRL(Number(p.valor))} solicitado.`);
      load();
    } catch (e: any) {
      const msg = e?.message === "nao_reembolsavel" ? "Esse pagamento não está aprovado — não dá pra reembolsar."
        : "Erro ao reembolsar no Mercado Pago.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section-divider pt-10">
      <h2 className="font-heading text-lg text-foreground mb-4">Pagamentos</h2>
      {loading ? (
        <p className="text-xs text-muted-foreground font-body">Carregando...</p>
      ) : erro ? (
        <p className="text-xs text-destructive font-body">Erro ao carregar pagamentos.</p>
      ) : !status?.mensalidade ? (
        <p className="text-xs text-muted-foreground font-body">Sem mensalidade configurada (defina o valor em Plano → Mensalidade).</p>
      ) : (
        <div className="space-y-4">
          {/* Situação */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground font-body">Mensalidade {fmtBRL(status.mensalidade)}</p>
            {status.emDia ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-primary/15 text-primary">
                <Check size={12} /> Em dia{!assinaturaAtiva && status.pagoAte ? ` até ${new Date(status.pagoAte).toLocaleDateString("pt-BR")}` : ""}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-destructive/15 text-destructive">
                Pendente{status.pagoAte ? ` desde ${new Date(status.pagoAte).toLocaleDateString("pt-BR")}` : ""}
              </span>
            )}
          </div>

          {/* Assinatura */}
          {assinaturaAtiva ? (
            <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm text-foreground font-body">
                Assinatura <span className="text-primary">ativa</span> — {fmtBRL(Number(status.assinatura!.valor))}/mês no cartão
              </p>
              {status.assinatura!.proxima_cobranca && (
                <p className="text-xs text-muted-foreground font-body">
                  Próxima cobrança: <span className="text-primary">{new Date(status.assinatura!.proxima_cobranca).toLocaleDateString("pt-BR")}</span>
                </p>
              )}
              <button type="button" onClick={handleCancelar} disabled={busy}
                className="text-xs font-heading uppercase tracking-wider text-destructive border border-destructive/40 rounded-lg px-4 py-2 hover:bg-destructive/10 transition-colors disabled:opacity-50">
                Cancelar assinatura
              </button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground font-body">
              Sem assinatura ativa{status.assinatura ? ` (última: ${STATUS_LABEL[status.assinatura.status] || status.assinatura.status})` : ""} — paga avulso/Pix pelo app.
            </p>
          )}

          {/* Histórico com comprovante + reembolso */}
          {status.pagamentos.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-body uppercase tracking-wider mb-2">Histórico</p>
              {status.pagamentos.map((p) => (
                <div key={p.id} className="flex items-center gap-2 border-b border-border/40 pb-2 last:border-0">
                  <button type="button" onClick={() => setComprovante(p)}
                    className="flex-1 flex items-center justify-between text-left hover:bg-muted/20 rounded px-1 transition-colors">
                    <div>
                      <p className="text-sm text-foreground font-body">
                        <span className="font-heading tracking-wider">{mesNome(p.mes_ref)}</span>
                        <span className="text-muted-foreground"> — {new Date(p.created_at).toLocaleDateString("pt-BR")} · {p.tipo === "pix" ? "Pix" : "Cartão"}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground font-body">toque pra ver o comprovante</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-foreground font-body">{fmtBRL(Number(p.valor))}</p>
                      <p className={`text-[10px] uppercase tracking-wider ${p.status === "approved" ? "text-primary" : p.status === "refunded" ? "text-destructive" : "text-muted-foreground"}`}>
                        {STATUS_LABEL[p.status] || p.status}
                      </p>
                    </div>
                  </button>
                  {p.status === "approved" && (
                    <button type="button" onClick={() => handleReembolso(p)} disabled={busy}
                      title={`Reembolsar ${fmtBRL(Number(p.valor))}`}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
                      <Undo2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {comprovante && <ComprovanteModal pagamento={comprovante} onClose={() => setComprovante(null)} />}
    </section>
  );
};

export default AdminPagamentosStatus;
