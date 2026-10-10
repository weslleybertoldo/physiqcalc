import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

// hml-17 (H-39): o volume semanal e o histórico do aluno no editor do treino (tela 7/8). Com a leitura falhando: o "feito" da
// semana dizia "feito 0" em cada grupo (como se o aluno não tivesse treinado) e o treino aberto do histórico dizia "Não achamos
// esse treino." — agora "feito —" + aviso com "Tentar de novo" e o estado de erro com "Tentar de novo".
const h = vi.hoisted(() => ({
  volume: { data: [] as unknown[], isLoading: false, error: null as unknown, refetch: vi.fn() },
  praticado: vi.fn(),
  mes: vi.fn(),
  det: vi.fn(),
  // hml-18a: o SeriesETroca (Aplicar a todos)
  dados: { data: null as unknown },
  aplicarPadrao: vi.fn(),
  configurar: vi.fn(),
}));
vi.mock("./api", async (orig) => ({
  ...(await orig<typeof import("./api")>()),
  carregarVolumePraticado: h.praticado,
  carregarHistoricoMes: h.mes,
  carregarTreinoDoHistorico: h.det,
}));
vi.mock("./useEditorTreino", async (orig) => ({
  ...(await orig<typeof import("./useEditorTreino")>()),
  useVolumeDoAluno: () => h.volume,
  useDadosEditor: () => h.dados,
  useAcoesEditor: () => ({ aplicarPadrao: h.aplicarPadrao, configurar: h.configurar }),
}));

import { HistoricoDoAluno, SeriesETroca, VolumeDoAluno } from "./Secoes";

const BLOCO_PEITO = { bloco: { key: "peito", nome: "Peito" }, total: 10, status: "ideal", landmark: null, detalhes: [] };
const ITEM = { chave: "c1", data: "2026-10-05", nomeTreino: "Treino A", duracaoSegundos: 3600, totalExercicios: 1, academia: null };

function montar(el: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ProvedorConfirmar>{el}</ProvedorConfirmar></QueryClientProvider>);
}

beforeEach(() => {
  h.volume = { data: [BLOCO_PEITO], isLoading: false, error: null, refetch: vi.fn() };
  h.praticado.mockReset();
  h.mes.mockReset().mockResolvedValue([ITEM]);
  h.det.mockReset();
});

describe("VolumeDoAluno › o feito na semana (hml-17, D5)", () => {
  it("a leitura do feito falha → \"feito —\" (nunca \"feito 0\") e o aviso com Tentar de novo; tocar refaz", async () => {
    h.praticado.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar(<VolumeDoAluno treinoUserId="t1" />);
    await waitFor(() => expect(document.querySelector("[data-volume-feito-erro]")).not.toBeNull());
    expect(document.querySelector('[data-volume-feito="peito"]')?.textContent).toBe("feito —");
    expect(screen.queryByText("feito 0")).toBeNull();
    expect(screen.getByText(/Não deu para carregar o feito nesta semana/)).toBeInTheDocument();
    h.praticado.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(document.querySelector("[data-volume-feito-erro]")).toBeNull());
    expect(document.querySelector('[data-volume-feito="peito"]')?.textContent).toBe("feito 0");
    expect(h.praticado).toHaveBeenCalledTimes(2);
  });

  it("controle: o feito veio (nada nesta semana) → \"feito 0\", sem aviso", async () => {
    h.praticado.mockResolvedValueOnce([]);
    montar(<VolumeDoAluno treinoUserId="t1" />);
    await waitFor(() => expect(h.praticado).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('[data-volume-feito="peito"]')?.textContent).toBe("feito 0"));
    expect(document.querySelector("[data-volume-feito-erro]")).toBeNull();
  });
});

describe("HistoricoDoAluno › o treino aberto (hml-17, D9)", () => {
  it("a leitura do treino falha → o erro com Tentar de novo (nunca \"Não achamos esse treino.\"); tocar refaz e mostra", async () => {
    h.det.mockRejectedValueOnce(new Error("Failed to fetch"));
    montar(<HistoricoDoAluno treinoUserId="t1" />);
    fireEvent.click(await screen.findByText("Treino A"));
    await waitFor(() => expect(document.querySelector("[data-historico-detalhe-erro]")).not.toBeNull());
    expect(screen.getByText("Não deu para abrir este treino")).toBeInTheDocument();
    expect(screen.queryByText("Não achamos esse treino.")).toBeNull();
    h.det.mockResolvedValueOnce({ nome_treino: "Treino A", iniciado_em: "", concluido_em: "", duracao_segundos: 3600, exercicios_concluidos: [{ nome: "Supino reto", series_concluidas: 3 }] });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Supino reto")).toBeInTheDocument();
    expect(document.querySelector("[data-historico-detalhe-erro]")).toBeNull();
  });

  it("controle: o treino não existe (resposta vazia) → \"Não achamos esse treino.\", sem o erro", async () => {
    h.det.mockResolvedValueOnce(null);
    montar(<HistoricoDoAluno treinoUserId="t1" />);
    fireEvent.click(await screen.findByText("Treino A"));
    expect(await screen.findByText("Não achamos esse treino.")).toBeInTheDocument();
    expect(document.querySelector("[data-historico-detalhe-erro]")).toBeNull();
  });
});

describe("SeriesETroca › Aplicar a todos (hml-18a: a confirmação do app, não a do navegador)", () => {
  it("Aplicar a todos pede a confirmação do app — Cancelar não aplica; Aplicar em todos aplica as 3 séries", async () => {
    h.dados = { data: { config: { series_modo: "padrao", series_padrao_qtd: 3, proxima_troca_treino: null } } };
    h.aplicarPadrao.mockReset().mockResolvedValue(undefined);
    montar(<SeriesETroca treinoUserId="t1" somenteLeitura={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar a todos" }));
    let dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("3 séries em TODOS os exercícios do aluno?");
    expect(dialogo.querySelector("[data-confirmar-ok]")).toHaveTextContent("Aplicar em todos");
    fireEvent.click(dialogo.querySelector("[data-confirmar-cancelar]")!);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.aplicarPadrao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a todos" }));
    dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(dialogo.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.aplicarPadrao).toHaveBeenCalledWith(3));
  });
});
