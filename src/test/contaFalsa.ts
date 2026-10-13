// Physiq hml-21a (H-43 · jeito 2, etapa 3) — a função conta nos testes de TELA e de lib que já falsificavam o banco (principal.rpc/from/
// storage do @/integrations/principal/client), no molde do src/test/financeiroFalso.ts: em vez de responder a função à mão, roda os MÓDULOS
// DE VERDADE do servidor — o `ler` no motor comum com o catálogo da conta (_shared/leitura-servidor.ts + conta-leituras.ts) e as gravações
// em conta/casca.ts e conta/app.ts — sobre o MESMO banco falso do teste: as idas ao banco são as mesmas que o navegador fazia (agora o
// servidor faz, como a pessoa), então o teste segue provando o mesmo; o que volta passa pela "rede" (JSON) e o erro chega como o supabase-js
// entrega (FunctionsHttpError com o Response do status da função).
//   · o que o falso do teste não tem (um método da cadeia, a RPC, o Storage) pula: a cadeia segue com o que veio;
//   · a RPC sem argumentos vai ao falso sem o objeto de args (como a lib chamava a minha_senha_definida: só o nome);
//   · os ids de mentira dos testes ("a1") não são uuid e a ação valida o uuid: cada um vira um uuid de mentira na ida e volta ao original
//     quando chega ao banco falso (só nos campos uuid/uuids do corpo da ação). A validação de verdade é do src/conta/contaServidor.test.ts.
// hml-21b: + a Agenda e os Alunos — as gravações em conta/agenda.ts e conta/alunos.ts (o falso ganha o insert, o upsert, o delete, o gt e o
// single — o que o falso do teste não tiver, pula, como antes); os ids de mentira também nos params uuid/uuids dos itens do `ler` (as
// consultas da 21b têm a conta, o aluno, o calendário…) e de volta dentro do .or() (o recorte "meu ou da conta" leva a conta na string) e
// nos valores gravados (a consulta, o bloqueio…). A validação de verdade é do src/conta/contaServidor21b.test.ts.
import { CATALOGO_CONTA, consultaDaConta } from "../../supabase-principal/functions/_shared/conta-leituras";
import { CORPOS_DAS_ACOES, moduloDoPedido, statusDoErroConta } from "../../supabase-principal/functions/_shared/conta-regras";
import { atenderLeitura } from "../../supabase-principal/functions/_shared/leitura-servidor";
import { atenderAgenda } from "../../supabase-principal/functions/conta/agenda";
import { atenderAlunos } from "../../supabase-principal/functions/conta/alunos";
import { atenderApp } from "../../supabase-principal/functions/conta/app";
import { atenderCasca } from "../../supabase-principal/functions/conta/casca";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** hml-21b: um uuid de mentira (o que um id do teste vira na ida) dentro de um texto — o .or() do recorte */
const UUID_DE_MENTIRA = /00000000-0000-4000-8000-\d{12}/g;
type Qualquer = Record<string, unknown>;
type Funcao = (...a: unknown[]) => unknown;

/** O encadeamento do banco falso com os valores de volta (os uuids de mentira → os ids do teste); o que o falso não tem, pula. */
function cadeiaDeVolta(alvo: unknown, desfazer: (v: unknown) => unknown): unknown {
  const metodo = (nome: string, ...args: unknown[]) => {
    const f = (alvo as Qualquer | null)?.[nome];
    return typeof f === "function" ? cadeiaDeVolta((f as Funcao).apply(alvo, args), desfazer) : cadeiaDeVolta(alvo, desfazer);
  };
  return {
    eq: (c: string, v: unknown) => metodo("eq", c, desfazer(v)),
    in: (c: string, v: readonly unknown[]) => metodo("in", c, (v as unknown[]).map(desfazer)),
    is: (c: string, v: null) => metodo("is", c, v),
    order: (c: string, o: { ascending: boolean }) => metodo("order", c, o),
    limit: (n: number, o?: { referencedTable: string }) => (o ? metodo("limit", n, o) : metodo("limit", n)),
    range: (de: number, ate: number) => metodo("range", de, ate),
    gte: (c: string, v: unknown) => metodo("gte", c, desfazer(v)),
    lte: (c: string, v: unknown) => metodo("lte", c, desfazer(v)),
    lt: (c: string, v: unknown) => metodo("lt", c, desfazer(v)),
    // hml-21b
    gt: (c: string, v: unknown) => metodo("gt", c, desfazer(v)),
    ilike: (c: string, v: string) => metodo("ilike", c, v),
    or: (filtro: string, o?: { referencedTable: string }) => {
      const f = filtro.replace(UUID_DE_MENTIRA, (u) => String(desfazer(u)));
      return o ? metodo("or", f, o) : metodo("or", f);
    },
    select: (colunas: string) => metodo("select", colunas),
    // hml-21b: o .single() da volta de um insert/upsert: a 1ª linha (o falso sem single), como o maybeSingle
    single: () => {
      const f = (alvo as Qualquer | null)?.single;
      if (typeof f === "function") return (f as Funcao).apply(alvo);
      return Promise.resolve(alvo as PromiseLike<unknown>).then((r) => {
        const o = (r ?? {}) as { data?: unknown; error?: unknown };
        return { ...o, data: Array.isArray(o.data) ? (o.data[0] ?? null) : (o.data ?? null) };
      });
    },
    maybeSingle: () => {
      const f = (alvo as Qualquer | null)?.maybeSingle;
      if (typeof f === "function") return (f as Funcao).apply(alvo);
      // o falso sem maybeSingle: a 1ª linha da lista (o que o supabase-js faz)
      return Promise.resolve(alvo as PromiseLike<unknown>).then((r) => {
        const o = (r ?? {}) as { data?: unknown; error?: unknown };
        return { ...o, data: Array.isArray(o.data) ? (o.data[0] ?? null) : (o.data ?? null) };
      });
    },
    then: (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(alvo as PromiseLike<unknown>).then(ok, falhou),
  };
}

/** hml-21b: os valores de uma gravação com os ids do teste de volta (os uuids de mentira das colunas uuid). */
function desfazerValores(valores: Record<string, unknown>, desfazer: (v: unknown) => unknown): Record<string, unknown> {
  return Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, desfazer(v)]));
}

/** O cliente "como a pessoa" dos módulos por cima do banco falso do teste. */
function clienteDoTeste(banco: unknown, desfazer: (v: unknown) => unknown) {
  const b = banco as {
    rpc?: Funcao;
    from?: (t: string) => { select?: Funcao; update?: Funcao; insert?: Funcao; upsert?: Funcao; delete?: Funcao } | undefined;
    storage?: { from?: (bucket: string) => Qualquer | undefined };
  };
  const vazio = { data: [], error: null };
  return {
    rpc: (nome: string, args: Record<string, unknown> = {}) => {
      if (!b.rpc) return Promise.resolve({ data: null, error: null });
      const ida = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, desfazer(v)]));
      return Promise.resolve(Object.keys(ida).length ? b.rpc(nome, ida) : b.rpc(nome));
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: unknown) => {
        const t = b.from ? b.from(tabela) : undefined;
        const inicio = t && typeof t.select === "function" ? (opcoes ? t.select(colunas, opcoes) : t.select(colunas)) : vazio;
        return cadeiaDeVolta(inicio, desfazer);
      },
      update: (valores: Record<string, unknown>) => {
        const t = b.from ? b.from(tabela) : undefined;
        return cadeiaDeVolta(t && typeof t.update === "function" ? t.update(desfazerValores(valores, desfazer)) : vazio, desfazer);
      },
      // hml-21b: criar, o upsert das regras e o delete do bloqueio/da trava (os valores com os ids do teste de volta)
      insert: (valores: Record<string, unknown>) => {
        const t = b.from ? b.from(tabela) : undefined;
        return cadeiaDeVolta(t && typeof t.insert === "function" ? t.insert(desfazerValores(valores, desfazer)) : { data: [valores], error: null }, desfazer);
      },
      upsert: (valores: Record<string, unknown>, opcoes?: unknown) => {
        const t = b.from ? b.from(tabela) : undefined;
        return cadeiaDeVolta(t && typeof t.upsert === "function" ? t.upsert(desfazerValores(valores, desfazer), opcoes) : { data: [valores], error: null }, desfazer);
      },
      delete: () => {
        const t = b.from ? b.from(tabela) : undefined;
        return cadeiaDeVolta(t && typeof t.delete === "function" ? t.delete() : vazio, desfazer);
      },
    }),
    storage: {
      from: (bucket: string) => {
        const s = (b.storage?.from ? b.storage.from(bucket) : undefined) ?? {};
        const chamar = (nome: string, padrao: unknown, ...args: unknown[]) =>
          Promise.resolve(typeof s[nome] === "function" ? (s[nome] as Funcao)(...args) : padrao);
        return {
          createSignedUploadUrl: (caminho: string) => chamar("createSignedUploadUrl", { data: { token: "token-de-teste" }, error: null }, caminho),
          list: (pasta: string, o: { search: string; limit: number }) => chamar("list", { data: [{ name: o.search }], error: null }, pasta, o),
          remove: (caminhos: string[]) => chamar("remove", { data: caminhos.map((name) => ({ name })), error: null }, caminhos),
          createSignedUrls: (caminhos: string[], validade: number) => chamar("createSignedUrls", { data: [], error: null }, caminhos, validade),
          createSignedUrl: (caminho: string, validade: number, o?: unknown) => chamar("createSignedUrl", { data: null, error: { status: 400 } }, caminho, validade, o),
        };
      },
    },
  };
}

/** O que o motor/os módulos logam no teste: nada (o log de verdade é provado no contaServidor.test.ts). */
const LOG_MUDO = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };

/**
 * O `functions.invoke` da conta: (corpo) → { data, error } como o supabase-js devolve (o erro com o Response do status da função).
 * `userId` = quem está logado no teste (o dono das "minhas" e das gravações); `schema` = o do ambiente (o staging nos testes).
 */
export function invocarContaPeloModulo(banco: unknown, opcoes: { userId?: string; schema?: "public" | "staging" } = {}) {
  return async (corpo: Qualquer): Promise<{ data: unknown; error: unknown }> => {
    const ida = new Map<string, string>();
    const volta = new Map<string, string>();
    const trocar = (v: unknown): unknown => {
      if (typeof v !== "string" || UUID.test(v)) return v;
      if (!ida.has(v)) {
        const u = `00000000-0000-4000-8000-${String(ida.size + 1).padStart(12, "0")}`;
        ida.set(v, u);
        volta.set(u, v);
      }
      return ida.get(v);
    };
    const desfazer = (v: unknown): unknown => (typeof v === "string" && volta.has(v) ? volta.get(v) : Array.isArray(v) ? v.map(desfazer) : v);
    // os campos uuid/uuids do corpo da ação; hml-21b: e os params uuid/uuids dos itens do `ler` (pelo catálogo)
    const pedido = moduloDoPedido(corpo);
    const novo: Qualquer = { ...corpo };
    if (pedido && pedido.modulo === "leitura" && Array.isArray(corpo.itens)) {
      novo.itens = (corpo.itens as unknown[]).map((bruto) => {
        const item = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? { ...(bruto as Qualquer) } : bruto;
        const consulta = item && typeof item === "object" ? consultaDaConta((item as Qualquer).q) : null;
        if (!consulta) return item;
        for (const [nome, p] of Object.entries(consulta.params as Record<string, { tipo: string }>)) {
          const it = item as Qualquer;
          if (!(nome in it)) continue;
          if (p.tipo === "uuid") it[nome] = trocar(it[nome]);
          if (p.tipo === "uuids" && Array.isArray(it[nome])) it[nome] = (it[nome] as unknown[]).map(trocar);
        }
        return item;
      });
    }
    if (pedido && pedido.modulo !== "leitura") {
      for (const [nome, p] of Object.entries(CORPOS_DAS_ACOES[pedido.acao] as Record<string, { tipo: string }>)) {
        if (!(nome in novo)) continue;
        if (p.tipo === "uuid") novo[nome] = trocar(novo[nome]);
        if (p.tipo === "uuids" && Array.isArray(novo[nome])) novo[nome] = (novo[nome] as unknown[]).map(trocar);
      }
    }
    const c = {
      schema: opcoes.schema ?? "staging",
      origin: null,
      corpo: novo,
      userId: opcoes.userId ?? "u-teste",
      comoPessoa: clienteDoTeste(banco, desfazer),
      log: LOG_MUDO,
    };
    let r: unknown;
    if (!pedido) r = { ok: false, erro: "acao_invalida" };
    else if (pedido.modulo === "leitura") r = await atenderLeitura(c as never, CATALOGO_CONTA);
    else if (pedido.modulo === "casca") r = await atenderCasca(c as never, pedido.acao);
    else if (pedido.modulo === "app") r = await atenderApp(c as never, pedido.acao);
    else if (pedido.modulo === "agenda") r = await atenderAgenda(c as never, pedido.acao);
    else r = await atenderAlunos(c as never, pedido.acao);
    const json = JSON.parse(JSON.stringify(r)) as { ok?: unknown; erro?: unknown };
    if (json.ok === true) return { data: json, error: null };
    const resposta = new Response(JSON.stringify(json), { status: statusDoErroConta(json.erro), headers: { "Content-Type": "application/json" } });
    return { data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: resposta } };
  };
}

/** O `functions.invoke` de um principal falso que leva a `conta` aos módulos de verdade e o resto ao `outras` do teste. */
export function invocarComConta(banco: unknown, opcoes: { userId?: string; schema?: "public" | "staging" } = {}, outras?: (nome: string, o: { body?: unknown }) => unknown) {
  const conta = invocarContaPeloModulo(banco, opcoes);
  return (nome: string, o: { body?: unknown } = {}) =>
    nome === "conta" ? conta((o.body ?? {}) as Qualquer) : outras ? outras(nome, o) : Promise.resolve({ data: null, error: { name: "FunctionsHttpError" } });
}
