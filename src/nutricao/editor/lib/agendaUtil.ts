// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/lib/agendaUtil.ts) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import {
  addDays, addMinutes, addMonths, addWeeks, differenceInMinutes, endOfMonth, format, isValid, parseISO, startOfDay,
  startOfMonth, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// Regras e cálculos PUROS da agenda (sem Supabase) — cobertos pelo vitest. A tela e o acesso a dados ficam em
// `src/lib/agenda.ts` e `src/components/agenda/*`.

export type Visao = "mes" | "semana" | "lista";
export const VISOES: { chave: Visao; rotulo: string }[] = [
  { chave: "mes", rotulo: "Mês" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "lista", rotulo: "Lista" },
];
export const ehVisao = (v: string | null): v is Visao => v === "mes" || v === "semana" || v === "lista";

// Cor de FUNDO do evento = status (7 valores da referência).
export const STATUS_AGENDAMENTO = {
  agendado: { rotulo: "Agendado", fundo: "bg-sky-500/25 text-sky-100", ponto: "bg-sky-400" },
  encaixe: { rotulo: "Encaixe", fundo: "bg-violet-500/25 text-violet-100", ponto: "bg-violet-400" },
  confirmado: { rotulo: "Confirmado por você", fundo: "bg-emerald-500/25 text-emerald-100", ponto: "bg-emerald-400" },
  paciente_confirmou: { rotulo: "Paciente confirmou", fundo: "bg-teal-500/25 text-teal-100", ponto: "bg-teal-400" },
  desmarcado: { rotulo: "Desmarcado por você", fundo: "bg-rose-500/25 text-rose-100 line-through", ponto: "bg-rose-400" },
  paciente_desmarcou: { rotulo: "Paciente desmarcou", fundo: "bg-orange-500/25 text-orange-100 line-through", ponto: "bg-orange-400" },
  nao_compareceu: { rotulo: "Não compareceu", fundo: "bg-zinc-500/30 text-zinc-200", ponto: "bg-zinc-400" },
} as const;
export type StatusAgendamento = keyof typeof STATUS_AGENDAMENTO;
export const STATUS_ORDEM = Object.keys(STATUS_AGENDAMENTO) as StatusAgendamento[];
export const ehStatus = (v: string): v is StatusAgendamento => Object.prototype.hasOwnProperty.call(STATUS_AGENDAMENTO, v);

// Cor da BORDA do evento = confirmação (3 valores), derivada do status.
export const CONFIRMACAO = {
  a_confirmar: { rotulo: "À confirmar", borda: "border-amber-400" },
  confirmado: { rotulo: "Confirmado", borda: "border-emerald-400" },
  desmarcado: { rotulo: "Desmarcado", borda: "border-rose-400" },
} as const;
export type Confirmacao = keyof typeof CONFIRMACAO;
export const CONFIRMACAO_ORDEM = Object.keys(CONFIRMACAO) as Confirmacao[];
export const ehConfirmacao = (v: string): v is Confirmacao => Object.prototype.hasOwnProperty.call(CONFIRMACAO, v);

export function confirmacaoDoStatus(s: StatusAgendamento): Confirmacao {
  if (s === "confirmado" || s === "paciente_confirmou") return "confirmado";
  if (s === "desmarcado" || s === "paciente_desmarcou") return "desmarcado";
  return "a_confirmar";
}
export const statusCancelado = (s: StatusAgendamento): boolean => s === "desmarcado" || s === "paciente_desmarcou";

export const DURACOES = [15, 30, 45, 60, 90, 120] as const;
export const CORES_CALENDARIO = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb923c", "#f87171", "#22d3ee"] as const;
export const FAIXA_PADRAO = { inicio: "07:00", fim: "20:00" };
export const HORA_PADRAO_NOVO = "09:00";

export type EventoAgenda = {
  id: string;
  titulo: string;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
  status: StatusAgendamento;
  confirmacao: Confirmacao;
  calendarioId: string;
  pacienteId: string | null;
  observacao: string | null;
  cor: string; // cor do calendário
};
export type BloqueioVisivel = { id: string; inicio: Date; fim: Date; motivo: string | null; calendarioId: string | null };

const SEMANA = { weekStartsOn: 0 as const }; // domingo primeiro, como na referência ("dom. 13/09 … sáb. 19/09")

export const chaveDia = (d: Date): string => format(d, "yyyy-MM-dd");
/** "07:00:00" (time do Postgres) → "07:00". */
export const hhmm = (v: string): string => v.slice(0, 5);
export function minutosDoDia(v: string): number {
  const [h, m] = hhmm(v).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
export const minutosParaHora = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const formatarHora = (d: Date): string => format(d, "HH:mm");
export const dataValida = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && isValid(parseISO(v));
export const horaValida = (v: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Data da URL (`?data=2026-09-19`) ou hoje. */
export function ancoraDaURL(v: string | null, hoje = new Date()): Date {
  return v && dataValida(v) ? parseISO(v) : startOfDay(hoje);
}

/** Grade do mês: 6 semanas (42 dias) começando no domingo da semana do dia 1. */
export function diasDaGrade(ancora: Date): Date[] {
  const inicio = startOfWeek(startOfMonth(ancora), SEMANA);
  return Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
}
export function diasDaSemana(ancora: Date): Date[] {
  const inicio = startOfWeek(ancora, SEMANA);
  return Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
}

/** Período carregado pra visão (fim EXCLUSIVO). */
export function intervaloVisao(ancora: Date, visao: Visao): { inicio: Date; fim: Date } {
  if (visao === "semana") {
    const dias = diasDaSemana(ancora);
    return { inicio: startOfDay(dias[0]), fim: addDays(startOfDay(dias[6]), 1) };
  }
  if (visao === "lista") return { inicio: startOfMonth(ancora), fim: addDays(startOfDay(endOfMonth(ancora)), 1) };
  const dias = diasDaGrade(ancora);
  return { inicio: dias[0], fim: addDays(dias[41], 1) };
}

export function tituloPeriodo(ancora: Date, visao: Visao): string {
  if (visao === "semana") {
    const d = diasDaSemana(ancora);
    const a = d[0];
    const b = d[6];
    if (a.getMonth() === b.getMonth()) return `${format(a, "d")} – ${format(b, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
    return `${format(a, "d 'de' MMM", { locale: ptBR })} – ${format(b, "d 'de' MMM 'de' yyyy", { locale: ptBR })}`;
  }
  const t = format(ancora, "MMMM 'de' yyyy", { locale: ptBR });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function moverAncora(ancora: Date, visao: Visao, passo: 1 | -1): Date {
  return visao === "semana" ? addWeeks(ancora, passo) : addMonths(ancora, passo);
}

/** "seg. 14/09" (cabeçalho das colunas, como a referência). */
// date-fns pt-BR: "EEE" devolve "segunda" e "EEEEEE" devolve "seg" (sem ponto).
export const nomeDoDiaCurto = (d: Date): string => `${format(d, "EEEEEE", { locale: ptBR }).replace(/\.$/, "")}. ${format(d, "dd/MM")}`;
export const nomeDoDiaLongo = (d: Date): string => {
  const t = format(d, "EEEE, d 'de' MMMM", { locale: ptBR });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const DIAS_SEMANA_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const ordemEvento = (a: EventoAgenda, b: EventoAgenda): number =>
  a.diaInteiro === b.diaInteiro ? a.inicio.getTime() - b.inicio.getTime() : a.diaInteiro ? -1 : 1;

/** Eventos que tocam o dia (inclui os que atravessam a meia-noite), dia inteiro primeiro. */
export function eventosDoDia(eventos: EventoAgenda[], dia: Date): EventoAgenda[] {
  const ini = startOfDay(dia);
  const fim = addDays(ini, 1);
  return eventos.filter((e) => e.inicio < fim && e.fim > ini).sort(ordemEvento);
}

/** Lista: só os dias com evento, em ordem. */
export function agruparPorDia(eventos: EventoAgenda[], dias: Date[]): { dia: Date; eventos: EventoAgenda[] }[] {
  return dias.map((dia) => ({ dia, eventos: eventosDoDia(eventos, dia) })).filter((g) => g.eventos.length > 0);
}

export function bloqueiosDoDia(bloqueios: BloqueioVisivel[], dia: Date): BloqueioVisivel[] {
  const ini = startOfDay(dia);
  const fim = addDays(ini, 1);
  return bloqueios.filter((b) => b.inicio < fim && b.fim > ini);
}

/** Rótulos das linhas de hora da visão semana: de `inicio` (arredondado pra baixo) até `fim` (exclusivo). */
export function horasDaFaixa(inicio: string, fim: string): string[] {
  const a = Math.floor(minutosDoDia(inicio) / 60);
  const b = Math.ceil(minutosDoDia(fim) / 60);
  const out: string[] = [];
  for (let h = a; h < b; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
}

/** Faixa visível = união das faixas dos calendários mostrados (ou a padrão). */
export function faixaVisivel(calendarios: { faixa_inicio: string; faixa_fim: string }[]): { inicio: string; fim: string } {
  if (!calendarios.length) return FAIXA_PADRAO;
  let a = Number.POSITIVE_INFINITY;
  let b = Number.NEGATIVE_INFINITY;
  for (const c of calendarios) {
    a = Math.min(a, minutosDoDia(c.faixa_inicio));
    b = Math.max(b, minutosDoDia(c.faixa_fim));
  }
  return b > a ? { inicio: minutosParaHora(a), fim: minutosParaHora(b) } : FAIXA_PADRAO;
}

/** Posição (em %) do evento dentro da coluna do dia, grampeado na faixa; null se fica fora dela. */
export function posicaoNoDia(
  ev: { inicio: Date; fim: Date },
  dia: Date,
  faixaInicio: string,
  faixaFim: string,
): { topo: number; altura: number } | null {
  const ini = startOfDay(dia);
  const fMin = Math.floor(minutosDoDia(faixaInicio) / 60) * 60;
  const fMax = Math.ceil(minutosDoDia(faixaFim) / 60) * 60;
  const total = fMax - fMin;
  if (total <= 0) return null;
  const a = Math.max(fMin, differenceInMinutes(ev.inicio, ini));
  const b = Math.min(fMax, differenceInMinutes(ev.fim, ini));
  if (b <= fMin || a >= fMax || b <= a) return null;
  return { topo: ((a - fMin) / total) * 100, altura: Math.max(((b - a) / total) * 100, 2.5) };
}

/** Eventos que se sobrepõem dividem a largura: cada um ganha `coluna` e o `total` de colunas do seu grupo. */
export function distribuirColunas<T extends { inicio: Date; fim: Date }>(eventos: T[]): { evento: T; coluna: number; total: number }[] {
  const ordenados = [...eventos].sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || b.fim.getTime() - a.fim.getTime());
  const resultado: { evento: T; coluna: number; total: number }[] = [];
  let grupo: { evento: T; coluna: number }[] = [];
  let fimDasColunas: number[] = [];
  let fimDoGrupo = Number.NEGATIVE_INFINITY;
  const fechar = () => {
    const total = Math.max(fimDasColunas.length, 1);
    for (const g of grupo) resultado.push({ evento: g.evento, coluna: g.coluna, total });
    grupo = [];
    fimDasColunas = [];
  };
  for (const ev of ordenados) {
    if (grupo.length && ev.inicio.getTime() >= fimDoGrupo) fechar();
    let coluna = fimDasColunas.findIndex((f) => f <= ev.inicio.getTime());
    if (coluna === -1) {
      coluna = fimDasColunas.length;
      fimDasColunas.push(ev.fim.getTime());
    } else {
      fimDasColunas[coluna] = ev.fim.getTime();
    }
    grupo.push({ evento: ev, coluna });
    fimDoGrupo = Math.max(fimDoGrupo, ev.fim.getTime());
  }
  if (grupo.length) fechar();
  return resultado;
}

/** "2026-09-19" + "10:00" → Date LOCAL. */
export function combinarDataHora(data: string, hora: string): Date {
  const [y, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0, 0, 0);
}
export const fimPorDuracao = (inicio: Date, minutos: number): Date => addMinutes(inicio, minutos);
export const duracaoMinutos = (inicio: Date, fim: Date): number => differenceInMinutes(fim, inicio);
export const sobrepoe = (aIni: Date, aFim: Date, bIni: Date, bFim: Date): boolean => aIni < bFim && bIni < aFim;

export function formatarFaixaHora(ev: { inicio: Date; fim: Date; diaInteiro: boolean }): string {
  return ev.diaInteiro ? "Dia inteiro" : `${formatarHora(ev.inicio)} – ${formatarHora(ev.fim)}`;
}

/** Quantos agendamentos (não desmarcados) tocam hoje — "Você tem N agendamentos hoje". */
export function contarHoje(eventos: EventoAgenda[], hoje = new Date()): number {
  return eventosDoDia(eventos, hoje).filter((e) => !statusCancelado(e.status)).length;
}

/** Conflito: outro evento do MESMO calendário, não desmarcado, no mesmo horário. */
export function conflitos(candidato: { inicio: Date; fim: Date; calendarioId: string; id?: string }, eventos: EventoAgenda[]): EventoAgenda[] {
  return eventos.filter(
    (e) => e.id !== candidato.id && e.calendarioId === candidato.calendarioId && !statusCancelado(e.status)
      && sobrepoe(candidato.inicio, candidato.fim, e.inicio, e.fim),
  );
}
/** Bloqueios que pegam o horário (do calendário ou de todos). */
export function bloqueiosEmConflito(candidato: { inicio: Date; fim: Date; calendarioId: string }, bloqueios: BloqueioVisivel[]): BloqueioVisivel[] {
  return bloqueios.filter(
    (b) => (b.calendarioId === null || b.calendarioId === candidato.calendarioId) && sobrepoe(candidato.inicio, candidato.fim, b.inicio, b.fim),
  );
}

// ---- Exportar (.ics, RFC 5545) ----
const escaparICS = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utcICS = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const dataICS = (d: Date): string => format(d, "yyyyMMdd");

export function gerarICS(eventos: EventoAgenda[], agora = new Date()): string {
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PhysiqNutri//Agenda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:PhysiqNutri"];
  for (const e of eventos) {
    linhas.push("BEGIN:VEVENT", `UID:${e.id}@physiqnutri`, `DTSTAMP:${utcICS(agora)}`);
    if (e.diaInteiro) linhas.push(`DTSTART;VALUE=DATE:${dataICS(e.inicio)}`, `DTEND;VALUE=DATE:${dataICS(e.fim)}`);
    else linhas.push(`DTSTART:${utcICS(e.inicio)}`, `DTEND:${utcICS(e.fim)}`);
    linhas.push(`SUMMARY:${escaparICS(e.titulo)}`);
    const descricao = [STATUS_AGENDAMENTO[e.status].rotulo, e.observacao ?? ""].filter(Boolean).join(" — ");
    if (descricao) linhas.push(`DESCRIPTION:${escaparICS(descricao)}`);
    linhas.push(`STATUS:${statusCancelado(e.status) ? "CANCELLED" : e.confirmacao === "confirmado" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return `${linhas.join("\r\n")}\r\n`;
}
export const nomeArquivoICS = (agora = new Date()): string => `agenda-physiqnutri-${format(agora, "yyyy-MM-dd")}.ics`;
