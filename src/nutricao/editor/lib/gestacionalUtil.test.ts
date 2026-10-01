// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/gestacionalUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  AVISO_GEMELAR_SEM_FAIXA, TICKS_SEMANAS, alertaPA, calcularDPP, classificarIMCPre, curvaRecomendada, dadosGrafico, dataLocalISO, faixaTotal, fmtData, fmtFaixa, fmtGanho, formDaGestacao,
  formInicialGestacao, formInicialRegistro, ganhoAtual, ganhoFinal, ganhoRecomendado, gestacaoParaBanco, imcDoForm, inserirRegistro, nomeArquivoPDFGestacional,
  ordenarRegistros, preencherDoExistente, previaRegistro, registroDoDia, registroParaBanco, semanaGestacional, serieGanho, situacaoGanho, textoIMCPre, textoPA, textoPrevia,
  textoSemana, textoSemanaTrimestre, trimestre, ultimaAntropometria, ultimoRegistro, validarGestacao, validarRegistro, type FormGestacao,
  type FormRegistroGestacional, type RegistroBase,
} from "./gestacionalUtil";

const HOJE = "2026-09-19";
const gest = { dum: "2026-05-02", peso_pre: 60, imc_pre: 22.04, gemelar: false }; // 20 semanas exatas em 19/09
const reg = (id: string, data: string, peso: number, extra: Partial<RegistroBase> = {}): RegistroBase => ({
  id, data, peso, pa_sistolica: null, pa_diastolica: null, observacao: null, created_at: `${data}T12:00:00Z`, ...extra,
});
const formG = (extra: Partial<FormGestacao> = {}): FormGestacao => ({ dum: "2026-05-02", peso_pre: "60", altura: "165", gemelar: false, observacao: "", origemSugestao: null, ...extra });
const formR = (extra: Partial<FormRegistroGestacional> = {}): FormRegistroGestacional => ({ data: HOJE, peso: "67", pa_sistolica: "", pa_diastolica: "", observacao: "", ...extra });

describe("datas da gestação", () => {
  it("DPP = DUM + 280 dias", () => {
    expect(calcularDPP("2026-01-01")).toBe("2026-10-08");
    expect(calcularDPP("2026-05-02")).toBe("2027-02-06");
  });
  it("semana gestacional em semanas completas + dias; antes da DUM ou acima de 45 semanas → null", () => {
    expect(semanaGestacional("2026-05-02", "2026-09-19")).toEqual({ semanas: 20, dias: 0 });
    expect(semanaGestacional("2026-05-02", "2026-06-30")).toEqual({ semanas: 8, dias: 3 });
    expect(semanaGestacional("2026-05-02", "2026-05-01")).toBeNull();
    expect(semanaGestacional("2025-01-01", "2026-09-19")).toBeNull();
    expect(semanaGestacional("data-ruim", "2026-09-19")).toBeNull();
    expect(textoSemana({ semanas: 24, dias: 3 })).toBe("24s 3d");
    expect(textoSemana(null)).toBe("—");
  });
  it("fmtData: coluna date direto; timestamptz no fuso LOCAL (encerrada_em às 21h de 19/09 não vira 20/09)", () => {
    expect(fmtData("2026-09-19")).toBe("19/09/2026");
    expect(fmtData(new Date(2026, 8, 19, 21, 30).toISOString())).toBe("19/09/2026");
    expect(dataLocalISO(new Date(2026, 8, 19, 23, 59).toISOString())).toBe("2026-09-19");
    expect(dataLocalISO("2026-09-19")).toBe("2026-09-19");
    expect(fmtData("")).toBe("—");
    expect(fmtData(null)).toBe("—");
    expect(fmtData("lixo")).toBe("—");
    expect(dataLocalISO("lixo")).toBe("");
  });
  it("trimestre: ≤ 13 · 14–27 · ≥ 28", () => {
    expect(trimestre(0)).toBe(1);
    expect(trimestre(13)).toBe(1);
    expect(trimestre(14)).toBe(2);
    expect(trimestre(27)).toBe(2);
    expect(trimestre(28)).toBe(3);
    expect(textoSemanaTrimestre({ semanas: 20, dias: 0 })).toBe("20s 0d · 2º trimestre");
  });
});

describe("IMC pré-gestacional e faixas IOM 2009", () => {
  it("classifica nos cortes 18,5 / 25 / 30", () => {
    expect(classificarIMCPre(18.4)).toBe("baixo_peso");
    expect(classificarIMCPre(18.5)).toBe("adequado");
    expect(classificarIMCPre(24.9)).toBe("adequado");
    expect(classificarIMCPre(25)).toBe("sobrepeso");
    expect(classificarIMCPre(29.9)).toBe("sobrepeso");
    expect(classificarIMCPre(30)).toBe("obesidade");
    expect(textoIMCPre(22.04)).toBe("22,0 — Adequado");
    expect(textoIMCPre(null)).toBe("—");
  });
  it("faixa total: única pela classificação; gemelar pela tabela gemelar (baixo peso → adequado com aviso)", () => {
    expect(faixaTotal("adequado", false)).toEqual({ faixa: { min: 11.5, max: 16 }, aviso: null });
    expect(faixaTotal("obesidade", false).faixa).toEqual({ min: 5, max: 9 });
    expect(faixaTotal("adequado", true)).toEqual({ faixa: { min: 17, max: 25 }, aviso: null });
    expect(faixaTotal("baixo_peso", true)).toEqual({ faixa: { min: 17, max: 25 }, aviso: AVISO_GEMELAR_SEM_FAIXA });
    expect(fmtFaixa({ min: 11.5, max: 16 })).toBe("11,5–16 kg");
    expect(fmtFaixa({ min: 2.25, max: 4.5 })).toBe("2,3–4,5 kg");
  });
  it("ganho acumulado recomendado: linear até 0,5–2 kg na semana 13, depois soma o semanal", () => {
    expect(ganhoRecomendado("adequado", 0)).toEqual({ min: 0, max: 0 });
    expect(ganhoRecomendado("adequado", 8)).toEqual({ min: 0.31, max: 1.23 });
    expect(ganhoRecomendado("adequado", 13)).toEqual({ min: 0.5, max: 2 });
    expect(ganhoRecomendado("adequado", 14)).toEqual({ min: 0.85, max: 2.5 });
    expect(ganhoRecomendado("adequado", 18)).toEqual({ min: 2.25, max: 4.5 });
    expect(ganhoRecomendado("adequado", 20)).toEqual({ min: 2.95, max: 5.5 });
    expect(ganhoRecomendado("obesidade", 40)).toEqual({ min: 5.09, max: 9.29 });
    expect(ganhoRecomendado("baixo_peso", 40)).toEqual({ min: 12.38, max: 17.66 });
  });
  it("gemelar escala a curva pela razão total gemelar / total única", () => {
    expect(ganhoRecomendado("adequado", 14, true)).toEqual({ min: 1.26, max: 3.91 });
    expect(ganhoRecomendado("adequado", 18, true)).toEqual({ min: 3.33, max: 7.03 });
    // baixo peso gemelar usa a curva e a faixa de adequado
    expect(ganhoRecomendado("baixo_peso", 18, true)).toEqual(ganhoRecomendado("adequado", 18, true));
  });
  it("curva 0..40 crescente nos dois limites", () => {
    const curva = curvaRecomendada("sobrepeso");
    expect(curva).toHaveLength(41);
    expect(curva[0]).toEqual({ semana: 0, min: 0, max: 0 });
    for (let i = 1; i < curva.length; i += 1) {
      expect(curva[i].min).toBeGreaterThan(curva[i - 1].min);
      expect(curva[i].max).toBeGreaterThan(curva[i - 1].max);
      expect(curva[i].max).toBeGreaterThan(curva[i].min);
    }
    expect(curva[40]).toEqual({ semana: 40, min: 6.71, max: 10.91 });
    expect(TICKS_SEMANAS).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
  });
  it("ganho atual, situação e formatação", () => {
    expect(ganhoAtual(60, 66.5)).toBe(6.5);
    expect(ganhoAtual(60, 59.55)).toBe(-0.45);
    expect(situacaoGanho(1, { min: 0.31, max: 1.23 })).toBe("dentro");
    expect(situacaoGanho(3.5, { min: 0.85, max: 2.5 })).toBe("acima");
    expect(situacaoGanho(0.2, { min: 0.31, max: 1.23 })).toBe("abaixo");
    expect(situacaoGanho(0.31, { min: 0.31, max: 1.23 })).toBe("dentro");
    expect(fmtGanho(6.5)).toBe("+6,5 kg");
    expect(fmtGanho(-0.45)).toBe("-0,5 kg");
    expect(fmtGanho(0)).toBe("0,0 kg");
    expect(fmtGanho(0.04)).toBe("0,0 kg");
  });
});

describe("série do ganho real", () => {
  const registros = [
    reg("r18", "2026-09-05", 66), // semana 18
    reg("r8", "2026-06-27", 61), // semana 8
    reg("r14", "2026-08-08", 63.5), // semana 14
  ];
  it("ordena da mais antiga pra mais recente e calcula ganho, faixa e situação de cada uma", () => {
    const serie = serieGanho(registros, gest);
    expect(serie.map((p) => p.id)).toEqual(["r8", "r14", "r18"]);
    expect(serie[0]).toMatchObject({ semana: { semanas: 8, dias: 0 }, x: 8, ganho: 1, faixa: { min: 0.31, max: 1.23 }, situacao: "dentro" });
    expect(serie[1]).toMatchObject({ semana: { semanas: 14, dias: 0 }, x: 14, ganho: 3.5, faixa: { min: 0.85, max: 2.5 }, situacao: "acima" });
    expect(serie[2]).toMatchObject({ semana: { semanas: 18, dias: 0 }, x: 18, ganho: 6, faixa: { min: 2.25, max: 4.5 }, situacao: "acima" });
  });
  it("gemelar recalcula as faixas e as situações", () => {
    const serie = serieGanho(registros, { ...gest, gemelar: true });
    expect(serie.map((p) => p.situacao)).toEqual(["dentro", "dentro", "dentro"]);
    expect(serie[1].faixa).toEqual({ min: 1.26, max: 3.91 });
  });
  it("dados do gráfico: 41 semanas da curva + pontos reais na semana deles, ordenados", () => {
    const dados = dadosGrafico(serieGanho(registros, gest), "adequado", false);
    expect(dados).toHaveLength(41); // as 3 pesagens caem em semanas exatas → viram a linha da semana
    const s8 = dados.find((d) => d.semana === 8);
    expect(s8).toEqual({ semana: 8, faixa: [0.31, 1.23], ganho: 1, data: "2026-06-27" });
    expect(dados.filter((d) => d.ganho !== undefined)).toHaveLength(3);
    const quebrado = dadosGrafico(serieGanho([reg("x", "2026-06-30", 61.5)], gest), "adequado", false); // 8s 3d → 8,43
    expect(quebrado).toHaveLength(42);
    expect(quebrado.find((d) => d.semana === 8.43)).toMatchObject({ ganho: 1.5 });
    expect(quebrado.map((d) => d.semana)).toEqual([...quebrado.map((d) => d.semana)].sort((a, b) => a - b));
  });
  it("ordenar / inserir / último / do dia / ganho final", () => {
    const ordem = ordenarRegistros(registros).map((r) => r.id);
    expect(ordem).toEqual(["r18", "r14", "r8"]);
    const novo = reg("hoje", HOJE, 67);
    expect(inserirRegistro(registros, novo).map((r) => r.id)).toEqual(["hoje", "r18", "r14", "r8"]);
    expect(inserirRegistro(registros, { ...registros[0], peso: 65 }).find((r) => r.id === "r18")?.peso).toBe(65);
    expect(ultimoRegistro(registros)?.id).toBe("r18");
    expect(ultimoRegistro([])).toBeNull();
    expect(registroDoDia(registros, "2026-08-08")?.id).toBe("r14");
    expect(registroDoDia(registros, HOJE)).toBeNull();
    expect(ganhoFinal(registros, gest)).toBe(6);
    expect(ganhoFinal([], gest)).toBeNull();
  });
});

describe("formulário da gestação", () => {
  it("sugere peso/altura da última antropometria (mais recente primeiro) com a origem", () => {
    const antros = [
      { data: "2026-03-01T12:00:00Z", created_at: "2026-03-01T12:00:00Z", peso: 58, altura: 164 },
      { data: "2026-04-22T12:00:00Z", created_at: "2026-04-22T12:00:00Z", peso: 60, altura: 165 },
    ];
    expect(ultimaAntropometria(antros)?.peso).toBe(60);
    expect(formInicialGestacao(ultimaAntropometria(antros))).toEqual({ dum: "", peso_pre: "60", altura: "165", gemelar: false, observacao: "", origemSugestao: "2026-04-22T12:00:00Z" });
    expect(formInicialGestacao(null)).toMatchObject({ peso_pre: "", altura: "", origemSugestao: null });
    expect(formInicialGestacao({ data: "2026-04-22", created_at: "x", peso: null, altura: null }).origemSugestao).toBeNull();
    expect(formDaGestacao({ dum: "2026-05-02", peso_pre: 60, altura: 165, gemelar: true, observacao: null })).toEqual({
      dum: "2026-05-02", peso_pre: "60", altura: "165", gemelar: true, observacao: "", origemSugestao: null,
    });
  });
  it("IMC ao vivo e validações", () => {
    expect(imcDoForm(formG())).toBe(22.04);
    expect(imcDoForm(formG({ altura: "" }))).toBeNull();
    expect(validarGestacao(formG(), HOJE)).toBeNull();
    expect(validarGestacao(formG({ dum: "" }), HOJE)).toBe("Informe a data da última menstruação");
    expect(validarGestacao(formG({ dum: "2026-09-20" }), HOJE)).toBe("A DUM não pode ser futura");
    expect(validarGestacao(formG({ dum: "2025-11-01" }), HOJE)).toBe("A DUM não pode ter mais de 300 dias");
    expect(validarGestacao(formG({ peso_pre: "19" }), HOJE)).toBe("Peso pré-gestacional entre 20 e 300 kg");
    expect(validarGestacao(formG({ peso_pre: "abc" }), HOJE)).toBe("Peso pré-gestacional entre 20 e 300 kg");
    expect(validarGestacao(formG({ altura: "99" }), HOJE)).toBe("Altura entre 100 e 250 cm");
    expect(validarGestacao(formG({ observacao: "x".repeat(301) }), HOJE)).toBe("Observação com no máximo 300 caracteres");
  });
  it("linha pro banco com DPP e IMC calculados e observação vazia → null", () => {
    expect(gestacaoParaBanco(formG({ peso_pre: "60,0", observacao: "  " }))).toEqual({
      dum: "2026-05-02", dpp: "2027-02-06", peso_pre: 60, altura: 165, imc_pre: 22.04, gemelar: false, observacao: null,
    });
  });
});

describe("formulário do registro", () => {
  it("inicial com o último peso e leitura de um registro existente", () => {
    expect(formInicialRegistro(HOJE, 66)).toEqual({ data: HOJE, peso: "66", pa_sistolica: "", pa_diastolica: "", observacao: "" });
    expect(formInicialRegistro(HOJE, null).peso).toBe("");
  });
  it("dia que já tem registro: o formulário novo carrega peso, PA e observação dele (a data fica)", () => {
    const existente = { peso: 67, pa_sistolica: 120, pa_diastolica: 80, observacao: "enjoo" };
    expect(preencherDoExistente(formInicialRegistro(HOJE, 66), existente)).toEqual({ data: HOJE, peso: "67", pa_sistolica: "120", pa_diastolica: "80", observacao: "enjoo" });
    expect(preencherDoExistente(formR(), { peso: 66.5, pa_sistolica: null, pa_diastolica: null, observacao: null })).toEqual({ ...formR(), peso: "66.5" });
  });
  it("validações: data entre DUM e hoje, peso, PA em par e coerente", () => {
    expect(validarRegistro(formR(), gest, HOJE)).toBeNull();
    expect(validarRegistro(formR({ pa_sistolica: "120", pa_diastolica: "80" }), gest, HOJE)).toBeNull();
    expect(validarRegistro(formR({ data: "" }), gest, HOJE)).toBe("Informe a data do registro");
    expect(validarRegistro(formR({ data: "2026-05-01" }), gest, HOJE)).toBe("A data não pode ser anterior à DUM (02/05/2026)");
    expect(validarRegistro(formR({ data: "2026-09-20" }), gest, HOJE)).toBe("A data não pode ser futura");
    expect(validarRegistro(formR({ peso: "301" }), gest, HOJE)).toBe("Peso entre 20 e 300 kg");
    expect(validarRegistro(formR({ pa_sistolica: "120" }), gest, HOJE)).toBe("Informe a pressão arterial completa (sistólica e diastólica) ou deixe as duas em branco");
    expect(validarRegistro(formR({ pa_sistolica: "300", pa_diastolica: "80" }), gest, HOJE)).toBe("Sistólica entre 50 e 260 mmHg");
    expect(validarRegistro(formR({ pa_sistolica: "120", pa_diastolica: "20" }), gest, HOJE)).toBe("Diastólica entre 30 e 160 mmHg");
    expect(validarRegistro(formR({ pa_sistolica: "80", pa_diastolica: "120" }), gest, HOJE)).toBe("A sistólica tem que ser maior que a diastólica");
    expect(validarRegistro(formR({ pa_sistolica: "120.5", pa_diastolica: "80" }), gest, HOJE)).toBe("Sistólica entre 50 e 260 mmHg");
  });
  it("linha pro banco, PA opcional em par", () => {
    expect(registroParaBanco(formR({ peso: "67,0" }))).toEqual({ data: HOJE, peso: 67, pa_sistolica: null, pa_diastolica: null, observacao: null });
    expect(registroParaBanco(formR({ pa_sistolica: "145", pa_diastolica: "95", observacao: " enjoo " }))).toEqual({
      data: HOJE, peso: 67, pa_sistolica: 145, pa_diastolica: 95, observacao: "enjoo",
    });
  });
  it("PA: texto e alerta", () => {
    expect(textoPA(120, 80)).toBe("120/80 mmHg");
    expect(textoPA(null, null)).toBe("—");
    expect(alertaPA(120, 80)).toBeNull();
    expect(alertaPA(140, 80)).toBe("PA elevada");
    expect(alertaPA(120, 90)).toBe("PA elevada");
    expect(alertaPA(null, null)).toBeNull();
  });
  it("prévia ao vivo: semana da data, ganho contra a faixa daquela semana", () => {
    const p = previaRegistro(formR({ peso: "67" }), gest);
    expect(p).toEqual({ semana: { semanas: 20, dias: 0 }, ganho: 7, faixa: { min: 2.95, max: 5.5 }, situacao: "acima" });
    expect(textoPrevia(p)).toBe("ganho +7,0 kg · faixa 3–5,5 kg · acima da faixa");
    expect(previaRegistro(formR({ peso: "" }), gest)).toEqual({ semana: { semanas: 20, dias: 0 }, ganho: null, faixa: null, situacao: null });
    expect(textoPrevia(previaRegistro(formR({ data: "2026-01-01" }), gest))).toBe("—");
  });
});

describe("PDF", () => {
  it("nome do arquivo sem acento, com a data", () => {
    expect(nomeArquivoPDFGestacional("Maria José da Silva", new Date(2026, 8, 19))).toBe("maria-jose-da-silva-gestacional-2026-09-19.pdf");
    expect(nomeArquivoPDFGestacional("", new Date(2026, 8, 19))).toBe("paciente-gestacional-2026-09-19.pdf");
  });
});
