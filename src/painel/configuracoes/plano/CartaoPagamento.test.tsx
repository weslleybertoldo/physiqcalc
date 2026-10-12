// src/painel/configuracoes/plano/CartaoPagamento.test.tsx
// Physiq W-P (§7 I6): o máximo de parcelas vem por prop, padrão 1 — o pagamento do plano do personal ao Weslley continua 1×.
// E2E de tela da W-P (Task 17): o Brick não reinicia quando o painel re-renderiza (fechar o painel re-renderiza durante a saída; a
// reinicialização atrasada não achava o container e o erro sem dono ia para o aviso de erro do app).
// W2 (Task 17): a chave do vendedor (o Mercado Pago do personal) por prop — o SDK inicia com ela ao abrir, a key do Brick leva a chave e
// o data-brick-chave diz QUAL ("conta" | "physiq") sem expor o valor; sem a prop, a do Physiq; sem nenhuma, a mensagem de hoje.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type PropsDoBrick = {
  initialization: unknown;
  customization: { paymentMethods: { maxInstallments: number } };
  onSubmit: (form: unknown) => Promise<void>;
  onError: (e: unknown) => void;
};
const h = vi.hoisted(() => ({ props: [] as PropsDoBrick[], ensure: vi.fn(), chavePhysiq: "TEST-chave" as string | undefined }));
// o Brick falso deixa um nó na página: o mesmo nó depois de um re-render = o Brick não remontou
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: (p: never) => { h.props.push(p); return <div data-brick-falso />; } }));
vi.mock("@/components/pagamentos/mpInit", () => ({
  get MP_PUBLIC_KEY() {
    return h.chavePhysiq;
  },
  ensureMpInit: (...a: unknown[]) => h.ensure(...a),
}));

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

describe("CartaoPagamento — a chave do vendedor (W2: o Mercado Pago do personal)", () => {
  const VENDEDOR = "APP_USR-chave-publica-do-vendedor";
  beforeEach(() => {
    h.props.length = 0;
    h.ensure.mockReset();
    h.chavePhysiq = "TEST-chave";
  });

  it("sem chavePublica: a do Physiq — o SDK com ela ao abrir e data-brick-chave='physiq'", () => {
    render(<CartaoPagamento {...base} modo="avista" />);
    expect(h.ensure).toHaveBeenCalledWith("TEST-chave");
    expect(document.querySelector("[data-brick-mp]")?.getAttribute("data-brick-chave")).toBe("physiq");
  });

  it("com a chave do vendedor: o SDK com a DELE (nunca a do Physiq), data-brick-chave='conta' e o valor da chave fora da página", () => {
    render(<CartaoPagamento {...base} modo="avista" chavePublica={VENDEDOR} />);
    expect(h.ensure.mock.calls).toEqual([[VENDEDOR]]);
    expect(document.querySelector("[data-brick-mp]")?.getAttribute("data-brick-chave")).toBe("conta");
    expect(document.body.innerHTML).not.toContain(VENDEDOR);
  });

  it("a cobrança automática no cartão do personal também nasce com a chave dele", () => {
    render(<CartaoPagamento {...base} modo="assinar" chavePublica={VENDEDOR} />);
    expect(h.ensure).toHaveBeenLastCalledWith(VENDEDOR);
    expect(document.querySelector('[data-cartao-mp="assinar"] [data-brick-chave="conta"]')).not.toBeNull();
  });

  it("fechado não inicia o SDK", () => {
    render(<CartaoPagamento {...base} aberto={false} modo="avista" chavePublica={VENDEDOR} />);
    expect(h.ensure).not.toHaveBeenCalled();
  });

  it("re-render com a mesma chave (como ao fechar) não remonta o Brick nem inicia de novo; trocar a chave remonta com a nova", () => {
    const { rerender } = render(<CartaoPagamento {...base} modo="avista" chavePublica="APP_USR-a" />);
    const no = document.querySelector("[data-brick-falso]");
    const antes = h.props.at(-1)!;
    rerender(<CartaoPagamento {...base} modo="avista" chavePublica="APP_USR-a" aoEnviar={async () => {}} />);
    expect(document.querySelector("[data-brick-falso]")).toBe(no);
    expect(h.props.at(-1)!.initialization).toBe(antes.initialization);
    expect(h.props.at(-1)!.customization).toBe(antes.customization);
    expect(h.ensure).toHaveBeenCalledTimes(1);
    rerender(<CartaoPagamento {...base} modo="avista" chavePublica="APP_USR-b" />);
    expect(document.querySelector("[data-brick-falso]")).not.toBe(no);
    expect(h.ensure).toHaveBeenLastCalledWith("APP_USR-b");
  });

  it("sem chave nenhuma: a mensagem de hoje e nenhum Brick; a do vendedor abre o Brick mesmo sem a do Physiq no build", () => {
    h.chavePhysiq = undefined;
    const r = render(<CartaoPagamento {...base} modo="avista" />);
    expect(document.body.textContent).toContain("Chave pública do Mercado Pago não configurada.");
    expect(document.querySelector("[data-brick-mp]")).toBeNull();
    r.unmount();
    render(<CartaoPagamento {...base} modo="avista" chavePublica={VENDEDOR} />);
    expect(document.querySelector('[data-brick-mp][data-brick-chave="conta"]')).not.toBeNull();
    expect(h.ensure).toHaveBeenLastCalledWith(VENDEDOR);
  });
});
