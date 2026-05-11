import { describe, it, expect } from "vitest";
import { parseTempo, formatTempo, formatPace, calcularPace } from "./corrida";

describe("parseTempo", () => {
  it("aceita MM:SS", () => {
    expect(parseTempo("05:30")).toBe(330);
    expect(parseTempo("00:00")).toBe(0);
    expect(parseTempo("59:59")).toBe(3599);
  });
  it("aceita HH:MM:SS", () => {
    expect(parseTempo("01:00:00")).toBe(3600);
    expect(parseTempo("02:30:15")).toBe(9015);
  });
  it("trim", () => {
    expect(parseTempo("  10:00  ")).toBe(600);
  });
  it("retorna null para entrada invalida", () => {
    expect(parseTempo("abc")).toBeNull();
    expect(parseTempo("10")).toBeNull(); // precisa ao menos M:S
    expect(parseTempo("10:xx")).toBeNull();
    expect(parseTempo("")).toBeNull();
  });
});

describe("formatTempo", () => {
  it("formata MM:SS quando < 1h", () => {
    expect(formatTempo(0)).toBe("00:00");
    expect(formatTempo(65)).toBe("01:05");
    expect(formatTempo(3599)).toBe("59:59");
  });
  it("formata HH:MM:SS quando >= 1h", () => {
    expect(formatTempo(3600)).toBe("01:00:00");
    expect(formatTempo(9015)).toBe("02:30:15");
  });
});

describe("calcularPace", () => {
  it("calcula segundos por km arredondado", () => {
    // 5km em 25min = 300s/km
    expect(calcularPace(1500, 5)).toBe(300);
    // 10km em 50min = 300s/km
    expect(calcularPace(3000, 10)).toBe(300);
  });
  it("retorna 0 se distancia invalida", () => {
    expect(calcularPace(1500, 0)).toBe(0);
    expect(calcularPace(1500, -1)).toBe(0);
    expect(calcularPace(1500, NaN as unknown as number)).toBe(0);
  });
});

describe("formatPace", () => {
  it("formata pace como M:SS /km", () => {
    expect(formatPace(300)).toBe("5:00 /km");
    expect(formatPace(285)).toBe("4:45 /km");
    expect(formatPace(60)).toBe("1:00 /km");
  });
});

describe("round-trip parse + format", () => {
  it("formatTempo(parseTempo(x)) === x normalizado", () => {
    for (const s of ["05:30", "12:00", "01:30:00", "00:00"]) {
      const parsed = parseTempo(s);
      expect(parsed).not.toBeNull();
      expect(formatTempo(parsed!)).toBe(s);
    }
  });
});
