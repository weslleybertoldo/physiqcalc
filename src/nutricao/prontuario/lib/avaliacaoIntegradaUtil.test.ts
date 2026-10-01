// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/avaliacaoIntegradaUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  alertas, contarFontes, contarItens, detalheFonte, fmtDataFonte, fontesVazias, formDaAvaliacao, formInicialAvaliacao, formParaBanco,
  formatarDataHoraAvaliacao, inserirAvaliacao, lerFontes, lerSintese, montarSintese, nomeArquivoPDFAvaliacao, ordenarAvaliacoes, paresAntropometria,
  resumoAvaliacao, resumoFontes, temFontes, textoContagemAvaliacoes, textoItensFonte, textoSugerido, validarAvaliacao, type FontesBrutas,
} from "./avaliacaoIntegradaUtil";

const iso = (ano: number, mes: number, dia: number, hora = 12, minuto = 0): string => new Date(ano, mes - 1, dia, hora, minuto).toISOString();
const pergunta = (id: string, tipo: string, max = 4, pontos_sim = 1) => ({ id, texto: `Pergunta ${id}`, tipo, max, pontos_sim, opcoes: [] });

const vazio: FontesBrutas = { anamneses: [], antropometrias: [], resultados: [], aplicacoes: [] };

const cheio: FontesBrutas = {
  anamneses: [
    {
      id: "a1", titulo: "Anamnese antiga", data: iso(2026, 9, 1), created_at: iso(2026, 9, 1), texto_livre: null,
      conteudo: [{ pergunta: "Q1", resposta: "r1" }, { pergunta: "Q2", resposta: "r2" }, { pergunta: "Q3", resposta: "r3" }],
    },
    {
      id: "a2", titulo: "Anamnese geral", data: iso(2026, 9, 17, 10), created_at: iso(2026, 9, 17, 10), texto_livre: " Obs livre ",
      conteudo: [{ pergunta: "Queixa", resposta: "Cansaço" }, { pergunta: "Objetivo", resposta: "  emagrecer " }, { pergunta: "Sono", resposta: "" }],
    },
  ],
  antropometrias: [
    { id: "at1", data: iso(2026, 9, 1), created_at: iso(2026, 9, 1), peso: 80, altura: 170, protocolo: "nenhum", resultados: { imc: 27.5, classificacao_imc: "Sobrepeso" } },
    { id: "at2", data: iso(2026, 9, 18, 9), created_at: iso(2026, 9, 18, 9), peso: 77, altura: 170, protocolo: "nenhum", resultados: {} },
  ],
  resultados: [
    { id: "r0", data: "2026-09-01", exame: "Ferritina", valor: 20, valor_texto: "", unidade: "ng/mL", ref_min: 30, ref_max: 300, referencia_texto: "", created_at: iso(2026, 9, 1) },
    { id: "r1", data: "2026-09-16", exame: "Glicose", valor: 105, valor_texto: "", unidade: "mg/dL", ref_min: 70, ref_max: 99, referencia_texto: "", created_at: iso(2026, 9, 16) },
    { id: "r2", data: "2026-09-16", exame: "Vitamina D", valor: 18, valor_texto: "", unidade: "ng/mL", ref_min: 30, ref_max: 100, referencia_texto: "", created_at: iso(2026, 9, 16) },
    { id: "r3", data: "2026-09-16", exame: "Colesterol total", valor: 180, valor_texto: "", unidade: "mg/dL", ref_min: null, ref_max: 200, referencia_texto: "", created_at: iso(2026, 9, 16) },
  ],
  aplicacoes: [
    { id: "q2", titulo: "FODMAP", data: "2026-09-10", perguntas: [pergunta("p1", "escala")], pontuacao: 3, faixa: "Baixo", nivel: "baixo", created_at: iso(2026, 9, 10) },
    {
      id: "q1", titulo: "FODMAP", data: "2026-09-17", pontuacao: 8, faixa: "Alto", nivel: "alto", created_at: iso(2026, 9, 17),
      perguntas: [pergunta("p1", "escala"), pergunta("p2", "escala"), pergunta("p3", "sim_nao", 4, 4)],
    },
    {
      id: "q3", titulo: "Disbiose", data: "2026-09-12", pontuacao: 5, faixa: "Moderado", nivel: "moderado", created_at: iso(2026, 9, 12),
      perguntas: Array.from({ length: 5 }, (_, i) => pergunta(`d${i}`, "escala", 2)),
    },
  ],
};

describe("montarSintese", () => {
  it("sem fontes: 4 blocos vazios, fontes vazias", () => {
    const { sintese, fontes } = montarSintese(vazio);
    expect(sintese).toEqual({ anamnese: null, antropometria: null, exames: null, questionarios: [] });
    expect(fontes).toEqual(fontesVazias());
    expect(temFontes(sintese)).toBe(false);
    expect(contarFontes(fontes)).toBe(0);
    expect(resumoFontes(fontes)).toBe("Anamnese sem dado · Antropometria sem dado · Exames sem dado · Questionários sem dado");
  });

  it("última anamnese (só respondidas, trim), última antropometria (IMC recalculado), exames da data mais recente (ordem alfabética), última aplicação de cada título", () => {
    const { sintese: s, fontes: f } = montarSintese(cheio);
    expect(s.anamnese).toEqual({
      titulo: "Anamnese geral", data: iso(2026, 9, 17, 10), texto_livre: "Obs livre",
      itens: [{ pergunta: "Queixa", resposta: "Cansaço" }, { pergunta: "Objetivo", resposta: "emagrecer" }],
    });
    expect(s.antropometria).toEqual({
      data: iso(2026, 9, 18, 9), peso: 77, altura: 170, imc: 26.64, classificacao: "Sobrepeso",
      percentual_gordura: null, massa_gorda: null, massa_magra: null, rcq: null, protocolo: "nenhum",
    });
    expect(s.exames?.data).toBe("2026-09-16");
    expect(s.exames?.itens).toEqual([
      { exame: "Colesterol total", valor: "180", unidade: "mg/dL", referencia: "≤ 200", situacao: "normal" },
      { exame: "Glicose", valor: "105", unidade: "mg/dL", referencia: "70–99", situacao: "acima" },
      { exame: "Vitamina D", valor: "18", unidade: "ng/mL", referencia: "30–100", situacao: "abaixo" },
    ]);
    expect(s.questionarios).toEqual([
      { id: "q1", titulo: "FODMAP", data: "2026-09-17", pontuacao: 8, maximo: 12, faixa: "Alto", nivel: "alto" },
      { id: "q3", titulo: "Disbiose", data: "2026-09-12", pontuacao: 5, maximo: 10, faixa: "Moderado", nivel: "moderado" },
    ]);
    expect(f).toEqual({
      anamnese_id: "a2", anamnese_data: iso(2026, 9, 17, 10), antropometria_id: "at2", antropometria_data: iso(2026, 9, 18, 9),
      exames_data: "2026-09-16", exames_n: 3,
      questionarios: [{ id: "q1", titulo: "FODMAP", data: "2026-09-17" }, { id: "q3", titulo: "Disbiose", data: "2026-09-12" }],
    });
    expect(temFontes(s)).toBe(true);
    expect(contarFontes(f)).toBe(4);
    expect(resumoFontes(f)).toBe("Anamnese 17/09 · Antropometria 18/09 · 3 exames de 16/09 · 2 questionários");
  });

  it("IMC já gravado nos resultados é mantido (não recalcula); anamnese corta em 40 itens respondidos", () => {
    const { sintese } = montarSintese({
      ...vazio,
      antropometrias: [cheio.antropometrias[0]],
      anamneses: [{
        id: "a9", titulo: "Longa", data: iso(2026, 9, 5), created_at: iso(2026, 9, 5), texto_livre: null,
        conteudo: Array.from({ length: 45 }, (_, i) => ({ pergunta: `P${i}`, resposta: `R${i}` })),
      }],
    });
    expect(sintese.antropometria?.imc).toBe(27.5);
    expect(sintese.anamnese?.itens).toHaveLength(40);
    expect(contarFontes(montarSintese({ ...vazio, antropometrias: [cheio.antropometrias[0]] }).fontes)).toBe(1);
  });
});

describe("alertas e texto sugerido", () => {
  const montado = montarSintese(cheio);

  it("IMC fora de 18,5–24,9, exames fora da referência e questionários moderado/alto — os 'alto' primeiro", () => {
    expect(alertas(montado.sintese)).toEqual([
      { chave: "questionario:q1", texto: "FODMAP: 8/12 pontos — Alto", nivel: "alto" },
      { chave: "imc", texto: "IMC 26,6 — Sobrepeso", nivel: "atencao" },
      { chave: "exame:glicose", texto: "Glicose 105 mg/dL acima da referência (70–99)", nivel: "atencao" },
      { chave: "exame:vitamina-d", texto: "Vitamina D 18 ng/mL abaixo da referência (30–100)", nivel: "atencao" },
      { chave: "questionario:q3", texto: "Disbiose: 5/10 pontos — Moderado", nivel: "atencao" },
    ]);
  });

  it("IMC: normal não alerta; obesidade e magreza grave são 'alto'; abaixo do peso é 'atenção'", () => {
    const antro = (peso: number) => montarSintese({ ...vazio, antropometrias: [{ ...cheio.antropometrias[1], peso, resultados: {} }] }).sintese;
    expect(alertas(antro(65))).toEqual([]);
    expect(alertas(antro(90))).toEqual([{ chave: "imc", texto: "IMC 31,1 — Obesidade grau I", nivel: "alto" }]);
    expect(alertas(antro(50))).toEqual([{ chave: "imc", texto: "IMC 17,3 — Abaixo do peso", nivel: "atencao" }]);
    expect(alertas(antro(43))[0].nivel).toBe("alto");
    expect(alertas(montarSintese(vazio).sintese)).toEqual([]);
  });

  it("texto sugerido: Resumo com 1 linha por fonte, Pontos de atenção e Conduta vazia", () => {
    const t = textoSugerido(montado.sintese);
    expect(t.startsWith("## Resumo\n")).toBe(true);
    expect(t).toContain('- Anamnese "Anamnese geral" de 17/09/2026 — 2 respostas registradas · com texto livre');
    expect(t).toContain("- Antropometria de 18/09/2026 — peso 77,0 kg · IMC 26,6 (Sobrepeso)");
    expect(t).toContain("- Exames de 16/09/2026 — 3 resultados, 2 fora da referência");
    expect(t).toContain("- Questionário FODMAP de 17/09/2026 — 8/12 pontos · Alto");
    expect(t).toContain("- Questionário Disbiose de 12/09/2026 — 5/10 pontos · Moderado");
    expect(t).toContain("\n## Pontos de atenção\n- FODMAP: 8/12 pontos — Alto\n- IMC 26,6 — Sobrepeso\n");
    expect(t.trimEnd().endsWith("## Conduta")).toBe(true);
  });

  it("texto sugerido sem fontes", () => {
    const t = textoSugerido(montarSintese(vazio).sintese);
    expect(t).toContain("- Nenhuma fonte registrada");
    expect(t).toContain("## Pontos de atenção\n- Nenhum\n");
  });

  it("resumoAvaliacao: título · fontes · alertas", () => {
    expect(resumoAvaliacao({ titulo: "Avaliação 1", sintese: montado.sintese, fontes: montado.fontes })).toBe("Avaliação 1 · 4 fontes · 5 alertas");
    expect(resumoAvaliacao({ titulo: "Vazia", sintese: {}, fontes: null })).toBe("Vazia · 0 fontes · 0 alertas");
  });
});

describe("blocos: pares, itens e chips", () => {
  const { sintese, fontes } = montarSintese(cheio);

  it("paresAntropometria só com o que existe; protocolo 'nenhum' não entra", () => {
    expect(paresAntropometria(sintese.antropometria!)).toEqual([
      { chave: "peso", rotulo: "Peso", valor: "77,0 kg" },
      { chave: "altura", rotulo: "Altura", valor: "170 cm" },
      { chave: "imc", rotulo: "IMC", valor: "26,6" },
      { chave: "classificacao", rotulo: "Classificação", valor: "Sobrepeso" },
    ]);
    const chaves = paresAntropometria({ ...sintese.antropometria!, percentual_gordura: 22.5, rcq: 0.8, protocolo: "pollock3" }).map((p) => p.chave);
    expect(chaves).toEqual(["peso", "altura", "imc", "classificacao", "gordura", "rcq", "protocolo"]);
  });

  it("contarItens / textoItensFonte / detalheFonte", () => {
    expect(contarItens(sintese, "anamnese")).toBe(2);
    expect(contarItens(sintese, "antropometria")).toBe(4);
    expect(contarItens(sintese, "exames")).toBe(3);
    expect(contarItens(sintese, "questionarios")).toBe(2);
    expect(contarItens(montarSintese(vazio).sintese, "antropometria")).toBe(0);
    expect(textoItensFonte("anamnese", 1)).toBe("1 resposta");
    expect(textoItensFonte("exames", 3)).toBe("3 resultados");
    expect(detalheFonte(fontes, "exames")).toEqual({ tem: true, texto: "3 exames de 16/09/2026" });
    expect(detalheFonte(fontes, "anamnese")).toEqual({ tem: true, texto: "17/09/2026" });
    expect(detalheFonte(fontes, "questionarios")).toEqual({ tem: true, texto: "2 questionários" });
    expect(detalheFonte(fontesVazias(), "anamnese")).toEqual({ tem: false, texto: "sem dado" });
    expect(detalheFonte(fontesVazias(), "exames")).toEqual({ tem: false, texto: "sem dado" });
  });

  it("fmtDataFonte: date-só pelo parseISO, timestamptz pelo new Date, lixo vira —", () => {
    expect(fmtDataFonte("2026-09-16")).toBe("16/09/2026");
    expect(fmtDataFonte(iso(2026, 9, 18, 9), "dd/MM/yyyy HH:mm")).toBe("18/09/2026 09:00");
    expect(fmtDataFonte(null)).toBe("—");
    expect(fmtDataFonte("lixo")).toBe("—");
  });
});

describe("leitura tolerante dos jsonb", () => {
  it("lerSintese ignora lixo e normaliza tipos", () => {
    expect(lerSintese(null)).toEqual({ anamnese: null, antropometria: null, exames: null, questionarios: [] });
    const s = lerSintese({
      anamnese: { titulo: " X ", data: "d", itens: [{ pergunta: "P", resposta: "R" }, { resposta: "sem pergunta" }, "lixo"], texto_livre: "  " },
      antropometria: { peso: "77", imc: 26.6, classificacao: "Sobrepeso" },
      exames: { data: "2026-09-16", itens: [{ exame: "G", valor: 105, unidade: "mg/dL", referencia: "70–99", situacao: "acima" }, { exame: "", valor: "1" }, { exame: "Z", situacao: "estranha" }] },
      questionarios: [{ id: "q", titulo: "T", pontuacao: "8", maximo: 12, faixa: "Alto", nivel: "muito" }, "lixo", { titulo: "" }],
    });
    expect(s.anamnese).toEqual({ titulo: "X", data: "d", itens: [{ pergunta: "P", resposta: "R" }], texto_livre: null });
    expect(s.antropometria).toEqual({ data: "", peso: null, altura: null, imc: 26.6, classificacao: "Sobrepeso", percentual_gordura: null, massa_gorda: null, massa_magra: null, rcq: null, protocolo: "" });
    expect(s.exames).toEqual({
      data: "2026-09-16",
      itens: [{ exame: "G", valor: "105", unidade: "mg/dL", referencia: "70–99", situacao: "acima" }, { exame: "Z", valor: "", unidade: "", referencia: "", situacao: "sem_referencia" }],
    });
    expect(s.questionarios).toEqual([{ id: "q", titulo: "T", data: "", pontuacao: 0, maximo: 12, faixa: "Alto", nivel: "" }]);
  });

  it("lerFontes", () => {
    expect(lerFontes(undefined)).toEqual(fontesVazias());
    expect(lerFontes({ anamnese_id: "a", anamnese_data: "", exames_n: "3", questionarios: [{ id: "q", titulo: "T", data: "2026-09-17" }, {}] })).toEqual({
      anamnese_id: "a", anamnese_data: null, antropometria_id: null, antropometria_data: null, exames_data: null, exames_n: 0,
      questionarios: [{ id: "q", titulo: "T", data: "2026-09-17" }],
    });
    expect(lerFontes({ exames_n: 2.6, exames_data: "2026-09-16" }).exames_n).toBe(3);
  });

  it("síntese montada vai e volta pelo leitor sem perder nada", () => {
    const { sintese, fontes } = montarSintese(cheio);
    expect(lerSintese(JSON.parse(JSON.stringify(sintese)))).toEqual(sintese);
    expect(lerFontes(JSON.parse(JSON.stringify(fontes)))).toEqual(fontes);
  });
});

describe("formulário e lista", () => {
  it("formInicialAvaliacao / formDaAvaliacao", () => {
    expect(formInicialAvaliacao(new Date(2026, 8, 19), "## Resumo")).toEqual({ titulo: "Avaliação integrada — 19/09/2026", texto: "## Resumo" });
    expect(formDaAvaliacao({ titulo: "T", texto: null })).toEqual({ titulo: "T", texto: "" });
  });

  it("validarAvaliacao", () => {
    expect(validarAvaliacao({ titulo: "   ", texto: "" })).toBe("Informe o título da avaliação");
    expect(validarAvaliacao({ titulo: "a".repeat(121), texto: "" })).toBe("Título com mais de 120 caracteres");
    expect(validarAvaliacao({ titulo: "ok", texto: "a".repeat(8001) })).toBe("Parecer com mais de 8000 caracteres");
    expect(validarAvaliacao({ titulo: "ok", texto: "" })).toBeNull();
  });

  it("formParaBanco normaliza título e parecer (vazio → null)", () => {
    expect(formParaBanco({ titulo: "  Avaliação   x ", texto: "## A \r\n\r\n\r\ntexto  " })).toEqual({ titulo: "Avaliação x", texto: "## A\n\ntexto" });
    expect(formParaBanco({ titulo: "T", texto: " \n " })).toEqual({ titulo: "T", texto: null });
  });

  it("ordenarAvaliacoes / inserirAvaliacao: mais recente primeiro, empate pela criação", () => {
    const a = { id: "a", data: iso(2026, 9, 18, 10), created_at: iso(2026, 9, 18, 10) };
    const b = { id: "b", data: iso(2026, 9, 19, 9), created_at: iso(2026, 9, 19, 9) };
    const b2 = { id: "b2", data: iso(2026, 9, 19, 9), created_at: iso(2026, 9, 19, 9, 1) };
    expect(ordenarAvaliacoes([a, b, b2]).map((x) => x.id)).toEqual(["b2", "b", "a"]);
    expect(inserirAvaliacao([b, a], { ...a, data: iso(2026, 9, 20, 8) }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(inserirAvaliacao([], b).map((x) => x.id)).toEqual(["b"]);
  });

  it("contagem, data/hora e nome do PDF", () => {
    expect(textoContagemAvaliacoes(0)).toBe("Nenhuma avaliação");
    expect(textoContagemAvaliacoes(1)).toBe("1 avaliação");
    expect(textoContagemAvaliacoes(3)).toBe("3 avaliações");
    expect(formatarDataHoraAvaliacao(iso(2026, 9, 19, 9, 5))).toBe("19/09/2026 09:05");
    expect(nomeArquivoPDFAvaliacao("Vitória Régia de Souza!", new Date(2026, 8, 19))).toBe("vitoria-regia-de-souza-avaliacao-integrada-2026-09-19.pdf");
    expect(nomeArquivoPDFAvaliacao("   ", new Date(2026, 8, 19))).toBe("paciente-avaliacao-integrada-2026-09-19.pdf");
  });
});
