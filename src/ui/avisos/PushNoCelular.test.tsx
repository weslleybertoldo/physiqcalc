import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  disponivel: true,
  permissao: "prompt" as string,
  pedido: "granted" as string,
  ouvintes: null as null | { aoToken: (t: string) => void; aoReceber: (n: unknown) => void; aoTocar: (a: unknown) => void },
  registrar: vi.fn(),
  salvar: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/push/aparelho", () => ({
  pushDisponivel: async () => h.disponivel,
  permissaoAtual: async () => h.permissao,
  pedirPermissao: async () => h.pedido,
  registrar: (...a: unknown[]) => h.registrar(...a),
  salvarToken: (...a: unknown[]) => h.salvar(...a),
  ouvir: async (o: typeof h.ouvintes) => {
    if (h.disponivel) h.ouvintes = o;
  },
}));
vi.mock("sonner", () => {
  const t = Object.assign((...a: unknown[]) => h.toast(...a), { success: (...a: unknown[]) => h.toast(...a) });
  return { toast: t };
});

import PushNoCelular from "./PushNoCelular";
import { adiadoRecentemente } from "@/push/regras";

function Onde() {
  const l = useLocation();
  return <span data-testid="onde">{l.pathname}</span>;
}

function montar({ agenda = true }: { agenda?: boolean } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // a agenda do aluno já chegou (o aviso da consulta para confirmar da W20 nasce logo depois dela)
  if (agenda) qc.setQueryData(["agenda-aluno", "u1"], [], { updatedAt: Date.now() - 5000 });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={["/inicio"]}>
        <PushNoCelular />
        <Routes>
          <Route path="*" element={<Onde />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  h.sessao = { usuario: { id: "u1" }, situacao: { user_id: "u1" } };
  h.disponivel = true;
  h.permissao = "prompt";
  h.pedido = "granted";
  h.ouvintes = null;
  h.registrar.mockReset().mockResolvedValue(undefined);
  h.salvar.mockReset().mockResolvedValue(true);
  h.toast.mockReset();
});

describe("W20c — o pedido de permissão do push (só no APK com o Firebase)", () => {
  it("ainda não decidiu: mostra o pedido; \"Ativar avisos\" pede ao Android e registra o aparelho", async () => {
    montar();
    expect(await screen.findByText("Avisos no celular", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText(/Consulta marcada, remarcada ou desmarcada/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ativar avisos" }));
    await waitFor(() => expect(h.registrar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("Avisos no celular")).toBeNull());
    expect(h.toast).toHaveBeenCalledWith("Avisos ligados neste celular");
  });
  it("\"Agora não\": fecha, não registra e só volta a perguntar em 7 dias", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Agora não" }, { timeout: 4000 }));
    await waitFor(() => expect(screen.queryByText("Avisos no celular")).toBeNull());
    expect(h.registrar).not.toHaveBeenCalled();
    expect(adiadoRecentemente("u1")).toBe(true);
  });
  it("negou no Android: não registra e avisa que os avisos seguem no sino e no e-mail", async () => {
    h.pedido = "denied";
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Ativar avisos" }, { timeout: 4000 }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith("Notificações desligadas", expect.objectContaining({ description: expect.stringContaining("sino") })));
    expect(h.registrar).not.toHaveBeenCalled();
  });
  it("já permitido: registra calado, sem pedido na tela", async () => {
    h.permissao = "granted";
    montar();
    await waitFor(() => expect(h.registrar).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Avisos no celular")).toBeNull();
  });
  it("negativos: no site/sem Firebase, negado antes ou sem login — nada aparece e nada é registrado", async () => {
    h.disponivel = false;
    const r = montar();
    await act(() => new Promise((ok) => setTimeout(ok, 1500)));
    expect(screen.queryByText("Avisos no celular")).toBeNull();
    r.unmount();
    h.disponivel = true;
    h.permissao = "denied";
    const r2 = montar();
    await act(() => new Promise((ok) => setTimeout(ok, 1500)));
    expect(screen.queryByText("Avisos no celular")).toBeNull();
    r2.unmount();
    h.permissao = "prompt";
    h.sessao = { usuario: null, situacao: null };
    montar();
    await act(() => new Promise((ok) => setTimeout(ok, 1500)));
    expect(screen.queryByText("Avisos no celular")).toBeNull();
    expect(h.registrar).not.toHaveBeenCalled();
  });
});

describe("W20c — o pedido nunca fica por baixo de outro aviso", () => {
  it("com um aviso na tela (ex.: a consulta para confirmar), o pedido espera ele sair", async () => {
    const aviso = document.createElement("li");
    aviso.setAttribute("data-sonner-toast", "");
    document.body.appendChild(aviso);
    try {
      montar();
      await act(() => new Promise((ok) => setTimeout(ok, 2600)));
      expect(screen.queryByText("Avisos no celular")).toBeNull();
      aviso.remove();
      expect(await screen.findByText("Avisos no celular", {}, { timeout: 3000 })).toBeInTheDocument();
    } finally {
      aviso.remove();
    }
  });
});

describe("W20c — os eventos do FCM", () => {
  it("token novo vai para o banco; tocar na notificação abre a tela do aviso; recebido com o app aberto vira aviso na tela", async () => {
    h.permissao = "granted";
    montar();
    await waitFor(() => expect(h.ouvintes).not.toBeNull());
    act(() => h.ouvintes!.aoToken("fGx1y2z3:APA91bH-exemplo_de_token.do-FCM"));
    expect(h.salvar).toHaveBeenCalledWith("u1", "fGx1y2z3:APA91bH-exemplo_de_token.do-FCM");
    act(() => h.ouvintes!.aoTocar({ actionId: "tap", notification: { data: { link: "/perfil/agenda" } } }));
    await waitFor(() => expect(screen.getByTestId("onde").textContent).toBe("/perfil/agenda"));
    // hml-10 (H-48): o push chega com o corpo genérico do tipo (push-regras.ts → corpoDoPush); o toast mostra o que chegou
    act(() => h.ouvintes!.aoReceber({ title: "Agenda", body: "Tem novidade na sua agenda.", data: { link: "/perfil/agenda" } }));
    expect(h.toast).toHaveBeenCalledWith("Agenda", expect.objectContaining({ description: "Tem novidade na sua agenda." }));
  });
  it("toque com link de fora: abre o início (nunca outro site)", async () => {
    h.permissao = "granted";
    montar();
    await waitFor(() => expect(h.ouvintes).not.toBeNull());
    act(() => h.ouvintes!.aoTocar({ actionId: "tap", notification: { data: { link: "https://golpe.example" } } }));
    await waitFor(() => expect(screen.getByTestId("onde").textContent).toBe("/"));
  });
});
