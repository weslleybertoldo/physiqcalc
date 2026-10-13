// Physiq W-A P3 — o PLANO dos lembretes das rotinas (spec W-A §2.2-14, §4.6, §5.4; revisão C3 e I6). PURO: sem Capacitor, sem rede, sem
// armazenamento (testado em lembretes.test.ts); quem agenda é o aparelho.ts.
// No @capacitor/local-notifications 8.0.2 (Android), com `schedule.at` o `every` é ignorado e o alarme toca 1 vez só
// (LocalNotificationManager.java:336-349) → cada rotina com lembrete vira notificações AVULSAS: uma por dia dos próximos 7 (hoje entra só se
// a hora ainda não passou e ela não foi feita hoje), `at` + `allowWhileIdle`, sem `every` e sem `on`. Ids na faixa própria 40000–40299:
// 40000 + a posição da rotina viva (0–29, pela criação) × 10 + o dia da semana da ocorrência (1–7) — 7 dias seguidos têm 7 dias da semana
// diferentes: 2 ocorrências da mesma rotina nunca dividem um id. O que o aparelho já tem (getPending) × o plano = o que cancelar e o que
// agendar (diferenca). E: o que fazer com o toque/"Feito" (acaoDaNotificacao), o aviso do site com a página aberta (rotinasParaAvisarNoSite)
// e se a saída do login esvazia a faixa (deveLimparAoDesmontar).
import { diaDaSemanaISO, hojeSP } from "@/aluno-dia/regras";
import type { Rotina, RotinaFeita } from "@/aluno-dia/tipos";
import { somarDias } from "@/nutricao/app/dia";
import { CORPO_DO_REMEDIO, REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA, TITULO_DO_LEMBRETE, tituloDoRemedio } from "./textos";

export const FAIXA = { de: 40000, ate: 40299 } as const;
export const MAX_ROTINAS_VIVAS = 30;
export const DIAS_DO_PLANO = 7;
export const CANAL_ROTINAS = "rotinas-v1";
export const TIPO_DE_ACAO = "ROTINA";
export const ACAO_FEITO = "feito";
/** O toque no corpo da notificação (o plugin manda "tap"): também marca como feita (spec §2.2-14). */
export const ACAO_TOQUE = "tap";
/** Site: até quanto tempo depois da hora ainda vale avisar (o navegador segura o setInterval da aba de fundo em até 1 min). */
export const JANELA_DO_SITE_MS = 10 * 60_000;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export const naFaixa = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id >= FAIXA.de && id <= FAIXA.ate;
export const idDoLembrete = (posicao: number, diaSemana: number): number => FAIXA.de + posicao * 10 + diaSemana;

/** O que vai junto da notificação (o "Feito" lê daqui; nada de nome). */
export interface ExtraDoLembrete {
  rotina_id: string;
  /** o login de quem é a rotina: ação de notificação de outro login é ignorada (aparelho compartilhado — revisão I6) */
  dono: string;
  /** o dia (yyyy-mm-dd, o de São Paulo) daquela ocorrência: o "Feito" marca esse dia */
  dia: string;
  hora: string;
}

export interface LembreteNoAparelho {
  id: number;
  at: Date;
  titulo: string;
  corpo: string;
  extra: ExtraDoLembrete;
}

/** O que o getPending do plugin devolve (só o que a diferença usa). */
export interface PendenteNoAparelho {
  id: number;
  title?: string;
  body?: string;
  extra?: unknown;
}

/** O instante, no relógio DO APARELHO, do dia (yyyy-mm-dd — o de São Paulo) às HH:MM (risco 4 da spec: fora do fuso, vale a hora local). */
export function instante(dia: string, hora: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(a, m - 1, d, hh, mm, 0, 0);
}

/** O texto da notificação. Remédio (Q3): sem o nome na tela bloqueada; os outros tipos com o nome e o detalhe. */
export function textoDoLembrete(r: Pick<Rotina, "nome" | "detalhe" | "tipo" | "horario">): { titulo: string; corpo: string } {
  if (r.tipo === "remedio" && REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA) return { titulo: tituloDoRemedio(r.horario ?? ""), corpo: CORPO_DO_REMEDIO };
  return { titulo: TITULO_DO_LEMBRETE, corpo: r.detalhe ? `${r.nome} · ${r.detalhe}` : r.nome };
}

/** A posição de cada rotina VIVA pela criação (0–29): a mesma em todo aparelho e a cada abertura enquanto nenhuma nasce nem sai. */
export function posicoes(rotinas: readonly Rotina[]): Map<string, number> {
  const vivas = rotinas.filter((r) => !r.arquivada_em).sort((a, b) => a.criada_em.localeCompare(b.criada_em) || a.id.localeCompare(b.id));
  return new Map(vivas.slice(0, MAX_ROTINAS_VIVAS).map((r, i) => [r.id, i] as [string, number]));
}

const feitaNoDia = (feitas: readonly RotinaFeita[], rotina: string, dia: string): boolean => feitas.some((f) => f.rotina_id === rotina && f.dia === dia);

/** As ocorrências dos próximos 7 dias (hoje incluído) de cada rotina viva com lembrete — sem `every`; hoje sai se a hora passou ou se já foi feita. */
export function planoDosLembretes(rotinas: readonly Rotina[], feitas: readonly RotinaFeita[], dono: string, agora: Date = new Date()): LembreteNoAparelho[] {
  const hoje = hojeSP(agora);
  const pos = posicoes(rotinas);
  const plano: LembreteNoAparelho[] = [];
  for (const r of rotinas) {
    const p = pos.get(r.id);
    if (p === undefined || !r.lembrete || !r.horario || !HORA.test(r.horario)) continue;
    const texto = textoDoLembrete(r);
    for (let k = 0; k < DIAS_DO_PLANO; k++) {
      const dia = somarDias(hoje, k);
      const dow = diaDaSemanaISO(dia);
      if (!r.dias_semana.includes(dow)) continue;
      const at = instante(dia, r.horario);
      if (at.getTime() <= agora.getTime()) continue;
      if (k === 0 && feitaNoDia(feitas, r.id, dia)) continue;
      plano.push({ id: idDoLembrete(p, dow), at, titulo: texto.titulo, corpo: texto.corpo, extra: { rotina_id: r.id, dono, dia, hora: r.horario } });
    }
  }
  return plano.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id - b.id);
}

function extraDe(p: PendenteNoAparelho): Partial<ExtraDoLembrete> {
  return p.extra && typeof p.extra === "object" ? (p.extra as Partial<ExtraDoLembrete>) : {};
}

/**
 * O que o aparelho tem (getPending) × o plano: cancelar = os da faixa fora do plano; agendar = os do plano que faltam ou mudaram (o schedule
 * do mesmo id troca — o plugin cancela o alarme do id antes). Fora da faixa: nunca mexe (treino 2001, timer 1002, consultas 3000–3899).
 * Exceção: a ocorrência que já venceu e ainda está pendente (o alarme inexato pode atrasar uns minutos) FICA se continua valendo — rotina viva,
 * do mesmo dono, mesma hora, no dia dela e não feita —, senão a reconciliação de quem abre o app logo depois da hora mataria o aviso.
 */
export function diferenca(
  pendentes: readonly PendenteNoAparelho[],
  plano: readonly LembreteNoAparelho[],
  ctx: { rotinas: readonly Rotina[]; feitas: readonly RotinaFeita[]; dono: string; agora?: Date },
): { cancelar: number[]; agendar: LembreteNoAparelho[] } {
  const agora = ctx.agora ?? new Date();
  const doPlano = new Map(plano.map((l) => [l.id, l] as [number, LembreteNoAparelho]));
  const comLembrete = new Map(ctx.rotinas.filter((r) => !r.arquivada_em && r.lembrete && r.horario).map((r) => [r.id, r] as [string, Rotina]));
  const cancelar: number[] = [];
  const iguais = new Set<number>();
  for (const p of pendentes) {
    if (!naFaixa(p.id)) continue;
    const x = extraDe(p);
    const l = doPlano.get(p.id);
    if (l) {
      const igual = p.title === l.titulo && p.body === l.corpo && x.rotina_id === l.extra.rotina_id && x.dono === l.extra.dono
        && x.dia === l.extra.dia && x.hora === l.extra.hora;
      if (igual) iguais.add(p.id);
      continue;
    }
    const r = typeof x.rotina_id === "string" ? comLembrete.get(x.rotina_id) : undefined;
    const dia = typeof x.dia === "string" && DIA.test(x.dia) ? x.dia : null;
    const hora = typeof x.hora === "string" && HORA.test(x.hora) ? x.hora : null;
    const venceu = !!dia && !!hora && instante(dia, hora).getTime() <= agora.getTime();
    const vale = !!r && !!dia && x.dono === ctx.dono && r.horario === hora && r.dias_semana.includes(diaDaSemanaISO(dia)) && !feitaNoDia(ctx.feitas, r.id, dia);
    if (venceu && vale) continue;
    cancelar.push(p.id);
  }
  return { cancelar: cancelar.sort((a, b) => a - b), agendar: plano.filter((l) => !iguais.has(l.id)) };
}

export type AcaoDaNotificacao =
  | { tipo: "nao_e_rotina" }
  | { tipo: "ignorar" }
  /** `nome`: o do corpo da notificação (com o app fechado a lista ainda não chegou; o remédio — Q3 — vem sem nome: null) */
  | { tipo: "marcar"; rotina_id: string; dia: string; nome: string | null };

/**
 * O toque e o "Feito" (spec §4.6): de rotina (id na faixa + extra.rotina_id) e deste login → marcar o dia da ocorrência; de outro login (o
 * aparelho de 2 pessoas — revisão I6) ou sem login → ignorar (e ninguém mais trata); o resto (as consultas, o treino) → não é rotina.
 */
export function acaoDaNotificacao(e: unknown, uid: string | null, agora: Date = new Date()): AcaoDaNotificacao {
  const ev = (e && typeof e === "object" ? e : {}) as { actionId?: unknown; notification?: { id?: unknown; title?: unknown; body?: unknown; extra?: unknown } };
  const n = ev.notification && typeof ev.notification === "object" ? ev.notification : {};
  const x = (n.extra && typeof n.extra === "object" ? n.extra : {}) as Partial<ExtraDoLembrete>;
  if (!naFaixa(n.id) || typeof x.rotina_id !== "string") return { tipo: "nao_e_rotina" };
  if (!uid || x.dono !== uid) return { tipo: "ignorar" };
  if (ev.actionId !== ACAO_FEITO && ev.actionId !== ACAO_TOQUE) return { tipo: "ignorar" };
  const nome = n.title === TITULO_DO_LEMBRETE && typeof n.body === "string" ? n.body.split(" · ")[0].trim() || null : null;
  return { tipo: "marcar", rotina_id: x.rotina_id, dia: typeof x.dia === "string" && DIA.test(x.dia) ? x.dia : hojeSP(agora), nome };
}

export const chaveDoAvisoNoSite = (rotina: string, dia: string): string => `${rotina}|${dia}`;

/** Site (a página aberta): as rotinas com lembrete que venceram há menos de 10 min, no dia delas, não feitas hoje e ainda não avisadas nesta aba. */
export function rotinasParaAvisarNoSite(
  rotinas: readonly Rotina[],
  feitas: readonly RotinaFeita[],
  avisadas: ReadonlySet<string>,
  agora: Date = new Date(),
): Rotina[] {
  const hoje = hojeSP(agora);
  const dow = diaDaSemanaISO(hoje);
  const t = agora.getTime();
  return rotinas
    .filter((r) => {
      if (r.arquivada_em || !r.lembrete || !r.horario || !HORA.test(r.horario) || !r.dias_semana.includes(dow)) return false;
      if (feitaNoDia(feitas, r.id, hoje) || avisadas.has(chaveDoAvisoNoSite(r.id, hoje))) return false;
      const hora = instante(hoje, r.horario).getTime();
      return t >= hora && t < hora + JANELA_DO_SITE_MS;
    })
    .sort((a, b) => (a.horario ?? "").localeCompare(b.horario ?? "") || a.criada_em.localeCompare(b.criada_em));
}

/**
 * A casca desmonta os avisos globais quando o login sai (src/App.tsx: `usuario && <AvisosGlobais />`): se, nessa hora, o login guardado no
 * aparelho já não é o de quem estava montado (Sair, trocar de conta, excluir a conta), a faixa inteira é esvaziada. Mesmo login guardado
 * (o aviso só remontou — a porta do aceite, o limite de erro) = nada.
 */
export const deveLimparAoDesmontar = (uidMontado: string | null, loginGuardado: string | null): boolean => !!uidMontado && loginGuardado !== uidMontado;
