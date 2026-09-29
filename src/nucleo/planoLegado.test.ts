import { describe, expect, it } from "vitest";
import { conta } from "@/test/fixturesNucleo";
import { planoCartaoConta, planoCartaoNutri, situacaoNutri, textoTravaNutri } from "./planoLegado";

const AGORA = new Date("2026-09-29T12:00:00-03:00");
const nutri = (o: Record<string, unknown> = {}) => ({
  role: "nutricionista", teste_ate: null, pago_ate: null, isento_assinatura: false, assinatura: null, ...o,
}) as Parameters<typeof situacaoNutri>[0];

describe("trava do Nutri legado = a regra do assinaturaUtil.ts do site antigo", () => {
  it("isento (master ou marcado) > cartão ativo > PIX pago > teste > trava", () => {
    expect(situacaoNutri(nutri({ role: "master" }), AGORA)).toMatchObject({ situacao: "isento", bloqueado: false });
    expect(situacaoNutri(nutri({ isento_assinatura: true }), AGORA)).toMatchObject({ situacao: "isento", bloqueado: false });
    expect(situacaoNutri(nutri({ assinatura: { status: "authorized" }, teste_ate: "2026-01-01T00:00:00Z" }), AGORA).situacao).toBe("ativa");
    expect(situacaoNutri(nutri({ pago_ate: "2026-10-20T00:00:00Z" }), AGORA)).toMatchObject({ situacao: "pix", bloqueado: false });
    expect(situacaoNutri(nutri({ teste_ate: "2026-10-04T12:00:00Z" }), AGORA)).toMatchObject({ situacao: "teste", bloqueado: false });
    expect(situacaoNutri(nutri({ teste_ate: "2026-09-01T00:00:00Z" }), AGORA)).toMatchObject({ situacao: "vencida", bloqueado: true });
    expect(situacaoNutri(nutri({ assinatura: { status: "pending" } }), AGORA)).toMatchObject({ situacao: "pendente", bloqueado: true });
    expect(situacaoNutri(nutri({ assinatura: { status: "paused" } }), AGORA).situacao).toBe("pausada");
    expect(situacaoNutri(nutri({ assinatura: { status: "cancelled" } }), AGORA).situacao).toBe("cancelada");
  });
  it("sem dado não trava ninguém (como o site antigo com o perfil ainda carregando)", () => {
    expect(situacaoNutri(null, AGORA).bloqueado).toBe(false);
  });
  it("texto da trava", () => {
    expect(textoTravaNutri(situacaoNutri(nutri({ pago_ate: "2026-09-10T12:00:00Z" }), AGORA))).toContain("venceu em 10/09");
    expect(textoTravaNutri(situacaoNutri(nutri({ teste_ate: "2026-09-12T12:00:00Z" }), AGORA))).toContain("teste terminou em 12/09");
  });
});

describe("card do plano no menu (tela 6)", () => {
  it("Nutri legado", () => {
    expect(planoCartaoNutri(nutri({ teste_ate: "2026-10-04T12:00:00Z" }), AGORA)).toMatchObject({ linha: "Teste até 04/10", tom: "neutro", modulos: ["nutricao"] });
    expect(planoCartaoNutri(nutri({ isento_assinatura: true }), AGORA)).toMatchObject({ linha: "Sem cobrança", tom: "ok" });
    expect(planoCartaoNutri(nutri(), AGORA)).toMatchObject({ linha: "Assinatura pendente", tom: "erro" });
  });
  it("conta nova e isenta", () => {
    expect(planoCartaoConta(conta({ situacao: "teste", teste_ate: "2026-10-13" }))).toMatchObject({ nome: "Plano Treino + Nutrição", linha: "Teste até 13/10" });
    expect(planoCartaoConta(conta({ situacao: "vencida", vence_em: "2026-09-20" }))).toMatchObject({ linha: "Venceu em 20/09", tom: "erro" });
    expect(planoCartaoConta(conta({ situacao: "isenta", plano: "treino", modulos: ["treino"] }), true)).toMatchObject({ nome: "Conta master", linha: "Sem cobrança" });
  });
});
