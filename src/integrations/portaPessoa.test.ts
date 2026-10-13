// @vitest-environment node
// Physiq hml-21a (H-109) — a porta do jeito 2 (supabase-principal/functions/_shared/porta-pessoa.ts) com a opção NOVA jwtLeitura: "jwks"
// (a conferência local do token, _shared/jwks-principal.ts). Roda a PORTA DE VERDADE — o Deno.serve, o createClient do esm.sh e o jose do
// esm.sh são falsos (vi.stubGlobal / vi.mock pelo mesmo especificador); nada vai à rede — e prova:
//   · SEM a opção (a nutricao, a financeiro, as da W-A): o caminho de hoje, pedido a pedido — o getUser com o token em TODO pedido (o `ler`
//     também), o jose nunca tocado, e as mesmas respostas de antes (OPTIONS, 405, 400 schema, 401 sem Bearer/sem user, 413, 429, 500);
//   · COM a opção (a conta): SÓ o `acao: "ler"` pula o getUser (o JWKS do principal, o emissor <SUPABASE_URL>/auth/v1, a audiência
//     authenticated); token vencido/assinatura que não confere/malformado → 401 sem chamar o Auth; a rede, o JWKS, a chave, o emissor →
//     o getUser de reserva (com o aviso jwks_reserva no log); as GRAVAÇÕES (qualquer outra ação, o `ler` disfarçado em outro campo) seguem
//     no getUser.
// Cada teste importa a porta de novo (vi.resetModules): o freio e o conjunto de chaves moram na memória do módulo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_PRINCIPAL = "https://ref-de-teste.supabase.co";
const TOKEN = "eyJhbGciOiJFUzI1NiJ9.token-de-teste.assinatura";
const EU = "33333333-3333-4333-8333-333333333333";
const DO_AUTH = "44444444-4444-4444-8444-444444444444";

const h = vi.hoisted(() => ({
  clientes: [] as Array<{ url: string; chave: string; opcoes: Record<string, unknown> }>,
  getUser: [] as string[],
  usuarioDoAuth: null as string | null,
  conjuntos: [] as Array<{ url: string; opcoes: unknown }>,
  verificados: [] as Array<{ token: string; opcoes: unknown }>,
  falhaDoJwt: null as unknown,
  sub: null as unknown,
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2.39.0", () => ({
  createClient: (url: string, chave: string, opcoes: Record<string, unknown>) => {
    h.clientes.push({ url, chave, opcoes });
    return {
      auth: {
        getUser: async (token: string) => {
          h.getUser.push(token);
          return h.usuarioDoAuth ? { data: { user: { id: h.usuarioDoAuth } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
        },
      },
    };
  },
}));
vi.mock("https://esm.sh/jose@5.9.6", () => ({
  createRemoteJWKSet: (url: URL, opcoes: unknown) => {
    h.conjuntos.push({ url: String(url), opcoes });
    return "o-conjunto-de-chaves";
  },
  jwtVerify: async (token: string, _conjunto: unknown, opcoes: unknown) => {
    h.verificados.push({ token, opcoes });
    if (h.falhaDoJwt) throw h.falhaDoJwt;
    return { payload: { sub: h.sub, aud: "authenticated" }, protectedHeader: { alg: "ES256" } };
  },
}));
vi.mock("../../supabase-principal/functions/_shared/avisar-erro.ts", () => ({ avisarErro: () => undefined }));

/** Um erro do jose com o código (o que o jose lança: ERR_JWT_EXPIRED, ERR_JWKS_TIMEOUT…). */
const erroJose = (code: string) => Object.assign(new Error(code), { code });

interface Servida {
  chamar: (corpo: unknown, o?: { metodo?: string; schema?: string | null; auth?: string | null; tamanho?: number }) => Promise<Response>;
  recebidos: Array<{ userId: string; acao: unknown; schema: string }>;
  avisos: () => Array<Record<string, unknown>>;
}

/** Importa a porta de novo, com o Deno falso, e serve uma função de teste (o handler devolve quem chamou). */
async function servir(opcoes: { freio: number; jwtLeitura?: "jwks" }, handler?: (c: { userId: string; corpo: Record<string, unknown> }) => Promise<Response>): Promise<Servida> {
  vi.resetModules();
  let servido: ((r: Request) => Promise<Response>) | null = null;
  const env: Record<string, string> = { SUPABASE_URL: URL_PRINCIPAL, SUPABASE_ANON_KEY: "anon-de-teste" };
  vi.stubGlobal("Deno", { env: { get: (n: string) => env[n] }, serve: (fn: (r: Request) => Promise<Response>) => void (servido = fn) });
  const avisos: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((t: unknown) => void avisos.push(String(t)));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const caminho = "../../supabase-principal/functions/_shared/porta-pessoa.ts";
  const porta = (await import(/* @vite-ignore */ caminho)) as {
    servirComoPessoa: (nome: string, o: unknown, h: (c: { userId: string; corpo: Record<string, unknown>; schema: string; origin: string | null }) => Promise<Response>) => void;
    json: (b: unknown, s: number, o: string | null) => Response;
  };
  const recebidos: Servida["recebidos"] = [];
  porta.servirComoPessoa("conta", opcoes, async (c) => {
    recebidos.push({ userId: c.userId, acao: c.corpo.acao, schema: c.schema });
    if (handler) return handler(c);
    return porta.json({ ok: true, userId: c.userId }, 200, c.origin);
  });
  const chamar: Servida["chamar"] = async (corpo, o = {}) => {
    const headers: Record<string, string> = { Origin: "https://physiqcalc.com.br", "Content-Type": "application/json" };
    if (o.schema !== null) headers["x-schema"] = o.schema ?? "staging";
    if (o.auth !== null) headers.Authorization = o.auth ?? `Bearer ${TOKEN}`;
    const texto = o.tamanho ? JSON.stringify({ acao: "ler", x: "a".repeat(o.tamanho) }) : JSON.stringify(corpo);
    const metodo = o.metodo ?? "POST";
    return servido!(new Request("https://ref-de-teste.supabase.co/functions/v1/conta", { method: metodo, headers, body: metodo === "POST" ? texto : undefined }));
  };
  return { chamar, recebidos, avisos: () => avisos.map((a) => JSON.parse(a) as Record<string, unknown>) };
}

beforeEach(() => {
  h.clientes = [];
  h.getUser = [];
  h.usuarioDoAuth = DO_AUTH;
  h.conjuntos = [];
  h.verificados = [];
  h.falhaDoJwt = null;
  h.sub = EU;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hml-21a — a porta SEM a opção: o caminho de hoje (a nutricao, a financeiro e as funções da W-A não mudam)", () => {
  it("o `ler` e as gravações: o getUser com o token em TODO pedido, o jose nunca tocado; o handler recebe o user do Auth", async () => {
    const p = await servir({ freio: 240 });
    for (const corpo of [{ acao: "ler", itens: [] }, { acao: "perfil_nome", nome: "x" }, {}]) {
      const r = await p.chamar(corpo);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ ok: true, userId: DO_AUTH });
    }
    expect(h.getUser).toEqual([TOKEN, TOKEN, TOKEN]);
    expect(h.conjuntos).toEqual([]);
    expect(h.verificados).toEqual([]);
    expect(p.recebidos.map((x) => x.acao)).toEqual(["ler", "perfil_nome", undefined]);
  });

  it("o cliente da pessoa: a URL e a chave anon do ambiente, o schema do pedido, o Bearer dela (nenhuma chave secreta)", async () => {
    const p = await servir({ freio: 240 });
    await p.chamar({ acao: "ler" }, { schema: "public" });
    expect(h.clientes).toHaveLength(1);
    expect(h.clientes[0].url).toBe(URL_PRINCIPAL);
    expect(h.clientes[0].chave).toBe("anon-de-teste");
    expect(h.clientes[0].opcoes).toMatchObject({ db: { schema: "public" }, global: { headers: { Authorization: `Bearer ${TOKEN}` } } });
  });

  it("as recusas de antes, iguais: OPTIONS (CORS), 405, 400 schema, 401 sem Bearer/curto/sem user, 413 corpo grande, 500 do handler", async () => {
    const p = await servir({ freio: 240 }, async () => {
      throw new Error("o handler quebrou");
    });
    const opcoes = await p.chamar(null, { metodo: "OPTIONS" });
    expect([opcoes.status, await opcoes.text(), opcoes.headers.get("Access-Control-Allow-Origin")]).toEqual([200, "ok", "https://physiqcalc.com.br"]);
    const casos: Array<[Promise<Response>, number, string]> = [
      [p.chamar(null, { metodo: "GET" }), 405, "metodo"],
      [p.chamar({ acao: "ler" }, { schema: "outro" }), 400, "schema_invalido"],
      [p.chamar({ acao: "ler" }, { auth: null }), 401, "sem_login"],
      [p.chamar({ acao: "ler" }, { auth: "Bearer curto" }), 401, "sem_login"],
      [p.chamar({ acao: "ler" }, { tamanho: 2_000_001 }), 413, "corpo_grande"],
    ];
    for (const [resposta, status, erro] of casos) {
      const r = await resposta;
      expect([r.status, ((await r.json()) as { erro: string }).erro]).toEqual([status, erro]);
    }
    // nenhuma dessas chegou ao Auth
    expect(h.getUser).toEqual([]);
    h.usuarioDoAuth = null;
    const semUser = await p.chamar({ acao: "ler" });
    expect([semUser.status, ((await semUser.json()) as { erro: string }).erro]).toEqual([401, "sem_login"]);
    h.usuarioDoAuth = DO_AUTH;
    const quebrou = await p.chamar({ acao: "ler" });
    expect([quebrou.status, ((await quebrou.json()) as { erro: string }).erro]).toEqual([500, "erro_interno"]);
    expect(h.conjuntos).toEqual([]);
  });

  it("o freio por pessoa: o (freio+1)º pedido no minuto → 429 muitas_acoes", async () => {
    const p = await servir({ freio: 3 });
    const status: number[] = [];
    for (let i = 0; i < 4; i++) status.push((await p.chamar({ acao: "ler" })).status);
    expect(status).toEqual([200, 200, 200, 429]);
  });
});

describe("hml-21a (H-109) — a porta COM jwtLeitura: \"jwks\" (a conta): só o `ler` pula o getUser", () => {
  it("o `ler` com o token bom: conferido AQUI — o JWKS do principal, o emissor e a audiência —, SEM o getUser; o handler recebe o `sub`", async () => {
    const p = await servir({ freio: 240, jwtLeitura: "jwks" });
    const r = await p.chamar({ acao: "ler", itens: [{ q: "avisos" }] });
    expect([r.status, await r.json()]).toEqual([200, { ok: true, userId: EU }]);
    expect(h.getUser).toEqual([]);
    expect(h.verificados).toEqual([
      {
        token: TOKEN,
        // revisão da 21a (⚪2): só ES256 e exp/sub obrigatórios
        opcoes: { issuer: `${URL_PRINCIPAL}/auth/v1`, audience: "authenticated", algorithms: ["ES256"], requiredClaims: ["exp", "sub"] },
      },
    ]);
    expect(h.conjuntos).toEqual([{ url: `${URL_PRINCIPAL}/auth/v1/.well-known/jwks.json`, opcoes: { timeoutDuration: 3000 } }]);
    // o conjunto de chaves é 1 por instância (fica na memória)
    await p.chamar({ acao: "ler", itens: [] });
    expect(h.conjuntos).toHaveLength(1);
    expect(h.verificados).toHaveLength(2);
  });

  it("as GRAVAÇÕES seguem no getUser (a revogação vale na hora); o `ler` disfarçado em outro campo também — a porta lê o `acao`", async () => {
    const p = await servir({ freio: 240, jwtLeitura: "jwks" });
    for (const corpo of [{ acao: "perfil_nome", nome: "x" }, { acao: "avisos_marcar_lidos", ids: [] }, { action: "ler", acao: "perfil_foto_tirar" }, { acao: ["ler"] }, {}]) {
      const r = await p.chamar(corpo);
      expect([r.status, await r.json()]).toEqual([200, { ok: true, userId: DO_AUTH }]);
    }
    expect(h.getUser).toHaveLength(5);
    expect(h.verificados).toEqual([]);
  });

  it.each([
    ["vencido", "ERR_JWT_EXPIRED"], ["assinatura que não confere", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED"], ["JWS malformado", "ERR_JWS_INVALID"],
    ["JWT malformado", "ERR_JWT_INVALID"],
  ])("o token %s (%s) → 401 sem_login na hora, sem o Auth e sem o handler", async (_nome, codigo) => {
    const p = await servir({ freio: 240, jwtLeitura: "jwks" });
    h.falhaDoJwt = erroJose(codigo);
    const r = await p.chamar({ acao: "ler", itens: [] });
    expect([r.status, await r.json()]).toEqual([401, { ok: false, erro: "sem_login" }]);
    expect(h.getUser).toEqual([]);
    expect(p.recebidos).toEqual([]);
  });

  it.each([
    ["a rede (o fetch do JWKS caiu)", new TypeError("fetch failed"), "rede"],
    ["o JWKS demorou", erroJose("ERR_JWKS_TIMEOUT"), "err_jwks_timeout"],
    ["a chave não está no conjunto (o token antigo HS256)", erroJose("ERR_JWKS_NO_MATCHING_KEY"), "err_jwks_no_matching_key"],
    ["o JWKS respondeu errado", erroJose("ERR_JOSE_GENERIC"), "err_jose_generic"],
    ["o emissor/a audiência que a instância não conhece", erroJose("ERR_JWT_CLAIM_VALIDATION_FAILED"), "err_jwt_claim_validation_failed"],
  ])("%s → o getUser de reserva decide (como hoje), com o aviso jwks_reserva no log", async (_nome, falha, causa) => {
    const p = await servir({ freio: 240, jwtLeitura: "jwks" });
    h.falhaDoJwt = falha;
    const r = await p.chamar({ acao: "ler", itens: [] });
    expect([r.status, await r.json()]).toEqual([200, { ok: true, userId: DO_AUTH }]);
    expect(h.getUser).toEqual([TOKEN]);
    expect(p.avisos()).toContainEqual(expect.objectContaining({ nivel: "aviso", funcao: "conta", codigo: "jwks_reserva", schema: "staging", resultado: causa }));
    // e se o Auth também recusa, 401 como hoje
    h.usuarioDoAuth = null;
    const r2 = await p.chamar({ acao: "ler", itens: [] });
    expect(r2.status).toBe(401);
  });

  it("o token sem `sub` (ou com um sub que não é uuid) → a reserva (o getUser decide)", async () => {
    const p = await servir({ freio: 240, jwtLeitura: "jwks" });
    for (const sub of [undefined, "anon", 7]) {
      h.sub = sub;
      const r = await p.chamar({ acao: "ler", itens: [] });
      expect(r.status).toBe(200);
    }
    expect(h.getUser).toHaveLength(3);
  });

  it("o freio vale também no caminho local (a mesma chave por pessoa e schema)", async () => {
    const p = await servir({ freio: 2, jwtLeitura: "jwks" });
    const status: number[] = [];
    for (let i = 0; i < 3; i++) status.push((await p.chamar({ acao: "ler", itens: [] })).status);
    expect(status).toEqual([200, 200, 429]);
    expect(h.getUser).toEqual([]);
  });
});

describe("hml-21a (H-109) — jwks-principal: a classificação do erro do jose (pura)", () => {
  it("só os 4 códigos do token que não vale são 401; o resto é a reserva, com a causa curta (minúsculas)", async () => {
    vi.resetModules();
    vi.stubGlobal("Deno", { env: { get: () => URL_PRINCIPAL } });
    const caminho = "../../supabase-principal/functions/_shared/jwks-principal.ts";
    const m = (await import(/* @vite-ignore */ caminho)) as { motivoDaFalha: (e: unknown) => unknown; ERROS_DE_TOKEN_INVALIDO: readonly string[]; JWKS_TEMPO_MS: number };
    expect(m.ERROS_DE_TOKEN_INVALIDO).toEqual(["ERR_JWT_EXPIRED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWS_INVALID", "ERR_JWT_INVALID"]);
    for (const c of m.ERROS_DE_TOKEN_INVALIDO) expect(m.motivoDaFalha(erroJose(c))).toEqual({ motivo: "invalido" });
    expect(m.motivoDaFalha(erroJose("ERR_JWKS_TIMEOUT"))).toEqual({ motivo: "reserva", causa: "err_jwks_timeout" });
    expect(m.motivoDaFalha(new TypeError("x"))).toEqual({ motivo: "reserva", causa: "rede" });
    expect(m.motivoDaFalha(null)).toEqual({ motivo: "reserva", causa: "rede" });
    expect(m.motivoDaFalha({ code: "err_minusculo" })).toEqual({ motivo: "reserva", causa: "rede" });
    expect(m.JWKS_TEMPO_MS).toBe(3000);
  });

  it("sem SUPABASE_URL na instância → a reserva (nunca aceita um token sem conferir)", async () => {
    vi.resetModules();
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    const caminho = "../../supabase-principal/functions/_shared/jwks-principal.ts";
    const m = (await import(/* @vite-ignore */ caminho)) as { conferirJwtLocal: (t: string) => Promise<unknown> };
    expect(await m.conferirJwtLocal(TOKEN)).toEqual({ ok: false, motivo: "reserva", causa: "sem_url" });
    expect(h.verificados).toEqual([]);
  });
});
