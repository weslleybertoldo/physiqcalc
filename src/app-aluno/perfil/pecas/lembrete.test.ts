import { beforeEach, describe, expect, it } from "vitest";
import { LEMBRETE_CHAVE, LEMBRETE_NOTIF_ID, LEMBRETE_PADRAO, gravarLembrete, lerLembrete } from "./lembrete";

beforeEach(() => localStorage.clear());

describe("lembrete de treino (C22): a MESMA chave e formato da TreinosPage (WorkoutReminder)", () => {
  it("chave, id da notificação e o padrão de hoje (7:00 desligado)", () => {
    expect(LEMBRETE_CHAVE).toBe("physiq_workout_reminder");
    expect(LEMBRETE_NOTIF_ID).toBe(2001);
    expect(lerLembrete()).toEqual(LEMBRETE_PADRAO);
    expect(LEMBRETE_PADRAO).toEqual({ hour: 7, minute: 0, enabled: false });
  });
  it("lê o que a TreinosPage gravou e grava no mesmo formato ({ hour, minute, enabled })", () => {
    localStorage.setItem(LEMBRETE_CHAVE, JSON.stringify({ hour: 18, minute: 30, enabled: true }));
    expect(lerLembrete()).toEqual({ hour: 18, minute: 30, enabled: true });
    gravarLembrete({ hour: 6, minute: 45, enabled: false });
    expect(JSON.parse(localStorage.getItem(LEMBRETE_CHAVE)!)).toEqual({ hour: 6, minute: 45, enabled: false });
  });
  it("valor quebrado não derruba a tela", () => {
    localStorage.setItem(LEMBRETE_CHAVE, "{quebrado");
    expect(lerLembrete()).toEqual(LEMBRETE_PADRAO);
    localStorage.setItem(LEMBRETE_CHAVE, JSON.stringify({ hour: 40, minute: -1, enabled: "sim" }));
    expect(lerLembrete()).toEqual({ hour: 7, minute: 0, enabled: false });
  });
});
