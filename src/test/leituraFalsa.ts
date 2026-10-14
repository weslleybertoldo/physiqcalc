// Physiq hml-21c (H-112) — o falso GENÉRICO da ação `ler` de uma função do jeito 2 nos testes de TELA e de lib que já falsificavam o banco:
// roda o MOTOR COMUM de verdade (supabase-principal/functions/_shared/leitura-servidor.ts) com o CATÁLOGO da função como parâmetro (o
// CATALOGO_NUTRICAO, o CATALOGO_FINANCEIRO) sobre o MESMO banco falso do teste — as idas ao banco são as mesmas que o navegador fazia (agora
// o servidor faz, como a pessoa), então o teste segue provando o mesmo (a RPC com os args de hoje, a tabela certa, a página certa), e o que
// volta passa pela "rede" (JSON). Era o src/test/nutricaoFalsa.ts e o src/test/financeiroFalso.ts, 2 cópias do mesmo falso (a DUPLICAÇÃO
// anotada na hml-20d) — os 2 seguem como as entradas de cada função (os testes que os importam não mudam), por cima deste.
//   · os ids de mentira dos testes ("p1", "u2") não são uuid e o motor valida o uuid: cada um vira um uuid de mentira na ida (só nos params
//     uuid/uuids do catálogo) e volta ao original quando chega ao banco falso (também dentro do texto do recorte .or()); a validação de
//     verdade (uuid ruim → dados_invalidos) é dos testes do servidor;
//   · o que o falso do teste não tem (um método da cadeia, a RPC, o Storage) pula: a cadeia segue com o que veio.
import { atenderLeitura, type CatalogoDoServidor, type ClienteLeitura } from "../../supabase-principal/functions/_shared/leitura-servidor";

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
    // o limite do embutido vem com a tabela (o falso recebe os 2 argumentos só quando há a opção)
    limit: (n: number, o?: { referencedTable: string }) => (o ? metodo("limit", n, o) : metodo("limit", n)),
    range: (de: number, ate: number) => metodo("range", de, ate),
    // o período, a busca e o recorte (no recorte, os uuids de mentira dentro do texto voltam aos ids do teste)
    gte: (c: string, v: unknown) => metodo("gte", c, desfazer(v)),
    lte: (c: string, v: unknown) => metodo("lte", c, desfazer(v)),
    lt: (c: string, v: unknown) => metodo("lt", c, desfazer(v)),
    ilike: (c: string, v: string) => metodo("ilike", c, v),
    or: (filtro: string, o?: { referencedTable: string }) => (o ? metodo("or", desfazerNoTexto(filtro), o) : metodo("or", desfazerNoTexto(filtro))),
    then: (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(alvo as PromiseLike<unknown>).then(ok, falhou),
  };
}

/** O cliente "como a pessoa" do motor por cima do banco falso do teste (o Storage só quando o catálogo assina — o da financeiro, nunca). */
function clienteDoTeste(banco: unknown, desfazer: (v: unknown) => unknown, desfazerNoTexto: (v: string) => string): ClienteLeitura {
  const b = banco as {
    rpc?: (nome: string, args: Qualquer) => unknown;
    from?: (t: string) => { select?: (c: string, o?: unknown) => unknown };
    storage?: { from?: (bucket: string) => Qualquer };
  };
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
    storage: {
      from: (bucket) => {
        const s = b.storage?.from ? b.storage.from(bucket) : {};
        const chamar = (nome: string, ...args: unknown[]) =>
          Promise.resolve(typeof s[nome] === "function" ? (s[nome] as (...a: unknown[]) => unknown)(...args) : { data: null, error: { message: "sem storage no teste" } }) as PromiseLike<{
            data: unknown;
            error: unknown;
          }>;
        return {
          createSignedUrls: (caminhos, validade) => chamar("createSignedUrls", caminhos, validade),
          createSignedUrl: (caminho, validade, opcoes) => chamar("createSignedUrl", caminho, validade, opcoes),
        };
      },
    },
  };
}

/**
 * O `functions.invoke` de uma função do jeito 2 para o `ler`: (corpo) → { data, error } como o supabase-js devolve. `catalogo` = o da função
 * (o motor comum o recebe como parâmetro); `userId` = quem está logado no teste (o dono das consultas "minhas" e do recorte da conta ativa);
 * `schema` = o do ambiente (o bucket "-staging" no staging).
 */
export function lerPeloMotor(catalogo: CatalogoDoServidor, banco: unknown, opcoes: { userId?: string; schema?: "public" | "staging" } = {}) {
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
    // o recorte (.or()) leva os ids dentro do texto — cada uuid de mentira volta ao id do teste
    const desfazerNoTexto = (t: string): string => [...volta.entries()].reduce((acc, [u, id]) => acc.split(u).join(id), t);
    const itens = Array.isArray(corpo.itens)
      ? corpo.itens.map((item) => {
          const q = (item as { q?: unknown } | null)?.q;
          const consultas = catalogo.consultas as Record<string, { params: Record<string, { tipo: string }> }>;
          const consulta = typeof q === "string" && Object.prototype.hasOwnProperty.call(consultas, q) ? consultas[q] : undefined;
          if (!consulta || !item || typeof item !== "object") return item;
          const novo: Qualquer = { ...(item as Qualquer) };
          for (const [nome, p] of Object.entries(consulta.params)) {
            if (p.tipo === "uuid" && nome in novo) novo[nome] = trocar(novo[nome]);
            if (p.tipo === "uuids" && Array.isArray(novo[nome])) novo[nome] = (novo[nome] as unknown[]).map(trocar);
          }
          return novo;
        })
      : corpo.itens;
    const log = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };
    const r = await atenderLeitura(
      {
        schema: opcoes.schema ?? "staging",
        corpo: { ...corpo, itens },
        userId: opcoes.userId ?? "u-teste",
        comoPessoa: clienteDoTeste(banco, desfazer, desfazerNoTexto),
        log: log as unknown as Parameters<typeof atenderLeitura>[0]["log"],
      },
      catalogo,
    );
    return { data: JSON.parse(JSON.stringify(r)), error: null };
  };
}

/** O corpo é o `ler`? (o resto — as gravações e o padroes_garantir — segue no falso de cada teste) */
export const ehLerDaFuncao = (corpo: unknown): corpo is Qualquer & { acao: "ler" } =>
  !!corpo && typeof corpo === "object" && (corpo as Qualquer).acao === "ler";
