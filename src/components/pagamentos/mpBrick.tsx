import { useEffect } from "react";
import { X } from "lucide-react";
import { CardPayment } from "@mercadopago/sdk-react";
import { MP_PUBLIC_KEY, ensureMpInit } from "./mpInit";
import { BTN_LINK } from "./planoTexto";

// Brick de cartão do Mercado Pago pra cobrança do PROFESSOR — mesmo uso da aba Pagamentos do aluno
// (initMercadoPago com VITE_MP_PUBLIC_KEY; onSubmit(formData) → card_token/payment_method_id/issuer_id).

export interface CartaoFormData {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string | number;
  [k: string]: unknown;
}

interface Props {
  amount: number;
  email: string;
  descricao: string;
  /** deve LANÇAR em erro — o Brick mostra o estado de falha */
  onSubmit: (form: CartaoFormData) => Promise<void>;
  onFechar: () => void;
  testid?: string;
}

export function CartaoBrick({ amount, email, descricao, onSubmit, onFechar, testid = "cartao" }: Props) {
  useEffect(() => { ensureMpInit(); }, []);
  return (
    <div className="space-y-2" data-plano-brick={testid}>
      <p className="text-xs text-muted-foreground font-body">{descricao}</p>
      {MP_PUBLIC_KEY ? (
        <CardPayment
          key={`${testid}-${amount}`}
          initialization={{ amount, payer: { email } }}
          customization={{ paymentMethods: { maxInstallments: 1 } }}
          onSubmit={(form) => onSubmit(form as unknown as CartaoFormData)}
          onError={(err) => { console.error("[Brick] erro", err); }}
        />
      ) : (
        <p className="text-xs text-destructive font-body">Chave pública do Mercado Pago não configurada.</p>
      )}
      <button type="button" onClick={onFechar} className={`flex items-center gap-1 ${BTN_LINK}`} data-plano-brick-fechar>
        <X size={12} /> Fechar
      </button>
    </div>
  );
}
