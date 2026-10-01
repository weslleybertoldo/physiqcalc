/**
 * Physiq W20 — o aviso no aparelho da consulta nova (default D: sem push nesta W — o app não tem Firebase/FCM). Quando o app abre
 * ou volta para a frente, as consultas que o profissional marcou e ainda esperam a resposta do aluno viram 1 notificação local
 * (@capacitor/local-notifications, a mesma do lembrete de treino) — uma vez por consulta neste aparelho. Regras puras aqui.
 */
import { aguardandoAluno, quandoConsulta } from "./regras";

export const CHAVE_AVISADAS = "physiq_consultas_avisadas";
export const ID_BASE_NOTIFICACAO = 3000;
export const ROTA_AGENDA = "/perfil/agenda";

export interface ConsultaParaAviso {
  id: string;
  inicio: string;
  fim: string;
  status: string;
  dia_inteiro?: boolean | null;
  origem?: string | null;
  profissional?: string | null;
}

/** As consultas que pedem aviso: futuras, esperando o aluno, marcadas pelo profissional e ainda não avisadas aqui. */
export function consultasParaAvisar<T extends ConsultaParaAviso>(lista: readonly T[], avisadas: ReadonlySet<string>, agora: Date = new Date()): T[] {
  return lista
    .filter((c) => !c.dia_inteiro && aguardandoAluno(c.status) && (c.origem ?? "profissional") !== "aluno" && new Date(c.inicio).getTime() > agora.getTime() && !avisadas.has(c.id))
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

/** O texto da notificação (1 consulta: a data e quem; várias: quantas). */
export function textoDoAviso(novas: readonly ConsultaParaAviso[]): { titulo: string; corpo: string } | null {
  if (!novas.length) return null;
  if (novas.length === 1) {
    const c = novas[0];
    const quem = c.profissional?.trim();
    return { titulo: "Consulta para confirmar", corpo: `${quandoConsulta(c.inicio)}${quem ? ` com ${quem}` : ""}. Toque para confirmar, reagendar ou desistir.` };
  }
  return { titulo: `${novas.length} consultas para confirmar`, corpo: `A próxima: ${quandoConsulta(novas[0].inicio)}. Toque para confirmar, reagendar ou desistir.` };
}

/** Um id estável (número) por consulta, para a notificação não repetir nem colidir com as do treino (1001–2001). */
export function idDaNotificacao(consultaId: string): number {
  let h = 0;
  for (let i = 0; i < consultaId.length; i++) h = (h * 31 + consultaId.charCodeAt(i)) | 0;
  return ID_BASE_NOTIFICACAO + (Math.abs(h) % 900);
}

export function lerAvisadas(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_AVISADAS) ?? "[]");
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Guarda as já avisadas (as 100 mais recentes). */
export function gravarAvisadas(ids: Iterable<string>): void {
  try {
    const lista = [...ids].slice(-100);
    localStorage.setItem(CHAVE_AVISADAS, JSON.stringify(lista));
  } catch {
    /* sem armazenamento: avisa de novo na próxima abertura */
  }
}
