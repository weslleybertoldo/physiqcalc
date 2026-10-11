// src/painel/configuracoes/plano/CartaoPagamento.test.tsx
// Physiq W-P (§7 I6): o máximo de parcelas vem por prop, padrão 1 — o pagamento do plano do personal ao Weslley continua 1×.
// E2E de tela da W-P (Task 17): o Brick não reinicia quando o painel re-renderiza (fechar o painel re-renderiza durante a saída; a
// reinicialização atrasada não achava o container e o erro sem dono ia para o aviso de erro do app).
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

type PropsDoBrick = {
  initialization: unknown;
  customization: { paymentMethods: { maxInstallments: number } };
  onSubmit: (form: unknown) => Promise<void>;
  onError: (e: unknown) => void;
};
const h = vi.hoisted(() => ({ props: [] as PropsDoBrick[] }));
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

describe("CartaoPagamento — o Brick não reinicia a cada render (E2E de tela da W-P)", () => {
  it("re-render com outro aoEnviar (o pai re-renderiza, como ao fechar): as props do Brick são as mesmas", () => {
    h.props.length = 0;
    const { rerender } = render(<CartaoPagamento {...base} modo="avista" maxParcelas={3} aoEnviar={async () => {}} />);
    const antes = h.props.at(-1)!;
    rerender(<CartaoPagamento {...base} modo="avista" maxParcelas={3} aoEnviar={async () => {}} />);
    const depois = h.props.at(-1)!;
    expect(h.props.length).toBeGreaterThan(1);
    expect(depois.initialization).toBe(antes.initialization);
    expect(depois.customization).toBe(antes.customization);
    expect(depois.onSubmit).toBe(antes.onSubmit);
    expect(depois.onError).toBe(antes.onError);
  });
  it("o envio usa o aoEnviar mais novo", async () => {
    h.props.length = 0;
    const primeiro = vi.fn(async () => {});
    const segundo = vi.fn(async () => {});
    const { rerender } = render(<CartaoPagamento {...base} modo="avista" aoEnviar={primeiro} />);
    rerender(<CartaoPagamento {...base} modo="avista" aoEnviar={segundo} />);
    await h.props.at(-1)!.onSubmit({ token: "tok", installments: 1 });
    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledWith({ token: "tok", installments: 1 });
  });
});
