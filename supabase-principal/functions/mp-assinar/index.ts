// Physiq W2: cópia do physiqnutri (main ca9f66f). A partir daqui as funções do banco principal são publicadas a partir do
// physiqcalc (scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>).
/* eslint-disable @typescript-eslint/no-explicit-any -- código do physiqnutri copiado sem mudar o comportamento de hoje */
// PhysiqNutri — W42: assinatura mensal do profissional via Mercado Pago ("Assinaturas sem plano", checkout hospedado no init_point).
// Pedido dele (20/09/2026): "integra o mercado pago (será o pagamento do profissional para mim) onde ele pagará a mensalidade";
// respostas: R$ 80/mês · 14 dias de teste · mesma conta MP do PhysiqCalc. Auth = JWT do profissional (verify_jwt=true). Schema por
// header x-schema (public | staging) — a MESMA função serve os 2 ambientes. Escreve em {schema}.assinaturas com service_role
// (pelo cliente a dona só lê). Ações (body.acao):
//   "criar"        cria a preapproval PENDENTE (o profissional paga no init_point; se ainda está no teste, a 1ª cobrança é
//                  agendada pro fim do teste — start_date) ou devolve a pendente/ativa que já existe (idempotente, sem duplicar).
//   "sincronizar"  re-busca a preapproval no MP (fonte da verdade) e grava status / próximo vencimento / último pagamento.
//   W49 "assinar_cartao" cria a preapproval JÁ AUTORIZADA com o card_token do Brick (pagamento dentro do site); "cancelar" desfaz.
//   W50 "pix_criar"  cria (ou reaproveita) um PIX AVULSO de R$ 80 em /v1/payments — o MP não repete PIX sozinho (a preapproval só
//                    aceita cartão), então cada PIX aprovado soma 30 dias em profiles.pago_ate (a partir de hoje ou do que ainda
//                    vale — não perde dias). Vale 3 dias. Quem tem cartão authorized não gera PIX (cobrança dobrada).
//       "pix_status" re-busca o pagamento no MP e, aprovado, grava pago_em / cobre_ate e atualiza profiles.pago_ate (o mp-webhook
//                    faz o mesmo quando o aviso do MP chega antes da tela conferir).
// O sandbox do MP NÃO tem /preapproval (lição do PhysiqCalc: 404 "Card token service not found") → token de PRODUÇÃO nos 2
// ambientes; no staging o smoke cancela o que cria. Segredos: MP_ACCESS_TOKEN_PROD (obrigatório), MP_ACCESS_TOKEN_TEST (reserva).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const MP_API = "https://api.mercadopago.com";
const VALOR_MENSAL = 80;
const DIAS_PIX = 30;
const PIX_EXPIRA_H = 72;
const SCHEMAS = ["public", "staging"];
// W28: o endereço padrão (CORS sem origem conhecida e a volta do checkout) passa a ser o do Physiq
const SITE: Record<string, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const STATUS = ["pending", "authorized", "paused", "cancelled"];

// Physiq W2 (spec 7.2): o site e o app do Physiq também chamam (as origens do Nutri continuam)
const ORIGEM_PHYSIQ = /^(https:\/\/(www\.)?physiqcalc\.com\.br|https:\/\/physiqcalc-staging\.vercel\.app|https:\/\/localhost|capacitor:\/\/localhost)$/;
// Physiq W28 (virada): o site antigo do Nutri redireciona para o Physiq — as origens dele saem do CORS (spec 7.2); no local, as
// portas do Physiq (5173/8080), como a origemPermitida das outras funções (_shared/login-regras.ts)
function origemPermitida(origin: string | null): boolean {
  if (!origin) return false;
  if (ORIGEM_PHYSIQ.test(origin)) return true;
  return /^http:\/\/localhost:(5173|8080)$/.test(origin);
}
// Physiq W2: endereço de volta do checkout escolhido pela origem da chamada — Nutri = como antes (/configuracoes);
// Physiq = a tela de plano dele (site público de quem chamou; do app, o site do ambiente)
const SITE_PHYSIQ: Record<string, string> = { public: "https://physiqcalc.com.br", staging: "https://physiqcalc-staging.vercel.app" };
const SITE_PUBLICO_PHYSIQ = /^https:\/\/((www\.)?physiqcalc\.com\.br|physiqcalc-staging\.vercel\.app)$/;
function voltaDoCheckout(origin: string | null, schema: string): string {
  if (origin && ORIGEM_PHYSIQ.test(origin)) {
    const base = SITE_PUBLICO_PHYSIQ.test(origin) ? origin : SITE_PHYSIQ[schema];
    return `${base}/painel/configuracoes/plano?assinatura=ok`;
  }
  const site = origin && origemPermitida(origin) && origin.startsWith("https://") ? origin : SITE[schema];
  return `${site}/configuracoes?assinatura=ok`;
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

function mpToken(): string {
  return Deno.env.get("MP_ACCESS_TOKEN_PROD") || Deno.env.get("MP_ACCESS_TOKEN_TEST") || "";
}
// retry em 5xx (a API do MP tem 500 transiente); o POST leva X-Idempotency-Key
async function mpFetch(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  let status = 0;
  let body: any = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 800 * tentativa));
    const res = await fetch(`${MP_API}${path}`, {
      ...init,
      headers: { "Authorization": `Bearer ${mpToken()}`, "Content-Type": "application/json", ...((init.headers as Record<string, string>) || {}) },
    });
    status = res.status;
    try { body = await res.json(); } catch { body = null; }
    if (status < 500) break;
  }
  return { status, body };
}

// o que vai pra {schema}.assinaturas a partir da preapproval do MP (fonte da verdade)
function espelho(pre: any) {
  const st = String(pre?.status || "pending");
  return {
    mp_preapproval_id: String(pre.id),
    status: STATUS.includes(st) ? st : "pending",
    valor: Number(pre?.auto_recurring?.transaction_amount || VALOR_MENSAL),
    init_point: pre?.init_point ?? null,
    proximo_vencimento: pre?.next_payment_date ?? null,
    ultimo_pagamento_em: pre?.summarized?.last_charged_date ?? null,
    payload: pre,
    updated_at: new Date().toISOString(),
  };
}

// ---- W50: PIX avulso (/v1/payments) ----
// status do pagamento no MP → o nosso (pending | approved | rejected | cancelled | expired)
function statusPix(pay: any): string {
  const st = String(pay?.status || "pending");
  if (st === "approved") return "approved";
  if (st === "rejected") return "rejected";
  if (st === "cancelled" || st === "refunded" || st === "charged_back") {
    return String(pay?.status_detail || "").toLowerCase().includes("expir") ? "expired" : "cancelled";
  }
  return "pending"; // pending, in_process, authorized, in_mediation
}
// o que vai pra {schema}.pagamentos_assinatura a partir do pagamento do MP (fonte da verdade)
function espelhoPix(pay: any) {
  const td = pay?.point_of_interaction?.transaction_data || {};
  return {
    mp_payment_id: String(pay.id),
    status: statusPix(pay),
    valor: Number(pay?.transaction_amount || VALOR_MENSAL),
    pix_qr_code: td.qr_code ?? null,
    pix_qr_code_base64: td.qr_code_base64 ?? null,
    pix_expira_em: pay?.date_of_expiration ?? null,
    payload: pay,
    updated_at: new Date().toISOString(),
  };
}
// aprovou → 30 dias a partir de HOJE, ou do que ainda vale (pago_ate / teste_ate no futuro): ninguém perde dias
function novoPagoAte(perfil: any): string {
  const futuros = [perfil?.pago_ate, perfil?.teste_ate]
    .map((d) => (d ? new Date(d).getTime() : 0))
    .filter((n) => Number.isFinite(n));
  const base = Math.max(Date.now(), ...futuros);
  return new Date(base + DIAS_PIX * 86_400_000).toISOString();
}
// grava o que o MP disse sobre o PIX; aprovado pela 1ª vez → pago_em, cobre_ate e profiles.pago_ate
async function aplicarPix(admin: any, linha: any, pay: any, perfil: any): Promise<{ pagamento: any; pago_ate: string | null; aprovou: boolean }> {
  const pagoAtual = perfil?.pago_ate ?? null;
  if (linha.status === "approved") return { pagamento: linha, pago_ate: pagoAtual, aprovou: false }; // aprovado é final
  const esp = espelhoPix(pay);
  // o MP às vezes segura um PIX vencido como "pending": pra nós, passou da validade = expirado
  if (esp.status === "pending" && linha.pix_expira_em && new Date(linha.pix_expira_em).getTime() < Date.now()) esp.status = "expired";
  if (esp.status === "approved") {
    const pagoAte = novoPagoAte(perfil);
    // só quem trocar pending→approved soma os 30 dias (o webhook e a tela podem conferir ao mesmo tempo)
    const { data: salvo, error } = await admin.from("pagamentos_assinatura")
      .update({ ...esp, pago_em: pay?.date_approved ?? new Date().toISOString(), cobre_ate: pagoAte })
      .eq("id", linha.id).neq("status", "approved").select("*").maybeSingle();
    if (error) throw error;
    if (!salvo) {
      const { data: atual } = await admin.from("pagamentos_assinatura").select("*").eq("id", linha.id).maybeSingle();
      const { data: pf } = await admin.from("profiles").select("pago_ate").eq("id", linha.nutricionista_id).maybeSingle();
      return { pagamento: atual ?? linha, pago_ate: (pf as any)?.pago_ate ?? pagoAtual, aprovou: false };
    }
    const { error: ep } = await admin.from("profiles").update({ pago_ate: pagoAte }).eq("id", linha.nutricionista_id);
    if (ep) throw ep;
    return { pagamento: salvo, pago_ate: pagoAte, aprovou: true };
  }
  const { data: salvo, error } = await admin.from("pagamentos_assinatura").update(esp).eq("id", linha.id).select("*").single();
  if (error) throw error;
  return { pagamento: salvo, pago_ate: pagoAtual, aprovou: false };
}
// fim da cobertura que ainda vale (teste ou PIX), em ms; 0 = nada no futuro
function coberturaMs(p: any): number {
  return Math.max(p?.teste_ate ? new Date(p.teste_ate).getTime() : 0, p?.pago_ate ? new Date(p.pago_ate).getTime() : 0);
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
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const ACOES = ["criar", "sincronizar", "assinar_cartao", "cancelar", "pix_criar", "pix_status"];
  const acao = ACOES.includes(body?.acao) ? String(body.acao) : "criar";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });

  try {
    const { data: perfil, error: ep } = await admin.from("profiles")
      .select("id, email, nome, role, teste_ate, isento_assinatura, pago_ate").eq("id", user.id).maybeSingle();
    if (ep) throw ep;
    if (!perfil) return erro("sem_perfil", 404, origin);
    const p = perfil as any;
    if (p.role === "paciente") return erro("sem_acesso", 403, origin);
    const { data: atual, error: ea } = await admin.from("assinaturas").select("*").eq("nutricionista_id", user.id).maybeSingle();
    if (ea) throw ea;

    if (acao === "sincronizar") {
      if (!atual?.mp_preapproval_id) return json({ assinatura: atual ?? null }, 200, origin);
      const { status, body: pre } = await mpFetch(`/preapproval/${atual.mp_preapproval_id}`);
      if (status !== 200 || !pre?.id) return erro("mp_error", 502, origin, { status, body: JSON.stringify(pre).slice(0, 300) });
      const { data: salvo, error: es } = await admin.from("assinaturas").update(espelho(pre)).eq("id", atual.id).select("*").single();
      if (es) throw es;
      return json({ assinatura: salvo }, 200, origin);
    }

    // ---- W50: PIX avulso — confere no MP o PIX aberto (ou o pedido) e aplica a aprovação ----
    if (acao === "pix_status") {
      let q = admin.from("pagamentos_assinatura").select("*").eq("nutricionista_id", user.id);
      q = body?.pagamento_id ? q.eq("id", String(body.pagamento_id)) : q.eq("status", "pending");
      const { data: linhas, error: el } = await q.order("created_at", { ascending: false }).limit(1);
      if (el) throw el;
      const linha = ((linhas as any[]) || [])[0];
      if (!linha) return json({ pagamento: null, pago_ate: p.pago_ate ?? null }, 200, origin);
      if (linha.status === "approved") return json({ pagamento: linha, pago_ate: p.pago_ate ?? null }, 200, origin);
      const { status: stp, body: pay } = await mpFetch(`/v1/payments/${linha.mp_payment_id}`);
      if (stp !== 200 || !pay?.id) return erro("mp_error", 502, origin, { status: stp, body: JSON.stringify(pay).slice(0, 300) });
      const r = await aplicarPix(admin, linha, pay, p);
      return json({ pagamento: r.pagamento, pago_ate: r.pago_ate }, 200, origin);
    }

    // ---- W50: PIX avulso — gera o QR de R$ 80 (ou devolve o que ainda está aberto) ----
    if (acao === "pix_criar") {
      if (p.role === "master" || p.isento_assinatura) return erro("isento", 400, origin);
      if (atual?.status === "authorized") return erro("cartao_ativo", 400, origin);
      // PIX aberto e ainda válido → reaproveita (não cria outro no MP); aprovado no meio → aplica e devolve
      const { data: abertos, error: eab } = await admin.from("pagamentos_assinatura").select("*")
        .eq("nutricionista_id", user.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1);
      if (eab) throw eab;
      const aberto = ((abertos as any[]) || [])[0];
      if (aberto) {
        const { status: stp, body: pay } = await mpFetch(`/v1/payments/${aberto.mp_payment_id}`);
        if (stp === 200 && pay?.id) {
          const r = await aplicarPix(admin, aberto, pay, p);
          if (r.pagamento?.status === "approved") return json({ pagamento: r.pagamento, pago_ate: r.pago_ate, reutilizado: true }, 200, origin);
          const expira = aberto.pix_expira_em ? new Date(aberto.pix_expira_em).getTime() : 0;
          if (r.pagamento?.status === "pending" && Number(aberto.valor) === VALOR_MENSAL && aberto.pix_qr_code
            && expira > Date.now() + 30 * 60 * 1000) {
            return json({ pagamento: r.pagamento, pago_ate: p.pago_ate ?? null, reutilizado: true }, 200, origin);
          }
          // pendente vencendo em menos de 30 min: fecha pra gerar um novo (não fica 'pending' pra sempre)
          if (r.pagamento?.status === "pending") await admin.from("pagamentos_assinatura").update({ status: "expired" }).eq("id", aberto.id);
        }
      }
      const expiraDate = new Date(Date.now() + PIX_EXPIRA_H * 3_600_000);
      const expira = expiraDate.toISOString().replace("Z", "-00:00");
      const partes = String(p.nome || "").trim().split(/\s+/).filter(Boolean);
      const payer: Record<string, unknown> = { email: p.email || user.email };
      if (partes[0]) payer.first_name = partes[0];
      if (partes.length > 1) payer.last_name = partes.slice(1).join(" ");
      const { status, body: pay } = await mpFetch("/v1/payments", {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          transaction_amount: VALOR_MENSAL,
          description: "PhysiqNutri — mensalidade do profissional (PIX)",
          payment_method_id: "pix",
          payer,
          external_reference: `physiqnutri-pix:${schema}:${user.id}`,
          notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook?schema=${schema}`,
          date_of_expiration: expira,
        }),
      });
      const td = pay?.point_of_interaction?.transaction_data;
      if (status >= 300 || !pay?.id || !td?.qr_code) {
        console.error("mp-assinar pix_criar falhou", status, JSON.stringify(pay).slice(0, 500));
        return erro("pix_indisponivel", 502, origin, { status, body: JSON.stringify(pay).slice(0, 300) });
      }
      const { data: salvo, error: es } = await admin.from("pagamentos_assinatura")
        .insert({ nutricionista_id: user.id, ...espelhoPix(pay), pix_expira_em: pay?.date_of_expiration ?? expiraDate.toISOString() })
        .select("*").single();
      if (es) throw es;
      return json({ pagamento: salvo, pago_ate: p.pago_ate ?? null, reutilizado: false }, 200, origin);
    }

    // ---- W49: cancelar a assinatura pelo próprio app (sem abrir o site do Mercado Pago) ----
    if (acao === "cancelar") {
      if (!atual?.mp_preapproval_id) return erro("sem_assinatura", 400, origin);
      const { status, body: pre } = await mpFetch(`/preapproval/${atual.mp_preapproval_id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (status >= 300 || !pre?.id) {
        console.error("mp-assinar cancelar falhou", status, JSON.stringify(pre).slice(0, 500));
        return erro("mp_error", 502, origin, { status, body: JSON.stringify(pre).slice(0, 300) });
      }
      const { data: salvo, error: es } = await admin.from("assinaturas").update(espelho(pre)).eq("id", atual.id).select("*").single();
      if (es) throw es;
      return json({ assinatura: salvo }, 200, origin);
    }

    // ---- W49: assinar DENTRO do site — o Brick tokeniza o cartão no navegador e a preapproval já nasce autorizada ----
    // (pedido dele 20/09/2026: "o pagamento igual o do physiqcalc (integração dentro do site (Sem link externo").
    // Mesmo desenho do PhysiqCalc (action plano-assinar): POST /preapproval com card_token_id + status "authorized".
    if (acao === "assinar_cartao") {
      if (p.role === "master" || p.isento_assinatura) return erro("isento", 400, origin);
      const cardToken = body?.card_token;
      if (!cardToken || typeof cardToken !== "string") return erro("missing_card_token", 400, origin);
      if (atual?.mp_preapproval_id && atual.status === "authorized") {
        // confere no MP antes de recusar: a linha pode estar velha
        const { status: st, body: pre } = await mpFetch(`/preapproval/${atual.mp_preapproval_id}`);
        if (st === 200 && pre?.status === "authorized") {
          await admin.from("assinaturas").update(espelho(pre)).eq("id", atual.id);
          return erro("assinatura_ja_ativa", 400, origin);
        }
      }
      // sobrou uma preapproval PENDENTE (checkout da W42 que ele não concluiu)? cancela pra não ficarem duas no MP
      if (atual?.mp_preapproval_id && atual.status === "pending") {
        const { status: stc } = await mpFetch(`/preapproval/${atual.mp_preapproval_id}`, {
          method: "PUT",
          body: JSON.stringify({ status: "cancelled" }),
        });
        if (stc >= 300) console.error("mp-assinar: nao consegui cancelar a pendente", atual.mp_preapproval_id, stc);
      }
      const agoraMs = Date.now();
      // ainda coberta (teste ou PIX, com mais de 1 h de folga) → a 1ª cobrança fica pro fim da cobertura (W50: não perde dias)
      const cobertura = coberturaMs(p);
      const inicio = cobertura > agoraMs + 60 * 60 * 1000 ? new Date(cobertura).toISOString() : null;
      const { status, body: pre } = await mpFetch("/preapproval", {
        method: "POST",
        headers: { "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          reason: "PhysiqNutri — mensalidade do profissional",
          external_reference: `physiqnutri:${schema}:${user.id}`,
          payer_email: p.email || user.email,
          card_token_id: cardToken,
          auto_recurring: {
            frequency: 1, frequency_type: "months", transaction_amount: VALOR_MENSAL, currency_id: "BRL",
            ...(inicio ? { start_date: inicio } : {}),
          },
          back_url: voltaDoCheckout(origin, schema),
          notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook?schema=${schema}`,
          status: "authorized",
        }),
      });
      if (status >= 300 || !pre?.id) {
        console.error("mp-assinar assinar_cartao falhou", status, JSON.stringify(pre).slice(0, 500));
        // Cartão ruim NÃO vem só como 400: com token inválido o MP responde 500 "Preapproval creation failed"
        // (medido em 20/09/2026 — e o mpFetch já tentou 3×, então não é instabilidade passageira). Sem esta
        // regra a pessoa lia "o Mercado Pago não respondeu" e ficava tentando o mesmo cartão.
        const msg = String(pre?.message || pre?.error || "").toLowerCase();
        const ehCartao = status === 400 || msg.includes("preapproval creation failed") || msg.includes("card_token") || msg.includes("card token");
        if (ehCartao) return erro("cartao_recusado", 400, origin, { detalhe: String(pre?.message || "").slice(0, 200) });
        return erro("mp_error", 502, origin, { status, body: JSON.stringify(pre).slice(0, 300) });
      }
      const { data: salvo, error: es } = await admin.from("assinaturas")
        .upsert({ nutricionista_id: user.id, ...espelho(pre) }, { onConflict: "nutricionista_id" }).select("*").single();
      if (es) throw es;
      return json({ assinatura: salvo, primeira_cobranca: inicio }, 200, origin);
    }

    // ---- criar ----
    if (p.role === "master" || p.isento_assinatura) return erro("isento", 400, origin);
    if (atual?.mp_preapproval_id && ["pending", "authorized"].includes(atual.status)) {
      // já existe uma pendente/ativa: re-sincroniza e devolve a mesma (sem duplicar preapproval no MP)
      const { status, body: pre } = await mpFetch(`/preapproval/${atual.mp_preapproval_id}`);
      if (status === 200 && pre?.id) {
        const { data: salvo } = await admin.from("assinaturas").update(espelho(pre)).eq("id", atual.id).select("*").single();
        const a = (salvo ?? atual) as any;
        if (["pending", "authorized"].includes(a.status)) return json({ assinatura: a, init_point: a.init_point, reutilizada: true }, 200, origin);
      }
    }
    const agora = Date.now();
    // ainda coberta (teste ou PIX, com mais de 1 h de folga) → a 1ª cobrança fica pro fim da cobertura
    const cob = coberturaMs(p);
    const startDate = cob > agora + 60 * 60 * 1000 ? new Date(cob).toISOString() : null;
    const { status, body: pre } = await mpFetch("/preapproval", {
      method: "POST",
      headers: { "X-Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        reason: "PhysiqNutri — mensalidade do profissional",
        external_reference: `physiqnutri:${schema}:${user.id}`,
        payer_email: p.email || user.email,
        auto_recurring: {
          frequency: 1, frequency_type: "months", transaction_amount: VALOR_MENSAL, currency_id: "BRL",
          ...(startDate ? { start_date: startDate } : {}),
        },
        back_url: voltaDoCheckout(origin, schema),
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook?schema=${schema}`,
        status: "pending",
      }),
    });
    if (status >= 300 || !pre?.id || !pre?.init_point) {
      console.error("mp-assinar criar falhou", status, JSON.stringify(pre).slice(0, 500));
      return erro("mp_error", 502, origin, { status, body: JSON.stringify(pre).slice(0, 300) });
    }
    const { data: salvo, error: es } = await admin.from("assinaturas")
      .upsert({ nutricionista_id: user.id, ...espelho(pre) }, { onConflict: "nutricionista_id" }).select("*").single();
    if (es) throw es;
    return json({ assinatura: salvo, init_point: pre.init_point, reutilizada: false }, 200, origin);
  } catch (e) {
    console.error("mp-assinar erro", e);
    return erro("erro_interno", 500, origin, String((e as any)?.message || e).slice(0, 200));
  }
});
