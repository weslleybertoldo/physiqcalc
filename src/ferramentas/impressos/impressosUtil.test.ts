import { describe, expect, it } from "vitest";
import {
  CATEGORIAS, ID_CODIGO_ETICA, IMPRESSOS, LINK_CFN, agruparPorCategoria, cabecalhoPadrao, casaComBuscaImpresso, categoriaDaURL, categoriasComItens,
  contarPorCategoria, ehCategoria, filtrarImpressos, impressoPorId, infoCategoria, nomeArquivo, normalizarBusca, rodapeImpresso, textoContagem,
  textoEmitido, textoPaginas,
} from "./impressosUtil";

const HOJE = new Date(2026, 8, 20, 15, 30); // 20/09/2026 15:30 local

describe("catálogo", () => {
  it("tem os 7 impressos na ordem da referência, com ids únicos e categorias válidas", () => {
    expect(IMPRESSOS.map((i) => i.id)).toEqual([
      "ficha-antropometrica", "rastreamento-metabolico", "sinais-e-sintomas", "codigo-de-etica", "checklist-higienizacao", "controle-temperatura", "ficha-tecnica",
    ]);
    expect(new Set(IMPRESSOS.map((i) => i.id)).size).toBe(7);
    for (const i of IMPRESSOS) {
      expect(ehCategoria(i.categoria)).toBe(true);
      expect(i.paginas).toBeGreaterThanOrEqual(1);
      expect(i.titulo.length).toBeGreaterThan(5);
      expect(i.descricao.length).toBeGreaterThan(20);
    }
    expect(CATEGORIAS.map((c) => c.id)).toEqual(["avaliacao", "consultorio", "gestao"]);
    expect(infoCategoria("gestao").rotulo).toBe("Gestão e ética");
    expect(impressoPorId(ID_CODIGO_ETICA)?.categoria).toBe("gestao");
    expect(impressoPorId("nao-existe")).toBeNull();
    expect(LINK_CFN.startsWith("https://cfn.org.br/")).toBe(true);
  });

  it("categoriaDaURL aceita só as 3 categorias", () => {
    expect(categoriaDaURL("avaliacao")).toBe("avaliacao");
    expect(categoriaDaURL("todos")).toBeNull();
    expect(categoriaDaURL(null)).toBeNull();
    expect(categoriaDaURL(undefined)).toBeNull();
    expect(ehCategoria(3)).toBe(false);
  });
});

describe("busca", () => {
  it("normaliza sem acento, minúsculas e pontuação", () => {
    expect(normalizarBusca("  HIGIENIZAÇÃO, (diária)  ")).toBe("higienizacao diaria");
    expect(normalizarBusca("")).toBe("");
  });

  it("casa por palavras no título OU na descrição, sem acento", () => {
    const temperatura = impressoPorId("controle-temperatura")!;
    expect(casaComBuscaImpresso(temperatura, "TEMPERATÚRA")).toBe(true);
    expect(casaComBuscaImpresso(temperatura, "freezer")).toBe(true); // só na descrição
    expect(casaComBuscaImpresso(temperatura, "temperatura xyz")).toBe(false); // todas as palavras precisam casar
    expect(casaComBuscaImpresso(temperatura, "")).toBe(true);
  });

  it("filtrarImpressos combina categoria e busca", () => {
    expect(filtrarImpressos(IMPRESSOS, "temperatura").map((i) => i.id)).toEqual(["controle-temperatura"]);
    expect(filtrarImpressos(IMPRESSOS, "higien", "consultorio").map((i) => i.id)).toEqual(["checklist-higienizacao"]);
    expect(filtrarImpressos(IMPRESSOS, "etica").map((i) => i.id)).toEqual(["codigo-de-etica"]);
    expect(filtrarImpressos(IMPRESSOS, "", "avaliacao").map((i) => i.id)).toEqual(["ficha-antropometrica", "rastreamento-metabolico", "sinais-e-sintomas"]);
    expect(filtrarImpressos(IMPRESSOS, "xyz")).toEqual([]);
    expect(filtrarImpressos(IMPRESSOS, "higien", "gestao")).toEqual([]);
    expect(filtrarImpressos(IMPRESSOS, "")).toHaveLength(7);
  });
});

describe("agrupar e contar", () => {
  it("conta 3 avaliação · 2 consultório · 2 gestão e agrupa na ordem das categorias", () => {
    expect(contarPorCategoria(IMPRESSOS)).toEqual({ avaliacao: 3, consultorio: 2, gestao: 2 });
    expect(categoriasComItens(IMPRESSOS)).toEqual(["avaliacao", "consultorio", "gestao"]);
    const grupos = agruparPorCategoria(IMPRESSOS);
    expect(grupos.map((g) => [g.categoria.id, g.itens.length])).toEqual([["avaliacao", 3], ["consultorio", 2], ["gestao", 2]]);
    expect(agruparPorCategoria(filtrarImpressos(IMPRESSOS, "temperatura")).map((g) => g.categoria.id)).toEqual(["consultorio"]);
    expect(categoriasComItens([])).toEqual([]);
  });

  it("textoContagem e textoPaginas", () => {
    expect(textoContagem(7, 3)).toBe("7 impressos em 3 categorias");
    expect(textoContagem(1, 1)).toBe("1 impresso em 1 categoria");
    expect(textoContagem(0, 0)).toBe("Nenhum impresso");
    expect(textoPaginas(1)).toBe("1 página");
    expect(textoPaginas(2)).toBe("2 páginas");
  });
});

describe("cabeçalho, rodapé e nome do arquivo", () => {
  it("nomeArquivo = physiq-<id>-<yyyy-MM-dd>.pdf (por id ou pelo impresso)", () => {
    expect(nomeArquivo("ficha-antropometrica", HOJE)).toBe("physiq-ficha-antropometrica-2026-09-20.pdf");
    expect(nomeArquivo(impressoPorId("ficha-tecnica")!, HOJE)).toBe("physiq-ficha-tecnica-2026-09-20.pdf");
  });

  it("cabecalhoPadrao limpa o nome e aceita null", () => {
    expect(cabecalhoPadrao("  Ana   Paula  ", HOJE)).toEqual({ nutricionista: "Ana Paula", data: HOJE });
    expect(cabecalhoPadrao(null, HOJE).nutricionista).toBe("");
    expect(cabecalhoPadrao(undefined, HOJE).nutricionista).toBe("");
  });

  it("rodapé e linha de emissão com e sem nome", () => {
    expect(rodapeImpresso(cabecalhoPadrao("Ana Paula", HOJE))).toBe("Physiq · Ana Paula · 20/09/2026");
    expect(rodapeImpresso(cabecalhoPadrao("", HOJE))).toBe("Physiq · 20/09/2026");
    expect(textoEmitido(cabecalhoPadrao("Ana Paula", HOJE))).toBe("Nutricionista: Ana Paula   ·   Emitido em 20/09/2026");
    expect(textoEmitido(cabecalhoPadrao(null, HOJE))).toBe("Emitido em 20/09/2026");
  });
});
