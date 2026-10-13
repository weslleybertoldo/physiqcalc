import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Rotina } from "@/aluno-dia/tipos";
import { matricula, situacao } from "@/test/fixturesNucleo";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  dados: null as null | Record<string, unknown>,
  ler: vi.fn(),
  salvar: vi.fn(),
  marcar: vi.fn(),
  nativo: false,
  permissao: "granted",
  exato: "granted",
  LN: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    checkExactNotificationSetting: vi.fn(),
    changeExactNotificationSetting: vi.fn(),
  },
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/aluno-dia/api", async (orig) => ({
  ...(await orig<typeof import("@/aluno-dia/api")>()),
  lerMinhasRotinas: (...a: unknown[]) => h.ler(...a),
  salvarRotina: (...a: unknown[]) => h.salvar(...a),
  marcarRotina: (...a: unknown[]) => h.marcar(...a),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo, getPlatform: () => (h.nativo ? "android" : "web") } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: h.LN }));
vi.mock("sonner", () => ({ toast: h.toast }));

import Rotinas from "./Rotinas";

const rotina = (o: Partial<Rotina> = {}): Rotina => ({
  id: "r1", origem: "aluno", paciente_id: null, nome: "Creatina", detalhe: "5 g", tipo: "suplemento", horario: "08:00", dias_semana: [1, 2, 3, 4, 5, 6, 7],
  lembrete: true, ordem: 0, criada_em: "2026-09-01T12:00:00Z", alterada_em: "2026-09-01T12:00:00Z", arquivada_em: null, ...o,
});

function Onde() {
  const l = useLocation();
  return <div data-testid="rota">{l.pathname + l.search}</div>;
}
function abrir(rota = "/perfil/rotinas") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ProvedorConfirmar>
        <MemoryRouter useTransitions={false} initialEntries={[rota]}>
          <Routes>
            <Route path="/perfil/rotinas" element={<><Rotinas /><Onde /></>} />
          </Routes>
        </MemoryRouter>
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );
}
const pagina = () => document.querySelector("[data-pagina-rotinas]") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 30, 9, 30, 0)); // quarta
  h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [matricula()] }) };
  h.dados = {
    ok: true, hoje: "2026-09-30",
    rotinas: [
      rotina({ id: "a", nome: "Creatina", horario: "08:00" }),
      rotina({ id: "b", nome: "Água 2 L", detalhe: null, tipo: "habito", horario: "10:00", lembrete: false, origem: "profissional", paciente_id: "p1" }),
      rotina({ id: "c", nome: "Só sábado", detalhe: null, horario: "09:00", dias_semana: [6] }),
    ],
    feitas: [{ rotina_id: "a", dia: "2026-09-30", feita_em: "x" }],
  };
  h.nativo = false;
  h.permissao = "granted";
  h.exato = "granted";
  h.ler.mockReset();
  h.ler.mockImplementation(async () => h.dados);
  h.salvar.mockReset();
  h.marcar.mockReset();
  h.LN.checkPermissions.mockImplementation(async () => ({ display: h.permissao }));
  h.LN.requestPermissions.mockImplementation(async () => ({ display: "denied" }));
  h.LN.checkExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: h.exato }));
  h.LN.changeExactNotificationSetting.mockImplementation(async () => ({ exact_alarm: "granted" }));
  for (const f of [h.toast, h.toast.success, h.toast.error]) f.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("W-A P3 — Perfil › Rotinas e lembretes", () => {
  it("todas as vivas pela hora, com o ✓ só nas de hoje, os dias, o selo da do profissional e a linha 'Seus profissionais veem' (Q4)", async () => {
    abrir();
    await waitFor(() => expect(pagina().getAttribute("data-pagina-rotinas")).toBe("lista"));
    const linhas = [...document.querySelectorAll("[data-rotina-linha]")];
    expect(linhas.map((l) => l.getAttribute("data-rotina-linha"))).toEqual(["a", "b", "c"]);
    expect(linhas[0].querySelector("[data-rotina-marcar]")?.getAttribute("data-rotina-feita")).toBe("1");
    expect(linhas[1].querySelector("[data-rotina-marcar]")?.getAttribute("data-rotina-feita")).toBe("0");
    expect(linhas[2].querySelector("[data-rotina-marcar]")).toBeNull(); // sábado: sem ✓ hoje
    expect(within(linhas[0] as HTMLElement).getByText("5 g · Todos os dias")).toBeInTheDocument();
    expect(within(linhas[1] as HTMLElement).getByText("do seu profissional")).toBeInTheDocument();
    expect(screen.getByText("Seus profissionais veem as suas rotinas.")).toBeInTheDocument();
    // site: o lembrete só com a página aberta; sem os avisos do APK
    expect(document.querySelector("[data-rotinas-site]")).not.toBeNull();
    expect(document.querySelector('[data-rotinas-aviso="bateria"]')).toBeNull();
  });

  it("?nova=1 (o 'Criar rotina' do Início) abre a folha nova e sai do endereço; tocar numa linha abre para mudar", async () => {
    abrir("/perfil/rotinas?nova=1");
    expect(await screen.findByText("Nova rotina", { selector: "h2" })).toBeInTheDocument();
    expect(document.querySelector('[data-folha-rotina="nova"]')).not.toBeNull();
    await waitFor(() => expect(screen.getByTestId("rota").textContent).toBe("/perfil/rotinas"));
  });

  it("tocar numa linha abre a folha para mudar, com os campos dela", async () => {
    abrir();
    await waitFor(() => expect(document.querySelector('[data-rotina-abrir="a"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-rotina-abrir="a"]')!);
    expect(await screen.findByText("Mudar rotina", { selector: "h2" })).toBeInTheDocument();
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Creatina");
    expect((screen.getByLabelText("Horário (opcional)") as HTMLInputElement).value).toBe("08:00");
  });

  it("✓ na página marca hoje (otimista) pela mesma função do Início", async () => {
    h.marcar.mockResolvedValue({ ok: true, feita: true });
    abrir();
    await waitFor(() => expect(document.querySelector('[data-rotina-marcar="b"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-rotina-marcar="b"]')!);
    await waitFor(() => expect(h.marcar).toHaveBeenCalledWith("b", "2026-09-30", true));
  });

  it("30 vivas: o aviso do limite e 'Nova rotina' desligado", async () => {
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: Array.from({ length: 30 }, (_, i) => rotina({ id: `r${i}`, nome: `R${i}` })), feitas: [] };
    abrir();
    expect(await screen.findByText("Você chegou a 30 rotinas: apague uma para criar outra.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nova rotina" })).toBeDisabled();
  });

  it("vazia: 'Nenhuma rotina ainda', o texto da 1ª rotina e o botão", async () => {
    h.dados = { ok: true, hoje: "2026-09-30", rotinas: [], feitas: [] };
    abrir();
    await waitFor(() => expect(pagina().getAttribute("data-pagina-rotinas")).toBe("vazia"));
    expect(screen.getByText("Nenhuma rotina ainda")).toBeInTheDocument();
    expect(screen.getByText("Crie a sua 1ª rotina (creatina, remédio, água…)")).toBeInTheDocument();
    expect(document.querySelector("[data-rotinas-criar]")).not.toBeNull();
  });

  it("APK: notificações bloqueadas e 'Alarmes e lembretes' desligado → os 2 avisos, a dica da bateria e o 'Ligar' abre o ajuste", async () => {
    h.nativo = true;
    h.permissao = "denied";
    h.exato = "denied";
    abrir();
    expect(await screen.findByText(/As notificações do Physiq estão bloqueadas/)).toBeInTheDocument();
    expect(await screen.findByText(/“Alarmes e lembretes” está desligado/)).toBeInTheDocument();
    expect(screen.getByText(/economia de bateria/)).toBeInTheDocument();
    expect(document.querySelector("[data-rotinas-site]")).toBeNull();
    fireEvent.click(document.querySelector("[data-rotinas-ligar-alarme]")!);
    await waitFor(() => expect(h.LN.changeExactNotificationSetting).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-rotinas-aviso="alarme-exato"]')).toBeNull());
  });

  it("APK: salvar o 1º lembrete pede a permissão; negada → o aviso", async () => {
    h.nativo = true;
    h.permissao = "prompt";
    h.salvar.mockResolvedValue({ ok: true, rotina: rotina({ id: "n", nome: "Nova" }) });
    abrir();
    await waitFor(() => expect(pagina().getAttribute("data-pagina-rotinas")).toBe("lista"));
    fireEvent.click(screen.getByRole("button", { name: "Nova rotina" }));
    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Nova" } });
    fireEvent.change(screen.getByLabelText("Horário (opcional)"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("switch", { name: "Lembrete" }));
    fireEvent.click(document.querySelector("[data-rotina-salvar]")!);
    await waitFor(() => expect(h.LN.requestPermissions).toHaveBeenCalled());
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Libere as notificações do Physiq para o lembrete tocar."));
  });

  it("quem não tem matrícula vê o aviso e não lê", async () => {
    h.sessao = { usuario: { id: "u1" }, situacao: situacao({ matriculas: [] }) };
    abrir();
    expect(await screen.findByText("As rotinas são de quem é aluno no Physiq.")).toBeInTheDocument();
    expect(h.ler).not.toHaveBeenCalled();
  });
});
