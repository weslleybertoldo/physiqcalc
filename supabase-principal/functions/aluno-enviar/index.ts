// Physiq W17 — aluno-enviar (banco principal): o "Salvar e enviar ao aluno" da tela 8 (Editar treino e dieta) com e-mail.
// A regra mora no banco (aluno_enviar_plano, pelo auth.uid() de quem chama — só quem muda o treino/dieta daquele aluno;
// grava o aviso no sino e reserva o e-mail, que não se repete em 10 minutos); aqui só sai o e-mail pelo Resend, com o
// MESMO remetente dos convites (RESEND_FROM, domínio physiqcalc.com.br). Se o Resend falha, a reserva é desfeita.
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo:
//   { aluno: <id da rota (matrícula ou usuário do Treino)>, modulos: ["treino" | "dieta", …] }
// 200 → { ok, avisado, repetido, sem_login, email: { enviado, motivo?, teste, id?, erro? } } · 4xx → { ok: false, erro }
//   (erros do banco: sem_login, sem_acesso, aluno_inexistente, sem_modulo).
// E-mail: só para aluno com login e com e-mail no cadastro. STAGING → sempre a caixa de teste do Resend
// (delivered@resend.dev, com "[teste → <e-mail>]" no assunto); produção → conta de teste (physiq*.app) também vai para a
// caixa de teste, pessoa real recebe no próprio e-mail.
// verify_jwt = true (chamada com o login da pessoa). Publicar:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions aluno-enviar true
// Segredos: RESEND_API_KEY, RESEND_FROM, SITE_URL (+ os automáticos).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { origemPermitida } from "../_shared/login-regras.ts";
import type { Schema } from "../_shared/convites-regras.ts";
import {
  assuntoDoEnvio,
  criarFreio,
  destinoDoEnvio,
  htmlDoEnvio,
  linkDoEnvio,
  modulosDoEnvio,
  statusDoErroEnvio,
  textoDoEnvio,
} from "../_shared/enviar-aluno-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Physiq <convites@physiqcalc.com.br>";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://physiqcalc.com.br";
const SCHEMAS: Schema[] = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : "https://physiqcalc.com.br",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });

const permitido = criarFreio(60, 60 * 60_000);

async function enviarEmail(para: string, assunto: string, html: string, texto: string): Promise<{ id: string | null; erro: string | null }> {
  if (!RESEND_API_KEY) return { id: null, erro: "sem_resend" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ from: RESEND_FROM, to: [para], subject: assunto, html, text: texto }),
    });
    const corpo = await r.json().catch(() => ({})) as Record<string, unknown>;
    if (!r.ok) {
      console.error("aluno-enviar: resend", r.status, JSON.stringify(corpo).slice(0, 300));
      return { id: null, erro: `resend_${r.status}` };
    }
    return { id: typeof corpo.id === "string" ? corpo.id : null, erro: null };
  } catch (e) {
    console.error("aluno-enviar: resend", String(e));
    return { id: null, erro: "resend_rede" };
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase() as Schema;
  if (!SCHEMAS.includes(schema)) return json({ ok: false, erro: "schema_invalido" }, 400, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ") || auth.length < 20) return json({ ok: false, erro: "sem_login" }, 401, origin);
  const token = auth.slice(7).trim();

  let corpo: Record<string, unknown> = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const aluno = String(corpo.aluno ?? "");
  const modulos = modulosDoEnvio(corpo.modulos);
  if (!UUID.test(aluno)) return json({ ok: false, erro: "aluno_inexistente" }, 404, origin);
  if (modulos.length === 0) return json({ ok: false, erro: "sem_modulo" }, 400, origin);

  // o cliente "como a pessoa": a função do banco lê o auth.uid() do token dela (a regra toda é de lá)
  const comoPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: ud, error: eu } = await comoPessoa.auth.getUser(token);
  if (eu || !ud?.user) return json({ ok: false, erro: "sem_login" }, 401, origin);
  if (!permitido(`${schema}:${ud.user.id}`)) return json({ ok: false, erro: "muitos_envios" }, 429, origin);

  try {
    const { data, error } = await comoPessoa.rpc("aluno_enviar_plano", { p_aluno: aluno, p_modulos: modulos });
    if (error) {
      const m = String(error.message || "");
      const codigo = ["sem_login", "sem_acesso", "aluno_inexistente"].find((c) => m.includes(c));
      if (codigo) return json({ ok: false, erro: codigo }, statusDoErroEnvio(codigo), origin);
      throw error;
    }
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok !== true) return json({ ok: false, erro: r.erro ?? "erro_interno" }, statusDoErroEnvio(r.erro), origin);

    const base = { ok: true, avisado: r.avisado === true, repetido: r.repetido === true, sem_login: r.sem_login === true };
    const e = (r.email ?? {}) as Record<string, unknown>;
    if (e.enviar !== true) {
      return json({ ...base, email: { enviado: false, motivo: String(e.motivo ?? "sem_email"), teste: schema === "staging" } }, 200, origin);
    }

    const email = String(e.para ?? "");
    const destino = destinoDoEnvio(schema, email);
    const dados = {
      email,
      aluno: String(e.aluno ?? ""),
      quem: String(e.quem ?? ""),
      modulos: modulosDoEnvio(e.modulos),
      link: linkDoEnvio(schema, SITE_URL, e.link),
      paraTeste: destino.teste ? email : null,
    };
    const envio = await enviarEmail(destino.para, assuntoDoEnvio(dados), htmlDoEnvio(dados), textoDoEnvio(dados));
    if (envio.erro !== null && typeof e.aviso_id === "string") {
      // o e-mail não saiu: desfaz a reserva (outro "Salvar e enviar" tenta de novo, sem esperar os 10 minutos)
      const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema }, auth: { persistSession: false } });
      const { error: ef } = await db.rpc("aluno_enviar_plano_falhou", { p_aviso: e.aviso_id });
      if (ef) console.error("aluno-enviar: desfazer reserva", ef.message);
    }
    return json({
      ...base,
      email: { enviado: envio.erro === null, motivo: envio.erro === null ? null : "falhou", teste: destino.teste, id: envio.id, erro: envio.erro },
    }, 200, origin);
  } catch (err) {
    console.error("aluno-enviar erro", String((err as { message?: string })?.message || err));
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
