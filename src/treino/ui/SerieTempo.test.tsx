import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRANCHA_ID } from "../porTempo";
import type { SerieComMemoria } from "../tipos";
import { SeriesDoExercicio } from "./SeriesDoExercicio";
import { LS_CRONOMETRO_SERIE } from "../cronometroSerie";

const h = vi.hoisted(() => ({ toastErro: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: h.toastErro, info: vi.fn() }) }));

// O cronômetro da série por tempo (Prancha e Prancha Lateral — decisão do Weslley 21/10/2026): com meta conta pra baixo e apita no fim
// (o mesmo som do descanso), sem meta conta pra cima até o Parar; grava só o tempo. Desde 09/11/2026 o tempo se escolhe na roleta e
// o ▶ conta pra baixo a partir do tempo do campo.
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

const campo = () => screen.getByLabelText(/Tempo da série 1 de Prancha/) as HTMLButtonElement;
const iniciarBotao = () => screen.getByRole("button", { name: "Iniciar o cronômetro da série 1" });
/** toca no Tempo, escolhe min e seg na roleta e confirma */
function escolher(min: number, seg: number) {
  fireEvent.click(campo());
  const coluna = (nome: string) => screen.getByRole("spinbutton", { name: nome });
  fireEvent.click(coluna("Min").querySelector(`[data-roleta-item="${min}"]`)!);
  fireEvent.click(coluna("Seg").querySelector(`[data-roleta-item="${seg}"]`)!);
  fireEvent.click(document.querySelector("[data-roleta-confirmar]")!);
}
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
    expect(campo()).toHaveTextContent("00:30");

    fireEvent.click(iniciarBotao());
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
    fireEvent.click(iniciarBotao());
    em(22);
    await waitFor(() => expect(mostrado()).toBe("00:23"));
    fireEvent.click(screen.getByText("Parar"));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 22, undefined);
    expect(tons).toBe(0);
  });

  it("o cronômetro continua se a linha sair da tela (exercício fechado) e volta contando", async () => {
    const a = abrir(30);
    fireEvent.click(iniciarBotao());
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
    expect(campo()).toHaveAccessibleName(/sem tempo/);
    fireEvent.click(iniciarBotao());
    expect(document.querySelector('[data-serie-cronometro="livre"]')).not.toBeNull();
    expect(screen.getByText("Segurando")).toBeInTheDocument();
    em(47);
    await waitFor(() => expect(mostrado()).toBe("00:47"));
    fireEvent.click(screen.getByText("Parar"));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 47, undefined);
    expect(tons).toBe(0);
  });

  it("sem meta, o campo traz o tempo do último treino (a memória) e o ▶ conta esse tempo pra trás (09/11/2026)", async () => {
    const a = abrir(null, serie({ tempo_segundos: 52 }));
    expect(campo()).toHaveTextContent("00:52");
    fireEvent.click(iniciarBotao());
    expect(document.querySelector('[data-serie-cronometro="meta"]')).not.toBeNull();
    expect(mostrado()).toBe("00:52");
    em(52);
    await waitFor(() => expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 52, undefined));
  });

  it("o × cancela sem gravar; Parar com 0 s também não grava", async () => {
    const a = abrir(null);
    fireEvent.click(iniciarBotao());
    em(5);
    await waitFor(() => expect(mostrado()).toBe("00:05"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar o cronômetro (não grava)" }));
    expect(a.aoConcluir).not.toHaveBeenCalled();
    expect(localStorage.getItem(LS_CRONOMETRO_SERIE)).toBeNull();

    fireEvent.click(iniciarBotao());
    fireEvent.click(screen.getByText("Parar"));
    expect(a.aoConcluir).not.toHaveBeenCalled();
  });
});

describe("série por tempo — a roleta (09/11/2026: \"eu seleciono um tempo 1 min e vai na contagem regressiva\")", () => {
  it("escolhe 1 min e o ▶ conta pra trás a partir dele: no fim apita e conclui com 1 min", async () => {
    const a = abrir(null);
    escolher(1, 0);
    expect(campo()).toHaveTextContent("01:00");
    expect(a.aoSalvar).toHaveBeenCalledWith(1, 0, 0, 60, undefined);

    fireEvent.click(iniciarBotao());
    expect(document.querySelector('[data-serie-cronometro="meta"]')).not.toBeNull();
    expect(mostrado()).toBe("01:00");
    expect(JSON.parse(localStorage.getItem(LS_CRONOMETRO_SERIE)!)).toMatchObject({ inicio: T0, meta: 60 });
    em(35);
    await waitFor(() => expect(mostrado()).toBe("00:25"));
    em(60);
    await waitFor(() => expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 60, undefined));
    expect(a.aoConcluir).toHaveBeenCalledTimes(1);
    expect(tons).toBe(3);
  });

  it("o tempo escolhido passa por cima da meta do profissional", async () => {
    abrir(30);
    escolher(0, 45);
    expect(screen.getByText("Tempo · meta 00:30")).toBeInTheDocument();
    expect(campo()).toHaveTextContent("00:45");
    fireEvent.click(iniciarBotao());
    expect(mostrado()).toBe("00:45");
  });

  it("escolher e dar OK conclui com o tempo escolhido (sem o cronômetro)", () => {
    const a = abrir(30);
    escolher(1, 15);
    expect(a.aoSalvar).toHaveBeenCalledWith(1, 0, 0, 75, undefined);
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 75, undefined);
  });

  it("zero na roleta esvazia o campo: o ▶ volta a contar pra cima", () => {
    const a = abrir(null, serie({ tempo_segundos: 52 }));
    escolher(0, 0);
    expect(campo()).toHaveAccessibleName(/sem tempo/);
    expect(a.aoSalvar).not.toHaveBeenCalled();
    fireEvent.click(iniciarBotao());
    expect(document.querySelector('[data-serie-cronometro="livre"]')).not.toBeNull();
  });

  it("Cancelar na roleta não muda nada", () => {
    const a = abrir(30);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("spinbutton", { name: "Min" }).querySelector('[data-roleta-item="3"]')!);
    fireEvent.click(document.querySelector("[data-roleta-cancelar]")!);
    expect(a.aoSalvar).not.toHaveBeenCalled();
    expect(campo()).toHaveTextContent("00:30");
  });

  it("OK sem tempo nenhum avisa e não conclui", () => {
    const a = abrir(null);
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(h.toastErro).toHaveBeenCalledWith("Marque o tempo da série: toque no ▶ ou no Tempo.");
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
