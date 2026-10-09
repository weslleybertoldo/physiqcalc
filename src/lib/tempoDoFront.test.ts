import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// hml-14 (H-32, D5): os fetch diretos do front para as funções do Treino desistem em 25 s (TEMPO_FUNCAO_MS), 1 vez só, e caem no
// caminho de erro de hoje — a treino-leitura do painel (editor do treino e Avaliação) e o invokeEdge (lista de alunos, Biblioteca do
// master). O login (40 s), a release do GitHub (8 s) e a foto (30 s) têm o teste no arquivo de cada um.
const h = vi.hoisted(() => ({
  sessaoPrincipal: vi.fn(async () => ({ data: { session: { access_token: "token-principal" } } })),
  sessaoTreino: vi.fn(async () => ({ data: { session: { access_token: "token-treino" } } })),
}));
vi.mock("@/integrations/principal/client", () => ({
  principal: { auth: { getSession: () => h.sessaoPrincipal() } },
  principalConfigurado: true,
  PRINCIPAL_SCHEMA: "staging",
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: { auth: { getSession: () => h.sessaoTreino() }, functions: { invoke: vi.fn() } },
}));

import { TEMPO_FUNCAO_MS } from "@/integrations/repeticao";
import { ErroFonte } from "@/evolucao/fontes";
import { carregarTreinoDoPainel } from "@/painel/aluno/avaliacao/fontes";
import { EdgeError, listarAlunos } from "@/lib/saasApi";
import { carregarEditorLeitura, ErroTreinoPainel } from "@/treino/editor/api";

/** O servidor que pendura: o fetch falso só termina quando o sinal aborta. */
const pendurado = () =>
  vi.fn(
    (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError")))),
  );

/** Dispara `chamar` e devolve como estava depois de cada passo do relógio falso ("esperando", o erro ou "ok"). */
async function depoisDe(chamar: () => Promise<unknown>, passos: number[]) {
  let fim: unknown = "esperando";
  void chamar().then(
    () => (fim = "ok"),
    (e: unknown) => (fim = e),
  );
  const vistos: unknown[] = [];
  for (const ms of passos) {
    await vi.advanceTimersByTimeAsync(ms);
    vistos.push(fim);
  }
  return vistos;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("hml-14 (D5): treino-leitura e invokeEdge desistem em 25 s, 1 vez só", () => {
  it("o tempo é o de função: 25 s", () => {
    expect(TEMPO_FUNCAO_MS).toBe(25_000);
  });

  it("editor do treino (só leitura, a nutricionista): a treino-leitura que pendura vira \"sem_internet\" aos 25 s", async () => {
    const fetchMock = pendurado();
    vi.stubGlobal("fetch", fetchMock);
    const [antes, depois] = await depoisDe(() => carregarEditorLeitura("aluno-1"), [TEMPO_FUNCAO_MS - 1, 1]);
    expect(antes).toBe("esperando");
    expect(depois).toBeInstanceOf(ErroTreinoPainel);
    expect((depois as ErroTreinoPainel).codigo).toBe("sem_internet");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/functions\/v1\/treino-leitura$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-principal");
  });

  it("Avaliação do aluno no painel: a treino-leitura que pendura vira ErroFonte(\"treino\", \"sem_internet\") aos 25 s", async () => {
    const f = pendurado();
    const [antes, depois] = await depoisDe(() => carregarTreinoDoPainel("aluno-1", f as unknown as typeof fetch), [TEMPO_FUNCAO_MS - 1, 1]);
    expect(antes).toBe("esperando");
    expect(depois).toBeInstanceOf(ErroFonte);
    expect([(depois as ErroFonte).parte, (depois as ErroFonte).message]).toEqual(["treino", "sem_internet"]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("invokeEdge (lista de alunos do Treino): a função que pendura é largada aos 25 s e rejeita como a falha de rede", async () => {
    const fetchMock = pendurado();
    vi.stubGlobal("fetch", fetchMock);
    const [antes, depois] = await depoisDe(() => listarAlunos({ limit: 100, offset: 0 }), [TEMPO_FUNCAO_MS - 1, 1]);
    expect(antes).toBe("esperando");
    expect((depois as Error).name).toBe("AbortError");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/functions\/v1\/admin-list-users$/);
  });

  it("a resposta que chega antes segue igual (403 → EdgeError; 200 → o corpo)", async () => {
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })));
    const erro = await listarAlunos().catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(EdgeError);
    expect(erro).toMatchObject({ message: "forbidden", status: 403 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ users: [], total: 0, limit: 100, offset: 0 }), { status: 200 })));
    expect(await listarAlunos()).toEqual({ users: [], total: 0, limit: 100, offset: 0 });
  });
});
