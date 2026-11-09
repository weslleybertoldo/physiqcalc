import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nivelDasSeries } from "../../../supabase/functions/_shared/treino-acessos-regras";
import type { SerieComMemoria } from "../tipos";
import { SeriesDoExercicio } from "./SeriesDoExercicio";

const h = vi.hoisted(() => ({ toastErro: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: h.toastErro, info: vi.fn() }) }));
beforeEach(() => h.toastErro.mockClear());

/** toca no Tempo da corrida, escolhe na roleta (horas · min · seg) e confirma */
function escolherTempo(nome: string, horas: number, min: number, seg: number) {
  fireEvent.click(screen.getByLabelText(new RegExp(`^Tempo da série 1 de ${nome}`)));
  const coluna = (c: string) => screen.getByRole("spinbutton", { name: c });
  fireEvent.click(coluna("Horas").querySelector(`[data-roleta-item="${horas}"]`)!);
  fireEvent.click(coluna("Min").querySelector(`[data-roleta-item="${min}"]`)!);
  fireEvent.click(coluna("Seg").querySelector(`[data-roleta-item="${seg}"]`)!);
  fireEvent.click(document.querySelector("[data-roleta-confirmar]")!);
}

// W-A P4 (spec §6 "P4", o "Pronto": "a nutri trava as séries e o app mostra 'O número de séries é definido pelo seu profissional'"): a
// ponta do APP da corrente. A aba Acessos grava series_travadas pela treino-acessos ("Só ver" = true — nivelDasSeries); o app lê o
// physiq_profiles pelo PowerSync (src/treino/useTreinoDoDia.ts) e o TreinoDoSlot passa podeEditar = !seriesTravadas. No local e no staging o
// build não tem PowerSync (H-14: src/lib/powersync/instancia.ts) — a tela do aluno não abre lá; por isso esta ponta é provada aqui e o E2E
// confere o banco do Treino.
const serie = (n: number): SerieComMemoria => ({ exercicio_id: "e1", numero_serie: n, peso: 40, reps: 10, salva: true });

function abrir(podeEditar: boolean) {
  const acoes = { aoSalvar: vi.fn(), aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn() };
  render(<SeriesDoExercicio exercicioId="e1" nome="Supino" series={[serie(1), serie(2)]} corrida={false} podeEditar={podeEditar} {...acoes} />);
  return acoes;
}

describe("W-A P4 — as séries travadas pela aba Acessos, no app do aluno", () => {
  it("'Só ver' na aba = series_travadas true; 'Pode mexer' = false (a regra da treino-acessos)", () => {
    expect(nivelDasSeries(true)).toBe("ver");
    expect(nivelDasSeries(false)).toBe("mexer");
    expect(nivelDasSeries(null)).toBe("mexer");
  });

  it("travadas: 'O número de séries é definido pelo seu profissional.', sem 'Adicionar série' e sem tirar série", () => {
    abrir(false);
    expect(screen.getByText("O número de séries é definido pelo seu profissional.")).toBeInTheDocument();
    expect(screen.queryByText("Adicionar série")).toBeNull();
    expect(screen.queryByRole("button", { name: "Tirar série" })).toBeNull();
  });

  it("liberadas: põe e tira série (como hoje)", () => {
    const acoes = abrir(true);
    expect(screen.queryByText("O número de séries é definido pelo seu profissional.")).toBeNull();
    fireEvent.click(screen.getByText("Adicionar série"));
    expect(acoes.aoAdicionar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Tirar série" })[1]);
    expect(acoes.aoRemover).toHaveBeenCalledWith(2, true);
  });
});

// O campo em foco não é refeito com o que foi gravado (22/10/2026): o km digitado enquanto o Tempo ainda gravava sumia quando a
// série voltava salva, e o 2º salvamento saía sem a distância.
describe("o campo em foco fica com o que a pessoa digita", () => {
  function tela(corrida: boolean, nova: SerieComMemoria) {
    const aoSalvar = vi.fn();
    const props = {
      exercicioId: nova.exercicio_id, nome: corrida ? "Corrida" : "Supino", corrida, podeEditar: true, aoSalvar,
      aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn(),
    };
    const { rerender } = render(<SeriesDoExercicio {...props} series={[nova]} />);
    return { aoSalvar, voltaGravada: (s: SerieComMemoria) => rerender(<SeriesDoExercicio {...props} series={[s]} />) };
  }

  it("corrida: escolhe o tempo na roleta, vai pro km e digita 3; o Tempo volta gravado sem km → o km continua 3 e sai salvo com 3", () => {
    const nova: SerieComMemoria = { exercicio_id: "c1", numero_serie: 1, peso: 0, reps: 0, salva: false };
    const { aoSalvar, voltaGravada } = tela(true, nova);
    const km = screen.getByLabelText("Distância da série 1 de Corrida (km)");
    escolherTempo("Corrida", 0, 10, 0);
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 600, undefined);
    act(() => km.focus());
    fireEvent.change(km, { target: { value: "3" } });
    voltaGravada({ ...nova, tempo_segundos: 600, salva: true });
    expect(km).toHaveValue(3);
    act(() => km.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 600, 3);
  });

  it("musculação: digita o peso, vai pras repetições e digita 12; o peso volta gravado → as repetições continuam 12", () => {
    const nova: SerieComMemoria = { exercicio_id: "e1", numero_serie: 1, peso: 30, reps: 10, salva: false };
    const { aoSalvar, voltaGravada } = tela(false, nova);
    const peso = screen.getByLabelText("Peso da série 1 de Supino (kg)");
    const reps = screen.getByLabelText("Repetições da série 1 de Supino");
    act(() => peso.focus());
    fireEvent.change(peso, { target: { value: "40" } });
    act(() => peso.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 40, 10, undefined, undefined);
    act(() => reps.focus());
    fireEvent.change(reps, { target: { value: "12" } });
    voltaGravada({ ...nova, peso: 40, reps: 10, salva: true });
    expect(reps).toHaveValue(12);
    act(() => reps.blur());
    expect(aoSalvar).toHaveBeenLastCalledWith(1, 40, 12, undefined, undefined);
  });

  it("fora de foco o campo continua refeito com o que foi gravado (como hoje)", () => {
    const nova: SerieComMemoria = { exercicio_id: "c1", numero_serie: 1, peso: 0, reps: 0, salva: false };
    const { voltaGravada } = tela(true, nova);
    voltaGravada({ ...nova, tempo_segundos: 600, distancia_km: 2.5, salva: true });
    expect(screen.getByLabelText(/^Tempo da série 1 de Corrida/)).toHaveTextContent("10:00");
    expect(screen.getByLabelText("Distância da série 1 de Corrida (km)")).toHaveValue(2.5);
  });
});

// 09/11/2026 (prints do Weslley): o Tempo da corrida pedia "00:19" e o teclado numérico do celular não tem o ":" — o tempo não
// gravava e a série fechava como "0 kg × 0". Agora o Tempo abre a roleta e a série feita mostra o tempo, os km e o pace.
describe("corrida — a roleta do Tempo e a série feita", () => {
  const corrida = (extra: Partial<SerieComMemoria> = {}): SerieComMemoria => ({ exercicio_id: "c1", numero_serie: 1, peso: 0, reps: 0, salva: false, ...extra });
  function abrirCorrida(s: SerieComMemoria) {
    const acoes = { aoSalvar: vi.fn(), aoConcluir: vi.fn(), aoDesfazer: vi.fn(), aoRemover: vi.fn(), aoAdicionar: vi.fn() };
    render(<SeriesDoExercicio exercicioId="c1" nome="Corrida na Esteira" series={[s]} corrida podeEditar {...acoes} />);
    return acoes;
  }

  it("o Tempo não abre teclado: é um botão que abre a roleta (horas · min · seg)", () => {
    abrirCorrida(corrida());
    const tempo = screen.getByLabelText(/^Tempo da série 1 de Corrida na Esteira/);
    expect(tempo.tagName).toBe("BUTTON");
    expect(tempo).toHaveAccessibleName(/sem tempo/);
    fireEvent.click(tempo);
    expect(screen.getByRole("spinbutton", { name: "Horas" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Min" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Seg" })).toBeInTheDocument();
  });

  it("km digitado + 19 min na roleta: grava os 2 juntos e mostra o pace", () => {
    const a = abrirCorrida(corrida());
    const km = screen.getByLabelText("Distância da série 1 de Corrida na Esteira (km)");
    fireEvent.change(km, { target: { value: "2.2" } });
    escolherTempo("Corrida na Esteira", 0, 19, 0);
    expect(a.aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 1140, 2.2);
    expect(screen.getByLabelText(/^Tempo da série 1 de Corrida na Esteira/)).toHaveTextContent("19:00");
    expect(screen.getByText("pace 8:38 /km")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, 1140, 2.2);
  });

  it("mais de 1 hora: 1 h 05 min 30 s", () => {
    const a = abrirCorrida(corrida());
    escolherTempo("Corrida na Esteira", 1, 5, 30);
    expect(a.aoSalvar).toHaveBeenLastCalledWith(1, 0, 0, 3930, undefined);
    expect(screen.getByLabelText(/^Tempo da série 1 de Corrida na Esteira/)).toHaveTextContent("01:05:30");
  });

  it("OK sem tempo e sem km avisa e não fecha a série", () => {
    const a = abrirCorrida(corrida());
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(h.toastErro).toHaveBeenCalledWith("Marque o tempo ou os km da corrida.");
    expect(a.aoConcluir).not.toHaveBeenCalled();
  });

  it("OK só com os km fecha a série (sem tempo)", () => {
    const a = abrirCorrida(corrida());
    fireEvent.change(screen.getByLabelText("Distância da série 1 de Corrida na Esteira (km)"), { target: { value: "2.2" } });
    fireEvent.click(screen.getByRole("button", { name: /OK/ }));
    expect(a.aoConcluir).toHaveBeenCalledWith(1, 0, 0, undefined, 2.2);
  });

  it("feita: tempo · km · pace; só os km; nunca '0 kg × 0'", () => {
    const { unmount } = render(
      <SeriesDoExercicio exercicioId="c1" nome="Corrida na Esteira" corrida podeEditar aoSalvar={vi.fn()} aoConcluir={vi.fn()} aoDesfazer={vi.fn()} aoRemover={vi.fn()} aoAdicionar={vi.fn()}
        series={[corrida({ concluida: true, salva: true, tempo_segundos: 1140, distancia_km: 2.2, pace_segundos_km: 518 })]} />,
    );
    const linhas = [...document.querySelectorAll("[data-serie-feita] .block")].map((e) => e.textContent);
    expect(linhas).toEqual(["19:00 · 2,2 km", "pace 8:38 /km"]); // o pace embaixo: numa linha só ele era cortado no celular
    unmount();
    abrirCorrida(corrida({ concluida: true, salva: true, distancia_km: 2.2 }));
    const feita = document.querySelector("[data-serie-feita]")!;
    expect(feita.textContent).toContain("2,2 km");
    expect(feita.textContent).not.toContain("kg");
  });
});
