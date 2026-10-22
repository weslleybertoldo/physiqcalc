import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerieComMemoria } from "./tipos";

// Tirar uma série (22/10/2026): as salvas seguintes só MUDAM DE NÚMERO no SQLite do aparelho (UPDATE, uma a uma em ordem crescente).
// Antes elas eram regravadas pelo número novo (INSERT OR REPLACE com só peso e reps): a corrida perdia o tempo, a distância e o pace,
// e a última linha antiga sobrava no banco.

// O SQLite de mentira anota cada comando e guarda as linhas gravadas de tb_treino_series e tb_academia_pesos (o bastante para o
// SELECT do id achar a linha que outro salvamento gravou). Como no PowerSync, toda escrita passa pela trava de escrita (uma de cada
// vez): o execute solto é uma transação de um comando só e a writeTransaction segura a trava até o fim; a leitura solta não espera.
const h = vi.hoisted(() => {
  const sql: { sql: string; args: unknown[] }[] = [];
  const series = new Map<string, unknown[]>();
  const pesos = new Map<string, unknown[]>();
  let ids = 0;
  let fila: Promise<unknown> = Promise.resolve();
  // o comando é anotado quando é chamado e muda as linhas quando roda (dentro da trava)
  const anotar = (texto: string, args: unknown[]) => {
    const s = texto.replace(/\s+/g, " ").trim();
    sql.push({ sql: s, args });
    return s;
  };
  const aplicar = (s: string, args: unknown[]) => {
    if (s.startsWith("INSERT INTO tb_treino_series")) series.set(`id-${++ids}`, args);
    else if (s.startsWith("INSERT OR REPLACE INTO tb_treino_series")) series.set(args[0] as string, args.slice(1));
    else if (s.startsWith("INSERT INTO tb_academia_pesos")) pesos.set(`id-${++ids}`, args);
  };
  const getAll = async (texto: string, args: unknown[] = []) => {
    // série: [user, exercicio_id, exercicio_usuario_id, data, slot, numero, …] · peso da academia: [user, academia, exercicio_id, exercicio_usuario_id, numero, …]
    if (texto.includes("FROM tb_treino_series")) {
      const [user, ex, data, slot, num] = args;
      return [...series].filter(([, v]) => v[0] === user && (v[1] === ex || v[2] === ex) && v[3] === data && v[4] === slot && v[5] === num).map(([id]) => ({ id }));
    }
    if (texto.includes("FROM tb_academia_pesos")) {
      const [user, academia, ex, exUsuario, num] = args;
      return [...pesos].filter(([, v]) => v[0] === user && v[1] === academia && (v[2] ?? "") === ex && (v[3] ?? "") === exUsuario && v[4] === num).map(([id]) => ({ id }));
    }
    return [];
  };
  const writeTransaction = (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { execute: async (texto: string, args: unknown[] = []) => aplicar(anotar(texto, args), args), getAll };
    const vez = fila.then(() => fn(tx));
    fila = vez.catch(() => undefined);
    return vez;
  };
  const execute = (texto: string, args: unknown[] = []) => {
    const s = anotar(texto, args);
    return writeTransaction(async () => aplicar(s, args));
  };
  return {
    sql, series, db: { execute, getAll, writeTransaction },
    zerar: () => {
      sql.length = 0;
      series.clear();
      pesos.clear();
    },
  };
});
vi.mock("@powersync/react", () => ({ usePowerSync: () => h.db }));
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
  h.zerar();
});

// 2 salvamentos da MESMA série nova quase juntos (o Tempo ao sair do campo e o OK logo depois, 22/10/2026): os 2 procuravam a linha
// antes de o 1º gravar e nasciam 2 linhas da mesma série — na volta da internet o servidor recusava a 2ª (chave única, 23505) e o
// que só ela tinha (a distância) sumia.
describe("gravar (salvar a série no aparelho)", () => {
  const novaCorrida: SerieComMemoria = { exercicio_id: CORRIDA, slot_idx: 0, numero_serie: 1, peso: 0, reps: 0, salva: false };
  const gravacoes = () => h.sql.filter((x) => x.sql.includes("INTO tb_treino_series"));

  it("corrida: o Tempo e o km da série nova salvos ao mesmo tempo ficam numa linha só (o 2º acha a do 1º)", async () => {
    const { acoes } = abrir([novaCorrida]);
    await Promise.all([acoes.salvarSerie(CORRIDA, 1, 0, 0, 600), acoes.salvarSerie(CORRIDA, 1, 0, 0, 600, 3)]);
    expect(gravacoes().map((x) => x.sql.split(" (")[0])).toEqual(["INSERT INTO tb_treino_series", "INSERT OR REPLACE INTO tb_treino_series"]);
    const id = gravacoes()[1].args[0] as string;
    expect([...h.series.keys()]).toEqual([id]);
    // [user, exercicio_id, exercicio_usuario_id, data, slot, numero, peso, reps, tempo, distância, …]
    expect(h.series.get(id)?.slice(8, 10)).toEqual([600, 3]);
  });

  it("o Tempo saindo do campo e o OK juntos: uma linha só, já concluída", async () => {
    const { acoes } = abrir([novaCorrida]);
    await Promise.all([acoes.salvarSerie(CORRIDA, 1, 0, 0, 600), acoes.concluirSerie(CORRIDA, "Corrida", 1, 0, 0, 600, 3)]);
    expect(h.series.size).toBe(1);
    // […, distância, pace, concluída, …]
    expect([...h.series.values()][0].slice(9, 12)).toEqual([3, 200, true]);
  });

  it("musculação com academia: a memória de peso da série nova também fica numa linha só", async () => {
    const nova: SerieComMemoria = { exercicio_id: SUPINO, slot_idx: 0, numero_serie: 1, peso: 0, reps: 10, salva: false };
    const { acoes } = abrir([nova], true);
    await Promise.all([acoes.salvarSerie(SUPINO, 1, 40, 10), acoes.salvarSerie(SUPINO, 1, 40, 12)]);
    expect(gravacoes().map((x) => x.sql.split(" (")[0])).toEqual(["INSERT INTO tb_treino_series", "INSERT OR REPLACE INTO tb_treino_series"]);
    const academia = h.sql.filter((x) => /^(INSERT INTO|UPDATE) tb_academia_pesos/.test(x.sql));
    expect(academia.map((x) => x.sql.split(" ")[0])).toEqual(["INSERT", "UPDATE"]);
  });
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
