// Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — o MOTOR da ação `ler` (as leituras de saúde pelo servidor), PURO: sem Deno, sem
// rede e sem banco. Usado pela função nutricao (e, na 20d, pela financeiro) e testado no Vitest (src/nutricao/leituraServidor.test.ts).
// O desenho (spec hml-20 §2.2):
//   · o pedido { acao: "ler", itens: [{ q: "<consulta>", ...params }] }: de 1 a LOTE_MAX (16) itens (acima → 400 lote_grande; sem itens
//     → 400 dados_invalidos). Cada item é lido pelo CATÁLOGO da função (_shared/nutricao-leituras.ts; na 20d, financeiro-leituras.ts):
//     a `q` numa lista fechada (desconhecida → o item volta { ok: false, erro: "consulta_invalida" }), os params com tipo e teto (fora
//     da forma → "dados_invalidos", só naquele item) e a chave que o catálogo não declara CAI — nutricionista_id, user_id, um caminho
//     de arquivo… nunca viram filtro;
//   · itens iguais (mesma q + mesmos params) rodam 1 vez e respondem nas 2 posições;
//   · rodarLote: até LOTE_PARALELO (6) ao mesmo tempo, a resposta na MESMA ordem do pedido, o erro de um item não derruba os outros;
//   · a consulta declarada no catálogo (ConsultaLeitura): RPC (os args montados AQUI a partir dos params) ou tabela (as colunas em lista
//     fechada — nunca "*" —, os filtros declarados, o teto, as linhas vivas) e o DONO: a consulta "minha" filtra pela coluna do dono =
//     quem chama (o user do token), nunca pelo corpo. Quem decide o resto é o RLS (a função lê COMO A PESSOA — 2ª camada);
//   · a URL assinada sai do servidor SÓ para caminho que a própria consulta leu (caminhosParaAssinar → urlsAssinadas, que ignora qualquer
//     caminho que não foi pedido) e volta RELATIVA ao projeto (/storage/v1/object/sign/…?token=…): a tela monta com o domínio dela — a
//     mesma URL de hoje (o host das funções é o <ref>.supabase.co, fora do CSP do site);
//   · erroDaLeitura: o erro do banco como código — a MESMA tabela do erroDoBanco de nutricao-regras.ts (o teste confere).
// As próximas sub-worktrees (20b, 20c, 20d) só ACRESCENTAM entradas nos catálogos.
// hml-20b (Painel › Aluno, 12/10/2026): capacidades OPCIONAIS da consulta — só quem as declara usa; as consultas da 20a não declaram
// nenhuma, então o comportamento delas não muda (o leituraServidor.test.ts confere as 2 coisas):
//   · FonteRpc.erros: os códigos que a RPC levanta de propósito (raise exception '<código>' — a w14_matricula_da_rota: sem_login,
//     sem_acesso, aluno_inexistente) voltam como o erro do item, sem o log.excecao — o erroDaRpc da 19c (erroDaLeitura com `conhecidos`);
//   · FonteTabela.pagina + contar: UMA página (o param inteiro ≥ 1 e o tamanho; o servidor monta o .range) e o total (count exato);
//   · FonteTabela.laco: TODAS as linhas, em leituras de `tamanho` com a ordem estável, até `leituras` (passou → muitas_linhas), dentro
//     do prazo do pedido (esgotou → tempo_esgotado);
//   · FonteTabela.uma: a consulta de 1 linha (pelo id): 0 linha → nao_encontrado;
//   · AssinarLeitura.download: 1 URL por linha, com o "baixar com o nome" (a coluna do nome que a consulta leu) quando o param vem true
//     e o prazo do baixar (o `validade` fica para o ver) — o Ver/Baixar dos anexos de hoje.

/** Itens por pedido (acima → 400 lote_grande). */
export const LOTE_MAX = 16;
/** Itens rodando ao mesmo tempo no servidor. */
export const LOTE_PARALELO = 6;
/** O nome de uma consulta: [a-z0-9_], até 48. */
export const Q_MAX = 48;
const Q_FORMATO = /^[a-z0-9_]{1,48}$/;
/** O teto de uma lista de ids num param (uuids). */
export const UUIDS_MAX = 200;
/** O teto de linhas de uma consulta de tabela (o max_rows do PostgREST nos 2 projetos: acima, ele corta calado). */
export const TETO_MAX = 1000;
/** A validade máxima de uma URL assinada de leitura (a de hoje, 1 h). */
export const VALIDADE_MAX_S = 3600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// ───────────────────────── os params ─────────────────────────
export type ParamLeitura =
  | { tipo: "uuid"; obrigatorio?: boolean }
  | { tipo: "uuids"; max: number; obrigatorio?: boolean }
  | { tipo: "data"; obrigatorio?: boolean }
  | { tipo: "inteiro"; min: number; max: number; obrigatorio?: boolean }
  | { tipo: "texto"; max: number; obrigatorio?: boolean }
  | { tipo: "booleano"; obrigatorio?: boolean }
  | { tipo: "enum"; valores: readonly string[]; obrigatorio?: boolean };
export type ParamsLeitura = Readonly<Record<string, ParamLeitura>>;

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const tem = (o: object, chave: string): boolean => Object.prototype.hasOwnProperty.call(o, chave);

/** AAAA-MM-DD que existe no calendário (2026-02-31 não passa). */
function dataValida(v: unknown): v is string {
  if (typeof v !== "string" || !DATA.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** O valor do param, se está na forma (uuid em minúsculas; a lista de ids sem repetição, na ordem); senão, fora. */
export function valorDoParam(p: ParamLeitura, v: unknown): { ok: true; valor: unknown } | { ok: false } {
  const ok = (valor: unknown) => ({ ok: true as const, valor });
  const fora = { ok: false as const };
  switch (p.tipo) {
    case "uuid":
      return typeof v === "string" && UUID.test(v) ? ok(v.toLowerCase()) : fora;
    case "uuids": {
      const max = Math.min(p.max, UUIDS_MAX);
      if (!Array.isArray(v) || v.length === 0 || v.length > max) return fora;
      if (!v.every((x) => typeof x === "string" && UUID.test(x))) return fora;
      return ok([...new Set((v as string[]).map((x) => x.toLowerCase()))]);
    }
    case "data":
      return dataValida(v) ? ok(v) : fora;
    case "inteiro":
      return typeof v === "number" && Number.isInteger(v) && v >= p.min && v <= p.max ? ok(v) : fora;
    case "texto":
      return typeof v === "string" && v.length <= p.max ? ok(v) : fora;
    case "booleano":
      return typeof v === "boolean" ? ok(v) : fora;
    case "enum":
      return typeof v === "string" && p.valores.includes(v) ? ok(v) : fora;
  }
}

/** Os params do item pela lista da consulta: só os declarados (o resto cai); ausente/null = não veio; obrigatório que não veio → fora. */
export function lerParams(
  bruto: Record<string, unknown>,
  params: ParamsLeitura,
): { ok: true; valores: Record<string, unknown> } | { ok: false; campo: string } {
  const valores: Record<string, unknown> = {};
  for (const [nome, p] of Object.entries(params)) {
    const v = tem(bruto, nome) ? bruto[nome] : undefined;
    if (v === undefined || v === null) {
      if (p.obrigatorio) return { ok: false, campo: nome };
      continue;
    }
    const r = valorDoParam(p, v);
    if (r.ok === false) return { ok: false, campo: nome };
    valores[nome] = r.valor;
  }
  return { ok: true, valores };
}

// ───────────────────────── a consulta (o que o catálogo declara) ─────────────────────────
/** RPC de leitura de hoje, como a pessoa. `args`: o nome do arg da RPC → o param do item (montados aqui; o corpo nunca vira arg). */
export interface FonteRpc {
  rpc: string;
  args?: Readonly<Record<string, string>>;
  /** hml-20b: os códigos que a RPC levanta de propósito (raise exception '<código>'): voltam como o erro do item (não inesperado) */
  erros?: readonly string[];
}
/** select numa tabela com as colunas em lista fechada (nunca "*"), os filtros declarados (param → coluna), o teto e a ordem. */
export interface FonteTabela {
  tabela: string;
  colunas: readonly string[];
  teto: number;
  filtros?: readonly { param: string; coluna: string; op: "eq" | "in" }[];
  /** só as linhas fora da Lixeira (deleted_at is null) */
  vivas?: boolean;
  ordem?: readonly { coluna: string; asc: boolean }[];
  /** hml-20b: UMA página da lista — o param (inteiro ≥ 1) e o tamanho (≤ TETO_MAX); o servidor monta o .range(de, ate) */
  pagina?: { param: string; tamanho: number };
  /** hml-20b: devolve também o `total` (o count exato, com os mesmos filtros) */
  contar?: boolean;
  /** hml-20b: TODAS as linhas, em leituras de `tamanho` (≤ TETO_MAX) com a ordem estável, até `leituras` (≤ LACO_LEITURAS_MAX) */
  laco?: { tamanho: number; leituras: number };
  /** hml-20b: a consulta é de 1 linha (pelo id): 0 linha → nao_encontrado */
  uma?: boolean;
}
/**
 * A URL assinada de leitura: o bucket (o nome de produção — o catálogo da função diz qual é o do ambiente: no staging, o "-staging"), a
 * coluna com o caminho, a validade e, numa RPC, a lista do valor onde estão os itens com o caminho.
 */
export interface AssinarLeitura {
  bucket: string;
  coluna: string;
  lista?: string;
  validade: number;
  /**
   * hml-20b: 1 URL por linha (createSignedUrl) — com o param `param` = true, o "baixar com o nome" (a coluna `nome` que a consulta
   * leu) e a validade `validade` (a do baixar); sem ele, abre no navegador com a validade da consulta (a do ver).
   */
  download?: { param: string; nome: string; validade: number };
}
export interface ConsultaLeitura {
  params: ParamsLeitura;
  fonte: FonteRpc | FonteTabela;
  /** consulta "minha": a coluna que recebe QUEM CHAMA (o user do token) — nunca vem do corpo */
  dono?: string;
  assinar?: AssinarLeitura;
  /** a tela manda num lote só dela (as pesadas não seguram a tela) — dica para o front; o servidor não muda nada */
  sozinha?: boolean;
}
export type CatalogoLeitura = Readonly<Record<string, ConsultaLeitura>>;

export const ehRpc = (f: FonteRpc | FonteTabela): f is FonteRpc => tem(f, "rpc");

/** Os args da RPC: cada arg declarado recebe o param dele (o que não veio fica de fora — vale o default da RPC). */
export function argsDaRpc(fonte: FonteRpc, params: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [arg, param] of Object.entries(fonte.args ?? {})) if (params[param] !== undefined) args[arg] = params[param];
  return args;
}

export type FiltroLeitura =
  | { op: "eq"; coluna: string; valor: unknown }
  | { op: "in"; coluna: string; valor: readonly unknown[] }
  | { op: "is_null"; coluna: string };

/** O select da tabela, montado AQUI: as colunas fechadas, os filtros dos params declarados, o DONO = quem chama, as vivas, ordem e teto. */
export function planoDaTabela(
  consulta: ConsultaLeitura & { fonte: FonteTabela },
  params: Record<string, unknown>,
  userId: string,
): { tabela: string; colunas: string; filtros: FiltroLeitura[]; ordem: readonly { coluna: string; asc: boolean }[]; teto: number } {
  const f = consulta.fonte;
  const filtros: FiltroLeitura[] = [];
  for (const x of f.filtros ?? []) {
    const v = params[x.param];
    if (v === undefined) continue;
    filtros.push(x.op === "in" ? { op: "in", coluna: x.coluna, valor: Array.isArray(v) ? v : [v] } : { op: "eq", coluna: x.coluna, valor: v });
  }
  if (consulta.dono) filtros.push({ op: "eq", coluna: consulta.dono, valor: userId });
  if (f.vivas) filtros.push({ op: "is_null", coluna: "deleted_at" });
  return { tabela: f.tabela, colunas: f.colunas.join(", "), filtros, ordem: f.ordem ?? [], teto: Math.min(f.teto, TETO_MAX) };
}

// ───────────────────────── hml-20b: página, contagem, laço, 1 linha (os campos opcionais da FonteTabela) ─────────────────────────
/** O código do PostgREST para a página além do fim (HTTP 416: o offset passou do total) — na consulta com página, dados_invalidos. */
export const PAGINA_ALEM_DO_FIM = "PGRST103";
/** O teto de leituras de um laço (as 50 de 1000 da lib de hoje: listarResultadosDoPaciente). */
export const LACO_LEITURAS_MAX = 50;
/** O erro do laço que passou do teto de leituras (a lib de hoje lançava "… demais para ler de uma vez"). */
export const ERRO_MUITAS_LINHAS = "muitas_linhas";

/** `[de, ate]` da página `pagina` (a 1ª é 1) de `tamanho` linhas (no teto TETO_MAX) — o .range do supabase-js (o intervalo da tela). */
export function intervaloDaPagina(pagina: number, tamanho: number): [number, number] {
  const n = Math.max(1, Math.min(Number.isFinite(tamanho) ? Math.floor(tamanho) : TETO_MAX, TETO_MAX));
  const p = Number.isFinite(pagina) ? Math.max(1, Math.floor(pagina)) : 1;
  const de = (p - 1) * n;
  return [de, de + n - 1];
}

/**
 * O que a FonteTabela pede além do select (hml-20b; nada disso existe nas consultas da 20a): o intervalo da página (o param declarado
 * em `pagina`), se conta o total, o laço (tamanho e leituras no teto) e se é de 1 linha.
 */
export function extrasDaTabela(
  fonte: FonteTabela,
  params: Record<string, unknown>,
): { intervalo: [number, number] | null; contar: boolean; laco: { tamanho: number; leituras: number } | null; uma: boolean } {
  const p = fonte.pagina ? params[fonte.pagina.param] : undefined;
  return {
    intervalo: fonte.pagina ? intervaloDaPagina(typeof p === "number" ? p : 1, fonte.pagina.tamanho) : null,
    contar: fonte.contar === true,
    laco: fonte.laco
      ? {
          tamanho: Math.max(1, Math.min(Math.floor(fonte.laco.tamanho), TETO_MAX)),
          leituras: Math.max(1, Math.min(Math.floor(fonte.laco.leituras), LACO_LEITURAS_MAX)),
        }
      : null,
    uma: fonte.uma === true,
  };
}

/**
 * O nome do "baixar" de uma linha (hml-20b): só com `assinar.download` declarado, o param dele = true no item e a coluna do nome
 * (que a PRÓPRIA consulta leu) em texto; senão null (a URL abre no navegador). O nome nunca vem do corpo.
 */
export function nomeDoDownload(a: Pick<AssinarLeitura, "download">, params: Record<string, unknown>, linha: unknown): string | null {
  if (!a.download || params[a.download.param] !== true || !ehObjeto(linha)) return null;
  const nome = linha[a.download.nome];
  return typeof nome === "string" && nome.trim().length > 0 ? nome : null;
}

// ───────────────────────── o pedido ─────────────────────────
export interface ItemValido {
  ok: true;
  q: string;
  params: Record<string, unknown>;
  /** q + params normalizados: itens com a mesma chave rodam 1 vez */
  chave: string;
}
export interface ItemRecusado {
  ok: false;
  erro: "consulta_invalida" | "dados_invalidos";
  /** a q, quando é do catálogo (para o log); nunca o texto que veio de fora */
  q: string | null;
  campo?: string;
}
export type ItemLido = ItemValido | ItemRecusado;

function chaveDoItem(q: string, valores: Record<string, unknown>): string {
  return `${q}\u0000${JSON.stringify(Object.keys(valores).sort().map((k) => [k, valores[k]]))}`;
}

function lerItem(bruto: unknown, catalogo: CatalogoLeitura): ItemLido {
  if (!ehObjeto(bruto) || typeof bruto.q !== "string" || !Q_FORMATO.test(bruto.q) || !tem(catalogo, bruto.q)) {
    return { ok: false, erro: "consulta_invalida", q: null };
  }
  const q = bruto.q;
  const r = lerParams(bruto, catalogo[q].params);
  if (r.ok === false) return { ok: false, erro: "dados_invalidos", q, campo: r.campo };
  return { ok: true, q, params: r.valores, chave: chaveDoItem(q, r.valores) };
}

/** O pedido `ler`: os itens lidos pelo catálogo (na ordem). Sem itens → dados_invalidos; acima de LOTE_MAX → lote_grande. */
export function lerPedidoDeLeitura(
  corpo: Record<string, unknown>,
  catalogo: CatalogoLeitura,
): { ok: true; itens: ItemLido[] } | { ok: false; erro: "dados_invalidos" | "lote_grande" } {
  const itens = corpo.itens;
  if (!Array.isArray(itens) || itens.length === 0) return { ok: false, erro: "dados_invalidos" };
  if (itens.length > LOTE_MAX) return { ok: false, erro: "lote_grande" };
  return { ok: true, itens: itens.map((i) => lerItem(i, catalogo)) };
}

// ───────────────────────── a execução ─────────────────────────
/** A resposta de um item: as linhas (tabela), o valor (RPC) e o total (quando a consulta conta) — ou o código do erro. */
export type RespostaDeItem = { ok: true; linhas?: unknown[]; valor?: unknown; total?: number } | { ok: false; erro: string };

/**
 * Roda os itens válidos (os iguais 1 vez só), até `paralelo` ao mesmo tempo (no máximo LOTE_PARALELO), e devolve a resposta de cada
 * item NA ORDEM do pedido. O item recusado na leitura volta com o erro dele; o que lança vira `aoFalhar` (padrão: erro_interno).
 */
export async function rodarLote(
  itens: readonly ItemLido[],
  executar: (item: ItemValido) => Promise<RespostaDeItem>,
  opcoes: { paralelo?: number; aoFalhar?: (e: unknown, item: ItemValido) => RespostaDeItem } = {},
): Promise<RespostaDeItem[]> {
  const paralelo = Math.max(1, Math.min(opcoes.paralelo ?? LOTE_PARALELO, LOTE_PARALELO));
  const unicos: ItemValido[] = [];
  const posicao = new Map<string, number>();
  for (const item of itens) {
    if (item.ok === true && !posicao.has(item.chave)) {
      posicao.set(item.chave, unicos.length);
      unicos.push(item);
    }
  }
  const resultados: RespostaDeItem[] = new Array(unicos.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < unicos.length) {
      const k = proximo++;
      try {
        resultados[k] = await executar(unicos[k]);
      } catch (e) {
        resultados[k] = opcoes.aoFalhar ? opcoes.aoFalhar(e, unicos[k]) : { ok: false, erro: "erro_interno" };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(paralelo, unicos.length) }, trabalhador));
  return itens.map((item) => (item.ok === false ? { ok: false, erro: item.erro } : resultados[posicao.get(item.chave) as number]));
}

/**
 * O erro do banco (PostgREST/Postgres) numa leitura, como código — a MESMA tabela do erroDoBanco de nutricao-regras.ts (42501 →
 * sem_acesso · classe 22 e 23502/23503/23514 → dados_invalidos · PGRST301–303 → sem_login · tempo → tempo_esgotado · o resto →
 * erro_interno). `inesperado` = a função avisa (log.excecao). Aqui também o erro que chega pelo name (o TimeoutError lançado).
 * hml-20b: `conhecidos` = os códigos que a RPC levanta de propósito (FonteRpc.erros): a mensagem que é um deles volta como ele, não
 * inesperado (o erroDaRpc de nutricao-regras.ts); sem a lista (a 20a), a tabela de sempre.
 * hml-20b (revisão): `pagina` = a consulta COM página (FonteTabela.pagina): a página além do fim (o PostgREST responde 416, PGRST103 —
 * o offset passou do total) é o pedido fora da forma → dados_invalidos, NÃO inesperado (sem log.excecao: não é defeito do servidor). Sem
 * a página (as outras consultas e as 3 da 20a), o PGRST103 segue a tabela de sempre (erro_interno).
 */
export function erroDaLeitura(
  e: { code?: unknown; message?: unknown; name?: unknown } | null | undefined,
  conhecidos: readonly string[] = [],
  opcoes: { pagina?: boolean } = {},
): { erro: string; inesperado: boolean } {
  const code = typeof e?.code === "string" ? e.code : "";
  const msg = typeof e?.message === "string" ? e.message : "";
  const nome = typeof e?.name === "string" ? e.name : "";
  if (msg.trim() && conhecidos.includes(msg.trim())) return { erro: msg.trim(), inesperado: false };
  if (opcoes.pagina === true && code === PAGINA_ALEM_DO_FIM) return { erro: "dados_invalidos", inesperado: false };
  if (code === "42501") return { erro: "sem_acesso", inesperado: false };
  if (code === "23505") return { erro: "conflito", inesperado: false };
  if (code.startsWith("22") || code === "23502" || code === "23503" || code === "23514") return { erro: "dados_invalidos", inesperado: false };
  if (code === "PGRST301" || code === "PGRST302" || code === "PGRST303") return { erro: "sem_login", inesperado: false };
  if (/^(TimeoutError|AbortError)\b/.test(msg) || /^(TimeoutError|AbortError)$/.test(nome)) return { erro: "tempo_esgotado", inesperado: true };
  return { erro: "erro_interno", inesperado: true };
}

// ───────────────────────── a URL assinada (só do que a consulta leu) ─────────────────────────
/** O começo da URL assinada de leitura no Storage. */
export const PREFIXO_ASSINADA = "/storage/v1/object/sign/";
const CAMINHO_MAX = 1024;

/** Os itens de uma lista do valor de uma RPC (valor[lista]); fora disso, nenhum. */
export function itensDaLista(valor: unknown, lista: string): unknown[] {
  return ehObjeto(valor) && Array.isArray(valor[lista]) ? (valor[lista] as unknown[]) : [];
}

/**
 * A validade da URL assinada de uma consulta: a do catálogo, no teto de VALIDADE_MAX_S (1 h, a de hoje) e no mínimo 1 s — vale para TODO
 * catálogo (o da nutricao e, na 20d, o da financeiro): um catálogo com validade maior não passa do teto.
 */
export function validadeDaAssinatura(a: Pick<AssinarLeitura, "validade">): number {
  const v = Number.isFinite(a.validade) ? Math.floor(a.validade) : VALIDADE_MAX_S;
  return Math.max(1, Math.min(v, VALIDADE_MAX_S));
}

/** Os caminhos que a PRÓPRIA consulta leu (a coluna de cada linha/item): texto, sem repetição — nunca um caminho vindo do corpo. */
export function caminhosParaAssinar(itens: readonly unknown[], coluna: string): string[] {
  const saida = new Set<string>();
  for (const i of itens) {
    const c = ehObjeto(i) ? i[coluna] : undefined;
    if (typeof c === "string" && c.length > 0 && c.length <= CAMINHO_MAX) saida.add(c);
  }
  return [...saida];
}

/** A parte relativa (/storage/v1/object/sign/<bucket>/…?token=…) da URL que o Storage assinou; outra coisa → null. */
export function assinaturaRelativa(url: unknown, bucket: string): string | null {
  if (typeof url !== "string") return null;
  const i = url.indexOf(`${PREFIXO_ASSINADA}${bucket}/`);
  return i >= 0 ? url.slice(i) : null;
}

/** caminho → URL relativa, SÓ para os caminhos pedidos (o que o Storage devolver a mais é ignorado); o que falhou fica de fora. */
export function urlsAssinadas(pedidos: readonly string[], resposta: unknown, bucket: string): Map<string, string> {
  const quero = new Set(pedidos);
  const mapa = new Map<string, string>();
  if (!Array.isArray(resposta)) return mapa;
  for (const r of resposta) {
    if (!ehObjeto(r) || typeof r.path !== "string" || !quero.has(r.path) || r.error) continue;
    const rel = assinaturaRelativa(r.signedUrl, bucket);
    if (rel) mapa.set(r.path, rel);
  }
  return mapa;
}

/** Cada linha/item com a `url` do caminho dela (null quando não deu para assinar) — o resto do item fica como veio. */
export function comUrls(itens: readonly unknown[], coluna: string, urls: ReadonlyMap<string, string>): unknown[] {
  return itens.map((i) => {
    if (!ehObjeto(i)) return i;
    const c = i[coluna];
    return { ...i, url: typeof c === "string" ? urls.get(c) ?? null : null };
  });
}

/** O valor da RPC com a `url` em cada item da lista (valor[lista]); sem a lista, o valor como veio. */
export function comUrlsNaLista(valor: unknown, lista: string, coluna: string, urls: ReadonlyMap<string, string>): unknown {
  if (!ehObjeto(valor) || !Array.isArray(valor[lista])) return valor;
  return { ...valor, [lista]: comUrls(valor[lista] as unknown[], coluna, urls) };
}
