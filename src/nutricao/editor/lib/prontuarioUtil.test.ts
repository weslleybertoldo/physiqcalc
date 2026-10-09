// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/prontuarioUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  agruparPorMes, chaveMes, formParaRegistro, formVazio, formatarDataHoraRegistro, inserirOrdenado, nomeArquivoPDFProntuario, ordenarRegistros,
  registroParaForm, resumoRegistro, rotuloMes, textoContagem, textoNascimento, textoVazio,
} from "./prontuarioUtil";

const iso = (ano: number, mes: number, dia: number, hora: number, minuto: number): string => new Date(ano, mes - 1, dia, hora, minuto).toISOString();
const reg = (id: string, data: string, created: string = data) => ({ id, data, created_at: created });

describe("formulário", () => {
  it("formVazio: data e hora de agora, texto vazio", () => {
    expect(formVazio(new Date(2026, 8, 19, 9, 5))).toEqual({ data: "2026-09-19", hora: "09:05", texto: "" });
  });
  it("formParaRegistro / registroParaForm vão e voltam; o texto é normalizado (CRLF, espaços no fim, linhas em branco repetidas)", () => {
    const r = formParaRegistro({ data: "2026-09-19", hora: "14:30", texto: "## Evolução \r\n\r\n\r\n- item  \n" });
    expect(r).toEqual({ data: iso(2026, 9, 19, 14, 30), texto: "## Evolução\n\n- item" });
    expect(registroParaForm(r)).toEqual({ data: "2026-09-19", hora: "14:30", texto: "## Evolução\n\n- item" });
  });
  it("textoVazio", () => {
    expect(textoVazio("")).toBe(true);
    expect(textoVazio(" \n\n ")).toBe(true);
    expect(textoVazio(null)).toBe(true);
    expect(textoVazio("- item")).toBe(false);
    expect(textoVazio("texto")).toBe(false);
  });
});

describe("resumo e rótulos", () => {
  it("resumo = 1ª linha com conteúdo, sem as marcas de markdown, cortada com reticências", () => {
    expect(resumoRegistro("## Evolução da consulta\ntexto")).toBe("Evolução da consulta");
    expect(resumoRegistro("\n\n- Peso **estável**  em 70 kg\noutra linha")).toBe("Peso estável em 70 kg");
    expect(resumoRegistro("# Título")).toBe("Título");
    expect(resumoRegistro("a".repeat(100), 10)).toBe("aaaaaaaaa…");
    expect(resumoRegistro(null)).toBe("");
    expect(resumoRegistro("   ")).toBe("");
  });
  it("data/hora e contagem", () => {
    expect(formatarDataHoraRegistro(iso(2026, 9, 19, 9, 5))).toBe("19/09/2026 09:05");
    expect(textoContagem(0)).toBe("Nenhum registro");
    expect(textoContagem(1)).toBe("1 registro");
    expect(textoContagem(3)).toBe("3 registros");
  });
  it("nascimento com a idade", () => {
    expect(textoNascimento("1990-03-15", new Date(2026, 8, 19))).toBe("15/03/1990 (36 anos)");
    expect(textoNascimento("2025-09-01", new Date(2026, 8, 19))).toBe("01/09/2025 (1 ano)");
    expect(textoNascimento(null)).toBeNull();
    expect(textoNascimento("")).toBeNull();
    expect(textoNascimento("não é data")).toBeNull();
  });
});

describe("meses", () => {
  it("chaveMes e rotuloMes", () => {
    expect(chaveMes(iso(2026, 9, 19, 9, 0))).toBe("2026-09");
    expect(rotuloMes("2026-09")).toBe("Setembro de 2026");
    expect(rotuloMes("2026-01")).toBe("Janeiro de 2026");
    expect(rotuloMes("2025-12")).toBe("Dezembro de 2025");
  });
  it("agruparPorMes: mês mais recente primeiro, registros do mesmo mês juntos e ordenados", () => {
    const a = reg("a", iso(2026, 8, 3, 10, 0));
    const b = reg("b", iso(2026, 9, 1, 8, 0));
    const c = reg("c", iso(2026, 9, 19, 9, 0));
    const grupos = agruparPorMes([a, c, b]);
    expect(grupos.map((g) => g.chave)).toEqual(["2026-09", "2026-08"]);
    expect(grupos[0].rotulo).toBe("Setembro de 2026");
    expect(grupos[0].registros.map((r) => r.id)).toEqual(["c", "b"]);
    expect(grupos[1].registros.map((r) => r.id)).toEqual(["a"]);
    expect(agruparPorMes([])).toEqual([]);
  });
});

describe("ordenação", () => {
  const a = reg("a", iso(2026, 9, 18, 10, 0));
  const b = reg("b", iso(2026, 9, 19, 9, 0));
  const b2 = reg("b2", iso(2026, 9, 19, 9, 0), iso(2026, 9, 19, 9, 1));
  it("mais recente primeiro; empate = gravado por último primeiro", () => {
    expect(ordenarRegistros([a, b, b2]).map((x) => x.id)).toEqual(["b2", "b", "a"]);
  });
  it("inserirOrdenado substitui pelo id e reordena", () => {
    expect(inserirOrdenado([b, a], { ...a, data: iso(2026, 9, 20, 8, 0) }).map((x) => x.id)).toEqual(["a", "b"]);
    expect(inserirOrdenado([], b).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("PDF", () => {
  it("nome do arquivo sem acento nem caracteres estranhos", () => {
    expect(nomeArquivoPDFProntuario("Vitória Régia de Souza!", new Date(2026, 8, 19))).toBe("prontuario-vitoria-regia-de-souza-2026-09-19.pdf");
    expect(nomeArquivoPDFProntuario("   ", new Date(2026, 8, 19))).toBe("prontuario-paciente-2026-09-19.pdf");
  });
});
