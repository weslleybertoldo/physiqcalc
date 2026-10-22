import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTreinoResumo } from "@/lib/treinoResumo";
import { linhasTabelaDia, textoSeries } from "@/lib/generateWorkoutPlanPDF";
import { PRANCHA_ID } from "@/treino/porTempo";
import { agruparPorSemana, type SerieRow } from "./relatorioDados";
import { lerMetaSegundos, linhaDoAluno, prescricaoComCampo } from "./regras";
import type { ExercicioEditor } from "./tipos";

// A Prancha por tempo no lado do PROFISSIONAL e nos resumos (decisão do Weslley 21/10/2026: "a meta é em segundos"): o campo das
// repetições vira TEMPO (segundos), a carga some, a prévia/PDF dizem "3 × 30 s" e o histórico/relatório mostram "45 s" — nunca
// "0 kg × 0".

vi.mock("@/treino/ui/MiniaturaGif", () => ({ MiniaturaGif: () => null }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { FolhaEditarExercicio } from "./folhas";
import { LinhaExercicioEditor } from "./LinhaExercicioEditor";

const prancha = (extra: Partial<ExercicioEditor> = {}): ExercicioEditor => ({
  chave: `ex:${PRANCHA_ID}`, exercicio_id: PRANCHA_ID, exercicio_usuario_id: null, nome: "Prancha", subtitulo: "Abdômen · isometria",
  grupoMuscular: "Abdômen", imagem_url: null, corrida: false, series: 3, seriesProprias: true, reps: "30", descanso: 60, carga: null, ...extra,
});
const supino: ExercicioEditor = { ...prancha(), chave: "ex:1", exercicio_id: "1", nome: "Supino reto", reps: "10" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Prancha — a meta em segundos (regras do editor)", () => {
  it("lerMetaSegundos: '30', '45 seg', '1:30' → o texto em segundos; vazio = sem meta; fora disso, o erro", () => {
    expect(lerMetaSegundos("30")).toEqual({ ok: true, valor: "30" });
    expect(lerMetaSegundos("45 seg")).toEqual({ ok: true, valor: "45" });
    expect(lerMetaSegundos("1:30")).toEqual({ ok: true, valor: "90" });
    expect(lerMetaSegundos("  ")).toEqual({ ok: true, valor: null });
    expect(lerMetaSegundos("12 reps")).toMatchObject({ ok: false, erro: "Use segundos (30) ou minutos (1:30), até 10 min" });
    expect(lerMetaSegundos("15 min").ok).toBe(false);
  });

  it("o campo REPS da Prancha lê segundos (o do Supino continua lendo repetições)", () => {
    expect(prescricaoComCampo(prancha(), "reps", "45 s")).toMatchObject({ ok: true, valor: { reps: "45" } });
    expect(prescricaoComCampo(prancha(), "reps", "120")).toMatchObject({ ok: true, valor: { reps: "120" } });
    expect(prescricaoComCampo(prancha(), "reps", "8-12 reps").ok).toBe(false);
    expect(prescricaoComCampo(supino, "reps", "45 s").ok).toBe(false);
    expect(prescricaoComCampo(supino, "reps", "8-12")).toMatchObject({ ok: true, valor: { reps: "8-12" } });
  });

  it("linhaDoAluno: '3 × 30 s · 60 s' com meta, '3 séries' sem; nunca a carga", () => {
    expect(linhaDoAluno({ series: 3, reps: "30", descanso: 60, carga: null, corrida: false, porTempo: true }, 60)).toBe("3 × 30 s · 60 s");
    expect(linhaDoAluno({ series: 3, reps: null, descanso: null, carga: 10, corrida: false, porTempo: true }, 45)).toBe("3 séries · 45 s");
    expect(linhaDoAluno({ series: 4, reps: "10", descanso: 60, carga: 60, corrida: false }, 60)).toBe("4 × 10 · 60 s · 60 kg");
  });
});

describe("Prancha — a linha do editor (tela 8)", () => {
  it("TEMPO no lugar de REPS, '30 s', a carga só leitura; digitar '45 seg' grava '45'", async () => {
    const aoPrescrever = vi.fn();
    render(<LinhaExercicioEditor ex={prancha()} descansoPadrao={60} somenteLeitura={false} listaFixa={false} aoPrescrever={aoPrescrever} aoEditar={() => {}} aoRemover={() => {}} />);
    expect(screen.getByText("TEMPO")).toBeInTheDocument();
    expect(screen.queryByText("REPS")).toBeNull();
    const tempo = screen.getByLabelText("tempo de Prancha") as HTMLInputElement;
    expect(tempo.value).toBe("30 s");
    expect(document.querySelector('[data-campo-input="carga"]')).toBeNull(); // só leitura (o "—")
    fireEvent.focus(tempo);
    fireEvent.change(tempo, { target: { value: "45 seg" } });
    fireEvent.blur(tempo);
    await waitFor(() => expect(aoPrescrever).toHaveBeenCalledWith({ series: 3, reps: "45", descanso: 60, carga: null }));
    expect(tempo.value).toBe("45 s");
  });
});

describe("Prancha — a folha Editar exercício", () => {
  it("'Tempo de cada série (segundos)', sem carga sugerida, a prévia em segundos e o Salvar com a meta normalizada", async () => {
    const aoSalvar = vi.fn(async () => true);
    render(<FolhaEditarExercicio aberto aoMudar={() => {}} ex={prancha()} descansoPadrao={60} listaFixa={false} aoSalvar={aoSalvar} aoRemover={() => {}} />);
    expect(await screen.findByText("Tempo de cada série (segundos)")).toBeInTheDocument();
    expect(screen.queryByText("Repetições")).toBeNull();
    expect(screen.queryByText("Carga sugerida (kg)")).toBeNull();
    expect(document.querySelector("[data-editar-previa]")?.textContent).toBe("3 × 30 s · 60 s");
    fireEvent.change(document.querySelector('[data-editar-campo="reps"]')!, { target: { value: "1:15" } });
    expect(document.querySelector("[data-editar-previa]")?.textContent).toBe("3 × 75 s · 60 s");
    fireEvent.click(screen.getByText("Salvar").closest("button")!);
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledWith({ series: 3, reps: "75", descanso: 60, carga: null }));
  });
});

describe("Prancha — histórico, relatório e PDF do plano", () => {
  it("o resumo do treino guarda o tempo e não conta peso nem repetições", () => {
    const r = buildTreinoResumo({
      nome_treino: "Core", iniciado_em: "2026-10-22T09:00:00", concluido_em: "2026-10-22T09:40:00", duracao_segundos: 2400,
      exercicios_concluidos: [
        { exercicio_id: PRANCHA_ID, nome: "Prancha", series_concluidas: 2, series: [{ numero_serie: 1, peso: 0, reps: 0, tempo_segundos: 45 }, { numero_serie: 2, peso: 0, reps: 0, tempo_segundos: 40 }] },
        { exercicio_id: "1", nome: "Supino reto", series_concluidas: 1, series: [{ numero_serie: 1, peso: 60, reps: 10 }] },
      ],
    });
    expect(r.exercicios[0].series).toEqual([{ numero_serie: 1, peso: 0, reps: 0, tempo_segundos: 45 }, { numero_serie: 2, peso: 0, reps: 0, tempo_segundos: 40 }]);
    expect(r.exercicios[0].mediaPesoRep).toBeNull();
    expect(r.volumeTotal).toBe(600);
    expect(r.totalReps).toBe(10);
  });

  it("o relatório do mês: a série da Prancha com o tempo (peso e reps zerados, fora do volume)", () => {
    const serie = (numero_serie: number, extra: Partial<SerieRow>): SerieRow => ({
      data_treino: "2026-10-01", numero_serie, peso: null, reps: null, concluida: true, exercicio_id: PRANCHA_ID, exercicio_usuario_id: null,
      tb_exercicios: { nome: "Prancha", grupo_muscular: "Abdômen", emoji: null }, tb_exercicios_usuario: null, ...extra,
    });
    const semanas = agruparPorSemana([{ data_treino: "2026-10-01" }], [serie(1, { tempo_segundos: 45 }), serie(2, { tempo_segundos: 50 })], 2026, 10);
    const dia = semanas.flatMap((s) => s.dias).find((d) => d.data === "2026-10-01")!;
    expect(dia.exercicios[0].series).toEqual([{ numero: 1, peso: 0, reps: 0, tempo: 45 }, { numero: 2, peso: 0, reps: 0, tempo: 50 }]);
    expect(dia.volumeTotal).toBe(0);
  });

  it("o PDF do plano: 'N × 30 s' com meta, 'N séries' sem (nunca a faixa 8-12 de repetições)", () => {
    expect(textoSeries(3, "30", true)).toBe("3 × 30 s");
    expect(textoSeries(2, null, true)).toBe("2 séries");
    expect(textoSeries(3, null)).toBe("3 × 8-12");
    const dia = { dia_semana: "QUI", grupo_nome: "Core", exercicios: [
      { nome: "Prancha", grupo_muscular: "Abdômen", exercicio_id: PRANCHA_ID, num_series: 3, reps_alvo: "30" },
      { nome: "Abdominal", grupo_muscular: "Abdômen", exercicio_id: "x", num_series: 3, reps_alvo: null },
    ] };
    expect(linhasTabelaDia(dia).map((l) => l[2])).toEqual(["3 × 30 s", "3 × 8-12"]);
  });
});
