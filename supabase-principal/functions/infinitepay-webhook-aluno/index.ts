// Physiq W1 — infinitepay-webhook-aluno (banco principal): o aviso da InfinitePay de que um link do Physiq foi pago (aluno → personal).
// Chega SEM JWT (verify_jwt = false) e SEM ASSINATURA (a doc não tem). Aqui ele só vira um AVISO na caixa ({schema}.infinitepay_avisos),
// pelo order_nsu de um LINK nosso (`<cobranca_id>-<n>` — {schema}.infinitepay_links, I4), e a resposta sai em < 1 s (a doc: "de
// preferência em menos de 1 segundo"). A conferência no payment_check roda em segundo plano (emSegundoPlano) e só ela dá baixa
// (_shared/infinitepay-baixa.ts). Ela usa a InfiniteTag e o preço GRAVADOS no link, o order_nsu, o transaction_nsu e o slug.
// Quem chama:
//   · a InfinitePay: o webhook_url de cada link, …/infinitepay-webhook-aluno?schema=<public|staging>. O schema também vale no caminho
//     (…/infinitepay-webhook-aluno/<schema>), como reserva se a InfinitePay tirar a busca da url (MENOR 13 da revisão);
//   · a rodada do pg_cron ({schema}.infinitepay_rodada(), a cada 15 min): reenvia os avisos que não deu para conferir (&origem=rodada).
//   Os 2 entram igual: nada do corpo é confiado.
// A rota é pública (I6 da revisão):
//   · limite por IP — o cf-connecting-ip, que a Cloudflare escreve (ipDoPedido: o cabeçalho de encaminhamento que o cliente escreve
//     não vale);
//   · corpo até 16 KB;
//   · aviso NOVO só de link com até 72 h + 7 dias e até 20 por cobrança (o resto: 200 e ignorado).
// Respostas:
//   · 200 { ok, resultado, ms } no que registrou ou ignorou (fora do formato, pedido que não é nosso, fora do prazo, no teto, schema
//     inválido);
//   · 429 no limite por IP; 413 no corpo grande;
//   · 400 no erro do banco e no schema certo ainda sem a W1 (o cache de 60 s logo depois da migration) — a InfinitePay manda de novo
//     (a doc: responder 400 faz reenviar).
//   Nunca 5xx.
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions infinitepay-webhook-aluno false
// Segredos: nenhum (só os automáticos SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY). INFINITEPAY_API: só no Deno local (o simulador).
// Log: _shared/log.ts — o id da cobrança e o resultado; nunca o corpo, a InfiniteTag, a url do recibo, o NSU ou o slug.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { ipDoPedido } from "../_shared/entrar-senha-regras.ts";
import { criarLog, emSegundoPlano } from "../_shared/log.ts";
import type { Schema } from "../_shared/financeiro-regras.ts";
import { IP_LIMITE_CORPO, lerAvisoDoWebhook } from "../_shared/infinitepay-regras.ts";
import { conferirAviso, linkDoPedido, registrarAviso, schemaTemW1 } from "../_shared/infinitepay-baixa.ts";
import { ORCAMENTO_MS, prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IP_BASE = Deno.env.get("INFINITEPAY_API") ?? null;
const SCHEMAS: Schema[] = ["public", "staging"];
const log = criarLog("infinitepay-webhook-aluno", { avisar: avisarErro });

function responder(status: number, resultado: string, inicio: number): Response {
  return new Response(JSON.stringify({ ok: status < 300, resultado, ms: Math.round(performance.now() - inicio) }),
    { status, headers: { "Content-Type": "application/json" } });
}

const janela = new Map<string, number[]>();
function permitido(chave: string, max = 120, ms = 60_000): boolean {
  const agora = Date.now();
  const lista = (janela.get(chave) ?? []).filter((t) => agora - t < ms);
  if (lista.length >= max) return false;
  lista.push(agora);
  janela.set(chave, lista);
  if (janela.size > 5000) janela.clear();
  return true;
}

const clientes = new Map<Schema, SupabaseClient>();
function dbDe(schema: Schema): SupabaseClient {
  let c = clientes.get(schema);
  if (!c) {
    c = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
    clientes.set(schema, c);
  }
  return c;
}

/** O schema da busca (?schema=) ou, de reserva, o último pedaço do caminho (…/infinitepay-webhook-aluno/<schema>). */
function schemaDoPedido(url: URL): Schema | null {
  const bruto = (url.searchParams.get("schema") || url.pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
  return SCHEMAS.includes(bruto as Schema) ? (bruto as Schema) : null;
}

Deno.serve(async (req) => {
  const inicio = performance.now();
  if (req.method !== "POST") return responder(200, "ignorado_metodo", inicio);
  let schema: Schema | null = null;
  try {
    const url = new URL(req.url);
    schema = schemaDoPedido(url);
    if (!schema) {
      log.aviso({ codigo: "ip_webhook_sem_schema" });
      return responder(200, "schema_invalido", inicio);
    }
    const daRodada = url.searchParams.get("origem") === "rodada";
    // I6: a InfinitePay chama o supabase.co direto (sem o proxy): vale o cf-connecting-ip; sem IP conhecido, um balde só
    if (!permitido(ipDoPedido(req.headers, null) ?? "sem-ip")) return responder(429, "limite", inicio);
    if (Number(req.headers.get("content-length") || 0) > IP_LIMITE_CORPO) return responder(413, "corpo_grande", inicio);
    const bruto = await req.text();
    if (bruto.length > IP_LIMITE_CORPO) return responder(413, "corpo_grande", inicio);
    let corpo: unknown = null;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      corpo = null;
    }
    const aviso = lerAvisoDoWebhook(corpo);
    if (!aviso) return responder(200, "ignorado_formato", inicio);
    const db = dbDe(schema);
    // o schema certo ainda sem a W1 (o cache de 60 s logo depois da migration) → 400: a InfinitePay manda de novo (MENOR 4)
    if (!(await schemaTemW1(db, schema))) return responder(400, "schema_sem_w1", inicio);
    // I4: só o link nosso (a InfiniteTag e o preço DELE); o resto não gera conferência
    const link = await linkDoPedido(db, aviso.pedido);
    if (!link || link.cobranca_id !== aviso.cobranca) return responder(200, "ignorado_pedido", inicio);
    const reg = await registrarAviso(db, link, aviso, "webhook");
    if ("ignorado" in reg) {
      log.aviso({ codigo: reg.ignorado === "prazo" ? "aviso_ip_fora_do_prazo" : "aviso_ip_no_teto", schema, ref: link.cobranca_id });
      return responder(200, `ignorado_${reg.ignorado}`, inicio);
    }
    const s = schema;
    const ref = link.cobranca_id;
    emSegundoPlano(conferirAviso(db, reg.id, { schema: s, log, prazo: prazo(ORCAMENTO_MS.servidor), ip: { base: IP_BASE } }, "servidor")
      .then((resultado) => log.info({ codigo: "aviso_ip_conferido", schema: s, ref, resultado }))
      .catch((e) => log.excecao(e, { codigo: "aviso_ip_conferir_falhou", schema: s, ref })));
    log.info({ codigo: daRodada ? "aviso_ip_rodada" : "aviso_ip", schema, ref, resultado: "registrado" });
    return responder(200, "registrado", inicio);
  } catch (e) {
    log.excecao(e, { schema });
    return responder(400, "erro", inicio);
  }
});
