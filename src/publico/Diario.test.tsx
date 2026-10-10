import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ rpc: vi.fn(), upload: vi.fn(), remove: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({
  principal: { rpc: h.rpc, storage: { from: () => ({ upload: h.upload, remove: h.remove }) } },
  PRINCIPAL_SCHEMA: "public",
}));

import Diario from "./Diario";

const PAC = "11111111-1111-4111-8111-111111111111";
const NUTRI = "22222222-2222-4222-8222-222222222222";

function montar(codigo = "abc2345xyz") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter useTransitions={false} initialEntries={[`/d/${codigo}`]}>
        <Routes>
          <Route path="/d/:codigo" element={<Diario />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const respostas = (situacao: Record<string, unknown>, lista: unknown[] = []) =>
  async (nome: string) => {
    if (nome === "diario_link") return { data: situacao, error: null };
    if (nome === "diario_listar") return { data: lista, error: null };
    if (nome === "diario_enviar") return { data: { id: "r9", data_hora: new Date().toISOString() }, error: null };
    return { data: null, error: { message: "inesperado" } };
  };

beforeEach(() => {
  h.rpc.mockReset();
  h.upload.mockReset();
  h.remove.mockReset();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  if (!URL.createObjectURL) Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
});

describe("W24 — /d/:codigo (N-56): o diário público, sem login", () => {
  it("link ok: saudação com o primeiro nome, os últimos 7 dias com a reação (sem emoji) e o envio pelo mesmo caminho do app", async () => {
    h.rpc.mockImplementation(respostas({ situacao: "ok", paciente_id: PAC, nutricionista_id: NUTRI, nome: "Rafael" }, [
      { id: "a", data_hora: new Date(2026, 8, 30, 12, 40).toISOString(), refeicao: "almoco", comentario: "Frango com arroz", reacao_nutri: "otimo", comentario_nutri: "Ótima escolha!", reagido_em: null },
    ]));
    h.upload.mockResolvedValue({ data: { path: "x" }, error: null });
    montar("ABC2345XYZ");
    expect(await screen.findByText("Olá, Rafael")).toBeInTheDocument();
    expect(h.rpc).toHaveBeenCalledWith("diario_link", { p_codigo: "abc2345xyz" });
    expect(await screen.findByText("Frango com arroz")).toBeInTheDocument();
    expect(screen.getByText("ÓTIMO")).toBeInTheDocument();
    expect(screen.getByText("Ótima escolha!")).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);

    // sem foto: recusa ANTES de subir
    fireEvent.click(screen.getByRole("button", { name: /Enviar foto/ }));
    expect(await screen.findByText("Escolha a foto da refeição")).toBeInTheDocument();
    expect(h.upload).not.toHaveBeenCalled();

    // com foto: sobe na pasta <nutri>/<aluno>/ e grava pela diario_enviar com o código do link
    const arquivo = new File([new Uint8Array(2048)], "almoco.jpg", { type: "image/jpeg" });
    fireEvent.change(document.querySelector("[data-campo-foto]")!, { target: { files: [arquivo] } });
    fireEvent.click(screen.getByRole("button", { name: "Jantar" }));
    fireEvent.change(document.querySelector("[data-campo-comentario]")!, { target: { value: " Salada e peixe " } });
    fireEvent.click(screen.getByRole("button", { name: /Enviar foto/ }));
    await waitFor(() => expect(h.rpc.mock.calls.some((c) => c[0] === "diario_enviar")).toBe(true));
    const [caminho] = h.upload.mock.calls[0];
    expect(caminho).toMatch(new RegExp(`^${NUTRI}/${PAC}/[0-9a-f-]{36}\\.jpg$`));
    const envio = h.rpc.mock.calls.find((c) => c[0] === "diario_enviar")![1];
    expect(envio).toMatchObject({ p_codigo: "abc2345xyz", p_path: caminho, p_mime: "image/jpeg", p_tamanho: 2048, p_refeicao: "jantar", p_comentario: "Salada e peixe" });
    expect(await screen.findByText(/Foto enviada \(Jantar\)/)).toBeInTheDocument();
  });

  it("diário desligado pelo profissional → a frase da spec §9; nada de formulário", async () => {
    h.rpc.mockImplementation(respostas({ situacao: "diario_desligado" }));
    montar();
    expect(await screen.findByText("O envio de fotos está desligado pelo seu profissional.")).toBeInTheDocument();
    expect(document.querySelector("[data-form-diario]")).toBeNull();
    expect(h.rpc.mock.calls.some((c) => c[0] === "diario_listar")).toBe(false);
  });

  it("envio pelo link desligado → o link não aceita (o app continua); código inexistente → 'Link não encontrado' sem dado de ninguém", async () => {
    h.rpc.mockImplementation(respostas({ situacao: "link_desligado" }));
    const { unmount } = montar();
    expect(await screen.findByText("Este link não aceita fotos agora")).toBeInTheDocument();
    expect(screen.getByText(/aba Dieta › Foto pro diário/)).toBeInTheDocument();
    unmount();
    h.rpc.mockImplementation(respostas({ situacao: "invalido" }));
    montar("naoexiste1");
    expect(await screen.findByText("Link não encontrado")).toBeInTheDocument();
    expect(document.querySelector("[data-diario-nao-encontrado]")).not.toBeNull();
  });

  it("aluno sem nutricionista e resposta estranha da função → recusa clara", async () => {
    h.rpc.mockImplementation(respostas({ situacao: "sem_nutricionista" }));
    const { unmount } = montar();
    expect(await screen.findByText("O diário ainda não está liberado")).toBeInTheDocument();
    unmount();
    h.rpc.mockImplementation(respostas({ situacao: "ok" })); // sem as pastas = inválido (nunca sobe no lugar errado)
    montar();
    expect(await screen.findByText("Link não encontrado")).toBeInTheDocument();
  });
});
