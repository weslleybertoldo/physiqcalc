import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerieComMemoria } from "./tipos";

// Tirar uma série (22/10/2026): as salvas seguintes só MUDAM DE NÚMERO no SQLite do aparelho (UPDATE, uma a uma em ordem crescente).
// Antes elas eram regravadas pelo número novo (INSERT OR REPLACE com só peso e reps): a corrida perdia o tempo, a distância e o pace,
// e a última linha antiga sobrava no banco.
const h = vi.hoisted(() => ({ sql: [] as { sql: string; args: unknown[] }[] }));
vi.mock("@powersync/react", () => ({
  usePowerSync: () => ({
    execute: async (sql: string, args: unknown[] = []) => {
      h.sql.push({ sql: sql.replace(/\s+/g, " ").trim(), args });
    },
    getAll: async () => [],
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useAcoesSeries } from "./useAcoesSeries";

const CORRIDA = "c0000000-0000-4000-8000-000000000001";
const SUPINO = "c0000000-0000-4000-8000-000000000002";

function abrir(series: SerieComMemoria[], academia = false) {
  let estado = series;
  const atualizar = vi.fn((acao: SerieComMemoria[] | ((antes: SerieComMemoria[]) => SerieComMemoria[])) => {
    estado = typeof acao === "function" ? acao(estado) : acao;
  });
  const { result } = renderHook(() =>
    useAcoesSeries({
      userId: "u1", dateKey: "2026-10-22", slotIdx: 0, grupoId: "g1", grupoPessoal: false, seriesTravadas: false, exercicios: [],
      series, concluido: false, academia: academia ? { id: "a1", nome: "Academia X" } as never : null, atualizar,
      aoConcluirSerie: vi.fn(), aoMudarConcluido: vi.fn(),
    }),
  );
  return { acoes: result.current, estado: () => estado };
}

const corrida = (n: number, tempo: number, km: number): SerieComMemoria => ({
  exercicio_id: CORRIDA, slot_idx: 0, numero_serie: n, peso: 0, reps: 0, concluida: true, salva: true,
  tempo_segundos: tempo, distancia_km: km, pace_segundos_km: Math.round(tempo / km),
});

beforeEach(() => {
  h.sql.length = 0;
});

describe("removerSerie (tirar uma série)", () => {
  it("corrida: apaga a S1 e as seguintes só mudam de número — tempo, distância e pace ficam; nada regravado", async () => {
    const { acoes, estado } = abrir([corrida(1, 600, 2), corrida(2, 900, 3), corrida(3, 1200, 4)]);
    await acoes.removerSerie(CORRIDA, 1, true);
    expect(h.sql.map((x) => x.sql.split(" WHERE")[0])).toEqual([
      "DELETE FROM tb_treino_series",
      "UPDATE tb_treino_series SET numero_serie = ?, updated_at = ?",
      "UPDATE tb_treino_series SET numero_serie = ?, updated_at = ?",
      "INSERT INTO tb_series_padrao_usuario (id, user_id, grupo_id, grupo_usuario_id, exercicio_id, exercicio_usuario_id, num_series, updated_at) VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)",
    ]);
    expect(h.sql[0].args).toEqual(["u1", CORRIDA, "2026-10-22", 0, 1]);
    // em ordem crescente: a 2 vira 1 e só depois a 3 vira 2 (nunca dois com o mesmo número)
    expect([h.sql[1].args[0], h.sql[1].args.at(-1)]).toEqual([1, 2]);
    expect([h.sql[2].args[0], h.sql[2].args.at(-1)]).toEqual([2, 3]);
    expect(h.sql.some((x) => x.sql.includes("INSERT OR REPLACE") || x.sql.startsWith("INSERT INTO tb_treino_series"))).toBe(false);
    expect(estado().map((s) => [s.numero_serie, s.tempo_segundos, s.distancia_km])).toEqual([[1, 900, 3], [2, 1200, 4]]);
  });

  it("tirar a do meio: só a seguinte muda de número; as anteriores não são tocadas", async () => {
    const { acoes } = abrir([corrida(1, 600, 2), corrida(2, 900, 3), corrida(3, 1200, 4)]);
    await acoes.removerSerie(CORRIDA, 2, true);
    const updates = h.sql.filter((x) => x.sql.startsWith("UPDATE tb_treino_series"));
    expect(updates.map((x) => [x.args[0], x.args.at(-1)])).toEqual([[2, 3]]);
  });

  it("musculação com academia: a memória de peso acompanha a série que andou, como antes", async () => {
    const sup = (n: number, peso: number): SerieComMemoria => ({ exercicio_id: SUPINO, slot_idx: 0, numero_serie: n, peso, reps: 10, concluida: true, salva: true });
    const { acoes, estado } = abrir([sup(1, 20), sup(2, 30), sup(3, 40)], true);
    await acoes.removerSerie(SUPINO, 2, true);
    const academia = h.sql.filter((x) => x.sql.startsWith("INSERT INTO tb_academia_pesos"));
    // [user, academia, exercicio_id, exercicio_usuario_id, numero, peso, quando]
    expect(academia.map((x) => [x.args[4], x.args[5]])).toEqual([[2, 40]]);
    expect(estado().map((s) => [s.numero_serie, s.peso])).toEqual([[1, 20], [2, 40]]);
  });

  it("série que ainda não foi salva: só sai da tela (nada no banco além do nº de séries)", async () => {
    const nova = (n: number): SerieComMemoria => ({ exercicio_id: SUPINO, slot_idx: 0, numero_serie: n, peso: 0, reps: 10, salva: false });
    const { acoes, estado } = abrir([nova(1), nova(2)]);
    await acoes.removerSerie(SUPINO, 1, false);
    expect(h.sql.filter((x) => x.sql.includes("tb_treino_series"))).toEqual([]);
    expect(estado().map((s) => s.numero_serie)).toEqual([1]);
  });
});
