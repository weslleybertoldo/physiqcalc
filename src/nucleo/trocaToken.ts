/**
 * Troca de token (spec 7.4, passos 3–5): o login do BANCO PRINCIPAL vira uma sessão do Banco do Treino, emitida pela
 * função `trocar-token` do próprio Treino — o PowerSync só aceita token do Auth do Treino (D2). A sessão é gravada no
 * cliente do Treino (`setSession`): o `connector.ts` e as telas antigas seguem iguais, lendo `supabase.auth`.
 *
 * Erros (spec 9): rede → tenta de novo com espera crescente (2 s → 30 s); token inválido → sai dos 2 bancos; conflito de
 * conta (e-mail e senha com e-mail que já existe no Treino) → mensagem para a conferência do master; muitas tentativas →
 * "Tente em alguns minutos".
 */
import type { Session } from "@supabase/supabase-js";
import { DB_SCHEMA, supabase } from "@/integrations/supabase/client";

export type ErroTroca = "rede" | "invalido" | "conflito" | "limite" | "staging" | "email" | "indisponivel" | "interno";

export interface SessaoTreino {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  treino_user_id: string;
  papel: string | null;
}

export type ResultadoTroca = { ok: true; sessao: SessaoTreino } | { ok: false; erro: ErroTroca; status: number };

/** Mensagem para a pessoa (spec 9), no lugar do treino. */
export const MENSAGEM_TROCA: Record<ErroTroca, string> = {
  rede: "Não foi possível abrir seu treino.",
  indisponivel: "Parte do app está fora do ar. Seu treino volta assim que ela voltar.",
  interno: "Não foi possível abrir seu treino.",
  conflito: "Sua conta precisa de uma conferência. Já avisamos o suporte.",
  limite: "Muitas tentativas. Tente em alguns minutos.",
  staging: "Este é o ambiente de teste: só contas de teste entram.",
  email: "Confirme o seu e-mail para entrar.",
  invalido: "Sua sessão terminou. Entre de novo.",
};

/** Status HTTP + código da função → erro da troca. */
export function erroDaResposta(status: number, codigo?: string | null): ErroTroca {
  if (status === 0) return "rede";
  if (status === 401) return "invalido";
  if (status === 403) return codigo === "conta_real_no_staging" ? "staging" : "email";
  if (status === 409) return "conflito";
  if (status === 429) return "limite";
  if (status === 502 || status === 503 || status === 504) return "indisponivel";
  return "interno";
}

/** Vale tentar de novo sozinho (rede e servidor); conflito, limite e staging esperam a pessoa (ou o master). */
export function retentavel(erro: ErroTroca): boolean {
  return erro === "rede" || erro === "indisponivel" || erro === "interno";
}

/**
 * Quantas tentativas SOZINHAS (sem a pessoa tocar em "Tentar de novo") cada erro ganha (W5 — correção do painel sem o
 * Treino). Sem rede a chamada nem chega à função: a espera crescente da spec 9 (2 s → 30 s) segue. Com o servidor
 * respondendo erro, cada tentativa que passa da validação do token CONTA no limite de 20 por hora da trocar-token — por
 * isso só 2 (e depois uma pausa guardada no aparelho). Limite, conflito, staging, e-mail e token inválido: nenhuma.
 */
export function tentativasAutomaticas(erro: ErroTroca): number {
  if (erro === "rede") return 8;
  if (erro === "indisponivel" || erro === "interno") return 2;
  return 0;
}

/** Espera antes da tentativa n (0, 1, 2…): 2 s, 4 s, 8 s, 16 s e depois 30 s. */
export function esperaDaTentativa(n: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, n));
}

// ───────────────────────── pausa da troca (não martelar o limite, nem recarregando a página) ─────────────────────────

const PAUSA = "physiq_troca_pausa:";
/** Depois de um 429 a troca fica parada 15 min (o limite é de 20 por hora); depois das tentativas com o servidor falhando, 5 min. */
export const PAUSA_LIMITE_MS = 15 * 60_000;
export const PAUSA_SERVIDOR_MS = 5 * 60_000;

export interface PausaTroca {
  ate: number;
  erro: ErroTroca;
}

/** Guarda no aparelho que a troca desta pessoa não deve ser tentada sozinha até `agora + ms` (vale entre aberturas do app). */
export function pausarTroca(principalUserId: string, erro: ErroTroca, ms: number, agora = Date.now()): void {
  try {
    localStorage.setItem(PAUSA + principalUserId, JSON.stringify({ ate: agora + ms, erro } satisfies PausaTroca));
  } catch {
    /* sem armazenamento: vale só a memória desta abertura */
  }
}

/** A pausa ainda vale? (vencida ou ilegível → null e some do aparelho) */
export function pausaDaTroca(principalUserId: string | null | undefined, agora = Date.now()): PausaTroca | null {
  if (!principalUserId) return null;
  try {
    const bruto = localStorage.getItem(PAUSA + principalUserId);
    if (!bruto) return null;
    const p = JSON.parse(bruto) as Partial<PausaTroca>;
    if (typeof p.ate === "number" && p.ate > agora && typeof p.erro === "string") return { ate: p.ate, erro: p.erro as ErroTroca };
    localStorage.removeItem(PAUSA + principalUserId);
  } catch {
    /* noop */
  }
  return null;
}

export function limparPausaTroca(principalUserId: string | null | undefined): void {
  if (!principalUserId) return;
  try {
    localStorage.removeItem(PAUSA + principalUserId);
  } catch {
    /* noop */
  }
}

/**
 * Depois de uma falha: tenta de novo sozinho (e quando) ou pausa? `feitas` = tentativas sozinhas já feitas nesta sequência.
 *   · rede → espera crescente enquanto houver tentativas; esgotou → para (a volta da internet refaz);
 *   · servidor (indisponível/interno) → até 2 com espera; esgotou → pausa de 5 min guardada no aparelho;
 *   · limite (429) → pausa de 15 min, nada sozinho;
 *   · o resto (conflito, staging, e-mail, token) → nada sozinho.
 */
export function depoisDaFalha(erro: ErroTroca, feitas: number): { tentarEm: number | null; pausarPor: number | null } {
  if (erro === "limite") return { tentarEm: null, pausarPor: PAUSA_LIMITE_MS };
  const max = tentativasAutomaticas(erro);
  if (feitas < max) return { tentarEm: esperaDaTentativa(feitas), pausarPor: null };
  if (erro === "indisponivel" || erro === "interno") return { tentarEm: null, pausarPor: PAUSA_SERVIDOR_MS };
  return { tentarEm: null, pausarPor: null };
}

const URL_TROCA = `${String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "")}/functions/v1/trocar-token`;

/** Chama a `trocar-token` com o token do principal (nada é gravado aqui). */
export async function pedirTroca(tokenPrincipal: string, fetchImpl: typeof fetch = fetch): Promise<ResultadoTroca> {
  let r: Response;
  try {
    r = await fetchImpl(URL_TROCA, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenPrincipal}`, "x-schema": DB_SCHEMA },
      body: "{}",
    });
  } catch {
    return { ok: false, erro: "rede", status: 0 };
  }
  const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  if (r.status === 200 && corpo && typeof corpo.access_token === "string" && typeof corpo.refresh_token === "string") {
    return {
      ok: true,
      sessao: {
        access_token: corpo.access_token,
        refresh_token: corpo.refresh_token,
        expires_in: Number(corpo.expires_in) || undefined,
        expires_at: Number(corpo.expires_at) || undefined,
        token_type: (corpo.token_type as string) ?? "bearer",
        treino_user_id: String(corpo.treino_user_id ?? ""),
        papel: (corpo.papel as string | null) ?? null,
      },
    };
  }
  return { ok: false, erro: erroDaResposta(r.status, (corpo?.error as string) ?? null), status: r.status };
}

// ───────────────────────── de quem é a sessão do Treino guardada no aparelho ─────────────────────────

const CHAVE = "physiq_treino_de:";

/** Guarda que a sessão do Treino deste aparelho é da pessoa (login do principal) — abre sem internet sem nova troca. */
export function lembrarTreinoDe(principalUserId: string, treinoUserId: string): void {
  try {
    localStorage.setItem(CHAVE + principalUserId, treinoUserId);
  } catch {
    /* sem armazenamento: troca de novo na próxima abertura */
  }
}

export function treinoDe(principalUserId: string | null | undefined): string | null {
  if (!principalUserId) return null;
  try {
    return localStorage.getItem(CHAVE + principalUserId);
  } catch {
    return null;
  }
}

export function esquecerTrocas(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(CHAVE) || k.startsWith(PAUSA))) localStorage.removeItem(k);
    }
  } catch {
    /* noop */
  }
}

/** A sessão do Treino do aparelho serve para esta pessoa (é do usuário que a última troca dela devolveu)? */
export function sessaoTreinoServe(principalUserId: string | null | undefined, sessao: Pick<Session, "user"> | null | undefined): boolean {
  const esperado = treinoDe(principalUserId);
  return !!sessao?.user?.id && !!esperado && sessao.user.id === esperado;
}

/** Grava a sessão emitida pela troca no cliente do Treino (o PowerSync conecta com ela). */
export async function aplicarSessaoTreino(principalUserId: string, s: SessaoTreino): Promise<boolean> {
  const { data, error } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error || !data.session) return false;
  lembrarTreinoDe(principalUserId, data.session.user.id);
  return true;
}
