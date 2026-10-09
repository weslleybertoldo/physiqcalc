// Physiq W5 — convites (banco principal): convite de MEMBRO da equipe por e-mail (spec §4.6 Equipe e §8.1 convites). A
// regra mora no banco (convidar_membro / cancelar_convite_membro, pelo auth.uid() de quem chama — só o dono, papéis que o
// plano permite, conta nova sem o painel travado, no staging só conta de teste); aqui só sai o e-mail pelo Resend, com o
// remetente dos convites (RESEND_FROM = "Physiq <convites@physiqcalc.com.br>" desde a H3; domínio verificado na conta B Code).
// O aceite é no 1º login da pessoa com aquele e-mail (pos-login → aceitar_convites_do_email).
//
// POST, headers: Authorization: Bearer <access_token do principal> · x-schema: public|staging. Corpo:
//   { acao: "convidar", conta_id, email, papeis: ["personal" | "nutricionista", …] }  → cria (ou reenvia) e manda o e-mail
//   { acao: "cancelar", convite_id }                                                   → cancela um convite pendente
// 200 → { ok, convite_id, reenvio, email_enviado, email_teste, email_id? } · 4xx → { ok: false, erro } (erros do banco: so_dono,
// conta_legada, conta_travada, email_invalido, papeis_invalidos, papel_sem_modulo, proprio_email, ja_e_membro,
// muitos_convites, conta_real_no_staging…). Conta de TESTE (domínios physiq*.app, que não existem): o e-mail vai para a caixa
// de teste do Resend (delivered@resend.dev), nunca para uma pessoa real.
// verify_jwt = true (chamada com o login da pessoa). Publicar:
//   scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions convites true
// Segredos: RESEND_API_KEY, RESEND_FROM, SITE_URL (+ os automáticos).
// hml-10 (H-24, H-25, H-26): log em JSON pelo _shared/log.ts (do Resend, só o status e o código do erro — nunca o corpo); sem
// reserva com valor de produção (sem RESEND_FROM ou, na produção, sem SITE_URL o e-mail não sai: o mesmo "sem_resend" de sempre,
// + log.erro); o catch final avisa (log.excecao) e devolve o mesmo 500.
// hml-14 (H-32): o Resend espera no máximo TEMPO_MS.email — estourou → o resend_rede de sempre (o e-mail pode ter saído).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { origemPermitida } from "../_shared/login-regras.ts";
import { destinoDoEnvio, faltaNoEmail } from "../_shared/enviar-aluno-regras.ts";
import {
  assuntoDoConvite,
  htmlDoConvite,
  linkDoConvite,
  textoDoConvite,
  type Schema,
} from "../_shared/convites-regras.ts";
import { TEMPO_MS, buscarComTempo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "";
const SCHEMAS: Schema[] = ["public", "staging"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = criarLog("convites", { avisar: avisarErro });

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

// freio por pessoa nesta instância (o banco tem o dele por conta: 20 envios/hora, 30 pendentes)
const janela = new Map<string, number[]>();
function permitido(chave: string, max = 30, ms = 60 * 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  if (janela.size > 5000) janela.clear();
  return true;
}

const STATUS_DO_ERRO: Record<string, number> = {
  sem_login: 401, so_dono: 403, conta_inexistente: 404, convite_inexistente: 404, conta_legada: 409, conta_travada: 409,
  email_invalido: 400, papeis_invalidos: 400, papel_sem_modulo: 400, proprio_email: 400, ja_e_membro: 409,
  muitos_convites: 429, conta_real_no_staging: 403, convite_nao_pendente: 409,
};

async function enviarEmail(schema: Schema, para: string, assunto: string, html: string, texto: string): Promise<{ id: string | null; erro: string | null }> {
  const falta = faltaNoEmail(schema, { resendApiKey: RESEND_API_KEY, resendFrom: RESEND_FROM, siteUrl: SITE_URL });
  if (falta.length) {
    log.erro({ codigo: "sem_configuracao", schema, msg: `falta ${falta.join(", ")}` });
    return { id: null, erro: "sem_resend" };
  }
  try {
    const r = await buscarComTempo("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ from: RESEND_FROM, to: [para], subject: assunto, html, text: texto }),
    }, TEMPO_MS.email);
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
  const acao = String(corpo.acao ?? "");
  // o cliente "como a pessoa": as funções do banco leem o auth.uid() do token dela (a regra toda é de lá)
  const comoPessoa = createClient(SUPABASE_URL, ANON, {
    db: { schema },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: ud, error: eu } = await comoPessoa.auth.getUser(token);
  if (eu || !ud?.user) return json({ ok: false, erro: "sem_login" }, 401, origin);
  if (!permitido(`${schema}:${ud.user.id}`)) return json({ ok: false, erro: "muitos_convites" }, 429, origin);

  try {
    if (acao === "cancelar") {
      const id = String(corpo.convite_id ?? "");
      if (!UUID.test(id)) return json({ ok: false, erro: "convite_inexistente" }, 404, origin);
      const { data, error } = await comoPessoa.rpc("cancelar_convite_membro", { p_convite: id });
      if (error) throw error;
      const r = (data ?? {}) as Record<string, unknown>;
      return json(r, r.ok === true ? 200 : STATUS_DO_ERRO[String(r.erro)] ?? 400, origin);
    }
    if (acao !== "convidar") return json({ ok: false, erro: "acao_invalida" }, 400, origin);

    const contaId = String(corpo.conta_id ?? "");
    const email = String(corpo.email ?? "").trim().toLowerCase();
    const papeis = Array.isArray(corpo.papeis) ? (corpo.papeis as unknown[]).map(String) : [];
    if (!UUID.test(contaId)) return json({ ok: false, erro: "conta_inexistente" }, 404, origin);
    const { data, error } = await comoPessoa.rpc("convidar_membro", { p_conta: contaId, p_email: email, p_papeis: papeis });
    if (error) throw error;
    const r = (data ?? {}) as Record<string, unknown>;
    if (r.ok !== true) return json(r, STATUS_DO_ERRO[String(r.erro)] ?? 400, origin);

    // o e-mail (o convite já está gravado: se o e-mail falhar, a tela avisa e o dono pode mandar o link por outro caminho)
    // hml-02 (H-05): no staging o e-mail vai SEMPRE para a caixa de teste (o convite pode ter um endereço real)
    const destino = destinoDoEnvio(schema, String(r.email));
    const dados = {
      email: String(r.email),
      papeis: (r.papeis as string[]) ?? papeis,
      conta: String(r.conta_nome ?? ""),
      quem: String(r.quem_convidou ?? ""),
      link: linkDoConvite(schema, SITE_URL),
      paraTeste: destino.teste ? String(r.email) : null,
    };
    const envio = await enviarEmail(schema, destino.para, assuntoDoConvite(dados), htmlDoConvite(dados), textoDoConvite(dados));
    return json({
      ok: true, convite_id: r.convite_id, reenvio: r.reenvio === true, email: r.email, papeis: r.papeis,
      email_enviado: envio.erro === null, email_teste: destino.teste, email_id: envio.id, erro_email: envio.erro,
      link: dados.link,
    }, 200, origin);
  } catch (e) {
    log.excecao(e, { acao, schema });
    return json({ ok: false, erro: "erro_interno" }, 500, origin);
  }
});
