// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — o CATÁLOGO das leituras da função treinos (Banco do Treino, ação `ler`). O motor é
// a CÓPIA do motor comum do principal (_shared/leitura-lote.ts e _shared/leitura-servidor.ts — iguais byte a byte, o Vitest confere): ele lê
// o pedido por este catálogo e roda cada consulta COMO A PESSOA (o RLS e as RPCs de hoje decidem quem vê). Cada entrada declara os params
// (tipo e teto; o resto do corpo cai), a fonte (a RPC de hoje com os args montados no servidor, ou a tabela com as colunas em lista fechada,
// os filtros, a ordem e o teto) e, nas "minhas", o recorte "global ou meu" montado AQUI com o user do token (filtrosExtras), nunca um id do
// corpo. As MESMAS leituras que as libs faziam no navegador no 7c1a637 (v3.116), com as mesmas linhas:
//   · src/painel/treinos/api.ts — Meus treinos (a RPC modelos_da_lista e os detalhes da página: as linhas, os vínculos de pasta e os
//     exercícios citados, na MESMA ida — os 3 pedidos em série de hoje viram 1 consulta com os recursos embutidos), o treino aberto pelo
//     ?treino=, as pastas, os grupos musculares, o catálogo da aba Treinos dos Modelos (sem os exercícios e os grupos que ela lia e não
//     usava) e a biblioteca (a RPC exercicios_da_lista — também a folha do editor e a Biblioteca do master);
//   · src/painel/busca/Treinos.tsx (a Busca Ctrl K), src/app-aluno/sozinho/api.ts (os treinos prontos do aluno sem profissional) e, do
//     Master, src/master/app/treinosProntos.ts (todos os treinos prontos e a biblioteca global — COM página: hoje cortava calado em 1000) e
//     src/pages/master/BibliotecaPage.tsx (os grupos globais e a contagem dos exercícios globais de um grupo);
//   · "minha" = onde a lib filtrava pelo id de quem está logado (o doEscopo: professor_id vazio OU = o meu id) — aqui o .or() com o sub do
//     token; nos exercícios citados de um modelo, o mesmo recorte no recurso embutido (o de outro profissional fica de fora, como hoje).
// A RPC exercicios_da_lista leva no p_filtros listas de textos (os códigos de movimento/equipamento e os músculos do grupo): o motor não
// tem param de lista de textos livres — ela é a consulta ESPECIAL daqui (lerConsultaEspecial + rodarEspecial: o mesmo lote, o mesmo erro por
// item, a mesma tradução do erro), sem mudar o motor (que é a cópia do principal).
// Este arquivo NÃO importa a porta (o contexto é estrutural, como o leitura-servidor.ts): o Vitest roda tudo com um cliente falso.
import {
  erroDaLeitura, lerParams, lerPedidoDeLeitura, rodarLote, type CatalogoLeitura, type ConsultaLeitura, type FiltroLeitura,
  type ItemLido, type ItemValido, type RespostaDeItem,
} from "./leitura-lote.ts";
import { atenderLeitura, type CatalogoDoServidor, type ContextoLeitura, type RespostaDaLeitura } from "./leitura-servidor.ts";

/** O max_rows do PostgREST no Treino: o teto de uma leitura (a lib lia em páginas de 1000). */
export const POR_LEITURA = 1000;
/** As leituras de um laço (a lib ia até 100 × 1000; o teto do motor é 50 × 1000). */
export const LEITURAS_DO_LACO = 50;
/** Os treinos que a Busca (Ctrl K) mostra (MAX_RESULTADOS de src/painel/busca/_comum.ts). */
export const BUSCA_MAX = 6;
/** Os ids de modelos dos detalhes de uma ida (a lib lia em lotes de 150). */
export const IDS_DOS_DETALHES_MAX = 150;
/** O maior inteiro do Postgres (os p_offset são integer). */
export const INT4_MAX = 2_147_483_647;
/** As RPCs de lista cortam o limite em 100 (least(…, 100)); a tela pede 20 (POR_PAGINA). */
export const LIMITE_RPC_MAX = 100;
/** O termo da busca (a tela não corta; aqui o teto do abuso). */
export const TERMO_MAX = 200;
/** A página da biblioteca global do master (1 a N; a lib pede até a curta). */
export const PAGINAS_MAX = 1000;

/** As colunas de cada leitura = as que a lib/o tipo usam hoje (nenhum "*"). */
export const COLUNAS_DO_TREINO = {
  /** ModeloRow, PastaRow, GrupoMuscularRow (o select("id, nome, professor_id") das 3) */
  dono: ["id", "nome", "professor_id"],
  /** COLS_LINHA (src/painel/treinos/api.ts) + o id da linha (a lib de hoje ordenava por ele: a tela recebe a MESMA ordem e sem o id) */
  linha: ["id", "grupo_id", "exercicio_id", "ordem", "num_series", "reps_alvo", "descanso_segundos", "carga_sugerida_kg"],
  /** VinculoPasta (pasta_id, grupo_id) + o id do vínculo (a ordem de hoje) */
  vinculo: ["id", "pasta_id", "grupo_id"],
  /** COLS_EXERCICIO (src/painel/treinos/api.ts) */
  exercicio: ["id", "nome", "grupo_muscular", "emoji", "tipo", "imagem_url", "subgrupo", "dica", "professor_id", "padrao_movimento", "equipamento", "variacao"],
  /** os treinos prontos do aluno (COLUNAS de src/app-aluno/sozinho/api.ts) */
  pronto: ["id", "codigo", "nome", "objetivo", "nivel", "dias_por_semana", "divisao", "descricao", "ordem"],
  pronto_grupo: ["id", "letra", "nome", "dias", "ordem"],
  pronto_exercicio: ["exercicio_id", "ordem", "series", "reps", "descanso_segundos", "observacao"],
  pronto_exercicio_tb: ["id", "nome", "grupo_muscular", "imagem_url", "tipo"],
  /** os do Master (COLUNAS de src/master/app/treinosProntos.ts): + o ativo; as divisões sem o id; o exercício só com o nome */
  pronto_master: ["id", "codigo", "nome", "objetivo", "nivel", "dias_por_semana", "divisao", "descricao", "ordem", "ativo"],
  pronto_master_grupo: ["letra", "nome", "dias", "ordem"],
  pronto_master_exercicio_tb: ["nome"],
  /** a biblioteca global do master (bibliotecaGlobal: id, nome, grupo_muscular) */
  global: ["id", "nome", "grupo_muscular"],
} as const;

/**
 * O recorte "global ou meu" (o doEscopo da lib: professor_id vazio OU = quem chama), montado no servidor com o sub do token — no recurso de
 * cima (`raiz`: a lista) e/ou no exercício citado de cada linha (`exercicioDaLinha`: os detalhes de um modelo). É uma propriedade da
 * consulta (o motor passa a consulta ao filtrosExtras — como o emAbertoOuNoPeriodo da financeiro), nunca um param do corpo.
 */
export interface RecorteDoTreino {
  raiz?: true;
  exercicioDaLinha?: true;
}
export type ConsultaDoTreinoLeitura = ConsultaLeitura & { globalOuMeu?: RecorteDoTreino };

const C = COLUNAS_DO_TREINO;
const asc = (coluna: string) => ({ coluna, asc: true }) as const;
const porNomeEId = [asc("nome"), asc("id")] as const;
const laco = { tamanho: POR_LEITURA, leituras: LEITURAS_DO_LACO } as const;

/** Os detalhes de um modelo (o que a lib lia em 3 pedidos em série): as linhas com o exercício citado (recortado) e os vínculos de pasta. */
const LINHAS_COM_EXERCICIO = {
  nome: "linhas", tabela: "tb_grupos_exercicios", colunas: C.linha, limite: POR_LEITURA,
  embutidos: [{ nome: "exercicio", tabela: "tb_exercicios", colunas: C.exercicio }],
} as const;
const VINCULOS = { nome: "vinculos", tabela: "tb_pastas_treino_grupos", colunas: C.vinculo, limite: POR_LEITURA } as const;

export const CONSULTAS_TREINOS = {
  // ───── Painel › Treinos › Meus treinos ─────
  // a página de treinos (a RPC de hoje: a busca, a pasta, a ordem e os totais no banco) — o offset e o limite que a lib manda
  modelos: {
    params: {
      filtros: { tipo: "objeto", campos: { q: { tipo: "texto", max: TERMO_MAX }, pasta: { tipo: "uuid" } }, obrigatorio: true },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true },
      limite: { tipo: "inteiro", min: 1, max: LIMITE_RPC_MAX, obrigatorio: true },
    },
    fonte: { rpc: "modelos_da_lista", args: { p_filtros: "filtros", p_offset: "offset", p_limite: "limite" } },
  },
  // os detalhes dos treinos da página (as linhas — com o exercício citado, global ou meu — e os vínculos de pasta), numa consulta só
  modelos_detalhes: {
    params: { ids: { tipo: "uuids", max: IDS_DOS_DETALHES_MAX, obrigatorio: true } },
    fonte: {
      tabela: "tb_grupos_treino", colunas: ["id"], teto: IDS_DOS_DETALHES_MAX, filtros: [{ param: "ids", coluna: "id", op: "in" }], ordem: [asc("id")],
      embutidos: [LINHAS_COM_EXERCICIO, VINCULOS],
    },
    globalOuMeu: { exercicioDaLinha: true },
  },
  // o ?treino= que não está na página: o treino pelo id (global ou meu) com os detalhes dele, na mesma ida (outro → nenhum)
  modelo: {
    params: { id: { tipo: "uuid", obrigatorio: true } },
    fonte: {
      tabela: "tb_grupos_treino", colunas: C.dono, teto: 1, filtros: [{ param: "id", coluna: "id", op: "eq" }], embutidos: [LINHAS_COM_EXERCICIO, VINCULOS],
    },
    globalOuMeu: { raiz: true, exercicioDaLinha: true },
  },
  // as pastas que a pessoa vê (globais e minhas) — inteiras, em páginas de 1000
  pastas: { params: {}, fonte: { tabela: "tb_pastas_treino", colunas: C.dono, teto: POR_LEITURA, ordem: porNomeEId, laco }, globalOuMeu: { raiz: true } },
  // os grupos musculares (globais e meus): o formulário do exercício e a folha "Grupos musculares"
  grupos_musculares: { params: {}, fonte: { tabela: "grupos_musculares", colunas: C.dono, teto: POR_LEITURA, ordem: porNomeEId, laco }, globalOuMeu: { raiz: true } },

  // ───── Ferramentas › Modelos › aba Treinos (o carregarCatalogo: os modelos com as linhas e as pastas com os vínculos) ─────
  catalogo_modelos: {
    params: {},
    fonte: {
      tabela: "tb_grupos_treino", colunas: C.dono, teto: POR_LEITURA, ordem: porNomeEId, laco,
      embutidos: [{ nome: "linhas", tabela: "tb_grupos_exercicios", colunas: C.linha, limite: POR_LEITURA }],
    },
    globalOuMeu: { raiz: true },
  },
  catalogo_pastas: {
    params: {}, fonte: { tabela: "tb_pastas_treino", colunas: C.dono, teto: POR_LEITURA, ordem: porNomeEId, laco, embutidos: [VINCULOS] }, globalOuMeu: { raiz: true },
  },

  // ───── a Busca (Ctrl K): os treinos-modelo (globais e meus) pelo nome — o termo como a tela manda (o literal, com \ % _ escapados) ─────
  busca_treinos: {
    params: { termo: { tipo: "texto", max: TERMO_MAX, obrigatorio: true } },
    fonte: { tabela: "tb_grupos_treino", colunas: C.dono, teto: BUSCA_MAX, filtros: [{ param: "termo", coluna: "nome", op: "ilike_cada" }], ordem: [asc("nome")] },
    globalOuMeu: { raiz: true },
  },

  // ───── o app do aluno sem profissional: o catálogo dos treinos prontos ativos (as divisões e os exercícios embutidos) ─────
  treinos_prontos: {
    params: {},
    fonte: {
      tabela: "physiq_treinos_prontos", colunas: C.pronto, teto: POR_LEITURA, fixos: [{ coluna: "ativo", valor: true }], ordem: [asc("ordem")],
      embutidos: [{
        nome: "grupos", tabela: "physiq_treinos_prontos_grupos", colunas: C.pronto_grupo,
        embutidos: [{
          nome: "exercicios", tabela: "physiq_treinos_prontos_exercicios", colunas: C.pronto_exercicio,
          embutidos: [{ nome: "exercicio", tabela: "tb_exercicios", colunas: C.pronto_exercicio_tb }],
        }],
      }],
    },
  },
} as const satisfies Record<string, ConsultaDoTreinoLeitura>;

/** As do MASTER (o papel conferido na função ANTES do banco; o RLS do Treino decide de novo). */
export const CONSULTAS_DO_MASTER = {
  // Master › App do aluno › Treinos prontos: todos (os inativos também), com as divisões e os exercícios
  treinos_prontos_todos: {
    params: {},
    fonte: {
      tabela: "physiq_treinos_prontos", colunas: C.pronto_master, teto: POR_LEITURA, ordem: [asc("ordem")],
      embutidos: [{
        nome: "grupos", tabela: "physiq_treinos_prontos_grupos", colunas: C.pronto_master_grupo,
        embutidos: [{
          nome: "exercicios", tabela: "physiq_treinos_prontos_exercicios", colunas: C.pronto_exercicio,
          embutidos: [{ nome: "exercicio", tabela: "tb_exercicios", colunas: C.pronto_master_exercicio_tb }],
        }],
      }],
    },
  },
  // a biblioteca global para montar as divisões (hoje: sem página, cortava calado em 1000 — achado 3) — 1 página de 1000, nome e id
  exercicios_globais: {
    params: { pagina: { tipo: "inteiro", min: 1, max: PAGINAS_MAX, obrigatorio: true } },
    fonte: { tabela: "tb_exercicios", colunas: C.global, teto: POR_LEITURA, nulos: ["professor_id"], ordem: porNomeEId, pagina: { param: "pagina", tamanho: POR_LEITURA } },
  },
  // Master › Biblioteca: os grupos musculares GLOBAIS (o catálogo pequeno, inteiro: até 1000, como hoje)
  grupos_globais: { params: {}, fonte: { tabela: "grupos_musculares", colunas: C.dono, teto: POR_LEITURA, nulos: ["professor_id"], ordem: porNomeEId } },
  // Master › Biblioteca: quantos exercícios GLOBAIS usam o nome do grupo (só o número — o aviso antes de excluir o grupo)
  globais_do_grupo: {
    params: { nome: { tipo: "texto", max: TERMO_MAX, obrigatorio: true } },
    fonte: { tabela: "tb_exercicios", colunas: ["id"], teto: 1, nulos: ["professor_id"], filtros: [{ param: "nome", coluna: "grupo_muscular", op: "eq" }], soContar: true },
  },
} as const satisfies Record<string, ConsultaLeitura>;

/** A consulta ESPECIAL (a lista de textos no p_filtros): a biblioteca pela RPC exercicios_da_lista. */
export const CONSULTAS_ESPECIAIS = ["exercicios_lista"] as const;

const TODAS = { ...CONSULTAS_TREINOS, ...CONSULTAS_DO_MASTER };
export type ConsultaDoTreino = keyof typeof TODAS | (typeof CONSULTAS_ESPECIAIS)[number];
/** As consultas do catálogo (do motor) e a especial, na ordem. */
export const TODAS_AS_CONSULTAS = [...Object.keys(TODAS), ...CONSULTAS_ESPECIAIS] as ConsultaDoTreino[];
export const NOMES_DO_MASTER = Object.keys(CONSULTAS_DO_MASTER) as Array<keyof typeof CONSULTAS_DO_MASTER>;

// ───────────────────────── o recorte "global ou meu" (o doEscopo da lib), montado com o user do token ─────────────────────────
/** O .or() de hoje: professor_id vazio OU = quem chama (o uuid do token — o corpo nunca entra no filtro). */
export const globalOuMeu = (userId: string, tabela?: string): FiltroLeitura =>
  tabela ? { op: "ou", filtro: `professor_id.is.null,professor_id.eq.${userId}`, tabela } : { op: "ou", filtro: `professor_id.is.null,professor_id.eq.${userId}` };

/** Os filtros a mais (o motor chama com os params JÁ LIDOS e o user do token): o recorte de cada consulta "minha" (a propriedade dela). */
export function filtrosDoTreino(consulta: ConsultaLeitura, _params: Record<string, unknown>, userId: string): FiltroLeitura[] {
  const r = (consulta as ConsultaDoTreinoLeitura).globalOuMeu;
  if (!r) return [];
  return [...(r.raiz ? [globalOuMeu(userId)] : []), ...(r.exercicioDaLinha ? [globalOuMeu(userId, "linhas.exercicio")] : [])];
}

/** O catálogo da treinos para o motor (o do principal, copiado): as consultas, o recorte pelo user e o valor das RPCs como veio. */
export const CATALOGO_TREINOS: CatalogoDoServidor = {
  consultas: TODAS as unknown as CatalogoLeitura,
  filtrosExtras: filtrosDoTreino,
  bucketDaLeitura: (bucket, schema) => (schema === "staging" ? `${bucket}-staging` : bucket),
};

/** A consulta do catálogo do motor (não a especial), se existe; senão null. */
export function consultaDoTreino(q: unknown): ConsultaLeitura | null {
  return typeof q === "string" && Object.prototype.hasOwnProperty.call(TODAS, q) ? (TODAS as Record<string, ConsultaLeitura>)[q] : null;
}

// ───────────────────────── a consulta especial: exercicios_lista (a biblioteca pela RPC de hoje) ─────────────────────────
/** Os escopos da RPC exercicios_da_lista (supabase/migrations/20261009050000_hml14d_treino_listas.sql). */
export const ESCOPOS = ["global", "minha", "visiveis", "professores"] as const;
/** Os tetos das listas do p_filtros: os códigos de movimento/equipamento e os músculos (as listas fixas da tela têm ~60 e ~70). */
export const CODIGOS_MAX = 200;
export const MUSCULOS_MAX = 300;
/** Um código de movimento/equipamento (as chaves das listas fixas da tela: src/treino/equivalencia.ts). */
const ehCodigo = (x: string): boolean => /^[a-z0-9_]{1,60}$/.test(x);
/** Um músculo (o nome normalizado da tela: letras, espaço, hífen, barra): 1 a 80, sem os caracteres de controle. */
const ehMusculo = (x: string): boolean => x.length >= 1 && x.length <= 80 && ![...x].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const listaDe = (v: unknown, max: number, valido: (x: string) => boolean): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && valido(x)) ? [...(v as string[])] : null;

/**
 * O item da exercicios_lista: o p_filtros da lib de hoje (só as chaves que a RPC lê — escopo, professor, q, codigos, musculos, fora —, cada
 * uma no tipo dela; as de fora caem), o offset e o limite. Fora da forma → dados_invalidos (só nesse item).
 */
export function lerExerciciosLista(bruto: Record<string, unknown>): ItemLido {
  const q = "exercicios_lista";
  const base = lerParams(bruto, {
    offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true },
    limite: { tipo: "inteiro", min: 1, max: LIMITE_RPC_MAX, obrigatorio: true },
  });
  if (base.ok === false) return { ok: false, erro: "dados_invalidos", q, campo: base.campo };
  const f = bruto.filtros;
  if (f !== undefined && f !== null && !ehObjeto(f)) return { ok: false, erro: "dados_invalidos", q, campo: "filtros" };
  const fx = ehObjeto(f) ? f : {};
  const simples = lerParams(fx, {
    escopo: { tipo: "enum", valores: ESCOPOS }, professor: { tipo: "uuid" }, q: { tipo: "texto", max: TERMO_MAX },
  });
  if (simples.ok === false) return { ok: false, erro: "dados_invalidos", q, campo: `filtros.${simples.campo}` };
  const filtros: Record<string, unknown> = { ...simples.valores };
  for (const [k, max, valido] of [["codigos", CODIGOS_MAX, ehCodigo], ["musculos", MUSCULOS_MAX, ehMusculo], ["fora", MUSCULOS_MAX, ehMusculo]] as const) {
    const v = fx[k];
    if (v === undefined || v === null) continue;
    const l = listaDe(v, max, valido);
    if (!l) return { ok: false, erro: "dados_invalidos", q, campo: `filtros.${k}` };
    filtros[k] = l;
  }
  const params = { filtros, ...base.valores };
  return { ok: true, q, params, chave: `${q}\u0000${JSON.stringify(params)}` };
}

/** O pedaço do cliente "como a pessoa" que a consulta especial usa (o SupabaseClient da porta encaixa). */
interface ClienteDaEspecial {
  rpc(nome: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

/** A consulta especial, como a pessoa: a RPC de hoje com os MESMOS args (o p_filtros conferido, o offset e o limite) → { valor }. */
async function rodarEspecial(c: ContextoLeitura, item: ItemValido): Promise<RespostaDeItem> {
  const p = item.params;
  const { data, error } = await (c.comoPessoa as unknown as ClienteDaEspecial).rpc("exercicios_da_lista", { p_filtros: p.filtros, p_offset: p.offset, p_limite: p.limite });
  if (error) return falhouNoTreino(c, item.q, error);
  return { ok: true, valor: data ?? null };
}

/** O erro do banco da consulta especial como código (a MESMA tabela do motor); o inesperado avisa (log.excecao), o resto só o aviso. */
function falhouNoTreino(c: ContextoLeitura, q: string, e: unknown): RespostaDeItem {
  const o = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const t = erroDaLeitura(o);
  if (t.inesperado) c.log.excecao(e, { codigo: t.erro === "tempo_esgotado" ? "tempo_esgotado" : "banco_falhou", acao: q, schema: c.schema });
  else c.log.aviso({ codigo: t.erro, schema: c.schema, acao: q, pg: typeof o.code === "string" ? o.code : null });
  return { ok: false, erro: t.erro };
}

const ehEspecial = (bruto: unknown): bruto is Record<string, unknown> =>
  ehObjeto(bruto) && typeof bruto.q === "string" && (CONSULTAS_ESPECIAIS as readonly string[]).includes(bruto.q);

/** O pedido `ler` pede alguma consulta do Master? (a função confere o papel ANTES do banco: quem não é → 403). */
export function pedeConsultaDoMaster(corpo: Record<string, unknown>): boolean {
  const itens = corpo.itens;
  return Array.isArray(itens) && itens.some((i) => ehObjeto(i) && typeof i.q === "string" && (NOMES_DO_MASTER as string[]).includes(i.q));
}

/**
 * A ação `ler` da treinos: as consultas do catálogo pelo motor (a cópia do principal: o lote, a ordem, o erro por item, os iguais 1 vez, o
 * log de 1 linha) e a especial (exercicios_lista) ao lado, no MESMO pedido — a resposta na ordem do pedido. O pedido fora da forma (sem
 * itens, mais de 16) → o erro do motor.
 */
export async function atenderLeituraDoTreino(c: ContextoLeitura): Promise<RespostaDaLeitura> {
  const inicio = Date.now();
  const brutos = c.corpo.itens;
  if (!Array.isArray(brutos) || !brutos.some(ehEspecial)) return await atenderLeitura(c, CATALOGO_TREINOS);
  // a forma do pedido (1 a 16 itens) — a mesma conferência do motor
  const forma = lerPedidoDeLeitura(c.corpo, {});
  if (forma.ok === false) {
    c.log.aviso({ codigo: forma.erro, schema: c.schema, acao: "ler" });
    return { ok: false, erro: forma.erro };
  }
  const comuns: Array<{ pos: number; bruto: unknown }> = [];
  const especiais: Array<{ pos: number; item: ItemLido }> = [];
  brutos.forEach((bruto, pos) => (ehEspecial(bruto) ? especiais.push({ pos, item: lerExerciciosLista(bruto) }) : comuns.push({ pos, bruto })));
  for (const { item } of especiais) {
    if (item.ok === false) c.log.aviso({ codigo: item.erro, schema: c.schema, acao: item.q ?? "ler", resultado: item.campo ?? null });
  }
  const [doMotor, daEspecial] = await Promise.all([
    comuns.length ? atenderLeitura({ ...c, corpo: { acao: "ler", itens: comuns.map((x) => x.bruto) } }, CATALOGO_TREINOS) : Promise.resolve(null),
    rodarLote(especiais.map((x) => x.item), (item) => rodarEspecial(c, item), { aoFalhar: (e, item) => falhouNoTreino(c, item.q, e) }),
  ]);
  if (doMotor && doMotor.ok === false) return doMotor;
  const itens: RespostaDeItem[] = new Array(brutos.length);
  comuns.forEach((x, k) => (itens[x.pos] = (doMotor as { itens: RespostaDeItem[] }).itens[k]));
  especiais.forEach((x, k) => (itens[x.pos] = daEspecial[k]));
  const falhas = daEspecial.filter((i) => i.ok === false).length;
  c.log.info({
    codigo: "leitura", schema: c.schema, acao: "exercicios_lista", n: especiais.length, ms: Date.now() - inicio,
    resultado: falhas === 0 ? "ok" : falhas === especiais.length ? "falhou" : "parcial",
  });
  return { ok: true, itens };
}
