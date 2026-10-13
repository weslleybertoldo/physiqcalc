// @vitest-environment node
// Physiq hml-21d (H-43 · jeito 2) — a função treinos INTEIRA (supabase/functions/treinos/index.ts + a porta _shared/porta-treino.ts + o JWKS
// do Treino _shared/jwks-treino.ts), rodada no Vitest com o Deno.serve, o createClient do esm.sh e o jose do esm.sh falsos (vi.stubGlobal /
// vi.mock pelo mesmo especificador; nada vai à rede) — o molde do src/integrations/portaPessoa.test.ts da hml-21a. Prova:
//   · as recusas da porta: OPTIONS (o CORS da lista das funções do Treino), 405, 400 schema, 401 sem Bearer, 413, 429 (o freio de 120/min);
//   · o `ler` com o token conferido pelo JWKS do Treino (sem o getUser); vencido/assinatura ruim → 401 sem chamar o Auth; a rede/o JWKS →
//     o getUser de reserva (com o aviso jwks_reserva); as GRAVAÇÕES sempre no getUser;
//   · o cliente da pessoa: a URL e a anon do Treino, o schema do pedido, o Bearer do token do Treino (nenhuma chave secreta);
//   · o MASTER antes do banco (N10): quem não é master (o papel do token) → 403 sem_acesso nas ações do Master e no `ler` com uma consulta
//     do Master, SEM nenhuma ida ao banco; o master passa (o RLS decide de novo); a ação desconhecida → 400 acao_invalida;
//   · o catch final: o erro inesperado → 500 erro_interno + log.excecao (o aviso), sem vazar a mensagem.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_TREINO = "https://treino-de-teste.supabase.co";
const EU = "33333333-3333-4333-8333-333333333333";
const DO_AUTH = "44444444-4444-4444-8444-444444444444";
const M1 = "a1111111-1111-4111-8111-111111111111";

/** Um token do Treino de mentira com o papel no app_metadata (o que o physiq_is_master() lê); a assinatura é a do jose falso. */
const token = (role?: string) => `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: EU, ...(role ? { app_metadata: { role } } : {}) })).toString("base64url")}.assinatura`;

const h = vi.hoisted(() => ({
  clientes: [] as Array<{ url: string; chave: string; opcoes: Record<string, unknown> }>,
  getUser: [] as string[],
  usuarioDoAuth: null as string | null,
  verificados: [] as string[],
  falhaDoJwt: null as unknown,
  banco: [] as unknown[][],
  quebrar: false,
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2.39.0", () => ({
  createClient: (url: string, chave: string, opcoes: Record<string, unknown>) => {
    h.clientes.push({ url, chave, opcoes });
    type Cadeia = Record<string, (...a: unknown[]) => unknown>;
    const cadeia = (registro: unknown[]): Cadeia => {
      const b: Cadeia = {};
      for (const op of ["select", "in", "eq", "is", "or", "order", "limit", "range", "ilike"]) b[op] = (...a: unknown[]) => (registro.push([op, ...a]), b);
      b.single = () => Promise.resolve({ data: { id: "novo" }, error: null });
      b.maybeSingle = () => Promise.resolve({ data: null, error: null });
      b.then = (ok: unknown) => Promise.resolve({ data: [{ id: "x" }], error: null }).then(ok as (v: unknown) => unknown);
      return b;
    };
    return {
      auth: {
        getUser: async (t: string) => {
          h.getUser.push(t);
          return h.usuarioDoAuth ? { data: { user: { id: h.usuarioDoAuth } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
        },
      },
      rpc: (nome: string, args: unknown) => {
        if (h.quebrar) throw new Error("mensagem-interna-do-banco");
        h.banco.push(["rpc", nome, args]);
        return Promise.resolve({ data: nome === "treino_pronto_salvar" ? M1 : { ok: true, itens: [] }, error: null });
      },
      from: (tabela: string) => {
        const registro: unknown[] = ["from", tabela];
        h.banco.push(registro);
        return { select: (...a: unknown[]) => cadeia(registro).select(...a), update: () => cadeia(registro), insert: () => cadeia(registro), delete: () => cadeia(registro) };
      },
      storage: { from: () => ({}) },
    };
  },
}));
vi.mock("https://esm.sh/jose@5.9.6", () => ({
  createRemoteJWKSet: () => "o-conjunto-de-chaves",
  jwtVerify: async (t: string) => {
    h.verificados.push(t);
    if (h.falhaDoJwt) throw h.falhaDoJwt;
    return { payload: { sub: EU, aud: "authenticated" }, protectedHeader: { alg: "ES256" } };
  },
}));
vi.mock("../../supabase/functions/_shared/avisar-erro.ts", () => ({ avisarErro: () => undefined }));

const erroJose = (code: string) => Object.assign(new Error(code), { code });

interface Servida {
  chamar: (corpo: unknown, o?: { metodo?: string; schema?: string | null; auth?: string | null; tamanho?: number; origem?: string }) => Promise<Response>;
  avisos: () => Array<Record<string, unknown>>;
  erros: () => Array<Record<string, unknown>>;
}

/** Importa a função de novo (o freio e o JWKS moram na memória do módulo), com o Deno falso. */
async function servir(): Promise<Servida> {
  vi.resetModules();
  let servido: ((r: Request) => Promise<Response>) | null = null;
  const env: Record<string, string> = { SUPABASE_URL: URL_TREINO, SUPABASE_ANON_KEY: "anon-do-treino" };
  vi.stubGlobal("Deno", { env: { get: (n: string) => env[n] }, serve: (fn: (r: Request) => Promise<Response>) => void (servido = fn) });
  const avisos: string[] = [];
  const erros: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((t: unknown) => void avisos.push(String(t)));
  vi.spyOn(console, "error").mockImplementation((t: unknown) => void erros.push(String(t)));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  // o caminho numa variável: o tsc do app não segue o Deno da função (o mesmo do portaPessoa.test.ts)
  const caminho = "../../supabase/functions/treinos/index.ts";
  await import(/* @vite-ignore */ caminho);
  const chamar: Servida["chamar"] = async (corpo, o = {}) => {
    const headers: Record<string, string> = { Origin: o.origem ?? "https://physiqcalc.com.br", "Content-Type": "application/json" };
    if (o.schema !== null) headers["x-schema"] = o.schema ?? "staging";
    if (o.auth !== null) headers.Authorization = o.auth ?? `Bearer ${token()}`;
    const texto = o.tamanho ? JSON.stringify({ acao: "ler", x: "a".repeat(o.tamanho) }) : JSON.stringify(corpo);
    const metodo = o.metodo ?? "POST";
    return servido!(new Request(`${URL_TREINO}/functions/v1/treinos`, { method: metodo, headers, body: metodo === "POST" ? texto : undefined }));
  };
  const json = (l: string[]) => l.map((a) => JSON.parse(a) as Record<string, unknown>);
  return { chamar, avisos: () => json(avisos), erros: () => json(erros) };
}

beforeEach(() => {
  h.clientes = [];
  h.getUser = [];
  h.usuarioDoAuth = DO_AUTH;
  h.verificados = [];
  h.falhaDoJwt = null;
  h.banco = [];
  h.quebrar = false;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hml-21d — a porta do Treino: as recusas de sempre, antes do banco", () => {
  it("OPTIONS com o CORS da lista das funções do Treino (o APK e o local também); origem de fora → o domínio do site", async () => {
    const p = await servir();
    for (const origem of ["https://physiqcalc.com.br", "https://physiqcalc-staging.vercel.app", "capacitor://localhost", "https://localhost", "http://localhost:8080", "http://localhost:5173", "https://physiqcalc.vercel.app"]) {
      const r = await p.chamar(null, { metodo: "OPTIONS", origem });
      expect([r.status, await r.text(), r.headers.get("Access-Control-Allow-Origin")], origem).toEqual([200, "ok", origem]);
      expect(r.headers.get("Access-Control-Allow-Headers")).toBe("authorization, x-client-info, apikey, content-type, x-schema");
    }
    const fora = await p.chamar(null, { metodo: "OPTIONS", origem: "https://evil.example" });
    expect(fora.headers.get("Access-Control-Allow-Origin")).toBe("https://physiqcalc.com.br");
    expect(h.banco).toEqual([]);
  });

  it("405, 400 schema, 401 sem Bearer/curto, 413 corpo grande — nada vai ao banco nem ao Auth", async () => {
    const p = await servir();
    const casos: Array<[Promise<Response>, number, string]> = [
      [p.chamar(null, { metodo: "GET" }), 405, "metodo"],
      [p.chamar({ acao: "ler" }, { schema: "prod" }), 400, "schema_invalido"],
      [p.chamar({ acao: "ler" }, { auth: null }), 401, "sem_login"],
      [p.chamar({ acao: "ler" }, { auth: "Bearer x" }), 401, "sem_login"],
      [p.chamar({}, { tamanho: 2_000_001 }), 413, "corpo_grande"],
    ];
    for (const [resposta, status, erro] of casos) {
      const r = await resposta;
      expect([r.status, await r.json()]).toEqual([status, { ok: false, erro }]);
    }
    expect([h.banco, h.getUser, h.verificados]).toEqual([[], [], []]);
  });

  it("o cliente da pessoa: a URL e a anon do TREINO, o schema do pedido, o Bearer do token de quem chama (nenhuma chave secreta)", async () => {
    const p = await servir();
    await p.chamar({ acao: "ler", itens: [{ q: "pastas" }] }, { schema: "public" });
    expect(h.clientes).toHaveLength(1);
    expect(h.clientes[0].url).toBe(URL_TREINO);
    expect(h.clientes[0].chave).toBe("anon-do-treino");
    expect(h.clientes[0].opcoes).toMatchObject({ db: { schema: "public" }, global: { headers: { Authorization: `Bearer ${token()}` } } });
  });
});

describe("hml-21d — o token: o JWKS do Treino SÓ no `ler`; as gravações no getUser", () => {
  it("o `ler`: o jose confere (sem o getUser) e o módulo recebe o sub do token; a gravação: o getUser em todo pedido", async () => {
    const p = await servir();
    const r = await p.chamar({ acao: "ler", itens: [{ q: "pastas" }] });
    expect(r.status).toBe(200);
    expect([h.verificados.length, h.getUser]).toEqual([1, []]);
    await p.chamar({ acao: "modelo_editar", id: M1, nome: "x" });
    expect(h.getUser).toEqual([token()]);
    expect(h.verificados).toHaveLength(1);
  });

  it("vencido / assinatura ruim / malformado no `ler` → 401 na hora, sem o Auth nem o banco; a rede ou o JWKS → o getUser de reserva", async () => {
    const p = await servir();
    for (const code of ["ERR_JWT_EXPIRED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWS_INVALID", "ERR_JWT_INVALID"]) {
      h.falhaDoJwt = erroJose(code);
      const r = await p.chamar({ acao: "ler", itens: [{ q: "pastas" }] });
      expect([r.status, await r.json()], code).toEqual([401, { ok: false, erro: "sem_login" }]);
    }
    expect([h.getUser, h.banco]).toEqual([[], []]);
    h.falhaDoJwt = erroJose("ERR_JWKS_TIMEOUT");
    const r = await p.chamar({ acao: "ler", itens: [{ q: "pastas" }] });
    expect(r.status).toBe(200);
    expect(h.getUser).toEqual([token()]);
    expect(p.avisos().filter((a) => a.codigo === "jwks_reserva").map((a) => a.resultado)).toEqual(["err_jwks_timeout"]);
    h.usuarioDoAuth = null;
    const sem = await p.chamar({ acao: "modelo_excluir", id: M1 });
    expect([sem.status, await sem.json()]).toEqual([401, { ok: false, erro: "sem_login" }]);
  });

  it("o freio: 120 pedidos por minuto por pessoa e schema → o 121º = 429 muitas_acoes (sem o banco)", async () => {
    const p = await servir();
    h.usuarioDoAuth = EU; // a mesma pessoa no getUser (as gravações) e no JWKS (o `ler`): o freio é por pessoa
    for (let i = 0; i < 120; i++) expect((await p.chamar({ acao: "acao_que_nao_existe" })).status).toBe(400);
    const r = await p.chamar({ acao: "ler", itens: [{ q: "pastas" }] });
    expect([r.status, await r.json()]).toEqual([429, { ok: false, erro: "muitas_acoes" }]);
    expect((await p.chamar({ acao: "ler", itens: [{ q: "pastas" }] }, { schema: "public" })).status).toBe(200);
  });
});

describe("hml-21d — o MASTER antes do banco (N10) e o despacho", () => {
  it("quem não é master (professor, aluno, sem papel): as 8 ações do Master → 403 sem_acesso, SEM nenhuma ida ao banco", async () => {
    const p = await servir();
    for (const role of ["professor", undefined, "aluno"]) {
      for (const acao of ["treino_pronto_salvar", "treino_pronto_ativo", "exercicio_global_criar", "exercicio_global_editar", "exercicio_global_excluir", "exercicio_global_promover", "grupo_global_criar", "grupo_global_excluir"]) {
        const r = await p.chamar({ acao, id: M1, ativo: true, nome: "x" }, { auth: `Bearer ${token(role)}` });
        expect([r.status, await r.json()], `${role} ${acao}`).toEqual([403, { ok: false, erro: "sem_acesso" }]);
      }
    }
    expect(h.banco).toEqual([]);
  });

  it("o `ler` com uma consulta do Master (em qualquer posição) por quem não é master → 403, nada lido; sem ela → passa", async () => {
    const p = await servir();
    for (const q of ["treinos_prontos_todos", "exercicios_globais", "grupos_globais", "globais_do_grupo"]) {
      const r = await p.chamar({ acao: "ler", itens: [{ q: "pastas" }, { q, pagina: 1, nome: "Peito" }] }, { auth: `Bearer ${token("professor")}` });
      expect([r.status, await r.json()], q).toEqual([403, { ok: false, erro: "sem_acesso" }]);
    }
    expect(h.banco).toEqual([]);
    const ok = await p.chamar({ acao: "ler", itens: [{ q: "pastas" }, { q: "treinos_prontos" }] }, { auth: `Bearer ${token("professor")}` });
    expect(ok.status).toBe(200);
    expect(h.banco.map((x) => x[1])).toEqual(["tb_pastas_treino", "physiq_treinos_prontos"]);
  });

  it("o master (admin ou master no token) passa: o salvar do treino pronto chega à RPC nova (o RLS decide de novo)", async () => {
    const p = await servir();
    const corpo = {
      acao: "treino_pronto_salvar", treino: { codigo: "c", nome: "Treino", objetivo: "manter", nivel: "iniciante", dias_por_semana: 1, divisao: "A", descricao: null, ordem: 1, ativo: true },
      divisoes: [{ letra: "A", nome: "Treino A", dias: ["SEG"], exercicios: [] }],
    };
    for (const role of ["master", "admin"]) {
      const r = await p.chamar(corpo, { auth: `Bearer ${token(role)}` });
      expect([r.status, await r.json()], role).toEqual([200, { ok: true, id: M1 }]);
    }
    expect(h.banco.map((x) => x[1])).toEqual(["treino_pronto_salvar", "treino_pronto_salvar"]);
    const ler = await p.chamar({ acao: "ler", itens: [{ q: "exercicios_globais", pagina: 1 }] }, { auth: `Bearer ${token("master")}` });
    expect(ler.status).toBe(200);
  });

  it("a ação desconhecida → 400 acao_invalida; a recusa do módulo com o status do código (dados_invalidos 400, nao_encontrado …)", async () => {
    const p = await servir();
    const r = await p.chamar({ acao: "tb_exercicios_delete" });
    expect([r.status, await r.json()]).toEqual([400, { ok: false, erro: "acao_invalida" }]);
    const ruim = await p.chamar({ acao: "modelo_editar", id: "x", nome: "a" });
    expect([ruim.status, await ruim.json()]).toEqual([400, { ok: false, erro: "dados_invalidos" }]);
    const ok = await p.chamar({ acao: "modelo_editar", id: M1, nome: "a" });
    expect([ok.status, await ok.json()]).toEqual([200, { ok: true }]);
  });

  it("o catch final: o inesperado → 500 erro_interno + log.excecao (o aviso), sem a mensagem na resposta", async () => {
    const p = await servir();
    h.quebrar = true;
    const r = await p.chamar({ acao: "modelo_ordenar", grupo: M1, ids: [M1] });
    const corpo = await r.json();
    expect([r.status, corpo]).toEqual([500, { ok: false, erro: "erro_interno" }]);
    expect(JSON.stringify(corpo)).not.toContain("mensagem-interna");
    expect(p.erros().map((e) => [e.funcao, e.acao])).toContainEqual(["treinos", "modelo_ordenar"]);
  });
});
