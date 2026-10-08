// Physiq W20 — agenda-avisar (banco principal): o e-mail "consulta marcada" ao aluno, depois que o profissional marca uma
// consulta no Painel › Agenda (o sino o banco já avisou, pelo gatilho). A regra mora no banco (agenda_reservar_email, pelo
// auth.uid() de quem chama — só o dono da agenda, o dono da conta ou o master; reserva as consultas novas do aluno com este
// profissional e nunca manda 2 e-mails da agenda ao mesmo aluno em 10 minutos); aqui só sai o e-mail pelo Resend, com o MESMO
// remetente dos convites (RESEND_FROM). Se o Resend falha, a reserva é desfeita.
// H3 (01/10): o e-mail no molde C. Depois da reserva a função lê (service_role, só leitura) o status, os reagendamentos e o mês
// de cada consulta reservada e as regras do profissional (agenda_regras_de): "Confirmar presença" só para consulta que ainda
// espera o aluno e "Reagendar" só quando a regra deixa (a mesma conta do app). Se essa leitura falhar, o e-mail sai sem o
// "Reagendar" (nunca promete o que a regra pode não deixar).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo: { agendamento: <id> }
// 200 → { ok, email: { enviado, motivo?, teste, id?, erro?, consultas? } } · 4xx → { ok: false, erro }
// E-mail: só para aluno com login e com e-mail no cadastro. STAGING → sempre a caixa de teste do Resend (delivered@resend.dev,
// com "[teste → <e-mail>]" no assunto); produção → conta de teste (physiq*.app) também vai para a caixa de teste.
// verify_jwt = true (chamada com o login da pessoa). Publicar:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions agenda-avisar true
// Segredos: RESEND_API_KEY, RESEND_FROM, SITE_URL (+ os automáticos).
// hml-10 (H-24, H-25, H-26): log em JSON pelo _shared/log.ts (do Resend, só o status e o código do erro — nunca o corpo); sem
// reserva com valor de produção (sem RESEND_FROM ou, na produção, sem SITE_URL o e-mail não sai: o mesmo "sem_resend" de sempre,
// com a reserva desfeita, + log.erro); o catch final avisa (log.excecao) e devolve o mesmo 500.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { origemPermitida } from "../_shared/login-regras.ts";
import type { Schema } from "../_shared/convites-regras.ts";
import { criarFreio, faltaNoEmail } from "../_shared/enviar-aluno-regras.ts";
import {
  assuntoDaAgenda,
  consultasComDetalhes,
  consultasDoEmail,
  destinoDoEmailAgenda,
  htmlDaAgenda,
  linkDaAgenda,
  regrasDoReagendamento,
  statusDoErroAgenda,
  textoDaAgenda,
  type RegrasDoReagendamento,
} from "../_shared/agenda-regras.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const SCHEMAS: Schema[] = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("agenda-avisar", { avisar: avisarErro });

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

async function enviarEmail(schema: Schema, para: string, assunto: string, html: string, texto: string): Promise<{ id: string | null; erro: string | null }> {
  const falta = faltaNoEmail(schema, { resendApiKey: RESEND_API_KEY, resendFrom: RESEND_FROM, siteUrl: SITE_URL });
  if (falta.length) {
    log.erro({ codigo: "sem_configuracao", schema, msg: `falta ${falta.join(", ")}` });
    return { id: null, erro: "sem_resend" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ from: RESEND_FROM, to: [para], subject: assunto, html, text: texto }),
    });
    const corpo = await r.json().catch(() => ({})) as Record<string, unknown>;
    if (!r.ok) {
      log.erro({ codigo: "resend_falhou", schema, status: r.status, externo: { resend_erro: corpo.name } });
      return { id: null, erro: `resend_${r.status}` };
    }
    return { id: typeof corpo.id === "string" ? corpo.id : null, erro: null };
  } catch (e) {
    log.excecao(e, { codigo: "resend_rede", schema });
    return { id: null, erro: "resend_rede" };
  }
}

type Cliente = ReturnType<typeof createClient>;

/** Status, reagendamentos e mês das consultas reservadas + as regras do profissional (só leitura; erro → sem "Reagendar"). */
async function detalhesDaReserva(db: Cliente, ids: string[], schema: Schema): Promise<{ detalhes: unknown[]; regras: RegrasDoReagendamento | null }> {
  if (!ids.length) return { detalhes: [], regras: null };
  try {
    const { data, error } = await db.from("agendamentos").select("id, status, reagendamentos, mes_referencia, nutricionista_id").in("id", ids);
    if (error || !Array.isArray(data) || !data.length) {
      if (error) log.excecao(error, { codigo: "detalhes_falhou", schema });
      return { detalhes: [], regras: null };
    }
    const prof = (data[0] as { nutricionista_id?: string | null }).nutricionista_id;
    if (!prof) return { detalhes: data, regras: null };
    const { data: regras, error: er } = await db.rpc("agenda_regras_de", { p_prof: prof });
    if (er) log.excecao(er, { codigo: "regras_falhou", schema });
    return { detalhes: data, regras: er ? null : regrasDoReagendamento(regras) };
  } catch (e) {
    log.excecao(e, { codigo: "detalhes_falhou", schema });
    return { detalhes: [], regras: null };
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
  const agendamento = String(corpo.agendamento ?? "");
  if (!UUID.test(agendamento)) return json({ ok: false, erro: "agendamento_inexistente" }, 404, origin);

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
    const { data, error } = await comoPessoa.rpc("agenda_reservar_email", { p_agendamento: agendamento });
    if (error) {
      const m = String(error.message || "");
      const codigo = ["sem_login", "sem_acesso", "agendamento_inexistente"].find((c) => m.includes(c));
      if (codigo) return json({ ok: false, erro: codigo }, statusDoErroAgenda(codigo), origin);
      throw error;
    }
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok !== true) return json({ ok: false, erro: r.erro ?? "erro_interno" }, statusDoErroAgenda(r.erro), origin);
    if (r.enviar !== true) {
      return json({ ok: true, email: { enviado: false, motivo: String(r.motivo ?? "nada_novo"), teste: schema === "staging" } }, 200, origin);
    }

    const email = String(r.para ?? "");
    const ids = (Array.isArray(r.consultas) ? r.consultas : []).map((c) => String((c as { id?: unknown })?.id ?? "")).filter((id) => UUID.test(id));
    const db = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema }, auth: { persistSession: false } });
    const { detalhes, regras } = await detalhesDaReserva(db, ids, schema);
    const consultas = consultasComDetalhes(consultasDoEmail(r.consultas), detalhes);
    const destino = destinoDoEmailAgenda(schema, email);
    const dados = {
      email,
      aluno: String(r.aluno ?? ""),
      quem: String(r.quem ?? ""),
      consultas,
      link: linkDaAgenda(schema, SITE_URL),
      paraTeste: destino.teste ? email : null,
      regras,
    };
    const envio = await enviarEmail(schema, destino.para, assuntoDaAgenda(dados), htmlDaAgenda(dados), textoDaAgenda(dados));
    if (envio.erro !== null && ids.length) {
      // o e-mail não saiu: desfaz a reserva (a próxima consulta marcada tenta de novo, sem esperar os 10 minutos)
      const { error: ef } = await db.rpc("agenda_reserva_email_falhou", { p_ids: ids });
      if (ef) log.excecao(ef, { codigo: "desfazer_reserva_falhou", schema });
    }
    return json({
      ok: true,
      email: {
        enviado: envio.erro === null,
        motivo: envio.erro === null ? null : "falhou",
        teste: destino.teste,
        id: envio.id,
        erro: envio.erro,
        consultas: consultas.length,
      },
    }, 200, origin);
  } catch (err) {
    log.excecao(err, { schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
