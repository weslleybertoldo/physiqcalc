import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// hml-17 (H-39): sem a sessão do Banco do Treino, a parte do Treino da Evolução era "nada" (sucesso vazio) — com a API caindo, o
// Início dizia "Seu peso · Aparece depois da sua primeira avaliação" para quem tem 6 avaliações no Treino. Agora ela é ESPERADA
// quando a situação diz que o aluno tem Treino ou quando não há situação: a troca em andamento espera; a troca em erro (ou sem
// situação) é falha da parte do Treino.
const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  authUser: null as null | { id: string },
  treino: vi.fn(),
  principal: vi.fn(),
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: h.authUser }) }));
vi.mock("@/integrations/principal/client", () => ({ principalConfigurado: true }));
vi.mock("@/ui/premium/useOnline", () => ({ useOnline: () => true }));
vi.mock("./cache", () => ({ lerCache: async () => null, guardarCache: async () => {} }));
vi.mock("./fontes", () => ({ carregarTreino: (id: string) => h.treino(id), carregarPrincipal: () => h.principal() }));

import { treinoSemSessao, useEvolucaoDoAluno } from "./useEvolucaoDoAluno";
import type { Situacao } from "@/nucleo/situacao";

const situacao = (modulos: string[]) => ({ modulos_aluno: modulos, matriculas: [], precisa_treino: modulos.includes("treino") }) as unknown as Situacao;
const PARTE_PRINCIPAL = { objetivo: null, antropometrias: [], fotos: [] };
const PARTE_TREINO = { perfil: null, avaliacoes: [], fotos: [] };

let avisos: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.authUser = null;
  h.sessao = { usuario: { id: "p1" }, situacao: null, erroSituacao: false, treino: { estado: "desnecessario", erro: null } };
  h.treino.mockReset().mockResolvedValue(PARTE_TREINO);
  h.principal.mockReset().mockResolvedValue(PARTE_PRINCIPAL);
  avisos?.mockRestore();
  avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("treinoSemSessao (a regra, hml-17)", () => {
  it.each([
    ["sem situação e a busca dela falhou", { situacao: null, erroSituacao: true, troca: "desnecessario" }, "falhou"],
    ["sem situação, ainda chegando", { situacao: null, erroSituacao: false, troca: "desnecessario" }, "aguardando"],
    ["tem Treino, troca em andamento", { situacao: situacao(["treino"]), erroSituacao: false, troca: "trocando" }, "aguardando"],
    ["tem Treino, troca aguardando", { situacao: situacao(["treino", "nutricao"]), erroSituacao: false, troca: "aguardando" }, "aguardando"],
    ["tem Treino, troca em erro", { situacao: situacao(["treino"]), erroSituacao: false, troca: "erro" }, "falhou"],
    ["só Nutrição (não tem Treino)", { situacao: situacao(["nutricao"]), erroSituacao: false, troca: "desnecessario" }, "fora"],
  ] as const)("%s → %s", (_n, entrada, esperado) => {
    expect(treinoSemSessao(entrada as Parameters<typeof treinoSemSessao>[0])).toBe(esperado);
  });
});

describe("useEvolucaoDoAluno sem a sessão do Treino (hml-17)", () => {
  it("sem situação (a busca falhou) e o principal falhando → fase erro, com a falha do Treino marcada", async () => {
    h.sessao = { ...h.sessao, situacao: null, erroSituacao: true };
    h.principal.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useEvolucaoDoAluno());
    await waitFor(() => expect(result.current.fase).toBe("erro"));
    expect(result.current.falhas).toEqual({ treino: "erro", principal: "erro" });
    expect(h.treino).not.toHaveBeenCalled();
  });

  it("tem Treino, a troca falhou e o principal respondeu → pronto, com falhas.treino = erro (a tela avisa a parte)", async () => {
    h.sessao = { ...h.sessao, situacao: situacao(["treino", "nutricao"]), treino: { estado: "erro", erro: "rede" } };
    const { result } = renderHook(() => useEvolucaoDoAluno());
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    expect(result.current.falhas).toEqual({ treino: "erro", principal: null });
    expect(h.principal).toHaveBeenCalledTimes(1);
  });

  it("a troca ainda em andamento → fase carregando (nada é pedido até a sessão do Treino chegar ou a troca falhar)", async () => {
    h.sessao = { ...h.sessao, situacao: situacao(["treino"]), treino: { estado: "trocando", erro: null } };
    const { result, rerender } = renderHook(() => useEvolucaoDoAluno());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.fase).toBe("carregando");
    expect(h.principal).not.toHaveBeenCalled();
    // a sessão do Treino chegou: as 2 partes vêm
    h.authUser = { id: "t1" };
    h.sessao = { ...h.sessao, treino: { estado: "pronto", erro: null } };
    rerender();
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    expect(h.treino).toHaveBeenCalledWith("t1");
    expect(result.current.falhas).toEqual({ treino: null, principal: null });
  });

  it("controle: sem o módulo Treino → a parte do Treino é null, SEM falha", async () => {
    h.sessao = { ...h.sessao, situacao: situacao(["nutricao"]), treino: { estado: "desnecessario", erro: null } };
    const { result } = renderHook(() => useEvolucaoDoAluno());
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    expect(result.current.falhas).toEqual({ treino: null, principal: null });
    expect(h.treino).not.toHaveBeenCalled();
  });

  it("controle: com a sessão do Treino, as 2 partes vêm como antes", async () => {
    h.authUser = { id: "t1" };
    h.sessao = { ...h.sessao, situacao: situacao(["treino"]), treino: { estado: "pronto", erro: null } };
    const { result } = renderHook(() => useEvolucaoDoAluno());
    await waitFor(() => expect(result.current.fase).toBe("pronto"));
    expect(h.treino).toHaveBeenCalledWith("t1");
    expect(result.current.falhas).toEqual({ treino: null, principal: null });
  });
});
