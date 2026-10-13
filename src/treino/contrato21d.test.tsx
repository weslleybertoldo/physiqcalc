// Physiq hml-21d (H-43 · jeito 2, etapa 3) — o CONTRATO tela × servidor da função treinos: cada lib que mudou chama acaoTreinos/lerTreinos/
// lerConta com os params certos, o corpo PASSA nas regras REAIS do servidor (as listas fechadas de supabase/functions/_shared/treinos-{regras,
// leituras}.ts: nenhuma chave a mais, nenhum valor fora da forma, nenhum dono) e devolve o MESMO tipo de hoje. A função responde pelos MÓDULOS
// DE VERDADE (src/test/treinosFalso.ts) sobre o banco falso deste teste — as idas ao banco são as que a lib fazia (agora o servidor faz).
// Parte 1 (F3a): as GRAVAÇÕES — o Painel › Treinos (modelos, exercícios do modelo, a ordem, pastas, a biblioteca, os grupos musculares e a foto
// do exercício pelo link assinado), os treinos prontos do Master e o espelho do Perfil.
// Parte 2 (F3b): as LEITURAS — Meus treinos (a página e os detalhes: 2 `ler` em série, os detalhes numa consulta), o treino por id, as pastas,
// os grupos musculares, o catálogo dos Modelos, a biblioteca (exercicios_lista — também a folha do editor), o aluno_treino do editor (pela
// conta), os treinos prontos do Master e do aluno e a biblioteca global COM página — o MESMO tipo e a MESMA ordem de hoje.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CORPOS_DAS_ACOES, lerCorpoDaAcao, lerTreinoPronto, moduloDoPedido, type AcaoTreinos } from "../../supabase/functions/_shared/treinos-regras";
import { CATALOGO_TREINOS, lerExerciciosLista } from "../../supabase/functions/_shared/treinos-leituras";
import { lerPedidoDeLeitura, type CatalogoLeitura } from "../../supabase/functions/_shared/leitura-lote";

const EU = "33333333-3333-4333-8333-333333333333";
const M1 = "a1111111-1111-4111-8111-111111111111";
const M2 = "a2222222-2222-4222-8222-222222222222";
const EX = "e1111111-1111-4111-8111-111111111111";
const EX2 = "e2222222-2222-4222-8222-222222222222";
const PASTA = "b1111111-1111-4111-8111-111111111111";

type Fn = (...a: unknown[]) => unknown;
const h = vi.hoisted(() => ({
  eu: "33333333-3333-4333-8333-333333333333",
  master: false,
  banco: {} as Record<string, unknown>,
  corpos: [] as Array<{ nome: string; corpo: Record<string, unknown> }>,
  storage: [] as unknown[][],
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { invocarTreinosPeloModulo } = await import("@/test/treinosFalso");
  const banco = {
    rpc: (...a: unknown[]) => (h.banco.rpc as Fn | undefined)?.(...a),
    from: (t: string) => (h.banco.from as Fn | undefined)?.(t),
    storage: { from: (b: string) => (h.banco.storage as Fn | undefined)?.(b) },
  };
  return {
    DB_SCHEMA: "staging",
    supabase: {
      functions: {
        invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
          h.corpos.push({ nome, corpo: o.body });
          return nome === "treinos" ? invocarTreinosPeloModulo(banco, { userId: h.eu, master: h.master })(o.body) : { data: null, error: { name: "FunctionsHttpError" } };
        },
      },
      storage: {
        from: (bucket: string) => ({
          uploadToSignedUrl: async (caminho: string, token: string, arquivo: unknown, opcoes: unknown) => {
            h.storage.push(["put", bucket, caminho, token, opcoes]);
            return (h.banco.put as Fn | undefined)?.() ?? { data: { path: caminho }, error: null };
          },
          getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://api.physiqcalc.com.br/storage/v1/object/public/${bucket}/${caminho}` } }),
        }),
      },
      from: (t: string) => (h.banco.from as Fn | undefined)?.(t),
      rpc: (...a: unknown[]) => (h.banco.rpc as Fn | undefined)?.(...a),
    },
  };
});

vi.mock("@/integrations/principal/client", async () => {
  const { invocarContaPeloModulo } = await import("@/test/contaFalsa");
  const conta = invocarContaPeloModulo({ rpc: (...a: unknown[]) => (h.banco.rpcPrincipal as Fn | undefined)?.(...a) }, { userId: "u-teste" });
  return {
    PRINCIPAL_SCHEMA: "staging",
    principal: {
      auth: { getSession: async () => ({ data: { session: null } }) },
      functions: {
        invoke: async (nome: string, o: { body: Record<string, unknown> }) => {
          h.corpos.push({ nome, corpo: o.body });
          return nome === "conta" ? conta(o.body) : { data: null, error: { name: "FunctionsHttpError" } };
        },
      },
    },
  };
});

import * as painel from "@/painel/treinos/api";
import { ErroTreinoPainel, acharAlunoNoTreino, exerciciosDaLista } from "@/treino/editor/api";
import { ativarTreinoPronto, bibliotecaGlobal, listarTreinosProntos, salvarTreinoPronto, treinoNovo, type TreinoPronto } from "@/master/app/treinosProntos";
import { buscarTreinosProntos } from "@/app-aluno/sozinho/api";

/** O corpo que a tela mandou PASSA nas regras reais do servidor: a ação conhecida e NENHUMA chave fora da lista (nem dono). */
function passaNoServidor(corpo: Record<string, unknown>) {
  const pedido = moduloDoPedido(corpo);
  expect(pedido, JSON.stringify(corpo)).not.toBeNull();
  if (pedido!.modulo === "leitura") {
    // cada item: a consulta do catálogo (ou a especial) com params na forma e NENHUMA chave fora da lista
    for (const item of (corpo.itens as Array<Record<string, unknown>>) ?? []) {
      if (item.q === "exercicios_lista") {
        expect(lerExerciciosLista(item), JSON.stringify(item)).toMatchObject({ ok: true });
        expect(Object.keys(item).filter((k) => !["q", "filtros", "offset", "limite"].includes(k))).toEqual([]);
        continue;
      }
      const r = lerPedidoDeLeitura({ itens: [item] }, CATALOGO_TREINOS.consultas as CatalogoLeitura);
      expect(r.ok === true && r.itens[0].ok, JSON.stringify(item)).toBe(true);
      const declarados = Object.keys((CATALOGO_TREINOS.consultas as Record<string, { params: object }>)[String(item.q)].params);
      expect(Object.keys(item).filter((k) => k !== "q" && !declarados.includes(k)), String(item.q)).toEqual([]);
    }
    return;
  }
  const acao = pedido!.acao as AcaoTreinos;
  if (acao === "treino_pronto_salvar") {
    expect(lerTreinoPronto(corpo), acao).toMatchObject({ ok: true });
    expect(Object.keys(corpo).sort()).toEqual(["acao", "divisoes", "id", "treino"]);
    return;
  }
  expect(lerCorpoDaAcao(acao, corpo), acao).toMatchObject({ ok: true });
  const declarados = Object.keys(CORPOS_DAS_ACOES[acao]);
  expect(Object.keys(corpo).filter((k) => k !== "acao" && !declarados.includes(k)), acao).toEqual([]);
  for (const dono of ["professor_id", "user_id", "dono", "criado_por"]) expect(Object.keys(corpo), `${acao}.${dono}`).not.toContain(dono);
}
const daTreinos = () => h.corpos.filter((c) => c.nome === "treinos").map((c) => c.corpo);
const todosPassam = () => {
  for (const c of daTreinos()) passaNoServidor(c);
};

/** Uma tabela do banco falso: grava as idas e devolve a linha (o insert com o id novo; o update/delete com 1 linha mudada). */
function tabela(gravadas: unknown[][], resposta?: (tipo: string) => { data: unknown; error: unknown }) {
  const cadeia = (tipo: string, registro: unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "is", "or", "order", "limit", "range"]) c[op] = (...a: unknown[]) => (registro.push([op, ...a]), c);
    c.then = (ok: Fn, falha?: Fn) => Promise.resolve(resposta ? resposta(tipo) : { data: tipo === "insert" ? [{ id: M1 }] : [{ id: "x" }], error: null }).then(ok as never, falha as never);
    return c;
  };
  return {
    select: (...a: unknown[]) => cadeia("select", ((r) => (gravadas.push(r), r))(["select", ...a])),
    insert: (v: unknown) => cadeia("insert", ((r) => (gravadas.push(r), r))(["insert", v])),
    update: (v: unknown) => cadeia("update", ((r) => (gravadas.push(r), r))(["update", v])),
    delete: () => cadeia("delete", ((r) => (gravadas.push(r), r))(["delete"])),
  };
}

beforeEach(() => {
  h.banco = {};
  h.corpos = [];
  h.storage = [];
  h.master = false;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("hml-21d — F3a: as gravações do Painel › Treinos pela treinos (src/painel/treinos/api.ts)", () => {
  it("modelos e pastas: a ação certa, o corpo nas regras do servidor; o dono = o do token (o personal para si; o master no global)", async () => {
    const idas: Record<string, unknown[][]> = {};
    h.banco.from = (t: string) => tabela((idas[t] ??= []));
    expect(await painel.criarModelo("Treino A", EU)).toBe(M1);
    await painel.renomearModelo(M1, "Treino B");
    await painel.excluirModelo(M1);
    expect(await painel.criarPasta("Pasta", EU)).toBe(M1);
    await painel.renomearPasta(PASTA, "Pasta 2");
    await painel.excluirPasta(PASTA);
    expect(daTreinos().map((c) => c.acao)).toEqual(["modelo_criar", "modelo_editar", "modelo_excluir", "pasta_criar", "pasta_editar", "pasta_excluir"]);
    todosPassam();
    // as idas ao banco = as de hoje (o insert com o dono, o update do nome e o delete pelo id), feitas pelo servidor
    expect(idas.tb_grupos_treino.filter((x) => ["insert", "update", "delete"].includes(x[0] as string)).map((x) => x.slice(0, 2))).toEqual([
      ["insert", { nome: "Treino A", professor_id: EU }], ["update", { nome: "Treino B" }], ["delete", ["eq", "id", M1]],
    ]);
    h.master = true;
    await painel.criarModelo("Global", null);
    expect(idas.tb_grupos_treino.filter((x) => x[0] === "insert").at(-1)?.slice(0, 2)).toEqual(["insert", { nome: "Global", professor_id: null }]);
  });

  it("os exercícios do modelo: incluir, tirar, prescrever (só as colunas mexidas; o null limpa) e a ORDEM numa ação (a RPC atômica)", async () => {
    const idas: unknown[][] = [];
    h.banco.from = () => tabela(idas);
    const rpcs: unknown[][] = [];
    h.banco.rpc = (nome: unknown, args: unknown) => (rpcs.push([nome, args]), { data: 2, error: null });
    await painel.adicionarAoModelo(M1, EX, 4);
    await painel.tirarDoModelo(M1, EX);
    await painel.prescreverModelo(M1, EX, { num_series: 4, reps_alvo: null, carga_sugerida_kg: 12.5 });
    await painel.ordenarModelo(M1, [EX2, EX]);
    expect(daTreinos()).toEqual([
      { grupo: M1, exercicio: EX, ordem: 4, acao: "modelo_exercicio_incluir" },
      { grupo: M1, exercicio: EX, acao: "modelo_exercicio_tirar" },
      { num_series: 4, reps_alvo: null, carga_sugerida_kg: 12.5, grupo: M1, exercicio: EX, acao: "modelo_exercicio_prescrever" },
      { grupo: M1, ids: [EX2, EX], acao: "modelo_ordenar" },
    ]);
    todosPassam();
    expect(idas.filter((x) => ["insert", "update", "delete"].includes(x[0] as string))).toEqual([
      ["insert", { grupo_id: M1, exercicio_id: EX, ordem: 4 }, ["select", "id"]],
      ["delete", ["eq", "grupo_id", M1], ["eq", "exercicio_id", EX], ["select", "id"]],
      ["update", { num_series: 4, reps_alvo: null, carga_sugerida_kg: 12.5 }, ["eq", "grupo_id", M1], ["eq", "exercicio_id", EX], ["select", "id"]],
    ]);
    // a ordem: 1 RPC (hoje: 1 update por exercício, em série)
    expect(rpcs).toEqual([["modelo_ordenar", { p_grupo: M1, p_ids: [EX2, EX] }]]);
  });

  it("pôr/tirar da pasta: o par; já estava (o servidor responde ok) e já não está ao tirar (nao_encontrado) = o fim de hoje, sem erro", async () => {
    let resposta: { data: unknown; error: unknown } = { data: null, error: { code: "23505", message: "duplicate" } };
    h.banco.from = () => tabela([], () => resposta);
    await painel.colocarNaPasta(PASTA, M1, true);
    resposta = { data: [], error: null };
    await painel.colocarNaPasta(PASTA, M1, false);
    expect(daTreinos().map((c) => [c.acao, c.pasta, c.grupo])).toEqual([["pasta_vincular", PASTA, M1], ["pasta_desvincular", PASTA, M1]]);
    todosPassam();
    // tirar de uma pasta que o RLS esconde ao editar o nome: o nao_encontrado vira o erro da tela (a frase fixa)
    await expect(painel.renomearPasta(PASTA, "x")).rejects.toMatchObject({ codigo: "nao_encontrado" });
  });

  it("a biblioteca: criar (o emoji e o dono no servidor), editar (as colunas + a foto que já estava), excluir; os grupos musculares → { linha }", async () => {
    const idas: unknown[][] = [];
    h.banco.from = (t: string) => tabela(idas, (tipo) => (t === "grupos_musculares" && tipo === "insert" ? { data: [{ id: "g1", nome: "Trapézio", professor_id: EU }], error: null } : tipo === "insert" ? { data: [{ id: EX }], error: null } : tipo === "select" ? { data: [{ imagem_url: "https://x/atual.gif" }], error: null } : { data: [{ id: EX }], error: null }));
    const dados = { nome: "Rosca", grupo_muscular: "Bíceps", tipo: "musculacao" as const, subgrupo: null, dica: null, padrao_movimento: "rosca_direta", equipamento: null, variacao: null };
    expect(await painel.criarExercicio(dados, EU)).toBe(EX);
    await painel.salvarExercicio(EX, { ...dados, imagem_url: "https://x/atual.gif" });
    await painel.salvarExercicio(EX, { ...dados, imagem_url: undefined });
    await painel.excluirExercicio(EX);
    expect(await painel.criarMusculo("Trapézio", EU)).toEqual({ id: "g1", nome: "Trapézio", professor_id: EU });
    await painel.excluirMusculo(PASTA);
    expect(daTreinos().map((c) => c.acao)).toEqual(["exercicio_criar", "exercicio_editar", "exercicio_editar", "exercicio_excluir", "grupo_muscular_criar", "grupo_muscular_excluir"]);
    todosPassam();
    expect(idas.filter((x) => x[0] === "insert").map((x) => x.slice(0, 2))).toEqual([["insert", { ...dados, emoji: "🏋️", professor_id: EU }], ["insert", { nome: "Trapézio", professor_id: EU }]]);
    expect(idas.filter((x) => x[0] === "update").map((x) => x.slice(0, 2))).toEqual([["update", { ...dados, imagem_url: "https://x/atual.gif" }], ["update", dados]]);
  });

  it("a foto: o servidor assina o caminho <id>.<ext> (o de hoje) no bucket do schema; o PUT no link; a URL pública com o ?v=; os erros da tela", async () => {
    const assinados: unknown[][] = [];
    h.banco.storage = (bucket: string) => ({ createSignedUploadUrl: (c: string, o: unknown) => (assinados.push([bucket, c, o]), { data: { token: "tok-1" }, error: null }) });
    const arquivo = new File(["gif"], "Foto Nova.GIF", { type: "image/gif" });
    const url = await painel.subirImagem(arquivo, EX);
    expect(assinados).toEqual([["exercicios-staging", `${EX}.gif`, { upsert: true }]]);
    expect(h.storage).toEqual([["put", "exercicios-staging", `${EX}.gif`, "tok-1", { upsert: true, contentType: "image/gif", cacheControl: "31536000" }]]);
    expect(url).toMatch(new RegExp(`^https://api\\.physiqcalc\\.com\\.br/storage/v1/object/public/exercicios-staging/${EX}\\.gif\\?v=\\d+$`));
    expect(daTreinos()).toEqual([{ exercicio: EX, tipo: "image/gif", tamanho: 3, acao: "exercicio_foto_preparar" }]);
    todosPassam();
    // a URL nova passa no editar (a do exercício neste bucket — o servidor confere o host, o caminho e o arquivo)
    h.banco.from = () => tabela([], (tipo) => (tipo === "select" ? { data: [{ imagem_url: null }], error: null } : { data: [{ id: EX }], error: null }));
    await painel.salvarExercicio(EX, { imagem_url: url });
    // os erros: o tipo que o bucket não aceita → imagem_invalida; o Storage fora → upload_falhou; o PUT que falha → upload_falhou
    await expect(painel.subirImagem(new File(["x"], "a.svg", { type: "image/svg+xml" }), EX)).rejects.toMatchObject({ codigo: "imagem_invalida" });
    h.banco.storage = () => ({ createSignedUploadUrl: () => ({ data: null, error: { status: 500 } }) });
    await expect(painel.subirImagem(arquivo, EX)).rejects.toMatchObject({ codigo: "upload_falhou" });
    h.banco.storage = () => ({ createSignedUploadUrl: () => ({ data: null, error: { status: 400, statusCode: "403", message: "new row violates row-level security policy" } }) });
    await expect(painel.subirImagem(arquivo, EX)).rejects.toMatchObject({ codigo: "sem_permissao" });
    h.banco.storage = undefined as never;
    h.banco.put = () => ({ data: null, error: { message: "o bucket recusou" } });
    await expect(painel.subirImagem(arquivo, EX)).rejects.toMatchObject({ codigo: "upload_falhou" });
  });

  it("o erro no código da tela de hoje: conflito → repetido, em_uso → em_uso, sem_acesso → sem_permissao; sem internet → sem_internet sem chamar", async () => {
    for (const [code, esperado] of [["23505", "repetido"], ["23503", "em_uso"], ["42501", "sem_permissao"], ["XX000", "erro_interno"]] as const) {
      h.banco.from = () => tabela([], () => ({ data: null, error: { code, message: "mensagem crua do banco" } }));
      const e = await painel.excluirExercicio(EX).catch((x: unknown) => x);
      expect(e, code).toBeInstanceOf(ErroTreinoPainel);
      expect((e as ErroTreinoPainel).codigo, code).toBe(esperado);
      expect(String((e as Error).message)).not.toContain("crua");
    }
    h.corpos = [];
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(painel.criarModelo("x", EU)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.corpos).toEqual([]);
  });
});

describe("hml-21d — F3a: os treinos prontos do Master (src/master/app/treinosProntos.ts) e o espelho do Perfil", () => {
  const treino = (): TreinoPronto => ({
    ...treinoNovo(), id: M1, codigo: "c1", nome: " Treino ", divisao: "", descricao: "  ", ordem: 3,
    grupos: [
      { letra: "A", nome: " Treino A ", dias: ["SEG", "QUI"], exercicios: [{ exercicio_id: EX, nome: "Supino", series: 3, reps: " 12 ", descanso_segundos: 60, observacao: "  " }] },
      { letra: "B", nome: "Treino B", dias: ["TER"], exercicios: [{ exercicio_id: EX2, series: 4, reps: "8-12", descanso_segundos: null, observacao: " lento " }] },
    ],
  });
  it("salvar: 1 ação (a RPC atômica) com a MESMA linha de hoje (os padrões) e as divisões na ordem (o trim de hoje) → o id", async () => {
    h.master = true;
    const rpcs: unknown[][] = [];
    h.banco.rpc = (nome: unknown, args: unknown) => (rpcs.push([nome, args]), { data: M1, error: null });
    expect(await salvarTreinoPronto(treino())).toBe(M1);
    expect(daTreinos()).toHaveLength(1);
    todosPassam();
    expect(rpcs).toEqual([["treino_pronto_salvar", {
      p_id: M1,
      p_treino: { codigo: "c1", nome: "Treino", objetivo: "manter", nivel: "iniciante", dias_por_semana: 3, divisao: "A · B", descricao: null, ordem: 3, ativo: true },
      p_divisoes: [
        { letra: "A", nome: "Treino A", dias: ["SEG", "QUI"], exercicios: [{ exercicio_id: EX, series: 3, reps: "12", descanso_segundos: 60, observacao: null }] },
        { letra: "B", nome: "Treino B", dias: ["TER"], exercicios: [{ exercicio_id: EX2, series: 4, reps: "8-12", descanso_segundos: null, observacao: "lento" }] },
      ],
    }]]);
    // o novo: sem id (o servidor cria) e o código "master-…" de hoje
    rpcs.length = 0;
    await salvarTreinoPronto({ ...treino(), id: null, codigo: "" });
    expect((rpcs[0][1] as { p_id: unknown; p_treino: { codigo: string } }).p_id).toBeNull();
    expect((rpcs[0][1] as { p_treino: { codigo: string } }).p_treino.codigo).toMatch(/^master-[a-z0-9]+$/);
  });
  it("salvar que falha: a frase fixa do código na mensagem (a crua do banco não chega à tela); o ativo pelo id", async () => {
    h.master = true;
    h.banco.rpc = () => ({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } });
    const e = (await salvarTreinoPronto(treino()).catch((x: unknown) => x)) as Error;
    expect(e.message).not.toContain("duplicate");
    expect(e.message.length).toBeGreaterThan(5);
    const idas: unknown[][] = [];
    h.banco.from = () => tabela(idas);
    await ativarTreinoPronto(M1, false);
    expect(daTreinos().at(-1)).toEqual({ id: M1, ativo: false, acao: "treino_pronto_ativo" });
    expect(idas.filter((x) => x[0] === "update")).toEqual([["update", { ativo: false }, ["eq", "id", M1], ["select", "id"]]]);
  });
  it("o espelho do Perfil: professor_perfil com o nome ou a foto (só a linha do sub, no servidor) — nunca mais o update direto", () => {
    const fonte = readFileSync(resolve(__dirname, "../painel/configuracoes/Perfil.tsx"), "utf-8");
    const espelho = fonte.slice(fonte.indexOf("async function espelharNoTreino"), fonte.indexOf("export default function Perfil"));
    expect(espelho).toContain('await acaoTreinos("professor_perfil", campos);');
    expect(espelho).not.toMatch(/\.from\(|supabase/);
    for (const campos of [{ nome: "Lucas" }, { foto_url: "https://api-principal.physiqcalc.com.br/storage/v1/object/public/fotos-perfil/u/foto-1.jpg" }, { foto_url: null }]) {
      passaNoServidor({ ...campos, acao: "professor_perfil" });
    }
  });
});

// ───────────────────────── parte 2 (F3b): as leituras ─────────────────────────
/** Uma tabela do banco falso só de leitura: devolve as linhas da tabela e anota a cadeia (o servidor monta). */
function leitura(linhas: Record<string, unknown[]>, idas: Array<[string, unknown[]]> = []) {
  return (t: string) => {
    const registro: unknown[] = [];
    idas.push([t, registro]);
    const c: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "is", "or", "order", "limit", "range", "ilike"]) c[op] = (...a: unknown[]) => (registro.push([op, ...a]), c);
    c.then = (ok: Fn, falha?: Fn) => Promise.resolve({ data: linhas[t] ?? [], error: null }).then(ok as never, falha as never);
    return c;
  };
}
const itensDaTreinos = () => daTreinos().filter((c) => c.acao === "ler").map((c) => (c.itens as Array<{ q: string }>).map((i) => i.q));

describe("hml-21d — F3b: as leituras do Painel › Treinos pela treinos (o MESMO tipo, a MESMA ordem)", () => {
  const ex = (id: string, professor_id: string | null) => ({
    id, nome: `Ex ${id}`, grupo_muscular: "Peito", emoji: null, tipo: "musculacao", imagem_url: null, subgrupo: null, dica: null, professor_id,
    padrao_movimento: null, equipamento: null, variacao: null,
  });
  // hml-21d (perf — a mitigação da spec §2.6 e do risco 5, decisão da sessão principal 15:06): a contagem com GIF vai SOZINHA, em paralelo —
  // a página não espera por ela (antes: no MESMO lote da página, que só voltava com o item mais lento)
  it("Meus treinos: a página (modelos_da_lista) + as pastas na MESMA ida; a contagem com GIF sozinha, em paralelo; os detalhes depois (dependem dos ids) — 3 idas", async () => {
    const valor = { ok: true, total: 2, total_geral: 5, por_pasta: { [PASTA]: 1 }, itens: [{ id: M1, nome: "A", professor_id: EU }] };
    const linhaA = (id: string, ordem: number, exercicio: unknown, ex_id: string) => ({
      id, grupo_id: M1, exercicio_id: ex_id, ordem, num_series: 3, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null, exercicio,
    });
    h.banco.rpc = (nome: unknown) => ({ data: nome === "modelos_da_lista" ? valor : { ok: true, itens: [], com_gif: 9, total: 0 }, error: null });
    h.banco.from = leitura({
      tb_pastas_treino: [{ id: PASTA, nome: "P", professor_id: EU }],
      // as linhas fora da ordem (o servidor não ordena o embutido): a lib devolve por (ordem, id), como o .order("ordem").order("id") de hoje
      tb_grupos_treino: [{ id: M1, linhas: [linhaA("l2", 1, ex(EX2, null), EX2), linhaA("l3", 0, null, EX), linhaA("l1", 0, ex(EX, EU), EX)], vinculos: [{ id: "v2", pasta_id: PASTA, grupo_id: M1 }] }],
    });
    const [pagina, pastas, resumo] = await Promise.all([
      painel.carregarPaginaDeModelos(EU, { q: " supino ", pasta: PASTA }, 2), painel.carregarPastas(EU), painel.listarExercicios({ escopo: "visiveis" }, 1, 1),
    ]);
    const idas = itensDaTreinos();
    expect(idas).toHaveLength(3);
    expect(idas.slice(0, 2)).toEqual(expect.arrayContaining([["exercicios_lista"], ["modelos", "pastas"]]));
    expect(idas[2]).toEqual(["modelos_detalhes"]);
    todosPassam();
    const daPagina = daTreinos().find((c) => (c.itens as Array<{ q?: unknown }>).some((i) => i.q === "modelos"));
    expect(daPagina?.itens).toContainEqual({ q: "modelos", filtros: { q: "supino", pasta: PASTA }, offset: 20, limite: 20 });
    expect(daTreinos().find((c) => (c.itens as Array<{ q?: unknown }>).some((i) => i.q === "exercicios_lista"))?.itens).toEqual([
      { q: "exercicios_lista", filtros: { escopo: "visiveis" }, offset: 0, limite: 1 },
    ]);
    expect(pastas).toEqual([{ id: PASTA, nome: "P", professor_id: EU }]);
    expect(resumo.comGif).toBe(9);
    expect(pagina).toEqual({
      itens: valor.itens, total: 2, totalGeral: 5, porPasta: { [PASTA]: 1 },
      detalhes: {
        linhas: [
          { grupo_id: M1, exercicio_id: EX, ordem: 0, num_series: 3, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null },
          { grupo_id: M1, exercicio_id: EX, ordem: 0, num_series: 3, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null },
          { grupo_id: M1, exercicio_id: EX2, ordem: 1, num_series: 3, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null },
        ],
        exercicios: [ex(EX, EU), ex(EX2, null)],
        vinculos: [{ pasta_id: PASTA, grupo_id: M1 }],
      },
    });
  });

  it("o treino por id: a linha e os detalhes na MESMA ida; outro (nenhuma linha) → null, como antes; id que não é uuid → nem vai", async () => {
    h.banco.from = leitura({ tb_grupos_treino: [{ id: M1, nome: "A", professor_id: null, linhas: [], vinculos: [] }] });
    expect(await painel.carregarModeloPorId(EU, M1)).toEqual({ modelo: { id: M1, nome: "A", professor_id: null }, detalhes: { linhas: [], exercicios: [], vinculos: [] } });
    h.banco.from = leitura({});
    expect(await painel.carregarModeloPorId(EU, M2)).toEqual({ modelo: null, detalhes: { linhas: [], exercicios: [], vinculos: [] } });
    h.corpos = [];
    expect(await painel.carregarModeloPorId(EU, "x")).toEqual({ modelo: null, detalhes: { linhas: [], exercicios: [], vinculos: [] } });
    expect(h.corpos).toEqual([]);
    // a página vazia: nenhum detalhe a pedir (a 2ª ida nem sai)
    h.banco.rpc = () => ({ data: { ok: true, total: 0, total_geral: 0, por_pasta: {}, itens: [] }, error: null });
    h.corpos = [];
    expect(await painel.carregarPaginaDeModelos(EU, { q: "", pasta: null }, 1).then((p) => p.detalhes)).toEqual({ linhas: [], exercicios: [], vinculos: [] });
    expect(itensDaTreinos()).toEqual([["modelos"]]);
  });

  it("o catálogo dos Modelos: os modelos com as linhas e as pastas com os vínculos na MESMA ida; sem os exercícios e os grupos (vazios)", async () => {
    h.banco.from = leitura({
      tb_grupos_treino: [{ id: M1, nome: "A", professor_id: EU, linhas: [{ id: "l1", grupo_id: M1, exercicio_id: EX, ordem: 0, num_series: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null }] }],
      tb_pastas_treino: [{ id: PASTA, nome: "P", professor_id: null, vinculos: [{ id: "v1", pasta_id: PASTA, grupo_id: M1 }] }],
    });
    const c = await painel.carregarCatalogo(EU);
    expect(itensDaTreinos()).toEqual([["catalogo_modelos", "catalogo_pastas"]]);
    todosPassam();
    expect(c).toEqual({
      modelos: [{ id: M1, nome: "A", professor_id: EU }], pastas: [{ id: PASTA, nome: "P", professor_id: null }], vinculos: [{ pasta_id: PASTA, grupo_id: M1 }],
      linhas: [{ grupo_id: M1, exercicio_id: EX, ordem: 0, num_series: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null }], exercicios: [], musculos: [],
    });
  });

  it("os grupos musculares; o erro do servidor vira o código da tela (sem_acesso → sem_permissao; a lista grande → lista_grande_demais)", async () => {
    h.banco.from = leitura({ grupos_musculares: [{ id: "g1", nome: "Peito", professor_id: null }] });
    expect(await painel.carregarMusculos(EU)).toEqual([{ id: "g1", nome: "Peito", professor_id: null }]);
    todosPassam();
    h.banco.from = () => ({ select: () => ({ or: () => ({ order: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { code: "42501", message: "permission denied" } }) }) }) }) }) });
    await expect(painel.carregarPastas(EU)).rejects.toMatchObject({ codigo: "sem_permissao" });
  });
});

describe("hml-21d — F3b: o editor, o Master e o app do aluno", () => {
  it("a folha da biblioteca do editor: exercicios_lista com o MESMO p_filtros (só os com valor), o offset e o limite → a página e as contagens", async () => {
    const rpcs: unknown[][] = [];
    h.banco.rpc = (nome: unknown, args: unknown) => (rpcs.push([nome, args]), { data: { ok: true, itens: [{ id: EX }], total: 41, total_global: 30, total_meu: 3, total_professores: 0, com_gif: 20, total_escopo: 33, sem_classificacao: 2 }, error: null });
    const r = await exerciciosDaLista({ professor: EU, q: "rosca", codigos: ["rosca_direta"], musculos: ["biceps"], fora: [], escopo: undefined }, 3, 12);
    expect(rpcs).toEqual([["exercicios_da_lista", { p_filtros: { professor: EU, q: "rosca", codigos: ["rosca_direta"], musculos: ["biceps"] }, p_offset: 24, p_limite: 12 }]]);
    todosPassam();
    expect(r).toEqual({ itens: [{ id: EX }], total: 41, totalGlobal: 30, totalMeu: 3, totalProfessores: 0, comGif: 20, totalEscopo: 33, semClassificacao: 2 });
    h.banco.rpc = () => ({ data: null, error: { code: "XX000", message: "mensagem crua" } });
    const e = await exerciciosDaLista({}, 1).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroTreinoPainel);
    expect((e as ErroTreinoPainel).codigo).toBe("erro_interno");
  });

  it("o aluno do editor: a aluno_treino pela conta (o p_aluno do param); o raise da matrícula como o código; o treino_user_id de volta", async () => {
    const rpcs: unknown[][] = [];
    h.banco.rpcPrincipal = (nome: unknown, args: unknown) => (rpcs.push([nome, args]), { data: { ok: true, paciente_id: M1, user_id: null, treino_user_id: M2 }, error: null });
    expect(await acharAlunoNoTreino(M1, null, true)).toBe(M2);
    expect(rpcs).toEqual([["aluno_treino", { p_aluno: M1 }]]);
    expect(h.corpos.filter((c) => c.nome === "conta").map((c) => c.corpo)).toEqual([{ acao: "ler", itens: [{ aluno: M1, q: "aluno_treino" }] }]);
    h.banco.rpcPrincipal = () => ({ data: null, error: { code: "P0001", message: "sem_acesso" } });
    await expect(acharAlunoNoTreino(M1, null, true)).rejects.toMatchObject({ codigo: "sem_acesso" });
    // sem login no Treino ou com o treino_user_id já na matrícula: nem chama
    h.corpos = [];
    expect(await acharAlunoNoTreino(M1, M2, true)).toBe(M2);
    expect(await acharAlunoNoTreino(M1, null, false)).toBeNull();
    expect(h.corpos).toEqual([]);
  });

  it("o Master: todos os treinos prontos (as colunas de hoje; as divisões e os exercícios na ordem) e a biblioteca global COM página (sem o corte de 1000)", async () => {
    h.master = true;
    const linhaT = {
      id: M1, codigo: "c", nome: "T", objetivo: "manter", nivel: "iniciante", dias_por_semana: 1, divisao: "A", descricao: null, ordem: 1, ativo: false,
      grupos: [{ letra: "B", nome: "B", dias: ["TER"], ordem: 2, exercicios: [] }, { letra: "A", nome: "A", dias: ["SEG"], ordem: 1, exercicios: [{ exercicio_id: EX, ordem: 1, series: 3, reps: "12", descanso_segundos: null, observacao: null, exercicio: { nome: "Supino" } }] }],
    };
    let paginas = 0;
    const idas: Array<[string, unknown[]]> = [];
    h.banco.from = (t: string) => {
      if (t === "tb_exercicios") {
        paginas += 1;
        return leitura({ tb_exercicios: Array.from({ length: paginas === 1 ? 1000 : 2 }, (_, i) => ({ id: `${paginas}-${i}`, nome: "x", grupo_muscular: null })) }, idas)(t);
      }
      return leitura({ physiq_treinos_prontos: [linhaT] }, idas)(t);
    };
    const lista = await listarTreinosProntos();
    expect(lista[0].grupos.map((g) => g.letra)).toEqual(["A", "B"]);
    expect(lista[0].grupos[0].exercicios[0]).toEqual({ exercicio_id: EX, nome: "Supino", series: 3, reps: "12", descanso_segundos: null, observacao: null });
    const bib = await bibliotecaGlobal();
    expect(bib).toHaveLength(1002);
    expect(itensDaTreinos()).toEqual([["treinos_prontos_todos"], ["exercicios_globais"], ["exercicios_globais"]]);
    expect(daTreinos().slice(1).map((c) => (c.itens as Array<{ pagina: number }>)[0].pagina)).toEqual([1, 2]);
    todosPassam();
  });

  it("o aluno sem profissional: os treinos prontos ativos (a mesma ordem da tela); o erro → o guardado no aparelho ou o ErroApp de hoje", async () => {
    localStorage.clear();
    const t = { id: M1, codigo: "c", nome: "T", objetivo: "manter", nivel: "iniciante", dias_por_semana: 1, divisao: "A", descricao: null, ordem: 1, grupos: [{ id: "g1", letra: "A", nome: "A", dias: ["SEG"], ordem: 1, exercicios: [] }] };
    h.banco.from = leitura({ physiq_treinos_prontos: [t] });
    const lista = await buscarTreinosProntos();
    expect(lista.map((x) => x.id)).toEqual([M1]);
    expect(itensDaTreinos()).toEqual([["treinos_prontos"]]);
    todosPassam();
    // a API fora: o guardado da última vez (o de cima)
    h.banco.from = () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { code: "XX000", message: "fora" } }) }) }) }) });
    expect((await buscarTreinosProntos()).map((x) => x.id)).toEqual([M1]);
    localStorage.clear();
    await expect(buscarTreinosProntos()).rejects.toMatchObject({ codigo: "erro_interno" });
  });
});
