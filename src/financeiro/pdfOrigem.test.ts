import { beforeEach, describe, expect, it, vi } from "vitest";

// play-W6, a revisão 🟡5: o rodapé do comprovante em PDF diz quem processou o pagamento — a forma nova google_play (o histórico mostra
// "Google Play") não pode cair no "Mercado Pago". O jsPDF de mentira só guarda os textos; nada é salvo.
const h = vi.hoisted(() => ({ textos: [] as string[] }));
vi.mock("jspdf", () => {
  class Doc {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    text(t: unknown) {
      h.textos.push(String(t));
      return this;
    }
    getTextWidth() {
      return 10;
    }
  }
  const nada = () => undefined;
  for (const m of ["setFillColor", "rect", "setFont", "setFontSize", "setTextColor", "setDrawColor", "line"]) {
    (Doc.prototype as unknown as Record<string, unknown>)[m] = nada;
  }
  return { jsPDF: Doc };
});
vi.mock("@/lib/salvarPdf", () => ({ salvarPdf: async () => {} }));

import { baixarComprovantePdf } from "./pdf";
import type { CobrancaVista } from "./tipos";

const cobranca = (forma: string): CobrancaVista =>
  ({
    id: "c1", paciente_id: "p1", tipo: "mensalidade", descricao: "Mensalidade", valor: 31.9, vencimento: "2026-10-16", mes_ref: "2026-10-01",
    status: "paga", pago_em: "2026-10-16T10:00:00Z", forma, metodo: null, enviado_em: null, cobre_ate: null, recusado_motivo: null,
    recusado_em: null, reembolsado_em: null,
  }) as unknown as CobrancaVista;

const rodape = async (forma: string) => {
  h.textos = [];
  await baixarComprovantePdf(cobranca(forma), { aluno: "Aluna de teste", profissional: null });
  return h.textos.find((t) => t.startsWith("Emitido em")) ?? "";
};

beforeEach(() => {
  h.textos = [];
});

describe("a origem no rodapé do comprovante em PDF", () => {
  it("google_play → \"Pagamento processado pela Google Play\" (nada de Mercado Pago)", async () => {
    const r = await rodape("google_play");
    expect(r).toMatch(/Pagamento processado pela Google Play$/);
    expect(r).not.toMatch(/Mercado Pago/);
  });
  it("infinitepay → \"Pagamento processado pela InfinitePay\" (o achado da W1, pela DECISÃO de 16/10 05:23)", async () => {
    const r = await rodape("infinitepay");
    expect(r).toMatch(/Pagamento processado pela InfinitePay$/);
    expect(r).not.toMatch(/Mercado Pago/);
  });
  it("as de antes iguais: o MP, o Pix na chave e o registro do profissional", async () => {
    expect(await rodape("mp")).toMatch(/Pagamento processado pelo Mercado Pago$/);
    expect(await rodape("pix_manual")).toMatch(/Pix na chave do profissional, confirmado por ele$/);
    expect(await rodape("manual")).toMatch(/Pagamento registrado pelo profissional$/);
  });
});
