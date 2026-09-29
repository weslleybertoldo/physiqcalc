/**
 * Perfil do aluno (W7, spec 4.3 / tela 5) — regras puras (sem React nem supabase), testadas em regras.test.ts.
 * Card do aluno, "Meus profissionais" (WhatsApp — P24), agenda (N-53, porte do pacienteAppUtil do PhysiqNutri), o chip de
 * Pagamentos e os valores das linhas (lembrete, som, aparência).
 */
import { estadoDaMensalidade, chipDaMensalidade, diasEntre, hojeSP, dataBR, type TomChipFin } from "@/financeiro/regras";
import type { ResumoMatricula } from "@/financeiro/tipos";

// ───────────────────────── card do aluno ─────────────────────────

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const FUSO = "America/Sao_Paulo";

function partesSP(d: Date): { ano: number; mes: number; dia: number; semana: number; hora: string; minuto: string } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { ano: Number(v("year")), mes: Number(v("month")), dia: Number(v("day")), semana, hora: v("hour"), minuto: v("minute") };
}

/** "2026-03-14T…" → "mar/2026" (fuso de São Paulo). */
export function mesAno(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = partesSP(d);
  return `${MESES_CURTOS[p.mes - 1]}/${p.ano}`;
}

/** "Aluno desde mar/2026 · Objetivo: definição" (tela 5; NF8 — objetivo opcional). */
export function linhaDoAluno(alunoDesde: string | null | undefined, objetivo: string | null | undefined): string {
  const partes: string[] = [];
  const desde = mesAno(alunoDesde);
  if (desde) partes.push(`Aluno desde ${desde}`);
  const obj = (objetivo ?? "").trim();
  if (obj) partes.push(`Objetivo: ${obj.charAt(0).toLowerCase()}${obj.slice(1)}`);
  return partes.join(" · ");
}

// ───────────────────────── Meus profissionais ─────────────────────────

export type PapelProfissional = "personal" | "nutricionista";

export const ROTULO_PAPEL: Record<PapelProfissional, string> = { personal: "Personal trainer", nutricionista: "Nutricionista" };

/** "+5582999990000" → "https://wa.me/5582999990000" (P24: a conversa é no WhatsApp; sem número, sem botão). */
export function linkWhatsapp(e164: string | null | undefined): string | null {
  const d = String(e164 ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return null;
  return `https://wa.me/${d}`;
}

// ───────────────────────── agenda (N-53) ─────────────────────────

export interface AgendamentoAluno {
  id: string;
  paciente_id?: string;
  titulo: string | null;
  inicio: string;
  fim: string;
  dia_inteiro?: boolean | null;
  status: string;
  modulo?: string | null;
  profissional?: string | null;
  papel?: PapelProfissional | null;
}

export const ehCancelado = (status: string): boolean => status === "desmarcado" || status === "paciente_desmarcou";

/** As próximas N (ainda não terminaram e não foram desmarcadas), da mais perto para a mais longe (a regra do Nutri). */
export function proximosAgendamentos<T extends { inicio: string; fim: string; status: string }>(lista: T[], agora: Date = new Date(), n = 50): T[] {
  return lista
    .filter((a) => new Date(a.fim).getTime() >= agora.getTime() && !ehCancelado(a.status))
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
    .slice(0, n);
}

/** O que já passou (ou foi desmarcado), da mais recente para a mais antiga. */
export function agendamentosAnteriores<T extends { inicio: string; fim: string; status: string }>(lista: T[], agora: Date = new Date()): T[] {
  return lista
    .filter((a) => new Date(a.fim).getTime() < agora.getTime() || ehCancelado(a.status))
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());
}

/** O status na voz do aluno (no painel o mesmo status é "Paciente confirmou") — quem confirmou/desmarcou pelo papel. */
export function rotuloStatus(status: string, papel?: PapelProfissional | null): string {
  const quem = papel === "nutricionista" ? "pela nutricionista" : papel === "personal" ? "pelo personal" : "pelo profissional";
  switch (status) {
    case "agendado":
      return "Agendado";
    case "encaixe":
      return "Encaixe";
    case "confirmado":
      return `Confirmado ${quem}`;
    case "paciente_confirmou":
      return "Você confirmou";
    case "desmarcado":
      return `Desmarcado ${quem}`;
    case "paciente_desmarcou":
      return "Você desmarcou";
    case "nao_compareceu":
      return "Não compareceu";
    default:
      return status;
  }
}

/** "sáb, 18/07" (tela 5, a próxima consulta na linha da Agenda). */
export function diaCurto(iso: string): string {
  const p = partesSP(new Date(iso));
  return `${DIAS_CURTOS[p.semana]}, ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")}`;
}

/** "sáb, 18/07 · 14:30" (ou "sáb, 18/07 · dia inteiro"). */
export function quandoAgendamento(a: Pick<AgendamentoAluno, "inicio" | "dia_inteiro">): string {
  const p = partesSP(new Date(a.inicio));
  return `${diaCurto(a.inicio)} · ${a.dia_inteiro ? "dia inteiro" : `${p.hora}:${p.minuto}`}`;
}

/** "Hoje" · "Amanhã" · "Em 3 dias" (o card de próxima consulta). */
export function emQuantosDias(iso: string, agora: Date = new Date()): string {
  const alvo = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso));
  const d = diasEntre(hojeSP(agora), alvo);
  if (d <= 0) return "Hoje";
  if (d === 1) return "Amanhã";
  return `Em ${d} dias`;
}

/** Desde quando a agenda busca (as dos últimos 3 meses + todas as próximas — N-53). */
export function inicioDaAgenda(agora: Date = new Date()): Date {
  return new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
}

// ───────────────────────── Pagamentos (chip da linha) ─────────────────────────

/**
 * Chip da linha Pagamentos (tela 5: "Vence em 3 dias" âmbar): cobrança avulsa vencida primeiro, depois a mensalidade mais
 * urgente (a mesma regra da faixa do Início); nada a cobrar → null (a linha fica só com a seta).
 */
export function chipDePagamentos(lista: ResumoMatricula[] | null | undefined, agora: Date = new Date()): { texto: string; tom: TomChipFin } | null {
  if (!lista?.length) return null;
  const hoje = hojeSP(agora);
  let avulsa: { dias: number } | null = null;
  for (const r of lista) {
    for (const c of r.abertas ?? []) {
      const dias = diasEntre(hoje, c.vencimento);
      if (!avulsa || dias < avulsa.dias) avulsa = { dias };
    }
  }
  if (avulsa && avulsa.dias < 0) return { texto: "Cobrança vencida", tom: "r" };
  const ordem: Record<string, number> = { vencida: 0, pendente: 1, vence_em_breve: 2, aguardando: 3, em_dia: 4, pausada: 5, sem: 6 };
  const estados = lista
    .map((r) => estadoDaMensalidade({ valor: r.mensalidade_valor, pausada: r.pausada, pago_ate: r.pago_ate, desde: r.desde, aguardando: r.aguardando }, agora))
    .sort((a, b) => (ordem[a.situacao] ?? 9) - (ordem[b.situacao] ?? 9) || (a.dias ?? 0) - (b.dias ?? 0));
  const e = estados[0];
  if (avulsa && avulsa.dias <= 7 && (!e || ordem[e.situacao] >= ordem.vence_em_breve)) {
    return { texto: avulsa.dias === 0 ? "Vence hoje" : avulsa.dias === 1 ? "Vence amanhã" : `Vence em ${avulsa.dias} dias`, tom: "a" };
  }
  if (!e || e.situacao === "sem") return null;
  return chipDaMensalidade(e);
}

// ───────────────────────── valores das linhas ─────────────────────────

export interface LembreteTreino {
  hour: number;
  minute: number;
  enabled: boolean;
}

/** "18:30" (ligado) · "Desligado". */
export function valorDoLembrete(l: LembreteTreino): string {
  if (!l.enabled) return "Desligado";
  return `${String(l.hour).padStart(2, "0")}:${String(l.minute).padStart(2, "0")}`;
}

/** "18:30" → { hour: 18, minute: 30 } (null se inválido). */
export function lerHora(texto: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export { dataBR };
