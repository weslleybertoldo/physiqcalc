import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import { invokeMp, type MpPagamento } from "@/lib/mpClient";
import { fmtBRL, fmtDataHora } from "@/lib/saasApi";
import { BTN_LINK, BTN_PRIMARIO, BTN_SECUNDARIO, TIPO_COBRANCA_LABEL, codigoErro, ehPixSimulado, fmtRestante, mensagemErroPlano } from "./planoTexto";

interface Props {
  pagamento: MpPagamento;
  /** refaz o plano-status (a edge re-consulta o MP e aplica o pagamento aprovado) */
  onAtualizar: () => Promise<void> | void;
  /** gera outro Pix quando este venceu */
  onNovo?: () => void;
  onFechar?: () => void;
}

// Pix pendente de uma cobrança do PROFESSOR (adesão / ciclo / anual): QR + copia-e-cola + vencimento.
// Em staging o sandbox do MP cai às vezes → a edge grava um Pix "simulado" sem QR real; aqui mostramos
// a nota e o botão "Simular aprovação" (plano-simular-aprovacao, que a edge só aceita em staging).
export function PixPendenteBox({ pagamento, onAtualizar, onNovo, onFechar }: Props) {
  const [agora, setAgora] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const simulado = ehPixSimulado(pagamento);
  const exp = pagamento.pix_expira_em ? new Date(pagamento.pix_expira_em).getTime() : null;
  const vencido = !simulado && exp !== null && exp <= agora;
  const rotulo = TIPO_COBRANCA_LABEL[pagamento.tipo_cobranca || "mensal"] || "Pagamento";

  const copiar = async () => {
    if (!pagamento.pix_qr_code) return;
    try {
      await navigator.clipboard.writeText(pagamento.pix_qr_code);
      toast.success("Código Pix copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const simular = async () => {
    setBusy(true);
    try {
      await invokeMp("plano-simular-aprovacao", { pagamentoId: pagamento.id });
      toast.success("Pagamento simulado como aprovado.");
      await onAtualizar();
    } catch (e) {
      toast.error(mensagemErroPlano(codigoErro(e)));
    } finally {
      setBusy(false);
    }
  };

  const conferir = async () => {
    setBusy(true);
    try { await onAtualizar(); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 text-center" data-plano-pix-pendente={pagamento.id}>
      <p className="text-xs text-muted-foreground font-body uppercase tracking-wider">
        {rotulo} · Pix de <span className="text-foreground font-heading">{fmtBRL(Number(pagamento.valor))}</span>
      </p>

      {simulado ? (
        <div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2" data-plano-pix-simulado>
          <p className="text-xs font-body text-foreground">
            Pix simulado (sandbox) — o Mercado Pago de teste está indisponível, então nenhum QR real foi gerado.
          </p>
          {DB_SCHEMA === "staging" && (
            <button type="button" onClick={simular} disabled={busy} className={BTN_PRIMARIO} data-plano-simular>
              {busy ? "Simulando..." : "Simular aprovação"}
            </button>
          )}
        </div>
      ) : vencido ? (
        <div className="space-y-2">
          <p className="text-xs text-destructive font-body">Este código Pix venceu.</p>
          {onNovo && (
            <button type="button" onClick={onNovo} className={BTN_SECUNDARIO} data-plano-pix-novo>Gerar novo Pix</button>
          )}
        </div>
      ) : (
        <>
          {pagamento.pix_qr_code_base64 && (
            <img src={`data:image/png;base64,${pagamento.pix_qr_code_base64}`} alt="QR Code Pix" className="mx-auto w-48 h-48 rounded-lg bg-white p-2" />
          )}
          {exp !== null && (
            <p className="text-xs font-body text-foreground">
              Vence em <span className="text-primary font-heading">{fmtRestante(exp - agora)}</span>
              <span className="text-muted-foreground"> · {fmtDataHora(pagamento.pix_expira_em)}</span>
            </p>
          )}
          {pagamento.pix_qr_code && (
            <>
              <p className="text-[10px] text-muted-foreground font-body break-all bg-muted/40 rounded p-2 max-h-20 overflow-y-auto">
                {pagamento.pix_qr_code}
              </p>
              <button type="button" onClick={copiar} className={`inline-flex items-center gap-2 ${BTN_PRIMARIO}`} data-plano-copiar-pix>
                <Copy size={12} /> Copiar código Pix
              </button>
            </>
          )}
          <div>
            <button type="button" onClick={conferir} disabled={busy} className={`inline-flex items-center gap-1 ${BTN_SECUNDARIO}`} data-plano-pix-conferir>
              <RefreshCw size={12} className={busy ? "animate-spin" : ""} /> Já paguei — conferir
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground font-body">
            Depois de pagar, a confirmação chega em instantes. Se o código vencer, é só gerar um novo.
          </p>
        </>
      )}

      {onFechar && (
        <button type="button" onClick={onFechar} className={BTN_LINK} data-plano-pix-fechar>Fechar</button>
      )}
    </div>
  );
}
