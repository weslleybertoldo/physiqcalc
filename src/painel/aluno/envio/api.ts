/**
 * "Salvar e enviar ao aluno" (tela 8, W17): a função `aluno-enviar` do banco principal grava o aviso no sino do aluno (a
 * `aluno_avisar_plano` da W16) e manda o e-mail pelo Resend (sem repetir em 10 minutos; staging só para a caixa de teste).
 * Se a função não responde (rede, servidor), grava só o sino pela RPC da W16 — o "enviar" nunca termina sem o aviso no app.
 * Erro de regra (sem acesso, nada para enviar) sobe para a tela.
 */
import { principal } from "@/integrations/principal/client";
import { lerResultado, type ModuloEnvio, type ResultadoEnvio } from "./regras";

export class ErroEnvio extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

/** Erros de regra: a função respondeu e disse não (não adianta gravar só o sino). */
const ERROS_DE_REGRA = new Set(["sem_acesso", "sem_modulo", "aluno_inexistente", "sem_login"]);

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** Só o sino (a W16): a reserva quando a função do e-mail não responde. */
async function soOSino(pacienteId: string, modulos: ModuloEnvio[]): Promise<ResultadoEnvio> {
  const { data, error } = await principal.rpc("aluno_avisar_plano" as never, { p_aluno: pacienteId, p_modulos: modulos } as never);
  if (error) throw new ErroEnvio(ERROS_DE_REGRA.has(error.message) ? error.message : "erro_interno");
  const r = (data ?? {}) as { ok?: boolean; erro?: string; avisado?: boolean; sem_login?: boolean; repetido?: boolean };
  if (r.ok === false) throw new ErroEnvio(r.erro ?? "erro_interno");
  return { avisado: !!r.avisado, repetido: !!r.repetido, semLogin: !!r.sem_login, email: null };
}

export async function enviarAoAluno(pacienteId: string, modulos: ModuloEnvio[]): Promise<ResultadoEnvio> {
  const { data, error } = await principal.functions.invoke("aluno-enviar", { body: { aluno: pacienteId, modulos } });
  if (!error) {
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok === true) return lerResultado(r);
    throw new ErroEnvio(String(r.erro ?? "erro_interno"));
  }
  const corpo = await corpoDoErro(error);
  const codigo = corpo?.erro ? String(corpo.erro) : "";
  if (ERROS_DE_REGRA.has(codigo)) throw new ErroEnvio(codigo);
  console.warn("[enviar ao aluno] a função do e-mail não respondeu; só o aviso no sino:", codigo || (error as Error).message);
  return soOSino(pacienteId, modulos);
}
