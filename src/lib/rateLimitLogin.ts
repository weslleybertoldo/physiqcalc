// Rate limit do login por e-mail/senha — SÓ o formulário do STAGING usa (pedido do Weslley, 13/09/2026):
// 3 erros seguidos → bloqueia 1 min; 4º erro → 3 min; depois 5 → 10 → 30 min → 1 h (teto).
// Contado POR E-MAIL e guardado no navegador (localStorage). Acerto zera; registro sem uso expira em 24 h.

/** Minutos de bloqueio a partir do 3º erro (índice 0 = 3º erro). O último valor é o teto. */
export const ESCADA_MINUTOS = [1, 3, 5, 10, 30, 60];
export const ERROS_ATE_BLOQUEAR = 3;
export const VALIDADE_REGISTRO_MS = 24 * 60 * 60 * 1000;
const PREFIXO_CHAVE = "physiq_login_erros:";

export interface RegistroLogin {
  /** erros seguidos (sem acerto no meio) */
  erros: number;
  /** epoch ms até quando o e-mail fica bloqueado; null = sem bloqueio */
  bloqueadoAte: number | null;
  /** epoch ms do último erro (usado pra expirar o registro) */
  ultimoErro: number;
}

/** Duração do bloqueio (ms) depois de `erros` erros seguidos; 0 = ainda não bloqueia. */
export function duracaoBloqueioMs(erros: number): number {
  if (erros < ERROS_ATE_BLOQUEAR) return 0;
  const idx = Math.min(erros - ERROS_ATE_BLOQUEAR, ESCADA_MINUTOS.length - 1);
  return ESCADA_MINUTOS[idx] * 60_000;
}

/** Registro novo depois de mais um erro. */
export function registrarErro(anterior: RegistroLogin | null, agora = Date.now()): RegistroLogin {
  const erros = (anterior?.erros ?? 0) + 1;
  const duracao = duracaoBloqueioMs(erros);
  return { erros, bloqueadoAte: duracao ? agora + duracao : null, ultimoErro: agora };
}

/** Quanto falta de bloqueio (ms); 0 = livre. */
export function restanteBloqueioMs(registro: RegistroLogin | null, agora = Date.now()): number {
  if (!registro?.bloqueadoAte) return 0;
  return Math.max(0, registro.bloqueadoAte - agora);
}

/** "m:ss" (ex.: 1 min = "1:00"; 1 h = "60:00"). Arredonda pra cima pro contador não mostrar 0:00 ainda bloqueado. */
export function formatarRestante(ms: number): string {
  const segundos = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Erro do Supabase Auth que conta como tentativa errada (credencial inválida). Rede/5xx/429 não contam. */
export function contaComoTentativa(erro: { status?: number; code?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "invalid_credentials" || erro.status === 400;
}

export function chaveRegistro(email: string): string {
  return PREFIXO_CHAVE + email.trim().toLowerCase();
}

/** Lê o registro do e-mail (null se não há, está inválido ou expirou). Não grava nada. */
export function lerRegistro(email: string, agora = Date.now()): RegistroLogin | null {
  try {
    const bruto = localStorage.getItem(chaveRegistro(email));
    if (!bruto) return null;
    const reg = JSON.parse(bruto) as Partial<RegistroLogin>;
    if (typeof reg.erros !== "number" || typeof reg.ultimoErro !== "number") return null;
    if (agora - reg.ultimoErro > VALIDADE_REGISTRO_MS) return null;
    return { erros: reg.erros, bloqueadoAte: typeof reg.bloqueadoAte === "number" ? reg.bloqueadoAte : null, ultimoErro: reg.ultimoErro };
  } catch {
    return null;
  }
}

/** Grava (ou apaga, com null) o registro do e-mail. Sem localStorage → segue sem bloqueio. */
export function gravarRegistro(email: string, registro: RegistroLogin | null): void {
  try {
    if (registro) localStorage.setItem(chaveRegistro(email), JSON.stringify(registro));
    else localStorage.removeItem(chaveRegistro(email));
  } catch {
    /* navegador sem storage: não bloqueia */
  }
}
