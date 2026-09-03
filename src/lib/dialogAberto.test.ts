// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { fecharDialogAberto } from "./dialogAberto";

function escutarEscape(): { teclas: string[]; parar: () => void } {
  const teclas: string[] = [];
  const handler = (e: Event) => teclas.push((e as KeyboardEvent).key);
  document.addEventListener("keydown", handler, { capture: true });
  return { teclas, parar: () => document.removeEventListener("keydown", handler, { capture: true }) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("fecharDialogAberto (voltar do Android)", () => {
  it("sem modal aberto: retorna false e não dispara Escape", () => {
    const esc = escutarEscape();
    expect(fecharDialogAberto()).toBe(false);
    expect(esc.teclas).toEqual([]);
    esc.parar();
  });

  it("modal fechado (data-state=closed) não conta como aberto", () => {
    document.body.innerHTML = '<div role="dialog" data-state="closed"></div>';
    const esc = escutarEscape();
    expect(fecharDialogAberto()).toBe(false);
    expect(esc.teclas).toEqual([]);
    esc.parar();
  });

  it("modal aberto: retorna true e dispara UM Escape no document (é o que o Radix escuta)", () => {
    document.body.innerHTML = '<div role="dialog" data-state="open"><p>Alterar Grupo</p></div>';
    const esc = escutarEscape();
    expect(fecharDialogAberto()).toBe(true);
    expect(esc.teclas).toEqual(["Escape"]);
    esc.parar();
  });

  it("alertdialog aberto também fecha", () => {
    document.body.innerHTML = '<div role="alertdialog" data-state="open"></div>';
    const esc = escutarEscape();
    expect(fecharDialogAberto()).toBe(true);
    expect(esc.teclas).toEqual(["Escape"]);
    esc.parar();
  });
});
