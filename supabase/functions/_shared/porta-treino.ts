// Physiq hml-21d (H-43 · jeito 2, etapa 3, 13/10/2026) — a porta das funções do jeito 2 do BANCO DO TREINO que leem e gravam COMO A PESSOA
// (a treinos, a 1ª): o MOLDE é a _shared/porta-pessoa.ts do principal (a hml-19a/21a), com o que é do Treino:
//   OPTIONS → só POST → x-schema na lista fechada (400 schema_invalido) → Bearer (401 sem_login) → corpo até LIMITE_CORPO (413) →
//   cliente "como a pessoa" (a chave anon do Treino + o token do TREINO de quem chama — o da trocar-token, o mesmo que as funções do Treino
//   recebem hoje —, no schema do pedido: o RLS vale como 2ª camada) → quem chama (com a opção jwtLeitura: "jwks", SÓ no `ler`, o token
//   conferido aqui pelo JWKS do Treino — _shared/jwks-treino.ts —; nas gravações e na reserva, o getUser no Auth) (401 sem_login) → o papel
//   do token (master: o app_metadata.role admin/master — o que o physiq_is_master() do banco lê) → freio por pessoa (429 muitas_acoes).
// O prazo do pedido (ORCAMENTO_MS.usuario, 20 s) vale em TODA ida do cliente (Auth, banco, Storage): cada uma leva só o tempo que sobra.
// Diferente do principal: o Deno.serve e o catch final ficam no index.ts de cada função (a guarda do Treino —
// src/lib/logsDasFuncoesTreino.test.ts — confere o catch final de cada função no index.ts dela: log.excecao + a resposta erro_interno).
// Nenhuma chave secreta aqui: o dono do que a função grava vem do user do token. O CORS é a MESMA lista das funções do Treino (o
// admin-avaliacoes, o painel-resumo-treino): o site, o staging, o APK (https://localhost e capacitor://localhost) e o local (5173 e 8080).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { conferirJwtLocal } from "./jwks-treino.ts";
import type { Log } from "./log.ts";
import { ORCAMENTO_MS, buscarComTempo, prazo, type Prazo } from "./tempo.ts";
import { ehMaster, papelDoToken } from "./treinos-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

/** O corpo de um pedido (o maior: o treino pronto do master com as divisões — bem abaixo disto). */
export const LIMITE_CORPO = 2_000_000;
export const SCHEMAS = ["public", "staging"] as const;
export type Schema = (typeof SCHEMAS)[number];

/** As origens que o CORS aceita: a MESMA lista das funções do Treino de hoje (admin-avaliacoes/index.ts, painel-resumo-treino). */
export const ORIGENS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.com.br",
  "https://www.physiqcalc.com.br",
  "https://physiqcalc-staging.vercel.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

export function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && ORIGENS.has(origin) ? origin : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
}

/** Schema do pedido (header x-schema); ausente = public; inválido = null (a função responde 400). */
export function schemaDoPedido(valor: string | null | undefined): Schema | null {
  const s = (valor || "public").trim().toLowerCase();
  return (SCHEMAS as readonly string[]).includes(s) ? (s as Schema) : null;
}

export interface ContextoTreino {
  schema: Schema;
  origin: string | null;
  corpo: Record<string, unknown>;
  /** o id de quem chama no Treino (o sub do token, conferido) — o dono de tudo o que a função grava */
  userId: string;
  /** quem chama é master no Treino (o app_metadata.role admin/master do token conferido — o que o physiq_is_master() lê) */
  master: boolean;
  /** o cliente com o token da pessoa, no schema do pedido: tabelas, RPCs e Storage pelo RLS dela */
  comoPessoa: SupabaseClient;
  /** o log da função (criarLog com o nome dela — o mesmo do catch final) */
  log: Log;
  /** o orçamento do pedido (cada ida do comoPessoa já leva só o que sobra) */
  prazo: Prazo;
}

export interface OpcoesPortaTreino {
  /** pedidos por minuto por pessoa (nesta instância), em cada schema */
  freio: number;
  /** "jwks" = no `acao: "ler"` o token é conferido aqui (jwks-treino.ts), sem o getUser; as outras ações seguem no getUser */
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
 * Quem chama: o id do user do token, ou null (401 sem_login). O de sempre: o getUser no Auth do Treino (a sessão conferida na hora). Com
 * jwtLeitura "jwks", SÓ no `ler`, a conferência local — inválido/vencido → null; a rede ou a chave → o getUser (a reserva, com o aviso).
 */
async function quemChama(token: string, corpo: Record<string, unknown>, opcoes: OpcoesPortaTreino, comoPessoa: SupabaseClient, log: Log, schema: Schema): Promise<string | null> {
  if (opcoes.jwtLeitura === "jwks" && corpo.acao === "ler") {
    const local = await conferirJwtLocal(token);
    if (local.ok === true) return local.userId;
    if (local.motivo === "invalido") return null;
    log.aviso({ codigo: "jwks_reserva", schema, resultado: local.causa });
  }
  const { data: ud, error: eu } = await comoPessoa.auth.getUser(token);
  return eu || !ud?.user ? null : ud.user.id;
}

/**
 * Abre o pedido: OPTIONS, método, schema, login (no Auth do Treino; com jwtLeitura, no `ler`, local), o papel e o freio. Devolve o contexto
 * ou a resposta de recusa. Quem chama (o index.ts) faz o Deno.serve e o catch final.
 */
export async function abrirPedidoNoTreino(req: Request, nome: string, opcoes: OpcoesPortaTreino, log: Log): Promise<ContextoTreino | Response> {
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
  // o papel: o do token JÁ conferido (pelo JWKS ou pelo getUser) — o mesmo que o RLS do Treino vai ler
  return { schema, origin, corpo, userId, master: ehMaster(papelDoToken(token)), comoPessoa, log, prazo: p };
}
