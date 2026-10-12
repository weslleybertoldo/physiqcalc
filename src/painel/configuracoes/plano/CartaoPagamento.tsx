import { useCallback, useEffect, useMemo, useRef } from "react";
import { CardPayment } from "@mercadopago/sdk-react";
import { CreditCard, Repeat } from "lucide-react";
import { MP_PUBLIC_KEY, ensureMpInit } from "@/components/pagamentos/mpInit";
import { reais } from "@/nucleo/cobranca/regras";
import { PainelDeslizante } from "@/ui/premium/Sheet";

export interface DadosCartao {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string | number;
  installments?: number;
}

/**
 * Cartão pelo Card Payment Brick do Mercado Pago (o número do cartão nunca passa pelo nosso servidor — só o token), num
 * painel deslizante do visual premium, tema escuro. Serve o cartão à vista (W-P I6: em até N parcelas no cartão parcelado)
 * e a cobrança automática (assinatura mensal, sempre 1×).
 * W2: com `chavePublica` (o Mercado Pago do personal), o Brick nasce com a chave DO VENDEDOR — o token do cartão vale na conta que
 * recebe; sem ela, a do Physiq (o plano do personal e o modo de hoje). Quem paga o personal sem a chave dele não abre este cartão
 * (decisão 14). O `data-brick-chave` diz QUAL chave ("conta" | "physiq") para o E2E, nunca o valor.
 */
export function CartaoPagamento({
  aberto,
  aoMudar,
  modo,
  valor,
  email,
  descricao,
  aoEnviar,
  maxParcelas = 1,
  chavePublica,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  modo: "avista" | "assinar";
  valor: number;
  email: string;
  descricao: string;
  /** deve LANÇAR em erro — o Brick mostra a falha */
  aoEnviar: (dados: DadosCartao) => Promise<void>;
  /** W-P (I6): até quantas parcelas (cartão parcelado); padrão 1 */
  maxParcelas?: number;
  /** W2: a chave pública do vendedor (o Mercado Pago do personal); sem ela, a do Physiq */
  chavePublica?: string;
}) {
  const chave = chavePublica ?? MP_PUBLIC_KEY;
  useEffect(() => {
    if (aberto) ensureMpInit(chave);
  }, [aberto, chave]);
  const Icone = modo === "assinar" ? Repeat : CreditCard;
  const parcelas = modo === "assinar" ? 1 : Math.max(1, Math.min(12, maxParcelas));
  // O CardPayment reinicia o Brick sempre que uma destas props muda de identidade (o useEffect dele): ficam as mesmas entre os renders.
  // Fechar o painel re-renderiza durante a saída; a reinicialização atrasada (200 ms) não achava mais o container ("Could not find the
  // Brick container ID") e o erro sem dono ia para o aviso de erro do app (E2E de tela da W-P). Chave (W2), valor e parcelas trocam
  // pela key — a chave não muda com o painel aberto (quem paga guarda a matrícula do momento do Pagar).
  const initialization = useMemo(() => ({ amount: valor, payer: { email } }), [valor, email]);
  const customization = useMemo(() => ({
    paymentMethods: { maxInstallments: parcelas },
    visual: { style: { theme: "dark" as const, customVariables: { baseColor: "#8B5CF6", formBackgroundColor: "#0f0f12", borderRadiusLarge: "16px" } } },
  }), [parcelas]);
  const enviar = useRef(aoEnviar);
  useEffect(() => {
    enviar.current = aoEnviar;
  }, [aoEnviar]);
  const aoSubmeter = useCallback((form: unknown) => enviar.current(form as DadosCartao), []);
  const aoErro = useCallback((e: unknown) => console.error("[Brick] erro", e), []);
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
            {modo === "assinar" ? "Todo mês, no mesmo dia" : parcelas > 1 ? `Em até ${parcelas}× no cartão` : "Pagamento único"}
            <b className="block text-[17px] font-bold tabular-nums tracking-[-0.02em] text-texto">{reais(valor)}{modo === "assinar" ? "/mês" : ""}</b>
          </span>
        </div>
        {chave ? (
          <div className="overflow-hidden rounded-2xl" data-brick-mp data-brick-chave={chavePublica ? "conta" : "physiq"}>
            <CardPayment
              key={`${chave}-${modo}-${valor}-${parcelas}`}
              initialization={initialization}
              customization={customization}
              onSubmit={aoSubmeter}
              onError={aoErro}
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
