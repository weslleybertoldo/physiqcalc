import { describe, expect, it } from "vitest";
import {
  MP_VIRTUAL_ID, aplicarOtimista, comLinhaSalva, comMpVirtual, descricaoSwitch, detalheRecebimento, ordenarRecebimentos, tituloRecebimento, type Recebimento,
} from "./recebimentos";
import { formatarChavePix, normalizarChavePix, validarChavePix } from "./pixChave";

const base = { professor_id: "p1", pix_tipo: null, pix_chave: null, pix_favorecido: null, pix_banco: null, ativo: false, criado_em: "2026-09-13T10:00:00Z" };
const pixCpf: Recebimento = { ...base, id: "a", tipo: "pix", pix_tipo: "cpf", pix_chave: "12345678901", pix_favorecido: "Ana", pix_banco: "Nubank", criado_em: "2026-09-13T12:00:00Z" };
const mp: Recebimento = { ...base, id: "b", tipo: "mercadopago", ativo: true };

describe("recebimentos", () => {
  it("título e detalhe do Pix formatam a chave e juntam favorecido/banco", () => {
    expect(tituloRecebimento(pixCpf)).toBe("Pix · CPF");
    expect(detalheRecebimento(pixCpf)).toBe("123.456.789-01 · Ana · Nubank");
    expect(detalheRecebimento({ ...pixCpf, pix_favorecido: null, pix_banco: "  " })).toBe("123.456.789-01");
  });
  it("Mercado Pago vem primeiro e tem detalhe fixo", () => {
    expect(ordenarRecebimentos([pixCpf, mp]).map((r) => r.id)).toEqual(["b", "a"]);
    expect(tituloRecebimento(mp)).toBe("Integração com Mercado Pago");
    expect(detalheRecebimento(mp)).toMatch(/confirmação é automática/);
  });
  it("master sem linha de Mercado Pago ganha o item virtual; com linha ou sem ser master, não", () => {
    const comVirtual = comMpVirtual([pixCpf], true, "p1");
    expect(comVirtual[0].id).toBe(MP_VIRTUAL_ID);
    expect(comVirtual[0].tipo).toBe("mercadopago");
    expect(comMpVirtual([pixCpf, mp], true, "p1")).toHaveLength(2);
    expect(comMpVirtual([pixCpf], false, "p1")).toHaveLength(1);
  });
  it("descrição do switch muda com ligado/desligado", () => {
    expect(descricaoSwitch(mp)).toMatch(/^Ligado/);
    expect(descricaoSwitch(pixCpf)).toMatch(/^Desligado/);
  });
  it("otimista: ligar um desliga os outros; desligar só mexe nele; null não muda nada", () => {
    const lista = [mp, pixCpf];
    expect(aplicarOtimista(lista, { id: "a", ativo: true }).map((r) => r.ativo)).toEqual([false, true]);
    expect(aplicarOtimista(lista, { id: "b", ativo: false }).map((r) => r.ativo)).toEqual([false, false]);
    expect(aplicarOtimista(lista, null)).toBe(lista);
  });
  it("linha salva no popup entra/troca na lista sem novo carregamento", () => {
    const nova: Recebimento = { ...pixCpf, id: "c", pix_chave: "ana@ex.com", pix_tipo: "email", ativo: true, criado_em: "2026-09-13T13:00:00Z" };
    const depois = comLinhaSalva([mp, pixCpf], nova);
    expect(depois.map((r) => [r.id, r.ativo])).toEqual([["b", false], ["a", false], ["c", true]]);
    const editada = comLinhaSalva(depois, { ...pixCpf, pix_banco: "Inter" });
    expect(editada.find((r) => r.id === "a")?.pix_banco).toBe("Inter");
    expect(editada).toHaveLength(3);
  });
});

describe("pixChave", () => {
  it("formata CPF, CNPJ e telefone; deixa e-mail e aleatória como estão", () => {
    expect(formatarChavePix("cpf", "12345678901")).toBe("123.456.789-01");
    expect(formatarChavePix("cnpj", "12345678000199")).toBe("12.345.678/0001-99");
    expect(formatarChavePix("telefone", "+5582999998888")).toBe("(82) 99999-8888");
    expect(formatarChavePix("email", "Ana@Ex.com")).toBe("Ana@Ex.com");
    expect(formatarChavePix("cpf", null)).toBe("");
  });
  it("valida e normaliza", () => {
    expect(validarChavePix("", "x")).toMatch(/tipo/);
    expect(validarChavePix("cpf", "123")).toMatch(/11 dígitos/);
    expect(validarChavePix("email", "ana@ex.com")).toBeNull();
    expect(normalizarChavePix("telefone", "(82) 99999-8888")).toBe("+5582999998888");
    expect(normalizarChavePix("email", "Ana@Ex.com")).toBe("ana@ex.com");
  });
});
