import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRANCHA_ID } from "../porTempo";
import type { SerieComMemoria } from "../tipos";
import { SeriesDoExercicio } from "./SeriesDoExercicio";
import { LS_CRONOMETRO_SERIE } from "../cronometroSerie";

const h = vi.hoisted(() => ({ toastErro: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: h.toastErro, info: vi.fn() }) }));

// O cronômetro da série por tempo (Prancha e Prancha Lateral — decisão do Weslley 21/10/2026): com meta conta pra baixo e apita no fim
// (o mesmo som do descanso), sem meta conta pra cima até o Parar; grava só o tempo; o aluno corrige o tempo na mão.
const T0 = new Date(2026, 9, 22, 9, 0, 0).getTime();
let tons = 0;

class AudioFalso {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createOscillator() {
    tons++;
    return { connect: () => {}, frequency: { value: 0 }, start: () => {}, stop: () => {} };
  }
  createGain() {
    return { connect: () => {}, gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} } };
  }
}

const serie = (extra: Partial<SerieComMemoria> = {}): SerieComMemoria => ({ exercicio_id: PRANCHA_ID, slot_idx: 0, numero_serie: 1, peso: 0, reps: 0, salva: false, ...extra });

function abrir(meta: number | null, s: SerieComMemoria = serie()) {
  const acoes = { aoSalvar: vi.fn(), aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn() };
  const r = render(<SeriesDoExercicio exercicioId={PRANCHA_ID} nome="Prancha" series={[s]} corrida={false} porTempo metaSegundos={meta} podeEditar {...acoes} />);
  return { ...acoes, ...r };
}

const campo = () => screen.getByLabelText(/Tempo da série 1 de Prancha/) as HTMLInputElement;
const mostrado = () => document.querySelector("[data-cronometro-mostrado]")?.textContent;
const em = (segundos: number) => act(() => vi.setSystemTime(T0 + segundos * 1000));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  localStorage.clear();
  tons = 0;
  h.toastErro.mockClear();
  vi.stubGlobal("AudioContext", AudioFalso);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("série por tempo — com meta do profissional (conta pra baixo)", () => {
  it("o campo mostra a meta; o ▶ conta pra baixo e no fim apita e conclui com a meta", async () => {
    const a = abrir(30);
    expect(screen.getByText("Tempo · meta 00:30")).toBeInTheDocument();
    expect(campo().value).toBe("00:30");

    fireEvent.click(screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" }));
    expect(document.querySelector('[data-serie-cronometro="meta"]')).not.toBeNull();
    expect(screen.getByText("Falta · meta 00:30")).toBeInTheDocument();
    expect(mostrado()).toBe("00:30");
    expect(JSON.parse(localStorage.getItem(LS_CRONOMETRO_SERIE)!)).toMatchObject({ inicio: T0, meta: 30 });

    em(12);
    await waitFor(() => expect(mostrado()).toBe("00:18"));
    expect(a.aoConcluir).not.toHaveBeenCalled();

    em(30);
    await waitFor(() => expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 30, undefined));
    expect(a.aoConcluir).toHaveBeenCalledTimes(1);
    expect(tons).toBe(3); // o "Bip" do descanso (3 toques), o padrão do aparelho
    expect(localStorage.getItem(LS_CRONOMETRO_SERIE)).toBeNull();
    expect(document.querySelector("[data-serie-cronometro]")).toBeNull();
  });

  it("Parar antes da meta conclui com o tempo que segurou (sem apitar)", async () => {
    const a = abrir(45);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" }));
    em(22);
    await waitFor(() => expect(mostrado()).toBe("00:23"));
    fireEvent.click(screen.getByText("Parar"));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 22, undefined);
    expect(tons).toBe(0);
  });

  it("o cronômetro continua se a linha sair da tela (exercício fechado) e volta contando", async () => {
    const a = abrir(30);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" }));
    a.unmount();
    em(10);
    abrir(30);
    expect(document.querySelector('[data-serie-cronometro="meta"]')).not.toBeNull();
    await waitFor(() => expect(mostrado()).toBe("00:20"));
  });

  it("cronômetro esquecido (mais de 15 min) não volta", () => {
    localStorage.setItem(LS_CRONOMETRO_SERIE, JSON.stringify({ chave: `${PRANCHA_ID}|0|1`, inicio: T0 - 16 * 60_000, meta: 30 }));
    abrir(30);
    expect(document.querySelector("[data-serie-cronometro]")).toBeNull();
  });
});

describe("série por tempo — sem meta (conta pra cima)", () => {
  it("o ▶ conta pra cima e o Parar conclui com o tempo segurado", async () => {
    const a = abrir(null);
    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(campo().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" }));
    expect(document.querySelector('[data-serie-cronometro="livre"]')).not.toBeNull();
    expect(screen.getByText("Segurando")).toBeInTheDocument();
    em(47);
    await waitFor(() => expect(mostrado()).toBe("00:47"));
    fireEvent.click(screen.getByText("Parar"));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 47, undefined);
    expect(tons).toBe(0);
  });

  it("sem meta, o campo traz o tempo do último treino (a memória)", () => {
    abrir(null, serie({ tempo_segundos: 52 }));
    expect(campo().value).toBe("00:52");
  });

  it("o × cancela sem gravar; Parar com 0 s também não grava", async () => {
    const a = abrir(null);
    fireEvent.click(screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" }));
    em(5);
    await waitFor(() => expect(mostrado()).toBe("00:05"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar o cronômetro (não grava)" }));
    expect(a.aoConcluir).not.toHaveBeenCalled();
    expect(localStorage.getItem(LS_CRONOMETRO_SERIE)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" }));
    fireEvent.click(screen.getByText("Parar"));
    expect(a.aoConcluir).not.toHaveBeenCalled();
  });
});

describe("série por tempo — o aluno corrige na mão", () => {
  it("digita (segundos ou MM:SS), grava ao sair do campo e o OK conclui com esse tempo", () => {
    const a = abrir(30);
    fireEvent.change(campo(), { target: { value: "1:15" } });
    fireEvent.blur(campo());
    expect(a.aoSalvar).toHaveBeenCalledWith(1, 0, 0, 75, undefined);
    expect(campo().value).toBe("01:15");
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 75, undefined);

    fireEvent.change(campo(), { target: { value: "40" } });
    fireEvent.blur(campo());
    expect(a.aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 40, undefined);
  });

  it("texto inválido volta ao valor de antes, sem gravar", () => {
    const a = abrir(30);
    fireEvent.change(campo(), { target: { value: "abc" } });
    fireEvent.blur(campo());
    expect(a.aoSalvar).not.toHaveBeenCalled();
    expect(campo().value).toBe("00:30");
  });

  it("OK sem tempo nenhum avisa e não conclui", () => {
    const a = abrir(null);
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(h.toastErro).toHaveBeenCalledWith("Marque o tempo da série: toque no ▶ ou digite (ex.: 45 ou 1:30).");
    expect(a.aoConcluir).not.toHaveBeenCalled();
  });
});

describe("série por tempo — feita", () => {
  it("mostra o tempo (nunca '0 kg × 0') e o Refazer", () => {
    const a = abrir(30, serie({ concluida: true, salva: true, tempo_segundos: 45 }));
    const feita = document.querySelector("[data-serie-feita]")!;
    expect(feita.textContent).toContain("45 s");
    expect(feita.textContent).not.toContain("kg");
    fireEvent.click(screen.getByText("Refazer"));
    expect(a.aoDesfazer).toHaveBeenCalledWith(1);
  });
});
