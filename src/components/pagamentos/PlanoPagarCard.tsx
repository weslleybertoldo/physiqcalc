import { useEffect, useState } from "react";
import { CreditCard, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { invokeMp, type MpPagamento } from "@/lib/mpClient";
import { fmtBRL, fmtData, type PlanoStatus } from "@/lib/saasApi";
import { CartaoBrick, type CartaoFormData } from "./mpBrick";
import { ConfirmarDialog } from "./ConfirmarDialog";
import { PixPendenteBox } from "./PixPendenteBox";
import {
  ASSINATURA_LABEL, BTN_PERIGO, BTN_PRIMARIO, BTN_SECUNDARIO, CARD, ROTULO, TITULO_CARD,
  codigoErro, liberaPagarCicloEm, mensagemErroPlano, pixAberto, podePagarCiclo, valorAnualDe, valorMensalDe,
} from "./planoTexto";

interface RespPagamento { pagamento: MpPagamento; reused?: boolean; status_detail?: string | null }
type AcaoCobranca = "plano-pagar-ciclo" | "plano-anual";
type ModoCartao = "ciclo" | "anual" | "assinatura";

// Conta ativada: pagar o ciclo (Pix/cartão, libera 3 dias antes do vencimento), assinatura recorrente
// no cartão (com cancelar) e plano anual (10 mensalidades = 12 meses).
export function PlanoPagarCard({ status, onAtualizar }: { status: PlanoStatus; onAtualizar: () => Promise<void> }) {
  const { user } = useAuth();
  const p = status.professor;
  const hoje = status.hoje;
  const valorMensal = valorMensalDe(status);
  const valorAnual = valorAnualDe(status);
  const valorPlano = Number(status.plano?.valor_mensal ?? valorMensal ?? 0);
  const anualAtivo = !!p.anual_ate && p.anual_ate >= hoje;
  const pausada = p.cobranca_pausada;
  const liberaEm = liberaPagarCicloEm(status);
  const podeCiclo = podePagarCiclo(status);
  const assinatura = status.assinatura;
  const assinaturaAtiva = !!assinatura && ["authorized", "pending"].includes(assinatura.status);

  const [busy, setBusy] = useState(false);
  const [cartaoModo, setCartaoModo] = useState<ModoCartao | null>(null);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [pix, setPix] = useState<MpPagamento | null>(() => pixAberto(status.pagamentos, "mensal") ?? pixAberto(status.pagamentos, "anual"));

  // status recarregado: o Pix aberto deixou de estar pendente → fecha o QR
  useEffect(() => {
    if (!pix) return;
    const atual = (status.pagamentos as MpPagamento[]).find((x) => x.id === pix.id);
    if (atual && atual.status !== "pending") setPix(null);
  }, [status.pagamentos, pix]);

  const cobrar = async (action: AcaoCobranca, metodo: "pix" | "cartao", f?: CartaoFormData) => {
    const payload = metodo === "pix"
      ? { metodo }
      : { metodo, card_token: f?.token, payment_method_id: f?.payment_method_id, issuer_id: f?.issuer_id };
    const r = await invokeMp<RespPagamento>(action, payload);
    if (metodo === "pix") {
      if (r.pagamento?.pix_qr_code) {
        setPix(r.pagamento);
        setCartaoModo(null);
        if (r.reused) toast.info("Você já tinha um Pix aberto — reaproveitado.");
      } else {
        toast.error("Pix criado sem código. Tente de novo.");
      }
    } else {
      if (r.pagamento?.status === "approved") toast.success(action === "plano-anual" ? "Plano anual pago! 12 meses de acesso." : "Ciclo pago! Vencimento atualizado.");
      else if (r.pagamento?.status === "rejected") toast.error("Pagamento recusado pelo cartão.");
      else toast.info("Pagamento em processamento — o status atualiza em instantes.");
      setCartaoModo(null);
    }
    await onAtualizar();
  };

  const pagarPix = async (action: AcaoCobranca) => {
    if (busy) return;
    setBusy(true);
    try {
      await cobrar(action, "pix");
    } catch (e) {
      toast.error(mensagemErroPlano(codigoErro(e), { venceEm: p.ciclo_vence_em }, "Erro ao gerar o Pix."));
    } finally {
      setBusy(false);
    }
  };

  const pagarCartao = (action: AcaoCobranca) => async (f: CartaoFormData) => {
    try {
      await cobrar(action, "cartao", f);
    } catch (e) {
      toast.error(mensagemErroPlano(codigoErro(e), { venceEm: p.ciclo_vence_em }, "Erro no pagamento. Verifique os dados do cartão."));
      throw e; // Brick mostra estado de erro
    }
  };

  const assinar = async (f: CartaoFormData) => {
    try {
      const r = await invokeMp<{ assinatura: unknown; primeira_cobranca?: string | null }>("plano-assinar", { card_token: f?.token });
      toast.success(r.primeira_cobranca
        ? `Assinatura criada! A 1ª cobrança será em ${fmtData(r.primeira_cobranca)}, no fim do ciclo atual.`
        : "Assinatura criada! A cobrança mensal é automática.");
      setCartaoModo(null);
      await onAtualizar();
    } catch (e) {
      toast.error(mensagemErroPlano(codigoErro(e), {}, "Erro ao criar a assinatura. Verifique os dados do cartão."));
      throw e;
    }
  };

  const cancelarAssinatura = async () => {
    setBusy(true);
    try {
      await invokeMp("plano-cancelar-assinatura");
      toast.success("Assinatura cancelada.");
      setConfirmarCancelar(false);
      await onAtualizar();
    } catch (e) {
      toast.error(mensagemErroPlano(codigoErro(e), {}, "Erro ao cancelar a assinatura."));
    } finally {
      setBusy(false);
    }
  };

  const brick = (() => {
    if (cartaoModo === "ciclo") {
      return { amount: valorMensal ?? 0, descricao: `Ciclo ${fmtData(p.ciclo_inicio)} → ${fmtData(p.ciclo_vence_em)} · ${fmtBRL(valorMensal)} no cartão (pagamento único).`, onSubmit: pagarCartao("plano-pagar-ciclo") };
    }
    if (cartaoModo === "anual") {
      return { amount: valorAnual ?? 0, descricao: `Plano anual · ${fmtBRL(valorAnual)} no cartão (10 mensalidades, 12 meses de acesso).`, onSubmit: pagarCartao("plano-anual") };
    }
    return { amount: valorPlano, descricao: `Assinatura de ${fmtBRL(valorPlano)}/mês com cobrança automática a partir do fim do ciclo atual. Cancele quando quiser.`, onSubmit: assinar };
  })();

  return (
    <section className={CARD} data-plano-pagar>
      <h2 className={TITULO_CARD}>Pagamentos do plano</h2>

      {pausada && (
        <p className="text-xs text-muted-foreground font-body">Cobrança pausada pelo administrador — nada a pagar por enquanto.</p>
      )}

      {pix ? (
        <PixPendenteBox
          pagamento={pix}
          onAtualizar={onAtualizar}
          onNovo={() => { const t = pix.tipo_cobranca === "anual" ? "plano-anual" : "plano-pagar-ciclo"; setPix(null); void pagarPix(t); }}
          onFechar={() => setPix(null)}
        />
      ) : cartaoModo ? (
        <CartaoBrick amount={brick.amount} email={user?.email || ""} descricao={brick.descricao} onSubmit={brick.onSubmit} onFechar={() => setCartaoModo(null)} testid={cartaoModo} />
      ) : (
        <div className="space-y-4">
          {/* ciclo atual */}
          {!anualAtivo && !pausada && (
            <div className="space-y-2" data-plano-ciclo>
              <p className={ROTULO}>Pagar o ciclo</p>
              <p className="text-sm font-body text-foreground">
                {p.ciclo_inicio && p.ciclo_vence_em ? `Ciclo ${fmtData(p.ciclo_inicio)} → ${fmtData(p.ciclo_vence_em)}` : "Ciclo atual"}
                {valorMensal !== null ? <> · <span className="font-heading text-primary">{fmtBRL(valorMensal)}</span></> : null}
              </p>
              {!podeCiclo && liberaEm && (
                <p className="text-xs text-muted-foreground font-body" data-plano-ciclo-libera>
                  O pagamento libera em {fmtData(liberaEm)} (3 dias antes do vencimento).
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => pagarPix("plano-pagar-ciclo")} disabled={busy || !podeCiclo}
                  className={`inline-flex items-center gap-2 ${BTN_PRIMARIO}`} data-plano-pagar-ciclo-pix>
                  <QrCode size={14} /> {busy ? "Gerando..." : "Pagar via Pix"}
                </button>
                <button type="button" onClick={() => setCartaoModo("ciclo")} disabled={busy || !podeCiclo}
                  className={`inline-flex items-center gap-2 ${BTN_SECUNDARIO}`} data-plano-pagar-ciclo-cartao>
                  <CreditCard size={14} /> Pagar com cartão
                </button>
              </div>
            </div>
          )}

          {/* assinatura recorrente */}
          {!anualAtivo && !pausada && (
            <div className="space-y-2 border-t border-muted-foreground/20 pt-3" data-plano-assinatura>
              <p className={ROTULO}>Assinatura no cartão</p>
              {assinaturaAtiva && assinatura ? (
                <>
                  <p className="text-sm font-body text-foreground">
                    Assinatura <span className="text-primary">{ASSINATURA_LABEL[assinatura.status] || assinatura.status}</span> — {fmtBRL(assinatura.valor)}/mês cobrados automaticamente.
                  </p>
                  {assinatura.proxima_cobranca && (
                    <p className="text-sm font-body text-foreground">
                      Próxima cobrança: <span className="text-primary font-heading">{new Date(assinatura.proxima_cobranca).toLocaleDateString("pt-BR")}</span>
                    </p>
                  )}
                  <button type="button" onClick={() => setConfirmarCancelar(true)} disabled={busy} className={BTN_PERIGO} data-plano-cancelar-assinatura>
                    Cancelar assinatura
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground font-body">
                    Cobra {fmtBRL(valorPlano)} automaticamente todo mês no cartão, a partir do fim do ciclo atual. Cancele quando quiser.
                  </p>
                  <button type="button" onClick={() => setCartaoModo("assinatura")} disabled={busy} className={`inline-flex items-center gap-2 ${BTN_SECUNDARIO}`} data-plano-assinar>
                    <CreditCard size={14} /> Assinar recorrente no cartão
                  </button>
                </>
              )}
            </div>
          )}

          {/* anual */}
          {!pausada && (
            <div className={`space-y-2 ${anualAtivo ? "" : "border-t border-muted-foreground/20 pt-3"}`} data-plano-anual>
              <p className={ROTULO}>Plano anual (10 mensalidades)</p>
              {anualAtivo ? (
                <p className="text-sm font-body text-foreground">
                  Plano anual ativo até <span className="text-primary font-heading">{fmtData(p.anual_ate)}</span>. Nada a pagar até lá.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground font-body">
                    12 meses de acesso pagando 10 mensalidades{valorAnual !== null ? ` — ${fmtBRL(valorAnual)}` : ""}. O período anual começa na aprovação do pagamento.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => pagarPix("plano-anual")} disabled={busy} className={`inline-flex items-center gap-2 ${BTN_SECUNDARIO}`} data-plano-anual-pix>
                      <QrCode size={14} /> Anual via Pix
                    </button>
                    <button type="button" onClick={() => setCartaoModo("anual")} disabled={busy} className={`inline-flex items-center gap-2 ${BTN_SECUNDARIO}`} data-plano-anual-cartao>
                      <CreditCard size={14} /> Anual com cartão
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmarDialog
        open={confirmarCancelar}
        titulo="Cancelar assinatura?"
        descricao="A cobrança automática para imediatamente. Você continua podendo pagar cada ciclo por Pix ou cartão avulso."
        confirmar="Cancelar assinatura"
        perigo
        busy={busy}
        onConfirmar={cancelarAssinatura}
        onCancelar={() => setConfirmarCancelar(false)}
        testid="cancelar-assinatura"
      />
    </section>
  );
}
