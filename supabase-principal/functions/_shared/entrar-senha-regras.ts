// Physiq W8b — regras PURAS da função entrar-senha (banco principal): sem Deno, sem rede e sem banco — testadas no Vitest
// (src/nucleo/entrarSenhaRegras.test.ts). A escada de bloqueio mora no banco (login_iniciar/login_concluir, migração W8b); aqui
// ficam a leitura do pedido, o IP de quem chama, a resposta do GoTrue e o formato da resposta para o app.

/** IP que a Cloudflare põe nos pedidos que um Worker repassa (o proxy api-principal): não é o do aparelho. */
export const IP_DO_WORKER = "2a06:98c0:3600::103";

export interface PedidoEntrar {
  email: string;
  senha: string;
  captcha: string;
}

const RE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** E-mail normalizado (minúsculas, sem espaço nas pontas) ou "" se não serve. */
export function normalizarEmail(v: unknown): string {
  const e = typeof v === "string" ? v.trim().toLowerCase() : "";
  return e.length >= 3 && e.length <= 320 && RE_EMAIL.test(e) ? e : "";
}

/** Corpo do pedido → dados validados (ou o código do erro). */
export function lerPedido(corpo: unknown): { ok: true; pedido: PedidoEntrar } | { ok: false; erro: "dados_invalidos" } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const email = normalizarEmail(c.email);
  const senha = typeof c.senha === "string" ? c.senha : "";
  const captcha = typeof c.captcha === "string" ? c.captcha.trim() : "";
  if (!email || !senha || senha.length > 200 || captcha.length > 4096) return { ok: false, erro: "dados_invalidos" };
  return { ok: true, pedido: { email, senha, captcha } };
}

/** Comparação em tempo constante (o segredo do proxy). Segredo curto = sempre recusa. */
export function segredoIgual(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  const a = recebido || "";
  const b = esperado || "";
  if (b.length < 32 || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const pareceIp = (v: string) => /^[0-9a-f:.]{3,45}$/i.test(v);

/**
 * IP do aparelho. Pelo proxy api-principal (Worker) a Cloudflare troca o cf-connecting-ip pelo IP do Worker — o Worker manda o
 * IP de verdade em x-physiq-ip, junto com o segredo do proxy (sem o segredo, o cabeçalho é ignorado: qualquer um poderia
 * inventar). Direto no supabase.co vale o cf-connecting-ip (a Cloudflare recusa cabeçalho falso). IP do Worker sem o segredo =
 * desconhecido (null): contar todo mundo como um IP só viraria um limite global.
 */
export function ipDoPedido(h: { get(nome: string): string | null }, segredoProxy: string | null | undefined): string | null {
  if (segredoIgual(h.get("x-physiq-proxy"), segredoProxy)) {
    const ip = (h.get("x-physiq-ip") || "").trim();
    if (ip && pareceIp(ip)) return ip.toLowerCase();
  }
  const candidatos = [h.get("cf-connecting-ip"), (h.get("x-forwarded-for") || "").split(",")[0], h.get("x-real-ip")];
  for (const c of candidatos) {
    const ip = (c || "").trim().toLowerCase();
    if (ip && pareceIp(ip)) return ip === IP_DO_WORKER ? null : ip;
  }
  return null;
}

export type CategoriaGoTrue = "ok" | "senha_errada" | "desativado" | "nao_confirmado" | "limite" | "falha";

/**
 * Resposta do GoTrue (POST /auth/v1/token?grant_type=password) → o que aconteceu. Só "senha_errada" conta na escada
 * (invalid_credentials = senha errada OU e-mail sem conta — o GoTrue não diferencia, e a escada também não).
 */
export function categoriaGoTrue(status: number, corpo: unknown): CategoriaGoTrue {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  if (status === 200 && typeof c.access_token === "string" && typeof c.refresh_token === "string") return "ok";
  const codigo = String(c.error_code ?? c.code ?? "").toLowerCase();
  const msg = String(c.msg ?? c.message ?? c.error_description ?? c.error ?? "").toLowerCase();
  if (status === 429 || codigo === "over_request_rate_limit") return "limite";
  if (codigo === "user_banned" || msg.includes("banned")) return "desativado";
  if (codigo === "email_not_confirmed" || msg.includes("not confirmed")) return "nao_confirmado";
  if (codigo === "invalid_credentials" || msg.includes("invalid login credentials") || (status === 400 && codigo === "invalid_grant")) return "senha_errada";
  return "falha";
}

/** Resposta do siteverify do Turnstile → aceita? (sucesso e, se veio a ação, a do entrar). */
export function captchaAceito(r: unknown, acao = "entrar"): boolean {
  const c = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  if (c.success !== true) return false;
  return !c.action || c.action === acao;
}

/**
 * hml-10 (H-24) — o porquê da recusa do captcha para o log, no formato de código ([a-z0-9_]): o 1º "error-codes" do siteverify
 * ("invalid-input-response" → "invalid_input_response"); sem código (o Turnstile aceitou, mas o widget era de outra ação) →
 * "acao_diferente". O log confere o formato (fora dele, "?").
 */
export function motivoDoCaptcha(r: unknown): string {
  const c = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const codigos = Array.isArray(c["error-codes"]) ? c["error-codes"] : [];
  return codigos.length ? String(codigos[0]).toLowerCase().replace(/-/g, "_") : "acao_diferente";
}

export interface EstadoBloqueio {
  erros?: number;
  bloqueado_ate?: string | null;
  bloqueado_de_vez?: boolean;
  restam?: number;
  agora?: string;
  motivo?: string;
}

/** Recusa antes de conferir a senha (login_iniciar) → corpo da resposta (HTTP 423). */
export function corpoRecusa(ini: EstadoBloqueio): Record<string, unknown> {
  const motivo = ini.motivo === "bloqueado_de_vez" ? "bloqueado_de_vez" : ini.motivo === "ip" ? "muitas_tentativas_rede"
    : ini.motivo === "em_andamento" ? "em_andamento" : "bloqueado";
  return {
    ok: false,
    erro: motivo,
    bloqueado_ate: motivo === "bloqueado_de_vez" ? null : ini.bloqueado_ate ?? null,
    bloqueado_de_vez: motivo === "bloqueado_de_vez",
    agora: ini.agora ?? new Date().toISOString(),
  };
}

/** Senha errada (login_concluir) → corpo da resposta (HTTP 400): o app mostra o tempo de espera ou o bloqueio de vez. */
export function corpoSenhaErrada(est: EstadoBloqueio): Record<string, unknown> {
  return {
    ok: false,
    erro: est.bloqueado_de_vez ? "bloqueado_de_vez" : "senha_errada",
    erros: est.erros ?? null,
    restam: est.restam ?? null,
    bloqueado_ate: est.bloqueado_de_vez ? null : est.bloqueado_ate ?? null,
    bloqueado_de_vez: !!est.bloqueado_de_vez,
    agora: est.agora ?? new Date().toISOString(),
  };
}

/** Hash do IP (SHA-256 com sal do servidor, em hex): o banco guarda a contagem, nunca o IP. */
export async function hashDoIp(ip: string, sal: string): Promise<string> {
  const dados = new TextEncoder().encode(`physiq-login:${sal}:${ip}`);
  const d = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash do token do captcha (o banco guarda só o hash dos tokens usados — cada um vale uma tentativa). */
export async function hashDoToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`physiq-captcha:${token}`));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
