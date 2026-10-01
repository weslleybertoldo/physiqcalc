// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/orientacoesUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  CONTEUDO_MODELO_PADRAO, TITULO_MODELO_PADRAO, blocosDoMarkdown, contarTopicos, ehVazio, formParaRegistro, inserirOrdenada, nomeArquivoPDF,
  normalizarConteudo, ordenarModelos, ordenarOrientacoes, registroParaForm, textoContagem, textoSemMarcas, textoTopicos, tituloPadrao, topicosDoTexto,
  trechosInline,
} from "./orientacoesUtil";

const iso = (ano: number, mes: number, dia: number, hora: number, minuto: number): string => new Date(ano, mes - 1, dia, hora, minuto).toISOString();

describe("blocosDoMarkdown", () => {
  it("reconhece título, subtítulo, lista e parágrafo; linha em branco separa; linhas seguidas viram um parágrafo", () => {
    expect(blocosDoMarkdown("# Título\n## Sub\n- a\n* b\n\nPar 1 linha 1\nlinha 2\n\nPar 2")).toEqual([
      { tipo: "titulo", texto: "Título" },
      { tipo: "subtitulo", texto: "Sub" },
      { tipo: "lista", itens: ["a", "b"] },
      { tipo: "paragrafo", texto: "Par 1 linha 1 linha 2" },
      { tipo: "paragrafo", texto: "Par 2" },
    ]);
  });
  it("lista encerra o parágrafo anterior e vice-versa; CRLF e espaços extras não atrapalham", () => {
    expect(blocosDoMarkdown("texto\r\n-  item   um \r\noutro texto")).toEqual([
      { tipo: "paragrafo", texto: "texto" },
      { tipo: "lista", itens: ["item um"] },
      { tipo: "paragrafo", texto: "outro texto" },
    ]);
  });
  it("### e mais fundo viram subtítulo; #hashtag colado e # sozinho são texto", () => {
    expect(blocosDoMarkdown("### Fundo\n#hashtag\n#")).toEqual([
      { tipo: "subtitulo", texto: "Fundo" },
      { tipo: "paragrafo", texto: "#hashtag #" },
    ]);
  });
  it("vazio e nulo", () => {
    expect(blocosDoMarkdown("")).toEqual([]);
    expect(blocosDoMarkdown("  \n\n  ")).toEqual([]);
    expect(blocosDoMarkdown(null)).toEqual([]);
  });
});

describe("trechosInline", () => {
  it("separa o negrito", () => {
    expect(trechosInline("a **b** c")).toEqual([{ texto: "a ", negrito: false }, { texto: "b", negrito: true }, { texto: " c", negrito: false }]);
    expect(trechosInline("**só negrito**")).toEqual([{ texto: "só negrito", negrito: true }]);
    expect(trechosInline("**x** e **y**")).toEqual([{ texto: "x", negrito: true }, { texto: " e ", negrito: false }, { texto: "y", negrito: true }]);
  });
  it("** sem par fica literal; textoSemMarcas tira as marcas", () => {
    expect(trechosInline("a **b c")).toEqual([{ texto: "a **b c", negrito: false }]);
    expect(textoSemMarcas("a **b** c")).toBe("a b c");
  });
});

describe("tópicos", () => {
  it("conta títulos/subtítulos; sem nenhum, conta itens de lista e parágrafos", () => {
    expect(contarTopicos(blocosDoMarkdown("## A\ntexto\n## B\n- x\n- y"))).toBe(2);
    expect(contarTopicos(blocosDoMarkdown("- x\n- y\n\ntexto"))).toBe(3);
    expect(contarTopicos([])).toBe(0);
    expect(topicosDoTexto("# T\n## S")).toBe(2);
  });
  it("texto da contagem", () => {
    expect(textoTopicos(0)).toBe("sem conteúdo");
    expect(textoTopicos(1)).toBe("1 tópico");
    expect(textoTopicos(8)).toBe("8 tópicos");
  });
  it("o modelo padrão tem 8 tópicos, uma lista e não é vazio", () => {
    expect(TITULO_MODELO_PADRAO).toBe("Orientações gerais (padrão)");
    expect(topicosDoTexto(CONTEUDO_MODELO_PADRAO)).toBe(8);
    expect(ehVazio(CONTEUDO_MODELO_PADRAO)).toBe(false);
    expect(blocosDoMarkdown(CONTEUDO_MODELO_PADRAO).some((b) => b.tipo === "lista")).toBe(true);
  });
  it("ehVazio", () => {
    expect(ehVazio("")).toBe(true);
    expect(ehVazio("  \n ")).toBe(true);
    expect(ehVazio(null)).toBe(true);
    expect(ehVazio("- item")).toBe(false);
  });
});

describe("título, conteúdo e contagem", () => {
  it("tituloPadrao usa a data", () => {
    expect(tituloPadrao(new Date(2026, 8, 19))).toBe("Orientações 19/09/2026");
  });
  it("normalizarConteudo: CRLF → LF, sem espaço no fim da linha, no máximo uma linha em branco seguida, sem sobras nas pontas", () => {
    expect(normalizarConteudo("\n\na  \r\n\r\n\r\nb \n\n")).toBe("a\n\nb");
    expect(normalizarConteudo(null)).toBe("");
  });
  it("contagem de orientações", () => {
    expect(textoContagem(0)).toBe("Nenhuma orientação");
    expect(textoContagem(1)).toBe("1 orientação");
    expect(textoContagem(2)).toBe("2 orientações");
  });
});

describe("ordenação", () => {
  it("modelos: favoritos primeiro, depois alfabético", () => {
    const m = [
      { titulo: "Zebra", favorito: false },
      { titulo: "Alfa", favorito: false },
      { titulo: "Mango", favorito: true },
      { titulo: "Beta", favorito: true },
    ];
    expect(ordenarModelos(m).map((x) => x.titulo)).toEqual(["Beta", "Mango", "Alfa", "Zebra"]);
  });
  it("orientações: mais recente primeiro; inserirOrdenada substitui pelo id", () => {
    const a = { id: "a", created_at: iso(2026, 9, 18, 10, 0) };
    const b = { id: "b", created_at: iso(2026, 9, 19, 9, 0) };
    expect(ordenarOrientacoes([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirOrdenada([b, a], { ...a, created_at: iso(2026, 9, 20, 8, 0) }).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("PDF e formulário", () => {
  it("nomeArquivoPDF tira acentos e caracteres estranhos", () => {
    expect(nomeArquivoPDF("Vitória Régia de Souza!", new Date(2026, 8, 19))).toBe("orientacoes-vitoria-regia-de-souza-2026-09-19.pdf");
    expect(nomeArquivoPDF("   ", new Date(2026, 8, 19))).toBe("orientacoes-paciente-2026-09-19.pdf");
  });
  it("formParaRegistro / registroParaForm vão e voltam (o checkbox não vai pro banco)", () => {
    const reg = formParaRegistro({ titulo: "  Minhas   orientações ", conteudo: "## A \r\n- x  \n", salvarComoModelo: true }, new Date(2026, 8, 19));
    expect(reg).toEqual({ titulo: "Minhas orientações", conteudo: "## A\n- x" });
    expect(registroParaForm(reg)).toEqual({ titulo: "Minhas orientações", conteudo: "## A\n- x", salvarComoModelo: false });
  });
  it("título vazio ganha o padrão com a data", () => {
    expect(formParaRegistro({ titulo: "  ", conteudo: "x", salvarComoModelo: false }, new Date(2026, 0, 2)).titulo).toBe("Orientações 02/01/2026");
  });
});
