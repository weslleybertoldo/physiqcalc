import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { situacao } from "@/test/fixturesNucleo";

// hml-08 — o sair de sempre segue igual (signOut() sem argumento nos 2 bancos: o padrão do supabase-js, que é global); o
// { escopo: "local" } (a conta master que entrou no app — src/ui/casca/MasterSoNoSite.tsx) revoga só a sessão deste aparelho,
// e o login do site continua. Provedor de verdade, com os 2 clientes falsos.
const h = vi.hoisted(() => ({
  sairPrincipal: vi.fn(async (..._a: unknown[]) => ({ error: null })),
  sairTreino: vi.fn(async (..._a: unknown[]) => ({ error: null })),
  situacao: null as unknown,
}));

vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_STORAGE_KEY: "physiq-principal-auth",
  principal: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "token-do-principal", user: { id: "u1", email: "master@teste.com", last_sign_in_at: "2026-10-08T10:00:00Z", user_metadata: {} } } },
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: (...a: unknown[]) => h.sairPrincipal(...a),
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
      signOut: (...a: unknown[]) => h.sairTreino(...a),
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

async function montarLogado() {
  render(
    <SessaoProvider>
      <Espiao />
    </SessaoProvider>,
  );
  await waitFor(() => expect(atual?.usuario?.id).toBe("u1"));
  await waitFor(() => expect(atual?.situacao?.master).toBe(true));
}

beforeEach(() => {
  localStorage.clear();
  atual = null;
  h.sairPrincipal.mockClear();
  h.sairTreino.mockClear();
  h.situacao = situacao({ user_id: "u1", master: true, precisa_treino: false });
});

describe("sair: o de sempre e o local (hml-08)", () => {
  it("sair() de sempre: signOut sem argumento nos 2 bancos, e o login some", async () => {
    await montarLogado();
    await act(async () => {
      await atual!.sair();
    });
    expect(h.sairPrincipal.mock.calls).toEqual([[]]);
    expect(h.sairTreino.mock.calls).toEqual([[]]);
    expect(atual?.usuario).toBeNull();
    expect(atual?.situacao).toBeNull();
  });

  it("sair({ escopo: 'local' }): revoga só a sessão deste aparelho nos 2 bancos, e o login some daqui", async () => {
    await montarLogado();
    await act(async () => {
      await atual!.sair({ escopo: "local" });
    });
    expect(h.sairPrincipal.mock.calls).toEqual([[{ scope: "local" }]]);
    expect(h.sairTreino.mock.calls).toEqual([[{ scope: "local" }]]);
    expect(atual?.usuario).toBeNull();
    expect(atual?.situacao).toBeNull();
  });
});
