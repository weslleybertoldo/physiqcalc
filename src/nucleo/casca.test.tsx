import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { conta, matricula, situacao } from "@/test/fixturesNucleo";

const h = vi.hoisted(() => ({
  sessao: {} as Record<string, unknown>,
  auth: { user: null as null | { id: string }, loading: false, isStaff: false, isMaster: false },
  preferida: null as string | null,
}));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => h.sessao }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => h.auth }));
vi.mock("@/lib/mpClient", () => ({ invokeMp: vi.fn(async () => null) }));

import { useDadosCasca } from "./casca";
import { escolherContaAtiva } from "./conta";

function dados() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useDadosCasca(), { wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> }).result;
}

beforeEach(() => {
  localStorage.clear();
  h.auth = { user: { id: "t1" }, loading: false, isStaff: false, isMaster: false };
  h.sessao = {
    pronto: true, usuario: { id: "u1", email: "lucas@gmail.com", user_metadata: {} }, carregandoSituacao: false, erroSituacao: false,
    treino: { estado: "pronto", erro: null }, situacao: null,
  };
});

describe("useDadosCasca (dados reais da W3)", () => {
  it("dono com 2 contas: card da conta, troca de conta, papel e contador de alunos", () => {
    const a = conta({ id: "a", nome: "Consultoria Ferreira", profissionais: 2, alunos_ativos: 132 });
    const b = conta({ id: "b", nome: "Clínica Nutri", plano: "nutricao", modulos: ["nutricao"], papeis: ["dono", "nutricionista"], origem: "legado_nutri", cobranca_legada: true });
    h.sessao.situacao = situacao({ nome: "Lucas Ferreira", contas: [a, b], modulos_aluno: ["treino"] });
    let r = dados();
    expect(r.current.ehProfissional).toBe(true);
    expect(r.current.conta).toMatchObject({ id: "a", nome: "Consultoria Ferreira", profissionais: 2, modulos: ["treino", "nutricao"] });
    expect(r.current.contas).toHaveLength(2);
    expect(r.current.trocarConta).toBeTypeOf("function");
    expect(r.current.papelRotulo).toBe("Personal trainer");
    expect(r.current.contadores.Alunos).toBe(132);
    expect(r.current.usuario?.nome).toBe("Lucas Ferreira");
    escolherContaAtiva("u1", "b");
    r = dados();
    expect(r.current.conta?.id).toBe("b");
    expect(r.current.papelRotulo).toBe("Nutricionista");
    expect(r.current.plano?.nome).toBe("Plano PhysiqNutri");
  });
  it("W28: legada com cobranca_legada = false ganha o card do núcleo (sem o plano-status do Calc)", async () => {
    const { invokeMp } = await import("@/lib/mpClient");
    vi.mocked(invokeMp).mockClear();
    h.auth = { ...h.auth, isStaff: true };
    const nutri = conta({ id: "n", plano: "nutricao", modulos: ["nutricao"], origem: "legado_nutri", cobranca_legada: false, regras_legadas: true,
      situacao: "ativa", teste_ate: null, vence_em: "2099-12-31" });
    h.sessao.situacao = situacao({ contas: [nutri] });
    expect(dados().current.plano).toMatchObject({ nome: "Plano Nutrição", linha: "Vence em 31/12 · Pix", tom: "ok" });
    const calc = conta({ id: "k", plano: "treino", modulos: ["treino"], origem: "legado_calc", cobranca_legada: false, regras_legadas: true,
      situacao: "ativa", teste_ate: null, vence_em: "2099-12-31", tolerancia_dias: 7 });
    h.sessao.situacao = situacao({ contas: [calc] });
    expect(dados().current.plano).toMatchObject({ nome: "Plano Treino", linha: "Vence em 31/12 · Pix" });
    expect(invokeMp).not.toHaveBeenCalled();
  });
  it("legado Calc com a cobrança antiga: o card vem do plano-status do Calc (como até a W27)", async () => {
    const { invokeMp } = await import("@/lib/mpClient");
    vi.mocked(invokeMp).mockClear();
    h.auth = { ...h.auth, isStaff: true };
    h.sessao.situacao = situacao({ contas: [conta({ origem: "legado_calc", cobranca_legada: true, plano: "treino", modulos: ["treino"], situacao: "ativa" })] });
    dados();
    await waitFor(() => expect(invokeMp).toHaveBeenCalledWith("plano-status"));
  });
  it("aluno: módulos das matrículas decidem as abas; não é profissional", () => {
    h.sessao.situacao = situacao({ matriculas: [matricula()], modulos_aluno: ["treino"] });
    const r = dados();
    expect(r.current.ehProfissional).toBe(false);
    expect(r.current.modulosAluno).toEqual(["treino"]);
    expect(r.current.conta).toBeNull();
    expect(r.current.carregando).toBe(false);
  });
  it("master (do principal ou o papel espelhado no Treino)", () => {
    h.sessao.situacao = situacao({ master: true });
    expect(dados().current.ehMaster).toBe(true);
    h.sessao.situacao = situacao();
    h.auth = { ...h.auth, isStaff: true, isMaster: true };
    expect(dados().current.ehMaster).toBe(true);
  });
  it("carregando só enquanto a situação não chegou; a troca de token NÃO segura a casca (W5: o painel não trava sem o Treino)", () => {
    h.sessao = { ...h.sessao, situacao: null, carregandoSituacao: true };
    expect(dados().current.carregando).toBe(true);
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true, modulos_aluno: ["treino"] }), carregandoSituacao: false, treino: { estado: "trocando", erro: null } };
    h.auth = { ...h.auth, user: null };
    expect(dados().current.carregando).toBe(false);
    h.sessao = { ...h.sessao, treino: { estado: "erro", erro: "limite" } };
    expect(dados().current.carregando).toBe(false);
  });
  it("principal fora do ar e nada guardado: vale o Treino (spec 9)", () => {
    h.sessao = { ...h.sessao, situacao: null, erroSituacao: true };
    h.auth = { ...h.auth, isStaff: true };
    const r = dados();
    expect(r.current.carregando).toBe(false);
    expect(r.current.modulosAluno).toEqual(["treino"]);
    expect(r.current.ehProfissional).toBe(true);
  });
  it("deslogado", () => {
    h.sessao = { ...h.sessao, usuario: null, situacao: null };
    expect(dados().current.usuario).toBeNull();
  });
});
