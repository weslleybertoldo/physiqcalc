import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, CreditCard, Download, QrCode, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { invokeMp, MpStatus, MpPagamento } from "@/lib/mpClient";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";

const MP_PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined;
let mpInitialized = false;
function ensureMpInit() {
  if (!mpInitialized && MP_PUBLIC_KEY) {
    initMercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
    mpInitialized = true;
  }
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_process: "Em análise",
  approved: "Pago",
  rejected: "Recusado",
  cancelled: "Cancelado",
  expired: "Expirado",
  refunded: "Reembolsado",
  charged_back: "Estornado",
};

const ASSINATURA_LABEL: Record<string, string> = {
  pending: "Pendente",
  authorized: "Ativa",
  paused: "Pausada",
  cancelled: "Cancelada",
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtMes(mesRef: string) {
  const [y, m] = mesRef.split("-");
  return `${m}/${y}`;
}

const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
function mesNome(mesRef: string) {
  return MESES[parseInt(mesRef.split("-")[1], 10) - 1] || mesRef;
}

function fmtRestante(ms: number) {
  const min = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function fmtDataHora(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const PagamentosPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState<MpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cardMode, setCardMode] = useState<"avulso" | "assinatura" | null>(null);
  const [pixData, setPixData] = useState<{ qr: string; qrBase64: string | null; expiraEm: string | null } | null>(null);
  const [comprovante, setComprovante] = useState<MpPagamento | null>(null);
  const [receiptMp, setReceiptMp] = useState<any | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  // dados reais da transação no MP ao abrir o comprovante
  useEffect(() => {
    if (!comprovante) { setReceiptMp(null); return; }
    let cancelled = false;
    setReceiptLoading(true);
    invokeMp<{ pagamento: MpPagamento; mp: any }>("receipt", { pagamentoId: comprovante.id })
      .then((r) => { if (!cancelled) setReceiptMp(r.mp); })
      .catch(() => { /* comprovante segue com dados locais */ })
      .finally(() => { if (!cancelled) setReceiptLoading(false); });
    return () => { cancelled = true; };
  }, [comprovante]);
  const [agora, setAgora] = useState(() => Date.now());

  // contagem regressiva do vencimento do Pix (atualiza a cada 30s)
  useEffect(() => {
    if (!pixData) return;
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, [pixData]);

  const load = useCallback(async () => {
    try {
      const s = await invokeMp<MpStatus>("status");
      setStatus(s);
    } catch (e) {
      console.error("[Pagamentos] status", e);
      toast.error("Erro ao carregar pagamentos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { ensureMpInit(); }, []);

  const handlePix = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { pagamento } = await invokeMp<{ pagamento: any }>("create-pix");
      if (pagamento?.pix_qr_code) {
        setPixData({ qr: pagamento.pix_qr_code, qrBase64: pagamento.pix_qr_code_base64 || null, expiraEm: pagamento.pix_expira_em || null });
      } else {
        toast.error("Pix criado sem QR code. Tente novamente.");
      }
      await load();
    } catch (e: any) {
      const msg = e?.message === "mes_ja_pago" ? "O mês atual já está pago."
        : e?.message === "sem_mensalidade" ? "Nenhuma mensalidade configurada."
        : "Erro ao gerar Pix.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleCopiaECola = async () => {
    if (!pixData?.qr) return;
    try {
      await navigator.clipboard.writeText(pixData.qr);
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const handleCardSubmit = async (formData: any) => {
    try {
      if (cardMode === "avulso") {
        const r = await invokeMp<{ pagamento: MpPagamento }>("create-card-payment", {
          card_token: formData?.token,
          payment_method_id: formData?.payment_method_id,
          issuer_id: formData?.issuer_id,
        });
        if (r.pagamento?.status === "approved") toast.success("Pagamento aprovado! Mês quitado.");
        else if (r.pagamento?.status === "rejected") toast.error("Pagamento recusado pelo cartão.");
        else toast.info("Pagamento em processamento — o status atualiza em instantes.");
      } else {
        await invokeMp("create-subscription", { card_token: formData?.token });
        toast.success("Assinatura criada! A cobrança mensal é automática.");
      }
      setCardMode(null);
      await load();
    } catch (e: any) {
      const msg = e?.message === "assinatura_ja_ativa" ? "Você já tem uma assinatura ativa."
        : e?.message === "mes_ja_pago" ? "O mês atual já está pago."
        : e?.message === "assinatura_sem_sandbox" ? "Assinatura não funciona em ambiente de teste — use \"Pagar só este mês\". Em produção funciona normalmente."
        : "Erro no pagamento. Verifique os dados do cartão.";
      toast.error(msg);
      throw e; // Brick mostra estado de erro
    }
  };

  const handleCancelar = async () => {
    if (!window.confirm("Cancelar a assinatura? A cobrança automática para imediatamente.")) return;
    setBusy(true);
    try {
      await invokeMp("cancel-subscription");
      toast.success("Assinatura cancelada.");
      await load();
    } catch {
      toast.error("Erro ao cancelar assinatura.");
    } finally {
      setBusy(false);
    }
  };

  const assinaturaAtiva = status?.assinatura && ["authorized", "pending"].includes(status.assinatura.status);
  const pagamentosPagos = (status?.pagamentos || []).filter((p) => p.status === "approved");
  // vencimento efetivo do QR: da resposta do create ou do pendente do mês no status
  const pixPendenteMes = (status?.pagamentos || []).find((p) => p.tipo === "pix" && p.status === "pending" && p.mes_ref === status?.mesRef);
  const pixExpiraEfetivo = pixData?.expiraEm || pixPendenteMes?.pix_expira_em || null;

  const handleBaixarComprovante = async () => {
    if (!comprovante) return;
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const W = doc.internal.pageSize.getWidth();
      let y = 24;
      doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      doc.text("PhysiqCalc", W / 2, y, { align: "center" }); y += 8;
      doc.setFontSize(12); doc.setFont("helvetica", "normal");
      doc.text("Comprovante de Pagamento", W / 2, y, { align: "center" }); y += 12;
      doc.setDrawColor(180); doc.line(20, y, W - 20, y); y += 12;
      doc.setFontSize(22); doc.setFont("helvetica", "bold");
      doc.text(fmtBRL(Number(comprovante.valor)), W / 2, y, { align: "center" }); y += 8;
      doc.setFontSize(11); doc.setFont("helvetica", "normal");
      doc.text(STATUS_LABEL[comprovante.status] || comprovante.status, W / 2, y, { align: "center" }); y += 14;
      const linhas: [string, string][] = [
        ["Mês de referência", `${mesNome(comprovante.mes_ref)}/${comprovante.mes_ref.slice(0, 4)}`],
        ["Forma de pagamento", comprovante.tipo === "pix" ? "Pix" : "Cartão de crédito"],
        ["Criado em", fmtDataHora(comprovante.created_at)],
      ];
      if (receiptMp?.date_approved) linhas.push(["Pago em", fmtDataHora(receiptMp.date_approved)]);
      if (receiptMp?.payer_email) linhas.push(["Pagador", receiptMp.payer_email]);
      if (receiptMp?.card_last4) linhas.push(["Cartão", `final ${receiptMp.card_last4}`]);
      if (comprovante.mp_payment_id) linhas.push(["ID da transação (Mercado Pago)", String(comprovante.mp_payment_id)]);
      if (receiptMp?.e2e_id) linhas.push(["E2E ID (Pix)", receiptMp.e2e_id]);
      if (receiptMp?.bank_transfer_id) linhas.push(["ID transferência bancária", String(receiptMp.bank_transfer_id)]);
      if (receiptMp?.status_detail) linhas.push(["Detalhe do status", receiptMp.status_detail]);
      doc.setFontSize(10);
      for (const [k, v] of linhas) {
        doc.setFont("helvetica", "bold"); doc.text(`${k}:`, 24, y);
        doc.setFont("helvetica", "normal"); doc.text(String(v), 90, y, { maxWidth: W - 114 });
        y += 8;
      }
      y += 6; doc.setDrawColor(180); doc.line(20, y, W - 20, y); y += 8;
      doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Emitido em ${fmtDataHora(new Date().toISOString())} · Pagamento processado pelo Mercado Pago`, W / 2, y, { align: "center" });
      doc.save(`comprovante-physiqcalc-${mesNome(comprovante.mes_ref).toLowerCase()}-${comprovante.mes_ref.slice(0, 4)}.pdf`);
    } catch (e) {
      console.error("[Comprovante] PDF", e);
      toast.error("Erro ao gerar o PDF do comprovante.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate("/treinos")} aria-label="Voltar"
            className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-heading text-lg text-foreground uppercase tracking-wider">Pagamentos</h1>
          <button type="button" onClick={() => { setLoading(true); load(); }} aria-label="Atualizar"
            className="ml-auto text-muted-foreground hover:text-primary transition-colors">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {loading ? (
          <p className="text-muted-foreground font-body text-sm">Carregando...</p>
        ) : !status?.mensalidade ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground font-body">
              Nenhuma mensalidade configurada para a sua conta. Fale com seu treinador.
            </p>
          </div>
        ) : (
          <>
            {/* Status do mês */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-1">
              <p className="text-xs text-muted-foreground font-body uppercase tracking-wider">Mensalidade · {status.mesLabel}</p>
              <div className="flex items-center justify-between">
                <p className="font-heading text-2xl text-foreground">{fmtBRL(status.mensalidade)}</p>
                {status.mesPago ? (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-primary/15 text-primary">
                    <Check size={12} /> Pago
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-heading uppercase tracking-wider bg-destructive/15 text-destructive">
                    Pendente
                  </span>
                )}
              </div>
            </div>

            {/* Assinatura cartão */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-primary" />
                <h2 className="font-heading text-sm text-foreground uppercase tracking-wider">Pagar com cartão</h2>
              </div>
              {assinaturaAtiva ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground font-body">
                    Assinatura <span className="text-primary">{ASSINATURA_LABEL[status.assinatura!.status] || status.assinatura!.status}</span> — {fmtBRL(status.assinatura!.valor)}/mês cobrados automaticamente.
                  </p>
                  <button type="button" onClick={handleCancelar} disabled={busy}
                    className="text-xs font-heading uppercase tracking-wider text-destructive border border-destructive/40 rounded-lg px-4 py-2 hover:bg-destructive/10 transition-colors disabled:opacity-50">
                    Cancelar assinatura
                  </button>
                </div>
              ) : cardMode ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-body">
                    {cardMode === "avulso"
                      ? `Pagamento único de ${fmtBRL(status.mensalidade)} — só o mês de ${status.mesLabel}.`
                      : `Assinatura de ${fmtBRL(status.mensalidade)}/mês com cobrança automática. Cancele quando quiser.`}
                  </p>
                  {MP_PUBLIC_KEY ? (
                    <CardPayment
                      key={cardMode}
                      initialization={{ amount: status.mensalidade, payer: { email: user?.email || "" } }}
                      customization={{ paymentMethods: { maxInstallments: 1 } }}
                      onSubmit={handleCardSubmit}
                      onError={(err) => { console.error("[Brick] erro", err); }}
                    />
                  ) : (
                    <p className="text-xs text-destructive font-body">Chave pública do Mercado Pago não configurada.</p>
                  )}
                  <button type="button" onClick={() => setCardMode(null)}
                    className="flex items-center gap-1 text-xs font-heading uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                    <X size={12} /> Fechar
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground font-body">
                    Pague só o mês atual ou assine pra cobrar automático todo mês.
                  </p>
                  {!status.mesPago && (
                    <button type="button" onClick={() => setCardMode("avulso")}
                      className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors">
                      Pagar só este mês
                    </button>
                  )}
                  <button type="button" onClick={() => setCardMode("assinatura")}
                    className="w-full py-2.5 border border-primary/40 text-primary rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/10 transition-colors">
                    Assinar (automático todo mês)
                  </button>
                </>
              )}
            </div>

            {/* Pix do mês */}
            {!status.mesPago && !assinaturaAtiva && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <QrCode size={16} className="text-primary" />
                  <h2 className="font-heading text-sm text-foreground uppercase tracking-wider">Pagar o mês via Pix</h2>
                </div>
                {pixData ? (
                  <div className="space-y-3 text-center">
                    {(() => {
                      const exp = pixExpiraEfetivo ? new Date(pixExpiraEfetivo).getTime() : null;
                      const vencido = exp !== null && exp <= agora;
                      if (vencido) {
                        return (
                          <div className="space-y-3">
                            <p className="text-xs text-destructive font-body">
                              Este código Pix venceu. Gere um novo pra pagar o mês.
                            </p>
                            <button type="button" onClick={() => { setPixData(null); handlePix(); }} disabled={busy}
                              className="w-full py-2.5 border border-primary/40 text-primary rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/10 transition-colors disabled:opacity-50">
                              {busy ? "Gerando..." : "Gerar novo Pix"}
                            </button>
                          </div>
                        );
                      }
                      return (
                        <>
                          {pixData.qrBase64 && (
                            <img src={`data:image/png;base64,${pixData.qrBase64}`} alt="QR Code Pix"
                              className="mx-auto w-48 h-48 rounded-lg bg-white p-2" />
                          )}
                          {exp !== null && (
                            <p className="text-xs font-body text-foreground">
                              Vence em <span className="text-primary font-heading">{fmtRestante(exp - agora)}</span>
                              <span className="text-muted-foreground"> · {new Date(exp).toLocaleDateString("pt-BR")} às {new Date(exp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground font-body break-all bg-muted/40 rounded p-2 max-h-20 overflow-y-auto">
                            {pixData.qr}
                          </p>
                          <button type="button" onClick={handleCopiaECola}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors">
                            <Copy size={12} /> Copiar código Pix
                          </button>
                          <p className="text-[10px] text-muted-foreground font-body">
                            Após pagar, o status atualiza em instantes (toque em atualizar).
                            Se o código vencer, é só gerar um novo Pix do mês.
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <button type="button" onClick={handlePix} disabled={busy}
                    className="w-full py-2.5 border border-primary/40 text-primary rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/10 transition-colors disabled:opacity-50">
                    {busy ? "Gerando..." : "Gerar Pix do mês"}
                  </button>
                )}
              </div>
            )}

            {/* Histórico */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="font-heading text-sm text-foreground uppercase tracking-wider">Histórico</h2>
              {pagamentosPagos.length === 0 ? (
                <p className="text-xs text-muted-foreground font-body">Nenhum pagamento confirmado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {pagamentosPagos.map((p) => (
                    <button type="button" key={p.id} onClick={() => setComprovante(p)}
                      className="w-full flex items-center justify-between text-sm font-body border-b border-border/50 pb-2 last:border-0 last:pb-0 text-left hover:bg-muted/20 rounded px-1 transition-colors">
                      <div>
                        <p className="text-foreground">
                          <span className="font-heading tracking-wider">{mesNome(p.mes_ref)}</span>
                          <span className="text-muted-foreground"> — {new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">{p.tipo === "pix" ? "Pix" : "Cartão"} · toque pra ver o comprovante</p>
                      </div>
                      <div className="text-right">
                        <p className="text-foreground">{fmtBRL(Number(p.valor))}</p>
                        <p className={`text-[10px] uppercase tracking-wider ${p.status === "approved" ? "text-primary" : p.status === "pending" || p.status === "in_process" ? "text-muted-foreground" : "text-destructive"}`}>
                          {STATUS_LABEL[p.status] || p.status}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Comprovante da transação */}
        {comprovante && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setComprovante(null)}>
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-heading text-sm text-foreground uppercase tracking-wider">Comprovante</h3>
                <button type="button" onClick={() => setComprovante(null)} aria-label="Fechar"
                  className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="text-center space-y-1">
                <p className="font-heading text-2xl text-foreground">{fmtBRL(Number(comprovante.valor))}</p>
                <p className={`text-xs font-heading uppercase tracking-wider ${comprovante.status === "approved" ? "text-primary" : comprovante.status === "pending" || comprovante.status === "in_process" ? "text-muted-foreground" : "text-destructive"}`}>
                  {STATUS_LABEL[comprovante.status] || comprovante.status}
                </p>
              </div>
              <div className="space-y-2 text-sm font-body">
                {[
                  ["Mês de referência", `${mesNome(comprovante.mes_ref)}/${comprovante.mes_ref.slice(0, 4)}`],
                  ["Forma de pagamento", comprovante.tipo === "pix" ? "Pix" : "Cartão de crédito"],
                  ["Criado em", fmtDataHora(comprovante.created_at)],
                  ...(comprovante.status === "approved" && comprovante.updated_at && !receiptMp?.date_approved
                    ? [["Confirmado em", fmtDataHora(comprovante.updated_at)]] : []),
                  ...(comprovante.tipo === "pix" && comprovante.pix_expira_em && comprovante.status === "pending"
                    ? [["Vence em", fmtDataHora(comprovante.pix_expira_em)]] : []),
                  ...(receiptMp?.date_approved ? [["Pago em", fmtDataHora(receiptMp.date_approved)]] : []),
                  ...(receiptMp?.payer_email ? [["Pagador", receiptMp.payer_email]] : []),
                  ...(receiptMp?.card_last4 ? [["Cartão", `final ${receiptMp.card_last4}`]] : []),
                  ...(comprovante.mp_payment_id
                    ? [["ID da transação (Mercado Pago)", comprovante.mp_payment_id]] : []),
                  ...(receiptMp?.e2e_id ? [["E2E ID (Pix)", receiptMp.e2e_id]] : []),
                  ...(receiptMp?.bank_transfer_id ? [["ID transferência bancária", String(receiptMp.bank_transfer_id)]] : []),
                ].map(([k, v]) => (
                  <div key={k as string} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">{k}</span>
                    <span className="text-foreground text-right break-all">{v}</span>
                  </div>
                ))}
                {receiptLoading && (
                  <p className="text-[10px] text-muted-foreground font-body text-center">Buscando dados da transação no Mercado Pago...</p>
                )}
              </div>
              <button type="button" onClick={handleBaixarComprovante}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors">
                <Download size={12} /> Baixar comprovante (PDF)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PagamentosPage;
