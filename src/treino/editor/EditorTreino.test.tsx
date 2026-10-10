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
  carregarModelos: vi.fn(),
  exerciciosDaLista: vi.fn(),
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
  carregarModelos: h.carregarModelos,
  exerciciosDaLista: h.exerciciosDaLista,
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
    <MemoryRouter useTransitions={false}>
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
  h.carregarModelos.mockResolvedValue({ modelos: [], total: 0 });
  h.exerciciosDaLista.mockResolvedValue({ itens: [], total: 0, totalGlobal: 0, totalMeu: 0, totalProfessores: 0, comGif: 0, totalEscopo: 0, semClassificacao: 0 });
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

describe("hml-14d (B19/B21) — as folhas do editor com página e busca no banco", () => {
  const exercicio = (i: number) => ({
    id: `x${i}`, nome: `Exercício ${String(i).padStart(2, "0")}`, grupo_muscular: "Costas", subgrupo: null, imagem_url: null, tipo: "musculacao",
    professor_id: null, padrao_movimento: null, equipamento: null, variacao: null,
  });

  it("Biblioteca: a RPC com o professor do aluno; chips de grupo e busca (rótulos → códigos) no banco; '1–20 de 41' e a página na folha", async () => {
    h.exerciciosDaLista.mockImplementation(async (_f: unknown, pagina: number) => ({
      itens: Array.from({ length: pagina === 3 ? 1 : 20 }, (_, i) => exercicio((pagina - 1) * 20 + i + 1)),
      total: 41, totalGlobal: 144, totalMeu: 3, totalProfessores: 0, comGif: 81, totalEscopo: 147, semClassificacao: 0,
    }));
    montar(<EditorTreino treinoUserId="t1" />);
    fireEvent.click(await screen.findByText("Adicionar exercício da biblioteca (81 com GIF)"));
    await waitFor(() => expect(h.exerciciosDaLista).toHaveBeenCalledWith({ professor: "prof" }, 1));
    expect(await screen.findByText(/147 na biblioteca · 81 com GIF\./)).toBeInTheDocument();
    const folha = () => document.body.querySelector("[data-folha-biblioteca]") as HTMLElement;
    await waitFor(() => expect(folha().querySelector('[data-lista="folha-biblioteca"]')?.querySelectorAll("[data-item]")).toHaveLength(20));
    expect(folha().querySelector('[data-paginacao="folha-biblioteca"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 41");
    fireEvent.click(folha().querySelector('[data-paginacao="folha-biblioteca"] [data-pagina-proxima]')!);
    await waitFor(() => expect(h.exerciciosDaLista).toHaveBeenLastCalledWith({ professor: "prof" }, 2));
    fireEvent.click(folha().querySelector('[data-biblioteca-grupo="costas"]')!);
    await waitFor(() => expect(h.exerciciosDaLista).toHaveBeenLastCalledWith({ professor: "prof", musculos: expect.arrayContaining(["costas", "dorsal"]) }, 1));
    fireEvent.click(folha().querySelector('[data-biblioteca-grupo="todos"]')!);
    fireEvent.change(folha().querySelector("[data-biblioteca-busca]")!, { target: { value: "cabo" } });
    await waitFor(() => expect(h.exerciciosDaLista).toHaveBeenLastCalledWith({ professor: "prof", q: "cabo", codigos: ["polia"] }, 1));
  });

  it("Biblioteca sem professor do aluno: só os globais (escopo 'global'); erro do banco → o estado de erro", async () => {
    h.carregarEditor.mockResolvedValue(dados({ professorDoAluno: null }));
    h.exerciciosDaLista.mockRejectedValue(new Error("statement timeout"));
    montar(<EditorTreino treinoUserId="t1" />);
    fireEvent.click(await screen.findByText("Adicionar exercício da biblioteca (81 com GIF)"));
    await waitFor(() => expect(h.exerciciosDaLista).toHaveBeenCalledWith({ escopo: "global" }, 1));
    expect(await screen.findByText("Não deu para abrir a biblioteca", {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it("Modelos: 20 por página da função, com a busca (300 ms) e a página na folha; fechar volta à 1", async () => {
    const modelo = (i: number) => ({ id: `m${i}`, nome: `Modelo ${String(i).padStart(2, "0")}`, global: false, meu: true, exercicios: 3, pastas: i % 2 ? ["A"] : [], ja_tem: false });
    h.carregarModelos.mockImplementation(async (_u: string, pagina: number, busca: string) =>
      busca ? { modelos: [modelo(7)], total: 1 } : { modelos: Array.from({ length: pagina === 2 ? 5 : 20 }, (_, i) => modelo((pagina - 1) * 20 + i + 1)), total: 25 });
    montar(<EditorTreino treinoUserId="t1" />);
    fireEvent.click(await screen.findByText("Modelos"));
    await waitFor(() => expect(h.carregarModelos).toHaveBeenCalledWith("t1", 1, ""));
    const folha = () => document.body.querySelector('[data-folha-modelos="modelos"]') as HTMLElement;
    await waitFor(() => expect(folha().querySelector('[data-lista="folha-modelos"]')?.querySelectorAll("[data-item]")).toHaveLength(20));
    expect(folha().querySelector('[data-paginacao="folha-modelos"] [data-paginacao-rotulo]')?.textContent).toBe("1–20 de 25");
    fireEvent.click(folha().querySelector('[data-paginacao="folha-modelos"] [data-pagina-proxima]')!);
    await waitFor(() => expect(h.carregarModelos).toHaveBeenLastCalledWith("t1", 2, ""));
    fireEvent.change(folha().querySelector("[data-folha-modelos-busca]")!, { target: { value: "modelo 07" } });
    await waitFor(() => expect(h.carregarModelos).toHaveBeenLastCalledWith("t1", 1, "modelo 07"));
    await waitFor(() => expect([...folha().querySelectorAll("[data-modelo]")].map((e) => e.getAttribute("data-modelo"))).toEqual(["Modelo 07"]));
  });
});
