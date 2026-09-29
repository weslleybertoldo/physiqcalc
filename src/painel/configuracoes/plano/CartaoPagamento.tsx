import { useEffect } from "react";
import { CardPayment } from "@mercadopago/sdk-react";
import { CreditCard, Repeat } from "lucide-react";
import { MP_PUBLIC_KEY, ensureMpInit } from "@/components/pagamentos/mpInit";
import { reais } from "@/nucleo/cobranca/regras";
import { PainelDeslizante } from "@/ui/premium/Sheet";

export interface DadosCartao {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string | number;
}

/**
 * Cartão pelo Card Payment Brick do Mercado Pago (o número do cartão nunca passa pelo nosso servidor — só o token), num
 * painel deslizante do visual premium, tema escuro. Serve o cartão à vista e a cobrança automática (assinatura mensal).
 */
export function CartaoPagamento({
  aberto,
  aoMudar,
  modo,
  valor,
  email,
  descricao,
  aoEnviar,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  modo: "avista" | "assinar";
  valor: number;
  email: string;
  descricao: string;
  /** deve LANÇAR em erro — o Brick mostra a falha */
  aoEnviar: (dados: DadosCartao) => Promise<void>;
}) {
  useEffect(() => {
    if (aberto) ensureMpInit();
  }, [aberto]);
  const Icone = modo === "assinar" ? Repeat : CreditCard;
  return (
    <PainelDeslizante
      aberto={aberto}
      aoMudar={aoMudar}
      lado="direita"
      titulo={modo === "assinar" ? "Cobrança automática no cartão" : "Pagar com cartão"}
      descricao={descricao}
    >
      <div className="flex flex-col gap-4" data-cartao-mp={modo}>
        <div className="flex items-center gap-3 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-3">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-superficie text-violeta-3">
            <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-texto-2">
            {modo === "assinar" ? "Todo mês, no mesmo dia" : "Pagamento único"}
            <b className="block text-[17px] font-bold tabular-nums tracking-[-0.02em] text-texto">{reais(valor)}{modo === "assinar" ? "/mês" : ""}</b>
          </span>
        </div>
        {MP_PUBLIC_KEY ? (
          <div className="overflow-hidden rounded-2xl" data-brick-mp>
            <CardPayment
              key={`${modo}-${valor}`}
              initialization={{ amount: valor, payer: { email } }}
              customization={{
                paymentMethods: { maxInstallments: 1 },
                visual: { style: { theme: "dark", customVariables: { baseColor: "#8B5CF6", formBackgroundColor: "#0f0f12", borderRadiusLarge: "16px" } } },
              }}
              onSubmit={(form) => aoEnviar(form as unknown as DadosCartao)}
              onError={(e) => console.error("[Brick] erro", e)}
            />
          </div>
        ) : (
          <p className="text-[13px] text-rosa-3">Chave pública do Mercado Pago não configurada.</p>
        )}
        <p className="text-[11.5px] leading-relaxed text-texto-3">
          Pagamento processado pelo Mercado Pago. {modo === "assinar" ? "Você cancela a cobrança automática quando quiser, aqui mesmo." : ""}
        </p>
      </div>
    </PainelDeslizante>
  );
}
