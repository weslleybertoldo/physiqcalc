import { describe, it, expect } from "vitest";
import { hexToRgb, corDelta, textoDelta, limparTexto, TEMA } from "./gerarRelatorio";

describe("hexToRgb", () => {
  it("converte #RRGGBB para tupla", () => {
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#FFFFFF")).toEqual([255, 255, 255]);
    expect(hexToRgb("#FF8000")).toEqual([255, 128, 0]);
  });
  it("aceita lowercase", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
  });
  // hexToRgb assume sempre com prefixo "#" (slice(1,3)). Sem "#" o resultado e indefinido.
});

describe("corDelta", () => {
  it("retorna cinza para delta zero", () => {
    expect(corDelta(0)).toBe(TEMA.cinzaMedio);
  });
  it("verde para delta positivo (default)", () => {
    expect(corDelta(1.5)).toBe(TEMA.verde);
  });
  it("vermelho para delta negativo (default)", () => {
    expect(corDelta(-2)).toBe(TEMA.vermelho);
  });
  it("inverter troca verde<->vermelho", () => {
    expect(corDelta(1, true)).toBe(TEMA.vermelho);
    expect(corDelta(-1, true)).toBe(TEMA.verde);
  });
});

describe("textoDelta", () => {
  it("'= 0' quando delta zero", () => {
    expect(textoDelta(0)).toBe("= 0");
  });
  it("prefixa + em positivos", () => {
    expect(textoDelta(2.5)).toBe("+2.5");
    expect(textoDelta(0.1)).toBe("+0.1");
  });
  it("mantem - em negativos", () => {
    expect(textoDelta(-3.7)).toBe("-3.7");
  });
  it("respeita casas decimais", () => {
    expect(textoDelta(1, 0)).toBe("+1");
    expect(textoDelta(1.234, 2)).toBe("+1.23");
  });
});

describe("limparTexto", () => {
  it("remove emojis pictographs 1F000-1FFFF", () => {
    expect(limparTexto("Foo 💪 Bar 🏋️")).toBe("Foo Bar");
  });
  it("remove simbolos 2600-27FF", () => {
    expect(limparTexto("Sun ☀ rain ☔")).toBe("Sun rain");
  });
  it("substitui x special por x ASCII", () => {
    expect(limparTexto("80 × 10 reps")).toBe("80 x 10 reps");
  });
  it("substitui setas e bullets", () => {
    expect(limparTexto("A → B")).toBe("A -> B");
    expect(limparTexto("• item")).toBe("- item");
    expect(limparTexto("▲ up ▼ down")).toBe("+ up - down");
  });
  it("colapsa whitespace e trim", () => {
    expect(limparTexto("  hello    world  ")).toBe("hello world");
  });
  it("nao quebra texto sem caracteres especiais", () => {
    expect(limparTexto("Treino A")).toBe("Treino A");
  });
});
