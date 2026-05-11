import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { salvarComparativo, carregarComparativo, limparComparativo } from "./storageComparativo";
import { medidasVazias } from "@/types/medidas";

const SAMPLE = {
  refData: { nome: "Ref", data: "2026-01-01", peso: 70, pctGordura: 15, medidas: medidasVazias },
  novoData: { data: "2026-05-01", peso: 68, pctGordura: 13, medidas: medidasVazias },
  dadosComuns: { sexo: "M" as const, idade: 30, altura: 175 },
};

describe("storageComparativo", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retorna null quando nada salvo", () => {
    expect(carregarComparativo()).toBeNull();
  });

  it("round-trip salvar/carregar preserva dados (sem timestamp no retorno)", () => {
    salvarComparativo(SAMPLE);
    const loaded = carregarComparativo();
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(SAMPLE);
  });

  it("expira apos 24h (TTL)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00Z"));
    salvarComparativo(SAMPLE);
    expect(carregarComparativo()).not.toBeNull();

    // 24h + 1ms depois
    vi.setSystemTime(new Date("2026-05-02T10:00:00.001Z"));
    expect(carregarComparativo()).toBeNull();
    // E removeu do storage
    expect(localStorage.getItem("physiqcalc_comparativo_v1")).toBeNull();
  });

  it("limparComparativo remove a chave", () => {
    salvarComparativo(SAMPLE);
    expect(carregarComparativo()).not.toBeNull();
    limparComparativo();
    expect(carregarComparativo()).toBeNull();
  });

  it("JSON corrompido retorna null sem lancar", () => {
    localStorage.setItem("physiqcalc_comparativo_v1", "{{{not-json");
    expect(carregarComparativo()).toBeNull();
  });
});
