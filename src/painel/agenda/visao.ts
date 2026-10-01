// Physiq W20 — o que as visões (semana · mês · lista) e o diálogo do agendamento calculam: o evento como a tela usa, eventos do
// dia, conflitos (QUALQUER calendário do mesmo profissional — a mesma regra dos slots do banco), bloqueios, travas e "fora do
// atendimento". As contas de calendário (grade do mês, semana, posição na coluna) são as do site antigo, já portadas na W16
// (src/nutricao/editor/lib/agendaUtil.ts).
import { addDays, startOfDay } from "date-fns";
import {
  CORES_CALENDARIO, VISOES, ancoraDaURL, chaveDia, combinarDataHora, dataValida, diasDaGrade, diasDaSemana, distribuirColunas, ehVisao,
  faixaVisivel, formatarHora, hhmm, horaValida, horasDaFaixa, intervaloVisao, minutosDoDia, minutosParaHora, moverAncora, nomeDoDiaCurto,
  nomeDoDiaLongo, posicaoNoDia, sobrepoe, tituloPeriodo, type Visao,
} from "@/nutricao/editor/lib/agendaUtil";
import {
  confirmacaoDe, minutosDe, statusDe, tipoDe, travasDoDia, type ConfirmacaoAgenda, type RegrasAgenda, type StatusAgenda, type TipoAgendamento,
  type TravaRecorrente,
} from "@/agenda/regras";
import type { Agendamento, AlunoAgenda, Bloqueio, Calendario } from "./dados";

export {
  CORES_CALENDARIO, VISOES, ancoraDaURL, chaveDia, combinarDataHora, dataValida, diasDaGrade, diasDaSemana, distribuirColunas, ehVisao, faixaVisivel,
  formatarHora, hhmm, horaValida, horasDaFaixa, intervaloVisao, minutosDoDia, minutosParaHora, moverAncora, nomeDoDiaCurto, nomeDoDiaLongo,
  posicaoNoDia, sobrepoe, tituloPeriodo, type Visao,
};

export interface EventoPainel {
  id: string;
  titulo: string;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
  status: StatusAgenda;
  confirmacao: ConfirmacaoAgenda;
  calendarioId: string;
  profissionalId: string;
  pacienteId: string | null;
  aluno: string | null;
  foto: string | null;
  observacao: string | null;
  modulo: TipoAgendamento;
  reagendamentos: number;
  origem: string;
  /** cor do calendário */
  cor: string;
}

export interface BloqueioPainel {
  id: string;
  inicio: Date;
  fim: Date;
  motivo: string | null;
  calendarioId: string | null;
  profissionalId: string;
}

export function paraEvento(a: Agendamento, cores: Map<string, string>, alunos: Map<string, AlunoAgenda>): EventoPainel {
  const status = statusDe(a.status);
  const aluno = a.paciente_id ? alunos.get(a.paciente_id) ?? null : null;
  const conf = a.confirmacao === "a_confirmar" || a.confirmacao === "confirmado" || a.confirmacao === "desmarcado" ? a.confirmacao : confirmacaoDe(status);
  return {
    id: a.id,
    titulo: a.titulo,
    inicio: new Date(a.inicio),
    fim: new Date(a.fim),
    diaInteiro: a.dia_inteiro,
    status,
    confirmacao: conf,
    calendarioId: a.calendario_id,
    profissionalId: a.nutricionista_id,
    pacienteId: a.paciente_id,
    aluno: aluno?.nome ?? null,
    foto: aluno?.foto_url ?? null,
    observacao: a.observacao,
    modulo: tipoDe(a.modulo),
    reagendamentos: a.reagendamentos ?? 0,
    origem: a.origem ?? "profissional",
    cor: cores.get(a.calendario_id) ?? CORES_CALENDARIO[0],
  };
}

export const paraBloqueio = (b: Bloqueio): BloqueioPainel => ({
  id: b.id, inicio: new Date(b.inicio), fim: new Date(b.fim), motivo: b.motivo, calendarioId: b.calendario_id, profissionalId: b.nutricionista_id,
});

const ordem = <T extends { diaInteiro: boolean; inicio: Date }>(a: T, b: T): number =>
  a.diaInteiro === b.diaInteiro ? a.inicio.getTime() - b.inicio.getTime() : a.diaInteiro ? -1 : 1;

/** Eventos que tocam o dia (inclui os que atravessam a meia-noite), dia inteiro primeiro. */
export function eventosDoDia<T extends { inicio: Date; fim: Date; diaInteiro: boolean }>(eventos: readonly T[], dia: Date): T[] {
  const ini = startOfDay(dia);
  const fim = addDays(ini, 1);
  return eventos.filter((e) => e.inicio < fim && e.fim > ini).sort(ordem);
}

export function agruparPorDia<T extends { inicio: Date; fim: Date; diaInteiro: boolean }>(eventos: readonly T[], dias: Date[]): { dia: Date; eventos: T[] }[] {
  return dias.map((dia) => ({ dia, eventos: eventosDoDia(eventos, dia) })).filter((g) => g.eventos.length > 0);
}

export function bloqueiosDoDia<T extends { inicio: Date; fim: Date }>(bloqueios: readonly T[], dia: Date): T[] {
  const ini = startOfDay(dia);
  const fim = addDays(ini, 1);
  return bloqueios.filter((b) => b.inicio < fim && b.fim > ini);
}

const vivo = (s: StatusAgenda): boolean => s !== "desmarcado" && s !== "paciente_desmarcou";

/** Conflito: outra consulta viva do MESMO profissional (qualquer calendário dele) no mesmo horário. */
export function conflitos(c: { inicio: Date; fim: Date; profissionalId: string; id?: string }, eventos: readonly EventoPainel[]): EventoPainel[] {
  return eventos.filter((e) => e.id !== c.id && e.profissionalId === c.profissionalId && vivo(e.status) && sobrepoe(c.inicio, c.fim, e.inicio, e.fim));
}

/** Bloqueios (dias inteiros e travas avulsas) que pegam o horário: do calendário ou de todos os do profissional. */
export function bloqueiosEmConflito(c: { inicio: Date; fim: Date; calendarioId: string; profissionalId: string }, bloqueios: readonly BloqueioPainel[]): BloqueioPainel[] {
  return bloqueios.filter((b) => b.profissionalId === c.profissionalId && (b.calendarioId === null || b.calendarioId === c.calendarioId) && sobrepoe(c.inicio, c.fim, b.inicio, b.fim));
}

/** Travas recorrentes que pegam o horário (no dia da semana do início). */
export function travasEmConflito(c: { inicio: Date; fim: Date; calendarioId: string; profissionalId: string }, travas: readonly TravaRecorrente[]): TravaRecorrente[] {
  const ini = c.inicio.getHours() * 60 + c.inicio.getMinutes();
  const dur = Math.max(Math.round((c.fim.getTime() - c.inicio.getTime()) / 60000), 1);
  return travasDoDia(travas.filter((t) => t.profissional_id === c.profissionalId), c.inicio.getDay(), c.calendarioId)
    .filter((t) => minutosDe(t.hora_inicio) < ini + dur && minutosDe(t.hora_fim) > ini);
}

/** Fora do horário/dia de atendimento (o aluno não marca aí; o profissional pode, com o aviso). */
export function foraDoAtendimento(inicio: Date, fim: Date, regras: Pick<RegrasAgenda, "atende_inicio" | "atende_fim" | "dias">): "dia" | "horario" | null {
  if (!regras.dias.includes(inicio.getDay())) return "dia";
  const a = inicio.getHours() * 60 + inicio.getMinutes();
  const b = a + Math.round((fim.getTime() - inicio.getTime()) / 60000);
  return a < minutosDe(regras.atende_inicio) || b > minutosDe(regras.atende_fim) ? "horario" : null;
}

/** Faixa da visão semana: a dos calendários somada ao horário de atendimento (o que fica de fora aparece apagado). */
export function faixaDaSemana(calendarios: Pick<Calendario, "faixa_inicio" | "faixa_fim">[], regras: Pick<RegrasAgenda, "atende_inicio" | "atende_fim">): { inicio: string; fim: string } {
  const f = faixaVisivel(calendarios);
  const a = Math.min(minutosDoDia(f.inicio), minutosDe(regras.atende_inicio));
  const b = Math.max(minutosDoDia(f.fim), minutosDe(regras.atende_fim));
  return { inicio: minutosParaHora(Math.floor(a / 60) * 60), fim: minutosParaHora(Math.min(Math.ceil(b / 60) * 60, 24 * 60 - 1)) };
}

/** "07:00 – 08:00" · "Dia inteiro". */
export function faixaHora(ev: { inicio: Date; fim: Date; diaInteiro: boolean }): string {
  return ev.diaInteiro ? "Dia inteiro" : `${formatarHora(ev.inicio)} – ${formatarHora(ev.fim)}`;
}

/** O nome que a lista mostra: o aluno (com o título embaixo) ou o título do compromisso avulso. */
export function nomeDoEvento(ev: Pick<EventoPainel, "aluno" | "titulo">): { nome: string; sub: string | null } {
  if (ev.aluno) return { nome: ev.aluno, sub: ev.titulo && ev.titulo !== ev.aluno ? ev.titulo : null };
  return { nome: ev.titulo, sub: null };
}

export type { Visao as VisaoAgenda };
