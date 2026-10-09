// Physiq W6 — mp-webhook-aluno (banco principal): avisos do Mercado Pago das cobranças de ALUNO (spec §6.6 e §9). Chega de
// 2 lugares, sempre sem JWT (verify_jwt = false):
//   · a notification_url que a pagamentos-aluno põe em cada cobrança nova: …/mp-webhook-aluno?schema=<public|staging>
//   · o repasse do mp-webhook antigo do Banco do Treino (?origem=treino): os pagamentos e as assinaturas que o Calc criou antes
//     da W6 continuam avisando a URL antiga — o webhook de lá aplica no Treino como sempre e repassa para cá (nenhum aviso se
//     perde na virada).
// O aviso só diz "olhe este recurso": a função SEMPRE busca de novo na API do MP (produção só vale no public; teste só no
// staging — um pagamento de sandbox nunca vale para um aluno de verdade) e só trata o que é de aluno (referência nova
// physiq:<schema>:aluno:…, a antiga do Calc <schema>:<user>…:aluno, ou a assinatura guardada em aluno_assinaturas).
// Idempotente: mp_payment_id único + a cobrança vira "paga" uma vez só (a cobertura da mensalidade é refeita pelo gatilho).
// Tópicos: payment · subscription_preapproval (preapproval) · subscription_authorized_payment. Responde 200 no que tratou ou
// ignorou; erro de banco/rede ou o MP fora (hml-06: buscarNoMp) → 500 (o MP — ou o repasse do Treino — manda de novo; o
// tratamento é idempotente).
// W7b (aluno sem profissional): cobrança recorrente que chega para uma matrícula da conta do app JÁ ENCERRADA (o aluno entrou na
// lista de um profissional e o cancelamento no MP falhou na hora) → grava o pagamento (é dele) e cancela a assinatura do app.
// Publicar SÓ ASSIM: scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook-aluno false
// Segredos: MP_ACCESS_TOKEN_PROD, MP_ACCESS_TOKEN_TEST (+ os automáticos).
// hml-10 (H-24, H-26): log em JSON pelo _shared/log.ts (ids técnicos e códigos, nada do corpo do MP); o catch final avisa
// (log.excecao) e devolve o mesmo 500.
// hml-14 (H-32): um prazo por aviso (ORCAMENTO_MS.servidor) em toda ida ao MP; a leitura que acha a matrícula, a assinatura ou a
// cobrança lança no erro do banco (antes virava "não tem": 200 e o aviso se perdia, ou o crédito ia para outra matrícula).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { avisarErro } from "../_shared/avisar-erro.ts";
import { criarLog } from "../_shared/log.ts";
import { preapprovalDoPagamento, type AssinaturaMp, type PagamentoMp } from "../_shared/cobranca-regras.ts";
import { buscarNoMp, credencialDoSchema } from "../_shared/cobranca-mp.ts";
import { cancelarAssinaturasDasMatriculas, matriculaEncerradaPeloVinculo } from "../_shared/app-sem-profissional.ts";
import { lerReferenciaAluno, lerReferenciaCalc, type Schema } from "../_shared/financeiro-regras.ts";
import {
  COLUNAS_COBRANCA,
  aplicarPagamentoMp,
  carregarMatricula,
  espelhoAssinaturaAluno,
  registrarPagamentoAvulsoDoMp,
  type Cobranca,
  type Matricula,
} from "../_shared/financeiro-mp.ts";
import { ORCAMENTO_MS, prazo, type Prazo } from "../_shared/tempo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMAS: Schema[] = ["public", "staging"];
const log = criarLog("mp-webhook-aluno", { avisar: avisarErro });

const ok = (resultado: string) => new Response(JSON.stringify({ ok: true, resultado }), { status: 200, headers: { "Content-Type": "application/json" } });

function dbDe(schema: Schema): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: schema as "public" }, auth: { persistSession: false } });
}

/** A matrícula do aluno do Calc pelo id do Treino (a ativa primeiro). */
async function matriculaDoTreino(db: SupabaseClient, treinoUserId: string): Promise<Matricula | null> {
  const { data, error } = await db.from("pacientes").select("id").eq("treino_user_id", treinoUserId).is("deleted_at", null)
    .order("ativo", { ascending: false }).order("created_at").limit(1);
  if (error) throw error;
  const id = ((data ?? []) as Array<{ id: string }>)[0]?.id;
  return id ? await carregarMatricula(db, id) : null;
}

async function assinaturaPorPreapproval(db: SupabaseClient, preId: string) {
  const { data, error } = await db.from("aluno_assinaturas").select("id, paciente_id, conta_id, mp_preapproval_id, status, payload")
    .eq("mp_preapproval_id", preId).maybeSingle();
  // hml-14 (H-32): a assinatura não lida virava "não tem" e o pagamento caía na matrícula ativa mais nova (matriculaDoTreino)
  if (error) throw error;
  return (data as { id: string; paciente_id: string; conta_id: string | null; mp_preapproval_id: string; status: string; payload: Record<string, unknown> | null } | null) ?? null;
}

/**
 * W7b: a assinatura é de uma matrícula do app que já encerrou (o aluno foi para um profissional) → cancela no MP.
 * W19: só a encerrada PELO VÍNCULO (app_encerrada_em); a desativada à mão segue com a assinatura.
 * hml-14 (H-32): o erro do banco (e o MP que não deixa decidir) LANÇA — antes este catch engolia, o aviso respondia 200 e a
 * assinatura do app seguia viva. Agora o aviso volta 500 e o MP manda de novo: o pagamento já gravado não se repete
 * (mp_payment_id único; "paga" é final; o sino só na virada para paga) e cancelar de novo não muda o que já foi cancelado.
 */
async function cancelarSeSaiuDoApp(db: SupabaseClient, schema: Schema, m: Matricula, preId: string | null, p: Prazo): Promise<void> {
  if (!preId || m.conta?.origem !== "app" || m.ativo) return;
  if (!(await matriculaEncerradaPeloVinculo(db, m.id))) {
    // matrícula do app inativa sem o vínculo (desativada à mão): a assinatura fica
    log.info({ codigo: "app_desativado_a_mao", schema, ref: m.id, resultado: "assinatura_mantida" });
    return;
  }
  const r = await cancelarAssinaturasDasMatriculas(db, credencialDoSchema(schema), [m.id], "cobranca_depois_de_sair_do_app", log, { prazo: p });
  log.info({ codigo: "assinatura_do_app_encerrado", schema, ref: m.id, n: r.canceladas, resultado: r.falhas ? `falhas_${r.falhas}` : "sem_falhas" });
}

async function tratarPagamento(id: string, schemaPedido: Schema | null, p: Prazo): Promise<string> {
  const achado = await buscarNoMp<PagamentoMp>(`/v1/payments/${encodeURIComponent(id)}`, schemaPedido, { prazo: p });
  if (!achado?.recurso?.id) return "pagamento_nao_encontrado";
  const pay = achado.recurso;
  const schema = achado.schema;
  const db = dbDe(schema);

  // 1) cobrança nova (pagamentos-aluno): a referência traz a matrícula e a cobrança
  const ref = lerReferenciaAluno(pay.external_reference);
  if (ref) {
    if (ref.schema !== schema) return "outro_ambiente";
    if (ref.cobrancaId) {
      const { data, error } = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("id", ref.cobrancaId).eq("paciente_id", ref.pacienteId).maybeSingle();
      if (error) throw error;
      let c = data as unknown as Cobranca | null;
      if (!c) return "cobranca_inexistente";
      if (!c.mp_payment_id) {
        const { error } = await db.from("cobrancas").update({ mp_payment_id: String(pay.id) }).eq("id", c.id).is("mp_payment_id", null);
        if (error) throw error; // hml-06: erro de banco → 500 e o MP manda de novo (antes seguia como se tivesse gravado)
        const relida = await db.from("cobrancas").select(COLUNAS_COBRANCA).eq("id", c.id).maybeSingle();
        if (relida.error) throw relida.error;
        c = (relida.data as unknown as Cobranca | null) ?? c;
      }
      if (c.mp_payment_id !== String(pay.id)) return "cobranca_de_outro_pagamento";
      const r = await aplicarPagamentoMp(db, c, pay, null, log, schema);
      return `cobranca_${r.status}${r.pagou ? "_paga" : ""}`;
    }
    // recorrente (cobrança da assinatura nova)
    const m = await carregarMatricula(db, ref.pacienteId);
    if (!m) return "matricula_inexistente";
    const r = await registrarPagamentoAvulsoDoMp(db, m, pay, { preapprovalId: preapprovalDoPagamento(pay), origem: "assinatura" }, log, schema);
    await cancelarSeSaiuDoApp(db, schema, m, preapprovalDoPagamento(pay), p);
    return r ? `recorrente_${r.status}` : "recorrente_sem_valor";
  }

  // 2) o que o Calc criou antes da W6 (repassado pelo mp-webhook do Treino): <schema>:<user do Treino>[:<mês>[:aluno[:tipo]]]
  const calc = lerReferenciaCalc(pay.external_reference);
  if (calc && calc.contexto === "plano_professor") return "plano_do_professor"; // W28
  if (calc && calc.schema !== schema) return "outro_ambiente";
  const preId = preapprovalDoPagamento(pay);
  if (preId) {
    const a = await assinaturaPorPreapproval(db, preId);
    const m = a ? await carregarMatricula(db, a.paciente_id) : calc ? await matriculaDoTreino(db, calc.treinoUserId) : null;
    if (!m) return a ? "matricula_inexistente" : "assinatura_inexistente";
    const r = await registrarPagamentoAvulsoDoMp(db, m, pay, { preapprovalId: preId, origem: calc ? "assinatura_calc" : "assinatura" }, log, schema);
    await cancelarSeSaiuDoApp(db, schema, m, preId, p);
    return r ? `assinatura_${r.status}` : "assinatura_sem_valor";
  }
  if (calc) {
    const m = await matriculaDoTreino(db, calc.treinoUserId);
    if (!m) return "aluno_sem_matricula";
    const r = await registrarPagamentoAvulsoDoMp(db, m, pay, { origem: "webhook_calc", mesRef: calc.mesRef }, log, schema);
    return r ? `calc_${r.status}` : "calc_sem_valor";
  }
  return "nao_e_de_aluno";
}

async function tratarAssinatura(id: string, schemaPedido: Schema | null, p: Prazo): Promise<string> {
  const achado = await buscarNoMp<AssinaturaMp>(`/preapproval/${encodeURIComponent(id)}`, schemaPedido, { prazo: p });
  if (!achado?.recurso?.id) return "assinatura_nao_encontrada";
  const pre = achado.recurso;
  const db = dbDe(achado.schema);
  const a = await assinaturaPorPreapproval(db, String(pre.id));
  if (a) {
    if (a.payload?.simulada === true) return "assinatura_simulada";
    const { error } = await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}) })).eq("id", a.id);
    if (error) throw error;
    return `assinatura_${pre.status}`;
  }
  const ref = lerReferenciaAluno(pre.external_reference);
  if (ref && ref.schema === achado.schema && ref.tipo === "recorrente") {
    const m = await carregarMatricula(db, ref.pacienteId);
    if (!m) return "matricula_inexistente";
    const { error } = await db.from("aluno_assinaturas").insert({ paciente_id: m.id, conta_id: m.conta_id, ...espelhoAssinaturaAluno(pre) });
    if (error) throw error;
    return `assinatura_${pre.status}_gravada`;
  }
  const calc = lerReferenciaCalc(pre.external_reference);
  if (calc && calc.contexto === "aluno" && calc.schema === achado.schema) {
    // assinatura antiga do Calc que o script 02 não viu (criada depois dele): grava pela matrícula do aluno do Treino
    const m = await matriculaDoTreino(db, calc.treinoUserId);
    if (!m) return "aluno_sem_matricula";
    const { error } = await db.from("aluno_assinaturas").insert({ paciente_id: m.id, conta_id: m.conta_id, ...espelhoAssinaturaAluno(pre, { origem: "calc" }) });
    if (error) throw error;
    return `assinatura_calc_${pre.status}_gravada`;
  }
  return "nao_e_de_aluno";
}

async function tratarCobrancaAutorizada(id: string, schema: Schema | null, p: Prazo): Promise<string> {
  const achado = await buscarNoMp<{ payment?: { id?: number | string | null } | null }>(`/authorized_payments/${encodeURIComponent(id)}`, schema, { prazo: p });
  if (!achado?.recurso) return "cobranca_nao_encontrada";
  const pagamento = achado.recurso.payment?.id;
  if (pagamento === null || pagamento === undefined) return "cobranca_sem_pagamento_ainda";
  return await tratarPagamento(String(pagamento), achado.schema, p);
}

Deno.serve(async (req) => {
  const p = prazo(ORCAMENTO_MS.servidor); // hml-14 (H-32): o prazo do aviso inteiro (todas as idas ao MP)
  if (req.method !== "POST") return ok("ignorado_metodo");
  // hml-10: o que o catch final leva ao log (o ambiente pedido e o tópico do aviso, quando já se sabe)
  let schema: Schema | null = null;
  let topico = "";
  try {
    const url = new URL(req.url);
    const bruto = (url.searchParams.get("schema") || "").toLowerCase();
    schema = SCHEMAS.includes(bruto as Schema) ? (bruto as Schema) : null;
    if (bruto && !schema) return ok("schema_invalido");
    const origem = url.searchParams.get("origem") === "treino" ? "treino" : "mp";
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
    if (topico === "payment") resultado = await tratarPagamento(id, schema, p);
    else if (topico === "subscription_preapproval" || topico === "preapproval") resultado = await tratarAssinatura(id, schema, p);
    else if (topico === "subscription_authorized_payment" || topico === "authorized_payment") resultado = await tratarCobrancaAutorizada(id, schema, p);
    log.info({ codigo: origem === "treino" ? "aviso_mp_do_treino" : "aviso_mp", schema, acao: topico || null, ref: id, resultado });
    return ok(resultado);
  } catch (e) {
    log.excecao(e, { acao: topico || null, schema });
    return new Response(JSON.stringify({ ok: false, resultado: "erro" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
