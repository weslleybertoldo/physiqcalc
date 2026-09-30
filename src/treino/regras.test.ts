import { describe, expect, it } from "vitest";
import { chaveData, dataDaChave, datasDaSemana, gradeDoMes, rotuloDaSemana, rotuloDiaCurto, rotuloMes } from "./datas";
import { chipDoSlot, letrasDaSemana } from "./letras";
import {
  cargaDaLinha,
  formatarCarga,
  formatarDescanso,
  linhaDoExercicio,
  mapaPrescricao,
  observacaoDoTreino,
  prescricaoDoExercicio,
  repsIniciais,
  repsDaLinha,
} from "./prescricao";
import { formatarCronometro, formatarDuracao, segundosDecorridos } from "./cronometro";
import { doExercicio, proximaSerie } from "./proxima";
import { lerExercicios } from "./historico";
import type { DiaSlot, GrupoExercicio, SemanaConfig, SerieComMemoria } from "./tipos";

describe("datas da aba Treino (faixa Seg–Dom e calendário)", () => {
  it("a semana vai de segunda a domingo, com a chave local do banco", () => {
    const semana = datasDaSemana(new Date(2026, 8, 30, 8)); // qua 30/09/2026
    expect(semana.map(chaveData)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(datasDaSemana(new Date(2026, 9, 4, 23)).map(chaveData)[0]).toBe("2026-09-28"); // domingo fica na semana que começou segunda
  });
  it("rótulos", () => {
    expect(rotuloDiaCurto(dataDaChave("2026-09-29"))).toBe("Ter 29/09");
    expect(rotuloDaSemana(0)).toBe("Esta semana");
    expect(rotuloDaSemana(-1)).toBe("Semana passada");
    expect(rotuloDaSemana(1)).toBe("Próxima semana");
    expect(rotuloDaSemana(3)).toBe("+3 semanas");
    expect(rotuloDaSemana(-2)).toBe("−2 semanas");
    expect(rotuloMes(2026, 8)).toBe("Setembro de 2026");
  });
  it("grade do mês começa na segunda e fecha semanas inteiras", () => {
    const g = gradeDoMes(2026, 8); // setembro/2026 começa numa terça
    expect(g[0][0]).toBeNull();
    expect(g[0][1]?.getDate()).toBe(1);
    expect(g.every((s) => s.length === 7)).toBe(true);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
  });
});

describe("NF1 — prescrição (reps, descanso, carga) quando existe; senão o histórico", () => {
  const linhas = [
    { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: null, exercicio_usuario_id: null, reps_alvo: null, descanso_segundos: 90, carga_sugerida_kg: null, observacao: "Foco na técnica" },
    { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: "e1", exercicio_usuario_id: null, reps_alvo: "10", descanso_segundos: 60, carga_sugerida_kg: 60, observacao: null },
    { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: "e2", exercicio_usuario_id: null, reps_alvo: "8-12", descanso_segundos: null, carga_sugerida_kg: "22.5", observacao: null },
    // só o nº de séries (linha de hoje, sem prescrição) não entra
    { grupo_id: "g1", grupo_usuario_id: null, exercicio_id: "e3", exercicio_usuario_id: null, reps_alvo: null, descanso_segundos: null, carga_sugerida_kg: null, observacao: null },
  ];
  const mapa = mapaPrescricao(linhas);

  it("linha do exercício > linha geral do treino > nada, campo a campo", () => {
    expect(prescricaoDoExercicio(mapa, "catalogo:g1", "e1")).toEqual({ reps: "10", descanso: 60, carga: 60 });
    expect(prescricaoDoExercicio(mapa, "catalogo:g1", "e2")).toEqual({ reps: "8-12", descanso: 90, carga: 22.5 });
    expect(prescricaoDoExercicio(mapa, "catalogo:g1", "e3")).toEqual({ reps: null, descanso: 90, carga: null });
    expect(prescricaoDoExercicio(mapa, "catalogo:outro", "e1")).toEqual({ reps: null, descanso: null, carga: null });
    expect(observacaoDoTreino(mapa, "catalogo:g1")).toBe("Foco na técnica");
  });

  it('"4 × 10 · 60 s" com a prescrição; sem ela, as reps das séries do dia e o descanso padrão do aluno', () => {
    const quatro = Array.from({ length: 4 }, (_, i) => ({ reps: 12, peso: 20 + i }));
    expect(linhaDoExercicio({ prescricao: { reps: "10", descanso: 60, carga: 60 }, series: quatro, descansoPadrao: 120 })).toBe("4 × 10 · 60 s");
    expect(linhaDoExercicio({ prescricao: { reps: null, descanso: null, carga: null }, series: quatro, descansoPadrao: 120 })).toBe("4 × 12 · 2 min");
    expect(linhaDoExercicio({ prescricao: { reps: null, descanso: null, carga: null }, series: [{ reps: 8 }, { reps: 12 }], descansoPadrao: 45 })).toBe("2 × 8-12 · 45 s");
    expect(linhaDoExercicio({ prescricao: { reps: null, descanso: 90, carga: null }, series: [{}, {}, {}], descansoPadrao: 60, corrida: true })).toBe("3 séries · 90 s");
  });

  it("carga: a prescrita; senão a maior das séries do dia", () => {
    expect(cargaDaLinha({ reps: null, descanso: null, carga: 14 }, [{ peso: 12 }])).toBe(14);
    expect(cargaDaLinha({ reps: null, descanso: null, carga: null }, [{ peso: 12 }, { peso: 16 }, { peso: 0 }])).toBe(16);
    expect(cargaDaLinha({ reps: null, descanso: null, carga: null }, [{ peso: 0 }])).toBeNull();
    expect(formatarCarga(22.5)).toBe("22,5 kg");
    expect(formatarCarga(60)).toBe("60 kg");
    expect(formatarCarga(0)).toBeNull();
  });

  it("formatos e reps iniciais da série nova", () => {
    expect(formatarDescanso(45)).toBe("45 s");
    expect(formatarDescanso(90)).toBe("90 s");
    expect(formatarDescanso(120)).toBe("2 min");
    expect(formatarDescanso(150)).toBe("2 min 30 s");
    expect(formatarDescanso(0)).toBeNull();
    expect(repsIniciais("8-12")).toBe(8);
    expect(repsIniciais("15")).toBe(15);
    expect(repsIniciais(null)).toBe(10);
    expect(repsIniciais("até a falha")).toBe(10);
    expect(repsDaLinha({ reps: null, descanso: null, carga: null }, [])).toBeNull();
  });
});

describe("cronômetro do treino", () => {
  it("pílula mm:ss até 1 h e h:mm:ss depois; duração do treino concluído", () => {
    expect(formatarCronometro(0)).toBe("00:00");
    expect(formatarCronometro(32 * 60 + 10)).toBe("32:10");
    expect(formatarCronometro(3600 + 5 * 60 + 9)).toBe("1:05:09");
    expect(formatarDuracao(48 * 60)).toBe("48m");
    expect(formatarDuracao(3900)).toBe("1h05m");
    expect(segundosDecorridos({ startedAt: 1_000 }, 61_500)).toBe(60);
    expect(segundosDecorridos({ startedAt: 5_000 }, 1_000)).toBe(0);
  });
});

describe("letra do treino na semana e o chip do card", () => {
  const cfg = (dia: string, grupo: string | null, pessoal: string | null = null, slot = 0): SemanaConfig => ({
    dia_semana: dia, slot_idx: slot, grupo_id: grupo, grupo_usuario_id: pessoal, extra: 0, extra_atrelado_grupo_id: null, extra_atrelado_grupo_usuario_id: null, tb_grupos_treino: null,
  });
  it("A, B, C na ordem de segunda a domingo (repetido não ganha letra nova)", () => {
    const l = letrasDaSemana([cfg("QUA", "c"), cfg("SEG", "a"), cfg("TER", "b"), cfg("QUI", "a"), cfg("SEX", null, "p1")]);
    expect([...l.entries()]).toEqual([["a", "A"], ["b", "B"], ["c", "C"], ["p1", "D"]]);
    const slot = (id: string, pessoal = false): DiaSlot => ({ slot_idx: 0, grupo: { id, nome: id }, grupoPessoal: pessoal, exercicios: [], overrideVazio: false, source: "override" });
    expect(chipDoSlot(slot("b"), l)).toBe("TREINO B");
    expect(chipDoSlot(slot("x", true), l)).toBe("MEU TREINO");
    expect(chipDoSlot(slot("y"), l)).toBe("TREINO EXTRA");
    // os outros treinos do profissional (fora da semana) continuam a sequência
    const l2 = letrasDaSemana([cfg("SEG", "a")], [{ id: "z" }, { id: "a" }]);
    expect([...l2.entries()]).toEqual([["a", "A"], ["z", "B"]]);
  });
});

describe('card do descanso: "Depois: série 3 do crucifixo"', () => {
  const ge = (id: string, nome: string, ordem: number): GrupoExercicio => ({ exercicio_id: id, ordem, tb_exercicios: { id, nome, grupo_muscular: "Peitoral", emoji: "" } });
  const s = (exercicio_id: string, numero_serie: number, concluida = false): SerieComMemoria => ({ exercicio_id, numero_serie, peso: 10, reps: 10, concluida, salva: true });
  const ordem = [ge("a", "Supino reto com barra", 0), ge("b", "Crucifixo com halteres", 1), ge("c", "Remada baixa", 2)];

  it("nome curto e o artigo", () => {
    expect(doExercicio("Crucifixo com halteres")).toBe("do crucifixo");
    expect(doExercicio("Remada baixa")).toBe("da remada baixa");
    expect(doExercicio("Elevação lateral")).toBe("da elevação lateral");
    expect(doExercicio("Tríceps francês")).toBe("do tríceps francês");
  });

  it("a próxima série do mesmo exercício; senão a 1ª do próximo com série por fazer", () => {
    const series = [s("a", 1, true), s("a", 2), s("b", 1), s("b", 2), s("c", 1, true)];
    expect(proximaSerie(ordem, series, "a", 1)).toBe("série 2 do supino reto");
    expect(proximaSerie(ordem, series, "a", 2)).toBe("série 1 do crucifixo");
    const tudoFeito = [s("a", 1, true), s("b", 1, true), s("c", 1, true)];
    expect(proximaSerie(ordem, tudoFeito, "c", 1)).toBeNull();
  });
});

describe("histórico: exercicios_concluidos como veio do banco", () => {
  it("lista, texto JSON, texto JSON duas vezes ou lixo", () => {
    const l = [{ exercicio_id: "e1", nome: "Supino" }];
    expect(lerExercicios(l)).toEqual(l);
    expect(lerExercicios(JSON.stringify(l))).toEqual(l);
    expect(lerExercicios(JSON.stringify(JSON.stringify(l)))).toEqual(l);
    expect(lerExercicios("{quebrado")).toEqual([]);
    expect(lerExercicios(null)).toEqual([]);
  });
});
