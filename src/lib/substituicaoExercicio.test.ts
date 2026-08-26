import { describe, it, expect } from "vitest";
import {
  aplicarSubstituicoes,
  dataDaTroca,
  ehRemocao,
  exerciciosRemovidos,
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
  it("ignora outro grupo ou outro exercício", () => {
    expect(resolverSubstituicao([sub({ grupo_id: "G2" })], alvo)).toBeNull();
    expect(resolverSubstituicao([sub({ exercicio_origem_id: "remada" })], alvo)).toBeNull();
  });
  it("definitiva vale em qualquer slot do grupo; a do dia só no slot em que foi feita", () => {
    expect(resolverSubstituicao([sub({ slot_idx: 1 })], alvo)).not.toBeNull();
    expect(resolverSubstituicao([sub({ slot_idx: 1, data_treino: "2026-08-11" })], alvo)).toBeNull();
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

describe("remoção de exercício (linha sem exercício novo)", () => {
  const ctx = { grupoId: "G1", slotIdx: 0, dateKey: "2026-08-11" };
  const outroDia = { ...ctx, dateKey: "2026-08-12" };
  const itens = [item("supino", "Supino Reto", 0), item("remada", "Remada", 1)];
  const remocao = (over: Partial<Substituicao> = {}) =>
    sub({ exercicio_novo_id: null, exercicio_novo_usuario_id: null, ...over });
  const ids = (out: ItemTreino[]) => out.map((i) => i.exercicio_id);

  it("ehRemocao só quando não há exercício novo", () => {
    expect(ehRemocao(remocao())).toBe(true);
    expect(ehRemocao(sub())).toBe(false);
    expect(ehRemocao(sub({ exercicio_novo_id: null, exercicio_novo_usuario_id: "barra" }))).toBe(false);
  });

  it("remoção do dia tira o exercício só naquela data", () => {
    const subs = [remocao({ data_treino: "2026-08-11" })];
    expect(ids(aplicarSubstituicoes(itens, subs, ctx, catalogo))).toEqual(["remada"]);
    expect(ids(aplicarSubstituicoes(itens, subs, outroDia, catalogo))).toEqual(["supino", "remada"]);
  });

  it("remoção definitiva tira o exercício em qualquer data", () => {
    const subs = [remocao()];
    expect(ids(aplicarSubstituicoes(itens, subs, ctx, catalogo))).toEqual(["remada"]);
    expect(ids(aplicarSubstituicoes(itens, subs, outroDia, catalogo))).toEqual(["remada"]);
  });

  it("remoção do dia ganha de troca definitiva (e a troca volta nos outros dias)", () => {
    const subs = [sub(), remocao({ data_treino: "2026-08-11" })];
    expect(ids(aplicarSubstituicoes(itens, subs, ctx, catalogo))).toEqual(["remada"]);
    expect(ids(aplicarSubstituicoes(itens, subs, outroDia, catalogo))).toEqual(["crucifixo", "remada"]);
  });

  it("troca do dia ganha de remoção definitiva", () => {
    const subs = [remocao(), sub({ data_treino: "2026-08-11" })];
    expect(ids(aplicarSubstituicoes(itens, subs, ctx, catalogo))).toEqual(["crucifixo", "remada"]);
    expect(ids(aplicarSubstituicoes(itens, subs, outroDia, catalogo))).toEqual(["remada"]);
  });

  it("remoção respeita o grupo; definitiva vale em qualquer slot, do dia só no próprio slot", () => {
    expect(ids(aplicarSubstituicoes(itens, [remocao({ grupo_id: "G2" })], ctx, catalogo))).toEqual(["supino", "remada"]);
    expect(ids(aplicarSubstituicoes(itens, [remocao({ slot_idx: 1 })], ctx, catalogo))).toEqual(["remada"]);
    expect(ids(aplicarSubstituicoes(itens, [remocao({ slot_idx: 1, data_treino: "2026-08-11" })], ctx, catalogo))).toEqual(["supino", "remada"]);
  });

  it("exerciciosRemovidos lista o que saiu, com escopo", () => {
    const subs = [remocao({ data_treino: "2026-08-11" }), remocao({ exercicio_origem_id: "remada" })];
    expect(exerciciosRemovidos(itens, subs, ctx)).toEqual([
      { exercicio_id: "supino", nome: "Supino Reto", emoji: "🏋️", escopo: "dia" },
      { exercicio_id: "remada", nome: "Remada", emoji: "🏋️", escopo: "definitiva" },
    ]);
    // em outro dia só a definitiva conta
    expect(exerciciosRemovidos(itens, subs, outroDia).map((r) => r.exercicio_id)).toEqual(["remada"]);
  });

  it("exerciciosRemovidos ignora trocas comuns e lista vazia sem substituições", () => {
    expect(exerciciosRemovidos(itens, [], ctx)).toEqual([]);
    expect(exerciciosRemovidos(itens, [sub()], ctx)).toEqual([]);
  });

  it("aplicar + removidos são complementares", () => {
    const subs = [remocao(), sub({ exercicio_origem_id: "remada", exercicio_novo_id: "crucifixo" })];
    const vis = ids(aplicarSubstituicoes(itens, subs, ctx, catalogo));
    const rem = exerciciosRemovidos(itens, subs, ctx).map((r) => r.exercicio_id);
    expect(vis).toEqual(["crucifixo"]);
    expect(rem).toEqual(["supino"]);
  });
});
