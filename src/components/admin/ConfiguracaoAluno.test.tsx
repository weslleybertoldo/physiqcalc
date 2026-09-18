import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, toastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
  DB_SCHEMA: "public",
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import ConfiguracaoAluno, { clampDescanso, configDoPerfil, textoDescanso } from "./ConfiguracaoAluno";

const perfil = { tempo_descanso_segundos: 90, series_modo: "padrao", series_padrao_qtd: 4, series_travadas: false };

/** respostas padrão das edges; `perfilAtual` é o que admin-get-user/admin-update-user devolvem */
function mockEdges(perfilAtual: Record<string, unknown>, linhasSeries = 2) {
  invokeMock.mockImplementation(async (fn: string, opts?: { body?: Record<string, unknown> }) => {
    if (fn === "admin-get-user") return { data: { profile: perfilAtual }, error: null };
    if (fn === "admin-update-user") return { data: { profile: { ...perfilAtual, ...(opts?.body?.data as object) } }, error: null };
    if (fn === "admin-semana-treinos") {
      const action = opts?.body?.action;
      if (action === "getSeriesPadrao") return { data: { seriesPadrao: Array.from({ length: linhasSeries }, () => ({})) }, error: null };
      if (action === "limparSeriesAluno") return { data: { ok: true, removidas: linhasSeries }, error: null };
    }
    return { data: null, error: new Error(`edge inesperada ${fn}`) };
  });
}

const chamadas = (fn: string) => invokeMock.mock.calls.filter((c) => c[0] === fn).map((c) => c[1]?.body);

beforeEach(() => {
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe("configDoPerfil / textoDescanso / clampDescanso", () => {
  it("lê o perfil e cai nos padrões do app quando a coluna vem vazia", () => {
    expect(configDoPerfil(perfil)).toEqual({ tempo_descanso_segundos: 90, series_modo: "padrao", series_padrao_qtd: 4, series_travadas: false });
    expect(configDoPerfil({})).toEqual({ tempo_descanso_segundos: 120, series_modo: "padrao", series_padrao_qtd: 3, series_travadas: false });
    expect(configDoPerfil(null).series_travadas).toBe(false);
    expect(configDoPerfil({ series_travadas: true, series_modo: "personalizada", series_padrao_qtd: 12 }))
      .toEqual({ tempo_descanso_segundos: 120, series_modo: "personalizada", series_padrao_qtd: 10, series_travadas: true });
  });
  it("formata o descanso pra leitura", () => {
    expect(textoDescanso(45)).toBe("45 s");
    expect(textoDescanso(120)).toBe("2 min");
    expect(textoDescanso(90)).toBe("1 min 30 s");
  });
  it("limita o descanso entre 10 s e 10 min", () => {
    expect(clampDescanso(3)).toBe(10);
    expect(clampDescanso(5000)).toBe(600);
    expect(clampDescanso(Number.NaN)).toBe(120);
  });
});

describe("ConfiguracaoAluno", () => {
  it("mostra a configuração atual do aluno", async () => {
    mockEdges(perfil);
    render(<ConfiguracaoAluno userId="aluno1" />);
    await waitFor(() => expect(screen.getByText("Tempo de descanso")).toBeTruthy());
    expect(screen.getByText("1 min 30 s", { selector: "[data-config-descanso-atual]" })).toBeTruthy();
    expect(document.querySelector("[data-config-descanso-atalho='90']")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-config-series-qtd]")?.textContent).toBe("4");
    expect(document.querySelector("[data-config-modo='padrao']")?.getAttribute("data-ativo")).toBe("true");
    expect(document.querySelector("[data-config-cadeado]")?.getAttribute("data-travado")).toBe("false");
    expect(document.querySelector("[data-config-ajustes]")?.textContent).toContain("Zera 2 ajustes");
  });

  it("salva o descanso escolhido no atalho via admin-update-user", async () => {
    mockEdges(perfil);
    render(<ConfiguracaoAluno userId="aluno1" />);
    await waitFor(() => expect(screen.getByText("Tempo de descanso")).toBeTruthy());
    const salvar = document.querySelector("[data-config-descanso-salvar]") as HTMLButtonElement;
    expect(salvar.disabled).toBe(true); // sem mudança
    fireEvent.click(document.querySelector("[data-config-descanso-atalho='180']")!);
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await waitFor(() => expect(chamadas("admin-update-user")).toHaveLength(1));
    expect(chamadas("admin-update-user")[0]).toEqual({ userId: "aluno1", data: { tempo_descanso_segundos: 180 } });
    await waitFor(() => expect(document.querySelector("[data-config-descanso-atual]")?.textContent).toBe("3 min"));
    expect(toastMock.success).toHaveBeenCalled();
  });

  it("cadeado: travar grava series_travadas=true e troca o texto", async () => {
    mockEdges(perfil);
    render(<ConfiguracaoAluno userId="aluno1" />);
    await waitFor(() => expect(screen.getByText("Tempo de descanso")).toBeTruthy());
    fireEvent.click(document.querySelector("[data-config-cadeado]")!);
    await waitFor(() => expect(chamadas("admin-update-user")).toHaveLength(1));
    expect(chamadas("admin-update-user")[0]).toEqual({ userId: "aluno1", data: { series_travadas: true } });
    await waitFor(() => expect(document.querySelector("[data-config-cadeado]")?.getAttribute("data-travado")).toBe("true"));
    expect(document.querySelector("[data-config-cadeado-texto]")?.textContent).toContain("Travado");
  });

  it("Padrão N: grava modo+quantidade e apaga os ajustes por exercício (limparSeriesAluno)", async () => {
    mockEdges(perfil);
    render(<ConfiguracaoAluno userId="aluno1" />);
    await waitFor(() => expect(screen.getByText("Tempo de descanso")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Menos uma série")); // 4 → 3
    expect(document.querySelector("[data-config-series-qtd]")?.textContent).toBe("3");
    fireEvent.click(document.querySelector("[data-config-aplicar-padrao]")!);
    await waitFor(() => expect(chamadas("admin-semana-treinos").some((b) => b?.action === "limparSeriesAluno")).toBe(true));
    expect(chamadas("admin-update-user")[0]).toEqual({ userId: "aluno1", data: { series_modo: "padrao", series_padrao_qtd: 3 } });
    await waitFor(() => expect(document.querySelector("[data-config-ajustes]")?.textContent).toContain("Sem ajustes"));
    expect(toastMock.success).toHaveBeenCalledWith("3 séries em todos os exercícios do aluno.");
  });

  it("Personalizada: grava o modo e oferece ir pra aba Treino", async () => {
    mockEdges(perfil);
    const ir = vi.fn();
    render(<ConfiguracaoAluno userId="aluno1" onIrParaTreino={ir} />);
    await waitFor(() => expect(screen.getByText("Tempo de descanso")).toBeTruthy());
    fireEvent.click(document.querySelector("[data-config-escolher-personalizada]")!);
    await waitFor(() => expect(chamadas("admin-update-user")).toHaveLength(1));
    expect(chamadas("admin-update-user")[0]).toEqual({ userId: "aluno1", data: { series_modo: "personalizada" } });
    await waitFor(() => expect(document.querySelector("[data-config-ir-treino]")).toBeTruthy());
    fireEvent.click(document.querySelector("[data-config-ir-treino]")!);
    expect(ir).toHaveBeenCalled();
  });

  it("erro na edge de salvar → toast de erro e nada muda", async () => {
    mockEdges(perfil);
    render(<ConfiguracaoAluno userId="aluno1" />);
    await waitFor(() => expect(screen.getByText("Tempo de descanso")).toBeTruthy());
    invokeMock.mockImplementation(async () => ({ data: null, error: new Error("500") }));
    fireEvent.click(document.querySelector("[data-config-cadeado]")!);
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(document.querySelector("[data-config-cadeado]")?.getAttribute("data-travado")).toBe("false");
  });
});
