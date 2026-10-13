// Physiq hml-21a (H-109 · jeito 2, etapa 3, 12/10/2026) — a conferência LOCAL do token do principal (o JWT de quem chama), sem a ida ao
// Auth: a assinatura pela chave pública do projeto (o JWKS do GoTrue, /auth/v1/.well-known/jwks.json — ES256, conferido em 12/10 21:00),
// o emissor (<SUPABASE_URL>/auth/v1), a audiência ("authenticated") e o prazo (exp). É a receita que 13 funções do Treino já usam
// (admin-avaliacoes:usuarioDoToken), com UMA diferença pedida pela hml-21a: o token inválido ou vencido NÃO cai no getUser — volta 401 na
// hora, como o getUser responderia —; só a falha que não é do token (a rede, o JWKS fora, a chave que não está no conjunto, um emissor ou
// uma audiência que esta instância não conhece) cai no getUser de sempre (a reserva). O REST direto de hoje também só confere assinatura e
// prazo (não a revogação): um token revogado lê até vencer (≤ 1 h) — por isso a porta usa isto SÓ no `ler` (opção jwtLeitura da porta).
// O conjunto de chaves fica na memória da instância (o cacheMaxAge do jose: 10 min) e a 1ª ida espera no máximo JWKS_TEMPO_MS.
// Usado por _shared/porta-pessoa.ts (opção jwtLeitura: "jwks"). Testado no src/integrations/portaPessoa.test.ts (jose e o Deno falsos).
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

/** Quanto a busca do JWKS pode demorar (a 1ª de cada instância; passou → a reserva, o getUser). */
export const JWKS_TEMPO_MS = 3000;

/**
 * Os códigos do jose em que o TOKEN não vale — o getUser também recusaria (401): vencido, assinatura que não confere com a chave do
 * próprio kid, JWS/JWT malformado. Qualquer outro (rede, JWKS, chave ausente, algoritmo, emissor/audiência) → a reserva.
 */
export const ERROS_DE_TOKEN_INVALIDO = ["ERR_JWT_EXPIRED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWS_INVALID", "ERR_JWT_INVALID"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConferenciaLocal =
  | { ok: true; userId: string }
  | { ok: false; motivo: "invalido" }
  /** `causa` = o código do jose em minúsculas (ex.: err_jwks_timeout) ou "rede"/"sem_sub"/"sem_url" — só para o log da porta */
  | { ok: false; motivo: "reserva"; causa: string };

/** O desfecho de uma falha do jose: o token não vale (401) ou a reserva (o getUser), com a causa curta para o log. */
export function motivoDaFalha(e: unknown): { motivo: "invalido" } | { motivo: "reserva"; causa: string } {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && (ERROS_DE_TOKEN_INVALIDO as readonly string[]).includes(code)) return { motivo: "invalido" };
  if (typeof code === "string" && /^ERR_[A-Z_]{1,40}$/.test(code)) return { motivo: "reserva", causa: code.toLowerCase() };
  return { motivo: "reserva", causa: "rede" };
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Confere o token AQUI (sem o Auth): { ok, userId } · inválido/vencido · a reserva (o getUser). Nunca lança. */
export async function conferirJwtLocal(token: string): Promise<ConferenciaLocal> {
  if (!SUPABASE_URL) return { ok: false, motivo: "reserva", causa: "sem_url" };
  try {
    jwks ??= createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`), { timeoutDuration: JWKS_TEMPO_MS });
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
      // revisão da 21a (⚪2): só ES256 (as chaves do projeto) e exp/sub obrigatórios — o que não passar cai no getUser de reserva
      algorithms: ["ES256"],
      requiredClaims: ["exp", "sub"],
    });
    if (typeof payload.sub === "string" && UUID.test(payload.sub)) return { ok: true, userId: payload.sub };
    return { ok: false, motivo: "reserva", causa: "sem_sub" };
  } catch (e) {
    const m = motivoDaFalha(e);
    return m.motivo === "invalido" ? { ok: false, motivo: "invalido" } : { ok: false, motivo: "reserva", causa: m.causa };
  }
}
