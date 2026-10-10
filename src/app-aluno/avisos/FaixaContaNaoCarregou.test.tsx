import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): sem a situação e com a busca dela falhando, a casca abre como aluno sem módulos (as abas Treino e Dieta somem sem
// aviso). A faixa do topo explica e oferece "Tentar de novo".
const h = vi.hoisted(() => ({ sessao: {} as Record<string, unknown>, recarregar: vi.fn() }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));

import FaixaContaNaoCarregou from "./FaixaContaNaoCarregou";
import { existe, listar } from "@/rotas/registro";

beforeEach(() => {
  h.recarregar.mockReset().mockResolvedValue(null);
  h.sessao = { usuario: { id: "p1" }, situacao: null, erroSituacao: true, recarregarSituacao: h.recarregar };
});

describe("FaixaContaNaoCarregou (hml-17)", () => {
  it("com login, sem situação e a busca falhou → a faixa com o texto e Tentar de novo (busca a situação de novo)", async () => {
    render(<FaixaContaNaoCarregou />);
    const faixa = document.querySelector("[data-faixa-conta-erro]");
    expect(faixa).not.toBeNull();
    expect(screen.getByText("Não deu para carregar a sua conta agora.")).toBeInTheDocument();
    expect(screen.getByText("Treino e Dieta voltam assim que ela carregar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await waitFor(() => expect(h.recarregar).toHaveBeenCalledTimes(1));
  });

  it.each([
    ["a situação chegou (ou a guardada)", { situacao: { modulos_aluno: ["treino"] }, erroSituacao: false }],
    ["ainda carregando (sem erro)", { situacao: null, erroSituacao: false }],
    ["sem login", { usuario: null, situacao: null, erroSituacao: true }],
  ])("controle: %s → nada", (_n, extra) => {
    h.sessao = { ...h.sessao, ...extra };
    const { container } = render(<FaixaContaNaoCarregou />);
    expect(container.innerHTML).toBe("");
  });

  it("entra pelo registro das faixas e vem ANTES da da mensalidade", () => {
    expect(existe("avisosApp", "FaixaContaNaoCarregou")).toBe(true);
    const nomes = listar("avisosApp", ["FaixaContaNaoCarregou", "FaixaMensalidade"]).map((a) => a.nome);
    expect(nomes.indexOf("FaixaContaNaoCarregou")).toBeLessThan(nomes.indexOf("FaixaMensalidade"));
  });
});
