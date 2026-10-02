import { describe, expect, it } from "vitest";
import { moverRefeicaoNoDia } from "./semanaPlano";

const r = (id: string, ordem: number, dias: number[] = []) => ({ id, ordem, dias_semana: dias });

describe("H5 — N-61: Subir/Descer refeição (no dia aberto)", () => {
  it("plano igual todos os dias: troca com a vizinha e grava só as que mudaram", () => {
    const todas = [r("cafe", 0), r("almoco", 1), r("lanche", 2), r("jantar", 3)];
    expect(moverRefeicaoNoDia(todas, 1, "lanche", -1)).toEqual([{ id: "lanche", ordem: 1 }, { id: "almoco", ordem: 2 }]);
    expect(moverRefeicaoNoDia(todas, 1, "cafe", 1)).toEqual([{ id: "almoco", ordem: 0 }, { id: "cafe", ordem: 1 }]);
  });
  it("as pontas não andam", () => {
    const todas = [r("a", 0), r("b", 1)];
    expect(moverRefeicaoNoDia(todas, 1, "a", -1)).toBeNull();
    expect(moverRefeicaoNoDia(todas, 1, "b", 1)).toBeNull();
    expect(moverRefeicaoNoDia(todas, 1, "x", 1)).toBeNull();
  });
  it("plano que muda por dia: anda entre as do dia; as de outros dias ficam no lugar", () => {
    // segunda (1): cafe, almoco_seg, jantar · terça (2): cafe, almoco_ter, jantar
    const todas = [r("cafe", 0), r("almoco_seg", 1, [1]), r("almoco_ter", 2, [2]), r("jantar", 3)];
    // na terça, o jantar sobe acima do almoço de terça (o de segunda continua antes)
    expect(moverRefeicaoNoDia(todas, 2, "jantar", -1)).toEqual([{ id: "jantar", ordem: 2 }, { id: "almoco_ter", ordem: 3 }]);
    // na segunda, o almoço de segunda desce depois do jantar
    expect(moverRefeicaoNoDia(todas, 1, "almoco_seg", 1)).toEqual([{ id: "almoco_ter", ordem: 1 }, { id: "jantar", ordem: 2 }, { id: "almoco_seg", ordem: 3 }]);
  });
  it("ordens repetidas do site antigo viram 0..n-1 na ordem da tela", () => {
    const todas = [r("cafe", 0), r("almoco", 0), r("jantar", 0)];
    expect(moverRefeicaoNoDia(todas, 1, "jantar", -1)).toEqual([{ id: "jantar", ordem: 1 }, { id: "almoco", ordem: 2 }]);
  });
});
