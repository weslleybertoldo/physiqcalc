import { describe, expect, it } from "vitest";
import {
  blocosDoMarkdown, contarTopicos, formatarDataOrientacao, nomeArquivoPDF, ordenarOrientacoes, textoContagem, textoSemMarcas, textoTopicos, topicosDoTexto,
  trechosInline,
} from "./orientacoesUtil";

// Porta dos testes do src/lib/orientacoesUtil.test.ts do PhysiqNutri (o markdown simples das orientações, que a tela e o PDF usam).
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
  });
  it("** sem par fica literal; textoSemMarcas tira as marcas", () => {
    expect(trechosInline("a **b c")).toEqual([{ texto: "a **b c", negrito: false }]);
    expect(textoSemMarcas("a **b** c")).toBe("a b c");
  });
});

describe("tópicos, contagem e datas", () => {
  it("conta títulos/subtítulos; sem nenhum, conta itens de lista e parágrafos", () => {
    expect(contarTopicos(blocosDoMarkdown("## A\ntexto\n## B\n- x\n- y"))).toBe(2);
    expect(contarTopicos(blocosDoMarkdown("- x\n- y\n\ntexto"))).toBe(3);
    expect(contarTopicos([])).toBe(0);
    expect(topicosDoTexto("# T\n## S")).toBe(2);
    expect(textoTopicos(0)).toBe("sem conteúdo");
    expect(textoTopicos(1)).toBe("1 tópico");
    expect(textoTopicos(8)).toBe("8 tópicos");
  });
  it("a mais nova primeiro; contagem; data e nome do PDF", () => {
    const l = [{ id: "a", created_at: "2026-09-10T10:00:00Z" }, { id: "b", created_at: "2026-09-28T10:00:00Z" }];
    expect(ordenarOrientacoes(l).map((o) => o.id)).toEqual(["b", "a"]);
    expect(textoContagem(0)).toBe("Nenhuma orientação");
    expect(textoContagem(1)).toBe("1 orientação");
    expect(textoContagem(3)).toBe("3 orientações");
    expect(formatarDataOrientacao("2026-09-28T15:00:00Z")).toBe("28/09/2026");
    expect(nomeArquivoPDF("Maria Luísa", new Date(2026, 8, 30))).toBe("orientacoes-maria-luisa-2026-09-30.pdf");
  });
});
