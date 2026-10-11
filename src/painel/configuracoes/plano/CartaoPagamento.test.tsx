// src/painel/configuracoes/plano/CartaoPagamento.test.tsx
// Physiq W-P (§7 I6): o máximo de parcelas vem por prop, padrão 1 — o pagamento do plano do personal ao Weslley continua 1×.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ props: [] as Array<{ customization: { paymentMethods: { maxInstallments: number } } }> }));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: (p: never) => { h.props.push(p); return null; } }));
vi.mock("@/components/pagamentos/mpInit", () => ({ MP_PUBLIC_KEY: "TEST-chave", ensureMpInit: vi.fn() }));

import { CartaoPagamento } from "./CartaoPagamento";

const base = { aberto: true, aoMudar: () => {}, valor: 1000, email: "a@teste.com", descricao: "x", aoEnviar: async () => {} };

describe("CartaoPagamento — parcelas (I6)", () => {
  it("padrão = 1 parcela", () => {
    h.props.length = 0;
    render(<CartaoPagamento {...base} modo="avista" />);
    expect(h.props.at(-1)!.customization.paymentMethods.maxInstallments).toBe(1);
  });
  it("cartão parcelado: até o máximo do plano e o texto 'Em até N×'", () => {
    h.props.length = 0;
    render(<CartaoPagamento {...base} modo="avista" maxParcelas={10} />);
    expect(h.props.at(-1)!.customization.paymentMethods.maxInstallments).toBe(10);
    expect(document.body.textContent).toContain("Em até 10× no cartão");
  });
  it("a cobrança automática é sempre 1×", () => {
    h.props.length = 0;
    render(<CartaoPagamento {...base} modo="assinar" maxParcelas={10} />);
    expect(h.props.at(-1)!.customization.paymentMethods.maxInstallments).toBe(1);
  });
});
