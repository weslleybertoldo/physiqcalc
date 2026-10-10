import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIMITE_CORPO,
  atenderPedido,
  criarAvisador,
  lerAviso,
  type ConfigAviso,
  type CorpoTelegram,
  type DepsPedido,
  type RegistroAviso,
  type RespostaTelegram,
} from "../../supabase-principal/functions/_shared/erro-avisar-regras";
import { assinatura, montarAviso, type ErroParaAviso, type SchemaAviso } from "../../supabase-principal/functions/_shared/erros";
import { criarLog } from "../../supabase-principal/functions/_shared/log";
import { avisarErro as avisarDoTreino } from "../../supabase/functions/_shared/avisar-erro";
import { criarLog as criarLogDoTreino } from "../../supabase/functions/_shared/log";
import { hashHex, segredoAceito } from "../../supabase-principal/functions/_shared/segredo-servidor";
// Token falso montado aqui: o literal no formato de token do Telegram dispara o secret scanning do GitHub.
const TOKEN_TELEGRAM_FALSO = ["1234567890", "AA" + "Hk3j4k5l6m7n8o9p0qRsTuVwXyZ12345"].join(":");

// Homologação hml-10 (H-26, D4 e D6) — o aviso de erro no servidor, com peças falsas (nada vai à rede): a função erro-avisar
// (atenderPedido), o caminho do aviso (criarAvisador: trava na memória → registrar_aviso_erro → Telegram) e o aviso do Banco do
// Treino (que manda à erro-avisar do principal).
// hml-16c (H-51, S7): o Treino manda SEGREDO_AVISO_ERRO; o principal guarda só o hash dele (SEGREDO_AVISO_ERRO_ACEITOS, até 2) e,
// até o F7, ainda aceita o legado ESPELHO_SEGREDO (_shared/segredo-servidor.ts). Valores falsos, feitos aqui.
const SEGREDO = "a1".repeat(32);
const ANTERIOR = "b2".repeat(32); // o valor anterior, durante uma troca
const LEGADO = "c3".repeat(32);
let HASH = "";
let HASH_ANTERIOR = "";
const TOKEN = TOKEN_TELEGRAM_FALSO;
const STAGING = "https://physiqcalc-staging.vercel.app";
const URL_FUNCAO = "https://principal.teste.invalid/functions/v1/erro-avisar";

type Saida = { metodo: "log" | "warn" | "error"; linha: Record<string, unknown>; texto: string };
let saidas: Saida[] = [];
const linhas = (codigo: string) => saidas.filter((s) => s.linha.codigo === codigo).map((s) => s.linha);
const tudoQueFoiProLog = () => saidas.map((s) => s.texto).join("\n");

// o jsdom 20 do Vitest não tem AbortSignal.timeout (o Deno tem): só para o fetch falso do Treino receber um sinal
const semTimeout = typeof (AbortSignal as unknown as { timeout?: unknown }).timeout !== "function";
beforeAll(async () => {
  if (semTimeout) Object.defineProperty(AbortSignal, "timeout", { configurable: true, writable: true, value: () => new AbortController().signal });
  HASH = await hashHex(SEGREDO);
  HASH_ANTERIOR = await hashHex(ANTERIOR);
});
afterAll(() => {
  if (semTimeout) delete (AbortSignal as unknown as { timeout?: unknown }).timeout;
});

beforeEach(() => {
  saidas = [];
  for (const metodo of ["log", "warn", "error"] as const) {
    vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
      const texto = String(args[0]);
      saidas.push({ metodo, linha: JSON.parse(texto) as Record<string, unknown>, texto });
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ───────────────────────── a função erro-avisar ─────────────────────────

function pedido(o: {
  metodo?: string;
  origin?: string;
  segredo?: string;
  schema?: string;
  corpo?: unknown;
  texto?: string;
  url?: string;
  cabecalhos?: Record<string, string>;
}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(o.cabecalhos ?? {}) };
  if (o.origin) headers.Origin = o.origin;
  if (o.segredo !== undefined) headers["x-espelho-segredo"] = o.segredo;
  if (o.schema) headers["x-schema"] = o.schema;
  const metodo = o.metodo ?? "POST";
  const body = metodo === "POST" ? (o.texto ?? JSON.stringify(o.corpo ?? {})) : undefined;
  return new Request(o.url ?? URL_FUNCAO, { method: metodo, headers, body });
}

/**
 * As peças falsas da erro-avisar. O ambiente do principal (o leitor do segredoAceito): sem nada, a lista com o hash do SEGREDO
 * (o que o Treino manda) e o legado (até o F7) — como fica do F4 ao F6 da hml-16c.
 */
function montarDeps(ambiente?: Record<string, string>) {
  const env = ambiente ?? { SEGREDO_AVISO_ERRO_ACEITOS: HASH, ESPELHO_SEGREDO: LEGADO };
  const enviados: Array<{ erro: ErroParaAviso; schema: SchemaAviso }> = [];
  const avisos: Array<{ erro: ErroParaAviso; schema: SchemaAviso | null }> = [];
  const pendentes: Promise<unknown>[] = [];
  const deps: DepsPedido = {
    segredo: (recebido) => segredoAceito(recebido, "SEGREDO_AVISO_ERRO", (nome) => env[nome]),
    enviar: async (erro, schema) => {
      enviados.push({ erro, schema });
      return "enviado";
    },
    log: criarLog("erro-avisar", {
      avisar: (erro, schema) => {
        avisos.push({ erro, schema });
        return Promise.resolve("enviado");
      },
    }),
    emSegundoPlano: (p) => {
      pendentes.push(p);
    },
  };
  return { deps, enviados, avisos, pendentes };
}

const ERRO_DA_TELA = {
  origem: "tela",
  mensagem: "falhou para maria.silva@gmail.com",
  rota: "/painel/alunos/0b9c6f1e-2a3b-4c5d-8e9f-001122334455?aba=1#access_token=eyJhbGciOi",
  lugar: "aba do aluno",
  versao: "3.74",
  plataforma: "app",
};

describe("erro-avisar: quem pode mandar", () => {
  it("OPTIONS: 200 com o CORS de sempre (a Origin da lista volta; fora dela, o site)", async () => {
    const { deps } = montarDeps();
    const r = await atenderPedido(pedido({ metodo: "OPTIONS", origin: STAGING }), deps);
    expect(r.status).toBe(200);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(STAGING);
    expect(r.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(r.headers.get("Access-Control-Allow-Headers")).toBe("authorization, x-client-info, apikey, content-type, x-schema");
    expect(r.headers.get("Vary")).toBe("Origin");
    const fora = await atenderPedido(pedido({ metodo: "OPTIONS", origin: "https://evil.example" }), deps);
    expect(fora.headers.get("Access-Control-Allow-Origin")).toBe("https://physiqcalc.com.br");
  });

  it("só POST: GET → 405", async () => {
    const { deps, enviados } = montarDeps();
    expect((await atenderPedido(pedido({ metodo: "GET", origin: STAGING }), deps)).status).toBe(405);
    expect(enviados).toHaveLength(0);
  });

  it.each([STAGING, "https://physiqcalc.com.br", "https://www.physiqcalc.com.br", "capacitor://localhost", "https://localhost", "http://localhost:5173"])(
    "navegador com a Origin da lista (%s) → 204, e o aviso sai em segundo plano já limpo",
    async (origin) => {
      const { deps, enviados, pendentes } = montarDeps();
      const r = await atenderPedido(pedido({ origin, schema: "staging", corpo: ERRO_DA_TELA }), deps);
      expect(r.status).toBe(204);
      expect(await r.text()).toBe("");
      expect(r.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(pendentes).toHaveLength(1);
      expect(enviados).toEqual([
        {
          erro: { origem: "tela", mensagem: "falhou para [e-mail]", rota: "/painel/alunos/:id", lugar: "aba do aluno", versao: "v3.74", plataforma: "app" },
          schema: "staging",
        },
      ]);
    },
  );

  it.each([undefined, "https://evil.example", "https://physiqcalc.com.br.evil.example", "http://physiqcalc.com.br", "null"])(
    "Origin fora da lista (%s) e sem segredo → 403; nada sai",
    async (origin) => {
      const { deps, enviados, avisos } = montarDeps();
      const r = await atenderPedido(pedido({ origin, schema: "staging", corpo: ERRO_DA_TELA }), deps);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({ ok: false, erro: "origem_recusada" });
      expect(enviados).toHaveLength(0);
      expect(avisos).toHaveLength(0); // recusa fica no log (info), sem aviso
      expect(linhas("pedido_recusado")).toEqual([{ nivel: "info", funcao: "erro-avisar", codigo: "pedido_recusado", status: 403, resultado: "origem_recusada" }]);
    },
  );

  it("segredo errado → 403, mesmo com a Origin certa; segredo curto no servidor → sempre 403", async () => {
    const { deps, enviados } = montarDeps();
    const r = await atenderPedido(pedido({ origin: STAGING, segredo: "x".repeat(64), schema: "staging", corpo: ERRO_DA_TELA }), deps);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, erro: "segredo_invalido" });
    // curto: nem com o hash dele na lista nem como legado
    const curto = montarDeps({ SEGREDO_AVISO_ERRO_ACEITOS: await hashHex("curto"), ESPELHO_SEGREDO: "curto" });
    const r2 = await atenderPedido(pedido({ segredo: "curto", corpo: { origem: "servidor", funcao: "x" } }), curto.deps);
    expect(r2.status).toBe(403);
    expect(enviados).toHaveLength(0);
    expect(curto.enviados).toHaveLength(0);
    expect(linhas("segredo_aceito")).toHaveLength(0);
  });

  it("x-schema fora de public|staging → 400; sem x-schema vale o ?schema= e, sem nada, public", async () => {
    const { deps, enviados } = montarDeps();
    expect((await atenderPedido(pedido({ origin: STAGING, schema: "producao", corpo: ERRO_DA_TELA }), deps)).status).toBe(400);
    expect((await atenderPedido(pedido({ origin: STAGING, schema: "staging;drop", corpo: ERRO_DA_TELA }), deps)).status).toBe(400);
    expect((await atenderPedido(pedido({ origin: STAGING, schema: "STAGING", corpo: ERRO_DA_TELA }), deps)).status).toBe(204);
    expect((await atenderPedido(pedido({ origin: STAGING, url: `${URL_FUNCAO}?schema=staging`, corpo: ERRO_DA_TELA }), deps)).status).toBe(204);
    expect((await atenderPedido(pedido({ origin: STAGING, corpo: ERRO_DA_TELA }), deps)).status).toBe(204);
    expect(enviados.map((e) => e.schema)).toEqual(["staging", "staging", "public"]);
  });
});

describe("erro-avisar (hml-16c, S7): o segredo do Treino — o hash na lista SEGREDO_AVISO_ERRO_ACEITOS e, até o F7, o legado", () => {
  const DO_TREINO = { origem: "servidor", funcao: "trocar-token", codigo: "excecao" };
  const mandar = (deps: DepsPedido, segredo: string) => atenderPedido(pedido({ segredo, schema: "staging", corpo: DO_TREINO }), deps);
  const aceitos = () => linhas("segredo_aceito");

  it("o valor da lista → 204 e o log segredo_aceito (acao aviso_erro, resultado lista) — nunca o valor nem o hash", async () => {
    const { deps, enviados } = montarDeps();
    expect((await mandar(deps, SEGREDO)).status).toBe(204);
    expect(enviados).toHaveLength(1);
    expect(aceitos()).toEqual([{ nivel: "info", funcao: "erro-avisar", codigo: "segredo_aceito", acao: "aviso_erro", resultado: "lista" }]);
    expect(tudoQueFoiProLog()).not.toContain(SEGREDO);
    expect(tudoQueFoiProLog()).not.toContain(HASH);
  });

  it("o legado (até o F7) → 204, com resultado legado no log", async () => {
    const { deps, enviados } = montarDeps();
    expect((await mandar(deps, LEGADO)).status).toBe(204);
    expect(enviados).toHaveLength(1);
    expect(aceitos()).toMatchObject([{ codigo: "segredo_aceito", acao: "aviso_erro", resultado: "legado" }]);
    expect(tudoQueFoiProLog()).not.toContain(LEGADO);
  });

  it("2 hashes na lista (o atual e o anterior, durante a troca) → os 2 passam; um 3º valor recusa (403)", async () => {
    const { deps, enviados } = montarDeps({ SEGREDO_AVISO_ERRO_ACEITOS: `${HASH},${HASH_ANTERIOR}` });
    expect((await mandar(deps, SEGREDO)).status).toBe(204);
    expect((await mandar(deps, ANTERIOR)).status).toBe(204);
    const r = await mandar(deps, "d4".repeat(32));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, erro: "segredo_invalido" });
    expect(enviados).toHaveLength(2);
    expect(aceitos().map((l) => l.resultado)).toEqual(["lista", "lista"]);
  });

  it("sem o legado (depois do F6): o legado recusa e a lista segue valendo", async () => {
    const { deps, enviados } = montarDeps({ SEGREDO_AVISO_ERRO_ACEITOS: HASH });
    expect((await mandar(deps, LEGADO)).status).toBe(403);
    expect((await mandar(deps, SEGREDO)).status).toBe(204);
    expect(enviados).toHaveLength(1);
  });

  it("sem lista e sem legado (nada configurado) → tudo recusa (falha fechada); quem lê a lista não chama com o hash", async () => {
    const vazio = montarDeps({});
    expect((await mandar(vazio.deps, SEGREDO)).status).toBe(403);
    expect((await mandar(vazio.deps, LEGADO)).status).toBe(403);
    const { deps } = montarDeps({ SEGREDO_AVISO_ERRO_ACEITOS: HASH });
    expect((await mandar(deps, HASH)).status).toBe(403);
    expect(aceitos()).toHaveLength(0);
  });
});

describe("erro-avisar: o corpo", () => {
  it("corpo > 2 KB → 413 (contando bytes: acento pesa 2); 2 KB exatos passam", async () => {
    const { deps, enviados } = montarDeps();
    const grande = await atenderPedido(pedido({ origin: STAGING, corpo: { origem: "tela", mensagem: "x".repeat(3000) } }), deps);
    expect(grande.status).toBe(413);
    expect(await grande.json()).toEqual({ ok: false, erro: "corpo_grande" });
    const acentos = await atenderPedido(pedido({ origin: STAGING, corpo: { origem: "tela", mensagem: "é".repeat(1100) } }), deps);
    expect(acentos.status).toBe(413);
    const inicio = '{"origem":"tela","mensagem":"';
    const exato = `${inicio}${"x".repeat(LIMITE_CORPO - inicio.length - 2)}"}`;
    expect(new TextEncoder().encode(exato).length).toBe(2048);
    expect((await atenderPedido(pedido({ origin: STAGING, texto: exato }), deps)).status).toBe(204);
    expect((await atenderPedido(pedido({ origin: STAGING, texto: `${exato} ` }), deps)).status).toBe(413);
    expect(enviados).toHaveLength(1);
  });

  it("Content-Length declarado acima de 2 KB → 413 sem ler o corpo", async () => {
    const { deps } = montarDeps();
    const r = await atenderPedido(pedido({ origin: STAGING, corpo: { origem: "tela" }, cabecalhos: { "Content-Length": "5000" } }), deps);
    expect(r.status).toBe(413);
  });

  it.each([
    ["JSON inválido", "não é json", "json_invalido"],
    ["lista", "[]", "aviso_invalido"],
    ["origem desconhecida", JSON.stringify({ origem: "hacker" }), "aviso_invalido"],
    ["origem servidor pelo navegador", JSON.stringify({ origem: "servidor", funcao: "trocar-token", codigo: "excecao" }), "aviso_invalido"],
    ["função sem nome", JSON.stringify({ origem: "funcao", status: 503 }), "aviso_invalido"],
    ["a própria erro-avisar", JSON.stringify({ origem: "funcao", funcao: "erro-avisar", status: 500 }), "aviso_invalido"],
  ])("%s → 400", async (_nome, texto, erro) => {
    const { deps, enviados } = montarDeps();
    const r = await atenderPedido(pedido({ origin: STAGING, texto }), deps);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, erro });
    expect(enviados).toHaveLength(0);
  });

  it("função que respondeu 5xx (o app viu): nome, banco e status entram; a tela de quem viu também", () => {
    expect(lerAviso({ origem: "funcao", funcao: "painel-resumo-treino", banco: "treino", status: 503, rota: "/painel?x=1", versao: "3.74", plataforma: "site" }, "navegador")).toEqual({
      origem: "funcao",
      funcao: "painel-resumo-treino",
      banco: "treino",
      status: 503,
      mensagem: null,
      rota: "/painel",
      lugar: null,
      versao: "v3.74",
      plataforma: "site",
    });
    expect(lerAviso({ origem: "funcao", funcao: "cobranca-conta", banco: "outro", status: 9999 }, "navegador")).toMatchObject({ banco: "principal", status: null });
  });

  it("o Treino (com o segredo): origem servidor, banco Treino; nome ou código fora do formato não derrubam o aviso", async () => {
    const { deps, enviados } = montarDeps();
    const corpo = { origem: "servidor", funcao: "trocar-token", codigo: "excecao", acao: "trocar", status: 500, mensagem: "TypeError · falhou para maria@x.com" };
    const r = await atenderPedido(pedido({ segredo: SEGREDO, schema: "public", corpo }), deps);
    expect(r.status).toBe(204);
    expect(enviados[0]).toEqual({
      erro: { origem: "servidor", banco: "treino", funcao: "trocar-token", codigo: "excecao", acao: "trocar", status: 500, mensagem: "TypeError · falhou para [e-mail]" },
      schema: "public",
    });
    expect((await atenderPedido(pedido({ segredo: SEGREDO, corpo: { origem: "tela" } }), deps)).status).toBe(400);
    expect((await atenderPedido(pedido({ segredo: SEGREDO, corpo: { origem: "servidor", funcao: "Nome Ruim" } }), deps)).status).toBe(204);
    expect(enviados[1].erro).toMatchObject({ funcao: null, codigo: null, banco: "treino" });
  });
});

describe('erro-avisar: {"teste":"excecao"} — a prova do D6 (catch → log.excecao → aviso)', () => {
  it("com o segredo E no staging: lança dentro do try, o catch final chama log.excecao e o aviso sai", async () => {
    const { deps, avisos, enviados } = montarDeps();
    const r = await atenderPedido(pedido({ segredo: SEGREDO, schema: "staging", corpo: { teste: "excecao" } }), deps);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, erro: "erro_interno" });
    expect(enviados).toHaveLength(0);
    expect(avisos).toEqual([
      {
        erro: {
          origem: "servidor",
          funcao: "erro-avisar",
          codigo: "excecao",
          acao: "teste_hml10",
          status: null,
          mensagem: "Error · teste_hml10: erro de propósito na erro-avisar (prova do catch → aviso)",
        },
        schema: "staging",
      },
    ]);
    expect(linhas("excecao")).toEqual([
      {
        nivel: "erro",
        funcao: "erro-avisar",
        codigo: "excecao",
        schema: "staging",
        acao: "teste_hml10",
        name: "Error",
        msg: "teste_hml10: erro de propósito na erro-avisar (prova do catch → aviso)",
      },
    ]);
    // o texto que chega ao Telegram (o avisar-erro do principal põe banco principal)
    expect(montarAviso({ ...avisos[0].erro, banco: "principal" }, { schema: "staging" })).toContain(
      "🔴 Erro no Physiq [staging]\n📍 função erro-avisar · excecao · ação teste_hml10\n💬 Error · teste_hml10",
    );
  });

  it.each([
    ["com o segredo, na produção", { segredo: SEGREDO, schema: "public" }, { teste: "excecao" }],
    ["pelo navegador, no staging", { origin: STAGING, schema: "staging" }, { teste: "excecao" }],
    ["outro teste", { segredo: SEGREDO, schema: "staging" }, { teste: "outra_coisa" }],
  ])("%s → 403 so_staging, nada lança", async (_nome, quem, corpo) => {
    const { deps, avisos, enviados } = montarDeps();
    const r = await atenderPedido(pedido({ ...quem, corpo }), deps);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ ok: false, erro: "so_staging" });
    expect(avisos).toHaveLength(0);
    expect(enviados).toHaveLength(0);
    expect(linhas("excecao")).toHaveLength(0);
  });
});

// ───────────────────────── o caminho do aviso ─────────────────────────

const OK: RespostaTelegram = { ok: true, status: 200, messageId: 101, descricao: "" };
const ERRO_TELA: ErroParaAviso = { origem: "tela", rota: "/painel", mensagem: "Cannot read properties of undefined (reading 'nome')", versao: "3.74", plataforma: "app" };

function montarAvisador(
  o: { registrar?: (schema: SchemaAviso, r: RegistroAviso) => number | Promise<number>; respostas?: Array<RespostaTelegram | Error>; config?: Partial<ConfigAviso> } = {},
) {
  const telegram: Array<{ token: string; corpo: CorpoTelegram }> = [];
  const registros: Array<{ schema: SchemaAviso; registro: RegistroAviso }> = [];
  const esperas: number[] = [];
  const fila = [...(o.respostas ?? [])];
  const avisador = criarAvisador({
    config: () => ({ token: TOKEN, chat: "-1001234567890", topico: "77", desligado: false, ...o.config }),
    registrar: async (schema, registro) => {
      registros.push({ schema, registro });
      return o.registrar ? await o.registrar(schema, registro) : 0;
    },
    mandar: async (token, corpo) => {
      telegram.push({ token, corpo: JSON.parse(JSON.stringify(corpo)) as CorpoTelegram });
      const r = fila.shift() ?? OK;
      if (r instanceof Error) throw r;
      return r;
    },
    log: criarLog("avisar-erro", { avisar: null }),
    esperar: async (ms) => {
      esperas.push(ms);
    },
  });
  return { avisador, telegram, registros, esperas };
}

describe("o caminho do aviso: trava na memória → registrar_aviso_erro → Telegram", () => {
  it("N ≥ 0: manda ao grupo e ao tópico, texto puro (sem parse_mode), com +N iguais segurados; loga o message_id", async () => {
    const { avisador, telegram } = montarAvisador({ registrar: () => 3 });
    expect(await avisador.enviarAviso(ERRO_TELA, "staging")).toBe("enviado");
    expect(telegram).toEqual([
      {
        token: TOKEN,
        corpo: {
          chat_id: "-1001234567890",
          text: montarAviso(ERRO_TELA, { schema: "staging", segurados: 3 }),
          link_preview_options: { is_disabled: true },
          message_thread_id: 77,
        },
      },
    ]);
    expect(telegram[0].corpo.text).toContain("🔁 +3 iguais segurados");
    expect(linhas("aviso_enviado")).toEqual([
      { nivel: "info", funcao: "avisar-erro", codigo: "aviso_enviado", schema: "staging", ref: assinatura(ERRO_TELA), n: 3, externo: { telegram_id: 101 } },
    ]);
  });

  it("-1: o banco segura — não chama o Telegram", async () => {
    const { avisador, telegram } = montarAvisador({ registrar: () => -1 });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("segurado");
    expect(telegram).toHaveLength(0);
    expect(linhas("segurado")).toMatchObject([{ schema: "public", resultado: "banco" }]);
  });

  it("a trava na memória: o mesmo erro de novo na mesma instância nem chega ao banco", async () => {
    const { avisador, telegram, registros } = montarAvisador();
    expect(await avisador.enviarAviso(ERRO_TELA, "staging")).toBe("enviado");
    expect(await avisador.enviarAviso({ ...ERRO_TELA, mensagem: "Cannot read properties of undefined (reading 'nome') " }, "staging")).toBe("segurado");
    expect(registros).toHaveLength(1);
    expect(telegram).toHaveLength(1);
    expect(linhas("segurado")).toMatchObject([{ resultado: "memoria" }]);
  });

  it("a trava é por schema: staging e produção não se seguram (a mesma instância atende os 2)", async () => {
    const { avisador, telegram, registros } = montarAvisador();
    await avisador.enviarAviso(ERRO_TELA, "staging");
    await avisador.enviarAviso(ERRO_TELA, "public");
    expect(registros.map((r) => r.schema)).toEqual(["staging", "public"]);
    expect(telegram[0].corpo.text.startsWith("🔴 Erro no Physiq [staging]\n")).toBe(true);
    expect(telegram[1].corpo.text.startsWith("🔴 Erro no Physiq\n")).toBe(true);
  });

  it("o que vai para o banco: a assinatura (8 hex), a origem, o lugar (a linha 📍) e o exemplo limpo (≤ 300)", async () => {
    const { avisador, registros } = montarAvisador();
    const erro: ErroParaAviso = { origem: "tela", rota: "/c/ABC123?x=1", mensagem: `falhou para maria@x.com ${"z ".repeat(300)}` };
    await avisador.enviarAviso(erro, "staging");
    const { registro } = registros[0];
    expect(registro.assinatura).toMatch(/^[0-9a-f]{8}$/);
    expect(registro.assinatura).toBe(assinatura(erro));
    expect(registro.origem).toBe("tela");
    expect(registro.lugar).toBe("tela · /c/:codigo");
    expect(registro.exemplo.startsWith("falhou para [e-mail] z z")).toBe(true);
    expect(registro.exemplo.length).toBeLessThanOrEqual(300);
  });

  it("banco fora (o RPC lança) → manda mesmo assim, sem 🔁, e loga trava_do_banco_fora sem o details", async () => {
    const { avisador, telegram } = montarAvisador({
      registrar: () => {
        throw { message: "connection refused", details: "maria@x.com", hint: null, code: "PGRST000" };
      },
    });
    expect(await avisador.enviarAviso(ERRO_TELA, "staging")).toBe("enviado");
    expect(telegram[0].corpo.text).not.toContain("🔁");
    expect(linhas("trava_do_banco_fora")).toMatchObject([{ nivel: "aviso", pg: "PGRST000", msg: "connection refused" }]);
    expect(tudoQueFoiProLog()).not.toContain("maria");
  });

  it("resposta do banco fora do formato (não inteiro) conta como 0: manda", async () => {
    const { avisador, telegram } = montarAvisador({ registrar: () => Number.NaN });
    expect(await avisador.enviarAviso(ERRO_TELA, "staging")).toBe("enviado");
    expect(telegram).toHaveLength(1);
  });

  it("o Telegram recusou → recusado; loga o status e o description, nunca o token nem a URL", async () => {
    const { avisador } = montarAvisador({ respostas: [{ ok: false, status: 400, messageId: null, descricao: "Bad Request: chat not found" }] });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("recusado");
    expect(linhas("telegram_recusou")).toMatchObject([{ nivel: "erro", status: 400, msg: "Bad Request: chat not found" }]);
    expect(tudoQueFoiProLog()).not.toMatch(/AAHk3j|1234567890|api\.telegram\.org/);
  });

  it("falha de rede → 1 tentativa extra (depois de 1 s) e manda; o log da 1ª falha não tem a URL nem o token", async () => {
    const rede = new TypeError(`error sending request for url (https://api.telegram.org/bot${TOKEN}/sendMessage): connection reset`);
    const { avisador, telegram, esperas } = montarAvisador({ respostas: [rede, OK] });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("enviado");
    expect(telegram).toHaveLength(2);
    expect(esperas).toEqual([1000]);
    expect(linhas("telegram_rede")).toHaveLength(1);
    expect(tudoQueFoiProLog()).not.toMatch(/AAHk3j|1234567890|api\.telegram\.org/);
  });

  it("a rede falhou 2× → falhou (sem 3ª tentativa); nunca lança", async () => {
    const rede = () => new TypeError(`error sending request for url (https://api.telegram.org/bot${TOKEN}/sendMessage)`);
    const { avisador, telegram } = montarAvisador({ respostas: [rede(), rede(), OK] });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("falhou");
    expect(telegram).toHaveLength(2);
    expect(linhas("aviso_falhou")).toMatchObject([{ nivel: "erro", msg: "TypeError: error sending request for url ([url]" }]);
    expect(tudoQueFoiProLog()).not.toMatch(/AAHk3j|1234567890|api\.telegram\.org/);
  });

  it("tempo esgotado (8 s) → sem 2ª tentativa (o Telegram pode ter recebido)", async () => {
    const tempo = Object.assign(new Error("Signal timed out."), { name: "TimeoutError" });
    const { avisador, telegram } = montarAvisador({ respostas: [tempo, OK] });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("falhou");
    expect(telegram).toHaveLength(1);
  });

  it("tópico apagado → manda de novo sem o tópico (cai no Geral do grupo) e loga topico_invalido", async () => {
    const { avisador, telegram } = montarAvisador({
      respostas: [{ ok: false, status: 400, messageId: null, descricao: "Bad Request: message thread not found" }, OK],
    });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("enviado");
    expect(telegram[0].corpo.message_thread_id).toBe(77);
    expect(telegram[1].corpo).not.toHaveProperty("message_thread_id");
    expect(linhas("topico_invalido")).toMatchObject([{ status: 400, msg: "Bad Request: message thread not found" }]);
  });

  it.each([
    ["sem tópico", "", "sem_topico"],
    ["tópico que não é número", "Physiq", "topico_invalido"],
    ["tópico zero", "0", "topico_invalido"],
  ])("%s → manda sem message_thread_id e loga %s", async (_nome, topico, codigo) => {
    const { avisador, telegram } = montarAvisador({ config: { topico } });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("enviado");
    expect(telegram[0].corpo).not.toHaveProperty("message_thread_id");
    expect(linhas(codigo)).toHaveLength(1);
  });

  it("ERROS_AVISO_DESLIGADO → loga e não manda (nem grava no banco)", async () => {
    const { avisador, telegram, registros } = montarAvisador({ config: { desligado: true } });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("desligado");
    expect(registros).toHaveLength(0);
    expect(telegram).toHaveLength(0);
    expect(linhas("aviso_desligado")).toHaveLength(1);
  });

  it.each([
    ["sem token", { token: "" }],
    ["sem chat", { chat: "" }],
  ])("%s → sem_configuracao (loga e não manda)", async (_nome, config) => {
    const { avisador, telegram, registros } = montarAvisador({ config });
    expect(await avisador.enviarAviso(ERRO_TELA, "public")).toBe("sem_configuracao");
    expect(telegram).toHaveLength(0);
    expect(registros).toHaveLength(0);
    expect(linhas("aviso_sem_configuracao")).toHaveLength(1);
  });

  it("o texto que vai ao Telegram não tem dado pessoal, token nem query", async () => {
    const { avisador, telegram } = montarAvisador();
    await avisador.enviarAviso(
      { origem: "promessa", rota: "/entrar?email=maria@x.com#access_token=eyJabcdefghij", mensagem: "maria@x.com cpf 123.456.789-09 (82) 99876-5432 sb_secret_AbCdEf123456789" },
      "staging",
    );
    expect(telegram[0].corpo.text).not.toMatch(/maria|123\.456|99876|sb_secret|access_token|\?email/);
  });

  it("nunca lança: uma falha qualquer vira falhou + log", async () => {
    const avisador = criarAvisador({
      config: () => {
        throw new Error(`sem env: ${TOKEN}`);
      },
      registrar: async () => 0,
      mandar: async () => OK,
      log: criarLog("avisar-erro", { avisar: null }),
    });
    await expect(avisador.enviarAviso(ERRO_TELA, "public")).resolves.toBe("falhou");
    expect(linhas("aviso_falhou")).toHaveLength(1);
    expect(tudoQueFoiProLog()).not.toContain("AAHk3j");
  });
});

// ───────────────────────── o aviso do Banco do Treino ─────────────────────────

describe("o aviso do Treino: manda à erro-avisar do principal (hml-16c: SEGREDO_AVISO_ERRO; sem ele, até o F7, o legado)", () => {
  let env: Record<string, string>;
  beforeEach(() => {
    env = { PRINCIPAL_URL: "https://principal.teste.invalid/", SEGREDO_AVISO_ERRO: SEGREDO };
    vi.stubGlobal("Deno", { env: { get: (nome: string) => env[nome] } });
  });

  const erroDoTreino = (codigo: string): ErroParaAviso => ({
    origem: "servidor",
    funcao: "trocar-token",
    codigo,
    acao: "trocar",
    status: null,
    mensagem: "TypeError · falhou",
  });

  it("POST com x-espelho-segredo e x-schema, corpo pequeno e já limpo; 204 → repassado", async () => {
    const chamadas: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(null, { status: 204 });
    });
    expect(await avisarDoTreino(erroDoTreino("t_repassa"), "staging")).toBe("repassado");
    expect(chamadas).toHaveLength(1);
    const { url, init } = chamadas[0];
    expect(url).toBe(URL_FUNCAO);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", "x-espelho-segredo": SEGREDO, "x-schema": "staging" });
    expect(init.signal).toBeDefined();
    expect(JSON.parse(String(init.body))).toEqual({ origem: "servidor", funcao: "trocar-token", codigo: "t_repassa", acao: "trocar", mensagem: "TypeError · falhou" });
    expect(new TextEncoder().encode(String(init.body)).length).toBeLessThanOrEqual(LIMITE_CORPO);
    expect(linhas("aviso_repassado")).toMatchObject([{ schema: "staging", ref: assinatura({ ...erroDoTreino("t_repassa"), banco: "treino" }) }]);
  });

  it("o mesmo erro de novo → segurado na memória (1 pedido só); sem schema vai como produção", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    expect(await avisarDoTreino(erroDoTreino("t_repete"), null)).toBe("repassado");
    expect(await avisarDoTreino(erroDoTreino("t_repete"), null)).toBe("segurado");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ "x-schema": "public" });
  });

  it("rede fora → falhou, sem lançar; o log leva só o nome do erro (nunca a URL)", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("error sending request for url (https://principal.teste.invalid/functions/v1/erro-avisar)");
    });
    await expect(avisarDoTreino(erroDoTreino("t_rede"), "staging")).resolves.toBe("falhou");
    expect(linhas("aviso_falhou")).toMatchObject([{ nivel: "erro", msg: "TypeError" }]);
    expect(tudoQueFoiProLog()).not.toContain("principal.teste");
  });

  it("o principal recusou → recusado, com o status no log", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: false, erro: "segredo_invalido" }), { status: 403 }));
    expect(await avisarDoTreino(erroDoTreino("t_recusa"), "staging")).toBe("recusado");
    expect(linhas("principal_recusou_aviso")).toMatchObject([{ status: 403 }]);
  });

  it("sem o SEGREDO_AVISO_ERRO → manda o legado (até o F7), e o legado ainda vale no principal", async () => {
    env = { PRINCIPAL_URL: "https://principal.teste.invalid/", ESPELHO_SEGREDO: LEGADO };
    const chamadas: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      chamadas.push(init);
      return new Response(null, { status: 204 });
    });
    expect(await avisarDoTreino(erroDoTreino("t_legado"), "staging")).toBe("repassado");
    expect(chamadas[0].headers).toMatchObject({ "x-espelho-segredo": LEGADO });
  });

  it.each([
    ["sem PRINCIPAL_URL", { PRINCIPAL_URL: "" }, "t_conf_url"],
    ["SEGREDO_AVISO_ERRO curto e sem legado", { SEGREDO_AVISO_ERRO: "curto" }, "t_conf_seg"],
    ["sem SEGREDO_AVISO_ERRO e o legado curto", { SEGREDO_AVISO_ERRO: "", ESPELHO_SEGREDO: "curto" }, "t_conf_legado"],
  ])("%s → sem_configuracao, sem pedido", async (_nome, troca, codigo) => {
    Object.assign(env, troca);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await avisarDoTreino(erroDoTreino(codigo), "staging")).toBe("sem_configuracao");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fora do Supabase (sem Deno) → sem_configuracao", async () => {
    vi.stubGlobal("Deno", undefined);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(await avisarDoTreino(erroDoTreino("t_sem_deno"), "staging")).toBe("sem_configuracao");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("de ponta a ponta, em memória: log do Treino → avisar-erro do Treino → erro-avisar do principal → aviso com (Treino)", async () => {
    const principal = montarDeps();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) =>
      atenderPedido(new Request(url, { method: init.method, headers: init.headers, body: init.body }), principal.deps),
    );
    const pendentes: Promise<unknown>[] = [];
    vi.stubGlobal("EdgeRuntime", { waitUntil: (p: Promise<unknown>) => pendentes.push(p) });
    const log = criarLogDoTreino("trocar-token", { avisar: avisarDoTreino });
    log.excecao(new Error("generate_link_500 para maria@x.com"), { acao: "trocar", schema: "staging" });
    await Promise.all(pendentes);
    expect(principal.enviados).toEqual([
      {
        erro: {
          origem: "servidor",
          banco: "treino",
          funcao: "trocar-token",
          codigo: "excecao",
          acao: "trocar",
          status: null,
          mensagem: "Error · generate_link_500 para [e-mail]",
        },
        schema: "staging",
      },
    ]);
    const texto = montarAviso(principal.enviados[0].erro, { schema: "staging" });
    expect(texto).toContain("📍 função trocar-token (Treino) · excecao · ação trocar");
    // o código que o Treino calculou é o mesmo que o principal põe no aviso
    const repassado = linhas("aviso_repassado")[0];
    expect(texto).toContain(`🔑 ${String(repassado.ref)}`);
    expect(tudoQueFoiProLog()).not.toContain("maria");
    // hml-16c: o principal aceitou pelo hash na lista (o Treino mandou o SEGREDO_AVISO_ERRO)
    expect(linhas("segredo_aceito")).toMatchObject([{ funcao: "erro-avisar", acao: "aviso_erro", resultado: "lista" }]);
    expect(tudoQueFoiProLog()).not.toContain(SEGREDO);
  });

  it("de ponta a ponta, o legado nos 2 sentidos (até o F7): o Treino sem SEGREDO_AVISO_ERRO manda o legado e o principal aceita", async () => {
    env = { PRINCIPAL_URL: "https://principal.teste.invalid/", ESPELHO_SEGREDO: LEGADO };
    const principal = montarDeps();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) =>
      atenderPedido(new Request(url, { method: init.method, headers: init.headers, body: init.body }), principal.deps),
    );
    expect(await avisarDoTreino(erroDoTreino("t_legado_2_sentidos"), "staging")).toBe("repassado");
    expect(principal.enviados).toHaveLength(1);
    expect(linhas("segredo_aceito")).toMatchObject([{ acao: "aviso_erro", resultado: "legado" }]);
  });
});
