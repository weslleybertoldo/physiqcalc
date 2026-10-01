// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/anamneseUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  PERGUNTAS_PADRAO, contarRespondidas, ehVazia, formParaRegistro, inserirOrdenada, lerConteudo, lerPerguntas, montarConteudo, nomeArquivoPDF,
  ordenarAnamneses, ordenarModelos, perguntasDoTexto, registroParaForm, textoContagem, textoRespondidas, tituloPadrao,
} from "./anamneseUtil";

const iso = (ano: number, mes: number, dia: number, hora: number, minuto: number): string => new Date(ano, mes - 1, dia, hora, minuto).toISOString();

describe("perguntasDoTexto", () => {
  it("uma por linha, sem vazias, espaços repetidos nem duplicadas (sem caixa)", () => {
    expect(perguntasDoTexto("Pergunta A\n\n  Pergunta   B \npergunta b\nPergunta C\n")).toEqual(["Pergunta A", "Pergunta B", "Pergunta C"]);
    expect(perguntasDoTexto("   \n\n")).toEqual([]);
  });
  it("o modelo padrão tem perguntas únicas e não vazias", () => {
    expect(perguntasDoTexto(PERGUNTAS_PADRAO.join("\n"))).toEqual(PERGUNTAS_PADRAO);
    expect(PERGUNTAS_PADRAO.length).toBeGreaterThanOrEqual(10);
  });
});

describe("leitura do jsonb", () => {
  it("lerPerguntas só aceita strings não vazias", () => {
    expect(lerPerguntas(["a", "", 3, null, " b "])).toEqual(["a", " b "]);
    expect(lerPerguntas("x")).toEqual([]);
    expect(lerPerguntas(null)).toEqual([]);
  });
  it("lerConteudo ignora itens sem pergunta e normaliza a resposta", () => {
    expect(lerConteudo([{ pergunta: "P1", resposta: "R1" }, { pergunta: "P2" }, { resposta: "x" }, null, "y"])).toEqual([
      { pergunta: "P1", resposta: "R1" },
      { pergunta: "P2", resposta: "" },
    ]);
    expect(lerConteudo({})).toEqual([]);
  });
});

describe("conteúdo", () => {
  it("montarConteudo casa perguntas e respostas (faltantes viram vazio) e conta respondidas", () => {
    const c = montarConteudo(["A", "B", "C"], [" r1 ", ""]);
    expect(c).toEqual([{ pergunta: "A", resposta: "r1" }, { pergunta: "B", resposta: "" }, { pergunta: "C", resposta: "" }]);
    expect(contarRespondidas(c)).toBe(1);
    expect(textoRespondidas(c)).toBe("1/3 respondidas");
    expect(textoRespondidas([])).toBe("só texto livre");
  });
  it("ehVazia: nada respondido e sem texto livre", () => {
    expect(ehVazia(montarConteudo(["A"], [""]), "  ")).toBe(true);
    expect(ehVazia(montarConteudo(["A"], [""]), "obs")).toBe(false);
    expect(ehVazia(montarConteudo(["A"], ["r"]), null)).toBe(false);
    expect(ehVazia([], null)).toBe(true);
  });
  it("tituloPadrao usa o modelo e a data", () => {
    expect(tituloPadrao("Anamnese geral (padrão)", new Date(2026, 8, 19))).toBe("Anamnese geral (padrão) — 19/09/2026");
    expect(tituloPadrao(null, new Date(2026, 8, 19))).toBe("Anamnese — 19/09/2026");
  });
  it("contagem", () => {
    expect(textoContagem(0)).toBe("Nenhuma anamnese");
    expect(textoContagem(1)).toBe("1 anamnese");
    expect(textoContagem(2)).toBe("2 anamneses");
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
  it("anamneses: mais recente primeiro; inserirOrdenada substitui pelo id", () => {
    const a = { id: "a", data: iso(2026, 9, 18, 10, 0), created_at: iso(2026, 9, 18, 10, 0) };
    const b = { id: "b", data: iso(2026, 9, 19, 9, 0), created_at: iso(2026, 9, 19, 9, 0) };
    expect(ordenarAnamneses([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
    expect(inserirOrdenada([b, a], { ...a, data: iso(2026, 9, 20, 8, 0) }).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("PDF e formulário", () => {
  it("nomeArquivoPDF tira acentos e caracteres estranhos", () => {
    expect(nomeArquivoPDF("Vitória Régia de Souza!", new Date(2026, 8, 19))).toBe("anamnese-vitoria-regia-de-souza-2026-09-19.pdf");
    expect(nomeArquivoPDF("   ", new Date(2026, 8, 19))).toBe("anamnese-paciente-2026-09-19.pdf");
  });
  it("formParaRegistro / registroParaForm vão e voltam", () => {
    const reg = formParaRegistro({ titulo: "  Minha anamnese ", data: "2026-09-19", hora: "14:30", perguntas: ["A", "B"], respostas: ["r1", ""], textoLivre: " livre " });
    expect(reg.titulo).toBe("Minha anamnese");
    expect(reg.data).toBe(iso(2026, 9, 19, 14, 30));
    expect(reg.conteudo).toEqual([{ pergunta: "A", resposta: "r1" }, { pergunta: "B", resposta: "" }]);
    expect(reg.texto_livre).toBe("livre");
    expect(registroParaForm(reg)).toEqual({ titulo: "Minha anamnese", data: "2026-09-19", hora: "14:30", perguntas: ["A", "B"], respostas: ["r1", ""], textoLivre: "livre" });
  });
  it("título vazio ganha o padrão com a data; texto livre vazio vira null", () => {
    const reg = formParaRegistro({ titulo: "  ", data: "2026-01-02", hora: "08:00", perguntas: [], respostas: [], textoLivre: "  " });
    expect(reg.titulo).toBe("Anamnese — 02/01/2026");
    expect(reg.texto_livre).toBeNull();
  });
});
