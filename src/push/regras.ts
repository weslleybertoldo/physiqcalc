/**
 * Physiq W20c — regras PURAS do push no aparelho (sem Capacitor nem rede; testadas no Vitest). O que vale para o servidor e
 * para o app (a rota do toque, o token aceito, o canal) mora em supabase-principal/functions/_shared/push-regras.ts.
 */
import { rotaSegura, tokenValido } from "../../supabase-principal/functions/_shared/push-regras";

export { CANAL_AVISOS, NOME_CANAL_AVISOS, rotaSegura, tokenValido } from "../../supabase-principal/functions/_shared/push-regras";

/** O token deste aparelho, gravado no banco (para apagar ao sair, mesmo depois de fechar o app). */
export const CHAVE_TOKEN = "physiq_push_token";
/** "Agora não" no pedido: { uid, em } — volta a perguntar depois de DIAS_ADIADO. */
export const CHAVE_ADIADO = "physiq_push_adiado";
export const DIAS_ADIADO = 7;

export type Permissao = "granted" | "denied" | "prompt" | "prompt-with-rationale";

/** O que fazer ao abrir com sessão: registrar calado (já tem permissão), pedir (ainda não decidiu) ou nada (negou). */
export function proximoPasso(permissao: Permissao | string | null | undefined): "registrar" | "pedir" | "nada" {
  if (permissao === "granted") return "registrar";
  if (permissao === "prompt" || permissao === "prompt-with-rationale") return "pedir";
  return "nada";
}

/** A rota do toque na notificação (o `data.link` que a push-enviar mandou). */
export function rotaDoToque(data: unknown): string {
  const link = data && typeof data === "object" ? (data as Record<string, unknown>).link : undefined;
  return rotaSegura(link);
}

interface Guardado {
  uid: string;
  token: string;
  em: string;
}

function ler<T>(chave: string): T | null {
  try {
    const v = localStorage.getItem(chave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: unknown): void {
  try {
    if (valor === null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

export function guardarToken(uid: string, token: string, agora: Date = new Date()): void {
  if (!uid || !tokenValido(token)) return;
  gravar(CHAVE_TOKEN, { uid, token, em: agora.toISOString() } satisfies Guardado);
}

/** O token gravado no banco por este aparelho (de qualquer pessoa — quem sai apaga o seu). */
export function tokenGuardado(): { uid: string; token: string } | null {
  const g = ler<Guardado>(CHAVE_TOKEN);
  return g && typeof g.uid === "string" && tokenValido(g.token) ? { uid: g.uid, token: g.token } : null;
}

export function esquecerTokenGuardado(): void {
  gravar(CHAVE_TOKEN, null);
}

/** O push está ligado neste aparelho para esta pessoa? (aí a notificação local da consulta nova não repete o push) */
export function pushAtivoNoAparelho(uid?: string | null): boolean {
  const g = tokenGuardado();
  return !!g && (!uid || g.uid === uid);
}

export function adiar(uid: string, agora: Date = new Date()): void {
  gravar(CHAVE_ADIADO, { uid, em: agora.toISOString() });
}

/** "Agora não" há menos de DIAS_ADIADO dias (por pessoa)? */
export function adiadoRecentemente(uid: string, agora: Date = new Date()): boolean {
  const a = ler<{ uid?: string; em?: string }>(CHAVE_ADIADO);
  if (!a || a.uid !== uid || !a.em) return false;
  const t = new Date(a.em).getTime();
  return !Number.isNaN(t) && agora.getTime() - t < DIAS_ADIADO * 86400_000;
}
