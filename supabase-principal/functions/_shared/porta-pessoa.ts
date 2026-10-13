// Physiq hml-19a (H-41 · jeito 2, 11/10/2026) — a porta das funções do jeito 2 que gravam COMO A PESSOA (a nutricao; a financeiro da
// hml-19d também): a master-porta.ts SEM a conferência do master e SEM cliente de service role. A master-porta não muda.
//   OPTIONS → só POST → x-schema na lista fechada (400 schema_invalido) → Bearer (401 sem_login) → corpo até LIMITE_CORPO (413) →
//   cliente "como a pessoa" (a chave anon + o token dela, no schema do pedido: o RLS vale como 2ª camada) → GET /auth/v1/user
//   (401 sem_login) → freio por pessoa (429 muitas_acoes) → handler({ schema, origin, corpo, userId, comoPessoa, log, prazo }).
// O prazo do pedido (ORCAMENTO_MS.usuario, 20 s) vale em TODA ida do cliente (Auth, banco, Storage): cada uma leva só o tempo que
// sobra, e a função responde antes de a tela desistir (25 s, src/integrations/repeticao.ts). O catch final avisa (log.excecao) e
// responde só o código (erro_interno). Nenhuma chave secreta aqui: o dono do que a função grava vem do user do token.
// A chave anon legada (SUPABASE_ANON_KEY) é lida só aqui (spec hml-19 §8, risco 6: quando as legadas saírem, troca num lugar só).
// O app (APK: https://localhost e capacitor://localhost) entra como o site — o CORS já aceita as 2 origens.
// hml-21a (H-109): a opção jwtLeitura: "jwks" — SÓ no `acao: "ler"` o token é conferido aqui (_shared/jwks-principal.ts: a assinatura
// pelo JWKS do principal, o emissor, a audiência e o prazo), sem a ida ao Auth; inválido/vencido → 401 sem_login, como o getUser; a rede
// ou a chave falharam → o getUser de sempre (a reserva, com o aviso jwks_reserva no log). As gravações seguem no getUser (a revogação
// vale na hora). SEM a opção (a nutricao, a financeiro e as da W-A), o caminho é o de antes: o getUser em todo pedido.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "./avisar-erro.ts";
import { conferirJwtLocal } from "./jwks-principal.ts";
import { criarLog, type Log } from "./log.ts";
import { origemPermitida } from "./login-regras.ts";
import { schemaDoPedido, type Schema } from "./master-regras.ts";
import { LIMITE_CORPO } from "./nutricao-regras.ts";
import { ORCAMENTO_MS, buscarComTempo, prazo, type Prazo } from "./tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

export function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}

export interface ContextoPessoa {
  schema: Schema;
  origin: string | null;
  corpo: Record<string, unknown>;
  /** o id de quem chama (o user do token, conferido no Auth — hml-21a: no `ler` com jwtLeitura, pela assinatura do token) — o dono
   *  de tudo o que a função grava */
  userId: string;
  /** o cliente com o token da pessoa, no schema do pedido: tabelas, RPCs e Storage pelo RLS dela */
  comoPessoa: SupabaseClient;
  /** o log da função (criarLog com o nome dela — o mesmo do catch final) */
  log: Log;
  /** o orçamento do pedido (cada ida do comoPessoa já leva só o que sobra) */
  prazo: Prazo;
}

export interface OpcoesPorta {
  /** pedidos por minuto por pessoa (nesta instância), em cada schema */
  freio: number;
  /**
   * hml-21a (H-109): "jwks" = no `acao: "ler"` o token é conferido aqui (jwks-principal.ts), sem o getUser; as outras ações seguem no
   * getUser. Sem a opção, o getUser em todo pedido (o de sempre).
   */
  jwtLeitura?: "jwks";
}

// freio por pessoa nesta instância (segura laço de tela e abuso; o RLS segue valendo em cada gravação)
const janelas = new Map<string, number[]>();
function permitido(chave: string, max: number, janelaMs: number): boolean {
  const agora = Date.now();
  const validos = (janelas.get(chave) ?? []).filter((t) => t > agora - janelaMs);
  if (validos.length >= max) {
    janelas.set(chave, validos);
    return false;
  }
  validos.push(agora);
  janelas.set(chave, validos);
  if (janelas.size > 5000) janelas.clear();
  return true;
}

/** O corpo JSON (objeto; outra coisa vira {}), lido até o limite — acima dele, null (413 corpo_grande). */
async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  const declarado = Number(req.headers.get("content-length") || 0);
  if (declarado > LIMITE_CORPO) return null;
  const bruto = await req.text();
  if (bruto.length > LIMITE_CORPO) return null;
  try {
    const v = JSON.parse(bruto || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Quem chama: o id do user do token, ou null (401 sem_login). O de sempre: o getUser no Auth (a sessão conferida na hora). hml-21a: com
 * jwtLeitura "jwks", SÓ no `ler`, a conferência local — inválido/vencido → null; a rede ou a chave → o getUser (a reserva, com o aviso).
 */
async function quemChama(token: string, corpo: Record<string, unknown>, opcoes: OpcoesPorta, comoPessoa: SupabaseClient, log: Log, schema: Schema): Promise<string | null> {
  if (opcoes.jwtLeitura === "jwks" && corpo.acao === "ler") {
    const local = await conferirJwtLocal(token);
    if (local.ok === true) return local.userId;
    if (local.motivo === "invalido") return null;
    log.aviso({ codigo: "jwks_reserva", schema, resultado: local.causa });
  }
  const { data: ud, error: eu } = await comoPessoa.auth.getUser(token);
  return eu || !ud?.user ? null : ud.user.id;
}

/** Abre o pedido: OPTIONS, método, schema, login (no Auth; hml-21a: ou local, no `ler` com jwtLeitura) e freio. Devolve o contexto
 * ou a resposta de recusa. */
async function abrirPedido(req: Request, nome: string, opcoes: OpcoesPorta, log: Log): Promise<ContextoPessoa | Response> {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = schemaDoPedido(req.headers.get("x-schema"));
  if (!schema) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "sem_login" }, 401, origin);
  const token = auth.slice(7).trim();
  const corpo = await lerCorpo(req);
  if (corpo === null) return json({ ok: false, erro: "corpo_grande" }, 413, origin);
  const p = prazo(ORCAMENTO_MS.usuario);
  const comoPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema: schema as "public" },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (entrada: string | URL | Request, init?: RequestInit) => buscarComTempo(entrada, init ?? {}, Math.max(1, p.restante())),
    },
  });
  const userId = await quemChama(token, corpo, opcoes, comoPessoa, log, schema);
  if (!userId) return json({ ok: false, erro: "sem_login" }, 401, origin);
  if (!permitido(`${nome}:${schema}:${userId}`, opcoes.freio, 60_000)) {
    log.aviso({ codigo: "muitas_acoes", schema, ref: userId });
    return json({ ok: false, erro: "muitas_acoes" }, 429, origin);
  }
  return { schema, origin, corpo, userId, comoPessoa, log, prazo: p };
}

/** Serve a função: abre o pedido e chama o handler; erro inesperado vira 500 erro_interno (sem vazar detalhe) + aviso ao Weslley. */
export function servirComoPessoa(nome: string, opcoes: OpcoesPorta, handler: (c: ContextoPessoa) => Promise<Response>) {
  const log = criarLog(nome, { avisar: avisarErro });
  Deno.serve(async (req) => {
    const origin = req.headers.get("Origin");
    let pedido: ContextoPessoa | null = null;
    try {
      const c = await abrirPedido(req, nome, opcoes, log);
      if (c instanceof Response) return c;
      pedido = c;
      return await handler(c);
    } catch (e) {
      // hml-10 (D6): só o nome do erro, o código do Postgres e a mensagem limpa — e o aviso ao Weslley
      const acao = typeof pedido?.corpo.acao === "string" ? pedido.corpo.acao : null;
      log.excecao(e, { acao, schema: pedido?.schema ?? schemaDoPedido(req.headers.get("x-schema")) });
      return json({ ok: false, erro: "erro_interno" }, 500, origin);
    }
  });
}
