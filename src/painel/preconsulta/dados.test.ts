import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14b (B21): a aba Respostas lê UMA página do banco (respostas_da_conta) — os filtros, a página e o tamanho vão no pedido.
const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: h.rpc }, PRINCIPAL_SCHEMA: "staging" }));

import { listarRespostasPagina } from "./dados";
import { FILTROS_VAZIOS } from "./respostasUtil";

const PAGINA = { ok: true, total: 41, total_conta: 41, novas: 2, titulos: ["Pré-anamnese"], aluno: null, itens: [{ id: "r21" }] };

beforeEach(() => {
  h.rpc.mockReset();
});

describe("listarRespostasPagina (hml-14b)", () => {
  it("pede a página 2 (deslocamento 20, 20 por vez) com os filtros no formato do banco", async () => {
    h.rpc.mockResolvedValue({ data: PAGINA, error: null });
    const p = await listarRespostasPagina("c1", { ...FILTROS_VAZIOS, busca: "zé", soNovas: true }, 2);
    expect(h.rpc).toHaveBeenCalledWith("respostas_da_conta", { p_conta: "c1", p_filtros: { q: "zé", novas: "true" }, p_offset: 20, p_limite: 20 });
    expect(p).toMatchObject({ total: 41, totalConta: 41, novas: 2, titulos: ["Pré-anamnese"], itens: [{ id: "r21" }] });
  });

  it("erro do banco lança (a tela mostra o erro, nunca uma lista vazia)", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function respostas_da_conta" } });
    await expect(listarRespostasPagina("c1", FILTROS_VAZIOS, 1)).rejects.toThrow(/permission denied/);
  });

  it("resposta fora do formato lança", async () => {
    h.rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await expect(listarRespostasPagina("c1", FILTROS_VAZIOS, 1)).rejects.toThrow(/formato inesperado/);
  });
});
