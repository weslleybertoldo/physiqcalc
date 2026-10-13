import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";
import { PRINCIPAL_STORAGE_KEY } from "@/integrations/principal/client";
import { matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: null as null | Record<string, unknown>,
  ler: vi.fn(),
  marcar: vi.fn(),
  nativo: true,
  acoes: [] as ((e: unknown) => void)[],
  estado: [] as ((e: { isActive: boolean }) => void)[],
  pendentes: [] as { id: number; title?: string; body?: string; extra?: unknown }[],
  LN: {
    getPending: vi.fn(),
    cancel: vi.fn(async () => {}),
    schedule: vi.fn(async (_pedido: unknown) => ({ notifications: [] as unknown[] })),
    checkPermissions: vi.fn(async () => ({ display: "granted" })),
    createChannel: vi.fn(async () => {}),
    registerActionTypes: vi.fn(async () => {}),
    getDeliveredNotifications: vi.fn(async () => ({ notifications: [] })),
    removeDeliveredNotifications: vi.fn(async () => {}),
    addListener: vi.fn(),
  },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  notificacao: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerMinhasRotinas: (...a: unknown[]) => h.ler(...a),
  marcarRotina: (...a: unknown[]) => h.marcar(...a),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: h.LN }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (_n: string, f: (e: { isActive: boolean }) => void) => {
      h.estado.push(f);
      return { remove: vi.fn() };
    }),
  },
}));
vi.mock("sonner", () => ({ toast: h.toast }));

import { _zerarAcoesDeNotificacao } from "@/lib/acoesDeNotificacao";
import { _zerarAparelho } from "@/rotinas/aparelho";
import { instante } from "@/rotinas/lembretes";
import LembreteDasRotinas from "./LembreteDasRotinas";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "cre", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "10:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});
function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname}</div>;
}
function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/"]}>
        <LembreteDasRotinas />
        <Routes>
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const sessaoGuardada = (uid: string) => localStorage.setItem(PRINCIPAL_STORAGE_KEY, JSON.stringify({ access_token: "x", user: { id: uid } }));

beforeEach(() => {
  _zerarAcoesDeNotificacao();
  _zerarAparelho();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(instante("2026-09-30", "09:30"));
  localStorage.clear();
  sessionStorage.clear();
  h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [matricula()] }) };
  h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina()], feitas: [] };
  h.nativo = true;
  h.acoes = [];
  h.estado = [];
  h.pendentes = [];
  h.ler.mockReset();
  h.ler.mockImplementation(async () => h.dados);
  h.marcar.mockReset();
  h.marcar.mockResolvedValue({ ok: true, feita: true });
  for (const f of Object.values(h.LN)) f.mockClear();
  h.LN.getPending.mockImplementation(async () => ({ notifications: h.pendentes }));
  h.LN.addListener.mockImplementation(async (_n: string, f: (e: unknown) => void) => {
    h.acoes.push(f);
    return { remove: vi.fn() };
  });
  for (const f of [h.toast, h.toast.success, h.toast.error]) f.mockReset();
  h.notificacao.mockReset();
  vi.stubGlobal("Notification", Object.assign(function Notificacao(titulo: string, o: unknown) {
    h.notificacao(titulo, o);
  }, { permission: "granted" }));
  sessaoGuardada("u1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("W-A P3 — o aviso global dos lembretes (APK)", () => {
  it("ao abrir: lê as rotinas e agenda as 7 avulsas deste login (faixa 40000–40299, canal privado, 'Feito')", async () => {
    montar();
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalledTimes(1));
    const n = (h.LN.schedule.mock.calls[0][0] as { notifications: { id: number; extra: { dono: string } }[] }).notifications;
    expect(n.map((x) => x.id)).toEqual([40003, 40004, 40005, 40006, 40007, 40001, 40002]);
    expect(n.every((x) => x.extra.dono === "u1")).toBe(true);
  });

  it("'Feito' de uma rotina deste login: abre a página, marca o dia daquela ocorrência e avisa com 'Desfazer'", async () => {
    montar();
    await waitFor(() => expect(h.acoes).toHaveLength(1));
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalled());
    h.acoes[0]({ actionId: "feito", notification: { id: 40003, extra: { rotina_id: "cre", dono: "u1", dia: "2026-09-30", hora: "10:00" } } });
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("cre", "2026-09-30", true));
    await waitFor(() => expect(document.querySelector("[data-testid=rota]")?.textContent).toBe("/perfil/rotinas"));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Creatina feita", expect.objectContaining({ action: expect.objectContaining({ label: "Desfazer" }) })));
  });

  it("app FECHADO: o 'Feito' chegou antes do aviso montar (o plugin guardou) → marca assim que monta", async () => {
    // a consulta nova montou antes e registrou o ouvinte único; o toque chega e não é dela
    const { ouvirAcoesDeNotificacao } = await import("@/lib/acoesDeNotificacao");
    ouvirAcoesDeNotificacao((e) => (e.notification?.extra as { rota?: string } | undefined)?.rota === "/perfil/agenda");
    h.acoes[0]({ actionId: "feito", notification: { id: 40005, extra: { rotina_id: "cre", dono: "u1", dia: "2026-09-30", hora: "10:00" } } });
    montar();
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("cre", "2026-09-30", true));
  });

  it("ação de rotina de OUTRO login (aparelho de 2 pessoas): ninguém marca", async () => {
    montar();
    await waitFor(() => expect(h.acoes).toHaveLength(1));
    h.acoes[0]({ actionId: "feito", notification: { id: 40003, extra: { rotina_id: "cre", dono: "outra-pessoa", dia: "2026-09-30", hora: "10:00" } } });
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.marcar).not.toHaveBeenCalled();
  });

  it("voltou para a frente: replaneja e relê", async () => {
    montar();
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(h.estado).toHaveLength(1));
    h.estado[0]({ isActive: true });
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.LN.getPending.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("Sair: a casca desmonta o aviso e o login guardado já não é o dele → esvazia a faixa; o mesmo login guardado (só remontou) → não", async () => {
    const tela = montar();
    await waitFor(() => expect(h.LN.schedule).toHaveBeenCalled());
    h.pendentes = [{ id: 40003, title: "t", body: "b" }, { id: 2001, title: "t", body: "b" }];
    tela.unmount();
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.LN.cancel).not.toHaveBeenCalled();
    const outra = montar();
    await waitFor(() => expect(h.ler).toHaveBeenCalled());
    localStorage.removeItem(PRINCIPAL_STORAGE_KEY);
    outra.unmount();
    await waitFor(() => expect(h.LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 40003 }] }));
  });

  it("quem não é aluno: nada é lido nem agendado", async () => {
    h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [] }) };
    montar();
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.ler).not.toHaveBeenCalled();
    expect(h.LN.schedule).not.toHaveBeenCalled();
  });
});

describe("W-A P3 — o aviso no site (a página aberta)", () => {
  it("no horário: o toast 'Hora da rotina' com 'Marcar como feita' + a notificação do navegador (já permitida); 1 vez por dia nesta aba", async () => {
    h.nativo = false;
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina({ horario: "09:28", tipo: "remedio", nome: "Losartana", detalhe: "50 mg" })], feitas: [] };
    const tela = montar();
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(1));
    const [titulo, op] = h.toast.mock.calls[0] as [string, { description: string; action: { label: string; onClick: () => void } }];
    expect(titulo).toBe("Hora da rotina");
    expect(op.description).toBe("Losartana · 50 mg");
    expect(op.action.label).toBe("Marcar como feita");
    // a notificação do navegador segue a Q3 (remédio sem o nome)
    expect(h.notificacao).toHaveBeenCalledWith("Hora do seu remédio · 09:28", expect.objectContaining({ body: "Toque para ver e marcar como feito." }));
    op.action.onClick();
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("cre", "2026-09-30", true));
    expect(h.LN.schedule).not.toHaveBeenCalled();
    tela.unmount();
    montar();
    await waitFor(() => expect(h.ler).toHaveBeenCalledTimes(3));
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it("antes da hora: nada", async () => {
    h.nativo = false;
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [rotina({ horario: "09:45" })], feitas: [] };
    montar();
    await waitFor(() => expect(h.ler).toHaveBeenCalled());
    await new Promise((ok) => setTimeout(ok, 30));
    expect(h.toast).not.toHaveBeenCalled();
  });
});
