/**
 * play-W6 (16/10/2026) — a assinatura do plano do app pela Google Play, do lado do app (só na versão da loja; o site não chama nada daqui):
 *   · a função play-compras do principal (jeito 2: o app fala com a função, a função com o banco e com o Google): `estado` (disponível?,
 *     a matrícula, a assinatura viva, a automática do MP) e `registrar` (o token da compra → o servidor confere no Google, grava,
 *     reconhece e adia a 1ª cobrança pelos dias que faltam);
 *   · a ordem de uma compra: o plugin abre a folha da Play (com a matrícula opaca e, na troca, o token antigo + o modo) → o token vai ao
 *     servidor. A compra que ficou no meio (o app fechou antes do registrar) volta ao abrir a loja: `recuperarComprasDaPlay`.
 * Quem reconhece é SEMPRE o servidor; fora da loja nativa o plugin responde "indisponível" (nunca uma compra falsa).
 */
import { invalidarResumo } from "@/financeiro/api";
import { principal } from "@/integrations/principal/client";
import { comprarNaPlay, comprasDaPlay, gerenciarNaPlay, type CompraPlay } from "@/lib/playBilling";
import { ehCodigoPlay, normalizarVistaPlay, type CodigoPlay, type ModoTroca, type OfertaMensal, type VistaPlay } from "./playRegras";

export class ErroPlay extends Error {
  constructor(public codigo: string) {
    super(codigo);
  }
}

async function corpoDoErro(erro: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (erro as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      return (await ctx.clone().json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new ErroPlay("sem_internet");
  const { data, error } = await principal.functions.invoke("play-compras", { body: corpo });
  if (error) {
    const c = await corpoDoErro(error);
    throw new ErroPlay(String(c?.erro ?? "erro_interno"));
  }
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) throw new ErroPlay(String(d.erro ?? "erro_interno"));
  return d as T;
}

export interface EstadoPlayServidor {
  /** a Play vale para esta pessoa: a trava play_billing ligada (ou a conta de teste) e o servidor com a credencial */
  disponivel: boolean;
  matricula: { id: string; ativo: boolean } | null;
  assinatura: VistaPlay | null;
  /** a automática do MP do app ainda viva (a loja não oferece a Play com ela) */
  automatica_mp: boolean;
}

export async function buscarEstadoPlay(): Promise<EstadoPlayServidor> {
  const r = await chamar<Record<string, unknown>>({ acao: "estado" });
  // a revisão, 🟡3: o servidor ressincronizou a viva vencida (a renovação ou o EXPIRED que a conferência de hora em hora ainda não trouxe) —
  // o resumo guardado no aparelho (10 min) fica velho: a trava e a faixa leem de novo. T2 (b): sem apagar o último (a trava não pisca)
  if (r.ressincronizada === true) invalidarResumo({ manterUltimo: true });
  const m = r.matricula && typeof r.matricula === "object" ? (r.matricula as Record<string, unknown>) : null;
  return {
    disponivel: r.disponivel === true,
    matricula: m && typeof m.id === "string" ? { id: m.id, ativo: m.ativo === true } : null,
    assinatura: normalizarVistaPlay(r.assinatura),
    automatica_mp: r.automatica_mp === true,
  };
}

export interface RegistroPlay {
  estado: string | null;
  expira_em: string | null;
  produto: string | null;
  renova: boolean;
  reconhecida: boolean;
  adiada: boolean;
}

/** O token de uma compra → o servidor (confere no Google, grava, reconhece e adia). */
export async function registrarCompraPlay(token: string, produto: CodigoPlay): Promise<RegistroPlay> {
  const r = await chamar<Record<string, unknown>>({ acao: "registrar", token, produto });
  invalidarResumo();
  return {
    estado: typeof r.estado === "string" ? r.estado : null,
    expira_em: typeof r.expira_em === "string" ? r.expira_em : null,
    produto: typeof r.produto === "string" ? r.produto : null,
    renova: r.renova === true,
    reconhecida: r.reconhecida === true,
    adiada: r.adiada === true,
  };
}

export type DesfechoAssinatura =
  | { tipo: "assinada"; registro: RegistroPlay | null }
  | { tipo: "pendente" }
  | { tipo: "cancelada" }
  | { tipo: "erro"; codigo: string };

/** A compra deste produto entre as que a Play devolveu — só a do produto pedido (a revisão, ⚪19: nunca "a 1ª da lista"). */
function compraDoProduto(compras: CompraPlay[], produto: CodigoPlay): CompraPlay | null {
  return compras.find((c) => c.produtos?.includes(produto)) ?? null;
}

/**
 * Assinar (ou trocar de plano): a folha da Play → o registrar. `troca` = a assinatura de hoje (o token dela vem das compras do aparelho)
 * e o modo (decisão 6). Nunca lança: o desfecho diz o que a tela mostra.
 */
export async function assinarPelaPlay(p: {
  matriculaId: string;
  oferta: OfertaMensal;
  troca?: { produtoAntigo: CodigoPlay; modo: ModoTroca } | null;
}): Promise<DesfechoAssinatura> {
  try {
    let troca: { tokenAntigo: string; produtoAntigo: string; modo: ModoTroca } | undefined;
    if (p.troca) {
      // a revisão, 🟡6: só a compra DESTA matrícula (a conta Google do aparelho pode ter a assinatura de outra pessoa — o aparelho da
      // família): sem ela, nada de trocar (a Play substituiria a assinatura de outro)
      const atual = (await comprasDaPlay()).find((c) => c.produtos?.includes(p.troca!.produtoAntigo) && c.conta === p.matriculaId);
      if (!atual) return { tipo: "erro", codigo: "erro_play" };
      troca = { tokenAntigo: atual.token, produtoAntigo: p.troca.produtoAntigo, modo: p.troca.modo };
    }
    const r = await comprarNaPlay({ produto: p.oferta.produto, oferta: p.oferta.token, conta: p.matriculaId, ...(troca ? { troca } : {}) });
    if (r.resultado === "cancelado") return { tipo: "cancelada" };
    if (r.resultado === "indisponivel") return { tipo: "erro", codigo: "indisponivel" };
    if (r.resultado === "erro") return { tipo: "erro", codigo: "erro_play" };
    if (r.resultado === "ja_tem") {
      // já comprada (o registrar não chegou, ou a conferência de hora em hora já reconheceu a que estava no banco): volta ao servidor — também
      // a reconhecida DESTA matrícula (a revisão, ⚪15)
      const n = await recuperarComprasDaPlay(p.matriculaId, undefined, { comAsReconhecidas: true });
      return n > 0 ? { tipo: "assinada", registro: null } : { tipo: "erro", codigo: "ja_tem" };
    }
    const compra = compraDoProduto(r.compras, p.oferta.produto);
    if (!compra) {
      // a revisão, 🟡2: na troca, a Play pode voltar OK com a lista vazia (o DEFERRED) — a troca foi feita: sucesso + a recuperação pelas
      // compras do aparelho (a compra nova desta matrícula vai ao servidor)
      if (troca) {
        await recuperarComprasDaPlay(p.matriculaId);
        return { tipo: "assinada", registro: null };
      }
      return { tipo: "erro", codigo: "erro_play" };
    }
    if (compra.estado === "pendente") return { tipo: "pendente" };
    const produto = compra.produtos.find(ehCodigoPlay) ?? p.oferta.produto;
    return { tipo: "assinada", registro: await registrarCompraPlay(compra.token, produto) };
  } catch (e) {
    return { tipo: "erro", codigo: e instanceof ErroPlay ? e.codigo : "erro_play" };
  }
}

/**
 * A compra que ficou no meio (o app fechou antes do registrar, a folha voltou depois, a pendente que concluiu): as compras do
 * aparelho que a Play ainda não tem reconhecidas, desta matrícula (ou sem a matrícula opaca), voltam ao servidor. Devolve quantas
 * o servidor aceitou. Nunca lança.
 */
export async function recuperarComprasDaPlay(matriculaId: string, compras?: CompraPlay[], opcoes: { comAsReconhecidas?: boolean } = {}): Promise<number> {
  let feitas = 0;
  try {
    const lista = compras ?? (await comprasDaPlay());
    for (const c of lista) {
      if (c.estado !== "comprada" || (c.conta && c.conta !== matriculaId)) continue;
      // a reconhecida só entra quando pedida (o "já tem": a conferência de hora em hora pode ter reconhecido antes do registrar) e só a DESTA
      // matrícula
      if (c.reconhecida && !(opcoes.comAsReconhecidas && c.conta === matriculaId)) continue;
      const produto = c.produtos.find(ehCodigoPlay);
      if (!produto) continue;
      try {
        await registrarCompraPlay(c.token, produto);
        feitas++;
      } catch {
        /* o servidor recusou ou caiu: a próxima abertura tenta de novo (o Google devolve sozinho a que nunca for reconhecida) */
      }
    }
  } catch {
    /* sem a Play agora */
  }
  return feitas;
}

/** "Gerenciar na Google Play" (a Central de assinaturas, na do produto). */
export const gerenciarAssinatura = (produto?: string | null) => gerenciarNaPlay(produto ?? null);
