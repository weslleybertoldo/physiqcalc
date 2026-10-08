import { afterEach, describe, expect, it, vi } from "vitest";
import { resolverSchemaPrincipal } from "@/integrations/principal/client";
import { LIMITE_MENSAGEM, assinatura } from "../../supabase-principal/functions/_shared/erros";
import { LIMITE_CORPO, lerAviso } from "../../supabase-principal/functions/_shared/erro-avisar-regras";
import {
  LIMITE_DO_CORPO,
  MAXIMO_POR_CARREGAMENTO,
  avisarErro,
  criarAvisoDeErro,
  enderecoDoAviso,
  motivoParaIgnorar,
  plataformaAtual,
  rotaAtual,
  schemaDoAviso,
  textoDoErro,
  type AvisoDoApp,
  type ConfigAviso,
} from "./avisoDeErro";

// Physiq hml-10 (H-26 e H-48, D5) — o aviso de erro do app: 1 POST simples na erro-avisar, com o corpo limpo pelo _shared/erros.ts;
// o código da tela é a assinatura que o servidor calcula do mesmo corpo; filtros (dev, sem principal, sem internet, rede, abort,
// chunk velho, "Script error.", ResizeObserver) e a trava do carregamento (1 por código, até 5).

const URL_AVISO = "https://principal.teste.invalid/functions/v1/erro-avisar?schema=staging";

/** Token de mentira no formato de um JWT — montado aqui (nenhum literal com cara de segredo no repo). */
const tokenFalso = () => [["ey", "JhbGciOiJub25lIn0"].join(""), ["ey", "JzdWIiOiJ0ZXN0ZSJ9"].join(""), "assinaturaFalsa"].join(".");

/** Um avisador com fetch falso (cada pedido fica guardado) e o resto da configuração ajustável. */
function montar(ajuste: Partial<ConfigAviso> = {}) {
  const pedidos: Array<{ url: string; init: RequestInit }> = [];
  const fetchFalso = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    pedidos.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 204 });
  });
  const config: ConfigAviso = {
    ligado: true,
    url: URL_AVISO,
    versao: "3.74",
    plataforma: "site",
    fetch: fetchFalso as unknown as typeof fetch,
    online: () => true,
    rota: () => "/painel/alunos",
    ...ajuste,
  };
  const avisador = criarAvisoDeErro(config);
  const corpo = (i = 0) => JSON.parse(String(pedidos[i].init.body)) as Record<string, unknown>;
  return { avisar: (a: AvisoDoApp) => avisador.avisar(a), fetchFalso, pedidos, corpo };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avisarErro: o pedido à erro-avisar", () => {
  it("1 POST simples (text/plain, keepalive, sem apikey nem sessão) com o schema na URL e o corpo que a função lê", () => {
    const t = montar();
    t.avisar({ origem: "tela", mensagem: new TypeError("x is undefined"), lugar: "aba do aluno" });
    expect(t.fetchFalso).toHaveBeenCalledTimes(1);
    const { url, init } = t.pedidos[0];
    expect(url).toBe(URL_AVISO);
    expect(init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit", referrerPolicy: "no-referrer" });
    // só o Content-Type que não pede preflight: nada de apikey, Authorization ou x-schema
    expect(init.headers).toEqual({ "Content-Type": "text/plain;charset=UTF-8" });
    expect(t.corpo()).toEqual({
      origem: "tela",
      mensagem: "TypeError: x is undefined",
      rota: "/painel/alunos",
      lugar: "aba do aluno",
      versao: "3.74",
      plataforma: "site",
    });
  });

  it("o corpo sai limpo: mensagem sem e-mail, CPF, telefone e token; rota sem query, sem # (o #access_token antigo) e sem id", () => {
    const token = tokenFalso();
    const t = montar({ rota: () => `/painel/alunos/123e4567-e89b-12d3-a456-426614174000?email=maria.teste@exemplo.com#access_token=${token}` });
    t.avisar({ origem: "tela", mensagem: new Error(`falhou para maria.teste@exemplo.com, CPF 123.456.789-09, tel (82) 99999-1234, token ${token}`) });
    const texto = String(t.pedidos[0].init.body);
    const corpo = t.corpo();
    expect(corpo.rota).toBe("/painel/alunos/:id");
    expect(corpo.mensagem).toBe("falhou para [e-mail], CPF [cpf], tel [telefone], token [token]");
    for (const proibido of ["maria", "exemplo.com", "123.456.789-09", "99999-1234", token, "access_token", "?", "#", "123e4567"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
  });

  it("o código devolvido é a assinatura que a erro-avisar calcula do corpo (lerAviso + assinatura), nas 4 origens", () => {
    const casos: AvisoDoApp[] = [
      { origem: "tela", mensagem: new Error("Cannot read properties of undefined (reading 'map')"), lugar: "aba do aluno Treino" },
      { origem: "promessa", mensagem: "rejeitada: maria.teste@exemplo.com" },
      { origem: "funcao", funcao: "cobranca-conta", banco: "principal", status: 502 },
      { origem: "funcao", funcao: "admin-get-user", banco: "treino", status: 503 },
      { origem: "sync", mensagem: "op PUT descartada · código 23503", lugar: "tabela tb_treino_series" },
    ];
    casos.forEach((caso, i) => {
      const t = montar();
      const codigo = t.avisar(caso);
      expect(codigo, caso.origem).toMatch(/^[0-9a-f]{8}$/);
      const noServidor = lerAviso(t.corpo(), "navegador");
      expect(noServidor, `${caso.origem} (${i}): a função aceita o corpo`).not.toBeNull();
      expect(codigo, `${caso.origem} (${i})`).toBe(assinatura(noServidor!));
    });
  });

  it("origem funcao: slug, banco e HTTP (sem mensagem); a própria erro-avisar e slug inválido não mandam", () => {
    const t = montar();
    t.avisar({ origem: "funcao", funcao: "cobranca-conta", banco: "principal", status: 502 });
    t.avisar({ origem: "funcao", funcao: "admin-get-user", banco: "treino", status: 503 });
    expect(t.corpo(0)).toEqual({ origem: "funcao", funcao: "cobranca-conta", banco: "principal", status: 502, rota: "/painel/alunos", versao: "3.74", plataforma: "site" });
    expect(t.corpo(1)).toMatchObject({ funcao: "admin-get-user", banco: "treino", status: 503 });
    for (const funcao of ["erro-avisar", "../alunos", "", null]) {
      expect(t.avisar({ origem: "funcao", funcao, status: 500 })).toMatch(/^[0-9a-f]{8}$/);
    }
    expect(t.fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("a maior mensagem possível cabe nos 2 KB da erro-avisar", () => {
    expect(LIMITE_DO_CORPO).toBe(LIMITE_CORPO);
    // 3 bytes por caractere (€) e o escape do JSON (aspas e barra viram 2) — sem espaço e abaixo do corte bruto de 4000 caracteres
    const t = montar({ rota: () => `/${"çã".repeat(200)}/${"x".repeat(300)}` });
    t.avisar({ origem: "tela", mensagem: "€".repeat(3000), lugar: '"'.repeat(500) });
    t.avisar({ origem: "promessa", mensagem: '"\\'.repeat(1900), lugar: "€".repeat(500) });
    expect(t.fetchFalso).toHaveBeenCalledTimes(2);
    for (const { init } of t.pedidos) expect(new TextEncoder().encode(String(init.body)).length).toBeLessThanOrEqual(LIMITE_CORPO);
    expect(String(t.corpo(0).mensagem).length).toBe(LIMITE_MENSAGEM);
  });
});

describe("avisarErro: quando não manda (e o código continua)", () => {
  it("vite dev / build sem o principal (ligado = false) e sem internet: nenhum pedido, o mesmo código", () => {
    const aviso: AvisoDoApp = { origem: "tela", mensagem: new Error("quebrou"), lugar: "tela inteira" };
    const ligado = montar();
    const codigo = ligado.avisar(aviso);
    for (const ajuste of [{ ligado: false }, { url: "" }, { online: () => false }]) {
      const t = montar(ajuste);
      expect(t.avisar(aviso), JSON.stringify(ajuste)).toBe(codigo);
      expect(t.fetchFalso, JSON.stringify(ajuste)).not.toHaveBeenCalled();
    }
  });

  it.each([
    ["rede", new TypeError("Failed to fetch")],
    ["rede", new TypeError("NetworkError when attempting to fetch resource.")],
    ["rede", new TypeError("Load failed")],
    ["abort", new DOMException("The user aborted a request.", "AbortError")],
    ["abort", Object.assign(new Error("signal timed out"), { name: "TimeoutError" })],
    ["chunk", new TypeError("Failed to fetch dynamically imported module: https://physiqcalc.com.br/assets/Treino-abc.js")],
    ["chunk", new TypeError("Importing a module script failed.")],
    ["chunk", new Error("Unable to preload CSS for /assets/Painel-abc.css")],
    ["script", "Script error."],
    ["resize", "ResizeObserver loop completed with undelivered notifications."],
    ["resize", "ResizeObserver loop limit exceeded"],
  ])("%s: %s → não manda", (_motivo, erro) => {
    const t = montar();
    expect(t.avisar({ origem: "promessa", mensagem: erro })).toMatch(/^[0-9a-f]{8}$/);
    expect(t.fetchFalso).not.toHaveBeenCalled();
  });

  it("motivoParaIgnorar: o motivo de cada filtro; erro de verdade = null", () => {
    expect(motivoParaIgnorar("Failed to fetch dynamically imported module: x")).toBe("chunk"); // chunk antes de rede
    expect(motivoParaIgnorar("qualquer", "AbortError")).toBe("abort");
    expect(motivoParaIgnorar("TypeError: Failed to fetch")).toBe("rede");
    expect(motivoParaIgnorar(" Script error. ")).toBe("script");
    expect(motivoParaIgnorar("ResizeObserver loop limit exceeded")).toBe("resize");
    expect(motivoParaIgnorar("TypeError: Cannot read properties of undefined (reading 'map')")).toBeNull();
    expect(motivoParaIgnorar("Script error no relatório do aluno")).toBeNull(); // só a frase exata do navegador
  });

  it("trava do carregamento: o mesmo erro vai 1 vez; no máximo 5 avisos; outro carregamento manda de novo", () => {
    const t = montar();
    const a = t.avisar({ origem: "tela", mensagem: new Error("igual"), lugar: "x" });
    const b = t.avisar({ origem: "tela", mensagem: new Error("igual"), lugar: "x" });
    expect(a).toBe(b);
    expect(t.fetchFalso).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) t.avisar({ origem: "tela", mensagem: new Error(`diferente ${String.fromCharCode(97 + i)}`) });
    expect(MAXIMO_POR_CARREGAMENTO).toBe(5);
    expect(t.fetchFalso).toHaveBeenCalledTimes(5);
    const outro = montar();
    outro.avisar({ origem: "tela", mensagem: new Error("igual"), lugar: "x" });
    expect(outro.fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("nunca lança: fetch que lança na hora ou que rejeita", async () => {
    const lanca = montar({
      fetch: (() => {
        throw new TypeError("fetch quebrado");
      }) as unknown as typeof fetch,
    });
    expect(lanca.avisar({ origem: "tela", mensagem: new Error("a") })).toMatch(/^[0-9a-f]{8}$/);
    const rejeitadas: unknown[] = [];
    const ouvir = (e: PromiseRejectionEvent) => rejeitadas.push(e.reason);
    window.addEventListener("unhandledrejection", ouvir as EventListener);
    const rejeita = montar({ fetch: (async () => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch });
    expect(rejeita.avisar({ origem: "tela", mensagem: new Error("b") })).toMatch(/^[0-9a-f]{8}$/);
    await new Promise((r) => setTimeout(r, 0));
    window.removeEventListener("unhandledrejection", ouvir as EventListener);
    expect(rejeitadas).toEqual([]);
  });
});

describe("as peças", () => {
  it("textoDoErro: o nome só quando não é o Error comum; do PostgREST só a message (nunca details); objeto sem message = vazio", () => {
    expect(textoDoErro(new TypeError("a"))).toBe("TypeError: a");
    expect(textoDoErro(new Error("b"))).toBe("b");
    expect(textoDoErro("c")).toBe("c");
    expect(textoDoErro({ message: "duplicate key", details: "Key (email)=(maria.teste@exemplo.com) already exists.", code: "23505" })).toBe("duplicate key");
    expect(textoDoErro({ foo: 1 })).toBe("");
    expect(textoDoErro(undefined)).toBe("");
    expect(textoDoErro(null)).toBe("");
    expect(textoDoErro(42)).toBe("42");
  });

  it("enderecoDoAviso: as variáveis do cliente do principal; DEV ou sem URL/chave = desligado", () => {
    const env = { VITE_PRINCIPAL_URL: "https://api-principal.physiqcalc.com.br/", VITE_PRINCIPAL_ANON_KEY: "anon", VITE_PRINCIPAL_SCHEMA: "staging", DEV: false };
    expect(enderecoDoAviso(env)).toEqual({ ligado: true, url: "https://api-principal.physiqcalc.com.br/functions/v1/erro-avisar?schema=staging" });
    expect(enderecoDoAviso({ ...env, VITE_PRINCIPAL_SCHEMA: undefined, VITE_DB_SCHEMA: "public" }).url).toMatch(/\?schema=public$/);
    expect(enderecoDoAviso({ ...env, DEV: true }).ligado).toBe(false);
    expect(enderecoDoAviso({ ...env, VITE_PRINCIPAL_ANON_KEY: "" }).ligado).toBe(false);
    expect(enderecoDoAviso({ ...env, VITE_PRINCIPAL_URL: " " })).toEqual({ ligado: false, url: "" });
  });

  it("schemaDoAviso segue a regra do cliente do principal (resolverSchemaPrincipal)", () => {
    const envs = [
      { VITE_PRINCIPAL_SCHEMA: "staging" },
      { VITE_PRINCIPAL_SCHEMA: "public", VITE_DB_SCHEMA: "staging" },
      { VITE_DB_SCHEMA: "staging" },
      {},
      { VITE_PRINCIPAL_SCHEMA: "auth", VITE_DB_SCHEMA: "staging" },
      { VITE_PRINCIPAL_SCHEMA: " STAGING " },
      { VITE_PRINCIPAL_SCHEMA: "x", VITE_DB_SCHEMA: "y" },
    ];
    for (const env of envs) expect(schemaDoAviso(env), JSON.stringify(env)).toBe(resolverSchemaPrincipal(env));
  });

  it("rotaAtual: só o location.pathname (a query e o # nunca entram)", () => {
    const antes = window.location.href;
    window.history.replaceState(null, "", `/entrar?code=abc&email=maria.teste%40exemplo.com#access_token=${tokenFalso()}`);
    try {
      expect(rotaAtual()).toBe("/entrar");
    } finally {
      window.history.replaceState(null, "", antes);
    }
  });

  it("plataformaAtual: no navegador (o Vitest), site", () => {
    expect(plataformaAtual()).toBe("site");
  });

  describe("plataformaAtual com o build e a ponte trocados", () => {
    afterEach(() => {
      vi.doUnmock("./distribuicao");
      vi.doUnmock("./plataforma");
      vi.doUnmock("@capacitor/core");
      vi.resetModules();
    });

    async function carregar(o: { loja?: boolean; buildDoApp?: boolean; nativo?: boolean | "quebrada" }) {
      vi.resetModules();
      vi.doMock("./distribuicao", () => ({ ehLoja: o.loja ?? false }));
      vi.doMock("./plataforma", () => ({ BUILD_DO_APP: o.buildDoApp ?? false }));
      vi.doMock("@capacitor/core", () => ({
        Capacitor: {
          isNativePlatform: () => {
            if (o.nativo === "quebrada") throw new Error("sem a ponte");
            return o.nativo ?? false;
          },
        },
      }));
      return (await import("./avisoDeErro")).plataformaAtual();
    }

    it("o AAB da Google Play é loja; o APK (build do app ou ponte nativa) é app", async () => {
      expect(await carregar({ loja: true, buildDoApp: true, nativo: true })).toBe("loja");
      expect(await carregar({ buildDoApp: true })).toBe("app");
      expect(await carregar({ nativo: true })).toBe("app");
      expect(await carregar({})).toBe("site");
    });

    it("ponte do Capacitor quebrada ou flag do build ilegível: site, sem quebrar o módulo (a tela de erro depende dele)", async () => {
      expect(await carregar({ nativo: "quebrada" })).toBe("site");
      vi.resetModules();
      vi.doMock("./distribuicao", () => ({
        get ehLoja(): boolean {
          throw new Error("flag ilegível");
        },
      }));
      vi.doMock("./plataforma", () => ({ BUILD_DO_APP: false }));
      const m = await import("./avisoDeErro");
      expect(m.plataformaAtual()).toBe("site");
      expect(m.avisarErro({ origem: "tela", mensagem: new Error("x") })).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  it("o avisarErro do app no Vitest (modo dev) não vai à rede e devolve o código", () => {
    const fetchGlobal = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchGlobal);
    expect(avisarErro({ origem: "tela", mensagem: new Error("no teste") })).toMatch(/^[0-9a-f]{8}$/);
    expect(fetchGlobal).not.toHaveBeenCalled();
  });
});
