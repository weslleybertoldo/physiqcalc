/**
 * play-W6 — a ponte com o plugin nativo da cobrança da Google Play (android/app/src/playRelease/…/PlayBillingPlugin.java,
 * Play Billing Library 9.1.0). O plugin só existe no AAB da loja (build type playRelease); o APK do site e o site nem o têm.
 *
 * Regra de ouro: fora da loja nativa (site, APK do site, build:loja aberto no navegador, plugin ausente) tudo responde
 * "indisponível" — NUNCA uma compra falsa. Quem reconhece a compra é o servidor (play-compras), nunca o aparelho.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { ehLoja } from "./distribuicao";

/** Uma fase de preço da oferta (a Play manda o preço já formatado na moeda do aluno). */
export interface FasePrecoPlay {
  precoFormatado: string;
  precoMicros: number;
  moeda: string;
  /** ISO 8601 (P1M = mensal). */
  periodo: string;
  ciclos: number;
  /** 1 = renova sem fim, 2 = número fixo de ciclos, 3 = sem renovação. */
  recorrencia: number;
}

export interface OfertaPlay {
  planoBase: string;
  /** null = o plano básico, sem oferta. */
  oferta: string | null;
  /** O offerToken que a compra exige. */
  token: string;
  tags: string[];
  fases: FasePrecoPlay[];
}

export interface ProdutoPlay {
  id: string;
  nome: string;
  titulo: string;
  ofertas: OfertaPlay[];
}

export interface CompraPlay {
  token: string;
  produtos: string[];
  estado: "comprada" | "pendente" | "desconhecido";
  reconhecida: boolean;
  renova: boolean;
  /** O obfuscatedAccountId (a matrícula opaca de quem comprou) — null em compra feita sem ele. */
  conta: string | null;
}

/** "na_hora" = para o completo (CHARGE_PRORATED_PRICE); "na_renovacao" = para o Treino (DEFERRED). */
export type ModoTrocaPlay = "na_hora" | "na_renovacao";

export type ResultadoCompraPlay =
  | { resultado: "comprado"; compras: CompraPlay[] }
  | { resultado: "cancelado" }
  | { resultado: "ja_tem" }
  | { resultado: "indisponivel" }
  | { resultado: "erro"; codigo: number };

export interface PedidoCompraPlay {
  produto: string;
  /** O offerToken da oferta escolhida (de produtosDaPlay). */
  oferta: string;
  /** A matrícula do app (pacientes.id): uuid opaco, sem dado pessoal. */
  conta: string;
  troca?: { tokenAntigo: string; produtoAntigo: string; modo: ModoTrocaPlay };
}

interface RespostaNativa {
  codigo?: number;
}

interface PlayBillingNativo {
  disponivel(): Promise<RespostaNativa & { disponivel?: boolean }>;
  produtos(args: { ids: string[] }): Promise<RespostaNativa & { produtos?: ProdutoPlay[]; naoAchados?: string[] }>;
  comprar(args: {
    produto: string;
    oferta: string;
    conta: string;
    tokenAntigo?: string;
    produtoAntigo?: string;
    modo?: ModoTrocaPlay;
  }): Promise<RespostaNativa & { resultado?: string; compras?: CompraPlay[] }>;
  compras(): Promise<RespostaNativa & { compras?: CompraPlay[] }>;
  gerenciar(args: { produto?: string }): Promise<void>;
  addListener(
    evento: "compras",
    ouvinte: (dados: RespostaNativa & { resultado?: string; compras?: CompraPlay[] }) => void,
  ): Promise<PluginListenerHandle>;
}

const NOME_DO_PLUGIN = "PlayBilling";
const PlayBillingNativo = registerPlugin<PlayBillingNativo>(NOME_DO_PLUGIN);

/** A Central de assinaturas da Play (na do produto, quando vem). O site usa como link; o app abre pelo plugin. */
export const PACOTE_DO_APP = "com.bertoldo.physiqcalc";
export function urlGerenciarNaPlay(produto?: string | null): string {
  const base = "https://play.google.com/store/account/subscriptions";
  if (!produto) return base;
  return `${base}?sku=${encodeURIComponent(produto)}&package=${PACOTE_DO_APP}`;
}

/** O plugin nativo está neste build? Só na versão da loja (build:loja), no Android, com o plugin registrado (playRelease). */
export function pluginDaPlayPresente(): boolean {
  if (!ehLoja) return false;
  try {
    return Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable(NOME_DO_PLUGIN);
  } catch {
    return false;
  }
}

let disponivelEmCache: Promise<boolean> | null = null;

/** A Play cobra assinatura neste aparelho? Fora da loja nativa = false. Nunca lança. */
export function playDisponivel(): Promise<boolean> {
  if (!pluginDaPlayPresente()) return Promise.resolve(false);
  if (!disponivelEmCache) {
    disponivelEmCache = PlayBillingNativo.disponivel()
      .then((r) => r?.disponivel === true)
      .catch(() => false)
      .then((ok) => {
        // sem a Play agora (sem conta, sem rede) → pergunta de novo na próxima vez
        if (!ok) disponivelEmCache = null;
        return ok;
      });
  }
  return disponivelEmCache;
}

/** Os produtos de assinatura (o preço é o da Play). Fora da loja nativa ou com erro: nenhum produto, todos "não achados". */
export async function produtosDaPlay(ids: readonly string[]): Promise<{ produtos: ProdutoPlay[]; naoAchados: string[] }> {
  const pedidos = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
  if (pedidos.length === 0 || !pluginDaPlayPresente()) return { produtos: [], naoAchados: pedidos };
  try {
    const r = await PlayBillingNativo.produtos({ ids: pedidos });
    const produtos = Array.isArray(r?.produtos) ? r.produtos.filter((p) => p && pedidos.includes(p.id)) : [];
    const achados = new Set(produtos.map((p) => p.id));
    return { produtos, naoAchados: pedidos.filter((id) => !achados.has(id)) };
  } catch {
    return { produtos: [], naoAchados: pedidos };
  }
}

function resultadoDaCompra(r: (RespostaNativa & { resultado?: string; compras?: CompraPlay[] }) | undefined): ResultadoCompraPlay {
  switch (r?.resultado) {
    case "comprado":
      return { resultado: "comprado", compras: Array.isArray(r.compras) ? r.compras : [] };
    case "cancelado":
      return { resultado: "cancelado" };
    case "ja_tem":
      return { resultado: "ja_tem" };
    case "indisponivel":
      return { resultado: "indisponivel" };
    default:
      return { resultado: "erro", codigo: typeof r?.codigo === "number" ? r.codigo : -99 };
  }
}

/**
 * Abre a folha de compra da Play. Fora da loja nativa = { resultado: "indisponivel" } (nada de compra falsa). A compra que
 * volta "comprado" ainda NÃO está reconhecida: o token vai ao servidor (play-compras › registrar), que confere e reconhece.
 */
export async function comprarNaPlay(pedido: PedidoCompraPlay): Promise<ResultadoCompraPlay> {
  if (!pluginDaPlayPresente()) return { resultado: "indisponivel" };
  try {
    const r = await PlayBillingNativo.comprar({
      produto: pedido.produto,
      oferta: pedido.oferta,
      conta: pedido.conta,
      ...(pedido.troca
        ? { tokenAntigo: pedido.troca.tokenAntigo, produtoAntigo: pedido.troca.produtoAntigo, modo: pedido.troca.modo }
        : {}),
    });
    return resultadoDaCompra(r);
  } catch {
    return { resultado: "erro", codigo: -98 };
  }
}

/** As assinaturas deste aparelho na Play. Fora da loja nativa ou com erro: nenhuma. */
export async function comprasDaPlay(): Promise<CompraPlay[]> {
  if (!pluginDaPlayPresente()) return [];
  try {
    const r = await PlayBillingNativo.compras();
    return Array.isArray(r?.compras) ? r.compras : [];
  } catch {
    return [];
  }
}

/** Compras que chegam por fora da folha (pendente que concluiu, reassinatura pela Play). Fora da loja nativa: nada. */
export async function ouvirComprasDaPlay(ouvinte: (compras: CompraPlay[]) => void): Promise<() => void> {
  if (!pluginDaPlayPresente()) return () => {};
  try {
    const h = await PlayBillingNativo.addListener("compras", (dados) => {
      if (dados?.resultado === "comprado" && Array.isArray(dados.compras) && dados.compras.length > 0) ouvinte(dados.compras);
    });
    return () => {
      void h.remove();
    };
  } catch {
    return () => {};
  }
}

/** Abre a Central de assinaturas da Play: pelo plugin na loja nativa; no resto, o link (nova aba). */
export async function gerenciarNaPlay(produto?: string | null): Promise<void> {
  if (pluginDaPlayPresente()) {
    try {
      await PlayBillingNativo.gerenciar(produto ? { produto } : {});
      return;
    } catch {
      // sem o app da Play: cai no link
    }
  }
  if (typeof window !== "undefined") window.open(urlGerenciarNaPlay(produto), "_blank", "noopener,noreferrer");
}

/** Só para os testes: esquece o "disponível" guardado. */
export function _esquecerDisponivelParaTestes(): void {
  disponivelEmCache = null;
}
