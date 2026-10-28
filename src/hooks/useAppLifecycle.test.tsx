import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import { useAppLifecycle } from "./useAppLifecycle";

// hml-29 (B22) — o voltar do Android: na página inicial (ou sem histórico) pergunta "Deseja sair do Physiq?" na confirmação do
// próprio app (Sim fecha o app; Não fica sem perder nada); modal ou menu aberto fecha só ele; nas outras telas, volta na rota.

const h = vi.hoisted(() => ({
  nativo: true,
  voltar: [] as Array<(e: { canGoBack: boolean }) => void>,
  exitApp: vi.fn(async () => {}),
  minimizeApp: vi.fn(async () => {}),
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => h.nativo } }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (evento: string, cb: (e: { canGoBack: boolean }) => void) => {
      if (evento === "backButton") h.voltar.push(cb);
      return Promise.resolve({ remove: async () => { h.voltar = h.voltar.filter((f) => f !== cb); } });
    },
    exitApp: h.exitApp,
    minimizeApp: h.minimizeApp,
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { startAutoRefresh: vi.fn(), stopAutoRefresh: vi.fn() } },
}));

/** A saída da confirmação (200 ms) + folga: o tempo em que uma 2ª pergunta na fila abriria. */
const DEPOIS_DA_SAIDA_MS = 350;

function Tela({ children }: { children?: ReactNode }) {
  useAppLifecycle();
  return (
    <>
      <input aria-label="Anotação" />
      {children}
    </>
  );
}

function montar(children?: ReactNode) {
  return render(
    <ProvedorConfirmar>
      <Tela>{children}</Tela>
    </ProvedorConfirmar>,
  );
}

/** O botão voltar do Android (o listener registrado por último). */
function voltar(canGoBack: boolean) {
  act(() => {
    h.voltar[h.voltar.length - 1]({ canGoBack });
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  h.nativo = true;
  h.voltar = [];
  h.exitApp.mockClear();
  h.minimizeApp.mockClear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAppLifecycle — o voltar do Android (hml-29, B22)", () => {
  it("na página inicial sem histórico: a pergunta 'Deseja sair do Physiq?' com Não e Sim; Sim fecha o app", async () => {
    montar();
    voltar(false);
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Deseja sair do Physiq?");
    expect(screen.getByRole("button", { name: "Não" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
    await waitFor(() => expect(h.exitApp).toHaveBeenCalledTimes(1));
    expect(h.minimizeApp).not.toHaveBeenCalled();
  });

  it("Não: fecha a pergunta e fica na mesma tela com o digitado; voltar de novo = a pergunta de novo", async () => {
    const voltarNaRota = vi.spyOn(window.history, "back").mockImplementation(() => {});
    montar();
    fireEvent.change(screen.getByLabelText("Anotação"), { target: { value: "supino 4x10" } });
    voltar(true); // a página inicial pergunta mesmo com histórico
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(h.exitApp).not.toHaveBeenCalled();
    expect(voltarNaRota).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/");
    expect(screen.getByLabelText("Anotação")).toHaveValue("supino 4x10");
    voltar(true);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Deseja sair do Physiq?");
  });

  it("voltar com a pergunta aberta fecha só ela: não sai e não abre outra", async () => {
    montar();
    voltar(false);
    await screen.findByRole("alertdialog");
    voltar(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await esperar(DEPOIS_DA_SAIDA_MS);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  it("o voltar repetido antes de a janela abrir não empilha uma 2ª pergunta", async () => {
    montar();
    act(() => {
      const cb = h.voltar[h.voltar.length - 1];
      cb({ canGoBack: false });
      cb({ canGoBack: false });
    });
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await esperar(DEPOIS_DA_SAIDA_MS);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("numa tela interna com histórico: volta na rota, sem pergunta", () => {
    window.history.replaceState({}, "", "/treino");
    const voltarNaRota = vi.spyOn(window.history, "back").mockImplementation(() => {});
    montar();
    voltar(true);
    expect(voltarNaRota).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("numa tela interna sem histórico (o app abriu direto nela): pergunta", async () => {
    window.history.replaceState({}, "", "/perfil/meu-plano");
    montar();
    voltar(false);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Deseja sair do Physiq?");
  });

  it.each([
    ["modal", "dialog"],
    ["menu", "menu"],
  ])("com %s aberto na página inicial: o voltar fecha só ele (o Escape), sem pergunta", async (_nome, papel) => {
    const voltarNaRota = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const teclas: string[] = [];
    const escutar = (e: Event) => teclas.push((e as KeyboardEvent).key);
    document.addEventListener("keydown", escutar, { capture: true });
    montar(<div role={papel} data-state="open" />);
    voltar(false);
    document.removeEventListener("keydown", escutar, { capture: true });
    expect(teclas).toEqual(["Escape"]);
    await esperar(DEPOIS_DA_SAIDA_MS);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(voltarNaRota).not.toHaveBeenCalled();
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  it("sem a confirmação do app (sem o provedor): minimiza, como antes", async () => {
    render(<Tela />);
    voltar(false);
    await waitFor(() => expect(h.minimizeApp).toHaveBeenCalledTimes(1));
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  it("no site (fora do app): não registra o voltar", () => {
    h.nativo = false;
    montar();
    expect(h.voltar).toHaveLength(0);
  });
});
