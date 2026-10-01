// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/agendaUtil.test.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { describe, expect, it } from "vitest";
import {
  agruparPorDia, ancoraDaURL, bloqueiosEmConflito, combinarDataHora, conflitos, confirmacaoDoStatus, contarHoje, diasDaGrade,
  diasDaSemana, distribuirColunas, duracaoMinutos, eventosDoDia, faixaVisivel, fimPorDuracao, formatarFaixaHora, gerarICS, hhmm,
  horasDaFaixa, intervaloVisao, minutosDoDia, minutosParaHora, moverAncora, nomeDoDiaCurto, posicaoNoDia, sobrepoe,
  statusCancelado, tituloPeriodo, type EventoAgenda,
} from "./agendaUtil";

const ev = (id: string, inicio: string, fim: string, extra: Partial<EventoAgenda> = {}): EventoAgenda => ({
  id, titulo: `Evento ${id}`, inicio: new Date(inicio), fim: new Date(fim), diaInteiro: false, status: "agendado",
  confirmacao: "a_confirmar", calendarioId: "cal-1", pacienteId: null, observacao: null, cor: "#38bdf8", ...extra,
});

describe("status e confirmação", () => {
  it("deriva a cor da borda do status", () => {
    expect(confirmacaoDoStatus("agendado")).toBe("a_confirmar");
    expect(confirmacaoDoStatus("encaixe")).toBe("a_confirmar");
    expect(confirmacaoDoStatus("confirmado")).toBe("confirmado");
    expect(confirmacaoDoStatus("paciente_confirmou")).toBe("confirmado");
    expect(confirmacaoDoStatus("desmarcado")).toBe("desmarcado");
    expect(confirmacaoDoStatus("paciente_desmarcou")).toBe("desmarcado");
    expect(confirmacaoDoStatus("nao_compareceu")).toBe("a_confirmar");
  });
  it("sabe o que conta como cancelado", () => {
    expect(statusCancelado("desmarcado")).toBe(true);
    expect(statusCancelado("paciente_desmarcou")).toBe(true);
    expect(statusCancelado("nao_compareceu")).toBe(false);
  });
});

describe("grade e períodos", () => {
  const set19 = new Date(2026, 8, 19); // sábado
  it("grade do mês tem 42 dias, começa no domingo e contém o dia 1", () => {
    const dias = diasDaGrade(set19);
    expect(dias).toHaveLength(42);
    expect(dias[0].getDay()).toBe(0);
    expect(dias[0]).toEqual(new Date(2026, 7, 30)); // 30/08/2026 é domingo
    expect(dias.some((d) => d.getDate() === 1 && d.getMonth() === 8)).toBe(true);
  });
  it("semana vai de domingo a sábado", () => {
    const dias = diasDaSemana(set19);
    expect(dias.map((d) => d.getDate())).toEqual([13, 14, 15, 16, 17, 18, 19]);
  });
  it("intervalo da visão tem fim exclusivo", () => {
    expect(intervaloVisao(set19, "semana")).toEqual({ inicio: new Date(2026, 8, 13), fim: new Date(2026, 8, 20) });
    expect(intervaloVisao(set19, "lista")).toEqual({ inicio: new Date(2026, 8, 1), fim: new Date(2026, 9, 1) });
    const mes = intervaloVisao(set19, "mes");
    expect(mes.inicio).toEqual(new Date(2026, 7, 30));
    expect(mes.fim).toEqual(new Date(2026, 9, 11));
  });
  it("título do período em pt-BR", () => {
    expect(tituloPeriodo(set19, "mes")).toBe("Setembro de 2026");
    expect(tituloPeriodo(set19, "lista")).toBe("Setembro de 2026");
    expect(tituloPeriodo(set19, "semana")).toBe("13 – 19 de setembro de 2026");
    expect(tituloPeriodo(new Date(2026, 8, 30), "semana")).toBe("27 de set – 3 de out de 2026");
  });
  it("navega por mês ou por semana conforme a visão", () => {
    expect(moverAncora(set19, "mes", 1)).toEqual(new Date(2026, 9, 19));
    expect(moverAncora(set19, "lista", -1)).toEqual(new Date(2026, 7, 19));
    expect(moverAncora(set19, "semana", 1)).toEqual(new Date(2026, 8, 26));
  });
  it("cabeçalho curto do dia e âncora da URL", () => {
    expect(nomeDoDiaCurto(new Date(2026, 8, 14))).toBe("seg. 14/09");
    expect(ancoraDaURL("2026-09-14")).toEqual(new Date(2026, 8, 14));
    expect(ancoraDaURL("lixo", new Date(2026, 8, 19, 15, 30))).toEqual(new Date(2026, 8, 19));
    expect(ancoraDaURL(null, new Date(2026, 8, 19, 15, 30))).toEqual(new Date(2026, 8, 19));
  });
});

describe("horas e faixa", () => {
  it("converte time do Postgres e minutos", () => {
    expect(hhmm("07:30:00")).toBe("07:30");
    expect(minutosDoDia("07:30:00")).toBe(450);
    expect(minutosParaHora(450)).toBe("07:30");
  });
  it("linhas da faixa (fim exclusivo, arredondando)", () => {
    expect(horasDaFaixa("07:00", "10:00")).toEqual(["07:00", "08:00", "09:00"]);
    expect(horasDaFaixa("07:30:00", "09:15:00")).toEqual(["07:00", "08:00", "09:00"]);
  });
  it("faixa visível é a união dos calendários (ou a padrão)", () => {
    expect(faixaVisivel([])).toEqual({ inicio: "07:00", fim: "20:00" });
    expect(faixaVisivel([{ faixa_inicio: "08:00:00", faixa_fim: "12:00:00" }, { faixa_inicio: "10:00:00", faixa_fim: "18:00:00" }]))
      .toEqual({ inicio: "08:00", fim: "18:00" });
  });
  it("posiciona o evento na coluna do dia e grampeia na faixa", () => {
    const dia = new Date(2026, 8, 14);
    const p = posicaoNoDia({ inicio: new Date(2026, 8, 14, 8, 0), fim: new Date(2026, 8, 14, 9, 0) }, dia, "07:00", "11:00");
    expect(p).toEqual({ topo: 25, altura: 25 });
    const fora = posicaoNoDia({ inicio: new Date(2026, 8, 14, 22, 0), fim: new Date(2026, 8, 14, 23, 0) }, dia, "07:00", "11:00");
    expect(fora).toBeNull();
    const atravessa = posicaoNoDia({ inicio: new Date(2026, 8, 13, 23, 0), fim: new Date(2026, 8, 14, 8, 0) }, dia, "07:00", "11:00");
    expect(atravessa).toEqual({ topo: 0, altura: 25 });
    const curto = posicaoNoDia({ inicio: new Date(2026, 8, 14, 7, 0), fim: new Date(2026, 8, 14, 7, 1) }, dia, "07:00", "11:00");
    expect(curto?.altura).toBe(2.5);
  });
});

describe("eventos do dia e colunas", () => {
  const a = ev("a", "2026-09-14T10:00:00", "2026-09-14T11:00:00");
  const b = ev("b", "2026-09-14T10:30:00", "2026-09-14T11:30:00");
  const c = ev("c", "2026-09-14T13:00:00", "2026-09-14T14:00:00");
  const d = ev("d", "2026-09-13T23:00:00", "2026-09-14T01:00:00");
  const dia = ev("e", "2026-09-14T00:00:00", "2026-09-15T00:00:00", { diaInteiro: true });
  it("filtra quem toca o dia (inclusive atravessando a meia-noite) e põe dia inteiro primeiro", () => {
    const lista = eventosDoDia([c, a, dia, b, d], new Date(2026, 8, 14));
    expect(lista.map((e) => e.id)).toEqual(["e", "d", "a", "b", "c"]);
    expect(eventosDoDia([a, b, c], new Date(2026, 8, 15))).toHaveLength(0);
  });
  it("agrupa por dia só os dias com evento", () => {
    const grupos = agruparPorDia([a, c], [new Date(2026, 8, 13), new Date(2026, 8, 14), new Date(2026, 8, 15)]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].eventos).toHaveLength(2);
  });
  it("distribui colunas só entre quem se sobrepõe", () => {
    const r = distribuirColunas([a, b, c]);
    const por = Object.fromEntries(r.map((x) => [x.evento.id, [x.coluna, x.total]]));
    expect(por.a).toEqual([0, 2]);
    expect(por.b).toEqual([1, 2]);
    expect(por.c).toEqual([0, 1]);
  });
  it("conta os de hoje sem os desmarcados", () => {
    const hoje = new Date(2026, 8, 14, 15, 0);
    const cancelado = ev("x", "2026-09-14T16:00:00", "2026-09-14T17:00:00", { status: "desmarcado" });
    expect(contarHoje([a, b, c, cancelado], hoje)).toBe(3);
    expect(contarHoje([cancelado], hoje)).toBe(0);
  });
  it("acha conflitos no mesmo calendário e bloqueios no horário", () => {
    const candidato = { inicio: new Date(2026, 8, 14, 10, 45), fim: new Date(2026, 8, 14, 11, 15), calendarioId: "cal-1" };
    expect(conflitos(candidato, [a, b, c]).map((e) => e.id)).toEqual(["a", "b"]);
    expect(conflitos({ ...candidato, id: "a" }, [a, b])).toHaveLength(1);
    expect(conflitos({ ...candidato, calendarioId: "cal-2" }, [a, b])).toHaveLength(0);
    const cancelado = ev("x", "2026-09-14T10:00:00", "2026-09-14T12:00:00", { status: "paciente_desmarcou" });
    expect(conflitos(candidato, [cancelado])).toHaveLength(0);
    const bloqueios = [
      { id: "b1", inicio: new Date(2026, 8, 14), fim: new Date(2026, 8, 15), motivo: "Feriado", calendarioId: null },
      { id: "b2", inicio: new Date(2026, 8, 14), fim: new Date(2026, 8, 15), motivo: null, calendarioId: "cal-2" },
    ];
    expect(bloqueiosEmConflito(candidato, bloqueios).map((b) => b.id)).toEqual(["b1"]);
  });
});

describe("datas do formulário", () => {
  it("combina data e hora em horário local e calcula fim/duração", () => {
    const inicio = combinarDataHora("2026-09-19", "10:00");
    expect(inicio).toEqual(new Date(2026, 8, 19, 10, 0));
    expect(fimPorDuracao(inicio, 45)).toEqual(new Date(2026, 8, 19, 10, 45));
    expect(duracaoMinutos(inicio, new Date(2026, 8, 19, 11, 30))).toBe(90);
    expect(sobrepoe(inicio, fimPorDuracao(inicio, 60), new Date(2026, 8, 19, 10, 59), new Date(2026, 8, 19, 12, 0))).toBe(true);
    expect(sobrepoe(inicio, fimPorDuracao(inicio, 60), new Date(2026, 8, 19, 11, 0), new Date(2026, 8, 19, 12, 0))).toBe(false);
  });
  it("formata a faixa de hora", () => {
    expect(formatarFaixaHora({ inicio: new Date(2026, 8, 19, 10, 0), fim: new Date(2026, 8, 19, 11, 0), diaInteiro: false })).toBe("10:00 – 11:00");
    expect(formatarFaixaHora({ inicio: new Date(2026, 8, 19), fim: new Date(2026, 8, 20), diaInteiro: true })).toBe("Dia inteiro");
  });
});

describe("gerarICS", () => {
  it("monta um VCALENDAR válido com evento de hora e de dia inteiro, escapando o texto", () => {
    const agora = new Date(Date.UTC(2026, 8, 19, 12, 0, 0));
    const eventos = [
      ev("1", "2026-09-19T13:00:00.000Z", "2026-09-19T14:00:00.000Z", { titulo: "Consulta; Maria, retorno", observacao: "linha 1\nlinha 2", status: "confirmado", confirmacao: "confirmado" }),
      ev("2", "2026-09-20T00:00:00", "2026-09-21T00:00:00", { diaInteiro: true, titulo: "Feriado", status: "desmarcado" }),
    ];
    const ics = gerarICS(eventos, agora);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:1@physiqnutri");
    expect(ics).toContain("DTSTAMP:20260919T120000Z");
    expect(ics).toContain("DTSTART:20260919T130000Z");
    expect(ics).toContain("DTEND:20260919T140000Z");
    expect(ics).toContain("SUMMARY:Consulta\\; Maria\\, retorno");
    expect(ics).toContain("DESCRIPTION:Confirmado por você — linha 1\\nlinha 2");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260920");
    expect(ics).toContain("DTEND;VALUE=DATE:20260921");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
