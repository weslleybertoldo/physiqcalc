// Physiq hml-10 (H-26, D4 e D6) — as regras do aviso de erro no banco principal, sem Deno e sem rede (testadas no Vitest:
// src/lib/erroAvisarServidor.test.ts, com peças falsas):
//   criarAvisador  o caminho do aviso: trava na memória (10 min por assinatura e schema) → {schema}.registrar_aviso_erro
//                  (1 igual a cada 10 min, até 30 por hora por schema; -1 = segura, N = manda com "+N iguais segurados";
//                  banco fora = manda, a memória já segurou o repetido) → Telegram sendMessage (texto puro; 1 tentativa extra
//                  só em falha de rede; tópico apagado = manda sem o tópico) → log aviso_enviado (com o message_id), segurado
//                  ou telegram_recusou (status + description; nunca a URL, que leva o token).
//   atenderPedido  a função erro-avisar: OPTIONS com o CORS de sempre (login-regras.origemPermitida); só POST; navegador =
//                  Origin da lista, servidor (Treino) = x-espelho-segredo aceito por deps.segredo (hml-16c, S7: o hash na
//                  lista SEGREDO_AVISO_ERRO_ACEITOS ou, até o F7, o legado; aceitou → log segredo_aceito com acao aviso_erro e
//                  resultado lista | legado); x-schema public|staging; corpo ≤ 2 KB; 204 quando aceita. {"teste":"excecao"} só
//                  com o segredo E no staging: lança dentro do try e o catch final chama log.excecao (a prova do D6: catch → aviso).
// Quem liga as peças de verdade: _shared/avisar-erro.ts (banco, Telegram e variáveis) e erro-avisar/index.ts.
import {
  assinatura,
  codigoValido,
  criarTrava,
  funcaoValida,
  limparLugar,
  limparMensagem,
  limparRota,
  montarAviso,
  ondeDoErro,
  plataformaValida,
  statusValido,
  versaoValida,
  type ErroParaAviso,
  type OrigemErro,
  type SchemaAviso,
} from "./erros.ts";
import type { CamposLog, Log } from "./log.ts";
import { origemPermitida } from "./login-regras.ts";
// hml-14: o "tempo esgotou" do AbortSignal.timeout vem do ajudante comum (não conta como falha de rede).
import { tempoEsgotado } from "./tempo.ts";

// ───────────────────────── o caminho do aviso ─────────────────────────

export interface ConfigAviso {
  /** TELEGRAM_BOT_TOKEN — o bot da ponte (o mesmo do painel e do Nativo OS). */
  token: string;
  /** ERROS_TELEGRAM_CHAT — o grupo Validação. */
  chat: string;
  /** ERROS_TELEGRAM_TOPICO — o tópico Physiq (opcional; inválido ou apagado = manda sem o tópico e loga). */
  topico: string;
  /** ERROS_AVISO_DESLIGADO=1 — loga e não manda (a chave de desligar sem deploy). */
  desligado: boolean;
}

/** O que vai para {schema}.registrar_aviso_erro (tudo já limpo). */
export interface RegistroAviso {
  assinatura: string;
  origem: OrigemErro;
  lugar: string;
  exemplo: string;
}

export interface CorpoTelegram {
  chat_id: string;
  text: string;
  link_preview_options: { is_disabled: boolean };
  message_thread_id?: number;
}

export interface RespostaTelegram {
  ok: boolean;
  status: number;
  messageId: number | null;
  /** O "description" do Telegram ("Bad Request: chat not found"…): não traz o token. */
  descricao: string;
}

export interface DepsAvisador {
  config(): ConfigAviso;
  /** {schema}.registrar_aviso_erro com a service_role: -1 = segura; N ≥ 0 = manda (N iguais segurados). Lança se o banco não respondeu. */
  registrar(schema: SchemaAviso, registro: RegistroAviso): Promise<number>;
  /** sendMessage (8 s). Lança só em falha de rede ou tempo esgotado; a resposta do Telegram (mesmo 4xx) volta normal. */
  mandar(token: string, corpo: CorpoTelegram): Promise<RespostaTelegram>;
  /** O log do próprio aviso, SEM aviso (criarLog("avisar-erro", { avisar: null })): o aviso nunca avisa a si mesmo. */
  log: Log;
  /** Pausa antes da 2ª tentativa (1 s). */
  esperar?(ms: number): Promise<void>;
  agora?(): number;
}

export type ResultadoAviso = "enviado" | "segurado" | "desligado" | "sem_configuracao" | "recusado" | "falhou";

export interface Avisador {
  /** Nunca lança: um erro ao avisar não pode virar outro erro. */
  enviarAviso(erro: ErroParaAviso, schema: SchemaAviso): Promise<ResultadoAviso>;
}

/** Texto de um erro para o log sem o token e sem URL nenhuma (a do Telegram leva o token), limpo e com até 200 caracteres. */
function semSegredo(e: unknown, token: string): string {
  const objeto = e && typeof e === "object" ? (e as { message?: unknown }) : null;
  let t =
    e instanceof Error
      ? `${e.name}: ${e.message}`
      : typeof objeto?.message === "string" // o erro do PostgREST é um objeto: só a message (nunca details nem hint)
        ? objeto.message
        : typeof e === "string"
          ? e
          : typeof e;
  if (token) t = t.split(token).join("[token]");
  return limparMensagem(t.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]"), 200);
}

function pgDe(e: unknown): string | null {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : null;
  return typeof code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(code) ? code : null;
}

function topicoValido(v: string): number | null {
  return /^\d{1,12}$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null;
}

export function criarAvisador(deps: DepsAvisador): Avisador {
  const trava = criarTrava();
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const agora = deps.agora ?? (() => Date.now());
  const log = deps.log;

  /** 1 tentativa extra só em falha de rede (não em tempo esgotado: o Telegram pode ter recebido, e viria repetido). */
  async function mandarComRede(token: string, corpo: CorpoTelegram, base: CamposLog): Promise<RespostaTelegram> {
    try {
      return await deps.mandar(token, corpo);
    } catch (e) {
      if (tempoEsgotado(e)) throw e;
      log.aviso({ ...base, codigo: "telegram_rede", msg: semSegredo(e, token) });
      await esperar(1000);
      return await deps.mandar(token, corpo);
    }
  }

  async function enviarAviso(erro: ErroParaAviso, schema: SchemaAviso): Promise<ResultadoAviso> {
    const s: SchemaAviso = schema === "staging" ? "staging" : "public";
    const base: CamposLog = { codigo: "?", schema: s, ref: "?" };
    let token = "";
    try {
      base.ref = assinatura(erro);
      const cfg = deps.config();
      token = cfg.token;
      if (cfg.desligado) {
        log.info({ ...base, codigo: "aviso_desligado" });
        return "desligado";
      }
      if (!cfg.token || !cfg.chat) {
        log.aviso({ ...base, codigo: "aviso_sem_configuracao" });
        return "sem_configuracao";
      }
      if (trava.segura(`${s}:${base.ref}`, agora())) {
        log.info({ ...base, codigo: "segurado", resultado: "memoria" });
        return "segurado";
      }
      let segurados = 0;
      try {
        const n = await deps.registrar(s, {
          assinatura: String(base.ref),
          origem: erro.origem,
          lugar: ondeDoErro(erro),
          exemplo: limparMensagem(erro.mensagem),
        });
        segurados = Number.isInteger(n) ? n : 0;
      } catch (e) {
        // banco fora: manda mesmo assim (a trava na memória já segurou o repetido desta instância)
        log.aviso({ ...base, codigo: "trava_do_banco_fora", pg: pgDe(e), msg: semSegredo(e, token) });
      }
      if (segurados < 0) {
        log.info({ ...base, codigo: "segurado", resultado: "banco" });
        return "segurado";
      }
      const topico = topicoValido(cfg.topico);
      if (!topico) log.aviso({ ...base, codigo: cfg.topico.trim() ? "topico_invalido" : "sem_topico" });
      const corpo: CorpoTelegram = {
        chat_id: cfg.chat,
        text: montarAviso(erro, { schema: s, segurados }),
        link_preview_options: { is_disabled: true },
      };
      if (topico) corpo.message_thread_id = topico;
      let r = await mandarComRede(cfg.token, corpo, base);
      if (!r.ok && topico && r.status === 400 && /thread|topic/i.test(r.descricao)) {
        // tópico apagado (ou fechado): manda sem o tópico — cai no Geral do grupo — e loga
        log.aviso({ ...base, codigo: "topico_invalido", status: r.status, msg: semSegredo(r.descricao, token) });
        const semTopico: CorpoTelegram = { chat_id: corpo.chat_id, text: corpo.text, link_preview_options: corpo.link_preview_options };
        r = await mandarComRede(cfg.token, semTopico, base);
      }
      if (r.ok) {
        log.info({ ...base, codigo: "aviso_enviado", n: segurados, externo: { telegram_id: r.messageId } });
        return "enviado";
      }
      log.erro({ ...base, codigo: "telegram_recusou", status: r.status, msg: semSegredo(r.descricao, token) });
      return "recusado";
    } catch (e) {
      log.erro({ ...base, codigo: "aviso_falhou", msg: semSegredo(e, token) });
      return "falhou";
    }
  }

  return { enviarAviso };
}

// ───────────────────────── a função erro-avisar ─────────────────────────

/** Tamanho máximo do corpo (bytes). */
export const LIMITE_CORPO = 2048;
const ORIGENS_DO_APP: readonly OrigemErro[] = ["tela", "promessa", "funcao", "sync"];

/** O CORS de sempre das funções do principal (cobranca-conta, entrar-senha…): Origin da lista ou o site. */
export function corsDoAviso(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/**
 * O corpo do pedido → o erro limpo (ou null = 400). Navegador (o app): origem tela | promessa | funcao | sync, com mensagem,
 * rota, lugar, versao e plataforma (+ funcao — obrigatória —, banco e status quando a origem é "funcao"). Servidor (o Treino,
 * com o segredo): origem "servidor", com funcao, codigo, acao, status e mensagem — o banco é sempre o Treino.
 */
export function lerAviso(corpo: unknown, via: "navegador" | "servidor"): ErroParaAviso | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  const c = corpo as Record<string, unknown>;
  const mensagem = limparMensagem(typeof c.mensagem === "string" ? c.mensagem : "") || null;
  if (via === "servidor") {
    // nome ou código fora do formato não derruba o aviso (sai "função ?"): melhor chegar torto do que não chegar
    if (c.origem !== "servidor") return null;
    return {
      origem: "servidor",
      banco: "treino",
      funcao: funcaoValida(c.funcao) || null,
      codigo: codigoValido(c.codigo) || null,
      acao: codigoValido(c.acao) || null,
      status: statusValido(c.status),
      mensagem,
    };
  }
  if (!ORIGENS_DO_APP.includes(c.origem as OrigemErro)) return null;
  const erro: ErroParaAviso = {
    origem: c.origem as OrigemErro,
    mensagem,
    rota: limparRota(typeof c.rota === "string" ? c.rota : "") || null,
    lugar: limparLugar(typeof c.lugar === "string" ? c.lugar : "") || null,
    versao: versaoValida(c.versao) || null,
    plataforma: plataformaValida(c.plataforma) || null,
  };
  if (erro.origem === "funcao") {
    const funcao = funcaoValida(c.funcao);
    if (!funcao || funcao === "erro-avisar") return null; // o app nunca avisa a falha da própria erro-avisar
    erro.funcao = funcao;
    erro.banco = c.banco === "treino" ? "treino" : "principal";
    erro.status = statusValido(c.status);
  }
  return erro;
}

/** Lê o corpo até `limite` bytes; passou (pelo Content-Length ou pelo que chegou) → null. */
async function lerCorpo(req: Request, limite: number): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > limite) return null;
  if (!req.body) return "";
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    tudo.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder().decode(tudo);
}

function schemaDaUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("schema");
  } catch {
    return null;
  }
}

export interface DepsPedido {
  /**
   * O aceite do x-espelho-segredo que o Treino manda (hml-16c, S7): na função, segredoAceito(recebido, "SEGREDO_AVISO_ERRO") do
   * _shared/segredo-servidor.ts. "lista" | "legado" = aceito (vai para o log); null = recusa (403 segredo_invalido).
   */
  segredo(recebido: string): Promise<"lista" | "legado" | null>;
  /** O caminho do aviso (criarAvisador(…).enviarAviso). Roda em segundo plano: o 204 não espera o Telegram. */
  enviar(erro: ErroParaAviso, schema: SchemaAviso): Promise<unknown>;
  /** O log da função, COM o aviso: o catch final chama log.excecao. */
  log: Log;
  /** EdgeRuntime.waitUntil (log.ts: emSegundoPlano). */
  emSegundoPlano(p: Promise<unknown>): void;
}

/**
 * Atende a erro-avisar. 204 aceito · 400 schema_invalido | json_invalido | aviso_invalido · 403 segredo_invalido |
 * origem_recusada | so_staging · 405 metodo · 413 corpo_grande · 500 erro_interno. O schema vem do x-schema (ou de ?schema=,
 * para o caso de o app mandar o aviso sem cabeçalho próprio); sem nenhum dos 2, "public" (como as outras funções).
 */
export async function atenderPedido(req: Request, deps: DepsPedido): Promise<Response> {
  const origin = req.headers.get("Origin");
  const cabecalhos = corsDoAviso(origin);
  const responder = (status: number, erro?: string) =>
    erro
      ? new Response(JSON.stringify({ ok: false, erro }), { status, headers: { "Content-Type": "application/json", ...cabecalhos } })
      : new Response(null, { status, headers: cabecalhos });
  const recusar = (status: number, erro: string, schema?: string) => {
    deps.log.info({ codigo: "pedido_recusado", schema, status, resultado: erro });
    return responder(status, erro);
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return responder(405, "metodo");

  // quem chama: o Treino (servidor) prova com o segredo; o app (navegador) com a Origin da lista
  const segredo = req.headers.get("x-espelho-segredo");
  let via: "navegador" | "servidor";
  if (segredo !== null) {
    const aceito = await deps.segredo(segredo);
    if (!aceito) return recusar(403, "segredo_invalido");
    deps.log.info({ codigo: "segredo_aceito", acao: "aviso_erro", resultado: aceito });
    via = "servidor";
  } else if (origemPermitida(origin)) {
    via = "navegador";
  } else {
    return recusar(403, "origem_recusada");
  }

  const pedido = (req.headers.get("x-schema") || schemaDaUrl(req.url) || "public").toLowerCase();
  if (pedido !== "public" && pedido !== "staging") return recusar(400, "schema_invalido");
  const schema: SchemaAviso = pedido;

  let acao = "avisar";
  try {
    const texto = await lerCorpo(req, LIMITE_CORPO);
    if (texto === null) return recusar(413, "corpo_grande", schema);
    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      return recusar(400, "json_invalido", schema);
    }
    if (corpo && typeof corpo === "object" && !Array.isArray(corpo) && "teste" in corpo) {
      acao = "teste_hml10";
      const teste = (corpo as { teste?: unknown }).teste;
      if (via !== "servidor" || schema !== "staging" || teste !== "excecao") return recusar(403, "so_staging", schema);
      throw new Error("teste_hml10: erro de propósito na erro-avisar (prova do catch → aviso)");
    }
    const erro = lerAviso(corpo, via);
    if (!erro) return recusar(400, "aviso_invalido", schema);
    deps.emSegundoPlano(deps.enviar(erro, schema));
    return responder(204);
  } catch (e) {
    deps.log.excecao(e, { acao, schema });
    return responder(500, "erro_interno");
  }
}
