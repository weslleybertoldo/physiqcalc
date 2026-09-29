import { renderHook } from "@testing-library/react";
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
    const b = conta({ id: "b", nome: "Clínica Nutri", plano: "nutricao", modulos: ["nutricao"], papeis: ["dono", "nutricionista"], origem: "legado_nutri" });
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
  it("carregando enquanto a situação e a troca de token não chegaram (sem sessão do Treino)", () => {
    h.sessao = { ...h.sessao, situacao: null, carregandoSituacao: true };
    expect(dados().current.carregando).toBe(true);
    h.sessao = { ...h.sessao, situacao: situacao({ precisa_treino: true, modulos_aluno: ["treino"] }), carregandoSituacao: false, treino: { estado: "trocando", erro: null } };
    h.auth = { ...h.auth, user: null };
    expect(dados().current.carregando).toBe(true);
    h.sessao = { ...h.sessao, treino: { estado: "erro", erro: "rede" } };
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
