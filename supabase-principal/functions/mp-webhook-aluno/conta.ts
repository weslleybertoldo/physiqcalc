// supabase-principal/functions/mp-webhook-aluno/conta.ts
// Physiq W2 — o aviso do Mercado Pago NA CONTA do personal: a parte da mp-webhook-aluno que a W2 acrescenta (a index.ts chama). Chega de 2
// jeitos:
//   · a notification_url que a pagamentos-aluno põe em cada Pix/cartão/automática da conta (mp-conta-regras.ts › notificacaoDaConta):
//     …/mp-webhook-aluno?schema=<public|staging>&conta=<uuid>  → tratarDaConta;
//   · a URL do PAINEL do MP (sem conta: o mp-connect e, talvez, a cobrança de cada mês da automática — revisão I1, MENOR 5) com o user_id de
//     uma integração conhecida que NÃO é a conta do Physiq → pelaContaDoUserId → o mesmo tratarDaConta.
// O aviso nunca é a verdade (como o caminho de hoje): o recurso é buscado com o token DA CONTA, SEM renovar (MENOR 34: o MP espera 22 s —
// o 401 vira 500 e o job mp-contas-renovar renova); vale só se o collector_id é o da integração, o live_mode é o do schema (buscarNaConta)
// e a referência é de um aluno DESSA conta. Idempotente (mp_payment_id único; "paga" é final) e SEM cache de "repetido" (revisão I4: o
// payment.created e o payment.updated do MESMO id chegam em segundos). O user_id do aviso só vai ao log (quem decide é o collector_id).
// Respostas: 200 no que tratou ou ignorou de verdade; 500 no que não dá para decidir (o MP manda de novo): MP fora, conta em erro ou sem
// acesso, schema sem a W2 (MENOR 4 da W1), sem a MP_TOKENS_CHAVE (lança: o catch final da index.ts avisa o Weslley); 429 nos tetos; 401 só
// com a assinatura exigida (app_config.mp_webhook.exigir_assinatura — a Task 23 liga depois de ver as notificações de verdade assinadas;
// até lá a x-signature só vai ao log: valida | invalida | ausente). Exigida, ela amarra o id tratado (o data.id assinado da busca = o do
// aviso) e o ts (até 5 min) — revisão M-1.
// Tetos (I6 da W1, MENORES 6 e 26): por conta, 60/min, só DEPOIS de achada a integração (uuid inventado não entra); por IP, 120/min, só no
// aviso SEM user_id (a index.ts — os avisos de TODOS os personais saem de poucos IPs do MP). Maps separados, cada um com o seu limite.
// Sem import de URL (só tipo) e sem o global Deno no topo: o Vitest importa (src/financeiro/mpContaAviso.test.ts); o log vem de quem chama.
// Nunca no log: token, segredo, corpo do MP (só ids técnicos, o tópico, os resultados e o resultado da assinatura).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { chaveDoAmbiente } from "../_shared/cifra-mp.ts";
import { MpIndisponivel, buscarNoMp, mpFetch, type CredencialConta } from "../_shared/cobranca-mp.ts";
import { idDoAvisoValido, preapprovalDoPagamento, type AssinaturaMp, type PagamentoMp } from "../_shared/cobranca-regras.ts";
import {
  COLUNAS_COBRANCA_W2,
  aplicarPagamentoMp,
  carregarMatricula,
  espelhoAssinaturaAluno,
  registrarPagamentoAvulsoDoMp,
  type Cobranca,
  type Matricula,
} from "../_shared/financeiro-mp.ts";
import { lerReferenciaAluno, type Schema } from "../_shared/financeiro-regras.ts";
import type { Log } from "../_shared/log.ts";
import {
  MpContaSemAcesso,
  buscarNaConta,
  colunasAssinatura,
  comCollector,
  credencialDaConta,
  integracaoMp,
  marcarErro,
  oauthDoAmbiente,
  schemaTemW2,
  type ContextoMpConta,
  type IntegracaoMp,
} from "../_shared/mp-conta.ts";
import { assinaturaMp, assinaturaNoPrazo, lerAvisoDoMp, type AvisoDaConta } from "../_shared/mp-conta-regras.ts";
import { prazo as novoPrazo, type Prazo } from "../_shared/tempo.ts";

type ComDeno = { Deno?: { env: { get: (nome: string) => string | undefined } } };
const ambiente = (nome: string) => (globalThis as ComDeno).Deno?.env.get(nome);

/** MENOR 4: o maior corpo de aviso aceito (o do MP tem poucas centenas de bytes). */
export const LIMITE_CORPO = 16_384;
/** MENOR 34: o prazo do caminho da conta (o MP espera 200 em até 22 s). */
export const PRAZO_CONTA_MS = 18_000;

/** Lê o corpo até `limite` bytes; passou (pelo Content-Length ou pelo que chegou) → null. Cópia do lerCorpo de
 *  _shared/erro-avisar-regras.ts (lá não é exportado; aquele arquivo não muda). */
export async function lerAte(req: Request, limite: number): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > limite) return null;
  if (!req.body) return "";
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    tudo.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder().decode(tudo);
}

/** Um teto por chave numa janela (o molde do permitido da mp-conectar-retorno), com o SEU Map: um teto cheio de chaves inventadas se
 *  limpa sozinho sem zerar o outro (MENOR 26). */
export function criarTeto(max: number, janelaMs = 60_000, maxChaves = 5_000): (chave: string) => boolean {
  const janela = new Map<string, number[]>();
  return (chave) => {
    const agora = Date.now();
    const lista = (janela.get(chave) ?? []).filter((t) => agora - t < janelaMs);
    if (lista.length >= max) return false;
    lista.push(agora);
    janela.set(chave, lista);
    if (janela.size > maxChaves) janela.clear();
    return true;
  };
}
/** MENOR 6: só o aviso SEM user_id (a index.ts). */
export const permitidoIp = criarTeto(120);
/** MENOR 26: só depois de achada a integração (o tratarDaConta). */
const permitidoConta = criarTeto(60);

export interface DepsAviso {
  /** o cliente service_role do schema */
  dbDe: (schema: Schema) => SupabaseClient;
  log: Log;
}
export interface RespostaDoAviso {
  http: number;
  resultado: string;
}

const TOPICOS = new Set(["payment", "subscription_preapproval", "preapproval", "subscription_authorized_payment", "authorized_payment"]);
type PagamentoDaConta = PagamentoMp & { collector_id?: number | string | null };
type AssinaturaDaConta = AssinaturaMp & { collector_id?: number | string | null };
interface LinhaAssinatura {
  id: string;
  paciente_id: string;
  conta_id: string | null;
  payload: Record<string, unknown> | null;
  mp_collector_id?: number | string | null;
}
/** O que um aviso da conta carrega de um passo para o outro. */
interface Trato {
  db: SupabaseClient;
  ctx: ContextoMpConta;
  cred: CredencialConta;
  integ: IntegracaoMp;
  conta: string;
  schema: Schema;
  log: Log;
}

const FLAG = new Map<Schema, { exigir: boolean; em: number }>();
/** app_config.mp_webhook.exigir_assinatura, guardada 60 s por instância. Erro do banco lança (500: o MP manda de novo). */
async function exigeAssinatura(db: SupabaseClient, schema: Schema): Promise<boolean> {
  const g = FLAG.get(schema);
  if (g && Date.now() - g.em < 60_000) return g.exigir;
  const { data, error } = await db.from("app_config").select("valor").eq("chave", "mp_webhook").maybeSingle();
  if (error) throw error;
  const exigir = (data as { valor: { exigir_assinatura?: unknown } | null } | null)?.valor?.exigir_assinatura === true;
  FLAG.set(schema, { exigir, em: Date.now() });
  return exigir;
}

const PHYSIQ = new Map<Schema, number>();
/** A conta do MP do PHYSIQ no schema (GET /users/me com o token do schema — buscarNoMp), guardada na instância; sem resposta → null, sem
 *  guardar (a próxima tenta de novo). */
async function collectorDoPhysiq(schema: Schema, p: Prazo): Promise<number | null> {
  const guardado = PHYSIQ.get(schema);
  if (guardado) return guardado;
  try {
    const achado = await buscarNoMp<{ id?: number | string }>("/users/me", schema, { prazo: p });
    const id = Number(achado?.recurso?.id);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    PHYSIQ.set(schema, id);
    return id;
  } catch (e) {
    if (e instanceof MpIndisponivel) return null;
    throw e;
  }
}

/** A chave dos tokens (MP_TOKENS_CHAVE) e o client do OAuth do ambiente. Sem a chave → MpContaSemAcesso "nao_configurado". */
async function contextoMp(d: DepsAviso, schema: Schema, p: Prazo): Promise<ContextoMpConta> {
  const chave = await chaveDoAmbiente();
  if (!chave) throw new MpContaSemAcesso("-", "nao_configurado");
  return { schema, log: d.log, prazo: p, chave, oauth: oauthDoAmbiente(schema) };
}

/**
 * O aviso de um pagamento/automática NA CONTA do personal (?conta=<uuid>, ou o user_id de uma integração pela URL do painel — I1). Só
 * vai ao MP depois de achada a integração com token (conta inventada: 200 sem nenhuma ida ao MP) e dentro do teto da conta. A
 * MP_TOKENS_CHAVE ausente lança (o catch final da index.ts responde 500 e avisa o Weslley).
 */
export async function tratarDaConta(d: DepsAviso, req: Request, url: URL, schema: Schema, a: AvisoDaConta, p: Prazo): Promise<RespostaDoAviso> {
  const r = await decidir(d, req, url, schema, a, p);
  const campos = { codigo: "aviso_mp_conta", schema, acao: a.topico.replace(/-/g, "_") || null, ref: a.id, status: r.http, resultado: r.resultado,
    ...(r.assinatura ? { msg: `assinatura ${r.assinatura}` } : {}) };
  if (r.http >= 500) d.log.aviso(campos);
  else d.log.info(campos);
  return { http: r.http, resultado: r.resultado };
}

async function decidir(d: DepsAviso, req: Request, url: URL, schema: Schema, a: AvisoDaConta, p: Prazo):
  Promise<RespostaDoAviso & { assinatura?: string }> {
  const db = d.dbDe(schema);
  if (!(await schemaTemW2(db, schema))) return { http: 500, resultado: "schema_sem_w2" };
  const integ = await integracaoMp(db, a.conta);
  if (!integ?.tem_acesso) return { http: 200, resultado: "conta_sem_mp" };             // nenhuma ida ao MP para conta que não é nossa
  if (!permitidoConta(a.conta)) return { http: 429, resultado: "limite" };               // MENOR 26: só conta DEPOIS de achada a integração
  const assinatura = await assinaturaMp({ cabecalho: req.headers.get("x-signature"), requestId: req.headers.get("x-request-id"),
    dataId: url.searchParams.get("data.id"), segredo: ambiente("MP_WEBHOOK_ASSINATURA") });
  if (await exigeAssinatura(db, schema)) {
    // revisão M-1: exigida, a assinatura amarra O QUE é tratado e QUANDO — o id do aviso (o do corpo, lido primeiro) tem de ser o data.id
    // ASSINADO (o da busca) e o ts, de até 5 min de agora: um aviso assinado capturado não volta com outro id nem horas depois. Sem a flag,
    // nada muda (a assinatura só vai ao log)
    const recusa = assinatura !== "valida" ? assinatura
      : (url.searchParams.get("data.id") ?? "").toLowerCase() !== a.id.toLowerCase() ? "id_diferente"
      : !assinaturaNoPrazo(req.headers.get("x-signature")) ? "fora_do_prazo"
      : null;
    if (recusa) {
      d.log.aviso({ codigo: "aviso_mp_conta_sem_assinatura", schema, ref: a.conta, resultado: recusa });
      return { http: 401, resultado: "assinatura", assinatura: recusa };
    }
  }
  // I4: o user_id NÃO decide — quem forja manda o certo ou nenhum, e nada garante o campo nos tópicos da automática; quem decide é o collector
  if (a.userId !== null && a.userId !== integ.mp_user_id) d.log.aviso({ codigo: "aviso_mp_conta_user_id_diferente", schema, ref: a.conta });
  // o que não é aviso nosso responde 200 já (nem a conta em erro faz o MP mandar lixo de novo por dias)
  const connect = a.topico === "mp-connect";
  if (!connect && !TOPICOS.has(a.topico)) return { http: 200, resultado: "topico_ignorado", assinatura };
  if (!connect && !idDoAvisoValido(a.topico, a.id)) return { http: 200, resultado: "sem_id", assinatura };
  if (integ.status === "erro") return { http: 500, resultado: "conta_em_erro", assinatura };   // quando o dono reconectar, o reenvio entra
  const ctx = await contextoMp(d, schema, p);                                             // sem a MP_TOKENS_CHAVE → lança (500 + aviso)
  try {
    if (connect) return { http: 200, resultado: await conferirAcesso(db, ctx, a.conta), assinatura };   // MENOR 5
    const cred = await credencialDaConta(db, ctx, a.conta, { exigirAtiva: false, renovar: false });    // desconectada < 7 dias: só leitura
    const t: Trato = { db, ctx, cred, integ, conta: a.conta, schema, log: d.log };
    const resultado = a.topico === "payment"
      ? await pagamentoDaConta(t, a.id)
      : a.topico.endsWith("preapproval")
      ? await assinaturaDaConta(t, a.id)
      : await cobrancaAutorizadaDaConta(t, a.id);
    return { http: 200, resultado, assinatura };
  } catch (e) {
    if (e instanceof MpContaSemAcesso) return { http: 500, resultado: "conta_sem_acesso", assinatura };   // o job renova/marca; o reenvio entra
    if (e instanceof MpIndisponivel) return { http: 500, resultado: "mp_fora", assinatura };
    throw e;                                                                              // banco: o catch final da index.ts (500 + aviso)
  }
}

/** MENOR 5: o mp-connect (a vinculação/desvinculação da aplicação na conta do MP) — GET /users/me com o token da conta, SEM renovar (a
 *  revogação apaga os tokens e o grant — a doc de gestão do OAuth): o mesmo usuário → acesso_ok; 401/403 → "erro" acesso_revogado (+ o
 *  aviso ao dono, 1 por dia); OUTRO usuário → "erro" conta_trocada; sem resposta que decida → MpIndisponivel (500). */
async function conferirAcesso(db: SupabaseClient, ctx: ContextoMpConta, conta: string): Promise<string> {
  const cred = await credencialDaConta(db, ctx, conta, { exigirAtiva: false, renovar: false });
  const { status, body } = await mpFetch<{ id?: number | string }>(cred, "/users/me", {}, { prazo: ctx.prazo });
  if (status === 200 && body?.id !== undefined && body?.id !== null) {
    if (Number(body.id) === cred.collectorId) return "acesso_ok";
    await marcarErro(db, ctx, conta, "conta_trocada");
    return "conta_trocada";
  }
  if (status === 401 || status === 403) {
    await marcarErro(db, ctx, conta, "acesso_revogado");
    return "acesso_revogado";
  }
  throw new MpIndisponivel(status);
}

/** A matrícula da referência, se é desta conta. */
async function matriculaDaConta(t: Trato, pacienteId: string): Promise<Matricula | "matricula_inexistente" | "referencia_de_outra_conta"> {
  const m = await carregarMatricula(t.db, pacienteId);
  if (!m) return "matricula_inexistente";
  return m.conta_id === t.conta ? m : "referencia_de_outra_conta";
}

/** A automática guardada pelo id do MP — C2: as colunas pelo colunasAssinatura (a W2 já está no schema aqui). Erro do banco lança. */
async function assinaturaPorPreapproval(t: Trato, preId: string): Promise<LinhaAssinatura | null> {
  const { data, error } = await t.db.from("aluno_assinaturas").select(await colunasAssinatura(t.db, t.schema)).eq("mp_preapproval_id", preId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as LinhaAssinatura | null) ?? null;
}

/** payment: buscado NA CONTA → o collector → a referência de um aluno desta conta → a cobrança dela (ou a recorrente da automática). */
async function pagamentoDaConta(t: Trato, id: string): Promise<string> {
  const pay = await buscarNaConta<PagamentoDaConta>(t.db, t.ctx, t.cred, `/v1/payments/${encodeURIComponent(id)}`, { renovar: false });
  if (pay?.id === undefined || pay?.id === null) return "nao_achado";                   // 404, outro modo ou o 401 de recurso alheio (I2)
  if (Number(pay.collector_id) !== t.integ.mp_user_id) return "collector_diferente";    // o dinheiro não caiu nesta conta do MP
  const ref = lerReferenciaAluno(pay.external_reference);
  if (ref) {
    if (ref.schema !== t.schema) return "outro_ambiente";
    const m = await matriculaDaConta(t, ref.pacienteId);
    if (typeof m === "string") return m;
    if (ref.cobrancaId) return await cobrancaDaConta(t, m, pay, ref.cobrancaId);
    // W1b M4 (revisão da W1b, aplicada na W2): mensalidade/avulsa SEM o id da cobrança não é referência nossa desde a W6 — a conferência
    // do pagamento da W1b (pagamentoEDaCobranca) também recusa; só a recorrente (a cobrança de cada mês da automática) vem sem o id
    if (ref.tipo !== "recorrente") return "referencia_sem_cobranca";
    return await recorrenteDaConta(t, m, pay, preapprovalDoPagamento(pay));
  }
  // a cobrança da automática sem a referência (o MP pode não copiar a external_reference — o caminho de hoje também cobre): pelo preapproval
  // guardado desta conta
  const preId = preapprovalDoPagamento(pay);
  if (!preId) return "nao_e_de_aluno";
  const a = await assinaturaPorPreapproval(t, preId);
  if (!a) return "assinatura_inexistente";
  if (Number(a.mp_collector_id) !== t.integ.mp_user_id) return "assinatura_de_outro_collector"; // W2: depois do schemaTemW2
  const m = await matriculaDaConta(t, a.paciente_id);
  if (typeof m === "string") return m;
  return await recorrenteDaConta(t, m, pay, preId);
}

/** A cobrança da referência: tem de ser DESTA conta do MP (mp_collector_id) e do mesmo pagamento (ou ainda sem — como o caminho de hoje). */
async function cobrancaDaConta(t: Trato, m: Matricula, pay: PagamentoDaConta, cobrancaId: string): Promise<string> {
  const { data, error } = await t.db.from("cobrancas").select(COLUNAS_COBRANCA_W2).eq("id", cobrancaId).eq("paciente_id", m.id).maybeSingle();
  if (error) throw error;
  let c = data as unknown as Cobranca | null;
  if (!c) return "cobranca_inexistente";
  if (Number(c.mp_collector_id) !== t.integ.mp_user_id) return "cobranca_de_outro_collector"; // W2: depois do schemaTemW2
  if (!c.mp_payment_id) {
    const { error: eg } = await t.db.from("cobrancas").update({ mp_payment_id: String(pay.id) }).eq("id", c.id).is("mp_payment_id", null);
    if (eg) throw eg;
    const relida = await t.db.from("cobrancas").select(COLUNAS_COBRANCA_W2).eq("id", c.id).maybeSingle();
    if (relida.error) throw relida.error;
    c = (relida.data as unknown as Cobranca | null) ?? c;
  }
  if (c.mp_payment_id !== String(pay.id)) return "cobranca_de_outro_pagamento";
  const r = await aplicarPagamentoMp(t.db, c, pay, m, t.log, t.schema);
  return `cobranca_${r.status}${r.pagou ? "_paga" : ""}`;
}

/** A cobrança de cada mês da automática: a linha nova nasce com a conta do MP que recebeu (a regra da coluna nova — comCollector). */
async function recorrenteDaConta(t: Trato, m: Matricula, pay: PagamentoDaConta, preId: string | null): Promise<string> {
  const r = await registrarPagamentoAvulsoDoMp(t.db, m, pay, { preapprovalId: preId, origem: "assinatura",
    colunasW2: await comCollector(t.db, t.schema, t.integ.mp_user_id) }, t.log, t.schema);
  return r ? `recorrente_${r.status}` : "recorrente_sem_valor";
}

/** subscription_preapproval: buscada NA CONTA → o collector → o espelho da linha desta conta, ou a linha nova (referência recorrente de
 *  um aluno desta conta) com o comCollector. */
async function assinaturaDaConta(t: Trato, id: string): Promise<string> {
  const pre = await buscarNaConta<AssinaturaDaConta>(t.db, t.ctx, t.cred, `/preapproval/${encodeURIComponent(id)}`, { renovar: false });
  if (!pre?.id) return "assinatura_nao_encontrada";
  if (Number(pre.collector_id) !== t.integ.mp_user_id) return "collector_diferente";
  const a = await assinaturaPorPreapproval(t, String(pre.id));
  if (a) {
    if (a.conta_id !== t.conta) return "referencia_de_outra_conta";
    if (a.payload?.simulada === true) return "assinatura_simulada";
    const { error } = await t.db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre, { ...(a.payload ?? {}) })).eq("id", a.id);
    if (error) throw error;
    return `assinatura_${pre.status}`;
  }
  const ref = lerReferenciaAluno(pre.external_reference);
  if (!ref || ref.tipo !== "recorrente") return "nao_e_de_aluno";
  if (ref.schema !== t.schema) return "outro_ambiente";
  const m = await matriculaDaConta(t, ref.pacienteId);
  if (typeof m === "string") return m;
  const { error } = await t.db.from("aluno_assinaturas").insert({ paciente_id: m.id, conta_id: m.conta_id,
    ...(await comCollector(t.db, t.schema, t.integ.mp_user_id)), ...espelhoAssinaturaAluno(pre) });
  if (error) throw error;
  return `assinatura_${pre.status}_gravada`;
}

/** subscription_authorized_payment: buscada NA CONTA → o pagamento dela pelo mesmo caminho do payment. */
async function cobrancaAutorizadaDaConta(t: Trato, id: string): Promise<string> {
  const ap = await buscarNaConta<{ payment?: { id?: number | string | null } | null }>(t.db, t.ctx, t.cred,
    `/authorized_payments/${encodeURIComponent(id)}`, { renovar: false });
  if (!ap) return "cobranca_nao_encontrada";
  const pagamento = ap.payment?.id;
  if (pagamento === null || pagamento === undefined) return "cobranca_sem_pagamento_ainda";
  if (!idDoAvisoValido("payment", String(pagamento))) return "sem_id";
  return await pagamentoDaConta(t, String(pagamento));
}

/**
 * I1 + MENOR 5: o aviso SEM &conta= (a URL do painel) com o user_id de uma integração conhecida → o caminho da conta. NUNCA a conta do
 * Physiq (lida 1× por GET /users/me com o token do schema e guardada na instância): no teste de produção (Task 23) a conta do MP DELE é a
 * dona da aplicação E a da integração do admin.teste — sem esta trava, os avisos do MP do Physiq iriam para a conta do admin.teste. Mais
 * de uma conta do Physiq com a mesma conta do MP → tenta cada uma até a referência bater; o mp-connect vale para TODAS. Nenhuma bateu →
 * null (o caminho de hoje). A conta do Physiq sem resposta do MP: o user_id de uma integração → 500 (não arrisca a conta do Physiq e não
 * perde o aviso — o caminho de hoje responderia 200 a um recurso que o token do Physiq não acha); o de ninguém → null. Sem teto por IP
 * aqui: o aviso tem user_id (MENOR 6) e o teto de cada conta vale dentro do tratarDaConta.
 */
export async function pelaContaDoUserId(d: DepsAviso, req: Request, url: URL, schema: Schema, corpo: Record<string, unknown>):
  Promise<RespostaDoAviso | null> {
  const userId = Number(corpo.user_id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const db = d.dbDe(schema);
  if (!(await schemaTemW2(db, schema))) return null;
  const p = novoPrazo(PRAZO_CONTA_MS);                                                    // MENOR 34: o mesmo prazo para tudo daqui
  const physiq = await collectorDoPhysiq(schema, p);                                      // null = o MP não respondeu
  if (physiq === userId) return null;
  const { data, error } = await db.from("recebimento_integracoes").select("conta_id").eq("provedor", "mercadopago")
    .eq("mp_user_id", userId).not("mp_access_token", "is", null).order("conta_id").limit(5);
  if (error) throw error;
  const contas = ((data ?? []) as Array<{ conta_id: string }>).map((x) => x.conta_id);
  if (!contas.length) return null;
  if (physiq === null) {
    d.log.aviso({ codigo: "aviso_mp_conta_physiq_sem_resposta", schema, acao: lerAvisoDoMp(url, corpo).topico.replace(/-/g, "_") || null });
    return { http: 500, resultado: "mp_fora" };
  }
  const base = lerAvisoDoMp(url, corpo);
  let pior: RespostaDoAviso | null = null;
  for (const conta of contas) {
    const r = await tratarDaConta(d, req, url, schema, { ...base, conta }, p);
    if (base.topico !== "mp-connect" && r.resultado !== "referencia_de_outra_conta") return r;
    if (!pior || r.http > pior.http) pior = r;
  }
  return pior;
}
