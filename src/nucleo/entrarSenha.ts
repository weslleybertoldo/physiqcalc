/**
 * "Entrar com e-mail e senha" pelo SERVIDOR (W8b): a função entrar-senha do banco principal confere o captcha, aplica o limite
 * de tentativas por conta e por IP (4 erradas → 1 min; depois 5 → 15 → 30 → 60 min; o seguinte bloqueia de vez) e devolve a
 * sessão. Chamada com fetch próprio (sem as novas tentativas automáticas do cliente do principal: o token do captcha vale uma
 * vez só e a mesma tentativa não pode contar duas vezes).
 */
import { PRINCIPAL_ANON, PRINCIPAL_SCHEMA, PRINCIPAL_URL } from "@/integrations/principal/client";

export interface SessaoServidor {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
}

export type ErroEntrarSenha =
  | "senha_errada"
  | "bloqueado"
  | "bloqueado_de_vez"
  | "muitas_tentativas_rede"
  | "em_andamento"
  | "captcha_invalido"
  | "acesso_desativado"
  | "email_nao_confirmado"
  | "conta_real_no_staging"
  | "limite_servidor"
  | "dados_invalidos"
  | "indisponivel"
  | "rede";

export type RespostaEntrarSenha =
  | { ok: true; sessao: SessaoServidor }
  | {
      ok: false;
      erro: ErroEntrarSenha;
      /** fim do bloqueio temporário (ISO, relógio do servidor) */
      bloqueado_ate?: string | null;
      bloqueado_de_vez?: boolean;
      /** relógio do servidor na resposta (acerta a contagem do aparelho) */
      agora?: string | null;
      erros?: number | null;
      restam?: number | null;
    };

const ERROS: readonly ErroEntrarSenha[] = [
  "senha_errada", "bloqueado", "bloqueado_de_vez", "muitas_tentativas_rede", "em_andamento", "captcha_invalido", "acesso_desativado",
  "email_nao_confirmado", "conta_real_no_staging", "limite_servidor", "dados_invalidos", "indisponivel", "rede",
];

/** Corpo da resposta da função → resultado (qualquer coisa estranha vira "indisponivel"). */
export function lerRespostaEntrar(status: number, corpo: unknown): RespostaEntrarSenha {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const sessao = c.sessao as Partial<SessaoServidor> | undefined;
  if (status === 200 && c.ok === true && sessao && typeof sessao.access_token === "string" && typeof sessao.refresh_token === "string") {
    return { ok: true, sessao: sessao as SessaoServidor };
  }
  const erro = (ERROS as readonly string[]).includes(String(c.erro)) ? (c.erro as ErroEntrarSenha) : "indisponivel";
  return {
    ok: false,
    erro,
    bloqueado_ate: typeof c.bloqueado_ate === "string" ? c.bloqueado_ate : null,
    bloqueado_de_vez: c.bloqueado_de_vez === true || erro === "bloqueado_de_vez",
    agora: typeof c.agora === "string" ? c.agora : null,
    erros: typeof c.erros === "number" ? c.erros : null,
    restam: typeof c.restam === "number" ? c.restam : null,
  };
}

/** Uma tentativa de entrar (15 s de limite). Sem internet/servidor → { erro: "rede" }. */
export async function entrarComSenhaNoServidor(p: { email: string; senha: string; captcha: string }, limiteMs = 15_000): Promise<RespostaEntrarSenha> {
  if (!PRINCIPAL_URL) return { ok: false, erro: "indisponivel" };
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), limiteMs);
  try {
    const r = await fetch(`${PRINCIPAL_URL}/functions/v1/entrar-senha`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: PRINCIPAL_ANON, "x-schema": PRINCIPAL_SCHEMA },
      body: JSON.stringify({ email: p.email.trim().toLowerCase(), senha: p.senha, captcha: p.captcha }),
      signal: controle.signal,
    });
    const corpo = await r.json().catch(() => null);
    return lerRespostaEntrar(r.status, corpo);
  } catch {
    return { ok: false, erro: "rede" };
  } finally {
    clearTimeout(timer);
  }
}
