import { describe, expect, it } from "vitest";
import {
  ATALHOS_DIAS, DIAS_SEMANA, FIM_DE_SEMANA, SEG_A_SEX, TODOS_OS_DIAS, diaDaSemana, formatarDataMeta, mesmosDias, metaValeNoDia, metasAtivas, metasDeOutrosDias,
  metasDoDia, metasPausadas, nomeArquivoPDFMetas, normalizarDias, progressoDasMetas, textoContagemMetas, textoDias, textoErroMeta, textoInicioFuturo, textoPausadas,
} from "./metasUtil";

// Porta dos testes do src/lib/metasUtil.test.ts do PhysiqNutri (dias, textos, contagens) + o ✓ nas metas do dia (NF4).
describe("dias da semana (ISO: 1 = segunda … 7 = domingo)", () => {
  it("7 dias, com curto e nome", () => {
    expect(DIAS_SEMANA.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DIAS_SEMANA.map((d) => d.curto)).toEqual(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]);
    expect(ATALHOS_DIAS.map((a) => a.atalho)).toEqual(["todos", "semana", "fim"]);
    expect(TODOS_OS_DIAS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(SEG_A_SEX).toEqual([1, 2, 3, 4, 5]);
    expect(FIM_DE_SEMANA).toEqual([6, 7]);
  });
  it("normalizarDias: únicos, 1..7, ordenados; lixo vira []", () => {
    expect(normalizarDias([5, 1, 3, 1, "7", 0, 8, 2.7, null])).toEqual([1, 2, 3, 5, 7]);
    expect(normalizarDias(null)).toEqual([]);
    expect(normalizarDias("1,2")).toEqual([]);
    expect(mesmosDias([7, 1], [1, 7, 7])).toBe(true);
    expect(mesmosDias([1], [1, 2])).toBe(false);
  });
  it("textoDias", () => {
    expect(textoDias([1, 2, 3, 4, 5, 6, 7])).toBe("Todos os dias");
    expect(textoDias([1, 2, 3, 4, 5])).toBe("Seg a Sex");
    expect(textoDias([6, 7])).toBe("Fim de semana");
    expect(textoDias([1, 3, 5])).toBe("Seg, Qua e Sex");
    expect(textoDias([5, 1, 2, 4])).toBe("Seg, Ter, Qui e Sex");
    expect(textoDias([2])).toBe("Ter");
    expect(textoDias([1, 7])).toBe("Seg e Dom");
    expect(textoDias([])).toBe("Nenhum dia");
    expect(textoDias(undefined)).toBe("Nenhum dia");
  });
  it("dia da semana de uma data do calendário (sem o fuso do aparelho)", () => {
    expect(diaDaSemana("2026-09-28")).toBe(1); // segunda
    expect(diaDaSemana("2026-09-30")).toBe(3); // quarta
    expect(diaDaSemana("2026-10-04")).toBe(7); // domingo
    expect(diaDaSemana("2026-10-03")).toBe(6); // sábado
  });
});

describe("listas, contagens e datas", () => {
  const m = (id: string, ativa: boolean, created_at: string) => ({ id, ativa, created_at });
  const lista = [m("b", true, "2026-09-20T10:00:00Z"), m("p", false, "2026-09-19T10:00:00Z"), m("a", true, "2026-09-18T10:00:00Z")];
  it("ativas e pausadas em ordem de criação", () => {
    expect(metasAtivas(lista).map((x) => x.id)).toEqual(["a", "b"]);
    expect(metasPausadas(lista).map((x) => x.id)).toEqual(["p"]);
  });
  it("textos", () => {
    expect(textoContagemMetas(0, 0)).toBe("Nenhuma meta");
    expect(textoContagemMetas(1, 1)).toBe("1 meta · 1 ativa");
    expect(textoContagemMetas(3, 2)).toBe("3 metas · 2 ativas");
    expect(textoContagemMetas(2, 0)).toBe("2 metas · nenhuma ativa");
    expect(textoPausadas(0)).toBe("nenhuma pausada");
    expect(textoPausadas(1)).toBe("1 pausada");
    expect(textoPausadas(3)).toBe("3 pausadas");
    expect(formatarDataMeta("2026-09-19")).toBe("19/09/2026");
    expect(formatarDataMeta(null)).toBe("—");
    expect(nomeArquivoPDFMetas("João Conceição", new Date(2026, 8, 30))).toBe("metas-joao-conceicao-20260930.pdf");
  });
});

describe("NF4 — ✓ nas metas do dia", () => {
  const base = { ativa: true, created_at: "2026-09-01T10:00:00Z", inicio: "2026-09-01" };
  const agua = { ...base, id: "agua", dias_semana: [1, 2, 3, 4, 5, 6, 7] };
  const caminhar = { ...base, id: "caminhar", dias_semana: [1, 3, 5] };
  const fim = { ...base, id: "fim", dias_semana: [6, 7] };
  const pausada = { ...base, id: "pausada", ativa: false, dias_semana: [1, 2, 3, 4, 5, 6, 7] };
  const futura = { ...base, id: "futura", dias_semana: [3], inicio: "2026-10-07" };
  const todas = [agua, caminhar, fim, pausada, futura];

  it("a meta vale no dia: ativa, com o dia da semana e já começou", () => {
    expect(metaValeNoDia(agua, "2026-09-30")).toBe(true);
    expect(metaValeNoDia(caminhar, "2026-09-30")).toBe(true); // quarta
    expect(metaValeNoDia(caminhar, "2026-10-01")).toBe(false); // quinta
    expect(metaValeNoDia(fim, "2026-09-30")).toBe(false);
    expect(metaValeNoDia(pausada, "2026-09-30")).toBe(false);
    expect(metaValeNoDia(futura, "2026-09-30")).toBe(false);
    expect(metaValeNoDia({ ...agua, inicio: null }, "2026-09-30")).toBe(true);
  });
  it("as do dia e as de outros dias (as pausadas não entram em nenhuma)", () => {
    expect(metasDoDia(todas, "2026-09-30").map((x) => x.id)).toEqual(["agua", "caminhar"]);
    expect(metasDeOutrosDias(todas, "2026-09-30").map((x) => x.id)).toEqual(["fim", "futura"]);
    expect(metasDoDia(todas, "2026-10-03").map((x) => x.id)).toEqual(["agua", "fim"]); // sábado
  });
  it("o ✓ zera no dia seguinte: o que conta é o que foi marcado NAQUELE dia", () => {
    const doDia = metasDoDia(todas, "2026-09-30");
    expect(progressoDasMetas(doDia, ["agua"])).toEqual({ feitas: 1, total: 2 });
    expect(progressoDasMetas(doDia, ["agua", "caminhar", "fim"])).toEqual({ feitas: 2, total: 2 });
    expect(progressoDasMetas(metasDoDia(todas, "2026-10-01"), [])).toEqual({ feitas: 0, total: 1 });
  });
  it("começa em … e os erros da função", () => {
    expect(textoInicioFuturo("2026-10-07", "2026-09-30")).toBe("começa em 07/10");
    expect(textoInicioFuturo("2026-09-01", "2026-09-30")).toBe("");
    expect(textoErroMeta({ message: "meta_pausada" })).toMatch(/pausada/);
    expect(textoErroMeta({ message: "fora_do_dia" })).toMatch(/não vale para hoje/);
    expect(textoErroMeta({ message: "data_invalida" })).toMatch(/data e a hora/);
    expect(textoErroMeta({ message: "sem_acesso" })).toMatch(/acesso/);
    expect(textoErroMeta({ message: "Failed to fetch" })).toMatch(/Sem conexão/);
    expect(textoErroMeta(null)).toBe("Não foi possível salvar. Tente de novo.");
  });
});
