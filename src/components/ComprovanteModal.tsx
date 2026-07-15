import { useEffect, useState } from "react";
import { Download, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { invokeMp, MpPagamento } from "@/lib/mpClient";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", in_process: "Em análise", approved: "Pago",
  rejected: "Recusado", cancelled: "Cancelado", expired: "Expirado",
  refunded: "Reembolsado", charged_back: "Estornado",
};
const MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const mesNome = (mesRef: string) => MESES[parseInt(mesRef.split("-")[1], 10) - 1] || mesRef;
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

// Modal de comprovante com dados reais do MP + download em PDF (tema do app).
// Usado na aba Pagamentos do aluno e no painel admin (aba Plano).
const ComprovanteModal = ({ pagamento, onClose }: { pagamento: MpPagamento; onClose: () => void }) => {
  const [mp, setMp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    invokeMp<{ pagamento: MpPagamento; mp: any }>("receipt", { pagamentoId: pagamento.id })
      .then((r) => { if (!cancelled) setMp(r.mp); })
      .catch(() => { /* segue com dados locais */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [pagamento.id]);

  const baixarPDF = async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const AMARELO: [number, number, number] = [255, 191, 0];
      const BRANCO: [number, number, number] = [234, 234, 234];
      const CINZA: [number, number, number] = [150, 150, 150];
      doc.setFillColor(13, 13, 13); doc.rect(0, 0, W, H, "F");
      doc.setFillColor(255, 191, 0); doc.rect(0, 0, W, 3, "F");
      const centro = (txt: string, yy: number) => doc.text(txt, (W - doc.getTextWidth(txt)) / 2, yy);
      let y = 24;
      doc.setTextColor(...AMARELO); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
      centro("PHYSIQCALC", y); y += 8;
      doc.setTextColor(...CINZA); doc.setFontSize(10); doc.setFont("helvetica", "normal");
      centro("COMPROVANTE DE PAGAMENTO", y); y += 12;
      doc.setDrawColor(60, 60, 60); doc.line(20, y, W - 20, y); y += 14;
      doc.setTextColor(...BRANCO); doc.setFontSize(26); doc.setFont("helvetica", "bold");
      centro(fmtBRL(Number(pagamento.valor)), y); y += 10;
      doc.setFontSize(11);
      doc.setTextColor(...(pagamento.status === "approved" ? AMARELO : CINZA));
      centro((STATUS_LABEL[pagamento.status] || pagamento.status).toUpperCase(), y); y += 14;
      const linhas: [string, string][] = [
        ["Mês de referência", `${mesNome(pagamento.mes_ref)}/${pagamento.mes_ref.slice(0, 4)}`],
        ["Forma de pagamento", pagamento.tipo === "pix" ? "Pix" : "Cartão de crédito"],
        ["Criado em", fmtDataHora(pagamento.created_at)],
      ];
      if (mp?.date_approved) linhas.push(["Pago em", fmtDataHora(mp.date_approved)]);
      if (mp?.payer_email) linhas.push(["Pagador", mp.payer_email]);
      if (mp?.card_last4) linhas.push(["Cartão", `final ${mp.card_last4}`]);
      if (pagamento.mp_payment_id) linhas.push(["ID da transação (Mercado Pago)", String(pagamento.mp_payment_id)]);
      if (mp?.e2e_id) linhas.push(["E2E ID (Pix)", mp.e2e_id]);
      if (mp?.bank_transfer_id) linhas.push(["ID transferência bancária", String(mp.bank_transfer_id)]);
      if (mp?.status_detail) linhas.push(["Detalhe do status", mp.status_detail]);
      doc.setFontSize(10);
      for (const [k, v] of linhas) {
        doc.setTextColor(...AMARELO); doc.setFont("helvetica", "bold");
        doc.text(k.toUpperCase(), 24, y);
        doc.setTextColor(...BRANCO); doc.setFont("helvetica", "normal");
        doc.text(String(v), W - 24, y, { align: "right", maxWidth: W - 118 });
        y += 6;
        doc.setDrawColor(40, 40, 40); doc.line(24, y, W - 24, y); y += 7;
      }
      y += 4; doc.setDrawColor(60, 60, 60); doc.line(20, y, W - 20, y); y += 8;
      doc.setFontSize(8); doc.setTextColor(...CINZA);
      centro(`Emitido em ${fmtDataHora(new Date().toISOString())} · Pagamento processado pelo Mercado Pago`, y);
      doc.save(`comprovante-physiqcalc-${mesNome(pagamento.mes_ref).toLowerCase()}-${pagamento.mes_ref.slice(0, 4)}.pdf`);
    } catch (e) {
      console.error("[Comprovante] PDF", e);
      toast.error("Erro ao gerar o PDF do comprovante.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm text-foreground uppercase tracking-wider">Comprovante</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="text-center space-y-1">
          <p className="font-heading text-2xl text-foreground">{fmtBRL(Number(pagamento.valor))}</p>
          <p className={`text-xs font-heading uppercase tracking-wider ${pagamento.status === "approved" ? "text-primary" : pagamento.status === "pending" || pagamento.status === "in_process" ? "text-muted-foreground" : "text-destructive"}`}>
            {STATUS_LABEL[pagamento.status] || pagamento.status}
          </p>
        </div>
        {loading ? (
          <div className="py-8 text-center space-y-2">
            <RefreshCw size={18} className="mx-auto animate-spin text-primary" />
            <p className="text-xs text-muted-foreground font-body">Carregando dados da transação...</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-sm font-body">
              {[
                ["Mês de referência", `${mesNome(pagamento.mes_ref)}/${pagamento.mes_ref.slice(0, 4)}`],
                ["Forma de pagamento", pagamento.tipo === "pix" ? "Pix" : "Cartão de crédito"],
                ["Criado em", fmtDataHora(pagamento.created_at)],
                ...(mp?.date_approved ? [["Pago em", fmtDataHora(mp.date_approved)]] : []),
                ...(mp?.payer_email ? [["Pagador", mp.payer_email]] : []),
                ...(mp?.card_last4 ? [["Cartão", `final ${mp.card_last4}`]] : []),
                ...(pagamento.mp_payment_id ? [["ID da transação (Mercado Pago)", pagamento.mp_payment_id]] : []),
                ...(mp?.e2e_id ? [["E2E ID (Pix)", mp.e2e_id]] : []),
                ...(mp?.bank_transfer_id ? [["ID transferência bancária", String(mp.bank_transfer_id)]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">{k}</span>
                  <span className="text-foreground text-right break-all">{v}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={baixarPDF}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs font-heading uppercase tracking-wider hover:bg-primary/90 transition-colors">
              <Download size={12} /> Baixar comprovante (PDF)
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ComprovanteModal;
