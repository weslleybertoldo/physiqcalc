import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// restaurar-login (30/10/2026) — o lado do APP da chave de volta do Android (src/nucleo/restaurarLogin.ts), com o plugin nativo, o fetch da
// função sem login e o cliente do principal FALSOS. Positivo e negativo: entrar, sem chave, 401, 403, sem rede (sem marca), desligado,
// prazo estourado, o Android sem a API, o site/PWA (nada), criar/renovar/pausar a chave, o Sair (antes do signOut, no máximo 3 s) e a
// sessão derrubada.
const h = vi.hoisted(() => ({
  plataforma: "android",
  plugins: new Set<string>(["RestaurarLogin"]),
  plugin: {
    disponivel: vi.fn(),
    criar: vi.fn(),
    obter: vi.fn(),
    apagar: vi.fn(),
    log: vi.fn(),
  },
  invoke: vi.fn(),
  setSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => h.plataforma,
    isNativePlatform: () => h.plataforma !== "web",
    isPluginAvailable: (n: string) => h.plugins.has(n),
  },
  registerPlugin: () => h.plugin,
}));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_URL: "https://principal.teste.invalid",
  PRINCIPAL_ANON: "anon-principal-de-teste",
  PRINCIPAL_SCHEMA: "staging",
  PRINCIPAL_STORAGE_KEY: "physiq-principal-auth",
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    auth: { setSession: (...a: unknown[]) => h.setSession(...a) },
  },
}));

import {
  MARCA_BEM_VINDO,
  MARCA_CHAVE,
  MARCA_ESPERA,
  MARCA_PAUSA,
  MARCA_TENTADA,
  PRAZOS_RESTAURAR,
  PRAZO_RESTAURAR_MS,
  RECUO_MS,
  RENOVAR_MS,
  _zerarParaTestes,
  bemVindoMostrado,
  bemVindoPendente,
  chaveInvalidadaPelaSenha,
  esquecerChave,
  garantirChave,
  lerMarcaChave,
  ouvirChaveInvalidada,
  semSessaoNaAbertura,
  sessaoDerrubada,
  tentarRestaurar,
} from "./restaurarLogin";

const UID = "f3513284-3e44-40cc-84bb-d7a39a929e8d";
const ID_CHAVE = "5zfRDm2kVVbsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ID_ANTIGA = "sB4hAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OPCOES_ENTRAR = { challenge: "c".repeat(43), rpId: "physiqcalc.com.br", timeout: 60000, userVerification: "discouraged", allowCredentials: [] };
const OPCOES_REGISTRO = { challenge: "r".repeat(43), rp: { id: "physiqcalc.com.br", name: "Physiq" }, user: { id: "AAAA", name: "Physiq", displayName: "Physiq" } };
const RESPOSTA_ANDROID = { id: ID_CHAVE, rawId: ID_CHAVE, type: "public-key", response: { clientDataJSON: "x", authenticatorData: "y", signature: "z" } };
const SESSAO = { access_token: "eyJ.acesso.teste", refresh_token: "r1", expires_in: 3600, expires_at: 1793333333, token_type: "bearer", user: { id: UID } };

type Resposta = { status: number; corpo: unknown } | "rede" | Promise<never>;

/** o que o SessaoProvider passa: o principal.auth.setSession (aqui, o falso) */
const restaurar = (prazos?: Partial<typeof PRAZOS_RESTAURAR>) =>
  tentarRestaurar(async (t) => {
    const r = await h.setSession(t);
    return r.error ? null : r.data.session;
  }, prazos);
/** a espera (o recuo) gravada, em ms a partir de agora (null = nenhuma) */
const espera = () => {
  const v = Number(localStorage.getItem(MARCA_ESPERA));
  return Number.isFinite(v) && v > 0 ? v - Date.now() : null;
};
let respostas: Record<"opcoes" | "entrar", Resposta>;

function servidorRestaurar(r: Partial<Record<"opcoes" | "entrar", Resposta>>) {
  respostas = { opcoes: { status: 200, corpo: { ok: true, opcoes: OPCOES_ENTRAR } }, entrar: { status: 200, corpo: { ok: true, sessao: SESSAO } }, ...r };
}

const pedidosRestaurar = () =>
  h.fetch.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)) as { acao: string });

function android() {
  h.plataforma = "android";
  h.plugins = new Set(["RestaurarLogin"]);
}

beforeEach(() => {
  localStorage.clear();
  _zerarParaTestes();
  android();
  vi.useRealTimers();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
  for (const f of Object.values(h.plugin)) f.mockReset();
  h.plugin.disponivel.mockResolvedValue({ disponivel: true, modelo: "Google Pixel 8", android: "15" });
  h.plugin.criar.mockResolvedValue({ responseJson: JSON.stringify({ id: ID_CHAVE, rawId: ID_CHAVE, type: "public-key", response: {} }), nuvem: false });
  h.plugin.obter.mockResolvedValue({ responseJson: JSON.stringify(RESPOSTA_ANDROID) });
  h.plugin.apagar.mockResolvedValue({ ok: true });
  h.plugin.log.mockResolvedValue(undefined);
  h.invoke.mockReset();
  h.setSession.mockReset();
  h.setSession.mockImplementation(async (s: { access_token: string }) => ({
    data: { session: { access_token: s.access_token, user: { id: UID } } },
    error: null,
  }));
  servidorRestaurar({});
  h.fetch.mockReset();
  h.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const acao = (JSON.parse(String(init.body)) as { acao: "opcoes" | "entrar" }).acao;
    const r = respostas[acao];
    if (r === "rede") throw new TypeError("Failed to fetch");
    const resolvida = await r;
    return new Response(JSON.stringify(resolvida.corpo), { status: resolvida.status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", h.fetch);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("tentarRestaurar — a 1ª abertura no celular novo", () => {
  it("entra: opções (sem login: apikey + x-schema) → o Android assina → entrar → setSession; marca a tentativa, a chave restaurada e o Bem-vindo", async () => {
    const r = await restaurar();
    expect(r).toMatchObject({ tipo: "entrou", sessao: { user: { id: UID } } });
    expect(pedidosRestaurar().map((p) => p.acao)).toEqual(["opcoes", "entrar"]);
    const [url, init] = h.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://principal.teste.invalid/functions/v1/restaurar-login");
    expect(init.headers).toEqual({ "Content-Type": "application/json", apikey: "anon-principal-de-teste", "x-schema": "staging" });
    expect(JSON.stringify(init.headers)).not.toMatch(/Authorization|Bearer/i);
    // o Android recebe as opções do servidor; o servidor recebe a resposta do Android como veio
    expect(JSON.parse(h.plugin.obter.mock.calls[0][0].requestJson)).toEqual(OPCOES_ENTRAR);
    expect(pedidosRestaurar()[1]).toEqual({ acao: "entrar", resposta: RESPOSTA_ANDROID });
    expect(h.setSession).toHaveBeenCalledWith({ access_token: SESSAO.access_token, refresh_token: SESSAO.refresh_token });
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    expect(lerMarcaChave(UID)).toEqual({ em: 0, id: ID_CHAVE, sessao: null });
    expect(bemVindoPendente(UID)).toBe(true);
    expect(h.plugin.log).toHaveBeenCalledWith({ codigo: "restaurado" });
    expect(h.plugin.apagar).not.toHaveBeenCalled();
  });

  it("sem chave no aparelho (NoCredentialException → semChave): tela de entrar, marca a tentativa, nem chama o entrar", async () => {
    h.plugin.obter.mockResolvedValue({ semChave: true });
    expect(await restaurar()).toEqual({ tipo: "sem_chave" });
    expect(pedidosRestaurar().map((p) => p.acao)).toEqual(["opcoes"]);
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    expect(h.setSession).not.toHaveBeenCalled();
    expect(bemVindoPendente(UID)).toBe(false);
  });

  it("401 chave_invalida: o plugin APAGA a chave do aparelho, marca a tentativa e não entra", async () => {
    servidorRestaurar({ entrar: { status: 401, corpo: { ok: false, erro: "chave_invalida" } } });
    expect(await restaurar()).toEqual({ tipo: "recusado", erro: "chave_invalida" });
    expect(h.plugin.apagar).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("403 (conta desativada, e-mail não confirmado, conta real no staging): recusado e marcado, a chave fica", async () => {
    servidorRestaurar({ entrar: { status: 403, corpo: { ok: false, erro: "conta_real_no_staging" } } });
    expect(await restaurar()).toEqual({ tipo: "recusado", erro: "conta_real_no_staging" });
    expect(h.plugin.apagar).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
  });

  it("sem rede (o fetch falha) nas opções ou no entrar: SEM marca — tenta de novo na próxima abertura", async () => {
    servidorRestaurar({ opcoes: "rede" });
    expect(await restaurar()).toEqual({ tipo: "rede" });
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    expect(h.plugin.obter).not.toHaveBeenCalled();
    servidorRestaurar({ entrar: "rede" });
    expect(await restaurar()).toEqual({ tipo: "rede" });
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    servidorRestaurar({});
    expect((await restaurar()).tipo).toBe("entrou");
  });

  it("o recuo (2ª revisão, achado 5): desligado → 24 h sem tentar; 503/429 → 1 h; sem marca definitiva; dentro da espera nem chama", async () => {
    servidorRestaurar({ opcoes: { status: 200, corpo: { ok: false, erro: "desligado" } } });
    expect(await restaurar()).toEqual({ tipo: "desligado" });
    expect(h.plugin.obter).not.toHaveBeenCalled();
    expect(espera()).toBeGreaterThan(RECUO_MS.desligado - 5000);
    // dentro da espera: a abertura nem tenta (nem servidor nem plugin)
    h.fetch.mockClear();
    expect(semSessaoNaAbertura()).toBe("nada");
    expect(await restaurar()).toEqual({ tipo: "pulado" });
    expect(h.fetch).not.toHaveBeenCalled();
    for (const [r, esperado, recuo] of [
      [{ entrar: { status: 200, corpo: { ok: false, erro: "desligado" } } }, "desligado", RECUO_MS.desligado],
      [{ entrar: { status: 503, corpo: { ok: false, erro: "indisponivel" } } }, "servidor", RECUO_MS.servidor],
      [{ opcoes: { status: 429, corpo: { ok: false, erro: "muitas_tentativas" } } }, "servidor", RECUO_MS.servidor],
      [{ entrar: { status: 429, corpo: { ok: false, erro: "muitas_tentativas" } } }, "servidor", RECUO_MS.servidor],
    ] as const) {
      localStorage.removeItem(MARCA_ESPERA);
      servidorRestaurar(r as Parameters<typeof servidorRestaurar>[0]);
      expect(await restaurar()).toEqual({ tipo: esperado });
      expect(espera()).toBeGreaterThan(recuo - 5000);
      expect(espera()).toBeLessThanOrEqual(recuo);
    }
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    expect(h.setSession).not.toHaveBeenCalled();
    expect(h.plugin.apagar).not.toHaveBeenCalled();
  });

  it("só o 401 chave_invalida apaga a chave (2ª revisão, achado 2): 409 tenta na próxima; 403 conferencia_falhou e 400 esperam 7 dias sem apagar; 401 sem o código = servidor", async () => {
    // 409: o desafio repetido ou vencido — nada de marca, de recuo ou de apagar
    servidorRestaurar({ entrar: { status: 409, corpo: { ok: false, erro: "desafio_invalido" } } });
    expect(await restaurar()).toEqual({ tipo: "desafio" });
    expect([localStorage.getItem(MARCA_TENTADA), espera()]).toEqual([null, null]);
    // 403 conferencia_falhou (UP, contador, assinatura…): a chave fica; 7 dias de espera, sem a marca definitiva
    servidorRestaurar({ entrar: { status: 403, corpo: { ok: false, erro: "conferencia_falhou" } } });
    expect(await restaurar()).toEqual({ tipo: "pausa", erro: "conferencia_falhou" });
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    expect(espera()).toBeGreaterThan(RECUO_MS.pausa - 5000);
    expect(semSessaoNaAbertura()).toBe("nada");
    // 400 dados_invalidos: o mesmo
    localStorage.removeItem(MARCA_ESPERA);
    servidorRestaurar({ entrar: { status: 400, corpo: { ok: false, erro: "dados_invalidos" } } });
    expect(await restaurar()).toEqual({ tipo: "pausa", erro: "dados_invalidos" });
    // um 401 SEM o chave_invalida (o gateway, p. ex. com o verify_jwt ligado por engano): não apaga — servidor, 1 h
    localStorage.removeItem(MARCA_ESPERA);
    servidorRestaurar({ entrar: { status: 401, corpo: { code: 401, message: "Missing authorization header" } } });
    expect(await restaurar()).toEqual({ tipo: "servidor" });
    expect(espera()).toBeLessThanOrEqual(RECUO_MS.servidor);
    expect(h.plugin.apagar).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    expect(h.plugin.log.mock.calls.map((c) => c[0].codigo)).toEqual(["restauracao_desafio", "restauracao_pausa", "restauracao_pausa", "restauracao_servidor"]);
  });

  it("o prazo (~8 s) estourado: tela de entrar sem marca; o 'sem chave' que chega DEPOIS marca; a sessão que chega depois não entra", async () => {
    vi.useFakeTimers();
    let soltar: (v: unknown) => void = () => undefined;
    h.plugin.obter.mockReturnValue(new Promise((ok) => (soltar = ok)));
    const p = restaurar();
    await vi.advanceTimersByTimeAsync(PRAZOS_RESTAURAR.ateAChaveMs + 10);
    expect(await p).toEqual({ tipo: "prazo" });
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
    expect(espera()).toBeNull();
    soltar({ semChave: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");

    localStorage.clear();
    let liberarEntrar: (v: { status: number; corpo: unknown }) => void = () => undefined;
    h.plugin.obter.mockResolvedValue({ responseJson: JSON.stringify(RESPOSTA_ANDROID) });
    servidorRestaurar({ entrar: new Promise((ok) => (liberarEntrar = ok)) as unknown as Resposta });
    const p2 = restaurar();
    await vi.advanceTimersByTimeAsync(PRAZOS_RESTAURAR.ateAChaveMs + 10);
    expect(await p2).toEqual({ tipo: "prazo" });
    liberarEntrar({ status: 200, corpo: { ok: true, sessao: SESSAO } });
    await vi.advanceTimersByTimeAsync(50);
    expect(h.setSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
  });

  it("os prazos (2ª revisão, achado 4): a chave obtida aos 7 s ainda entra — o entrar ganha 4 s próprios (até os 11 s); o teto é 12 s", async () => {
    vi.useFakeTimers();
    let soltarChave: () => void = () => undefined;
    h.plugin.obter.mockReturnValue(new Promise((ok) => (soltarChave = () => ok({ responseJson: JSON.stringify(RESPOSTA_ANDROID) }))));
    let liberarEntrar: (v: { status: number; corpo: unknown }) => void = () => undefined;
    servidorRestaurar({ entrar: new Promise((ok) => (liberarEntrar = ok)) as unknown as Resposta });
    const p = restaurar();
    await vi.advanceTimersByTimeAsync(7_000);
    soltarChave();
    await vi.advanceTimersByTimeAsync(2_500); // 9,5 s: o prazo de 8 s já teria cortado
    liberarEntrar({ status: 200, corpo: { ok: true, sessao: SESSAO } });
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toMatchObject({ tipo: "entrou" });
    expect(h.setSession).toHaveBeenCalledTimes(1);

    // a chave aos 7 s e o entrar que não responde: o prazo vem aos 11 s (não aos 8), e a sessão que chega depois não é gravada
    localStorage.clear();
    h.setSession.mockClear();
    h.plugin.obter.mockReturnValue(new Promise((ok) => (soltarChave = () => ok({ responseJson: JSON.stringify(RESPOSTA_ANDROID) }))));
    servidorRestaurar({ entrar: new Promise((ok) => (liberarEntrar = ok)) as unknown as Resposta });
    let fim = "";
    const p2 = restaurar().then((r) => (fim = r.tipo));
    await vi.advanceTimersByTimeAsync(7_000);
    soltarChave();
    await vi.advanceTimersByTimeAsync(3_900);
    expect(fim).toBe("");
    await vi.advanceTimersByTimeAsync(200);
    await p2;
    expect(fim).toBe("prazo");
    liberarEntrar({ status: 200, corpo: { ok: true, sessao: SESSAO } });
    await vi.advanceTimersByTimeAsync(50);
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("os prazos: a sessão que o servidor entregou DENTRO do prazo é gravada mesmo que o setSession passe do prazo (nunca 'prazo' com a sessão gravada)", async () => {
    vi.useFakeTimers();
    let liberarEntrar: (v: { status: number; corpo: unknown }) => void = () => undefined;
    servidorRestaurar({ entrar: new Promise((ok) => (liberarEntrar = ok)) as unknown as Resposta });
    let soltarSessao: () => void = () => undefined;
    h.setSession.mockImplementation(
      (s: { access_token: string }) =>
        new Promise((ok) => (soltarSessao = () => ok({ data: { session: { access_token: s.access_token, user: { id: UID } } }, error: null }))),
    );
    let fim = "";
    const p = restaurar().then((r) => (fim = r.tipo));
    await vi.advanceTimersByTimeAsync(7_500); // a sessão chega aos 7,5 s: dentro do prazo (a chave veio na hora → 8 s)
    liberarEntrar({ status: 200, corpo: { ok: true, sessao: SESSAO } });
    await vi.advanceTimersByTimeAsync(10);
    expect(h.setSession).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000); // o setSession (o GET /user) lento passa dos 8 s
    expect(fim).toBe("");
    soltarSessao();
    await vi.advanceTimersByTimeAsync(10);
    await p;
    expect(fim).toBe("entrou");
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
  });

  it("os números da 2ª revisão (achados 4 e 5): até a chave 8 s, o entrar 4 s, o mínimo 2,5 s, o teto 12 s; o recuo 24 h, 1 h e 7 dias", () => {
    expect(PRAZOS_RESTAURAR).toEqual({ ateAChaveMs: 8_000, doEntrarMs: 4_000, minimoEntrarMs: 2_500, totalMs: 12_000 });
    expect(PRAZO_RESTAURAR_MS).toBe(12_000);
    expect(RECUO_MS).toEqual({ desligado: 24 * 60 * 60 * 1000, servidor: 60 * 60 * 1000, pausa: 7 * 24 * 60 * 60 * 1000 });
  });

  it("os prazos: com menos de 2,5 s até o teto, o entrar NEM começa (o servidor gastaria o desafio e 1 das 3 entradas da hora)", async () => {
    vi.useFakeTimers();
    let soltarChave: () => void = () => undefined;
    h.plugin.obter.mockReturnValue(new Promise((ok) => (soltarChave = () => ok({ responseJson: JSON.stringify(RESPOSTA_ANDROID) }))));
    // um prazo até a chave quase do tamanho do teto: a chave aos 10,5 s deixa só 1,5 s
    const p = restaurar({ ateAChaveMs: 11_000, totalMs: 12_000 });
    await vi.advanceTimersByTimeAsync(10_500);
    soltarChave();
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toEqual({ tipo: "prazo" });
    expect(pedidosRestaurar().map((x) => x.acao)).toEqual(["opcoes"]);
    expect(h.setSession).not.toHaveBeenCalled();
  });

  it("o Android sem a API (flag do Google desligada: indisponivel_17): marca e não chama o entrar; disponivel false: nem chama o servidor", async () => {
    h.plugin.obter.mockResolvedValue({ indisponivel: true, motivo: "17" });
    expect(await restaurar()).toEqual({ tipo: "indisponivel" });
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    localStorage.clear();
    _zerarParaTestes();
    h.fetch.mockClear();
    h.plugin.disponivel.mockResolvedValue({ disponivel: false, motivo: "sem_play_services" });
    expect(await restaurar()).toEqual({ tipo: "pulado" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
  });

  it("o site/PWA (web), sem internet ou já tentado: nada roda (nem servidor nem plugin)", async () => {
    h.plataforma = "web";
    h.plugins = new Set();
    expect(await restaurar()).toEqual({ tipo: "pulado" });
    android();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    expect(await restaurar()).toEqual({ tipo: "pulado" });
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    localStorage.setItem(MARCA_TENTADA, "1");
    expect(await restaurar()).toEqual({ tipo: "pulado" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.plugin.disponivel).not.toHaveBeenCalled();
  });

  it("a abertura sem sessão: o celular novo restaura; a mesma instalação com chave e sem a sessão guardada é 'derrubada'; com a sessão guardada (rede) nada", () => {
    expect(semSessaoNaAbertura()).toBe("restaurar");
    localStorage.setItem(MARCA_TENTADA, "1");
    expect(semSessaoNaAbertura()).toBe("nada");
    localStorage.clear();
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now(), id: ID_CHAVE }));
    expect(semSessaoNaAbertura()).toBe("derrubada");
    localStorage.setItem("physiq-principal-auth", "{}");
    expect(semSessaoNaAbertura()).toBe("nada");
    localStorage.clear();
    h.plataforma = "web";
    expect(semSessaoNaAbertura()).toBe("nada");
  });
});

describe("garantirChave — criar a chave com sessão", () => {
  it("sem marca: opções (como a pessoa) → o Android cria → registrar com o aparelho; marca; a 2ª chamada não faz nada (em dia)", async () => {
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes" ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null } : { data: { ok: true, credencial: ID_CHAVE }, error: null });
    expect(await garantirChave(UID)).toBe("registrada");
    expect(h.invoke.mock.calls.map((c) => [c[0], (c[1] as { body: { acao: string } }).body.acao])).toEqual([
      ["chave-restauracao", "opcoes"], ["chave-restauracao", "registrar"],
    ]);
    expect(JSON.parse(h.plugin.criar.mock.calls[0][0].requestJson)).toEqual(OPCOES_REGISTRO);
    expect(h.invoke.mock.calls[1][1]).toEqual({
      body: {
        acao: "registrar", resposta: { id: ID_CHAVE, rawId: ID_CHAVE, type: "public-key", response: {} }, nuvem: false, substitui: null,
        aparelho: { modelo: "Google Pixel 8", android: "15" }, versao: null,
      },
    });
    expect(lerMarcaChave(UID)?.id).toBe(ID_CHAVE);
    expect(h.plugin.log).toHaveBeenCalledWith({ codigo: "chave_registrada_local" });
    h.invoke.mockClear();
    expect(await garantirChave(UID)).toBe("em_dia");
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("a marca com mais de 6 meses (ou a da restauração, em 0): renova mandando o substitui = a chave antiga deste aparelho", async () => {
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now() - RENOVAR_MS - 1000, id: ID_ANTIGA }));
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes" ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null } : { data: { ok: true, credencial: ID_CHAVE }, error: null });
    h.plugin.criar.mockResolvedValue({ responseJson: JSON.stringify({ id: ID_CHAVE }), nuvem: true });
    expect(await garantirChave(UID)).toBe("registrada");
    expect((h.invoke.mock.calls[1][1] as { body: Record<string, unknown> }).body).toMatchObject({ substitui: ID_ANTIGA, nuvem: true });
    expect(lerMarcaChave(UID)).toMatchObject({ id: ID_CHAVE });
    expect(Date.now() - lerMarcaChave(UID)!.em).toBeLessThan(5000);
  });

  it("a marca guarda o session_id: a mesma sessão está em dia; OUTRA sessão (a chave morreu no servidor com a antiga) recria com o substitui", async () => {
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes" ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null } : { data: { ok: true, credencial: ID_CHAVE }, error: null });
    expect(await garantirChave(UID, "sessao-1")).toBe("registrada");
    expect(lerMarcaChave(UID)).toMatchObject({ id: ID_CHAVE, sessao: "sessao-1" });
    h.invoke.mockClear();
    expect(await garantirChave(UID, "sessao-1")).toBe("em_dia");
    expect(h.invoke).not.toHaveBeenCalled();
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes" ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null } : { data: { ok: true, credencial: ID_ANTIGA }, error: null });
    expect(await garantirChave(UID, "sessao-2")).toBe("registrada");
    expect((h.invoke.mock.calls[1][1] as { body: Record<string, unknown> }).body).toMatchObject({ acao: "registrar", substitui: ID_CHAVE });
    expect(lerMarcaChave(UID)).toMatchObject({ id: ID_ANTIGA, sessao: "sessao-2" });
  });

  it("a senha trocada pelo app: a marca sai e quem ouve é avisado (recria na hora); o garantirChave em curso não grava a marca da chave apagada", async () => {
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now(), id: ID_CHAVE, sessao: "sessao-1" }));
    const ouvinte = vi.fn();
    const parar = ouvirChaveInvalidada(ouvinte);
    chaveInvalidadaPelaSenha();
    expect(lerMarcaChave(UID)).toBeNull();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    parar();
    chaveInvalidadaPelaSenha();
    expect(ouvinte).toHaveBeenCalledTimes(1);

    // com uma criação no meio: ela não grava a marca, e o pedido que chegou no meio roda depois (a chave nova, registrada)
    let soltarRegistrar: (v: unknown) => void = () => undefined;
    let registros = 0;
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) => {
      if (o.body.acao === "opcoes") return { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null };
      registros++;
      return registros === 1 ? new Promise((ok) => (soltarRegistrar = ok)) : { data: { ok: true, credencial: ID_ANTIGA }, error: null };
    });
    const p = garantirChave(UID, "sessao-1");
    await vi.waitFor(() => expect(registros).toBe(1));
    chaveInvalidadaPelaSenha();
    expect(await garantirChave(UID, "sessao-1")).toBe("pulado");
    soltarRegistrar({ data: { ok: true, credencial: ID_CHAVE }, error: null });
    await p;
    await vi.waitFor(() => expect(lerMarcaChave(UID)).toMatchObject({ id: ID_ANTIGA, sessao: "sessao-1" }));
    expect(registros).toBe(2);
  });

  it("o desafio de registro vencido (409 desafio_vencido, 2ª revisão achado 3): pede de novo NA HORA e registra; sem a pausa de 7 dias", async () => {
    let registros = 0;
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) => {
      if (o.body.acao === "opcoes") return { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null };
      registros++;
      return registros === 1
        ? { data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "desafio_vencido" }), { status: 409 }) } }
        : { data: { ok: true, credencial: ID_CHAVE }, error: null };
    });
    expect(await garantirChave(UID, "sessao-1")).toBe("registrada");
    // 2 voltas: o Android trocou a chave na 1ª; a 2ª registra a que ficou no aparelho
    expect(h.plugin.criar).toHaveBeenCalledTimes(2);
    expect(h.invoke.mock.calls.map((c) => (c[1] as { body: { acao: string } }).body.acao)).toEqual(["opcoes", "registrar", "opcoes", "registrar"]);
    expect(lerMarcaChave(UID)).toMatchObject({ id: ID_CHAVE, sessao: "sessao-1" });
    expect(localStorage.getItem(MARCA_PAUSA)).toBeNull();

    // 2 vencidos seguidos (na renovação: a marca antiga, de 6+ meses): erro, sem pausa e a marca antiga INTACTA — o aparelho ficou com uma
    // chave que o servidor não conhece, e a marca velha faz a próxima oportunidade tentar de novo (nunca "em dia")
    localStorage.clear();
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now() - RENOVAR_MS - 1000, id: ID_ANTIGA, sessao: "sessao-1" }));
    h.plugin.criar.mockClear();
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes"
        ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null }
        : { data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "desafio_vencido" }), { status: 409 }) } });
    expect(await garantirChave(UID, "sessao-1")).toBe("erro");
    expect(h.plugin.criar).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(MARCA_PAUSA)).toBeNull();
    expect(lerMarcaChave(UID)).toMatchObject({ id: ID_ANTIGA });
    expect(h.plugin.log).toHaveBeenCalledWith({ codigo: "chave_desafio_vencido" });
    // a próxima oportunidade (a próxima abertura com sessão): registra a chave nova e SUBSTITUI a antiga no servidor
    h.invoke.mockClear();
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes" ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null } : { data: { ok: true, credencial: ID_CHAVE }, error: null });
    expect(await garantirChave(UID, "sessao-1")).toBe("registrada");
    expect((h.invoke.mock.calls[1][1] as { body: Record<string, unknown> }).body).toMatchObject({ acao: "registrar", substitui: ID_ANTIGA });
    expect(lerMarcaChave(UID)).toMatchObject({ id: ID_CHAVE, sessao: "sessao-1" });
  });

  it("o servidor desligado: não cria nada, não marca, não pausa", async () => {
    h.invoke.mockResolvedValue({ data: { ok: false, erro: "desligado" }, error: null });
    expect(await garantirChave(UID)).toBe("desligado");
    expect(h.plugin.criar).not.toHaveBeenCalled();
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_PAUSA)).toBeNull();
  });

  it("o Android sem a API ao criar: pausa 7 dias (sem martelar o servidor); a recusa da chave pelo servidor também pausa", async () => {
    h.invoke.mockResolvedValue({ data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null });
    h.plugin.criar.mockResolvedValue({ indisponivel: true, motivo: "17" });
    expect(await garantirChave(UID)).toBe("indisponivel");
    expect(Number(localStorage.getItem(MARCA_PAUSA))).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    h.invoke.mockClear();
    expect(await garantirChave(UID)).toBe("pausado");
    expect(h.invoke).not.toHaveBeenCalled();

    localStorage.clear();
    h.plugin.criar.mockResolvedValue({ responseJson: JSON.stringify({ id: ID_CHAVE }), nuvem: false });
    h.invoke.mockImplementation(async (_f: string, o: { body: { acao: string } }) =>
      o.body.acao === "opcoes"
        ? { data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null }
        : { data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro: "chave_invalida" }), { status: 400 }) } });
    expect(await garantirChave(UID)).toBe("erro");
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_PAUSA)).not.toBeNull();
  });

  it("o servidor recusa o master (conta_master): pausa; a conta com 2 etapas fora do aal2 (precisa_2fa) e o teto (429): não pausam", async () => {
    const recusa = (erro: string, status: number) => ({
      data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status }) },
    });
    for (const [erro, status] of [["precisa_2fa", 403], ["muitas_tentativas", 429]] as const) {
      h.invoke.mockResolvedValue(recusa(erro, status));
      expect(await garantirChave(UID)).toBe("erro");
      expect(localStorage.getItem(MARCA_PAUSA), erro).toBeNull();
    }
    h.invoke.mockResolvedValue(recusa("conta_master", 403));
    expect(await garantirChave(UID)).toBe("erro");
    expect(localStorage.getItem(MARCA_PAUSA)).not.toBeNull();
  });

  it("a rede caindo (FunctionsFetchError): só log — sem marca e sem pausa (tenta na próxima)", async () => {
    h.invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request" } });
    expect(await garantirChave(UID)).toBe("erro");
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_PAUSA)).toBeNull();
  });

  it("o site/PWA (web), sem internet ou sem o plugin: nada roda", async () => {
    h.plataforma = "web";
    expect(await garantirChave(UID)).toBe("pulado");
    android();
    h.plugins = new Set();
    expect(await garantirChave(UID)).toBe("pulado");
    android();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    expect(await garantirChave(UID)).toBe("pulado");
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.plugin.criar).not.toHaveBeenCalled();
  });

  it("o Sair no meio da criação: a chave criada NÃO é registrada e sai do aparelho", async () => {
    let soltarCriar: (v: unknown) => void = () => undefined;
    h.invoke.mockResolvedValue({ data: { ok: true, opcoes: OPCOES_REGISTRO }, error: null });
    h.plugin.criar.mockReturnValue(new Promise((ok) => (soltarCriar = ok)));
    const p = garantirChave(UID);
    await vi.waitFor(() => expect(h.plugin.criar).toHaveBeenCalled());
    const saida = esquecerChave({ uid: UID });
    soltarCriar({ responseJson: JSON.stringify({ id: ID_CHAVE }), nuvem: false });
    expect(await p).toBe("cancelada");
    await saida;
    expect(h.invoke.mock.calls.map((c) => (c[1] as { body: { acao: string } }).body.acao)).toEqual(["opcoes", "apagar"]);
    expect(h.plugin.apagar.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(lerMarcaChave(UID)).toBeNull();
  });
});

describe("esquecerChave e sessaoDerrubada — apagar", () => {
  it("o Sair: o servidor apaga TODAS (como a pessoa) e o plugin apaga a do aparelho; as marcas saem e o aparelho não tenta restaurar", async () => {
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now(), id: ID_CHAVE }));
    localStorage.setItem(MARCA_BEM_VINDO, UID);
    h.invoke.mockResolvedValue({ data: { ok: true, apagadas: 2 }, error: null });
    await esquecerChave({ uid: UID });
    expect(h.invoke).toHaveBeenCalledWith("chave-restauracao", { body: { acao: "apagar", todas: true } });
    expect(h.plugin.apagar).toHaveBeenCalledTimes(1);
    expect(lerMarcaChave(UID)).toBeNull();
    expect(bemVindoPendente(UID)).toBe(false);
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
  });

  it("o Sair local (o master no app): só a chave deste aparelho no servidor; sem a marca do id, o servidor nem é chamado", async () => {
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now(), id: ID_CHAVE }));
    h.invoke.mockResolvedValue({ data: { ok: true, apagadas: 1 }, error: null });
    await esquecerChave({ local: true, uid: UID });
    expect(h.invoke).toHaveBeenCalledWith("chave-restauracao", { body: { acao: "apagar", credencial: ID_CHAVE } });
    h.invoke.mockClear();
    await esquecerChave({ local: true, uid: UID });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.plugin.apagar).toHaveBeenCalledTimes(2);
  });

  it("no máximo 3 s: o servidor que não responde não segura o Sair; sem internet nem chama o servidor (o plugin apaga igual)", async () => {
    vi.useFakeTimers();
    h.invoke.mockReturnValue(new Promise(() => undefined));
    const p = esquecerChave({ uid: UID });
    let fim = false;
    void p.then(() => (fim = true));
    await vi.advanceTimersByTimeAsync(2900);
    expect(fim).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(fim).toBe(true);
    vi.useRealTimers();
    h.invoke.mockClear();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await esquecerChave({ uid: UID });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.plugin.apagar).toHaveBeenCalledTimes(2);
  });

  it("o site/PWA: o Sair (global) apaga as chaves no servidor — derruba as sessões dos aparelhos também —, sem plugin e sem marca", async () => {
    h.plataforma = "web";
    h.plugins = new Set();
    h.invoke.mockResolvedValue({ data: { ok: true, apagadas: 0 }, error: null });
    await esquecerChave({ uid: UID });
    expect(h.invoke).toHaveBeenCalledWith("chave-restauracao", { body: { acao: "apagar", todas: true } });
    expect(h.plugin.apagar).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARCA_TENTADA)).toBeNull();
  });

  it("a sessão derrubada de fora: o plugin apaga, as marcas saem e o aparelho não tenta restaurar; no site, nada", () => {
    localStorage.setItem(MARCA_CHAVE + UID, JSON.stringify({ em: Date.now(), id: ID_CHAVE }));
    sessaoDerrubada();
    expect(h.plugin.apagar).toHaveBeenCalledTimes(1);
    expect(lerMarcaChave(UID)).toBeNull();
    expect(localStorage.getItem(MARCA_TENTADA)).toBe("1");
    expect(h.plugin.log).toHaveBeenCalledWith({ codigo: "sessao_derrubada" });
    h.plataforma = "web";
    sessaoDerrubada();
    expect(h.plugin.apagar).toHaveBeenCalledTimes(1);
  });

  it("o Bem-vindo de volta: pendente só para a pessoa restaurada, e some depois de mostrado", () => {
    localStorage.setItem(MARCA_BEM_VINDO, UID);
    expect(bemVindoPendente(UID)).toBe(true);
    expect(bemVindoPendente("outra")).toBe(false);
    expect(bemVindoPendente(null)).toBe(false);
    bemVindoMostrado();
    expect(bemVindoPendente(UID)).toBe(false);
  });

  it("o log leva só códigos: nenhuma chamada carrega o JSON do Android, a chave, o token ou o id da pessoa", async () => {
    await restaurar();
    const logs = [...h.plugin.log.mock.calls.map((c) => c[0].codigo), ...(console.info as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]))];
    expect(logs.length).toBeGreaterThan(0);
    for (const l of logs) {
      expect(l).not.toContain(ID_CHAVE);
      expect(l).not.toContain(UID);
      expect(l).not.toContain("eyJ");
      expect(l).toMatch(/^(\[RestaurarLogin\] )?[a-z0-9_]+$/);
    }
  });
});
