// Physiq hml-21d (H-43 · jeito 2, etapa 3) — a função treinos (Banco do Treino) no Vitest: o CATÁLOGO (_shared/treinos-leituras.ts) rodado
// pela CÓPIA do motor comum do principal (_shared/leitura-lote.ts e _shared/leitura-servidor.ts — iguais byte a byte, conferido aqui) e as
// GRAVAÇÕES (treinos/{modelos,biblioteca,master}.ts, com as regras de _shared/treinos-regras.ts), com um cliente falso que faz o papel do
// PostgREST, das RPCs e do Storage COMO A PESSOA (os módulos não importam a porta: o contexto é estrutural).
// Positivo: cada `q` e cada ação com os params certos; as colunas = o select das libs do 7c1a637 (nenhum "*"); o teto, a página e a ordem; o
// "global ou meu" com o sub do token (no recurso de cima e no exercício citado de cada linha); as RPCs com os MESMOS argumentos de hoje; o
// dono do que é criado = o token (o master no global, os outros para si); a foto pelo caminho do servidor.
// Negativo: q/ação desconhecida; uuid/texto/inteiro ruins → dados_invalidos (nada roda); professor_id/user_id/dono do corpo ignorados (nunca
// chegam ao banco); a chave fora da lista cai; o null só onde a coluna aceita; a URL da foto de outro exercício/bucket/host → recusada (N8);
// o erro do banco vira o código (a mensagem nunca vai na resposta); 0 linha → nao_encontrado; o 23503 do painel → em_uso; o log sem valores.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ehRpc, type FonteRpc, type FonteTabela, type RespostaDeItem } from "../../supabase/functions/_shared/leitura-lote";
import {
  BUSCA_MAX, CATALOGO_TREINOS, COLUNAS_DO_TREINO, CONSULTAS_DO_MASTER, CONSULTAS_ESPECIAIS, CONSULTAS_TREINOS, NOMES_DO_MASTER, TODAS_AS_CONSULTAS,
  atenderLeituraDoTreino, consultaDoTreino, filtrosDoTreino, lerExerciciosLista, pedeConsultaDoMaster, type ConsultaDoTreinoLeitura,
} from "../../supabase/functions/_shared/treinos-leituras";
import {
  ACOES_DA_BIBLIOTECA, ACOES_DA_TREINOS, ACOES_DO_MASTER, ACOES_DOS_MODELOS, CORPOS_DAS_ACOES, ERROS_DAS_RPCS_DO_TREINO, IMAGEM_MAX_BYTES,
  URL_API_TREINO, bucketDosExercicios, caminhoDaFotoDoExercicio, caminhoDaUrlDaFoto, donoAoCriar, ehMaster, erroDoTreino, lerTreinoPronto,
  moduloDoPedido, papelDoToken, statusDoErroTreino, type AcaoDaBiblioteca, type AcaoDoMaster, type AcaoDosModelos,
} from "../../supabase/functions/_shared/treinos-regras";
import { atenderBiblioteca, hostsDaApi } from "../../supabase/functions/treinos/biblioteca";
import { atenderMaster } from "../../supabase/functions/treinos/master";
import { atenderModelos } from "../../supabase/functions/treinos/modelos";

const RAIZ = resolve(__dirname, "../..");
const EU = "33333333-3333-4333-8333-333333333333";
const OUTRO = "99999999-9999-4999-8999-999999999999";
const M1 = "a1111111-1111-4111-8111-111111111111";
const M2 = "a2222222-2222-4222-8222-222222222222";
const EX = "e1111111-1111-4111-8111-111111111111";
const EX2 = "e2222222-2222-4222-8222-222222222222";
const PASTA = "b1111111-1111-4111-8111-111111111111";
const PROJETO = "https://uxwpwdbbnlticxgtzcsb.supabase.co";
const ler = (rel: string) => readFileSync(resolve(RAIZ, rel), "utf-8");
const semEspacos = (s: string) => s.replace(/\s+/g, "");
const ESCOPO = `professor_id.is.null,professor_id.eq.${EU}`;

// ───────────────────────── o cliente falso (grava cada pedido; o "banco" do teste responde) ─────────────────────────
type Resposta = { data: unknown; error: unknown; count?: number | null };
interface Pedido {
  tipo: "select" | "update" | "insert" | "delete";
  tabela: string;
  colunas?: string;
  valores?: Record<string, unknown>;
  opcoes?: unknown;
  passos: unknown[][];
}
interface Banco {
  rpc?: (nome: string, args: Record<string, unknown>) => Resposta;
  tabela?: (p: Pedido) => Resposta;
  assinar?: (bucket: string, caminho: string, opcoes: unknown) => { data: { token?: string } | null; error: unknown };
  listar?: (bucket: string, pasta: string, opcoes: { search: string; limit: number }) => { data: Array<{ name: string }> | null; error: unknown };
}
function clienteFalso(banco: Banco) {
  const pedidos: Pedido[] = [];
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const storage: unknown[][] = [];
  const resolver = (p: Pedido) => (banco.tabela ? banco.tabela(p) : { data: p.tipo === "insert" ? [{ id: "novo-id" }] : p.tipo === "select" ? [] : [{ id: "x" }], error: null });
  const cadeia = (p: Pedido) => {
    const b: Record<string, unknown> = {};
    for (const op of ["in", "eq", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) b[op] = (...a: unknown[]) => (p.passos.push([op, ...a]), b);
    b.select = (colunas: string) => (p.passos.push(["select", colunas]), b);
    b.single = () => {
      p.passos.push(["single"]);
      const r = resolver(p);
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
    b.maybeSingle = () => {
      p.passos.push(["maybeSingle"]);
      const r = resolver(p);
      return Promise.resolve({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data });
    };
    b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(resolver(p)).then(ok, falhou);
    return b;
  };
  const novo = (p: Pedido) => (pedidos.push(p), cadeia(p));
  const cliente = {
    rpc: (nome: string, args: Record<string, unknown> = {}) => {
      rpcs.push({ nome, args });
      return Promise.resolve(banco.rpc ? banco.rpc(nome, args) : { data: null, error: null });
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: unknown) => novo({ tipo: "select", tabela, colunas, ...(opcoes ? { opcoes } : {}), passos: [] }),
      update: (valores: Record<string, unknown>) => novo({ tipo: "update", tabela, valores, passos: [] }),
      insert: (valores: Record<string, unknown>) => novo({ tipo: "insert", tabela, valores, passos: [] }),
      delete: () => novo({ tipo: "delete", tabela, passos: [] }),
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: (caminho: string, opcoes: unknown) => {
          storage.push(["assinar_upload", bucket, caminho, opcoes]);
          return Promise.resolve(banco.assinar ? banco.assinar(bucket, caminho, opcoes) : { data: { token: "tok" }, error: null });
        },
        list: (pasta: string, opcoes: { search: string; limit: number }) => {
          storage.push(["listar", bucket, pasta, opcoes]);
          return Promise.resolve(banco.listar ? banco.listar(bucket, pasta, opcoes) : { data: [{ name: opcoes.search }], error: null });
        },
      }),
    },
  };
  return { cliente, pedidos, rpcs, storage };
}
function contexto(corpo: Record<string, unknown>, banco: Banco = {}, o: { master?: boolean; schema?: "public" | "staging" } = {}) {
  const f = clienteFalso(banco);
  const log = { info: vi.fn(), aviso: vi.fn(), erro: vi.fn(), excecao: vi.fn() };
  return { c: { schema: o.schema ?? ("staging" as const), origin: null, corpo, userId: EU, master: o.master === true, comoPessoa: f.cliente, log }, log, ...f };
}
async function lerTreinos(itens: unknown[], banco: Banco = {}) {
  const k = contexto({ acao: "ler", itens }, banco);
  const r = await atenderLeituraDoTreino(k.c as never);
  return { r, itens: r.ok ? (r as { itens: RespostaDeItem[] }).itens : [], ...k };
}
async function modelos(acao: AcaoDosModelos, corpo: Record<string, unknown>, banco: Banco = {}, o: { master?: boolean } = {}) {
  const k = contexto({ ...corpo, acao }, banco, o);
  return { r: await atenderModelos(k.c as never, acao), ...k };
}
async function biblioteca(acao: AcaoDaBiblioteca, corpo: Record<string, unknown>, banco: Banco = {}, o: { master?: boolean; schema?: "public" | "staging" } = {}) {
  const k = contexto({ ...corpo, acao }, banco, o);
  return { r: await atenderBiblioteca(k.c as never, acao, PROJETO), ...k };
}
async function master(acao: AcaoDoMaster, corpo: Record<string, unknown>, banco: Banco = {}) {
  const k = contexto({ ...corpo, acao }, banco, { master: true });
  return { r: await atenderMaster(k.c as never, acao), ...k };
}
/** O log nunca leva um valor do corpo (o id, o nome, a URL): só códigos, a q/ação e o nome do campo. */
function logSemValores(log: ReturnType<typeof contexto>["log"], valores: string[]) {
  const tudo = JSON.stringify([log.info.mock.calls, log.aviso.mock.calls, log.erro.mock.calls, log.excecao.mock.calls.map((c) => c[1])]);
  for (const v of valores) expect(tudo, v).not.toContain(v);
}

beforeEach(() => vi.restoreAllMocks());

// ───────────────────────── as cópias do motor ─────────────────────────
describe("hml-21d — a CÓPIA do motor comum no Treino (o deploy_function.sh só leva o _shared do próprio projeto)", () => {
  it.each(["leitura-lote.ts", "leitura-servidor.ts"])("supabase/functions/_shared/%s = a do principal, byte a byte", (arquivo) => {
    const principal = readFileSync(resolve(RAIZ, "supabase-principal/functions/_shared", arquivo));
    const treino = readFileSync(resolve(RAIZ, "supabase/functions/_shared", arquivo));
    expect(treino.equals(principal)).toBe(true);
  });
  it("o leitura-servidor.ts só depende do leitura-lote.ts e do log.ts (o log também é igual nos 2 — logServidor.test.ts)", () => {
    const imports = [...ler("supabase/functions/_shared/leitura-servidor.ts").matchAll(/from "(\.\/[^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["./leitura-lote.ts", "./log.ts"]);
    expect(readFileSync(resolve(RAIZ, "supabase/functions/_shared/log.ts")).equals(readFileSync(resolve(RAIZ, "supabase-principal/functions/_shared/log.ts")))).toBe(true);
  });
});

// ───────────────────────── o catálogo ─────────────────────────
/** O SELECT FIXO das libs do 7c1a637 (o que o navegador lia hoje), com a origem — o servidor tem de mandar o MESMO. */
const DA_LIB = {
  pastas: { origem: "src/painel/treinos/api.ts:86 carregarPastas", tabela: "tb_pastas_treino", select: "id, nome, professor_id" },
  grupos_musculares: { origem: "api.ts:92 carregarMusculos", tabela: "grupos_musculares", select: "id, nome, professor_id" },
  busca_treinos: { origem: "src/painel/busca/Treinos.tsx:38", tabela: "tb_grupos_treino", select: "id, nome, professor_id" },
  treinos_prontos: {
    origem: "src/app-aluno/sozinho/api.ts:113 COLUNAS", tabela: "physiq_treinos_prontos",
    select: "id, codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, grupos:physiq_treinos_prontos_grupos(id, letra, nome, dias, ordem, "
      + "exercicios:physiq_treinos_prontos_exercicios(exercicio_id, ordem, series, reps, descanso_segundos, observacao, exercicio:tb_exercicios(id, nome, grupo_muscular, imagem_url, tipo)))",
  },
  treinos_prontos_todos: {
    origem: "src/master/app/treinosProntos.ts:38 COLUNAS", tabela: "physiq_treinos_prontos",
    select: "id, codigo, nome, objetivo, nivel, dias_por_semana, divisao, descricao, ordem, ativo, grupos:physiq_treinos_prontos_grupos(letra, nome, dias, ordem, "
      + "exercicios:physiq_treinos_prontos_exercicios(exercicio_id, ordem, series, reps, descanso_segundos, observacao, exercicio:tb_exercicios(nome)))",
  },
  exercicios_globais: { origem: "treinosProntos.ts:58 bibliotecaGlobal", tabela: "tb_exercicios", select: "id, nome, grupo_muscular" },
  grupos_globais: { origem: "src/pages/master/BibliotecaPage.tsx:70 lerGruposGlobais", tabela: "grupos_musculares", select: "id, nome, professor_id" },
} as const;

describe("hml-21d — o catálogo da treinos (a §2.3: os nomes, os params que as libs mandam — PADRÃO —, as colunas, o teto)", () => {
  it("as consultas: as do painel e do aluno, as do Master e a especial; o catálogo do motor = as 2 primeiras", () => {
    expect(Object.keys(CONSULTAS_TREINOS)).toEqual([
      "modelos", "modelos_detalhes", "modelo", "pastas", "grupos_musculares", "catalogo_modelos", "catalogo_pastas", "busca_treinos", "treinos_prontos",
    ]);
    expect(Object.keys(CONSULTAS_DO_MASTER)).toEqual(["treinos_prontos_todos", "exercicios_globais", "grupos_globais", "globais_do_grupo"]);
    expect(NOMES_DO_MASTER).toEqual(Object.keys(CONSULTAS_DO_MASTER));
    expect([...CONSULTAS_ESPECIAIS]).toEqual(["exercicios_lista"]);
    expect(TODAS_AS_CONSULTAS).toEqual([...Object.keys(CONSULTAS_TREINOS), ...Object.keys(CONSULTAS_DO_MASTER), "exercicios_lista"]);
    expect(Object.keys(CATALOGO_TREINOS.consultas)).toEqual([...Object.keys(CONSULTAS_TREINOS), ...Object.keys(CONSULTAS_DO_MASTER)]);
    expect(consultaDoTreino("pastas")).toBe(CONSULTAS_TREINOS.pastas);
    for (const q of ["exercicios_lista", "__proto__", "constructor", "tb_exercicios", 3, null]) expect(consultaDoTreino(q), String(q)).toBeNull();
  });

  it("cada tabela: colunas explícitas (nenhum '*') = o select da lib do 7c1a637; os detalhes com os recursos embutidos (linhas + exercício + vínculos)", () => {
    for (const [q, lib] of Object.entries(DA_LIB)) {
      const f = (CATALOGO_TREINOS.consultas as Record<string, { fonte: FonteTabela }>)[q].fonte;
      expect(f.tabela, `${q} × ${lib.origem}`).toBe(lib.tabela);
      if (!lib.select.includes("(")) expect(semEspacos(f.colunas.join(",")), `${q} × ${lib.origem}`).toBe(semEspacos(lib.select));
    }
    for (const c of Object.values(CATALOGO_TREINOS.consultas)) {
      if (ehRpc(c.fonte)) continue;
      const tudo = JSON.stringify(c.fonte);
      expect(tudo).not.toContain('"*"');
    }
    expect(COLUNAS_DO_TREINO.exercicio.join(", ")).toBe("id, nome, grupo_muscular, emoji, tipo, imagem_url, subgrupo, dica, professor_id, padrao_movimento, equipamento, variacao");
    expect(COLUNAS_DO_TREINO.linha.slice(1).join(", ")).toBe("grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg");
  });

  it("o teto de cada tabela: 1000 onde a lib lia sem limite (o max_rows) ou em páginas; 6 na Busca; 150 nos detalhes; 1 no treino por id", () => {
    const tetos = Object.fromEntries(Object.entries(CATALOGO_TREINOS.consultas).filter(([, c]) => !ehRpc(c.fonte)).map(([q, c]) => [q, (c.fonte as FonteTabela).teto]));
    expect(tetos).toEqual({
      modelos_detalhes: 150, modelo: 1, pastas: 1000, grupos_musculares: 1000, catalogo_modelos: 1000, catalogo_pastas: 1000, busca_treinos: BUSCA_MAX,
      treinos_prontos: 1000, treinos_prontos_todos: 1000, exercicios_globais: 1000, grupos_globais: 1000, globais_do_grupo: 1,
    });
    expect(BUSCA_MAX).toBe(6);
  });

  it("'minha' = o doEscopo da lib (o id de quem está logado): o recorte global-ou-meu nas 7 que a lib recortava; nenhum dono no corpo", () => {
    const recortes = Object.fromEntries(Object.entries(CATALOGO_TREINOS.consultas).map(([q, c]) => [q, (c as ConsultaDoTreinoLeitura).globalOuMeu ?? null]).filter(([, r]) => r));
    expect(recortes).toEqual({
      modelos_detalhes: { exercicioDaLinha: true }, modelo: { raiz: true, exercicioDaLinha: true }, pastas: { raiz: true }, grupos_musculares: { raiz: true },
      catalogo_modelos: { raiz: true }, catalogo_pastas: { raiz: true }, busca_treinos: { raiz: true },
    });
    for (const [q, c] of Object.entries(CATALOGO_TREINOS.consultas)) {
      expect("dono" in c, q).toBe(false);
      for (const dono of ["professor_id", "user_id", "uid", "meuId", "dono"]) expect(Object.keys(c.params), `${q}.${dono}`).not.toContain(dono);
    }
    // o filtrosExtras do motor: o .or() com o user do TOKEN (o 3º argumento), nunca um param
    expect(filtrosDoTreino(CONSULTAS_TREINOS.pastas, { professor_id: OUTRO }, EU)).toEqual([{ op: "ou", filtro: ESCOPO }]);
    expect(filtrosDoTreino({ ...CONSULTAS_TREINOS.modelo }, {}, EU)).toEqual([{ op: "ou", filtro: ESCOPO }, { op: "ou", filtro: ESCOPO, tabela: "linhas.exercicio" }]);
    expect(filtrosDoTreino(CONSULTAS_TREINOS.treinos_prontos, {}, EU)).toEqual([]);
  });

  it("as RPCs: os args que a lib mandava, montados aqui (o corpo nunca vira arg)", () => {
    const rpcs = Object.entries(CATALOGO_TREINOS.consultas).filter(([, c]) => ehRpc(c.fonte)).map(([q, c]) => [q, (c.fonte as FonteRpc).rpc, (c.fonte as FonteRpc).args]);
    expect(rpcs).toEqual([["modelos", "modelos_da_lista", { p_filtros: "filtros", p_offset: "offset", p_limite: "limite" }]]);
  });
});

describe("hml-21d — o `ler` da treinos (o motor, como a pessoa)", () => {
  it("pastas e grupos musculares: o select da lib, o global-ou-meu com o user do token, a ordem nome+id e as páginas de 1000 (o laço)", async () => {
    const { itens, pedidos } = await lerTreinos([{ q: "pastas", professor_id: OUTRO }, { q: "grupos_musculares" }], { tabela: () => ({ data: [{ id: PASTA, nome: "P", professor_id: EU }], error: null }) });
    expect(itens).toEqual([{ ok: true, linhas: [{ id: PASTA, nome: "P", professor_id: EU }] }, { ok: true, linhas: [{ id: PASTA, nome: "P", professor_id: EU }] }]);
    const passos = [["or", ESCOPO], ["order", "nome", { ascending: true }], ["order", "id", { ascending: true }], ["range", 0, 999]];
    expect(pedidos).toEqual([
      { tipo: "select", tabela: "tb_pastas_treino", colunas: "id, nome, professor_id", passos },
      { tipo: "select", tabela: "grupos_musculares", colunas: "id, nome, professor_id", passos },
    ]);
  });

  it("o laço: a 2ª página quando a 1ª vem cheia (1000), sem o corte calado de hoje", async () => {
    let n = 0;
    const { itens, pedidos } = await lerTreinos([{ q: "pastas" }], { tabela: () => ({ data: Array.from({ length: n++ === 0 ? 1000 : 3 }, (_, i) => ({ id: String(i) })), error: null }) });
    expect((itens[0] as { linhas: unknown[] }).linhas).toHaveLength(1003);
    expect(pedidos.map((p) => p.passos.at(-1))).toEqual([["range", 0, 999], ["range", 1000, 1999]]);
  });

  it("modelos: a RPC modelos_da_lista com o p_filtros {q, pasta}, o offset e o limite que a lib manda; o valor como veio", async () => {
    const valor = { ok: true, total: 1, total_geral: 3, por_pasta: {}, itens: [{ id: M1, nome: "A", professor_id: EU }] };
    const { itens, rpcs } = await lerTreinos([{ q: "modelos", filtros: { q: "supino", pasta: PASTA, dono: OUTRO }, offset: 20, limite: 20 }], { rpc: () => ({ data: valor, error: null }) });
    expect(itens).toEqual([{ ok: true, valor }]);
    expect(rpcs).toEqual([{ nome: "modelos_da_lista", args: { p_filtros: { q: "supino", pasta: PASTA }, p_offset: 20, p_limite: 20 } }]);
    const ruins = await lerTreinos([
      { q: "modelos", filtros: {}, offset: -1, limite: 20 }, { q: "modelos", filtros: {}, offset: 0, limite: 101 }, { q: "modelos", filtros: { pasta: "x" }, offset: 0, limite: 20 },
      { q: "modelos", offset: 0, limite: 20 },
    ]);
    expect(ruins.itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["dados_invalidos", "dados_invalidos", "dados_invalidos", "dados_invalidos"]);
    expect(ruins.rpcs).toEqual([]);
  });

  it("modelos_detalhes: 1 consulta com as linhas (o exercício citado recortado global-ou-meu) e os vínculos — os 3 pedidos em série de hoje", async () => {
    const linha = { id: "l1", grupo_id: M1, exercicio_id: EX, ordem: 0, num_series: 3, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null, exercicio: null };
    const { itens, pedidos } = await lerTreinos([{ q: "modelos_detalhes", ids: [M1, M2.toUpperCase()] }], { tabela: () => ({ data: [{ id: M1, linhas: [linha], vinculos: [] }], error: null }) });
    expect(itens).toEqual([{ ok: true, linhas: [{ id: M1, linhas: [linha], vinculos: [] }] }]);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].tabela).toBe("tb_grupos_treino");
    expect(semEspacos(pedidos[0].colunas as string)).toBe(semEspacos(
      "id, linhas:tb_grupos_exercicios(id, grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg, "
      + "exercicio:tb_exercicios(id, nome, grupo_muscular, emoji, tipo, imagem_url, subgrupo, dica, professor_id, padrao_movimento, equipamento, variacao)), "
      + "vinculos:tb_pastas_treino_grupos(id, pasta_id, grupo_id)",
    ));
    expect(pedidos[0].passos).toEqual([
      ["in", "id", [M1, M2]], ["or", ESCOPO, { referencedTable: "linhas.exercicio" }], ["limit", 1000, { referencedTable: "linhas" }],
      ["limit", 1000, { referencedTable: "vinculos" }], ["order", "id", { ascending: true }], ["limit", 150],
    ]);
    const ruins = await lerTreinos([{ q: "modelos_detalhes", ids: [] }, { q: "modelos_detalhes", ids: ["x"] }, { q: "modelos_detalhes", ids: Array.from({ length: 151 }, (_, i) => `a1111111-1111-4111-8111-${String(i).padStart(12, "0")}`) }]);
    expect(ruins.itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["dados_invalidos", "dados_invalidos", "dados_invalidos"]);
    expect(ruins.pedidos).toEqual([]);
  });

  it("modelo: o treino pelo id (global ou meu) com os detalhes na MESMA ida; outro → nenhuma linha (a lib devolve null)", async () => {
    const { itens, pedidos } = await lerTreinos([{ q: "modelo", id: M1 }]);
    expect(itens).toEqual([{ ok: true, linhas: [] }]);
    expect(pedidos[0].passos).toEqual([
      ["eq", "id", M1], ["or", ESCOPO], ["or", ESCOPO, { referencedTable: "linhas.exercicio" }], ["limit", 1000, { referencedTable: "linhas" }],
      ["limit", 1000, { referencedTable: "vinculos" }], ["limit", 1],
    ]);
    expect(semEspacos(pedidos[0].colunas as string).startsWith("id,nome,professor_id,linhas:tb_grupos_exercicios(")).toBe(true);
  });

  it("catalogo_modelos e catalogo_pastas: os modelos com as linhas e as pastas com os vínculos, em páginas (sem os exercícios e os grupos que a aba não usa)", async () => {
    const { pedidos } = await lerTreinos([{ q: "catalogo_modelos" }, { q: "catalogo_pastas" }]);
    expect(pedidos.map((p) => [p.tabela, semEspacos(p.colunas as string)])).toEqual([
      ["tb_grupos_treino", semEspacos("id, nome, professor_id, linhas:tb_grupos_exercicios(id, grupo_id, exercicio_id, ordem, num_series, reps_alvo, descanso_segundos, carga_sugerida_kg)")],
      ["tb_pastas_treino", semEspacos("id, nome, professor_id, vinculos:tb_pastas_treino_grupos(id, pasta_id, grupo_id)")],
    ]);
    for (const p of pedidos) expect(p.passos.slice(0, 2)).toEqual([["or", ESCOPO], ["limit", 1000, { referencedTable: p.tabela === "tb_grupos_treino" ? "linhas" : "vinculos" }]]);
    expect(pedidos.map((p) => p.passos.at(-1))).toEqual([["range", 0, 999], ["range", 0, 999]]);
  });

  it("busca_treinos: o ilike do termo (o literal da tela), o global-ou-meu, por nome, os 6 primeiros", async () => {
    const { pedidos } = await lerTreinos([{ q: "busca_treinos", termo: "supino\\_reto" }]);
    expect(pedidos).toEqual([{
      tipo: "select", tabela: "tb_grupos_treino", colunas: "id, nome, professor_id",
      passos: [["ilike", "nome", "%supino\\_reto%"], ["or", ESCOPO], ["order", "nome", { ascending: true }], ["limit", 6]],
    }]);
    const ruins = await lerTreinos([{ q: "busca_treinos" }, { q: "busca_treinos", termo: "x".repeat(201) }]);
    expect(ruins.itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["dados_invalidos", "dados_invalidos"]);
  });

  it("treinos_prontos (o aluno): os ativos, a ordem, os embutidos da lib; o Master: todos e o ativo; a biblioteca global COM página", async () => {
    const { pedidos } = await lerTreinos([{ q: "treinos_prontos" }, { q: "treinos_prontos_todos" }, { q: "exercicios_globais", pagina: 2 }, { q: "grupos_globais" }, { q: "globais_do_grupo", nome: "Peito" }]);
    expect(pedidos.map((p) => [p.tabela, semEspacos(p.colunas as string), p.passos, p.opcoes ?? null])).toEqual([
      ["physiq_treinos_prontos", semEspacos(DA_LIB.treinos_prontos.select), [["eq", "ativo", true], ["order", "ordem", { ascending: true }], ["limit", 1000]], null],
      ["physiq_treinos_prontos", semEspacos(DA_LIB.treinos_prontos_todos.select), [["order", "ordem", { ascending: true }], ["limit", 1000]], null],
      ["tb_exercicios", "id,nome,grupo_muscular", [["is", "professor_id", null], ["order", "nome", { ascending: true }], ["order", "id", { ascending: true }], ["range", 1000, 1999]], null],
      ["grupos_musculares", "id,nome,professor_id", [["is", "professor_id", null], ["order", "nome", { ascending: true }], ["order", "id", { ascending: true }], ["limit", 1000]], null],
      ["tb_exercicios", "id", [["eq", "grupo_muscular", "Peito"], ["is", "professor_id", null]], { count: "exact", head: true }],
    ]);
    const ruins = await lerTreinos([{ q: "exercicios_globais" }, { q: "exercicios_globais", pagina: 0 }, { q: "globais_do_grupo" }]);
    expect(ruins.itens.map((i) => (i.ok === false ? i.erro : "ok"))).toEqual(["dados_invalidos", "dados_invalidos", "dados_invalidos"]);
  });

  it("q desconhecida → consulta_invalida; lote de 17 → lote_grande; sem itens → dados_invalidos; nada vai ao banco", async () => {
    const a = await lerTreinos([{ q: "tb_exercicios" }, { q: "pastas" }]);
    expect(a.itens[0]).toEqual({ ok: false, erro: "consulta_invalida" });
    const b = await lerTreinos(Array.from({ length: 17 }, () => ({ q: "pastas" })));
    expect(b.r).toEqual({ ok: false, erro: "lote_grande" });
    expect(b.pedidos).toEqual([]);
    const c = await lerTreinos([]);
    expect(c.r).toEqual({ ok: false, erro: "dados_invalidos" });
    const d = await lerTreinos(Array.from({ length: 17 }, () => ({ q: "exercicios_lista", offset: 0, limite: 1 })));
    expect(d.r).toEqual({ ok: false, erro: "lote_grande" });
    expect(d.rpcs).toEqual([]);
  });

  it("o erro do banco vira o código do item (a mensagem nunca vai na resposta); o RLS → sem_acesso; os outros itens seguem", async () => {
    const { itens, log } = await lerTreinos([{ q: "pastas" }, { q: "modelos", filtros: {}, offset: 0, limite: 20 }], {
      tabela: () => ({ data: null, error: { code: "42501", message: "permission denied for table tb_pastas_treino" } }),
      rpc: () => ({ data: { ok: true, itens: [] }, error: null }),
    });
    expect(itens).toEqual([{ ok: false, erro: "sem_acesso" }, { ok: true, valor: { ok: true, itens: [] } }]);
    expect(JSON.stringify(itens)).not.toContain("permission");
    expect(log.excecao).not.toHaveBeenCalled();
  });
});

describe("hml-21d — a consulta especial exercicios_lista (o p_filtros de hoje com as listas de textos)", () => {
  it("a RPC com o MESMO p_filtros (escopo, professor, q, códigos, músculos, fora), o offset e o limite; as chaves de fora caem", async () => {
    const valor = { ok: true, itens: [], total: 0, com_gif: 7 };
    const filtros = { escopo: "visiveis", professor: OUTRO, q: "rosca", codigos: ["rosca_direta"], musculos: ["biceps", "grande dorsal"], fora: [], dono: EU, x: 1 };
    const { itens, rpcs } = await lerTreinos([{ q: "exercicios_lista", filtros, offset: 20, limite: 20, user_id: OUTRO }], { rpc: () => ({ data: valor, error: null }) });
    expect(itens).toEqual([{ ok: true, valor }]);
    expect(rpcs).toEqual([{ nome: "exercicios_da_lista", args: {
      p_filtros: { escopo: "visiveis", professor: OUTRO, q: "rosca", codigos: ["rosca_direta"], musculos: ["biceps", "grande dorsal"], fora: [] }, p_offset: 20, p_limite: 20,
    } }]);
  });

  it("junto com as do motor no MESMO pedido: a resposta na ordem do pedido; os iguais 1 vez", async () => {
    const { itens, rpcs, pedidos } = await lerTreinos(
      [{ q: "pastas" }, { q: "exercicios_lista", filtros: {}, offset: 0, limite: 1 }, { q: "modelos", filtros: {}, offset: 0, limite: 20 }, { q: "exercicios_lista", filtros: {}, offset: 0, limite: 1 }],
      { rpc: (nome) => ({ data: { nome }, error: null }), tabela: () => ({ data: [{ id: PASTA }], error: null }) },
    );
    expect(itens).toEqual([
      { ok: true, linhas: [{ id: PASTA }] }, { ok: true, valor: { nome: "exercicios_da_lista" } }, { ok: true, valor: { nome: "modelos_da_lista" } },
      { ok: true, valor: { nome: "exercicios_da_lista" } },
    ]);
    expect(rpcs.map((r) => r.nome).sort()).toEqual(["exercicios_da_lista", "modelos_da_lista"]);
    expect(pedidos).toHaveLength(1);
  });

  it("fora da forma → dados_invalidos só nesse item (nada vai ao banco): escopo, professor, q longo, código com espaço, músculo de 81, lista grande, offset/limite", () => {
    const base = { q: "exercicios_lista", offset: 0, limite: 20 };
    for (const [rot, bruto] of [
      ["escopo", { ...base, filtros: { escopo: "todos" } }], ["professor", { ...base, filtros: { professor: "x" } }], ["q", { ...base, filtros: { q: "x".repeat(201) } }],
      ["código", { ...base, filtros: { codigos: ["supino reto"] } }], ["código número", { ...base, filtros: { codigos: [1] } }],
      ["músculo 81", { ...base, filtros: { musculos: ["m".repeat(81)] } }], ["músculo controle", { ...base, filtros: { fora: ["a\u0000b"] } }],
      ["301 músculos", { ...base, filtros: { musculos: Array.from({ length: 301 }, () => "peito") } }], ["filtros lista", { ...base, filtros: [] }],
      ["offset", { ...base, offset: -1 }], ["limite", { ...base, limite: 0 }], ["limite 101", { ...base, limite: 101 }], ["sem offset", { q: "exercicios_lista", limite: 1 }],
    ] as const) {
      expect(lerExerciciosLista(bruto as Record<string, unknown>).ok, rot).toBe(false);
    }
    expect(lerExerciciosLista({ ...base })).toMatchObject({ ok: true, params: { filtros: {}, offset: 0, limite: 20 } });
  });

  it("o erro da RPC vira o código (sem a mensagem); o inesperado avisa (log.excecao) sem os params", async () => {
    const { itens, log } = await lerTreinos([{ q: "exercicios_lista", filtros: { q: "segredo-do-termo" }, offset: 0, limite: 1 }], { rpc: () => ({ data: null, error: { code: "XX000", message: "boom" } }) });
    expect(itens).toEqual([{ ok: false, erro: "erro_interno" }]);
    expect(log.excecao).toHaveBeenCalledTimes(1);
    logSemValores(log, ["segredo-do-termo"]);
  });
});

describe("hml-21d — o Master no `ler` e nas ações (o papel ANTES do banco: N10)", () => {
  it("pedeConsultaDoMaster: as 4 do Master em qualquer posição; as outras não", () => {
    for (const q of NOMES_DO_MASTER) expect(pedeConsultaDoMaster({ acao: "ler", itens: [{ q: "pastas" }, { q }] }), q).toBe(true);
    expect(pedeConsultaDoMaster({ acao: "ler", itens: [{ q: "pastas" }, { q: "exercicios_lista" }, { q: "treinos_prontos" }] })).toBe(false);
    expect(pedeConsultaDoMaster({ acao: "ler", itens: "treinos_prontos_todos" })).toBe(false);
  });
  it("moduloDoPedido: as 3 listas não se cruzam; o `ler`; o resto → null (acao_invalida)", () => {
    expect(ACOES_DOS_MODELOS.filter((a) => (ACOES_DA_BIBLIOTECA as readonly string[]).includes(a) || (ACOES_DO_MASTER as readonly string[]).includes(a))).toEqual([]);
    expect(ACOES_DA_BIBLIOTECA.filter((a) => (ACOES_DO_MASTER as readonly string[]).includes(a))).toEqual([]);
    expect(Object.keys(CORPOS_DAS_ACOES).sort()).toEqual([...ACOES_DA_TREINOS].sort());
    expect(moduloDoPedido({ acao: "ler" })).toEqual({ modulo: "leitura", acao: "ler" });
    expect(moduloDoPedido({ acao: "modelo_ordenar" })).toEqual({ modulo: "modelos", acao: "modelo_ordenar" });
    expect(moduloDoPedido({ acao: "professor_perfil" })).toEqual({ modulo: "biblioteca", acao: "professor_perfil" });
    expect(moduloDoPedido({ acao: "treino_pronto_salvar" })).toEqual({ modulo: "master", acao: "treino_pronto_salvar" });
    for (const a of ["", "LER", "tb_exercicios", "__proto__", 3, null, undefined]) expect(moduloDoPedido({ acao: a }), String(a)).toBeNull();
  });
  it("o papel do token: admin e master = master (a regra do physiq_papel); professor/aluno/sem papel/token ruim = não", () => {
    const token = (payload: unknown) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.a`;
    expect(papelDoToken(token({ sub: EU, app_metadata: { role: "master" } }))).toBe("master");
    expect(papelDoToken(token({ sub: EU, app_metadata: { role: "admin" } }))).toBe("admin");
    expect(papelDoToken(token({ sub: EU, app_metadata: { role: "professor" } }))).toBe("professor");
    expect(papelDoToken(token({ sub: EU, app_metadata: {} }))).toBeNull();
    expect(papelDoToken(token({ sub: EU, role: "master" }))).toBeNull();
    for (const ruim of ["", "a.b", "a.%%%.c", "a.b.c.d", token("texto")]) expect(papelDoToken(ruim), ruim).toBeNull();
    expect(papelDoToken(`h.${Buffer.from(JSON.stringify({ app_metadata: { role: "master", nome: "Ção" } })).toString("base64url")}.a`)).toBe("master");
    expect([ehMaster("master"), ehMaster("admin"), ehMaster("professor"), ehMaster(null), ehMaster("MASTER")]).toEqual([true, true, false, false, false]);
  });
});

// ───────────────────────── as gravações ─────────────────────────
describe("hml-21d — modelos e pastas (o MESMO de hoje, src/painel/treinos/api.ts)", () => {
  it("criar: o dono do TOKEN (o master no global; o personal para si) — o professor_id/dono do corpo nunca chega ao banco; → { id }", async () => {
    const p = await modelos("modelo_criar", { nome: "Treino A", professor_id: OUTRO, dono: OUTRO });
    expect(p.r).toEqual({ ok: true, id: "novo-id" });
    expect(p.pedidos).toEqual([{ tipo: "insert", tabela: "tb_grupos_treino", valores: { nome: "Treino A", professor_id: EU }, passos: [["select", "id"], ["single"]] }]);
    const m = await modelos("pasta_criar", { nome: "Pasta", professor_id: OUTRO }, {}, { master: true });
    expect(m.pedidos[0]).toMatchObject({ tabela: "tb_pastas_treino", valores: { nome: "Pasta", professor_id: null } });
    expect([donoAoCriar(EU, false), donoAoCriar(EU, true)]).toEqual([EU, null]);
  });

  it("editar e excluir pelo id; 0 linha → nao_encontrado (o RLS esconde); o modelo em uso (23503) → em_uso, a frase de hoje", async () => {
    const e = await modelos("modelo_editar", { id: M1, nome: "B", professor_id: OUTRO });
    expect(e.r).toEqual({ ok: true });
    expect(e.pedidos).toEqual([{ tipo: "update", tabela: "tb_grupos_treino", valores: { nome: "B" }, passos: [["eq", "id", M1], ["select", "id"]] }]);
    const zero = await modelos("pasta_editar", { id: PASTA, nome: "X" }, { tabela: () => ({ data: [], error: null }) });
    expect(zero.r).toEqual({ ok: false, erro: "nao_encontrado" });
    const x = await modelos("modelo_excluir", { id: M1 });
    expect(x.pedidos).toEqual([{ tipo: "delete", tabela: "tb_grupos_treino", passos: [["eq", "id", M1], ["select", "id"]] }]);
    const uso = await modelos("modelo_excluir", { id: M1 }, { tabela: () => ({ data: null, error: { code: "23503", message: "violates foreign key constraint xyz" } }) });
    expect(uso.r).toEqual({ ok: false, erro: "em_uso" });
    expect(statusDoErroTreino("em_uso")).toBe(409);
    expect(uso.log.excecao).not.toHaveBeenCalled();
  });

  it("os exercícios do modelo: incluir (grupo, exercício, ordem), tirar (o par), prescrever (só as colunas que vieram; o null limpa)", async () => {
    const i = await modelos("modelo_exercicio_incluir", { grupo: M1, exercicio: EX, ordem: 3, professor_id: OUTRO });
    expect(i.pedidos[0]).toMatchObject({ tipo: "insert", tabela: "tb_grupos_exercicios", valores: { grupo_id: M1, exercicio_id: EX, ordem: 3 } });
    const t = await modelos("modelo_exercicio_tirar", { grupo: M1, exercicio: EX });
    expect(t.pedidos).toEqual([{ tipo: "delete", tabela: "tb_grupos_exercicios", passos: [["eq", "grupo_id", M1], ["eq", "exercicio_id", EX], ["select", "id"]] }]);
    const p = await modelos("modelo_exercicio_prescrever", { grupo: M1, exercicio: EX, num_series: 4, carga_sugerida_kg: 12.5, reps_alvo: null, ordem: 9 });
    expect(p.pedidos).toEqual([{
      tipo: "update", tabela: "tb_grupos_exercicios", valores: { num_series: 4, reps_alvo: null, carga_sugerida_kg: 12.5 },
      passos: [["eq", "grupo_id", M1], ["eq", "exercicio_id", EX], ["select", "id"]],
    }]);
    const vazio = await modelos("modelo_exercicio_prescrever", { grupo: M1, exercicio: EX });
    expect(vazio.r).toEqual({ ok: false, erro: "dados_invalidos" });
    expect(vazio.pedidos).toEqual([]);
  });

  it("ordenar: a RPC NOVA modelo_ordenar(p_grupo, p_ids) com a lista da tela (na ordem, sem tirar os repetidos — a RPC recusa); os códigos dela", async () => {
    const r = await modelos("modelo_ordenar", { grupo: M1, ids: [EX2, EX.toUpperCase()] }, { rpc: () => ({ data: 2, error: null }) });
    expect(r.r).toEqual({ ok: true, n: 2 });
    expect(r.rpcs).toEqual([{ nome: "modelo_ordenar", args: { p_grupo: M1, p_ids: [EX2, EX] } }]);
    for (const erro of ERROS_DAS_RPCS_DO_TREINO) {
      const x = await modelos("modelo_ordenar", { grupo: M1, ids: [EX] }, { rpc: () => ({ data: null, error: { code: erro === "nao_encontrado" ? "P0002" : erro === "sem_login" ? "42501" : "22023", message: erro } }) });
      expect(x.r, erro).toEqual({ ok: false, erro });
      expect(x.log.excecao, erro).not.toHaveBeenCalled();
    }
    const rep = await modelos("modelo_ordenar", { grupo: M1, ids: [EX, EX] }, { rpc: () => ({ data: 1, error: null }) });
    expect(rep.rpcs[0].args.p_ids).toEqual([EX, EX]);
    for (const ruim of [[], ["x"], "a", null, Array.from({ length: 1001 }, () => EX)]) {
      const x = await modelos("modelo_ordenar", { grupo: M1, ids: ruim });
      expect(x.r, JSON.stringify(ruim).slice(0, 20)).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(x.rpcs).toEqual([]);
    }
  });

  it("vincular e desvincular a pasta: o par; o vínculo que já existe (23505) = ok, como o colocarNaPasta de hoje", async () => {
    const v = await modelos("pasta_vincular", { pasta: PASTA, grupo: M1 });
    expect(v.r).toEqual({ ok: true });
    expect(v.pedidos[0]).toMatchObject({ tipo: "insert", tabela: "tb_pastas_treino_grupos", valores: { pasta_id: PASTA, grupo_id: M1 } });
    const ja = await modelos("pasta_vincular", { pasta: PASTA, grupo: M1 }, { tabela: () => ({ data: null, error: { code: "23505", message: "duplicate" } }) });
    expect(ja.r).toEqual({ ok: true });
    const neg = await modelos("pasta_vincular", { pasta: PASTA, grupo: M1 }, { tabela: () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } }) });
    expect(neg.r).toEqual({ ok: false, erro: "sem_acesso" });
    const d = await modelos("pasta_desvincular", { pasta: PASTA, grupo: M1 });
    expect(d.pedidos).toEqual([{ tipo: "delete", tabela: "tb_pastas_treino_grupos", passos: [["eq", "pasta_id", PASTA], ["eq", "grupo_id", M1], ["select", "id"]] }]);
  });

  it("uuid/texto/inteiro ruins → dados_invalidos e nada vai ao banco; o log leva o nome do campo, nunca o valor", async () => {
    for (const [acao, corpo] of [
      ["modelo_criar", {}], ["modelo_criar", { nome: "x".repeat(201) }], ["modelo_editar", { id: "x", nome: "A" }], ["modelo_excluir", {}],
      ["modelo_exercicio_incluir", { grupo: M1, exercicio: EX, ordem: 1.5 }], ["pasta_vincular", { pasta: PASTA }], ["modelo_exercicio_prescrever", { grupo: M1, exercicio: EX, carga_sugerida_kg: "1" }],
    ] as const) {
      const r = await modelos(acao, corpo as Record<string, unknown>);
      expect(r.r, `${acao} ${JSON.stringify(corpo).slice(0, 30)}`).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(r.pedidos).toEqual([]);
      logSemValores(r.log, ["x".repeat(50)]);
    }
  });
});

describe("hml-21d — a biblioteca, a foto do exercício e o perfil (o MESMO de hoje)", () => {
  const DADOS = { nome: "Rosca", grupo_muscular: "Bíceps", tipo: "musculacao", subgrupo: null, dica: "d", padrao_movimento: "rosca_direta", equipamento: null, variacao: null };
  it("criar o exercício: as colunas da Folha + o emoji de hoje + o dono do TOKEN (o professor_id/emoji do corpo caem); → { id }", async () => {
    const r = await biblioteca("exercicio_criar", { ...DADOS, professor_id: OUTRO, emoji: "💀", imagem_url: "https://x" });
    expect(r.r).toEqual({ ok: true, id: "novo-id" });
    expect(r.pedidos[0]).toEqual({ tipo: "insert", tabela: "tb_exercicios", valores: { ...DADOS, emoji: "🏋️", professor_id: EU }, passos: [["select", "id"], ["single"]] });
    const m = await biblioteca("exercicio_criar", DADOS, {}, { master: true });
    expect((m.pedidos[0].valores as Record<string, unknown>).professor_id).toBeNull();
    const ruim = await biblioteca("exercicio_criar", { ...DADOS, tipo: "yoga" });
    expect(ruim.r).toEqual({ ok: false, erro: "dados_invalidos" });
  });

  it("a foto: o caminho <id>.<ext> nasce no servidor (o de hoje), o bucket do schema, o upsert; tipo/tamanho fora dos limites da tela → recusa", async () => {
    const r = await biblioteca("exercicio_foto_preparar", { exercicio: EX, tipo: "image/gif", tamanho: 1000, caminho: `${OUTRO}/x.gif` });
    expect(r.r).toEqual({ ok: true, bucket: "exercicios-staging", caminho: `${EX}.gif`, token: "tok" });
    expect(r.storage).toEqual([["assinar_upload", "exercicios-staging", `${EX}.gif`, { upsert: true }]]);
    const prod = await biblioteca("exercicio_foto_preparar", { exercicio: EX, tipo: "image/jpeg", tamanho: 1 }, {}, { schema: "public" });
    expect(prod.r).toMatchObject({ bucket: "exercicios", caminho: `${EX}.jpg` });
    for (const corpo of [{ exercicio: EX, tipo: "image/svg+xml", tamanho: 10 }, { exercicio: EX, tipo: "image/png", tamanho: IMAGEM_MAX_BYTES + 1 }, { exercicio: "x", tipo: "image/png", tamanho: 1 }]) {
      const x = await biblioteca("exercicio_foto_preparar", corpo);
      expect(x.r).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(x.storage).toEqual([]);
    }
    // a policy do bucket recusa (o exercício não é de quem chama) → sem_acesso; o Storage fora → storage_falhou
    const neg = await biblioteca("exercicio_foto_preparar", { exercicio: EX, tipo: "image/png", tamanho: 1 }, { assinar: () => ({ data: null, error: { status: 400, statusCode: "403", message: "new row violates row-level security policy" } }) });
    expect(neg.r).toEqual({ ok: false, erro: "sem_acesso" });
    const fora = await biblioteca("exercicio_foto_preparar", { exercicio: EX, tipo: "image/png", tamanho: 1 }, { assinar: () => ({ data: null, error: { status: 500 } }) });
    expect(fora.r).toEqual({ ok: false, erro: "storage_falhou" });
    expect([caminhoDaFotoDoExercicio(EX.toUpperCase(), "image/webp"), bucketDosExercicios("staging"), bucketDosExercicios("public")]).toEqual([`${EX}.webp`, "exercicios-staging", "exercicios"]);
  });

  it("editar com a foto NOVA: só a URL pública DESTE exercício neste bucket, num host da API do Treino, com o arquivo lá (N8)", async () => {
    const boa = `${URL_API_TREINO}/storage/v1/object/public/exercicios-staging/${EX}.gif?v=1760000000000`;
    const banco = (atual: unknown): Banco => ({ tabela: (p) => (p.tipo === "select" ? { data: [{ imagem_url: atual }], error: null } : { data: [{ id: EX }], error: null }) });
    const ok = await biblioteca("exercicio_editar", { id: EX, imagem_url: boa }, banco(null));
    expect(ok.r).toEqual({ ok: true });
    expect(ok.storage).toEqual([["listar", "exercicios-staging", "", { search: `${EX}.gif`, limit: 10 }]]);
    expect(ok.pedidos.map((p) => [p.tipo, p.tabela, p.valores ?? p.colunas])).toEqual([["select", "tb_exercicios", "imagem_url"], ["update", "tb_exercicios", { imagem_url: boa }]]);
    // o host do projeto (o de antes) também; a que já estava na linha passa sem o Storage; nenhuma (tirar) passa
    expect((await biblioteca("exercicio_editar", { id: EX, imagem_url: `${PROJETO}/storage/v1/object/public/exercicios-staging/${EX}.png` }, banco(null))).r).toEqual({ ok: true });
    const mesma = await biblioteca("exercicio_editar", { id: EX, imagem_url: "/exercicios/antiga.webp" }, banco("/exercicios/antiga.webp"));
    expect(mesma.r).toEqual({ ok: true });
    expect(mesma.storage).toEqual([]);
    const tirar = await biblioteca("exercicio_editar", { id: EX, imagem_url: null }, banco("x"));
    expect(tirar.pedidos).toEqual([{ tipo: "update", tabela: "tb_exercicios", valores: { imagem_url: null }, passos: [["eq", "id", EX], ["select", "id"]] }]);
    // de outro exercício, de outro bucket, de outro host, outro formato → dados_invalidos (nada é gravado)
    for (const ruim of [
      `${URL_API_TREINO}/storage/v1/object/public/exercicios-staging/${EX2}.gif`, `${URL_API_TREINO}/storage/v1/object/public/exercicios/${EX}.gif`,
      `https://evil.example/storage/v1/object/public/exercicios-staging/${EX}.gif`, `${URL_API_TREINO}/storage/v1/object/public/exercicios-staging/${EX}.svg`,
      `${URL_API_TREINO}/storage/v1/object/public/exercicios-staging/${EX}.gif?v=1&x=2`, `${URL_API_TREINO}/storage/v1/object/public/exercicios-staging/${OUTRO}/${EX}.gif`,
    ]) {
      const x = await biblioteca("exercicio_editar", { id: EX, imagem_url: ruim }, banco(null));
      expect(x.r, ruim).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(x.pedidos.filter((p) => p.tipo === "update")).toEqual([]);
      logSemValores(x.log, [ruim]);
    }
    // o arquivo não está lá → nao_encontrado; o exercício que a pessoa não vê → nao_encontrado
    expect((await biblioteca("exercicio_editar", { id: EX, imagem_url: boa }, { ...banco(null), listar: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect((await biblioteca("exercicio_editar", { id: EX, imagem_url: boa }, { tabela: () => ({ data: [], error: null }) })).r).toEqual({ ok: false, erro: "nao_encontrado" });
    expect(hostsDaApi(PROJETO)).toEqual([URL_API_TREINO, PROJETO]);
    expect(caminhoDaUrlDaFoto(boa, "exercicios-staging", EX, hostsDaApi(PROJETO))).toBe(`${EX}.gif`);
  });

  it("editar sem a foto: as colunas que vieram; excluir: o delete (em uso → em_uso); grupos musculares: o dono do token → { linha }", async () => {
    const e = await biblioteca("exercicio_editar", { id: EX, nome: "Nova", professor_id: OUTRO, emoji: "x" });
    expect(e.pedidos).toEqual([{ tipo: "update", tabela: "tb_exercicios", valores: { nome: "Nova" }, passos: [["eq", "id", EX], ["select", "id"]] }]);
    const x = await biblioteca("exercicio_excluir", { id: EX }, { tabela: () => ({ data: null, error: { code: "23503", message: "fk" } }) });
    expect(x.r).toEqual({ ok: false, erro: "em_uso" });
    const g = await biblioteca("grupo_muscular_criar", { nome: "Trapézio", professor_id: OUTRO }, { tabela: () => ({ data: [{ id: "g1", nome: "Trapézio", professor_id: EU }], error: null }) });
    expect(g.r).toEqual({ ok: true, linha: { id: "g1", nome: "Trapézio", professor_id: EU } });
    expect(g.pedidos[0]).toMatchObject({ tabela: "grupos_musculares", valores: { nome: "Trapézio", professor_id: EU }, passos: [["select", "id, nome, professor_id"], ["single"]] });
    const dup = await biblioteca("grupo_muscular_criar", { nome: "Peito" }, { tabela: () => ({ data: null, error: { code: "23505", message: "dup" } }) });
    expect(dup.r).toEqual({ ok: false, erro: "conflito" });
  });

  it("professor_perfil: o nome e/ou a foto SÓ na linha de quem chama (id = o sub; o id do corpo cai — N12); nada → dados_invalidos", async () => {
    const r = await biblioteca("professor_perfil", { nome: "Lucas", id: OUTRO, status: "ativo", plano_id: OUTRO });
    expect(r.pedidos).toEqual([{ tipo: "update", tabela: "physiq_professores", valores: { nome: "Lucas" }, passos: [["eq", "id", EU], ["select", "id"]] }]);
    const f = await biblioteca("professor_perfil", { foto_url: null });
    expect(f.pedidos[0].valores).toEqual({ foto_url: null });
    expect((await biblioteca("professor_perfil", { id: OUTRO })).r).toEqual({ ok: false, erro: "dados_invalidos" });
  });
});

describe("hml-21d — o Master (os treinos prontos e a biblioteca global)", () => {
  const TREINO = { codigo: "c1", nome: "Treino", objetivo: "manter", nivel: "iniciante", dias_por_semana: 3, divisao: "A · B", descricao: null, ordem: 1, ativo: true };
  const DIVISAO = { letra: "A", nome: "Treino A", dias: ["SEG"], exercicios: [{ exercicio_id: EX, series: 3, reps: "12", descanso_segundos: 60, observacao: null }] };
  it("treino_pronto_salvar: a RPC NOVA com a linha (as 9 colunas) e as divisões limpas (as chaves de fora caem) → { id }", async () => {
    const r = await master("treino_pronto_salvar", {
      id: M1.toUpperCase(), treino: { ...TREINO, id: OUTRO, criado_em: "x" }, divisoes: [{ ...DIVISAO, treino_id: OUTRO, exercicios: [{ ...DIVISAO.exercicios[0], grupo_id: OUTRO }] }],
    }, { rpc: () => ({ data: M1, error: null }) });
    expect(r.r).toEqual({ ok: true, id: M1 });
    expect(r.rpcs).toEqual([{ nome: "treino_pronto_salvar", args: { p_id: M1, p_treino: TREINO, p_divisoes: [DIVISAO] } }]);
    const novo = await master("treino_pronto_salvar", { treino: TREINO, divisoes: [DIVISAO] }, { rpc: () => ({ data: M2, error: null }) });
    expect(novo.rpcs[0].args.p_id).toBeNull();
    for (const erro of ERROS_DAS_RPCS_DO_TREINO) {
      const x = await master("treino_pronto_salvar", { id: M1, treino: TREINO, divisoes: [DIVISAO] }, { rpc: () => ({ data: null, error: { code: "P0002", message: erro } }) });
      expect(x.r).toEqual({ ok: false, erro });
    }
    const fk = await master("treino_pronto_salvar", { treino: TREINO, divisoes: [DIVISAO] }, { rpc: () => ({ data: null, error: { code: "23503", message: "fk" } }) });
    expect(fk.r).toEqual({ ok: false, erro: "dados_invalidos" });
  });
  it("treino_pronto_salvar fora da forma → dados_invalidos e a RPC nem é chamada", async () => {
    for (const corpo of [
      { treino: TREINO, divisoes: [] }, { treino: TREINO, divisoes: Array(27).fill(DIVISAO) }, { treino: [], divisoes: [DIVISAO] }, { id: "x", treino: TREINO, divisoes: [DIVISAO] },
      { treino: { ...TREINO, ativo: "sim" }, divisoes: [DIVISAO] }, { treino: { ...TREINO, codigo: "" }, divisoes: [DIVISAO] },
      { treino: TREINO, divisoes: [{ ...DIVISAO, exercicios: [{ ...DIVISAO.exercicios[0], exercicio_id: "x" }] }] },
      { treino: TREINO, divisoes: [{ ...DIVISAO, exercicios: [{ ...DIVISAO.exercicios[0], series: 2.5 }] }] }, { treino: TREINO, divisoes: [{ ...DIVISAO, dias: "SEG" }] },
    ]) {
      const x = await master("treino_pronto_salvar", corpo as Record<string, unknown>);
      expect(x.r, JSON.stringify(corpo).slice(0, 60)).toEqual({ ok: false, erro: "dados_invalidos" });
      expect(x.rpcs).toEqual([]);
    }
    expect(lerTreinoPronto({ treino: TREINO, divisoes: [DIVISAO] })).toMatchObject({ ok: true, id: null });
  });
  it("o ativo, os exercícios globais (professor_id null, tipo musculacao; promover) e os grupos globais — as tabelas e colunas de hoje", async () => {
    const a = await master("treino_pronto_ativo", { id: M1, ativo: false });
    expect(a.pedidos).toEqual([{ tipo: "update", tabela: "physiq_treinos_prontos", valores: { ativo: false }, passos: [["eq", "id", M1], ["select", "id"]] }]);
    const CAMPOS = { nome: "Supino", grupo_muscular: "Peito", emoji: "🏋️", subgrupo: null, dica: null, padrao_movimento: "supino_reto", equipamento: "barra", variacao: null };
    const c = await master("exercicio_global_criar", { ...CAMPOS, professor_id: OUTRO, tipo: "corrida" });
    expect(c.pedidos[0]).toMatchObject({ tipo: "insert", tabela: "tb_exercicios", valores: { ...CAMPOS, professor_id: null, tipo: "musculacao" } });
    const e = await master("exercicio_global_editar", { id: EX, ...CAMPOS, professor_id: OUTRO });
    expect(e.pedidos[0]).toMatchObject({ tipo: "update", tabela: "tb_exercicios", valores: CAMPOS });
    const p = await master("exercicio_global_promover", { id: EX });
    expect(p.pedidos[0]).toMatchObject({ tipo: "update", valores: { professor_id: null }, passos: [["eq", "id", EX], ["select", "id"]] });
    const g = await master("grupo_global_criar", { nome: "Trapézio" });
    expect(g.pedidos[0]).toMatchObject({ tipo: "insert", tabela: "grupos_musculares", valores: { nome: "Trapézio", professor_id: null } });
    const gx = await master("grupo_global_excluir", { id: M1 });
    expect(gx.pedidos[0]).toMatchObject({ tipo: "delete", tabela: "grupos_musculares", passos: [["eq", "id", M1], ["select", "id"]] });
    const ex = await master("exercicio_global_excluir", { id: EX }, { tabela: () => ({ data: null, error: { code: "23503", message: "fk" } }) });
    expect(ex.r).toEqual({ ok: false, erro: "em_uso" });
  });
});

describe("hml-21d — os erros (a tabela do motor + o em_uso do painel; nada cru na resposta)", () => {
  it("erroDoTreino: 42501 → sem_acesso, 23505 → conflito, 22/23502/23514 → dados_invalidos, os raise conhecidos, o 23503 com emUso → em_uso", () => {
    expect(erroDoTreino({ code: "42501", message: "x" })).toEqual({ erro: "sem_acesso", inesperado: false });
    expect(erroDoTreino({ code: "23505" })).toEqual({ erro: "conflito", inesperado: false });
    expect(erroDoTreino({ code: "23514" })).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDoTreino({ code: "23503" })).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDoTreino({ code: "23503" }, [], { emUso: true })).toEqual({ erro: "em_uso", inesperado: false });
    expect(erroDoTreino({ code: "P0002", message: "nao_encontrado" }, ERROS_DAS_RPCS_DO_TREINO)).toEqual({ erro: "nao_encontrado", inesperado: false });
    expect(erroDoTreino({ code: "42501", message: "sem_login" }, ERROS_DAS_RPCS_DO_TREINO)).toEqual({ erro: "sem_login", inesperado: false });
    expect(erroDoTreino({ code: "XX000", message: "boom" })).toEqual({ erro: "erro_interno", inesperado: true });
    expect(erroDoTreino({ name: "TimeoutError", message: "TimeoutError: x" })).toEqual({ erro: "tempo_esgotado", inesperado: true });
    expect([statusDoErroTreino("sem_login"), statusDoErroTreino("sem_acesso"), statusDoErroTreino("nao_encontrado"), statusDoErroTreino("dados_invalidos"), statusDoErroTreino("muitas_acoes")])
      .toEqual([401, 403, 404, 400, 429]);
  });
  it("o inesperado na gravação: 500 erro_interno sem a mensagem, com o log.excecao (o aviso ao Weslley) sem os valores do corpo", async () => {
    const r = await modelos("modelo_editar", { id: M1, nome: "nome-secreto" }, { tabela: () => ({ data: null, error: { code: "XX000", message: "o banco caiu" } }) });
    expect(r.r).toEqual({ ok: false, erro: "erro_interno" });
    expect(JSON.stringify(r.r)).not.toContain("banco caiu");
    expect(r.log.excecao).toHaveBeenCalledTimes(1);
    logSemValores(r.log, ["nome-secreto"]);
  });
});

describe("hml-21d — os módulos e as regras: nenhuma chave secreta, cliente de serviço nem Deno.env fora da porta/index", () => {
  it("os arquivos da treinos e os _shared novos", () => {
    for (const rel of [
      "supabase/functions/treinos/comum.ts", "supabase/functions/treinos/modelos.ts", "supabase/functions/treinos/biblioteca.ts", "supabase/functions/treinos/master.ts",
      "supabase/functions/_shared/treinos-leituras.ts", "supabase/functions/_shared/treinos-regras.ts",
    ]) {
      const fonte = ler(rel);
      expect(fonte, rel).not.toMatch(/service_?role|SERVICE_ROLE|sb_secret|createClient|Deno\.env/);
      expect(fonte, rel).not.toMatch(/from "[^"]*porta-treino/);
    }
    for (const rel of ["supabase/functions/treinos/index.ts", "supabase/functions/_shared/porta-treino.ts", "supabase/functions/_shared/jwks-treino.ts"]) {
      expect(ler(rel), rel).not.toMatch(/service_?role|SERVICE_ROLE|sb_secret/);
    }
    // a porta: só a anon e a URL do projeto; o index: só a URL (os hosts da foto)
    expect([...ler("supabase/functions/_shared/porta-treino.ts").matchAll(/Deno\.env\.get\("([A-Z_]+)"\)/g)].map((m) => m[1]).sort()).toEqual(["SUPABASE_ANON_KEY", "SUPABASE_URL"]);
    expect([...ler("supabase/functions/treinos/index.ts").matchAll(/Deno\.env\.get\("([A-Z_]+)"\)/g)].map((m) => m[1])).toEqual(["SUPABASE_URL"]);
  });
});
