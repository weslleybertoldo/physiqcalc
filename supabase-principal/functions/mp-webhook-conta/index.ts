// Physiq W4 — mp-webhook-conta (banco principal): avisos do Mercado Pago das cobranças das CONTAS (spec §6.6). O MP chama
// sem JWT (verify_jwt = false) a notification_url que a cobranca-conta põe em cada cobrança:
//   https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/mp-webhook-conta?schema=<public|staging>
// O aviso só diz "olhe este recurso": a função SEMPRE busca de novo na API do MP com a credencial do ambiente (produção só
// com a de produção; staging só com a de teste — um pagamento de sandbox nunca vale para uma conta de verdade) e só trata
// o que é das contas do Physiq (external_reference physiq:<schema>:conta:…, ou a assinatura guardada em conta_assinaturas).
// Idempotente: mp_payment_id único + aplicar_pagamento_conta uma vez só por fatura (spec 6.6, Nativo OS W30).
// Tópicos: payment · subscription_preapproval (preapproval) · subscription_authorized_payment. Responde 200 no que tratou ou
// ignorou (recurso que não existe nesta credencial também); hml-06 (H-19): erro de banco/rede ou o MP fora → 500, e o MP
// manda o aviso de novo (antes era 200 "erro" e o aviso se perdia; as pontas são idempotentes).
// W28 (virada): recebe também o REPASSE dos webhooks antigos — o mp-webhook do Banco do Treino (cobranças de professor do
// Calc, ?origem=treino) e o mp-webhook do Nutri (assinaturas e Pix das nutris, ?origem=nutri). Referências antigas
// (lerReferenciaLegada) caem na conta legada do dono, SÓ se ela já está no núcleo (cobranca_legada = false); antes disso o app
// antigo é quem aplica e aqui nada muda. Mesma idempotência (mp_payment_id único; aplicar uma vez por fatura).
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook-conta false
// Segredos: MP_ACCESS_TOKEN_PROD, MP_ACCESS_TOKEN_TEST (+ os automáticos).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts; o catch final avisa (log.excecao) e devolve o mesmo 500.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import {
  faturaDaReferenciaLegada,
  lerReferencia,
  lerReferenciaLegada,
  preapprovalDoPagamento,
  type AssinaturaMp,
  type PagamentoMp,
  type ReferenciaLegada,
} from "../_shared/cobranca-regras.ts";
import {
  COLUNAS_ASSINATURA,
  COLUNAS_FATURA,
  aplicarStatus,
  buscarNoMp,
  credencialDoSchema,
  espelhoAssinatura,
  registrarCobrancaRecorrente,
  tokenMp,
  type AssinaturaConta,
  type Fatura,
  type Schema,
} from "../_shared/cobranca-mp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS: Schema[] = ["public", "staging"];
const log = criarLog("mp-webhook-conta", { avisar: avisarErro });

const ok = (resultado: string) => new Response(JSON.stringify({ ok: true, resultado }), { status: 200, headers: { "Content-Type": "application/json" } });

function dbDe(schema: Schema): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
}

/** Preço mensal atual da assinatura (quando o MP não traz o valor da cobrança). */
async function valorMensal(db: SupabaseClient, a: AssinaturaConta): Promise<number | null> {
  const { data } = await db.from("contas").select("plano, faixa").eq("id", a.conta_id).maybeSingle();
  const c = data as { plano: string; faixa: string } | null;
  if (!c) return a.valor;
  const { data: v } = await db.rpc("conta_preco", { p_conta: a.conta_id, p_plano: a.plano ?? c.plano, p_faixa: a.faixa ?? c.faixa, p_meses: 1 });
  return v === null || v === undefined ? a.valor : Number(v);
}

interface ContaLegada { id: string; plano: string; faixa: string; cobranca_legada: boolean }

/** W28: a conta legada do dono de uma referência antiga (Calc: pelo usuário do Treino; Nutri: pelo dono). */
async function contaDaReferenciaLegada(db: SupabaseClient, r: ReferenciaLegada): Promise<ContaLegada | null> {
  if (r.app === "nutri") {
    const { data } = await db.from("contas").select("id, plano, faixa, cobranca_legada").eq("dono_id", r.userId)
      .eq("origem", "legado_nutri").order("criado_em").limit(1);
    return ((data ?? []) as ContaLegada[])[0] ?? null;
  }
  const { data } = await db.from("conta_membros").select("conta_id, contas!inner(id, plano, faixa, cobranca_legada, origem)")
    .eq("treino_user_id", r.userId).contains("papeis", ["dono"]).eq("contas.origem", "legado_calc").limit(1);
  const linha = ((data ?? []) as Array<{ contas: ContaLegada | null }>)[0];
  return linha?.contas ?? null;
}

/** W28: pagamento avulso que um app antigo criou (Pix/cartão do professor do Calc; Pix de 30 dias da nutri). */
async function tratarPagamentoLegado(db: SupabaseClient, r: ReferenciaLegada, pay: PagamentoMp): Promise<string> {
  const conta = await contaDaReferenciaLegada(db, r);
  if (!conta) return `legado_${r.app}_sem_conta`;
  if (conta.cobranca_legada) return `legado_${r.app}_cobranca_antiga`;
  const mpId = String(pay.id);
  let { data } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("mp_payment_id", mpId).maybeSingle();
  if (!data) {
    const f = faturaDaReferenciaLegada(r);
    const { error } = await db.from("conta_faturas").insert({
      conta_id: conta.id, tipo: f.tipo, valor: Math.max(0, Number(pay.transaction_amount) || 0), status: "pending",
      forma: pay.payment_method_id === "pix" ? "pix" : "cartao", mp_payment_id: mpId, plano: conta.plano, faixa: conta.faixa,
      meses: f.meses, descricao: r.app === "calc" ? "Pagamento do PhysiqCalc antigo — aplicado no Physiq" : "Pix do PhysiqNutri antigo — aplicado no Physiq",
      origem: `legado_${r.app}`, pix_expira_em: pay.date_of_expiration ?? null,
    });
    if (error && !String(error.message || "").includes("duplicate")) throw error;
    data = (await db.from("conta_faturas").select(COLUNAS_FATURA).eq("mp_payment_id", mpId).maybeSingle()).data;
  }
  const fatura = data as Fatura | null;
  if (!fatura) return `legado_${r.app}_sem_fatura`;
  if (fatura.conta_id !== conta.id) return "fatura_de_outra_conta";
  const res = await aplicarStatus(db, fatura, pay);
  return `legado_${r.app}_${res.status}${res.aplicou ? "_aplicada" : ""}`;
}

async function tratarPagamento(schema: Schema, id: string): Promise<string> {
  // hml-06: só a credencial do ambiente; o MP fora lança (500) em vez de "não encontrado" (200)
  const pay = (await buscarNoMp<PagamentoMp>(`/v1/payments/${encodeURIComponent(id)}`, schema))?.recurso;
  if (!pay?.id) return "pagamento_nao_encontrado";
  const ref = lerReferencia(pay.external_reference);
  if (ref && ref.schema !== schema) return "outro_ambiente";
  const legada = ref ? null : lerReferenciaLegada(pay.external_reference);
  if (legada && legada.schema !== schema) return "outro_ambiente";
  const db = dbDe(schema);

  // cobrança avulsa (Pix ou cartão à vista): a referência traz a fatura
  if (ref?.faturaId) {
    const { data } = await db.from("conta_faturas").select(COLUNAS_FATURA).eq("id", ref.faturaId).eq("conta_id", ref.contaId).maybeSingle();
    let f = data as Fatura | null;
    if (!f) return "fatura_inexistente";
    if (!f.mp_payment_id) {
      const { error } = await db.from("conta_faturas").update({ mp_payment_id: String(pay.id) }).eq("id", f.id).is("mp_payment_id", null);
      if (error) throw error;
      f = ((await db.from("conta_faturas").select(COLUNAS_FATURA).eq("id", f.id).maybeSingle()).data as Fatura | null) ?? f;
    }
    if (f.mp_payment_id !== String(pay.id)) return "fatura_de_outro_pagamento";
    const r = await aplicarStatus(db, f, pay);
    return `fatura_${r.status}${r.aplicou ? "_aplicada" : ""}`;
  }

  // cobrança mensal da assinatura: acha a conta pela assinatura
  const preId = preapprovalDoPagamento(pay);
  let assinatura: AssinaturaConta | null = null;
  if (preId) {
    const { data } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("mp_preapproval_id", preId).maybeSingle();
    assinatura = (data as AssinaturaConta | null) ?? null;
  }
  if (!assinatura && ref?.tipo === "recorrente") {
    const { data } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("conta_id", ref.contaId).maybeSingle();
    assinatura = (data as AssinaturaConta | null) ?? null;
  }
  // W28: pagamento avulso de um app antigo (sem assinatura migrada por trás)
  if (!assinatura && legada && legada.tipo !== "recorrente") return await tratarPagamentoLegado(db, legada, pay);
  if (!assinatura) return ref ? "assinatura_inexistente" : legada ? `legado_${legada.app}_assinatura_inexistente` : "nao_e_do_physiq";
  if (legada) {
    const { data: c } = await db.from("contas").select("cobranca_legada").eq("id", assinatura.conta_id).maybeSingle();
    if ((c as { cobranca_legada?: boolean } | null)?.cobranca_legada) return `legado_${legada.app}_cobranca_antiga`;
  }
  const r = await registrarCobrancaRecorrente(db, assinatura, pay, await valorMensal(db, assinatura));
  return r ? `recorrente_${r.status}${r.aplicou ? "_aplicada" : ""}` : "recorrente_sem_id";
}

async function tratarAssinatura(schema: Schema, id: string): Promise<string> {
  const pre = (await buscarNoMp<AssinaturaMp>(`/preapproval/${encodeURIComponent(id)}`, schema))?.recurso;
  if (!pre?.id) return "assinatura_nao_encontrada";
  const ref = lerReferencia(pre.external_reference);
  if (ref && ref.schema !== schema) return "outro_ambiente";
  const legada = ref ? null : lerReferenciaLegada(pre.external_reference);
  if (legada && legada.schema !== schema) return "outro_ambiente";
  const db = dbDe(schema);
  const { data } = await db.from("conta_assinaturas").select(COLUNAS_ASSINATURA).eq("mp_preapproval_id", String(pre.id)).maybeSingle();
  const a = data as AssinaturaConta | null;
  if (!a && legada) {
    // W28: assinatura de um app antigo que a virada não trouxe (criada lá depois do 03): liga à conta legada já no núcleo
    const conta = await contaDaReferenciaLegada(db, legada);
    if (!conta) return `legado_${legada.app}_sem_conta`;
    if (conta.cobranca_legada) return `legado_${legada.app}_cobranca_antiga`;
    const { data: atual } = await db.from("conta_assinaturas").select("id, mp_preapproval_id, status").eq("conta_id", conta.id).maybeSingle();
    const linhaAtual = atual as { id: string; mp_preapproval_id: string | null; status: string } | null;
    if (linhaAtual?.mp_preapproval_id && linhaAtual.mp_preapproval_id !== String(pre.id) && linhaAtual.status !== "cancelled") return "assinatura_antiga";
    const { error } = await db.from("conta_assinaturas").upsert({ conta_id: conta.id, plano: conta.plano, faixa: conta.faixa,
      ...espelhoAssinatura(pre, { origem: `legado_${legada.app}` }) }, { onConflict: "conta_id" });
    if (error) throw error;
    return `legado_${legada.app}_assinatura_${pre.status}`;
  }
  if (a) {
    if (a.payload?.simulada === true) return "assinatura_simulada";
    const { error } = await db.from("conta_assinaturas").update(espelhoAssinatura(pre, { ...(a.payload ?? {}) })).eq("id", a.id);
    if (error) throw error;
    return `assinatura_${pre.status}`;
  }
  if (!ref || ref.tipo !== "recorrente") return "nao_e_do_physiq";
  // o aviso chegou antes de a cobranca-conta gravar a linha: grava pela conta da referência (1 assinatura por conta)
  const { data: atual } = await db.from("conta_assinaturas").select("id, mp_preapproval_id").eq("conta_id", ref.contaId).maybeSingle();
  const linhaAtual = atual as { id: string; mp_preapproval_id: string | null } | null;
  if (linhaAtual?.mp_preapproval_id && linhaAtual.mp_preapproval_id !== String(pre.id)) return "assinatura_antiga";
  const { error } = await db.from("conta_assinaturas").upsert({ conta_id: ref.contaId, ...espelhoAssinatura(pre) }, { onConflict: "conta_id" });
  if (error) throw error;
  return `assinatura_${pre.status}_gravada`;
}

async function tratarCobrancaAutorizada(schema: Schema, id: string): Promise<string> {
  const ap = (await buscarNoMp<{ payment?: { id?: number | string | null } | null }>(`/authorized_payments/${encodeURIComponent(id)}`, schema))?.recurso;
  if (!ap) return "cobranca_nao_encontrada";
  const pagamento = ap.payment?.id;
  if (pagamento === null || pagamento === undefined) return "cobranca_sem_pagamento_ainda";
  return await tratarPagamento(schema, String(pagamento));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok("ignorado_metodo");
  // hml-10: o que o catch final leva ao log (o ambiente e o tópico do aviso, quando já se sabe)
  let schemaDoLog: Schema | null = null;
  let topico = "";
  try {
    const url = new URL(req.url);
    const schema = (url.searchParams.get("schema") || "public").toLowerCase() as Schema;
    if (!SCHEMAS.includes(schema)) return ok("schema_invalido");
    schemaDoLog = schema;
    if (!tokenMp(credencialDoSchema(schema))) return ok("mp_nao_configurado");
    let corpo: Record<string, unknown> = {};
    try {
      corpo = (await req.json()) as Record<string, unknown>;
    } catch {
      corpo = {}; // IPN antigo: tudo na query
    }
    const dados = (corpo.data ?? {}) as Record<string, unknown>;
    topico = String(corpo.type || corpo.topic || url.searchParams.get("type") || url.searchParams.get("topic") || "");
    const id = String(dados.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return ok("sem_id");
    let resultado = "topico_ignorado";
    if (topico === "payment") resultado = await tratarPagamento(schema, id);
    else if (topico === "subscription_preapproval" || topico === "preapproval") resultado = await tratarAssinatura(schema, id);
    else if (topico === "subscription_authorized_payment" || topico === "authorized_payment") resultado = await tratarCobrancaAutorizada(schema, id);
    log.info({ codigo: "aviso_mp", schema, acao: topico || null, ref: id, resultado });
    return ok(resultado);
  } catch (e) {
    // hml-06: 500 → o MP (ou o repasse do Treino/Nutri) manda o aviso de novo; antes era 200 e o aviso se perdia
    log.excecao(e, { acao: topico || null, schema: schemaDoLog });
    return new Response(JSON.stringify({ ok: false, resultado: "erro" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
