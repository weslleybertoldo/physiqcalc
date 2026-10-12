// supabase-principal/functions/_shared/recebimento-regras.ts
// Physiq W1 — regras PURAS de Configurações › Recebimento pela função (jeito 2): os modos e o pedido do prof_recebimento_salvar.
// Reexportadas para a tela (src/financeiro/recebimento.ts) e testadas em src/financeiro/recebimento.test.ts.
// W2 (Mercado Pago do personal — Task 7): o modo 'mercadopago_conta' e as recusas das ações do Recebimento com o MP da conta — a guarda do
// modo (contas_guard_mp, P0001), a confirmação da conexão (recebimento_mp_confirmar) e o cancelamento das automáticas: sempre um código
// com 4xx/5xx para a tela, nunca o 500 de erro interno.
import { normalizarHandle } from "./infinitepay-regras.ts";

export type ModoRecebimento = "pix_manual" | "nenhum" | "mercadopago" | "infinitepay" | "mercadopago_conta";
/** A ordem da tela. 'mercadopago' = o Mercado Pago do Physiq (só o master liga — fica igual); 'infinitepay' = W1; 'mercadopago_conta' = W2
 *  (o Mercado Pago DO PERSONAL: o dono conecta a conta dele e o dinheiro cai direto nela). */
export const MODOS: readonly ModoRecebimento[] = ["pix_manual", "infinitepay", "mercadopago_conta", "mercadopago", "nenhum"];
export const ROTULO_MODO: Record<ModoRecebimento, string> = {
  pix_manual: "PIX NA CHAVE", infinitepay: "INFINITEPAY", mercadopago_conta: "MERCADO PAGO (SUA CONTA)", mercadopago: "MERCADO PAGO",
  nenhum: "POR FORA",
};

export function ehModo(v: unknown): v is ModoRecebimento {
  return typeof v === "string" && (MODOS as readonly string[]).includes(v);
}

/** W2: os 2 Mercados Pagos — o do Physiq (o master liga) e o da conta do personal (OAuth). Sair de qualquer um com cobrança automática
 *  viva cancela antes (a regra cruzada do spec-review; no banco, a guarda contas_guard_mp). */
export function ehModoMp(m: string | null | undefined): m is "mercadopago" | "mercadopago_conta" {
  return m === "mercadopago" || m === "mercadopago_conta";
}

export interface PedidoRecebimento {
  modo?: ModoRecebimento;
  bloquear?: boolean;
  /** a InfiniteTag normalizada; null = tirar; ausente = não mexe */
  handle?: string | null;
  /** o OK de quem troca de forma com cobrança automática viva no Mercado Pago (409 automaticas_ativas antes) */
  cancelarAutomaticas: boolean;
}

export function lerPedidoDoRecebimento(b: Record<string, unknown>): { ok: true; pedido: PedidoRecebimento } | { ok: false; erro: string } {
  const pedido: PedidoRecebimento = { cancelarAutomaticas: b.cancelar_automaticas === true };
  if ("modo" in b) {
    if (!ehModo(b.modo)) return { ok: false, erro: "modo_invalido" };
    pedido.modo = b.modo;
  }
  if ("bloquear" in b) {
    if (typeof b.bloquear !== "boolean") return { ok: false, erro: "bloquear_invalido" };
    pedido.bloquear = b.bloquear;
  }
  if ("handle" in b) {
    if (b.handle === null || b.handle === "") pedido.handle = null;
    else {
      const h = normalizarHandle(b.handle);
      if (!h) return { ok: false, erro: "infinitetag_invalida" };
      pedido.handle = h;
    }
  }
  if (pedido.modo === undefined && pedido.bloquear === undefined && pedido.handle === undefined) return { ok: false, erro: "nada_para_salvar" };
  return { ok: true, pedido };
}

/** O que uma ação do Recebimento responde quando algo é recusado: o código (a tela traduz), o HTTP e o extra da resposta. */
export interface RecusaDoRecebimento {
  codigo: string;
  http: number;
  extra: Record<string, unknown>;
}

/** W2: a guarda do modo (contas_guard_mp — P0001, vale para TODO MUNDO: dono, master e servidor) recusou a troca: entrar no MP da conta sem
 *  a conexão ativa (mp_conta_sem_integracao) ou sair de um MP com automática viva (automaticas_ativas:<n>) — 409 com o código. Qualquer
 *  outro erro → null (quem chama lança: o 500 de sempre). */
export function erroDaGuardaDoModo(e: { code?: unknown; message?: unknown } | null | undefined): RecusaDoRecebimento | null {
  if (String(e?.code ?? "") !== "P0001") return null;
  const msg = String(e?.message ?? "").trim();
  if (msg === "mp_conta_sem_integracao") return { codigo: msg, http: 409, extra: {} };
  const vivas = /^automaticas_ativas:(\d{1,9})$/.exec(msg);
  return vivas ? { codigo: "automaticas_ativas", http: 409, extra: { alunos: Number(vivas[1]) } } : null;
}

/** W2 (revisão I8): a recusa da recebimento_mp_confirmar → o código da tela, com o prefixo mp_ (a tela mostra o TEXTO_DO_RETORNO de mesmo
 *  nome sem ele): 403 para quem não pode (a conexão é de outra pessoa; a flag desligada — o mesmo HTTP das outras ações) e 409 para o resto;
 *  o outra_conta (I5) leva quantos pagamentos seguem abertos na conta antiga. Código fora do formato → mp_invalido. */
export function erroDaConfirmacao(r: { erro?: unknown; abertos?: unknown }): RecusaDoRecebimento {
  const erro = typeof r.erro === "string" && /^[a-z_]{1,40}$/.test(r.erro) ? r.erro : "invalido";
  const codigo = erro.startsWith("mp_") ? erro : `mp_${erro}`;
  return {
    codigo,
    http: codigo === "mp_outra_pessoa" || codigo === "mp_conta_em_teste" ? 403 : 409,
    extra: codigo === "mp_outra_conta" ? { abertos: Number(r.abertos) || 0 } : {},
  };
}

/** W2 (MENOR 11): o resultado do cancelamento das automáticas (cancelarAssinaturasPorCredencial — nunca lança por causa do MP) → null (todas
 *  desligadas: segue) ou a recusa, e então nada mais muda (o modo e a conexão ficam): a conta do MP sem acesso (desconectada, conexão
 *  caída, outra conta do MP, a chave dos tokens ausente) → 409 mp_sem_acesso — o dono conecta de novo ou desliga no app do Mercado Pago; o
 *  MP recusou ou não respondeu → 502 automaticas_nao_canceladas. */
export function recusaDoCancelamento(r: { canceladas?: number; falhas: number; semAcesso: number }): RecusaDoRecebimento | null {
  if (r.semAcesso > 0) return { codigo: "mp_sem_acesso", http: 409, extra: { alunos: r.semAcesso, falhas: r.falhas } };
  if (r.falhas > 0) return { codigo: "automaticas_nao_canceladas", http: 502, extra: { falhas: r.falhas } };
  return null;
}

/** W2: desconectar o MP da conta no modo dele → o Pix na chave (com uma chave ligada) ou "não cobrar pelo app". */
export function modoDepoisDeDesconectar(temChaveLigada: boolean): ModoRecebimento {
  return temChaveLigada ? "pix_manual" : "nenhum";
}
