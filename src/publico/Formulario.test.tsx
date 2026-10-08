import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  // hml-12 (H-30): os testes de sempre rodam como a produção — sem o consentimento de saúde. O Vitest roda como o staging
  // (vitest.config.ts) e a condição do Vite é lida quando a tela carrega: o schema troca ANTES dos imports.
  vi.stubEnv("VITE_DB_SCHEMA", "public");
  return { rpc: vi.fn(), importouConsentimento: 0 };
});
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: h.rpc } }));
// hml-12: conta quando a tela pede o consentimento (o import() que a produção corta)
vi.mock("@/publico/legal/aceite/ConsentimentoSaude", async (orig) => {
  h.importouConsentimento += 1;
  return orig<typeof import("@/publico/legal/aceite/ConsentimentoSaude")>();
});

import Formulario from "./Formulario";

const FORM = {
  id: "f1",
  titulo: "Pré-consulta da primeira avaliação",
  descricao: "Responda antes do nosso encontro.",
  perguntas: [
    { id: "p1", texto: "Treina hoje?", tipo: "sim_nao", max: 4, pontos_sim: 1, opcoes: [] },
    { id: "p2", texto: "Qual o seu objetivo?", tipo: "texto", max: 4, pontos_sim: 1, opcoes: [] },
  ],
  faixas: [],
  nutricionista: "Rafael Lima",
};

function montar(slug = "abcd2345") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/f/${slug}`]}>
        <Routes>
          <Route path="/f/:slug" element={<Formulario />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubEnv("VITE_DB_SCHEMA", "public");
  h.rpc.mockReset();
  h.importouConsentimento = 0;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

describe("W21 — /f/:slug (N-55): a pré-consulta pública, sem login", () => {
  it("mostra o formulário e quem mandou, valida, envia pela RPC e agradece", async () => {
    h.rpc.mockImplementation(async (nome: string) =>
      nome === "preconsulta_formulario" ? { data: FORM, error: null } : { data: { id: "r1", pontuacao: 1, faixa: "", nivel: "" }, error: null });
    montar("ABCD2345");
    expect(await screen.findByText("Pré-consulta da primeira avaliação")).toBeInTheDocument();
    expect(screen.getByText("Rafael Lima")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("preconsulta_formulario", { p_slug: "abcd2345" });
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText(/Escreva seu nome/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "  Ana   Lima " } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText(/Responda pelo menos 1 pergunta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
    fireEvent.change(screen.getByLabelText("Qual o seu objetivo?"), { target: { value: "Ganhar força" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText("Respostas enviadas")).toBeInTheDocument();
    const envio = h.rpc.mock.calls.find((c) => c[0] === "preconsulta_responder")!;
    expect(envio[1]).toEqual({ p_slug: "abcd2345", p_nome: "Ana   Lima", p_email: "", p_telefone: "", p_respostas: { p1: true, p2: "Ganhar força" } });
    expect(screen.queryByText("Seu resultado")).not.toBeInTheDocument(); // sem faixas, sem resultado
    // hml-12: estes testes rodam como a produção (o stub do topo) — sem o consentimento, a RPC de 5 argumentos
    expect(h.importouConsentimento).toBe(0);
  });

  it("questionário com faixas: o resultado aparece para quem respondeu", async () => {
    const faixas = [{ min: 0, max: 0, rotulo: "Baixa", nivel: "baixo" }, { min: 1, max: 1, rotulo: "Média", nivel: "moderado" }, { min: 2, max: 9, rotulo: "Alta", nivel: "alto" }];
    h.rpc.mockImplementation(async (nome: string) =>
      nome === "preconsulta_formulario" ? { data: { ...FORM, perguntas: [FORM.perguntas[0]], faixas }, error: null } : { data: { id: "r1", pontuacao: 1, faixa: "Média", nivel: "moderado" }, error: null });
    montar();
    await screen.findByText("Pré-consulta da primeira avaliação");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText("Seu resultado")).toBeInTheDocument();
    expect(document.querySelector("[data-resultado-publico]")?.getAttribute("data-resultado-publico")).toBe("1/1 pontos · Média");
    expect(document.querySelector("[data-resultado-texto]")?.textContent).toBe("1/1 pontos");
    expect(document.querySelector("[data-resultado-nivel]")?.textContent).toBe("MÉDIA");
  });

  it("inexistente, inativo ou excluído: a mensagem do Nutri; erro da RPC vira frase", async () => {
    h.rpc.mockResolvedValue({ data: null, error: null });
    const r = montar("naoexist");
    await waitFor(() => expect(screen.getByText("Formulário não encontrado ou desativado")).toBeInTheDocument());
    r.unmount();
    h.rpc.mockImplementation(async (nome: string) =>
      nome === "preconsulta_formulario" ? { data: FORM, error: null } : { data: null, error: { message: "muitas_respostas" } });
    montar();
    await screen.findByText("Pré-consulta da primeira avaliação");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Não" }));
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText(/muitas respostas na última hora/)).toBeInTheDocument();
  });
});

// hml-12 (H-30, H8): o consentimento das respostas de saúde, específico e em destaque, antes de "Enviar respostas" — SÓ no build de
// staging até a virada; com ele vai a RPC de 6 argumentos (o consentimento fica gravado na resposta). Cada teste importa a tela de
// novo com o schema do build (fica no FIM do arquivo: depois do resetModules, nenhum teste usa a tela do import de cima).
describe("/f/:slug — hml-12: o consentimento de saúde só no staging", () => {
  async function montarNoBuild(schema: "staging" | "public") {
    vi.stubEnv("VITE_DB_SCHEMA", schema);
    vi.resetModules();
    const Tela = (await import("./Formulario")).default;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/f/abcd2345"]}>
          <Routes>
            <Route path="/f/:slug" element={<Tela />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText("Pré-consulta da primeira avaliação");
  }
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  const respostaOk = () =>
    h.rpc.mockImplementation(async (nome: string) =>
      nome === "preconsulta_formulario" ? { data: FORM, error: null } : { data: { id: "r1", pontuacao: 1, faixa: "", nivel: "" }, error: null });
  const preencher = () => {
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana" } });
    fireEvent.click(screen.getByRole("button", { name: "Sim" }));
  };
  const consentimento = () => document.querySelector('[data-consentimento-saude="preconsulta"]');

  it("staging: a caixa antes do Enviar, com quem recebe; sem marcar → a frase e nada vai ao banco; marcado → 6 argumentos", async () => {
    respostaOk();
    await montarNoBuild("staging");
    await waitFor(() => expect(consentimento()).not.toBeNull(), { timeout: 5000 });
    expect(h.importouConsentimento).toBe(1);
    expect(consentimento()?.textContent).toContain("Elas vão só para Rafael Lima");
    const enviar = screen.getByRole("button", { name: /Enviar respostas/ });
    expect(consentimento()!.compareDocumentPosition(enviar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    preencher();
    fireEvent.click(enviar);
    expect(await screen.findByText("Para enviar, marque o consentimento.")).toBeInTheDocument();
    expect(h.rpc.mock.calls.some((c) => c[0] === "preconsulta_responder")).toBe(false);

    const { VERSAO_TEXTOS } = await import("@/publico/legal/versao");
    fireEvent.click(document.querySelector("[data-consentimento-saude-caixa]")!);
    expect(screen.queryByText("Para enviar, marque o consentimento.")).not.toBeInTheDocument();
    fireEvent.click(enviar);
    expect(await screen.findByText("Respostas enviadas")).toBeInTheDocument();
    const envio = h.rpc.mock.calls.find((c) => c[0] === "preconsulta_responder")!;
    expect(envio[1]).toEqual({ p_slug: "abcd2345", p_nome: "Ana", p_email: "", p_telefone: "", p_respostas: { p1: true }, p_consentimento: VERSAO_TEXTOS });
  });

  it("o banco recusa sem o consentimento da versão vigente (sem_consentimento) → recarregar e marcar", async () => {
    h.rpc.mockImplementation(async (nome: string) =>
      nome === "preconsulta_formulario" ? { data: FORM, error: null } : { data: null, error: { message: "sem_consentimento" } });
    await montarNoBuild("staging");
    await waitFor(() => expect(consentimento()).not.toBeNull(), { timeout: 5000 });
    preencher();
    fireEvent.click(document.querySelector("[data-consentimento-saude-caixa]")!);
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText("Recarregue a página e marque o consentimento para enviar.")).toBeInTheDocument();
  });

  it("produção: sem a caixa (o import nem acontece) e a RPC de 5 argumentos", async () => {
    respostaOk();
    await montarNoBuild("public");
    preencher();
    fireEvent.click(screen.getByRole("button", { name: /Enviar respostas/ }));
    expect(await screen.findByText("Respostas enviadas")).toBeInTheDocument();
    expect(consentimento()).toBeNull();
    expect(h.importouConsentimento).toBe(0);
    const envio = h.rpc.mock.calls.find((c) => c[0] === "preconsulta_responder")!;
    expect(envio[1]).not.toHaveProperty("p_consentimento");
  });
});
