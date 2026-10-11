// src/financeiro/planosAutomatica.test.ts
// Physiq W-P (§7 I1): toda mudança do valor do próximo pagamento com a automática ligada faz o PUT /preapproval; o MP é simulado.
// Task 8b (decisão do Weslley 10/10, ponto 2): a troca em lote vai para uma fila que tenta de hora em hora; na 24ª falha seguida
// (1 dia) desiste e avisa o dono — 1 aviso por conta, com os nomes juntos.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MAX_TENTATIVAS,
  destinoDoResultado,
  mesmoValor,
  novoValorDaAutomatica,
  proximaTentativaEm,
  textoDoAvisoDaFila,
} from "../../supabase-principal/functions/_shared/planos-automatica";

const ativa = { mp_preapproval_id: "pre-1", status: "authorized", valor: 100, payload: {} };

describe("I1 — o valor da cobrança automática acompanha o próximo pagamento", () => {
  it("sem automática ligada (ou simulada) não chama o MP", async () => {
    const put = vi.fn();
    expect(await novoValorDaAutomatica(null, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, status: "cancelled" }, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, mp_preapproval_id: "sim-1" }, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, payload: { simulada: true } }, 90, put)).toBe("sem_automatica");
    expect(put).not.toHaveBeenCalled();
  });
  it("mesmo valor não chama o MP", async () => {
    const put = vi.fn();
    expect(await novoValorDaAutomatica(ativa, 100, put)).toBe("igual");
    expect(put).not.toHaveBeenCalled();
  });
  it("valor novo → PUT com o valor em BRL", async () => {
    const put = vi.fn(async () => ({ status: 200, body: { id: "pre-1" } }));
    expect(await novoValorDaAutomatica(ativa, 83.33, put)).toBe("atualizada");
    expect(put).toHaveBeenCalledWith("pre-1", { auto_recurring: { transaction_amount: 83.33, currency_id: "BRL" } });
  });
  it("o MP recusa ou a rede cai → falhou (quem chama avisa o dono)", async () => {
    expect(await novoValorDaAutomatica(ativa, 90, async () => ({ status: 400, body: { message: "x" } as { id?: unknown } }))).toBe("falhou");
    expect(await novoValorDaAutomatica(ativa, 90, async () => { throw new Error("rede"); })).toBe("falhou");
  });
});

describe("Task 8b — a fila das automáticas (regras puras)", () => {
  it("tenta de hora em hora, no máximo 24 vezes (1 dia)", () => {
    expect(MAX_TENTATIVAS).toBe(24);
    expect(proximaTentativaEm(new Date("2026-10-11T10:07:00.000Z"))).toBe("2026-10-11T11:07:00.000Z");
    expect(proximaTentativaEm(Date.parse("2026-10-31T23:30:00.000Z"))).toBe("2026-11-01T00:30:00.000Z");
  });

  it("atualizada, igual e sem automática fecham a pendência, em qualquer tentativa", () => {
    for (const r of ["atualizada", "igual", "sem_automatica"] as const) {
      expect(destinoDoResultado(r, 0)).toBe("feito");
      expect(destinoDoResultado(r, 23)).toBe("feito");
    }
  });

  it("falhou: de novo até a 23ª; a 24ª falha (23 antes desta) desiste", () => {
    expect(destinoDoResultado("falhou", 0)).toBe("de_novo");
    expect(destinoDoResultado("falhou", 22)).toBe("de_novo");
    expect(destinoDoResultado("falhou", 23)).toBe("desistiu");
    expect(destinoDoResultado("falhou", 40)).toBe("desistiu");
    // a coluna fora do formato conta como 0 (nunca desiste antes da hora)
    expect(destinoDoResultado("falhou", Number.NaN)).toBe("de_novo");
    expect(destinoDoResultado("falhou", -3)).toBe("de_novo");
  });

  it("o aviso ao dono: os nomes juntos, até 5 + \"e mais N\"", () => {
    expect(textoDoAvisoDaFila(["Ana", "Bia"])).toBe(
      "Não deu para mudar o valor da cobrança automática de: Ana, Bia. Confira no financeiro de cada aluno.",
    );
    expect(textoDoAvisoDaFila(["Ana", "Bia", "Caio", "Duda", "Edu", "Fábio", "Gil"])).toBe(
      "Não deu para mudar o valor da cobrança automática de: Ana, Bia, Caio, Duda, Edu e mais 2. Confira no financeiro de cada aluno.",
    );
    expect(textoDoAvisoDaFila(["Ana", "Bia", "Caio", "Duda", "Edu"])).toBe(
      "Não deu para mudar o valor da cobrança automática de: Ana, Bia, Caio, Duda, Edu. Confira no financeiro de cada aluno.",
    );
  });

  it("1 aluno: a frase de antes (a mesma do aviso na hora da pagamentos-aluno)", () => {
    expect(textoDoAvisoDaFila(["Ana Souza"])).toBe("Não deu para mudar o valor da cobrança automática de Ana Souza. Confira no financeiro do aluno.");
    expect(textoDoAvisoDaFila(["  Ana   Souza ", "", "   "])).toBe(
      "Não deu para mudar o valor da cobrança automática de Ana Souza. Confira no financeiro do aluno.",
    );
  });

  it("cabe nos 160 caracteres do sino (o avisar corta ali): com nome comprido saem menos nomes e o \"e mais\" cresce", () => {
    // 2 nomes compridos dariam 164 caracteres: fica 1 + "e mais 4"
    const longos = ["Maria Eduarda Albuquerque Pires", "João Pedro Cavalcanti Monteiro", "Ana Beatriz Figueiredo Lima", "Bia", "Caio"];
    expect(textoDoAvisoDaFila(longos)).toBe(
      "Não deu para mudar o valor da cobrança automática de: Maria Eduarda Albuquerque Pires e mais 4. Confira no financeiro de cada aluno.",
    );
    // 3 médios cabem; o 4º não
    const medios = ["Ana Beatriz Lima", "Bruno Costa Reis", "Carla Dias Mota", "Daniela Fonseca Vaz", "Eduardo Gomes"];
    const t = textoDoAvisoDaFila(medios);
    expect(t).toBe(
      "Não deu para mudar o valor da cobrança automática de: Ana Beatriz Lima, Bruno Costa Reis, Carla Dias Mota e mais 2. Confira no financeiro de cada aluno.",
    );
    expect(t.length).toBeLessThanOrEqual(160);
    const enorme = "N".repeat(300);
    for (const lista of [[enorme], [enorme, "Bia"], Array.from({ length: 40 }, (_, i) => `${enorme}${i}`)]) {
      const x = textoDoAvisoDaFila(lista);
      expect(x.length, x).toBeLessThanOrEqual(160);
      expect(x).toMatch(/^Não deu para mudar o valor da cobrança automática de/);
      expect(x).toMatch(lista.length === 1 ? /…\. Confira no financeiro do aluno\.$/ : /… e mais \d+\. Confira no financeiro de cada aluno\.$/);
    }
  });

  it("sem nome nenhum: a frase geral", () => {
    expect(textoDoAvisoDaFila([])).toBe(
      "Não deu para mudar o valor da cobrança automática de alguns alunos. Confira no financeiro de cada aluno.",
    );
  });

  it("o valor do aluno mudou enquanto a fila trabalhava? (em centavos; vazio e 0 são 'sem valor')", () => {
    expect(mesmoValor(100, 100)).toBe(true);
    expect(mesmoValor("83.33", 83.33)).toBe(true);
    expect(mesmoValor(83.33, 83.34)).toBe(false);
    expect(mesmoValor(null, null)).toBe(true); // NaN de um lado e do outro NÃO é "mudou" (senão a fila voltaria para sempre)
    expect(mesmoValor(null, 0)).toBe(true);
    expect(mesmoValor(null, 90)).toBe(false);
    expect(mesmoValor(undefined, "abc")).toBe(true);
  });

  it("o banco usa o mesmo teto (tentativas < 24) e a mesma hora — a migration da fila", () => {
    const sql = readFileSync(resolve(__dirname, "../../supabase-principal/migrations/20261011030000_wp_fila_automaticas.sql"), "utf-8");
    const tetos = [...sql.matchAll(/tentativas < (\d+)/g)].map((m) => Number(m[1]));
    expect(tetos.length).toBeGreaterThan(0);
    expect(new Set(tetos)).toEqual(new Set([MAX_TENTATIVAS]));
    expect(sql).toContain("select cron.schedule('automaticas-fila-{schema}', '7 * * * *', $$select {schema}.automaticas_disparar()$$);");
  });
});
