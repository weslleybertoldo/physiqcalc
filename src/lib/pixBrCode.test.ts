import { describe, expect, it } from "vitest";
import { crc16, normalizarChavePix, normalizarTexto, pixBrCode, rotuloTipoChave, tlv } from "./pixBrCode";

// Exemplo do Manual de Padrões para Iniciação do Pix (BCB), anexo I — CRC oficial 1D3D.
// O manual imprime um espaço depois da chave, mas ele NÃO faz parte do payload (o campo 26
// declara 58 caracteres, exatamente sem o espaço); com o espaço o CRC seria 80BF.
const VETOR_BCB =
  "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";

// decodifica os campos de 1º nível na ordem em que aparecem, pra conferir estrutura e tamanhos
function decodificar(payload: string): [string, string][] {
  const out: [string, string][] = [];
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = parseInt(payload.slice(i + 2, i + 4), 10);
    out.push([id, payload.slice(i + 4, i + 4 + len)]);
    i += 4 + len;
  }
  return out;
}
const campos = (payload: string): Record<string, string> => Object.fromEntries(decodificar(payload));
const ordem = (payload: string): string[] => decodificar(payload).map(([id]) => id);

describe("crc16 (CRC-16/CCITT-FALSE)", () => {
  it("vetor oficial do BCB → 1D3D", () => {
    expect(crc16(VETOR_BCB)).toBe("1D3D");
  });

  it("check value padrão do algoritmo ('123456789' → 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("sempre 4 hex maiúsculos (vazio = valor inicial FFFF)", () => {
    expect(crc16("")).toBe("FFFF");
    expect(crc16("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("tlv", () => {
  it("id + tamanho em 2 dígitos + valor", () => {
    expect(tlv("00", "01")).toBe("000201");
    expect(tlv("59", "Fulano de Tal")).toBe("5913Fulano de Tal");
    expect(tlv("58", "BR")).toBe("5802BR");
  });
});

describe("pixBrCode", () => {
  const base = { chave: "123e4567-e12b-12d1-a456-426655440000", nome: "Fulano de Tal", cidade: "Brasilia" };

  it("com valor 120 → campo 54 = 120.00", () => {
    const p = pixBrCode({ ...base, valor: 120 });
    expect(p).toContain("5406120.00");
    expect(campos(p)["54"]).toBe("120.00");
  });

  it("valor em string e com centavos", () => {
    expect(campos(pixBrCode({ ...base, valor: "79.9" }))["54"]).toBe("79.90");
    expect(campos(pixBrCode({ ...base, valor: 1234.5 }))["54"]).toBe("1234.50");
  });

  it("sem valor (ou <= 0) → não tem o campo 54", () => {
    expect(campos(pixBrCode(base))["54"]).toBeUndefined();
    expect(campos(pixBrCode({ ...base, valor: 0 }))["54"]).toBeUndefined();
    expect(campos(pixBrCode({ ...base, valor: null }))["54"]).toBeUndefined();
  });

  it("nome com acento vira sem acento, maiúsculo, só [A-Za-z0-9 ]", () => {
    const p = pixBrCode({ ...base, nome: "José D'Ávila Ção" });
    expect(campos(p)["59"]).toBe("JOSE D AVILA CAO");
  });

  it("nome até 25 e cidade até 15 caracteres", () => {
    const p = pixBrCode({ ...base, nome: "Professor Com Nome Muito Comprido Mesmo", cidade: "São José dos Campos" });
    expect(campos(p)["59"]).toBe("PROFESSOR COM NOME MUITO");
    expect(campos(p)["59"].length).toBeLessThanOrEqual(25);
    expect(campos(p)["60"]).toBe("SAO JOSE DOS CA");
  });

  it("cidade padrão MACEIO e txid padrão ***", () => {
    const c = campos(pixBrCode({ chave: base.chave, nome: base.nome }));
    expect(c["60"]).toBe("MACEIO");
    expect(c["62"]).toBe("0503***");
  });

  it("estrutura completa e na ordem: 00=01, 26=(GUI + chave), 52=0000, 53=986, 58=BR", () => {
    const p = pixBrCode({ ...base, valor: 120 });
    const c = campos(p);
    expect(c["00"]).toBe("01");
    expect(c["26"]).toBe("0014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000");
    expect(c["52"]).toBe("0000");
    expect(c["53"]).toBe("986");
    expect(c["58"]).toBe("BR");
    expect(c["60"]).toBe("BRASILIA");
    expect(ordem(p)).toEqual(["00", "26", "52", "53", "54", "58", "59", "60", "62", "63"]);
    // sem valor, o 54 simplesmente não entra (ordem dos demais preservada)
    expect(ordem(pixBrCode(base))).toEqual(["00", "26", "52", "53", "58", "59", "60", "62", "63"]);
  });

  it("mesma montagem do exemplo do BCB (sem o espaço extra do manual)", () => {
    const p = pixBrCode({ chave: base.chave, nome: "Fulano de Tal", cidade: "BRASILIA" });
    expect(p.startsWith("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO DE TAL6008BRASILIA62070503***6304")).toBe(true);
  });

  it("termina com 6304 + 4 hex e o CRC confere com o payload", () => {
    const p = pixBrCode({ ...base, valor: 79.9 });
    expect(p.slice(-8, -4)).toBe("6304");
    expect(p.slice(-4)).toMatch(/^[0-9A-F]{4}$/);
    expect(crc16(p.slice(0, -4))).toBe(p.slice(-4));
  });

  it("txid informado é saneado (só alfanumérico, até 25)", () => {
    expect(campos(pixBrCode({ ...base, txid: "mens-2026/09" }))["62"]).toBe("0510mens202609");
    expect(campos(pixBrCode({ ...base, txid: "!!!" }))["62"]).toBe("0503***");
  });

  it("usa o tipo da chave pra normalizar (telefone ganha +55)", () => {
    const c = campos(pixBrCode({ chave: "(82) 99999-9999", tipo: "telefone", nome: "Prof" }));
    expect(c["26"]).toBe("0014br.gov.bcb.pix0114+5582999999999");
  });

  it("chave vazia → erro", () => {
    expect(() => pixBrCode({ chave: "   ", nome: "x" })).toThrow("chave_pix_vazia");
  });
});

describe("normalizarChavePix", () => {
  it("CPF/CNPJ só dígitos", () => {
    expect(normalizarChavePix("123.456.789-09", "cpf")).toBe("12345678909");
    expect(normalizarChavePix("12.345.678/0001-95", "cnpj")).toBe("12345678000195");
  });

  it("telefone sempre com +55 na frente", () => {
    expect(normalizarChavePix("(82) 99999-9999", "telefone")).toBe("+5582999999999");
    expect(normalizarChavePix("+55 82 99999-9999", "telefone")).toBe("+5582999999999");
    expect(normalizarChavePix("5582999999999", "telefone")).toBe("+5582999999999");
    expect(normalizarChavePix("82999999999", "celular")).toBe("+5582999999999");
    // DDD 55 sem código do país (11 dígitos) não é confundido com o +55
    expect(normalizarChavePix("55999999999", "telefone")).toBe("+5555999999999");
  });

  it("e-mail minúsculo e sem espaços nas pontas", () => {
    expect(normalizarChavePix("  Fulano@Exemplo.COM ", "email")).toBe("fulano@exemplo.com");
    expect(normalizarChavePix("Fulano@Exemplo.COM", "e-mail")).toBe("fulano@exemplo.com");
  });

  it("aleatória fica como está", () => {
    const k = "123e4567-e12b-12d1-a456-426655440000";
    expect(normalizarChavePix(k, "aleatoria")).toBe(k);
    expect(normalizarChavePix(k, "aleatória")).toBe(k);
    expect(normalizarChavePix(k, "evp")).toBe(k);
  });

  it("sem tipo: infere pela chave", () => {
    expect(normalizarChavePix("Fulano@X.com")).toBe("fulano@x.com");
    expect(normalizarChavePix("123.456.789-09")).toBe("12345678909");
    expect(normalizarChavePix("12.345.678/0001-95")).toBe("12345678000195");
    expect(normalizarChavePix("+55 82 99999-9999")).toBe("+5582999999999");
    expect(normalizarChavePix("(82) 99999-9999")).toBe("+5582999999999");
    expect(normalizarChavePix("123e4567-e12b-12d1-a456-426655440000")).toBe("123e4567-e12b-12d1-a456-426655440000");
  });

  it("vazia → vazia", () => {
    expect(normalizarChavePix("", "cpf")).toBe("");
  });
});

describe("normalizarTexto / rotuloTipoChave", () => {
  it("remove acento e caracteres fora de [A-Za-z0-9 ]", () => {
    expect(normalizarTexto("Ação & Cia. Ltda", 25)).toBe("ACAO CIA LTDA");
    expect(normalizarTexto("   ", 25)).toBe("");
  });

  it("rótulo do tipo", () => {
    expect(rotuloTipoChave("cpf")).toBe("CPF");
    expect(rotuloTipoChave("aleatória")).toBe("Chave aleatória");
    expect(rotuloTipoChave(null)).toBe("Chave Pix");
  });
});
