import { describe, expect, it, vi } from "vitest";
import { JaEstaNoTreino, restaurarTroca, trocarExercicio } from "./troca";

/** Banco local falso: guarda os SQL e responde os SELECT pela ordem das respostas. */
function bancoFalso(respostas: unknown[][] = []) {
  const feitos: { sql: string; params: unknown[] }[] = [];
  return {
    feitos,
    getAll: vi.fn(async (sql: string, params: unknown[] = []) => {
      feitos.push({ sql, params });
      return (respostas.shift() ?? []) as never[];
    }),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      feitos.push({ sql, params });
    }),
  };
}

const alvo = { userId: "u1", origemId: "orig", grupoId: "g1", grupoPessoal: false, slotIdx: 0, dateKey: "2026-09-30" };
const achar = (db: ReturnType<typeof bancoFalso>, inicio: string) => db.feitos.find((f) => f.sql.trim().startsWith(inicio))!;

describe("trocar exercício — a mesma gravação de hoje (exercicio_substituicao_usuario)", () => {
  it("só hoje: linha do dia (slot + data) com o exercício novo do catálogo", async () => {
    const db = bancoFalso([[]]);
    await trocarExercicio(db, alvo, { id: "novo" }, "dia");
    expect(db.feitos.some((f) => f.sql.includes("DELETE"))).toBe(false);
    const ins = achar(db, "INSERT INTO exercicio_substituicao_usuario");
    expect(ins.params).toEqual(["u1", "g1", 0, "orig", "novo", null, "2026-09-30", expect.any(String), expect.any(String)]);
  });

  it("só hoje por cima de uma troca do dia: atualiza a mesma linha (exercício próprio vai em exercicio_novo_usuario_id)", async () => {
    const db = bancoFalso([[{ id: "sub1" }]]);
    await trocarExercicio(db, alvo, { id: "meu", isPessoal: true }, "dia");
    const up = achar(db, "UPDATE exercicio_substituicao_usuario");
    expect(up.params).toEqual([null, "meu", expect.any(String), "sub1", "u1"]);
    expect(db.feitos.some((f) => f.sql.includes("INSERT"))).toBe(false);
  });

  it("de vez no treino do profissional: tira as trocas desse exercício de hoje em diante e grava a de vez (sem data)", async () => {
    const db = bancoFalso();
    await trocarExercicio(db, alvo, { id: "novo" }, "definitiva");
    const del = achar(db, "DELETE FROM exercicio_substituicao_usuario");
    expect(del.sql).toContain("data_treino IS NULL OR data_treino >= ?");
    expect(del.params).toEqual(["u1", "g1", "orig", "2026-09-30"]);
    const ins = achar(db, "INSERT INTO exercicio_substituicao_usuario");
    expect(ins.params.slice(0, 7)).toEqual(["u1", "g1", 0, "orig", "novo", null, null]);
    expect(db.feitos.some((f) => f.sql.includes("tb_grupos_exercicios_usuario"))).toBe(false);
  });

  it("de vez num treino próprio: troca o exercício no grupo; repetido ou ausente dá erro", async () => {
    const db = bancoFalso([[{ id: "l1" }], []]);
    await trocarExercicio(db, { ...alvo, grupoPessoal: true }, { id: "novo" }, "definitiva");
    const up = achar(db, "UPDATE tb_grupos_exercicios_usuario");
    expect(up.params).toEqual(["novo", null, "l1", "u1"]);
    expect(achar(db, "DELETE FROM exercicio_substituicao_usuario").params).toEqual(["u1", "g1", "orig"]);

    await expect(trocarExercicio(bancoFalso([[{ id: "l1" }], [{ id: "l2" }]]), { ...alvo, grupoPessoal: true }, { id: "novo" }, "definitiva")).rejects.toBeInstanceOf(JaEstaNoTreino);
    await expect(trocarExercicio(bancoFalso([[]]), { ...alvo, grupoPessoal: true }, { id: "novo" }, "definitiva")).rejects.toThrow("não encontrado");
  });
});

describe("Restaurar a troca", () => {
  it("a do dia sai só neste dia e neste treino; a de vez sai de hoje em diante (o passado fica como foi treinado)", async () => {
    const db = bancoFalso();
    await restaurarTroca(db, alvo, "dia");
    expect(db.feitos[0].sql).toContain("slot_idx = ?");
    expect(db.feitos[0].params).toEqual(["u1", "g1", 0, "orig", "2026-09-30"]);
    await restaurarTroca(db, alvo, "definitiva");
    expect(db.feitos[1].sql).toContain("data_treino IS NULL OR data_treino >= ?");
    expect(db.feitos[1].params).toEqual(["u1", "g1", "orig", "2026-09-30"]);
  });
});
