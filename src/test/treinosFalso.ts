// Physiq hml-21d (H-43 · jeito 2, etapa 3) — a função treinos (Banco do Treino) nos testes de TELA e de lib que já falsificavam o cliente do
// Treino (supabase.rpc/from/storage do @/integrations/supabase/client), no molde do src/test/contaFalsa.ts: em vez de responder a função à
// mão, roda os MÓDULOS DE VERDADE do servidor — o `ler` no motor (a cópia do motor comum, _shared/treinos-leituras.ts) e as gravações em
// treinos/{modelos,biblioteca,master}.ts — sobre o MESMO banco falso do teste: as idas ao banco são as mesmas que o navegador fazia (agora o
// servidor faz, como a pessoa), então o teste segue provando o mesmo; o que volta passa pela "rede" (JSON) e o erro chega como o supabase-js
// entrega (FunctionsHttpError com o Response do status da função). O Master: a opção `master` faz o papel do app_metadata.role do token (a
// porta confere ANTES do banco — o 403 é provado no src/treino/portaTreino.test.ts).
//   · o que o falso do teste não tem (um método da cadeia, a RPC, o Storage) pula: a cadeia segue com o que veio;
//   · os ids de mentira dos testes ("m1") não são uuid e a função valida o uuid: cada um vira um uuid de mentira na ida e volta ao original
//     quando chega ao banco falso (nos campos uuid das ações, nos params uuid/uuids dos itens do `ler`, no professor do exercicios_lista, nos
//     ids do modelo_ordenar e no id/exercicio_id do treino pronto). A validação de verdade é do src/treino/treinosServidor.test.ts.
import { atenderLeituraDoTreino, consultaDoTreino } from "../../supabase/functions/_shared/treinos-leituras";
import { CORPOS_DAS_ACOES, moduloDoPedido, statusDoErroTreino } from "../../supabase/functions/_shared/treinos-regras";
import { atenderBiblioteca } from "../../supabase/functions/treinos/biblioteca";
import { atenderMaster } from "../../supabase/functions/treinos/master";
import { atenderModelos } from "../../supabase/functions/treinos/modelos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** um uuid de mentira (o que um id do teste vira na ida) dentro de um texto — o .or() do recorte global-ou-meu leva o user na string */
const UUID_DE_MENTIRA = /00000000-0000-4000-9000-\d{12}/g;
type Qualquer = Record<string, unknown>;
type Funcao = (...a: unknown[]) => unknown;
/** O host da API do Treino que o falso usa para a URL pública da foto (o do projeto: o VITE_SUPABASE_URL dos testes). */
export const URL_DO_PROJETO_FALSO = "https://treino-de-teste.supabase.co";

/** O encadeamento do banco falso com os valores de volta (os uuids de mentira → os ids do teste); o que o falso não tem, pula. */
function cadeiaDeVolta(alvo: unknown, desfazer: (v: unknown) => unknown): unknown {
  const metodo = (nome: string, ...args: unknown[]) => {
    const f = (alvo as Qualquer | null)?.[nome];
    return typeof f === "function" ? cadeiaDeVolta((f as Funcao).apply(alvo, args), desfazer) : cadeiaDeVolta(alvo, desfazer);
  };
  const umaLinha = (nome: "single" | "maybeSingle") => {
    const f = (alvo as Qualquer | null)?.[nome];
    if (typeof f === "function") return (f as Funcao).apply(alvo);
    return Promise.resolve(alvo as PromiseLike<unknown>).then((r) => {
      const o = (r ?? {}) as { data?: unknown; error?: unknown };
      return { ...o, data: Array.isArray(o.data) ? (o.data[0] ?? null) : (o.data ?? null) };
    });
  };
  return {
    eq: (c: string, v: unknown) => metodo("eq", c, desfazer(v)),
    in: (c: string, v: readonly unknown[]) => metodo("in", c, (v as unknown[]).map(desfazer)),
    is: (c: string, v: null) => metodo("is", c, v),
    order: (c: string, o: { ascending: boolean }) => metodo("order", c, o),
    limit: (n: number, o?: { referencedTable: string }) => (o ? metodo("limit", n, o) : metodo("limit", n)),
    range: (de: number, ate: number) => metodo("range", de, ate),
    ilike: (c: string, v: string) => metodo("ilike", c, v),
    or: (filtro: string, o?: { referencedTable: string }) => {
      const f = filtro.replace(UUID_DE_MENTIRA, (u) => String(desfazer(u)));
      return o ? metodo("or", f, o) : metodo("or", f);
    },
    select: (colunas: string) => metodo("select", colunas),
    single: () => umaLinha("single"),
    maybeSingle: () => umaLinha("maybeSingle"),
    then: (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(alvo as PromiseLike<unknown>).then(ok, falhou),
  };
}

/** Os valores de uma gravação com os ids do teste de volta (os uuids de mentira das colunas uuid). */
const desfazerValores = (valores: Qualquer, desfazer: (v: unknown) => unknown): Qualquer =>
  Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, desfazer(v)]));

/** O cliente "como a pessoa" dos módulos por cima do banco falso do teste. */
function clienteDoTeste(banco: unknown, desfazer: (v: unknown) => unknown) {
  const b = banco as {
    rpc?: Funcao;
    from?: (t: string) => { select?: Funcao; update?: Funcao; insert?: Funcao; delete?: Funcao } | undefined;
    storage?: { from?: (bucket: string) => Qualquer | undefined };
  };
  const vazio = { data: [], error: null };
  const tabela = (t: string) => (b.from ? b.from(t) : undefined);
  return {
    rpc: (nome: string, args: Qualquer = {}) => {
      if (!b.rpc) return Promise.resolve({ data: null, error: null });
      const ida = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, desfazer(v)]));
      return Promise.resolve(Object.keys(ida).length ? b.rpc(nome, ida) : b.rpc(nome));
    },
    from: (t: string) => ({
      select: (colunas: string, opcoes?: unknown) => {
        const x = tabela(t);
        return cadeiaDeVolta(x && typeof x.select === "function" ? (opcoes ? x.select(colunas, opcoes) : x.select(colunas)) : vazio, desfazer);
      },
      update: (valores: Qualquer) => {
        const x = tabela(t);
        return cadeiaDeVolta(x && typeof x.update === "function" ? x.update(desfazerValores(valores, desfazer)) : { data: [{ id: "x" }], error: null }, desfazer);
      },
      insert: (valores: Qualquer) => {
        const x = tabela(t);
        return cadeiaDeVolta(x && typeof x.insert === "function" ? x.insert(desfazerValores(valores, desfazer)) : { data: [valores], error: null }, desfazer);
      },
      delete: () => {
        const x = tabela(t);
        return cadeiaDeVolta(x && typeof x.delete === "function" ? x.delete() : { data: [{ id: "x" }], error: null }, desfazer);
      },
    }),
    storage: {
      from: (bucket: string) => {
        const s = (b.storage?.from ? b.storage.from(bucket) : undefined) ?? {};
        const chamar = (nome: string, padrao: unknown, ...args: unknown[]) =>
          Promise.resolve(typeof s[nome] === "function" ? (s[nome] as Funcao)(...args) : padrao);
        return {
          createSignedUploadUrl: (caminho: string, o: unknown) => chamar("createSignedUploadUrl", { data: { token: "token-de-teste" }, error: null }, desfazer(caminho), o),
          list: (pasta: string, o: { search: string; limit: number }) => chamar("list", { data: [{ name: o.search }], error: null }, pasta, o),
        };
      },
    },
  };
}

/** O que o motor/os módulos logam no teste: nada (o log de verdade é provado no treinosServidor.test.ts). */
const LOG_MUDO = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };

/**
 * O `functions.invoke` da treinos: (corpo) → { data, error } como o supabase-js devolve (o erro com o Response do status da função).
 * `userId` = o usuário do Treino de quem está logado no teste (o dono das "minhas" e do que é criado); `master` = o papel do token.
 */
export function invocarTreinosPeloModulo(banco: unknown, opcoes: { userId?: string; master?: boolean; schema?: "public" | "staging" } = {}) {
  return async (corpo: Qualquer): Promise<{ data: unknown; error: unknown }> => {
    const ida = new Map<string, string>();
    const volta = new Map<string, string>();
    const trocar = (v: unknown): unknown => {
      if (typeof v !== "string" || UUID.test(v)) return v;
      if (!ida.has(v)) {
        const u = `00000000-0000-4000-9000-${String(ida.size + 1).padStart(12, "0")}`;
        ida.set(v, u);
        volta.set(u, v);
      }
      return ida.get(v);
    };
    const desfazer = (v: unknown): unknown => {
      if (typeof v === "string" && volta.has(v)) return volta.get(v);
      if (typeof v === "string" && v.includes("00000000-0000-4000-9000-")) return v.replace(UUID_DE_MENTIRA, (u) => volta.get(u) ?? u);
      return Array.isArray(v) ? v.map(desfazer) : v;
    };
    const pedido = moduloDoPedido(corpo);
    const novo: Qualquer = { ...corpo };
    if (pedido && pedido.modulo === "leitura" && Array.isArray(corpo.itens)) {
      novo.itens = (corpo.itens as unknown[]).map((bruto) => {
        const item = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? { ...(bruto as Qualquer) } : bruto;
        if (!item || typeof item !== "object") return item;
        const it = item as Qualquer;
        if (it.q === "exercicios_lista" && it.filtros && typeof it.filtros === "object") {
          const f = { ...(it.filtros as Qualquer) };
          if (typeof f.professor === "string") f.professor = trocar(f.professor);
          it.filtros = f;
          return it;
        }
        const consulta = consultaDoTreino(it.q);
        if (!consulta) return it;
        for (const [nome, p] of Object.entries(consulta.params as Record<string, { tipo: string; campos?: Record<string, { tipo: string }> }>)) {
          if (!(nome in it)) continue;
          if (p.tipo === "uuid") it[nome] = trocar(it[nome]);
          if (p.tipo === "uuids" && Array.isArray(it[nome])) it[nome] = (it[nome] as unknown[]).map(trocar);
          if (p.tipo === "objeto" && it[nome] && typeof it[nome] === "object") {
            const o = { ...(it[nome] as Qualquer) };
            for (const [k, c] of Object.entries(p.campos ?? {})) if (c.tipo === "uuid" && k in o) o[k] = trocar(o[k]);
            it[nome] = o;
          }
        }
        return it;
      });
    }
    if (pedido && pedido.modulo !== "leitura") {
      for (const [nome, p] of Object.entries(CORPOS_DAS_ACOES[pedido.acao] as Record<string, { tipo: string }>)) {
        if (!(nome in novo)) continue;
        if (p.tipo === "uuid") novo[nome] = trocar(novo[nome]);
        if (p.tipo === "ids" && Array.isArray(novo[nome])) novo[nome] = (novo[nome] as unknown[]).map(trocar);
      }
      if (pedido.acao === "treino_pronto_salvar") {
        if (typeof novo.id === "string") novo.id = trocar(novo.id);
        if (Array.isArray(novo.divisoes)) {
          novo.divisoes = (novo.divisoes as Qualquer[]).map((d) => ({
            ...d,
            exercicios: Array.isArray(d?.exercicios) ? (d.exercicios as Qualquer[]).map((e) => ({ ...e, exercicio_id: trocar(e?.exercicio_id) })) : d?.exercicios,
          }));
        }
      }
    }
    const c = {
      schema: opcoes.schema ?? "staging",
      origin: null,
      corpo: novo,
      userId: opcoes.userId ?? "t-teste",
      master: opcoes.master === true,
      comoPessoa: clienteDoTeste(banco, desfazer),
      log: LOG_MUDO,
    };
    let r: unknown;
    if (!pedido) r = { ok: false, erro: "acao_invalida" };
    else if (pedido.modulo === "leitura") r = await atenderLeituraDoTreino(c as never);
    else if (pedido.modulo === "modelos") r = await atenderModelos(c as never, pedido.acao);
    else if (pedido.modulo === "biblioteca") r = await atenderBiblioteca(c as never, pedido.acao, URL_DO_PROJETO_FALSO);
    else r = await atenderMaster(c as never, pedido.acao);
    // a volta pela "rede": os ids de mentira voltam aos do teste (o id criado, a linha do grupo muscular, o treino pronto salvo)
    const json = JSON.parse(JSON.stringify(r), (_k, v) => desfazer(v)) as { ok?: unknown; erro?: unknown };
    if (json.ok === true) return { data: json, error: null };
    const resposta = new Response(JSON.stringify(json), { status: statusDoErroTreino(json.erro), headers: { "Content-Type": "application/json" } });
    return { data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: resposta } };
  };
}

/** O `functions.invoke` de um cliente do Treino falso que leva a `treinos` aos módulos de verdade e o resto ao `outras` do teste. */
export function invocarComTreinos(
  banco: unknown,
  opcoes: { userId?: string; master?: boolean; schema?: "public" | "staging" } = {},
  outras?: (nome: string, o: { body?: unknown }) => unknown,
) {
  const treinos = invocarTreinosPeloModulo(banco, opcoes);
  return (nome: string, o: { body?: unknown } = {}) =>
    nome === "treinos" ? treinos((o.body ?? {}) as Qualquer) : outras ? outras(nome, o) : Promise.resolve({ data: null, error: { name: "FunctionsHttpError" } });
}
