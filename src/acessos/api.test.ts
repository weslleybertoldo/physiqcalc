// Physiq W-A P2 — a porta da TELA da aba Acessos (src/acessos/api.ts): a acessos pela principal.functions.invoke (1 chamada, a ação por ÚLTIMO
// no corpo, a frase fixa de cada código, sem internet ANTES de chamar, a rede que cai) e a treino-acessos pelo fetch de 1 tentativa com o token
// do PRINCIPAL e o x-schema (sem sessão → sem_login sem chamar). O cliente falso quebra o teste se alguém falar com o banco direto.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn(), sessao: { access_token: "tok-principal-de-teste" } as { access_token: string } | null }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    auth: { getSession: async () => ({ data: { session: h.sessao } }) },
    from: (t: string) => {
      throw new Error(`tabela direta ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
    storage: {
      from: () => {
        throw new Error("Storage direto");
      },
    },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/lib/avisoDeErro", () => ({ avisarErro: vi.fn() }));

import { STATUS_DO_ERRO_ACESSOS } from "../../supabase-principal/functions/_shared/acessos-regras";
import { STATUS_DO_ERRO_TREINO_ACESSOS } from "../../supabase/functions/_shared/treino-acessos-regras";
import { ErroAcessos, MENSAGEM_ERRO_ACESSOS, lerAcessos, lerSeries, salvarAcesso, salvarSeries } from "./api";

const ALUNO = "11111111-1111-4111-8111-111111111111";
const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const online = (v: boolean) => Object.defineProperty(navigator, "onLine", { value: v, configurable: true });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  h.invoke.mockReset();
  h.sessao = { access_token: "tok-principal-de-teste" };
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  online(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  online(true);
});

describe("W-A P2: a porta da tela — acessos (principal)", () => {
  it("ler: 1 chamada à acessos com { aluno, acao: 'ler' } (a ação por último) e devolve o que veio", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, paciente_id: ALUNO, pode_mudar: true }, error: null });
    await expect(lerAcessos(ALUNO)).resolves.toMatchObject({ ok: true, paciente_id: ALUNO, pode_mudar: true });
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.invoke).toHaveBeenCalledWith("acessos", { body: { aluno: ALUNO, acao: "ler" } });
  });

  it("salvar: { aluno, chave, valor, acao: 'salvar' }", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, linhas: { dieta: "mexer" } }, error: null });
    await salvarAcesso(ALUNO, "dieta", "mexer");
    expect(h.invoke).toHaveBeenCalledWith("acessos", { body: { aluno: ALUNO, chave: "dieta", valor: "mexer", acao: "salvar" } });
  });

  it("o erro da função vira ErroAcessos com a FRASE fixa (nunca a mensagem crua); 1 chamada só", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", context: resposta(409, { ok: false, erro: "sem_nutricao" }) } });
    const e = await salvarAcesso(ALUNO, "dieta", "mexer").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroAcessos);
    expect((e as ErroAcessos).codigo).toBe("sem_nutricao");
    expect((e as ErroAcessos).message).toBe(MENSAGEM_ERRO_ACESSOS.sem_nutricao);
    expect(h.invoke).toHaveBeenCalledTimes(1);
  });

  it("a rede caiu (FunctionsFetchError, sem corpo) → rede; { ok: false } com 200 → o código; sem internet → sem_internet SEM chamar", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError" } });
    await expect(lerAcessos(ALUNO)).rejects.toMatchObject({ codigo: "rede" });
    h.invoke.mockResolvedValueOnce({ data: { ok: false, erro: "sem_acesso" }, error: null });
    await expect(lerAcessos(ALUNO)).rejects.toMatchObject({ codigo: "sem_acesso" });
    online(false);
    h.invoke.mockClear();
    await expect(lerAcessos(ALUNO)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("toda frase existe: os códigos das 2 funções e os da porta (sem_internet, rede)", () => {
    for (const c of [...Object.keys(STATUS_DO_ERRO_ACESSOS), ...Object.keys(STATUS_DO_ERRO_TREINO_ACESSOS), "sem_internet", "rede"]) {
      expect(MENSAGEM_ERRO_ACESSOS[c], c).toBeTruthy();
    }
  });
});

describe("W-A P2: a porta da tela — treino-acessos (o Treino, com o token do PRINCIPAL)", () => {
  it("ler: 1 POST na treino-acessos com o Bearer do principal, o x-schema e { acao: 'ler', aluno }", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true, series: "ver", pode_mudar: true }));
    await expect(lerSeries(ALUNO)).resolves.toEqual({ ok: true, series: "ver", pode_mudar: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://treino.teste.invalid/functions/v1/treino-acessos");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok-principal-de-teste", "x-schema": "staging" });
    expect(JSON.parse(String(init.body))).toEqual({ acao: "ler", aluno: ALUNO });
  });

  it("salvar: { aluno, valor, acao: 'salvar' } → { series, registrado }", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true, series: "mexer", registrado: true }));
    await expect(salvarSeries(ALUNO, "mexer")).resolves.toEqual({ ok: true, series: "mexer", registrado: true });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ aluno: ALUNO, valor: "mexer", acao: "salvar" });
  });

  it("os erros: 403 sem_acesso e 502 principal_indisponivel com o código; corpo ilegível → erro_interno; a rede → rede; 1 tentativa só", async () => {
    fetchMock.mockResolvedValueOnce(resposta(403, { ok: false, erro: "sem_acesso" }));
    await expect(salvarSeries(ALUNO, "ver")).rejects.toMatchObject({ codigo: "sem_acesso" });
    fetchMock.mockResolvedValueOnce(resposta(502, { ok: false, erro: "principal_indisponivel" }));
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "principal_indisponivel" });
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 500 }));
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "erro_interno" });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "rede" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sem sessão do principal → sem_login sem chamar; sem internet → sem_internet sem chamar", async () => {
    h.sessao = null;
    await expect(lerSeries(ALUNO)).rejects.toMatchObject({ codigo: "sem_login" });
    h.sessao = { access_token: "tok-principal-de-teste" };
    online(false);
    await expect(salvarSeries(ALUNO, "ver")).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
