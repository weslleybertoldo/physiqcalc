// Physiq hml-14d (B21 · D29): o calendário da aba Treino lê no SQLite SÓ a janela do mês (sem o LIMIT 500 de antes) e o mês exato
// continua no fuso do aparelho. O banco local é falso: aplica o WHERE da consulta comparando TEXTO, como o SQLite (e o LIMIT, se
// a consulta tiver — a leitura de antes perdia os meses antigos do 501º treino em diante).
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = {
  id: string;
  user_id: string;
  nome_treino: string;
  iniciado_em: string;
  concluido_em: string;
  duracao_segundos: number;
  exercicios_concluidos: string;
};

const h = vi.hoisted(() => ({
  linhas: [] as Array<Record<string, unknown>>,
  consultas: [] as Array<{ sql: string; p: unknown[] }>,
  cache: new Map<string, { data: unknown[] }>(),
}));

vi.mock("@powersync/react", () => ({
  usePowerSync: () => ({ execute: async () => {} }),
  // a mesma referência por consulta e parâmetros (como o watch do PowerSync)
  useQuery: (sql: string, p: unknown[] = []) => {
    const chave = `${sql}|${JSON.stringify(p)}`;
    const ja = h.cache.get(chave);
    if (ja) return ja;
    h.consultas.push({ sql, p });
    let data: unknown[];
    if (sql.includes("FROM tb_treino_concluido")) data = [];
    else if (sql.includes("FROM treino_historico")) {
      const [uid, desde, ate] = p as string[];
      let r = h.linhas.filter((l) => l.user_id === uid);
      if (sql.includes("iniciado_em >= ?")) r = r.filter((l) => String(l.iniciado_em) >= desde && String(l.iniciado_em) < ate);
      r = [...r].sort((a, b) => (String(a.concluido_em) < String(b.concluido_em) ? 1 : -1));
      const limite = /LIMIT (\d+)/.exec(sql);
      if (limite) r = r.slice(0, Number(limite[1]));
      data = r;
    } else throw new Error(`consulta inesperada: ${sql}`);
    const resposta = { data };
    h.cache.set(chave, resposta);
    return resposta;
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { Historico } from "./Historico";

/** "2026-10-31T02:30:00.000Z" (o gravado no aparelho, toISOString) → "2026-10-31 02:30:00.000000Z" (o que vem do servidor). */
const doServidor = (iso: string) => iso.replace("T", " ").replace(/\.(\d{3})Z$/, ".$1000Z");

let n = 0;
function treino(inicio: Date, formato: "aparelho" | "servidor" = "aparelho", nome = "Treino A"): Linha {
  n += 1;
  const fim = new Date(inicio.getTime() + 60 * 60 * 1000);
  const texto = (d: Date) => (formato === "aparelho" ? d.toISOString() : doServidor(d.toISOString()));
  return {
    id: `h${n}`, user_id: "u1", nome_treino: nome, iniciado_em: texto(inicio), concluido_em: texto(fim), duracao_segundos: 3600,
    exercicios_concluidos: "[]",
  };
}

const itens = () => [...document.body.querySelectorAll("[data-historico-item]")].map((e) => e.getAttribute("data-historico-item"));
const mes = () => document.body.querySelector("[data-historico-treinos]")?.getAttribute("data-historico-treinos");
const clicar = (seletor: string) => fireEvent.click(document.body.querySelector(seletor)!);

beforeEach(() => {
  // só o Date é falso: a tela abre em outubro de 2026 (no fuso do aparelho que rodar o teste)
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0));
  h.linhas = [];
  h.consultas = [];
  h.cache.clear();
  n = 0;
});
afterEach(() => vi.useRealTimers());

describe("Histórico do app (calendário) — hml-14d (D29)", () => {
  it("lê só a janela do mês (do dia antes do 1º ao dia depois do último), sem LIMIT", () => {
    render(<Historico userId="u1" aoVoltar={() => {}} />);
    const historico = h.consultas.filter((c) => c.sql.includes("FROM treino_historico"));
    expect(historico).toHaveLength(1);
    expect(historico[0].sql).not.toMatch(/LIMIT/i);
    expect(historico[0].sql).toMatch(/iniciado_em >= \? AND iniciado_em < \?/);
    expect(historico[0].p).toEqual(["u1", "2026-09-30", "2026-11-02"]);
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]"); // dezembro de 2025: a janela vira o ano
    expect(mes()).toBe("2025-12");
    expect(h.consultas.filter((c) => c.sql.includes("FROM treino_historico")).at(-1)?.p).toEqual(["u1", "2025-11-30", "2026-01-02"]);
  });

  it("os 2 formatos de iniciado_em (o do aparelho e o do servidor) entram no mês", () => {
    const a = treino(new Date(2026, 9, 5, 18, 0), "aparelho");
    const b = treino(new Date(2026, 9, 6, 7, 30), "servidor");
    const outroAluno = { ...treino(new Date(2026, 9, 7, 7, 30)), user_id: "u2" };
    h.linhas = [a, b, outroAluno];
    render(<Historico userId="u1" aoVoltar={() => {}} />);
    expect(itens().sort()).toEqual([a.id, b.id].sort());
    expect(document.body.querySelector("[data-historico-lista]")?.getAttribute("data-historico-lista")).toBe("2");
  });

  it("o treino na virada do mês fica no mês do fuso do aparelho, nos 2 formatos", () => {
    const fimOut = treino(new Date(2026, 9, 31, 23, 30), "aparelho");
    const fimOutServ = treino(new Date(2026, 9, 31, 23, 45), "servidor");
    const iniNov = treino(new Date(2026, 10, 1, 0, 30), "aparelho");
    const iniNovServ = treino(new Date(2026, 10, 1, 0, 15), "servidor");
    const iniOut = treino(new Date(2026, 9, 1, 0, 10), "servidor");
    const fimSet = treino(new Date(2026, 8, 30, 23, 50), "aparelho");
    h.linhas = [fimOut, fimOutServ, iniNov, iniNovServ, iniOut, fimSet];
    render(<Historico userId="u1" aoVoltar={() => {}} />);
    expect(mes()).toBe("2026-10");
    expect(itens().sort()).toEqual([fimOut.id, fimOutServ.id, iniOut.id].sort());
    clicar("[data-mes-proximo]");
    expect(mes()).toBe("2026-11");
    expect(itens().sort()).toEqual([iniNov.id, iniNovServ.id].sort());
    clicar("[data-mes-anterior]");
    clicar("[data-mes-anterior]");
    expect(mes()).toBe("2026-09");
    expect(itens()).toEqual([fimSet.id]);
  });

  it("com mais de 500 treinos no histórico, o mês antigo continua com os seus (antes: vazio)", () => {
    // 520 treinos MAIS NOVOS que os de março (concluídos depois; em novembro e dezembro, para a tela de outubro abrir leve)
    const recentes: Linha[] = [];
    for (let i = 0; i < 520; i++) recentes.push(treino(new Date(2026, 10 + (i % 2), 1 + (i % 28), 6 + (i % 12), 0)));
    const marco = [treino(new Date(2026, 2, 3, 7, 0)), treino(new Date(2026, 2, 10, 7, 0), "servidor"), treino(new Date(2026, 2, 17, 7, 0))];
    h.linhas = [...recentes, ...marco];
    render(<Historico userId="u1" aoVoltar={() => {}} />);
    for (let i = 0; i < 7; i++) clicar("[data-mes-anterior]");
    expect(mes()).toBe("2026-03");
    expect(itens().sort()).toEqual(marco.map((t) => t.id).sort());
  });
});
