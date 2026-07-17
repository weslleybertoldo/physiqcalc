import { useCallback, useEffect, useState } from "react";
import { Check, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { invokeMp, MpPagamento, MpAssinatura, METODOS_MANUAIS, tipoPagamentoLabel } from "@/lib/mpClient";
import ComprovanteModal from "@/components/ComprovanteModal";

interface AdminMpStatus {
  mensalidade: number | null;
  pausada?: boolean;
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
  // form do registro manual (dinheiro vivo etc.)
  const [registrando, setRegistrando] = useState(false);
  const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [regData, setRegData] = useState(hojeISO());
  const [regMetodo, setRegMetodo] = useState("dinheiro");
  const [regValor, setRegValor] = useState("");

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

  const handlePausar = async (pausar: boolean) => {
    const msg = pausar
      ? "Parar a cobrança deste aluno? Ele deixa de ver pendência e opções de pagamento (a assinatura ativa, se houver, continua — cancele-a também se for o caso)."
      : "Reativar a cobrança deste aluno?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await invokeMp("admin-pausar-cobranca", { userId, pausar });
      toast.success(pausar ? "Cobrança parada." : "Cobrança reativada.");
      load();
    } catch {
      toast.error("Erro ao atualizar a cobrança.");
    } finally {
      setBusy(false);
    }
  };

  const handleRegistrar = async () => {
    const valor = parseFloat(regValor.replace(",", ".")) || status?.mensalidade || 0;
    if (!regData) { toast.error("Informe a data do pagamento."); return; }
    if (!(valor > 0)) { toast.error("Informe o valor do pagamento."); return; }
    const metodoLabel = METODOS_MANUAIS.find((m) => m.value === regMetodo)?.label || regMetodo;
    if (!window.confirm(`Registrar pagamento de ${fmtBRL(valor)} em ${new Date(`${regData}T12:00:00`).toLocaleDateString("pt-BR")} (${metodoLabel})?`)) return;
    setBusy(true);
    try {
      await invokeMp("admin-registrar-pagamento", { userId, dataPagamento: regData, metodo: regMetodo, valor });
      toast.success("Pagamento registrado.");
      setRegistrando(false);
      setRegData(hojeISO());
      setRegValor("");
      load();
    } catch (e: any) {
      const msg = e?.message === "data_futura" ? "A data do pagamento não pode ser no futuro."
        : e?.message === "sem_valor" ? "Sem valor: defina a mensalidade ou informe o valor."
        : "Erro ao registrar o pagamento.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoverManual = async (p: MpPagamento) => {
    if (!window.confirm(`Remover este pagamento manual de ${fmtBRL(Number(p.valor))}? Sem outra cobertura, o aluno volta a ficar pendente (com cobrança).`)) return;
    setBusy(true);
    try {
      await invokeMp("admin-remover-pagamento-manual", { pagamentoId: p.id });
      toast.success("Pagamento manual removido.");
      load();
    } catch {
      toast.error("Erro ao remover o pagamento manual.");
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
            {status.pausada ? (
              <span className="px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-muted text-muted-foreground">
                Cobrança parada
              </span>
            ) : status.emDia ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-primary/15 text-primary">
                <Check size={12} /> Em dia{!assinaturaAtiva && status.pagoAte ? ` até ${new Date(status.pagoAte).toLocaleDateString("pt-BR")}` : ""}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-destructive/15 text-destructive">
                Pendente{status.pagoAte ? ` desde ${new Date(status.pagoAte).toLocaleDateString("pt-BR")}` : ""}
              </span>
            )}
          </div>

          {/* Parar/reativar cobrança (por perfil) */}
          {status.pausada ? (
            <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-body">
                Cobrança parada: o aluno não vê pendência, aviso nem opções de pagamento — mesmo com valor configurado.
              </p>
              <button type="button" onClick={() => handlePausar(false)} disabled={busy}
                className="text-xs font-heading uppercase tracking-wider text-primary border border-primary/40 rounded-lg px-4 py-2 hover:bg-primary/10 transition-colors disabled:opacity-50">
                Reativar cobrança
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => handlePausar(true)} disabled={busy}
              className="text-xs font-heading uppercase tracking-wider text-destructive border border-destructive/40 rounded-lg px-4 py-2 hover:bg-destructive/10 transition-colors disabled:opacity-50">
              Parar cobrança
            </button>
          )}

          {/* Registro manual (ex.: dinheiro vivo) */}
          {registrando ? (
            <div className="bg-muted/20 border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm text-foreground font-body">Registrar pagamento recebido por fora do app</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-body uppercase tracking-wider">Data do pagamento</label>
                  <input type="date" value={regData} max={hojeISO()} onChange={(e) => setRegData(e.target.value)} className="input-underline" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-body uppercase tracking-wider">Método</label>
                  <select value={regMetodo} onChange={(e) => setRegMetodo(e.target.value)}
                    className="bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1.5 outline-none focus:border-primary">
                    {METODOS_MANUAIS.map((m) => (
                      <option key={m.value} value={m.value} className="bg-background text-foreground">{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground font-body uppercase tracking-wider">Valor (R$)</label>
                  <input type="text" inputMode="decimal" value={regValor} onChange={(e) => setRegValor(e.target.value)}
                    placeholder={status.mensalidade ? String(status.mensalidade) : ""} className="input-underline" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground font-body">Cobre 1 mês a partir da data — o aluno fica em dia e some da cobrança.</p>
              <div className="flex gap-3">
                <button type="button" onClick={handleRegistrar} disabled={busy}
                  className="text-xs font-heading uppercase tracking-wider bg-primary text-primary-foreground rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors disabled:opacity-50">
                  Confirmar registro
                </button>
                <button type="button" onClick={() => setRegistrando(false)} disabled={busy}
                  className="text-xs font-heading uppercase tracking-wider text-muted-foreground border border-border rounded-lg px-4 py-2 hover:text-foreground transition-colors disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setRegValor(status.mensalidade ? String(status.mensalidade) : ""); setRegistrando(true); }} disabled={busy}
              className="text-xs font-heading uppercase tracking-wider text-primary border border-primary/40 rounded-lg px-4 py-2 hover:bg-primary/10 transition-colors disabled:opacity-50">
              Registrar pagamento
            </button>
          )}

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
                        <span className="text-muted-foreground"> — {new Date(p.created_at).toLocaleDateString("pt-BR")} · {tipoPagamentoLabel(p)}</span>
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
                  {p.status === "approved" && (p.tipo === "manual" ? (
                    <button type="button" onClick={() => handleRemoverManual(p)} disabled={busy}
                      title="Remover pagamento manual (volta a pendente)"
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleReembolso(p)} disabled={busy}
                      title={`Reembolsar ${fmtBRL(Number(p.valor))}`}
                      className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50">
                      <Undo2 size={15} />
                    </button>
                  ))}
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
