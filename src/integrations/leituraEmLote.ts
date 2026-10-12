// Physiq hml-20a (H-42 · jeito 2, etapa 2 · decisão 4) — o LOTE AUTOMÁTICO das leituras no navegador (spec hml-20 §2.3). As libs de
// leitura chamam `ler(q, params)` (pelo invólucro da função: lerNutricao em src/nutricao/leitura.ts; na 20d, lerFinanceiro) e mantêm a
// assinatura delas — os componentes, as chaves do React Query e o staleTime não mudam. As leituras pedidas na MESMA volta (dentro de
// janelaMs, 5 ms) viram 1 chamada à função: { acao: "ler", itens: [{ ...params, q }] } (a q por último: nenhum param troca a consulta).
//   · até maxItens (16) por lote — o 17º abre outro lote; `sozinha` = num lote só dela (as consultas pesadas não seguram a tela);
//   · cada leitura recebe a SUA resposta: o item { ok: false, erro } rejeita só ela; a chamada que falha (rede, 5xx, 429, a porta
//     recusou) rejeita todas as do lote com o mesmo código;
//   · sem rede (navigator.onLine === false) → sem_internet na hora, sem chamar (como as libs faziam);
//   · a repetição (1 vez em 5xx/429/rede) é a do fetch dos 2 clientes (src/integrations/repeticao.ts, ACOES_DE_LEITURA) — não daqui.
// A resposta de cada item: { linhas?, valor?, total? } (o que o motor do servidor devolve: _shared/leitura-lote.ts).

/** O que a função devolve por item (sem o `ok`). */
export interface ResultadoDeLeitura {
  linhas?: unknown[];
  valor?: unknown;
  total?: number;
}

/** A resposta do supabase-js (functions.invoke): { data, error } — o erro com o Response em `context` quando a função respondeu. */
export interface RespostaDaFuncao {
  data: unknown;
  error: unknown;
}

export interface OpcoesLeitor {
  /** a função do jeito 2 (nutricao; na 20d, financeiro) */
  funcao: string;
  /** chama a função (o functions.invoke do cliente com a sessão de quem está logado) */
  invocar: (funcao: string, corpo: Record<string, unknown>) => Promise<RespostaDaFuncao>;
  /** o erro da leitura, com o código (a frase fixa é de quem cria) */
  erro: (codigo: string, extra?: Record<string, unknown>) => Error;
  janelaMs?: number;
  maxItens?: number;
}

export interface OpcoesLeitura {
  /** vai num lote só dela (as consultas pesadas não seguram a tela) */
  sozinha?: boolean;
}

export type Leitor = (q: string, params?: Record<string, unknown>, opcoes?: OpcoesLeitura) => Promise<ResultadoDeLeitura>;

/** O teto de itens por lote (o LOTE_MAX do servidor: acima, ele recusa o pedido inteiro com lote_grande). */
export const MAX_ITENS_POR_LOTE = 16;
/** A janela em que as leituras da mesma volta entram no mesmo lote. */
export const JANELA_MS = 5;

interface Pendente {
  q: string;
  params: Record<string, unknown>;
  sozinha: boolean;
  resolver: (r: ResultadoDeLeitura) => void;
  rejeitar: (e: Error) => void;
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** O código de uma chamada que falhou: o { erro } que a função respondeu; sem resposta (rede) → "rede"; o resto → erro_interno. */
async function codigoDaFalha(erro: unknown): Promise<{ codigo: string; extra: Record<string, unknown> }> {
  const contexto = (erro as { context?: unknown } | null)?.context;
  if (contexto && typeof (contexto as Response).clone === "function") {
    try {
      const corpo = (await (contexto as Response).clone().json()) as unknown;
      if (ehObjeto(corpo) && typeof corpo.erro === "string") return { codigo: corpo.erro, extra: corpo };
    } catch {
      // corpo que não é JSON: segue para o código genérico
    }
  }
  if ((erro as { name?: unknown } | null)?.name === "FunctionsFetchError") return { codigo: "rede", extra: {} };
  return { codigo: "erro_interno", extra: {} };
}

/** Cria o leitor em lote de uma função do jeito 2. */
export function criarLeitor(opcoes: OpcoesLeitor): Leitor {
  const janela = opcoes.janelaMs ?? JANELA_MS;
  const max = Math.max(1, Math.min(opcoes.maxItens ?? MAX_ITENS_POR_LOTE, MAX_ITENS_POR_LOTE));
  let fila: Pendente[] = [];
  let relogio: ReturnType<typeof setTimeout> | null = null;

  const rejeitarTodos = (lote: Pendente[], codigo: string, extra: Record<string, unknown> = {}) => {
    for (const p of lote) p.rejeitar(opcoes.erro(codigo, extra));
  };

  const enviar = async (lote: Pendente[]) => {
    let resposta: RespostaDaFuncao;
    try {
      resposta = await opcoes.invocar(opcoes.funcao, { acao: "ler", itens: lote.map((p) => ({ ...p.params, q: p.q })) });
    } catch {
      rejeitarTodos(lote, "rede");
      return;
    }
    if (resposta.error) {
      const { codigo, extra } = await codigoDaFalha(resposta.error);
      rejeitarTodos(lote, codigo, extra);
      return;
    }
    const d = resposta.data;
    if (!ehObjeto(d) || d.ok !== true || !Array.isArray(d.itens)) {
      rejeitarTodos(lote, ehObjeto(d) && typeof d.erro === "string" ? d.erro : "erro_interno");
      return;
    }
    const itens = d.itens as unknown[];
    lote.forEach((p, i) => {
      const item = itens[i];
      if (ehObjeto(item) && item.ok === true) {
        const { ok: _ok, ...resultado } = item;
        p.resolver(resultado as ResultadoDeLeitura);
      } else {
        p.rejeitar(opcoes.erro(ehObjeto(item) && typeof item.erro === "string" ? item.erro : "erro_interno"));
      }
    });
  };

  const despachar = () => {
    relogio = null;
    const pendentes = fila;
    fila = [];
    const lotes: Pendente[][] = [];
    let atual: Pendente[] = [];
    for (const p of pendentes) {
      if (p.sozinha) {
        lotes.push([p]);
        continue;
      }
      atual.push(p);
      if (atual.length === max) {
        lotes.push(atual);
        atual = [];
      }
    }
    if (atual.length) lotes.push(atual);
    for (const lote of lotes) void enviar(lote);
  };

  return (q, params = {}, opcoesDaLeitura = {}) =>
    new Promise<ResultadoDeLeitura>((resolver, rejeitar) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        rejeitar(opcoes.erro("sem_internet"));
        return;
      }
      fila.push({ q, params, sozinha: opcoesDaLeitura.sozinha === true, resolver, rejeitar });
      if (relogio === null) relogio = setTimeout(despachar, janela);
    });
}
