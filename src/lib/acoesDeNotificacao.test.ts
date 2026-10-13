import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  nativo: true,
  ouvintes: [] as ((e: unknown) => void)[],
  addListener: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: { addListener: h.addListener } }));

import { GUARDA_DA_ACAO_MS, _zerarAcoesDeNotificacao, ouvirAcoesDeNotificacao } from "./acoesDeNotificacao";

const toque = (id: number, extra: Record<string, unknown>) => ({ actionId: "tap", notification: { id, title: "t", body: "b", extra } });
const doPlugin = (e: unknown) => h.ouvintes.forEach((f) => f(e));

beforeEach(() => {
  _zerarAcoesDeNotificacao();
  h.nativo = true;
  h.ouvintes = [];
  h.addListener.mockReset();
  h.addListener.mockImplementation(async (_n: string, f: (e: unknown) => void) => {
    h.ouvintes.push(f);
    return { remove: vi.fn() };
  });
});
afterEach(() => vi.useRealTimers());

describe("W-A P3 — o ouvinte único do toque nas notificações locais", () => {
  it("1 ouvinte NATIVO só, com 2 interessados (a consulta e as rotinas); cada ação vai para quem a quer", () => {
    const consulta = vi.fn((e: { notification?: { extra?: { rota?: string } } }) => e.notification?.extra?.rota === "/perfil/agenda");
    const rotinas = vi.fn((e: { notification?: { id?: number } }) => (e.notification?.id ?? 0) >= 40000);
    ouvirAcoesDeNotificacao(consulta as never);
    ouvirAcoesDeNotificacao(rotinas as never);
    expect(h.addListener).toHaveBeenCalledTimes(1);
    expect(h.addListener).toHaveBeenCalledWith("localNotificationActionPerformed", expect.any(Function));
    doPlugin(toque(40003, { rotina_id: "r1" }));
    expect(rotinas).toHaveBeenCalledTimes(1);
    doPlugin(toque(3123, { rota: "/perfil/agenda" }));
    expect(consulta).toHaveBeenLastCalledWith(expect.objectContaining({ notification: expect.objectContaining({ id: 3123 }) }));
    // a da consulta foi da consulta: as rotinas não a recebem
    expect(rotinas).toHaveBeenCalledTimes(1);
  });

  it("app FECHADO: o toque chega antes de quem o quer (o plugin entrega ao 1º ouvinte) → fica guardado e vai para quem montar depois", () => {
    const consulta = vi.fn(() => false);
    ouvirAcoesDeNotificacao(consulta);
    doPlugin(toque(40003, { rotina_id: "r1" }));
    expect(consulta).toHaveBeenCalledTimes(1);
    const rotinas = vi.fn(() => true);
    ouvirAcoesDeNotificacao(rotinas);
    expect(rotinas).toHaveBeenCalledTimes(1);
    // já foi de alguém: quem montar depois não recebe de novo
    const outro = vi.fn(() => true);
    ouvirAcoesDeNotificacao(outro);
    expect(outro).not.toHaveBeenCalled();
  });

  it("a guardada vale 2 min; um interessado com erro não derruba o resto; parar de ouvir funciona", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    doPlugin(toque(40003, { rotina_id: "r1" })); // ninguém ouvia ainda — mas o nativo só existe depois do 1º interessado:
    expect(h.ouvintes).toHaveLength(0);
    const ninguem = vi.fn(() => false);
    ouvirAcoesDeNotificacao(ninguem);
    doPlugin(toque(40003, { rotina_id: "r1" }));
    vi.setSystemTime(new Date(Date.now() + GUARDA_DA_ACAO_MS + 1000));
    const tarde = vi.fn(() => true);
    const pararTarde = ouvirAcoesDeNotificacao(tarde);
    expect(tarde).not.toHaveBeenCalled();
    pararTarde();
    const quebra = vi.fn(() => {
      throw new Error("x");
    });
    const parar = ouvirAcoesDeNotificacao(quebra);
    const certo = vi.fn(() => true);
    ouvirAcoesDeNotificacao(certo);
    doPlugin(toque(40004, { rotina_id: "r2" }));
    expect(certo).toHaveBeenCalledTimes(1);
    parar();
    doPlugin(toque(40005, { rotina_id: "r3" }));
    expect(quebra).toHaveBeenCalledTimes(1);
  });

  it("no site: nenhum ouvinte nativo", () => {
    h.nativo = false;
    ouvirAcoesDeNotificacao(() => true);
    expect(h.addListener).not.toHaveBeenCalled();
  });
});
