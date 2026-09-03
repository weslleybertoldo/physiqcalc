import { describe, it, expect } from "vitest";
import {
  blocosSecundarios,
  statusVolume,
  calcularVolumeSemanal,
  calcularVolumePraticado,
  formatarSeries,
  LANDMARKS,
  type GrupoVolume,
  type SemanaRowVolume,
} from "./volumeSemanal";
import type { SeriePadraoRow } from "./seriesPadrao";

const ex = (over: Partial<GrupoVolume["exercicios"][number]> = {}) => ({
  id: "e1",
  isPessoal: false,
  nome: "Agachamento",
  grupo_muscular: "Quadríceps",
  tipo: null,
  ...over,
});

/** linha de tb_series_padrao_usuario (sem exercício = geral do treino) */
const cfg = (over: Partial<SeriePadraoRow>): SeriePadraoRow => ({
  grupo_id: null,
  grupo_usuario_id: null,
  exercicio_id: null,
  exercicio_usuario_id: null,
  num_series: 3,
  ...over,
});

describe("blocosSecundarios", () => {
  it("deriva o secundário após a '/'", () => {
    expect(blocosSecundarios("Quadríceps / Glúteo")).toEqual(["gluteo"]);
  });
  it("sem '/' não tem secundário", () => {
    expect(blocosSecundarios("Peitoral")).toEqual([]);
  });
  it("secundário igual ao primário é descartado", () => {
    expect(blocosSecundarios("Dorsal / Rombóide")).toEqual([]);
  });
  it("vários secundários, sem repetir", () => {
    expect(blocosSecundarios("Quadríceps / Glúteo / Lombar")).toEqual(["gluteo", "costas"]);
  });
  it("secundário desconhecido é ignorado", () => {
    expect(blocosSecundarios("Quadríceps / Zzz")).toEqual([]);
  });
});

describe("statusVolume", () => {
  it("no limite (>= MRV) = limite", () => {
    expect(statusVolume("quadriceps", LANDMARKS.quadriceps.mrv)).toBe("limite");
    expect(statusVolume("quadriceps", 25)).toBe("limite");
  });
  it(">= 85% do MRV = perto", () => {
    expect(statusVolume("quadriceps", 17)).toBe("perto"); // 0.85 * 20
  });
  it("faixa produtiva entre MEV e 85% MRV", () => {
    expect(statusVolume("quadriceps", 12)).toBe("produtivo");
  });
  it("abaixo do MEV = abaixo", () => {
    expect(statusVolume("quadriceps", 5)).toBe("abaixo");
  });
  it("bloco sem landmark (cardio/outros) = neutro", () => {
    expect(statusVolume("cardio", 10)).toBe("neutro");
    expect(statusVolume("outros", 10)).toBe("neutro");
  });
});

describe("calcularVolumeSemanal (Programado = nº configurado no Treino Diário)", () => {
  const semana: SemanaRowVolume[] = [
    { dia_semana: "SEG", grupo_id: "gA", grupo_usuario_id: null },
    { dia_semana: "SEX", grupo_id: "gA", grupo_usuario_id: null },
    { dia_semana: "TER", grupo_id: null, grupo_usuario_id: "gP" },
  ];

  it("soma séries × ocorrências na semana; sem configuração vale o padrão 3", () => {
    const grupos = {
      "catalogo:gA": { nome: "Treino A", exercicios: [ex()] },
      "pessoal:gP": { nome: "Meu treino", exercicios: [ex({ id: "e2", isPessoal: true, nome: "Leg press" })] },
    };
    // Leg press tem nº próprio no treino pessoal (exercício pessoal); Agachamento não tem nada
    const config = [cfg({ grupo_usuario_id: "gP", exercicio_usuario_id: "e2", num_series: 4 })];
    const res = calcularVolumeSemanal(semana, grupos, config);
    expect(res).toHaveLength(1);
    const quad = res[0];
    expect(quad.bloco.key).toBe("quadriceps");
    // Agachamento 3 (padrão) × 2 dias + Leg press 4 × 1 dia = 10
    expect(quad.total).toBe(10);
    expect(quad.status).toBe("produtivo");
    const agacho = quad.detalhes.find((d) => d.nome === "Agachamento")!;
    expect(agacho).toMatchObject({ series: 3, seriesEhPadrao: true, vezes: 2, fator: 1, subtotal: 6 });
    const leg = quad.detalhes.find((d) => d.nome === "Leg press")!;
    expect(leg).toMatchObject({ series: 4, seriesEhPadrao: false, vezes: 1, subtotal: 4 });
  });

  it("sem lista de configuração, tudo é padrão 3 (e o último treino registrado NÃO entra)", () => {
    const grupos = { "catalogo:gA": { nome: "Treino A", exercicios: [ex()] } };
    const res = calcularVolumeSemanal([semana[0]], grupos);
    expect(res[0].detalhes[0]).toMatchObject({ series: 3, seriesEhPadrao: true, subtotal: 3 });
    expect(calcularVolumeSemanal([semana[0]], grupos, null)[0].total).toBe(3);
  });

  it("geral do treino vale pra todos os exercícios; nº próprio do exercício vence o geral", () => {
    const grupos = {
      "catalogo:gA": { nome: "Treino A", exercicios: [ex(), ex({ id: "e3", nome: "Extensora" })] },
    };
    const config = [
      cfg({ grupo_id: "gA", num_series: 4 }), // geral do treino
      cfg({ grupo_id: "gA", exercicio_id: "e3", num_series: 2 }), // próprio da Extensora
    ];
    const res = calcularVolumeSemanal([semana[0]], grupos, config);
    const quad = res[0];
    expect(quad.detalhes.find((d) => d.nome === "Agachamento")).toMatchObject({ series: 4, seriesEhPadrao: false, subtotal: 4 });
    expect(quad.detalhes.find((d) => d.nome === "Extensora")).toMatchObject({ series: 2, seriesEhPadrao: false, subtotal: 2 });
    expect(quad.total).toBe(6);
  });

  it("configuração de um treino não vaza pra outro treino com o mesmo exercício", () => {
    const grupos = {
      "catalogo:gA": { nome: "Treino A", exercicios: [ex()] },
      "catalogo:gB": { nome: "Treino B", exercicios: [ex()] },
    };
    const rows: SemanaRowVolume[] = [semana[0], { dia_semana: "QUI", grupo_id: "gB", grupo_usuario_id: null }];
    const res = calcularVolumeSemanal(rows, grupos, [cfg({ grupo_id: "gA", num_series: 5 })]);
    const quad = res[0];
    // mesmo exercício com nº diferente = 2 linhas, cada uma 1×/sem; total 5 + 3 = 8
    expect(quad.detalhes).toHaveLength(2);
    expect(quad.detalhes.map((d) => [d.series, d.seriesEhPadrao, d.vezes, d.subtotal])).toEqual([
      [5, false, 1, 5],
      [3, true, 1, 3],
    ]);
    expect(quad.total).toBe(8);
  });

  it("mesmo nº de séries em 2 dias vira uma linha só (× 2×/sem)", () => {
    const grupos = { "catalogo:gA": { nome: "Treino A", exercicios: [ex()] } };
    const res = calcularVolumeSemanal([semana[0], semana[1]], grupos, [cfg({ grupo_id: "gA", num_series: 4 })]);
    expect(res[0].detalhes).toEqual([
      { nome: "Agachamento", series: 4, seriesEhPadrao: false, vezes: 2, fator: 1, subtotal: 8 },
    ]);
  });

  it("secundário conta 0,5 por série", () => {
    const grupos = {
      "catalogo:gA": { nome: "Treino A", exercicios: [ex({ grupo_muscular: "Quadríceps / Glúteo" })] },
    };
    const res = calcularVolumeSemanal([semana[0]], grupos, [cfg({ grupo_id: "gA", num_series: 4 })]);
    const quad = res.find((r) => r.bloco.key === "quadriceps")!;
    const glut = res.find((r) => r.bloco.key === "gluteo")!;
    expect(quad.total).toBe(4);
    expect(glut.total).toBe(2);
    expect(glut.detalhes[0].fator).toBe(0.5);
  });

  it("grupo não encontrado é ignorado; blocos seguem a ordem canônica", () => {
    const grupos = {
      "catalogo:gA": {
        nome: "Treino A",
        exercicios: [
          ex({ grupo_muscular: "Peitoral", nome: "Supino" }),
          ex({ id: "e3", grupo_muscular: "Tríceps", nome: "Testa" }),
        ],
      },
    };
    const res = calcularVolumeSemanal(
      [semana[0], { dia_semana: "QUA", grupo_id: "inexistente", grupo_usuario_id: null }],
      grupos,
      [cfg({ grupo_id: "inexistente", num_series: 9 })],
    );
    expect(res.map((r) => r.bloco.key)).toEqual(["peito", "triceps"]);
    expect(res.map((r) => r.total)).toEqual([3, 3]);
  });

  it("semana vazia = lista vazia", () => {
    expect(calcularVolumeSemanal([], {})).toEqual([]);
  });
});

describe("LANDMARKS", () => {
  it("MEV ≤ MAVmin ≤ MAVmax ≤ MRV em todos os blocos", () => {
    for (const [key, lm] of Object.entries(LANDMARKS)) {
      expect(lm.mev, key).toBeLessThanOrEqual(lm.mav[0]);
      expect(lm.mav[0], key).toBeLessThanOrEqual(lm.mav[1]);
      expect(lm.mav[1], key).toBeLessThanOrEqual(lm.mrv);
    }
  });
});

describe("calcularVolumePraticado", () => {
  it("agrega séries concluídas por bloco, com secundário 0,5 e sem marcar padrão", () => {
    const res = calcularVolumePraticado([
      { id: "e1", isPessoal: false, nome: "Agachamento", grupo_muscular: "Quadríceps / Glúteo", series: 6 },
      { id: "e2", isPessoal: false, nome: "Extensora", grupo_muscular: "Quadríceps", series: 3 },
    ]);
    const quad = res.find((r) => r.bloco.key === "quadriceps")!;
    const glut = res.find((r) => r.bloco.key === "gluteo")!;
    expect(quad.total).toBe(9);
    expect(glut.total).toBe(3);
    expect(quad.detalhes.every((d) => !d.seriesEhPadrao)).toBe(true);
  });

  it("sem séries concluídas = lista vazia", () => {
    expect(calcularVolumePraticado([])).toEqual([]);
  });
});

describe("formatarSeries", () => {
  it("inteiro sem decimal, meia série com vírgula", () => {
    expect(formatarSeries(10)).toBe("10");
    expect(formatarSeries(7.5)).toBe("7,5");
  });
});
