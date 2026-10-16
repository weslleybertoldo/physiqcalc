/**
 * play-W6 (16/10/2026) — as regras PURAS da assinatura da Google Play no app (o Vitest testa: src/app-aluno/sozinho/playRegras.test.ts):
 *   · a oferta: o plano básico mensal de cada produto e o preço QUE A PLAY DEVOLVE (a loja mostra só ele — o do banco fica no site);
 *   · a folha da oferta: o preço por mês, a renovação, como cancelar e os dias grátis que faltam (a política da Play pede os 4 antes do
 *     botão — support.google.com/googleplay/android-developer/answer/9900533);
 *   · a vista da assinatura (Pagamentos, Meu plano, a trava): viva, dá acesso, renova, travada; o texto de cada estado;
 *   · a troca (decisão 6): para o completo na hora; para o Treino na renovação;
 *   · as mensagens dos erros da play-compras e do plugin.
 * Nada de site nem de Mercado Pago aqui: na loja, a conta do app só fala da Google Play.
 */
import { dataBR } from "@/financeiro/regras";
import type { ProdutoPlay } from "@/lib/playBilling";

/** Os produtos da Play = os códigos dos planos do app no banco (planos_aluno.codigo). */
export const PRODUTOS_PLAY = ["app_treino", "app_treino_alimentacao"] as const;
export type CodigoPlay = (typeof PRODUTOS_PLAY)[number];
/** O plano básico de cada produto no Play Console. */
export const PLANO_BASE_PLAY = "mensal";

export const ESTADOS_PLAY_VIVOS = ["pendente", "ativa", "cancelada", "carencia", "suspensa", "pausada"] as const;
export type EstadoPlay = (typeof ESTADOS_PLAY_VIVOS)[number];

/** A assinatura da Play como o servidor mostra (financeiro_do_aluno, meu_plano_app, aluno_status e a play-compras) — nunca o token. */
export interface VistaPlay {
  estado: EstadoPlay;
  renova: boolean;
  expira_em: string | null;
  produto: string;
}

export function ehCodigoPlay(v: unknown): v is CodigoPlay {
  return typeof v === "string" && (PRODUTOS_PLAY as readonly string[]).includes(v);
}

/** O JSON do servidor (tolerante): só as vivas viram vista; o resto (null, expirada, formato estranho) = null. */
export function normalizarVistaPlay(bruto: unknown): VistaPlay | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  if (!(ESTADOS_PLAY_VIVOS as readonly unknown[]).includes(b.estado) || typeof b.produto !== "string") return null;
  return {
    estado: b.estado as EstadoPlay,
    renova: b.renova === true,
    expira_em: typeof b.expira_em === "string" ? b.expira_em : null,
    produto: b.produto,
  };
}

/** Há assinatura da Play viva (ainda vale ou pode voltar a valer): o site e o APK antigo não cobram de novo. */
export const playViva = (p: VistaPlay | null | undefined): p is VistaPlay => !!p && (ESTADOS_PLAY_VIVOS as readonly string[]).includes(p.estado);
/** Dá acesso (a cobertura vai até o expira_em): ativa, cancelada até o fim, carência. */
export const playDaAcesso = (p: VistaPlay | null | undefined): boolean => !!p && ["ativa", "cancelada", "carencia"].includes(p.estado);
/** Vai renovar sozinha (sem faixa de vencimento). */
export const playRenovando = (p: VistaPlay | null | undefined): boolean => !!p && ["ativa", "carencia"].includes(p.estado) && p.renova;
/** Suspensa (pagamento recusado depois da carência) ou pausada: sem acesso até resolver na Google Play — nada de assinar de novo. */
export const playTravada = (p: VistaPlay | null | undefined): boolean => !!p && ["suspensa", "pausada"].includes(p.estado);

// ───────────────────────── a oferta ─────────────────────────

export interface OfertaMensal {
  produto: CodigoPlay;
  /** o offerToken (a compra exige) */
  token: string;
  /** o preço que a Play devolve, já formatado na moeda de quem compra ("R$ 29,90") */
  preco: string;
  micros: number;
  moeda: string;
}

/** A oferta do plano básico mensal (sem oferta extra): o preço da fase que renova (a última). Sem ela, null (não vende). */
export function ofertaMensal(p: ProdutoPlay | null | undefined): OfertaMensal | null {
  if (!p || !ehCodigoPlay(p.id)) return null;
  const doPlano = (p.ofertas ?? []).filter((o) => o.planoBase === PLANO_BASE_PLAY);
  const o = doPlano.find((x) => !x.oferta) ?? null;
  const fase = o?.fases?.length ? o.fases[o.fases.length - 1] : null;
  if (!o || !o.token || !fase || fase.periodo !== "P1M" || !fase.precoFormatado) return null;
  return { produto: p.id, token: o.token, preco: fase.precoFormatado, micros: Number(fase.precoMicros) || 0, moeda: fase.moeda };
}

/** As ofertas mensais dos produtos que a Play achou. */
export function ofertasMensais(produtos: readonly ProdutoPlay[]): Partial<Record<CodigoPlay, OfertaMensal>> {
  const saida: Partial<Record<CodigoPlay, OfertaMensal>> = {};
  for (const p of produtos) {
    const o = ofertaMensal(p);
    if (o) saida[o.produto] = o;
  }
  return saida;
}

/** O menor preço das ofertas ("a partir de R$ 29,90"); sem oferta, null. */
export function menorPreco(ofertas: Partial<Record<CodigoPlay, OfertaMensal>>): string | null {
  const lista = Object.values(ofertas).filter((o): o is OfertaMensal => !!o);
  if (!lista.length) return null;
  return lista.reduce((a, b) => (b.micros < a.micros ? b : a)).preco;
}

/** "R$ 29,90/mês" — o preço da Play com o período. */
export const porMes = (preco: string): string => `${preco}/mês`;

export const TEXTO_RENOVA = "Renova todo mês até você cancelar.";
export const TEXTO_CANCELE = "Cancele quando quiser na Google Play.";

/**
 * As linhas da folha da oferta (a política da Play: o preço, o período, a renovação e como cancelar). Com os dias grátis ainda
 * correndo (ou um mês já pago), o aviso de que eles continuam — o servidor adia a 1ª renovação pelo que falta.
 */
export function linhasDaOferta(o: OfertaMensal, cobertoAte: string | null, agora: Date = new Date()): string[] {
  const linhas = [`${o.preco} por mês.`, TEXTO_RENOVA, TEXTO_CANCELE];
  const fim = cobertoAte ? Date.parse(cobertoAte) : NaN;
  if (Number.isFinite(fim) && fim - agora.getTime() >= 86_400_000) {
    linhas.push(`A Google Play cobra hoje, e os dias que você já tem (até ${dataBR(cobertoAte)}) continuam: o mês pago começa depois deles.`);
  }
  return linhas;
}

// ───────────────────────── a vista da assinatura ─────────────────────────

export interface TextoAssinatura {
  titulo: string;
  detalhe: string;
  tom: "n" | "a" | "r" | "g";
}

/** A assinatura numa frase (Pagamentos, Meu plano, a trava). */
export function textoDaAssinatura(p: VistaPlay): TextoAssinatura {
  const ate = p.expira_em ? dataBR(p.expira_em) : "";
  switch (p.estado) {
    case "ativa":
      return { titulo: "Assinatura pela Google Play", detalhe: `${ate ? `até ${ate} · ` : ""}${p.renova ? "renova sozinha" : "não renova"}`, tom: "n" };
    case "cancelada":
      return { titulo: "Assinatura pela Google Play", detalhe: `${ate ? `vale até ${ate} · ` : ""}cancelada, não renova`, tom: "a" };
    case "carencia":
      return { titulo: "Assinatura pela Google Play", detalhe: "O pagamento não passou: atualize na Google Play para não perder o acesso.", tom: "a" };
    case "suspensa":
      return { titulo: "Assinatura suspensa", detalhe: "Atualize o pagamento na Google Play para voltar a usar o app.", tom: "r" };
    case "pausada":
      return { titulo: "Assinatura pausada", detalhe: "Retome a assinatura na Google Play para voltar a usar o app.", tom: "g" };
    default:
      return { titulo: "Pagamento pendente na Google Play", detalhe: "Assim que a Google Play confirmar, o app libera.", tom: "a" };
  }
}

// ───────────────────────── a troca ─────────────────────────

export type ModoTroca = "na_hora" | "na_renovacao";

/** Decisão 6 (16/10/2026): para o completo na hora; para o Treino na renovação. Igual ou fora do app = null. */
export function modoDaTroca(de: string | null | undefined, para: string | null | undefined): ModoTroca | null {
  if (!ehCodigoPlay(de) || !ehCodigoPlay(para) || de === para) return null;
  return para === "app_treino_alimentacao" ? "na_hora" : "na_renovacao";
}

export function textoDaTroca(modo: ModoTroca): string {
  return modo === "na_hora"
    ? "Vale na hora: a Google Play cobra só a diferença do período que falta."
    : "Vale na próxima renovação: até lá você continua com o plano de hoje.";
}

// ───────────────────────── as mensagens ─────────────────────────

export const MENSAGEM_PLAY: Readonly<Record<string, string>> = {
  sem_internet: "Sem internet agora. Conecte-se e tente de novo.",
  cancelado: "A assinatura não foi feita. Quando quiser, é só tentar de novo.",
  indisponivel: "A Google Play não está disponível neste aparelho agora. Confira se você está com a conta do Google na Play Store.",
  ja_tem: "Você já tem essa assinatura na Google Play. Abra Gerenciar na Google Play para ver.",
  pendente: "A Google Play ainda está processando o pagamento. Assim que confirmar, o app libera.",
  compra_invalida: "A Google Play não confirmou esta compra. Nada foi cobrado por aqui — tente de novo.",
  compra_de_outra_conta: "Esta assinatura da Google Play é de outra conta do Physiq.",
  assinatura_duplicada: "Você já tem uma assinatura ativa. A nova compra não vale e a Google Play devolve o valor.",
  google_indisponivel: "Não deu para falar com a Google Play agora. Se você assinou, a assinatura vai aparecer aqui em instantes.",
  play_sem_credencial: "A assinatura pela Google Play ainda não está disponível. Tente de novo mais tarde.",
  sem_matricula_do_app: "Você não está no plano do app agora.",
  conta_real_no_staging: "Este é o ambiente de teste: só contas de teste podem assinar aqui.",
  erro_play: "A Google Play não completou a assinatura. Tente de novo.",
};

export function mensagemPlay(codigo: string | null | undefined): string {
  return (codigo && MENSAGEM_PLAY[codigo]) || "Não deu certo agora. Tente de novo.";
}
