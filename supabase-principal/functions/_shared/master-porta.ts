// Physiq W27 — a porta comum das 3 funções do painel master (master-contas, master-financeiro, master-planos): CORS, schema,
// login (GET /auth/v1/user pelo token da pessoa) e a conferência de que é master (app_metadata no Auth ou o perfil master do
// schema — a mesma regra do sou_master() do banco). Quem não é master recebe 403; sem login, 401. As RPCs rodam COMO A PESSOA
// (auth.uid() de verdade: o banco confere o master de novo e grava quem fez cada coisa nos eventos).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { origemPermitida } from "./login-regras.ts";
import { ehMaster, schemaDoPedido, statusDoErro, type Schema } from "./master-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

export interface Contexto {
  schema: Schema;
  origin: string | null;
  corpo: Record<string, unknown>;
  userId: string;
  /** cliente com o token da pessoa (as RPCs master_* e as das W13/W8b, que conferem o master pelo auth.uid()) */
  comoPessoa: SupabaseClient;
  /** service_role no schema do ambiente (o que é do servidor: criar o login, assinaturas, avisos) */
  db: SupabaseClient;
  /** service_role do Auth (um só para os 2 schemas) */
  authAdmin: SupabaseClient;
}

// freio por pessoa nesta instância (as telas do master fazem poucas chamadas; isto segura laço de erro)
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
  if (janelas.size > 2000) janelas.clear();
  return true;
}

/** Abre o pedido: OPTIONS, método, schema, login e master. Devolve o contexto ou a resposta de recusa. */
export async function abrirPedido(req: Request, nome: string): Promise<Contexto | Response> {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = schemaDoPedido(req.headers.get("x-schema"));
  if (!schema) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "sem_login" }, 401, origin);
  const token = auth.slice(7).trim();
  let corpo: Record<string, unknown> = {};
  try {
    corpo = (await req.json()) as Record<string, unknown>;
  } catch {
    corpo = {};
  }
  const comoPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema: schema as "public" },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: ud, error: eu } = await comoPessoa.auth.getUser(token);
  if (eu || !ud?.user) return json({ ok: false, erro: "sem_login" }, 401, origin);
  const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
  const authAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  // o papel vem do Auth (não do token, que pode ser de antes de tirar o master) + o perfil deste schema
  const [{ data: u }, { data: perfil }] = await Promise.all([
    authAdmin.auth.admin.getUserById(ud.user.id),
    db.from("profiles").select("role").eq("id", ud.user.id).maybeSingle(),
  ]);
  if (!ehMaster((u?.user?.app_metadata as Record<string, unknown>) ?? null, (perfil as { role?: string } | null)?.role ?? null)) {
    console.warn(`${nome}: recusado (não é master)`, ud.user.id);
    return json({ ok: false, erro: "so_master" }, 403, origin);
  }
  if (!permitido(`${nome}:${schema}:${ud.user.id}`, 240, 60_000)) return json({ ok: false, erro: "muitas_acoes" }, 429, origin);
  return { schema, origin, corpo, userId: ud.user.id, comoPessoa, db, authAdmin };
}

/** Chama uma RPC como a pessoa e devolve o objeto (erro do Postgres = exceção). */
export async function rpc(cliente: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await cliente.rpc(fn, args);
  if (error) {
    // as RPCs antigas (W8b) sinalizam com raise exception 'codigo' — vira o erro da resposta
    const msg = String(error.message || "");
    if (/^[a-z_]{3,40}$/.test(msg)) return { ok: false, erro: msg };
    throw error;
  }
  if (data === null || data === undefined) return { ok: true };
  if (typeof data !== "object" || Array.isArray(data)) return { ok: true, dados: data };
  return data as Record<string, unknown>;
}

/** Resposta do resultado de uma RPC: ok → 200; senão o status do erro. */
export function responder(r: Record<string, unknown>, origin: string | null): Response {
  return json(r, r.ok === false ? statusDoErro(r.erro) : 200, origin);
}

/** Envolve o handler: erros inesperados viram 500 com o código, sem vazar detalhe. */
export function servir(nome: string, handler: (c: Contexto) => Promise<Response>) {
  Deno.serve(async (req) => {
    const origin = req.headers.get("Origin");
    try {
      const c = await abrirPedido(req, nome);
      if (c instanceof Response) return c;
      return await handler(c);
    } catch (e) {
      console.error(`${nome} erro`, String((e as { message?: string })?.message || e));
      return json({ ok: false, erro: "erro_interno" }, 500, origin);
    }
  });
}
