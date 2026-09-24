import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastMock, audio } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  audio: { criados: 0, starts: 0 },
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import SomDescansoDialog from "./SomDescansoDialog";
import { SOM_CHAVE } from "@/lib/somDescanso";

class AudioContextFake {
  state = "running";
  currentTime = 0;
  destination = {};
  constructor() { audio.criados++; }
  resume() { return Promise.resolve(); }
  createOscillator() {
    return { frequency: { value: 0 }, connect() {}, start() { audio.starts++; }, stop() {} };
  }
  createGain() {
    return { connect() {}, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
  }
}

const opcao = (v: string) => document.querySelector(`[data-som-opcao="${v}"]`) as HTMLButtonElement;
const ouvir = (v: string) => document.querySelector(`[data-som-ouvir="${v}"]`) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  toastMock.success.mockClear();
  audio.criados = 0;
  audio.starts = 0;
  vi.stubGlobal("AudioContext", AudioContextFake);
});

describe("SomDescansoDialog", () => {
  it("lista as 5 opções com Bip marcado por padrão", () => {
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    expect(document.querySelectorAll("[data-som-opcao]")).toHaveLength(5);
    expect(opcao("bip").getAttribute("aria-pressed")).toBe("true");
    expect(opcao("sino").getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector("[data-som-dialog]")?.textContent).toContain("Som do descanso");
  });

  it("escolher Sino grava no aparelho, marca a opção e avisa", () => {
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    fireEvent.click(opcao("sino"));
    expect(localStorage.getItem(SOM_CHAVE)).toBe("sino");
    expect(opcao("sino").getAttribute("aria-pressed")).toBe("true");
    expect(opcao("bip").getAttribute("aria-pressed")).toBe("false");
    expect(toastMock.success).toHaveBeenCalledWith("Som do descanso: Sino");
  });

  it("abre já com a escolha salva no aparelho", () => {
    localStorage.setItem(SOM_CHAVE, "alarme");
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    expect(opcao("alarme").getAttribute("aria-pressed")).toBe("true");
  });

  it("Ouvir toca a prévia (Alarme = 5 tons) sem mudar a escolha; Só vibrar não cria áudio", async () => {
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    fireEvent.click(ouvir("alarme"));
    await waitFor(() => expect(audio.starts).toBe(5));
    expect(audio.criados).toBe(1);
    expect(localStorage.getItem(SOM_CHAVE)).toBeNull();
    expect(opcao("bip").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(ouvir("vibrar"));
    await new Promise((r) => setTimeout(r, 0));
    expect(audio.criados).toBe(1);
    expect(audio.starts).toBe(5);
  });

  it("no site, Ouvir do Só vibrar vibra pelo navegador (3× de 3 s); Silencioso não vibra", () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    render(<SomDescansoDialog open onOpenChange={() => {}} />);
    fireEvent.click(ouvir("vibrar"));
    expect(vibrate).toHaveBeenCalledWith([3000, 1000, 3000, 1000, 3000]);
    fireEvent.click(ouvir("silencio"));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("fechado não renderiza a lista", () => {
    render(<SomDescansoDialog open={false} onOpenChange={() => {}} />);
    expect(document.querySelectorAll("[data-som-opcao]")).toHaveLength(0);
  });
});
