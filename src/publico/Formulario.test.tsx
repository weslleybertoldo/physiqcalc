import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: h.rpc } }));

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
  h.rpc.mockReset();
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
