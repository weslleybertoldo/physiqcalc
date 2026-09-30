import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ nativo: false, cancel: vi.fn(async () => {}), schedule: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { cancel: h.cancel, schedule: h.schedule, requestPermissions: vi.fn(), checkPermissions: vi.fn() } }));

import { renderHook } from "@testing-library/react";
import { carregarAnotacao, salvarAnotacao } from "./anotacoes";
import { removerExercicio, restaurarExercicio } from "./remocao";
import { textoDoLembrete, useLembreteDoTreino } from "./useLembreteDoTreino";

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

const alvo = { userId: "u1", origemId: "ex1", grupoId: "g1", grupoPessoal: false, slotIdx: 0, dateKey: "2026-09-29" };

describe("remover exercício (só hoje / de vez) e Restaurar — a gravação de hoje", () => {
  it("só hoje: linha do dia SEM exercício novo (ou a troca do dia vira remoção)", async () => {
    const db = bancoFalso([[]]);
    await removerExercicio(db, alvo, "dia");
    const ins = db.feitos.find((f) => f.sql.includes("INSERT INTO exercicio_substituicao_usuario"))!;
    expect(ins.sql).toContain("NULL, NULL, ?");
    expect(ins.params).toEqual(["u1", "g1", 0, "ex1", "2026-09-29", expect.any(String), expect.any(String)]);

    const db2 = bancoFalso([[{ id: "sub1" }]]);
    await removerExercicio(db2, alvo, "dia");
    const up = db2.feitos.find((f) => f.sql.startsWith("UPDATE exercicio_substituicao_usuario"))!;
    expect(up.sql).toContain("exercicio_novo_id = NULL");
    expect(up.params).toEqual([expect.any(String), "sub1", "u1"]);
  });

  it("de vez no treino do profissional: apaga trocas antigas do exercício e grava a remoção sem data (o grupo dele não muda)", async () => {
    const db = bancoFalso();
    await removerExercicio(db, alvo, "definitiva");
    expect(db.feitos[0].sql).toContain("DELETE FROM exercicio_substituicao_usuario");
    expect(db.feitos[1].sql).toContain("NULL, NULL, NULL, ?, ?");
    expect(db.feitos.some((f) => f.sql.includes("tb_grupos_exercicios_usuario"))).toBe(false);
  });

  it("de vez num treino próprio: sai do grupo (e sem o exercício no grupo, erro)", async () => {
    const db = bancoFalso([[{ id: "l1" }, { id: "l2" }]]);
    await removerExercicio(db, { ...alvo, grupoPessoal: true }, "definitiva");
    expect(db.feitos.filter((f) => f.sql.startsWith("DELETE FROM tb_grupos_exercicios_usuario"))).toHaveLength(2);
    await expect(removerExercicio(bancoFalso([[]]), { ...alvo, grupoPessoal: true }, "definitiva")).rejects.toThrow();
  });

  it("Restaurar do dia filtra o slot e a data; o de vez vale no grupo inteiro", async () => {
    const db = bancoFalso();
    await restaurarExercicio(db, alvo, "dia");
    expect(db.feitos[0].params).toEqual(["u1", "g1", 0, "ex1", "2026-09-29"]);
    await restaurarExercicio(db, alvo, "definitiva");
    expect(db.feitos[1].sql).toContain("data_treino IS NULL");
    expect(db.feitos[1].params).toEqual(["u1", "g1", "ex1"]);
  });
});

describe("anotações do exercício", () => {
  it("exercício do catálogo grava em exercicio_id; pessoal em exercicio_usuario_id; vazio apaga", async () => {
    const cat = bancoFalso([[{ 1: 1 }], []]);
    await salvarAnotacao(cat, "u1", "ex1", "  cotovelos fechados ");
    const ins = cat.feitos.find((f) => f.sql.startsWith("INSERT INTO tb_exercicio_comentarios"))!;
    expect(ins.params.slice(0, 4)).toEqual(["u1", "ex1", null, "cotovelos fechados"]);

    const pessoal = bancoFalso([[], []]);
    await salvarAnotacao(pessoal, "u1", "meu1", "x");
    const ins2 = pessoal.feitos.find((f) => f.sql.startsWith("INSERT INTO tb_exercicio_comentarios"))!;
    expect(ins2.params.slice(0, 3)).toEqual(["u1", null, "meu1"]);

    const apagar = bancoFalso([[{ 1: 1 }]]);
    await salvarAnotacao(apagar, "u1", "ex1", "   ");
    expect(apagar.feitos[1].sql).toContain("DELETE FROM tb_exercicio_comentarios");

    expect(await carregarAnotacao(bancoFalso([[{ 1: 1 }], [{ comentario: "ok" }]]), "u1", "ex1")).toBe("ok");
    expect(await carregarAnotacao(null, "u1", "ex1")).toBe("");
  });
});

describe("lembrete de treino com o nome do treino de hoje (mesmas chaves do Perfil)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    h.nativo = false;
  });

  it("texto com o treino de hoje; sem treino, o genérico", () => {
    expect(textoDoLembrete("Peito + tríceps", "Ter 29/09")).toBe("Treino de hoje: Peito + tríceps (Ter 29/09)");
    expect(textoDoLembrete(null, "Ter 29/09")).toBe("Hora do seu treino de hoje.");
  });

  it("no APK, ligado → reagenda a notificação 2001 diária com o nome do treino; ao sair da aba, NÃO cancela", async () => {
    h.nativo = true;
    localStorage.setItem("physiq_workout_reminder", JSON.stringify({ hour: 18, minute: 30, enabled: true }));
    const { unmount } = renderHook(() => useLembreteDoTreino("Pernas", "Qua 30/09", true));
    await vi.waitFor(() => expect(h.schedule).toHaveBeenCalledTimes(1));
    const n = (h.schedule.mock.calls[0][0] as { notifications: { id: number; title: string; body: string; schedule: { every: string } }[] }).notifications[0];
    expect(n).toMatchObject({ id: 2001, title: "Physiq — Hora do treino!", body: "Treino de hoje: Pernas (Qua 30/09)" });
    expect(n.schedule.every).toBe("day");
    const cancelsAntes = h.cancel.mock.calls.length;
    unmount();
    expect(h.cancel.mock.calls.length).toBe(cancelsAntes);
  });

  it("desligado não agenda nada", async () => {
    h.nativo = true;
    localStorage.setItem("physiq_workout_reminder", JSON.stringify({ hour: 7, minute: 0, enabled: false }));
    renderHook(() => useLembreteDoTreino("Pernas", "Qua 30/09", true));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.schedule).not.toHaveBeenCalled();
  });
});
