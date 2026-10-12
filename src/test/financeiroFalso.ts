// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4) — a ação `ler` da função financeiro nos testes de TELA e de lib que já falsificavam o
// banco (principal.rpc/from do @/integrations/principal/client), no molde do src/test/nutricaoFalsa.ts: em vez de responder o lote à mão,
// roda o MÓDULO DE VERDADE do servidor (functions/financeiro/leituras.ts: o catálogo, o motor, os args das RPCs, o select com as colunas,
// os filtros, a ordem, a página e o laço) sobre o MESMO banco falso do teste — as idas ao banco são as mesmas que o navegador fazia (agora o
// servidor faz, como a pessoa), então o teste segue provando o mesmo, e o que volta passa pela "rede" (JSON).
// Os ids de mentira dos testes ("p1") não são uuid e o módulo valida o uuid: cada um vira um uuid de mentira na ida e volta ao original
// quando chega ao banco falso (só nos params do tipo uuid do catálogo e dentro do texto do recorte). A validação de verdade (uuid ruim →
// dados_invalidos) é provada no src/financeiro/leituraServidor.test.ts.
// DUPLICAÇÃO (anotada no progresso da hml-20d): o cadeiaDeVolta/clienteDoTeste são os do nutricaoFalsa.ts (sem o Storage) — o da nutricao
// fica como está nesta W.
import { CONSULTAS_FINANCEIRO } from "../../supabase-principal/functions/_shared/financeiro-leituras";
import { atenderLeitura, type ClienteLeitura } from "../../supabase-principal/functions/financeiro/leituras";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Qualquer = Record<string, unknown>;

/** O encadeamento do banco falso com os valores de volta (os uuids de mentira → os ids do teste); o que o falso não tem, pula. */
function cadeiaDeVolta(alvo: unknown, desfazer: (v: unknown) => unknown, desfazerNoTexto: (v: string) => string): unknown {
  const metodo = (nome: string, ...args: unknown[]) => {
    const f = (alvo as Qualquer | null)?.[nome];
    return typeof f === "function"
      ? cadeiaDeVolta((f as (...a: unknown[]) => unknown).apply(alvo, args), desfazer, desfazerNoTexto)
      : cadeiaDeVolta(alvo, desfazer, desfazerNoTexto);
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
    ilike: (c: string, v: string) => metodo("ilike", c, v),
    or: (filtro: string, o?: { referencedTable: string }) => (o ? metodo("or", desfazerNoTexto(filtro), o) : metodo("or", desfazerNoTexto(filtro))),
    then: (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(alvo as PromiseLike<unknown>).then(ok, falhou),
  };
}

/** O cliente "como a pessoa" do módulo por cima do banco falso do teste. */
function clienteDoTeste(banco: unknown, desfazer: (v: unknown) => unknown, desfazerNoTexto: (v: string) => string): ClienteLeitura {
  const b = banco as { rpc?: (nome: string, args: Qualquer) => unknown; from?: (t: string) => { select?: (c: string, o?: unknown) => unknown } };
  return {
    rpc: (nome, args) =>
      Promise.resolve(b.rpc ? b.rpc(nome, Object.fromEntries(Object.entries(args).map(([k, v]) => [k, desfazer(v)]))) : { data: null, error: null }) as PromiseLike<{
        data: unknown;
        error: unknown;
      }>,
    from: (tabela) => ({
      select: (colunas, opcoes) => {
        const t = b.from ? b.from(tabela) : null;
        const inicio = t && typeof t.select === "function" ? (opcoes ? t.select(colunas, opcoes) : t.select(colunas)) : { data: [], error: null };
        return cadeiaDeVolta(inicio, desfazer, desfazerNoTexto) as ReturnType<ReturnType<ClienteLeitura["from"]>["select"]>;
      },
    }),
  };
}

/**
 * O `functions.invoke` da financeiro para o `ler`: (corpo) → { data, error } como o supabase-js devolve. `userId` = quem está logado no
 * teste (o dono das consultas "minhas" e do recorte da conta ativa).
 */
export function lerFinanceiroPeloModulo(banco: unknown, opcoes: { userId?: string; schema?: "public" | "staging" } = {}) {
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
    const desfazerNoTexto = (t: string): string => [...volta.entries()].reduce((acc, [u, id]) => acc.split(u).join(id), t);
    const itens = Array.isArray(corpo.itens)
      ? corpo.itens.map((item) => {
          const q = (item as { q?: unknown } | null)?.q;
          const consulta = typeof q === "string" ? (CONSULTAS_FINANCEIRO as Record<string, { params: Record<string, { tipo: string }> }>)[q] : undefined;
          if (!consulta || !item || typeof item !== "object") return item;
          const novo: Qualquer = { ...(item as Qualquer) };
          for (const [nome, p] of Object.entries(consulta.params)) if (p.tipo === "uuid" && nome in novo) novo[nome] = trocar(novo[nome]);
          return novo;
        })
      : corpo.itens;
    const log = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };
    const r = await atenderLeitura({
      schema: opcoes.schema ?? "staging",
      corpo: { ...corpo, itens },
      userId: opcoes.userId ?? "u-teste",
      comoPessoa: clienteDoTeste(banco, desfazer, desfazerNoTexto),
      log: log as unknown as Parameters<typeof atenderLeitura>[0]["log"],
    });
    return { data: JSON.parse(JSON.stringify(r)), error: null };
  };
}

/** O corpo é o `ler` da financeiro? (o resto — as gravações e o padroes_garantir — segue no falso de cada teste) */
export const ehLerFinanceiro = (corpo: unknown): corpo is Qualquer & { acao: "ler" } => !!corpo && typeof corpo === "object" && (corpo as Qualquer).acao === "ler";
