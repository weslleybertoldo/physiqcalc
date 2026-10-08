import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErroParaAviso, SchemaAviso } from "../../supabase-principal/functions/_shared/erros";
import { criarLog, emSegundoPlano } from "../../supabase-principal/functions/_shared/log";
// Token falso montado aqui: o literal no formato de token do Telegram dispara o secret scanning do GitHub.
const TOKEN_TELEGRAM_FALSO = ["1234567890", "AA" + "Hk3j4k5l6m7n8o9p0qRsTuVwXyZ12345"].join(":");

// PAT falso montado aqui: o literal no formato de um PAT do Supabase trava o push (secret scanning do GitHub).
const PAT_FALSO = ["sbp", "0123456789abcdef".repeat(2) + "01234567"].join("_");

// Homologação hml-10 (H-24 e H-26, D1 e D6) — o log das funções (supabase-principal/functions/_shared/log.ts, cópia idêntica no
// Treino): 1 linha JSON por evento, cada campo no formato fixo (fora dele, "?"), texto livre só limpo; log.erro e log.excecao
// avisam em segundo plano e o aviso nunca derruba a função.
const raiz = resolve(__dirname, "../..");
const bytes = (caminho: string) => readFileSync(resolve(raiz, caminho));

type Saida = { nivel: string; metodo: "log" | "warn" | "error"; linha: Record<string, unknown>; texto: string };
let saidas: Saida[] = [];

beforeEach(() => {
  saidas = [];
  for (const metodo of ["log", "warn", "error"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      const texto = String(args[0]);
      saidas.push({ nivel: "", metodo, linha: JSON.parse(texto) as Record<string, unknown>, texto });
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ultima = () => saidas[saidas.length - 1].linha;
const semAviso = () => criarLog("cobranca-conta", { avisar: null });

describe("1 linha JSON por evento, no nível certo do console", () => {
  it("info → console.log, aviso → console.warn, erro e excecao → console.error; 1 argumento só (a linha JSON)", () => {
    const log = semAviso();
    log.info({ codigo: "pix_criado" });
    log.aviso({ codigo: "captcha_recusado" });
    log.erro({ codigo: "mp_pix_falhou" });
    log.excecao(new Error("x"));
    expect(saidas.map((s) => [s.metodo, s.linha.nivel])).toEqual([
      ["log", "info"],
      ["warn", "aviso"],
      ["error", "erro"],
      ["error", "erro"],
    ]);
    for (const metodo of ["log", "warn", "error"] as const) {
      for (const chamada of vi.mocked(console[metodo]).mock.calls) expect(chamada).toHaveLength(1);
    }
  });

  it("o exemplo da spec D1, campo a campo e na ordem", () => {
    semAviso().erro({
      codigo: "mp_pix_falhou",
      schema: "public",
      acao: "pix_criar",
      ref: "0b9c6f1e-2a3b-4c5d-8e9f-001122334455",
      status: 400,
      externo: { mp_erro: "bad_request", mp_causas: [2067] },
    });
    expect(saidas[0].texto).toBe(
      '{"nivel":"erro","funcao":"cobranca-conta","codigo":"mp_pix_falhou","schema":"public","acao":"pix_criar",' +
        '"ref":"0b9c6f1e-2a3b-4c5d-8e9f-001122334455","status":400,"externo":{"mp_erro":"bad_request","mp_causas":[2067]}}',
    );
  });

  it("o que não vem não aparece (undefined e null somem)", () => {
    semAviso().info({ codigo: "ok", ref: undefined, status: null, externo: null, msg: undefined });
    expect(ultima()).toEqual({ nivel: "info", funcao: "cobranca-conta", codigo: "ok" });
  });
});

describe("cada campo no formato fixo; fora dele vira \"?\"", () => {
  // [campo, valor que passa (e como sai), valor que não passa]
  const CASOS: Array<[string, unknown, unknown, unknown]> = [
    ["codigo", "mp_pix_falhou", "mp_pix_falhou", "Mp Pix"],
    ["codigo", "a".repeat(48), "a".repeat(48), "a".repeat(49)],
    ["schema", "staging", "staging", "producao"],
    ["acao", "pix_criar", "pix_criar", "pix-criar"],
    ["ref", "0b9c6f1e-2a3b-4c5d-8e9f-001122334455", "0b9c6f1e-2a3b-4c5d-8e9f-001122334455", "maria@gmail.com"],
    ["ref", "1325874455", "1325874455", "Maria Silva"],
    ["ref", 1325874455, "1325874455", -1],
    ["ref", "2c938084726fca480172750000000000", "2c938084726fca480172750000000000", "x".repeat(65)],
    ["status", 502, 502, 50.5],
    ["status", 0, 0, 1000],
    ["ms", 12.6, 13, -1],
    ["n", 3, 3, 1.5],
    ["pg", "23505", "23505", "2350"],
    ["pg", "PGRST116", "PGRST116", "duplicate key"],
    ["resultado", "token_invalido", "token_invalido", "Token Inválido"],
    ["aparelho", "…a1B2c3", "…a1B2c3", "fXyz:APA91bH-token-inteiro-do-aparelho"],
  ];

  it.each(CASOS)("%s: %j passa; %j vira \"?\"", (campo, bom, saida, ruim) => {
    const log = semAviso();
    log.info({ codigo: "x", [campo]: bom } as never);
    expect(ultima()[campo]).toEqual(saida);
    log.info({ codigo: "x", [campo]: ruim } as never);
    expect(ultima()[campo]).toBe("?");
  });

  it("nome da função fora de [a-z0-9-] vira \"?\"", () => {
    criarLog("Cobranca Conta", { avisar: null }).info({ codigo: "x" });
    expect(ultima().funcao).toBe("?");
  });

  it("e-mail, nome, JWT, chaves (sb_, sbp_, APP_USR-, TEST-), token do Telegram e URL com query nunca entram nos campos fixos", () => {
    const proibidos = [
      "maria.silva@gmail.com",
      "Maria Silva",
      "José",
      "eyJhbGciOiJIUzI1NiJ9",
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2ln",
      "sb_secret_AbCdEf123456789",
      "sb_publishable_AbCdEf123456",
      PAT_FALSO,
      "APP_USR-1234567890-abcdef",
      "TEST-1234567890-abcdef",
      TOKEN_TELEGRAM_FALSO,
      "https://api.mercadopago.com/v1/payments?access_token=APP_USR-1",
    ];
    const log = semAviso();
    for (const valor of proibidos) {
      log.info({ codigo: valor, acao: valor, ref: valor, resultado: valor, aparelho: valor, pg: valor, externo: { mp_erro: valor, resend_erro: valor, gotrue_codigo: valor, fcm_codigo: valor, treino_erro: valor } });
      const linha = ultima();
      for (const campo of ["codigo", "acao", "ref", "resultado", "aparelho", "pg"]) expect(linha[campo]).toBe("?");
      expect(Object.values(linha.externo as Record<string, unknown>).every((v) => v === "?")).toBe(true);
    }
    expect(saidas.map((s) => s.texto).join("\n")).not.toMatch(/maria|Maria|José|eyJ|sb_|sbp_|APP_USR|TEST-|AAHk3j|mercadopago/);
  });

  it("msg: texto livre entra limpo (e-mail, JWT, chave, URL com query somem) e com até 200 caracteres", () => {
    const log = semAviso();
    log.aviso({
      codigo: "x",
      msg: "falhou para maria@gmail.com com Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc em https://x.com/a?token=sb_secret_AbCdEf123456789",
    });
    expect(ultima().msg).toBe("falhou para [e-mail] com Bearer [token] em https://x.com/a");
    log.aviso({ codigo: "x", msg: "y ".repeat(300) });
    expect(String(ultima().msg).length).toBe(200);
    log.aviso({ codigo: "x", msg: "   " });
    expect(ultima()).not.toHaveProperty("msg");
  });

  it("externo: só as chaves conhecidas (as outras somem), cada uma no formato; não-objeto vira \"?\"", () => {
    const log = semAviso();
    log.erro({
      codigo: "mp_cartao_falhou",
      externo: {
        mp_erro: "bad_request",
        mp_causas: [2067, "3034", "abc", 10_000_000],
        mp_status_detail: "cc_rejected_insufficient_amount",
        resend_erro: "validation_error",
        gotrue_codigo: "email_exists",
        fcm_codigo: "UNREGISTERED",
        treino_erro: "segredo_invalido",
        principal_erro: "usuario_nao_encontrado",
        telegram_id: 4321,
        corpo: { email: "maria@gmail.com" },
        message: "Invalid email maria@gmail.com",
      } as never,
    });
    expect(ultima().externo).toEqual({
      mp_erro: "bad_request",
      mp_causas: [2067, 3034, "?", "?"],
      mp_status_detail: "cc_rejected_insufficient_amount",
      resend_erro: "validation_error",
      gotrue_codigo: "email_exists",
      fcm_codigo: "UNREGISTERED",
      treino_erro: "segredo_invalido",
      principal_erro: "usuario_nao_encontrado",
      telegram_id: 4321,
    });
    expect(saidas[0].texto).not.toContain("maria");
    log.erro({ codigo: "x", externo: "corpo inteiro do MP" as never });
    expect(ultima().externo).toBe("?");
    log.erro({ codigo: "x", externo: { mp_causas: "2067" } });
    expect(ultima().externo).toEqual({ mp_causas: "?" });
  });
});

describe("log.excecao — name, pg e msg limpa; nunca details, hint, pilha ou o objeto", () => {
  it("o erro do PostgREST (objeto com details: a linha com o e-mail) não vaza", () => {
    const erroPostgrest = {
      message: 'duplicate key value violates unique constraint "profiles_email_key"',
      details: "Key (email)=(maria.silva@gmail.com) already exists.",
      hint: "Tente outro e-mail: maria.silva@gmail.com",
      code: "23505",
    };
    semAviso().excecao(erroPostgrest, { acao: "convidar", schema: "staging" });
    expect(ultima()).toEqual({
      nivel: "erro",
      funcao: "cobranca-conta",
      codigo: "excecao",
      schema: "staging",
      acao: "convidar",
      name: "PostgrestError",
      pg: "23505",
      msg: 'duplicate key value violates unique constraint "profiles_email_key"',
    });
    expect(saidas[0].texto).not.toMatch(/maria|details|hint|Key \(/);
  });

  it("Error com pilha: sai o name e a mensagem limpa, sem a pilha; o code do Postgres vira pg", () => {
    const e = Object.assign(new TypeError("falhou para maria@gmail.com"), { code: "P0001" });
    semAviso().excecao(e, { codigo: "cobranca_status", acao: "status", schema: "public" });
    const linha = ultima();
    expect(linha).toMatchObject({ codigo: "cobranca_status", name: "TypeError", pg: "P0001", msg: "falhou para [e-mail]" });
    expect(saidas[0].texto).not.toContain("at ");
    expect(saidas[0].texto).not.toContain("stack");
  });

  it("msg com até 200 caracteres; code fora do formato do Postgres não entra", () => {
    semAviso().excecao(Object.assign(new Error("z ".repeat(300)), { code: "ECONNREFUSED" }));
    expect(String(ultima().msg).length).toBe(200);
    expect(ultima()).not.toHaveProperty("pg");
  });

  it.each([
    ["texto", "falhou para maria@gmail.com", { name: "string", msg: "falhou para [e-mail]" }],
    ["null", null, { name: "null" }],
    ["undefined", undefined, { name: "undefined" }],
    ["número", 42, { name: "number" }],
    ["objeto sem message", { status: 500, corpo: "maria@gmail.com" }, { name: "Object" }],
  ])("lança %s: não quebra e não grava o valor", (_nome, valor, esperado) => {
    semAviso().excecao(valor);
    expect(ultima()).toMatchObject({ nivel: "erro", codigo: "excecao", ...esperado });
    expect(saidas[0].texto).not.toContain("maria");
  });

  it("nunca lança, nem com getter que lança", () => {
    const hostil = Object.defineProperty({}, "message", {
      get() {
        throw new Error("armadilha");
      },
    });
    const log = semAviso();
    expect(() => log.excecao(hostil)).not.toThrow();
    expect(() => log.erro(hostil as never)).not.toThrow();
    expect(() => log.info("texto solto com maria@gmail.com" as never)).not.toThrow();
    expect(saidas.map((s) => s.texto).join("\n")).not.toContain("maria");
    expect(saidas.some((s) => s.linha.codigo === "log_falhou")).toBe(true);
  });
});

describe("o aviso: log.erro e log.excecao avisam em segundo plano; info e aviso nunca", () => {
  function comAviso(resposta?: () => unknown) {
    const chamadas: Array<{ erro: ErroParaAviso; schema: SchemaAviso | null }> = [];
    const log = criarLog("cobranca-conta", {
      avisar: (erro, schema) => {
        chamadas.push({ erro, schema });
        return resposta ? resposta() : Promise.resolve("enviado");
      },
    });
    return { log, chamadas };
  }

  it("info e aviso não avisam; erro e excecao avisam 1× cada, com o erro limpo e o schema", () => {
    const { log, chamadas } = comAviso();
    log.info({ codigo: "a" });
    log.aviso({ codigo: "b" });
    expect(chamadas).toHaveLength(0);
    log.erro({ codigo: "mp_pix_falhou", schema: "staging", acao: "pix_criar", status: 502, ref: "abc", externo: { mp_erro: "bad_request", mp_causas: [2067] } });
    log.excecao({ message: "falhou para maria@gmail.com", details: "Key (email)=(maria@gmail.com)", code: "23505" }, { acao: "status", schema: "public" });
    expect(chamadas).toEqual([
      {
        erro: { origem: "servidor", funcao: "cobranca-conta", codigo: "mp_pix_falhou", acao: "pix_criar", status: 502, mensagem: "mp_erro bad_request · mp_causas 2067" },
        schema: "staging",
      },
      {
        erro: { origem: "servidor", funcao: "cobranca-conta", codigo: "excecao", acao: "status", status: null, mensagem: "PostgrestError · pg 23505 · falhou para [e-mail]" },
        schema: "public",
      },
    ]);
  });

  it("schema fora do formato ou ausente vai como null (o avisar-erro manda como produção)", () => {
    const { log, chamadas } = comAviso();
    log.erro({ codigo: "x", schema: "producao" });
    log.erro({ codigo: "y" });
    expect(chamadas.map((c) => c.schema)).toEqual([null, null]);
  });

  it("a mensagem do aviso: a msg; sem ela, o resumo do externo; sem ele, o pg", () => {
    const { log, chamadas } = comAviso();
    log.erro({ codigo: "a", msg: "sem TURNSTILE_SECRET" });
    log.erro({ codigo: "b", externo: { resend_erro: "validation_error" } });
    log.erro({ codigo: "c", pg: "PGRST116" });
    log.erro({ codigo: "d" });
    expect(chamadas.map((c) => c.erro.mensagem)).toEqual(["sem TURNSTILE_SECRET", "resend_erro validation_error", "pg PGRST116", null]);
  });

  it("aviso que lança ou rejeita nunca derruba a função", async () => {
    const lanca = comAviso(() => {
      throw new Error("Telegram fora");
    });
    expect(() => lanca.log.erro({ codigo: "x" })).not.toThrow();
    const rejeita = comAviso(() => Promise.reject(new Error("Telegram fora")));
    expect(() => rejeita.log.excecao(new Error("y"))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0)); // nenhuma rejeição solta
    expect(lanca.chamadas).toHaveLength(1);
    expect(rejeita.chamadas).toHaveLength(1);
  });

  it("a resposta não espera: o aviso vai para o EdgeRuntime.waitUntil quando ele existe", async () => {
    const pendentes: Promise<unknown>[] = [];
    vi.stubGlobal("EdgeRuntime", { waitUntil: (p: Promise<unknown>) => pendentes.push(p) });
    let terminou = false;
    const { log } = comAviso(() => new Promise((r) => setTimeout(() => r((terminou = true)), 20)));
    log.erro({ codigo: "x" });
    expect(terminou).toBe(false); // o log.erro voltou antes do aviso terminar
    expect(pendentes).toHaveLength(1);
    await Promise.all(pendentes);
    expect(terminou).toBe(true);
  });

  it("emSegundoPlano aceita valor que não é promessa e engole rejeição", async () => {
    const pendentes: Promise<unknown>[] = [];
    vi.stubGlobal("EdgeRuntime", { waitUntil: (p: Promise<unknown>) => pendentes.push(p) });
    emSegundoPlano(undefined);
    emSegundoPlano(Promise.reject(new Error("x")));
    await expect(Promise.all(pendentes)).resolves.toEqual([undefined, undefined]);
  });
});

describe("as 2 cópias (o Treino não enxerga o _shared do principal) são iguais byte a byte", () => {
  it.each([["log.ts"], ["erros.ts"]])("%s", (arquivo) => {
    const principal = bytes(`supabase-principal/functions/_shared/${arquivo}`);
    const treino = bytes(`supabase/functions/_shared/${arquivo}`);
    expect(treino.equals(principal)).toBe(true);
  });
});
