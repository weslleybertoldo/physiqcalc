import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-14b (B21): a aba Respostas lê UMA página do banco (respostas_da_conta) — os filtros, a página e o tamanho vão no pedido.
const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({ principal: { rpc: h.rpc }, PRINCIPAL_SCHEMA: "staging" }));

import { buscarNumerosPreConsulta, listarRespostasPagina } from "./dados";
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

// hml-14d (B21 · D35): os números do topo e dos formulários são contados no banco (preconsulta_numeros) — a leitura de até 1000 saiu
describe("buscarNumerosPreConsulta (hml-14d)", () => {
  const NUMEROS = { ok: true, total: 1203, novas: 7, ligadas: 1190, importadas: 40, mes: 31, semanas: [1, 0, 2, 3, 0, 5, 8, 9], por_formulario: { f1: { total: 1203, novas: 7 } } };

  it("pede a conta e o início do mês do navegador; devolve os números do banco", async () => {
    h.rpc.mockResolvedValue({ data: NUMEROS, error: null });
    const inicio = new Date(2026, 9, 1);
    const n = await buscarNumerosPreConsulta("c1", inicio);
    expect(h.rpc).toHaveBeenCalledWith("preconsulta_numeros", { p_conta: "c1", p_inicio_mes: inicio.toISOString() });
    expect(n).toEqual({ total: 1203, novas: 7, ligadas: 1190, importadas: 40, mes: 31, semanas: [1, 0, 2, 3, 0, 5, 8, 9], porFormulario: { f1: { total: 1203, novas: 7 } } });
  });

  it("erro do banco e formato inesperado lançam (a tela mostra o erro, nunca zeros)", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { message: "permission denied for function preconsulta_numeros" } });
    await expect(buscarNumerosPreConsulta("c1", new Date())).rejects.toThrow(/permission denied/);
    h.rpc.mockResolvedValue({ data: { ok: true, total: 3 }, error: null });
    await expect(buscarNumerosPreConsulta("c1", new Date())).rejects.toThrow(/formato inesperado/);
  });
});
