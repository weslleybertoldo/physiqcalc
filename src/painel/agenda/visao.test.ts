import { describe, expect, it } from "vitest";
import { REGRAS_PADRAO } from "@/agenda/regras";
import type { Agendamento, AlunoAgenda } from "./dados";
import {
  bloqueiosEmConflito, conflitos, eventosDoDia, faixaDaSemana, faixaHora, foraDoAtendimento, nomeDoEvento, paraEvento, travasEmConflito, type EventoPainel,
} from "./visao";

const linha = (extra: Partial<Agendamento> = {}): Agendamento => ({
  id: "a1", nutricionista_id: "lucas", calendario_id: "c1", paciente_id: "p1", titulo: "Avaliação física", inicio: "2026-10-15T12:00:00Z",
  fim: "2026-10-15T13:00:00Z", dia_inteiro: false, status: "agendado", confirmacao: "a_confirmar", observacao: null, modulo: "treino", conta_id: "k",
  reagendamentos: 0, mes_referencia: "2026-10-01", origem: "profissional", aluno_respondeu_em: null, aviso_email_em: null, created_at: "", updated_at: "",
  deleted_at: null, ...extra,
});
const aluno: AlunoAgenda = { id: "p1", nome: "Rafael Moura", apelido: null, foto_url: "f.jpg", personal_id: "lucas", nutricionista_id: "camila", user_id: "u1", email: null };
const ev = (extra: Partial<Agendamento> = {}): EventoPainel => paraEvento(linha(extra), new Map([["c1", "#a78bfa"]]), new Map([["p1", aluno]]));

describe("Painel › Agenda (W20) — o evento e as contas das visões", () => {
  it("o evento leva o aluno (nome e foto), o tipo, a cor do calendário e a confirmação do status", () => {
    const e = ev({ status: "paciente_confirmou", confirmacao: "confirmado" });
    expect(e).toMatchObject({ aluno: "Rafael Moura", foto: "f.jpg", modulo: "treino", cor: "#a78bfa", status: "paciente_confirmou", confirmacao: "confirmado" });
    expect(nomeDoEvento(e)).toEqual({ nome: "Rafael Moura", sub: "Avaliação física" });
    expect(nomeDoEvento(ev({ paciente_id: null, titulo: "Feriado" }))).toEqual({ nome: "Feriado", sub: null });
    expect(ev({ status: "xyz", modulo: "x" })).toMatchObject({ status: "agendado", modulo: "nutricao" });
  });

  it("conflito: outra consulta viva do MESMO profissional, em qualquer calendário dele (a regra dos slots do banco)", () => {
    const outra = ev({ id: "a2", calendario_id: "c2" });
    const cancelada = ev({ id: "a3", status: "paciente_desmarcou" });
    const deOutro = ev({ id: "a4", nutricionista_id: "camila" });
    const c = { inicio: new Date("2026-10-15T12:30:00Z"), fim: new Date("2026-10-15T13:30:00Z"), profissionalId: "lucas", id: "novo" };
    expect(conflitos(c, [outra, cancelada, deOutro]).map((x) => x.id)).toEqual(["a2"]);
    expect(conflitos({ ...c, id: "a2" }, [outra])).toHaveLength(0);
  });

  it("bloqueio do calendário ou de todos; trava recorrente no dia da semana e no horário", () => {
    const c = { inicio: new Date(2026, 9, 15, 13, 0), fim: new Date(2026, 9, 15, 14, 0), calendarioId: "c1", profissionalId: "lucas" };
    const bls = [
      { id: "b1", inicio: new Date(2026, 9, 15, 0, 0), fim: new Date(2026, 9, 16, 0, 0), motivo: "Feriado", calendarioId: null, profissionalId: "lucas" },
      { id: "b2", inicio: new Date(2026, 9, 15, 0, 0), fim: new Date(2026, 9, 16, 0, 0), motivo: null, calendarioId: "c2", profissionalId: "lucas" },
    ];
    expect(bloqueiosEmConflito(c, bls).map((b) => b.id)).toEqual(["b1"]);
    const travas = [
      { id: "t1", profissional_id: "lucas", calendario_id: null, dias: [4], hora_inicio: "13:00", hora_fim: "13:30", motivo: "Almoço" },
      { id: "t2", profissional_id: "lucas", calendario_id: null, dias: [1], hora_inicio: "13:00", hora_fim: "14:00", motivo: null },
      { id: "t3", profissional_id: "lucas", calendario_id: null, dias: [4], hora_inicio: "14:00", hora_fim: "15:00", motivo: null },
    ];
    expect(travasEmConflito(c, travas).map((t) => t.id)).toEqual(["t1"]); // 15/10/2026 é quinta (4)
  });

  it("fora do atendimento: dia não atendido ou horário fora (o aluno não marca; o profissional encaixa com aviso)", () => {
    const r = { ...REGRAS_PADRAO, dias: [1, 2, 3, 4, 5] };
    expect(foraDoAtendimento(new Date(2026, 9, 15, 9, 0), new Date(2026, 9, 15, 10, 0), r)).toBeNull();
    expect(foraDoAtendimento(new Date(2026, 9, 15, 17, 30), new Date(2026, 9, 15, 18, 30), r)).toBe("horario");
    expect(foraDoAtendimento(new Date(2026, 9, 18, 9, 0), new Date(2026, 9, 18, 10, 0), r)).toBe("dia"); // domingo
  });

  it("faixa da semana = a dos calendários somada ao atendimento; eventos do dia, dia inteiro primeiro", () => {
    expect(faixaDaSemana([{ faixa_inicio: "09:00:00", faixa_fim: "17:00:00" }], { atende_inicio: "07:30", atende_fim: "19:00" })).toEqual({ inicio: "07:00", fim: "19:00" });
    const dia = [ev({ id: "x", inicio: "2026-10-15T15:00:00Z", fim: "2026-10-15T16:00:00Z" }), ev({ id: "y", dia_inteiro: true, inicio: "2026-10-15T03:00:00Z", fim: "2026-10-16T03:00:00Z" })];
    expect(eventosDoDia(dia, new Date(2026, 9, 15)).map((e) => e.id)).toEqual(["y", "x"]);
    expect(faixaHora({ inicio: new Date(2026, 9, 15, 9, 0), fim: new Date(2026, 9, 15, 10, 30), diaInteiro: false })).toBe("09:00 – 10:30");
  });
});
