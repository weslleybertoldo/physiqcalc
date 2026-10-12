// Physiq hml-20b (H-42 · jeito 2, etapa 2 — a decisão da sessão principal, 12/10, sobre o TEMPO da Avaliação: 0,50 × 0,91 s): a série do
// painel (a aba Avaliação, o card Evolução e os KPIs do cabeçalho) não espera mais o perfil para COMEÇAR. Com a casca fria, a parte do
// PRINCIPAL (aluno_evolucao_painel) vai no MESMO lote `ler` do aluno_perfil (1 ida à nutricao, não 2 em série) e só a parte do TREINO
// espera o perfil (o `modulos` dele decide se ela entra). Sem acesso ao aluno: o erro do perfil, a série vazia, nada do Treino e nenhuma
// ida a mais. O caminho de verdade até a "rede": o hook, o usePerfilAluno, as libs (buscarPerfilAluno, carregarPrincipalDoPainel) e o
// leitor em lote — só o invoke da função e a parte do Treino (a treino-leitura, fora da 20b) são falsos.
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ALUNO = "a1a1a1a1-0000-4000-8000-0000000000ff"; // o id da rota do painel

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  corpos: [] as Array<{ acao?: unknown; itens?: Array<Record<string, unknown>> }>,
  treino: vi.fn(),
}));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  PRINCIPAL_URL: "https://principal.teste.invalid",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (f: string, o: { body: Record<string, unknown> }) => h.invoke(f, o) },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
    from: (t: string) => {
      throw new Error(`leitura direta na tabela ${t}`);
    },
    storage: {
      from: () => {
        throw new Error("Storage direto");
      },
    },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/nucleo/sessao", () => ({ useSessao: () => ({ treino: { estado: "pronto", erro: null } }) }));
vi.mock("./fontes", async (original) => ({
  ...(await original<typeof import("./fontes")>()),
  carregarTreinoDoPainel: (id: string) => h.treino(id),
}));

import { chavePerfilAluno } from "../dados/usePerfilAluno";
import { useAvaliacaoDoAluno } from "./useAvaliacaoDoAluno";

const PERFIL = {
  ok: true, paciente_id: "p1", rota_id: ALUNO, nome: "Ana W5P", tags: [], modulos: ["treino", "nutricao"], conta_modulos: ["treino", "nutricao"],
  personal: { id: "u-personal", nome: "Thiago" },
};
const SERIE = {
  paciente_id: "p1", objetivo: "ganhar massa",
  antropometrias: [{ id: "an1", data: "2026-10-01", peso: 60.8, percentual_gordura: 24.1, observacao: null }],
  fotos: [{ id: "fe1", path: "u-nutri/p1/evo.jpg", url: "/storage/v1/object/sign/evolucao-staging/u-nutri/p1/evo.jpg?token=t" }],
};
const TREINO = { parte: { perfil: null, avaliacoes: [], fotos: [] }, treinoUserId: "t1", proxima: null };

type Item = { ok: true; valor: unknown } | { ok: false; erro: string };
let respostas: Record<string, Item>;
/** O lote que a função devolve: cada item na ordem do pedido (o motor da nutricao). */
const responder = (corpo: { itens?: Array<Record<string, unknown>> }) => ({
  ok: true,
  itens: (corpo.itens ?? []).map((i) => respostas[String(i.q)] ?? { ok: false, erro: "consulta_invalida" }),
});
/** As consultas de cada ida, na ordem. */
const idas = () => h.corpos.map((c) => (c.itens ?? []).map((i) => String(i.q)));

function montar(qc = new QueryClient()) {
  const envoltorio = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, ...renderHook(() => useAvaliacaoDoAluno(ALUNO), { wrapper: envoltorio }) };
}

let soltar: Array<() => void>;
let avisos: ReturnType<typeof vi.spyOn> | undefined;
beforeEach(() => {
  respostas = { aluno_perfil: { ok: true, valor: PERFIL }, aluno_evolucao_painel: { ok: true, valor: SERIE } };
  h.corpos = [];
  soltar = [];
  h.invoke.mockReset();
  h.treino.mockReset().mockResolvedValue(TREINO);
  // a função responde só quando o teste solta (a ida fica "na rede" — dá para ver o que já saiu e o que ainda espera)
  h.invoke.mockImplementation(
    (funcao: string, o: { body: { acao?: unknown; itens?: Array<Record<string, unknown>> } }) =>
      new Promise((ok) => {
        expect(funcao).toBe("nutricao");
        const corpo = JSON.parse(JSON.stringify(o.body)) as { acao?: unknown; itens?: Array<Record<string, unknown>> };
        h.corpos.push(corpo);
        soltar.push(() => ok({ data: responder(corpo), error: null }));
      }),
  );
  avisos?.mockRestore();
  avisos = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("hml-20b — a série do painel vai no lote do perfil (1 ida) e só o Treino espera o perfil", () => {
  it("a casca fria: 1 chamada `ler` com os 2 itens (aluno_perfil + aluno_evolucao_painel); o Treino só sai DEPOIS do perfil", async () => {
    const { result } = montar();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    expect(h.corpos[0].acao).toBe("ler");
    expect(h.corpos[0].itens).toHaveLength(2);
    expect(h.corpos[0].itens).toEqual(expect.arrayContaining([{ q: "aluno_perfil", aluno: ALUNO }, { q: "aluno_evolucao_painel", aluno: ALUNO }]));
    // NEGATIVO: o perfil ainda não chegou → a parte do Treino não saiu (ela precisa do `modulos`)
    await new Promise((r) => setTimeout(r, 30));
    expect(h.treino).not.toHaveBeenCalled();
    expect(result.current.carregando).toBe(true);
    soltar.shift()?.();
    await waitFor(() => expect(result.current.dados).toBeDefined());
    expect(h.treino).toHaveBeenCalledTimes(1);
    expect(h.treino).toHaveBeenCalledWith(ALUNO);
    expect(idas()).toHaveLength(1); // nenhuma ida a mais: nem o perfil de novo, nem a série
    expect(result.current.erro).toBeNull();
    expect(result.current.carregando).toBe(false);
    expect(result.current.dados?.falhas).toEqual({ treino: null, principal: null });
    expect(result.current.dados?.principal?.antropometrias.map((a) => a.id)).toEqual(["an1"]);
    expect(result.current.dados?.principal?.fotos[0].url).toBe(`https://principal.teste.invalid${SERIE.fotos[0].url}`);
    expect(result.current.serie).not.toBeNull();
    expect(result.current.perfil?.nome).toBe("Ana W5P");
  });

  it("só Nutrição (o perfil sem treino): a parte do Treino não sai; a série só do principal; 1 ida", async () => {
    respostas.aluno_perfil = { ok: true, valor: { ...PERFIL, modulos: ["nutricao"] } };
    const { result } = montar();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    soltar.shift()?.();
    await waitFor(() => expect(result.current.dados).toBeDefined());
    expect(h.treino).not.toHaveBeenCalled();
    expect(result.current.dados?.treino).toBeNull();
    expect(result.current.dados?.falhas).toEqual({ treino: null, principal: null });
    expect(idas()).toEqual([expect.arrayContaining(["aluno_perfil", "aluno_evolucao_painel"])]);
  });

  it.each(["sem_acesso", "aluno_inexistente"])(
    "sem acesso ao aluno (%s, a w14_matricula_da_rota): o erro do perfil na tela, a série vazia, nada do Treino e nenhuma ida a mais",
    async (codigo) => {
      respostas = { aluno_perfil: { ok: false, erro: codigo }, aluno_evolucao_painel: { ok: false, erro: codigo } };
      const { result } = montar();
      await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
      soltar.shift()?.();
      await waitFor(() => expect(result.current.erro).toBeTruthy());
      expect((result.current.erro as Error).message).toBe(codigo); // o ErroPerfil de hoje (a tela traduz o código)
      expect(result.current.serie).toBeNull();
      expect(result.current.dados).toBeUndefined();
      expect(result.current.carregando).toBe(false);
      await new Promise((r) => setTimeout(r, 60)); // sem nova tentativa (o código é dos que não repetem) e sem a série sozinha depois
      expect(h.treino).not.toHaveBeenCalled();
      expect(idas()).toHaveLength(1);
    },
  );

  it("o perfil chega e a parte do principal volta nao_encontrado: só ela cai (falhas.principal = erro), o Treino segue — como a lib já trata", async () => {
    respostas.aluno_evolucao_painel = { ok: false, erro: "nao_encontrado" };
    const { result } = montar();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    soltar.shift()?.();
    await waitFor(() => expect(result.current.dados).toBeDefined());
    expect(result.current.dados?.principal).toBeNull();
    expect(result.current.dados?.falhas).toEqual({ treino: null, principal: "erro" });
    expect(result.current.dados?.treino).toEqual(TREINO);
    expect(result.current.erro).toBeNull();
    expect(idas()).toHaveLength(1);
  });

  it("o perfil já em cache (outra aba): a série sai num lote SÓ dela, sem pedir o perfil de novo, e o Treino vai junto (sem esperar a ida)", async () => {
    const qc = new QueryClient();
    qc.setQueryData(chavePerfilAluno(ALUNO), { ...PERFIL, modulos: ["treino", "nutricao"] });
    const { result } = montar(qc);
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    expect(idas()).toEqual([["aluno_evolucao_painel"]]);
    await waitFor(() => expect(h.treino).toHaveBeenCalledTimes(1)); // a ida do principal ainda "na rede": o Treino não espera por ela
    soltar.shift()?.();
    await waitFor(() => expect(result.current.dados).toBeDefined());
    expect(result.current.dados?.falhas).toEqual({ treino: null, principal: null });
    expect(idas()).toHaveLength(1);
  });
});
