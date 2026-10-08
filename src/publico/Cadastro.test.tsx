import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("só o nome é obrigatório (como no Nutri): envia sem contato; link inválido mostra o aviso", async () => {
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.acao === "cadastro_info"
        ? { data: { ok: true, profissional: "Lucas Ferreira", conta: "C" }, error: null }
        : { data: { ok: true, id: "cp2" }, error: null });
    const r = montar();
    await screen.findByText("Lucas Ferreira");
    expect(screen.getByText(/só o nome é obrigatório/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("Escreva o seu nome.")).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("Cadastro enviado")).toBeInTheDocument();
    expect(screen.getByText(/esperar o contato do profissional/)).toBeInTheDocument();
    r.unmount();
    h.invoke.mockResolvedValue({ data: { ok: false, erro: "link_nao_encontrado" }, error: null });
    montar("NAO-EXISTE");
    await waitFor(() => expect(screen.getByText("Link de cadastro não encontrado")).toBeInTheDocument());
  });
});

describe("H5 — /c/ com CPF e apelido (N-57 / DN-6) e a trava de e-mail/CPF", () => {
  const erroDoBanco = (corpo: Record<string, unknown>) => ({
    data: null,
    error: { context: new Response(JSON.stringify(corpo), { status: 409, headers: { "Content-Type": "application/json" } }) },
  });

  it("manda o apelido e o CPF (só os dígitos, com a máscara na tela)", async () => {
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.acao === "cadastro_info" ? { data: { ok: true, profissional: "Lucas Ferreira", conta: "C" }, error: null } : { data: { ok: true, id: "cp3" }, error: null });
    montar();
    await screen.findByText("Lucas Ferreira");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("Como prefere ser chamado(a)"), { target: { value: "Aninha" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224725" } });
    expect((screen.getByLabelText("CPF") as HTMLInputElement).value).toBe("529.982.247-25");
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("Cadastro enviado")).toBeInTheDocument();
    const envio = h.invoke.mock.calls.find((c) => (c[1] as { body: { acao: string } }).body.acao === "cadastro_enviar")!;
    expect((envio[1] as { body: { dados: Record<string, unknown> } }).body.dados).toMatchObject({ nome: "Ana Lima", apelido: "Aninha", cpf: "52998224725" });
  });

  it("CPF com dígito errado não envia", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, profissional: "Lucas Ferreira", conta: "C" }, error: null });
    montar();
    await screen.findByText("Lucas Ferreira");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("CPF"), { target: { value: "52998224726" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("Confira o CPF.")).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("H-18: a tela nunca diz se o e-mail ou o CPF já é de um aluno (o banco aceita e o profissional vê ao aprovar)", async () => {
    // o banco de hoje responde ok mesmo com e-mail/CPF de aluno; um código antigo de "já existe" vira só a falha genérica
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.acao === "cadastro_info" ? { data: { ok: true, profissional: "Lucas Ferreira", conta: "C" }, error: null }
        : erroDoBanco({ ok: false, erro: "cadastro_cpf_existe", campos: ["cpf", "email"] }));
    montar();
    await screen.findByText("Lucas Ferreira");
    const cpf = () => document.querySelector<HTMLInputElement>("[data-cad-cpf]")!;
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.change(cpf(), { target: { value: "52998224725" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("Não deu certo agora. Tente de novo.")).toBeInTheDocument();
    expect(screen.queryByText(/Já existe cadastro/)).not.toBeInTheDocument();
    expect(cpf()).not.toHaveAttribute("aria-invalid", "true");
  });
});

// hml-12 (H-30): o banco recusa menor de 16 (com a versão dos textos ligada) e, no staging, a linha da idade mínima e da Política fica
// antes do envio (P9: sem caixa de consentimento). Na produção, a tela de hoje (a condição do Vite é lida na tela).
describe("hml-12 — /c/: a idade mínima", () => {
  const infoOk = (corpo: Record<string, unknown> = { ok: true, id: "cp9" }, status = 200) =>
    h.invoke.mockImplementation(async (_fn: string, { body }: { body: Record<string, unknown> }) =>
      body.acao === "cadastro_info"
        ? { data: { ok: true, profissional: "Lucas Ferreira", conta: "C" }, error: null }
        : status === 200
          ? { data: corpo, error: null }
          : { data: null, error: { context: new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } }) } });
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("menor de 16 recusado pelo banco (400 menor_de_16) → a frase da idade mínima", async () => {
    infoOk({ ok: false, erro: "menor_de_16" }, 400);
    montar();
    await screen.findByText("Lucas Ferreira");
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Ana Lima" } });
    fireEvent.change(document.querySelector("[data-cad-nascimento]")!, { target: { value: "2012-05-20" } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar cadastro/ }));
    expect(await screen.findByText("O Physiq é para quem tem 16 anos ou mais. Confira a data de nascimento.")).toBeInTheDocument();
    expect(screen.queryByText("Cadastro enviado")).toBeNull();
  });

  it("staging: a linha da idade mínima e para onde vão os dados, com a Política, antes do envio", async () => {
    vi.stubEnv("VITE_DB_SCHEMA", "staging");
    infoOk();
    montar();
    await screen.findByText("Lucas Ferreira");
    const linha = document.querySelector("[data-aviso-idade-cadastro]")!;
    expect(linha.textContent).toBe(
      "O Physiq é para quem tem 16 anos ou mais. Os seus dados vão para Lucas Ferreira, que cuida deles no seu atendimento — veja a Política de Privacidade.",
    );
    expect(linha.querySelector("a")).toHaveAttribute("href", "/privacidade");
    expect(linha.querySelector("a")).toHaveAttribute("target", "_blank");
  });

  it("produção: sem a linha", async () => {
    vi.stubEnv("VITE_DB_SCHEMA", "public");
    infoOk();
    montar();
    await screen.findByText("Lucas Ferreira");
    expect(document.querySelector("[data-aviso-idade-cadastro]")).toBeNull();
    expect(document.body.textContent).not.toContain("16 anos ou mais");
  });
});
