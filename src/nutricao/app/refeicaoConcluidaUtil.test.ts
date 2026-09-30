import { describe, expect, it } from "vitest";
import type { ItemCalc } from "./dietaUtil";
import { alternarConcluida, metaCumprida, progressoDoDia, refeicaoMarcavel, textoErroMarcar, textoProgresso } from "./refeicaoConcluidaUtil";
import type { AlimentoDoItem } from "./tipos";

// Porta do src/lib/refeicaoConcluidaUtil.test.ts do PhysiqNutri (W58 — pedido dele 24/09/2026: ✓ nas refeições com alimentos; a
// barra enche por kcal; tocar de novo desmarca).
const ARROZ: AlimentoDoItem = {
  id: "a1", nome: "Arroz, integral, cozido", fonte: "taco",
  energia_kcal: 123.53, proteina_g: 2.59, carboidrato_g: 25.81, lipidio_g: 1, fibra_g: 2.75, sodio_mg: 1.24, medidas_caseiras: [],
};
const PAO: AlimentoDoItem = {
  id: "a2", nome: "Pão caseiro", fonte: "proprio",
  energia_kcal: 270, proteina_g: 8.5, carboidrato_g: 52, lipidio_g: 3.2, fibra_g: 6, sodio_mg: 480, medidas_caseiras: [],
};
const AGUA: AlimentoDoItem = { ...ARROZ, id: "a3", nome: "Água", energia_kcal: 0, proteina_g: 0, carboidrato_g: 0, lipidio_g: 0, fibra_g: 0, sodio_mg: 0 };
const item = (alimento: AlimentoDoItem, g = 100): ItemCalc => ({ quantidade_g: g, medida_caseira_id: null, quantidade_medida: null, alimento });

// café 123,53 + 270 = 393,53 kcal · almoço 247,06 kcal · lanche vazio → total 640,59
const CAFE = { id: "cafe", itens: [item(ARROZ), item(PAO)] };
const ALMOCO = { id: "almoco", itens: [item(ARROZ, 200)] };
const LANCHE = { id: "lanche", itens: [] as ItemCalc[] };
const PLANO = [CAFE, ALMOCO, LANCHE];

describe("✓ das refeições (W58 do Nutri, portado)", () => {
  it("só a refeição com alimentos ganha o ✓", () => {
    expect(refeicaoMarcavel(CAFE)).toBe(true);
    expect(refeicaoMarcavel(LANCHE)).toBe(false);
  });

  it("a barra enche pelas kcal das refeições concluídas", () => {
    const zero = progressoDoDia(PLANO, new Set());
    expect(zero).toMatchObject({ pct: 0, concluidas: 0, marcaveis: 2 });
    expect(zero.totalKcal).toBeCloseTo(640.59, 2);
    const soCafe = progressoDoDia(PLANO, new Set(["cafe"]));
    expect(soCafe.feitoKcal).toBeCloseTo(393.53, 2);
    expect(soCafe.pct).toBe(61);
    expect(textoProgresso(soCafe)).toBe("394 de 641 kcal");
    expect(metaCumprida(soCafe)).toBe(false);
    const tudo = progressoDoDia(PLANO, new Set(["cafe", "almoco"]));
    expect(tudo.pct).toBe(100);
    expect(metaCumprida(tudo)).toBe(true);
  });

  it("refeição vazia marcada não conta; plano só com 0 kcal conta por refeição", () => {
    expect(progressoDoDia(PLANO, new Set(["lanche"]))).toMatchObject({ pct: 0, concluidas: 0 });
    const agua = [{ id: "x", itens: [item(AGUA)] }, { id: "y", itens: [item(AGUA)] }];
    expect(progressoDoDia(agua, new Set(["x"])).pct).toBe(50);
    expect(progressoDoDia([], new Set()).pct).toBe(0);
    expect(metaCumprida(progressoDoDia([LANCHE], new Set()))).toBe(false);
  });

  it("tocar de novo desmarca", () => {
    expect(alternarConcluida([], "cafe")).toEqual({ lista: ["cafe"], concluida: true });
    expect(alternarConcluida(["cafe", "almoco"], "cafe")).toEqual({ lista: ["almoco"], concluida: false });
  });

  it("erro da função vira texto pra pessoa (sem internet também)", () => {
    expect(textoErroMarcar({ message: "sem_alimentos" })).toMatch(/não tem alimentos/);
    expect(textoErroMarcar({ message: "data_invalida" })).toMatch(/data e a hora/);
    expect(textoErroMarcar({ message: "sem_acesso" })).toMatch(/acesso/);
    expect(textoErroMarcar({ message: "sem_internet" })).toMatch(/Sem conexão/);
    expect(textoErroMarcar({ message: "boom" })).toBe("Não foi possível salvar. Tente de novo.");
    expect(textoErroMarcar(null)).toBe("Não foi possível salvar. Tente de novo.");
  });
});
