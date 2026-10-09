// Physiq hml-14d (B21 · D30): a Evolução do app lê as 200 avaliações MAIS NOVAS (antes, as 200 mais antigas — acima de 200 a
// avaliação nova sumia do gráfico) e as devolve em ordem crescente, como antes; as fotos mensais também param em 200 (as mais
// novas). O banco do Treino é falso: aplica o eq, a ordem e o limite da consulta sobre as linhas do teste.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
interface Consulta {
  tabela: string;
  filtros: Array<[string, unknown]>;
  ordem: Array<[string, boolean]>;
  limite: number | null;
  unico: boolean;
}

const h = vi.hoisted(() => ({
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  consultas: [] as Consulta[],
  erro: null as null | { message: string },
}));

vi.mock("@/integrations/supabase/client", () => {
  const executar = (c: Consulta) => {
    if (h.erro && c.tabela === "physiq_avaliacoes") return { data: null, error: h.erro };
    let linhas = (h.tabelas[c.tabela] ?? []).filter((l) => c.filtros.every(([col, v]) => l[col] === v));
    linhas = [...linhas].sort((a, b) => {
      for (const [col, asc] of c.ordem) {
        const x = String(a[col]);
        const y = String(b[col]);
        if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
      }
      return 0;
    });
    // o PostgREST corta em 1000 sem avisar (max_rows)
    linhas = linhas.slice(0, Math.min(c.limite ?? Infinity, 1000));
    return { data: c.unico ? (linhas[0] ?? null) : linhas, error: null };
  };
  const from = (tabela: string) => {
    const c: Consulta = { tabela, filtros: [], ordem: [], limite: null, unico: false };
    h.consultas.push(c);
    const b = {
      select: () => b,
      eq: (col: string, v: unknown) => (c.filtros.push([col, v]), b),
      order: (col: string, o?: { ascending?: boolean }) => (c.ordem.push([col, o?.ascending !== false]), b),
      limit: (n: number) => ((c.limite = n), b),
      maybeSingle: () => ((c.unico = true), b),
      then: (ok: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(executar(c)).then(ok, falhou),
    };
    return b;
  };
  return { DB_SCHEMA: "staging", supabase: { from, storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) } } };
});

import { carregarTreino, ErroFonte, MAX_AVALIACOES, MAX_FOTOS } from "./fontes";

const semAssinar = async () => ({});
const dataDe = (i: number) => {
  const d = new Date(Date.UTC(2009, 0, 1) + i * 20 * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const avaliacao = (i: number, uid = "t1"): Linha => ({
  id: `av-${String(i).padStart(4, "0")}`, user_id: uid, data_avaliacao: dataDe(i), peso: 80 - i * 0.01,
});

beforeEach(() => {
  h.tabelas = { physiq_profiles: [{ id: "t1", peso: 78 }], physiq_avaliacoes: [], physiq_registros_fotos: [] };
  h.consultas = [];
  h.erro = null;
});

describe("Evolução do app — as avaliações mais novas (hml-14d, D30)", () => {
  it("com 201 avaliações, a mais nova fica (sai a mais antiga) e a lista volta em ordem crescente", async () => {
    h.tabelas.physiq_avaliacoes = [...Array.from({ length: 201 }, (_, i) => avaliacao(i)), avaliacao(500, "outro")];
    const parte = await carregarTreino("t1", semAssinar);
    const ids = parte.avaliacoes.map((a) => a.id);
    expect(MAX_AVALIACOES).toBe(200);
    expect(ids).toHaveLength(200);
    expect(ids).toContain("av-0200"); // a mais nova
    expect(ids).not.toContain("av-0000"); // a mais antiga sai
    expect(ids[0]).toBe("av-0001");
    expect(ids.at(-1)).toBe("av-0200");
    const datas = parte.avaliacoes.map((a) => String(a.data_avaliacao));
    expect([...datas].sort()).toEqual(datas);
    expect(parte.perfil).toEqual({ id: "t1", peso: 78 });
  });

  it("o pedido: data desc + id desc (desempate), limite 200; no mesmo dia, o id decide (crescente na resposta)", async () => {
    h.tabelas.physiq_avaliacoes = [
      { id: "av-b", user_id: "t1", data_avaliacao: "2026-10-01" },
      { id: "av-a", user_id: "t1", data_avaliacao: "2026-10-01" },
      { id: "av-c", user_id: "t1", data_avaliacao: "2026-09-01" },
    ];
    const parte = await carregarTreino("t1", semAssinar);
    expect(parte.avaliacoes.map((a) => a.id)).toEqual(["av-c", "av-a", "av-b"]);
    const pedido = h.consultas.find((c) => c.tabela === "physiq_avaliacoes")!;
    expect(pedido.filtros).toEqual([["user_id", "t1"]]);
    expect(pedido.ordem).toEqual([["data_avaliacao", false], ["id", false]]);
    expect(pedido.limite).toBe(200);
  });

  it("as fotos mensais: as 200 mais novas (antes, sem limite — o PostgREST cortava em 1000 as mais novas primeiro)", async () => {
    h.tabelas.physiq_registros_fotos = Array.from({ length: 230 }, (_, i) => ({
      id: `f${i}`, user_id: "t1", mes_ref: `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, tipo: "frente",
      storage_path: `t1/${i}.jpg`, created_at: "2026-01-01T00:00:00Z",
    }));
    const parte = await carregarTreino("t1", semAssinar);
    expect(MAX_FOTOS).toBe(200);
    expect(parte.fotos).toHaveLength(200);
    expect(parte.fotos[0].id).toBe("f229");
    const pedido = h.consultas.find((c) => c.tabela === "physiq_registros_fotos")!;
    expect(pedido.ordem).toEqual([["mes_ref", false]]);
    expect(pedido.limite).toBe(200);
  });

  it("erro do banco nas avaliações → ErroFonte do Treino (a tela mostra o erro, nunca a lista vazia)", async () => {
    h.erro = { message: "statement timeout" };
    await expect(carregarTreino("t1", semAssinar)).rejects.toBeInstanceOf(ErroFonte);
  });
});
