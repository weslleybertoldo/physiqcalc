/**
 * hml-22 (H-22) — o 2FA do master no site: as regras PURAS (sem rede e sem chamar o Auth). Entram no bundle do app — a sessão
 * (src/nucleo/sessao.tsx) usa —, sem nenhuma marca do master: as telas do 2FA (src/master/doisFatores/) ficam só no site.
 *
 * A regra é a do banco (master_aal_ok, migração 20261014200000_hml22_master_2fa.sql) vista do lado da tela: quem tem um fator
 * VERIFICADO (o `user.factors` que o Auth devolve no login e a cada renovação, guardado na sessão) e entrou só com a senha ou o
 * Google (o token `aal1`) precisa do código do app autenticador antes de qualquer área logada. Depois do código, o token é `aal2`.
 * Sem fator (hoje: todo mundo), nunca pede. É a mesma conta do getAuthenticatorAssuranceLevel() do supabase-js (o nextLevel aal2 ×
 * o currentLevel do token), sem ir à rede.
 */
import type { Session } from "@supabase/supabase-js";
import { claimsDoToken } from "./senha";

/** O que a sessão expõe para as telas: "pede_codigo" = mostrar a tela do código antes da área logada. */
export type DoisFatores = "livre" | "pede_codigo";

/** Um fator do Auth como vem em `user.factors` (só o que as telas usam). */
export interface FatorDaSessao {
  id: string;
  status: string;
  factor_type: string;
  created_at: string | null;
  updated_at: string | null;
}

/** Os fatores VERIFICADOS de uma lista do Auth (qualquer tipo; hoje só o TOTP está ligado). O que não é fator fica de fora. */
export function fatoresVerificados(fatores: unknown): FatorDaSessao[] {
  if (!Array.isArray(fatores)) return [];
  return fatores
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && (f as { status?: unknown }).status === "verified")
    .filter((f) => typeof f.id === "string" && f.id.length > 0)
    .map((f) => ({
      id: f.id as string,
      status: "verified",
      factor_type: typeof f.factor_type === "string" ? f.factor_type : "",
      created_at: typeof f.created_at === "string" ? f.created_at : null,
      updated_at: typeof f.updated_at === "string" ? f.updated_at : null,
    }));
}

/** O nível do login no token (`aal1` = senha ou Google; `aal2` = depois do código). Sem token ou sem a claim → null. */
export function aalDoToken(token: string | null | undefined): string | null {
  const aal = claimsDoToken(token)?.aal;
  return typeof aal === "string" ? aal : null;
}

/**
 * A sessão precisa do código? Fator verificado na sessão E o token sem `aal2` (o token sem a claim conta como sem `aal2`). Sem sessão
 * ou sem fator → não.
 */
export function pedeCodigo(sessao: Pick<Session, "access_token" | "user"> | null | undefined): boolean {
  if (!sessao?.user) return false;
  return fatoresVerificados(sessao.user.factors).length > 0 && aalDoToken(sessao.access_token) !== "aal2";
}

/** O estado da sessão para as telas (o `doisFatores` do useSessao). */
export function estadoDoisFatores(sessao: Pick<Session, "access_token" | "user"> | null | undefined): DoisFatores {
  return pedeCodigo(sessao) ? "pede_codigo" : "livre";
}

/** O fator a pedir na tela do código: o TOTP verificado (o 1º; o cadastro deixa 1 só). Nenhum → null. */
export function fatorParaPedir(fatores: unknown): FatorDaSessao | null {
  const verificados = fatoresVerificados(fatores);
  return verificados.find((f) => f.factor_type === "totp") ?? verificados[0] ?? null;
}

/** O código do app autenticador: exatamente 6 números (o que vier com espaço ou traço é limpo antes). */
export function codigoValido(codigo: string): boolean {
  return /^\d{6}$/.test(codigo);
}

/** Só os números do que a pessoa digitou ou colou (até 6). */
export function limparCodigo(texto: string): string {
  return (texto || "").replace(/\D/g, "").slice(0, 6);
}

/** Os erros do código, com os textos da tela (contrato hml-22 §2.5). */
export type ErroCodigo = "errado" | "muitas" | "falhou" | "sem_fator";

export const TEXTO_ERRO_CODIGO: Record<Exclude<ErroCodigo, "sem_fator">, string> = {
  errado: "Código errado. Confira o app e tente de novo.",
  muitas: "Muitas tentativas. Espere alguns minutos.",
  falhou: "Não deu para conferir agora. Tente de novo.",
};

/**
 * O erro do Auth (o `{ status, code }` do supabase-js) → o erro da tela: o código que não confere (422 mfa_verification_failed) →
 * "errado"; o limite do Auth (429) → "muitas"; o fator que não existe mais (o suporte apagou: 404/422 mfa_factor_not_found) →
 * "sem_fator" (a tela relê a sessão e sai); o resto (rede, desafio vencido, servidor) → "falhou".
 */
export function erroDoCodigo(erro: unknown): ErroCodigo {
  const e = (erro ?? {}) as { status?: unknown; code?: unknown };
  const codigo = typeof e.code === "string" ? e.code : "";
  if (e.status === 429 || codigo === "over_request_rate_limit") return "muitas";
  if (codigo === "mfa_factor_not_found") return "sem_fator";
  if (codigo === "mfa_verification_failed") return "errado";
  return "falhou";
}

/**
 * O QR do cadastro pronto para o <img>: o supabase-js entrega o SVG do Auth cru atrás de "data:image/svg+xml;utf-8," — um "#" (cor)
 * ou um "%" dentro do SVG quebraria a imagem (o "#" vira o fim da URL). Aqui o SVG vai codificado; outro formato passa como veio.
 */
export function qrComoImagem(qr: string): string {
  const prefixo = "data:image/svg+xml;utf-8,";
  if (!qr.startsWith(prefixo)) return qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.slice(prefixo.length))}`;
}

/** "dd/mm/aaaa" do dia em que o fator foi verificado (o updated_at do fator; sem ele, o created_at) — o "Ligada desde". */
export function ligadaDesde(fator: Pick<FatorDaSessao, "created_at" | "updated_at"> | null | undefined): string | null {
  const iso = fator?.updated_at || fator?.created_at;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}
