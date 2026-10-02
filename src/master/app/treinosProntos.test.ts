import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { treinoNovo, validarTreino, type TreinoPronto } from "./treinosProntos";

const ex = { exercicio_id: "e1", series: 3, reps: "12", descanso_segundos: 60, observacao: null };

describe("treinos prontos do master (herdado W7b) — a mesma conferência da carga do JSON", () => {
  it("treino válido passa", () => {
    const t: TreinoPronto = { ...treinoNovo(), nome: "Teste W27", grupos: [{ letra: "A", nome: "Treino A", dias: ["SEG", "QUA"], exercicios: [ex] }] };
    expect(validarTreino(t)).toBeNull();
  });
  it("recusa: sem nome, letra repetida, dia em 2 divisões, divisão sem exercício, séries fora", () => {
    const g = { letra: "A", nome: "Treino A", dias: ["SEG"], exercicios: [ex] };
    expect(validarTreino({ ...treinoNovo(), nome: "x", grupos: [g] })).toMatch(/nome/);
    expect(validarTreino({ ...treinoNovo(), nome: "Ok", grupos: [g, { ...g, dias: ["TER"] }] })).toMatch(/letra/);
    expect(validarTreino({ ...treinoNovo(), nome: "Ok", grupos: [g, { ...g, letra: "B" }] })).toMatch(/2 divisões/);
    expect(validarTreino({ ...treinoNovo(), nome: "Ok", grupos: [{ ...g, exercicios: [] }] })).toMatch(/sem exercícios/);
    expect(validarTreino({ ...treinoNovo(), nome: "Ok", grupos: [{ ...g, exercicios: [{ ...ex, series: 12 }] }] })).toMatch(/Séries/);
    expect(validarTreino({ ...treinoNovo(), nome: "Ok", grupos: [{ ...g, dias: [] }] })).toMatch(/1 a 7 dias/);
  });
});
