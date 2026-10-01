// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/consultasUtil.test.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  ehFutura, ehOrigem, formParaRegistro, formVazio, formatarDataHoraConsulta, inserirOrdenada, ordenarConsultas, registroParaForm,
  resumoObservacao, rotuloConsulta, textoContagem, ultimaConsulta,
} from "./consultasUtil";

const iso = (ano: number, mes: number, dia: number, hora: number, minuto: number): string => new Date(ano, mes - 1, dia, hora, minuto).toISOString();
const consulta = (id: string, data: string, created: string) => ({ id, data, created_at: created });

describe("formVazio", () => {
  it("data e hora de agora, observação vazia", () => {
    expect(formVazio(new Date(2026, 8, 19, 9, 5))).toEqual({ data: "2026-09-19", hora: "09:05", observacao: "" });
  });
});

describe("formParaRegistro / registroParaForm", () => {
  it("vai e volta sem perder data/hora e limpa a observação", () => {
    const reg = formParaRegistro({ data: "2026-09-19", hora: "14:30", observacao: "  Retorno  " });
    expect(reg.observacao).toBe("Retorno");
    expect(reg.data).toBe(iso(2026, 9, 19, 14, 30));
    expect(registroParaForm(reg)).toEqual({ data: "2026-09-19", hora: "14:30", observacao: "Retorno" });
  });
  it("observação só com espaços vira null e volta como vazio", () => {
    const reg = formParaRegistro({ data: "2026-01-02", hora: "08:00", observacao: "   " });
    expect(reg.observacao).toBeNull();
    expect(registroParaForm(reg).observacao).toBe("");
  });
});

describe("rótulos", () => {
  it("formata dd/MM/yyyy HH:mm", () => {
    expect(formatarDataHoraConsulta(iso(2026, 9, 19, 9, 5))).toBe("19/09/2026 09:05");
    expect(rotuloConsulta(iso(2026, 9, 19, 9, 5))).toBe("Consulta registrada em 19/09/2026 09:05");
  });
  it("contagem em português", () => {
    expect(textoContagem(0)).toBe("Nenhuma consulta registrada");
    expect(textoContagem(1)).toBe("1 consulta registrada");
    expect(textoContagem(3)).toBe("3 consultas registradas");
  });
  it("resumo da observação = 1ª linha, cortada com reticências", () => {
    expect(resumoObservacao("linha 1\nlinha 2")).toBe("linha 1");
    expect(resumoObservacao(null)).toBe("");
    expect(resumoObservacao("a".repeat(100), 10)).toBe("aaaaaaaaa…");
  });
  it("origem conhecida", () => {
    expect(ehOrigem("manual")).toBe(true);
    expect(ehOrigem("agenda")).toBe(true);
    expect(ehOrigem("x")).toBe(false);
  });
});

describe("ordenação", () => {
  const a = consulta("a", iso(2026, 9, 18, 10, 0), iso(2026, 9, 18, 10, 0));
  const b = consulta("b", iso(2026, 9, 19, 9, 0), iso(2026, 9, 19, 9, 0));
  const b2 = consulta("b2", iso(2026, 9, 19, 9, 0), iso(2026, 9, 19, 9, 1));

  it("mais recente primeiro; empate = registrada por último primeiro", () => {
    expect(ordenarConsultas([a, b, b2]).map((x) => x.id)).toEqual(["b2", "b", "a"]);
    expect(ultimaConsulta([a, b])?.id).toBe("b");
    expect(ultimaConsulta([])).toBeNull();
  });
  it("não muda a lista original", () => {
    const lista = [a, b];
    ordenarConsultas(lista);
    expect(lista.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("inserirOrdenada substitui pelo id e reordena", () => {
    const aEditada = { ...a, data: iso(2026, 9, 20, 8, 0) };
    const nova = inserirOrdenada([b, a], aEditada);
    expect(nova.map((x) => x.id)).toEqual(["a", "b"]);
    expect(nova).toHaveLength(2);
    expect(inserirOrdenada([b], a).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("ehFutura compara com o instante dado", () => {
    const agora = new Date(2026, 8, 19, 12, 0);
    expect(ehFutura(iso(2026, 9, 19, 13, 0), agora)).toBe(true);
    expect(ehFutura(iso(2026, 9, 19, 11, 0), agora)).toBe(false);
  });
});
