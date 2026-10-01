// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/documentosUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  MODELOS_PADRAO, TAGS_ATESTADO, TAGS_DOCUMENTO, TIPOS_DOCUMENTO, aplicarTagsDocumento, contarPorTipo, dadosDoForm, dadosExemploDocumento, filtrarDocumentos,
  formInicialDocumento, formParaRegistroDocumento, inserirDocumento, lerDadosProfissionais, modeloInicialDoTipo, modelosDoTipo, nomeArquivoPDFDocumento,
  ordenarDocumentos, ordenarModelosDocumento, parseDias, rotuloTipo, tagsDoTipo, temTagPendente, textoContagemDocumentos, textoDias, tituloPadrao,
  validarDocumento, validarModeloDocumento, type FormDocumento,
} from "./documentosUtil";

const hoje = new Date(2026, 8, 19, 10, 0, 0); // 19/09/2026
const dados = { nomePaciente: "Maria da Silva", cpf: "12345678909", data: "2026-09-19", nomeNutricionista: "Ana Nutri", diasAfastamento: 2, cid: "Z00.0" };

describe("tipos e tags", () => {
  it("tem os 3 tipos com rótulo, plural e botão", () => {
    expect(TIPOS_DOCUMENTO.map((t) => t.tipo)).toEqual(["atestado", "receituario", "declaracao"]);
    expect(TIPOS_DOCUMENTO.map((t) => t.rotulo)).toEqual(["Atestado", "Receituário", "Declaração"]);
    expect(TIPOS_DOCUMENTO.map((t) => t.botao)).toEqual(["Novo atestado", "Novo receituário", "Nova declaração"]);
    expect(rotuloTipo("receituario")).toBe("Receituário");
    expect(rotuloTipo("outro")).toBe("outro");
  });
  it("só o atestado tem as tags de dias e CID", () => {
    expect(tagsDoTipo("atestado")).toHaveLength(TAGS_DOCUMENTO.length + TAGS_ATESTADO.length);
    expect(tagsDoTipo("receituario")).toEqual(TAGS_DOCUMENTO);
    expect(tagsDoTipo("declaracao").map((t) => t.tag)).not.toContain("*|CID|*");
  });
  it("textoDias", () => {
    expect(textoDias(1)).toBe("1 dia");
    expect(textoDias(2)).toBe("2 dias");
    expect(textoDias(0)).toBe("—");
    expect(textoDias(null)).toBe("—");
  });
  it("aplicarTagsDocumento substitui todas as tags conhecidas (inclusive o alias da W13) e deixa a desconhecida", () => {
    const t = "*|NOME_PACIENTE|* (*|CPF_PACIENTE|* = *|NUMERO_DOCUMENTO_PACIENTE|*) *|DIAS_AFASTAMENTO|* CID *|CID|* em *|DATA_HOJE|*. *|NOME_NUTRICIONISTA|* *|CARIMBO|* *|OUTRA|*";
    expect(aplicarTagsDocumento(t, dados)).toBe("Maria da Silva (123.456.789-09 = 123.456.789-09) 2 dias CID Z00.0 em 19/09/2026. Ana Nutri [carimbo] *|OUTRA|*");
    expect(temTagPendente(aplicarTagsDocumento(t, dados))).toBe(true);
    expect(temTagPendente(aplicarTagsDocumento("*|NOME_PACIENTE|* *|CID|*", dados))).toBe(false);
  });
  it("aplicarTagsDocumento: sem CPF, sem nutricionista, sem CID e sem dias", () => {
    const r = aplicarTagsDocumento("*|CPF_PACIENTE|*|*|NOME_NUTRICIONISTA|*|*|CID|*|*|DIAS_AFASTAMENTO|*", { nomePaciente: "X", cpf: null, data: "2026-01-02", nomeNutricionista: null });
    expect(r).toBe("não informado|Nutricionista|não informado|—");
  });
});

describe("modelos padrão", () => {
  it("são 3, um por tipo, e nenhum deixa tag pendente com os dados de exemplo", () => {
    expect(MODELOS_PADRAO.map((m) => m.tipo)).toEqual(["atestado", "receituario", "declaracao"]);
    for (const m of MODELOS_PADRAO) {
      expect(m.titulo.length).toBeGreaterThan(3);
      expect(m.conteudo).toContain("*|NOME_PACIENTE|*");
      expect(m.conteudo).toContain("*|CPF_PACIENTE|*");
      expect(m.conteudo).toContain("*|DATA_HOJE|*");
      expect(m.conteudo).toContain("*|NOME_NUTRICIONISTA|*");
      expect(m.conteudo).toContain("*|CARIMBO|*");
      expect(temTagPendente(aplicarTagsDocumento(m.conteudo, dadosExemploDocumento("Ana Nutri", hoje)))).toBe(false);
    }
    const atestado = MODELOS_PADRAO[0].conteudo;
    expect(atestado).toContain("*|DIAS_AFASTAMENTO|*");
    expect(atestado).toContain("*|CID|*");
    expect(aplicarTagsDocumento(atestado, dados)).toContain("necessitando de 2 dias de afastamento");
  });
  it("tituloPadrao", () => {
    expect(tituloPadrao("atestado", hoje)).toBe("Atestado 19/09/2026");
    expect(tituloPadrao("declaracao", hoje)).toBe("Declaração 19/09/2026");
  });
});

describe("ordenação, filtro e contagem", () => {
  const docs = [
    { id: "a", tipo: "atestado", created_at: "2026-09-19T10:00:00Z" },
    { id: "b", tipo: "receituario", created_at: "2026-09-19T12:00:00Z" },
    { id: "c", tipo: "atestado", created_at: "2026-09-18T09:00:00Z" },
  ];
  it("ordenarDocumentos: mais recente primeiro; inserirDocumento substitui pelo id", () => {
    expect(ordenarDocumentos(docs).map((d) => d.id)).toEqual(["b", "a", "c"]);
    const nova = inserirDocumento(docs, { id: "a", tipo: "atestado", created_at: "2026-09-20T00:00:00Z" });
    expect(nova.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(nova).toHaveLength(3);
  });
  it("filtrarDocumentos e contarPorTipo", () => {
    expect(filtrarDocumentos(docs, "todos")).toHaveLength(3);
    expect(filtrarDocumentos(docs, "atestado").map((d) => d.id)).toEqual(["a", "c"]);
    expect(filtrarDocumentos(docs, "declaracao")).toEqual([]);
    expect(contarPorTipo(docs)).toEqual({ todos: 3, atestado: 2, receituario: 1, declaracao: 0 });
  });
  it("textoContagemDocumentos", () => {
    expect(textoContagemDocumentos(0)).toBe("Nenhum documento");
    expect(textoContagemDocumentos(1)).toBe("1 documento");
    expect(textoContagemDocumentos(4)).toBe("4 documentos");
  });
});

describe("modelos", () => {
  const modelos = [
    { id: "1", tipo: "atestado", favorito: false, titulo: "B atestado" },
    { id: "2", tipo: "atestado", favorito: true, titulo: "Z favorito" },
    { id: "3", tipo: "declaracao", favorito: true, titulo: "Decl" },
    { id: "4", tipo: "atestado", favorito: false, titulo: "A atestado" },
  ];
  it("favoritos primeiro e alfabético; por tipo; inicial do tipo", () => {
    expect(ordenarModelosDocumento(modelos).map((m) => m.id)).toEqual(["3", "2", "4", "1"]);
    expect(modelosDoTipo(modelos, "atestado").map((m) => m.id)).toEqual(["2", "4", "1"]);
    expect(modeloInicialDoTipo(modelos, "atestado")?.id).toBe("2");
    expect(modeloInicialDoTipo(modelos, "receituario")).toBeNull();
  });
  it("validarModeloDocumento", () => {
    expect(validarModeloDocumento("atestado", "", "x")).toBe("Dê um título ao modelo");
    expect(validarModeloDocumento("atestado", "T", "  \n ")).toBe("Escreva o texto do modelo");
    expect(validarModeloDocumento("outro", "T", "x")).toBe("Escolha o tipo do modelo");
    expect(validarModeloDocumento("declaracao", "T", "x")).toBeNull();
    expect(validarModeloDocumento("declaracao", "T".repeat(121), "x")).toBe("Título muito longo");
  });
});

describe("formulário ⇄ registro", () => {
  it("parseDias", () => {
    expect(parseDias("2")).toBe(2);
    expect(parseDias(" 3 ")).toBe(3);
    expect(parseDias("0")).toBeNull();
    expect(parseDias("")).toBeNull();
    expect(parseDias("abc")).toBeNull();
    expect(parseDias("400")).toBeNull();
    expect(parseDias("1,9")).toBe(1);
  });
  it("formInicialDocumento: título do tipo + data, texto do modelo, 1 dia só no atestado", () => {
    const f = formInicialDocumento("atestado", { id: "m1", conteudo: "abc *|CID|*" }, hoje);
    expect(f).toEqual({ modeloId: "m1", titulo: "Atestado 19/09/2026", texto: "abc *|CID|*", dias: "1", cid: "", data: "2026-09-19" });
    const g = formInicialDocumento("receituario", null, hoje);
    expect(g.modeloId).toBe("");
    expect(g.texto).toBe("");
    expect(g.dias).toBe("");
    expect(g.titulo).toBe("Receituário 19/09/2026");
  });
  it("dadosDoForm: dias/CID só no atestado; data inválida cai em hoje", () => {
    const f: FormDocumento = { modeloId: "", titulo: "T", texto: "x", dias: "2", cid: " Z00.0 ", data: "2026-09-10" };
    expect(dadosDoForm("atestado", f, { nome: "Maria", cpf: "12345678909" }, "Ana", hoje)).toEqual({
      nomePaciente: "Maria", cpf: "12345678909", data: "2026-09-10", nomeNutricionista: "Ana", diasAfastamento: 2, cid: "Z00.0",
    });
    const d = dadosDoForm("receituario", { ...f, data: "x" }, { nome: "Maria", cpf: null }, null, hoje);
    expect(d.diasAfastamento).toBeNull();
    expect(d.cid).toBeNull();
    expect(d.data).toBe("2026-09-19");
  });
  it("validarDocumento", () => {
    const base: FormDocumento = { modeloId: "m", titulo: "Atestado", texto: "x", dias: "2", cid: "", data: "2026-09-19" };
    expect(validarDocumento("atestado", base, "Texto final")).toBeNull();
    expect(validarDocumento("atestado", { ...base, titulo: " " }, "Texto")).toBe("Dê um título ao documento");
    expect(validarDocumento("atestado", { ...base, dias: "" }, "Texto")).toBe("Informe os dias de afastamento (1 a 365)");
    expect(validarDocumento("receituario", { ...base, dias: "" }, "Texto")).toBeNull();
    expect(validarDocumento("declaracao", base, "  ")).toBe("Escreva o texto do documento");
    expect(validarDocumento("declaracao", base, "Falta *|OUTRA|*")).toBe("Ainda há uma tag sem valor no texto (*|…|*)");
    expect(validarDocumento("atestado", { ...base, cid: "X".repeat(21) }, "Texto")).toBe("CID muito longo");
  });
  it("formParaRegistroDocumento: dados só no atestado, título e texto normalizados", () => {
    const f: FormDocumento = { modeloId: "m1", titulo: "  Atestado   de hoje ", texto: "ignorado", dias: "2", cid: "Z00.0", data: "2026-09-19" };
    expect(formParaRegistroDocumento("atestado", f, "Linha 1  \r\n\r\n\r\n\r\nLinha 2\n", hoje)).toEqual({
      tipo: "atestado", modelo_id: "m1", titulo: "Atestado de hoje", texto: "Linha 1\n\nLinha 2", dados: { dias_afastamento: 2, cid: "Z00.0" }, data: "2026-09-19",
    });
    const r = formParaRegistroDocumento("declaracao", { ...f, modeloId: "", titulo: "", cid: "", data: "ruim" }, "T", hoje);
    expect(r.modelo_id).toBeNull();
    expect(r.titulo).toBe("Declaração 19/09/2026");
    expect(r.dados).toEqual({});
    expect(r.data).toBe("2026-09-19");
  });
  it("nomeArquivoPDFDocumento", () => {
    expect(nomeArquivoPDFDocumento("atestado", "Maria José da Conceição", "2026-09-19")).toBe("atestado-maria-jose-da-conceicao-20260919.pdf");
    expect(nomeArquivoPDFDocumento("receituario", "", "x")).toBe("receituario-paciente-data.pdf");
  });
  it("lerDadosProfissionais", () => {
    expect(lerDadosProfissionais(null)).toBeNull();
    expect(lerDadosProfissionais({})).toBeNull();
    expect(lerDadosProfissionais({ crn: " ", telefone: "" })).toBeNull();
    expect(lerDadosProfissionais({ crn: " 12345 ", extra: 1 })).toEqual({ crn: "12345", telefone: null, endereco: null });
    expect(lerDadosProfissionais([1])).toBeNull();
  });
});
