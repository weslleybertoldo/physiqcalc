// Physiq W3 — regras PURAS do login único no banco principal (pos-login e vincular-aluno). Sem Deno, sem rede e sem
// banco: testadas no Vitest (src/nucleo/loginRegras.test.ts). As de sessão são as MESMAS da trocar-token do Banco do
// Treino (supabase/functions/_shared/espelho/regras.ts) — cada banco publica as suas funções, então o código é repetido
// e o teste confere que as duas cópias concordam.

export interface UsuarioAuth {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null;
}

/** Payload do JWT (sem conferir a assinatura — quem confere é o GET /auth/v1/user, antes). */
export function claimsDoJwt(token: string): Record<string, unknown> | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const b64 = partes[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)))
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function emailConfirmado(u: UsuarioAuth): boolean {
  return !!(u.email && u.email.trim()) && !!(u.email_confirmed_at || u.confirmed_at);
}

/**
 * O login desta sessão foi pelo Google? A sessão nasceu de OAuth (claim amr) E a conta tem a identidade Google com o MESMO
 * e-mail, verificado pelo Google (igual à trocar-token).
 */
export function ehLoginGoogle(claims: Record<string, unknown> | null, u: UsuarioAuth): boolean {
  const amr = Array.isArray(claims?.amr) ? (claims!.amr as Array<Record<string, unknown>>) : [];
  if (!amr.some((m) => m && m.method === "oauth")) return false;
  const email = (u.email || "").trim().toLowerCase();
  if (!email) return false;
  return (u.identities || []).some((i) => {
    if (i?.provider !== "google") return false;
    const d = i.identity_data || {};
    const emailIdentidade = String(d.email ?? "").trim().toLowerCase();
    const verificado = d.email_verified === true || d.email_verified === "true";
    return emailIdentidade === email && verificado;
  });
}

/** Staging só aceita conta de teste (P26): os e-mails de teste dos 2 apps. */
export function emailDeTeste(email: string | null | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (e === "teste@teste.com") return true;
  return /^[a-z0-9._+-]*teste[a-z0-9._+-]*@physiq(calc|nutri)\.app$/.test(e);
}

export function temIdentidade(u: UsuarioAuth, provedor: string): boolean {
  return (u.identities || []).some((i) => i?.provider === provedor);
}

/**
 * P25: 1ª entrada com o Google numa conta que o profissional criou com e-mail e senha → a senha antiga é trocada por uma
 * aleatória (segurança; a pessoa pode criar outra no Perfil). Só uma vez (marca app_metadata.senha_trocada_google_em).
 */
export function deveTrocarSenha(p: { loginGoogle: boolean; temIdentidadeEmail: boolean; temSenha: boolean; jaTrocou: boolean }): boolean {
  return p.loginGoogle && p.temIdentidadeEmail && p.temSenha && !p.jaTrocou;
}

/** Senha aleatória forte (a pessoa nunca a vê). */
export function senhaAleatoria(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// ───────────────────────── legado do Calc (a ponte do pos-login = o script 01 para uma pessoa) ─────────────────────────

/** Professor do Calc como o Banco do Treino devolve (vincular-professor, modo servidor). */
export interface ProfessorCalc {
  codigo_convite: string | null;
  nome: string | null;
  status: string | null;
  plano_nome: string | null;
  trial_ate: string | null;
  adesao_paga_em: string | null;
  ciclo_vence_em: string | null;
  anual_ate: string | null;
  cobranca_pausada: boolean | null;
  acesso_liberado_ate: string | null;
  master: boolean;
}

export type Faixa = "f10" | "f30" | "f100" | "livre";

/** Plano do Calc → faixa (spec 6.3): Start → f10, Studio → f30, Pro → f100, Ilimitado → livre. */
export function faixaDoPlanoCalc(nome: string | null | undefined, master = false): Faixa {
  const n = (nome || "").trim().toLowerCase();
  if (n === "studio") return "f30";
  if (n === "pro") return "f100";
  if (n === "ilimitado") return "livre";
  if (n === "start") return "f10";
  return master ? "livre" : "f10";
}

export interface ContaLegadoCalc {
  faixa: Faixa;
  situacao: "teste" | "ativa" | "vencida" | "isenta" | "suspensa";
  teste_ate: string | null;
  vence_em: string | null;
  tolerancia_dias: number;
  isenta_motivo: string | null;
}

const d10 = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);

/**
 * Situação informativa da conta 'legado_calc' (a cobrança continua no Calc até a W28, que recalcula com o script 03):
 * master → isenta; suspenso → suspensa; cobrança pausada → isenta ("pausada pelo master"); senão o maior entre ciclo, anual,
 * teste e liberação (tolerância de 7 dias só quando o maior é o ciclo — a regra da physiq_professor_acesso_ok).
 */
export function contaLegadoCalc(p: ProfessorCalc, hoje: string): ContaLegadoCalc {
  const faixa = faixaDoPlanoCalc(p.plano_nome, p.master);
  const base = { faixa, teste_ate: null, vence_em: null, tolerancia_dias: 0, isenta_motivo: null };
  if (p.master) return { ...base, situacao: "isenta", isenta_motivo: "master" };
  if (p.status === "suspenso") return { ...base, situacao: "suspensa" };
  if (p.cobranca_pausada) return { ...base, situacao: "isenta", isenta_motivo: "pausada pelo master" };
  const candidatos: Array<{ data: string; tipo: "ciclo" | "anual" | "teste" | "liberado" }> = [];
  const ciclo = p.adesao_paga_em ? d10(p.ciclo_vence_em) : null;
  if (ciclo) candidatos.push({ data: ciclo, tipo: "ciclo" });
  if (d10(p.anual_ate)) candidatos.push({ data: d10(p.anual_ate)!, tipo: "anual" });
  if (!p.adesao_paga_em && d10(p.trial_ate)) candidatos.push({ data: d10(p.trial_ate)!, tipo: "teste" });
  if (d10(p.acesso_liberado_ate)) candidatos.push({ data: d10(p.acesso_liberado_ate)!, tipo: "liberado" });
  if (!candidatos.length) return { ...base, situacao: "vencida" };
  const maior = candidatos.reduce((a, b) => (b.data > a.data ? b : a));
  const tolerancia = maior.tipo === "ciclo" ? 7 : 0;
  if (maior.tipo === "teste") {
    return { ...base, situacao: maior.data >= hoje ? "teste" : "vencida", teste_ate: maior.data, vence_em: maior.data };
  }
  const limite = somarDiasIso(maior.data, tolerancia);
  return { ...base, situacao: limite >= hoje ? "ativa" : "vencida", vence_em: maior.data, tolerancia_dias: tolerancia };
}

export function somarDiasIso(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Hoje em São Paulo (AAAA-MM-DD). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Comparação de segredo em tempo constante (ESPELHO_SEGREDO). Segredo curto = sempre recusa. */
export function segredoConfere(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = recebido || "";
  const b = esperado || "";
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Origens aceitas pelas funções do login (o site do Physiq, o staging, o APK e o dev local). */
export function origemPermitida(origin: string | null): boolean {
  if (!origin) return false;
  if (/^(https:\/\/(www\.)?physiqcalc\.com\.br|https:\/\/physiqcalc-staging\.vercel\.app|https:\/\/localhost|capacitor:\/\/localhost)$/.test(origin)) return true;
  return /^http:\/\/localhost:(5173|8080)$/.test(origin);
}
