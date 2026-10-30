import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { situacao } from "@/test/fixturesNucleo";

// restaurar-login (30/10/2026) — os GANCHOS do SessaoProvider (src/nucleo/sessao.tsx) com o src/nucleo/restaurarLogin.ts de verdade e o
// plugin nativo, o fetch da função sem login e o cliente do principal FALSOS: a restauração ANTES do pronto (entrou → a sessão; prazo
// estourado → tela de entrar), a chave criada em segundo plano com sessão (não master), o Sair apagando ANTES do signOut, a sessão
// derrubada de fora e o site (nada).
const UID = "f3513284-3e44-40cc-84bb-d7a39a929e8d";
const ID_RESTAURADA = "5zfRDm2kVVbsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ID_NOVA = "JUZTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const h = vi.hoisted(() => ({
  ordem: [] as string[],
  sessaoInicial: null as unknown,
  ouvinte: null as null | ((evento: string, s: unknown) => void),
  situacao: null as unknown,
  plataforma: "android",
  plugin: {
    disponivel: vi.fn(),
    criar: vi.fn(),
    obter: vi.fn(),
    apagar: vi.fn(),
    log: vi.fn(),
  },
  chave: vi.fn(),
  setSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => h.plataforma,
    isNativePlatform: () => h.plataforma !== "web",
    isPluginAvailable: (n: string) => h.plataforma !== "web" && n === "RestaurarLogin",
  },
  registerPlugin: () => h.plugin,
}));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_STORAGE_KEY: "physiq-principal-auth",
  PRINCIPAL_URL: "https://principal.teste.invalid",
  PRINCIPAL_ANON: "anon-principal-de-teste",
  PRINCIPAL_SCHEMA: "staging",
  principal: {
    auth: {
      getSession: async () => ({ data: { session: h.sessaoInicial } }),
      onAuthStateChange: (cb: (evento: string, s: unknown) => void) => {
        h.ouvinte = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      setSession: (...a: unknown[]) => h.setSession(...a),
      signOut: async (...a: unknown[]) => {
        h.ordem.push(`signOut${a.length ? ":local" : ""}`);
        h.ouvinte?.("SIGNED_OUT", null);
        return { error: null };
      },
      refreshSession: async () => ({}),
    },
    functions: {
      invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
        if (nome === "pos-login") return { data: { situacao: h.situacao }, error: null };
        if (nome === "chave-restauracao") return h.chave(o.body);
        return { data: null, error: null };
      },
    },
    rpc: async () => ({ data: null, error: null }),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    },
  },
}));
vi.mock("@/lib/capacitorAuth", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("@/lib/profPendente", () => ({ lerProfPendente: () => null, limparProfPendente: () => {} }));
vi.mock("@/push/aparelho", () => ({
  esquecerAparelhoPush: async () => {
    h.ordem.push("push");
  },
}));

import { SessaoProvider, useSessao, type SessaoValor } from "./sessao";
import { MARCA_CHAVE, MARCA_TENTADA, PRAZOS_RESTAURAR, _zerarParaTestes, bemVindoPendente, chaveInvalidadaPelaSenha, lerMarcaChave } from "./restaurarLogin";

let atual: SessaoValor | null = null;
function Espiao() {
  atual = useSessao();
  return null;
}

const montar = () =>
  render(
    <SessaoProvider>
      <Espiao />
    </SessaoProvider>,
  );

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
/** um JWT de mentira com o session_id (o app só lê o claim; quem confere a assinatura é o servidor) */
const tokenDa = (sid: string) => `cab.${b64({ sub: UID, session_id: sid, amr: [{ method: "password", timestamp: 1 }] })}.ass`;
const sessaoDe = (uid: string, sid = "sessao-1") => ({
  access_token: tokenDa(sid), refresh_token: "r1", user: { id: uid, email: "lia@teste.com", last_sign_in_at: "2026-10-30T05:00:00Z", user_metadata: {} },
});
const respostaJson = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function servidorQueAceita() {
  h.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const acao = (JSON.parse(String(init.body)) as { acao: string }).acao;
    h.ordem.push(`restaurar-login:${acao}`);
    return acao === "opcoes"
      ? respostaJson({ ok: true, opcoes: { challenge: "c".repeat(43), rpId: "physiqcalc.com.br" } })
      : respostaJson({ ok: true, sessao: { access_token: "token-do-principal", refresh_token: "r1", expires_in: 3600, user: { id: UID } } });
  });
}

beforeEach(() => {
  localStorage.clear();
  _zerarParaTestes();
  atual = null;
  h.ordem = [];
  h.ouvinte = null;
  h.sessaoInicial = null;
  h.plataforma = "android";
  h.situacao = situacao({ user_id: UID, nome: "Lia Teste", master: false, precisa_treino: false });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  for (const f of Object.values(h.plugin)) f.mockReset();
  h.plugin.disponivel.mockResolvedValue({ disponivel: true, modelo: "Google sdk_gphone64_x86_64", android: "15" });
  h.plugin.obter.mockImplementation(async () => {
    h.ordem.push("obter");
    return { responseJson: JSON.stringify({ id: ID_RESTAURADA, rawId: ID_RESTAURADA, type: "public-key", response: {} }) };
  });
  h.plugin.criar.mockImplementation(async () => {
    h.ordem.push("criar");
    return { responseJson: JSON.stringify({ id: ID_NOVA, rawId: ID_NOVA, type: "public-key", response: {} }), nuvem: false };
  });
  h.plugin.apagar.mockImplementation(async () => {
    h.ordem.push("plugin:apagar");
    return { ok: true };
  });
  h.plugin.log.mockResolvedValue(undefined);
  h.chave.mockReset();
  h.chave.mockImplementation(async (corpo: { acao: string }) => {
    h.ordem.push(`chave-restauracao:${corpo.acao}`);
    if (corpo.acao === "opcoes") return { data: { ok: true, opcoes: { challenge: "r".repeat(43) } }, error: null };
    if (corpo.acao === "registrar") return { data: { ok: true, credencial: ID_NOVA }, error: null };
    return { data: { ok: true, apagadas: 1 }, error: null };
  });
  h.setSession.mockReset();
  h.setSession.mockImplementation(async () => {
    const s = sessaoDe(UID);
    h.ordem.push("setSession");
    // o supabase-js avisa os ouvintes (SIGNED_IN) e devolve a sessão
    h.ouvinte?.("SIGNED_IN", s);
    return { data: { session: s }, error: null };
  });
  h.fetch.mockReset();
  servidorQueAceita();
  vi.stubGlobal("fetch", h.fetch);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SessaoProvider — a restauração na 1ª abertura (antes do pronto)", () => {
  it("o celular novo entra sozinho: o pronto ESPERA a restauração; depois a chave própria deste aparelho substitui a restaurada", async () => {
    let soltar: () => void = () => undefined;
    h.plugin.obter.mockImplementation(() => new Promise((ok) => {
      soltar = () => ok({ responseJson: JSON.stringify({ id: ID_RESTAURADA, rawId: ID_RESTAURADA, type: "public-key", response: {} }) });
    }));
    montar();
    await waitFor(() => expect(h.plugin.obter).toHaveBeenCalled());
    // o Android ainda está buscando a chave: o app segue no Carregando
    expect(atual?.pronto).toBe(false);
    expect(atual?.usuario).toBeNull();
    await act(async () => soltar());
    await waitFor(() => expect(atual?.pronto).toBe(true));
    expect(atual?.usuario?.id).toBe(UID);
    expect(h.ordem.slice(0, 3)).toEqual(["restaurar-login:opcoes", "restaurar-login:entrar", "setSession"]);
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    expect(bemVindoPendente(UID)).toBe(true);
    // com a sessão e a situação: a chave nova deste aparelho, registrada no lugar da restaurada (substitui)
    await waitFor(() => expect(h.chave).toHaveBeenCalledWith(expect.objectContaining({ acao: "registrar", substitui: ID_RESTAURADA })));
    await waitFor(() => expect(lerMarcaChave(UID)?.id).toBe(ID_NOVA));
  });

  it("o prazo (~8 s) estourado: a tela de entrar aparece (pronto sem sessão) e nada é marcado", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    h.plugin.obter.mockImplementation(() => new Promise(() => undefined));
    montar();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRAZOS_RESTAURAR.ateAChaveMs - 500);
    });
    expect(atual?.pronto).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(atual?.pronto).toBe(true);
    expect(atual?.usuario).toBeNull();
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("sem chave no aparelho: tela de entrar logo (sem esperar o prazo) e a marca de tentativa", async () => {
    h.plugin.obter.mockResolvedValue({ semChave: true });
    montar();
    await waitFor(() => expect(atual?.pronto).toBe(true));
    expect(atual?.usuario).toBeNull();
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    expect(h.ordem).toEqual(["restaurar-login:opcoes"]);
  });

  it("o site/PWA: nada roda (nem servidor, nem plugin) e o pronto vem na hora", async () => {
    h.plataforma = "web";
    montar();
    await waitFor(() => expect(atual?.pronto).toBe(true));
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.plugin.disponivel).not.toHaveBeenCalled();
    expect(h.chave).not.toHaveBeenCalled();
  });

  it("a mesma instalação (tinha a chave) sem a sessão guardada: NÃO restaura — apaga a chave do aparelho (sessão derrubada)", async () => {
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now(), id: ID_NOVA }));
    montar();
    await waitFor(() => expect(atual?.pronto).toBe(true));
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.plugin.apagar).toHaveBeenCalledTimes(1);
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
  });
});

describe("SessaoProvider — com sessão: criar a chave, o Sair e a sessão derrubada", () => {
  it("logado (não master): cria a chave em segundo plano depois da situação; o master não cria", async () => {
    h.sessaoInicial = sessaoDe(UID);
    montar();
    await waitFor(() => expect(lerMarcaChave(UID)?.id).toBe(ID_NOVA));
    expect(h.ordem).toEqual(["chave-restauracao:opcoes", "criar", "chave-restauracao:registrar"]);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("a marca guarda a sessão: OUTRA sessão da mesma pessoa (entrou de novo) recria a chave com o substitui; a senha trocada pelo app também", async () => {
    h.sessaoInicial = sessaoDe(UID, "sessao-1");
    montar();
    await waitFor(() => expect(lerMarcaChave(UID)).toMatchObject({ id: ID_NOVA, sessao: "sessao-1" }));
    h.ordem = [];
    await act(async () => {
      h.ouvinte?.("SIGNED_IN", sessaoDe(UID, "sessao-2"));
    });
    await waitFor(() => expect(lerMarcaChave(UID)).toMatchObject({ sessao: "sessao-2" }));
    expect(h.chave).toHaveBeenCalledWith(expect.objectContaining({ acao: "registrar", substitui: ID_NOVA }));
    expect(h.ordem).toEqual(["chave-restauracao:opcoes", "criar", "chave-restauracao:registrar"]);
    // a senha trocada pelo app: o servidor apagou as chaves (gatilho) → a marca sai e a chave volta na hora, na MESMA sessão
    h.ordem = [];
    await act(async () => {
      chaveInvalidadaPelaSenha();
    });
    await waitFor(() => expect(lerMarcaChave(UID)).toMatchObject({ id: ID_NOVA, sessao: "sessao-2" }));
    expect(h.ordem).toEqual(["chave-restauracao:opcoes", "criar", "chave-restauracao:registrar"]);
  });

  it("o master (sai do app) não ganha chave", async () => {
    h.sessaoInicial = sessaoDe(UID);
    h.situacao = situacao({ user_id: UID, master: true });
    montar();
    await waitFor(() => expect(atual?.situacao?.master).toBe(true));
    await act(async () => {
      await new Promise((ok) => setTimeout(ok, 50));
    });
    expect(h.chave).not.toHaveBeenCalled();
    expect(h.plugin.criar).not.toHaveBeenCalled();
  });

  it("o Sair apaga TODAS as chaves no servidor e a do aparelho ANTES do signOut (junto do push); o aparelho não tenta restaurar depois", async () => {
    h.sessaoInicial = sessaoDe(UID);
    montar();
    await waitFor(() => expect(lerMarcaChave(UID)?.id).toBe(ID_NOVA));
    h.ordem = [];
    await act(async () => {
      await atual!.sair();
    });
    const iSignOut = h.ordem.indexOf("signOut");
    expect(iSignOut).toBeGreaterThan(0);
    expect(h.ordem.indexOf("chave-restauracao:apagar")).toBeGreaterThanOrEqual(0);
    expect(h.ordem.indexOf("chave-restauracao:apagar")).toBeLessThan(iSignOut);
    expect(h.ordem.indexOf("plugin:apagar")).toBeLessThan(iSignOut);
    expect(h.ordem.indexOf("push")).toBeLessThan(iSignOut);
    expect(h.chave).toHaveBeenLastCalledWith({ acao: "apagar", todas: true });
    // o SIGNED_OUT do nosso Sair não conta como sessão derrubada (o plugin apaga 1 vez só)
    expect(h.ordem.filter((x) => x === "plugin:apagar")).toHaveLength(1);
    expect(atual?.usuario).toBeNull();
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
  });

  it("o Sair local (o master no app): só a chave deste aparelho no servidor (a da marca)", async () => {
    h.sessaoInicial = sessaoDe(UID);
    montar();
    await waitFor(() => expect(lerMarcaChave(UID)?.id).toBe(ID_NOVA));
    h.ordem = [];
    await act(async () => {
      await atual!.sair({ escopo: "local" });
    });
    expect(h.chave).toHaveBeenLastCalledWith({ acao: "apagar", credencial: ID_NOVA });
    expect(h.ordem.indexOf("chave-restauracao:apagar")).toBeLessThan(h.ordem.indexOf("signOut:local"));
  });

  it("a sessão derrubada de fora (SIGNED_OUT que não veio do nosso Sair, com internet): o plugin apaga a chave do aparelho", async () => {
    h.sessaoInicial = sessaoDe(UID);
    montar();
    await waitFor(() => expect(lerMarcaChave(UID)?.id).toBe(ID_NOVA));
    h.ordem = [];
    await act(async () => {
      h.ouvinte?.("SIGNED_OUT", null);
    });
    expect(atual?.usuario).toBeNull();
    expect(h.ordem).toEqual(["plugin:apagar"]);
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
  });
});
