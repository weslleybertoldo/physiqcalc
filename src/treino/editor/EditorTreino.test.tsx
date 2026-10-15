import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { perfil } from "@/test/fixturesPerfilAluno";
import { chaveData, datasDaSemana } from "@/treino/datas";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
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
  salvarDia: vi.fn(),
  salvarAlternado: vi.fn(),
  salvarExtras: vi.fn(),
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
  salvarDia: h.salvarDia,
  salvarAlternado: h.salvarAlternado,
  salvarExtras: h.salvarExtras,
  aplicarPadraoATodos: vi.fn(),
}));
vi.mock("./useTreinoDoAlunoPainel", async (orig) => ({ ...(await orig<object>()), useTreinoDoAlunoPainel: h.estado }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.toastErro } }));
vi.mock("@/treino/ui/MiniaturaGif", () => ({ MiniaturaGif: ({ nome }: { nome: string }) => <span data-miniatura={nome} /> }));

import { EditorTreino } from "./EditorTreino";
import { SemanaDoAluno } from "./SemanaDoAluno";
import { SeriesETroca } from "./Secoes";
import { filaDoEditor } from "./useEditorTreino";
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

const novoCliente = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const montar = (ui: React.ReactNode, cliente: QueryClient = novoCliente()) =>
  render(
    <MemoryRouter useTransitions={false}>
      <QueryClientProvider client={cliente}>
        <ProvedorConfirmar>{ui}</ProvedorConfirmar>
      </QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.carregarEditor.mockResolvedValue(dados());
  h.salvarPrescricao.mockResolvedValue({ ok: true });
  h.salvarObservacao.mockResolvedValue({ ok: true, observacao: "x" });
  h.salvarConfig.mockResolvedValue({ ok: true, config: {} });
  h.salvarDia.mockResolvedValue({ ok: true });
  h.salvarAlternado.mockResolvedValue({ ok: true });
  h.salvarExtras.mockResolvedValue({ ok: true });
  h.carregarSemanaAtual.mockResolvedValue({ overrides: [], concluidos: [] });
  h.carregarVolume.mockResolvedValue([]);
  h.carregarModelos.mockResolvedValue({ modelos: [], total: 0 });
  h.exerciciosDaLista.mockResolvedValue({ itens: [], total: 0, totalGlobal: 0, totalMeu: 0, totalProfessores: 0, comGif: 0, totalEscopo: 0, semClassificacao: 0 });
});

describe("W15 — editor do treino (tela 8, lado esquerdo)", () => {
  it("abas A/B/C, chips (exercícios, séries, duração — W-A P4: sem o cadeado, que foi para a aba Acessos) e os 4 campos de cada exercício", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    expect(await screen.findByText("A · Peito e tríceps")).toBeInTheDocument();
    expect(screen.getByText("B · Costas")).toBeInTheDocument();
    expect(screen.getByText("C · Pernas")).toBeInTheDocument();
    expect(screen.getByText("5 EXERCÍCIOS")).toBeInTheDocument();
    expect(screen.getByText("16 SÉRIES")).toBeInTheDocument();
    expect(screen.queryByText("ALUNO NÃO MUDA AS SÉRIES")).toBeNull();
    expect(document.querySelector("[data-chip-cadeado]")).toBeNull();
    expect(screen.getByText(/DESCANSO PADRÃO 60 S/)).toBeInTheDocument();
    expect(screen.getByText(/TREINO ALTERNADO: NÃO/)).toBeInTheDocument();
    expect(screen.getByText("Adicionar exercício da biblioteca (81 com GIF)")).toBeInTheDocument();
    const supino = document.querySelector('[data-exercicio-nome="Supino Reto com Barra"]') as HTMLElement;
    expect((within(supino).getByLabelText(/séries de Supino Reto/) as HTMLInputElement).value).toBe("4");
    expect((within(supino).getByLabelText(/reps de Supino Reto/) as HTMLInputElement).value).toBe("10");
    expect((within(supino).getByLabelText(/descanso de Supino Reto/) as HTMLInputElement).value).toBe("60 s");
    expect((within(supino).getByLabelText(/carga de Supino Reto/) as HTMLInputElement).value).toBe("60 kg");
  });

  it("hml-18a: tirar o exercício pede a confirmação do app — Cancelar não tira; Tirar tira", async () => {
    h.removerExercicio.mockResolvedValue({ ok: true });
    montar(<EditorTreino treinoUserId="t1" nomeAluno="Rafael" />);
    fireEvent.click(await screen.findByRole("button", { name: "Tirar Supino Reto com Barra do treino" }));
    let dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent('Tirar "Supino Reto com Barra" do treino A · Peito e tríceps de Rafael?');
    expect(dialogo.querySelector("[data-confirmar-ok]")).toHaveTextContent("Tirar");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.removerExercicio).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tirar Supino Reto com Barra do treino" }));
    dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.removerExercicio).toHaveBeenCalledTimes(1));
    expect(h.removerExercicio.mock.calls[0][0]).toBe("t1");
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

  it("a observação grava na hora (W-A P4: o cadeado das séries saiu do editor — nenhum caminho daqui grava series_travadas)", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    expect(screen.queryByText(/AS SÉRIES$/)).toBeNull();
    const obs = document.querySelector("[data-treino-observacao-campo]") as HTMLTextAreaElement;
    fireEvent.focus(obs);
    fireEvent.change(obs, { target: { value: "Desça a barra em 3 segundos." } });
    fireEvent.blur(obs);
    await waitFor(() => expect(h.salvarObservacao).toHaveBeenCalledWith("t1", { grupo_id: "gA" }, "Desça a barra em 3 segundos."));
    expect(h.salvarConfig).not.toHaveBeenCalled();
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

/** Uma resposta do servidor que fica esperando até o teste soltar (ok) ou falhar. */
function adiada<T = unknown>() {
  let soltar!: (v: T) => void;
  let falhar!: (e: unknown) => void;
  const promessa = new Promise<T>((ok, erro) => {
    soltar = ok;
    falhar = erro;
  });
  return { promessa, soltar, falhar };
}

const digitarCampo = (rotulo: RegExp, valor: string) => {
  const campo = screen.getByLabelText(rotulo) as HTMLInputElement;
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo);
  return campo;
};

const fechar = () => {
  const ev = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(ev);
  return ev.defaultPrevented;
};

describe("hml-24 (H-127) — a fila por linha no editor", () => {
  it("2 campos seguidos com o 1º em voo → 1 pedido por vez; o 2º leva os 2 campos; o navegador pergunta antes de fechar a aba", async () => {
    const primeiro = adiada();
    h.salvarPrescricao.mockReturnValueOnce(primeiro.promessa).mockResolvedValue({ ok: true });
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    digitarCampo(/reps de Supino Inclinado/, "10");
    const carga = digitarCampo(/carga de Supino Inclinado/, "30");
    expect(h.salvarPrescricao).toHaveBeenCalledTimes(1);
    expect(h.salvarPrescricao.mock.calls[0][3]).toEqual({ series: 3, reps: "10", descanso: null, carga: null });
    // a tela já mostra os 2 (o otimista) e, com gravação pendente, fechar a aba pede a confirmação do navegador
    await waitFor(() => expect((screen.getByLabelText(/reps de Supino Inclinado/) as HTMLInputElement).value).toBe("10"));
    expect(carga.value).toBe("30 kg");
    expect(filaDoEditor.algoPendente()).toBe(true);
    expect(fechar()).toBe(true);
    await act(async () => primeiro.soltar({ ok: true }));
    await waitFor(() => expect(h.salvarPrescricao).toHaveBeenCalledTimes(2));
    expect(h.salvarPrescricao.mock.calls[1][3]).toEqual({ series: 3, reps: "10", descanso: null, carga: 30 });
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
    expect(fechar()).toBe(false);
    expect(h.toastErro).not.toHaveBeenCalled();
  });

  it("linhas diferentes gravam em paralelo (um pedido de cada, sem esperar o outro)", async () => {
    const a = adiada();
    h.salvarPrescricao.mockReturnValueOnce(a.promessa).mockResolvedValue({ ok: true });
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    digitarCampo(/reps de Supino Inclinado/, "10");
    digitarCampo(/reps de Crucifixo com Halteres/, "15");
    expect(h.salvarPrescricao).toHaveBeenCalledTimes(2);
    expect(h.salvarPrescricao.mock.calls.map((c) => c[2].exercicio_id)).toEqual(["e2", "e3"]);
    await act(async () => a.soltar({ ok: true }));
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("erro → o campo volta ao salvo e o aviso traz 'Tentar de novo' (nada reenvia sozinho); o botão reenvia o que a linha queria", async () => {
    h.salvarPrescricao.mockRejectedValueOnce(new Error("internal")).mockResolvedValue({ ok: true });
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    const reps = digitarCampo(/reps de Supino Reto/, "12");
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    const [texto, opcoes] = h.toastErro.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(texto).toBe("Não deu para salvar agora. Tente de novo.");
    expect(opcoes.action.label).toBe("Tentar de novo");
    await waitFor(() => expect(reps.value).toBe("10"));
    expect(h.salvarPrescricao).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.carregarEditor).toHaveBeenCalledTimes(2)); // a releitura do servidor
    act(() => opcoes.action.onClick());
    await waitFor(() => expect(h.salvarPrescricao).toHaveBeenCalledTimes(2));
    expect(h.salvarPrescricao.mock.calls[1][3]).toEqual({ series: 4, reps: "12", descanso: 60, carga: 60 });
    await waitFor(() => expect(reps.value).toBe("12"));
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("o erro de uma linha não apaga o que outra ainda grava (a releitura mostra a pendente por cima)", async () => {
    const outra = adiada();
    // a releitura do servidor traz um marcador (a observação) para o teste saber que ela chegou à tela
    const doServidor = { grupo_id: "gA", grupo_usuario_id: null, exercicio_id: null, exercicio_usuario_id: null, num_series: 3, observacao: "Lida de novo do servidor." };
    h.carregarEditor.mockResolvedValueOnce(dados()).mockImplementation(async () => dados({ seriesPadrao: [...dados().seriesPadrao, doServidor] }));
    h.salvarPrescricao.mockImplementation((_u: string, _a: unknown, ex: { exercicio_id: string }) =>
      ex.exercicio_id === "e1" ? Promise.reject(new Error("internal")) : outra.promessa);
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    const pendente = digitarCampo(/reps de Crucifixo com Halteres/, "15");
    digitarCampo(/reps de Supino Reto/, "12");
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    // a releitura chegou à tela (o marcador do servidor aparece); o servidor ainda não tem o 15 — veio sem ele —, mas a tela segue
    // com o que a linha pendente quer; a linha que falhou voltou ao salvo
    await waitFor(() => expect((document.querySelector("[data-treino-observacao-campo]") as HTMLTextAreaElement).value).toBe("Lida de novo do servidor."));
    expect(pendente.value).toBe("15");
    expect((screen.getByLabelText(/reps de Supino Reto/) as HTMLInputElement).value).toBe("10");
    await act(async () => outra.soltar({ ok: true }));
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
    expect((screen.getByLabelText(/reps de Crucifixo com Halteres/) as HTMLInputElement).value).toBe("15");
  });

  it("a folha Editar espera a gravação (Salvando…) e fecha no ok", async () => {
    const g = adiada();
    h.salvarPrescricao.mockReturnValueOnce(g.promessa);
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    fireEvent.click(screen.getByRole("button", { name: "Editar Crucifixo com Halteres" }));
    await waitFor(() => expect(document.body.querySelector("[data-folha-editar]")).not.toBeNull());
    fireEvent.change(document.body.querySelector('[data-editar-campo="reps"]')!, { target: { value: "15" } });
    fireEvent.click(document.body.querySelector("[data-editar-salvar]")!);
    await waitFor(() => expect(h.salvarPrescricao).toHaveBeenCalledTimes(1));
    expect(h.salvarPrescricao.mock.calls[0][3]).toEqual({ series: 3, reps: "15", descanso: null, carga: null });
    expect(document.body.querySelector("[data-editar-salvar]")?.getAttribute("data-salvando")).toBe("1");
    await act(async () => g.soltar({ ok: true }));
    await waitFor(() => expect(document.body.querySelector("[data-folha-editar]")).toBeNull());
  });

  it("a folha Editar no erro fica aberta (o aviso com 'Tentar de novo')", async () => {
    h.salvarPrescricao.mockRejectedValueOnce(new Error("internal"));
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    fireEvent.click(screen.getByRole("button", { name: "Editar Crucifixo com Halteres" }));
    await waitFor(() => expect(document.body.querySelector("[data-folha-editar]")).not.toBeNull());
    fireEvent.click(document.body.querySelector("[data-editar-salvar]")!);
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    await waitFor(() => expect(document.body.querySelector("[data-editar-salvar]")?.getAttribute("data-salvando")).toBe("0"));
    expect(document.body.querySelector("[data-folha-editar]")).not.toBeNull();
    expect((h.toastErro.mock.calls[0][1] as { action: { label: string } }).action.label).toBe("Tentar de novo");
  });

  it("a observação vai pela fila: 2 seguidas com a 1ª em voo → 2 pedidos, um depois do outro, o 2º com o último texto", async () => {
    const primeira = adiada();
    h.salvarObservacao.mockReturnValueOnce(primeira.promessa).mockResolvedValue({ ok: true, observacao: "x" });
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    const obs = document.querySelector("[data-treino-observacao-campo]") as HTMLTextAreaElement;
    for (const texto of ["Primeira.", "Segunda."]) {
      fireEvent.focus(obs);
      fireEvent.change(obs, { target: { value: texto } });
      fireEvent.blur(obs);
    }
    expect(h.salvarObservacao).toHaveBeenCalledTimes(1);
    expect(h.salvarObservacao).toHaveBeenLastCalledWith("t1", { grupo_id: "gA" }, "Primeira.");
    await act(async () => primeira.soltar({ ok: true, observacao: "Primeira." }));
    await waitFor(() => expect(h.salvarObservacao).toHaveBeenCalledTimes(2));
    expect(h.salvarObservacao).toHaveBeenLastCalledWith("t1", { grupo_id: "gA" }, "Segunda.");
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("tirar o exercício descarta a fila dele: o que ainda ia gravar nele não vai", async () => {
    const primeiro = adiada();
    h.salvarPrescricao.mockReturnValueOnce(primeiro.promessa).mockResolvedValue({ ok: true });
    h.removerExercicio.mockResolvedValue({ ok: true });
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    digitarCampo(/reps de Tríceps Pulley/, "12");
    digitarCampo(/carga de Tríceps Pulley/, "25");
    expect(h.salvarPrescricao).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Tirar Tríceps Pulley do treino" }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.removerExercicio).toHaveBeenCalledTimes(1));
    expect(filaDoEditor.algoPendente()).toBe(false);
    await act(async () => primeiro.soltar({ ok: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(h.salvarPrescricao).toHaveBeenCalledTimes(1);
  });
});

describe("revisão hml-24 — a releitura no meio da gravação e o cancelamento do rodar", () => {
  it("🟡1: a releitura que leu o banco ANTES de a linha confirmar não apaga o confirmado; a próxima mudança da linha leva o confirmado", async () => {
    const gravacaoX = adiada();
    const releitura = adiada<DadosEditor>();
    // o banco depois da gravação de X (Supino Inclinado, reps 12) — o que uma leitura nova traz
    const comX = () =>
      dados({ seriesPadrao: [...dados().seriesPadrao, { grupo_id: "gA", grupo_usuario_id: null, exercicio_id: "e2", exercicio_usuario_id: null, num_series: 3, reps_alvo: "12", descanso_segundos: null, carga_sugerida_kg: null }] });
    h.carregarEditor.mockResolvedValueOnce(dados()).mockReturnValueOnce(releitura.promessa).mockImplementation(async () => comX());
    let chamadasX = 0;
    h.salvarPrescricao.mockImplementation((_u: string, _a: unknown, ex: { exercicio_id: string }) => {
      if (ex.exercicio_id === "e1") return Promise.reject(new Error("internal"));
      chamadasX++;
      return chamadasX === 1 ? gravacaoX.promessa : Promise.resolve({ ok: true });
    });
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    const reps = digitarCampo(/reps de Supino Inclinado/, "12"); // a linha X grava (fica no ar)
    digitarCampo(/reps de Supino Reto/, "15"); // outra linha falha → a releitura sai e fica no ar, lendo o banco de ANTES de X
    await waitFor(() => expect(h.carregarEditor).toHaveBeenCalledTimes(2));
    await act(async () => gravacaoX.soltar({ ok: true })); // X confirma no meio da releitura
    await act(async () => releitura.soltar(dados())); // a releitura chega com o valor VELHO de X
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(reps.value).toBe("12");
    // outro campo da mesma linha: o pedido leva o confirmado (nunca o velho de volta)
    digitarCampo(/carga de Supino Inclinado/, "30");
    await waitFor(() => expect(chamadasX).toBe(2));
    expect(h.salvarPrescricao.mock.calls.at(-1)?.[3]).toEqual({ series: 3, reps: "12", descanso: null, carga: 30 });
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("⚪3: um botão sem otimista com uma leitura em voo (o retrato trocado no meio) não deixa o editor em 'Não deu para abrir o treino'", async () => {
    const cliente = novoCliente();
    const leitura = adiada<DadosEditor>();
    const tirar = adiada();
    h.carregarEditor.mockResolvedValueOnce(dados()).mockReturnValueOnce(leitura.promessa).mockImplementation(async () => dados());
    h.removerExercicio.mockReturnValue(tirar.promessa);
    montar(<EditorTreino treinoUserId="t1" />, cliente);
    await screen.findByText("A · Peito e tríceps");
    // uma releitura em voo e um setQueryData no meio dela (o que o aoOk da fila faz): o "voltar" da leitura some
    await act(async () => {
      void cliente.invalidateQueries({ queryKey: ["treino-editor", "t1"] });
    });
    await waitFor(() => expect(h.carregarEditor).toHaveBeenCalledTimes(2));
    act(() => {
      cliente.setQueryData<DadosEditor>(["treino-editor", "t1"], (d) => (d ? { ...d } : d));
    });
    // tirar um exercício (o rodar SEM otimista) cancela a leitura e espera o servidor
    fireEvent.click(screen.getByRole("button", { name: "Tirar Supino Inclinado do treino" }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.removerExercicio).toHaveBeenCalledTimes(1));
    // o pedido do servidor ainda no ar: a tela já renderizou o que o cancelamento deixou
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(screen.queryByText("Não deu para abrir o treino")).toBeNull();
    expect(document.querySelector("[data-editor-treino]")).not.toBeNull();
    await act(async () => tirar.soltar({ ok: true }));
    await act(async () => leitura.soltar(dados()));
    await waitFor(() => expect(screen.queryByText("Não deu para abrir o treino")).toBeNull());
  });
});

describe("ampliação da hml-24 — a semana do aluno pela fila por chave (o estado inteiro de cada dia)", () => {
  const sexta = () => document.querySelector('[data-semana-dia="SEX"]') as HTMLElement;
  const marcado = (dia: string, chave: string) =>
    (document.querySelector(`[data-semana-dia="${dia}"] [data-semana-treino="${chave}"]`) as HTMLElement | null)?.getAttribute("aria-pressed");

  /** Um servidor que aplica cada pedido quando responde — e responde do mais NOVO para o mais velho (fora de ordem). */
  function servidorDaSemana() {
    const banco: Record<string, string[]> = { SEX: ["gB"] };
    const pedidos: { feito: boolean; soltar: () => void }[] = [];
    h.salvarDia.mockImplementation(
      (_u: string, dia: string, grupos: { grupo_id?: string }[]) =>
        new Promise((ok) => {
          const p = { feito: false, soltar: () => {} };
          p.soltar = () => {
            p.feito = true;
            banco[dia] = grupos.map((g) => g.grupo_id ?? "");
            ok({ ok: true });
          };
          pedidos.push(p);
        }),
    );
    const responderForaDeOrdem = async () => {
      for (let volta = 0; volta < 10; volta++) {
        const abertos = pedidos.filter((x) => !x.feito).reverse();
        if (!abertos.length) return;
        for (const x of abertos) await act(async () => x.soltar());
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      }
    };
    return { banco, responderForaDeOrdem };
  }

  it("2 cliques no mesmo dia com o 1º no ar → 1 pedido por vez; o 2º leva a lista final; a resposta do 1º não desfaz a tela nem o banco", async () => {
    const s = servidorDaSemana();
    montar(<SemanaDoAluno treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(sexta()).not.toBeNull());
    // sexta: tira o B e põe o C (o caso "semana" do e2e/w15/telas.py)
    fireEvent.click(sexta().querySelector('[data-semana-treino="catalogo:gB"]')!);
    fireEvent.click(sexta().querySelector('[data-semana-treino="catalogo:gC"]')!);
    // um tique: o que tivesse de sair ao mesmo tempo (o rodar de antes chamava a API depois de um await) já teria saído
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.salvarDia).toHaveBeenCalledTimes(1);
    expect(h.salvarDia.mock.calls[0][1]).toBe("SEX");
    expect(h.salvarDia.mock.calls[0][2]).toEqual([]);
    expect(marcado("SEX", "catalogo:gC")).toBe("true");
    expect(marcado("SEX", "catalogo:gB")).toBe("false");
    await s.responderForaDeOrdem();
    expect(h.salvarDia).toHaveBeenCalledTimes(2);
    expect(h.salvarDia.mock.calls[1][2]).toEqual([{ grupo_id: "gC" }]);
    expect(s.banco.SEX).toEqual(["gC"]);
    expect(marcado("SEX", "catalogo:gC")).toBe("true");
    expect(marcado("SEX", "catalogo:gB")).toBe("false");
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("o erro de um dia → o dia volta ao salvo e o aviso traz 'Tentar de novo' (nada reenvia sozinho); o botão reenvia a lista", async () => {
    h.salvarDia.mockRejectedValueOnce(new Error("internal")).mockResolvedValue({ ok: true });
    montar(<SemanaDoAluno treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(sexta()).not.toBeNull());
    fireEvent.click(sexta().querySelector('[data-semana-treino="catalogo:gB"]')!);
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    const [texto, opcoes] = h.toastErro.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(texto).toBe("Não deu para salvar agora. Tente de novo.");
    expect(opcoes.action.label).toBe("Tentar de novo");
    await waitFor(() => expect(marcado("SEX", "catalogo:gB")).toBe("true"));
    expect(h.salvarDia).toHaveBeenCalledTimes(1);
    act(() => opcoes.action.onClick());
    await waitFor(() => expect(h.salvarDia).toHaveBeenCalledTimes(2));
    expect(h.salvarDia.mock.calls[1][2]).toEqual([]);
    await waitFor(() => expect(marcado("SEX", "catalogo:gB")).toBe("false"));
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("o alternado: liga e desliga seguidos → 1 pedido por vez, o 2º leva o desligado (e nenhum extra)", async () => {
    const primeiro = adiada();
    h.salvarAlternado.mockReturnValueOnce(primeiro.promessa).mockResolvedValue({ ok: true });
    const segAeC = [...dados().semana.filter((r) => r.dia_semana !== "SEG"), { dia_semana: "SEG", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
      { dia_semana: "SEG", slot_idx: 1, grupo_id: "gC", grupo_usuario_id: null, extra: false }];
    h.carregarEditor.mockResolvedValue(dados({ semana: segAeC }));
    montar(<SemanaDoAluno treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(document.querySelector('[data-semana-alternar="SEG"]')).not.toBeNull());
    const botao = document.querySelector('[data-semana-alternar="SEG"]') as HTMLButtonElement;
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    await waitFor(() => expect(botao.getAttribute("aria-pressed")).toBe("true"));
    fireEvent.click(botao);
    // um tique: o que tivesse de sair ao mesmo tempo (o rodar de antes chamava a API depois de um await) já teria saído
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.salvarAlternado).toHaveBeenCalledTimes(1);
    expect(h.salvarAlternado.mock.calls[0].slice(1, 3)).toEqual(["SEG", true]);
    await act(async () => primeiro.soltar({ ok: true }));
    await waitFor(() => expect(h.salvarAlternado).toHaveBeenCalledTimes(2));
    expect(h.salvarAlternado.mock.calls[1].slice(1, 3)).toEqual(["SEG", false]);
    expect(h.salvarExtras).not.toHaveBeenCalled();
    await waitFor(() => expect(botao.getAttribute("aria-pressed")).toBe("false"));
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("o extra e o alternado do MESMO dia andam na mesma fila: desligar com o extra no ar espera, e o extra não volta depois", async () => {
    const extra = adiada();
    h.salvarExtras.mockReturnValueOnce(extra.promessa).mockResolvedValue({ ok: true });
    const segAeC = [...dados().semana.filter((r) => r.dia_semana !== "SEG"), { dia_semana: "SEG", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
      { dia_semana: "SEG", slot_idx: 1, grupo_id: "gC", grupo_usuario_id: null, extra: false }];
    h.carregarEditor.mockResolvedValue(dados({ semana: segAeC, diasConfig: [{ dia_semana: "SEG", alternado: true, alternado_inicio: "2026-10-12" }] }));
    montar(<SemanaDoAluno treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(document.querySelector('[data-extra-novo="SEG"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-extra-novo="SEG"]')!);
    fireEvent.change(document.querySelector("[data-extra-treino]")!, { target: { value: "catalogo:gB" } });
    fireEvent.click(document.querySelector("[data-extra-salvar]")!);
    // um tique: o que tivesse de sair ao mesmo tempo (o rodar de antes chamava a API depois de um await) já teria saído
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.salvarExtras).toHaveBeenCalledTimes(1);
    expect(h.salvarExtras.mock.calls[0][2]).toEqual([{ grupo_id: "gB" }]);
    // desliga o alternado com o extra ainda no ar: espera a vez (nunca os 2 do mesmo dia no ar)
    fireEvent.click(document.querySelector('[data-semana-alternar="SEG"]')!);
    // um tique: o que tivesse de sair ao mesmo tempo (o rodar de antes chamava a API depois de um await) já teria saído
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(h.salvarAlternado).not.toHaveBeenCalled();
    await act(async () => extra.soltar({ ok: true }));
    await waitFor(() => expect(h.salvarAlternado).toHaveBeenCalledTimes(1));
    expect(h.salvarAlternado.mock.calls[0].slice(1, 3)).toEqual(["SEG", false]);
    expect(h.salvarExtras).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector('[data-semana-extra]')).toBeNull());
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });
});

describe("ampliação 2 da hml-24 — desligar e religar o alternado rápido, e a config do aluno pela fila (campo a campo)", () => {
  const tique = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

  it("⚪C desligar e religar o alternado rápido: 2 pedidos, um por vez; religado e SEM o extra (o banco já não o tem)", async () => {
    const desligar = adiada();
    h.salvarAlternado.mockReturnValueOnce(desligar.promessa).mockResolvedValue({ ok: true });
    const segAeCcomExtra = [...dados().semana.filter((r) => r.dia_semana !== "SEG"),
      { dia_semana: "SEG", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
      { dia_semana: "SEG", slot_idx: 1, grupo_id: "gC", grupo_usuario_id: null, extra: false },
      { dia_semana: "SEG", slot_idx: 100, grupo_id: "gB", grupo_usuario_id: null, extra: true, extra_atrelado_grupo_id: null, extra_atrelado_grupo_usuario_id: null }];
    h.carregarEditor.mockResolvedValue(dados({ semana: segAeCcomExtra, diasConfig: [{ dia_semana: "SEG", alternado: true, alternado_inicio: "2026-10-12" }] }));
    montar(<SemanaDoAluno treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(document.querySelector("[data-semana-extra]")).not.toBeNull());
    const botao = document.querySelector('[data-semana-alternar="SEG"]') as HTMLButtonElement;
    fireEvent.click(botao); // desliga (o pedido fica no ar)
    await tique();
    await waitFor(() => expect(botao.getAttribute("aria-pressed")).toBe("false"));
    fireEvent.click(botao); // religa com o desligar ainda no ar
    await tique();
    expect(h.salvarAlternado).toHaveBeenCalledTimes(1);
    await act(async () => desligar.soltar({ ok: true }));
    await waitFor(() => expect(h.salvarAlternado).toHaveBeenCalledTimes(2));
    expect(h.salvarAlternado.mock.calls.map((c) => c[2])).toEqual([false, true]);
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-semana-extra]")).toBeNull();
    expect(h.salvarExtras).not.toHaveBeenCalled();
  });

  /** Um servidor da config que aplica cada pedido quando responde — e responde do mais NOVO para o mais velho (fora de ordem). */
  function servidorDaConfig(inicial: Record<string, unknown>) {
    const banco: Record<string, unknown> = { ...inicial };
    const pedidos: { feito: boolean; soltar: () => void }[] = [];
    h.salvarConfig.mockImplementation(
      (_u: string, campos: Record<string, unknown>) =>
        new Promise((ok) => {
          const p = { feito: false, soltar: () => {} };
          p.soltar = () => {
            p.feito = true;
            Object.assign(banco, campos);
            ok({ ok: true, config: { ...banco } });
          };
          pedidos.push(p);
        }),
    );
    const responderForaDeOrdem = async () => {
      for (let volta = 0; volta < 10; volta++) {
        const abertos = pedidos.filter((x) => !x.feito).reverse();
        if (!abertos.length) return;
        for (const x of abertos) await act(async () => x.soltar());
        await tique();
      }
    };
    return { banco, responderForaDeOrdem };
  }

  it("🟡A o modo das séries: 2 toques com o 1º no ar → 1 pedido por vez; o 2º leva o valor final; a resposta velha não desfaz a tela nem o banco", async () => {
    const s = servidorDaConfig({ series_modo: "personalizada" });
    montar(<SeriesETroca treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Padrão para todos" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("radio", { name: "Padrão para todos" }));
    await tique();
    fireEvent.click(screen.getByRole("radio", { name: "Por exercício" }));
    await tique();
    expect(h.salvarConfig).toHaveBeenCalledTimes(1);
    expect(h.salvarConfig.mock.calls[0][1]).toEqual({ series_modo: "padrao" });
    expect(screen.getByRole("radio", { name: "Por exercício" }).getAttribute("aria-checked")).toBe("true");
    await s.responderForaDeOrdem();
    expect(h.salvarConfig).toHaveBeenCalledTimes(2);
    expect(h.salvarConfig.mock.calls[1][1]).toEqual({ series_modo: "personalizada" });
    expect(s.banco.series_modo).toBe("personalizada");
    expect(screen.getByRole("radio", { name: "Por exercício" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("🟡A junta por campo: com o modo no ar, 2 datas da troca seguidas viram 1 pedido só com a data final (o modo não vai de novo)", async () => {
    const s = servidorDaConfig({ series_modo: "personalizada", proxima_troca_treino: null });
    montar(<SeriesETroca treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(document.querySelector("[data-troca-data]")).not.toBeNull());
    fireEvent.click(screen.getByRole("radio", { name: "Padrão para todos" }));
    await tique();
    fireEvent.change(document.querySelector("[data-troca-data]")!, { target: { value: "2026-10-19" } });
    await tique();
    fireEvent.change(document.querySelector("[data-troca-data]")!, { target: { value: "2026-10-26" } });
    await tique();
    expect(h.salvarConfig).toHaveBeenCalledTimes(1);
    await s.responderForaDeOrdem();
    expect(h.salvarConfig.mock.calls.map((c) => c[1])).toEqual([{ series_modo: "padrao" }, { proxima_troca_treino: "2026-10-26" }]);
    expect(s.banco).toEqual({ series_modo: "padrao", proxima_troca_treino: "2026-10-26" });
    expect((document.querySelector("[data-troca-data]") as HTMLInputElement).value).toBe("2026-10-26");
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("🟡A o erro da config → só o campo volta ao salvo e o aviso traz 'Tentar de novo'; o botão reenvia o campo", async () => {
    h.salvarConfig.mockRejectedValueOnce(new Error("internal")).mockResolvedValue({ ok: true, config: {} });
    montar(<SeriesETroca treinoUserId="t1" somenteLeitura={false} />);
    await waitFor(() => expect(document.querySelector("[data-troca-data]")).not.toBeNull());
    const data = document.querySelector("[data-troca-data]") as HTMLInputElement;
    fireEvent.change(data, { target: { value: "2026-10-19" } });
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    const [texto, opcoes] = h.toastErro.mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(texto).toBe("Não deu para salvar agora. Tente de novo.");
    expect(opcoes.action.label).toBe("Tentar de novo");
    await waitFor(() => expect(data.value).toBe(""));
    expect(screen.getByRole("radio", { name: "Por exercício" }).getAttribute("aria-checked")).toBe("true");
    act(() => opcoes.action.onClick());
    await waitFor(() => expect(h.salvarConfig).toHaveBeenCalledTimes(2));
    expect(h.salvarConfig.mock.calls[1][1]).toEqual({ proxima_troca_treino: "2026-10-19" });
    await waitFor(() => expect(data.value).toBe("2026-10-19"));
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
  });

  it("🟡A o descanso padrão pela folha vai pela fila (só o campo dele) e a folha fecha no ok", async () => {
    montar(<EditorTreino treinoUserId="t1" />);
    await screen.findByText("A · Peito e tríceps");
    fireEvent.click(document.querySelector("[data-chip-descanso]")!);
    await waitFor(() => expect(document.body.querySelector('[data-descanso-atalho="90"]')).not.toBeNull());
    fireEvent.click(document.body.querySelector('[data-descanso-atalho="90"]')!);
    fireEvent.click(document.body.querySelector("[data-descanso-salvar]")!);
    await waitFor(() => expect(h.salvarConfig).toHaveBeenCalledTimes(1));
    expect(h.salvarConfig.mock.calls[0][1]).toEqual({ tempo_descanso_segundos: 90 });
    await waitFor(() => expect(document.body.querySelector("[data-descanso-salvar]")).toBeNull());
    await waitFor(() => expect(screen.getByText(/DESCANSO PADRÃO 90 S/)).toBeInTheDocument());
    await waitFor(() => expect(filaDoEditor.algoPendente()).toBe(false));
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

  it("hml-24 (H-131): o 'N DE M' só aparece com a semana carregada (carregando → sem chip, nunca o 0 DE 5; chegou → 3 DE 5)", async () => {
    const dias = datasDaSemana(new Date()).map(chaveData);
    const semana = adiada<{ overrides: never[]; concluidos: { data_treino: string; slot_idx: number }[] }>();
    h.estado.mockReturnValue({ tipo: "ok", treinoUserId: "t1", somenteLeitura: false, perfil: perfil() });
    h.carregarSemanaAtual.mockReturnValue(semana.promessa);
    montar(<CardTreino alunoId="p1" />);
    expect(await screen.findByText("A · Peito e tríceps")).toBeInTheDocument();
    expect(document.querySelector("[data-card-treino-semana]")).toBeNull();
    expect(screen.queryByText(/DE 5 NA SEMANA/)).toBeNull();
    await act(async () => semana.soltar({ overrides: [], concluidos: [0, 1, 2].map((i) => ({ data_treino: dias[i], slot_idx: 0 })) }));
    expect(await screen.findByText("3 DE 5 NA SEMANA")).toBeInTheDocument();
    expect(document.querySelector("[data-card-treino-semana]")?.getAttribute("data-card-treino-semana")).toBe("3/5");
  });

  it("hml-24 (H-131): a semana com erro → sem o chip (o 0 DE M de mentira não aparece)", async () => {
    const cliente = novoCliente();
    h.estado.mockReturnValue({ tipo: "ok", treinoUserId: "t1", somenteLeitura: false, perfil: perfil() });
    h.carregarSemanaAtual.mockRejectedValue(new Error("statement timeout"));
    montar(<CardTreino alunoId="p1" />, cliente);
    expect(await screen.findByText("A · Peito e tríceps")).toBeInTheDocument();
    // revisão hml-24 (⚪4): o useSemanaAtual tenta 2 vezes (retry: 1, ~1 s entre elas) — espera o ERRO de verdade, não o "carregando"
    const chaveSemana = ["treino-semana-atual", "t1", chaveData(datasDaSemana(new Date())[0])];
    await waitFor(() => expect(h.carregarSemanaAtual).toHaveBeenCalledTimes(2), { timeout: 4000 });
    await waitFor(() => expect(cliente.getQueryState(chaveSemana)?.status).toBe("error"), { timeout: 4000 });
    expect(document.querySelector("[data-card-treino-semana]")).toBeNull();
    expect(screen.queryByText(/DE 5 NA SEMANA/)).toBeNull();
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
    // W-A P4: o login do aluno mora na aba Acessos
    expect(screen.getByText(/Crie o acesso na aba Acessos \(Login do aluno\)/)).toBeInTheDocument();
    expect(screen.getByText("Ir para Acessos").closest("a")?.getAttribute("href")).toBe("/painel/alunos/p1/acessos");
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
