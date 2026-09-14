import { beforeEach, describe, expect, it } from "vitest";
import {
  VALIDADE_REGISTRO_MS,
  chaveRegistro,
  contaComoTentativa,
  duracaoBloqueioMs,
  formatarRestante,
  gravarRegistro,
  lerRegistro,
  registrarErro,
  restanteBloqueioMs,
} from "./rateLimitLogin";

const MIN = 60_000;

describe("rateLimitLogin — escada de bloqueio", () => {
  it("1º e 2º erro não bloqueiam; do 3º em diante 1 → 3 → 5 → 10 → 30 → 60 min (teto)", () => {
    expect(duracaoBloqueioMs(1)).toBe(0);
    expect(duracaoBloqueioMs(2)).toBe(0);
    expect(duracaoBloqueioMs(3)).toBe(1 * MIN);
    expect(duracaoBloqueioMs(4)).toBe(3 * MIN);
    expect(duracaoBloqueioMs(5)).toBe(5 * MIN);
    expect(duracaoBloqueioMs(6)).toBe(10 * MIN);
    expect(duracaoBloqueioMs(7)).toBe(30 * MIN);
    expect(duracaoBloqueioMs(8)).toBe(60 * MIN);
    expect(duracaoBloqueioMs(20)).toBe(60 * MIN);
  });

  it("registrarErro acumula os erros e marca o bloqueio a partir do 3º", () => {
    const agora = 1_000_000;
    const r1 = registrarErro(null, agora);
    expect(r1).toEqual({ erros: 1, bloqueadoAte: null, ultimoErro: agora });
    const r2 = registrarErro(r1, agora + 10);
    expect(r2.erros).toBe(2);
    expect(r2.bloqueadoAte).toBeNull();
    const r3 = registrarErro(r2, agora + 20);
    expect(r3.erros).toBe(3);
    expect(r3.bloqueadoAte).toBe(agora + 20 + 1 * MIN);
    const r4 = registrarErro(r3, agora + 30);
    expect(r4.bloqueadoAte).toBe(agora + 30 + 3 * MIN);
  });

  it("restanteBloqueioMs conta o que falta e nunca fica negativo", () => {
    const reg = { erros: 3, bloqueadoAte: 5_000, ultimoErro: 0 };
    expect(restanteBloqueioMs(reg, 2_000)).toBe(3_000);
    expect(restanteBloqueioMs(reg, 5_000)).toBe(0);
    expect(restanteBloqueioMs(reg, 9_000)).toBe(0);
    expect(restanteBloqueioMs({ erros: 1, bloqueadoAte: null, ultimoErro: 0 }, 1)).toBe(0);
    expect(restanteBloqueioMs(null, 1)).toBe(0);
  });

  it("formatarRestante mostra m:ss arredondando pra cima", () => {
    expect(formatarRestante(60_000)).toBe("1:00");
    expect(formatarRestante(59_001)).toBe("1:00");
    expect(formatarRestante(59_000)).toBe("0:59");
    expect(formatarRestante(60 * MIN)).toBe("60:00");
    expect(formatarRestante(0)).toBe("0:00");
    expect(formatarRestante(-5)).toBe("0:00");
  });

  it("só credencial inválida (400 / invalid_credentials) conta como tentativa", () => {
    expect(contaComoTentativa({ status: 400, code: "invalid_credentials" })).toBe(true);
    expect(contaComoTentativa({ status: 400 })).toBe(true);
    expect(contaComoTentativa({ code: "invalid_credentials" })).toBe(true);
    expect(contaComoTentativa({ status: 429, code: "over_request_rate_limit" })).toBe(false);
    expect(contaComoTentativa({ status: 500 })).toBe(false);
    expect(contaComoTentativa({})).toBe(false);
    expect(contaComoTentativa(null)).toBe(false);
  });
});

describe("rateLimitLogin — registro no navegador", () => {
  beforeEach(() => localStorage.clear());

  it("chave por e-mail normalizado (espaços e maiúsculas não criam registro separado)", () => {
    expect(chaveRegistro("  Fulano@Teste.com ")).toBe(chaveRegistro("fulano@teste.com"));
  });

  it("grava, lê e apaga o registro", () => {
    const reg = { erros: 3, bloqueadoAte: 123, ultimoErro: 100 };
    gravarRegistro("a@b.com", reg);
    expect(lerRegistro("A@B.COM", 100)).toEqual(reg);
    gravarRegistro("a@b.com", null);
    expect(lerRegistro("a@b.com", 100)).toBeNull();
  });

  it("registro expira 24 h depois do último erro", () => {
    gravarRegistro("a@b.com", { erros: 5, bloqueadoAte: null, ultimoErro: 1_000 });
    expect(lerRegistro("a@b.com", 1_000 + VALIDADE_REGISTRO_MS)).not.toBeNull();
    expect(lerRegistro("a@b.com", 1_000 + VALIDADE_REGISTRO_MS + 1)).toBeNull();
  });

  it("conteúdo inválido no storage vira null (sem quebrar a tela)", () => {
    localStorage.setItem(chaveRegistro("a@b.com"), "{isso não é json");
    expect(lerRegistro("a@b.com")).toBeNull();
    localStorage.setItem(chaveRegistro("a@b.com"), JSON.stringify({ erros: "3" }));
    expect(lerRegistro("a@b.com")).toBeNull();
  });
});
