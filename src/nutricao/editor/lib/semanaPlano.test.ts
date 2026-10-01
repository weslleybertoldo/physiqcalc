import { describe, expect, it } from "vitest";
import { copiarDiaParaSemana, diaDeHoje, diasDaRefeicaoNova, diasParaBanco, refeicoesDoDiaDaSemana, textoDiasRefeicao, valeNoDiaDaSemana, variaPorDia } from "./semanaPlano";

const r = (id: string, dias: number[] = []) => ({ id, dias_semana: dias });

describe("plano por dia da semana (NF3)", () => {
  it("refeição sem dias vale todos os dias; com dias, só neles", () => {
    expect(valeNoDiaDaSemana(r("a"), 3)).toBe(true);
    expect(valeNoDiaDaSemana(r("b", [6, 7]), 6)).toBe(true);
    expect(valeNoDiaDaSemana(r("b", [6, 7]), 1)).toBe(false);
    expect(refeicoesDoDiaDaSemana([r("a"), r("b", [7]), r("c", [1, 2])], 7).map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("varia por dia quando alguma refeição tem dias marcados", () => {
    expect(variaPorDia([r("a"), r("b")])).toBe(false);
    expect(variaPorDia([r("a"), r("b", [2])])).toBe(true);
  });
  it("os 7 dias marcados gravam vazio (todos os dias)", () => {
    expect(diasParaBanco([7, 1, 2, 3, 4, 5, 6])).toEqual([]);
    expect(diasParaBanco([3, 1, 3, 9])).toEqual([1, 3]);
  });
  it("textos dos dias", () => {
    expect(textoDiasRefeicao([])).toBe("todos os dias");
    expect(textoDiasRefeicao([6])).toBe("só sábado");
    expect(textoDiasRefeicao([1, 3, 5])).toBe("seg, qua e sex");
  });
  it("copiar pra semana toda: as do dia passam a valer sempre e as só de outros dias saem", () => {
    const lista = [r("cafe"), r("almoco-semana", [1, 2, 3, 4, 5]), r("almoco-fds", [6, 7]), r("ceia")];
    expect(copiarDiaParaSemana(lista, 2)).toEqual({ paraTodosOsDias: ["almoco-semana"], paraApagar: ["almoco-fds"], nadaAFazer: false });
    expect(copiarDiaParaSemana([r("a"), r("b")], 4)).toEqual({ paraTodosOsDias: [], paraApagar: [], nadaAFazer: true });
  });
  it("refeição nova: todos os dias num plano igual; só o dia aberto num plano que varia", () => {
    expect(diasDaRefeicaoNova([r("a")], 3)).toEqual([]);
    expect(diasDaRefeicaoNova([r("a", [1])], 3)).toEqual([3]);
  });
  it("hoje em São Paulo", () => {
    expect(diaDeHoje(new Date("2026-10-04T12:00:00-03:00"))).toBe(7);
    // 01:00 UTC de uma quinta = 22:00 de quarta em São Paulo
    expect(diaDeHoje(new Date("2026-10-01T01:00:00Z"))).toBe(3);
  });
});
