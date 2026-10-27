// supabase-principal/functions/play-conferir/rodada.ts
// Physiq play-W6 (22/10/2026) — a RODADA da play-conferir (a index.ts confere o segredo S11 e o corpo e chama aqui): a conferência de hora
// em hora das assinaturas da Google Play de UM schema, no lugar do aviso do Google pelo Pub/Sub (o RTDN e a play-rtdn saíram em 22/10/2026:
// o physiq-br ficou sem faturamento no Google Cloud e sem faturamento não há Pub/Sub). Quem chama: {schema}.play_conferir_disparar() pelo
// pg_net, de hora em hora (pg_cron play-conferir-<schema>, minuto 25), só com assinatura da Play no schema. Sem o segredo
// PLAY_SERVICE_ACCOUNT: pula (log play_sem_credencial) — nada quebra, nada vai ao banco nem ao Google.
//   1. as devolvidas (a Voided Purchases API, type=1) da janela: do marcador app_config play_conferir.voided_ate menos 10 min de folga (sem
//      ele, as últimas 24 h) até agora, página por página → cada uma DESTE schema (o token na play_assinaturas; a do outro schema, a rodada
//      dele aplica): o GET + a MESMA sincronia do registrar (_shared/play-assinaturas.ts › sincronizar) com o pedido devolvido — a cobrança
//      dele vira cancelada + reembolsado_em; o acesso cortado (EXPIRED) = revogada; o token que o Google já esqueceu (GET 404/410, mais de
//      60 dias) = só a cobrança, pelo pedido. O marcador anda SÓ com a janela inteira lida e aplicada (o Google fora = a próxima hora lê a
//      mesma janela de novo: tudo idempotente).
//   2. TODAS as vivas (pendente, ativa, cancelada, carência, suspensa, pausada) — não só as perto de vencer —, as que estão há mais tempo
//      sem conferir primeiro, até POR_RODADA por hora: o GET + a mesma sincronia (a play_aplicar, reconhecer se faltar, o defer da 1ª compra
//      coberta — o que o aviso do Google fazia) + a rede do vínculo: renovou numa matrícula encerrada (o vínculo) ou apagada → cancela
//      (DEVELOPER_REQUESTED_STOP_PAYMENTS: vale até o fim, sem devolver — decisão 7). O que sobra (o limite ou o orçamento) fica para a
//      próxima hora, na frente (log play_conferir_sobrou).
// Uma assinatura NUNCA para as outras: o Google fora nela = falha (aviso; ela volta na próxima hora), o erro do banco = log.excecao.
// Limite conhecido: a viva que o Google diz não existir (o GET 404 — a compra de teste apagada, o token de outro app) é recusa e não muda;
// ela ocupa 1 vaga por hora (a mais antiga vai na frente) — o log play_conferir_recusada mostra.
// Só `import type` de URL e sem o global do Deno: o Vitest importa (src/lib/playConferir.test.ts). Log: só códigos, o schema, a matrícula
// (ref) e contagens — nunca o token, o pedido nem o corpo do Google; a resposta, só números.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { PlayIndisponivel, contaDaPlay, listarDevolvidas, type OpcoesPlay } from "../_shared/play-api.ts";
import {
  assinaturaDoToken, cancelarPlayDasMatriculas, devolverPedidoSemCompra, lerDoGoogle, mudou, situacaoDaMatricula, sincronizar,
  vivasParaConferir, type ContextoPlay,
} from "../_shared/play-assinaturas.ts";
import { CHAVE_CONFERIR, janelaDasDevolvidas, lerDevolvidas, type DevolvidaGoogle, type Schema } from "../_shared/play-regras.ts";
import type { Prazo } from "../_shared/tempo.ts";

/** Por hora: até 100 assinaturas ao Google (o resto vai na frente da próxima). */
export const POR_RODADA = 100;
/** As páginas da Voided Purchases API por rodada (mais que isto: a janela inteira fica para a próxima hora). */
export const MAX_PAGINAS_DEVOLVIDAS = 10;
/** Com menos que isto sobrando do orçamento não começa outra assinatura nem outra página (a sobra fica intacta para a próxima hora). */
export const MINIMO_PARA_SEGUIR_MS = 10_000;
const SCHEMAS: Schema[] = ["public", "staging"];
const EXPIRADA_NO_GOOGLE = "SUBSCRIPTION_STATE_EXPIRED";

/** O contexto da rodada: o banco do schema (service role), o log e o orçamento da rodada inteira. */
export interface ContextoConferir extends ContextoPlay {
  prazo: Prazo;
}

/** A resposta da função: só contagens. */
export interface Contagem {
  /** vivas que voltaram ao Google e foram gravadas */
  conferidas: number;
  /** destas, as que mudaram (o estado ou o fim) */
  mudaram: number;
  /** a sincronia recusou (a compra que o Google não acha, a matrícula que não é do app…): nada muda */
  recusadas: number;
  /** o Google fora (ela volta na próxima hora) */
  falhas: number;
  /** o que lançou (o banco): log.excecao */
  erros: number;
  /** vivas que ficaram para a próxima hora (o limite ou o orçamento) */
  sobraram: number;
  /** a rede do vínculo: canceladas no Google */
  canceladas_rede: number;
  /** as devolvidas lidas da Voided Purchases API */
  devolvidas_lidas: number;
  /** destas, as deste schema aplicadas */
  devolvidas_aplicadas: number;
  /** as cobranças que viraram devolvidas (a 2ª leitura da mesma = 0) */
  devolvidas_marcadas: number;
  /** as de outro schema (ou de compra que não é nossa): nada gravado */
  devolvidas_outras: number;
  /** a janela inteira lida e aplicada (o marcador andou) */
  devolvidas_completa: boolean;
}
export const contagemVazia = (): Contagem => ({
  conferidas: 0, mudaram: 0, recusadas: 0, falhas: 0, erros: 0, sobraram: 0, canceladas_rede: 0, devolvidas_lidas: 0, devolvidas_aplicadas: 0,
  devolvidas_marcadas: 0, devolvidas_outras: 0, devolvidas_completa: false,
});

export type PedidoConferir = { ok: true; schema: Schema; limite: number } | { ok: false; erro: "schema_invalido" | "limite_invalido" };

/** O corpo do pg_net: { schema, limite? } — o limite (1..POR_RODADA) só o E2E manda, para provar a sobra. */
export function lerPedido(corpo: unknown): PedidoConferir {
  const c = corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  const schema = (typeof c.schema === "string" ? c.schema.toLowerCase() : "") as Schema;
  if (!SCHEMAS.includes(schema)) return { ok: false, erro: "schema_invalido" };
  if (c.limite === undefined || c.limite === null) return { ok: true, schema, limite: POR_RODADA };
  if (typeof c.limite !== "number" || !Number.isInteger(c.limite) || c.limite < 1 || c.limite > POR_RODADA) return { ok: false, erro: "limite_invalido" };
  return { ok: true, schema, limite: c.limite };
}

const opcoesDe = (c: ContextoConferir): OpcoesPlay => ({ prazo: c.prazo, buscar: c.buscar });
const semTempo = (c: ContextoConferir) => c.prazo.restante() < MINIMO_PARA_SEGUIR_MS;

/** O marcador da Voided Purchases API (app_config play_conferir: { voided_ate }); sem a linha ou sem o campo, null. Erro do banco lança. */
async function lerMarca(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db.from("app_config").select("valor").eq("chave", CHAVE_CONFERIR).maybeSingle();
  if (error) throw error;
  const v = (data as { valor?: { voided_ate?: unknown } | null } | null)?.valor?.voided_ate;
  return typeof v === "string" ? v : null;
}

/** O marcador anda: o fim da janela lida inteira (a linha que a migration criou ou uma nova, sempre publica = false). Erro do banco lança. */
async function gravarMarca(db: SupabaseClient, fimMs: number): Promise<void> {
  const { error } = await db.from("app_config")
    .upsert({ chave: CHAVE_CONFERIR, valor: { voided_ate: new Date(fimMs).toISOString() }, publica: false }, { onConflict: "chave" });
  if (error) throw error;
}

/**
 * Uma devolvida: a deste schema volta ao Google e entra pela sincronia com o pedido devolvido (sem reconhecer nem adiar: a devolvida não se
 * reconhece; a viva que seguir ativa, a parte 2 confere). Erro do banco e o Google sem resposta LANÇAM (quem chama conta).
 */
async function aplicarDevolvida(c: ContextoConferir, d: DevolvidaGoogle, n: Contagem): Promise<void> {
  const linha = await assinaturaDoToken(c.db, d.token);
  if (!linha) {
    // a do outro schema (a rodada dele aplica) ou uma compra que não é assinatura nossa: nada a gravar aqui
    n.devolvidas_outras++;
    return;
  }
  const a = await lerDoGoogle(c, d.token);
  if (!a) {
    // o Google já esqueceu o token (404/410 — mais de 60 dias): o pedido basta para marcar a cobrança dele (a revisão, ⚪13)
    const marcadas = d.pedido ? await devolverPedidoSemCompra(c.db, linha.paciente_id, d.pedido) : 0;
    n.devolvidas_aplicadas++;
    n.devolvidas_marcadas += marcadas;
    c.log.info({ codigo: "play_devolucao_sem_compra", schema: c.schema, ref: linha.paciente_id, n: marcadas });
    return;
  }
  // o EXPIRED da devolvida = revogada (a regra do aviso de devolução de antes: o GET não separa a expirada da revogada). A que teve um
  // pedido devolvido SEM corte e expirou enquanto a devolvida ainda estava na folga da janela sai revogada — as 2 sem acesso, fora das
  // vivas e de toda leitura do aluno
  const r = await sincronizar(c, d.token, {
    pacienteId: linha.paciente_id, assinatura: a, revogada: a.estadoGoogle === EXPIRADA_NO_GOOGLE, devolvidoPedido: d.pedido,
    reconhecer: false, adiar: false,
  });
  if (!r.ok) {
    // recusa que ler de novo não muda (a matrícula que não é do app, o token de outra matrícula): registra e segue
    c.log.aviso({ codigo: "play_devolucao_recusada", schema: c.schema, ref: linha.paciente_id, resultado: (r as { erro: string }).erro });
    return;
  }
  n.devolvidas_aplicadas++;
  n.devolvidas_marcadas += r.resposta.devolvidas ?? 0;
  c.log.info({ codigo: "play_devolucao", schema: c.schema, ref: linha.paciente_id, resultado: r.resposta.estado ?? null, n: r.resposta.devolvidas ?? 0 });
}

/** A parte 1: as devolvidas da janela, página por página; o marcador anda só com a janela inteira lida e aplicada. */
async function conferirDevolvidas(c: ContextoConferir, n: Contagem, agoraMs: number): Promise<void> {
  const { inicioMs, fimMs } = janelaDasDevolvidas(await lerMarca(c.db), agoraMs);
  let pagina: string | null = null;
  let fimDaLista = false;
  let falhou = false;
  for (let i = 0; i < MAX_PAGINAS_DEVOLVIDAS && !fimDaLista && !falhou; i++) {
    if (semTempo(c)) break;
    let r: Awaited<ReturnType<typeof listarDevolvidas>>;
    try {
      r = await listarDevolvidas({ inicioMs, fimMs, pagina }, opcoesDe(c));
    } catch (e) {
      if (!(e instanceof PlayIndisponivel)) throw e;
      c.log.aviso({ codigo: "play_devolvidas_falhou", schema: c.schema, status: e.status, externo: { google_erro: e.codigo } });
      falhou = true;
      break;
    }
    if (r.status !== 200) {
      c.log.aviso({ codigo: "play_devolvidas_falhou", schema: c.schema, status: r.status, externo: { google_erro: r.erro } });
      falhou = true;
      break;
    }
    const { itens, proxima } = lerDevolvidas(r.corpo);
    n.devolvidas_lidas += itens.length;
    for (const d of itens) {
      try {
        await aplicarDevolvida(c, d, n);
      } catch (e) {
        falhou = true;
        if (e instanceof PlayIndisponivel) {
          c.log.aviso({ codigo: "play_devolucao_falhou", schema: c.schema, status: e.status, externo: { google_erro: e.codigo } });
        } else {
          n.erros++;
          c.log.excecao(e, { codigo: "play_conferir_erro", schema: c.schema, acao: "devolucao" });
        }
      }
    }
    if (proxima) pagina = proxima;
    else fimDaLista = true;
  }
  n.devolvidas_completa = fimDaLista && !falhou;
  if (n.devolvidas_completa) await gravarMarca(c.db, fimMs);
  else c.log.aviso({ codigo: "play_devolvidas_sobrou", schema: c.schema, n: n.devolvidas_lidas, resultado: falhou ? "falhou" : "sem_tempo" });
}

/** A parte 2: TODAS as vivas (as há mais tempo sem conferir primeiro), até o limite e o orçamento; o resto fica para a próxima hora. */
async function conferirVivas(c: ContextoConferir, n: Contagem, limite: number): Promise<void> {
  const { linhas, total } = await vivasParaConferir(c.db, limite);
  let feitas = 0;
  for (const l of linhas) {
    if (semTempo(c)) break;
    feitas++;
    try {
      const r = await sincronizar(c, l.token, { pacienteId: l.paciente_id, reconhecer: true });
      if (!r.ok) {
        n.recusadas++;
        c.log.aviso({ codigo: "play_conferir_recusada", schema: c.schema, ref: l.paciente_id, resultado: (r as { erro: string }).erro });
        continue;
      }
      n.conferidas++;
      if (mudou(l, r.resposta)) n.mudaram++;
      // a rede (o aviso do Google fazia): a matrícula saiu do app (o vínculo) ou foi apagada e a assinatura ainda renova → cancela
      if (r.assinatura.renova) {
        const s = await situacaoDaMatricula(c.db, l.paciente_id);
        if (s && !s.ativa && (s.encerrada || s.apagada)) {
          const cc = await cancelarPlayDasMatriculas(c, [l.paciente_id], s.apagada ? "exclusao" : "vinculo");
          n.canceladas_rede += cc.canceladas;
          c.log.info({ codigo: "play_conferir_rede", schema: c.schema, ref: l.paciente_id, n: cc.canceladas });
        }
      }
    } catch (e) {
      if (e instanceof PlayIndisponivel) {
        n.falhas++;
        c.log.aviso({ codigo: "play_conferir_falhou", schema: c.schema, ref: l.paciente_id, status: e.status, externo: { google_erro: e.codigo } });
      } else {
        n.erros++;
        c.log.excecao(e, { codigo: "play_conferir_erro", schema: c.schema, ref: l.paciente_id });
      }
    }
  }
  n.sobraram = Math.max(0, total - feitas);
  if (n.sobraram) c.log.aviso({ codigo: "play_conferir_sobrou", schema: c.schema, n: n.sobraram });
}

/**
 * A rodada de um schema: sem a credencial, pula (log); senão as devolvidas e depois as vivas. Devolve só contagens. O erro do banco FORA
 * do laço de cada assinatura (ler o marcador e as vivas, gravar o marcador) lança: a index.ts responde 500 e avisa.
 */
export async function conferir(c: ContextoConferir, opcoes: { limite?: number; agoraMs?: number } = {}): Promise<Contagem | { pulou: "play_sem_credencial" }> {
  if (!contaDaPlay()) {
    c.log.aviso({ codigo: "play_sem_credencial", schema: c.schema, acao: "conferir" });
    return { pulou: "play_sem_credencial" };
  }
  const n = contagemVazia();
  await conferirDevolvidas(c, n, opcoes.agoraMs ?? Date.now());
  await conferirVivas(c, n, opcoes.limite ?? POR_RODADA);
  c.log.info({ codigo: "play_conferir", schema: c.schema, n: n.conferidas, resultado: n.devolvidas_completa ? "completa" : "devolvidas_pendentes" });
  return n;
}
