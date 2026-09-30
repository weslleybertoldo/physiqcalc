import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import { chaveData, datasDaSemana } from "@/treino/datas";
import type { DadosEditor } from "./tipos";

const h = vi.hoisted(() => ({
  carregarEditor: vi.fn(),
  salvarPrescricao: vi.fn(),
  salvarObservacao: vi.fn(),
  salvarConfig: vi.fn(),
  adicionarExercicio: vi.fn(),
  removerExercicio: vi.fn(),
  ordenarExercicios: vi.fn(),
  carregarSemanaAtual: vi.fn(),
  carregarVolume: vi.fn(),
  estado: vi.fn(),
  toastErro: vi.fn(),
}));
vi.mock("./api", () => ({
  ErroTreinoPainel: class extends Error {
    constructor(public codigo: string, public status = 0) {
      super(codigo);
    }
  },
  carregarEditor: h.carregarEditor,
  salvarPrescricao: h.salvarPrescricao,
  salvarObservacao: h.salvarObservacao,
  salvarConfig: h.salvarConfig,
  adicionarExercicio: h.adicionarExercicio,
  removerExercicio: h.removerExercicio,
  ordenarExercicios: h.ordenarExercicios,
  carregarSemanaAtual: h.carregarSemanaAtual,
  carregarVolume: h.carregarVolume,
  carregarVolumePraticado: vi.fn().mockResolvedValue([]),
  carregarModelos: vi.fn().mockResolvedValue([]),
  carregarBiblioteca: vi.fn().mockResolvedValue([]),
  carregarHistoricoMes: vi.fn().mockResolvedValue([]),
  carregarTreinoDoHistorico: vi.fn(),
  carregarPlanoParaPdf: vi.fn(),
  acharAlunoNoTreino: vi.fn(),
  novoTreino: vi.fn(),
  usarTreino: vi.fn(),
  tirarTreino: vi.fn(),
  salvarDia: vi.fn(),
  salvarAlternado: vi.fn(),
  salvarExtras: vi.fn(),
  aplicarPadraoATodos: vi.fn(),
}));
vi.mock("./useTreinoDoAlunoPainel", async (orig) => ({ ...(await orig<object>()), useTreinoDoAlunoPainel: h.estado }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.toastErro } }));
vi.mock("@/treino/ui/MiniaturaGif", () => ({ MiniaturaGif: ({ nome }: { nome: string }) => <span data-miniatura={nome} /> }));

import { EditorTreino } from "./EditorTreino";
import CardTreino from "@/painel/aluno/resumo/CardTreino";
import AbaTreino from "@/painel/aluno/abas/Treino";

const exs = [
  ["e1", "Supino Reto com Barra", "Peitoral"],
  ["e2", "Supino Inclinado", "Peitoral"],
  ["e3", "Crucifixo com Halteres", "Peitoral"],
  ["e4", "Tríceps Francês com Halter", "Tríceps"],
  ["e5", "Tríceps Pulley", "Tríceps"],
] as const;

function dados(o: Partial<DadosEditor> = {}): DadosEditor {
  return {
    semana: ["SEG", "TER", "QUA", "QUI", "SEX"].map((d, i) => ({ dia_semana: d, slot_idx: 0, grupo_id: ["gA", "gB", "gC", "gA", "gB"][i], grupo_usuario_id: null, extra: false })),
    gruposDisponiveis: [
      { id: "gA", nome: "Peito e tríceps", tipo: "catalogo", professor_id: "prof", alunos: 1, em_pasta: false, lista_direta: true },
      { id: "gB", nome: "Costas", tipo: "catalogo", professor_id: null, alunos: 2, em_pasta: false, lista_direta: false },
      { id: "gC", nome: "Pernas", tipo: "catalogo", professor_id: null, alunos: 1, em_pasta: false, lista_direta: false },
    ],
    diasConfig: [],
    seriesPadrao: [
      { grupo_id: "gA", grupo_usuario_id: null, exercicio_id: "e1", exercicio_usuario_id: null, num_series: 4, reps_alvo: "10", descanso_segundos: 60, carga_sugerida_kg: 60 },
    ],
    exerciciosPorTreino: {
      "catalogo:gA": exs.map(([id, nome, g], i) => ({ exercicio_id: id, exercicio_usuario_id: null, nome, ordem: i, grupo_muscular: g, subgrupo: null, imagem_url: null, tipo: "musculacao" })),
      "catalogo:gB": [{ exercicio_id: "b1", exercicio_usuario_id: null, nome: "Puxada Aberta Frontal", ordem: 0, grupo_muscular: "Dorsal / Bíceps", subgrupo: null, imagem_url: null, tipo: "musculacao" }],
      "catalogo:gC": [],
    },
    config: { series_padrao_qtd: 3, series_modo: "personalizada", series_travadas: true, tempo_descanso_segundos: 60, proxima_troca_treino: null },
    podeEditar: true,
    professorDoAluno: "prof",
    ...o,
  };
}

const montar = (ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.carregarEditor.mockResolvedValue(dados());
  h.salvarPrescricao.mockResolvedValue({ ok: true });
  h.salvarObservacao.mockResolvedValue({ ok: true, observacao: "x" });
  h.salvarConfig.mockResolvedValue({ ok: true, config: {} });
  h.carregarSemanaAtual.mockResolvedValue({ overrides: [], concluidos: [] });
  h.carregarVolume.mockResolvedValue([]);
});

describe("W15 — editor do treino (tela 8, lado esquerdo)", () => {
  it("abas A/B/C, chips (exercícios, séries, duração, cadeado) e os 4 campos de cada exercício", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    expect(await screen.findByText("A · Peito e tríceps")).toBeInTheDocument();
    expect(screen.getByText("B · Costas")).toBeInTheDocument();
    expect(screen.getByText("C · Pernas")).toBeInTheDocument();
    expect(screen.getByText("5 EXERCÍCIOS")).toBeInTheDocument();
    expect(screen.getByText("16 SÉRIES")).toBeInTheDocument();
    expect(screen.getByText("ALUNO NÃO MUDA AS SÉRIES")).toBeInTheDocument();
    expect(screen.getByText(/DESCANSO PADRÃO 60 S/)).toBeInTheDocument();
    expect(screen.getByText(/TREINO ALTERNADO: NÃO/)).toBeInTheDocument();
    expect(screen.getByText("Adicionar exercício da biblioteca (81 com GIF)")).toBeInTheDocument();
    const supino = document.querySelector('[data-exercicio-nome="Supino Reto com Barra"]') as HTMLElement;
    expect((within(supino).getByLabelText(/séries de Supino Reto/) as HTMLInputElement).value).toBe("4");
    expect((within(supino).getByLabelText(/reps de Supino Reto/) as HTMLInputElement).value).toBe("10");
    expect((within(supino).getByLabelText(/descanso de Supino Reto/) as HTMLInputElement).value).toBe("60 s");
    expect((within(supino).getByLabelText(/carga de Supino Reto/) as HTMLInputElement).value).toBe("60 kg");
  });

  it("digitar a prescrição grava nas colunas que o app lê (e só aquele exercício)", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    const campo = screen.getByLabelText(/reps de Supino Inclinado/) as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "8 - 12" } });
    fireEvent.blur(campo);
    await waitFor(() => expect(h.salvarPrescricao).toHaveBeenCalledTimes(1));
    expect(h.salvarPrescricao).toHaveBeenCalledWith("t1", { grupo_id: "gA" }, expect.objectContaining({ exercicio_id: "e2", exercicio_usuario_id: null }), {
      series: 3, reps: "8-12", descanso: null, carga: null,
    });
    const carga = screen.getByLabelText(/carga de Supino Inclinado/) as HTMLInputElement;
    fireEvent.focus(carga);
    fireEvent.change(carga, { target: { value: "24" } });
    fireEvent.keyDown(carga, { key: "Enter" });
    fireEvent.blur(carga);
    await waitFor(() => expect(h.salvarPrescricao).toHaveBeenCalledTimes(2));
    expect(h.salvarPrescricao.mock.calls[1][3]).toMatchObject({ carga: 24 });
  });

  it("valor inválido não grava e avisa", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    const campo = screen.getByLabelText(/reps de Tríceps Pulley/) as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "doze" } });
    fireEvent.blur(campo);
    expect(h.toastErro).toHaveBeenCalled();
    expect(h.salvarPrescricao).not.toHaveBeenCalled();
    expect(campo.value).toBe("");
  });

  it("cadeado e observação gravam na hora", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    fireEvent.click(screen.getByText("ALUNO NÃO MUDA AS SÉRIES"));
    await waitFor(() => expect(h.salvarConfig).toHaveBeenCalledWith("t1", { series_travadas: false }));
    const obs = document.querySelector("[data-treino-observacao-campo]") as HTMLTextAreaElement;
    fireEvent.focus(obs);
    fireEvent.change(obs, { target: { value: "Desça a barra em 3 segundos." } });
    fireEvent.blur(obs);
    await waitFor(() => expect(h.salvarObservacao).toHaveBeenCalledWith("t1", { grupo_id: "gA" }, "Desça a barra em 3 segundos."));
  });

  it("trocar de aba mostra o outro treino; treino compartilhado avisa que a lista vira cópia", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    fireEvent.click(await screen.findByText("B · Costas"));
    expect(await screen.findByText("Puxada Aberta Frontal")).toBeInTheDocument();
    expect(screen.getByText("Modelo da biblioteca")).toBeInTheDocument();
  });

  it("só ver (nutricionista / dono sem papel de personal): sem campos, sem adicionar, sem Modelos", async () => {
    montar(<EditorTreino treinoUserId="t1" somenteLeitura />);
    await screen.findByText("A · Peito e tríceps");
    expect(document.querySelector("[data-campo-input]")).toBeNull();
    expect(screen.queryByText("Adicionar exercício da biblioteca (81 com GIF)")).toBeNull();
    expect(screen.queryByText("Modelos")).toBeNull();
    expect(document.querySelector('[data-campo-valor="carga"]')?.textContent).toBe("60 kg");
  });

  it("o servidor diz que só lê (podeEditar=false) → mesmo sem a prop, só ver", async () => {
    h.carregarEditor.mockResolvedValue(dados({ podeEditar: false }));
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    expect(document.querySelector("[data-campo-input]")).toBeNull();
  });

  it("aluno sem treino: estado vazio com Modelos", async () => {
    h.carregarEditor.mockResolvedValue(dados({ gruposDisponiveis: [], exerciciosPorTreino: {}, semana: [] }));
    montar(<EditorTreino treinoUserId="t1" />);
    expect(await screen.findByText("O aluno ainda não tem treino")).toBeInTheDocument();
    expect(screen.getByText("Usar um modelo")).toBeInTheDocument();
  });
});

describe("W15 — card Treino do Resumo (tela 7) e a aba", () => {
  it('"N de M na semana", os treinos A/B/C e as séries por grupo', async () => {
    const dias = datasDaSemana(new Date()).map(chaveData);
    h.estado.mockReturnValue({ tipo: "ok", treinoUserId: "t1", somenteLeitura: false, perfil: perfil() });
    h.carregarSemanaAtual.mockResolvedValue({ overrides: [], concluidos: [0, 1, 2].map((i) => ({ data_treino: dias[i], slot_idx: 0 })) });
    const bloco = (key: string, nome: string, total: number) => ({ bloco: { key, nome, emoji: "", grupoPadrao: "" }, total, status: "neutro", landmark: null, detalhes: [] });
    h.carregarVolume.mockResolvedValue([bloco("peito", "Peito", 14), bloco("costas", "Costas", 16), bloco("quadriceps", "Quadríceps", 18), bloco("ombro", "Ombro", 10), bloco("triceps", "Tríceps", 12)]);
    montar(<CardTreino alunoId="p1" />);
    expect(await screen.findByText("3 DE 5 NA SEMANA")).toBeInTheDocument();
    expect(screen.getByText("A · Peito e tríceps")).toBeInTheDocument();
    expect(screen.getByText("C · Pernas")).toBeInTheDocument();
    expect(await screen.findByText("Séries por semana, por grupo")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-volume-grupo="pernas"]')?.getAttribute("data-volume-total")).toBe("18"));
    expect(document.querySelector('[data-volume-grupo="bracos"]')?.getAttribute("data-volume-total")).toBe("12");
    expect(screen.getByText("Abrir").getAttribute("href")).toBe("/painel/alunos/p1/treino");
  });

  it("aluno sem o módulo Treino: o card não aparece; a aba explica", async () => {
    h.estado.mockReturnValue({ tipo: "sem-modulo" });
    const r = montar(<CardTreino alunoId="p1" />);
    expect(r.container.querySelector("[data-card-treino]")).toBeNull();
    r.unmount();
    montar(<AbaTreino alunoId="p1" />);
    expect(screen.getByText("Este aluno não tem treino")).toBeInTheDocument();
  });

  it("aluno que ainda não entrou no app: o treino nasce no 1º acesso", () => {
    h.estado.mockReturnValue({ tipo: "sem-login", temLogin: false });
    montar(<AbaTreino alunoId="p1" />);
    expect(screen.getByText("O treino nasce no 1º acesso do aluno")).toBeInTheDocument();
    expect(screen.getByText("Ir para o Resumo")).toBeInTheDocument();
  });

  it("a aba monta o editor, a semana, as séries e a troca, o volume, o histórico e o relatório", async () => {
    h.estado.mockReturnValue({ tipo: "ok", treinoUserId: "t1", somenteLeitura: false, perfil: perfil() });
    montar(<AbaTreino alunoId="p1" />);
    expect((await screen.findAllByText("A · Peito e tríceps")).length).toBeGreaterThan(1);
    for (const t of ["Semana do aluno", "Número de séries", "Troca do treino", "Volume semanal", "Histórico", "Relatório", "PDF do treino"]) {
      expect(await screen.findByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText("Segunda")).toBeInTheDocument();
  });
});
