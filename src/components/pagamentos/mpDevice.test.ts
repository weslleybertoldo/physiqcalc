// mp-cartao (contrato §2.1, §4): o script de segurança do Mercado Pago (1 <script> com view="checkout" e o nonce da CSP, sem duplicar), a
// espera pelo id do aparelho (pronto → na hora; vazio → até 2 s, sem lançar; fora do formato → nada) e o pagador do Brick (o titular e o
// documento, só o que veio). O jsdom não baixa script de fora: o id é posto à mão em window.MP_DEVICE_SESSION_ID.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MP_CSP_NONCE } from "./mpInit";
import { DEVICE_RX, ESPERA_DEVICE_MS, MP_SECURITY_JS, carregarSegurancaMp, deviceIdMp, pagadorDoBrick } from "./mpDevice";

const DEVICE = "armor.4f1c2e3d5a6b7c8d9e0f1a2b3c4d5e6f.1760500000";
type ComDevice = { MP_DEVICE_SESSION_ID?: unknown };
const scripts = () => [...document.querySelectorAll<HTMLScriptElement>("script[data-mp-seguranca]")];

beforeEach(() => {
  for (const s of scripts()) s.remove();
  delete (window as ComDevice).MP_DEVICE_SESSION_ID;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("carregarSegurancaMp (o security.js na página)", () => {
  it("1 <script> no <head>: o endereço do MP, async, view=checkout e o nonce da CSP (o widget herda o currentScript.nonce)", () => {
    carregarSegurancaMp();
    const [s, ...outros] = scripts();
    expect(outros).toEqual([]);
    expect(s.parentElement).toBe(document.head);
    expect(s.src).toBe(MP_SECURITY_JS);
    expect(s.async).toBe(true);
    expect(s.getAttribute("view")).toBe("checkout");
    expect(s.nonce).toBe(MP_CSP_NONCE);
    expect(MP_SECURITY_JS).toBe("https://www.mercadopago.com/v2/security.js");
  });
  it("chamar de novo (a folha abre e fecha) não duplica", () => {
    carregarSegurancaMp();
    carregarSegurancaMp();
    carregarSegurancaMp();
    expect(scripts()).toHaveLength(1);
  });
});

describe("deviceIdMp (a espera pelo id do aparelho no envio)", () => {
  it("o id pronto no formato → na hora", async () => {
    (window as ComDevice).MP_DEVICE_SESSION_ID = DEVICE;
    await expect(deviceIdMp()).resolves.toBe(DEVICE);
  });
  it("fora do formato (quebra de linha, 600 caracteres, não-texto) → undefined, sem esperar", async () => {
    carregarSegurancaMp();
    for (const ruim of [`${DEVICE}\n`, "a".repeat(600), 123456789, { id: DEVICE }]) {
      (window as ComDevice).MP_DEVICE_SESSION_ID = ruim;
      const t0 = Date.now();
      await expect(deviceIdMp()).resolves.toBeUndefined();
      expect(Date.now() - t0).toBeLessThan(150);
    }
    expect(DEVICE_RX.test(DEVICE)).toBe(true);
  });
  it("vazio com o script carregando → tenta a cada 200 ms e dá undefined em ≤ 2 s, sem lançar", async () => {
    vi.useFakeTimers();
    carregarSegurancaMp();
    let fim: string | undefined | "pendente" = "pendente";
    void deviceIdMp().then((v) => { fim = v; });
    await vi.advanceTimersByTimeAsync(ESPERA_DEVICE_MS - 200);
    expect(fim).toBe("pendente");
    await vi.advanceTimersByTimeAsync(400);
    expect(fim).toBeUndefined();
    expect(ESPERA_DEVICE_MS).toBe(2000);
  });
  it("vazio e o id chega durante a espera → o id", async () => {
    vi.useFakeTimers();
    carregarSegurancaMp();
    const pedido = deviceIdMp();
    await vi.advanceTimersByTimeAsync(600);
    (window as ComDevice).MP_DEVICE_SESSION_ID = DEVICE;
    await vi.advanceTimersByTimeAsync(200);
    await expect(pedido).resolves.toBe(DEVICE);
  });
  it("sem o script na página (o plano do painel) ou com o script que falhou (bloqueado) → undefined na hora", async () => {
    await expect(deviceIdMp()).resolves.toBeUndefined();
    carregarSegurancaMp();
    scripts()[0].dispatchEvent(new Event("error"));
    const t0 = Date.now();
    await expect(deviceIdMp()).resolves.toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(150);
  });
});

describe("pagadorDoBrick (o titular e o documento do formulário do cartão)", () => {
  const form = (identification?: unknown) => ({ token: "tok", payment_method_id: "master", installments: 1, payer: { email: "a@b.c", identification } });
  it("o nome (sem controle, espaços colapsados) e o CPF só com os dígitos", () => {
    expect(pagadorDoBrick(form({ type: "CPF", number: "123.456.789-09" }), { cardholderName: "  Maria\t da\u0000Silva ", bin: "503143", lastFourDigits: "6351" }))
      .toEqual({ nome: "Maria da Silva", documento: { tipo: "CPF", numero: "12345678909" } });
  });
  it("o CNPJ com 14; o tipo em minúsculas vira maiúsculas; número curto ou tipo desconhecido → sem documento", () => {
    expect(pagadorDoBrick(form({ type: "cnpj", number: "11222333000181" }), undefined)).toEqual({ documento: { tipo: "CNPJ", numero: "11222333000181" } });
    expect(pagadorDoBrick(form({ type: "CPF", number: "1234" }), { cardholderName: "Ana" })).toEqual({ nome: "Ana" });
    expect(pagadorDoBrick(form({ type: "RG", number: "12345678909" }), { cardholderName: "Ana" })).toEqual({ nome: "Ana" });
  });
  it("o nome até 120", () => {
    expect(pagadorDoBrick(form(), { cardholderName: "A".repeat(300) })?.nome).toHaveLength(120);
  });
  it("sem nome nem documento (o 1º parâmetro só, como antes) → undefined", () => {
    expect(pagadorDoBrick({ token: "tok", installments: 1 }, undefined)).toBeUndefined();
    expect(pagadorDoBrick(form(), { cardholderName: "   " })).toBeUndefined();
    expect(pagadorDoBrick(null, null)).toBeUndefined();
  });
});
