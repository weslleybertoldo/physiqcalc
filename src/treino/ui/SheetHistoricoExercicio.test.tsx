// Physiq hml-14b (H-73 · D19): o Histórico do exercício pagina POR DIA — 20 dias por vez, total de dias, "Ver mais dias",
// nunca parte um dia. O banco local é falso: responde às 3 consultas de `historicoExercicio.ts` sobre as linhas do teste.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agruparPorDia, DIAS_POR_PAGINA, lerPaginaDoHistorico, type BancoLocal, type RegistroHistorico } from "./historicoExercicio";

interface Linha extends RegistroHistorico {
  user_id: string;
  exercicio_id: string | null;
  exercicio_usuario_id: string | null;
  concluida: number;
}

const h = vi.hoisted(() => ({ db: null as unknown as BancoLocal }));
vi.mock("@powersync/react", () => ({ usePowerSync: () => h.db }));

import { SheetHistoricoExercicio } from "./SheetHistoricoExercicio";

const dia = (n: number) => `2026-${String(1 + Math.floor(n / 28)).padStart(2, "0")}-${String(1 + (n % 28)).padStart(2, "0")}`;

/** `dias` dias (o 0 é o mais antigo), `seriesPorDia` séries em cada um, do aluno u1 no exercício ex1. */
function linhas(dias: number, seriesPorDia: (d: number) => number = () => 3): Linha[] {
  const r: Linha[] = [];
  for (let d = 0; d < dias; d++)
    for (let s = 1; s <= seriesPorDia(d); s++)
      r.push({
        user_id: "u1", exercicio_id: "ex1", exercicio_usuario_id: null, concluida: 1, data_treino: dia(d), numero_serie: s,
        peso: 20 + d, reps: 10, tempo_segundos: null, distancia_km: null, pace_segundos_km: null, academia_nome: null,
      });
  return r;
}

/** Banco falso: o filtro do histórico em JS + as 3 consultas (contagem, página de dias, séries dos dias). */
function bancoFalso(todas: Linha[]) {
  const getAll = vi.fn(async (sql: string, p: unknown[] = []) => {
    const [uid, ex] = p as string[];
    const doFiltro = todas.filter(
      (l) => l.user_id === uid && l.concluida === 1 && (l.exercicio_id === ex || l.exercicio_usuario_id === ex) &&
        ((l.peso ?? 0) > 0 || (l.tempo_segundos ?? 0) > 0),
    );
    const diasDesc = [...new Set(doFiltro.map((l) => l.data_treino))].sort().reverse();
    if (sql.includes("COUNT(DISTINCT data_treino)")) return [{ total: diasDesc.length }];
    if (sql.includes("SELECT DISTINCT data_treino")) {
      const antes = sql.includes("data_treino < ?") ? (p[3] as string) : undefined;
      const limite = p[p.length - 1] as number;
      return diasDesc.filter((d) => !antes || d < antes).slice(0, limite).map((d) => ({ data_treino: d }));
    }
    if (sql.includes("data_treino IN")) {
      const escolhidos = new Set(p.slice(3) as string[]);
      return doFiltro.filter((l) => escolhidos.has(l.data_treino));
    }
    throw new Error(`consulta inesperada: ${sql}`);
  });
  return { getAll } as unknown as BancoLocal & { getAll: typeof getAll };
}

const na = (seletor: string) => document.body.querySelector(seletor);
const todas = (seletor: string) => document.body.querySelectorAll(seletor);
const abrir = () => render(<SheetHistoricoExercicio userId="u1" exercicio={{ id: "ex1", nome: "Supino" }} aoFechar={() => {}} />);

describe("lerPaginaDoHistorico (H-73)", () => {
  it("devolve 20 dias inteiros e o total; a página seguinte começa no dia mais antigo já lido", async () => {
    // 25 dias; o 20º mais novo (dia 5) tem 9 séries — com o LIMIT 50 de antes ele seria partido
    const db = bancoFalso(linhas(25, (d) => (d === 5 ? 9 : 3)));
    const p1 = await lerPaginaDoHistorico(db, "u1", "ex1");
    expect(p1.totalDias).toBe(25);
    expect(p1.dias).toHaveLength(DIAS_POR_PAGINA);
    expect(p1.dias[0].dia).toBe(dia(24));
    expect(p1.dias[19]).toEqual(expect.objectContaining({ dia: dia(5) }));
    expect(p1.dias[19].series.map((s) => s.numero_serie)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const p2 = await lerPaginaDoHistorico(db, "u1", "ex1", p1.dias[19].dia);
    expect(p2.dias.map((d) => d.dia)).toEqual([dia(4), dia(3), dia(2), dia(1), dia(0)]);
    expect(p2.totalDias).toBe(25);
  });

  it("o aluno com 60 séries (o caso real) vê as 60", async () => {
    const db = bancoFalso(linhas(12, () => 5));
    const p = await lerPaginaDoHistorico(db, "u1", "ex1");
    expect(p.dias.flatMap((d) => d.series)).toHaveLength(60);
  });

  it("sem série não pede as séries", async () => {
    const db = bancoFalso([]);
    expect(await lerPaginaDoHistorico(db, "u1", "ex1")).toEqual({ dias: [], totalDias: 0 });
    expect(db.getAll).toHaveBeenCalledTimes(2);
  });

  it("agruparPorDia: mais novo primeiro e as séries em ordem", () => {
    const [a, b] = linhas(2, () => 2);
    const [c, d] = linhas(2, () => 2).slice(2);
    expect(agruparPorDia([b, d, a, c]).map((g) => [g.dia, g.series.map((s) => s.numero_serie)])).toEqual([
      [dia(1), [1, 2]],
      [dia(0), [1, 2]],
    ]);
  });
});

describe("SheetHistoricoExercicio (H-73)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("mostra 20 dias, o total, e 'Ver mais dias' traz o resto sem repetir dia", async () => {
    h.db = bancoFalso(linhas(25));
    abrir();
    await waitFor(() => expect(todas("[data-historico-dia]")).toHaveLength(20));
    expect(na("[data-historico-contagem]")?.textContent).toBe("20 de 25 dias");
    expect(na("[data-historico-exercicio]")).toHaveAttribute("data-historico-total-dias", "25");
    const botao = na("[data-ver-mais-dias]") as HTMLButtonElement;
    expect(botao.textContent).toBe("Ver mais dias (5)");
    fireEvent.click(botao);
    await waitFor(() => expect(todas("[data-historico-dia]")).toHaveLength(25));
    expect(new Set([...todas("[data-historico-dia]")].map((e) => e.getAttribute("data-historico-dia"))).size).toBe(25);
    expect(na("[data-ver-mais-dias]")).toBeNull();
    expect(na("[data-historico-contagem]")?.textContent).toBe("25 de 25 dias");
  });

  it("até 20 dias: tudo de uma vez, sem contagem nem botão", async () => {
    h.db = bancoFalso(linhas(12, () => 5));
    abrir();
    await waitFor(() => expect(todas("[data-historico-dia]")).toHaveLength(12));
    expect(todas("[data-historico-dia] li")).toHaveLength(60);
    expect(na("[data-ver-mais-dias]")).toBeNull();
    expect(na("[data-historico-contagem]")).toBeNull();
  });

  it("sem registros: estado vazio", async () => {
    h.db = bancoFalso([]);
    abrir();
    await waitFor(() => expect(document.body.textContent).toContain("Nenhum registro ainda"));
  });

  it("erro do banco local: aviso de erro", async () => {
    h.db = { getAll: vi.fn(async () => Promise.reject(new Error("sqlite"))) };
    abrir();
    await waitFor(() => expect(document.body.textContent).toContain("Não deu para ler o histórico agora."));
  });

  it("erro no 'Ver mais dias': os dias lidos ficam e o aviso aparece", async () => {
    const db = bancoFalso(linhas(25));
    h.db = db;
    abrir();
    await waitFor(() => expect(todas("[data-historico-dia]")).toHaveLength(20));
    db.getAll.mockImplementationOnce(async () => Promise.reject(new Error("sqlite")));
    fireEvent.click(na("[data-ver-mais-dias]") as HTMLButtonElement);
    await waitFor(() => expect(document.body.textContent).toContain("Não deu para ler os dias mais antigos agora."));
    expect(todas("[data-historico-dia]")).toHaveLength(20);
  });
});
