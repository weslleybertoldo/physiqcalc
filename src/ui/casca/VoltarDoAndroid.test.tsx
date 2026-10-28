import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { VoltarDoAndroid } from "./VoltarDoAndroid";

// hml-29 (B22) — o voltar do Android: na página inicial pergunta "Deseja sair do Physiq?" na confirmação do próprio app (Sim fecha
// o app; Não fica sem perder nada); modal, folha ou menu aberto fecha só ele; nas outras telas volta e, sem anterior, vai ao Início.

const h = vi.hoisted(() => ({
  nativo: true,
  semNada: false,
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
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ situacao: { sem_nada: h.semNada } }) }));

/** A saída da confirmação (200 ms, o SAIDA_MS do ProvedorConfirmar) + folga: quando uma 2ª pergunta na fila abriria. */
const DEPOIS_DA_SAIDA_MS = 250;

function Tela({ children }: { children?: ReactNode }) {
  return (
    <>
      <input aria-label="Anotação" />
      {children}
    </>
  );
}

function montar(children?: ReactNode, { comConfirmacao = true } = {}) {
  const arvore = (
    <BrowserRouter>
      <VoltarDoAndroid />
      <Tela>{children}</Tela>
    </BrowserRouter>
  );
  return render(comConfirmacao ? <ProvedorConfirmar>{arvore}</ProvedorConfirmar> : arvore);
}

/** O botão voltar do Android (o listener registrado por último). */
function voltar(canGoBack: boolean) {
  act(() => {
    h.voltar[h.voltar.length - 1]({ canGoBack });
  });
}

/** Passa a saída da confirmação no relógio falso: se houvesse uma 2ª pergunta na fila, ela abriria aqui. */
function passarASaida() {
  act(() => {
    vi.advanceTimersByTime(DEPOIS_DA_SAIDA_MS);
  });
}

beforeEach(() => {
  h.nativo = true;
  h.semNada = false;
  h.voltar = [];
  h.exitApp.mockReset().mockImplementation(async () => {});
  h.minimizeApp.mockClear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("VoltarDoAndroid (hml-29, B22)", () => {
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();
    voltar(false);
    await screen.findByRole("alertdialog");
    voltar(false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    passarASaida();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(h.exitApp).not.toHaveBeenCalled();
  });

  it("o voltar repetido antes de a janela abrir não empilha uma 2ª pergunta", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar();
    act(() => {
      const cb = h.voltar[h.voltar.length - 1];
      cb({ canGoBack: false });
      cb({ canGoBack: false });
    });
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    passarASaida();
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

  it("numa tela interna sem histórico (o login trocou a entrada pelo link): vai ao Início trocando a tela, sem pergunta", () => {
    window.history.replaceState({}, "", "/dieta");
    const voltarNaRota = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const empilhar = vi.spyOn(window.history, "pushState");
    montar();
    voltar(false);
    expect(window.location.pathname).toBe("/");
    expect(empilhar).not.toHaveBeenCalled(); // replace: o /dieta não fica atrás do Início
    expect(voltarNaRota).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("as Boas-vindas perguntam só pra quem ainda não tem nada; abertas por quem já tem algo, voltam", async () => {
    window.history.replaceState({}, "", "/boas-vindas");
    const voltarNaRota = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { unmount } = montar();
    voltar(true);
    expect(voltarNaRota).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    unmount();
    h.semNada = true;
    montar();
    voltar(true);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Deseja sair do Physiq?");
    expect(voltarNaRota).toHaveBeenCalledTimes(1);
  });

  it("com o menu do painel aberto (DropdownMenu de verdade, com submenu): o 1º voltar fecha só o menu; o 2º pergunta", async () => {
    window.history.replaceState({}, "", "/painel");
    montar(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger>Ações</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>Editar</DropdownMenu.Item>
            <DropdownMenu.Sub defaultOpen>
              <DropdownMenu.SubTrigger>Mais</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent>
                  <DropdownMenu.Item>Arquivar</DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>,
    );
    expect(screen.getAllByRole("menu").length).toBeGreaterThan(0);
    voltar(true);
    await waitFor(() => expect(screen.queryAllByRole("menu")).toHaveLength(0));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/painel");
    voltar(true);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Deseja sair do Physiq?");
  });

  it("com uma folha aberta (PainelDeslizante): o voltar fecha só ela, sem pergunta e sem trocar de tela", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    function ComFolha() {
      const [aberto, setAberto] = useState(true);
      return (
        <PainelDeslizante aberto={aberto} aoMudar={setAberto} titulo="Filtros">
          <p>conteúdo da folha</p>
        </PainelDeslizante>
      );
    }
    montar(<ComFolha />);
    expect(screen.getByRole("dialog")).toHaveTextContent("conteúdo da folha");
    voltar(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    passarASaida();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("Sim sem conseguir fechar o app: minimiza, como antes", async () => {
    h.exitApp.mockImplementation(async () => {
      throw new Error("exitApp falhou");
    });
    montar();
    voltar(false);
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
    await waitFor(() => expect(h.minimizeApp).toHaveBeenCalledTimes(1));
  });

  it("sem a confirmação do app (sem o provedor): minimiza, como antes", async () => {
    montar(undefined, { comConfirmacao: false });
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
