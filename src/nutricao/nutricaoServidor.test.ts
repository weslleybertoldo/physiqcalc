// Physiq hml-19a (H-41 · H-81 · jeito 2) — as regras PURAS da função nutricao (supabase-principal/functions/_shared/nutricao-regras.ts):
// as mesmas que rodam na borda (Deno). Positivo: cada ação conhecida monta a gravação certa, com o dono = quem chama. Negativo: ação
// desconhecida, coluna fora da lista, dono no corpo, uuid ruim, texto/JSON acima do teto, anexo fora da pasta, o status de cada erro.
import { describe, expect, it } from "vitest";
import {
  ACOES, ACOES_NUTRICAO, ANEXO_MAX_BYTES, ANEXO_MIMES, LIMITE_CORPO, PADROES, STATUS_DO_ERRO, TABELAS_PRONTUARIO, acaoDoPedido, bucketDosAnexos,
  caminhoDeQuemChama, caminhoDoAnexo, erroDoBanco, lerPedidoDeAnexo, lerRegistroDeAnexo, lerRegistroGestacional, montarGravacao, nomeSeguro,
  secaoDoPadrao, statusDoErro, valorDoCampo, type AcaoNutricao,
} from "../../supabase-principal/functions/_shared/nutricao-regras";
import {
  CATALOGO_EXAMES_PADRAO, MODELOS_DOCUMENTO_PADRAO, PERGUNTAS_ANAMNESE_PADRAO, SECOES_PADRAO, TITULO_ANAMNESE_PADRAO, itensPadrao,
} from "../../supabase-principal/functions/_shared/nutricao-padroes";
import { PERGUNTAS_PADRAO, TITULO_MODELO_PADRAO } from "@/nutricao/prontuario/lib/anamneseUtil";
import { MODELOS_PADRAO } from "@/nutricao/prontuario/lib/documentosUtil";
import { CATALOGO_PADRAO, NOME_EXAME_MAX } from "@/nutricao/prontuario/lib/examesUtil";
import { MIMES_PERMITIDOS, TAMANHO_MAX, nomeSeguro as nomeSeguroDaTela } from "@/nutricao/editor/lib/anexosUtil";

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
