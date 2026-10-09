import { describe, expect, it, vi } from "vitest";
import { deslocamento, intervalo, paginaValida, paginar, POR_PAGINA, rotulo, ultimaPagina } from "./paginacao";

describe("paginacao (hml-14b, D13)", () => {
  it("20 por página", () => {
    expect(POR_PAGINA).toBe(20);
  });

  it("intervalo e deslocamento da página (a 1ª é 1; lixo vira 1)", () => {
    expect(intervalo(1)).toEqual([0, 19]);
    expect(intervalo(3)).toEqual([40, 59]);
    expect(intervalo(0)).toEqual([0, 19]);
    expect(intervalo(Number.NaN)).toEqual([0, 19]);
    expect(intervalo(2, 50)).toEqual([50, 99]);
    expect(deslocamento(2)).toBe(20);
  });

  it("última página e página válida", () => {
    expect(ultimaPagina(0)).toBe(1);
    expect(ultimaPagina(20)).toBe(1);
    expect(ultimaPagina(21)).toBe(2);
    expect(ultimaPagina(41)).toBe(3);
    expect(paginaValida(9, 41)).toBe(3);
    expect(paginaValida(-2, 41)).toBe(1);
  });

  it('rótulo "a–b de N"; página além do total cai na última', () => {
    expect(rotulo(1, 41)).toBe("1–20 de 41");
    expect(rotulo(2, 41)).toBe("21–40 de 41");
    expect(rotulo(3, 41)).toBe("41–41 de 41");
    expect(rotulo(7, 41)).toBe("41–41 de 41");
    expect(rotulo(1, 5)).toBe("1–5 de 5");
    expect(rotulo(1, 0)).toBe("0 de 0");
    expect(rotulo(1, 1000)).toBe("1–20 de 1000");
  });

  it("paginar: pede o range da página e devolve itens e total", async () => {
    const montar = vi.fn(async () => ({ data: [{ id: 41 }], error: null, count: 41 }));
    expect(await paginar(montar, 3)).toEqual({ itens: [{ id: 41 }], total: 41 });
    expect(montar).toHaveBeenCalledWith(40, 59);
  });

  it("paginar: erro do banco lança (nunca lista vazia no lugar do erro)", async () => {
    const erro = { message: "banco fora", code: "57014" };
    await expect(paginar(async () => ({ data: null, error: erro, count: null }), 1)).rejects.toBe(erro);
  });

  it("paginar: consulta sem count lança (o total da tela ficaria errado)", async () => {
    await expect(paginar(async () => ({ data: [], error: null, count: null }), 1)).rejects.toThrow(/count/);
  });

  it("paginar: página vazia com total", async () => {
    expect(await paginar(async () => ({ data: null, error: null, count: 7 }), 2)).toEqual({ itens: [], total: 7 });
  });
});
