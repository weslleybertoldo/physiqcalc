import { describe, it, expect } from "vitest";
import type { jsPDF } from "jspdf";
import {
  alturaEstimadaDia,
  linhasTabelaDia,
  montarWorkoutPlanPDF,
  nomeArquivoTreino,
  precisaNovaPagina,
  textoSeries,
  type WorkoutDia,
  type WorkoutProfile,
} from "./generateWorkoutPlanPDF";

const perfil: WorkoutProfile = {
  nome: "Lívia Cavalcante", user_code: 72026, sexo: "female", idade: 24, peso: 60, altura: 165, plano_nome: null,
};

const dia = (dia_semana: string, grupo_nome: string, linhas: number, num_series?: number | null): WorkoutDia => ({
  dia_semana,
  grupo_nome,
  exercicios: Array.from({ length: linhas }, (_, i) => ({
    nome: `Exercício ${i + 1}`,
    grupo_muscular: "Abdômen",
    ...(num_series === undefined ? {} : { num_series }),
  })),
});

/** Operadores PDF da página `p` (jsPDF guarda 1 array de strings por página, índice a partir de 1). */
const opsPagina = (doc: jsPDF, p: number): string =>
  (doc as unknown as { internal: { pages: string[][] } }).internal.pages[p].join("\n");

/** Fundo escuro = retângulo da página inteira (`rect(0, 0, W, H, "F")` → "x y w -h re" em pontos). */
const temFundo = (doc: jsPDF, p: number): boolean => {
  const k = doc.internal.scaleFactor;
  const W = doc.internal.pageSize.getWidth() * k;
  const H = doc.internal.pageSize.getHeight() * k;
  return opsPagina(doc, p).split("\n").some((linha) => {
    const m = linha.trim().match(/^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re$/);
    if (!m) return false;
    const [x, y, w, h] = m.slice(1).map(Number);
    return Math.abs(x) < 0.5 && Math.abs(y - H) < 0.5 && Math.abs(w - W) < 0.5 && Math.abs(h + H) < 0.5;
  });
};

describe("textoSeries (coluna Séries do PDF)", () => {
  it("usa o nº configurado pro aluno", () => {
    expect(textoSeries(1)).toBe("1 × 8-12");
    expect(textoSeries(2)).toBe("2 × 8-12");
    expect(textoSeries(4)).toBe("4 × 8-12");
  });
  it("sem configuração cai no padrão 3 (igual ao app)", () => {
    expect(textoSeries(undefined)).toBe("3 × 8-12");
    expect(textoSeries(null)).toBe("3 × 8-12");
    expect(textoSeries(0)).toBe("3 × 8-12");
    expect(textoSeries(Number.NaN)).toBe("3 × 8-12");
  });
  it("arredonda e respeita o teto de 10", () => {
    expect(textoSeries(2.6)).toBe("3 × 8-12");
    expect(textoSeries(12)).toBe("10 × 8-12");
  });
});

describe("linhasTabelaDia", () => {
  it("monta [exercício, grupo, séries] com o nº de cada exercício", () => {
    const d: WorkoutDia = {
      dia_semana: "SEG",
      grupo_nome: "ABS",
      exercicios: [
        { nome: "Abdominal Bicicleta", grupo_muscular: "Abdômen", num_series: 1 },
        { nome: "Elevação de Pernas", grupo_muscular: null },
      ],
    };
    expect(linhasTabelaDia(d)).toEqual([
      ["Abdominal Bicicleta", "Abdômen", "1 × 8-12"],
      ["Elevação de Pernas", "—", "3 × 8-12"],
    ]);
  });
  it("dia sem exercícios vira 1 linha de aviso", () => {
    expect(linhasTabelaDia({ dia_semana: "SEG", grupo_nome: "X", exercicios: [] })).toEqual([
      ["Sem exercícios cadastrados", "—", "—"],
    ]);
  });
});

describe("precisaNovaPagina (tabela não parte no meio)", () => {
  const H = 297;
  it("cabe na página atual → segue", () => {
    expect(precisaNovaPagina(60, 6, H)).toBe(false);
  });
  it("não cabe aqui mas cabe numa página nova → quebra antes do título", () => {
    // caso da Terça da Lívia: y alto no fim da página 1 e 7 linhas
    expect(precisaNovaPagina(215, 7, H)).toBe(true);
    expect(precisaNovaPagina(215, 7, H)).toBe(215 + alturaEstimadaDia(7) > H - 16);
  });
  it("tabela maior que uma página inteira fica onde está (autoTable divide)", () => {
    expect(precisaNovaPagina(100, 40, H)).toBe(false);
  });
});

describe("montarWorkoutPlanPDF", () => {
  it("imprime o nº de séries configurado e o rodapé em todas as páginas", () => {
    const doc = montarWorkoutPlanPDF(perfil, [dia("SEG", "ABS", 2, 1), dia("TER", "Treino D", 3)]);
    expect(doc.getNumberOfPages()).toBe(1);
    const ops = opsPagina(doc, 1);
    expect(ops).toContain("1 × 8-12");
    expect(ops).toContain("3 × 8-12");
    expect(ops).toContain("Bertoldo Performance");
  });

  it("pinta o fundo escuro nas páginas que o autoTable abre sozinho", () => {
    // 1 tabela de 40 linhas não cabe em nenhuma página → o autoTable divide e abre páginas novas
    const doc = montarWorkoutPlanPDF(perfil, [dia("SEG", "Treino longo", 40, 3)]);
    const total = doc.getNumberOfPages();
    expect(total).toBeGreaterThanOrEqual(2);
    for (let p = 1; p <= total; p++) {
      expect(temFundo(doc, p), `página ${p} sem fundo`).toBe(true);
      expect(opsPagina(doc, p), `página ${p} sem rodapé`).toContain("Bertoldo Performance");
    }
  });

  it("dia que não cabe começa inteiro na página seguinte", () => {
    // 3 dias de 7 linhas: os 2 primeiros cabem na página 1, o 3º não → título + tabela na página 2
    const doc = montarWorkoutPlanPDF(perfil, [
      dia("SEG", "Treino 1", 7), dia("TER", "Treino 2", 7), dia("QUA", "Treino 3", 7),
    ]);
    expect(doc.getNumberOfPages()).toBe(2);
    expect(opsPagina(doc, 1)).not.toContain("TREINO 3");
    expect(opsPagina(doc, 2)).toContain("TREINO 3");
    expect(temFundo(doc, 2)).toBe(true);
  });

  it("sem dias mostra o aviso", () => {
    const doc = montarWorkoutPlanPDF(perfil, []);
    expect(opsPagina(doc, 1)).toContain("Nenhum treino configurado");
  });
});

describe("nomeArquivoTreino", () => {
  it("remove acentos/símbolos e junta o ID", () => {
    expect(nomeArquivoTreino(perfil)).toBe("PhysiqCalc-Treino-Lvia Cavalcante-72026.pdf");
    expect(nomeArquivoTreino({ ...perfil, nome: null, user_code: null })).toBe("PhysiqCalc-Treino-Aluno-.pdf");
  });
});
