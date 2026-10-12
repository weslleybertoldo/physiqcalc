// Physiq hml-19b (H-41 · jeito 2) — o contrato entre as libs da DIETA e das DIETAS e a função nutricao: cada função de GRAVAÇÃO (as
// mesmas assinaturas de antes) faz 1 chamada à nutricao com a ação certa, nunca grava direto no banco (tabela, RPC ou Storage) e o corpo
// que ela manda PASSA nas regras do servidor (_shared/nutricao-regras.ts — as mesmas que rodam na borda); o dono nunca vai no corpo. E
// o que volta é o que a tela usa (a linha, o plano montado, a receita com os ingredientes, o alimento com as medidas, a lista). Os
// negativos: o código vira a frase fixa (ou a frase própria de antes) e sem internet nada é chamado.
// As 9 libs de src/nutricao/editor/lib (menos antropometrias.ts, da hml-19c) + src/painel/dietas/{alimentosPainel,diario}.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (...a: unknown[]) => h.invoke(...a) },
    storage: {
      from: (bucket: string) => {
        throw new Error(`Storage direto no bucket ${bucket}`);
      },
    },
    from: (t: string) => {
      throw new Error(`gravação direta na tabela ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
  },
}));

import {
  ehUuid, lerAlimento, lerCopiarSemana, lerDuplicarPlano, lerOrdenar, lerPlanoNovo, lerReacao, lerReceita, lerRegistroDiario, montarGravacaoDieta,
  secaoDoPadraoDaDieta,
} from "../../../../supabase-principal/functions/_shared/nutricao-regras";
import * as acompanhamento from "./acompanhamento";
import * as alimentos from "./alimentos";
import * as calculos from "./calculosEnergeticos";
import * as manipulados from "./manipulados";
import * as metas from "./metas";
import * as orientacoes from "./orientacoes";
import * as planos from "./planos";
import * as receitas from "./receitas";
import * as suplementos from "./suplementos";
import * as alimentosPainel from "@/painel/dietas/alimentosPainel";
import * as diario from "@/painel/dietas/diario";
import type { Plano } from "./planos";
import type { Receita } from "./receitas";
import type { Formula } from "./manipulados";
import type { RegistroEnergetico } from "./energeticoUtil";
import type { FormIndicacao, FormProduto } from "./suplementosUtil";

const EU = "33333333-3333-4333-8333-333333333333";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const ID2 = "44444444-4444-4444-8444-444444444444";
const ALI = "77777777-7777-4777-8777-777777777777";
const LINHA = { id: ID, titulo: "x" };
const PLANO_MONTADO = { id: ID, titulo: "P", paciente_id: P, refeicoes: [{ id: ID2, ordem: 0, itens: [] }] };
const RESPOSTA = {
  ok: true, linha: LINHA, linhas: [LINHA], lista: [LINHA], registro: LINHA, criado: true, plano: PLANO_MONTADO, refeicoes: [{ id: ID2, ordem: 0 }],
};

type Chamada = { acao: string; corpo: Record<string, unknown> };
const chamadas = (): Chamada[] => h.invoke.mock.calls.map(([nome, o]) => {
  expect(nome).toBe("nutricao");
  const { acao, ...corpo } = (o as { body: Record<string, unknown> }).body;
  return { acao: String(acao), corpo };
});

/** O corpo passa nas regras do servidor (o que a função aceita)? */
function aceitaNoServidor(c: Chamada): boolean {
  const ok = (r: { ok: boolean }) => {
    if (!r.ok) throw new Error(`${c.acao}: o servidor recusaria ${JSON.stringify(r)}`);
    return true;
  };
  switch (c.acao) {
    case "padroes_garantir":
      return secaoDoPadraoDaDieta(c.corpo.secao) !== null;
    case "plano_criar":
      return ok(lerPlanoNovo(c.corpo));
    case "plano_duplicar":
      return ok(lerDuplicarPlano(c.corpo));
    case "plano_copiar_semana":
      return ok(lerCopiarSemana(c.corpo));
    case "dieta_ordenar":
      return ok(lerOrdenar(c.corpo));
    case "receita_salvar":
      return ok(lerReceita(c.corpo));
    case "alimento_salvar":
      return ok(lerAlimento(c.corpo));
    case "registro_diario_salvar":
      return ok(lerRegistroDiario(c.corpo, EU));
    case "diario_reagir":
      return ok(lerReacao(c.corpo));
    case "grupo_receita_excluir":
    case "diario_excluir":
      return ehUuid(c.corpo.id);
    default:
      return ok(montarGravacaoDieta(c.acao, c.corpo, EU));
  }
}

const PLANO = { id: ID, titulo: "Plano 11/10", paciente_id: P, nutricionista_id: "autora", refeicoes: [] } as unknown as Plano;
const REG_PLANO = { titulo: "Plano 11/10", kcal_alvo: 1800, observacao: null };
const REG_REFEICAO = { nome: "Almoço", horario: "12:30", observacao: null, dias_semana: [1, 3] };
const REG_ITEM = { quantidade_g: 50, medida_caseira_id: null, quantidade_medida: null, observacao: null };
const FORM_REGISTRO = { data: "2026-10-11", agua_ml: "1500", sintomas: ["azia"], sintomaLivre: "", observacao: "  ok  " };
const REG_ENERGETICO: RegistroEnergetico = {
  data: "2026-10-11T13:00:00.000Z", formula: "mifflin", peso: 70, altura: 170, idade: 30, sexo: "f", massa_magra: null, fator_atividade: 1.55,
  atividades: [], tmb: 1400, get: 2170, ajuste_kcal: -300, vet: 1870, objetivo: "perder", observacao: null,
} as unknown as RegistroEnergetico;
const FORM_PRODUTO: FormProduto = {
  nome: "Whey", marca: "Marca", categoria: "suplemento", apresentacao: "pote", dose_padrao: "30 g", modo_uso: "", link: "", observacao: "", favorito: false,
} as FormProduto;
const FORM_INDICACAO: FormIndicacao = { produto: null, nomeLivre: "Creatina", dose: "3 g", horario: "", duracao: "", inicio: "2026-10-11", observacao: "" };
const REG_ALIMENTO = {
  nome: "Granola", grupo: "Cereais", porcao_g: 40, energia_kcal: 180, proteina_g: 4, carboidrato_g: 30, lipidio_g: 5, fibra_g: 3, sodio_mg: 10, marca: "Casa",
  nutrientes: { ferro_mg: 1.2 },
};
const MEDIDAS = [{ descricao: "colher", gramas: 10, ordem: 0 }];
const REG_RECEITA = { nome: "Bolo", grupo_id: null, porcoes: 8, rendimento_g: 800, tempo_preparo_min: 40, modo_preparo: "assar", observacao: "", favorita: false };
const INGREDIENTES = [{ alimento_id: ALI, quantidade_g: 200, medida_caseira_id: null, quantidade_medida: null, ordem: 5, observacao: "" }];
const RECEITA = { id: ID, nutricionista_id: "autora", ...REG_RECEITA, ingredientes: [{ ...INGREDIENTES[0], alimento: { id: ALI } }] } as unknown as Receita;
const REG_FORMULA = { modelo_id: null, titulo: "Magnésio", ativos: [{ ativo: "Mg", dose: "300", unidade: "mg" }, { ativo: "", dose: "", unidade: "mg" }], posologia: "1/dia", quantidade: "30", observacao: "" };
const FORMULA = { id: ID, nutricionista_id: "autora", paciente_id: P, modelo_id: null, titulo: "Magnésio", ativos: [], posologia: "", quantidade: "", observacao: "" } as unknown as Formula;
const REG_META = { modelo_id: null, titulo: "Água", descricao: "2 L", dias_semana: [3, 1, 1, 9], ativa: true };

/** Cada função de gravação das 11 libs, com o que a tela passa e a ação esperada (e, quando a lib devolve sem montar, o que volta). */
const CASOS: Array<{ nome: string; acoes: string[]; rodar: () => Promise<unknown>; volta?: unknown }> = [
  { nome: "planos.criarPlano", acoes: ["plano_criar"], rodar: () => planos.criarPlano(EU, P, REG_PLANO, null) },
  { nome: "planos.atualizarPlano", acoes: ["plano_editar"], rodar: () => planos.atualizarPlano(ID, REG_PLANO), volta: LINHA },
  { nome: "planos.favoritarPlano", acoes: ["plano_editar"], rodar: () => planos.favoritarPlano(ID, true), volta: LINHA },
  { nome: "planos.excluirPlano", acoes: ["plano_excluir"], rodar: () => planos.excluirPlano(ID) },
  { nome: "planos.duplicarPlano", acoes: ["plano_duplicar"], rodar: () => planos.duplicarPlano(EU, PLANO) },
  { nome: "planos.usarPlanoModelo", acoes: ["plano_duplicar"], rodar: () => planos.usarPlanoModelo(EU, P, PLANO) },
  { nome: "planos.criarRefeicao", acoes: ["refeicao_criar"], rodar: () => planos.criarRefeicao(ID, REG_REFEICAO, 3), volta: { ...LINHA, itens: [] } },
  { nome: "planos.atualizarRefeicao", acoes: ["refeicao_editar"], rodar: () => planos.atualizarRefeicao(ID, REG_REFEICAO), volta: LINHA },
  { nome: "planos.excluirRefeicao", acoes: ["refeicao_excluir"], rodar: () => planos.excluirRefeicao(ID) },
  { nome: "planos.salvarOrdemRefeicoes", acoes: ["dieta_ordenar"], rodar: () => planos.salvarOrdemRefeicoes([{ id: ID, ordem: 1 }, { id: ID2, ordem: 0 }]) },
  { nome: "planos.criarItem", acoes: ["item_criar"], rodar: () => planos.criarItem(ID, ALI, REG_ITEM, 2) },
  {
    nome: "planos.criarItensEmLote", acoes: ["itens_criar"],
    rodar: () => planos.criarItensEmLote([{ ...REG_ITEM, refeicao_id: ID, alimento_id: ALI, receita_id: ID2, ordem: 4 }]),
  },
  { nome: "planos.atualizarItem", acoes: ["item_editar"], rodar: () => planos.atualizarItem(ID, REG_ITEM) },
  { nome: "planos.salvarSubstitutos", acoes: ["item_editar"], rodar: () => planos.salvarSubstitutos(ID, [{ alimento_id: ALI, nome: "Arroz", quantidade_g: 80 }]) },
  { nome: "planos.excluirItem", acoes: ["item_excluir"], rodar: () => planos.excluirItem(ID) },
  { nome: "planos.copiarParaSemanaToda", acoes: ["plano_copiar_semana"], rodar: () => planos.copiarParaSemanaToda([ID], [ID2]) },
  { nome: "receitas.criarGrupo", acoes: ["grupo_receita_criar"], rodar: () => receitas.criarGrupo(EU, "  Lanches "), volta: LINHA },
  { nome: "receitas.renomearGrupo", acoes: ["grupo_receita_editar"], rodar: () => receitas.renomearGrupo(ID, "Lanches 2"), volta: LINHA },
  { nome: "receitas.excluirGrupo", acoes: ["grupo_receita_excluir"], rodar: () => receitas.excluirGrupo(ID) },
  { nome: "receitas.criarReceita", acoes: ["receita_salvar"], rodar: () => receitas.criarReceita(EU, REG_RECEITA, INGREDIENTES) },
  { nome: "receitas.atualizarReceita", acoes: ["receita_salvar"], rodar: () => receitas.atualizarReceita(ID, REG_RECEITA, INGREDIENTES) },
  { nome: "receitas.alternarFavorita", acoes: ["receita_editar"], rodar: () => receitas.alternarFavorita(ID, true) },
  { nome: "receitas.duplicarReceita", acoes: ["receita_salvar"], rodar: () => receitas.duplicarReceita(RECEITA, "Bolo (cópia)") },
  { nome: "receitas.excluirReceita", acoes: ["receita_excluir"], rodar: () => receitas.excluirReceita(ID) },
  { nome: "receitas.inserirItensDeReceita", acoes: ["itens_criar"], rodar: () => receitas.inserirItensDeReceita(ID2, RECEITA, 2, 7) },
  { nome: "alimentos.criarAlimento", acoes: ["alimento_salvar"], rodar: () => alimentos.criarAlimento(EU, REG_ALIMENTO, MEDIDAS) },
  { nome: "alimentos.atualizarAlimento", acoes: ["alimento_salvar"], rodar: () => alimentos.atualizarAlimento(ID, REG_ALIMENTO, MEDIDAS) },
  { nome: "alimentos.excluirAlimento", acoes: ["alimento_excluir"], rodar: () => alimentos.excluirAlimento(ID) },
  { nome: "alimentosPainel.excluirAlimentoDoPainel", acoes: ["alimento_excluir"], rodar: () => alimentosPainel.excluirAlimentoDoPainel(ID) },
  { nome: "acompanhamento.salvarRegistro", acoes: ["registro_diario_salvar"], rodar: () => acompanhamento.salvarRegistro(EU, P, FORM_REGISTRO), volta: { registro: LINHA, criado: true } },
  { nome: "acompanhamento.atualizarRegistro", acoes: ["registro_diario_editar"], rodar: () => acompanhamento.atualizarRegistro(ID, FORM_REGISTRO), volta: LINHA },
  { nome: "acompanhamento.excluirRegistro", acoes: ["registro_diario_excluir"], rodar: () => acompanhamento.excluirRegistro(ID) },
  { nome: "calculos.criarCalculo", acoes: ["calculo_energetico_criar"], rodar: () => calculos.criarCalculo(EU, P, REG_ENERGETICO), volta: LINHA },
  { nome: "calculos.atualizarCalculo", acoes: ["calculo_energetico_editar"], rodar: () => calculos.atualizarCalculo(ID, REG_ENERGETICO), volta: LINHA },
  { nome: "calculos.excluirCalculo", acoes: ["calculo_energetico_excluir"], rodar: () => calculos.excluirCalculo(ID) },
  { nome: "suplementos.criarProduto", acoes: ["produto_criar"], rodar: () => suplementos.criarProduto(EU, FORM_PRODUTO), volta: LINHA },
  { nome: "suplementos.atualizarProduto", acoes: ["produto_editar"], rodar: () => suplementos.atualizarProduto(ID, FORM_PRODUTO), volta: LINHA },
  { nome: "suplementos.alternarFavorito", acoes: ["produto_editar"], rodar: () => suplementos.alternarFavorito(ID, true), volta: LINHA },
  { nome: "suplementos.excluirProduto", acoes: ["produto_excluir"], rodar: () => suplementos.excluirProduto(ID) },
  { nome: "suplementos.criarIndicacao", acoes: ["indicacao_criar"], rodar: () => suplementos.criarIndicacao(EU, P, FORM_INDICACAO, 3), volta: LINHA },
  { nome: "suplementos.atualizarIndicacao", acoes: ["indicacao_editar"], rodar: () => suplementos.atualizarIndicacao(ID, FORM_INDICACAO), volta: LINHA },
  { nome: "suplementos.alternarAtiva", acoes: ["indicacao_editar"], rodar: () => suplementos.alternarAtiva(ID, true, 4), volta: LINHA },
  { nome: "suplementos.salvarOrdem", acoes: ["dieta_ordenar"], rodar: () => suplementos.salvarOrdem([{ id: ID, ordem: 0 }, { id: ID2, ordem: 1 }]) },
  { nome: "suplementos.excluirIndicacao", acoes: ["indicacao_excluir"], rodar: () => suplementos.excluirIndicacao(ID) },
  { nome: "manipulados.garantirModelosFormula", acoes: ["padroes_garantir"], rodar: () => manipulados.garantirModelosFormula(EU), volta: [LINHA] },
  {
    nome: "manipulados.criarModeloFormula", acoes: ["modelo_formula_criar"], volta: LINHA,
    rodar: () => manipulados.criarModeloFormula(EU, { titulo: " F ", ativos: REG_FORMULA.ativos, posologia: "", quantidade: "", observacao: "", favorito: true }),
  },
  { nome: "manipulados.atualizarModeloFormula", acoes: ["modelo_formula_editar"], rodar: () => manipulados.atualizarModeloFormula(ID, { favorito: false }), volta: LINHA },
  { nome: "manipulados.excluirModeloFormula", acoes: ["modelo_formula_excluir"], rodar: () => manipulados.excluirModeloFormula(ID) },
  { nome: "manipulados.salvarComoModelo", acoes: ["modelo_formula_criar"], rodar: () => manipulados.salvarComoModelo(EU, REG_FORMULA, true), volta: LINHA },
  { nome: "manipulados.criarFormula", acoes: ["formula_criar"], rodar: () => manipulados.criarFormula(EU, P, REG_FORMULA), volta: LINHA },
  { nome: "manipulados.atualizarFormula", acoes: ["formula_editar"], rodar: () => manipulados.atualizarFormula(ID, { titulo: "F2", ativos: REG_FORMULA.ativos }), volta: LINHA },
  { nome: "manipulados.duplicarFormula", acoes: ["formula_criar"], rodar: () => manipulados.duplicarFormula(FORMULA), volta: LINHA },
  { nome: "manipulados.excluirFormula", acoes: ["formula_excluir"], rodar: () => manipulados.excluirFormula(ID) },
  { nome: "metas.garantirModelosMeta", acoes: ["padroes_garantir"], rodar: () => metas.garantirModelosMeta(EU), volta: [LINHA] },
  {
    nome: "metas.criarModeloMeta", acoes: ["modelo_meta_criar"], volta: LINHA,
    rodar: () => metas.criarModeloMeta(EU, { titulo: " M ", descricao: "", dias_semana: [7, 1], favorito: false }),
  },
  { nome: "metas.atualizarModeloMeta", acoes: ["modelo_meta_editar"], rodar: () => metas.atualizarModeloMeta(ID, { dias_semana: [6, 7, 7] }), volta: LINHA },
  { nome: "metas.excluirModeloMeta", acoes: ["modelo_meta_excluir"], rodar: () => metas.excluirModeloMeta(ID) },
  { nome: "metas.salvarComoModelo", acoes: ["modelo_meta_criar"], rodar: () => metas.salvarComoModelo(EU, REG_META), volta: LINHA },
  { nome: "metas.criarMeta", acoes: ["meta_criar"], rodar: () => metas.criarMeta(EU, P, REG_META), volta: LINHA },
  { nome: "metas.atualizarMeta", acoes: ["meta_editar"], rodar: () => metas.atualizarMeta(ID, { titulo: "Água 2" }), volta: LINHA },
  { nome: "metas.alternarAtiva", acoes: ["meta_editar"], rodar: () => metas.alternarAtiva(ID, false), volta: LINHA },
  { nome: "metas.excluirMeta", acoes: ["meta_excluir"], rodar: () => metas.excluirMeta(ID) },
  { nome: "orientacoes.garantirModelos", acoes: ["padroes_garantir"], rodar: () => orientacoes.garantirModelos(EU), volta: [LINHA] },
  { nome: "orientacoes.criarModelo", acoes: ["modelo_orientacao_criar"], rodar: () => orientacoes.criarModelo(EU, { titulo: " O ", conteudo: "## x", favorito: false }), volta: LINHA },
  { nome: "orientacoes.atualizarModelo", acoes: ["modelo_orientacao_editar"], rodar: () => orientacoes.atualizarModelo(ID, { conteudo: "y" }), volta: LINHA },
  { nome: "orientacoes.excluirModelo", acoes: ["modelo_orientacao_excluir"], rodar: () => orientacoes.excluirModelo(ID) },
  { nome: "orientacoes.salvarComoModelo", acoes: ["modelo_orientacao_criar"], rodar: () => orientacoes.salvarComoModelo(EU, { titulo: "O", conteudo: "z" }), volta: LINHA },
  { nome: "orientacoes.criarOrientacao", acoes: ["orientacao_criar"], rodar: () => orientacoes.criarOrientacao(EU, P, null, { titulo: "O", conteudo: "z" }), volta: LINHA },
  { nome: "orientacoes.atualizarOrientacao", acoes: ["orientacao_editar"], rodar: () => orientacoes.atualizarOrientacao(ID, { titulo: "O", conteudo: "w" }), volta: LINHA },
  { nome: "orientacoes.excluirOrientacao", acoes: ["orientacao_excluir"], rodar: () => orientacoes.excluirOrientacao(ID) },
  { nome: "diario.reagir", acoes: ["diario_reagir"], rodar: () => diario.reagir(ID, "otimo", "  bom prato "), volta: LINHA },
  { nome: "diario.excluirRegistro", acoes: ["diario_excluir"], rodar: () => diario.excluirRegistro({ id: ID, path: "qualquer/caminho.jpg" }) },
];

beforeEach(() => {
  h.invoke.mockReset();
  h.invoke.mockResolvedValue({ data: RESPOSTA, error: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("hml-19b — as libs da Dieta e das Dietas gravam pela nutricao (mesma assinatura)", () => {
  it("as 72 funções de gravação estão aqui; toda outra função exportada das 11 libs é leitura ou regra pura (nenhuma gravação ficou de fora)", () => {
    expect(CASOS).toHaveLength(72);
    const modulos = { planos, receitas, alimentos, alimentosPainel, acompanhamento, calculos, suplementos, manipulados, metas, orientacoes, diario };
    // hml-20c: + as regras puras novas das leituras pelo servidor (paramsDaBusca — os params da busca de alimentos; diasDoPeriodo — os
    // inícios de dia locais do diário)
    const LEITURA = /^(listar|buscar|contar|nomesPara|nomeDa|dadosProfissionais|lerPagina|montar|manter|recorte|alimentoEhMeu|urlAssinada|urlsAssinadas|alunoDoFiltro|diasQuePodem|chave|use|paramsDaBusca|diasDoPeriodo)/;
    const noContrato = new Set(CASOS.map((c) => c.nome));
    const semDecisao: string[] = [];
    for (const [modulo, exportados] of Object.entries(modulos)) {
      for (const [nome, valor] of Object.entries(exportados)) {
        if (typeof valor !== "function" || LEITURA.test(nome)) continue;
        if (!noContrato.has(`${modulo}.${nome}`)) semDecisao.push(`${modulo}.${nome}`);
      }
    }
    expect(semDecisao).toEqual([]);
  });

  it.each(CASOS.map((c) => [c.nome, c] as const))("%s: a ação certa, 1 chamada, o corpo aceito pelo servidor, sem o dono", async (_n, c) => {
    const volta = await c.rodar();
    const feitas = chamadas();
    expect(feitas.map((f) => f.acao)).toEqual(c.acoes);
    for (const f of feitas) {
      expect(aceitaNoServidor(f), f.acao).toBe(true);
      // o dono nunca vai no corpo (o servidor põe quem chama), nem a Lixeira
      expect(JSON.stringify(f.corpo), f.acao).not.toMatch(/"nutricionista_id"|"deleted_at"/);
    }
    if ("volta" in c) expect(volta).toEqual(c.volta);
  });

  it("o que volta MONTADO: o plano (refeições e itens), o item, a receita com os ingredientes e o alimento com as medidas", async () => {
    const criado = await planos.criarPlano(EU, P, REG_PLANO, null);
    expect(criado).toMatchObject({ id: ID, refeicoes: [{ id: ID2, itens: [] }] });
    const copia = await planos.duplicarPlano(EU, PLANO);
    expect(copia.refeicoes).toEqual([{ id: ID2, ordem: 0, itens: [] }]);
    h.invoke.mockResolvedValueOnce({ data: { ok: true, linha: { id: ID, alimento: { id: ALI, medidas_caseiras: [{ ordem: 1 }, { ordem: 0 }] } } }, error: null });
    const item = await planos.criarItem(ID, ALI, REG_ITEM, 0);
    expect(item.alimento?.medidas_caseiras.map((m) => m.ordem)).toEqual([0, 1]);
    h.invoke.mockResolvedValueOnce({ data: { ok: true, linha: { id: ID, ingredientes: [{ ordem: 1 }, { ordem: 0 }] } }, error: null });
    const receita = await receitas.criarReceita(EU, REG_RECEITA, INGREDIENTES);
    expect(receita.ingredientes.map((i) => i.ordem)).toEqual([0, 1]);
    h.invoke.mockResolvedValueOnce({ data: { ok: true, linha: { id: ID, medidas_caseiras: null } }, error: null });
    expect((await alimentos.criarAlimento(EU, REG_ALIMENTO, MEDIDAS)).medidas_caseiras).toEqual([]);
  });

  it("os corpos: as refeições padrão na nova prescrição; a cópia SEM o id da autora; o usar modelo com o aluno; a ordem do ingrediente = a posição", async () => {
    await planos.criarPlano(EU, P, REG_PLANO, ID2);
    await planos.duplicarPlano("qualquer-id-da-tela", PLANO);
    await planos.usarPlanoModelo(EU, ID2, PLANO);
    await receitas.criarReceita(EU, REG_RECEITA, [...INGREDIENTES, { ...INGREDIENTES[0], ordem: 0 }]);
    const [criar, duplicar, usar, receita] = chamadas();
    expect(criar.corpo).toMatchObject({ paciente_id: P, calculo_energetico_id: ID2, titulo: "Plano 11/10", kcal_alvo: 1800, observacao: null });
    expect((criar.corpo.refeicoes as { nome: string; ordem: number }[]).map((r) => `${r.ordem}:${r.nome}`)).toEqual([
      "0:Café da manhã", "1:Lanche da manhã", "2:Almoço", "3:Lanche da tarde", "4:Jantar", "5:Ceia",
    ]);
    expect(duplicar.corpo).toEqual({ plano_id: ID, titulo: "Plano 11/10 (cópia)" });
    expect(usar.corpo).toEqual({ plano_id: ID, paciente_id: ID2, titulo: "Plano 11/10" });
    expect((receita.corpo.ingredientes as { ordem: number }[]).map((i) => i.ordem)).toEqual([0, 1]);
  });

  it("os normalizados de hoje seguem na tela: título aparado, ativos sem linha vazia, dias únicos e em ordem; a meta sem dias fora de 1–7", async () => {
    await manipulados.criarModeloFormula(EU, { titulo: " F ", ativos: REG_FORMULA.ativos, posologia: "", quantidade: "", observacao: "", favorito: true });
    await metas.criarMeta(EU, P, REG_META);
    await receitas.criarGrupo(EU, "  Lanches ");
    const [formula, meta, grupo] = chamadas();
    expect(formula.corpo).toMatchObject({ titulo: "F", ativos: [{ ativo: "Mg", dose: "300", unidade: "mg" }] });
    expect(meta.corpo.dias_semana).toEqual([1, 3]);
    expect(grupo.corpo).toEqual({ nome: "Lanches" });
  });

  it("subir/descer e copiar pra semana: nada a mudar = nenhuma chamada; os padrões: cada seção pede a SUA semente", async () => {
    await planos.salvarOrdemRefeicoes([]);
    await suplementos.salvarOrdem([]);
    await planos.copiarParaSemanaToda([], []);
    expect(h.invoke).not.toHaveBeenCalled();
    await manipulados.garantirModelosFormula(EU);
    await metas.garantirModelosMeta(EU);
    await orientacoes.garantirModelos(EU);
    expect(chamadas().map((f) => f.corpo.secao)).toEqual(["formula", "meta", "orientacao"]);
  });
});

const recusa = (status: number, erro: string) => ({
  data: null,
  error: { name: "FunctionsHttpError", context: new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json" } }) },
});

describe("hml-19b — os erros chegam com a frase fixa (ou a frase própria de antes)", () => {
  it("grupos: o nome repetido (conflito) e o grupo que sumiu ficam com as frases de antes", async () => {
    h.invoke.mockResolvedValueOnce(recusa(409, "conflito"));
    await expect(receitas.criarGrupo(EU, "Lanches")).rejects.toThrow("Já existe um grupo com esse nome");
    h.invoke.mockResolvedValueOnce(recusa(409, "conflito"));
    await expect(receitas.renomearGrupo(ID, "Lanches")).rejects.toThrow("Já existe um grupo com esse nome");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(receitas.renomearGrupo(ID, "X")).rejects.toThrow("Grupo não encontrado");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(receitas.excluirGrupo(ID)).rejects.toThrow("Grupo não encontrado");
  });

  it("receita, alimento do painel e diário: o 0 linha com as frases de antes", async () => {
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(receitas.atualizarReceita(ID, REG_RECEITA, [])).rejects.toThrow("Receita não encontrada");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(receitas.alternarFavorita(ID, true)).rejects.toThrow("Receita não encontrada");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(receitas.excluirReceita(ID)).rejects.toThrow("Receita não encontrada");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(alimentosPainel.excluirAlimentoDoPainel(ID)).rejects.toThrow("Você não pode excluir este alimento (ou ele já foi excluído).");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(diario.reagir(ID, null, "")).rejects.toThrow("Você não pode reagir a esta foto (ou ela foi excluída).");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(diario.excluirRegistro({ id: ID, path: "x" })).rejects.toThrow("Você não pode excluir esta foto (ou ela já foi excluída).");
  });

  it("o resto: a frase fixa do código, nunca a mensagem do banco (antes o toast mostrava o erro cru)", async () => {
    h.invoke.mockResolvedValueOnce(recusa(403, "sem_acesso"));
    await expect(planos.duplicarPlano(EU, PLANO)).rejects.toThrow("Você não tem permissão para fazer isso com este aluno.");
    h.invoke.mockResolvedValueOnce(recusa(404, "nao_encontrado"));
    await expect(planos.salvarOrdemRefeicoes([{ id: ID, ordem: 1 }])).rejects.toThrow("Não encontrado: o registro foi excluído ou não é seu.");
    h.invoke.mockResolvedValueOnce(recusa(400, "dados_invalidos"));
    await expect(metas.criarMeta(EU, P, REG_META)).rejects.toThrow("Confira os dados e tente de novo.");
  });

  it("sem internet: nenhuma chamada", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(planos.excluirItem(ID)).rejects.toMatchObject({ codigo: "sem_internet" });
    await expect(suplementos.salvarOrdem([{ id: ID, ordem: 0 }])).rejects.toMatchObject({ codigo: "sem_internet" });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
