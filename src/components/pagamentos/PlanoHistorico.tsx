import { useState } from "react";
import ComprovanteModal from "@/components/ComprovanteModal";
import { tipoPagamentoLabel, type MpPagamento } from "@/lib/mpClient";
import { fmtBRL } from "@/lib/saasApi";
import { CARD, PAGAMENTO_STATUS_LABEL, TIPO_COBRANCA_LABEL, TITULO_CARD, statusPagamentoCls } from "./planoTexto";

// Histórico dos pagamentos do PLANO (até 12, já vem ordenado da edge) — toque abre o comprovante
// (o `receipt` funciona pro dono do pagamento).
export function PlanoHistorico({ pagamentos }: { pagamentos: MpPagamento[] }) {
  const [comprovante, setComprovante] = useState<MpPagamento | null>(null);
  const lista = (pagamentos || []).slice(0, 12);

  return (
    <section className={CARD} data-plano-historico>
      <h2 className={TITULO_CARD}>Histórico</h2>
      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground font-body">Nenhum pagamento do plano ainda.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((p) => (
            <button type="button" key={p.id} onClick={() => setComprovante(p)}
              className="w-full flex items-center justify-between gap-3 text-sm font-body border-b border-muted-foreground/20 pb-2 last:border-0 last:pb-0 text-left hover:bg-muted/20 px-1 transition-colors"
              data-plano-historico-item={p.id}>
              <div className="min-w-0">
                <p className="text-foreground">
                  <span className="font-heading tracking-wider">{TIPO_COBRANCA_LABEL[p.tipo_cobranca || "mensal"] || "Pagamento"}</span>
                  <span className="text-muted-foreground"> — {new Date(p.created_at).toLocaleDateString("pt-BR")}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{tipoPagamentoLabel(p)} · toque pra ver o comprovante</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-foreground">{fmtBRL(Number(p.valor))}</p>
                <p className={`text-[10px] uppercase tracking-wider ${statusPagamentoCls(p.status)}`}>
                  {PAGAMENTO_STATUS_LABEL[p.status] || p.status}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {comprovante && <ComprovanteModal pagamento={comprovante} onClose={() => setComprovante(null)} />}
    </section>
  );
}
