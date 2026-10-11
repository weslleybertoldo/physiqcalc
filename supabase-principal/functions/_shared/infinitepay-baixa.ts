// supabase-principal/functions/_shared/infinitepay-baixa.ts
// Physiq W1 — a baixa da InfinitePay no banco: o que a pagamentos-aluno e a infinitepay-webhook-aluno fazem igual.
//   · Os LINKS ({schema}.infinitepay_links): um order_nsu por link, `<cobranca_id>-<n>`, com a InfiniteTag e o preço daquele link. A
//     InfinitePay aceita order_nsu repetido (sondado em 11/10), então a unicidade é nossa (I4).
//   · A CAIXA DE AVISOS ({schema}.infinitepay_avisos): o que chegou pelo webhook, pela volta da página ou pela conferência só do pedido.
//   · Cada aviso é conferido no payment_check ANTES de qualquer baixa (o webhook não tem assinatura). A InfiniteTag e o preço vêm do LINK
//     (o personal pode ter trocado de tag depois), nunca do aviso.
// Idempotente: 1 aviso por (link, NSU, slug); o NSU é único por tag em cobrancas (cobrancas_ip_transaction_uq); a "paga" vira uma vez,
// só no "baixar" — C1: numa cobrança já paga, outro NSU só avisa o personal. Quem confere "pega" o aviso antes (tentado_em): 2
// conferências do mesmo aviso não andam juntas.
// Sem baixa (I1/I3 — depoisDaConferencia, _shared/infinitepay-regras.ts):
//   · o SERVIDOR (webhook, rodada) soma 1 e reagenda (5, 15, 30 min, 1 h), o "não pago" também. Na 24ª fecha: o "não pago" fecha calado;
//     o "sem resposta" vira "desistiu" e avisa o personal;
//   · a TELA (aluno_status, prof_aluno, aluno_ip_conferir, aluno_ip_volta) só confere o aviso que já está na hora e não gasta tentativa
//     (adia 30 s);
//   · o aviso fechado sem pagamento reabre quando a mesma confirmação chega de novo (I1).
// Só pelo pedido (W1-B2 — conferirPeloPedido): SÓ na tentativa ainda NÃO paga. Numa cobrança já paga, o NSU do pedido daria "ja_feito"
// com qualquer link (decidirBaixa) e o personal não saberia de um 2º link pago — esse chega pelo webhook, com o NSU de verdade.
// Rota pública (I6): só registra aviso novo de link com até 72 h + 7 dias e até 20 por cobrança. O personal recebe no máximo 1 aviso de
// "confira" por cobrança a cada 24 h (o próprio aviso que avisa só fecha DEPOIS de avisar: senão ele mesmo contaria no teto).
// Log: só ids técnicos, o status HTTP e o resultado (nunca a InfiniteTag, o NSU, o slug ou a url — _shared/log.ts).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisar, carregarMatricula, linkDoAlunoNoPainel, recebedor } from "./financeiro-mp.ts";
import type { Schema } from "./financeiro-regras.ts";
import {
  IP_AVISOS_POR_COBRANCA, IP_CONFERIR_PEDIDO_MS, IP_MAX_TENTATIVAS, avisoNoPrazo, decidirBaixa, depoisDaConferencia, deveReabrir,
  metodoDoMeio, nsuDaBaixa, nsuDoPedido, pedidoDoLink, resultadoDaDecisao, textoCheckoutDesligado, textoJaPagoPorFora, textoNsuNovo,
  textoNsuRepetido, textoOutroPagamento, textoPagoAoAluno, textoPagoAoPersonal, textoSemConfirmacao, textoValorDiferente, urlDaInfinitePay,
  type AvisoIp, type ConferenciaIp, type Decisao, type MeioIp, type ModoConferencia,
} from "./infinitepay-regras.ts";
import { conferirPagamento, type ErroIp, type OpcoesIp } from "./infinitepay.ts";
import type { Log } from "./log.ts";
import type { Prazo } from "./tempo.ts";

export interface ContextoIp {
  schema: Schema;
  log: Log;
  prazo: Prazo;
  ip: OpcoesIp;
}
export type ResultadoAviso = Decisao | "nsu_repetido" | "em_andamento" | "adiado" | "desistiu" | "sem_tentativa";

const TABELA_AUSENTE = /relation .* does not exist|42P01|PGRST20[0-9]|could not find the table/i;
const W1_NO_SCHEMA = new Map<Schema, { tem: boolean; em: number }>();

/** A W1 chegou a este schema? A função é uma só para public e staging: o que é novo só liga com a migration (UMA só — I2), guardado
 *  por 60 s. */
export async function schemaTemW1(db: SupabaseClient, schema: Schema): Promise<boolean> {
  const g = W1_NO_SCHEMA.get(schema);
  if (g && Date.now() - g.em < 60_000) return g.tem;
  const { error } = await db.from("infinitepay_avisos").select("id").limit(1);
  if (error && !TABELA_AUSENTE.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw error;
  W1_NO_SCHEMA.set(schema, { tem: !error, em: Date.now() });
  return !error;
}

const COLUNAS_TENTATIVA = "id, paciente_id, conta_id, tipo, valor, status, forma, deleted_at, ip_handle, ip_transaction_nsu";
const COLUNAS_LINK = "pedido, cobranca_id, n, handle, centavos, criado_em";
const COLUNAS_AVISO = "id, cobranca_id, pedido, transaction_nsu, slug, recibo_url, meio, origem, recebido_em, tentativas";
/** Os resultados que mandaram um aviso de "confira" ao personal (o teto de 1 por cobrança a cada 24 h). */
const AVISA_O_PERSONAL = ["ja_pago_por_fora", "nsu_novo", "outro_pagamento", "valor_diferente", "nsu_repetido", "desistiu"];

interface Tentativa {
  id: string;
  paciente_id: string;
  conta_id: string | null;
  tipo: "mensalidade" | "avulsa";
  valor: number | string;
  status: string;
  forma: string | null;
  deleted_at: string | null;
  ip_handle: string | null;
  ip_transaction_nsu: string | null;
}

/** Um link da InfinitePay (I4): o pedido, a cobrança, a InfiniteTag e o preço DELE. */
export interface LinkDoPedido {
  pedido: string;
  cobranca_id: string;
  n: number;
  handle: string;
  centavos: number;
  criado_em: string;
}

interface Aviso {
  id: number;
  cobranca_id: string;
  pedido: string;
  transaction_nsu: string;
  slug: string;
  recibo_url: string | null;
  meio: string | null;
  origem: string;
  recebido_em: string;
  tentativas: number;
}

// ───────────────────────── os links (I4) ─────────────────────────

/** O link pelo pedido (o order_nsu que voltou da InfinitePay). */
export async function linkDoPedido(db: SupabaseClient, pedido: string): Promise<LinkDoPedido | null> {
  const { data, error } = await db.from("infinitepay_links").select(COLUNAS_LINK).eq("pedido", pedido).maybeSingle();
  if (error) throw error;
  return (data as LinkDoPedido | null) ?? null;
}

/** O link mais novo da cobrança (o que a tela abriu por último). */
export async function ultimoLink(db: SupabaseClient, cobrancaId: string): Promise<LinkDoPedido | null> {
  const { data, error } = await db.from("infinitepay_links").select(COLUNAS_LINK).eq("cobranca_id", cobrancaId)
    .order("n", { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as LinkDoPedido[])[0] ?? null;
}

/** Um pedido novo para a cobrança (n = o último + 1), com a InfiniteTag e o preço deste link. O pedido é SEMPRE o pedidoDoLink
 *  (`<cobranca_id>-<n>`): o webhook e a volta recusam o order_nsu que é só o id da cobrança (lerPedidoDoLink). Se 2 toques chegarem ao
 *  mesmo tempo, o 2º dá 23505 e vira erro_interno (a tela tenta de novo e reaproveita o link do 1º). */
export async function novoLink(db: SupabaseClient, cobrancaId: string, handle: string, centavos: number): Promise<string> {
  const n = ((await ultimoLink(db, cobrancaId))?.n ?? 0) + 1;
  const pedido = pedidoDoLink(cobrancaId, n);
  const { error } = await db.from("infinitepay_links").insert({ pedido, cobranca_id: cobrancaId, n, handle, centavos });
  if (error) throw error;
  return pedido;
}

// ───────────────────────── a caixa ─────────────────────────

/** Põe o aviso na caixa e devolve o id dele, ou o motivo de ter ignorado:
 *  · o mesmo (link, NSU, slug) não duplica;
 *  · fechado SEM pagamento (nao_pago, desistiu), reabre — I1: o webhook verdadeiro depois de um "não pago";
 *  · aviso novo (ou reaberto) só de link com até 72 h + 7 dias e até 20 por cobrança — I6.
 *  O aviso ainda pendente volta sempre: a rodada reenvia os dela e não pode ficar presa no prazo.
 *  O aviso novo nasce "na hora" pelo relógio desta função (proxima_em = agora, não o now() do banco): a conferência da tela logo em
 *  seguida (proxima_em <= agora) não fica para depois por diferença de relógio entre a função e o banco. */
export async function registrarAviso(db: SupabaseClient, link: LinkDoPedido, a: AvisoIp, origem: "webhook" | "volta" | "pedido",
  agora: Date = new Date()): Promise<{ id: number } | { ignorado: "prazo" | "teto" }> {
  const slug = a.slug ?? "";
  const { data: ja, error: ej } = await db.from("infinitepay_avisos").select("id, conferido_em, resultado").eq("pedido", link.pedido)
    .eq("transaction_nsu", a.nsu).eq("slug", slug).maybeSingle();
  if (ej) throw ej;
  const existente = ja as { id: number; conferido_em: string | null; resultado: string | null } | null;
  if (existente && (!existente.conferido_em || !deveReabrir(existente.resultado))) return { id: existente.id };
  if (!avisoNoPrazo(link.criado_em, agora)) return { ignorado: "prazo" };
  if (existente) {
    const { error } = await db.from("infinitepay_avisos").update({ conferido_em: null, resultado: null, tentado_em: null, tentativas: 0,
      proxima_em: agora.toISOString() }).eq("id", existente.id).not("conferido_em", "is", null);
    if (error) throw error;
    return { id: existente.id };
  }
  const { count, error: ec } = await db.from("infinitepay_avisos").select("id", { count: "exact", head: true }).eq("cobranca_id", link.cobranca_id);
  if (ec) throw ec;
  if ((count ?? 0) >= IP_AVISOS_POR_COBRANCA) return { ignorado: "teto" };
  const linha = { cobranca_id: link.cobranca_id, pedido: link.pedido, transaction_nsu: a.nsu, slug, recibo_url: a.recibo, meio: a.meio, origem,
    proxima_em: agora.toISOString() };
  const { data, error } = await db.from("infinitepay_avisos").upsert(linha, { onConflict: "pedido,transaction_nsu,slug", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  const nova = ((data ?? []) as Array<{ id: number }>)[0];
  if (nova) return { id: nova.id };
  // outra chamada gravou o mesmo aviso no meio do caminho: ele já está lá
  const { data: d2, error: e2 } = await db.from("infinitepay_avisos").select("id").eq("pedido", link.pedido).eq("transaction_nsu", a.nsu)
    .eq("slug", slug).single();
  if (e2) throw e2;
  return { id: (d2 as { id: number }).id };
}

/** Confere UM aviso na InfinitePay, com a InfiniteTag e o preço do LINK, e aplica o que ela disse. No modo "tela" (I3), só confere se já
 *  está na hora (proxima_em) e não gasta tentativa. */
export async function conferirAviso(db: SupabaseClient, avisoId: number, ctx: ContextoIp, modo: ModoConferencia = "servidor"):
  Promise<ResultadoAviso> {
  const agora = new Date();
  let q = db.from("infinitepay_avisos").update({ tentado_em: agora.toISOString() }).eq("id", avisoId).is("conferido_em", null)
    .or(`tentado_em.is.null,tentado_em.lt.${new Date(agora.getTime() - 20_000).toISOString()}`);
  if (modo === "tela") q = q.lte("proxima_em", agora.toISOString()).lt("tentativas", IP_MAX_TENTATIVAS);
  const { data: pegos, error: ep } = await q.select(COLUNAS_AVISO);
  if (ep) throw ep;
  const aviso = ((pegos ?? []) as Aviso[])[0];
  if (!aviso) return "em_andamento"; // já conferido, fora da hora (tela) ou outra conferência com ele na mão
  const link = await linkDoPedido(db, aviso.pedido);
  const { data: t, error: et } = await db.from("cobrancas").select(COLUNAS_TENTATIVA).eq("id", aviso.cobranca_id).maybeSingle();
  if (et) throw et;
  const c = t as Tentativa | null;
  if (!c || !link) {
    await fechar(db, aviso, "nao_pago");
    return "sem_tentativa";
  }
  const r = await conferirPagamento(link.handle, link.pedido, aviso.transaction_nsu, aviso.slug || null, { ...ctx.ip, prazo: ctx.prazo });
  // sem resposta que decida (rede, tempo, 5xx, 429 ou o checkout desligado — Task 3): tenta de novo depois, NUNCA fecha antes da hora
  if (!r.conferencia) return await semBaixa(db, aviso, c, ctx, modo, "sem_resposta", r.status, r.erro);
  const decisao = decidirBaixa({ status: c.status, forma: c.forma, centavos: link.centavos, nsu: c.ip_transaction_nsu }, r.conferencia,
    aviso.transaction_nsu);
  if (decisao === "nao_pago") return await semBaixa(db, aviso, c, ctx, modo, "nao_pago", r.status);
  return await aplicar(db, decisao, c, link, aviso, r.conferencia, ctx);
}

/** Os avisos pendentes de uma cobrança ou de um aluno, até `max`, os que estão na hora primeiro. Volta "nenhum" só quando não há aviso
 *  pendente. No modo "tela", o aviso fora da hora volta "em_andamento" e nenhum gasta tentativa (I3). */
export async function conferirAvisosPendentes(db: SupabaseClient, filtro: { cobrancaId?: string; pacienteId?: string }, ctx: ContextoIp,
  max: number, modo: ModoConferencia): Promise<ResultadoAviso | "nenhum"> {
  let q = db.from("infinitepay_avisos").select("id, cobrancas!inner(paciente_id)").is("conferido_em", null);
  if (filtro.cobrancaId) q = q.eq("cobranca_id", filtro.cobrancaId);
  if (filtro.pacienteId) q = q.eq("cobrancas.paciente_id", filtro.pacienteId);
  const { data, error } = await q.order("proxima_em").limit(max);
  if (error) throw error;
  let ultimo: ResultadoAviso | "nenhum" = "nenhum";
  for (const { id } of (data ?? []) as Array<{ id: number }>) ultimo = await conferirAviso(db, id, ctx, modo);
  return ultimo;
}

/** W1-B2: sem nenhum aviso (o webhook não chegou e a página fechou antes do "Continuar"), pergunta à InfinitePay SÓ pelo pedido do link
 *  mais novo, no máximo 1 vez a cada 30 s por tentativa. Se ela disser "pago", vira um aviso (com o NSU que vier, ou o do pedido) e segue
 *  a conferência de sempre, como a tela.
 *  SÓ na tentativa ainda NÃO paga (revisão da Task 1b): ela é "pega" com o status "aguardando_confirmacao" (a paga, a vencida e a de
 *  outra forma dão "cedo"). Numa cobrança já paga, o NSU do pedido daria "ja_feito" com qualquer link (decidirBaixa) e o personal não
 *  saberia de um 2º link pago; esse chega pelo webhook, com o NSU de verdade ("outro_pagamento"). Quem chama confere o status antes. */
export async function conferirPeloPedido(db: SupabaseClient, cobrancaId: string, ctx: ContextoIp):
  Promise<ResultadoAviso | "cedo" | "nao_pago_pedido" | "sem_resposta" | "ignorado"> {
  const agora = new Date();
  const limite = new Date(agora.getTime() - IP_CONFERIR_PEDIDO_MS).toISOString();
  const { data, error } = await db.from("cobrancas").update({ ip_conferido_em: agora.toISOString() })
    .eq("id", cobrancaId).eq("forma", "infinitepay").eq("status", "aguardando_confirmacao").not("ip_handle", "is", null)
    .or(`ip_conferido_em.is.null,ip_conferido_em.lt.${limite}`).select("id");
  if (error) throw error;
  if (!((data ?? []) as unknown[]).length) return "cedo";
  const link = await ultimoLink(db, cobrancaId);
  if (!link) return "sem_resposta";
  const r = await conferirPagamento(link.handle, link.pedido, null, null, { ...ctx.ip, prazo: ctx.prazo });
  if (!r.conferencia) return "sem_resposta";
  if (!r.conferencia.pago) return "nao_pago_pedido";
  const reg = await registrarAviso(db, link, {
    pedido: link.pedido, cobranca: cobrancaId, nsu: r.conferencia.nsu ?? nsuDoPedido(link.pedido), slug: null, recibo: null,
    meio: r.conferencia.meio,
  }, "pedido", agora);
  if ("ignorado" in reg) return "ignorado";
  return await conferirAviso(db, reg.id, ctx, "tela");
}

/** A tentativa vencida sem aviso pendente sai (SQL: {schema}.infinitepay_fechar_vencidas). */
export async function fecharVencidas(db: SupabaseClient, pacienteId: string | null): Promise<number> {
  const { data, error } = await db.rpc("infinitepay_fechar_vencidas", { p_paciente: pacienteId });
  if (error) throw error;
  return Number(data) || 0;
}

// ───────────────────────── aplicar a decisão ─────────────────────────

async function aplicar(db: SupabaseClient, d: Decisao, c: Tentativa, link: LinkDoPedido, a: Aviso, conf: ConferenciaIp, ctx: ContextoIp,
  releu = false): Promise<ResultadoAviso> {
  const valor = conf.centavos ?? link.centavos;
  if (d === "baixar") {
    const meio = conf.meio ?? (a.meio === "pix" || a.meio === "credit_card" ? (a.meio as MeioIp) : null);
    const { data, error } = await db.from("cobrancas").update({
      status: "paga", forma: "infinitepay", metodo: metodoDoMeio(meio), pago_em: a.recebido_em, ip_handle: link.handle,
      ip_transaction_nsu: nsuDaBaixa(conf, a.transaction_nsu), ip_slug: a.slug || null, ip_recibo_url: urlDaInfinitePay(a.recibo_url),
      ip_valor_pago: conf.centavosPagos ? conf.centavosPagos / 100 : null, ip_parcelas: conf.parcelas, ip_meio: meio,
      deleted_at: null, recusado_motivo: null, recusado_em: null,
    }).eq("id", c.id).neq("status", "paga").select("id");
    if (error && String(error.code) === "23505") {
      // o mesmo NSU já deu baixa em OUTRA cobrança desta InfiniteTag (o mesmo pagamento em 2 pedidos): sem baixa, com aviso (MENOR 3)
      ctx.log.aviso({ codigo: "ip_nsu_repetido", schema: ctx.schema, ref: c.id });
      await avisarUmaVez(db, c, (nome) => textoNsuRepetido(nome), ctx);
      await fechar(db, a, "nsu_repetido");
      return "nsu_repetido";
    }
    if (error) throw error;
    if (!data?.length) {
      // outra conferência ganhou (0 linhas): relê e decide de novo, 1 vez (MENOR 3) — o 2º NSU de verdade vira "outro pagamento"
      // (aviso) em vez de sumir calado
      if (releu) {
        await fechar(db, a, "ja_pago");
        return "ja_feito";
      }
      const { data: t2, error: e2 } = await db.from("cobrancas").select(COLUNAS_TENTATIVA).eq("id", c.id).single();
      if (e2) throw e2;
      const c2 = t2 as Tentativa;
      const d2 = decidirBaixa({ status: c2.status, forma: c2.forma, centavos: link.centavos, nsu: c2.ip_transaction_nsu }, conf, a.transaction_nsu);
      return await aplicar(db, d2, c2, link, a, conf, ctx, true);
    }
    await avisarPago(db, c, conf, valor, ctx);
  } else if (d === "nsu_novo" || d === "outro_pagamento") {
    // C1: nada credita e o NSU gravado não muda — só o aviso de "confira" ao personal
    ctx.log.aviso({ codigo: d === "nsu_novo" ? "ip_nsu_novo" : "ip_outro_pagamento", schema: ctx.schema, ref: c.id });
    await avisarUmaVez(db, c, (nome) => (d === "nsu_novo" ? textoNsuNovo(nome, valor) : textoOutroPagamento(nome, valor)), ctx);
  } else if (d === "ja_pago_por_fora") {
    await avisarUmaVez(db, c, (nome) => textoJaPagoPorFora(nome, valor), ctx);
  } else if (d === "valor_diferente") {
    ctx.log.aviso({ codigo: "ip_valor_diferente", schema: ctx.schema, ref: c.id });
    await avisarUmaVez(db, c, (nome) => textoValorDiferente(nome), ctx);
  }
  await fechar(db, a, resultadoDaDecisao(d));
  return d;
}

async function avisarPago(db: SupabaseClient, c: Tentativa, conf: ConferenciaIp, valor: number, ctx: ContextoIp): Promise<void> {
  const m = await carregarMatricula(db, c.paciente_id);
  await avisar(db, m?.user_id, "pagamento_confirmado", textoPagoAoAluno(valor), "/perfil/pagamentos", ctx.log, ctx.schema);
  if (m) {
    await avisar(db, recebedor(m), "pagamento_confirmado", textoPagoAoPersonal(m.nome, valor, conf.meio, conf.parcelas),
      linkDoAlunoNoPainel(m), ctx.log, ctx.schema);
  }
  // a trava do Nutri antigo acompanha (o mesmo da pagamentos-aluno)
  const { error } = await db.rpc("cobrancas_atualizar_bloqueio");
  if (error) ctx.log.excecao(error, { codigo: "atualizar_bloqueio_falhou", schema: ctx.schema });
}

/** O aviso de "confira" ao personal: no máximo 1 por cobrança a cada 24 h. Assim o POST forjado em série não vira enxurrada no sino (I6).
 *  Chame ANTES de fechar o aviso que motivou este: fechado, ele mesmo já contaria no teto e o sino calaria. */
async function avisarUmaVez(db: SupabaseClient, c: Tentativa, texto: (nome: string) => string, ctx: ContextoIp): Promise<void> {
  const { count, error } = await db.from("infinitepay_avisos").select("id", { count: "exact", head: true }).eq("cobranca_id", c.id)
    .in("resultado", AVISA_O_PERSONAL).gt("conferido_em", new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw error;
  if ((count ?? 0) > 0) return;
  const m = await carregarMatricula(db, c.paciente_id);
  if (m) await avisar(db, recebedor(m), "geral", texto(m.nome), linkDoAlunoNoPainel(m), ctx.log, ctx.schema);
}

/** Sem baixa nesta conferência (I1/I3 — depoisDaConferencia): reagenda. Na 24ª conferência do servidor, fecha: "não pago" fecha calado;
 *  sem resposta avisa o personal (antes de fechar — avisarUmaVez) e fecha como "desistiu". O checkout desligado tem o texto próprio. */
async function semBaixa(db: SupabaseClient, a: Aviso, c: Tentativa, ctx: ContextoIp, modo: ModoConferencia, motivo: "nao_pago" | "sem_resposta",
  status: number, erro?: ErroIp): Promise<ResultadoAviso> {
  const p = depoisDaConferencia(a.tentativas, motivo, modo);
  if (erro === "checkout_desligado") ctx.log.aviso({ codigo: "ip_checkout_desligado", schema: ctx.schema, ref: c.id, status });
  if (p.fechar === "nao_pago") {
    await fechar(db, a, "nao_pago", p.tentativas);
    return "nao_pago";
  }
  if (p.fechar === "desistiu") {
    ctx.log.erro({ codigo: "ip_conferir_desistiu", schema: ctx.schema, ref: c.id, status, n: p.tentativas });
    await avisarUmaVez(db, c, (nome) => (erro === "checkout_desligado" ? textoCheckoutDesligado(nome) : textoSemConfirmacao(nome)), ctx);
    await fechar(db, a, "desistiu", p.tentativas);
    return "desistiu";
  }
  const { error } = await db.from("infinitepay_avisos").update({ tentativas: p.tentativas, proxima_em: p.proxima_em }).eq("id", a.id);
  if (error) throw error;
  if (modo === "servidor") {
    ctx.log.aviso({ codigo: motivo === "nao_pago" ? "ip_nao_pago_reagendado" : "ip_conferir_adiado", schema: ctx.schema, ref: c.id, status,
      n: p.tentativas });
  }
  return motivo === "nao_pago" ? "nao_pago" : "adiado";
}

async function fechar(db: SupabaseClient, a: Aviso, resultado: string, tentativas = a.tentativas + 1): Promise<void> {
  const { error } = await db.from("infinitepay_avisos").update({ conferido_em: new Date().toISOString(), resultado, tentativas }).eq("id", a.id);
  if (error) throw error;
}
