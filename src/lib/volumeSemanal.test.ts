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

const ex = (over: Partial<GrupoVolume["exercicios"][number]> = {}) => ({
  id: "e1",
  isPessoal: false,
  nome: "Agachamento",
  grupo_muscular: "Quadríceps",
  tipo: null,
  seriesUltimo: null,
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

describe("calcularVolumeSemanal", () => {
  const semana: SemanaRowVolume[] = [
    { dia_semana: "SEG", grupo_id: "gA", grupo_usuario_id: null },
    { dia_semana: "SEX", grupo_id: "gA", grupo_usuario_id: null },
    { dia_semana: "TER", grupo_id: null, grupo_usuario_id: "gP" },
  ];

  it("soma séries × ocorrências na semana, com fallback 3", () => {
    const grupos = {
      "catalogo:gA": { nome: "Treino A", exercicios: [ex()] },
      "pessoal:gP": { nome: "Meu treino", exercicios: [ex({ id: "e2", isPessoal: true, nome: "Leg press", seriesUltimo: 4 })] },
    };
    const res = calcularVolumeSemanal(semana, grupos);
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

  it("secundário conta 0,5 por série", () => {
    const grupos = {
      "catalogo:gA": { nome: "Treino A", exercicios: [ex({ grupo_muscular: "Quadríceps / Glúteo", seriesUltimo: 4 })] },
    };
    const res = calcularVolumeSemanal([semana[0]], grupos);
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
    );
    expect(res.map((r) => r.bloco.key)).toEqual(["peito", "triceps"]);
  });

  it("semana vazia = lista vazia", () => {
    expect(calcularVolumeSemanal([], {})).toEqual([]);
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
