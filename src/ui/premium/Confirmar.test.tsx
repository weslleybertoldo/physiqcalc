import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "./Confirmar";
import { useConfirmar, type Confirmar } from "./useConfirmar";

// hml-18a (H-40, B) — a confirmação do app no lugar do window.confirm: o AlertDialog com o rótulo da ação, o foco no Cancelar, a
// saída animada (o nó fica com data-state=closed até a animação acabar) e um pedido por vez.

let confirmar: Confirmar;
function Captura() {
  confirmar = useConfirmar();
  return null;
}

function montar() {
  return render(
    <ProvedorConfirmar>
      <Captura />
    </ProvedorConfirmar>,
  );
}

function pedir(titulo = "Excluir o treino \"Peito\"?", extra: Partial<Parameters<Confirmar>[0]> = {}) {
  let p!: Promise<boolean>;
  act(() => {
    p = confirmar({ titulo, descricao: "Os alunos deixam de recebê-lo.", rotuloConfirmar: "Excluir", perigo: true, ...extra });
  });
  return p;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("confirmar() (hml-18a): o AlertDialog do app", () => {
  it("abre o [role=alertdialog] com o título, a descrição e o rótulo da ação; o foco abre no Cancelar; Excluir → true", async () => {
    montar();
    const resposta = pedir();
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent('Excluir o treino "Peito"?');
    expect(dialogo).toHaveTextContent("Os alunos deixam de recebê-lo.");
    expect(dialogo.getAttribute("data-confirmar")).toBe("perigo");
    const ok = dialogo.querySelector("[data-confirmar-ok]") as HTMLElement;
    const cancelar = dialogo.querySelector("[data-confirmar-cancelar]") as HTMLElement;
    expect(ok).toHaveTextContent("Excluir");
    expect(cancelar).toHaveTextContent("Cancelar");
    await waitFor(() => expect(document.activeElement).toBe(cancelar));
    fireEvent.click(ok);
    await expect(resposta).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("sem perigo o botão é o principal (branco) e o Cancelar pode ter outro rótulo", async () => {
    montar();
    const resposta = pedir("Confirmar o recebimento de R$ 150,00?", { perigo: false, rotuloConfirmar: "Confirmar recebimento", rotuloCancelar: "Voltar" });
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.getAttribute("data-confirmar")).toBe("");
    expect(dialogo.querySelector("[data-confirmar-ok]")!.className).toContain("pq-botao-w");
    expect(dialogo.querySelector("[data-confirmar-cancelar]")).toHaveTextContent("Voltar");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await expect(resposta).resolves.toBe(false);
  });

  it("ao sair, o nó fica no DOM com data-state=closed até a animação de saída acabar (não some seco)", async () => {
    // o jsdom não anima: a animação vem do data-state (open → entrar, closed → sair), como o CSS do AlertDialog faz no navegador
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const s = real(el, pseudo);
      return new Proxy(s, {
        get(alvo, prop) {
          if (prop === "animationName") {
            const estado = (el as HTMLElement).getAttribute?.("data-state");
            return estado === "open" ? "entrar" : estado === "closed" ? "sair" : "none";
          }
          const v = Reflect.get(alvo, prop, alvo);
          return typeof v === "function" ? v.bind(alvo) : v;
        },
      });
    });
    const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS;
    if (!css?.escape) vi.stubGlobal("CSS", { ...(css ?? {}), escape: (s: string) => s });
    montar();
    const resposta = pedir();
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.getAttribute("data-state")).toBe("open");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await expect(resposta).resolves.toBe(false);
    // saindo: ainda na tela, fechado
    expect(dialogo.isConnected).toBe(true);
    expect(dialogo.getAttribute("data-state")).toBe("closed");
    // a animação acaba → sai do DOM
    act(() => {
      for (const no of [dialogo, document.querySelector('[data-slot="alert-dialog-overlay"]')]) {
        if (!no) continue;
        const fim = new Event("animationend", { bubbles: true });
        Object.defineProperty(fim, "animationName", { value: "sair" });
        no.dispatchEvent(fim);
      }
    });
    await waitFor(() => expect(dialogo.isConnected).toBe(false));
  });
});

describe("confirmar() — o que NÃO confirma", () => {
  it("Esc → false", async () => {
    montar();
    const resposta = pedir();
    await screen.findByRole("alertdialog");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await expect(resposta).resolves.toBe(false);
  });

  it("Cancelar → false", async () => {
    montar();
    const resposta = pedir();
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await expect(resposta).resolves.toBe(false);
  });

  it("toque fora (no fundo) → false", async () => {
    montar();
    const resposta = pedir();
    await screen.findByRole("alertdialog");
    fireEvent.click(document.querySelector('[data-slot="alert-dialog-overlay"]')!);
    await expect(resposta).resolves.toBe(false);
  });

  it("2 pedidos seguidos: um por vez — o 2º só abre depois do 1º responder (e sair)", async () => {
    montar();
    const primeiro = pedir("Primeiro?");
    const segundo = pedir("Segundo?");
    const d1 = await screen.findByRole("alertdialog");
    expect(d1).toHaveTextContent("Primeiro?");
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    fireEvent.click(d1.querySelector("[data-confirmar-ok]")!);
    await expect(primeiro).resolves.toBe(true);
    await waitFor(() => expect(screen.getByRole("alertdialog")).toHaveTextContent("Segundo?"));
    fireEvent.click(screen.getByRole("alertdialog").querySelector("[data-confirmar-cancelar]")!);
    await expect(segundo).resolves.toBe(false);
  });

  it("sem o provedor, o pedido falha alto (nunca confirma sozinho)", async () => {
    render(<Captura />);
    await expect(confirmar({ titulo: "Excluir?", rotuloConfirmar: "Excluir" })).rejects.toThrow(/ProvedorConfirmar/);
  });
});
