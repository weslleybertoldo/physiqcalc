// Physiq hml-20c (H-102 🟡 · jeito 2, decisão 8 da spec hml-20) — o contrato entre a lib da PRÉ-CONSULTA (src/painel/preconsulta/
// dados.ts) e a função nutricao: cada uma das 5 gravações (as MESMAS assinaturas de antes) faz 1 chamada à nutricao com a ação certa, nunca
// grava direto no banco, e o corpo que ela manda PASSA no leitor REAL do servidor (montarGravacaoPreconsulta, de _shared/nutricao-regras.ts —
// o mesmo da borda): as colunas que a tela gravava hoje (dados.ts:72, :101, :108, :147, :161), sem o dono, o slug, o "importada em" nem a
// Lixeira (o servidor põe). O que volta é o que a tela usa (a linha). Os negativos: o código dos gatilhos vira a MESMA frase de antes, o
// RLS também, o conflito do slug vira a frase dele e sem internet nada é chamado.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    from: (t: string) => {
      throw new Error(`gravação/leitura direta na tabela ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
  },
}));

import { ACOES_DA_PRECONSULTA, montarGravacaoPreconsulta } from "../../../supabase-principal/functions/_shared/nutricao-regras";
import {
  atualizarFormulario, criarFormulario, duplicarFormulario, excluirFormulario, excluirResposta, ligarAluno, marcarImportada, type FormularioPreconsulta,
} from "./dados";
import type { RegistroFormulario } from "./preconsultaUtil";

const EU = "33333333-3333-4333-8333-333333333333";
const CONTA = "66666666-6666-4666-8666-666666666666";
const ID = "22222222-2222-4222-8222-222222222222";
const ALUNO = "55555555-5555-4555-8555-555555555555";
const ALVO = "88888888-8888-4888-8888-888888888888";
const LINHA = { id: ID, titulo: "Pré-anamnese", slug: "abcd2345" };

const REG: RegistroFormulario = {
  titulo: "Pré-anamnese", descricao: "antes da consulta", origem: "anamnese", origem_id: ALVO,
  perguntas: [{ id: "p1", tipo: "texto", texto: "Como você dorme?", obrigatoria: false } as unknown as RegistroFormulario["perguntas"][number]], faixas: [], ativo: true,
};

type Chamada = { acao: string; corpo: Record<string, unknown> };
const chamadas = (): Chamada[] => h.invoke.mock.calls.map(([nome, o]) => {
  expect(nome).toBe("nutricao");
  const { acao, ...corpo } = (o as { body: Record<string, unknown> }).body;
  return { acao: String(acao), corpo };
});

/** O corpo passa no leitor do servidor (o que a função aceita)? Devolve o que o servidor gravaria. */
function noServidor(c: Chamada) {
  const g = montarGravacaoPreconsulta(c.acao, c.corpo, EU, new Date("2026-10-12T14:00:00.000Z"));
  if (g.ok === false) throw new Error(`${c.acao}: o servidor recusaria ${JSON.stringify(g)}`);
  return g;
}

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: { ok: true, linha: LINHA }, error: null });
});
afterEach(() => vi.unstubAllGlobals());

/** As 5 gravações da lib: a função, a ação que ela chama e o que o servidor grava (as colunas de hoje; o dono e o slug são do servidor). */
const CASOS: Array<{ nome: string; rodar: () => Promise<unknown>; acao: string; grava: Record<string, unknown>; volta?: unknown }> = [
  {
    nome: "criarFormulario", rodar: () => criarFormulario("id-do-cliente", CONTA, REG), acao: "preconsulta_formulario_criar",
    grava: { conta_id: CONTA, titulo: REG.titulo, descricao: REG.descricao, origem: "anamnese", origem_id: ALVO, perguntas: REG.perguntas, faixas: [], ativo: true, nutricionista_id: EU },
    volta: LINHA,
  },
  {
    nome: "duplicarFormulario (a cópia com slug novo)", rodar: () => duplicarFormulario({ ...REG, id: ID, nutricionista_id: "autora", conta_id: CONTA, slug: "velho1234" } as unknown as FormularioPreconsulta, "uid", CONTA),
    acao: "preconsulta_formulario_criar", grava: { conta_id: CONTA, nutricionista_id: EU }, volta: LINHA,
  },
  {
    nome: "atualizarFormulario (ativar/desativar)", rodar: () => atualizarFormulario(ID, { ativo: false }), acao: "preconsulta_formulario_editar",
    grava: { ativo: false }, volta: LINHA,
  },
  {
    nome: "atualizarFormulario (o formulário inteiro)", rodar: () => atualizarFormulario(ID, { titulo: "Novo", descricao: "d", perguntas: REG.perguntas, faixas: [] }),
    acao: "preconsulta_formulario_editar", grava: { titulo: "Novo", descricao: "d", perguntas: REG.perguntas, faixas: [] }, volta: LINHA,
  },
  { nome: "excluirFormulario", rodar: () => excluirFormulario(ID), acao: "preconsulta_formulario_excluir", grava: { deleted_at: "2026-10-12T14:00:00.000Z" } },
  { nome: "ligarAluno", rodar: () => ligarAluno(ID, ALUNO), acao: "preconsulta_resposta_ligar", grava: { paciente_id: ALUNO }, volta: LINHA },
  { nome: "ligarAluno(null) — desligar", rodar: () => ligarAluno(ID, null), acao: "preconsulta_resposta_ligar", grava: { paciente_id: null }, volta: LINHA },
  {
    nome: "marcarImportada", rodar: () => marcarImportada(ID, "questionario", ALVO), acao: "preconsulta_resposta_ligar",
    grava: { importada_tipo: "questionario", importada_id: ALVO, importada_em: "2026-10-12T14:00:00.000Z" }, volta: LINHA,
  },
  { nome: "excluirResposta", rodar: () => excluirResposta(ID), acao: "preconsulta_resposta_excluir", grava: { deleted_at: "2026-10-12T14:00:00.000Z" } },
];

describe("hml-20c — as 5 gravações da Pré-consulta vão pela nutricao (mesma assinatura)", () => {
  it("as 5 ações do servidor são chamadas pela lib (nenhuma fica sem uso, nenhuma sobra)", () => {
    expect([...new Set(CASOS.map((c) => c.acao))].sort()).toEqual([...ACOES_DA_PRECONSULTA].sort());
  });

  it.each(CASOS.map((c) => [c.nome, c] as const))("%s: 1 chamada, a ação certa, o corpo aceito pelo servidor com as colunas de hoje; o dono, o slug e a Lixeira não vão", async (_n, c) => {
    const volta = await c.rodar();
    const feitas = chamadas();
    expect(feitas.map((f) => f.acao)).toEqual([c.acao]);
    const g = noServidor(feitas[0]);
    expect(g.valores).toMatchObject(c.grava);
    // nada disso vai no corpo: o servidor põe (o dono = quem chama; o slug nasce lá; o "quando" é do servidor; a Lixeira idem)
    expect(JSON.stringify(feitas[0].corpo)).not.toMatch(/"nutricionista_id"|"slug"|"importada_em"|"deleted_at"|"created_at"/);
    if (c.volta !== undefined) expect(volta).toEqual(c.volta);
  });

  it("o criar manda EXATAMENTE as colunas que a tela gravava (fora o dono e o slug, que o servidor põe); uma coluna a mais cairia no servidor", async () => {
    await criarFormulario("id-do-cliente", CONTA, REG);
    const [c] = chamadas();
    expect(Object.keys(c.corpo).sort()).toEqual(["ativo", "conta_id", "descricao", "faixas", "origem", "origem_id", "perguntas", "titulo"]);
    // o leitor do servidor descarta o que não é da ação (o dono do corpo, um slug escolhido)
    const g = noServidor({ acao: c.acao, corpo: { ...c.corpo, nutricionista_id: "outra", slug: "escolhido" } });
    expect(g.valores).not.toHaveProperty("slug");
    expect((g.valores as Record<string, unknown>).nutricionista_id).toBe(EU);
  });

  it("os códigos dos gatilhos da W21 e o RLS viram a MESMA frase de antes; o conflito do slug, a frase dele; o resto, a frase fixa do código", async () => {
    const recusa = (status: number, erro: string) => ({ data: null, error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status }) } });
    const casos: Array<[string, () => Promise<unknown>, string]> = [
      ["aluno_invisivel", () => ligarAluno(ID, ALUNO), "Este aluno não está na sua lista."],
      ["resposta_imutavel", () => ligarAluno(ID, ALUNO), "Esta resposta não pode mudar de conta nem de autor."],
      ["formulario_imutavel", () => atualizarFormulario(ID, { ativo: true }), "O formulário continua de quem o criou."],
      ["sem_acesso", () => criarFormulario("u", CONTA, REG), "Você não tem permissão para isso nesta conta."],
      ["conflito", () => criarFormulario("u", CONTA, REG), "Não foi possível gerar um link único para o formulário. Tente de novo."],
      ["nao_encontrado", () => excluirResposta(ID), "Não encontrado: o registro foi excluído ou não é seu."],
    ];
    for (const [codigo, chamar, frase] of casos) {
      h.invoke.mockResolvedValueOnce(recusa(codigo === "nao_encontrado" ? 404 : 403, codigo));
      await expect(chamar(), codigo).rejects.toMatchObject({ codigo, message: frase });
    }
  });

  it("sem internet: nenhuma chamada (a frase de sem internet)", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(excluirFormulario(ID)).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
