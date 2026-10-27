// Physiq play-W6 (16/10/2026) — a assinatura da Google Play no banco e a ORDEM de cada compra, a mesma no registrar (play-compras) e na
// conferência de hora em hora (play-conferir — no lugar do aviso do Google pelo Pub/Sub, a play-rtdn, que saiu em 22/10/2026: sem
// faturamento no Google Cloud não há Pub/Sub):
//   o GET (a fonte da verdade) → a play_aplicar (a assinatura, a anterior substituída, o plano, a cobrança, a devolução — numa transação)
//   → reconhecer se faltar (só a matrícula do app que vale; a encerrada fica sem: o Google devolve sozinho em 3 dias) → o defer da 1ª
//   compra coberta (o teste grátis ou o mês pago pelo MP: o que falta, ≥ 1 dia) → de novo o GET + a play_aplicar com o fim novo.
// E o cancelamento do vínculo e da exclusão (cancelarPlayDasMatriculas: DEVELOPER_REQUESTED_STOP_PAYMENTS — vale até o fim, sem devolver,
// decisão 7) e as vivas para a conferência (vivasParaConferir: as há mais tempo sem conferir primeiro).
// Compatível por construção: sem linha da Play, nenhuma ida ao Google (o caminho de hoje); sem o segredo PLAY_SERVICE_ACCOUNT, o
// cancelamento conta como falha com o log play_sem_credencial (quem chama decide, como no MP); a tabela que ainda não existe (a função
// publicada antes da migration) = sem Play. O banco é o de quem chama (o service role, sempre: a play_assinaturas é só do servidor).
// Erro do banco LANÇA (hml-14); o Google sem resposta que decida → PlayIndisponivel (quem chama tenta de novo / responde 502 ou 500).
// Nunca vai para o log: o token, o pedido, o etag, o corpo do Google (só o status e o código curto — google_erro).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import type { Log } from "./log.ts";
import { PlayIndisponivel, adiar, cancelar, contaDaPlay, obter, reconhecer, type OpcoesPlay } from "./play-api.ts";
import {
  CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO, ESTADOS_QUE_RENOVAM, ESTADOS_VIVOS, compraNaoExiste, diasParaAdiar, duracaoDoAdiamento,
  ehUuid, entradaDoGoogle, fimDoAdiamento, googleTransitorio, lerAssinaturaV2, type AssinaturaGoogle, type EntradaAplicar, type EstadoPlay,
  type Schema,
} from "./play-regras.ts";
import type { Prazo } from "./tempo.ts";

export interface LinhaPlayBanco {
  token: string;
  paciente_id: string;
  estado: EstadoPlay;
  renova: boolean;
  expira_em: string | null;
  produto: string;
  teste: boolean;
  /** T2 (26/10/2026): o produto que entra na renovação (a troca agendada — DEFERRED); null = sem troca. A coluna nasceu na
   *  20261027010000_playw6_troca_para.sql (nos 2 schemas ANTES de publicar as funções que a leem) */
  troca_para?: string | null;
}
const COLUNAS = "token, paciente_id, estado, renova, expira_em, produto, teste, troca_para";

/** O que a play_aplicar devolve (supabase-principal/migrations/20261016010000_playw6_play_billing.sql). */
export interface RespostaAplicar {
  ok: boolean;
  erro?: string;
  nova?: boolean;
  estado?: EstadoPlay;
  expira_em?: string | null;
  reconhecida_em?: string | null;
  adiar_ate?: string | null;
  adiada_em?: string | null;
  cobertura_antes?: string | null;
  pago_ate?: string | null;
  cobranca?: string | null;
  devolvidas?: number;
  plano?: Record<string, unknown> | null;
  matricula_ativa?: boolean;
}

export interface ContextoPlay {
  /** o banco do schema da matrícula (service role) */
  db: SupabaseClient;
  schema: Schema;
  log: Log;
  /** o prazo do pedido (as idas ao Google levam só o que sobra) */
  prazo?: Prazo;
  /** o fetch (o Vitest passa um falso) */
  buscar?: typeof fetch;
}

const opcoesDe = (c: ContextoPlay): OpcoesPlay => ({ prazo: c.prazo, buscar: c.buscar });

/** A tabela ainda não está no schema (a função publicada antes da migration): é "sem Play", não erro. */
export function semTabela(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  return e.code === "42P01" || e.code === "PGRST205" || (typeof e.message === "string" && /play_assinaturas/.test(e.message) && /does not exist|could not find/i.test(e.message));
}

/** A play_aplicar (só o service role executa). Erro do banco lança. */
export async function aplicar(db: SupabaseClient, entrada: EntradaAplicar): Promise<RespostaAplicar> {
  const { data, error } = await db.rpc("play_aplicar", { p: entrada });
  if (error) throw error;
  return (data && typeof data === "object" ? data : { ok: false, erro: "vazio" }) as RespostaAplicar;
}

/** A linha da Play deste token (null = não é nossa neste schema, ou a tabela ainda não existe). */
export async function assinaturaDoToken(db: SupabaseClient, token: string): Promise<LinhaPlayBanco | null> {
  const { data, error } = await db.from("play_assinaturas").select(COLUNAS).eq("token", token).maybeSingle();
  if (error) {
    if (semTabela(error)) return null;
    throw error;
  }
  return (data as LinhaPlayBanco | null) ?? null;
}

/** A cancelada que já venceu NÃO é viva (a expiração que ainda não chegou ao banco): a mesma regra da play_aplicar (a revisão, 🟡3). */
const naoVencida = (agora = new Date()): string => `estado.neq.cancelada,expira_em.is.null,expira_em.gte.${agora.toISOString()}`;

/** A assinatura VIVA da matrícula (uma no máximo — play_assinaturas_viva_uq; a cancelada vencida fica de fora); null = nenhuma. */
export async function assinaturaVivaDa(db: SupabaseClient, pacienteId: string): Promise<LinhaPlayBanco | null> {
  const { data, error } = await db.from("play_assinaturas").select(COLUNAS).eq("paciente_id", pacienteId)
    .in("estado", ESTADOS_VIVOS as string[]).or(naoVencida()).order("atualizada_em", { ascending: false }).limit(1);
  if (error) {
    if (semTabela(error)) return null;
    throw error;
  }
  return ((data ?? []) as LinhaPlayBanco[])[0] ?? null;
}

/** As assinaturas VIVAS destas matrículas (o pagamentos-aluno recusa o MP com a Play viva; a cancelada vencida fica de fora). */
export async function vivasDasMatriculas(db: SupabaseClient, pacienteIds: string[]): Promise<LinhaPlayBanco[]> {
  if (!pacienteIds.length) return [];
  const { data, error } = await db.from("play_assinaturas").select(COLUNAS).in("paciente_id", pacienteIds)
    .in("estado", ESTADOS_VIVOS as string[]).or(naoVencida()).order("atualizada_em", { ascending: false }).limit(1000);
  if (error) {
    if (semTabela(error)) return [];
    throw error;
  }
  return (data ?? []) as LinhaPlayBanco[];
}

/**
 * A conferência de hora em hora (a play-conferir): as vivas DESTE schema, as que estão há mais tempo sem conferir primeiro (o atualizada_em
 * — a play_aplicar grava a hora a cada sincronia), até `limite`; `total` = quantas vivas há (o resto fica para a próxima hora). A tabela que
 * ainda não existe (a função publicada antes da migration) = nenhuma. Erro do banco lança.
 */
export async function vivasParaConferir(db: SupabaseClient, limite: number): Promise<{ linhas: LinhaPlayBanco[]; total: number }> {
  const { data, error, count } = await db.from("play_assinaturas").select(COLUNAS, { count: "exact" })
    .in("estado", ESTADOS_VIVOS as string[]).order("atualizada_em", { ascending: true }).order("token").limit(limite);
  if (error) {
    if (semTabela(error)) return { linhas: [], total: 0 };
    throw error;
  }
  const linhas = (data ?? []) as LinhaPlayBanco[];
  return { linhas, total: Math.max(typeof count === "number" ? count : 0, linhas.length) };
}

/** O que o app e as leituras mostram da assinatura (nunca o token nem o pedido). T2: + a troca agendada (troca_para; sem ela, null). */
export function vistaDaPlay(l: Pick<LinhaPlayBanco, "estado" | "renova" | "expira_em" | "produto" | "troca_para"> | null): {
  estado: EstadoPlay; renova: boolean; expira_em: string | null; produto: string; troca_para: string | null;
} | null {
  return l ? { estado: l.estado, renova: l.renova, expira_em: l.expira_em, produto: l.produto, troca_para: l.troca_para ?? null } : null;
}

/** O GET lido; 404/410/400 = a compra não existe (null); o Google sem resposta que decida → PlayIndisponivel. */
export async function lerDoGoogle(c: ContextoPlay, token: string): Promise<AssinaturaGoogle | null> {
  const r = await obter(token, opcoesDe(c));
  if (r.status === 200) return lerAssinaturaV2(r.corpo);
  if (compraNaoExiste(r.status)) return null;
  if (googleTransitorio(r.status)) throw new PlayIndisponivel(r.status, r.erro);
  throw new PlayIndisponivel(r.status, r.erro);
}

export interface PedidoSincronia {
  /** a matrícula dona (já conferida por quem chama) */
  pacienteId: string;
  /** o GET já lido (quem chama conferiu o dono com ele) — sem ele, a sincronia lê */
  assinatura?: AssinaturaGoogle | null;
  /** o Google revogou (a devolvida da Voided Purchases API com o acesso cortado) */
  revogada?: boolean;
  /** o pedido devolvido (o voidedPurchaseNotification) */
  devolvidoPedido?: string | null;
  canceladaPor?: "vinculo" | "exclusao" | "google" | null;
  /** reconhecer se faltar (o registrar e a conferência das vivas: sim) */
  reconhecer: boolean;
  /** o defer da 1ª compra coberta (o padrão: sim; a ressincronia do estado: não) */
  adiar?: boolean;
}

export type ResultadoSincronia =
  | { ok: true; resposta: RespostaAplicar; assinatura: AssinaturaGoogle; reconheceu: boolean; adiou: boolean }
  | { ok: false; erro: string; assinatura: AssinaturaGoogle | null };

/** A play_aplicar com a outra viva conferida: a outra (sem ligação) pode ter vencido sem chegar ao banco — lê no Google, grava e tenta de novo 1 vez. */
async function aplicarComAOutraConferida(c: ContextoPlay, entrada: EntradaAplicar): Promise<RespostaAplicar> {
  const r = await aplicar(c.db, entrada);
  if (r.ok || r.erro !== "outra_viva") return r;
  const outra = await assinaturaVivaDa(c.db, entrada.paciente_id);
  if (!outra || outra.token === entrada.token) return r;
  const a = await lerDoGoogle(c, outra.token);
  const e = a ? entradaDoGoogle(outra.paciente_id, outra.token, a) : null;
  if (e) {
    const r2 = await aplicar(c.db, e);
    if (!r2.ok) c.log.aviso({ codigo: "play_outra_viva_falhou", schema: c.schema, ref: outra.paciente_id, resultado: r2.erro ?? null });
  }
  return await aplicar(c.db, entrada);
}

/**
 * A ordem de uma compra (o registrar) ou da conferência: o GET → a play_aplicar → reconhecer (se faltar) → o defer (1 vez) → o GET + a play_aplicar de
 * novo. Lança PlayIndisponivel (o Google sem resposta no GET) e o erro do banco; reconhecer e adiar que falham vão ao log e ficam para a
 * próxima vez (a compra que ficou no meio volta pelo app e a conferência de hora em hora repete).
 */
export async function sincronizar(c: ContextoPlay, token: string, p: PedidoSincronia): Promise<ResultadoSincronia> {
  const a = p.assinatura !== undefined ? p.assinatura : await lerDoGoogle(c, token);
  if (!a) return { ok: false, erro: "compra_invalida", assinatura: null };
  const extra = { revogada: p.revogada, canceladaPor: p.canceladaPor ?? null, devolvidoPedido: p.devolvidoPedido ?? null };
  const entrada = entradaDoGoogle(p.pacienteId, token, a, extra);
  if (!entrada) return { ok: false, erro: "compra_invalida", assinatura: a };
  let resposta = await aplicarComAOutraConferida(c, entrada);
  if (!resposta.ok) return { ok: false, erro: resposta.erro ?? "erro", assinatura: a };
  let atual = a;
  let reconheceu = false;
  let adiou = false;
  const vale = resposta.matricula_ativa === true && (resposta.estado === "ativa" || resposta.estado === "carencia" || resposta.estado === "cancelada");

  // reconhecer (v1, pelo produto vigente) — só a compra que vale na matrícula do app que vale
  if (p.reconhecer && vale && !atual.reconhecida && atual.produto) {
    try {
      const r = await reconhecer(atual.produto, token, opcoesDe(c));
      if (r.status >= 200 && r.status < 300) {
        reconheceu = true;
        resposta = await aplicar(c.db, { ...entrada, reconhecida: true });
        c.log.info({ codigo: "play_reconhecida", schema: c.schema, ref: p.pacienteId });
      } else if (r.status === 409 && r.erro === "concurrentUpdate") {
        // T4: 2 sincronias da MESMA compra no mesmo segundo (visto em 26/10 na compra de teste do staging): o Google aceita uma e recusa
        // a outra com 409 concurrentUpdate. A que passou reconhece, e a conferência de hora em hora reconhece de novo se faltar — não é
        // erro (não avisa). Outro motivo ou outro status segue erro.
        c.log.aviso({ codigo: "play_reconhecer_falhou", schema: c.schema, ref: p.pacienteId, status: r.status, resultado: "concorrente",
          externo: { google_erro: r.erro } });
      } else {
        c.log.erro({ codigo: "play_reconhecer_falhou", schema: c.schema, ref: p.pacienteId, status: r.status, externo: { google_erro: r.erro } });
      }
    } catch (e) {
      if (!(e instanceof PlayIndisponivel)) throw e;
      c.log.aviso({ codigo: "play_reconhecer_falhou", schema: c.schema, ref: p.pacienteId, status: e.status, externo: { google_erro: e.codigo } });
    }
  }

  // o defer da 1ª compra coberta (o que falta do teste ou do mês do MP), UMA vez só (a revisão, 🟡1): a marca adiada_em é RESERVADA no banco
  // antes de ir ao Google (o update atômico: quem não reservou não adia — a conferência ou o registrar repetido que chega no meio) e, logo
  // depois do 2xx,
  // gravada com o fim novo da PRÓPRIA resposta do defer, antes de qualquer outra ida. O Google que recusa (4xx: resposta que decide) desfaz
  // a reserva e a próxima sincronia tenta de novo; o Google sem resposta (prazo, rede) ou com 5xx MANTÉM a reserva: adiar 2 vezes daria de
  // novo os dias (a receita some calada) — o log play_adiar_incerto avisa para conferir no Console.
  const dias = p.adiar !== false && resposta.estado === "ativa" && resposta.matricula_ativa === true && resposta.adiar_ate && !resposta.adiada_em
    ? diasParaAdiar(resposta.adiar_ate, atual.inicio) : null;
  if (dias) {
    const reservada = await reservarAdiamento(c.db, token);
    if (!reservada) {
      c.log.aviso({ codigo: "play_adiar_ja_reservado", schema: c.schema, ref: p.pacienteId });
    } else {
      resposta = { ...resposta, adiada_em: reservada };
      let fresca: AssinaturaGoogle | null = null;
      try {
        fresca = reconheceu ? await lerDoGoogle(c, token) : atual; // reconhecer muda o etag
      } catch (e) {
        if (!(e instanceof PlayIndisponivel)) throw e;
        // o GET de antes do defer caiu: o defer nem foi pedido — a reserva sai e a próxima sincronia tenta
        await desfazerReserva(c.db, token, reservada);
        resposta = { ...resposta, adiada_em: null };
        c.log.aviso({ codigo: "play_adiar_falhou", schema: c.schema, ref: p.pacienteId, status: e.status, externo: { google_erro: e.codigo } });
      }
      if (fresca?.etag) {
        let r: Awaited<ReturnType<typeof adiar>> | null = null;
        try {
          r = await adiar(token, fresca.etag, duracaoDoAdiamento(dias), opcoesDe(c));
        } catch (e) {
          if (!(e instanceof PlayIndisponivel)) throw e;
          c.log.erro({ codigo: "play_adiar_incerto", schema: c.schema, ref: p.pacienteId, n: dias, status: e.status, externo: { google_erro: e.codigo } });
        }
        if (r && r.status >= 200 && r.status < 300) {
          adiou = true;
          // a marca com o fim novo da resposta do defer, LOGO depois do 2xx (antes de qualquer outra ida ao Google)
          const fim = fimDoAdiamento(r.corpo);
          const marca = entradaDoGoogle(p.pacienteId, token, fim ? { ...fresca, expiraEm: fim } : fresca, { ...extra, adiada: true, reconhecida: reconheceu });
          if (marca) resposta = await aplicar(c.db, marca);
          c.log.info({ codigo: "play_adiada", schema: c.schema, ref: p.pacienteId, n: dias });
          // depois, o GET (a fonte da verdade): se cair, a marca e o fim novo já estão no banco
          try {
            const depois = await lerDoGoogle(c, token);
            if (depois) {
              atual = depois;
              const e2 = entradaDoGoogle(p.pacienteId, token, depois, { ...extra, adiada: true, reconhecida: reconheceu });
              if (e2) resposta = await aplicar(c.db, e2);
            }
          } catch (e) {
            if (!(e instanceof PlayIndisponivel)) throw e;
            c.log.aviso({ codigo: "play_pos_adiar_get_falhou", schema: c.schema, ref: p.pacienteId, status: e.status, externo: { google_erro: e.codigo } });
          }
        } else if (r && r.status >= 500) {
          // o Google respondeu 5xx: INCERTO, como o prazo esgotado (ele pode ter aplicado o defer e caído depois) — a reserva FICA; adiar
          // de novo daria os dias 2 vezes (a conferência das correções, DECISÃO 07:08)
          c.log.erro({ codigo: "play_adiar_incerto", schema: c.schema, ref: p.pacienteId, n: dias, status: r.status, externo: { google_erro: r.erro } });
        } else if (r) {
          // o Google recusou (resposta que decide: 4xx): a reserva sai e a próxima sincronia tenta de novo
          await desfazerReserva(c.db, token, reservada);
          resposta = { ...resposta, adiada_em: null };
          c.log.erro({ codigo: "play_adiar_falhou", schema: c.schema, ref: p.pacienteId, status: r.status, externo: { google_erro: r.erro } });
        }
      } else if (fresca) {
        await desfazerReserva(c.db, token, reservada);
        resposta = { ...resposta, adiada_em: null };
        c.log.aviso({ codigo: "play_adiar_falhou", schema: c.schema, ref: p.pacienteId, resultado: "sem_etag" });
      }
    }
  }
  return { ok: true, resposta, assinatura: atual, reconheceu, adiou };
}

/** A reserva do defer (atômica: só quem acha adiada_em nulo reserva). Devolve o instante reservado ou null. Erro do banco lança. */
async function reservarAdiamento(db: SupabaseClient, token: string): Promise<string | null> {
  const { data, error } = await db.from("play_assinaturas").update({ adiada_em: new Date().toISOString() }).eq("token", token)
    .is("adiada_em", null).select("adiada_em");
  if (error) throw error;
  return ((data ?? []) as Array<{ adiada_em: string | null }>)[0]?.adiada_em ?? null;
}

/** Desfaz a reserva (só a que esta sincronia fez). Erro do banco lança. */
async function desfazerReserva(db: SupabaseClient, token: string, reservada: string): Promise<void> {
  const { error } = await db.from("play_assinaturas").update({ adiada_em: null }).eq("token", token).eq("adiada_em", reservada);
  if (error) throw error;
}

/** A linha mudou depois da play_aplicar? O estado ou o fim (o mesmo instante, em qualquer formato da data). */
export function mudou(antes: Pick<LinhaPlayBanco, "estado" | "expira_em">, depois: RespostaAplicar): boolean {
  const instante = (v: string | null | undefined) => (v ? Date.parse(v) : null);
  return (depois.estado ?? antes.estado) !== antes.estado || instante(depois.expira_em) !== instante(antes.expira_em);
}

/**
 * O `estado` da play-compras (a revisão, 🟡3): as linhas "vivas" desta matrícula cujo fim já passou — a renovação ou o EXPIRED que a
 * conferência de hora em hora ainda não trouxe — voltam ao Google: o GET + a play_aplicar, sem
 * reconhecer nem adiar. O Google fora = segue com o que o banco tem (log). Devolve quantas MUDARAM (o estado ou o fim). Erro do banco lança.
 */
export async function ressincronizarVencidas(c: ContextoPlay, pacienteId: string): Promise<number> {
  const { data, error } = await c.db.from("play_assinaturas").select(COLUNAS).eq("paciente_id", pacienteId)
    .in("estado", ESTADOS_VIVOS as string[]).lt("expira_em", new Date().toISOString()).order("atualizada_em", { ascending: false }).limit(5);
  if (error) {
    if (semTabela(error)) return 0;
    throw error;
  }
  let n = 0;
  for (const l of (data ?? []) as LinhaPlayBanco[]) {
    try {
      const r = await sincronizar(c, l.token, { pacienteId, reconhecer: false, adiar: false });
      // conta só a que MUDOU (o estado ou o fim): a suspensa/pausada tem o fim sempre no passado e volta igual — contá-la faria o app
      // invalidar o resumo a cada estado (a conferência das correções, DECISÃO 07:08)
      if (r.ok) {
        if (mudou(l, r.resposta)) n++;
      } else c.log.aviso({ codigo: "play_ressincronia_recusada", schema: c.schema, ref: pacienteId, resultado: (r as { erro: string }).erro });
    } catch (e) {
      if (!(e instanceof PlayIndisponivel)) throw e;
      c.log.aviso({ codigo: "play_ressincronia_falhou", schema: c.schema, ref: pacienteId, status: e.status, externo: { google_erro: e.codigo } });
    }
  }
  if (n) c.log.info({ codigo: "play_ressincronizada", schema: c.schema, ref: pacienteId, n });
  return n;
}

/**
 * A devolução de um token que o Google já esqueceu (o GET 404/410 — mais de 60 dias): o pedido da devolvida basta para marcar a cobrança dele
 * como devolvida (cancelada + reembolsado_em), sem o GET (a revisão, ⚪13). Devolve quantas marcou. Erro do banco lança.
 */
export async function devolverPedidoSemCompra(db: SupabaseClient, pacienteId: string, pedido: string): Promise<number> {
  const { data, error } = await db.from("cobrancas").update({ status: "cancelada", reembolsado_em: new Date().toISOString() })
    .eq("play_pedido", pedido).eq("forma", "google_play").eq("paciente_id", pacienteId).eq("status", "paga").select("id");
  if (error) throw error;
  return ((data ?? []) as unknown[]).length;
}

/**
 * O vínculo (a matrícula do app encerrada) e a exclusão: cancela no Google as assinaturas destas matrículas que ainda vão cobrar
 * (DEVELOPER_REQUESTED_STOP_PAYMENTS: vale até o fim, sem devolver — decisão 7) e grava o que o Google diz depois (cancelada_por).
 * Sem linha que renove = nada (o caminho de hoje, sem ida ao Google). Sem o segredo: cada uma conta como falha (log play_sem_credencial).
 * O Google sem resposta que decida → PlayIndisponivel (quem chama trata como o MpIndisponivel); o Google que recusa = falha com o log.
 */
export async function cancelarPlayDasMatriculas(c: ContextoPlay, pacienteIds: string[], por: "vinculo" | "exclusao"): Promise<{ canceladas: number; falhas: number }> {
  const ids = [...new Set(pacienteIds.filter(ehUuid))];
  if (!ids.length) return { canceladas: 0, falhas: 0 };
  const linhas: LinhaPlayBanco[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await c.db.from("play_assinaturas").select(COLUNAS).in("paciente_id", ids.slice(i, i + 150))
      .in("estado", ESTADOS_QUE_RENOVAM as string[]).order("token").limit(1000);
    if (error) {
      if (semTabela(error)) return { canceladas: 0, falhas: 0 };
      throw error;
    }
    linhas.push(...((data ?? []) as LinhaPlayBanco[]));
  }
  if (!linhas.length) return { canceladas: 0, falhas: 0 };
  if (!contaDaPlay()) {
    c.log.aviso({ codigo: "play_sem_credencial", schema: c.schema, acao: `cancelar_${por}`, n: linhas.length });
    return { canceladas: 0, falhas: linhas.length };
  }
  let canceladas = 0;
  let falhas = 0;
  for (const l of linhas) {
    const r = await cancelar(l.token, CANCELAMENTO_NO_VINCULO_E_NA_EXCLUSAO, opcoesDe(c));
    if (r.status >= 300 && googleTransitorio(r.status)) throw new PlayIndisponivel(r.status, r.erro);
    // cancelou — ou recusou porque já estava cancelada/vencida: o GET decide e a play_aplicar grava o que ele diz
    const a = await lerDoGoogle(c, l.token);
    const parou = !!a && (!a.renova || ["SUBSCRIPTION_STATE_CANCELED", "SUBSCRIPTION_STATE_EXPIRED"].includes(a.estadoGoogle));
    if (a && parou) {
      const e = entradaDoGoogle(l.paciente_id, l.token, a, { canceladaPor: por });
      if (e) {
        const g = await aplicar(c.db, e);
        if (!g.ok) c.log.aviso({ codigo: "play_cancelar_gravar", schema: c.schema, acao: `cancelar_${por}`, ref: l.paciente_id, resultado: g.erro ?? null });
      }
      canceladas++;
      c.log.info({ codigo: "play_cancelada", schema: c.schema, acao: `cancelar_${por}`, ref: l.paciente_id, status: r.status });
    } else if (!a) {
      // o Google não conhece mais o token (a compra não existe): nada a cobrar
      canceladas++;
    } else {
      c.log.erro({ codigo: "play_cancelar_falhou", schema: c.schema, acao: `cancelar_${por}`, ref: l.paciente_id, status: r.status, externo: { google_erro: r.erro } });
      falhas++;
    }
  }
  return { canceladas, falhas };
}

/** A situação da matrícula para a rede da conferência: ativa, encerrada pelo vínculo, apagada. */
export async function situacaoDaMatricula(db: SupabaseClient, pacienteId: string): Promise<{ ativa: boolean; encerrada: boolean; apagada: boolean } | null> {
  const { data, error } = await db.from("pacientes").select("ativo, deleted_at, app_encerrada_em").eq("id", pacienteId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const m = data as { ativo: boolean | null; deleted_at: string | null; app_encerrada_em: string | null };
  return { ativa: m.ativo === true && !m.deleted_at, encerrada: m.ativo === false && !!m.app_encerrada_em, apagada: !!m.deleted_at };
}

/** As matrículas do app do login (ativas e encerradas; não as apagadas) — a exclusão cancela a Play de todas. Erro do banco lança. */
export async function matriculasDoAppDoUsuario(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data: c, error: ec } = await db.from("contas").select("id").eq("origem", "app").order("criado_em").limit(1);
  if (ec) throw ec;
  const app = ((c ?? []) as Array<{ id: string }>)[0]?.id;
  if (!app) return [];
  const { data, error } = await db.from("pacientes").select("id").eq("user_id", userId).eq("conta_id", app).is("deleted_at", null).limit(100);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((m) => m.id);
}

/**
 * A exclusão (do aluno e do profissional que também é aluno do app): cancela a da Play ANTES de apagar. `ok` = nada ficou cobrando
 * (sem linha da Play, sem ida ao Google); o Google sem resposta ou que recusou = `ok: false` (quem chama responde 502 e não apaga nada).
 */
export async function cancelarPlayNaExclusao(c: ContextoPlay, userId: string): Promise<{ ok: boolean; canceladas: number; falhas: number }> {
  const ids = await matriculasDoAppDoUsuario(c.db, userId);
  if (!ids.length) return { ok: true, canceladas: 0, falhas: 0 };
  try {
    const r = await cancelarPlayDasMatriculas(c, ids, "exclusao");
    return { ok: r.falhas === 0, ...r };
  } catch (e) {
    if (!(e instanceof PlayIndisponivel)) throw e;
    c.log.erro({ codigo: "play_cancelar_falhou", schema: c.schema, acao: "cancelar_exclusao", status: e.status, externo: { google_erro: e.codigo } });
    return { ok: false, canceladas: 0, falhas: 1 };
  }
}
