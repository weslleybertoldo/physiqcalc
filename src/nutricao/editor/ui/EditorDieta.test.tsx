import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Physiq hml-19b (H-41 · jeito 2) — o editor do plano com as gravações pela função nutricao: o Subir/Descer é 1 chamada (dieta_ordenar)
// com o otimista IGUAL (a ordem muda na hora; se o servidor recusar, volta e aparece a frase fixa) e o Duplicar não manda mais o id da
// AUTORA (o servidor põe quem chama — antes o RLS recusava quem não era a autora). O plano vem da RPC plano_alimentar (hml-17).
const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), erro: vi.fn(), ok: vi.fn() }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ usuario: { id: "u-colega", email: "colega@teste.com" } }) }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => h.ok(...a), error: (...a: unknown[]) => h.erro(...a), message: vi.fn() } }));
// hml-20c (H-42): a LEITURA do plano vai pela nutricao (o `ler` da plano_alimentar) — o módulo de verdade do servidor roda sobre o MESMO
// h.rpc (src/test/nutricaoFalsa.ts); o h.invoke segue vendo só as GRAVAÇÕES (o que estes testes contam).
vi.mock("@/integrations/principal/client", async () => {
  const { ehLer, lerPeloModulo } = await import("@/test/nutricaoFalsa");
  const rpc = (...a: unknown[]) => h.rpc(...a);
  return {
    PRINCIPAL_SCHEMA: "staging",
    principalConfigurado: true,
    principal: {
      rpc,
      functions: { invoke: (nome: string, o: { body?: unknown }) => (ehLer(o?.body) ? lerPeloModulo({ rpc })(o.body) : h.invoke(nome, o)) },
      from: (t: string) => {
        throw new Error(`gravação/leitura direta na tabela ${t}`);
      },
    },
  };
});

import { EditorDieta } from "./EditorDieta";

const PLANO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const refeicao = (id: string, nome: string, ordem: number) => ({
  id, plano_id: PLANO, nome, horario: null, ordem, observacao: null, dias_semana: [], created_at: "2026-10-11T10:00:00Z", updated_at: "2026-10-11T10:00:00Z", itens: [],
});
const plano = () => ({
  id: PLANO, nutricionista_id: "u-autora", paciente_id: "p1", titulo: "Plano 11/10", metodo: "alimentos", kcal_alvo: null, calculo_energetico_id: null,
  observacao: null, favorito: false, created_at: "2026-10-11T10:00:00Z", updated_at: "2026-10-11T10:00:00Z", deleted_at: null,
  refeicoes: [refeicao("r1", "Café", 0), refeicao("r2", "Almoço", 1), refeicao("r3", "Jantar", 2)],
});

function montar(onTrocarPlano = vi.fn()) {
  render(
    <MemoryRouter useTransitions={false}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EditorDieta planoId={PLANO} paciente={{ id: "p1", nome: "Rafael Moura" }} nomeNutricionista="Camila" onTrocarPlano={onTrocarPlano} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return onTrocarPlano;
}
const ordemNaTela = () => [...document.querySelectorAll("[data-refeicao-nome]")].map((e) => e.getAttribute("data-refeicao-nome"));
const corpos = () => h.invoke.mock.calls.map(([nome, o]) => ({ nome, ...(o as { body: Record<string, unknown> }).body }));

beforeEach(() => {
  for (const f of [h.rpc, h.invoke, h.erro, h.ok]) f.mockReset();
  h.rpc.mockImplementation(async (nome: string) => (nome === "plano_alimentar" ? { data: plano(), error: null } : { data: null, error: null }));
});

describe("EditorDieta › Subir/Descer pela nutricao (hml-19b)", () => {
  it("Subir o Almoço: 1 chamada dieta_ordenar com as ordens que mudaram; a tela muda na hora", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    h.invoke.mockImplementation(() => new Promise((r) => (soltar = r)));
    montar();
    await screen.findByText("Almoço");
    expect(ordemNaTela()).toEqual(["Café", "Almoço", "Jantar"]);
    fireEvent.click(document.querySelector('[data-refeicao="r2"] [data-refeicao-abrir]')!);
    fireEvent.click(await screen.findByRole("button", { name: /Subir/ }));
    // otimista: antes da resposta, já trocou
    await waitFor(() => expect(ordemNaTela()).toEqual(["Almoço", "Café", "Jantar"]));
    expect(corpos()).toEqual([{ nome: "nutricao", tabela: "refeicoes", ordens: [{ id: "r2", ordem: 0 }, { id: "r1", ordem: 1 }], acao: "dieta_ordenar" }]);
    await act(async () => soltar({ data: { ok: true, n: 2 }, error: null }));
    expect(ordemNaTela()).toEqual(["Almoço", "Café", "Jantar"]);
    expect(h.erro).not.toHaveBeenCalled();
  });

  it("o servidor recusa → a ordem VOLTA e aparece a frase fixa (nunca a mensagem do banco)", async () => {
    h.invoke.mockResolvedValue({
      data: null,
      error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "nao_encontrado" }), { status: 404, headers: { "Content-Type": "application/json" } }) },
    });
    montar();
    await screen.findByText("Almoço");
    fireEvent.click(document.querySelector('[data-refeicao="r3"] [data-refeicao-abrir]')!);
    fireEvent.click(await screen.findByRole("button", { name: /Subir/ }));
    await waitFor(() => expect(h.erro).toHaveBeenCalledWith("Não encontrado: o registro foi excluído ou não é seu."));
    expect(ordemNaTela()).toEqual(["Café", "Almoço", "Jantar"]);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("EditorDieta › Duplicar pela nutricao (hml-19b)", () => {
  it("o corpo leva o plano e o título; nunca o id da autora (o servidor põe quem chama); a tela troca para a cópia", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, plano: { ...plano(), id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", titulo: "Plano 11/10 (cópia)" } }, error: null });
    const trocar = montar();
    await screen.findByText("Almoço");
    const menu = document.querySelector("[data-plano-menu]")!;
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.keyDown(menu, { key: "Enter" });
    fireEvent.click(await waitFor(() => {
      const item = document.querySelector("[data-plano-duplicar]");
      if (!item) throw new Error("o menu não abriu");
      return item;
    }));
    await waitFor(() => expect(trocar).toHaveBeenCalledWith("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
    expect(corpos()).toEqual([{ nome: "nutricao", plano_id: PLANO, titulo: "Plano 11/10 (cópia)", acao: "plano_duplicar" }]);
    expect(JSON.stringify(corpos())).not.toContain("u-autora");
  });
});
