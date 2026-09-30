// Limite de tentativas do login por e-mail e senha — desde a W8b (30/09/2026) quem CONTA é o SERVIDOR (função entrar-senha do
// banco principal, por conta e por IP; regra dele: 4 senhas erradas → 1 min; cada erro depois sobe 5 → 15 → 30 → 60 min; o
// seguinte bloqueia de vez). O aparelho só SEGUE o que o servidor respondeu — guarda o fim do bloqueio que veio na resposta
// (acertado pelo relógio do servidor) para mostrar o tempo que falta e não mandar a mesma senha de novo antes da hora. Não conta
// nada sozinho (sem contar duas vezes). Por e-mail, no localStorage; registro sem uso expira em 24 h (o de vez fica até entrar).

export const VALIDADE_REGISTRO_MS = 24 * 60 * 60 * 1000;
const PREFIXO_CHAVE = "physiq_login_bloqueio:";

export type MotivoBloqueio = "conta" | "rede";

export interface RegistroLogin {
  /** epoch ms (relógio DESTE aparelho) até quando o servidor disse que está bloqueado; null = sem espera */
  bloqueadoAte: number | null;
  /** o servidor bloqueou a conta de vez (só senha nova do profissional ou o Google destravam) */
  deVez: boolean;
  /** conta (a escada) ou a rede (muitas tentativas do mesmo IP) */
  motivo: MotivoBloqueio;
  /** quando a resposta chegou (epoch ms) — expira o registro */
  em: number;
}

export interface RespostaBloqueio {
  erro: string;
  bloqueado_ate?: string | null;
  bloqueado_de_vez?: boolean;
  agora?: string | null;
}

/**
 * Resposta do servidor → registro do aparelho (null = nada a guardar). O fim do bloqueio vem no relógio do servidor: o aparelho
 * soma a diferença ao próprio relógio (aparelho com a hora errada não encurta nem estica a espera).
 */
export function registroDaResposta(r: RespostaBloqueio, agoraLocal = Date.now()): RegistroLogin | null {
  const deVez = r.bloqueado_de_vez === true || r.erro === "bloqueado_de_vez";
  const motivo: MotivoBloqueio = r.erro === "muitas_tentativas_rede" ? "rede" : "conta";
  if (deVez) return { bloqueadoAte: null, deVez: true, motivo: "conta", em: agoraLocal };
  const fim = r.bloqueado_ate ? Date.parse(r.bloqueado_ate) : NaN;
  if (!Number.isFinite(fim)) return null;
  const agoraServidor = r.agora ? Date.parse(r.agora) : NaN;
  const restante = Number.isFinite(agoraServidor) ? fim - agoraServidor : fim - agoraLocal;
  if (restante <= 0) return null;
  return { bloqueadoAte: agoraLocal + restante, deVez: false, motivo, em: agoraLocal };
}

/** Quanto falta de bloqueio (ms); 0 = livre (o de vez não tem tempo: use `deVez`). */
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

export function chaveRegistro(email: string): string {
  return PREFIXO_CHAVE + email.trim().toLowerCase();
}

/** Lê o registro do e-mail (null se não há, está inválido, expirou ou a espera acabou). Não grava nada. */
export function lerRegistro(email: string, agora = Date.now()): RegistroLogin | null {
  if (!email.trim()) return null;
  try {
    const bruto = localStorage.getItem(chaveRegistro(email));
    if (!bruto) return null;
    const reg = JSON.parse(bruto) as Partial<RegistroLogin>;
    if (typeof reg.em !== "number") return null;
    const deVez = reg.deVez === true;
    if (!deVez && agora - reg.em > VALIDADE_REGISTRO_MS) return null;
    const bloqueadoAte = typeof reg.bloqueadoAte === "number" ? reg.bloqueadoAte : null;
    if (!deVez && (!bloqueadoAte || bloqueadoAte <= agora)) return null;
    return { bloqueadoAte, deVez, motivo: reg.motivo === "rede" ? "rede" : "conta", em: reg.em };
  } catch {
    return null;
  }
}

/** Grava (ou apaga, com null) o registro do e-mail. Sem localStorage → segue sem o aviso guardado (o servidor continua valendo). */
export function gravarRegistro(email: string, registro: RegistroLogin | null): void {
  try {
    if (registro) localStorage.setItem(chaveRegistro(email), JSON.stringify(registro));
    else localStorage.removeItem(chaveRegistro(email));
  } catch {
    /* navegador sem storage */
  }
}
