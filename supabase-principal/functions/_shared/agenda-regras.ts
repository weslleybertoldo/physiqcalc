// Physiq W20 — regras PURAS do e-mail "consulta marcada" (função agenda-avisar). Sem Deno e sem rede: usadas pela função e
// testadas no Vitest (src/agenda/emailAgenda.test.ts). O destino segue a W17: staging → SEMPRE a caixa de teste do Resend;
// produção → conta de teste (physiq*.app) também vai para a caixa de teste, pessoa real recebe no próprio e-mail.
// H3 (01/10): o e-mail no molde C (email-modelo.ts) — um bloco com o calendário por consulta, data por extenso, assunto
// "Confirme sua consulta de quinta, 1/10, 13:30", "Confirmar presença" só se a consulta ainda espera o aluno e "Reagendar" só
// quando a regra do profissional deixa (a MESMA conta do app: mensagemReagendar em src/agenda/regras.ts — o teste compara).
import { siteDoConvite, type Schema } from "./convites-regras.ts";
import { primeiroNomeDe } from "./enviar-aluno-regras.ts";
import { iniciaisDe, montarEmail, textoDaReserva, type BotaoEmail, type EmailModelo, type IconeEmail, type LinhaEmail } from "./email-modelo.ts";

export { destinoDoEnvio as destinoDoEmailAgenda } from "./enviar-aluno-regras.ts";

export interface ConsultaEmail {
  id?: string | null;
  inicio: string;
  fim: string;
  titulo?: string | null;
  modulo?: string | null;
  /** agendado · encaixe (esperando o aluno) · confirmado (o profissional já confirmou); sem status = esperando o aluno */
  status?: string | null;
  /** quantas vezes o aluno já reagendou esta consulta */
  reagendamentos?: number | null;
  /** o mês da consulta para a janela do reagendamento ("2026-10-01"); vazio = o mês do início */
  mes_referencia?: string | null;
}

/** As regras do profissional que decidem o "Reagendar" (agenda_regras_de no banco). */
export interface RegrasDoReagendamento {
  reagendamentos_max: number;
  janela_reagendamento: "mes" | "mes_seguinte" | "livre";
}

export interface DadosEmailAgenda {
  /** o e-mail do cadastro do aluno */
  email: string;
  aluno: string;
  /** quem marcou (o personal ou a nutri) */
  quem: string;
  consultas: readonly ConsultaEmail[];
  link: string;
  /** e-mail de teste (staging ou conta de teste): o assunto diz para quem era */
  paraTeste?: string | null;
  /** as regras do profissional; sem elas (o banco não respondeu) o "Reagendar" não aparece */
  regras?: RegrasDoReagendamento | null;
  /** hoje em São Paulo ("2026-10-01"; padrão: agora) */
  hoje?: string | null;
}

const FUSO = "America/Sao_Paulo";
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_LONGOS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function partes(iso: string): { semana: number; dia: string; mes: string; hora: string; minuto: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { semana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday")), dia: v("day"), mes: v("month"), hora: v("hour"), minuto: v("minute") };
}

/** "qui, 15/10 às 14:00" (São Paulo) — o mesmo texto do sino (w20_quando no banco). */
export function quandoConsulta(iso: string): string {
  const p = partes(iso);
  if (!p) return "";
  return `${DIAS[p.semana]}, ${p.dia}/${p.mes} às ${p.hora}:${p.minuto}`;
}

/** "1 h", "30 min", "1 h 30 min". */
export function duracaoTexto(inicio: string, fim: string): string {
  const min = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "30 minutos", "1 hora", "1 hora e 30 minutos", "2 horas" (a linha "Duração" do e-mail). */
export function duracaoPorExtenso(inicio: string, fim: string): string {
  const min = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
  if (!Number.isFinite(min) || min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  const horas = h ? `${h} ${h === 1 ? "hora" : "horas"}` : "";
  const minutos = m ? `${m} ${m === 1 ? "minuto" : "minutos"}` : "";
  return [horas, minutos].filter(Boolean).join(" e ");
}

/** "Quinta, 1 de outubro · 13:30" (São Paulo) — a linha "Quando" do e-mail. */
export function quandoPorExtenso(iso: string): string {
  const p = partes(iso);
  if (!p) return "";
  return `${DIAS_LONGOS[p.semana]}, ${Number(p.dia)} de ${MESES[Number(p.mes) - 1]} · ${p.hora}:${p.minuto}`;
}

/** "quinta, 1/10, 13:30" (São Paulo) — o assunto do e-mail. */
export function quandoNoAssunto(iso: string): string {
  const p = partes(iso);
  if (!p) return "";
  return `${DIAS_LONGOS[p.semana].toLowerCase()}, ${Number(p.dia)}/${Number(p.mes)}, ${p.hora}:${p.minuto}`;
}

/** "14:00" (São Paulo). */
function horaDe(iso: string): string {
  const p = partes(iso);
  return p ? `${p.hora}:${p.minuto}` : "";
}

/** "2026-10-01" do instante em São Paulo. */
export function diaEmSaoPaulo(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(x.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(x);
}

/** O link do botão: a Agenda do app no site do ambiente. */
export function linkDaAgenda(schema: Schema, siteUrl: string | null | undefined): string {
  return `${siteDoConvite(schema, siteUrl)}/perfil/agenda`;
}

// ───────────────────────── o tipo da consulta (o mesmo do app: tipoDe / tituloPadrao em src/agenda/regras.ts) ─────────────────────────

export type TipoDaConsulta = "treino" | "nutricao" | "geral";

export function tipoDaConsulta(modulo: unknown): TipoDaConsulta {
  return modulo === "treino" || modulo === "geral" ? modulo : "nutricao";
}

/** "Consulta de treino" · "Consulta de nutrição" · "Consulta". */
export function rotuloDoTipo(tipo: TipoDaConsulta): string {
  return tipo === "treino" ? "Consulta de treino" : tipo === "nutricao" ? "Consulta de nutrição" : "Consulta";
}

const ICONE_DO_TIPO: Record<TipoDaConsulta, IconeEmail> = { treino: "halter", nutricao: "salada", geral: "lista" };

// ───────────────────────── o que o aluno ainda pode fazer (a mesma conta do app) ─────────────────────────

/** Esperando o ALUNO confirmar (marcada pelo profissional, ainda sem resposta) — sem status (o banco não disse) também. */
export function aguardaConfirmacao(c: Pick<ConsultaEmail, "status">): boolean {
  return c.status == null || c.status === "agendado" || c.status === "encaixe";
}

/** O que veio do banco (agenda_regras_de) → as regras do "Reagendar", com os padrões do app no que faltar; null = sem regras. */
export function regrasDoReagendamento(v: unknown): RegrasDoReagendamento | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const max = Number(r.reagendamentos_max);
  const j = r.janela_reagendamento;
  return {
    reagendamentos_max: Number.isInteger(max) && max >= 0 && max <= 10 ? max : 1,
    janela_reagendamento: j === "mes_seguinte" || j === "livre" ? j : "mes",
  };
}

function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}
function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + 1;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** O mês da consulta ("2026-10-01"): mes_referencia ou o mês do início em São Paulo. */
export function mesDaConsulta(c: Pick<ConsultaEmail, "inicio" | "mes_referencia">): string {
  const ref = typeof c.mes_referencia === "string" && /^\d{4}-\d{2}/.test(c.mes_referencia) ? c.mes_referencia : diaEmSaoPaulo(c.inicio);
  return `${ref.slice(0, 7)}-01`;
}

/**
 * O aluno ainda pode reagendar esta consulta? A mesma conta do app (mensagemReagendar(...).pode): o profissional aceita
 * reagendamento, ainda resta reagendamento e a janela (só no mês · até o fim do mês seguinte · sem trava) não acabou.
 */
export function podeReagendarConsulta(regras: RegrasDoReagendamento, reagendamentos: number, mesRef: string, hoje: string): boolean {
  if (regras.reagendamentos_max <= 0) return false;
  if (Math.max(regras.reagendamentos_max - (reagendamentos || 0), 0) <= 0) return false;
  if (regras.janela_reagendamento === "livre") return true;
  const mes = `${mesRef.slice(0, 7)}-01`;
  const de = hoje > mes ? hoje : mes;
  const ate = regras.janela_reagendamento === "mes_seguinte" ? ultimoDiaDoMes(mesSeguinte(mes)) : ultimoDiaDoMes(mes);
  return ate >= de;
}

/** Os botões que valem para o e-mail (o "Confirmar" e o "Reagendar" só quando o app deixa). */
export function acoesDoEmailAgenda(d: Pick<DadosEmailAgenda, "consultas" | "regras" | "hoje">): { confirmar: boolean; reagendar: boolean } {
  const hoje = d.hoje || diaEmSaoPaulo(new Date());
  const regras = d.regras ?? null;
  return {
    confirmar: d.consultas.some(aguardaConfirmacao),
    reagendar: regras !== null && d.consultas.some((c) => podeReagendarConsulta(regras, Number(c.reagendamentos) || 0, mesDaConsulta(c), hoje)),
  };
}

// ───────────────────────── o e-mail ─────────────────────────

/** "Confirme sua consulta de quinta, 1/10, 13:30" · "Consulta marcada: quinta, 1/10, 13:30" · "Confirme suas 3 consultas com Lucas Ferreira". */
export function assuntoDaAgenda(d: DadosEmailAgenda): string {
  const quem = d.quem.trim() || "seu profissional";
  const n = d.consultas.length;
  const confirmar = d.consultas.some(aguardaConfirmacao);
  let base: string;
  if (n <= 1) {
    const quando = quandoNoAssunto(d.consultas[0]?.inicio ?? "");
    base = !quando ? `Consulta marcada com ${quem}` : confirmar ? `Confirme sua consulta de ${quando}` : `Consulta marcada: ${quando}`;
  } else {
    base = confirmar ? `Confirme suas ${n} consultas com ${quem}` : `${n} consultas marcadas com ${quem}`;
  }
  return d.paraTeste ? `[teste → ${d.paraTeste}] ${base}` : base;
}

/** "Quinta, 1 de outubro" → "quinta, 1 de outubro" (o meio da frase da prévia). */
function diaPorExtenso(iso: string): string {
  const q = quandoPorExtenso(iso);
  const sem = q.split(" · ")[0] ?? "";
  return sem ? sem.charAt(0).toLowerCase() + sem.slice(1) : "";
}

function umaConsultaDe(tipo: TipoDaConsulta): string {
  return tipo === "treino" ? "uma consulta de treino" : tipo === "nutricao" ? "uma consulta de nutrição" : "uma consulta";
}

/** O e-mail da agenda no molde C (o que o htmlDaAgenda monta; separado para o teste olhar as peças). */
export function modeloDaAgenda(d: DadosEmailAgenda): EmailModelo {
  const nome = primeiroNomeDe(d.aluno);
  const quem = d.quem.trim() || "Seu profissional";
  const cs = d.consultas;
  const n = cs.length;
  const { confirmar, reagendar } = acoesDoEmailAgenda(d);
  const tipos = [...new Set(cs.map((c) => tipoDaConsulta(c.modulo)))];
  const site = (() => {
    try {
      return new URL(d.link).origin;
    } catch {
      return "https://physiqcalc.com.br";
    }
  })();

  const destaques = cs.map((c) => {
    const p = partes(c.inicio);
    const tipo = tipoDaConsulta(c.modulo);
    const dur = duracaoTexto(c.inicio, c.fim);
    const fim = horaDe(c.fim);
    const semana = p ? DIAS[p.semana] : "";
    const mes = p ? MESES[Number(p.mes) - 1] ?? "" : "";
    return {
      visual: {
        tipo: "calendario" as const,
        semana: semana.charAt(0).toUpperCase() + semana.slice(1),
        dia: p ? String(Number(p.dia)) : "",
        mes: mes.slice(0, 3).charAt(0).toUpperCase() + mes.slice(1, 3),
      },
      olho: (c.titulo ?? "").trim() || rotuloDoTipo(tipo),
      titulo: horaDe(c.inicio),
      sub: [fim && `até ${fim}`, dur].filter(Boolean).join(" · "),
    };
  });

  const linhas: LinhaEmail[] = [];
  if (n === 1) {
    const c = cs[0];
    const tipo = tipoDaConsulta(c.modulo);
    linhas.push({ icone: "calendario", rotulo: "Quando", valor: quandoPorExtenso(c.inicio) });
    const dur = duracaoPorExtenso(c.inicio, c.fim);
    if (dur) linhas.push({ icone: "relogio", rotulo: "Duração", valor: dur });
    linhas.push({ icone: ICONE_DO_TIPO[tipo], rotulo: "Tipo", valor: rotuloDoTipo(tipo) });
  } else if (tipos.length === 1) {
    linhas.push({ icone: ICONE_DO_TIPO[tipos[0]], rotulo: "Tipo", valor: rotuloDoTipo(tipos[0]) });
  }
  linhas.push({ iniciais: iniciaisDe(quem), rotulo: "Com", valor: quem });

  const primario: BotaoEmail = confirmar ? { texto: "Confirmar presença", href: d.link } : { texto: "Ver minha agenda", href: d.link };
  const secundarios: BotaoEmail[] = [];
  if (reagendar) secundarios.push({ texto: "Reagendar", href: d.link });
  if (confirmar) secundarios.push({ texto: "Ver minha agenda", href: d.link });

  const oque = n > 1 ? `estas ${n} consultas` : "esta consulta";
  const primeira = cs[0];
  const quando = primeira ? `${diaPorExtenso(primeira.inicio)}, às ${horaDe(primeira.inicio)}` : "";
  const preheader = n > 1
    ? `${quem} marcou ${n} consultas para você; a primeira é ${quando}. ${confirmar ? "Confirme pelo app." : "Veja no app."}`
    : primeira
      ? `${quem} marcou ${umaConsultaDe(tipoDaConsulta(primeira.modulo))} para ${quando}. ${confirmar ? "Confirme pelo app." : "Ela já está confirmada."}`
      : `${quem} marcou uma consulta para você no Physiq.`;

  return {
    titulo: assuntoDaAgenda({ ...d, paraTeste: null }),
    preheader,
    rotulo: confirmar ? (n > 1 ? "Convite de consultas" : "Convite de consulta") : n > 1 ? "Consultas marcadas" : "Consulta marcada",
    destaques,
    saudacao: [nome ? `Olá, ${nome}! ` : "Olá! ", { forte: quem }, ` ${confirmar ? "marcou" : "marcou e confirmou"} ${oque} para você.`],
    linhas,
    primario,
    secundarios,
    reserva: { texto: textoDaReserva(1 + secundarios.length, "o app"), href: d.link },
    rodape: `Você recebeu este e-mail porque é aluno de ${quem} no Physiq.`,
    site,
  };
}

/** E-mail no molde C (email-modelo.ts): tabelas + CSS inline, ícones em PNG, sem SVG nem JS. */
export function htmlDaAgenda(d: DadosEmailAgenda): string {
  return montarEmail(modeloDaAgenda(d));
}

function linhaConsulta(c: ConsultaEmail): string {
  const dur = duracaoTexto(c.inicio, c.fim);
  const titulo = (c.titulo ?? "").trim() || rotuloDoTipo(tipoDaConsulta(c.modulo));
  return [quandoPorExtenso(c.inicio), dur && `(${dur})`, titulo && `· ${titulo}`].filter(Boolean).join(" ");
}

/** Texto puro (clientes de e-mail sem HTML). */
export function textoDaAgenda(d: DadosEmailAgenda): string {
  const nome = primeiroNomeDe(d.aluno);
  const quem = d.quem.trim() || "Seu profissional";
  const varias = d.consultas.length > 1;
  const { confirmar, reagendar } = acoesDoEmailAgenda(d);
  const acao = confirmar && reagendar
    ? "Abra o app para confirmar a presença ou reagendar"
    : confirmar ? "Abra o app para confirmar a presença" : reagendar ? "Abra o app para ver ou reagendar" : "Veja na sua agenda do app";
  return [
    `${nome ? `Olá, ${nome}! ` : "Olá! "}${quem} ${confirmar ? "marcou" : "marcou e confirmou"} ${varias ? "estas consultas" : "esta consulta"} para você no Physiq:`,
    d.consultas.map((c) => `- ${linhaConsulta(c)}`).join("\n"),
    `${acao}: ${d.link}`,
    `Você recebeu este e-mail porque é aluno de ${quem} no Physiq.`,
  ].join("\n\n");
}

/** O que veio do banco (agenda_reservar_email) → as consultas do e-mail, só as válidas e no máximo 10. */
export function consultasDoEmail(v: unknown): ConsultaEmail[] {
  const lista = Array.isArray(v) ? v : [];
  const out: ConsultaEmail[] = [];
  for (const x of lista) {
    const c = (x ?? {}) as Record<string, unknown>;
    if (typeof c.inicio !== "string" || typeof c.fim !== "string" || Number.isNaN(new Date(c.inicio).getTime())) continue;
    out.push({
      id: typeof c.id === "string" ? c.id : null,
      inicio: c.inicio,
      fim: c.fim,
      titulo: typeof c.titulo === "string" ? c.titulo : null,
      modulo: typeof c.modulo === "string" ? c.modulo : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** As consultas + o que a função leu depois (status, reagendamentos, mes_referencia de cada uma, pelo id). */
export function consultasComDetalhes(consultas: readonly ConsultaEmail[], detalhes: unknown): ConsultaEmail[] {
  const porId = new Map<string, Record<string, unknown>>();
  for (const x of Array.isArray(detalhes) ? detalhes : []) {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.id === "string") porId.set(r.id, r);
  }
  return consultas.map((c) => {
    const r = c.id ? porId.get(c.id) : undefined;
    if (!r) return c;
    return {
      ...c,
      status: typeof r.status === "string" ? r.status : c.status ?? null,
      reagendamentos: Number.isFinite(Number(r.reagendamentos)) ? Number(r.reagendamentos) : c.reagendamentos ?? null,
      mes_referencia: typeof r.mes_referencia === "string" ? r.mes_referencia : c.mes_referencia ?? null,
    };
  });
}

const STATUS: Record<string, number> = { sem_login: 401, sem_acesso: 403, agendamento_inexistente: 404, muitos_envios: 429 };

export function statusDoErroAgenda(erro: unknown): number {
  return STATUS[String(erro)] ?? 400;
}
