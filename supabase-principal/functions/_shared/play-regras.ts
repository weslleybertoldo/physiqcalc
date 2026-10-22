// Physiq play-W6 (16/10/2026) — as regras PURAS da assinatura da Google Play (sem Deno, sem rede, sem banco): o Vitest importa este
// arquivo (src/lib/playRegrasServidor.test.ts). Quem usa: _shared/play-api.ts (as idas ao Google), _shared/play-assinaturas.ts (o banco e
// a ordem), play-compras e play-conferir.
//   · o estado do Google (purchases.subscriptionsv2 — a fonte da verdade) → o nosso, e se ele cobre (dá acesso);
//   · a leitura do GET (o produto vigente, o fim do período, o pedido PAGO, o preço, o dono pela matrícula opaca, a ligação com a compra
//     anterior) e a conferência da compra (pacote, produto, dono);
//   · o defer (≥ 1 dia e ≤ 1 ano por chamada) e o modo da troca (para o completo na hora; para o Treino na renovação);
//   · a conferência de hora em hora (22/10/2026): a página da Voided Purchases API e a janela dela. O aviso do Google pelo Pub/Sub (o
//     RTDN em base64 e o token OIDC do push) saiu junto com a play-rtdn em 22/10/2026: sem faturamento no Google Cloud não há Pub/Sub.
// Decisões de 16/10/2026 (sessão principal): o vínculo e a exclusão cancelam SEM devolver (DEVELOPER_REQUESTED_STOP_PAYMENTS: vale até o
// fim — igual ao MP); o modo mora numa constante só (CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO) — trocar para devolver o que falta é o
// revoke com proratedRefund (play-api.ts › revogar).

export type Schema = "public" | "staging";

/** O pacote do app nas 2 versões (a da loja e o APK do site). */
export const PACOTE = "com.bertoldo.physiqcalc";
/** Os produtos de assinatura da Play = os códigos dos planos do app no banco (planos_aluno.codigo da conta do app). */
export const PRODUTOS = ["app_treino", "app_treino_alimentacao"] as const;
export type ProdutoPlay = (typeof PRODUTOS)[number];
/** O plano básico mensal de cada produto (Play Console). */
export const PLANO_BASE = "mensal";
/** O escopo da conta de serviço (Google Play Developer API). */
export const ESCOPO_PLAY = "https://www.googleapis.com/auth/androidpublisher";
/** A API da Google Play (o simulador local troca por http://127.0.0.1:<porta> — baseLocal). */
export const API_PLAY = "https://androidpublisher.googleapis.com";
/** Decisão 7 (16/10/2026): o vínculo e a exclusão cancelam SEM devolver — vale até o fim do período pago (igual ao MP). */
export const CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO = "DEVELOPER_REQUESTED_STOP_PAYMENTS" as const;
/** O defer: de 1 dia a 1 ano por chamada ([PBL] subscriptions). */
export const DIA_MS = 86_400_000;
export const MAX_DIAS_ADIAR = 365;

export type EstadoPlay =
  | "pendente" | "ativa" | "cancelada" | "carencia" | "suspensa" | "pausada" | "expirada" | "revogada" | "substituida";

/** As que ainda valem ou podem voltar a valer (1 por matrícula no banco — play_assinaturas_viva_uq). */
export const ESTADOS_VIVOS: readonly EstadoPlay[] = ["pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada"];
/** As que dão acesso: a cobertura vai até o expira_em (a mesma regra da mensalidade_recalcular). */
export const ESTADOS_QUE_COBREM: readonly EstadoPlay[] = ["ativa", "cancelada", "carencia"];
/** As que ainda vão cobrar (o vínculo e a exclusão cancelam estas). */
export const ESTADOS_QUE_RENOVAM: readonly EstadoPlay[] = ["pendente", "ativa", "carencia", "suspensa", "pausada"];

const DO_GOOGLE: Record<string, EstadoPlay> = {
  SUBSCRIPTION_STATE_PENDING: "pendente",
  SUBSCRIPTION_STATE_ACTIVE: "ativa",
  SUBSCRIPTION_STATE_PAUSED: "pausada",
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "carencia",
  SUBSCRIPTION_STATE_ON_HOLD: "suspensa",
  SUBSCRIPTION_STATE_CANCELED: "cancelada",
  SUBSCRIPTION_STATE_EXPIRED: "expirada",
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: "expirada",
};

/**
 * O estado do Google → o nosso. `revogada` = o Google devolveu com o acesso cortado (a devolvida da Voided Purchases API cujo GET diz
 * EXPIRED): o EXPIRED vira "revogada" (o Google não separa no GET). Desconhecido (UNSPECIFIED, vazio) = null (não grava).
 */
export function estadoDoGoogle(estadoGoogle: unknown, revogada = false): EstadoPlay | null {
  const e = typeof estadoGoogle === "string" ? DO_GOOGLE[estadoGoogle] ?? null : null;
  return e === "expirada" && revogada ? "revogada" : e;
}

export function cobre(estado: EstadoPlay | null | undefined): boolean {
  return !!estado && ESTADOS_QUE_COBREM.includes(estado);
}

export function ehProdutoPlay(v: unknown): v is ProdutoPlay {
  return typeof v === "string" && (PRODUTOS as readonly string[]).includes(v);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** O token de compra que o app manda (opaco; o Google usa ~150–200 caracteres): texto sem espaço, de 10 a 4096. */
export function tokenValido(v: unknown): v is string {
  return typeof v === "string" && v.length >= 10 && v.length <= 4096 && /^[\x21-\x7e]+$/.test(v);
}

// ─────────────────────────────── a leitura do GET (purchases.subscriptionsv2) ───────────────────────────────

/** Uma linha (lineItem) do GET, já lida. */
export interface LinhaPlay {
  produto: string;
  expiraEm: string | null;
  renova: boolean;
  planoBase: string | null;
  /** o preço que renova (só BRL; outra moeda = null) */
  valor: number | null;
  /** o último pedido PAGO desta linha (latestSuccessfulOrderId) */
  pedidoPago: string | null;
  /** a troca na renovação (DEFERRED): o produto que entra quando renovar */
  trocaPara: string | null;
}

/** O que o GET diz de uma assinatura — só o que o servidor usa (nunca vai para o log nem para o app). */
export interface AssinaturaGoogle {
  estadoGoogle: string;
  linhas: LinhaPlay[];
  /** o produto VIGENTE (o da linha que vence por último) */
  produto: string | null;
  /** os produtos das linhas + os da troca na renovação */
  produtos: string[];
  expiraEm: string | null;
  renova: boolean;
  planoBase: string | null;
  valor: number | null;
  inicio: string | null;
  reconhecida: boolean;
  /** a compra de TESTE do Google (testPurchase): sem cobrança */
  teste: boolean;
  /** a matrícula opaca da compra (obfuscatedExternalAccountId) */
  conta: string | null;
  /** a compra anterior que esta substitui (linkedPurchaseToken: troca de plano ou reassinatura antes de vencer) */
  tokenAnterior: string | null;
  /** a compra feita fora do app depois de vencer (outOfAppPurchaseContext): a matrícula e o token da que venceu */
  contaExpirada: string | null;
  tokenExpirado: string | null;
  /** o último pedido PAGO da assinatura (a compra ou a última renovação); null na carência/suspensão sem pedido pago novo */
  pedidoPago: string | null;
  /** o etag (o defer exige o mais novo) */
  etag: string | null;
}

const txt = (v: unknown, max = 4096): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const dataIso = (v: unknown): string | null => {
  const s = txt(v, 64);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/** O preço do Google ({ currencyCode, units, nanos }) em reais; outra moeda ou inválido = null. */
export function valorDoPreco(preco: unknown): number | null {
  const p = obj(preco);
  if (p.currencyCode !== "BRL") return null;
  const unidades = Number(p.units ?? 0);
  const nanos = Number(p.nanos ?? 0);
  if (!Number.isFinite(unidades) || !Number.isFinite(nanos)) return null;
  const v = Math.round((unidades + nanos / 1e9) * 100) / 100;
  return v > 0 ? v : null;
}

/** Lê o GET do purchases.subscriptionsv2; sem estado ou sem linha = null (a compra não vale). */
export function lerAssinaturaV2(corpo: unknown): AssinaturaGoogle | null {
  const c = obj(corpo);
  const estadoGoogle = txt(c.subscriptionState, 64);
  const brutas = Array.isArray(c.lineItems) ? (c.lineItems as unknown[]) : [];
  if (!estadoGoogle || !brutas.length) return null;
  const linhas: LinhaPlay[] = [];
  for (const b of brutas) {
    const l = obj(b);
    const produto = txt(l.productId, 100);
    if (!produto) continue;
    const auto = obj(l.autoRenewingPlan);
    linhas.push({
      produto,
      expiraEm: dataIso(l.expiryTime),
      renova: auto.autoRenewEnabled === true,
      planoBase: txt(obj(l.offerDetails).basePlanId, 100),
      valor: valorDoPreco(auto.recurringPrice),
      pedidoPago: txt(l.latestSuccessfulOrderId, 200),
      trocaPara: txt(obj(l.deferredItemReplacement).productId, 100),
    });
  }
  if (!linhas.length) return null;
  // a vigente: a que vence por último ENTRE AS QUE TÊM expiryTime — no DEFERRED (a troca na renovação) o token novo traz a linha do
  // produto novo SEM data (doc de subscriptions, 16/10): ela nunca é a vigente, em qualquer ordem da resposta (a revisão, 🟡2). Sem
  // nenhuma data, a primeira.
  const comData = linhas.filter((l) => Number.isFinite(Date.parse(l.expiraEm ?? "")));
  const vigente = comData.length ? comData.reduce((a, b) => (Date.parse(b.expiraEm!) > Date.parse(a.expiraEm!) ? b : a)) : linhas[0];
  const datas = linhas.map((l) => (l.expiraEm ? Date.parse(l.expiraEm) : NaN)).filter(Number.isFinite);
  const contas = obj(c.externalAccountIdentifiers);
  const fora = obj(c.outOfAppPurchaseContext);
  const ativaOuCancelada = estadoGoogle === "SUBSCRIPTION_STATE_ACTIVE" || estadoGoogle === "SUBSCRIPTION_STATE_CANCELED";
  return {
    estadoGoogle,
    linhas,
    produto: vigente.produto,
    produtos: [...new Set(linhas.flatMap((l) => (l.trocaPara ? [l.produto, l.trocaPara] : [l.produto])))],
    expiraEm: datas.length ? new Date(Math.max(...datas)).toISOString() : null,
    renova: linhas.some((l) => l.renova),
    planoBase: vigente.planoBase,
    valor: vigente.valor,
    inicio: dataIso(c.startTime),
    reconhecida: c.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    teste: c.testPurchase !== undefined && c.testPurchase !== null,
    conta: txt(contas.obfuscatedExternalAccountId, 64),
    tokenAnterior: txt(c.linkedPurchaseToken),
    contaExpirada: txt(obj(fora.expiredExternalAccountIdentifiers).obfuscatedExternalAccountId, 64),
    tokenExpirado: txt(fora.expiredPurchaseToken),
    // o pedido PAGO: o da linha vigente; sem ele, o latestOrderId só quando ativa ou cancelada (na carência ele pode ser o recusado)
    pedidoPago: vigente.pedidoPago ?? (ativaOuCancelada ? txt(c.latestOrderId, 200) : null),
    etag: txt(c.etag, 512),
  };
}

export type ConferenciaCompra =
  | { ok: true; semConta: boolean }
  | { ok: false; erro: "compra_invalida" | "compra_de_outra_conta" };

/**
 * A compra que o app registrou é desta matrícula? Produto do app (e o pedido, quando vem, entre os da compra — a troca na renovação
 * chega com o vigente + o de depois); estado conhecido; o dono = a matrícula de quem chama (a compra sem a matrícula opaca —
 * `semConta` — fica para quem chama conferir pela compra anterior).
 */
export function conferirCompra(a: AssinaturaGoogle | null, e: { matriculaId: string; produtoPedido?: string | null }): ConferenciaCompra {
  if (!a || !estadoDoGoogle(a.estadoGoogle) || !a.produto || !ehProdutoPlay(a.produto)) return { ok: false, erro: "compra_invalida" };
  if (e.produtoPedido && !a.produtos.includes(e.produtoPedido)) return { ok: false, erro: "compra_invalida" };
  if (a.conta && a.conta !== e.matriculaId) return { ok: false, erro: "compra_de_outra_conta" };
  return { ok: true, semConta: !a.conta };
}

/** O que a play_aplicar recebe (o banco confere de novo: matrícula do app, produto do plano, 1 viva por matrícula). */
export interface EntradaAplicar {
  paciente_id: string;
  token: string;
  token_anterior: string | null;
  produto: string;
  plano_base: string | null;
  estado: EstadoPlay;
  expira_em: string | null;
  renova: boolean;
  reconhecida: boolean;
  teste: boolean;
  pedido: string | null;
  valor: number | null;
  pago_em: string | null;
  cancelada_por?: "vinculo" | "exclusao" | "google" | null;
  adiada?: boolean;
  devolvido_pedido?: string | null;
}

export function entradaDoGoogle(
  pacienteId: string,
  token: string,
  a: AssinaturaGoogle,
  extra: { revogada?: boolean; canceladaPor?: "vinculo" | "exclusao" | "google" | null; adiada?: boolean; devolvidoPedido?: string | null;
           reconhecida?: boolean; agora?: string } = {},
): EntradaAplicar | null {
  const estado = estadoDoGoogle(a.estadoGoogle, extra.revogada === true);
  if (!estado || !a.produto) return null;
  // o pedido da compra (sem o "..N" do fim) foi pago no início; o da renovação ("GPA.…..0", "..1"), agora — o GET não diz a hora do pedido
  const renovacao = !!a.pedidoPago && /\.\.\d+$/.test(a.pedidoPago);
  return {
    paciente_id: pacienteId,
    token,
    token_anterior: a.tokenAnterior,
    produto: a.produto,
    plano_base: a.planoBase,
    estado,
    expira_em: a.expiraEm,
    renova: a.renova,
    reconhecida: extra.reconhecida === true || a.reconhecida,
    teste: a.teste,
    pedido: a.pedidoPago,
    valor: a.valor,
    pago_em: a.pedidoPago && !renovacao && a.inicio ? a.inicio : (extra.agora ?? null),
    cancelada_por: extra.canceladaPor ?? null,
    adiada: extra.adiada === true,
    devolvido_pedido: extra.devolvidoPedido ?? null,
  };
}

// ─────────────────────────────── o defer e a troca ───────────────────────────────

/**
 * Quantos dias adiar a 1ª cobrança: o que faltava da cobertura de antes (o teste grátis ou o mês pago pelo MP — adiar_ate) a partir do
 * início da compra; menos de 1 dia = null (não adia); mais de 1 ano = 1 ano (o limite de uma chamada). Arredonda para cima: o aluno não
 * perde a fração do último dia.
 */
export function diasParaAdiar(adiarAte: string | null | undefined, inicio: string | null | undefined, agoraMs = Date.now()): number | null {
  const fim = adiarAte ? Date.parse(adiarAte) : NaN;
  if (!Number.isFinite(fim)) return null;
  const desde = inicio && Number.isFinite(Date.parse(inicio)) ? Date.parse(inicio) : agoraMs;
  const ms = fim - desde;
  if (!(ms >= DIA_MS)) return null;
  return Math.min(MAX_DIAS_ADIAR, Math.ceil(ms / DIA_MS));
}

/** A duração do defer no formato da API (segundos: "432000s"). */
export const duracaoDoAdiamento = (dias: number): string => `${Math.round(dias) * 86_400}s`;

/**
 * O fim novo que a PRÓPRIA resposta do defer traz (`itemExpiryTimeDetails[].expiryTime`, doc do `defer` conferida 16/10): o maior. Sem ele
 * (resposta fora do formato), null — quem chama grava a marca com o fim que já tinha e o próximo GET acerta (a revisão, 🟡1).
 */
export function fimDoAdiamento(corpo: unknown): string | null {
  const itens = Array.isArray(obj(corpo).itemExpiryTimeDetails) ? (obj(corpo).itemExpiryTimeDetails as unknown[]) : [];
  const datas = itens.map((i) => dataIso(obj(i).expiryTime)).filter((d): d is string => !!d).map((d) => Date.parse(d)).filter(Number.isFinite);
  return datas.length ? new Date(Math.max(...datas)).toISOString() : null;
}

/** Decisão 6 (16/10/2026): para o completo na hora (CHARGE_PRORATED_PRICE); para o Treino na renovação (DEFERRED). Igual = null. */
export function modoDaTroca(de: string | null | undefined, para: string | null | undefined): "na_hora" | "na_renovacao" | null {
  if (!ehProdutoPlay(de) || !ehProdutoPlay(para) || de === para) return null;
  return para === "app_treino_alimentacao" ? "na_hora" : "na_renovacao";
}

// ─────────────────────────────── a conferência de hora em hora (a play-conferir) ───────────────────────────────
// 22/10/2026: no lugar do aviso do Google pelo Pub/Sub (que saiu: sem faturamento no Google Cloud não há Pub/Sub), a play-conferir
// confere de hora em hora TODAS as vivas pelo GET e lê as devolvidas pela Voided Purchases API (purchases.voidedpurchases.list; os
// parâmetros e o formato conferidos no discovery da API v3 em 22/10/2026: startTime/endTime em ms, type, token; a resposta voidedPurchases[]
// + tokenPagination.nextPageToken).

/** O marcador da conferência no app_config (publica = false; só a play-conferir grava): { voided_ate: <ISO> } — o fim da última janela
 *  da Voided Purchases API lida inteira. */
export const CHAVE_CONFERIR = "play_conferir";
/** Sem marcador (a 1ª rodada, ou ele estragado): as devolvidas das últimas 24 h. */
export const JANELA_PADRAO_DEVOLVIDAS_MS = 24 * 3_600_000;
/** A folga antes do marcador: o Google filtra pela hora em que o sistema dele VIU a devolução — a que entrou na lista com atraso não se
 *  perde (ler 2 vezes a mesma é idempotente). */
export const FOLGA_DEVOLVIDAS_MS = 10 * 60_000;
/** O teto da API (o startTime "cannot be older than 30 days"), com 1 h de margem. */
export const MAX_JANELA_DEVOLVIDAS_MS = 30 * DIA_MS - 3_600_000;

/** Uma compra devolvida, cancelada ou estornada (o VoidedPurchase). Nada disto vai ao log. */
export interface DevolvidaGoogle {
  token: string;
  /** o pedido devolvido: a compra ou uma renovação ("GPA.…..N") — o orderId (o type=1 exige ler por ele: as renovações dividem o token) */
  pedido: string | null;
  /** quando o Google anulou (voidedTimeMillis) */
  quandoMs: number | null;
  /** quem anulou (voidedSource): 0 o usuário, 1 o desenvolvedor, 2 o Google */
  origem: number | null;
  /** por quê (voidedReason): 0 outro, 1 arrependimento, 2 não recebido, 3 defeito, 4 sem querer, 5 fraude, 6 fraude amiga, 7 estorno no
   *  cartão, 8 não reconhecida */
  motivo: number | null;
}

const inteiroOuNull = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d{1,16}$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : null;
};

/** Uma página da Voided Purchases API: as devolvidas (sem o token = fora) e o token da próxima página (null = a última). */
export function lerDevolvidas(corpo: unknown): { itens: DevolvidaGoogle[]; proxima: string | null } {
  const c = obj(corpo);
  const brutas = Array.isArray(c.voidedPurchases) ? (c.voidedPurchases as unknown[]) : [];
  const itens: DevolvidaGoogle[] = [];
  for (const b of brutas) {
    const v = obj(b);
    const token = txt(v.purchaseToken);
    if (!token) continue;
    itens.push({ token, pedido: txt(v.orderId, 200), quandoMs: inteiroOuNull(v.voidedTimeMillis), origem: inteiroOuNull(v.voidedSource),
                 motivo: inteiroOuNull(v.voidedReason) });
  }
  return { itens, proxima: txt(obj(c.tokenPagination).nextPageToken, 2048) };
}

/**
 * A janela da Voided Purchases API (ms): do marcador menos a folga até agora; sem marcador válido (ausente, estragado ou no futuro), as
 * últimas 24 h; nunca antes do teto da API.
 */
export function janelaDasDevolvidas(marca: unknown, agoraMs: number): { inicioMs: number; fimMs: number } {
  const t = typeof marca === "string" ? Date.parse(marca) : NaN;
  const inicio = Number.isFinite(t) && t <= agoraMs ? t - FOLGA_DEVOLVIDAS_MS : agoraMs - JANELA_PADRAO_DEVOLVIDAS_MS;
  return { inicioMs: Math.max(inicio, agoraMs - MAX_JANELA_DEVOLVIDAS_MS), fimMs: agoraMs };
}

// ─────────────────────────────── as bases do teste local ───────────────────────────────

const LOCAL = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;
const LOCAL_COM_CAMINHO = /^http:\/\/127\.0\.0\.1:\d{2,5}\/[A-Za-z0-9/_.-]{0,100}$/;

/** A base da API: a do Google; SÓ o simulador local troca (http://127.0.0.1:<porta> — a produção não tem a variável). */
export function baseDaApi(valor: string | null | undefined): string {
  return typeof valor === "string" && LOCAL.test(valor) ? valor : API_PLAY;
}

/** Uma URL do teste local (o OAuth do simulador): só http://127.0.0.1:<porta>/<caminho>; outra coisa = null (vale a do Google). */
export function urlLocal(valor: string | null | undefined): string | null {
  return typeof valor === "string" && LOCAL_COM_CAMINHO.test(valor) ? valor : null;
}

/** O código do erro do Google para o log (o status — NOT_FOUND — ou o reason — purchaseTokenNotFound; o OAuth: invalid_grant). */
export function codigoDoErroGoogle(corpo: unknown): string | null {
  const c = obj(corpo);
  const erro = c.error;
  if (typeof erro === "string") return /^[A-Za-z0-9_.-]{1,64}$/.test(erro) ? erro : null;
  const e = obj(erro);
  const motivo = obj((Array.isArray(e.errors) ? e.errors : [])[0]).reason;
  for (const v of [motivo, e.status]) if (typeof v === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(v)) return v;
  return null;
}

/** A resposta do Google é "a compra não existe" (o token falso, de outro app ou que o Google já esqueceu)? */
export const compraNaoExiste = (status: number): boolean => status === 404 || status === 410 || status === 400;
/** A resposta do Google não deixa decidir (rede, prazo, limite, fora do ar ou o acesso da conta de serviço): tentar de novo depois. */
export const googleTransitorio = (status: number): boolean => status === 0 || status === 599 || status === 401 || status === 403 || status === 429 || status >= 500;

