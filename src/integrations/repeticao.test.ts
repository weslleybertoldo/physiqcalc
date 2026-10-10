import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RPC_QUE_GRAVAM, RPC_SO_LEITURA, TEMPO_FUNCAO_MS, TENTATIVAS_LEITURA, criarFetchResiliente, podeRepetir } from "./repeticao";

// Homologação hml-06 (H-20) — o fetch dos 2 clientes só repete leitura (a pagamentos-aluno cobrava o cartão de novo quando o
// cliente repetia o POST de uma resposta perdida).
const P = "https://api-principal.physiqcalc.com.br";
const T = "https://api.physiqcalc.com.br";

describe("podeRepetir", () => {
  // [método, endereço, pode?]
  const TABELA: Array<[string, string, boolean]> = [
    ["GET", `${P}/rest/v1/contas?select=*`, true],
    ["HEAD", `${P}/rest/v1/pacientes?select=id`, true],
    ["GET", `${P}/auth/v1/user`, true],
    ["GET", `${P}/storage/v1/object/public/avatars/a.png`, true],
    ["POST", `${P}/rest/v1/rpc/minha_situacao`, true],
    ["POST", `${P}/rest/v1/rpc/alunos_da_conta`, true],
    ["post", `${T}/rest/v1/rpc/aluno_treino`, true],
    ["POST", `${P}/rest/v1/rpc/diario_enviar`, false],
    ["POST", `${P}/rest/v1/rpc/aluno_acesso`, false],
    ["POST", `${P}/rest/v1/rpc/rpc_que_ninguem_conhece`, false],
    ["POST", `${P}/rest/v1/rpc/minha_situacao/extra`, false],
    ["POST", `${P}/rest/v1/pacientes`, false],
    ["PATCH", `${P}/rest/v1/avisos?id=in.(1,2)`, false],
    ["PUT", `${P}/rest/v1/contas?id=eq.1`, false],
    ["DELETE", `${P}/rest/v1/cobrancas?id=eq.1`, false],
    ["PATCH", `${P}/rest/v1/rpc/minha_situacao`, false],
    ["POST", `${P}/functions/v1/cobranca-conta`, false],
    ["POST", `${P}/functions/v1/pagamentos-aluno`, false],
    ["POST", `${P}/functions/v1/alunos`, false],
    ["POST", `${P}/auth/v1/otp`, false],
    ["POST", `${P}/auth/v1/recover`, false],
    ["POST", `${P}/auth/v1/token?grant_type=refresh_token`, false],
    ["POST", `${P}/storage/v1/object/comprovantes/a/b.pdf`, false],
    ["PUT", `${P}/storage/v1/object/comprovantes/a/b.pdf`, false],
    ["POST", "/rest/v1/rpc/minha_situacao", false], // endereço relativo (não acontece no supabase-js): na dúvida, não repete
  ];
  it.each(TABELA)("%s %s → %s", (metodo, url, pode) => {
    expect(podeRepetir(url, { method: metodo })).toBe(pode);
  });

  it("sem método = GET; URL e Request também valem", () => {
    expect(podeRepetir(`${P}/rest/v1/contas`)).toBe(true);
    expect(podeRepetir(new URL(`${P}/rest/v1/rpc/minha_dieta`), { method: "POST" })).toBe(true);
    expect(podeRepetir(new Request(`${P}/rest/v1/rpc/minha_dieta`, { method: "POST" }))).toBe(true);
    expect(podeRepetir(new Request(`${P}/functions/v1/cobranca-conta`, { method: "POST" }))).toBe(false);
  });

  it("as 45 de leitura repetem; as 40 que gravam não; os 2 conjuntos não se cruzam", () => {
    expect(RPC_SO_LEITURA.size).toBe(45);
    expect(RPC_QUE_GRAVAM.size).toBe(40);
    for (const nome of RPC_SO_LEITURA) expect(podeRepetir(`${P}/rest/v1/rpc/${nome}`, { method: "POST" }), nome).toBe(true);
    for (const nome of RPC_QUE_GRAVAM) expect(podeRepetir(`${P}/rest/v1/rpc/${nome}`, { method: "POST" }), nome).toBe(false);
    expect([...RPC_SO_LEITURA].filter((n) => RPC_QUE_GRAVAM.has(n))).toEqual([]);
  });

  it("hml-12: a ficha do responsável repete (STABLE); o aceite e o registro do responsável vão 1 vez (gravam)", () => {
    expect(podeRepetir(`${P}/rest/v1/rpc/aluno_responsavel`, { method: "POST" })).toBe(true);
    expect(podeRepetir(`${P}/rest/v1/rpc/aceitar_no_acesso`, { method: "POST" })).toBe(false);
    expect(podeRepetir(`${P}/rest/v1/rpc/aluno_responsavel_registrar`, { method: "POST" })).toBe(false);
    expect(RPC_QUE_GRAVAM.has("aceitar_no_acesso") && RPC_QUE_GRAVAM.has("aluno_responsavel_registrar")).toBe(true);
  });

  it("hml-14b: as 5 RPCs das listas por página (STABLE) repetem — as do financeiro vão pelo rpcFinanceiro, que a guarda não lê", () => {
    for (const nome of ["financeiro_lancamentos", "financeiro_recibos", "financeiro_resumo_periodo", "receitas_da_nutricionista", "respostas_da_conta"]) {
      expect(podeRepetir(`${P}/rest/v1/rpc/${nome}`, { method: "POST" }), nome).toBe(true);
    }
  });

  it("hml-14d: as 6 RPCs novas das listas (STABLE) repetem — as 2 do Treino pelo cliente do Treino, as 4 pelo do principal", () => {
    for (const nome of ["modelos_da_lista", "exercicios_da_lista"]) {
      expect(podeRepetir(`${T}/rest/v1/rpc/${nome}`, { method: "POST" }), nome).toBe(true);
    }
    for (const nome of ["preconsulta_numeros", "minha_agenda_lista", "exames_do_aluno", "financeiro_totais_do_aluno"]) {
      expect(podeRepetir(`${P}/rest/v1/rpc/${nome}`, { method: "POST" }), nome).toBe(true);
    }
  });

  it("hml-17: as 3 RPCs do plano alimentar (STABLE) repetem pelo cliente do principal", () => {
    for (const nome of ["planos_do_aluno", "plano_alimentar", "planos_favoritos"]) {
      expect(podeRepetir(`${P}/rest/v1/rpc/${nome}`, { method: "POST" }), nome).toBe(true);
    }
  });
});

describe("criarFetchResiliente com fetch falso", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** fetch falso que responde na ordem (número = status; "rede" = falha de rede) e conta as chamadas. */
  function falso(respostas: Array<number | "rede">) {
    const fila = [...respostas];
    return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const r = fila.length > 1 ? fila.shift()! : fila[0];
      if (r === "rede") throw new TypeError("Failed to fetch");
      return new Response("{}", { status: r });
    });
  }
  async function chamar(respostas: Array<number | "rede">, url: string, init?: RequestInit) {
    const base = falso(respostas);
    const resultado = criarFetchResiliente(2, 15000, base as unknown as typeof fetch)(url, init).then(
      (r) => ({ status: r.status, erro: null as unknown }),
      (e) => ({ status: 0, erro: e as unknown }),
    );
    await vi.runAllTimersAsync();
    return { ...(await resultado), chamadas: base.mock.calls.length };
  }

  it("503 → 200: GET e rpc/minha_situacao repetem (2 chamadas)", async () => {
    expect(await chamar([503, 200], `${P}/rest/v1/contas?select=*`)).toMatchObject({ status: 200, chamadas: 2 });
    expect(await chamar([503, 200], `${P}/rest/v1/rpc/minha_situacao`, { method: "POST" })).toMatchObject({ status: 200, chamadas: 2 });
  });

  it("503 → 200: functions/v1/cobranca-conta e rpc/diario_enviar vão 1 vez (o 503 volta para quem chamou)", async () => {
    expect(await chamar([503, 200], `${P}/functions/v1/cobranca-conta`, { method: "POST", body: "{}" })).toMatchObject({ status: 503, chamadas: 1 });
    expect(await chamar([503, 200], `${P}/rest/v1/rpc/diario_enviar`, { method: "POST", body: "{}" })).toMatchObject({ status: 503, chamadas: 1 });
  });

  it("rede caída em POST: 1 chamada e rejeita", async () => {
    const r = await chamar(["rede"], `${P}/functions/v1/pagamentos-aluno`, { method: "POST", body: "{}" });
    expect(r.chamadas).toBe(1);
    expect(r.erro).toBeInstanceOf(TypeError);
  });

  it("o que repete segue a regra de antes: rede caída = 3 chamadas e rejeita; 5xx até o fim = 3 e devolve o último; 401 não repete", async () => {
    const rede = await chamar(["rede"], `${P}/rest/v1/contas`);
    expect([rede.chamadas, rede.erro instanceof TypeError]).toEqual([3, true]);
    expect(await chamar([502], `${P}/rest/v1/rpc/painel_resumo`, { method: "POST" })).toMatchObject({ status: 502, chamadas: 3 });
    expect(await chamar([401, 200], `${P}/rest/v1/contas`)).toMatchObject({ status: 401, chamadas: 1 });
    expect(await chamar([429, 200], `${T}/rest/v1/treinos`)).toMatchObject({ status: 200, chamadas: 2 });
  });

  it("cada tentativa leva o próprio sinal de timeout", async () => {
    const base = falso([200]);
    const p = criarFetchResiliente(2, 15000, base as unknown as typeof fetch)(`${P}/rest/v1/contas`, { method: "GET" });
    await vi.runAllTimersAsync();
    await p;
    const init = base.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.method).toBe("GET");
  });
});

describe("hml-14 (H-32, D5): quanto o front espera — função 25 s; tabela e RPC seguem com 15 s", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** O servidor que pendura: o fetch falso só termina quando o sinal aborta; guarda em que ms cada tentativa foi largada. */
  function pendurado() {
    const inicio = Date.now();
    const largouEm: number[] = [];
    const f = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, rejeitar) => {
          init?.signal?.addEventListener("abort", () => {
            largouEm.push(Date.now() - inicio);
            rejeitar(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    return { f, base: f as unknown as typeof fetch, largouEm };
  }

  it("o mínimo de função é 25 s", () => {
    expect(TEMPO_FUNCAO_MS).toBe(25_000);
  });

  it("função pelos 2 clientes (2, 15000): espera 25 s, 1 tentativa só, e rejeita com o AbortError", async () => {
    const { f, base, largouEm } = pendurado();
    const p = criarFetchResiliente(2, 15000, base)(`${T}/functions/v1/admin-semana-treinos`, { method: "POST", body: "{}" }).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(24_999);
    expect(largouEm).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(largouEm).toEqual([25_000]);
    expect((await p as Error).name).toBe("AbortError");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("tabela (GET) e RPC de leitura: 15 s por tentativa, com as novas tentativas de hoje; RPC que grava: 15 s e 1 vez", async () => {
    const tabela = pendurado();
    void criarFetchResiliente(2, 15000, tabela.base)(`${P}/rest/v1/contas?select=*`).catch(() => null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tabela.largouEm).toEqual([15_000, 30_000, 45_000]);

    const leitura = pendurado();
    void criarFetchResiliente(2, 15000, leitura.base)(`${P}/rest/v1/rpc/minha_situacao`, { method: "POST" }).catch(() => null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(leitura.largouEm).toEqual([15_000, 30_000, 45_000]);

    const grava = pendurado();
    void criarFetchResiliente(2, 15000, grava.base)(`${P}/rest/v1/rpc/diario_enviar`, { method: "POST", body: "{}" }).catch(() => null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(grava.largouEm).toEqual([15_000]);
  });

  it("fetch direto: quem cria com mais tempo fica com o seu (login, 40 s); fora de função vale o tempo de quem criou (GitHub, 8 s)", async () => {
    const login = pendurado();
    void criarFetchResiliente(0, 40_000, login.base)(`${T}/functions/v1/trocar-token`, { method: "POST", body: "{}" }).catch(() => null);
    const github = pendurado();
    void criarFetchResiliente(0, 8_000, github.base)("https://api.github.com/repos/weslleybertoldo/physiqcalc/releases/latest").catch(() => null);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(login.largouEm).toEqual([40_000]);
    expect(github.largouEm).toEqual([8_000]);
    expect([login.f.mock.calls.length, github.f.mock.calls.length]).toEqual([1, 1]);
  });

  it("ateOCorpo: o relógio segue até ler o corpo (a foto que trava no meio); sem ele, para quando chegam os cabeçalhos", async () => {
    /** Os cabeçalhos chegam na hora; o corpo só termina quando o sinal aborta. */
    const corpoPendurado = () =>
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => ({
        ok: true,
        status: 200,
        blob: () =>
          new Promise<Blob>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError")))),
      })) as unknown as typeof fetch;
    const FOTO = `${P}/storage/v1/object/sign/evolucao/a.jpg?token=x`;
    let comOCorpo: unknown = "esperando";
    let semOCorpo: unknown = "esperando";
    (await criarFetchResiliente(0, 30_000, corpoPendurado(), { ateOCorpo: true })(FOTO)).blob().catch((e: Error) => (comOCorpo = e.name));
    (await criarFetchResiliente(0, 30_000, corpoPendurado())(FOTO)).blob().catch((e: Error) => (semOCorpo = e.name));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(comOCorpo).toBe("esperando");
    await vi.advanceTimersByTimeAsync(1);
    expect(comOCorpo).toBe("AbortError");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(semOCorpo).toBe("esperando");
  });

  it("ateOCorpo com resposta rápida: nada muda (a resposta volta igual e o relógio que dispara depois não quebra nada)", async () => {
    const r = await criarFetchResiliente(0, 30_000, falsoOk(), { ateOCorpo: true })(`${P}/storage/v1/object/sign/evolucao/a.jpg`);
    expect(await r.text()).toBe("{}");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(r.status).toBe(200);
  });
});

/** fetch falso que responde 200 "{}" na hora. */
function falsoOk() {
  return (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
}

describe("hml-10 (D5): a resposta final ≥ 500 de uma função vira aviso", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Chama o fetch resiliente com um fetch falso (número = status; "rede" = falha de rede) e um aviso falso. */
  async function chamar(resposta: number | "rede", url: string, opcoes: { init?: RequestInit; banco?: "principal" | "treino"; avisar?: (a: unknown) => unknown } = {}) {
    const base = vi.fn(async () => {
      if (resposta === "rede") throw new TypeError("Failed to fetch");
      return new Response("{}", { status: resposta });
    });
    const avisar = vi.fn(opcoes.avisar ?? (() => "a1b2c3d4"));
    const resultado = criarFetchResiliente(2, 15000, base as unknown as typeof fetch, { banco: opcoes.banco, avisar })(url, opcoes.init ?? { method: "POST", body: "{}" }).then(
      (r) => ({ status: r.status, erro: null as unknown }),
      (e) => ({ status: 0, erro: e as unknown }),
    );
    await vi.runAllTimersAsync();
    return { ...(await resultado), avisar, chamadas: base.mock.calls.length };
  }

  it("5xx de função avisa 1× com o slug, o banco e o HTTP — nos 2 bancos — e a resposta volta igual para quem chamou", async () => {
    const p = await chamar(502, `${P}/functions/v1/cobranca-conta`, { banco: "principal" });
    expect(p).toMatchObject({ status: 502, chamadas: 1 });
    expect(p.avisar).toHaveBeenCalledTimes(1);
    expect(p.avisar).toHaveBeenCalledWith({ origem: "funcao", funcao: "cobranca-conta", banco: "principal", status: 502 });
    const t = await chamar(503, `${T}/functions/v1/admin-get-user`, { banco: "treino" });
    expect(t.avisar).toHaveBeenCalledTimes(1);
    expect(t.avisar).toHaveBeenCalledWith({ origem: "funcao", funcao: "admin-get-user", banco: "treino", status: 503 });
  });

  it("o slug sai do caminho, sem subcaminho nem query", async () => {
    const r = await chamar(500, `${P}/functions/v1/alunos/extra?acao=listar`, { banco: "principal" });
    expect(r.avisar).toHaveBeenCalledWith(expect.objectContaining({ funcao: "alunos", status: 500 }));
  });

  it.each([400, 401, 403, 404, 409, 422, 429, 200, 204])("HTTP %i de função não avisa", async (status) => {
    expect((await chamar(status, `${P}/functions/v1/pagamentos-aluno`, { banco: "principal" })).avisar).not.toHaveBeenCalled();
  });

  it("a própria erro-avisar nunca avisa, nem com 5xx", async () => {
    const r = await chamar(500, `${P}/functions/v1/erro-avisar?schema=staging`, { banco: "principal" });
    expect(r.status).toBe(500);
    expect(r.avisar).not.toHaveBeenCalled();
  });

  it("5xx que não é de função (rest, rpc, auth, storage) não avisa — nem depois das novas tentativas", async () => {
    const lendo = await chamar(503, `${P}/rest/v1/contas?select=*`, { init: { method: "GET" }, banco: "principal" });
    expect(lendo).toMatchObject({ status: 503, chamadas: 3 });
    expect(lendo.avisar).not.toHaveBeenCalled();
    for (const url of [`${P}/rest/v1/rpc/diario_enviar`, `${P}/auth/v1/token?grant_type=refresh_token`, `${P}/storage/v1/object/comprovantes/a.pdf`]) {
      expect((await chamar(502, url, { banco: "principal" })).avisar, url).not.toHaveBeenCalled();
    }
  });

  it("falha de rede em função não avisa (e continua rejeitando como antes)", async () => {
    const r = await chamar("rede", `${P}/functions/v1/cobranca-conta`, { banco: "principal" });
    expect(r.erro).toBeInstanceOf(TypeError);
    expect(r.avisar).not.toHaveBeenCalled();
  });

  it("um aviso que lança não muda a resposta de quem chamou", async () => {
    const r = await chamar(502, `${P}/functions/v1/cobranca-conta`, {
      banco: "principal",
      avisar: () => {
        throw new Error("aviso quebrado");
      },
    });
    expect(r).toMatchObject({ status: 502, erro: null });
  });

  it("os 2 clientes dizem de qual banco são (o aviso diz \"(Treino)\" quando é de lá)", () => {
    const ler = (arquivo: string) => readFileSync(resolve(__dirname, arquivo), "utf-8");
    expect(ler("principal/client.ts")).toMatch(/criarFetchResiliente\(TENTATIVAS_LEITURA, 15000, undefined, \{ banco: "principal" \}\)/);
    expect(ler("supabase/client.ts")).toMatch(/criarFetchResiliente\(TENTATIVAS_LEITURA, 15000, undefined, \{ banco: "treino" \}\)/);
  });
});

describe("hml-17 (H-53): 1 nova tentativa nas leituras dos 2 clientes (eram 2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function chamar(respostas: Array<number | "rede">, url: string, init?: RequestInit) {
    const fila = [...respostas];
    const base = vi.fn(async () => {
      const r = fila.length > 1 ? fila.shift()! : fila[0];
      if (r === "rede") throw new TypeError("Failed to fetch");
      return new Response("{}", { status: r });
    });
    const resultado = criarFetchResiliente(TENTATIVAS_LEITURA, 15000, base as unknown as typeof fetch)(url, init).then(
      (r) => ({ status: r.status, erro: null as unknown }),
      (e) => ({ status: 0, erro: e as unknown }),
    );
    await vi.runAllTimersAsync();
    return { ...(await resultado), chamadas: base.mock.calls.length };
  }

  it("TENTATIVAS_LEITURA = 1 e os 2 clientes usam a constante (nenhum número escrito no lugar)", () => {
    expect(TENTATIVAS_LEITURA).toBe(1);
    const ler = (arquivo: string) => readFileSync(resolve(__dirname, arquivo), "utf-8");
    for (const arquivo of ["principal/client.ts", "supabase/client.ts"]) {
      expect(ler(arquivo), arquivo).toMatch(/criarFetchResiliente\(TENTATIVAS_LEITURA,/);
      expect(ler(arquivo), arquivo).not.toMatch(/criarFetchResiliente\(\d/);
    }
  });

  it("GET com a rede caída: 2 chamadas e rejeita (antes 3); 5xx até o fim: 2 e devolve o último", async () => {
    const rede = await chamar(["rede"], `${P}/rest/v1/contas`);
    expect([rede.chamadas, rede.erro instanceof TypeError]).toEqual([2, true]);
    expect(await chamar([503], `${P}/rest/v1/contas`)).toMatchObject({ status: 503, chamadas: 2 });
  });

  it("a RPC nova de leitura (planos_do_aluno) repete 1 vez: 503 → 200 = 2 chamadas", async () => {
    expect(await chamar([503, 200], `${P}/rest/v1/rpc/planos_do_aluno`, { method: "POST" })).toMatchObject({ status: 200, chamadas: 2 });
  });

  it("controle: função e RPC que grava vão 1 vez; 401/403 não repetem", async () => {
    expect(await chamar(["rede"], `${P}/functions/v1/pagamentos-aluno`, { method: "POST", body: "{}" })).toMatchObject({ chamadas: 1 });
    expect(await chamar([503, 200], `${P}/rest/v1/rpc/diario_enviar`, { method: "POST", body: "{}" })).toMatchObject({ status: 503, chamadas: 1 });
    expect(await chamar([401, 200], `${P}/rest/v1/contas`)).toMatchObject({ status: 401, chamadas: 1 });
    expect(await chamar([403, 200], `${P}/rest/v1/rpc/planos_do_aluno`, { method: "POST" })).toMatchObject({ status: 403, chamadas: 1 });
  });
});

describe("guarda: toda rpc(\"…\") do front está decidida", () => {
  const SRC = resolve(__dirname, "..");
  const arquivos = (readdirSync(SRC, { recursive: true }) as string[])
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.(test|spec)\.(ts|tsx)$/.test(f))
    .map((f) => join(SRC, f));
  const chamadas = new Set<string>();
  for (const arq of arquivos) {
    for (const m of readFileSync(arq, "utf-8").matchAll(/\brpc(?:<[^()=]*>)?\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)) chamadas.add(m[1]);
  }

  it("acha as chamadas (o padrão de busca ainda pega o código)", () => {
    expect(chamadas.size).toBeGreaterThanOrEqual(60);
    expect(chamadas.has("minha_situacao") && chamadas.has("diario_enviar")).toBe(true);
  });

  it("cada RPC está em RPC_SO_LEITURA ou em RPC_QUE_GRAVAM (RPC nova obriga a decidir)", () => {
    expect([...chamadas].filter((n) => !RPC_SO_LEITURA.has(n) && !RPC_QUE_GRAVAM.has(n)).sort()).toEqual([]);
  });
});
