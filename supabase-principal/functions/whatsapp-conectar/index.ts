// Physiq W2: cópia do physiqnutri (main ca9f66f). A partir daqui as funções do banco principal são publicadas a partir do
// physiqcalc (scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>).
/* eslint-disable prefer-const -- código do physiqnutri copiado sem mudar o comportamento de hoje */
// PhysiqNutri — W46: o que a TELA do profissional pede sobre a conexão do WhatsApp (pedido dele 20/09/2026: "temos pendentes
// ainda as mensagens pelo whatsapp"; decisão dele: QR code como no WhatsApp Web, cada profissional conecta o próprio número).
// Auth = JWT do profissional (verify_jwt=true). Schema pelo header x-schema (public | staging) — a MESMA função serve os 2.
// Escreve em {schema}.whatsapp_instancias com service_role (pelo cliente a dona só lê).
// Ações (body.acao):
//   "status"      devolve a linha da instância (cria 'desconectado' na 1ª vez) — a tela faz polling disto enquanto o QR não vem.
//   "conectar"    marca pedido_em=now() e status='aguardando_qr' (limpa QR velho); o agente do celular pega e publica o QR.
//   "desconectar" marca 'desconectado' e limpa QR/número; o agente derruba a sessão na próxima rodada.
//   "teste"       enfileira UMA mensagem de teste pro número conectado (prova viva do fim a fim, sem depender de paciente).
// Quem envia de verdade é o agente no celular (ver whatsapp-agente + ~/whatsapp-pn/agente.js no Moto G7).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SCHEMAS = ["public", "staging"];
const SITE: Record<string, string> = { public: "https://nutri.physiqcalc.com.br", staging: "https://physiqnutri-staging.vercel.app" };
// o agente republica o QR a cada ~20 s; passou disso sem ping, a tela mostra "celular fora do ar"
const PEDIDO_VALIDO_MIN = 5;

// Physiq W2 (spec 7.2): o site e o app do Physiq também chamam (as origens do Nutri continuam)
const ORIGEM_PHYSIQ = /^(https:\/\/(www\.)?physiqcalc\.com\.br|https:\/\/physiqcalc-staging\.vercel\.app|https:\/\/localhost|capacitor:\/\/localhost)$/;
// Physiq W22: o teste diz o nome do app de onde veio o pedido (o personal nunca usou o PhysiqNutri); o site antigo continua igual
function marcaDaOrigem(origin: string | null): string {
  if (origin && (ORIGEM_PHYSIQ.test(origin) || /^http:\/\/(127\.0\.0\.1|localhost):(5173|8080)$/.test(origin))) return "Physiq";
  return "PhysiqNutri";
}
function origemPermitida(origin: string | null): boolean {
  if (!origin) return false;
  if (/^https:\/\/(nutri\.physiqcalc\.com\.br|physiqnutri(-[a-z0-9-]+)?\.vercel\.app)$/.test(origin)) return true;
  if (ORIGEM_PHYSIQ.test(origin)) return true;
  return /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}
function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origemPermitida(origin) ? origin! : SITE.public,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-schema",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(origin) } });
const erro = (codigo: string, status: number, origin: string | null, detalhe?: unknown) => json({ error: codigo, detalhe }, status, origin);

// E.164 COM o "+" — é o formato que Configurações (W35) grava em dados_profissionais.whatsapp_e164 e que
// formatarWhatsapp() espera na tela. O agente tira o "+" só na hora de montar o endereço do WhatsApp.
const E164_OK = (v: unknown): v is string => typeof v === "string" && /^\+[1-9]\d{9,14}$/.test(v);

function numeroDoPerfil(dados: unknown): string | null {
  const o = (dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {}) as Record<string, unknown>;
  if (E164_OK(o.whatsapp_e164)) return o.whatsapp_e164;
  const tel = typeof o.telefone === "string" ? o.telefone.replace(/\D/g, "") : "";
  if (tel.length === 10 || tel.length === 11) return `+55${tel}`;
  if (tel.length === 12 || tel.length === 13) return `+${tel}`;
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return erro("metodo", 405, origin);
  const schema = (req.headers.get("x-schema") || "public").toLowerCase();
  if (!SCHEMAS.includes(schema)) return erro("schema_invalido", 400, origin);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return erro("missing_auth", 401, origin);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u, error: eu } = await userClient.auth.getUser(auth.slice(7));
  if (eu || !u?.user) return erro("invalid_token", 401, origin);
  const user = u.user;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const acao = String(body?.acao ?? "status");
  if (!["status", "conectar", "desconectar", "teste"].includes(acao)) return erro("acao_invalida", 400, origin);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });

  try {
    const { data: perfil, error: ep } = await admin.from("profiles")
      .select("id, nome, role, dados_profissionais").eq("id", user.id).maybeSingle();
    if (ep) throw ep;
    if (!perfil) return erro("sem_perfil", 404, origin);
    const p = perfil as Record<string, unknown>;
    if (p.role === "paciente") return erro("sem_acesso", 403, origin);

    // a linha nasce na 1ª visita à aba (assim a tela sempre tem o que mostrar)
    let { data: inst, error: ei } = await admin.from("whatsapp_instancias")
      .select("*").eq("nutricionista_id", user.id).maybeSingle();
    if (ei) throw ei;
    if (!inst) {
      const { data: nova, error: en } = await admin.from("whatsapp_instancias")
        .insert({ nutricionista_id: user.id, status: "desconectado" }).select("*").single();
      if (en) throw en;
      inst = nova;
    }
    const linha = inst as Record<string, unknown>;

    if (acao === "status") {
      // a tela faz polling deste endpoint enquanto espera a leitura: isso RENOVA o pedido, senão ele expira em 5 min
      // no meio do processo e o agente derruba a sessão com o QR ainda na frente dela (caso real, 20/09/2026).
      if (linha.status === "aguardando_qr") {
        const { data: renovada } = await admin.from("whatsapp_instancias")
          .update({ pedido_em: new Date().toISOString() }).eq("id", linha.id as string).select("*").single();
        return json({ instancia: renovada ?? linha }, 200, origin);
      }
      return json({ instancia: linha }, 200, origin);
    }

    if (acao === "conectar") {
      const numero = numeroDoPerfil(p.dados_profissionais);
      if (!numero) return erro("sem_numero", 400, origin);
      const { data: salvo, error: es } = await admin.from("whatsapp_instancias").update({
        status: "aguardando_qr", numero_e164: numero, qr_code: null, qr_atualizado_em: null,
        pedido_em: new Date().toISOString(), erro: null,
      }).eq("id", linha.id as string).select("*").single();
      if (es) throw es;
      return json({ instancia: salvo }, 200, origin);
    }

    if (acao === "desconectar") {
      const { data: salvo, error: es } = await admin.from("whatsapp_instancias").update({
        status: "desconectado", qr_code: null, qr_atualizado_em: null, pedido_em: null,
        numero_conectado: null, conectado_em: null, erro: null,
      }).eq("id", linha.id as string).select("*").single();
      if (es) throw es;
      return json({ instancia: salvo }, 200, origin);
    }

    // ---- teste: uma mensagem pro próprio número conectado (a prova viva da W46) ----
    if (linha.status !== "conectado") return erro("nao_conectado", 400, origin);
    const destino = (linha.numero_conectado as string) || (linha.numero_e164 as string) || "";
    if (!E164_OK(destino)) return erro("sem_numero", 400, origin);
    const recente = new Date(Date.now() - PEDIDO_VALIDO_MIN * 60 * 1000).toISOString();
    const { data: jaTem, error: ej } = await admin.from("mensagens_whatsapp")
      .select("id").eq("nutricionista_id", user.id).eq("tipo", "teste").eq("status", "pendente")
      .gte("created_at", recente).maybeSingle();
    if (ej) throw ej;
    if (jaTem) return json({ mensagem: jaTem, repetida: true }, 200, origin);
    const nome = typeof p.nome === "string" && p.nome.trim() ? p.nome.trim().split(/\s+/)[0] : "tudo certo";
    const { data: msg, error: em } = await admin.from("mensagens_whatsapp").insert({
      nutricionista_id: user.id, tipo: "teste", destino_e164: destino,
      texto: `Oi, ${nome}! Esta é a mensagem de teste do ${marcaDaOrigem(origin)}. Seu WhatsApp está conectado. ✅`,
    }).select("*").single();
    if (em) throw em;
    return json({ mensagem: msg, repetida: false }, 200, origin);
  } catch (e) {
    console.error("whatsapp-conectar", acao, String(e));
    return erro("erro_interno", 500, origin, String(e).slice(0, 300));
  }
});
