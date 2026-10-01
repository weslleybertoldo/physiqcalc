// Physiq W20 — regras PURAS do e-mail "consulta marcada" (função agenda-avisar). Sem Deno e sem rede: usadas pela função e
// testadas no Vitest (src/agenda/emailAgenda.test.ts). O destino segue a W17: staging → SEMPRE a caixa de teste do Resend;
// produção → conta de teste (physiq*.app) também vai para a caixa de teste, pessoa real recebe no próprio e-mail.
import { escaparHtml, siteDoConvite, type Schema } from "./convites-regras.ts";
import { primeiroNomeDe } from "./enviar-aluno-regras.ts";

export { destinoDoEnvio as destinoDoEmailAgenda } from "./enviar-aluno-regras.ts";

export interface ConsultaEmail {
  inicio: string;
  fim: string;
  titulo?: string | null;
  modulo?: string | null;
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
}

const FUSO = "America/Sao_Paulo";
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

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

/** O link do botão: a Agenda do app no site do ambiente. */
export function linkDaAgenda(schema: Schema, siteUrl: string | null | undefined): string {
  return `${siteDoConvite(schema, siteUrl)}/perfil/agenda`;
}

/** "Consulta marcada com Lucas Ferreira: qui, 15/10 às 14:00" · "3 consultas marcadas com Lucas Ferreira". */
export function assuntoDaAgenda(d: DadosEmailAgenda): string {
  const quem = d.quem.trim() || "seu profissional";
  const n = d.consultas.length;
  const base = n <= 1 ? `Consulta marcada com ${quem}: ${quandoConsulta(d.consultas[0]?.inicio ?? "")}` : `${n} consultas marcadas com ${quem}`;
  return d.paraTeste ? `[teste → ${d.paraTeste}] ${base}` : base;
}

function linhaConsulta(c: ConsultaEmail): string {
  const dur = duracaoTexto(c.inicio, c.fim);
  const titulo = (c.titulo ?? "").trim();
  return [quandoConsulta(c.inicio), dur && `(${dur})`, titulo && `· ${titulo}`].filter(Boolean).join(" ");
}

/** E-mail (HTML simples, sem imagem nem emoji — o mesmo jeito do convite e do "plano atualizado"). */
export function htmlDaAgenda(d: DadosEmailAgenda): string {
  const nome = escaparHtml(primeiroNomeDe(d.aluno));
  const quem = escaparHtml(d.quem.trim() || "Seu profissional");
  const link = escaparHtml(d.link);
  const varias = d.consultas.length > 1;
  const itens = d.consultas.map((c) => `<li style="margin:4px 0">${escaparHtml(linhaConsulta(c))}</li>`).join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.5">
  <h2 style="margin:0 0 12px;font-size:20px">${escaparHtml(assuntoDaAgenda({ ...d, paraTeste: null }))}</h2>
  <p>${nome ? `Olá, ${nome}! ` : ""}<b>${quem}</b> marcou ${varias ? "estas consultas" : "uma consulta"} para você no Physiq:</p>
  <ul style="padding-left:20px">${itens}</ul>
  <p>Abra o app para <b>confirmar</b>, <b>reagendar</b> ou <b>desistir</b>.</p>
  <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Ver minha agenda</a></p>
  <p style="font-size:12px;color:#555">Ou copie o link: ${link}</p>
  <p style="font-size:12px;color:#555">Você recebeu este e-mail porque é aluno de ${quem} no Physiq.</p>
</div>`;
}

/** Texto puro (clientes de e-mail sem HTML). */
export function textoDaAgenda(d: DadosEmailAgenda): string {
  const nome = primeiroNomeDe(d.aluno);
  const quem = d.quem.trim() || "Seu profissional";
  const varias = d.consultas.length > 1;
  return [
    `${nome ? `Olá, ${nome}! ` : ""}${quem} marcou ${varias ? "estas consultas" : "uma consulta"} para você no Physiq:`,
    d.consultas.map((c) => `- ${linhaConsulta(c)}`).join("\n"),
    `Abra o app para confirmar, reagendar ou desistir: ${d.link}`,
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
    out.push({ inicio: c.inicio, fim: c.fim, titulo: typeof c.titulo === "string" ? c.titulo : null, modulo: typeof c.modulo === "string" ? c.modulo : null });
    if (out.length >= 10) break;
  }
  return out;
}

const STATUS: Record<string, number> = { sem_login: 401, sem_acesso: 403, agendamento_inexistente: 404, muitos_envios: 429 };

export function statusDoErroAgenda(erro: unknown): number {
  return STATUS[String(erro)] ?? 400;
}
