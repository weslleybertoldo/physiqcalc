import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { formatarData, formatarDataCurta, calcularIdade, agoraFormatado } from "./formatDate";

describe("formatarData", () => {
  it("retorna em-dash para entrada nula/vazia/invalida", () => {
    expect(formatarData(null)).toBe("—");
    expect(formatarData(undefined)).toBe("—");
    expect(formatarData("")).toBe("—");
    expect(formatarData("nao-eh-data")).toBe("—");
  });
  it("formata ISO com data e hora por padrao", () => {
    // 2025-03-22T22:30:00Z em America/Maceio (UTC-3) = 19:30 local
    const out = formatarData("2025-03-22T22:30:00+00:00");
    expect(out).toMatch(/22\/03\/2025/);
    expect(out).toMatch(/19:30/);
  });
  it("omite hora quando incluirHora=false", () => {
    expect(formatarData("2025-03-22T22:30:00+00:00", { incluirHora: false }))
      .toBe("22/03/2025");
  });
  it("formato 'longo' usa 'às'", () => {
    expect(formatarData("2025-03-22T22:30:00+00:00", { formato: "longo" }))
      .toMatch(/22\/03\/2025 às 19:30/);
  });
});

describe("formatarDataCurta", () => {
  it("retorna em-dash para nulo", () => {
    expect(formatarDataCurta(null)).toBe("—");
    expect(formatarDataCurta(undefined)).toBe("—");
  });
  it("formata YYYY-MM-DD como dd/mm/yyyy", () => {
    expect(formatarDataCurta("2026-05-11")).toBe("11/05/2026");
  });
  it("inclui weekday quando opcao true", () => {
    const out = formatarDataCurta("2026-05-11", { weekday: true });
    // Não dependemos do dia exato; só garantimos formato weekday + dd/mm
    expect(out).toMatch(/\w+,? \d{2}\/\d{2}/);
  });
  it("entrada invalida retorna em-dash", () => {
    expect(formatarDataCurta("zzzz")).toBe("—");
  });
});

describe("calcularIdade", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T12:00:00-03:00"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it("retorna 0 para entrada vazia/invalida", () => {
    expect(calcularIdade(null)).toBe(0);
    expect(calcularIdade(undefined)).toBe(0);
    expect(calcularIdade("")).toBe(0);
    expect(calcularIdade("xxx")).toBe(0);
  });
  it("conta anos completos", () => {
    expect(calcularIdade("2000-01-01")).toBe(26); // ja fez aniversario neste ano
    expect(calcularIdade("2000-05-11")).toBe(26); // aniversario hoje
    expect(calcularIdade("2000-05-12")).toBe(25); // amanha ainda nao fez
    expect(calcularIdade("2000-12-31")).toBe(25); // fim do ano ainda nao
  });
  it("nunca retorna negativo", () => {
    expect(calcularIdade("2030-01-01")).toBe(0); // futuro
  });
});

describe("agoraFormatado", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T12:00:00-03:00"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  it("usa a data atual", () => {
    const out = agoraFormatado({ incluirHora: false });
    expect(out).toBe("11/05/2026");
  });
});
