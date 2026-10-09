// Webhook de notificações do Mercado Pago (verify_jwt = false). Publicar SÓ pelo scripts/deploy_function.sh (o workflow
// deploy-function.yml liga o verify_jwt e o MP passaria a levar 401).
// Nunca confia no payload: sempre re-busca o recurso na API do MP (fonte da verdade).
// external_reference: "<schema>:<user_id>[:<mes_ref>[:<contexto>[:<tipo_cobranca>]]]"
//   contexto = aluno (mensalidade do aluno, padrão) | plano_professor (SaaS 12/09/2026: adesão/mensal/anual do professor)
// Physiq W6: a cobrança do ALUNO mudou para o banco principal. Os pagamentos e as assinaturas que o Calc criou antes continuam
// avisando esta URL: aqui eles seguem sendo gravados no Treino (como sempre) e o MESMO aviso é repassado para a
// mp-webhook-aluno do principal (segredo PRINCIPAL_WEBHOOK_URL), que busca de novo no MP e grava a cobrança lá. Se o repasse
// falha, a resposta é 500 — o MP manda de novo e nada se perde (as duas pontas são idempotentes). PRINCIPAL_WEBHOOK_SCHEMAS
// (ex.: "staging" ou "staging,public") liga o repasse por ambiente.
// Physiq W28 (virada): os do PROFESSOR (plano_professor) também são repassados — para a mp-webhook-conta do principal
// (segredo PRINCIPAL_WEBHOOK_CONTA_URL), que aplica na conta legada_calc do professor SÓ depois que ela passou para o núcleo
// (cobranca_legada = false); antes disso ela ignora e vale o que este webhook grava aqui (as colunas antigas continuam).
// Physiq hml-06 (H-19): o ambiente é o da CREDENCIAL que achou o recurso (produção → public, teste → staging), nunca o da
// referência — Pix de sandbox com referência "public:" não paga nada no public, e o de produção não vale no staging
// ("outro_ambiente": não grava nem repassa). O id do aviso só vai à API do MP no formato que o MP manda (regras.ts) e o MP
// fora devolve 500 (o MP manda de novo; antes o aviso seguia sem o recurso e se perdia).
// hml-10 (H-24 e H-26): log em JSON sem dado pessoal (_shared/log.ts); log.erro e log.excecao avisam o Weslley pelo principal.
// hml-14 (H-32): cada ida ao MP espera no máximo 8 s (TEMPO_MS.mp) dentro do prazo do aviso (ORCAMENTO_MS.servidor, 25 s) — o
// MP pendurado vira MpIndisponivel → 500 (antes a função ficava presa até o limite da plataforma). Erro do banco ao gravar no
// Treino não é mais engolido: o aviso ainda vai ao principal e a resposta sai 500 (o MP manda de novo; as 2 pontas são
// idempotentes). Nenhum caminho de erro responde 200 (o "refresh do status" que cobria isso saiu na W6/W28).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { idDoAvisoValido, modoConfere, mpTransitorio } from "./regras.ts";
import { criarLog } from "../_shared/log.ts";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { ORCAMENTO_MS, TEMPO_MS, buscarComTempo, prazo, tempoEsgotado, type Prazo } from "../_shared/tempo.ts";

const log = criarLog("mp-webhook", { avisar: avisarErro });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_API = "https://api.mercadopago.com";
const TZ = "America/Sao_Paulo";
const _ALLOWED_SCHEMAS = ["public", "staging"];
const _CONTEXTOS = ["aluno", "plano_professor"];
const TOPICOS = ["payment", "subscription_preapproval", "preapproval", "subscription_authorized_payment"];

type Cred = "prod" | "test";
// hml-06: o schema onde o recurso vale é o da credencial que o achou
const SCHEMA: Record<Cred, string> = { prod: "public", test: "staging" };

/** hml-06: o MP não respondeu de um jeito que permita decidir — o aviso volta 500 e o MP manda de novo. */
class MpIndisponivel extends Error {
  status: number;
  constructor(status: number) {
    super(`mp_indisponivel_${status}`);
    this.status = status;
  }
}

function tokenDe(c: Cred): string {
  return Deno.env.get(c === "prod" ? "MP_ACCESS_TOKEN_PROD" : "MP_ACCESS_TOKEN_TEST") || "";
}

/** hml-14 (H-32, D4): nova ida ao MP só com isto sobrando no prazo do aviso (como o mpFetch do principal). */
const MINIMO_TENTATIVA_MS = 2_000;

// tenta com prod e depois test (ou só a credencial pedida) — o recurso só existe na credencial que o criou.
// 404/403 = não é desta credencial; MP fora (5xx, 429, 401, rede ou tempo esgotado) → MpIndisponivel.
// hml-14 (H-32, D4): cada ida espera no máximo min(8 s, o que falta do prazo); sem 2 s sobrando não dá para decidir → 599
async function buscarNoMp(caminho: string, p: Prazo, cred?: Cred): Promise<{ body: any; cred: Cred } | null> {
  let recusado = 0;
  for (const c of cred ? [cred] : (["prod", "test"] as Cred[])) {
    const tk = tokenDe(c);
    if (!tk) continue;
    if (p.restante() < MINIMO_TENTATIVA_MS) throw new MpIndisponivel(599);
    let status = 599; // rede ou tempo esgotado
    let body = null;
    try {
      const res = await buscarComTempo(`${MP_API}${caminho}`, { headers: { "Authorization": `Bearer ${tk}` } }, Math.min(TEMPO_MS.mp, p.restante()));
      status = res.status;
      body = await res.json().catch((e) => {
        if (tempoEsgotado(e)) throw e; // o tempo vale até ler o corpo: sem ele não dá para decidir
        return null;
      });
    } catch {
      status = 599;
    }
    if (status === 200 && body) {
      if (!modoConfere(c, body)) continue; // pagamento de produção lido pela credencial de teste: não vale no staging
      return { body, cred: c };
    }
    if (status === 401) recusado = status; // pode ser recurso da outra credencial: decide no fim
    else if (mpTransitorio(status)) throw new MpIndisponivel(status);
  }
  if (recusado) throw new MpIndisponivel(recusado);
  return null;
}

interface Ref { schema: string; userId: string; mesRef: string | null; contexto: string; tipoCobranca: string | null }
function parseRef(ref: string | null | undefined): Ref | null {
  if (!ref) return null;
  const parts = ref.split(":");
  if (parts.length < 2 || !_ALLOWED_SCHEMAS.includes(parts[0])) return null;
  const contexto = _CONTEXTOS.includes(parts[3] || "") ? parts[3] : "aluno";
  return { schema: parts[0], userId: parts[1], mesRef: parts[2] || null, contexto, tipoCobranca: parts[4] || (contexto === "aluno" ? "mensal" : null) };
}

function adminFor(schema: string) {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" } });
}

function mesRefFromDate(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const br = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
  return `${br.getFullYear()}-${String(br.getMonth() + 1).padStart(2, "0")}-01`;
}

function addDias(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
function addMes(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  const dia = x.getUTCDate();
  x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + 1);
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(dia, ultimo));
  return x.toISOString().slice(0, 10);
}

// ---- cobrança do PROFESSOR (pós-pago): efeito de um pagamento aprovado — MESMA lógica do mp-payments ----
// hml-14 (H-32): toda leitura e gravação confere o erro e lança (o aviso volta 500 e o MP manda de novo)
async function aplicarPagamentoPlano(admin: any, userId: string, tipoCobranca: string | null, dataAprov: Date) {
  const { data: p, error } = await admin.from("physiq_professores").select("ciclo_vence_em, plano_id, adesao_paga_em").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!p) return;
  const hoje = dataAprov.toLocaleDateString("en-CA", { timeZone: TZ });
  let valorMensal: number | null = null;
  if ((p as any).plano_id) {
    const { data: pl, error: plErr } = await admin.from("physiq_planos_professor").select("valor_mensal").eq("id", (p as any).plano_id).maybeSingle();
    if (plErr) throw plErr;
    valorMensal = (pl as any)?.valor_mensal ?? null;
  }
  let patch: Record<string, unknown> | null = null;
  if (tipoCobranca === "adesao") {
    patch = { adesao_paga_em: (p as any).adesao_paga_em ?? hoje, ciclo_inicio: hoje, ciclo_vence_em: addDias(hoje, 30), ciclo_valor: valorMensal, trial_ate: null };
  } else if (tipoCobranca === "mensal") {
    const vence = (p as any).ciclo_vence_em as string | null;
    const base = vence && vence > hoje ? vence : hoje;
    patch = { ciclo_inicio: base, ciclo_vence_em: addMes(base), ciclo_valor: valorMensal };
  } else if (tipoCobranca === "anual") {
    const x = new Date(`${hoje}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + 1);
    patch = { anual_ate: x.toISOString().slice(0, 10), adesao_paga_em: (p as any).adesao_paga_em ?? hoje, trial_ate: null };
  }
  if (!patch) return;
  const { error: upErr } = await admin.from("physiq_professores").update(patch).eq("id", userId);
  if (upErr) throw upErr;
}

// grava/atualiza o pagamento e, se acabou de ser APROVADO num contexto de plano, aplica o efeito (idempotente:
// só aplica na transição para approved — webhook e refresh do app podem chegar os dois)
async function gravarPagamento(admin: any, row: Record<string, unknown>, pay: any, contexto: string, tipoCobranca: string | null) {
  const { data: antes, error } = await admin.from("physiq_pagamentos").select("status").eq("mp_payment_id", String(pay.id)).maybeSingle();
  if (error) throw error;
  const { error: upErr } = await admin.from("physiq_pagamentos").upsert({
    ...row, mp_payment_id: String(pay.id), status: pay.status || "pending", contexto, tipo_cobranca: tipoCobranca,
    updated_at: new Date().toISOString(),
  }, { onConflict: "mp_payment_id" });
  if (upErr) throw upErr;
  if (contexto === "plano_professor" && pay.status === "approved" && (antes as any)?.status !== "approved") {
    await aplicarPagamentoPlano(admin, row.user_id as string, tipoCobranca, new Date(pay.date_approved || pay.date_created || Date.now()));
  }
}

// o que o aviso era: de quem (contexto) e de qual ambiente — decide o repasse ao principal (W6).
// hml-06: ignorar = referência de outro ambiente (pula os 2 repasses)
interface Alvo { contexto: string | null; schema: string | null; ignorar?: boolean }

async function handlePayment(paymentId: string, p: Prazo, cred?: Cred): Promise<Alvo> {
  const achado = await buscarNoMp(`/v1/payments/${encodeURIComponent(paymentId)}`, p, cred);
  if (!achado) return { contexto: null, schema: null };
  const pay = achado.body;
  const sch = SCHEMA[achado.cred];
  const ref = parseRef(pay.external_reference);
  if (ref && ref.schema !== sch) return { contexto: ref.contexto, schema: null, ignorar: true };
  const tipo = pay.payment_method_id === "pix" ? "pix" : "cartao";

  // pagamento avulso criado por nós (tem external_reference schema:user:mes[:contexto:tipo])
  if (ref?.mesRef) {
    const admin = adminFor(sch);
    await gravarPagamento(admin, { user_id: ref.userId, tipo, valor: Number(pay.transaction_amount), mes_ref: ref.mesRef }, pay, ref.contexto, ref.tipoCobranca);
    return { contexto: ref.contexto, schema: sch };
  }

  // pagamento gerado por assinatura: acha o dono pela preapproval
  const preapprovalId = pay.metadata?.preapproval_id || pay.point_of_interaction?.transaction_data?.subscription_id || null;
  return await upsertPagamentoAssinatura(preapprovalId, pay, ref, sch);
}

// hml-06: só no schema da credencial que achou o pagamento (antes, sem referência, varria os 2)
async function upsertPagamentoAssinatura(preapprovalId: string | null, pay: any, ref: Ref | null, sch: string): Promise<Alvo> {
  const admin = adminFor(sch);
  let userId = ref?.userId || null;
  let contexto = ref?.contexto || "aluno";
  if (preapprovalId) {
    const { data, error } = await admin.from("physiq_assinaturas").select("user_id, contexto").eq("mp_preapproval_id", String(preapprovalId)).maybeSingle();
    if (error) throw error;
    if (data) { userId = userId || (data as any).user_id; contexto = (data as any).contexto || contexto; }
  }
  if (!userId) return { contexto: ref?.contexto ?? null, schema: sch };
  await gravarPagamento(admin, {
    user_id: userId, tipo: "cartao", valor: Number(pay.transaction_amount),
    mes_ref: mesRefFromDate(pay.date_approved || pay.date_created),
  }, pay, contexto, "mensal");
  return { contexto, schema: sch };
}

async function handlePreapproval(preapprovalId: string, p: Prazo): Promise<Alvo> {
  const achado = await buscarNoMp(`/preapproval/${encodeURIComponent(preapprovalId)}`, p);
  if (!achado) return { contexto: null, schema: null };
  const pre = achado.body;
  const sch = SCHEMA[achado.cred];
  const ref = parseRef(pre.external_reference);
  if (ref && ref.schema !== sch) return { contexto: ref.contexto, schema: null, ignorar: true };
  const admin = adminFor(sch);
  const { data, error } = await admin.from("physiq_assinaturas").select("id, contexto").eq("mp_preapproval_id", String(pre.id)).maybeSingle();
  if (error) throw error;
  if (data) {
    const linha = data as { id: string; contexto: string | null };
    const { error: upErr } = await admin.from("physiq_assinaturas").update({ status: pre.status, updated_at: new Date().toISOString() }).eq("id", linha.id);
    if (upErr) throw upErr;
    return { contexto: linha.contexto || ref?.contexto || "aluno", schema: sch };
  }
  if (ref) {
    // 2 avisos ao mesmo tempo: o 2º bate no UNIQUE mp_preapproval_id → lança, o MP manda de novo e aí cai no update de cima
    const { error: insErr } = await admin.from("physiq_assinaturas").insert({
      user_id: ref.userId, mp_preapproval_id: String(pre.id), contexto: ref.contexto,
      status: pre.status || "pending", valor: Number(pre.auto_recurring?.transaction_amount || 0) || 1,
    });
    if (insErr) throw insErr;
    return { contexto: ref.contexto, schema: sch };
  }
  return { contexto: null, schema: sch };
}

async function handleAuthorizedPayment(authPaymentId: string, p: Prazo): Promise<Alvo> {
  const achado = await buscarNoMp(`/authorized_payments/${encodeURIComponent(authPaymentId)}`, p);
  if (!achado) return { contexto: null, schema: null };
  const ap = achado.body;
  const paymentId = ap.payment?.id;
  // o pagamento está na mesma credencial da cobrança autorizada
  if (paymentId) return await handlePayment(String(paymentId), p, achado.cred);
  if (ap.preapproval_id) {
    return await upsertPagamentoAssinatura(String(ap.preapproval_id), {
      id: `ap-${ap.id}`, transaction_amount: ap.transaction_amount,
      date_created: ap.date_created, status: ap.status === "processed" ? "approved" : "pending",
    }, null, SCHEMA[achado.cred]);
  }
  return { contexto: null, schema: SCHEMA[achado.cred] };
}

// ---- W6: repasse dos avisos de ALUNO para o banco principal ----
// W28: repasse dos avisos de PROFESSOR para a cobrança das contas (mp-webhook-conta do principal)
function repasseContaLigado(): boolean {
  return !!Deno.env.get("PRINCIPAL_WEBHOOK_CONTA_URL");
}

function repasseLigado(schema: string | null): boolean {
  if (!Deno.env.get("PRINCIPAL_WEBHOOK_URL")) return false;
  const ligados = (Deno.env.get("PRINCIPAL_WEBHOOK_SCHEMAS") || "staging,public").split(",").map((x) => x.trim()).filter(Boolean);
  // sem saber o ambiente (aviso sem referência que o Treino não reconheceu), só repassa com a produção ligada
  return ligados.includes(schema || "public");
}

/** hml-10 (H-24): da resposta do principal ({ ok, resultado } ou { erro }), só os códigos — o texto nunca vai para o log. */
function codigosDaResposta(txt: string): { resultado: unknown; erro: unknown } {
  try {
    const c = JSON.parse(txt) as Record<string, unknown> | null;
    return { resultado: c?.resultado, erro: c?.erro ?? c?.error ?? c?.resultado };
  } catch {
    return { resultado: null, erro: null };
  }
}

async function repassar(topic: string, id: string, schema: string | null, destino = "PRINCIPAL_WEBHOOK_URL"): Promise<boolean> {
  const base = Deno.env.get(destino)!;
  const url = `${base}${base.includes("?") ? "&" : "?"}origem=treino${schema ? `&schema=${schema}` : ""}`;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: topic, data: { id } }), signal: ctrl.signal });
      clearTimeout(t);
      const resposta = codigosDaResposta(await res.text());
      if (res.ok) {
        log.info({ codigo: "repasse_ok", schema, acao: topic, ref: id, status: res.status, resultado: resposta.resultado });
        return true;
      }
      log.erro({ codigo: "repasse_respondeu", schema, acao: topic, ref: id, status: res.status, externo: { principal_erro: resposta.erro } });
    } catch (e) {
      log.excecao(e, { codigo: "repasse_falhou", schema, acao: topic, ref: id });
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  const p = prazo(ORCAMENTO_MS.servidor); // hml-14 (H-32, D3): quem espera é o MP — um prazo para o aviso inteiro
  // hml-10 (D6): o que o catch final sabe do aviso (o tópico e, depois de achar o recurso, o ambiente)
  let topico: string | null = null;
  let schemaDoAviso: string | null = null;
  try {
    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* IPN via query */ }
    const topic = String(body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    topico = topic;
    const id = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (!id) return new Response("ok", { status: 200 });
    if (!TOPICOS.includes(topic)) return new Response("ok", { status: 200 }); // outros tópicos: ignora silenciosamente
    // hml-06 (H-19): o id vai no caminho da API do MP — fora do formato que o MP manda, nem chega a ele
    if (!idDoAvisoValido(topic, id)) return new Response("id_invalido", { status: 200 });

    let alvo: Alvo = { contexto: null, schema: null };
    let gravouNoTreino = true;
    try {
      if (topic === "payment") alvo = await handlePayment(id, p);
      else if (topic === "subscription_preapproval" || topic === "preapproval") alvo = await handlePreapproval(id, p);
      else alvo = await handleAuthorizedPayment(id, p);
    } catch (e) {
      // hml-06: o MP fora → 500 (o MP manda de novo; antes o aviso seguia sem o recurso e se perdia)
      if (e instanceof MpIndisponivel) {
        log.erro({ codigo: "mp_indisponivel", acao: topic, status: e.status });
        return new Response("mp_indisponivel", { status: 500 });
      }
      // o Treino não gravou: o principal ainda recebe o aviso abaixo e, no fim, a resposta sai 500 — hml-14 (H-32): antes era
      // 200 e o MP não mandava de novo (o "refresh da tela antiga" que cobria isso saiu na W6/W28)
      log.excecao(e, { codigo: "gravar_falhou", acao: topic });
      gravouNoTreino = false;
    }
    schemaDoAviso = alvo.schema;
    // hml-06 (H-19): referência de outro ambiente (sandbox com "public:", produção com "staging:") não grava nem repassa
    if (alvo.ignorar) return new Response("outro_ambiente", { status: 200 });

    // W6: aviso de aluno (ou de dono desconhecido) vai também para o principal; sem sucesso → 500 (o MP manda de novo)
    if (alvo.contexto !== "plano_professor" && repasseLigado(alvo.schema)) {
      const ok = await repassar(String(topic), String(id), alvo.schema);
      if (!ok) return new Response("repasse_falhou", { status: 500 });
    }
    // W28: aviso de professor vai para a cobrança das contas (o principal só aplica se a conta já está no núcleo)
    if (alvo.contexto === "plano_professor" && alvo.schema && repasseContaLigado()) {
      const ok = await repassar(String(topic), String(id), alvo.schema, "PRINCIPAL_WEBHOOK_CONTA_URL");
      if (!ok) return new Response("repasse_falhou", { status: 500 });
    }
    if (!gravouNoTreino) return new Response("gravar_falhou", { status: 500 });
    return new Response("ok", { status: 200 });
  } catch (e) {
    log.excecao(e, { acao: topico, schema: schemaDoAviso });
    // hml-14 (H-32): 500 — o MP manda de novo (antes era 200 "pra não gerar tempestade de retries; o refresh do status cobre",
    // mas esse refresh saiu na W6/W28 e o aviso se perdia; o MP desiste sozinho depois de algumas tentativas)
    return new Response("erro", { status: 500 });
  }
});
