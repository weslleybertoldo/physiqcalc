import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ principal: { functions: { invoke: h.invoke } } }));
vi.mock("@/nucleo/captcha", () => ({
  useCaptcha: () => ({ refCaixa: { current: null }, estado: "pronto", obterToken: async () => "tok-1", usado: () => {} }),
}));

import Cadastro from "./Cadastro";

function montar(codigo = "PROF-LUCAS-FERREIRA") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/c/${codigo}`]}>
        <Routes>
          <Route path="/c/:codigo" element={<Cadastro />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.invoke.mockReset();
});

describe("W13 — /c/:codigo (N-57): auto-cadastro que fica pendente", () => {
  it("mostra de quem é o link, manda o cadastro com o captcha e confirma", async () => {
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.acao === "cadastro_info"
        ? { data: { ok: true, profissional: "Lucas Ferreira", conta: "Consultoria Ferreira" }, error: null }
        : { data: { ok: true, id: "cp1" }, error: null });
    montar();
    expect(await screen.findByText("Lucas Ferreira")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "ana@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("Cadastro enviado")).toBeInTheDocument();
    const envio = h.invoke.mock.calls.find((c) => (c[1] as { body: { acao: string } }).body.acao === "cadastro_enviar")!;
    expect((envio[1] as { body: Record<string, unknown> }).body).toMatchObject({ codigo: "PROF-LUCAS-FERREIRA", captcha: "tok-1", dados: { nome: "Ana Lima", email: "ana@x.com" } });
  });

  it("sem contato não envia; link inválido mostra o aviso", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, profissional: "Lucas Ferreira", conta: "C" }, error: null });
    const r = montar();
    await screen.findByText("Lucas Ferreira");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText(/Deixe um e-mail ou um telefone/)).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    r.unmount();
    h.invoke.mockResolvedValue({ data: { ok: false, erro: "link_nao_encontrado" }, error: null });
    montar("NAO-EXISTE");
    await waitFor(() => expect(screen.getByText("Link de cadastro não encontrado")).toBeInTheDocument());
  });
});
