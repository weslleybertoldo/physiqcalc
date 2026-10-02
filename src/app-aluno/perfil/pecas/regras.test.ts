import { describe, expect, it } from "vitest";
import type { ResumoMatricula } from "@/financeiro/tipos";
import {
  agendamentosAnteriores, areaDaConsulta, chipDePagamentos, diaCurto, emQuantosDias, lerHora, linhaDoAluno, linkWhatsapp, mesAno, proximosAgendamentos,
  quandoAgendamento, rotuloStatus, valorDoLembrete,
} from "./regras";

const AGORA = new Date("2026-07-15T15:00:00Z"); // qua, 15/07 12:00 em São Paulo

function resumo(p: Partial<ResumoMatricula> = {}): ResumoMatricula {
  return {
    paciente_id: "p1", conta_id: "c1", conta_nome: "Consultoria", recebimento_modo: "pix_manual", bloquear_inadimplente: false, tem_chave: true,
    profissional: "Lucas Ferreira", mensalidade_valor: null, plano_nome: null, pausada: false, pago_ate: null, desde: null, aguardando: false,
    assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, ...p,
  };
}

describe("card do aluno (tela 5)", () => {
  it("'Aluno desde mar/2026 · Objetivo: definição'", () => {
    expect(mesAno("2026-03-10T12:00:00Z")).toBe("mar/2026");
    expect(mesAno("2026-01-01T01:00:00Z")).toBe("dez/2025"); // ainda 31/12 em São Paulo
    expect(linhaDoAluno("2026-03-10T12:00:00Z", "Definição")).toBe("Aluno desde mar/2026 · Objetivo: definição");
    expect(linhaDoAluno("2026-03-10T12:00:00Z", null)).toBe("Aluno desde mar/2026");
    expect(linhaDoAluno(null, "  ")).toBe("");
  });
  it("WhatsApp do profissional (P24): só com número válido", () => {
    expect(linkWhatsapp("+5582999990000")).toBe("https://wa.me/5582999990000");
    expect(linkWhatsapp("(82) 99999-0000")).toBe("https://wa.me/82999990000");
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp("123")).toBeNull();
  });
});

describe("agenda do aluno (N-53, a regra do Nutri)", () => {
  const lista = [
    { id: "a", inicio: "2026-07-18T13:00:00Z", fim: "2026-07-18T14:00:00Z", status: "agendado", titulo: "Retorno" },
    { id: "b", inicio: "2026-07-10T13:00:00Z", fim: "2026-07-10T14:00:00Z", status: "confirmado", titulo: "Avaliação" },
    { id: "c", inicio: "2026-07-20T13:00:00Z", fim: "2026-07-20T14:00:00Z", status: "desmarcado", titulo: "Consulta" },
    { id: "d", inicio: "2026-07-16T13:00:00Z", fim: "2026-07-16T14:00:00Z", status: "paciente_confirmou", titulo: "Treino" },
    { id: "e", inicio: "2026-07-15T14:30:00Z", fim: "2026-07-15T15:30:00Z", status: "agendado", titulo: "Agora" },
  ];
  it("próximas: não terminaram e não foram desmarcadas, da mais perto para a mais longe", () => {
    expect(proximosAgendamentos(lista, AGORA).map((a) => a.id)).toEqual(["e", "d", "a"]);
    expect(proximosAgendamentos(lista, AGORA, 1).map((a) => a.id)).toEqual(["e"]);
  });
  it("anteriores: passaram ou foram desmarcadas, da mais recente para a mais antiga", () => {
    expect(agendamentosAnteriores(lista, AGORA).map((a) => a.id)).toEqual(["c", "b"]);
  });
  it("H1: a ÁREA da consulta vence o papel (o ícone: treino → halter, nutrição → prato, geral → calendário)", () => {
    // quem tem o MESMO profissional como personal e nutri: a consulta de nutrição é de nutrição (antes o papel "personal" vencia)
    expect(areaDaConsulta({ modulo: "nutricao", papel: "personal" })).toBe("nutricao");
    expect(areaDaConsulta({ modulo: "treino", papel: "nutricionista" })).toBe("treino");
    expect(areaDaConsulta({ modulo: "geral", papel: "personal" })).toBe("geral");
    expect(areaDaConsulta({ modulo: "geral", papel: "nutricionista" })).toBe("geral");
    // o papel só decide quando a consulta não traz a área
    expect(areaDaConsulta({ modulo: null, papel: "personal" })).toBe("treino");
    expect(areaDaConsulta({ papel: "nutricionista" })).toBe("nutricao");
    expect(areaDaConsulta({ modulo: "outra", papel: "personal" })).toBe("treino");
    expect(areaDaConsulta({ modulo: null, papel: null })).toBe("geral");
    expect(areaDaConsulta({})).toBe("geral");
  });
  it("status na voz do aluno, com quem confirmou/desmarcou", () => {
    expect(rotuloStatus("paciente_confirmou")).toBe("Você confirmou");
    expect(rotuloStatus("confirmado", "nutricionista")).toBe("Confirmado pela nutricionista");
    expect(rotuloStatus("desmarcado", "personal")).toBe("Desmarcado pelo personal");
    expect(rotuloStatus("confirmado")).toBe("Confirmado pelo profissional");
    expect(rotuloStatus("nao_compareceu")).toBe("Não compareceu");
    expect(rotuloStatus("outro")).toBe("outro");
  });
  it("'sáb, 18/07' e a hora de São Paulo", () => {
    expect(diaCurto("2026-07-18T13:00:00Z")).toBe("sáb, 18/07");
    expect(quandoAgendamento({ inicio: "2026-07-18T13:00:00Z", dia_inteiro: false })).toBe("sáb, 18/07 · 10:00");
    expect(quandoAgendamento({ inicio: "2026-07-18T13:00:00Z", dia_inteiro: true })).toBe("sáb, 18/07 · dia inteiro");
    expect(emQuantosDias("2026-07-15T20:00:00Z", AGORA)).toBe("Hoje");
    expect(emQuantosDias("2026-07-16T20:00:00Z", AGORA)).toBe("Amanhã");
    expect(emQuantosDias("2026-07-18T13:00:00Z", AGORA)).toBe("Em 3 dias");
  });
});

describe("chip de Pagamentos (tela 5: 'Vence em 3 dias' âmbar)", () => {
  it("sem cobrança nenhuma → sem chip", () => {
    expect(chipDePagamentos(null, AGORA)).toBeNull();
    expect(chipDePagamentos([resumo()], AGORA)).toBeNull();
  });
  it("mensalidade vencendo → âmbar; vencida → rosa; em dia → verde", () => {
    expect(chipDePagamentos([resumo({ mensalidade_valor: 249, pago_ate: "2026-07-18T15:00:00Z" })], AGORA)).toEqual({ texto: "Vence em 3 dias", tom: "a" });
    expect(chipDePagamentos([resumo({ mensalidade_valor: 249, pago_ate: "2026-07-10T15:00:00Z" })], AGORA)?.tom).toBe("r");
    expect(chipDePagamentos([resumo({ mensalidade_valor: 249, pago_ate: "2026-08-30T15:00:00Z" })], AGORA)?.tom).toBe("n");
  });
  it("cobrança avulsa vencida vence o resto; a mais urgente entre 2 matrículas", () => {
    const avulsa = resumo({ abertas: [{ id: "x", descricao: "Consulta", valor: 150, vencimento: "2026-07-12" }] });
    expect(chipDePagamentos([avulsa, resumo({ mensalidade_valor: 249, pago_ate: "2026-08-30T15:00:00Z" })], AGORA)).toEqual({ texto: "Cobrança vencida", tom: "r" });
    const vencendo = resumo({ abertas: [{ id: "y", descricao: "Consulta", valor: 150, vencimento: "2026-07-16" }] });
    expect(chipDePagamentos([vencendo], AGORA)).toEqual({ texto: "Vence amanhã", tom: "a" });
    expect(chipDePagamentos([resumo({ mensalidade_valor: 249, pago_ate: "2026-08-30T15:00:00Z" }), resumo({ mensalidade_valor: 99, pago_ate: "2026-07-10T15:00:00Z" })], AGORA)?.tom).toBe("r");
  });
});

describe("linhas do Perfil", () => {
  it("lembrete: '18:30' ligado · 'Desligado'", () => {
    expect(valorDoLembrete({ hour: 18, minute: 30, enabled: true })).toBe("18:30");
    expect(valorDoLembrete({ hour: 7, minute: 5, enabled: true })).toBe("07:05");
    expect(valorDoLembrete({ hour: 18, minute: 30, enabled: false })).toBe("Desligado");
  });
  it("hora digitada", () => {
    expect(lerHora("18:30")).toEqual({ hour: 18, minute: 30 });
    expect(lerHora("7:05")).toEqual({ hour: 7, minute: 5 });
    expect(lerHora("24:00")).toBeNull();
    expect(lerHora("abc")).toBeNull();
  });
});
