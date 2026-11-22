// @vitest-environment node
// bcode-0021 (item 8) — a chave do freio em memória das 4 funções do Treino que freiam por IP (treino-leitura, treino-acessos,
// trocar-token e painel-resumo-treino; supabase/functions/_shared/freio-ip.ts): o código do 1º IP do x-forwarded-for com o sal da
// instância, nunca o IP. O contrato das funções (a chave sempre passa por aqui): src/lib/freioSemIp.test.ts.
import { describe, expect, it, vi } from "vitest";
import { chaveDoFreio } from "../../supabase/functions/_shared/freio-ip";

const pedido = (cabecalhos: Record<string, string> = {}) => new Headers(cabecalhos);

describe("bcode-0021 (item 8): a chave do freio por IP do Treino", () => {
  it("o 1º IP do x-forwarded-for (o do aparelho) vira um código de 64 hex sem o IP; o proxy que vem depois não muda a chave", async () => {
    const comProxy = await chaveDoFreio(pedido({ "x-forwarded-for": "10.0.0.1, 13.248.114.169" }));
    const so = await chaveDoFreio(pedido({ "x-forwarded-for": "10.0.0.1" }));
    expect(comProxy).toBe(so);
    expect(so).toMatch(/^[0-9a-f]{64}$/);
    expect(so).not.toContain("10.0.0.1");
    expect(comProxy).not.toContain("13.248");
    expect(await chaveDoFreio(pedido({ "x-forwarded-for": "  10.0.0.1  " }))).toBe(so);
  });

  it("o mesmo IP dá a mesma chave na instância (o freio conta igual); outro IP, outra chave", async () => {
    const a = await chaveDoFreio(pedido({ "x-forwarded-for": "187.65.18.77" }));
    expect(await chaveDoFreio(pedido({ "x-forwarded-for": "187.65.18.77" }))).toBe(a);
    expect(await chaveDoFreio(pedido({ "x-forwarded-for": "187.65.18.78" }))).not.toBe(a);
    expect(await chaveDoFreio(pedido({ "x-forwarded-for": "187.65.18.78, 187.65.18.77" }))).not.toBe(a);
  });

  it("o sal é da instância: outra instância (o módulo carregado de novo) dá outro código para o mesmo IP", async () => {
    const daqui = await chaveDoFreio(pedido({ "x-forwarded-for": "10.0.0.1" }));
    vi.resetModules();
    const outra = await import("../../supabase/functions/_shared/freio-ip");
    const dela = await outra.chaveDoFreio(pedido({ "x-forwarded-for": "10.0.0.1" }));
    expect(dela).toMatch(/^[0-9a-f]{64}$/);
    expect(dela).not.toBe(daqui);
  });

  it("sem o x-forwarded-for (ausente, vazio ou com o 1º vazio) → o balde \"sem-ip\" de sempre; outro cabeçalho de IP não conta", async () => {
    expect(await chaveDoFreio(pedido())).toBe("sem-ip");
    expect(await chaveDoFreio(pedido({ "x-forwarded-for": "" }))).toBe("sem-ip");
    expect(await chaveDoFreio(pedido({ "x-forwarded-for": " , 10.0.0.1" }))).toBe("sem-ip");
    expect(await chaveDoFreio(pedido({ "cf-connecting-ip": "10.0.0.1", "x-real-ip": "10.0.0.1" }))).toBe("sem-ip");
  });
});
