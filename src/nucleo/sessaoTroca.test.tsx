import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { situacao } from "@/test/fixturesNucleo";

// W5 — correção do "painel inteiro trava sem o Treino": a troca de token falhando não pode virar um laço de tentativas que
// gasta o limite de 20/h da trocar-token (nem recarregando a página). Provedor de verdade, com os 2 clientes falsos.
const h = vi.hoisted(() => ({
  situacao: null as unknown,
  chamadas: 0,
  status: 429,
}));

vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_STORAGE_KEY: "physiq-principal-auth",
  principal: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token-do-principal", user: { id: "u1", email: "dono@teste.com", last_sign_in_at: "2026-09-29T10:00:00Z", user_metadata: {} } } },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
      signInWithPassword: async () => ({}),
    },
    functions: { invoke: async () => ({ data: { situacao: h.situacao }, error: null }) },
    rpc: async (nome: string) => (nome === "minha_situacao" ? { data: h.situacao, error: null } : { data: null, error: null }),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      setSession: async () => ({ data: { session: null }, error: { message: "sem sessão" } }),
      signOut: async () => ({}),
    },
  },
}));
vi.mock("@/lib/capacitorAuth", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));

import { SessaoProvider, useSessao, type SessaoValor } from "./sessao";

let atual: SessaoValor | null = null;
function Espiao() {
  atual = useSessao();
  return null;
}

async function montar() {
  const r = render(
    <SessaoProvider>
      <Espiao />
    </SessaoProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  return r;
}

async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  atual = null;
  h.chamadas = 0;
  h.status = 429;
  h.situacao = situacao({ user_id: "u1", precisa_treino: true, contas: [] });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/functions/v1/trocar-token")) {
      h.chamadas++;
      return new Response(JSON.stringify({ error: "x" }), { status: h.status, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("troca de token sem laço (W5)", () => {
  it("429: uma chamada só; nada sozinho depois; recarregar não chama de novo; 'Tentar de novo' = 1 chamada", async () => {
    const r = await montar();
    expect(h.chamadas).toBe(1);
    expect(atual?.treino).toEqual({ estado: "erro", erro: "limite" });
    await passar(10 * 60_000);
    expect(h.chamadas).toBe(1);
    // "recarregar a página": o provedor nasce de novo — a pausa guardada no aparelho segura a troca
    r.unmount();
    await montar();
    expect(h.chamadas).toBe(1);
    expect(atual?.treino).toEqual({ estado: "erro", erro: "limite" });
    // a pessoa toca em "Tentar de novo"
    await act(async () => {
      atual?.tentarTreinoDeNovo();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(h.chamadas).toBe(2);
  });

  it("servidor falhando (503): no máximo 2 tentativas sozinhas, com espera, e depois pausa", async () => {
    h.status = 503;
    await montar();
    expect(h.chamadas).toBe(1);
    await passar(2_100);
    expect(h.chamadas).toBe(2);
    await passar(4_100);
    expect(h.chamadas).toBe(3);
    await passar(30 * 60_000);
    expect(h.chamadas).toBe(3);
    expect(atual?.treino).toEqual({ estado: "erro", erro: "indisponivel" });
  });

  it("sem rede até o Treino (a chamada cai): segue a espera crescente da spec 9 (2 s, 4 s, 8 s…)", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/functions/v1/trocar-token")) {
        h.chamadas++;
        throw new TypeError("Failed to fetch");
      }
      return new Response("{}", { status: 404 });
    }));
    await montar();
    expect(h.chamadas).toBe(1);
    await passar(2_100);
    expect(h.chamadas).toBe(2);
    await passar(4_100);
    expect(h.chamadas).toBe(3);
    await passar(8_100);
    expect(h.chamadas).toBe(4);
    expect(atual?.treino.erro).toBe("rede");
  });
});
