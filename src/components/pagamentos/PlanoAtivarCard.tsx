import { useEffect, useState } from "react";
import { CreditCard, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { invokeMp, type MpPagamento } from "@/lib/mpClient";
import { fmtBRL, type PlanoStatus } from "@/lib/saasApi";
import { CartaoBrick, type CartaoFormData } from "./mpBrick";
import { PixPendenteBox } from "./PixPendenteBox";
import { BTN_PRIMARIO, BTN_SECUNDARIO, CARD, TITULO_CARD, codigoErro, mensagemErroPlano, pixAberto, valorMensalDe } from "./planoTexto";

interface RespPagamento { pagamento: MpPagamento; reused?: boolean; status_detail?: string | null; simulado?: boolean }

// Adesão única (ativa a conta; depois 30 dias de uso e a mensalidade é paga no fim do ciclo — pós-pago).
export function PlanoAtivarCard({ status, onAtualizar }: { status: PlanoStatus; onAtualizar: () => Promise<void> }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [cartao, setCartao] = useState(false);
  const [pix, setPix] = useState<MpPagamento | null>(() => pixAberto(status.pagamentos, "adesao"));
  const valorMensal = valorMensalDe(status);

  // status recarregado: o Pix aberto deixou de estar pendente → fecha o QR
  useEffect(() => {
    if (!pix) return;
    const atual = (status.pagamentos as MpPagamento[]).find((p) => p.id === pix.id);
    if (atual && atual.status !== "pending") setPix(null);
  }, [status.pagamentos, pix]);

  const pagarPix = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await invokeMp<RespPagamento>("plano-ativar", { metodo: "pix" });
      if (r.pagamento?.pix_qr_code) {
        setPix(r.pagamento);
        setCartao(false);
        if (r.reused) toast.info("Você já tinha um Pix de adesão aberto — reaproveitado.");
      } else {
        toast.error("Pix criado sem código. Tente de novo.");
      }
      await onAtualizar();
    } catch (e) {
      const cod = codigoErro(e);
      toast.error(mensagemErroPlano(cod, {}, "Erro ao gerar o Pix."));
      if (cod === "ja_ativado") await onAtualizar();
    } finally {
      setBusy(false);
    }
  };

  const pagarCartao = async (f: CartaoFormData) => {
    try {
      const r = await invokeMp<RespPagamento>("plano-ativar", {
        metodo: "cartao", card_token: f?.token, payment_method_id: f?.payment_method_id, issuer_id: f?.issuer_id,
      });
      if (r.pagamento?.status === "approved") toast.success("Adesão paga! Sua conta está ativa — o 1º ciclo de 30 dias começou.");
      else if (r.pagamento?.status === "rejected") toast.error("Pagamento recusado pelo cartão.");
      else toast.info("Pagamento em processamento — o status atualiza em instantes.");
      setCartao(false);
      await onAtualizar();
    } catch (e) {
      toast.error(mensagemErroPlano(codigoErro(e), {}, "Erro no pagamento. Verifique os dados do cartão."));
      throw e; // Brick mostra estado de erro
    }
  };

  return (
    <section className={CARD} data-plano-ativar>
      <h2 className={TITULO_CARD}>Ativar minha conta</h2>
      <p className="text-sm font-body text-foreground">
        Adesão única de <span className="text-primary font-heading">{fmtBRL(status.adesao)}</span>. Depois você usa 30 dias e paga a
        mensalidade{valorMensal !== null ? ` (${fmtBRL(valorMensal)})` : ""} no fim do ciclo — pós-pago.
      </p>

      {pix ? (
        <PixPendenteBox pagamento={pix} onAtualizar={onAtualizar} onNovo={() => { setPix(null); void pagarPix(); }} onFechar={() => setPix(null)} />
      ) : cartao ? (
        <CartaoBrick
          amount={status.adesao}
          email={user?.email || ""}
          descricao={`Adesão de ${fmtBRL(status.adesao)} no cartão — pagamento único.`}
          onSubmit={pagarCartao}
          onFechar={() => setCartao(false)}
          testid="adesao"
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={pagarPix} disabled={busy} className={`inline-flex items-center gap-2 ${BTN_PRIMARIO}`} data-plano-ativar-pix>
            <QrCode size={14} /> {busy ? "Gerando..." : "Pagar adesão via Pix"}
          </button>
          <button type="button" onClick={() => setCartao(true)} disabled={busy} className={`inline-flex items-center gap-2 ${BTN_SECUNDARIO}`} data-plano-ativar-cartao>
            <CreditCard size={14} /> Pagar adesão com cartão
          </button>
        </div>
      )}
    </section>
  );
}
