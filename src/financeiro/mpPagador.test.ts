// Physiq mp-cartao (contrato §2.2, §4) — as regras puras do pedido de cartão ao Mercado Pago (_shared/mp-pagador-regras.ts): o aparelho (o
// cabeçalho X-meli-session-id), o pagador (o titular e o documento do formulário do cartão), o item, o descritor e o código da recusa — e o
// codigosDoMp tirando o cc_rejected_… da mensagem (as automáticas recusadas de 14/10 voltaram 400 sem error, cause nem status_detail).
// Os números de documento daqui são de TESTE (gerados com o dígito verificador; nenhum é de uma pessoa).
import { describe, expect, it } from "vitest";
import { codigosDoMp, recusaNoTexto, slugDaMensagem } from "../../supabase-principal/functions/_shared/cobranca-regras";
import {
  CABECALHO_DEVICE, CATEGORIA_DO_ITEM, DESCRITOR_FATURA, DEVICE_RX, cabecalhosDoDevice, cnpjValido, codigoDaRecusa, cpfValido, deviceDoPedido,
  infoAdicionalDoPedido, itemDoPedido, pagadorDoPedido, resultadoDoDevice,
} from "../../supabase-principal/functions/_shared/mp-pagador-regras";
import { validarCPF } from "@/publico/cadastro/regras";

const CPF_OK = "12345678909"; // o CPF de teste do MP (o mesmo dos card tokens dos E2E)
const CPF_DV_ERRADO = "12345678900";
const CNPJ_OK = "11222333000181";
const CNPJ_DV_ERRADO = "11222333000182";
const DEVICE = "armor.4f1c2e3d5a6b7c8d9e0f1a2b3c4d5e6f.1760500000";

describe("mp-cartao — o aparelho (X-meli-session-id)", () => {
  it("no formato: letras, dígitos e . _ : -, de 8 a 512", () => {
    expect(deviceDoPedido(DEVICE)).toBe(DEVICE);
    expect(deviceDoPedido("a".repeat(8))).toBe("a".repeat(8));
    expect(deviceDoPedido("a".repeat(512))).toBe("a".repeat(512));
    expect(DEVICE_RX.source).toBe("^[A-Za-z0-9._:-]{8,512}$");
  });
  it("fora do formato → null: quebra de linha (injeção de cabeçalho), 600 caracteres, curto, espaço, não-texto", () => {
    for (const ruim of [`${DEVICE}\n`, `${DEVICE}\r\nX-Idempotency-Key: x`, "a".repeat(600), "a".repeat(513), "abc", "com espaço aqui", "", null,
      undefined, 12345678, { id: DEVICE }, [DEVICE]]) {
      expect(deviceDoPedido(ruim), JSON.stringify(ruim)?.slice(0, 40)).toBeNull();
    }
  });
  it("o cabeçalho: só a chave dele (nunca Authorization, Content-Type ou X-Idempotency-Key); sem aparelho válido → {}", () => {
    expect(cabecalhosDoDevice(DEVICE)).toEqual({ "X-meli-session-id": DEVICE });
    expect(Object.keys(cabecalhosDoDevice(DEVICE))).toEqual([CABECALHO_DEVICE]);
    expect(cabecalhosDoDevice(null)).toEqual({});
    expect(cabecalhosDoDevice(`${DEVICE}\n`)).toEqual({});
    expect(cabecalhosDoDevice("a".repeat(600))).toEqual({});
  });
  it("o resultado do log: com/sem aparelho (nunca o id)", () => {
    expect(resultadoDoDevice(DEVICE)).toBe("com_device");
    expect(resultadoDoDevice(null)).toBe("sem_device");
  });
});

describe("mp-cartao — o documento (dígito verificador)", () => {
  it("CPF: o cálculo é o mesmo da tela (validarCPF) em 200 números", () => {
    for (let i = 0; i < 200; i++) {
      const n = String((i * 7_919_191 + 123_456_789) % 100_000_000_000).padStart(11, "0");
      expect(cpfValido(n), n).toBe(validarCPF(n));
    }
    expect(cpfValido(CPF_OK)).toBe(true);
    expect(cpfValido(CPF_DV_ERRADO)).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("123.456.789-09")).toBe(false); // só dígitos (a tela manda só os dígitos)
  });
  it("CNPJ: DV certo e errado; 14 iguais não vale; o alfanumérico fica fora", () => {
    expect(cnpjValido(CNPJ_OK)).toBe(true);
    expect(cnpjValido("11444777000161")).toBe(true);
    expect(cnpjValido(CNPJ_DV_ERRADO)).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("12ABC34501DE35")).toBe(false);
  });
});

describe("mp-cartao — o pagador (o titular do formulário do cartão)", () => {
  it("nome de 2+ palavras: a 1ª e o resto; o CPF com DV certo", () => {
    expect(pagadorDoPedido({ nome: "  Maria  da Silva  Souza ", documento: { tipo: "CPF", numero: CPF_OK } })).toEqual({
      first_name: "Maria", last_name: "da Silva Souza", identification: { type: "CPF", number: CPF_OK },
    });
  });
  it("nome de 1 palavra → só o first_name; acento, apóstrofo, hífen e ponto passam", () => {
    expect(pagadorDoPedido({ nome: "APRO" })).toEqual({ first_name: "APRO" });
    expect(pagadorDoPedido({ nome: "João D'Ávila-Neto Jr." })).toEqual({ first_name: "João", last_name: "D'Ávila-Neto Jr." });
  });
  it("cada parte até 60", () => {
    const r = pagadorDoPedido({ nome: `${"A".repeat(80)} ${"B".repeat(80)}` });
    expect(r.first_name).toHaveLength(60);
    expect(r.last_name).toHaveLength(60);
  });
  it("documento com DV errado, tipo desconhecido ou com pontuação → fora (o nome fica)", () => {
    expect(pagadorDoPedido({ nome: "Ana Lima", documento: { tipo: "CPF", numero: CPF_DV_ERRADO } })).toEqual({ first_name: "Ana", last_name: "Lima" });
    expect(pagadorDoPedido({ documento: { tipo: "RG", numero: CPF_OK } })).toEqual({});
    expect(pagadorDoPedido({ documento: { tipo: "CPF", numero: "123.456.789-09" } })).toEqual({});
    expect(pagadorDoPedido({ documento: { tipo: "cnpj", numero: CNPJ_OK } })).toEqual({ identification: { type: "CNPJ", number: CNPJ_OK } });
    expect(pagadorDoPedido({ documento: { tipo: "CNPJ", numero: CNPJ_DV_ERRADO } })).toEqual({});
  });
  it("nome com número, símbolo ou controle → fora; nada vindo ou lixo → {} (nunca lança)", () => {
    for (const nome of ["Ana 2", "Ana <script>", "Ana\u0000Lima", "---", "...", "", "a".repeat(301)]) {
      expect(pagadorDoPedido({ nome }), nome.slice(0, 20)).toEqual({});
    }
    for (const ruim of [null, undefined, "Ana", 1, [], { nome: 1, documento: "x" }]) expect(pagadorDoPedido(ruim)).toEqual({});
  });
});

describe("mp-cartao — o item, o additional_info e o descritor", () => {
  it("o item: id, título (até 120, espaços colapsados), a categoria, 1 unidade e o valor", () => {
    expect(itemDoPedido({ id: "mensalidade", titulo: "Mensalidade · out/2026", valor: 83.33 })).toEqual({
      id: "mensalidade", title: "Mensalidade · out/2026", category_id: "services", quantity: 1, unit_price: 83.33,
    });
    const longo = itemDoPedido({ id: "avulsa", titulo: `  ${"x ".repeat(100)}`, valor: 10 });
    expect(longo.title.length).toBeLessThanOrEqual(120);
    expect(itemDoPedido({ id: "avulsa", titulo: "", valor: 10 }).title).toBe("Physiq");
    expect(CATEGORIA_DO_ITEM).toBe("services");
  });
  it("o additional_info: o item sempre; o payer só com o nome (o documento nunca vai nele)", () => {
    const item = itemDoPedido({ id: "avulsa", titulo: "Consulta", valor: 50 });
    expect(infoAdicionalDoPedido(item, {})).toEqual({ items: [item] });
    expect(infoAdicionalDoPedido(item, { identification: { type: "CPF", number: CPF_OK } })).toEqual({ items: [item] });
    expect(infoAdicionalDoPedido(item, { first_name: "Ana" })).toEqual({ items: [item], payer: { first_name: "Ana" } });
    expect(infoAdicionalDoPedido(item, { first_name: "Ana", last_name: "Lima", identification: { type: "CPF", number: CPF_OK } }))
      .toEqual({ items: [item], payer: { first_name: "Ana", last_name: "Lima" } });
  });
  it("o descritor: PHYSIQ (o MP aceita até 13)", () => {
    expect(DESCRITOR_FATURA).toBe("PHYSIQ");
    expect(DESCRITOR_FATURA.length).toBeLessThanOrEqual(13);
  });
});

describe("mp-cartao — o motivo da recusa (codigosDoMp, a resposta de erro)", () => {
  it("cc_rejected_high_risk na mensagem → o código; texto livre → nada", () => {
    expect(recusaNoTexto({ message: "cc_rejected_high_risk" })).toBe("cc_rejected_high_risk");
    expect(recusaNoTexto({ message: "Card rejected: cc_rejected_high_risk (try another)" })).toBe("cc_rejected_high_risk");
    expect(recusaNoTexto({ code: "cc_rejected_bad_filled_security_code", message: "x" })).toBe("cc_rejected_bad_filled_security_code");
    expect(recusaNoTexto({ message: "Invalid card_token_id" })).toBeNull();
    expect(recusaNoTexto(null)).toBeNull();
    expect(codigosDoMp({ message: "cc_rejected_high_risk", status: 400 })).toEqual({ mp_status_detail: "cc_rejected_high_risk" });
    // sem NENHUM código, o slug seguro da mensagem (o achado da F5 — o describe do fim)
    expect(codigosDoMp({ message: "Card token service not found", status: 404 })).toEqual({ mp_status_detail: "msg_card_token_service_not_found" });
  });
  it("o status_detail da resposta vale antes do texto; o error e as causas seguem como antes", () => {
    expect(codigosDoMp({ status_detail: "cc_rejected_other_reason", message: "cc_rejected_high_risk" }))
      .toEqual({ mp_status_detail: "cc_rejected_other_reason" });
    expect(codigosDoMp({ error: "bad_request", cause: [{ code: 2067 }], message: "cc_rejected_call_for_authorize" }))
      .toEqual({ mp_erro: "bad_request", mp_causas: [2067], mp_status_detail: "cc_rejected_call_for_authorize" });
  });
  it("revisão mpc (🟡2, ⚪6): o CC_VAL_<n> da validação do cartão (em minúsculas), o fim obrigatório do cc_rejected_… e o `code` como mp_erro", () => {
    expect(recusaNoTexto({ message: "CC_VAL_433 Credit card validation has failed" })).toBe("cc_val_433");
    expect(codigosDoMp({ message: "CC_VAL_433 Credit card validation has failed", status: 400 })).toEqual({ mp_status_detail: "cc_val_433" });
    // nada colado depois do código entra (o fuzz da revisão gravava cc_rejected_high_risk_maria) e as maiúsculas não são o código do MP
    expect(recusaNoTexto({ message: "cc_rejected_high_risk_Maria" })).toBeNull();
    expect(recusaNoTexto({ message: "cc_rejected_high_riskMaria" })).toBeNull();
    expect(recusaNoTexto({ message: "CC_REJECTED_HIGH_RISK" })).toBeNull();
    expect(recusaNoTexto({ message: "xCC_VAL_433 e CC_VAL_12345" })).toBeNull();
    // sem `error`, o `code` com formato de código vai como mp_erro; com `error`, vale o `error`; fora do formato, nada
    expect(codigosDoMp({ code: "bad_request", message: "x" })).toEqual({ mp_erro: "bad_request" });
    expect(codigosDoMp({ error: "bad_request", code: "outro_codigo" })).toEqual({ mp_erro: "bad_request" });
    expect(codigosDoMp({ code: "Bad Request!" })).toEqual({});
    expect(codigosDoMp({ code: 400 })).toEqual({});
  });
  it("o código para a tela: só no formato de código (o texto do MP não volta na resposta)", () => {
    expect(codigoDaRecusa({ status: "rejected", status_detail: "cc_rejected_high_risk" })).toBe("cc_rejected_high_risk");
    expect(codigoDaRecusa({ message: "CC_VAL_433 Credit card validation has failed" })).toBe("cc_val_433");
    expect(codigoDaRecusa({ status_detail: "Texto Livre com espaço" })).toBeNull();
    expect(codigoDaRecusa({ message: "nada" })).toBe("msg_nada");                      // o slug seguro (o achado da F5)
    expect(codigoDaRecusa({ message: "Payer pagador@exemplo.com 12345678909" })).toBeNull();   // a mensagem com dado: descartada inteira
  });
});

describe("mp-cartao — o motivo quando o MP só manda TEXTO (o achado da F5: a automática recusada no sandbox com externo {})", () => {
  it("o slug seguro da mensagem: msg_<slug> minúsculo, sem acento, os _ colapsados e aparados", () => {
    expect(codigosDoMp({ message: "Invalid users involved", status: 400 })).toEqual({ mp_status_detail: "msg_invalid_users_involved" });
    expect(slugDaMensagem({ message: "  Cartão   inválido!! (tente de novo) " })).toBe("msg_cartao_invalido_tente_de_novo");
    expect(slugDaMensagem({ message: "--- ___ ---" })).toBeNull();
  });
  it("no máximo 60 depois do msg_ (cabe no ^[a-z0-9_]{1,64}$ do log), sem _ no fim", () => {
    const s = slugDaMensagem({ message: "palavra ".repeat(19) })!;
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s).toMatch(/^msg_[a-z0-9_]{1,60}$/);
    expect(s.endsWith("_")).toBe(false);
  });
  it("a mensagem é descartada INTEIRA com e-mail, 4+ dígitos seguidos (CPF, id), caractere de controle ou mais de 160 caracteres", () => {
    for (const message of ["Invalid payer pagador@exemplo.com", "Invalid user identification number 12345678909", "Payment 1234 failed",
      "linha 1\nlinha 2", "tab\tno meio", "x".repeat(161), "", "   ", 42, null]) {
      expect(slugDaMensagem({ message }), String(message).slice(0, 30)).toBeNull();
      expect(codigosDoMp({ message, status: 400 }), String(message).slice(0, 30)).toEqual({});
    }
    expect(slugDaMensagem({ message: "Error 433 here" })).toBe("msg_error_433_here");   // 3 dígitos passam
  });
  it("a precedência de hoje não muda: error, cause[].code, status_detail, code no formato, cc_rejected_* e CC_VAL_* vêm antes (sem slug)", () => {
    expect(codigosDoMp({ error: "bad_request", message: "Invalid users involved" })).toEqual({ mp_erro: "bad_request" });
    expect(codigosDoMp({ cause: [{ code: 2034 }], message: "Invalid users involved" })).toEqual({ mp_causas: [2034] });
    expect(codigosDoMp({ status_detail: "cc_rejected_other_reason", message: "Invalid users involved" }))
      .toEqual({ mp_status_detail: "cc_rejected_other_reason" });
    expect(codigosDoMp({ code: "not_found", message: "Resource not found" })).toEqual({ mp_erro: "not_found" });
    expect(codigosDoMp({ message: "cc_rejected_high_risk" })).toEqual({ mp_status_detail: "cc_rejected_high_risk" });
    expect(codigosDoMp({ message: "CC_VAL_433 Credit card validation has failed" })).toEqual({ mp_status_detail: "cc_val_433" });
    // o 2034 do /v1/payments (com a causa) segue só com a causa — o slug é só para quem não manda NENHUM código
    expect(codigosDoMp({ message: "Invalid users involved", error: "bad_request", status: 400, cause: [{ code: 2034, description: "Invalid users involved" }] }))
      .toEqual({ mp_erro: "bad_request", mp_causas: [2034] });
  });
});
