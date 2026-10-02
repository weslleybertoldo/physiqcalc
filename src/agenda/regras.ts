/**
 * Physiq W20 — regras PURAS da agenda (sem React e sem supabase), divididas pelo Painel › Agenda e pela Perfil › Agenda do app;
 * cobertas pelo Vitest (regras.test.ts). O que decide o que o aluno pode fazer é o BANCO (agenda_slots, as funções aluno_agenda_*):
 * aqui ficam os padrões, os textos que explicam a regra ao aluno, o tipo do agendamento (NF12), os 7 status no visual premium,
 * "Consultas por semana" (N-9) e o .ics (N-66).
 *
 * Pedido dele (01/10 ~06:25): slots com duração definida pelo profissional (padrão e por agenda), horário e dias de atendimento,
 * travas recorrentes e avulsas, N slots pelo profissional e 1 pelo aluno, quantas vezes o aluno reagenda (padrão 1), a janela do
 * reagendamento (só no mês da consulta · até o fim do mês seguinte · sem trava), desistência e pacote de consultas (1 por mês), com
 * a mensagem clara ao reagendar ("Você só pode reagendar 1 vez neste mês. Se não puder comparecer na nova data, você não terá
 * outra consulta neste mês.").
 */
import { duracaoTexto, quandoConsulta } from "../../supabase-principal/functions/_shared/agenda-regras";

export { duracaoTexto, quandoConsulta };

// ───────────────────────── regras do profissional ─────────────────────────

export type Janela = "mes" | "mes_seguinte" | "livre";

export interface RegrasAgenda {
  slot_minutos: number;
  /** "08:00" */
  atende_inicio: string;
  atende_fim: string;
  /** dias de atendimento, 0 = domingo … 6 = sábado */
  dias: number[];
  reagendamentos_max: number;
  janela_reagendamento: Janela;
  desistencia: boolean;
  configurada?: boolean;
}

export const REGRAS_PADRAO: RegrasAgenda = {
  slot_minutos: 30,
  atende_inicio: "08:00",
  atende_fim: "18:00",
  dias: [0, 1, 2, 3, 4, 5, 6],
  reagendamentos_max: 1,
  janela_reagendamento: "mes",
  desistencia: true,
  configurada: false,
};

export const JANELAS: { valor: Janela; rotulo: string; explica: string }[] = [
  { valor: "mes", rotulo: "Só no mês da consulta", explica: "O aluno escolhe outro dia do mesmo mês da consulta." },
  { valor: "mes_seguinte", rotulo: "Até o fim do mês seguinte", explica: "No mês da consulta ou no seguinte (não são 60 dias: vale até o último dia do mês seguinte)." },
  { valor: "livre", rotulo: "Sem trava", explica: "O aluno escolhe qualquer dia, em qualquer mês." },
];

export const DURACOES_SLOT = [10, 15, 20, 30, 40, 45, 50, 60, 90, 120] as const;
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;
export const DIAS_LETRA = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

const ehJanela = (v: unknown): v is Janela => v === "mes" || v === "mes_seguinte" || v === "livre";
const hora = (v: unknown, padrao: string): string => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d/.test(v) ? v.slice(0, 5) : padrao);

/** O que veio do banco (agenda_regras_de / agenda_config) → regras com os padrões no que faltar. */
export function normalizarRegras(v: unknown): RegrasAgenda {
  const r = (v ?? {}) as Record<string, unknown>;
  const slot = Number(r.slot_minutos);
  const max = Number(r.reagendamentos_max);
  const dias = Array.isArray(r.dias) ? [...new Set(r.dias.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b) : REGRAS_PADRAO.dias;
  return {
    slot_minutos: Number.isInteger(slot) && slot >= 5 && slot <= 240 ? slot : REGRAS_PADRAO.slot_minutos,
    atende_inicio: hora(r.atende_inicio, REGRAS_PADRAO.atende_inicio),
    atende_fim: hora(r.atende_fim, REGRAS_PADRAO.atende_fim),
    dias,
    reagendamentos_max: Number.isInteger(max) && max >= 0 && max <= 10 ? max : REGRAS_PADRAO.reagendamentos_max,
    janela_reagendamento: ehJanela(r.janela_reagendamento) ? r.janela_reagendamento : REGRAS_PADRAO.janela_reagendamento,
    desistencia: typeof r.desistencia === "boolean" ? r.desistencia : REGRAS_PADRAO.desistencia,
    configurada: r.configurada === true,
  };
}

export function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
export const hhmmDe = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Os inícios dos slots de um dia de atendimento ("08:00", "08:30", …) — a mesma conta do banco (agenda_slots). */
export function iniciosDoDia(regras: Pick<RegrasAgenda, "atende_inicio" | "atende_fim" | "slot_minutos">, slot = regras.slot_minutos, duracao = slot): string[] {
  const ini = minutosDe(regras.atende_inicio);
  const fim = minutosDe(regras.atende_fim);
  const out: string[] = [];
  if (slot < 5 || duracao < 5) return out;
  for (let m = ini; m + duracao <= fim; m += slot) out.push(hhmmDe(m));
  return out;
}

/** "20 slots de 30 min por dia" (o resumo das regras). */
export function textoSlotsPorDia(regras: RegrasAgenda, slot = regras.slot_minutos): string {
  const n = iniciosDoDia(regras, slot).length;
  return `${n} ${n === 1 ? "slot" : "slots"} de ${slot} min por dia`;
}

/** "seg–sex" · "todos os dias" · "seg, qua, sex" · "nenhum dia". */
export function textoDias(dias: readonly number[]): string {
  const d = [...new Set(dias)].sort((a, b) => a - b);
  if (d.length === 7) return "todos os dias";
  if (d.length === 0) return "nenhum dia";
  const seguidos = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  if (seguidos && d.length >= 3) return `${DIAS_CURTOS[d[0]]}–${DIAS_CURTOS[d[d.length - 1]]}`;
  return d.map((x) => DIAS_CURTOS[x]).join(", ");
}

/** O resumo das regras no painel lateral: "Slots de 30 min · 08:00–18:00 · todos os dias". */
export function resumoDasRegras(regras: RegrasAgenda): string {
  return `Slots de ${regras.slot_minutos} min · ${regras.atende_inicio}–${regras.atende_fim} · ${textoDias(regras.dias)}`;
}

// ───────────────────────── datas (São Paulo) ─────────────────────────

const FUSO = "America/Sao_Paulo";
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"] as const;
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** "2026-10-01" do instante em São Paulo. */
export function diaSP(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(x);
}
export const hojeSP = (agora: Date = new Date()): string => diaSP(agora);
/** "2026-10" → o 1º dia do mês ("2026-10-01"). */
export const mesDe = (dia: string): string => `${dia.slice(0, 7)}-01`;
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
export function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
}
export const nomeDoMes = (mes: string): string => MESES[Number(mes.slice(5, 7)) - 1] ?? "";
/** "31/10" */
export const diaMes = (dia: string): string => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

/** O prazo em que o aluno escolhe a data: `ate` null = sem fim ("Sem trava", H5 — qualquer mês). */
export interface JanelaDatas {
  de: string;
  ate: string | null;
}

/**
 * A janela do reagendamento (a mesma do banco, w20_janela): nunca antes de hoje nem do mês da consulta, exceto "sem trava".
 * H5 (N-11, regra dele de 01/10: "sem trava o usuário poderá marcar em qualquer mês"): "sem trava" não tem mais fim (era hoje + 180).
 */
export function janelaDoReagendamento(janela: Janela, mesRef: string, hoje: string): JanelaDatas {
  const mes = mesDe(mesRef);
  if (janela === "livre") return { de: hoje, ate: null };
  const de = hoje > mes ? hoje : mes;
  return { de, ate: janela === "mes_seguinte" ? ultimoDiaDoMes(somarMeses(mes, 1)) : ultimoDiaDoMes(mes) };
}

/** Quantos dias o banco devolve por pedido (aluno_agenda_horarios: de + 62 — o motor de slots trabalha em até 63 dias). */
export const DIAS_POR_PEDIDO = 62;

function diasEntre(de: string, ate: string): number {
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/**
 * O app mostra a janela MÊS A MÊS quando ela não cabe num pedido só: "sem trava" (sem fim) ou um pacote de vários meses. As
 * janelas "só no mês" e "até o fim do mês seguinte" cabem inteiras e continuam numa lista só.
 */
export function janelaPorMes(j: JanelaDatas | null | undefined): boolean {
  if (!j?.de) return false;
  return j.ate === null || diasEntre(j.de, j.ate) > DIAS_POR_PEDIDO;
}

/** Os dias que o app pede para um mês ("2026-11-01"): o mês inteiro, cortado pela janela. */
export function intervaloDoMes(mes: string, j: JanelaDatas): { de: string; ate: string } {
  const ini = mesDe(mes);
  const fim = ultimoDiaDoMes(ini);
  return { de: j.de > ini ? j.de : ini, ate: j.ate !== null && j.ate < fim ? j.ate : fim };
}

/** As setas ‹ › do mês: até o mês da janela de um lado e, sem fim, para sempre do outro. */
export function navegacaoDoMes(mes: string, j: JanelaDatas): { anterior: string | null; proximo: string | null } {
  const atual = mesDe(mes);
  const primeiro = mesDe(j.de);
  const ultimo = j.ate === null ? null : mesDe(j.ate);
  return {
    anterior: atual > primeiro ? somarMeses(atual, -1) : null,
    proximo: ultimo === null || atual < ultimo ? somarMeses(atual, 1) : null,
  };
}

/** "outubro de 2026" */
export const mesPorExtenso = (mes: string): string => `${nomeDoMes(mesDe(mes))} de ${mes.slice(0, 4)}`;

// ───────────────────────── pacote de consultas ─────────────────────────

/** desmarcada = o PROFISSIONAL desmarcou e o mês acabou sem consulta: não conta, o crédito continua (W20c, decisão dele 01/10). */
export type EstadoMesPacote = "feita" | "faltou" | "desistiu" | "sem_consulta" | "desmarcada" | "agendada" | "livre";

export interface MesPacote {
  mes: string;
  estado: EstadoMesPacote;
}

export interface PacoteSituacao {
  id: string;
  paciente_id: string;
  profissional_id: string;
  profissional?: string | null;
  total: number;
  mes_inicio: string;
  mes_fim: string;
  usados: number;
  restam: number;
  livres: number;
  /** meses desmarcados pelo profissional (não contam; o pacote anda 1 mês para cada um) */
  devolvidos?: number;
  meses: MesPacote[];
}

export const ROTULO_MES_PACOTE: Record<EstadoMesPacote, string> = {
  feita: "feita",
  faltou: "faltou",
  desistiu: "desistiu",
  sem_consulta: "sem consulta",
  desmarcada: "profissional desmarcou · não conta",
  agendada: "agendada",
  livre: "livre",
};

export const mesUsado = (e: EstadoMesPacote): boolean => e === "feita" || e === "faltou" || e === "desistiu" || e === "sem_consulta";

/** "Restam 5 de 6 consultas" · "Nenhuma consulta restante de 6". */
export function textoPacote(p: Pick<PacoteSituacao, "restam" | "total">): string {
  if (p.restam <= 0) return `Nenhuma consulta restante de ${p.total}`;
  return `Restam ${p.restam} de ${p.total} ${p.total === 1 ? "consulta" : "consultas"}`;
}

/** "out/2026 a mar/2027 · 1 por mês". */
export function periodoDoPacote(p: Pick<PacoteSituacao, "mes_inicio" | "mes_fim">): string {
  const r = (m: string) => `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`;
  return `${r(p.mes_inicio)} a ${r(p.mes_fim)} · 1 por mês`;
}

export function estadoDoMes(p: Pick<PacoteSituacao, "meses"> | null | undefined, mes: string): EstadoMesPacote | null {
  return p?.meses.find((m) => m.mes === mesDe(mes))?.estado ?? null;
}

// ───────────────────────── mensagens claras ao aluno (reagendar e desistir) ─────────────────────────

export interface ContextoConsulta {
  regras: RegrasAgenda;
  /** quantas vezes o aluno já reagendou esta consulta */
  reagendamentos: number;
  /** o mês da consulta (mes_referencia) */
  mesRef: string;
  hoje: string;
  /** o início da consulta (ISO) */
  inicio: string;
  profissional?: string | null;
  pacote?: Pick<PacoteSituacao, "restam" | "total" | "meses"> | null;
  /** outras consultas vivas do aluno com o mesmo profissional no mesmo mês (aí o mês do pacote não se perde) */
  outrasNoMes?: number;
}

export interface MensagemAluno {
  pode: boolean;
  titulo: string;
  texto: string;
}

const vezes = (n: number): string => (n === 1 ? "1 vez" : `${n} vezes`);

/**
 * A mensagem do "Reagendar", montada pelas regras (nº que resta + janela + pacote) — o estilo do pedido dele:
 * "Você só pode reagendar 1 vez neste mês. Se não puder comparecer na nova data, você não terá outra consulta neste mês."
 */
export function mensagemReagendar(c: ContextoConsulta): MensagemAluno {
  const { regras } = c;
  const quem = c.profissional?.trim() || "seu profissional";
  const resta = Math.max(regras.reagendamentos_max - c.reagendamentos, 0);
  const mes = mesDe(c.mesRef);
  const nome = nomeDoMes(mes);
  const jan = janelaDoReagendamento(regras.janela_reagendamento, mes, c.hoje);
  if (regras.reagendamentos_max <= 0) {
    return { pode: false, titulo: "Reagendar não está liberado", texto: `Esta agenda não aceita reagendamento pelo app. Para mudar a data, fale com ${quem}.` };
  }
  if (resta <= 0) {
    const ja = regras.reagendamentos_max === 1 ? "o seu reagendamento" : `os ${regras.reagendamentos_max} reagendamentos`;
    return { pode: false, titulo: "Você já reagendou esta consulta", texto: `Você já usou ${ja} desta consulta. Para mudar a data de novo, fale com ${quem}.` };
  }
  if (jan.ate !== null && jan.ate < jan.de) {
    return { pode: false, titulo: "O prazo para reagendar acabou", texto: `A consulta de ${nome} só pode ser reagendada dentro de ${nome}, e o mês já acabou. Fale com ${quem}.` };
  }
  const ultima = resta === 1;
  let onde: string;
  let perde: string;
  if (regras.janela_reagendamento === "mes") {
    onde = `neste mês (até ${diaMes(jan.ate ?? jan.de)})`;
    perde = `você não terá outra consulta em ${nome}`;
  } else if (regras.janela_reagendamento === "mes_seguinte") {
    onde = `para uma data até ${diaMes(jan.ate ?? jan.de)} (${nome} ou o mês seguinte)`;
    perde = `você perde a consulta de ${nome}`;
  } else {
    onde = "para qualquer data";
    perde = "você perde esta consulta";
  }
  const primeira = ultima ? `Você só pode reagendar 1 vez ${onde}.` : `Você pode reagendar ${vezes(resta)} ${onde}.`;
  const consequencia = ultima
    ? `Se não puder comparecer na nova data, ${perde}.`
    : `Depois do último reagendamento, se não puder comparecer, ${perde}.`;
  // o pacote entra na mensagem só quando a consulta é de um mês dele
  const pacote = c.pacote && estadoDoMes(c.pacote, mes) ? c.pacote : null;
  const doPacote = pacote ? ` Seu pacote: ${textoPacote(pacote).toLowerCase()}; faltando, a de ${nome} conta como usada.` : "";
  return { pode: true, titulo: "Reagendar consulta", texto: `${primeira} ${consequencia}${doPacote}` };
}

/** A mensagem da desistência: o que o aluno perde (pacote e mês) — com a confirmação antes. */
export function mensagemDesistir(c: ContextoConsulta): MensagemAluno {
  const quem = c.profissional?.trim() || "seu profissional";
  if (!c.regras.desistencia) {
    return { pode: false, titulo: "Desistir não está liberado", texto: `Para desmarcar esta consulta, fale com ${quem}.` };
  }
  const mesRef = mesDe(c.mesRef);
  const mes = nomeDoMes(mesRef);
  const quando = quandoConsulta(c.inicio);
  const estado = c.pacote ? estadoDoMes(c.pacote, mesRef) : null;
  const pacote = c.pacote && estado ? c.pacote : null;
  const partes = [`Você vai desistir da consulta de ${quando} com ${quem}.`];
  if (pacote && (c.outrasNoMes ?? 0) > 0) {
    partes.push(`Você ainda tem outra consulta em ${mes} com ${quem}: o seu pacote não muda.`);
  } else if (pacote) {
    // o mês que já contou (ex.: uma 2ª consulta no mesmo mês) não conta de novo
    const ficam = Math.max(estado && mesUsado(estado) ? pacote.restam : pacote.restam - 1, 0);
    partes.push(`A consulta de ${mes} conta como usada: ficam ${ficam} de ${pacote.total} no seu pacote, e ela não volta.`);
  } else if (c.regras.janela_reagendamento === "mes") {
    partes.push(`Você não terá outra consulta em ${mes}, a não ser que ${quem} marque uma nova.`);
  } else {
    partes.push(`Ela sai da sua agenda e ${quem} é avisado. Para marcar de novo, fale com ${quem}.`);
  }
  partes.push("Isso não pode ser desfeito.");
  return { pode: true, titulo: "Desistir da consulta?", texto: partes.join(" ") };
}

// ───────────────────────── tipo do agendamento (NF12) ─────────────────────────

export type TipoAgendamento = "treino" | "nutricao" | "geral";

export const TIPOS: { valor: TipoAgendamento; rotulo: string; chip: string; tom: "t" | "n" | "g" }[] = [
  { valor: "treino", rotulo: "Treino", chip: "TREINO", tom: "t" },
  { valor: "nutricao", rotulo: "Nutrição", chip: "NUTRI", tom: "n" },
  { valor: "geral", rotulo: "Geral", chip: "GERAL", tom: "g" },
];
export const ehTipo = (v: unknown): v is TipoAgendamento => v === "treino" || v === "nutricao" || v === "geral";
export const tipoDe = (v: unknown): TipoAgendamento => (ehTipo(v) ? v : "nutricao");
export const infoTipo = (v: unknown) => TIPOS.find((t) => t.valor === tipoDe(v))!;

/**
 * O tipo pelo papel de quem agenda (NF12): o personal marca TREINO, a nutricionista NUTRIÇÃO; quem tem os dois papéis segue a
 * relação com o aluno (é o personal dele → treino; a nutri dele → nutrição); sem aluno ou sem como saber → GERAL. A conta com um
 * módulo só fica nele.
 */
export function tipoPadrao(
  papeis: readonly string[],
  autorId: string | null | undefined,
  aluno?: { personal_id?: string | null; nutricionista_id?: string | null } | null,
  modulosConta?: readonly string[] | null,
): TipoAgendamento {
  const mods = modulosConta ?? [];
  if (mods.length === 1) return mods[0] === "treino" ? "treino" : "nutricao";
  const personal = papeis.includes("personal");
  const nutri = papeis.includes("nutricionista");
  if (personal && !nutri) return "treino";
  if (nutri && !personal) return "nutricao";
  if (aluno && autorId) {
    const ehPersonal = aluno.personal_id === autorId;
    const ehNutri = aluno.nutricionista_id === autorId;
    if (ehPersonal && !ehNutri) return "treino";
    if (ehNutri && !ehPersonal) return "nutricao";
  }
  return "geral";
}

/** Sugestão de título pelo tipo (o profissional muda à vontade). */
export function tituloPadrao(tipo: TipoAgendamento): string {
  return tipo === "treino" ? "Consulta de treino" : tipo === "nutricao" ? "Consulta de nutrição" : "Consulta";
}

export const SUGESTOES_TITULO: Record<TipoAgendamento, string[]> = {
  treino: ["Avaliação física", "Troca de treino", "Retorno", "Primeira consulta"],
  nutricao: ["Primeira consulta", "Retorno", "Consulta de nutrição", "Avaliação"],
  geral: ["Primeira consulta", "Retorno", "Consulta"],
};

// ───────────────────────── os 7 status + confirmação no visual premium ─────────────────────────

export type StatusAgenda = "agendado" | "encaixe" | "confirmado" | "paciente_confirmou" | "desmarcado" | "paciente_desmarcou" | "nao_compareceu";
export type ConfirmacaoAgenda = "a_confirmar" | "confirmado" | "desmarcado";

/** fundo (status) e borda esquerda (confirmação) — a mesma legenda do site antigo, nas cores do Physiq. */
export const ESTILO_STATUS: Record<StatusAgenda, { rotulo: string; aluno: string; fundo: string; texto: string; ponto: string }> = {
  agendado: { rotulo: "Agendado", aluno: "Aguardando o aluno", fundo: "bg-[rgba(34,211,238,.13)]", texto: "text-ciano-3", ponto: "bg-ciano" },
  encaixe: { rotulo: "Encaixe", aluno: "Aguardando o aluno", fundo: "bg-[rgba(139,92,246,.16)]", texto: "text-violeta-3", ponto: "bg-violeta-2" },
  confirmado: { rotulo: "Confirmado por você", aluno: "Confirmado por você", fundo: "bg-[rgba(16,185,129,.14)]", texto: "text-verde-3", ponto: "bg-verde-2" },
  paciente_confirmou: { rotulo: "Aluno confirmou", aluno: "Aluno confirmou", fundo: "bg-[rgba(132,204,22,.15)]", texto: "text-[#BEF264]", ponto: "bg-[#A3E635]" },
  desmarcado: { rotulo: "Desmarcado por você", aluno: "Desmarcado por você", fundo: "bg-[rgba(244,63,94,.12)]", texto: "text-rosa-3 line-through", ponto: "bg-rosa" },
  paciente_desmarcou: { rotulo: "Aluno desistiu", aluno: "Aluno desistiu", fundo: "bg-[rgba(245,158,11,.13)]", texto: "text-ambar-3 line-through", ponto: "bg-ambar-2" },
  nao_compareceu: { rotulo: "Não compareceu", aluno: "Não compareceu", fundo: "bg-superficie-2", texto: "text-texto-3", ponto: "bg-texto-4" },
};
export const STATUS_ORDEM: StatusAgenda[] = ["agendado", "encaixe", "confirmado", "paciente_confirmou", "desmarcado", "paciente_desmarcou", "nao_compareceu"];
export const ehStatus = (v: unknown): v is StatusAgenda => typeof v === "string" && Object.prototype.hasOwnProperty.call(ESTILO_STATUS, v);
export const statusDe = (v: unknown): StatusAgenda => (ehStatus(v) ? v : "agendado");

export const ESTILO_CONFIRMACAO: Record<ConfirmacaoAgenda, { rotulo: string; borda: string; cor: string }> = {
  a_confirmar: { rotulo: "A confirmar", borda: "border-l-ambar-2", cor: "var(--p-ambar-2)" },
  confirmado: { rotulo: "Confirmado", borda: "border-l-verde-2", cor: "var(--p-verde-2)" },
  desmarcado: { rotulo: "Desmarcado", borda: "border-l-rosa", cor: "var(--p-rosa)" },
};
export const CONFIRMACAO_ORDEM: ConfirmacaoAgenda[] = ["a_confirmar", "confirmado", "desmarcado"];

export function confirmacaoDe(s: StatusAgenda): ConfirmacaoAgenda {
  if (s === "confirmado" || s === "paciente_confirmou") return "confirmado";
  if (s === "desmarcado" || s === "paciente_desmarcou") return "desmarcado";
  return "a_confirmar";
}
export const cancelado = (s: string): boolean => s === "desmarcado" || s === "paciente_desmarcou";
/** Esperando o ALUNO confirmar (marcada pelo profissional, ainda sem resposta). */
export const aguardandoAluno = (s: string): boolean => s === "agendado" || s === "encaixe";

// ───────────────────────── "Consultas por semana" (N-9) e os números do topo ─────────────────────────

export interface ConsultaResumo {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  confirmacao?: string | null;
  modulo?: string | null;
  paciente_id?: string | null;
  dia_inteiro?: boolean | null;
}

export const confirmada = (a: Pick<ConsultaResumo, "status" | "confirmacao">): boolean =>
  a.status === "confirmado" || a.status === "paciente_confirmou" || a.confirmacao === "confirmado";

/** segunda-feira da semana do dia ("YYYY-MM-DD") */
export function inicioDaSemana(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return somarDias(dia, -((dow + 6) % 7));
}
/** "21–27/09" (mesmo mês) ou "28/09–04/10" */
export function rotuloSemana(segunda: string): string {
  const dom = somarDias(segunda, 6);
  return segunda.slice(5, 7) === dom.slice(5, 7) ? `${segunda.slice(8, 10)}–${diaMes(dom)}` : `${diaMes(segunda)}–${diaMes(dom)}`;
}

export interface PontoSemana {
  chave: string;
  rotulo: string;
  agendadas: number;
  confirmadas: number;
}

/** As últimas N semanas (a atual por último): agendadas = não desmarcadas; confirmadas = confirmadas pelo profissional ou pelo aluno. */
export function consultasPorSemana(ags: readonly ConsultaResumo[], hoje: string, n = 8): PontoSemana[] {
  const atual = inicioDaSemana(hoje);
  const pontos: PontoSemana[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const ini = somarDias(atual, -7 * i);
    pontos.push({ chave: ini, rotulo: rotuloSemana(ini), agendadas: 0, confirmadas: 0 });
  }
  const porChave = new Map(pontos.map((p) => [p.chave, p]));
  for (const a of ags) {
    if (cancelado(a.status) || a.dia_inteiro) continue;
    const p = porChave.get(inicioDaSemana(diaSP(a.inicio)));
    if (!p) continue;
    p.agendadas += 1;
    if (confirmada(a)) p.confirmadas += 1;
  }
  return pontos;
}

export interface NumerosAgenda {
  hoje: number;
  hojeTreino: number;
  hojeNutricao: number;
  hojeGeral: number;
  semana: number;
  semanaConfirmadas: number;
  aConfirmar: number;
  /** % de confirmação das consultas das últimas 8 semanas (null = nenhuma) */
  taxaConfirmacao: number | null;
  porDia: number[];
}

/** Os 4 cartões do topo (padrão da tela 6: "Consultas hoje · 3 de treino · 4 de nutrição"). */
export function numerosDaAgenda(ags: readonly ConsultaResumo[], hoje: string, agora: Date = new Date()): NumerosAgenda {
  const vivas = ags.filter((a) => !cancelado(a.status) && !a.dia_inteiro);
  const doDia = vivas.filter((a) => diaSP(a.inicio) === hoje);
  const segunda = inicioDaSemana(hoje);
  const domingo = somarDias(segunda, 6);
  const daSemana = vivas.filter((a) => {
    const d = diaSP(a.inicio);
    return d >= segunda && d <= domingo;
  });
  const oitoSemanas = somarDias(segunda, -49);
  const janela = vivas.filter((a) => {
    const d = diaSP(a.inicio);
    return d >= oitoSemanas && d <= domingo;
  });
  const porDia = Array.from({ length: 14 }, (_, i) => {
    const d = somarDias(hoje, i - 13);
    return vivas.filter((a) => diaSP(a.inicio) === d).length;
  });
  return {
    hoje: doDia.length,
    hojeTreino: doDia.filter((a) => a.modulo === "treino").length,
    hojeNutricao: doDia.filter((a) => (a.modulo ?? "nutricao") === "nutricao").length,
    hojeGeral: doDia.filter((a) => a.modulo === "geral").length,
    semana: daSemana.length,
    semanaConfirmadas: daSemana.filter(confirmada).length,
    aConfirmar: vivas.filter((a) => a.paciente_id && aguardandoAluno(a.status) && new Date(a.fim).getTime() > agora.getTime()).length,
    taxaConfirmacao: janela.length ? Math.round((janela.filter(confirmada).length / janela.length) * 100) : null,
    porDia,
  };
}

/** "2 de treino · 1 de nutrição" (o que houver). */
export function textoHojePorTipo(n: Pick<NumerosAgenda, "hojeTreino" | "hojeNutricao" | "hojeGeral">): string {
  const partes: string[] = [];
  if (n.hojeTreino) partes.push(`${n.hojeTreino} de treino`);
  if (n.hojeNutricao) partes.push(`${n.hojeNutricao} de nutrição`);
  if (n.hojeGeral) partes.push(`${n.hojeGeral} ${n.hojeGeral === 1 ? "geral" : "gerais"}`);
  return partes.join(" · ") || "nenhuma hoje";
}

// ───────────────────────── travas recorrentes (o desenho na visão semana) ─────────────────────────

export interface TravaRecorrente {
  id: string;
  profissional_id: string;
  calendario_id: string | null;
  dias: number[];
  hora_inicio: string;
  hora_fim: string;
  motivo: string | null;
}

/** As travas que valem num dia da semana (0–6) de um calendário (null = de todos). */
export function travasDoDia(travas: readonly TravaRecorrente[], dow: number, calendarioId?: string | null): TravaRecorrente[] {
  return travas.filter((t) => t.dias.includes(dow) && (!calendarioId || t.calendario_id === null || t.calendario_id === calendarioId));
}

/** "13:00–14:00 · todos os dias" */
export function textoTrava(t: Pick<TravaRecorrente, "hora_inicio" | "hora_fim" | "dias">): string {
  return `${t.hora_inicio.slice(0, 5)}–${t.hora_fim.slice(0, 5)} · ${textoDias(t.dias)}`;
}

// ───────────────────────── exportar (.ics, RFC 5545) ─────────────────────────

export interface EventoICS {
  id: string;
  titulo: string;
  inicio: Date;
  fim: Date;
  diaInteiro: boolean;
  status: StatusAgenda;
  observacao?: string | null;
  modulo?: string | null;
  aluno?: string | null;
}

const escaparICS = (s: string): string => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utcICS = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const dataICS = (d: Date): string => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/**
 * O .ics da agenda (N-66). O UID continua `<id>@physiqnutri` (o mesmo do site antigo, que usa as MESMAS consultas): quem já
 * importou o arquivo de lá e importa este no Google Agenda atualiza o evento em vez de duplicar.
 */
export function gerarICS(eventos: readonly EventoICS[], agora = new Date()): string {
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Physiq//Agenda//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Physiq"];
  for (const e of eventos) {
    linhas.push("BEGIN:VEVENT", `UID:${e.id}@physiqnutri`, `DTSTAMP:${utcICS(agora)}`);
    if (e.diaInteiro) linhas.push(`DTSTART;VALUE=DATE:${dataICS(e.inicio)}`, `DTEND;VALUE=DATE:${dataICS(e.fim)}`);
    else linhas.push(`DTSTART:${utcICS(e.inicio)}`, `DTEND:${utcICS(e.fim)}`);
    const titulo = e.aluno && !e.titulo.includes(e.aluno) ? `${e.titulo} · ${e.aluno}` : e.titulo;
    linhas.push(`SUMMARY:${escaparICS(titulo)}`);
    const descricao = [e.modulo ? infoTipo(e.modulo).rotulo : "", ESTILO_STATUS[e.status].rotulo, e.observacao ?? ""].filter(Boolean).join(" — ");
    if (descricao) linhas.push(`DESCRIPTION:${escaparICS(descricao)}`);
    linhas.push(`STATUS:${cancelado(e.status) ? "CANCELLED" : confirmacaoDe(e.status) === "confirmado" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return `${linhas.join("\r\n")}\r\n`;
}
export const nomeArquivoICS = (agora = new Date()): string => `agenda-physiq-${diaSP(agora)}.ics`;
