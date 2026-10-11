// Physiq hml-19d (H-41 · jeito 2) — o contrato entre as libs do FINANCEIRO (src/painel/financeiro/dados.ts, src/financeiro/lancamentos.ts e
// src/financeiro/recibos.ts) e o servidor: cada função de GRAVAÇÃO (as mesmas assinaturas de antes) chama a função financeiro com a ação
// certa, 1 chamada, nunca grava direto no banco (tabela, RPC ou Storage) e o corpo que ela manda PASSA nas regras REAIS do servidor
// (_shared/financeiro-gravar-regras.ts — as mesmas que rodam na borda); o dono e a Lixeira nunca vão no corpo. O que volta é o que a tela
// usa. As sementes: só quando a lista vem vazia, 1 chamada mesmo com as 2 listas abrindo juntas, com a conta. O recibo: o texto que o
// servidor grava (a marca trocada pelo número real) = o texto de hoje com o número certo (1, 4 e 5 dígitos). Meta-teste: toda outra função
// exportada das 3 libs é leitura ou regra pura. Os negativos: a frase fixa (o nome repetido segue com a de hoje), sem internet, rede, a
// semente que falha.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { funcao: string; acao: string; corpo: Record<string, unknown> };
const h = vi.hoisted(() => ({
  ordem: [] as Array<{ funcao: string; acao: string; corpo: Record<string, unknown> }>,
  invoke: vi.fn(),
  /** o que cada leitura de tabela devolve (a fila primeiro; vazia → a lista fixa) */
  fila: {} as Record<string, unknown[][]>,
  listas: {} as Record<string, unknown[]>,
  lidas: [] as string[],
}));
vi.mock("@/integrations/principal/client", () => {
  const leitura = (tabela: string) => {
    const cadeia: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "limit", "range", "or", "in", "not", "gte", "lte"]) cadeia[m] = () => cadeia;
    for (const m of ["insert", "update", "upsert", "delete"]) {
      cadeia[m] = () => {
        throw new Error(`gravação direta na tabela ${tabela}`);
      };
    }
    cadeia.then = (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => {
      h.lidas.push(tabela);
      const data = h.fila[tabela]?.length ? h.fila[tabela].shift() : (h.listas[tabela] ?? []);
      return Promise.resolve({ data, error: null }).then(ok, falha);
    };
    return cadeia;
  };
  return {
    PRINCIPAL_SCHEMA: "staging",
    principalConfigurado: true,
    principal: {
      functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
      from: (t: string) => leitura(t),
      rpc: (f: string) => {
        throw new Error(`RPC direta ${f}`);
      },
      storage: {
        from: () => {
          throw new Error("Storage direto");
        },
      },
    },
  };
});

import {
  MARCA_NUMERO_RECIBO, STATUS_DO_ERRO_FINANCEIRO, lerPadroes, lerReciboEmitir, lerReciboExcluir, lerTags, montarGravacaoFinanceiro, numeroDoRecibo,
} from "../../supabase-principal/functions/_shared/financeiro-gravar-regras";
import { normalizarConteudo } from "@/nutricao/editor/lib/orientacoesUtil";
import { formParaRegistro as movimentacaoParaRegistro, formVazio, ordenarCategorias } from "@/painel/financeiro/financeiroUtil";
import { CONTEUDO_MODELO_PADRAO_NUTRI, formInicial, formParaRegistro as reciboParaRegistro } from "@/painel/financeiro/recibosUtil";
import * as dados from "@/painel/financeiro/dados";
import { ErroGravacaoFinanceiro, MENSAGEM_ERRO_GRAVACAO_FINANCEIRO } from "./gravar";
import * as lancamentos from "./lancamentos";
import * as recibos from "./recibos";

const EU = "33333333-3333-4333-8333-333333333333";
const CONTA = "c0000000-0000-4000-8000-00000000000a";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const TX = "66666666-6666-4666-8666-666666666666";
const MODELO = "77777777-7777-4777-8777-777777777777";
const CAT = "55555555-5555-4555-8555-555555555555";
const LINHA = { id: ID, numero: 7 };

/** O que a padroes_garantir devolve (as listas vivas da pessoa, na ordem do banco — a tela reordena). */
const PADROES = {
  ok: true,
  criados: { categorias: 6, modelos: 1 },
  categorias: ["Outros", "Consulta", "Retorno", "Plano alimentar", "Material", "Aluguel"].map((nome, i) => ({ id: `cat-${i}`, nome, nutricionista_id: EU })),
  modelos: [{ id: MODELO, nutricionista_id: EU, titulo: "Recibo padrão", conteudo: recibos.CONTEUDO_MODELO_PADRAO, favorito: true }],
};

const REGISTRO_MOV = movimentacaoParaRegistro({
  ...formVazio(new Date("2026-10-11T12:00:00Z")), descricao: "  Consulta   de retorno ", valor: "1.234,56", categoriaId: CAT, pacienteId: P, observacao: " pago ",
});
const MODELO_COM_NUMERO = `Recibo nº *|NUMERO_RECIBO|*\n\n${recibos.CONTEUDO_MODELO_PADRAO}`;
const DADOS_TAGS = { nomePaciente: "Aluno Teste", cpf: "12345678909", valor: 180, data: "2026-10-11", numero: 8, nomeProfissional: "Personal Teste" };
const registroRecibo = (conteudo: string) =>
  reciboParaRegistro({ ...formInicial(null, MODELO, "Atendimento", new Date("2026-10-11T12:00:00Z")), valor: "180" }, recibos.aplicarTags(conteudo, DADOS_TAGS), "Atendimento");
const EMITIR = (conteudo = MODELO_COM_NUMERO) => ({
  uid: EU, contaId: CONTA, pacienteId: P, transacaoId: TX, conteudoModelo: conteudo, registro: registroRecibo(conteudo), dadosTags: DADOS_TAGS, numeroPrevisto: 8,
});

const chamadas = (): Chamada[] => h.ordem;

/** O corpo passa nas regras do servidor (o que a função aceita)? */
function aceitaNoServidor(c: Chamada): boolean {
  switch (c.acao) {
    case "padroes_garantir":
      return lerPadroes(c.corpo).ok === true;
    case "recibo_emitir":
      return lerReciboEmitir(c.corpo).ok === true;
    case "recibo_excluir":
      return lerReciboExcluir(c.corpo).ok === true;
    case "tags_salvar":
      return lerTags(c.corpo).ok === true;
    default: {
      const g = montarGravacaoFinanceiro(c.acao, c.corpo, EU);
      if (g.ok === false) throw new Error(`${c.acao}: o servidor recusaria (${g.erro} ${g.campo ?? ""})`);
      return true;
    }
  }
}

/** Cada função de gravação das 3 libs, com o que a tela passa, a ação esperada e o que a tela recebe de volta. */
const CASOS: Array<{ nome: string; acao: string; rodar: () => Promise<unknown>; volta?: unknown; corpo?: Record<string, unknown> }> = [
  {
    nome: "dados.criarTransacao", acao: "transacao_criar", rodar: () => dados.criarTransacao(EU, CONTA, REGISTRO_MOV), volta: LINHA,
    corpo: { ...REGISTRO_MOV, conta_id: CONTA },
  },
  { nome: "dados.atualizarTransacao", acao: "transacao_editar", rodar: () => dados.atualizarTransacao(ID, REGISTRO_MOV), volta: LINHA, corpo: { ...REGISTRO_MOV, id: ID } },
  { nome: "dados.marcarEstorno", acao: "transacao_estornar", rodar: () => dados.marcarEstorno(ID, true), volta: LINHA, corpo: { id: ID, estornada: true } },
  { nome: "dados.excluirTransacao", acao: "transacao_excluir", rodar: () => dados.excluirTransacao(ID), volta: undefined, corpo: { id: ID } },
  {
    nome: "dados.garantirCategorias", acao: "padroes_garantir", rodar: () => dados.garantirCategorias(EU, CONTA),
    volta: ordenarCategorias(PADROES.categorias), corpo: { conta_id: CONTA },
  },
  { nome: "dados.criarCategoria", acao: "categoria_criar", rodar: () => dados.criarCategoria(EU, CONTA, "  Cursos "), volta: LINHA, corpo: { conta_id: CONTA, nome: "Cursos" } },
  { nome: "dados.renomearCategoria", acao: "categoria_renomear", rodar: () => dados.renomearCategoria(ID, " Eventos "), volta: LINHA, corpo: { id: ID, nome: "Eventos" } },
  { nome: "dados.excluirCategoria", acao: "categoria_excluir", rodar: () => dados.excluirCategoria(ID), volta: undefined, corpo: { id: ID } },
  {
    nome: "dados.garantirModelosRecibo", acao: "padroes_garantir", rodar: () => dados.garantirModelosRecibo(EU, CONTA, CONTEUDO_MODELO_PADRAO_NUTRI),
    volta: PADROES.modelos, corpo: { conta_id: CONTA },
  },
  {
    nome: "dados.criarModeloRecibo", acao: "modelo_recibo_criar", rodar: () => dados.criarModeloRecibo(EU, CONTA, { titulo: " Simples ", conteudo: "Recebi *|VALOR_CONSULTA|*", favorito: false }),
    volta: LINHA, corpo: { conta_id: CONTA, titulo: "Simples", conteudo: "Recebi *|VALOR_CONSULTA|*", favorito: false },
  },
  {
    nome: "dados.atualizarModeloRecibo", acao: "modelo_recibo_editar", rodar: () => dados.atualizarModeloRecibo(ID, { favorito: true }), volta: LINHA,
    corpo: { id: ID, favorito: true },
  },
  { nome: "dados.excluirModeloRecibo", acao: "modelo_recibo_excluir", rodar: () => dados.excluirModeloRecibo(ID), volta: undefined, corpo: { id: ID } },
  { nome: "dados.emitirRecibo", acao: "recibo_emitir", rodar: () => dados.emitirRecibo(EMITIR()), volta: LINHA },
  { nome: "dados.excluirRecibo", acao: "recibo_excluir", rodar: () => dados.excluirRecibo(ID), volta: undefined, corpo: { id: ID } },
  {
    nome: "lancamentos.garantirCategorias", acao: "padroes_garantir", rodar: () => lancamentos.garantirCategorias(EU, CONTA),
    volta: PADROES.categorias.map(({ id, nome }) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), corpo: { conta_id: CONTA },
  },
  {
    nome: "lancamentos.criarLancamento", acao: "transacao_criar",
    rodar: () => lancamentos.criarLancamento({
      uid: EU, contaId: CONTA, pacienteId: P, tipo: "entrada", descricao: `  ${"x".repeat(170)}`, valor: 249, data: "2026-10-11", metodo: "pix", categoriaId: null,
      observacao: "   ",
    }),
    volta: undefined,
    corpo: { conta_id: CONTA, paciente_id: P, tipo: "entrada", descricao: "x".repeat(160), valor: 249, data: "2026-10-11", metodo: "pix", categoria_id: null, observacao: null },
  },
  { nome: "recibos.excluirRecibo", acao: "recibo_excluir", rodar: () => recibos.excluirRecibo(ID), volta: undefined, corpo: { id: ID } },
];

const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

beforeEach(() => {
  h.ordem.length = 0;
  h.lidas.length = 0;
  h.fila = {};
  h.listas = {};
  h.invoke.mockReset();
  h.invoke.mockImplementation(async (nome: string, o: { body: Record<string, unknown> }) => {
    const { acao, ...corpo } = o.body;
    h.ordem.push({ funcao: nome, acao: String(acao), corpo });
    return { data: acao === "padroes_garantir" ? PADROES : { ok: true, linha: LINHA }, error: null };
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("hml-19d — as libs do Financeiro gravam pela função financeiro (mesmas assinaturas)", () => {
  it("as 17 funções de gravação estão aqui; toda outra função exportada das 3 libs é leitura ou regra pura", () => {
    expect(CASOS).toHaveLength(17);
    const modulos = { dados, lancamentos, recibos };
    const LEITURA = /^(listar|totais|resumo|contar|ultimo|nome|recorte|pagina|rotulo|valor|formatar|aplicar|tem|inteiro|podeEmitir|ordenar|validar)/;
    const noContrato = new Set(CASOS.map((c) => c.nome));
    const semDecisao: string[] = [];
    for (const [modulo, exportados] of Object.entries(modulos)) {
      for (const [nome, valor] of Object.entries(exportados)) {
        if (typeof valor !== "function" || LEITURA.test(nome)) continue;
        if (!noContrato.has(`${modulo}.${nome}`)) semDecisao.push(`${modulo}.${nome}`);
      }
    }
    expect(semDecisao).toEqual([]);
    // o estornarLancamento (código morto) saiu
    expect("estornarLancamento" in lancamentos).toBe(false);
  });

  it.each(CASOS.map((c) => [c.nome, c] as const))("%s: a ação certa, 1 chamada, o corpo aceito pelo servidor, sem o dono", async (_n, c) => {
    const volta = await c.rodar();
    expect(chamadas().map((x) => `${x.funcao} › ${x.acao}`)).toEqual([`financeiro › ${c.acao}`]);
    for (const f of chamadas()) {
      expect(aceitaNoServidor(f), f.acao).toBe(true);
      // o dono e a Lixeira nunca vão no corpo (o servidor põe quem chama)
      expect(f.corpo, f.acao).not.toHaveProperty("nutricionista_id");
      expect(f.corpo, f.acao).not.toHaveProperty("deleted_at");
      if (c.corpo) expect(f.corpo).toEqual(c.corpo);
    }
    expect(volta).toEqual(c.volta);
  });
});

describe("hml-19d — as sementes do 1º acesso: só com a lista vazia, 1 chamada, com a conta", () => {
  it("lista com itens → nenhuma chamada (só a leitura de sempre)", async () => {
    h.listas.categorias_financeiras = [{ id: CAT, nome: "Consulta", nutricionista_id: EU }];
    h.listas.modelos_recibo = [{ id: MODELO, nutricionista_id: EU, titulo: "Meu", conteudo: "x", favorito: true }];
    expect(await dados.garantirCategorias(EU, CONTA)).toEqual(h.listas.categorias_financeiras);
    expect(await dados.garantirModelosRecibo(EU, CONTA, "x")).toEqual(h.listas.modelos_recibo);
    expect(await lancamentos.garantirCategorias(EU, CONTA)).toEqual(h.listas.categorias_financeiras);
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.lidas).toEqual(["categorias_financeiras", "modelos_recibo", "categorias_financeiras"]);
  });

  it("as 2 listas vazias abrindo juntas (categorias e modelos) → 1 chamada só (a mesma em voo); depois, a próxima abertura chama de novo", async () => {
    let soltar: () => void = () => {};
    h.invoke.mockImplementationOnce(async (nome: string, o: { body: Record<string, unknown> }) => {
      const { acao, ...corpo } = o.body;
      h.ordem.push({ funcao: nome, acao: String(acao), corpo });
      await new Promise<void>((r) => (soltar = r));
      return { data: PADROES, error: null };
    });
    const juntas = Promise.all([dados.garantirCategorias(EU, CONTA), dados.garantirModelosRecibo(EU, CONTA, "x"), lancamentos.garantirCategorias(EU, CONTA)]);
    await vi.waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1));
    soltar();
    const [cats, modelos, catsAluno] = await juntas;
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(cats.map((c) => c.nome)).toEqual(["Aluguel", "Consulta", "Material", "Outros", "Plano alimentar", "Retorno"]);
    expect(modelos).toEqual(PADROES.modelos);
    expect(catsAluno.map((c) => c.nome)).toEqual(["Aluguel", "Consulta", "Material", "Outros", "Plano alimentar", "Retorno"]);
    await dados.garantirCategorias(EU, CONTA);
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });

  it("o Financeiro do aluno: a semente leva a CONTA do aluno (antes, sem conta) e devolve { id, nome } na ordem da tela", async () => {
    const r = await lancamentos.garantirCategorias(EU, CONTA);
    expect(chamadas()).toEqual([{ funcao: "financeiro", acao: "padroes_garantir", corpo: { conta_id: CONTA } }]);
    expect(r.every((c) => Object.keys(c).sort().join() === "id,nome")).toBe(true);
  });

  it("a semente que falha: o painel relê (como antes, nunca derruba a lista); o aluno relê e, sem nada, o erro vai à tela; os modelos sobem o erro", async () => {
    h.invoke.mockResolvedValue(recusa(500, "erro_interno"));
    h.fila.categorias_financeiras = [[], [{ id: CAT, nome: "Consulta", nutricionista_id: EU }]];
    expect(await dados.garantirCategorias(EU, CONTA)).toEqual([{ id: CAT, nome: "Consulta", nutricionista_id: EU }]);
    h.fila.categorias_financeiras = [[], []];
    expect(await dados.garantirCategorias(EU, CONTA)).toEqual([]);
    h.fila.categorias_financeiras = [[], []];
    await expect(lancamentos.garantirCategorias(EU, CONTA)).rejects.toMatchObject({ codigo: "erro_interno", message: "Não deu certo agora. Tente de novo." });
    h.fila.categorias_financeiras = [[], [{ id: CAT, nome: "Consulta" }]];
    expect(await lancamentos.garantirCategorias(EU, CONTA)).toEqual([{ id: CAT, nome: "Consulta" }]);
    await expect(dados.garantirModelosRecibo(EU, CONTA, "x")).rejects.toBeInstanceOf(ErroGravacaoFinanceiro);
  });
});

describe("hml-19d — o recibo: o texto que o servidor grava é o de hoje com o número real (1 chamada no lugar de 2 a 3)", () => {
  /** O que a RPC faz com o texto: a marca vira o número formatado (a prova de que o SQL faz igual é a do Postgres local). */
  const noServidor = (texto: string, n: number) => texto.split(MARCA_NUMERO_RECIBO).join(numeroDoRecibo(n));

  it("modelo com a tag do número: vai a marca; com o número real (o previsto, 1, 4 e 5 dígitos) o texto = o que a tela montava com ele", async () => {
    await dados.emitirRecibo(EMITIR());
    const [c] = chamadas();
    expect(String(c.corpo.texto)).toContain(MARCA_NUMERO_RECIBO);
    for (const n of [8, 1, 9999, 12345]) {
      expect(noServidor(String(c.corpo.texto), n), String(n)).toBe(normalizarConteudo(recibos.aplicarTags(MODELO_COM_NUMERO, { ...DADOS_TAGS, numero: n })));
    }
    // o número previsto = o real (o caminho de quase sempre): o mesmo texto que a tela gravava hoje
    expect(noServidor(String(c.corpo.texto), 8)).toBe(EMITIR().registro.texto);
    expect(c.corpo).toEqual({
      conta_id: CONTA, paciente_id: P, transacao_id: TX, modelo_id: MODELO, valor: 180, data: "2026-10-11", descricao: "Atendimento", texto: c.corpo.texto,
    });
  });

  it("modelo sem a tag (os 2 padrão): o texto vai igual ao de hoje, sem marca", async () => {
    for (const conteudo of [recibos.CONTEUDO_MODELO_PADRAO, CONTEUDO_MODELO_PADRAO_NUTRI]) {
      h.ordem.length = 0;
      await dados.emitirRecibo(EMITIR(conteudo));
      expect(chamadas()[0].corpo.texto).toBe(EMITIR(conteudo).registro.texto);
      expect(String(chamadas()[0].corpo.texto)).not.toContain(MARCA_NUMERO_RECIBO);
    }
  });

  it("o caminho raro de hoje (número diferente do previsto) regravava sem o normalizarConteudo: nos modelos sem espaço sobrando dá o mesmo", () => {
    for (const conteudo of [recibos.CONTEUDO_MODELO_PADRAO, CONTEUDO_MODELO_PADRAO_NUTRI, MODELO_COM_NUMERO]) {
      const t = recibos.aplicarTags(conteudo, { ...DADOS_TAGS, numero: 12345 });
      expect(normalizarConteudo(t)).toBe(t);
    }
  });

  it("um texto que não veio do modelo (outro caminho) vai como está", async () => {
    const p = { ...EMITIR(), registro: { ...EMITIR().registro, texto: "Recibo escrito à mão nº 0008" } };
    await dados.emitirRecibo(p);
    expect(chamadas()[0].corpo.texto).toBe("Recibo escrito à mão nº 0008");
  });

  it("a prévia do número continua lendo o banco (ultimoNumeroRecibo) — sem chamar a função", async () => {
    h.listas.recibos = [{ numero: 41 }];
    expect(await dados.ultimoNumeroRecibo(EU)).toBe(41);
    expect(h.invoke).not.toHaveBeenCalled();
  });
});

describe("hml-19d — os erros: a frase fixa (o nome repetido segue com a de hoje), sem internet, rede", () => {
  it("categoria com o nome repetido → 'Já existe uma categoria com esse nome' (a frase de antes da tela)", async () => {
    h.invoke.mockResolvedValueOnce(recusa(409, "nome_repetido"));
    await expect(dados.criarCategoria(EU, CONTA, "Consulta")).rejects.toThrow(/^Já existe uma categoria com esse nome$/);
    h.invoke.mockResolvedValueOnce(recusa(409, "nome_repetido"));
    await expect(dados.renomearCategoria(ID, "Consulta")).rejects.toMatchObject({ codigo: "nome_repetido" });
  });

  it("0 linha / sem acesso / dado ruim → a frase fixa, nunca a mensagem crua do banco", async () => {
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(dados.excluirTransacao(ID)).rejects.toThrow("Não encontrado: o registro foi excluído ou não é seu.");
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(dados.emitirRecibo(EMITIR())).rejects.toThrow("Você não tem permissão para fazer isso.");
    h.invoke.mockResolvedValueOnce(recusa(400, "dados_invalidos"));
    await expect(dados.criarTransacao(EU, CONTA, REGISTRO_MOV)).rejects.toThrow("Confira os dados e tente de novo.");
    h.invoke.mockResolvedValueOnce({ data: { ok: false, erro: "tempo_esgotado" }, error: null });
    await expect(dados.marcarEstorno(ID, false)).rejects.toMatchObject({ codigo: "tempo_esgotado", message: "O servidor demorou para responder. Tente de novo." });
  });

  it("a rede caiu (FunctionsFetchError) → rede; resposta sem corpo → erro_interno", async () => {
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", message: "Failed to fetch" } });
    await expect(recibos.excluirRecibo(ID)).rejects.toMatchObject({ codigo: "rede" });
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsHttpError" } });
    await expect(dados.excluirRecibo(ID)).rejects.toMatchObject({ codigo: "erro_interno" });
  });

  it("sem internet: nenhuma chamada", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(dados.excluirCategoria(ID)).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(lancamentos.criarLancamento({ uid: EU, contaId: CONTA, pacienteId: P, tipo: "saida", descricao: "x", valor: 1, data: "2026-10-11", metodo: "pix", categoriaId: null, observacao: null }))
      .rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it("todo código do servidor (e os de antes do pedido) tem frase", () => {
    for (const c of [...Object.keys(STATUS_DO_ERRO_FINANCEIRO), "acao_invalida", "dados_invalidos", "schema_invalido", "sem_internet", "rede"]) {
      expect(MENSAGEM_ERRO_GRAVACAO_FINANCEIRO[c], c).toBeTruthy();
    }
    expect(new ErroGravacaoFinanceiro("qualquer").message).toBe("Não deu certo agora. Tente de novo.");
  });
});
