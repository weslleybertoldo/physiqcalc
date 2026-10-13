import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";

const h = vi.hoisted(() => ({
  nativo: true,
  plataforma: "android",
  pendentes: [] as { id: number; title?: string; body?: string; extra?: unknown }[],
  naBandeja: [] as { id: number }[],
  permissao: "granted",
  exato: "granted",
  LN: {
    getPending: vi.fn(),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async (_pedido: unknown) => ({ notifications: [] as unknown[] })),
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(async () => {}),
    registerActionTypes: vi.fn(async () => {}),
    getDeliveredNotifications: vi.fn(),
    removeDeliveredNotifications: vi.fn(async () => {}),
    checkExactNotificationSetting: vi.fn(),
    changeExactNotificationSetting: vi.fn(),
  },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => h.plataforma } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: h.LN }));

import { PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { instante } from "./lembretes";
import {
  _zerarAparelho, alarmeExato, gravarAvisadasNoSite, lerAvisadasNoSite, limparLembretesDoAparelho, loginGuardadoNoAparelho, permissaoDosLembretes,
  reconciliarLembretes,
} from "./aparelho";

const AGORA = instante("2026-09-30", "09:30");
const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "cre", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "10:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});
const agendados = (): Record<string, unknown>[] => {
  const chamadas = h.LN.schedule.mock.calls;
  return (chamadas[chamadas.length - 1]?.[0] as { notifications: Record<string, unknown>[] } | undefined)?.notifications ?? [];
};

beforeEach(() => {
  _zerarAparelho();
  h.nativo = true;
  h.plataforma = "android";
  h.pendentes = [];
  h.naBandeja = [];
  h.permissao = "granted";
  h.exato = "granted";
  for (const f of Object.values(h.LN)) f.mockClear();
  h.LN.getPending.mockImplementation(async () => ({ notifications: h.pendentes }));
  h.LN.checkPermissions.mockImplementation(async () => ({ display: h.permissao }));
  h.LN.requestPermissions.mockImplementation(async () => ({ display: "granted" }));
  h.LN.getDeliveredNotifications.mockImplementation(async () => ({ notifications: h.naBandeja }));
  h.LN.checkExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: h.exato }));
  localStorage.clear();
  sessionStorage.clear();
});

describe("W-A P3 — os lembretes no aparelho (APK)", () => {
  it("sem nada agendado: 7 avulsas (at + allowWhileIdle, SEM every), no canal privado, com o 'Feito'; canal e ação preparados 1 vez", async () => {
    const r = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(r).toEqual({ motivo: "ok", agendados: 7, cancelados: 0, mantidos: 0 });
    const n = agendados();
    expect(n).toHaveLength(7);
    expect(n[0]).toMatchObject({ id: 40003, title: "Hora da rotina", body: "Creatina · 5 g", channelId: "rotinas-v1", actionTypeId: "ROTINA",
      extra: { rotina_id: "cre", dono: "u1", dia: "2026-09-30", hora: "10:00" } });
    for (const x of n) {
      expect(x.schedule).toEqual({ at: expect.any(Date), allowWhileIdle: true });
      expect(x.schedule).not.toHaveProperty("every");
      expect(x.schedule).not.toHaveProperty("on");
    }
    expect(h.LN.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: "rotinas-v1", visibility: 0, importance: 4 }));
    expect(h.LN.registerActionTypes).toHaveBeenCalledWith({ types: [{ id: "ROTINA", actions: [{ id: "feito", title: "Feito" }] }] });
    h.pendentes = n.map((x) => ({ id: x.id as number, title: x.title as string, body: x.body as string, extra: x.extra }));
    const de_novo = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(de_novo).toEqual({ motivo: "ok", agendados: 0, cancelados: 0, mantidos: 7 });
    expect(h.LN.createChannel).toHaveBeenCalledTimes(1);
  });

  it("marcou hoje antes da hora → cancela a de hoje (40003) e não agenda nada; desmarcou → volta a agendar", async () => {
    await reconciliarLembretes([rotina()], [], "u1", AGORA);
    h.pendentes = agendados().map((x) => ({ id: x.id as number, title: x.title as string, body: x.body as string, extra: x.extra }));
    h.LN.schedule.mockClear();
    const feita = await reconciliarLembretes([rotina()], [{ rotina_id: "cre", dia: "2026-09-30", feita_em: "x" }], "u1", AGORA);
    expect(feita).toEqual({ motivo: "ok", agendados: 0, cancelados: 1, mantidos: 6 });
    expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40003 }] });
    h.pendentes = h.pendentes.filter((p) => p.id !== 40003);
    const desfez = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(desfez.agendados).toBe(1);
    expect(agendados().map((x) => x.id)).toEqual([40003]);
  });

  it("sem a permissão de notificação: só cancela (nada é agendado); a do treino (2001) nunca é tocada", async () => {
    h.permissao = "denied";
    h.pendentes = [{ id: 2001, title: "Physiq — Hora do treino!", body: "x" }, { id: 40015, title: "Hora da rotina", body: "Velha", extra: { rotina_id: "x", dono: "u1", dia: "2026-10-01", hora: "07:00" } }];
    const r = await reconciliarLembretes([rotina()], [], "u1", AGORA);
    expect(r.motivo).toBe("sem_permissao");
    expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40015 }] });
    expect(h.LN.schedule).not.toHaveBeenCalled();
  });

  it("Sair: esvazia a faixa (as pendentes e as da bandeja) e só ela", async () => {
    h.pendentes = [{ id: 2001, title: "t", body: "b" }, { id: 3123, title: "t", body: "b" }, { id: 40003, title: "t", body: "b" }, { id: 40297, title: "t", body: "b" }];
    h.naBandeja = [{ id: 40011 }, { id: 3001 }];
    expect(await limparLembretesDoAparelho()).toBe(2);
    expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40003 }, { id: 40297 }] });
    expect(h.LN.removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [{ id: 40011 }] });
  });

  it("um erro do plugin não derruba a tela (motivo 'erro'); reconciliações seguidas vão uma por vez", async () => {
    h.LN.getPending.mockRejectedValueOnce(new Error("plugin"));
    expect((await reconciliarLembretes([rotina()], [], "u1", AGORA)).motivo).toBe("erro");
    const [a, b] = await Promise.all([reconciliarLembretes([rotina()], [], "u1", AGORA), reconciliarLembretes([rotina()], [], "u1", AGORA)]);
    expect([a.motivo, b.motivo]).toEqual(["ok", "ok"]);
  });

  it("as permissões: ligada / bloqueada; 'Alarmes e lembretes' ligado ou desligado (só Android)", async () => {
    expect(await permissaoDosLembretes()).toBe("ligada");
    h.permissao = "denied";
    expect(await permissaoDosLembretes()).toBe("bloqueada");
    h.permissao = "prompt";
    expect(await permissaoDosLembretes()).toBe("perguntar");
    expect(await alarmeExato()).toBe("ligado");
    h.exato = "denied";
    expect(await alarmeExato()).toBe("desligado");
    h.plataforma = "ios";
    expect(await alarmeExato()).toBe("sem_suporte");
  });
});

describe("W-A P3 — o site e o login guardado", () => {
  it("no site, reconciliar e limpar não chamam o plugin", async () => {
    h.nativo = false;
    expect(await reconciliarLembretes([rotina()], [], "u1", AGORA)).toEqual({ motivo: "site", agendados: 0, cancelados: 0, mantidos: 0 });
    expect(await limparLembretesDoAparelho()).toBe(0);
    expect(h.LN.getPending).not.toHaveBeenCalled();
  });

  it("o login guardado sai do armazenamento do principal (sem chamar o Auth); sem nada ou estragado → null", () => {
    expect(loginGuardadoNoAparelho()).toBeNull();
    localStorage.setItem(PRINCIPAL_STORAGE_KEY, JSON.stringify({ access_token: "x", user: { id: "u1" } }));
    expect(loginGuardadoNoAparelho()).toBe("u1");
    localStorage.setItem(PRINCIPAL_STORAGE_KEY, JSON.stringify({ currentSession: { user: { id: "u2" } } }));
    expect(loginGuardadoNoAparelho()).toBe("u2");
    localStorage.setItem(PRINCIPAL_STORAGE_KEY, "{quebrado");
    expect(loginGuardadoNoAparelho()).toBeNull();
  });

  it("o que já foi avisado nesta aba (sessionStorage, as 100 últimas)", () => {
    expect(lerAvisadasNoSite().size).toBe(0);
    gravarAvisadasNoSite(Array.from({ length: 120 }, (_, i) => `r${i}|2026-09-30`));
    const lidas = lerAvisadasNoSite();
    expect(lidas.size).toBe(100);
    expect(lidas.has("r119|2026-09-30") && !lidas.has("r0|2026-09-30")).toBe(true);
  });
});
