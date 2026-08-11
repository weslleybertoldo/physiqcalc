import { describe, it, expect } from "vitest";
import {
  aplicarSubstituicoes,
  dataDaTroca,
  resolverSubstituicao,
  type ExercicioAlvo,
  type ItemTreino,
  type Substituicao,
} from "./substituicaoExercicio";

const ex = (id: string, nome: string, isPessoal = false): ExercicioAlvo => ({
  id, nome, grupo_muscular: "Peitoral", emoji: "🏋️", isPessoal,
});

const item = (id: string, nome: string, ordem = 0): ItemTreino => ({
  exercicio_id: id, ordem, tb_exercicios: ex(id, nome),
});

const sub = (over: Partial<Substituicao> = {}): Substituicao => ({
  grupo_id: "G1",
  slot_idx: 0,
  exercicio_origem_id: "supino",
  exercicio_novo_id: "crucifixo",
  exercicio_novo_usuario_id: null,
  data_treino: null,
  ...over,
});

const catalogo = new Map<string, ExercicioAlvo>([
  ["crucifixo", ex("crucifixo", "Crucifixo na Máquina")],
  ["barra", ex("barra", "Barra fixa", true)],
]);

describe("resolverSubstituicao", () => {
  const alvo = { grupoId: "G1", slotIdx: 0, exercicioId: "supino", dateKey: "2026-08-11" };

  it("acha a definitiva quando não há do dia", () => {
    expect(resolverSubstituicao([sub()], alvo)?.exercicio_novo_id).toBe("crucifixo");
  });
  it("a do dia ganha da definitiva", () => {
    const doDia = sub({ data_treino: "2026-08-11", exercicio_novo_id: "barra" });
    expect(resolverSubstituicao([sub(), doDia], alvo)?.exercicio_novo_id).toBe("barra");
  });
  it("ignora substituição de outro dia", () => {
    expect(resolverSubstituicao([sub({ data_treino: "2026-08-12" })], alvo)).toBeNull();
  });
  it("ignora outro grupo, outro slot ou outro exercício", () => {
    expect(resolverSubstituicao([sub({ grupo_id: "G2" })], alvo)).toBeNull();
    expect(resolverSubstituicao([sub({ slot_idx: 1 })], alvo)).toBeNull();
    expect(resolverSubstituicao([sub({ exercicio_origem_id: "remada" })], alvo)).toBeNull();
  });
  it("trata slot_idx null como 0", () => {
    expect(resolverSubstituicao([sub({ slot_idx: null })], alvo)).not.toBeNull();
  });
});

describe("aplicarSubstituicoes", () => {
  const ctx = { grupoId: "G1", slotIdx: 0, dateKey: "2026-08-11" };
  const itens = [item("supino", "Supino Reto", 0), item("remada", "Remada", 1)];

  it("sem substituição devolve a lista original", () => {
    expect(aplicarSubstituicoes(itens, [], ctx, catalogo)).toBe(itens);
  });

  it("troca só o exercício substituído, preservando a ordem", () => {
    const out = aplicarSubstituicoes(itens, [sub()], ctx, catalogo);
    expect(out.map((i) => i.exercicio_id)).toEqual(["crucifixo", "remada"]);
    expect(out[0].ordem).toBe(0);
    expect(out[0].substituindo).toMatchObject({ id: "supino", nome: "Supino Reto", escopo: "definitiva" });
  });

  it("marca escopo 'dia' quando a substituição é da data", () => {
    const out = aplicarSubstituicoes(itens, [sub({ data_treino: "2026-08-11" })], ctx, catalogo);
    expect(out[0].substituindo?.escopo).toBe("dia");
  });

  it("exercício pessoal novo vira exercicio_usuario_id", () => {
    const out = aplicarSubstituicoes(
      itens,
      [sub({ exercicio_novo_id: null, exercicio_novo_usuario_id: "barra" })],
      ctx,
      catalogo,
    );
    expect(out[0].exercicio_id).toBe("barra");
    expect(out[0].exercicio_usuario_id).toBe("barra");
  });

  it("mantém o original se o exercício novo não está no catálogo local", () => {
    const out = aplicarSubstituicoes(itens, [sub({ exercicio_novo_id: "sumiu" })], ctx, catalogo);
    expect(out[0].exercicio_id).toBe("supino");
    expect(out[0].substituindo).toBeUndefined();
  });
});

describe("dataDaTroca (selo aparece só no dia em que trocou)", () => {
  it("troca do dia usa a própria data", () => {
    expect(dataDaTroca(sub({ data_treino: "2026-08-14" }))).toBe("2026-08-14");
  });
  it("definitiva usa a data local em que foi feita", () => {
    const local = dataDaTroca(sub({ updated_at: "2026-08-11T13:20:00Z" }));
    expect(local).toBe("2026-08-11");
  });
  it("definitiva sem timestamp não marca nada", () => {
    expect(dataDaTroca(sub())).toBeNull();
  });
  it("prefere updated_at (última troca) a created_at", () => {
    expect(dataDaTroca(sub({ created_at: "2026-08-01T12:00:00Z", updated_at: "2026-08-09T12:00:00Z" }))).toBe("2026-08-09");
  });
});
