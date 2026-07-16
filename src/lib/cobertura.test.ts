import { describe, it, expect } from "vitest";
import { calcCobertura, nextAnchorAfter, addMonthClamp } from "../../supabase/functions/mp-payments/cobertura";

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("calcCobertura — avulso (sem assinatura)", () => {
  it("nunca pagou → null", () => {
    expect(calcCobertura([], null)).toBeNull();
  });

  it("pagamento cobre 1 mês da data (paguei 15/07 → coberto até 15/08)", () => {
    expect(calcCobertura([d("2026-07-15")], null)).toEqual(d("2026-08-15"));
  });

  it("atraso move o vencimento (vencia 15, pagou 20/08 → passa a vencer 20)", () => {
    const cov = calcCobertura([d("2026-07-15"), d("2026-08-20")], null);
    expect(cov).toEqual(d("2026-09-20"));
  });

  it("pagamento adiantado preserva o dia (coberto até 15/08, pagou 10/08 → cobre até 15/09)", () => {
    const cov = calcCobertura([d("2026-07-15"), d("2026-08-10")], null);
    expect(cov).toEqual(d("2026-09-15"));
  });

  it("reembolso (pagamento fora da lista) derruba a cobertura", () => {
    // pagou 15/07 e foi reembolsado → histórico aprovado vazio
    expect(calcCobertura([], null)).toBeNull();
    // pagou 15/06 e 15/07; o de 15/07 reembolsado → cobertura recua pra 15/07
    expect(calcCobertura([d("2026-06-15")], null)).toEqual(d("2026-07-15"));
  });

  it("clamp de mês curto (pagou 31/01 → cobre até 28/02)", () => {
    expect(calcCobertura([d("2026-01-31")], null)).toEqual(d("2026-02-28"));
  });
});

describe("calcCobertura — com assinatura ativa (âncora no dia da cobrança)", () => {
  it("cobrança da assinatura no dia do ciclo cobre o ciclo inteiro", () => {
    // ciclo dia 15; cobranças 15/07 e 15/08
    const cov = calcCobertura([d("2026-07-15"), d("2026-08-15")], 15);
    expect(cov).toEqual(d("2026-09-15"));
  });

  it("reposição de mês reembolsado cobre só até a próxima cobrança (vencimento da assinatura não muda)", () => {
    // cobrança de 15/07 reembolsada; aluno repôs avulso dia 20/07; ciclo segue dia 15
    const cov = calcCobertura([d("2026-07-20")], 15);
    expect(cov).toEqual(d("2026-08-15"));
  });

  it("histórico anterior à assinatura + cobranças no ciclo não drifta o vencimento", () => {
    // avulso 15/06 → assinou; MP cobra 15/07 e 15/08 (ciclo dia 15)
    const cov = calcCobertura([d("2026-06-15"), d("2026-07-15"), d("2026-08-15")], 15);
    expect(cov).toEqual(d("2026-09-15"));
  });
});

describe("nextAnchorAfter", () => {
  it("antes do dia no mesmo mês", () => {
    expect(nextAnchorAfter(d("2026-07-10"), 15)).toEqual(d("2026-07-15"));
  });
  it("no dia ou depois → mês seguinte", () => {
    expect(nextAnchorAfter(d("2026-07-15"), 15)).toEqual(d("2026-08-15"));
    expect(nextAnchorAfter(d("2026-07-20"), 15)).toEqual(d("2026-08-15"));
  });
  it("clamp em mês curto (dia 31 em fevereiro → 28)", () => {
    expect(nextAnchorAfter(d("2026-02-10"), 31)).toEqual(d("2026-02-28"));
  });
});

describe("addMonthClamp", () => {
  it("clamp 31/01 → 28/02", () => {
    expect(addMonthClamp(d("2026-01-31"))).toEqual(d("2026-02-28"));
  });
});
