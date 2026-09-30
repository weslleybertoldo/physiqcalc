import { describe, expect, it } from "vitest";
import type { VolumeBloco } from "@/lib/volumeSemanal";
import { BLOCOS_MUSCULARES } from "@/lib/gruposMusculares";
import {
  diasAte,
  extrasPorDia,
  idsDaChave,
  lerCarga,
  lerDescanso,
  lerReps,
  linhaDoAluno,
  montarTreinos,
  prescricaoComCampo,
  resumoSemanaDoAluno,
  subtituloDoExercicio,
  temAlternado,
  textoDataCurta,
  treinosPorDia,
  volumePorGrupo,
} from "./regras";
import type { DadosEditor } from "./tipos";

const ex = (id: string, nome: string, ordem: number, grupo = "Peitoral", subgrupo: string | null = "Peitoral médio (esternal) · tríceps") => ({
  exercicio_id: id, exercicio_usuario_id: null, nome, ordem, grupo_muscular: grupo, subgrupo, imagem_url: `https://x/${id}.webp`, tipo: "musculacao",
});

function dados(o: Partial<DadosEditor> = {}): DadosEditor {
  return {
    semana: [
      { dia_semana: "SEG", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
      { dia_semana: "TER", slot_idx: 0, grupo_id: "gB", grupo_usuario_id: null, extra: false },
      { dia_semana: "QUA", slot_idx: 0, grupo_id: "gC", grupo_usuario_id: null, extra: false },
      { dia_semana: "QUI", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
      { dia_semana: "SEX", slot_idx: 0, grupo_id: "gB", grupo_usuario_id: null, extra: false },
    ],
    gruposDisponiveis: [
      { id: "gC", nome: "Pernas", tipo: "catalogo", professor_id: null, alunos: 1, em_pasta: false, lista_direta: false },
      { id: "gA", nome: "Peito e tríceps", tipo: "catalogo", professor_id: "prof", alunos: 1, em_pasta: false, lista_direta: true },
      { id: "gB", nome: "Costas", tipo: "catalogo", professor_id: null, alunos: 2, em_pasta: false, lista_direta: false },
      { id: "pX", nome: "Meu cardio", tipo: "pessoal" },
    ],
    diasConfig: [],
    seriesPadrao: [
      { grupo_id: "gA", grupo_usuario_id: null, exercicio_id: "e1", exercicio_usuario_id: null, num_series: 4, reps_alvo: "10", descanso_segundos: 60, carga_sugerida_kg: "60" },
      { grupo_id: "gA", grupo_usuario_id: null, exercicio_id: null, exercicio_usuario_id: null, num_series: 3, observacao: "Desça a barra em 3 s." },
    ],
    exerciciosPorTreino: {
      "catalogo:gA": [ex("e2", "Supino Inclinado", 1), ex("e1", "Supino Reto com Barra", 0)],
      "catalogo:gB": [ex("e3", "Puxada Aberta Frontal", 0, "Dorsal / Bíceps", "Latíssimo do dorso · redondo maior")],
      "catalogo:gC": [],
      "pessoal:pX": [],
    },
    config: { series_padrao_qtd: 3, series_modo: "personalizada", series_travadas: true, tempo_descanso_segundos: 90, proxima_troca_treino: null },
    podeEditar: true,
    professorDoAluno: "prof",
    ...o,
  };
}

describe("W15 — os treinos do editor (tela 8)", () => {
  it("letras na ordem da semana (a mesma do app) e os treinos próprios do aluno no fim", () => {
    const t = montarTreinos(dados());
    expect(t.map((x) => x.rotulo)).toEqual(["A · Peito e tríceps", "B · Costas", "C · Pernas", "Meu cardio"]);
    expect(t[3].tipo).toBe("pessoal");
    expect(t[3].letra).toBeNull();
  });
  it("exercícios na ordem do treino, com séries (próprio > geral > padrão), prescrição e observação", () => {
    const [a] = montarTreinos(dados());
    expect(a.exercicios.map((e) => e.nome)).toEqual(["Supino Reto com Barra", "Supino Inclinado"]);
    expect(a.exercicios[0]).toMatchObject({ series: 4, seriesProprias: true, reps: "10", descanso: 60, carga: 60 });
    // o inclinado: sem linha própria → o geral do treino (3); sem prescrição → vazio (como hoje)
    expect(a.exercicios[1]).toMatchObject({ series: 3, seriesProprias: false, reps: null, descanso: null, carga: null });
    expect(a.observacao).toBe("Desça a barra em 3 s.");
    expect(a.totalSeries).toBe(7);
    expect(a.minutos).toBeGreaterThanOrEqual(5);
    expect(a.exercicios[0].subtitulo).toBe("Peito · peitoral médio (esternal)");
  });
  it("quem muda a lista direto (só do aluno) e quem vira cópia (global, compartilhado)", () => {
    const t = montarTreinos(dados());
    expect(t.find((x) => x.nome === "Peito e tríceps")).toMatchObject({ listaDireta: true, global: false });
    expect(t.find((x) => x.nome === "Costas")).toMatchObject({ listaDireta: false, global: true, alunos: 2 });
    expect(t.find((x) => x.nome === "Pernas")).toMatchObject({ listaDireta: false, global: true });
  });
  it("sem dados → nenhum treino; o padrão do aluno vale para quem não tem nº", () => {
    expect(montarTreinos(null)).toEqual([]);
    const d = dados({ seriesPadrao: [], config: { series_padrao_qtd: 5, series_modo: "padrao", series_travadas: false, tempo_descanso_segundos: null, proxima_troca_treino: null } });
    expect(montarTreinos(d)[0].exercicios.every((e) => e.series === 5)).toBe(true);
  });
});

describe("W15 — a linha que o aluno vê (tela 2) e os campos", () => {
  it('"4 × 10 · 60 s · 60 kg" com tudo; sem repetições, "3 séries"; o descanso padrão quando não há o do exercício', () => {
    expect(linhaDoAluno({ series: 4, reps: "10", descanso: 60, carga: 60, corrida: false }, 120)).toBe("4 × 10 · 60 s · 60 kg");
    expect(linhaDoAluno({ series: 3, reps: null, descanso: null, carga: null, corrida: false }, 120)).toBe("3 séries · 2 min");
    expect(linhaDoAluno({ series: 1, reps: "8-12", descanso: null, carga: 22.5, corrida: false }, 90)).toBe("1 × 8-12 · 90 s · 22,5 kg");
    expect(linhaDoAluno({ series: 3, reps: "10", descanso: 30, carga: 10, corrida: true }, 90)).toBe("3 séries · 30 s");
  });
  it("repetições: número ou faixa; vazio = sem prescrição; recusa o resto", () => {
    expect(lerReps("10")).toMatchObject({ ok: true, valor: "10" });
    expect(lerReps(" 8 - 12 ")).toMatchObject({ ok: true, valor: "8-12" });
    expect(lerReps("8 a 12")).toMatchObject({ ok: true, valor: "8-12" });
    expect(lerReps("")).toMatchObject({ ok: true, valor: null });
    expect(lerReps("12-8").ok).toBe(false);
    expect(lerReps("dez").ok).toBe(false);
    expect(lerReps("0").ok).toBe(false);
  });
  it("descanso: segundos, minutos e mm:ss; limites", () => {
    expect(lerDescanso("60")).toMatchObject({ ok: true, valor: 60 });
    expect(lerDescanso("60 s")).toMatchObject({ ok: true, valor: 60 });
    expect(lerDescanso("1:30")).toMatchObject({ ok: true, valor: 90 });
    expect(lerDescanso("2 min")).toMatchObject({ ok: true, valor: 120 });
    expect(lerDescanso("1 min 30")).toMatchObject({ ok: true, valor: 90 });
    expect(lerDescanso("")).toMatchObject({ ok: true, valor: null });
    expect(lerDescanso("2").ok).toBe(false);
    expect(lerDescanso("20 min").ok).toBe(false);
    expect(lerDescanso("abc").ok).toBe(false);
  });
  it("carga: kg com vírgula ou ponto; limites", () => {
    expect(lerCarga("60")).toMatchObject({ ok: true, valor: 60 });
    expect(lerCarga("22,5 kg")).toMatchObject({ ok: true, valor: 22.5 });
    expect(lerCarga("1.25")).toMatchObject({ ok: true, valor: 1.25 });
    expect(lerCarga("")).toMatchObject({ ok: true, valor: null });
    expect(lerCarga("0").ok).toBe(false);
    expect(lerCarga("-5").ok).toBe(false);
    expect(lerCarga("1200").ok).toBe(false);
  });
  it("um campo mexe só nele (o resto da prescrição fica)", () => {
    const e = montarTreinos(dados())[0].exercicios[0];
    expect(prescricaoComCampo(e, "reps", "8-12")).toMatchObject({ ok: true, valor: { series: 4, reps: "8-12", descanso: 60, carga: 60 } });
    expect(prescricaoComCampo(e, "series", "5")).toMatchObject({ ok: true, valor: { series: 5, reps: "10" } });
    expect(prescricaoComCampo(e, "carga", "")).toMatchObject({ ok: true, valor: { carga: null, reps: "10" } });
    expect(prescricaoComCampo(e, "series", "11").ok).toBe(false);
    expect(prescricaoComCampo(e, "descanso", "x").ok).toBe(false);
  });
  it("subtítulo grupo · subgrupo; sem subgrupo, o grupo", () => {
    expect(subtituloDoExercicio({ grupo_muscular: "Tríceps", subgrupo: "Tríceps (cabeça longa)" })).toBe("Tríceps · tríceps (cabeça longa)");
    expect(subtituloDoExercicio({ grupo_muscular: "Dorsal / Bíceps", subgrupo: null })).toBe("Costas · dorsal / bíceps");
    expect(subtituloDoExercicio({ grupo_muscular: "", subgrupo: null })).toBe("Exercício");
  });
});

describe("W15 — a semana do aluno", () => {
  it("treinos por dia na ordem (sem os extras) e os extras com o atrelamento", () => {
    const d = dados({
      semana: [
        { dia_semana: "SEG", slot_idx: 1, grupo_id: "gB", grupo_usuario_id: null, extra: false },
        { dia_semana: "SEG", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
        { dia_semana: "SEG", slot_idx: 100, grupo_id: "gC", grupo_usuario_id: null, extra: true, extra_atrelado_grupo_id: "gA" },
        { dia_semana: "TER", slot_idx: 100, grupo_id: null, grupo_usuario_id: "pX", extra: true },
      ],
    });
    expect(treinosPorDia(d)).toEqual({ SEG: ["catalogo:gA", "catalogo:gB"] });
    expect(extrasPorDia(d)).toEqual({ SEG: [{ chave: "catalogo:gC", atrelado: "catalogo:gA" }], TER: [{ chave: "pessoal:pX", atrelado: null }] });
    expect(idsDaChave("pessoal:pX")).toEqual({ grupo_usuario_id: "pX" });
    expect(idsDaChave("catalogo:gA")).toEqual({ grupo_id: "gA" });
    expect(temAlternado(d)).toBe(false);
    expect(temAlternado(dados({ diasConfig: [{ dia_semana: "SEG", alternado: true, alternado_inicio: "2026-09-28" }] }))).toBe(true);
  });
  it('"N de M na semana" = a conta do app: dias com treino feito sobre os dias com treino', () => {
    const hoje = new Date(2026, 8, 30, 10); // qua 30/09/2026
    const d = dados();
    expect(resumoSemanaDoAluno(d, { overrides: [], concluidos: [] }, hoje)).toEqual({ feitos: 0, total: 5 });
    const feitos = { overrides: [], concluidos: [{ data_treino: "2026-09-28", slot_idx: 0 }, { data_treino: "2026-09-29", slot_idx: 0 }, { data_treino: "2026-09-30", slot_idx: 0 }] };
    expect(resumoSemanaDoAluno(d, feitos, hoje)).toEqual({ feitos: 3, total: 5 });
    // troca do dia: sábado com treino (vira 6 dias) e sexta vazia (descanso → 5)
    const trocas = { concluidos: [], overrides: [
      { data_treino: "2026-10-03", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null },
      { data_treino: "2026-10-02", slot_idx: 0, grupo_id: null, grupo_usuario_id: null },
    ] };
    expect(resumoSemanaDoAluno(d, trocas, hoje)).toEqual({ feitos: 0, total: 5 });
    // treino que o aluno não recebe mais não conta
    const semB = dados({ gruposDisponiveis: dados().gruposDisponiveis.filter((g) => g.id !== "gB") });
    expect(resumoSemanaDoAluno(semB, { overrides: [], concluidos: [] }, hoje)).toEqual({ feitos: 0, total: 3 });
  });
  it("alternado: um treino por semana na ordem marcada (a mesma rotação do app)", () => {
    const hoje = new Date(2026, 8, 30, 10);
    const d = dados({
      semana: [
        { dia_semana: "SEG", slot_idx: 0, grupo_id: "gA", grupo_usuario_id: null, extra: false },
        { dia_semana: "SEG", slot_idx: 1, grupo_id: "gB", grupo_usuario_id: null, extra: false },
      ],
      diasConfig: [{ dia_semana: "SEG", alternado: true, alternado_inicio: "2026-09-21" }],
    });
    // 1 treino na segunda (o da semana), não 2
    expect(resumoSemanaDoAluno(d, { overrides: [], concluidos: [{ data_treino: "2026-09-28", slot_idx: 1 }] }, hoje)).toEqual({ feitos: 1, total: 1 });
  });
});

describe("W15 — séries por semana por grupo (card da tela 7 = aba)", () => {
  const bloco = (key: string, total: number): VolumeBloco => ({ bloco: BLOCOS_MUSCULARES.find((b) => b.key === key)!, total, status: "neutro", landmark: null, detalhes: [] });
  it("junta os blocos como o profissional fala (Pernas = quadríceps + posterior + glúteo + panturrilha; Braços = bíceps + tríceps)", () => {
    const g = volumePorGrupo([bloco("peito", 14), bloco("costas", 16), bloco("quadriceps", 10), bloco("posterior", 6), bloco("gluteo", 2), bloco("ombro", 10), bloco("biceps", 6), bloco("triceps", 6)]);
    expect(g.map((x) => [x.nome, x.total])).toEqual([["Peito", 14], ["Costas", 16], ["Pernas", 18], ["Ombros", 10], ["Braços", 12]]);
    expect(g[2].partes.map((p) => p.nome)).toEqual(["Quadríceps", "Posterior de coxa", "Glúteo"]);
  });
  it("sem séries, sem grupo", () => {
    expect(volumePorGrupo([])).toEqual([]);
    expect(volumePorGrupo([bloco("peito", 0)])).toEqual([]);
  });
});

describe("W15 — troca do treino (NF7)", () => {
  it('"seg, 03/08" e os dias que faltam', () => {
    expect(textoDataCurta("2026-08-03")).toBe("seg, 03/08");
    expect(textoDataCurta(null)).toBeNull();
    expect(textoDataCurta("03/08/2026")).toBeNull();
    const hoje = new Date(2026, 8, 30, 22);
    expect(diasAte("2026-10-19", hoje)).toBe(19);
    expect(diasAte("2026-09-30", hoje)).toBe(0);
    expect(diasAte("2026-09-29", hoje)).toBe(-1);
  });
});
