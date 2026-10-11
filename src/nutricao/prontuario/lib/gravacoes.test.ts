// Physiq hml-19a (H-41 · jeito 2) — o contrato entre as 10 libs do Prontuário e a função nutricao: cada função de GRAVAÇÃO (as mesmas
// assinaturas de antes) faz 1 chamada à nutricao com a ação certa, nunca grava direto no banco (tabela, RPC ou Storage fora do link
// assinado) e o corpo que ela manda PASSA nas regras do servidor (_shared/nutricao-regras.ts — as mesmas que rodam na borda). E o que
// volta é o que a tela usa (a linha, a lista, o lote, o registro do dia). Os negativos: o código vira a frase fixa (ou a frase própria
// de antes) e sem internet nada é chamado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn(), subir: vi.fn() }));
vi.mock("@/nutricao/editor/lib/banco", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    storage: { from: (bucket: string) => ({ uploadToSignedUrl: (...a: unknown[]) => h.subir(bucket, ...a) }) },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
  },
}));

import {
  ehUuid, lerPedidoDeAnexo, lerRegistroDeAnexo, lerRegistroGestacional, montarGravacao, secaoDoPadrao,
} from "../../../../supabase-principal/functions/_shared/nutricao-regras";
import * as anamneses from "./anamneses";
import * as anexos from "./anexos";
import * as anotacoes from "./anotacoes";
import * as avaliacao from "./avaliacaoIntegrada";
import * as consultas from "./consultas";
import * as documentos from "./documentos";
import * as exames from "./exames";
import * as farmaco from "./farmaco";
import * as gestacional from "./gestacional";
import * as questionarios from "./questionarios";
import type { Sintese, Fontes } from "./avaliacaoIntegradaUtil";
import type { Questionario } from "./questionarios";
import type { Interacao } from "./farmaco";
import type { ModeloAnamnese } from "./anamneses";

const EU = "33333333-3333-4333-8333-333333333333";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const LINHA = { id: ID, titulo: "x" };
const RESPOSTA = { ok: true, linha: LINHA, linhas: [LINHA], lista: [LINHA], registro: LINHA, criado: true, bucket: "anexos-staging",
  caminho: `${EU}/${P}/${ID}-laudo.pdf`, token: "tk" };

type Chamada = { acao: string; corpo: Record<string, unknown> };
const chamadas = (): Chamada[] => h.invoke.mock.calls.map(([nome, o]) => {
  expect(nome).toBe("nutricao");
  const { acao, ...corpo } = (o as { body: Record<string, unknown> }).body;
  return { acao: String(acao), corpo };
});

/** O corpo passa nas regras do servidor (o que a função aceita)? */
function aceitaNoServidor(c: Chamada): boolean {
  switch (c.acao) {
    case "padroes_garantir":
      return secaoDoPadrao(c.corpo.secao) !== null;
    case "anexo_preparar":
      return lerPedidoDeAnexo(c.corpo).ok === true;
    case "anexo_registrar":
      return lerRegistroDeAnexo(c.corpo, EU).ok === true;
    case "anexo_excluir":
      return ehUuid(c.corpo.id);
    case "registro_gestacional_salvar":
      return lerRegistroGestacional(c.corpo, EU).ok === true;
    default: {
      const g = montarGravacao(c.acao, c.corpo, EU);
      if (g.ok === false) throw new Error(`${c.acao}: o servidor recusaria (${g.erro} ${g.campo ?? ""})`);
      return true;
    }
  }
}

const FORM_GESTACAO = { dum: "2026-05-01", peso_pre: "60", altura: "165", gemelar: false, observacao: "", origemSugestao: null };
const FORM_REGISTRO = { data: "2026-10-11", peso: "63,5", pa_sistolica: "120", pa_diastolica: "80", observacao: "" };
const FORM_INTERACAO = { medicamento: "Metformina", sinonimos: "Glifage, Glucoformin", classe: "Biguanida", nutriente: "Vitamina B12", efeito: "reduz a absorção",
  gravidade: "moderada" as const, conduta: "monitorar B12", fonte: "" };
const FORM_MEDICAMENTO = { medicamento: "Metformina", interacaoId: null, dose: "850 mg", posologia: "2x/dia", inicio: "", observacao: "" };
const QUESTIONARIO = { titulo: "Q", descricao: "", perguntas: [{ id: "p1", texto: "Dorme bem?", tipo: "escala", opcoes: [], max: 4 }], faixas: [], favorito: false };
const ANAMNESE = { titulo: "Anamnese", data: "2026-10-11T13:00:00.000Z", conteudo: [{ pergunta: "Queixa", resposta: "cansaço" }], texto_livre: null };
const APLICACAO = { questionario_id: null, titulo: "Q", perguntas: [], faixas: [], respostas: { p1: 2 }, pontuacao: 2, faixa: "Baixa", nivel: "baixo" as const,
  data: "2026-10-11", observacao: "" };
const SINTESE = { anamnese: null, antropometria: null, exames: null, questionarios: [] } as unknown as Sintese;
const FONTES = { anamnese: null } as unknown as Fontes;

/** Cada função de gravação das 10 libs, com o que a tela passa, a ação esperada e o que a tela recebe de volta. */
const CASOS: Array<{ nome: string; acoes: string[]; rodar: () => Promise<unknown>; volta?: unknown }> = [
  { nome: "anamneses.garantirModelos", acoes: ["padroes_garantir"], rodar: () => anamneses.garantirModelos(EU), volta: [LINHA] },
  { nome: "anamneses.criarModelo", acoes: ["modelo_anamnese_criar"], rodar: () => anamneses.criarModelo(EU, { titulo: " M ", perguntas: ["a"], favorito: false }), volta: LINHA },
  { nome: "anamneses.duplicarModelo", acoes: ["modelo_anamnese_criar"], rodar: () => anamneses.duplicarModelo(EU, { titulo: "M", perguntas: ["a"] } as unknown as ModeloAnamnese), volta: LINHA },
  { nome: "anamneses.atualizarModelo", acoes: ["modelo_anamnese_editar"], rodar: () => anamneses.atualizarModelo(ID, { favorito: true }), volta: LINHA },
  { nome: "anamneses.excluirModelo", acoes: ["modelo_anamnese_excluir"], rodar: () => anamneses.excluirModelo(ID) },
  { nome: "anamneses.criarAnamnese", acoes: ["anamnese_criar"], rodar: () => anamneses.criarAnamnese(EU, P, null, ANAMNESE), volta: LINHA },
  { nome: "anamneses.atualizarAnamnese", acoes: ["anamnese_editar"], rodar: () => anamneses.atualizarAnamnese(ID, ANAMNESE), volta: LINHA },
  { nome: "anamneses.excluirAnamnese", acoes: ["anamnese_excluir"], rodar: () => anamneses.excluirAnamnese(ID) },
  { nome: "anexos.enviarAnexo", acoes: ["anexo_preparar", "anexo_registrar"], rodar: () => anexos.enviarAnexo(EU, P, new File(["oi"], "Laudo.PDF", { type: "application/pdf" }), " exame "), volta: LINHA },
  { nome: "anexos.atualizarDescricao", acoes: ["anexo_editar"], rodar: () => anexos.atualizarDescricao(ID, "  nova   descrição "), volta: LINHA },
  { nome: "anexos.excluirAnexo", acoes: ["anexo_excluir"], rodar: () => anexos.excluirAnexo({ id: ID, path: "qualquer/caminho" }) },
  { nome: "anotacoes.criarAnotacao", acoes: ["anotacao_criar"], rodar: () => anotacoes.criarAnotacao(EU, P, "personal", { data: "2026-07-16", hora: "10:30", texto: "Técnica boa.", visibilidade: "equipe" }) },
  { nome: "anotacoes.atualizarAnotacao", acoes: ["anotacao_editar"], rodar: () => anotacoes.atualizarAnotacao(ID, "nutricionista", { data: "2026-07-16", hora: "10:30", texto: "x", visibilidade: "nutricionistas" }) },
  { nome: "anotacoes.excluirAnotacao", acoes: ["anotacao_excluir"], rodar: () => anotacoes.excluirAnotacao(ID) },
  { nome: "avaliacao.criarAvaliacao", acoes: ["avaliacao_integrada_criar"], rodar: () => avaliacao.criarAvaliacao(EU, P, { titulo: "360", texto: "parecer", sintese: SINTESE, fontes: FONTES }), volta: LINHA },
  { nome: "avaliacao.atualizarAvaliacao", acoes: ["avaliacao_integrada_editar"], rodar: () => avaliacao.atualizarAvaliacao(ID, { titulo: "360", texto: "" }), volta: LINHA },
  { nome: "avaliacao.regerarSintese", acoes: ["avaliacao_integrada_regerar"], rodar: () => avaliacao.regerarSintese(ID, SINTESE, FONTES), volta: LINHA },
  { nome: "avaliacao.excluirAvaliacao", acoes: ["avaliacao_integrada_excluir"], rodar: () => avaliacao.excluirAvaliacao(ID) },
  { nome: "consultas.registrarConsulta", acoes: ["consulta_criar"], rodar: () => consultas.registrarConsulta(EU, P, { data: "2026-10-11", hora: "09:00", observacao: "" }), volta: LINHA },
  { nome: "consultas.atualizarConsulta", acoes: ["consulta_editar"], rodar: () => consultas.atualizarConsulta(ID, { data: "2026-10-11", hora: "09:00", observacao: "retorno" }), volta: LINHA },
  { nome: "consultas.excluirConsulta", acoes: ["consulta_excluir"], rodar: () => consultas.excluirConsulta(ID) },
  { nome: "documentos.garantirModelosDocumento", acoes: ["padroes_garantir"], rodar: () => documentos.garantirModelosDocumento(EU), volta: [LINHA] },
  { nome: "documentos.criarModeloDocumento", acoes: ["modelo_documento_criar"], rodar: () => documentos.criarModeloDocumento(EU, { tipo: "atestado", titulo: "A", conteudo: "c", favorito: false }), volta: LINHA },
  { nome: "documentos.atualizarModeloDocumento", acoes: ["modelo_documento_editar"], rodar: () => documentos.atualizarModeloDocumento(ID, { conteudo: "d" }), volta: LINHA },
  { nome: "documentos.excluirModeloDocumento", acoes: ["modelo_documento_excluir"], rodar: () => documentos.excluirModeloDocumento(ID) },
  { nome: "documentos.criarDocumento", acoes: ["documento_criar"], rodar: () => documentos.criarDocumento(EU, P, { tipo: "atestado", modelo_id: null, titulo: "A", texto: "t", dados: { dias_afastamento: 2 }, data: "2026-10-11" }), volta: LINHA },
  { nome: "documentos.atualizarTextoDocumento", acoes: ["documento_editar"], rodar: () => documentos.atualizarTextoDocumento(ID, "t2"), volta: LINHA },
  { nome: "documentos.excluirDocumento", acoes: ["documento_excluir"], rodar: () => documentos.excluirDocumento(ID) },
  { nome: "exames.garantirCatalogoExames", acoes: ["padroes_garantir"], rodar: () => exames.garantirCatalogoExames(EU), volta: [LINHA] },
  { nome: "exames.criarExameCatalogo", acoes: ["exame_catalogo_criar"], rodar: () => exames.criarExameCatalogo(EU, { nome: "TSH", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "", favorito: true }), volta: LINHA },
  { nome: "exames.atualizarExameCatalogo", acoes: ["exame_catalogo_editar"], rodar: () => exames.atualizarExameCatalogo(ID, { ref_max: null }), volta: LINHA },
  { nome: "exames.excluirExameCatalogo", acoes: ["exame_catalogo_excluir"], rodar: () => exames.excluirExameCatalogo(ID) },
  { nome: "exames.criarPedido", acoes: ["pedido_exame_criar"], rodar: () => exames.criarPedido(EU, P, { data: "2026-10-11", exames: ["TSH", "HDL"], observacao: "" }), volta: LINHA },
  { nome: "exames.atualizarPedido", acoes: ["pedido_exame_editar"], rodar: () => exames.atualizarPedido(ID, { exames: ["TSH"] }), volta: LINHA },
  { nome: "exames.excluirPedido", acoes: ["pedido_exame_excluir"], rodar: () => exames.excluirPedido(ID) },
  {
    nome: "exames.criarResultados (lote)", acoes: ["resultados_exame_criar"], volta: [LINHA],
    rodar: () => exames.criarResultados(EU, P, "2026-10-11", [
      { exame: "TSH", valor: 2.1, valor_texto: "", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "" },
      { exame: "Urina", valor: null, valor_texto: "negativo", unidade: "", ref_min: null, ref_max: null, referencia_texto: "negativo" },
    ]),
  },
  { nome: "exames.atualizarResultado", acoes: ["resultado_exame_editar"], rodar: () => exames.atualizarResultado(ID, { valor: 2.5, observacao: "x" }), volta: LINHA },
  { nome: "exames.excluirResultado", acoes: ["resultado_exame_excluir"], rodar: () => exames.excluirResultado(ID) },
  { nome: "farmaco.criarInteracao", acoes: ["interacao_criar"], rodar: () => farmaco.criarInteracao(EU, FORM_INTERACAO), volta: LINHA },
  { nome: "farmaco.atualizarInteracao", acoes: ["interacao_editar"], rodar: () => farmaco.atualizarInteracao(ID, FORM_INTERACAO), volta: LINHA },
  {
    nome: "farmaco.duplicarInteracao", acoes: ["interacao_criar"], volta: LINHA,
    rodar: () => farmaco.duplicarInteracao(EU, { id: ID, codigo: "sistema:metformina", medicamento: "Metformina", sinonimos: ["Glifage"], classe: "", nutriente: "B12",
      efeito: "reduz", gravidade: "moderada", conduta: "monitorar", fonte: "" } as unknown as Interacao),
  },
  { nome: "farmaco.excluirInteracao", acoes: ["interacao_excluir"], rodar: () => farmaco.excluirInteracao(ID) },
  { nome: "farmaco.criarMedicamento", acoes: ["medicamento_criar"], rodar: () => farmaco.criarMedicamento(EU, P, FORM_MEDICAMENTO), volta: LINHA },
  { nome: "farmaco.atualizarMedicamento", acoes: ["medicamento_editar"], rodar: () => farmaco.atualizarMedicamento(ID, { ...FORM_MEDICAMENTO, inicio: "2026-09-01" }), volta: LINHA },
  { nome: "farmaco.alternarAtivo", acoes: ["medicamento_editar"], rodar: () => farmaco.alternarAtivo(ID, false), volta: LINHA },
  { nome: "farmaco.excluirMedicamento", acoes: ["medicamento_excluir"], rodar: () => farmaco.excluirMedicamento(ID) },
  { nome: "farmaco.criarAnalise", acoes: ["analise_farmaco_criar"], rodar: () => farmaco.criarAnalise(EU, P, { form: { titulo: "Análise", parecer: "ok" }, medicamentos: [], interacoes: [] }), volta: LINHA },
  { nome: "farmaco.atualizarAnalise", acoes: ["analise_farmaco_editar"], rodar: () => farmaco.atualizarAnalise(ID, { titulo: "Análise", parecer: "" }), volta: LINHA },
  { nome: "farmaco.excluirAnalise", acoes: ["analise_farmaco_excluir"], rodar: () => farmaco.excluirAnalise(ID) },
  { nome: "gestacional.iniciarGestacao", acoes: ["gestacao_criar"], rodar: () => gestacional.iniciarGestacao(EU, P, FORM_GESTACAO), volta: LINHA },
  { nome: "gestacional.atualizarGestacao", acoes: ["gestacao_editar"], rodar: () => gestacional.atualizarGestacao(ID, FORM_GESTACAO), volta: LINHA },
  { nome: "gestacional.encerrarGestacao", acoes: ["gestacao_encerrar"], rodar: () => gestacional.encerrarGestacao(ID), volta: LINHA },
  { nome: "gestacional.excluirGestacao", acoes: ["gestacao_excluir"], rodar: () => gestacional.excluirGestacao(ID) },
  { nome: "gestacional.salvarRegistro", acoes: ["registro_gestacional_salvar"], rodar: () => gestacional.salvarRegistro(EU, { id: ID, paciente_id: P }, FORM_REGISTRO), volta: { registro: LINHA, criado: true } },
  { nome: "gestacional.atualizarRegistro", acoes: ["registro_gestacional_editar"], rodar: () => gestacional.atualizarRegistro(ID, FORM_REGISTRO), volta: LINHA },
  { nome: "gestacional.excluirRegistro", acoes: ["registro_gestacional_excluir"], rodar: () => gestacional.excluirRegistro(ID) },
  { nome: "questionarios.criarQuestionario", acoes: ["questionario_criar"], rodar: () => questionarios.criarQuestionario(EU, QUESTIONARIO as never), volta: LINHA },
  { nome: "questionarios.atualizarQuestionario", acoes: ["questionario_editar"], rodar: () => questionarios.atualizarQuestionario(ID, { titulo: "Q2" }), volta: LINHA },
  { nome: "questionarios.excluirQuestionario", acoes: ["questionario_excluir"], rodar: () => questionarios.excluirQuestionario(ID) },
  { nome: "questionarios.duplicarQuestionario", acoes: ["questionario_criar"], rodar: () => questionarios.duplicarQuestionario({ id: ID, ...QUESTIONARIO } as unknown as Questionario, EU), volta: LINHA },
  { nome: "questionarios.criarAplicacao", acoes: ["aplicacao_criar"], rodar: () => questionarios.criarAplicacao(EU, P, APLICACAO as never), volta: LINHA },
  { nome: "questionarios.atualizarAplicacao", acoes: ["aplicacao_editar"], rodar: () => questionarios.atualizarAplicacao(ID, { pontuacao: 3, nivel: "moderado" }), volta: LINHA },
  { nome: "questionarios.excluirAplicacao", acoes: ["aplicacao_excluir"], rodar: () => questionarios.excluirAplicacao(ID) },
];

beforeEach(() => {
  h.invoke.mockReset();
  h.subir.mockReset();
  h.invoke.mockResolvedValue({ data: RESPOSTA, error: null });
  h.subir.mockResolvedValue({ data: { path: "x" }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("hml-19a — as 10 libs gravam pela nutricao (mesma assinatura)", () => {
  it("as 63 funções de gravação estão aqui; toda outra função exportada das 10 libs é leitura (nenhuma gravação ficou de fora)", () => {
    expect(CASOS).toHaveLength(63);
    const modulos = { anamneses, anexos, anotacoes, avaliacao, consultas, documentos, exames, farmaco, gestacional, questionarios };
    const LEITURA = /^(listar|pagina|nomeDa|dadosProfissionais|urlAssinada|use|chave|mensagemDoErro|gestacaoAtiva)/;
    const noContrato = new Set(CASOS.map((c) => c.nome.split(" ")[0]));
    const semDecisao: string[] = [];
    for (const [modulo, exportados] of Object.entries(modulos)) {
      for (const [nome, valor] of Object.entries(exportados)) {
        if (typeof valor !== "function" || LEITURA.test(nome)) continue;
        if (!noContrato.has(`${modulo}.${nome}`)) semDecisao.push(`${modulo}.${nome}`);
      }
    }
    expect(semDecisao).toEqual([]);
  });

  it.each(CASOS.map((c) => [c.nome, c] as const))("%s: a ação certa, 1 chamada por passo, o corpo aceito pelo servidor", async (_n, c) => {
    const volta = await c.rodar();
    const feitas = chamadas();
    expect(feitas.map((f) => f.acao)).toEqual(c.acoes);
    for (const f of feitas) {
      expect(aceitaNoServidor(f), f.acao).toBe(true);
      // o dono nunca vai no corpo (o servidor põe quem chama)
      expect(f.corpo, f.acao).not.toHaveProperty("nutricionista_id");
      expect(f.corpo, f.acao).not.toHaveProperty("deleted_at");
    }
    if ("volta" in c) expect(volta).toEqual(c.volta);
  });

  it("anexo: o arquivo sobe no link assinado que o servidor deu (bucket, caminho e token dele) e o registro leva o MESMO caminho", async () => {
    await anexos.enviarAnexo(EU, P, new File(["oi"], "Laudo.PDF", { type: "application/pdf" }), " exame ");
    expect(h.subir).toHaveBeenCalledTimes(1);
    const [bucket, caminho, token, , opcoes] = h.subir.mock.calls[0];
    expect([bucket, caminho, token]).toEqual([RESPOSTA.bucket, RESPOSTA.caminho, RESPOSTA.token]);
    expect(opcoes).toMatchObject({ contentType: "application/pdf" });
    const [preparar, registrar] = chamadas();
    expect(preparar.corpo).toEqual({ paciente_id: P, nome: "Laudo.PDF", tipo: "application/pdf", tamanho: 2 });
    expect(registrar.corpo).toEqual({ paciente_id: P, caminho: RESPOSTA.caminho, nome: "Laudo.PDF", tipo: "application/pdf", tamanho: 2, descricao: "exame" });
  });

  it("anexo: a subida falhou → upload_falhou e nada é registrado", async () => {
    h.subir.mockResolvedValue({ data: null, error: { message: "row-level security" } });
    await expect(anexos.enviarAnexo(EU, P, new File(["oi"], "a.pdf", { type: "application/pdf" }))).rejects.toMatchObject({ codigo: "upload_falhou" });
    expect(chamadas().map((f) => f.acao)).toEqual(["anexo_preparar"]);
  });

  it("padrões: cada seção pede a SUA semente (anamnese, documento, exame)", async () => {
    await anamneses.garantirModelos(EU);
    await documentos.garantirModelosDocumento(EU);
    await exames.garantirCatalogoExames(EU);
    expect(chamadas().map((f) => f.corpo.secao)).toEqual(["anamnese", "documento", "exame"]);
  });
});

const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

describe("hml-19a — os erros chegam com a frase fixa (ou a frase própria de antes)", () => {
  it("anotações: 0 linha (não é o autor) e o RLS recusando ficam com as frases de antes", async () => {
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(anotacoes.atualizarAnotacao(ID, "nutricionista", { data: "2026-07-16", hora: "10:30", texto: "x", visibilidade: "nutricionistas" }))
      .rejects.toThrow("Só quem escreveu a anotação pode mudar.");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(anotacoes.excluirAnotacao(ID)).rejects.toThrow("Só quem escreveu a anotação pode excluir.");
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(anotacoes.criarAnotacao(EU, P, "personal", { data: "2026-07-16", hora: "10:30", texto: "x", visibilidade: "nutricionistas" }))
      .rejects.toThrow("Você não pode gravar essa anotação para este aluno.");
  });

  it("gestação: já existe uma ativa (conflito) → a frase de antes; fármaco: a do sistema → 'Só as suas interações…'", async () => {
    h.invoke.mockResolvedValueOnce(recusa(409, "conflito"));
    await expect(gestacional.iniciarGestacao(EU, P, FORM_GESTACAO)).rejects.toThrow(gestacional.MSG_GESTACAO_ATIVA);
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(farmaco.atualizarInteracao(ID, FORM_INTERACAO)).rejects.toThrow("Só as suas interações podem ser editadas");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(farmaco.excluirInteracao(ID)).rejects.toThrow("Só as suas interações podem ser excluídas");
  });

  it("o resto: a frase fixa do código, nunca a mensagem do banco (antes o toast mostrava o erro cru)", async () => {
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(consultas.excluirConsulta(ID)).rejects.toThrow("Não encontrado: o registro foi excluído ou não é seu.");
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(anamneses.criarAnamnese(EU, P, null, ANAMNESE)).rejects.toThrow("Você não tem permissão para fazer isso com este aluno.");
  });

  it("sem internet: nenhuma chamada", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(documentos.excluirDocumento(ID)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
