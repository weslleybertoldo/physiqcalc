import { describe, expect, it } from "vitest";
import { instrucaoCurta } from "./instalacaoManual";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";

describe("instrucaoCurta", () => {
  it("iPhone: Compartilhar → Adicionar à Tela de Início", () => {
    expect(instrucaoCurta(IPHONE)).toBe('Toque em "Compartilhar" → "Adicionar à Tela de Início"');
  });
  it("outros navegadores: menu ⋮ → Adicionar à tela inicial", () => {
    expect(instrucaoCurta(ANDROID)).toBe('Toque no menu ⋮ → "Adicionar à tela inicial"');
  });
});
