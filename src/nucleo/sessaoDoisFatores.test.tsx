import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { situacao } from "@/test/fixturesNucleo";

// hml-22 (H-22) — a sessão e o 2FA do master: o `doisFatores` sai da sessão (sem rede), a troca do Treino recusada em aal1 (403
// precisa_2fa) não vira laço nem pausa, e o código certo (MFA_CHALLENGE_VERIFIED, sessão aal2) refaz a troca na hora. Provedor de
// verdade, com os 2 clientes falsos (o molde do sessaoTroca.test.tsx).
const h = vi.hoisted(() => ({
  situacao: null as unknown,
  sessao: null as unknown,
  aoMudar: null as null | ((evento: string, sessao: unknown) => void),
  refresh: 0,
  trocas: 0,
  respostas: [] as Array<{ status: number; corpo: unknown }>,
}));

vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_STORAGE_KEY: "physiq-principal-auth",
  principal: {
    auth: {
      getSession: async () => ({ data: { session: h.sessao } }),
      onAuthStateChange: (cb: (evento: string, sessao: unknown) => void) => {
        h.aoMudar = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      refreshSession: async () => {
        h.refresh++;
        return { data: { session: h.sessao }, error: null };
      },
      signOut: async () => ({}),
    },
    functions: { invoke: async () => ({ data: { situacao: h.situacao }, error: null }) },
    rpc: async () => ({ data: h.situacao, error: null }),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      setSession: async () => ({ data: { session: { user: { id: "t1" } } }, error: null }),
      signOut: async () => ({}),
    },
  },
}));
vi.mock("@/lib/capacitorAuth", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));

import { SessaoProvider, useSessao, type SessaoValor } from "./sessao";
import { pausaDaTroca } from "./trocaToken";

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const token = (aal: string) => `cab.${b64({ sub: "u1", aal })}.ass`;
const fator = { id: "f1", factor_type: "totp", status: "verified", created_at: "2026-10-14T19:00:00Z", updated_at: "2026-10-14T19:00:00Z" };
const sessaoDe = (aal: string, factors?: unknown[]) => ({
  access_token: token(aal),
  refresh_token: "r",
  user: { id: "u1", email: "master.teste@physiqcalc.app", last_sign_in_at: "2026-10-14T19:00:00Z", user_metadata: {}, factors },
});

let atual: SessaoValor | null = null;
function Espiao() {
  atual = useSessao();
  return null;
}

async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function montar() {
  render(
    <SessaoProvider>
      <Espiao />
    </SessaoProvider>,
  );
  await passar(50);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  atual = null;
  h.refresh = 0;
  h.trocas = 0;
  h.respostas = [];
  h.aoMudar = null;
  h.situacao = situacao({ user_id: "u1", master: true, precisa_treino: true, contas: [] });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/functions/v1/trocar-token")) {
      h.trocas++;
      const r = h.respostas.shift() ?? { status: 500, corpo: { error: "x" } };
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const TROCA_OK = { status: 200, corpo: { access_token: "ta", refresh_token: "tr", expires_in: 3600, treino_user_id: "t1", papel: null } };

describe("hml-22 (H-22): a sessão e o 2FA do master", () => {
  it("sem fator (o de hoje): livre e a troca segue igual", async () => {
    h.sessao = sessaoDe("aal1");
    h.respostas = [TROCA_OK];
    await montar();
    expect(atual?.doisFatores).toBe("livre");
    expect(h.trocas).toBe(1);
    expect(atual?.treino).toEqual({ estado: "pronto", erro: null });
    expect(h.refresh).toBe(0);
  });

  it("fator verificado + aal1: pede o código; a troca recusada (403 precisa_2fa) vira dois_fatores — 1 chamada, sem laço e sem pausa", async () => {
    h.sessao = sessaoDe("aal1", [fator]);
    h.respostas = [{ status: 403, corpo: { error: "precisa_2fa" } }];
    await montar();
    expect(atual?.doisFatores).toBe("pede_codigo");
    expect(h.trocas).toBe(1);
    expect(atual?.treino).toEqual({ estado: "erro", erro: "dois_fatores" });
    // relê a sessão 1 vez (a renovação traz os fatores de agora), nada sozinho depois e nenhuma pausa guardada
    expect(h.refresh).toBe(1);
    await passar(10 * 60_000);
    expect(h.trocas).toBe(1);
    expect(pausaDaTroca("u1")).toBeNull();
  });

  it("o código confere (MFA_CHALLENGE_VERIFIED com a sessão aal2): livre e a troca é refeita na hora", async () => {
    h.sessao = sessaoDe("aal1", [fator]);
    h.respostas = [{ status: 403, corpo: { error: "precisa_2fa" } }, TROCA_OK];
    await montar();
    expect(atual?.treino.erro).toBe("dois_fatores");
    await act(async () => {
      h.aoMudar?.("MFA_CHALLENGE_VERIFIED", sessaoDe("aal2", [fator]));
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(atual?.doisFatores).toBe("livre");
    expect(h.trocas).toBe(2);
    expect(atual?.treino).toEqual({ estado: "pronto", erro: null });
  });

  it("aal2 desde o início (o código já foi digitado nesta sessão): livre, a troca normal", async () => {
    h.sessao = sessaoDe("aal2", [fator]);
    h.respostas = [TROCA_OK];
    await montar();
    expect(atual?.doisFatores).toBe("livre");
    expect(atual?.treino).toEqual({ estado: "pronto", erro: null });
  });
});
