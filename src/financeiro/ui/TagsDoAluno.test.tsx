// Physiq hml-19d (H-41 · jeito 2) — as tags do aluno (Perfil do aluno › Financeiro): a ponta do principal (pacientes.tags) grava pela função
// financeiro › tags_salvar, com a lista marcada (nunca pacientes.update do navegador); a do Treino segue pela admin-tags (catálogo e marcação),
// depois. Na recusa: 1 toast com o texto de sempre, a marca volta e o Treino não é tocado (o otimista de hoje).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  financeiro: vi.fn(),
  treino: vi.fn(),
  erro: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u-personal" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => h.erro(...a) } }));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: { functions: { invoke: (...a: unknown[]) => h.treino(...a) } },
}));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.financeiro(...a) },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t}`);
    },
  },
}));

import { TagsDoAluno } from "./TagsDoAluno";

const P = "11111111-1111-4111-8111-111111111111";
const CATALOGO = [{ id: "t-vip", nome: "VIP", cor: "#8B5CF6" }, { id: "t-pagante", nome: "Pagante", cor: null }];

beforeEach(() => {
  h.financeiro.mockReset();
  h.financeiro.mockResolvedValue({ data: { ok: true }, error: null });
  h.treino.mockReset();
  h.treino.mockImplementation(async (_nome: string, o: { body: { action: string } }) =>
    o.body.action === "getUserTagsCompleto" ? { data: { tags: CATALOGO, tagIds: [] }, error: null } : { data: {}, error: null });
  h.erro.mockReset();
});

const montar = (aoMudou = vi.fn()) => {
  render(<TagsDoAluno pacienteId={P} treinoUserId="t-aluno" tags={["Pagante"]} podeEditar aoMudou={aoMudou} />);
  return aoMudou;
};

describe("hml-19d — as tags do aluno pela função financeiro", () => {
  it("marcar uma tag → 1 tags_salvar com a lista marcada; depois o Treino (setUserTags) e o aoMudou", async () => {
    const aoMudou = montar();
    await waitFor(() => expect(document.querySelector('[data-tag="VIP"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-tag="VIP"]')!);
    await waitFor(() => expect(aoMudou).toHaveBeenCalledTimes(1));
    expect(h.financeiro).toHaveBeenCalledTimes(1);
    expect(h.financeiro).toHaveBeenCalledWith("financeiro", { body: { paciente_id: P, tags: ["Pagante", "VIP"], acao: "tags_salvar" } });
    const set = h.treino.mock.calls.find((c) => c[1].body.action === "setUserTags");
    expect(set?.[1].body).toEqual({ action: "setUserTags", userId: "t-aluno", tagIds: ["t-pagante", "t-vip"] });
    expect(document.querySelector('[data-tag="VIP"]')?.hasAttribute("data-tag-ativa")).toBe(true);
    expect(h.erro).not.toHaveBeenCalled();
  });

  it("tirar a última → tags_salvar com a lista vazia (tirar todas vale)", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-tag="Pagante"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-tag="Pagante"]')!);
    await waitFor(() => expect(h.financeiro).toHaveBeenCalledTimes(1));
    expect(h.financeiro.mock.calls[0][1].body).toEqual({ paciente_id: P, tags: [], acao: "tags_salvar" });
  });

  it("a função recusa → 1 toast 'Não deu para salvar as tags.', a marca volta e o Treino não é tocado", async () => {
    h.financeiro.mockResolvedValueOnce({
      data: null,
      error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "nao_encontrado" }), { status: 404 }) },
    });
    const aoMudou = montar();
    await waitFor(() => expect(document.querySelector('[data-tag="VIP"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-tag="VIP"]')!);
    await waitFor(() => expect(h.erro).toHaveBeenCalledTimes(1));
    expect(h.erro).toHaveBeenCalledWith("Não deu para salvar as tags.");
    expect(document.querySelector('[data-tag="VIP"]')?.hasAttribute("data-tag-ativa")).toBe(false);
    expect(h.treino.mock.calls.some((c) => c[1].body.action === "setUserTags")).toBe(false);
    expect(aoMudou).not.toHaveBeenCalled();
    expect(screen.getByText("Pagante")).toBeInTheDocument();
  });
});
