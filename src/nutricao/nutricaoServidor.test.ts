// Physiq hml-19a (H-41 · H-81 · jeito 2) — as regras PURAS da função nutricao (supabase-principal/functions/_shared/nutricao-regras.ts):
// as mesmas que rodam na borda (Deno). Positivo: cada ação conhecida monta a gravação certa, com o dono = quem chama. Negativo: ação
// desconhecida, coluna fora da lista, dono no corpo, uuid ruim, texto/JSON acima do teto, anexo fora da pasta, o status de cada erro.
// hml-19b: os blocos do fim — a Dieta, as Dietas e o app do aluno (as listas novas, o despacho entre os 3 módulos, as RPCs atômicas, o
// registro do dia, o diário e os padrões de Manipulados/Metas/Orientações). Os blocos da 19a acima não mudam.
// hml-19c: os blocos do fim — a Avaliação (a 4ª lista: antropometria, fotos de evolução pelo link assinado e o aviso "avaliação nova",
// o despacho ao módulo novo e as listas da tela iguais às do servidor). Os blocos da 19a e da 19b não mudam.
import { describe, expect, it } from "vitest";
import {
  ACOES, ACOES_NUTRICAO, ANEXO_MAX_BYTES, ANEXO_MIMES, LIMITE_CORPO, PADROES, STATUS_DO_ERRO, TABELAS_PRONTUARIO, acaoDoPedido, bucketDosAnexos,
  caminhoDeQuemChama, caminhoDoAnexo, erroDoBanco, lerPedidoDeAnexo, lerRegistroDeAnexo, lerRegistroGestacional, montarGravacao, nomeSeguro,
  secaoDoPadrao, statusDoErro, valorDoCampo, type AcaoNutricao,
} from "../../supabase-principal/functions/_shared/nutricao-regras";
import {
  ACOES_ALUNO, ACOES_DA_DIETA, ACOES_DIETA, ACOES_DO_ALUNO, COMENTARIO_NUTRI_MAX, DIARIO_MAX_BYTES, DIARIO_MIMES, ERROS_DA_MARCACAO, ERROS_DO_DIARIO,
  PADROES_DIETA, RPCS_DA_DIETA, TABELAS_DIETA, TABELAS_DIETA_SEM_DONO, TABELAS_QUE_ORDENAM, acaoDaDieta, acaoDoAluno, bucketDoDiario, caminhoDoDiario,
  caminhoDoDiarioValido, erroDaRpc, lerAlimento, lerCopiarSemana, lerDuplicarPlano, lerEnvioDoDiario, lerMarcacao, lerOrdenar, lerPedidoDeFotoDoDiario,
  lerPlanoNovo, lerReacao, lerReceita, lerRegistroDiario, montarGravacaoDieta, moduloDoPedido, secaoDoPadraoDaDieta, temDono, type AcaoDieta,
} from "../../supabase-principal/functions/_shared/nutricao-regras";
import {
  CATALOGO_EXAMES_PADRAO, MODELOS_DOCUMENTO_PADRAO, PERGUNTAS_ANAMNESE_PADRAO, SECOES_PADRAO, TITULO_ANAMNESE_PADRAO, itensPadrao,
} from "../../supabase-principal/functions/_shared/nutricao-padroes";
import {
  CONTEUDO_ORIENTACAO_PADRAO, MODELOS_FORMULA_PADRAO, MODELOS_META_PADRAO, SECOES_PADRAO_DIETA, TITULO_ORIENTACAO_PADRAO, itensPadraoDaDieta,
} from "../../supabase-principal/functions/_shared/nutricao-padroes";
import { MODELOS_PADRAO as METAS_PADRAO, normalizarDias } from "@/nutricao/editor/lib/metasUtil";
import { MODELOS_PADRAO as FORMULAS_PADRAO, normalizarAtivos } from "@/nutricao/editor/lib/manipuladosUtil";
import { CONTEUDO_MODELO_PADRAO, TITULO_MODELO_PADRAO as TITULO_ORIENTACAO_DA_TELA } from "@/nutricao/editor/lib/orientacoesUtil";
import { FOTO_TAMANHO_MAX, MIMES_DIARIO, REACOES, nomeObjeto } from "@/nutricao/app/diarioUtil";
import { COMENTARIO_NUTRI_MAX as COMENTARIO_NUTRI_DA_TELA } from "@/painel/dietas/diarioPainel";
import { PERGUNTAS_PADRAO, TITULO_MODELO_PADRAO } from "@/nutricao/prontuario/lib/anamneseUtil";
import { MODELOS_PADRAO } from "@/nutricao/prontuario/lib/documentosUtil";
import { CATALOGO_PADRAO, NOME_EXAME_MAX } from "@/nutricao/prontuario/lib/examesUtil";
import { MIMES_PERMITIDOS, TAMANHO_MAX, nomeSeguro as nomeSeguroDaTela } from "@/nutricao/editor/lib/anexosUtil";
import {
  ACOES_AVALIACAO, ACOES_DA_AVALIACAO, C_ANTROPOMETRIA, C_FOTO_EVOLUCAO, ERROS_DO_AVISO, FOTO_EVOLUCAO_MAX_BYTES, FOTO_EVOLUCAO_MIMES,
  POSICOES_FOTO_EVOLUCAO, PROTOCOLOS_ANTROPOMETRIA, SEXOS_ANTROPOMETRIA, TABELAS_AVALIACAO, acaoDaAvaliacao, bucketDaEvolucao,
  lerPedidoDeFotoEvolucao, lerRegistroDeFotoEvolucao, montarGravacaoAvaliacao, type AcaoAvaliacao,
} from "../../supabase-principal/functions/_shared/nutricao-regras";
import { OBSERVACAO_MAX, PROTOCOLOS, SEXOS, formNovo, formParaRegistro } from "@/nutricao/editor/lib/antropometriaUtil";
import { FOTO_TAMANHO_MAX as FOTO_EVOLUCAO_DA_TELA, MIMES_FOTO, OBSERVACAO_FOTO_MAX, POSICOES } from "@/nutricao/editor/lib/evolucaoUtil";
import { montarPath } from "@/nutricao/editor/lib/anexosUtil";

const EU = "33333333-3333-4333-8333-333333333333";
const OUTRA = "44444444-4444-4444-8444-444444444444";
const P = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const ISO = "2026-10-11T13:00:00.000Z";
const AGORA = new Date("2026-10-11T15:30:00.000Z");

/** Um corpo válido e mínimo de cada ação declarativa (o que as libs da tela mandam). */
const EXEMPLOS: Partial<Record<AcaoNutricao, Record<string, unknown>>> = {
  anotacao_criar: { paciente_id: P, data: ISO, texto: "Subiu a carga", visibilidade: "equipe", autor_papel: "personal" },
  anotacao_editar: { id: ID, data: ISO, texto: "x", visibilidade: "nutricionistas", autor_papel: "nutricionista" },
  anotacao_excluir: { id: ID },
  consulta_criar: { paciente_id: P, data: ISO, observacao: null },
  consulta_editar: { id: ID, data: ISO, observacao: "retorno" },
  consulta_excluir: { id: ID },
  anamnese_criar: { paciente_id: P, modelo_id: null, titulo: "Anamnese", data: ISO, conteudo: [{ pergunta: "a", resposta: "b" }], texto_livre: null },
  anamnese_editar: { id: ID, titulo: "x", data: ISO, conteudo: [], texto_livre: "y" },
  anamnese_excluir: { id: ID },
  modelo_anamnese_criar: { titulo: "M", perguntas: ["a"], favorito: false },
  modelo_anamnese_editar: { id: ID, favorito: true },
  modelo_anamnese_excluir: { id: ID },
  questionario_criar: { titulo: "Q", descricao: "", perguntas: [], faixas: [], favorito: false },
  questionario_editar: { id: ID, titulo: "Q2" },
  questionario_excluir: { id: ID },
  aplicacao_criar: {
    paciente_id: P, questionario_id: null, titulo: "Q", perguntas: [], faixas: [], respostas: {}, pontuacao: 3, faixa: "", nivel: "", data: "2026-10-11",
    observacao: "",
  },
  aplicacao_editar: { id: ID, respostas: { p1: 2 }, pontuacao: 4, faixa: "Alta", nivel: "alto" },
  aplicacao_excluir: { id: ID },
  exame_catalogo_criar: { nome: "TSH", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "", favorito: true },
  exame_catalogo_editar: { id: ID, ref_max: null },
  exame_catalogo_excluir: { id: ID },
  pedido_exame_criar: { paciente_id: P, data: "2026-10-11", exames: ["TSH"], observacao: "" },
  pedido_exame_editar: { id: ID, exames: ["TSH", "HDL"] },
  pedido_exame_excluir: { id: ID },
  resultados_exame_criar: {
    paciente_id: P, data: "2026-10-11",
    linhas: [{ exame: "TSH", valor: 2.1, valor_texto: "", unidade: "mUI/L", ref_min: 0.4, ref_max: 4, referencia_texto: "" }],
  },
  resultado_exame_editar: { id: ID, valor: 2.5, observacao: "x" },
  resultado_exame_excluir: { id: ID },
  avaliacao_integrada_criar: { paciente_id: P, titulo: "360", texto: null, sintese: { blocos: [] }, fontes: {} },
  avaliacao_integrada_editar: { id: ID, titulo: "x", texto: "y" },
  avaliacao_integrada_regerar: { id: ID, sintese: { a: 1 }, fontes: { b: 2 } },
  avaliacao_integrada_excluir: { id: ID },
  gestacao_criar: { paciente_id: P, dum: "2026-05-01", dpp: "2027-02-05", peso_pre: 60, altura: 165, imc_pre: 22.04, gemelar: false, observacao: null },
  gestacao_editar: { id: ID, peso_pre: 61, imc_pre: 22.4 },
  gestacao_encerrar: { id: ID },
  gestacao_excluir: { id: ID },
  registro_gestacional_editar: { id: ID, data: "2026-10-11", peso: 63.5, pa_sistolica: 120, pa_diastolica: 80, observacao: null },
  registro_gestacional_excluir: { id: ID },
  interacao_criar: { medicamento: "Metformina", sinonimos: ["Glifage"], classe: "", nutriente: "B12", efeito: "reduz", gravidade: "moderada", conduta: "monitorar", fonte: "" },
  interacao_editar: { id: ID, conduta: "x" },
  interacao_excluir: { id: ID },
  medicamento_criar: { paciente_id: P, medicamento: "Metformina", interacao_id: null, dose: "", posologia: "", inicio: null, observacao: "" },
  medicamento_editar: { id: ID, ativo: false },
  medicamento_excluir: { id: ID },
  analise_farmaco_criar: { paciente_id: P, titulo: "Análise", parecer: "", medicamentos: [], interacoes: [] },
  analise_farmaco_editar: { id: ID, titulo: "x", parecer: "y" },
  analise_farmaco_excluir: { id: ID },
  modelo_documento_criar: { tipo: "atestado", titulo: "A", conteudo: "c", favorito: false },
  modelo_documento_editar: { id: ID, conteudo: "d" },
  modelo_documento_excluir: { id: ID },
  documento_criar: { paciente_id: P, modelo_id: null, tipo: "atestado", titulo: "A", texto: "t", dados: {}, data: "2026-10-11" },
  documento_editar: { id: ID, texto: "t2" },
  documento_excluir: { id: ID },
  anexo_editar: { id: ID, descricao: null },
};
const ESPECIAIS: AcaoNutricao[] = ["registro_gestacional_salvar", "anexo_preparar", "anexo_registrar", "anexo_excluir", "padroes_garantir"];
const DECLARATIVAS = ACOES_NUTRICAO.filter((a) => !ESPECIAIS.includes(a));

describe("hml-19a — a lista fechada de ações da nutricao", () => {
  it("58 ações: 53 declarativas (as 18 tabelas) + 5 especiais (registro do dia, 3 de anexo, padrões)", () => {
    expect(ACOES_NUTRICAO).toHaveLength(58);
    expect(DECLARATIVAS).toHaveLength(53);
    for (const a of ESPECIAIS) expect(ACOES[a].operacao, a).toBe("especial");
    expect(acaoDoPedido("anamnese_criar")).toBe("anamnese_criar");
    expect(acaoDoPedido("padroes_garantir")).toBe("padroes_garantir");
  });

  it("cada uma das 18 tabelas tem o criar, o editar e o excluir (as 59 gravações da spec §1.2)", () => {
    const por = (t: string, ops: string[]) => ACOES_NUTRICAO.filter((a) => ACOES[a].tabela === t && ops.includes(ACOES[a].operacao));
    for (const t of TABELAS_PRONTUARIO) {
      expect(por(t, ["inserir", "inserir_lote", "especial"]).length, `${t}: criar`).toBeGreaterThan(0);
      expect(por(t, ["editar", "especial"]).length, `${t}: editar`).toBeGreaterThan(0);
      expect(por(t, ["excluir_suave", "especial"]).length, `${t}: excluir`).toBeGreaterThan(0);
    }
    expect(new Set(ACOES_NUTRICAO.map((a) => ACOES[a].tabela).filter(Boolean))).toEqual(new Set(TABELAS_PRONTUARIO));
  });

  it("ação desconhecida (ou que não é texto) → null / acao_invalida; a especial não passa pelo CRUD", () => {
    for (const v of ["", "apagar_tudo", "ANAMNESE_CRIAR", "toString", "__proto__", "constructor", null, 1, {}]) expect(acaoDoPedido(v), String(v)).toBeNull();
    expect(montarGravacao("apagar_tudo", {}, EU)).toEqual({ ok: false, erro: "acao_invalida" });
    expect(montarGravacao("anexo_preparar", { paciente_id: P }, EU)).toEqual({ ok: false, erro: "acao_invalida" });
  });
});

describe("hml-19a — positivo: a gravação de cada ação declarativa", () => {
  it.each(DECLARATIVAS)("%s: monta a gravação na tabela certa (o dono é quem chama)", (acao) => {
    const corpo = EXEMPLOS[acao];
    expect(corpo, `falta o exemplo de ${acao}`).toBeTruthy();
    const g = montarGravacao(acao, { acao, ...corpo }, EU, AGORA);
    expect(g.ok, JSON.stringify(g)).toBe(true);
    if (g.ok === false) return;
    expect(g.tabela).toBe(ACOES[acao].tabela);
    expect(g.operacao).toBe(ACOES[acao].operacao);
    if (g.operacao === "inserir") {
      expect(g.valores.nutricionista_id).toBe(EU);
      expect(g.valores).not.toHaveProperty("acao");
    }
    if (g.operacao === "inserir_lote") for (const l of g.linhas) expect(l.nutricionista_id).toBe(EU);
    if (g.operacao === "editar" || g.operacao === "excluir_suave") {
      expect(g.id).toBe(ID);
      expect(g.valores).not.toHaveProperty("id");
      expect(g.valores).not.toHaveProperty("nutricionista_id");
    }
  });

  it("anamnese_criar: as colunas de hoje, nada a mais", () => {
    const g = montarGravacao("anamnese_criar", { acao: "anamnese_criar", ...EXEMPLOS.anamnese_criar }, EU, AGORA);
    expect(g).toEqual({
      ok: true, tabela: "anamneses", operacao: "inserir",
      valores: { nutricionista_id: EU, paciente_id: P, modelo_id: null, titulo: "Anamnese", data: ISO, conteudo: [{ pergunta: "a", resposta: "b" }], texto_livre: null },
    });
  });

  it("o que o servidor põe: a origem da consulta, o agora da 360 e da análise, o encerramento da gestação, o deleted_at", () => {
    const c = montarGravacao("consulta_criar", { ...EXEMPLOS.consulta_criar, origem: "importacao" }, EU, AGORA);
    expect(c.ok && c.operacao === "inserir" && c.valores.origem).toBe("manual");
    const a = montarGravacao("avaliacao_integrada_criar", { ...EXEMPLOS.avaliacao_integrada_criar, data: "2020-01-01T00:00:00Z" }, EU, AGORA);
    expect(a.ok && a.operacao === "inserir" && a.valores.data).toBe(AGORA.toISOString());
    const f = montarGravacao("analise_farmaco_criar", EXEMPLOS.analise_farmaco_criar!, EU, AGORA);
    expect(f.ok && f.operacao === "inserir" && f.valores.data).toBe(AGORA.toISOString());
    expect(montarGravacao("gestacao_encerrar", { id: ID }, EU, AGORA)).toEqual({
      ok: true, tabela: "gestacoes", operacao: "editar", id: ID, valores: { encerrada_em: AGORA.toISOString() },
    });
    expect(montarGravacao("documento_excluir", { id: ID.toUpperCase() }, EU, AGORA)).toEqual({
      ok: true, tabela: "documentos", operacao: "excluir_suave", id: ID, valores: { deleted_at: AGORA.toISOString() },
    });
  });

  it("resultados em lote: cada linha com o aluno, a data e o dono", () => {
    const g = montarGravacao("resultados_exame_criar", {
      paciente_id: P, data: "2026-10-11",
      linhas: [{ exame: "TSH", valor: 2.1 }, { exame: "Urina", valor: null, valor_texto: "negativo", nutricionista_id: OUTRA }],
    }, EU, AGORA);
    expect(g.ok && g.operacao === "inserir_lote" && g.linhas).toEqual([
      { exame: "TSH", valor: 2.1, paciente_id: P, data: "2026-10-11", nutricionista_id: EU },
      { exame: "Urina", valor: null, valor_texto: "negativo", paciente_id: P, data: "2026-10-11", nutricionista_id: EU },
    ]);
  });

  it("registro gestacional (salvar o do dia): as colunas conferidas, o aluno e a gestação à parte", () => {
    expect(lerRegistroGestacional({ gestacao_id: ID, paciente_id: P, data: "2026-10-11", peso: 63.5, pa_sistolica: null, pa_diastolica: null, observacao: null }, EU)).toEqual({
      ok: true, gestacaoId: ID, pacienteId: P, dia: "2026-10-11", valores: { data: "2026-10-11", peso: 63.5, pa_sistolica: null, pa_diastolica: null, observacao: null },
    });
  });
});

describe("hml-19a — negativo: o corpo não manda no dono nem nas colunas", () => {
  it("nutricionista_id, deleted_at, id, conta_id e created_at no corpo são ignorados (o dono é quem chama)", () => {
    const g = montarGravacao("documento_criar", {
      ...EXEMPLOS.documento_criar, nutricionista_id: OUTRA, deleted_at: "2026-01-01T00:00:00Z", id: ID, conta_id: OUTRA, created_at: ISO, path: "x",
    }, EU, AGORA);
    expect(g.ok).toBe(true);
    if (g.ok === false || g.operacao !== "inserir") return;
    expect(g.valores.nutricionista_id).toBe(EU);
    for (const c of ["deleted_at", "id", "conta_id", "created_at", "path"]) expect(g.valores, c).not.toHaveProperty(c);
  });

  it("editar não troca o dono, o aluno nem a Lixeira (as colunas fora da lista caem)", () => {
    const g = montarGravacao("anamnese_editar", { id: ID, titulo: "x", nutricionista_id: OUTRA, paciente_id: P, deleted_at: null }, EU, AGORA);
    expect(g).toEqual({ ok: true, tabela: "anamneses", operacao: "editar", id: ID, valores: { titulo: "x" } });
    // só colunas de fora = nada a mudar
    expect(montarGravacao("anamnese_editar", { id: ID, nutricionista_id: OUTRA }, EU, AGORA)).toMatchObject({ ok: false, erro: "dados_invalidos" });
  });

  it("uuid ruim (aluno, id, modelo) → dados_invalidos", () => {
    expect(montarGravacao("consulta_criar", { ...EXEMPLOS.consulta_criar, paciente_id: "abc" }, EU)).toMatchObject({ ok: false, erro: "dados_invalidos", campo: "paciente_id" });
    expect(montarGravacao("consulta_excluir", { id: "1; drop table consultas" }, EU)).toMatchObject({ ok: false, erro: "dados_invalidos", campo: "id" });
    expect(montarGravacao("consulta_editar", { id: 7, data: ISO }, EU)).toMatchObject({ ok: false, erro: "dados_invalidos", campo: "id" });
    expect(montarGravacao("anamnese_criar", { ...EXEMPLOS.anamnese_criar, modelo_id: "x" }, EU)).toMatchObject({ ok: false, campo: "modelo_id" });
    // quem chama também precisa ser um uuid (o user do token)
    expect(montarGravacao("consulta_excluir", { id: ID }, "nao-e-uuid")).toMatchObject({ ok: false, erro: "dados_invalidos" });
  });

  it("texto e JSON acima do teto → dados_invalidos (o teto fica acima do que a tela aceita)", () => {
    expect(montarGravacao("anotacao_criar", { ...EXEMPLOS.anotacao_criar, texto: "a".repeat(50_001) }, EU)).toMatchObject({ ok: false, campo: "texto" });
    expect(montarGravacao("anotacao_criar", { ...EXEMPLOS.anotacao_criar, texto: "a".repeat(20_000) }, EU).ok).toBe(true);
    expect(montarGravacao("exame_catalogo_criar", { nome: "x".repeat(501) }, EU)).toMatchObject({ ok: false, campo: "nome" });
    expect(montarGravacao("exame_catalogo_criar", { nome: "x".repeat(NOME_EXAME_MAX) }, EU).ok).toBe(true);
    const grande = [{ pergunta: "p", resposta: "r".repeat(1_000_001) }];
    expect(montarGravacao("anamnese_criar", { ...EXEMPLOS.anamnese_criar, conteudo: grande }, EU)).toMatchObject({ ok: false, campo: "conteudo" });
    expect(LIMITE_CORPO).toBe(2_000_000);
  });

  it("forma errada: lista × objeto, opção fora, data e instante ruins, número que não é número, obrigatório faltando", () => {
    expect(montarGravacao("anamnese_criar", { ...EXEMPLOS.anamnese_criar, conteudo: {} }, EU)).toMatchObject({ ok: false, campo: "conteudo" });
    expect(montarGravacao("documento_criar", { ...EXEMPLOS.documento_criar, dados: [] }, EU)).toMatchObject({ ok: false, campo: "dados" });
    expect(montarGravacao("anotacao_criar", { ...EXEMPLOS.anotacao_criar, visibilidade: "todos" }, EU)).toMatchObject({ ok: false, campo: "visibilidade" });
    expect(montarGravacao("anotacao_criar", { ...EXEMPLOS.anotacao_criar, autor_papel: "aluno" }, EU)).toMatchObject({ ok: false, campo: "autor_papel" });
    expect(montarGravacao("documento_criar", { ...EXEMPLOS.documento_criar, data: "11/10/2026" }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(montarGravacao("consulta_criar", { ...EXEMPLOS.consulta_criar, data: "ontem" }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(montarGravacao("aplicacao_editar", { id: ID, pontuacao: "3" }, EU)).toMatchObject({ ok: false, campo: "pontuacao" });
    expect(montarGravacao("aplicacao_editar", { id: ID, pontuacao: Number.NaN }, EU)).toMatchObject({ ok: false, campo: "pontuacao" });
    expect(montarGravacao("registro_gestacional_editar", { id: ID, pa_sistolica: 120.5 }, EU)).toMatchObject({ ok: false, campo: "pa_sistolica" });
    expect(montarGravacao("pedido_exame_criar", { ...EXEMPLOS.pedido_exame_criar, exames: ["TSH", 3] }, EU)).toMatchObject({ ok: false, campo: "exames" });
    expect(montarGravacao("consulta_criar", { paciente_id: P }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(montarGravacao("documento_criar", { ...EXEMPLOS.documento_criar, titulo: null }, EU)).toMatchObject({ ok: false, campo: "titulo" });
    expect(lerRegistroGestacional({ gestacao_id: ID, paciente_id: P, data: "2026-10-11" }, EU)).toMatchObject({ ok: false, campo: "peso" });
  });

  it("lote vazio, grande demais ou com linha ruim → dados_invalidos", () => {
    const base = { paciente_id: P, data: "2026-10-11" };
    expect(montarGravacao("resultados_exame_criar", { ...base, linhas: [] }, EU)).toMatchObject({ ok: false, campo: "linhas" });
    expect(montarGravacao("resultados_exame_criar", { ...base, linhas: Array.from({ length: 121 }, () => ({ exame: "x" })) }, EU)).toMatchObject({ ok: false, campo: "linhas" });
    expect(montarGravacao("resultados_exame_criar", { ...base, linhas: [{ exame: "x" }, "y"] }, EU)).toMatchObject({ ok: false, campo: "linhas" });
    expect(montarGravacao("resultados_exame_criar", { ...base, linhas: [{ valor: 1 }] }, EU)).toMatchObject({ ok: false, campo: "exame" });
    expect(montarGravacao("resultados_exame_criar", { data: "2026-10-11", linhas: [{ exame: "x" }] }, EU)).toMatchObject({ ok: false, campo: "paciente_id" });
  });

  it("valorDoCampo: null só onde a coluna aceita; o uuid sai em minúsculas", () => {
    expect(valorDoCampo({ tipo: "uuid" }, null)).toEqual({ ok: false });
    expect(valorDoCampo({ tipo: "uuid", nulo: true }, null)).toEqual({ ok: true, valor: null });
    expect(valorDoCampo({ tipo: "uuid" }, P.toUpperCase())).toEqual({ ok: true, valor: P });
    expect(valorDoCampo({ tipo: "booleano" }, "true")).toEqual({ ok: false });
    expect(valorDoCampo({ tipo: "instante" }, "2026-10-11T01:50:00.123456+00:00")).toEqual({ ok: true, valor: "2026-10-11T01:50:00.123456+00:00" });
  });
});

describe("hml-19a — anexos: o caminho é do servidor", () => {
  it("o caminho <quem chama>/<aluno>/<uuid>-<nome seguro> e o nome seguro igual ao da tela", () => {
    expect(caminhoDoAnexo(EU, P, "Exame de Sangue (Setembro).PDF", ID)).toBe(`${EU}/${P}/${ID}-exame-de-sangue-setembro.pdf`);
    for (const n of ["Exame de Sangue (Setembro).PDF", "ção ñ.jpeg", "  ", "a.tar.gz", "..", "x".repeat(300) + ".docx"]) expect(nomeSeguro(n), n).toBe(nomeSeguroDaTela(n));
    expect(bucketDosAnexos("staging")).toBe("anexos-staging");
    expect(bucketDosAnexos("public")).toBe("anexos");
  });

  it("os tipos e o tamanho do bucket (os mesmos da tela)", () => {
    expect([...ANEXO_MIMES].sort()).toEqual(Object.keys(MIMES_PERMITIDOS).sort());
    expect(ANEXO_MAX_BYTES).toBe(TAMANHO_MAX);
    const ok = lerPedidoDeAnexo({ paciente_id: P, nome: " laudo.pdf ", tipo: "application/PDF", tamanho: 1234 });
    expect(ok).toEqual({ ok: true, pacienteId: P, nome: "laudo.pdf", mime: "application/pdf", tamanho: 1234 });
    expect(lerPedidoDeAnexo({ paciente_id: P, nome: "x.exe", tipo: "application/x-msdownload", tamanho: 10 })).toEqual({ ok: false, erro: "tipo_invalido" });
    expect(lerPedidoDeAnexo({ paciente_id: P, nome: "x.pdf", tipo: "application/pdf", tamanho: TAMANHO_MAX + 1 })).toEqual({ ok: false, erro: "arquivo_grande" });
    expect(lerPedidoDeAnexo({ paciente_id: P, nome: "x.pdf", tipo: "application/pdf", tamanho: 0 })).toMatchObject({ ok: false, erro: "dados_invalidos" });
    expect(lerPedidoDeAnexo({ paciente_id: "x", nome: "x.pdf", tipo: "application/pdf", tamanho: 1 })).toMatchObject({ ok: false, campo: "paciente_id" });
  });

  it("N9: registrar com o caminho de outra pasta (outra pessoa, outro aluno, fora do formato) → fora_da_pasta", () => {
    const meu = caminhoDoAnexo(EU, P, "laudo.pdf", ID);
    const corpo = { paciente_id: P, nome: "laudo.pdf", tipo: "application/pdf", tamanho: 10, descricao: "  exame   de sangue " };
    expect(lerRegistroDeAnexo({ ...corpo, caminho: meu }, EU)).toEqual({
      ok: true, pacienteId: P, caminho: meu, nome: "laudo.pdf", mime: "application/pdf", tamanho: 10, descricao: "exame de sangue",
    });
    for (const caminho of [
      caminhoDoAnexo(OUTRA, P, "laudo.pdf", ID), caminhoDoAnexo(EU, OUTRA, "laudo.pdf", ID), `${EU}/${P}/laudo.pdf`, `${EU}/${P}/../${OUTRA}/${ID}-a.pdf`,
      `${EU}/${P}/${ID}-a.pdf/extra`, `/${EU}/${P}/${ID}-a.pdf`, null, 42,
    ]) {
      expect(lerRegistroDeAnexo({ ...corpo, caminho }, EU), String(caminho)).toEqual({ ok: false, erro: "fora_da_pasta" });
    }
    expect(caminhoDeQuemChama(meu, EU, P)).toBe(true);
  });
});

describe("hml-19a — os padrões (H-81): os textos de hoje, no servidor", () => {
  it("as 3 seções desta W, a tabela e a ordem da lista; formula/meta/orientacao ficam para a 19b", () => {
    expect(Object.keys(PADROES).sort()).toEqual([...SECOES_PADRAO].sort());
    expect(secaoDoPadrao("anamnese")).toBe("anamnese");
    for (const s of ["formula", "meta", "orientacao", "", "x", null]) expect(secaoDoPadrao(s), String(s)).toBeNull();
  });

  it("os textos movidos são os MESMOS que a tela usa (uma fonte só)", () => {
    expect(PERGUNTAS_PADRAO).toBe(PERGUNTAS_ANAMNESE_PADRAO);
    expect(TITULO_MODELO_PADRAO).toBe(TITULO_ANAMNESE_PADRAO);
    expect(MODELOS_PADRAO).toBe(MODELOS_DOCUMENTO_PADRAO);
    expect(CATALOGO_PADRAO).toBe(CATALOGO_EXAMES_PADRAO);
  });

  it("os itens da RPC: todos favoritos, sem dono (a RPC põe auth.uid())", () => {
    expect(itensPadrao("anamnese")).toEqual([{ titulo: "Anamnese geral (padrão)", perguntas: PERGUNTAS_ANAMNESE_PADRAO, favorito: true }]);
    expect(itensPadrao("documento").map((m) => m.tipo)).toEqual(["atestado", "receituario", "declaracao"]);
    expect(itensPadrao("exame")).toHaveLength(12);
    for (const s of SECOES_PADRAO) {
      for (const item of itensPadrao(s)) {
        expect(item.favorito, s).toBe(true);
        expect(item, s).not.toHaveProperty("nutricionista_id");
      }
    }
  });
});

describe("hml-19a — os erros: status e tradução do banco (o erro do banco nunca vai cru à tela)", () => {
  it("STATUS_DO_ERRO", () => {
    expect(statusDoErro("sem_login")).toBe(401);
    expect(statusDoErro("sem_acesso")).toBe(403);
    expect(statusDoErro("fora_da_pasta")).toBe(403);
    expect(statusDoErro("nao_encontrado")).toBe(404);
    expect(statusDoErro("conflito")).toBe(409);
    expect(statusDoErro("corpo_grande")).toBe(413);
    expect(statusDoErro("muitas_acoes")).toBe(429);
    expect(statusDoErro("erro_interno")).toBe(500);
    expect(statusDoErro("storage_falhou")).toBe(502);
    expect(statusDoErro("tempo_esgotado")).toBe(504);
    for (const e of ["acao_invalida", "dados_invalidos", "schema_invalido", "secao_invalida", "tipo_invalido", "arquivo_grande", "anexo_nao_enviado", "?", null]) {
      expect(statusDoErro(e), String(e)).toBe(400);
    }
    expect(Object.values(STATUS_DO_ERRO).every((s) => s >= 400)).toBe(true);
  });

  it("0 linha/42501/23505/22P02/23514 e o resto", () => {
    expect(erroDoBanco({ code: "42501", message: 'new row violates row-level security policy for table "anamneses"' })).toEqual({ erro: "sem_acesso", inesperado: false });
    expect(erroDoBanco({ code: "23505", message: "duplicate key" })).toEqual({ erro: "conflito", inesperado: false });
    for (const code of ["22P02", "23514", "23502", "23503", "22007", "22003", "22023"]) expect(erroDoBanco({ code }), code).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDoBanco({ code: "PGRST301", message: "JWT expired" })).toEqual({ erro: "sem_login", inesperado: false });
    expect(erroDoBanco({ code: "", message: "TimeoutError: Signal timed out." })).toEqual({ erro: "tempo_esgotado", inesperado: true });
    expect(erroDoBanco({ code: "57014", message: "canceling statement due to statement timeout" })).toEqual({ erro: "erro_interno", inesperado: true });
    expect(erroDoBanco(null)).toEqual({ erro: "erro_interno", inesperado: true });
  });
});

// ═════════════════════════════ hml-19b — a Dieta, as Dietas e o app do aluno ═════════════════════════════
const PLANO = "55555555-5555-4555-8555-555555555555";
const REF = "66666666-6666-4666-8666-666666666666";
const ALI = "77777777-7777-4777-8777-777777777777";

/** Um corpo válido e mínimo de cada ação declarativa da Dieta (o que as libs da tela mandam). */
const EXEMPLOS_DIETA: Partial<Record<AcaoDieta, Record<string, unknown>>> = {
  plano_editar: { id: ID, titulo: "Plano", kcal_alvo: 1800, observacao: null, favorito: true },
  plano_excluir: { id: ID },
  refeicao_criar: { plano_id: PLANO, nome: "Almoço", horario: "12:30", observacao: null, ordem: 2, dias_semana: [1, 3] },
  refeicao_editar: { id: ID, nome: "Almoço", horario: null, observacao: "leve" },
  refeicao_excluir: { id: ID },
  item_criar: { refeicao_id: REF, alimento_id: ALI, ordem: 0, quantidade_g: 50, medida_caseira_id: null, quantidade_medida: null, observacao: null },
  itens_criar: { linhas: [{ refeicao_id: REF, alimento_id: ALI, receita_id: ID, ordem: 3, quantidade_g: 40, medida_caseira_id: null, quantidade_medida: null, observacao: null }] },
  item_editar: { id: ID, quantidade_g: 60, medida_caseira_id: null, quantidade_medida: null, observacao: "x" },
  item_excluir: { id: ID },
  registro_diario_editar: { id: ID, data: "2026-10-11", agua_ml: 1500, sintomas: ["azia"], observacao: null },
  registro_diario_excluir: { id: ID },
  calculo_energetico_criar: {
    paciente_id: P, data: ISO, formula: "mifflin", peso: 70, altura: 170, idade: 30, sexo: "f", massa_magra: null, fator_atividade: 1.55, atividades: [],
    tmb: 1400, get: 2170, ajuste_kcal: -300, vet: 1870, objetivo: "perder", observacao: null,
  },
  calculo_energetico_editar: { id: ID, vet: 1900 },
  calculo_energetico_excluir: { id: ID },
  produto_criar: { nome: "Whey", marca: "", categoria: "suplemento", apresentacao: "", dose_padrao: "30 g", modo_uso: "", link: "", observacao: "", favorito: false },
  produto_editar: { id: ID, favorito: true },
  produto_excluir: { id: ID },
  indicacao_criar: {
    paciente_id: P, produto_id: null, produto_nome: "Creatina", produto_marca: "", produto_apresentacao: "", produto_categoria: "suplemento", dose: "3 g",
    horario: "", duracao: "", inicio: "2026-10-11", observacao: "", ordem: 2,
  },
  indicacao_editar: { id: ID, ativa: true, ordem: 4 },
  indicacao_excluir: { id: ID },
  modelo_formula_criar: { titulo: "F", ativos: [{ ativo: "x", dose: "1", unidade: "mg" }], posologia: "", quantidade: "", observacao: "", favorito: true },
  modelo_formula_editar: { id: ID, favorito: false },
  modelo_formula_excluir: { id: ID },
  formula_criar: { paciente_id: P, modelo_id: null, titulo: "F", ativos: [], posologia: "", quantidade: "", observacao: "" },
  formula_editar: { id: ID, titulo: "F2" },
  formula_excluir: { id: ID },
  modelo_meta_criar: { titulo: "M", descricao: "", dias_semana: [1, 2, 3, 4, 5, 6, 7], favorito: false },
  modelo_meta_editar: { id: ID, dias_semana: [6, 7] },
  modelo_meta_excluir: { id: ID },
  meta_criar: { paciente_id: P, modelo_id: null, titulo: "Água", descricao: "", dias_semana: [1], ativa: true },
  meta_editar: { id: ID, ativa: false },
  meta_excluir: { id: ID },
  modelo_orientacao_criar: { titulo: "O", conteudo: "## x", favorito: false },
  modelo_orientacao_editar: { id: ID, conteudo: "y" },
  modelo_orientacao_excluir: { id: ID },
  orientacao_criar: { paciente_id: P, modelo_id: null, titulo: "O", conteudo: "z" },
  orientacao_editar: { id: ID, titulo: "O", conteudo: "w" },
  orientacao_excluir: { id: ID },
  alimento_excluir: { id: ID },
  receita_editar: { id: ID, favorita: true },
  receita_excluir: { id: ID },
  grupo_receita_criar: { nome: "Lanches" },
  grupo_receita_editar: { id: ID, nome: "Lanches 2" },
};
const ESPECIAIS_DIETA: AcaoDieta[] = [
  "plano_criar", "plano_duplicar", "plano_copiar_semana", "dieta_ordenar", "registro_diario_salvar", "alimento_salvar", "receita_salvar", "grupo_receita_excluir",
  "diario_reagir", "diario_excluir",
];
const DECLARATIVAS_DIETA = ACOES_DA_DIETA.filter((a) => !ESPECIAIS_DIETA.includes(a));

describe("hml-19b — a lista fechada da Dieta e do app do aluno", () => {
  it("53 ações da Dieta (43 declarativas + 10 especiais) e 4 do app do aluno; as 3 listas não se cruzam", () => {
    expect(ACOES_DA_DIETA).toHaveLength(53);
    expect(DECLARATIVAS_DIETA).toHaveLength(43);
    for (const a of ESPECIAIS_DIETA) expect(ACOES_DIETA[a].operacao, a).toBe("especial");
    expect(ACOES_DO_ALUNO.sort()).toEqual(["aluno_diario_enviar", "aluno_diario_preparar", "aluno_marcar_meta", "aluno_marcar_refeicao"]);
    const todas = [...ACOES_NUTRICAO, ...ACOES_DA_DIETA, ...ACOES_DO_ALUNO];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("as 19 tabelas da spec §1.3 aparecem (as 2 filhas de RPC — medidas e ingredientes — pelo `tambem`); só as 4 filhas não têm dono", () => {
    const usadas = new Set<string>();
    for (const a of ACOES_DA_DIETA) {
      const d = ACOES_DIETA[a] as { tabela: string | null; tambem?: readonly string[] };
      if (d.tabela) usadas.add(d.tabela);
      for (const t of d.tambem ?? []) usadas.add(t);
    }
    expect(usadas).toEqual(new Set(TABELAS_DIETA));
    expect(TABELAS_DIETA).toHaveLength(19);
    expect(TABELAS_DIETA.filter((t) => !temDono(t)).sort()).toEqual([...TABELAS_DIETA_SEM_DONO].sort());
  });

  it("as 7 RPCs atômicas da migration são as das ações especiais (nenhuma a mais, nenhuma a menos)", () => {
    const rpcs = new Set(ACOES_DA_DIETA.map((a) => (ACOES_DIETA[a] as { rpc?: string }).rpc).filter(Boolean));
    expect(rpcs).toEqual(new Set(RPCS_DA_DIETA));
  });

  it("ação desconhecida → null / acao_invalida; a especial não passa pelo CRUD", () => {
    for (const v of ["", "plano_apagar_tudo", "PLANO_CRIAR", "toString", "__proto__", "constructor", null, 1, {}]) {
      expect(acaoDaDieta(v), String(v)).toBeNull();
      expect(acaoDoAluno(v), String(v)).toBeNull();
    }
    expect(montarGravacaoDieta("anamnese_criar", {}, EU)).toEqual({ ok: false, erro: "acao_invalida" });
    expect(montarGravacaoDieta("receita_salvar", {}, EU)).toEqual({ ok: false, erro: "acao_invalida" });
  });
});

describe("hml-19b — o despacho entre os 3 módulos da função (o do Prontuário não muda)", () => {
  it("cada ação vai ao seu módulo; os padrões da Dieta vão à Dieta e os do Prontuário (e seção ruim) seguem no Prontuário", () => {
    expect(moduloDoPedido({ acao: "anamnese_criar" })).toEqual({ modulo: "prontuario", acao: "anamnese_criar" });
    for (const secao of ["anamnese", "documento", "exame", "financeiro", undefined]) {
      expect(moduloDoPedido({ acao: "padroes_garantir", secao }), String(secao)).toEqual({ modulo: "prontuario", acao: "padroes_garantir" });
    }
    for (const secao of ["formula", "meta", "orientacao"]) {
      expect(moduloDoPedido({ acao: "padroes_garantir", secao }), secao).toEqual({ modulo: "dieta", acao: "padroes_garantir" });
    }
    expect(moduloDoPedido({ acao: "plano_criar" })).toEqual({ modulo: "dieta", acao: "plano_criar" });
    expect(moduloDoPedido({ acao: "aluno_marcar_refeicao" })).toEqual({ modulo: "aluno", acao: "aluno_marcar_refeicao" });
    for (const acao of ["", "apagar_tudo", "__proto__", null, 7]) expect(moduloDoPedido({ acao }), String(acao)).toBeNull();
  });
});

describe("hml-19b — positivo: a gravação de cada ação declarativa da Dieta", () => {
  it.each(DECLARATIVAS_DIETA)("%s: monta a gravação na tabela certa (o dono é quem chama, onde a tabela tem dono)", (acao) => {
    const corpo = EXEMPLOS_DIETA[acao];
    expect(corpo, `falta o exemplo de ${acao}`).toBeTruthy();
    const g = montarGravacaoDieta(acao, { acao, ...corpo }, EU, AGORA);
    expect(g.ok, JSON.stringify(g)).toBe(true);
    if (g.ok === false) return;
    const def = ACOES_DIETA[acao] as { tabela: string; operacao: string };
    expect(g.tabela).toBe(def.tabela);
    expect(g.operacao).toBe(def.operacao);
    if (g.operacao === "inserir") {
      expect(g.valores.nutricionista_id).toBe(temDono(g.tabela) ? EU : undefined);
      expect(g.valores).not.toHaveProperty("acao");
    }
    if (g.operacao === "inserir_lote") for (const l of g.linhas) expect(l).not.toHaveProperty("nutricionista_id");
    if (g.operacao === "editar" || g.operacao === "excluir_suave" || g.operacao === "excluir") expect(g.id).toBe(ID);
    if (g.operacao === "editar") {
      expect(g.valores).not.toHaveProperty("id");
      expect(g.valores).not.toHaveProperty("nutricionista_id");
    }
  });

  it("o que volta: o item com o alimento e a receita; a receita com os ingredientes (o select de hoje); o resto, a linha", () => {
    const item = montarGravacaoDieta("item_criar", EXEMPLOS_DIETA.item_criar!, EU, AGORA);
    expect(item.ok && item.operacao === "inserir" && item.volta).toMatch(/^\*, alimento:alimentos\(.*medidas_caseiras\(\*\)\), receita:receitas\(id, nome\)$/);
    const fav = montarGravacaoDieta("receita_editar", EXEMPLOS_DIETA.receita_editar!, EU, AGORA);
    expect(fav.ok && fav.operacao === "editar" && fav.volta).toMatch(/^\*, ingredientes:ingredientes_receita\(\*, alimento:alimentos\(/);
    const meta = montarGravacaoDieta("meta_criar", EXEMPLOS_DIETA.meta_criar!, EU, AGORA);
    expect(meta.ok && meta.operacao === "inserir" && meta.volta).toBe("*");
  });

  it("o servidor põe: a indicação nasce ativa; o deleted_at do excluir; refeição e item SEM dono (seguem o plano)", () => {
    const ind = montarGravacaoDieta("indicacao_criar", { ...EXEMPLOS_DIETA.indicacao_criar, ativa: false }, EU, AGORA);
    expect(ind.ok && ind.operacao === "inserir" && ind.valores.ativa).toBe(true);
    expect(montarGravacaoDieta("formula_excluir", { id: ID.toUpperCase() }, EU, AGORA)).toEqual({
      ok: true, tabela: "formulas_manipuladas", operacao: "excluir_suave", id: ID, valores: { deleted_at: AGORA.toISOString() }, vivos: false,
    });
    expect(montarGravacaoDieta("refeicao_criar", EXEMPLOS_DIETA.refeicao_criar!, EU, AGORA)).toEqual({
      ok: true, tabela: "refeicoes", operacao: "inserir", volta: "*",
      valores: { plano_id: PLANO, ordem: 2, nome: "Almoço", horario: "12:30", observacao: null, dias_semana: [1, 3] },
    });
    expect(montarGravacaoDieta("item_excluir", { id: ID }, EU, AGORA)).toEqual({ ok: true, tabela: "itens_refeicao", operacao: "excluir", id: ID });
  });

  it("vivos: receita, grupo e alimento só mexem no que está fora da Lixeira (o filtro que a lib já fazia)", () => {
    for (const a of ["receita_editar", "receita_excluir", "grupo_receita_editar", "alimento_excluir"] as AcaoDieta[]) {
      const g = montarGravacaoDieta(a, EXEMPLOS_DIETA[a]!, EU, AGORA);
      expect(g.ok && (g.operacao === "editar" || g.operacao === "excluir_suave") && g.vivos, a).toBe(true);
    }
    const plano = montarGravacaoDieta("plano_excluir", { id: ID }, EU, AGORA);
    expect(plano.ok && plano.operacao === "excluir_suave" && plano.vivos).toBe(false);
  });
});

describe("hml-19b — negativo: o corpo não manda no dono nem nas colunas (Dieta)", () => {
  it("nutricionista_id, deleted_at, id, conta_id e created_at no corpo são ignorados (o dono é quem chama)", () => {
    const g = montarGravacaoDieta("orientacao_criar", {
      ...EXEMPLOS_DIETA.orientacao_criar, nutricionista_id: OUTRA, deleted_at: "2026-01-01T00:00:00Z", id: ID, conta_id: OUTRA, created_at: ISO,
    }, EU, AGORA);
    expect(g.ok).toBe(true);
    if (g.ok === false || g.operacao !== "inserir") return;
    expect(g.valores.nutricionista_id).toBe(EU);
    for (const c of ["deleted_at", "id", "conta_id", "created_at"]) expect(g.valores, c).not.toHaveProperty(c);
    // o item "Da receita" em lote: o dono que viesse na linha cai (itens não têm dono)
    const lote = montarGravacaoDieta("itens_criar", { linhas: [{ ...(EXEMPLOS_DIETA.itens_criar!.linhas as object[])[0], nutricionista_id: OUTRA }] }, EU, AGORA);
    expect(lote.ok && lote.operacao === "inserir_lote" && lote.linhas[0]).not.toHaveProperty("nutricionista_id");
  });

  it("editar não troca o dono, o aluno, o plano da refeição nem a Lixeira; só colunas de fora = nada a mudar", () => {
    expect(montarGravacaoDieta("meta_editar", { id: ID, titulo: "x", nutricionista_id: OUTRA, paciente_id: P, deleted_at: null }, EU, AGORA))
      .toMatchObject({ ok: true, valores: { titulo: "x" } });
    expect(montarGravacaoDieta("refeicao_editar", { id: ID, plano_id: PLANO, ordem: 9 }, EU, AGORA)).toMatchObject({ ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" });
  });

  it("uuid ruim, dias fora de 1–7, ordem negativa, texto acima do teto, lote vazio/grande → dados_invalidos", () => {
    expect(montarGravacaoDieta("meta_criar", { ...EXEMPLOS_DIETA.meta_criar, paciente_id: "x" }, EU)).toMatchObject({ ok: false, campo: "paciente_id" });
    expect(montarGravacaoDieta("meta_criar", { ...EXEMPLOS_DIETA.meta_criar, dias_semana: [0, 8] }, EU)).toMatchObject({ ok: false, campo: "dias_semana" });
    expect(montarGravacaoDieta("modelo_meta_editar", { id: ID, dias_semana: [1.5] }, EU)).toMatchObject({ ok: false, campo: "dias_semana" });
    expect(montarGravacaoDieta("refeicao_criar", { ...EXEMPLOS_DIETA.refeicao_criar, ordem: -1 }, EU)).toMatchObject({ ok: false, campo: "ordem" });
    expect(montarGravacaoDieta("orientacao_editar", { id: ID, conteudo: "a".repeat(50_001) }, EU)).toMatchObject({ ok: false, campo: "conteudo" });
    expect(montarGravacaoDieta("item_excluir", { id: "1; drop table itens_refeicao" }, EU)).toMatchObject({ ok: false, campo: "id" });
    expect(montarGravacaoDieta("itens_criar", { linhas: [] }, EU)).toMatchObject({ ok: false, campo: "linhas" });
    expect(montarGravacaoDieta("itens_criar", { linhas: Array.from({ length: 201 }, () => (EXEMPLOS_DIETA.itens_criar!.linhas as object[])[0]) }, EU)).toMatchObject({ ok: false, campo: "linhas" });
    expect(montarGravacaoDieta("itens_criar", { linhas: [{ refeicao_id: REF, alimento_id: ALI, quantidade_g: 1 }] }, EU)).toMatchObject({ ok: false, campo: "ordem" });
    expect(montarGravacaoDieta("plano_excluir", { id: ID }, "nao-e-uuid")).toMatchObject({ ok: false, erro: "dados_invalidos" });
  });
});

describe("hml-19b — as ações especiais: o corpo das RPCs atômicas, do registro do dia e do diário", () => {
  const REFEICOES = [{ nome: "Café da manhã", horario: "07:00", ordem: 0 }, { nome: "Ceia", horario: "22:00", ordem: 5 }];

  it("plano_criar: o aluno, as colunas do plano e as refeições (até 30); o dono e o método não vêm do corpo", () => {
    expect(lerPlanoNovo({ paciente_id: P, titulo: "Plano", kcal_alvo: 1800, observacao: null, calculo_energetico_id: null, refeicoes: REFEICOES, nutricionista_id: OUTRA, metodo: "x" }))
      .toEqual({ ok: true, pacienteId: P, plano: { titulo: "Plano", kcal_alvo: 1800, observacao: null, calculo_energetico_id: null }, refeicoes: REFEICOES });
    expect(lerPlanoNovo({ paciente_id: P, titulo: "Plano", refeicoes: Array.from({ length: 31 }, () => REFEICOES[0]) })).toMatchObject({ ok: false, campo: "refeicoes" });
    expect(lerPlanoNovo({ paciente_id: P, titulo: "Plano", refeicoes: [{ nome: "x" }] })).toMatchObject({ ok: false, campo: "ordem" });
    expect(lerPlanoNovo({ paciente_id: P, refeicoes: [] })).toMatchObject({ ok: false, campo: "titulo" });
  });

  it("plano_duplicar: o plano e o título; com paciente = usar modelo ★", () => {
    expect(lerDuplicarPlano({ plano_id: PLANO, titulo: "Plano (cópia)", nutricionista_id: OUTRA })).toEqual({ ok: true, planoId: PLANO, pacienteId: null, titulo: "Plano (cópia)" });
    expect(lerDuplicarPlano({ plano_id: PLANO, titulo: "Plano", paciente_id: P })).toEqual({ ok: true, planoId: PLANO, pacienteId: P, titulo: "Plano" });
    expect(lerDuplicarPlano({ plano_id: PLANO, titulo: "   " })).toMatchObject({ ok: false, campo: "titulo" });
    expect(lerDuplicarPlano({ plano_id: "x", titulo: "a" })).toMatchObject({ ok: false, campo: "plano_id" });
  });

  it("plano_copiar_semana e dieta_ordenar: listas de ids sem repetição; a tabela numa lista fechada", () => {
    expect(lerCopiarSemana({ para_todos: [ID], para_apagar: [REF] })).toEqual({ ok: true, paraTodos: [ID], paraApagar: [REF] });
    expect(lerCopiarSemana({ para_todos: [], para_apagar: [] })).toMatchObject({ ok: false, campo: "nada_a_mudar" });
    expect(lerCopiarSemana({ para_todos: [ID], para_apagar: [ID] })).toMatchObject({ ok: false, campo: "para_apagar" });
    expect(lerCopiarSemana({ para_todos: [ID, ID] })).toMatchObject({ ok: false, campo: "para_todos" });
    expect(TABELAS_QUE_ORDENAM).toEqual(["refeicoes", "indicacoes_produto"]);
    expect(lerOrdenar({ tabela: "refeicoes", ordens: [{ id: ID, ordem: 1 }, { id: REF, ordem: 2 }] })).toEqual({ ok: true, tabela: "refeicoes", ids: [ID, REF], ordens: [1, 2] });
    expect(lerOrdenar({ tabela: "planos_alimentares", ordens: [{ id: ID, ordem: 1 }] })).toMatchObject({ ok: false, campo: "tabela" });
    expect(lerOrdenar({ tabela: "refeicoes", ordens: [] })).toMatchObject({ ok: false, campo: "ordens" });
    expect(lerOrdenar({ tabela: "refeicoes", ordens: [{ id: ID, ordem: 1 }, { id: ID, ordem: 2 }] })).toMatchObject({ ok: false, campo: "ordens" });
    expect(lerOrdenar({ tabela: "refeicoes", ordens: [{ id: ID, ordem: -1 }] })).toMatchObject({ ok: false, campo: "ordem" });
  });

  it("receita_salvar e alimento_salvar: criar (o nome é obrigatório) ou editar pelo id; as colunas de fora caem", () => {
    const ing = { alimento_id: ALI, quantidade_g: 50, medida_caseira_id: null, quantidade_medida: null, ordem: 0, observacao: "" };
    expect(lerReceita({ receita: { nome: "Bolo", porcoes: 8, nutricionista_id: OUTRA }, ingredientes: [ing] }))
      .toEqual({ ok: true, id: null, receita: { nome: "Bolo", porcoes: 8 }, ingredientes: [ing] });
    expect(lerReceita({ id: ID, receita: { favorita: true }, ingredientes: [] })).toEqual({ ok: true, id: ID, receita: { favorita: true }, ingredientes: [] });
    expect(lerReceita({ receita: { porcoes: 1 }, ingredientes: [] })).toMatchObject({ ok: false, campo: "nome" });
    expect(lerReceita({ id: "x", receita: { nome: "a" }, ingredientes: [] })).toMatchObject({ ok: false, campo: "id" });
    expect(lerReceita({ receita: { nome: "a" }, ingredientes: Array.from({ length: 101 }, () => ing) })).toMatchObject({ ok: false, campo: "ingredientes" });
    const med = { descricao: "colher", gramas: 10, ordem: 0 };
    expect(lerAlimento({ alimento: { nome: "Granola", porcao_g: 40, nutrientes: { ferro_mg: 1 }, fonte: "taco", nutricionista_id: OUTRA }, medidas: [med] }))
      .toEqual({ ok: true, id: null, alimento: { nome: "Granola", porcao_g: 40, nutrientes: { ferro_mg: 1 } }, medidas: [med] });
    expect(lerAlimento({ id: ID, alimento: { nome: "G" }, medidas: [{ descricao: "x", gramas: 1 }] })).toMatchObject({ ok: false, campo: "ordem" });
    expect(lerAlimento({ alimento: [], medidas: [] })).toMatchObject({ ok: false, campo: "alimento" });
  });

  it("registro_diario_salvar: o aluno e o dia à parte; o dono vem de quem chama", () => {
    expect(lerRegistroDiario({ paciente_id: P, data: "2026-10-11", agua_ml: 2000, sintomas: [], observacao: null, nutricionista_id: OUTRA }, EU))
      .toEqual({ ok: true, pacienteId: P, dia: "2026-10-11", valores: { data: "2026-10-11", agua_ml: 2000, sintomas: [], observacao: null } });
    expect(lerRegistroDiario({ paciente_id: P }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(lerRegistroDiario({ paciente_id: P, data: "2026-10-11", agua_ml: 1.5 }, EU)).toMatchObject({ ok: false, campo: "agua_ml" });
  });

  it("diario_reagir: a reação, o comentário aparado (até 300, o teto da tela) e o agora do SERVIDOR; sem reação tira tudo", () => {
    expect(COMENTARIO_NUTRI_MAX).toBe(COMENTARIO_NUTRI_DA_TELA);
    expect([...["otimo", "bom", "atencao", "evitar"]]).toEqual(REACOES.map((r) => r.valor));
    expect(lerReacao({ id: ID, reacao: "otimo", comentario: `  ${"a".repeat(400)} ` }, AGORA)).toEqual({
      ok: true, id: ID, valores: { reacao_nutri: "otimo", comentario_nutri: "a".repeat(300), reagido_em: AGORA.toISOString() },
    });
    expect(lerReacao({ id: ID, reacao: null, comentario: "x" }, AGORA)).toEqual({ ok: true, id: ID, valores: { reacao_nutri: null, comentario_nutri: "", reagido_em: null } });
    expect(lerReacao({ id: ID, reacao: "amei" }, AGORA)).toMatchObject({ ok: false, campo: "reacao" });
    expect(lerReacao({ id: ID, reacao: "bom", comentario: "a".repeat(2001) }, AGORA)).toMatchObject({ ok: false, campo: "comentario" });
  });
});

describe("hml-19b — o app do aluno: marcar e a foto do diário pelo link assinado", () => {
  const NUTRI = "88888888-8888-4888-8888-888888888888";
  const MEU = caminhoDoDiario(NUTRI, P, "image/jpeg", ID);

  it("marcar: o id, o dia e o ✓ (todos obrigatórios)", () => {
    expect(lerMarcacao({ refeicao_id: REF, data: "2026-10-11", concluida: true }, "refeicao_id")).toEqual({ ok: true, id: REF, dia: "2026-10-11", concluida: true });
    expect(lerMarcacao({ meta_id: ID, data: "2026-10-11", concluida: false, paciente_id: OUTRA }, "meta_id")).toEqual({ ok: true, id: ID, dia: "2026-10-11", concluida: false });
    expect(lerMarcacao({ refeicao_id: REF, data: "2026-10-11" }, "refeicao_id")).toMatchObject({ ok: false, campo: "concluida" });
    expect(lerMarcacao({ refeicao_id: REF, data: "11/10/2026", concluida: true }, "refeicao_id")).toMatchObject({ ok: false, campo: "data" });
    expect(ACOES_ALUNO.aluno_marcar_refeicao.rpc).toBe("paciente_marcar_refeicao");
    expect(ACOES_ALUNO.aluno_marcar_meta.rpc).toBe("aluno_marcar_meta");
    expect(ACOES_ALUNO.aluno_diario_enviar.rpc).toBe("diario_enviar");
  });

  it("o caminho <nutri>/<aluno>/<uuid>.<ext> montado no servidor é o MESMO formato do app (nomeObjeto); os tipos e o tamanho são os do app", () => {
    expect(MEU).toBe(nomeObjeto(NUTRI, P, "image/jpeg", ID));
    expect(caminhoDoDiario(NUTRI, P, "image/heic", ID)).toBe(nomeObjeto(NUTRI, P, "image/heic", ID));
    expect({ ...DIARIO_MIMES }).toEqual(MIMES_DIARIO);
    expect(DIARIO_MAX_BYTES).toBe(FOTO_TAMANHO_MAX);
    expect(bucketDoDiario("staging")).toBe("diario-staging");
    expect(bucketDoDiario("public")).toBe("diario");
  });

  it("preparar: a matrícula, o tipo (só imagem do diário) e até 10 MB", () => {
    expect(lerPedidoDeFotoDoDiario({ paciente_id: P, nutricionista_id: NUTRI, tipo: "image/JPEG", tamanho: 1234 })).toEqual({
      ok: true, pacienteId: P, nutriId: NUTRI, mime: "image/jpeg", tamanho: 1234,
    });
    expect(lerPedidoDeFotoDoDiario({ paciente_id: P, nutricionista_id: NUTRI, tipo: "application/pdf", tamanho: 10 })).toEqual({ ok: false, erro: "tipo_invalido" });
    expect(lerPedidoDeFotoDoDiario({ paciente_id: P, nutricionista_id: NUTRI, tipo: "image/png", tamanho: FOTO_TAMANHO_MAX + 1 })).toEqual({ ok: false, erro: "arquivo_grande" });
    expect(lerPedidoDeFotoDoDiario({ paciente_id: P, nutricionista_id: "x", tipo: "image/png", tamanho: 1 })).toMatchObject({ ok: false, campo: "nutricionista_id" });
  });

  it("N9: registrar a foto com o caminho de outra pasta (outra nutri, outro aluno, fora do formato) → fora_da_pasta", () => {
    const corpo = { paciente_id: P, nutricionista_id: NUTRI, tipo: "image/jpeg", tamanho: 10, codigo: " ABC123 ", refeicao: "almoco", comentario: "  oi ", data_hora: ISO };
    expect(lerEnvioDoDiario({ ...corpo, caminho: MEU })).toEqual({
      ok: true, pacienteId: P, nutriId: NUTRI, mime: "image/jpeg", tamanho: 10, caminho: MEU, codigo: "abc123", refeicao: "almoco", comentario: "oi", dataHora: ISO,
    });
    for (const caminho of [
      caminhoDoDiario(OUTRA, P, "image/jpeg", ID), caminhoDoDiario(NUTRI, OUTRA, "image/jpeg", ID), `${NUTRI}/${P}/foto.jpg`, `${NUTRI}/${P}/../${OUTRA}/${ID}.jpg`,
      `${MEU}/extra`, `/${MEU}`, `${NUTRI}/${P}/${ID}.exe`, null, 42,
    ]) {
      expect(lerEnvioDoDiario({ ...corpo, caminho }), String(caminho)).toEqual({ ok: false, erro: "fora_da_pasta" });
    }
    expect(caminhoDoDiarioValido(MEU, NUTRI, P)).toBe(true);
    expect(lerEnvioDoDiario({ ...corpo, caminho: MEU, codigo: "  " })).toMatchObject({ ok: false, campo: "codigo" });
  });
});

describe("hml-19b — os erros das RPCs: o código de propósito vai à tela; o resto é a tradução do banco", () => {
  it("os códigos que o app já traduz passam como estão (sem aviso ao Weslley)", () => {
    for (const code of ERROS_DA_MARCACAO) expect(erroDaRpc({ code: "22023", message: code }, ERROS_DA_MARCACAO), code).toEqual({ erro: code, inesperado: false });
    for (const code of ERROS_DO_DIARIO) expect(erroDaRpc({ code: "P0001", message: code }, ERROS_DO_DIARIO), code).toEqual({ erro: code, inesperado: false });
    expect(erroDaRpc({ code: "P0002", message: "nao_encontrado" }, ["nao_encontrado"])).toEqual({ erro: "nao_encontrado", inesperado: false });
  });

  it("fora da lista: a tradução de sempre (o RLS 42501 = sem_acesso; o P0001 desconhecido = erro_interno com aviso)", () => {
    expect(erroDaRpc({ code: "42501", message: "sem_acesso" }, ERROS_DA_MARCACAO)).toEqual({ erro: "sem_acesso", inesperado: false });
    expect(erroDaRpc({ code: "22023", message: "dados_invalidos" }, [])).toEqual({ erro: "dados_invalidos", inesperado: false });
    expect(erroDaRpc({ code: "P0001", message: "outra coisa" }, ERROS_DO_DIARIO)).toEqual({ erro: "erro_interno", inesperado: true });
    expect(erroDaRpc({ code: "P0002", message: "nao_encontrado" }, [])).toEqual({ erro: "erro_interno", inesperado: true });
  });

  it("STATUS: o diário desligado/link/código = 403; muitos envios = 429; os outros do app = 400", () => {
    for (const e of ["codigo_invalido", "diario_desligado", "link_desligado"]) expect(statusDoErro(e), e).toBe(403);
    expect(statusDoErro("muitos_envios")).toBe(429);
    for (const e of ["sem_alimentos", "meta_pausada", "fora_do_dia", "data_invalida", "refeicao_invalida", "arquivo_nao_encontrado"]) expect(statusDoErro(e), e).toBe(400);
    expect(STATUS_DO_ERRO.sem_acesso).toBe(403);
  });
});

describe("hml-19b — os padrões de Manipulados, Metas e Orientações: os textos de hoje, no servidor", () => {
  it("as 3 seções da Dieta, a tabela e a ordem da lista (as do Prontuário seguem à parte)", () => {
    expect(Object.keys(PADROES_DIETA).sort()).toEqual([...SECOES_PADRAO_DIETA].sort());
    for (const s of SECOES_PADRAO_DIETA) expect(secaoDoPadraoDaDieta(s)).toBe(s);
    for (const s of ["anamnese", "documento", "exame", "", "x", null]) expect(secaoDoPadraoDaDieta(s), String(s)).toBeNull();
    expect(PADROES_DIETA.meta).toEqual({ tabela: "modelos_meta", ordem: "titulo" });
  });

  it("os textos movidos são os MESMOS que a tela usa (uma fonte só)", () => {
    expect(METAS_PADRAO).toBe(MODELOS_META_PADRAO);
    expect(FORMULAS_PADRAO).toBe(MODELOS_FORMULA_PADRAO);
    expect(TITULO_ORIENTACAO_DA_TELA).toBe(TITULO_ORIENTACAO_PADRAO);
    expect(CONTEUDO_MODELO_PADRAO).toBe(CONTEUDO_ORIENTACAO_PADRAO);
  });

  it("os itens da RPC = exatamente o que as libs gravavam no 1º acesso (título aparado, ativos e dias normalizados, favoritos, sem dono)", () => {
    expect(itensPadraoDaDieta("formula")).toEqual(MODELOS_FORMULA_PADRAO.map((m) => ({
      titulo: m.titulo.trim(), ativos: normalizarAtivos(m.ativos), posologia: m.posologia, quantidade: m.quantidade, observacao: m.observacao, favorito: true,
    })));
    expect(itensPadraoDaDieta("meta")).toEqual(MODELOS_META_PADRAO.map((m) => ({ titulo: m.titulo.trim(), descricao: m.descricao, dias_semana: normalizarDias(m.dias_semana), favorito: true })));
    expect(itensPadraoDaDieta("orientacao")).toEqual([{ titulo: "Orientações gerais (padrão)", conteudo: CONTEUDO_ORIENTACAO_PADRAO, favorito: true }]);
    expect(itensPadraoDaDieta("formula")).toHaveLength(3);
    expect(itensPadraoDaDieta("meta")).toHaveLength(5);
    for (const s of SECOES_PADRAO_DIETA) for (const item of itensPadraoDaDieta(s)) expect(item, s).not.toHaveProperty("nutricionista_id");
  });
});

// ═════════════════════════════ hml-19c — a Avaliação (antropometria, fotos de evolução, aviso) ═════════════════════════════
/** Um registro de antropometria como a tela monta hoje (formParaRegistro do modal: a data com a hora, os números, as medidas). */
const REGISTRO_ANTRO = formParaRegistro({
  ...formNovo({ genero: "feminino", nascimento: "1990-05-01" }, "pollock3", new Date("2026-10-11T13:00:00.000Z")),
  peso: "63,5", altura: "165", circunferencias: { cintura: "70", quadril: "98" }, dobras: { triceps: "12", suprailiaca: "15", coxa: "20" },
  observacao: "  inicio  ",
});
const ESPECIAIS_AVALIACAO: AcaoAvaliacao[] = ["foto_evolucao_preparar", "foto_evolucao_registrar", "foto_evolucao_excluir", "avaliacao_avisar"];

describe("hml-19c — a lista fechada da Avaliação (a 4ª da função)", () => {
  it("8 ações: antropometria (3), foto de evolução (4) e o aviso; 4 especiais; as 4 listas não se cruzam", () => {
    expect(ACOES_DA_AVALIACAO.sort()).toEqual([
      "antropometria_criar", "antropometria_editar", "antropometria_excluir", "avaliacao_avisar", "foto_evolucao_editar", "foto_evolucao_excluir",
      "foto_evolucao_preparar", "foto_evolucao_registrar",
    ]);
    for (const a of ESPECIAIS_AVALIACAO) expect(ACOES_AVALIACAO[a].operacao, a).toBe("especial");
    const todas = [...ACOES_NUTRICAO, ...ACOES_DA_DIETA, ...ACOES_DO_ALUNO, ...ACOES_DA_AVALIACAO];
    expect(new Set(todas).size).toBe(todas.length);
  });

  it("as 2 tabelas da spec §1.4 (principal) aparecem; o aviso é a RPC de hoje", () => {
    const usadas = new Set(ACOES_DA_AVALIACAO.map((a) => ACOES_AVALIACAO[a].tabela).filter(Boolean));
    expect(usadas).toEqual(new Set(TABELAS_AVALIACAO));
    expect(ACOES_AVALIACAO.avaliacao_avisar.rpc).toBe("aluno_avisar_avaliacao");
  });

  it("ação desconhecida → null; a especial não passa pelo CRUD; o CRUD da Avaliação não aceita ação de outra lista", () => {
    for (const v of ["", "antropometria_apagar", "ANTROPOMETRIA_CRIAR", "toString", "__proto__", "constructor", null, 1, {}]) {
      expect(acaoDaAvaliacao(v), String(v)).toBeNull();
    }
    for (const a of ESPECIAIS_AVALIACAO) expect(montarGravacaoAvaliacao(a, {}, EU), a).toEqual({ ok: false, erro: "acao_invalida" });
    expect(montarGravacaoAvaliacao("anamnese_criar", {}, EU)).toEqual({ ok: false, erro: "acao_invalida" });
    expect(montarGravacaoAvaliacao("avaliacao_integrada_criar", {}, EU)).toEqual({ ok: false, erro: "acao_invalida" });
  });

  it("o despacho: as da Avaliação vão ao módulo novo; as de antes seguem nos seus (a avaliação 360 é do Prontuário)", () => {
    for (const acao of ACOES_DA_AVALIACAO) expect(moduloDoPedido({ acao }), acao).toEqual({ modulo: "avaliacao", acao });
    expect(moduloDoPedido({ acao: "avaliacao_integrada_criar" })).toEqual({ modulo: "prontuario", acao: "avaliacao_integrada_criar" });
    expect(moduloDoPedido({ acao: "plano_criar" })).toEqual({ modulo: "dieta", acao: "plano_criar" });
    expect(moduloDoPedido({ acao: "aluno_marcar_meta" })).toEqual({ modulo: "aluno", acao: "aluno_marcar_meta" });
    for (const acao of ["avaliacao_apagar", "foto_preparar", "foto_salvar", "__proto__", null]) expect(moduloDoPedido({ acao }), String(acao)).toBeNull();
  });
});

describe("hml-19c — positivo: a gravação da antropometria e da foto de evolução", () => {
  it("as colunas aceitas são as que a tela grava hoje (o colunas(r) de antropometrias.ts = as chaves do registro do modal)", () => {
    expect(Object.keys(C_ANTROPOMETRIA).sort()).toEqual(Object.keys(REGISTRO_ANTRO).sort());
    expect(Object.keys(REGISTRO_ANTRO)).toHaveLength(10);
  });

  it("antropometria_criar: o aluno, as 10 colunas e o dono = quem chama", () => {
    expect(montarGravacaoAvaliacao("antropometria_criar", { paciente_id: P, ...REGISTRO_ANTRO }, EU)).toEqual({
      ok: true, tabela: "antropometrias", operacao: "inserir", valores: { paciente_id: P, ...REGISTRO_ANTRO, nutricionista_id: EU },
    });
    // o mínimo: o aluno e a data (o resto tem o padrão do banco)
    expect(montarGravacaoAvaliacao("antropometria_criar", { paciente_id: P, data: ISO }, EU)).toEqual({
      ok: true, tabela: "antropometrias", operacao: "inserir", valores: { paciente_id: P, data: ISO, nutricionista_id: EU },
    });
  });

  it("antropometria_editar e _excluir; foto_evolucao_editar (posição, data e observação)", () => {
    expect(montarGravacaoAvaliacao("antropometria_editar", { id: ID.toUpperCase(), ...REGISTRO_ANTRO }, EU)).toEqual({
      ok: true, tabela: "antropometrias", operacao: "editar", id: ID, valores: { ...REGISTRO_ANTRO },
    });
    expect(montarGravacaoAvaliacao("antropometria_excluir", { id: ID }, EU, AGORA)).toEqual({
      ok: true, tabela: "antropometrias", operacao: "excluir_suave", id: ID, valores: { deleted_at: AGORA.toISOString() },
    });
    expect(montarGravacaoAvaliacao("foto_evolucao_editar", { id: ID, posicao: "lado_d", data: "2026-10-01", observacao: null }, EU)).toEqual({
      ok: true, tabela: "fotos_evolucao", operacao: "editar", id: ID, valores: { posicao: "lado_d", data: "2026-10-01", observacao: null },
    });
    expect(montarGravacaoAvaliacao("foto_evolucao_editar", { id: ID, observacao: "início" }, EU)).toMatchObject({ ok: true, valores: { observacao: "início" } });
  });

  it("as listas da tela são as do servidor (uma fonte só): protocolos, sexos, posições, tipos e tamanho da foto, os tetos", () => {
    expect([...PROTOCOLOS_ANTROPOMETRIA].sort()).toEqual(PROTOCOLOS.map((p) => p.valor).sort());
    expect([...SEXOS_ANTROPOMETRIA].sort()).toEqual(SEXOS.map((s) => s.valor).sort());
    expect([...POSICOES_FOTO_EVOLUCAO]).toEqual(POSICOES.map((p) => p.valor));
    expect([...FOTO_EVOLUCAO_MIMES].sort()).toEqual(Object.keys(MIMES_FOTO).sort());
    expect(FOTO_EVOLUCAO_MAX_BYTES).toBe(FOTO_EVOLUCAO_DA_TELA);
    // o teto do servidor fica ACIMA do que a tela aceita (a observação da antropometria até 4000; a da foto até 300)
    expect(valorDoCampo(C_ANTROPOMETRIA.observacao, "x".repeat(OBSERVACAO_MAX)).ok).toBe(true);
    expect(valorDoCampo(C_FOTO_EVOLUCAO.observacao, "x".repeat(OBSERVACAO_FOTO_MAX)).ok).toBe(true);
    expect(bucketDaEvolucao("staging")).toBe("evolucao-staging");
    expect(bucketDaEvolucao("public")).toBe("evolucao");
  });
});

describe("hml-19c — negativo: o corpo não manda no dono nem nas colunas (Avaliação)", () => {
  it("nutricionista_id, deleted_at, id, conta_id e created_at no corpo são ignorados (o dono é quem chama)", () => {
    const g = montarGravacaoAvaliacao("antropometria_criar", {
      paciente_id: P, data: ISO, nutricionista_id: OUTRA, deleted_at: ISO, id: ID, conta_id: OUTRA, created_at: ISO,
    }, EU);
    expect(g).toEqual({ ok: true, tabela: "antropometrias", operacao: "inserir", valores: { paciente_id: P, data: ISO, nutricionista_id: EU } });
  });

  it("editar não troca o aluno, o dono, o caminho da foto nem a Lixeira; só colunas de fora = nada a mudar", () => {
    expect(montarGravacaoAvaliacao("antropometria_editar", { id: ID, peso: 70, paciente_id: OUTRA, nutricionista_id: OUTRA, deleted_at: null }, EU))
      .toEqual({ ok: true, tabela: "antropometrias", operacao: "editar", id: ID, valores: { peso: 70 } });
    expect(montarGravacaoAvaliacao("foto_evolucao_editar", { id: ID, path: `${OUTRA}/${P}/x.jpg`, paciente_id: OUTRA, tamanho: 1 }, EU))
      .toEqual({ ok: false, erro: "dados_invalidos", campo: "nada_a_mudar" });
  });

  it("uuid ruim, opção fora, forma errada, texto acima do teto e obrigatório faltando → dados_invalidos", () => {
    const criar = (extra: Record<string, unknown>) => montarGravacaoAvaliacao("antropometria_criar", { paciente_id: P, data: ISO, ...extra }, EU);
    expect(montarGravacaoAvaliacao("antropometria_criar", { paciente_id: "x", data: ISO }, EU)).toMatchObject({ ok: false, erro: "dados_invalidos", campo: "paciente_id" });
    expect(montarGravacaoAvaliacao("antropometria_criar", { data: ISO }, EU)).toMatchObject({ ok: false, campo: "paciente_id" });
    expect(montarGravacaoAvaliacao("antropometria_criar", { paciente_id: P }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(criar({ sexo: "outro" })).toMatchObject({ ok: false, campo: "sexo" });
    expect(criar({ sexo: null })).toMatchObject({ ok: true });
    expect(criar({ protocolo: "jp7" })).toMatchObject({ ok: false, campo: "protocolo" });
    expect(criar({ protocolo: null })).toMatchObject({ ok: false, campo: "protocolo" });
    expect(criar({ circunferencias: [70] })).toMatchObject({ ok: false, campo: "circunferencias" });
    expect(criar({ resultados: "x".repeat(10) })).toMatchObject({ ok: false, campo: "resultados" });
    expect(criar({ dobras: { triceps: "x".repeat(100_001) } })).toMatchObject({ ok: false, campo: "dobras" });
    expect(criar({ peso: "63,5" })).toMatchObject({ ok: false, campo: "peso" });
    expect(criar({ idade: 30.5 })).toMatchObject({ ok: false, campo: "idade" });
    expect(criar({ observacao: "x".repeat(20_001) })).toMatchObject({ ok: false, campo: "observacao" });
    expect(criar({ data: "11/10/2026" })).toMatchObject({ ok: false, campo: "data" });
    expect(montarGravacaoAvaliacao("antropometria_editar", { id: "x", peso: 70 }, EU)).toMatchObject({ ok: false, campo: "id" });
    expect(montarGravacaoAvaliacao("antropometria_excluir", { id: 7 }, EU)).toMatchObject({ ok: false, campo: "id" });
    expect(montarGravacaoAvaliacao("foto_evolucao_editar", { id: ID, posicao: "lateral" }, EU)).toMatchObject({ ok: false, campo: "posicao" });
    expect(montarGravacaoAvaliacao("foto_evolucao_editar", { id: ID, data: "2026-13-01" }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(montarGravacaoAvaliacao("foto_evolucao_editar", { id: ID, observacao: "x".repeat(2_001) }, EU)).toMatchObject({ ok: false, campo: "observacao" });
    expect(montarGravacaoAvaliacao("antropometria_criar", { paciente_id: P, data: ISO }, "nao-e-uuid")).toMatchObject({ ok: false, campo: "user" });
  });
});

describe("hml-19c — as fotos de evolução: o caminho é do servidor, o arquivo pelo link assinado", () => {
  const MEU = caminhoDoAnexo(EU, P, "Minha Foto (frente).JPG", ID);
  const PEDIDO = { paciente_id: P, nome: "Minha Foto (frente).JPG", tipo: "image/jpeg", tamanho: 1234 };

  it("o caminho <quem chama>/<aluno>/<uuid>-<nome seguro> é o MESMO do montarPath da tela de hoje", () => {
    expect(MEU).toBe(montarPath(EU, P, "Minha Foto (frente).JPG", ID));
    expect(caminhoDoAnexo(EU, P, "a.webp", ID)).toBe(montarPath(EU, P, "a.webp", ID));
  });

  it("preparar: o aluno, o nome, o tipo (só JPEG/PNG/WebP, como o bucket) e até 10 MB", () => {
    expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, tipo: "IMAGE/JPEG" })).toEqual({ ok: true, pacienteId: P, nome: PEDIDO.nome, mime: "image/jpeg", tamanho: 1234 });
    for (const tipo of ["application/pdf", "image/heic", "image/gif", "", null]) expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, tipo }), String(tipo)).toEqual({ ok: false, erro: "tipo_invalido" });
    expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, tamanho: FOTO_EVOLUCAO_DA_TELA })).toMatchObject({ ok: true });
    expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, tamanho: FOTO_EVOLUCAO_DA_TELA + 1 })).toEqual({ ok: false, erro: "arquivo_grande" });
    for (const tamanho of [0, -1, 1.5, "10", null]) expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, tamanho }), String(tamanho)).toMatchObject({ ok: false, campo: "tamanho" });
    expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, nome: "  " })).toMatchObject({ ok: false, campo: "nome" });
    expect(lerPedidoDeFotoEvolucao({ ...PEDIDO, paciente_id: "x" })).toMatchObject({ ok: false, campo: "paciente_id" });
  });

  it("registrar: o caminho de quem chama + posição, data (obrigatórias) e observação; o dono e o tamanho não vêm do corpo", () => {
    const corpo = { ...PEDIDO, caminho: MEU, posicao: "frente", data: "2026-10-11", observacao: "início", nutricionista_id: OUTRA, path: "x", tamanho: 1234 };
    expect(lerRegistroDeFotoEvolucao(corpo, EU)).toEqual({
      ok: true, pacienteId: P, caminho: MEU, mime: "image/jpeg", tamanho: 1234, valores: { posicao: "frente", data: "2026-10-11", observacao: "início" },
    });
    expect(lerRegistroDeFotoEvolucao({ ...corpo, posicao: undefined }, EU)).toMatchObject({ ok: false, campo: "posicao" });
    expect(lerRegistroDeFotoEvolucao({ ...corpo, data: undefined }, EU)).toMatchObject({ ok: false, campo: "data" });
    expect(lerRegistroDeFotoEvolucao({ ...corpo, posicao: "lado" }, EU)).toMatchObject({ ok: false, campo: "posicao" });
  });

  it("N9: registrar com o caminho de outra pasta (outra pessoa, outro aluno, fora do formato) → fora_da_pasta", () => {
    const corpo = { ...PEDIDO, posicao: "frente", data: "2026-10-11" };
    for (const caminho of [
      caminhoDoAnexo(OUTRA, P, "a.jpg", ID), caminhoDoAnexo(EU, OUTRA, "a.jpg", ID), `${EU}/${P}/foto.jpg`, `${EU}/${P}/../${OUTRA}/${ID}-a.jpg`,
      `${MEU}/extra`, `/${MEU}`, null, 42,
    ]) {
      expect(lerRegistroDeFotoEvolucao({ ...corpo, caminho }, EU), String(caminho)).toEqual({ ok: false, erro: "fora_da_pasta" });
    }
    // o caminho é de quem CHAMA: o mesmo caminho, chamado por outra pessoa, é de outra pasta
    expect(lerRegistroDeFotoEvolucao({ ...corpo, caminho: MEU }, OUTRA)).toEqual({ ok: false, erro: "fora_da_pasta" });
  });
});

describe("hml-19c — o aviso 'avaliação nova': os códigos da RPC de hoje", () => {
  it("os códigos que a w14_matricula_da_rota devolve passam como estão; o resto é a tradução do banco", () => {
    for (const code of ERROS_DO_AVISO) expect(erroDaRpc({ code: "P0001", message: code }, ERROS_DO_AVISO), code).toEqual({ erro: code, inesperado: false });
    expect(erroDaRpc({ code: "P0001", message: "outra coisa" }, ERROS_DO_AVISO)).toEqual({ erro: "erro_interno", inesperado: true });
    expect(erroDaRpc({ code: "42501", message: "x" }, ERROS_DO_AVISO)).toEqual({ erro: "sem_acesso", inesperado: false });
  });

  it("STATUS: aluno_inexistente 404; sem_acesso 403; sem_login 401; arquivo_nao_encontrado (a foto não chegou) 400", () => {
    expect(statusDoErro("aluno_inexistente")).toBe(404);
    expect(statusDoErro("sem_acesso")).toBe(403);
    expect(statusDoErro("sem_login")).toBe(401);
    expect(statusDoErro("arquivo_nao_encontrado")).toBe(400);
  });
});
